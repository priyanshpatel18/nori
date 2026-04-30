"use client";

import {
  createUtxo,
  createZeroUtxo,
  generateUtxoKeypair,
  isRootNotFoundError,
  partialWithdraw,
  transact,
  type MerkleTree,
  type TransactResult,
  type Utxo,
} from "@cloak.dev/sdk";
import {
  useConnection,
  useWallet,
} from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import * as React from "react";

import { applyBufferPolyfill } from "@/lib/buffer-polyfill";
import { solanaConfig } from "@/lib/solana/config";

import { cloakConfig } from "./config";
import { isStaleNoteError, isSubmittingStatus } from "./fast-send-core";
import {
  bigintToHex,
  clearOrphan,
  saveOrphan,
  updateOrphan,
  type OrphanUtxoRecord,
  type SerializedUtxo,
} from "./orphan-utxo-store";

export type BatchRowInput = {
  /** Stable id from the parsed CSV (rowNumber). */
  id: number;
  recipient: string; // base58
  amountBaseUnits: bigint;
};

export type BatchRowStatus =
  | "pending"
  | "paying-proof"
  | "paying-submit"
  | "confirmed"
  | "failed";

export type BatchRowState = {
  status: BatchRowStatus;
  progress: string | null;
  proofPercent: number | null;
  /** Payout (partialWithdraw) signature once confirmed. */
  payoutSignature?: string;
  errorMessage?: string;
};

export type BatchRunStatus = "idle" | "running" | "done";

export type BatchPhase =
  | "idle"
  | "depositing-proof"
  | "depositing-submit"
  | "paying"
  | "done"
  | "error";

export type BatchRunSummary = {
  total: number;
  confirmed: number;
  failed: number;
  startedAt: number;
  finishedAt: number;
  depositSignature: string | null;
};

export type BatchPayrollState = {
  status: BatchRunStatus;
  phase: BatchPhase;
  rows: Record<number, BatchRowState>;
  activeRowId: number | null;
  activeStartedAt: number | null;
  depositPercent: number;
  depositProgress: string | null;
  depositSignature: string | null;
  summary: BatchRunSummary | null;
};

const initialState: BatchPayrollState = {
  status: "idle",
  phase: "idle",
  rows: {},
  activeRowId: null,
  activeStartedAt: null,
  depositPercent: 0,
  depositProgress: null,
  depositSignature: null,
  summary: null,
};

const STALE_RETRY_MAX = 2;
const STALE_RETRY_DELAY_MS = 4000;

// The relay needs ~4s to index the previous deposit/withdraw before the next
// partialWithdraw can build a clean proof.
const RELAY_SETTLE_DELAY_MS = 4000;

export type RunBatchArgs = {
  rows: BatchRowInput[];
  mint: PublicKey;
  tokenId: string;
  decimals: number;
};

export function useBatchPayroll() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [state, setState] = React.useState<BatchPayrollState>(initialState);
  const cancelRef = React.useRef(false);

  const reset = React.useCallback(() => {
    cancelRef.current = false;
    setState(initialState);
  }, []);

  const cancel = React.useCallback(() => {
    cancelRef.current = true;
  }, []);

  const run = React.useCallback(
    async ({ rows, mint, tokenId, decimals }: RunBatchArgs) => {
      if (!wallet.publicKey) throw new Error("Connect your wallet first.");
      if (!wallet.signTransaction)
        throw new Error("Wallet does not support transaction signing.");
      if (!wallet.signMessage)
        throw new Error(
          "Wallet does not support signMessage, which is required to register the viewing key.",
        );
      if (rows.length === 0) return null;

      const sender = wallet.publicKey;
      const senderBase58 = sender.toBase58();
      const signTransaction = wallet.signTransaction;
      const signMessage = wallet.signMessage;
      cancelRef.current = false;
      const startedAt = Date.now();

      applyBufferPolyfill();

      const total = rows.reduce((acc, r) => acc + r.amountBaseUnits, 0n);

      const initialRows: Record<number, BatchRowState> = {};
      for (const r of rows) {
        initialRows[r.id] = {
          status: "pending",
          progress: null,
          proofPercent: null,
        };
      }
      setState({
        status: "running",
        phase: "depositing-proof",
        rows: initialRows,
        activeRowId: null,
        activeStartedAt: Date.now(),
        depositPercent: 5,
        depositProgress: "Generating deposit proof",
        depositSignature: null,
        summary: null,
      });

      let depositResult: TransactResult;
      const ephemeralKeypair = await generateUtxoKeypair();
      try {
        const depositOutput = await createUtxo(total, ephemeralKeypair, mint);
        let inSubmitPhase = false;
        depositResult = await transact(
          {
            inputUtxos: [await createZeroUtxo(mint)],
            outputUtxos: [depositOutput],
            externalAmount: total,
            depositor: sender,
          },
          {
            connection,
            programId: cloakConfig.programId,
            relayUrl: cloakConfig.relayUrl,
            depositorPublicKey: sender,
            walletPublicKey: sender,
            signTransaction,
            signMessage,
            enforceViewingKeyRegistration: false,
            onProgress: (status) =>
              setState((s) => {
                if (s.phase !== "depositing-proof" && s.phase !== "depositing-submit") {
                  return s;
                }
                const next: BatchPayrollState = {
                  ...s,
                  depositProgress: status,
                  depositPercent: Math.min(95, s.depositPercent + 3),
                };
                if (!inSubmitPhase && isSubmittingStatus(status)) {
                  inSubmitPhase = true;
                  next.phase = "depositing-submit";
                  next.depositPercent = Math.max(next.depositPercent, 70);
                }
                return next;
              }),
            onProofProgress: (percent) =>
              setState((s) =>
                s.phase !== "depositing-proof"
                  ? s
                  : {
                      ...s,
                      depositPercent: Math.max(
                        s.depositPercent,
                        5 + (Math.max(0, Math.min(100, percent)) * 0.6),
                      ),
                    },
              ),
          },
        );
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        logBatchError(error, { phase: "deposit", sender: senderBase58 });
        setState((s) => ({
          ...s,
          status: "done",
          phase: "error",
          activeStartedAt: null,
          summary: {
            total: rows.length,
            confirmed: 0,
            failed: rows.length,
            startedAt,
            finishedAt: Date.now(),
            depositSignature: null,
          },
          rows: Object.fromEntries(
            rows.map((r) => [
              r.id,
              {
                status: "failed" as const,
                progress: null,
                proofPercent: null,
                errorMessage: `Deposit failed: ${error.message}`,
              },
            ]),
          ),
        }));
        return null;
      }

      // Persist the deposited UTXO immediately so it's recoverable if anything
      // below blows up.
      const depositedUtxo = depositResult.outputUtxos[0];
      const orphanId = `${senderBase58}:${solanaConfig.cluster}:${depositResult.signature}`;
      const orphanRecord: OrphanUtxoRecord = {
        id: orphanId,
        cluster: solanaConfig.cluster,
        sender: senderBase58,
        utxo: serializeUtxo(depositedUtxo, ephemeralKeypair),
        totalRaw: total.toString(),
        tokenId,
        decimals,
        rowsRemaining: rows.length,
        createdAt: Date.now(),
        depositSignature: depositResult.signature,
      };
      saveOrphan(senderBase58, solanaConfig.cluster, orphanRecord);

      setState((s) => ({
        ...s,
        phase: "paying",
        depositPercent: 100,
        depositSignature: depositResult.signature,
      }));

      let currentUtxo: Utxo = depositedUtxo;
      let cachedTree: MerkleTree | undefined = depositResult.merkleTree;

      const results: Array<
        | { id: number; ok: true; payoutSig: string }
        | { id: number; ok: false; error: Error }
      > = [];

      for (let i = 0; i < rows.length; i += 1) {
        if (cancelRef.current) break;
        const row = rows[i];

        await sleep(RELAY_SETTLE_DELAY_MS);

        const rowOutcome = await runRow({
          row,
          attempt: 0,
          currentUtxo,
          cachedTree,
        });

        if (rowOutcome.ok) {
          currentUtxo = rowOutcome.changeUtxo;
          cachedTree = rowOutcome.tree ?? cachedTree;
          results.push({
            id: row.id,
            ok: true,
            payoutSig: rowOutcome.signature,
          });
          updateOrphan(senderBase58, solanaConfig.cluster, orphanId, {
            utxo: serializeUtxo(currentUtxo, ephemeralKeypair),
            rowsRemaining: rows.length - i - 1,
          });
          setState((s) => ({
            ...s,
            rows: {
              ...s.rows,
              [row.id]: {
                status: "confirmed",
                progress: null,
                proofPercent: 100,
                payoutSignature: rowOutcome.signature,
              },
            },
          }));
        } else {
          results.push({ id: row.id, ok: false, error: rowOutcome.error });
          setState((s) => ({
            ...s,
            rows: {
              ...s.rows,
              [row.id]: {
                status: "failed",
                progress: null,
                proofPercent: null,
                errorMessage: rowOutcome.error.message,
              },
            },
          }));
        }
      }

      const finishedAt = Date.now();
      const confirmed = results.filter((r) => r.ok).length;
      const failed = results.filter((r) => !r.ok).length;

      // If every row confirmed, the change UTXO should be empty. Clear the
      // orphan record. Otherwise, leave it for the recovery flow.
      if (failed === 0) {
        clearOrphan(senderBase58, solanaConfig.cluster, orphanId);
      }

      setState((s) => ({
        ...s,
        status: "done",
        phase: "done",
        activeRowId: null,
        activeStartedAt: null,
        summary: {
          total: rows.length,
          confirmed,
          failed,
          startedAt,
          finishedAt,
          depositSignature: depositResult.signature,
        },
      }));

      return {
        confirmed,
        failed,
        total: rows.length,
        depositSignature: depositResult.signature,
        results,
      };

      async function runRow(args: {
        row: BatchRowInput;
        attempt: number;
        currentUtxo: Utxo;
        cachedTree: MerkleTree | undefined;
      }): Promise<
        | { ok: true; changeUtxo: Utxo; tree: MerkleTree | undefined; signature: string }
        | { ok: false; error: Error }
      > {
        setState((s) => ({
          ...s,
          activeRowId: args.row.id,
          activeStartedAt:
            args.attempt === 0 ? Date.now() : s.activeStartedAt,
          rows: {
            ...s.rows,
            [args.row.id]: {
              status: "paying-proof",
              progress:
                args.attempt === 0
                  ? "Generating payout proof"
                  : `Retrying: relay tree was stale (attempt ${args.attempt + 1})`,
              proofPercent: 0,
            },
          },
        }));

        let inSubmitPhase = false;
        try {
          const recipientPubkey = new PublicKey(args.row.recipient);
          const result = await partialWithdraw(
            [args.currentUtxo],
            recipientPubkey,
            args.row.amountBaseUnits,
            {
              connection,
              programId: cloakConfig.programId,
              relayUrl: cloakConfig.relayUrl,
              walletPublicKey: sender,
              signTransaction,
              signMessage,
              enforceViewingKeyRegistration: false,
              cachedMerkleTree: args.cachedTree,
              onProgress: (status) =>
                setState((s) => {
                  const r = s.rows[args.row.id];
                  if (
                    !r ||
                    r.status === "confirmed" ||
                    r.status === "failed"
                  ) {
                    return s;
                  }
                  const nextStatus =
                    !inSubmitPhase && isSubmittingStatus(status)
                      ? "paying-submit"
                      : r.status;
                  if (nextStatus === "paying-submit") inSubmitPhase = true;
                  return {
                    ...s,
                    rows: {
                      ...s.rows,
                      [args.row.id]: {
                        ...r,
                        status: nextStatus,
                        progress: status,
                      },
                    },
                  };
                }),
              onProofProgress: (percent) =>
                setState((s) => {
                  const r = s.rows[args.row.id];
                  if (!r || r.status !== "paying-proof") return s;
                  const clamped = !Number.isFinite(percent)
                    ? 0
                    : Math.max(0, Math.min(100, percent));
                  return {
                    ...s,
                    rows: {
                      ...s.rows,
                      [args.row.id]: {
                        ...r,
                        proofPercent: Math.max(r.proofPercent ?? 0, clamped),
                      },
                    },
                  };
                }),
            },
          );

          const changeUtxo = result.outputUtxos[0];
          return {
            ok: true,
            changeUtxo,
            tree: result.merkleTree,
            signature: result.signature,
          };
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          if (
            (isStaleNoteError(error) || isRootNotFoundError(error)) &&
            args.attempt < STALE_RETRY_MAX
          ) {
            await sleep(STALE_RETRY_DELAY_MS);
            return runRow({ ...args, attempt: args.attempt + 1 });
          }
          logBatchError(error, {
            phase: "row",
            row: args.row,
            sender: senderBase58,
          });
          return { ok: false, error };
        }
      }
    },
    [connection, wallet],
  );

  return { ...state, run, reset, cancel };
}

function serializeUtxo(utxo: Utxo, fallbackKeypair: Utxo["keypair"]): SerializedUtxo {
  const kp = utxo.keypair ?? fallbackKeypair;
  return {
    amount: utxo.amount.toString(),
    blinding: bigintToHex(utxo.blinding),
    mintAddress: utxo.mintAddress.toBase58(),
    index: utxo.index,
    commitment: utxo.commitment !== undefined ? bigintToHex(utxo.commitment) : undefined,
    siblingCommitment:
      utxo.siblingCommitment !== undefined
        ? bigintToHex(utxo.siblingCommitment)
        : undefined,
    keypair: {
      privateKey: bigintToHex(kp.privateKey),
      publicKey: bigintToHex(kp.publicKey),
    },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function logBatchError(
  error: Error,
  ctx: { phase: "deposit" | "row"; row?: BatchRowInput; sender: string },
): void {
  const cause = (error as { cause?: unknown }).cause;
  const label =
    ctx.phase === "deposit"
      ? "[cloak] batch deposit failed"
      : `[cloak] batch row #${ctx.row?.id} failed`;
  console.group(label);
  console.error(error);
  if (error.stack) console.error("stack:", error.stack);
  if (cause !== undefined) console.error("cause:", cause);
  if (ctx.row) {
    console.error("row:", {
      recipient: ctx.row.recipient,
      amountBaseUnits: ctx.row.amountBaseUnits.toString(),
    });
  }
  console.error("sender:", ctx.sender);
  console.groupEnd();
}
