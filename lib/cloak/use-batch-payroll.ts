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

import {
  buildRunId,
  clearBatchRun,
  loadBatchRun,
  pendingOrFailedRows,
  resetInFlightRows,
  runIsComplete,
  saveBatchRun,
  updateBatchRow,
  type BatchQueueRow,
  type BatchRun,
} from "./batch-queue";
import { cloakConfig } from "./config";
import { isStaleNoteError, isSubmittingStatus } from "./fast-send-core";
import {
  clearMerkleTreeCache,
  loadMerkleTreeCache,
  saveMerkleTreeCache,
} from "./merkle-tree-cache";
import {
  dismissProofRefreshing,
  showProofRefreshing,
} from "./proof-refresh-toast";
import {
  bigintToHex,
  clearOrphan,
  hexToBigint,
  loadOrphans,
  saveOrphan,
  updateOrphan,
  type OrphanUtxoRecord,
  type SerializedUtxo,
} from "./orphan-utxo-store";
import { loadDevnetRelayAlt } from "./relay-alt";

export type BatchRowInput = {
  /** Stable id from the parsed CSV (rowNumber). */
  id: number;
  recipient: string; // base58
  amountBaseUnits: bigint;
  /** Recipient-side net (gross minus variable + fixed fees); persisted into
   *  the batch queue so the retry path can write payment-history without
   *  re-running the validation pipeline. */
  netBaseUnits: bigint;
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
  /** Persistent run id (sender:cluster:depositSig). Set once the deposit
   *  lands; the retry button reads this to find the row state in the queue. */
  runId: string | null;
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

export type BatchRetryRowResult =
  | {
      rowId: number;
      recipient: string;
      amountRaw: string;
      netRaw: string;
      ok: true;
      payoutSig: string;
    }
  | {
      rowId: number;
      recipient: string;
      amountRaw: string;
      netRaw: string;
      ok: false;
      error: Error;
    };

export type BatchRetryOutcome = {
  runId: string;
  depositSignature: string;
  /** Number of rows the retry attempted to send (excludes already-confirmed). */
  attempted: number;
  /** Newly confirmed during the retry. */
  confirmed: number;
  /** Still failed after the retry. */
  failed: number;
  results: BatchRetryRowResult[];
};

export function useBatchPayroll() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [state, setState] = React.useState<BatchPayrollState>(initialState);
  const cancelRef = React.useRef(false);

  // A page reload during a run leaves rows stuck in "in-flight" state in
  // the persisted queue, since the partialWithdraw promise died with the
  // page. Sweep them back to "pending" on mount so the retry UI (commit 3)
  // doesn't claim work is happening when it isn't.
  const walletKey = wallet.publicKey?.toBase58() ?? null;
  React.useEffect(() => {
    if (!walletKey) return;
    resetInFlightRows(walletKey, solanaConfig.cluster);
  }, [walletKey]);

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
      // Reuse the tree from any prior op in this tab so the deposit proof
      // skips the relay-side commitments fetch.
      const cachedTreeForDeposit = await loadMerkleTreeCache(
        solanaConfig.cluster,
        cloakConfig.programId,
      );
      // Pre-resolve relay ALT on devnet to keep the batch deposit at one
      // wallet popup. Mainnet returns []; behavior unchanged.
      const devnetAlt = await loadDevnetRelayAlt(
        connection,
        cloakConfig.relayUrl,
      );
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
            cachedMerkleTree: cachedTreeForDeposit,
            ...(devnetAlt.length > 0
              ? { addressLookupTableAccounts: devnetAlt }
              : {}),
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
            runId: null,
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

      const runId = buildRunId(
        senderBase58,
        solanaConfig.cluster,
        depositResult.signature,
      );
      const batchRun: BatchRun = {
        id: runId,
        cluster: solanaConfig.cluster,
        sender: senderBase58,
        tokenId,
        decimals,
        mint: mint.toBase58(),
        totalRaw: total.toString(),
        depositSignature: depositResult.signature,
        createdAt: orphanRecord.createdAt,
        updatedAt: orphanRecord.createdAt,
        rows: rows.map<BatchQueueRow>((r) => ({
          rowId: r.id,
          recipient: r.recipient,
          amountRaw: r.amountBaseUnits.toString(),
          netRaw: r.netBaseUnits.toString(),
          state: "pending",
          attempts: 0,
        })),
      };
      saveBatchRun(senderBase58, solanaConfig.cluster, batchRun);

      setState((s) => ({
        ...s,
        phase: "paying",
        depositPercent: 100,
        depositSignature: depositResult.signature,
      }));

      let currentUtxo: Utxo = depositedUtxo;
      let cachedTree: MerkleTree | undefined = depositResult.merkleTree;
      saveMerkleTreeCache(
        solanaConfig.cluster,
        cloakConfig.programId,
        cachedTree,
      );

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
          saveMerkleTreeCache(
            solanaConfig.cluster,
            cloakConfig.programId,
            cachedTree,
          );
          results.push({
            id: row.id,
            ok: true,
            payoutSig: rowOutcome.signature,
          });
          updateOrphan(senderBase58, solanaConfig.cluster, orphanId, {
            utxo: serializeUtxo(currentUtxo, ephemeralKeypair),
            rowsRemaining: rows.length - i - 1,
          });
          updateBatchRow(
            senderBase58,
            solanaConfig.cluster,
            runId,
            row.id,
            {
              state: "confirmed",
              payoutSignature: rowOutcome.signature,
              confirmedAt: Date.now(),
              errorMessage: undefined,
            },
          );
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
          updateBatchRow(
            senderBase58,
            solanaConfig.cluster,
            runId,
            row.id,
            {
              state: "failed",
              errorMessage: rowOutcome.error.message,
            },
          );
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

      // Drop the queue entry once nothing is left to retry. A cancelled
      // mid-run still leaves "pending" rows behind, so the queue persists
      // until the user either retries or explicitly clears.
      const finalRun = {
        ...batchRun,
        rows: batchRun.rows.map((qr) => {
          const result = results.find((r) => r.id === qr.rowId);
          if (!result) return qr;
          if (result.ok) {
            return {
              ...qr,
              state: "confirmed" as const,
              payoutSignature: result.payoutSig,
            };
          }
          return {
            ...qr,
            state: "failed" as const,
            errorMessage: result.error.message,
          };
        }),
      };
      if (runIsComplete(finalRun)) {
        clearBatchRun(senderBase58, solanaConfig.cluster, runId);
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
          runId,
        },
      }));

      return {
        confirmed,
        failed,
        total: rows.length,
        depositSignature: depositResult.signature,
        runId,
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
        updateBatchRow(senderBase58, solanaConfig.cluster, runId, args.row.id, {
          state: "in-flight",
          attempts: args.attempt + 1,
          lastAttemptAt: Date.now(),
          errorMessage: undefined,
        });
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
          dismissProofRefreshing({
            flow: "batch",
            runId,
            rowId: args.row.id,
          });
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
            showProofRefreshing(
              { flow: "batch", runId, rowId: args.row.id },
              args.attempt + 2,
              STALE_RETRY_MAX + 1,
            );
            // Drop the stale tree on retry so the SDK refetches from chain
            // state instead of replaying the same bad proof.
            clearMerkleTreeCache(solanaConfig.cluster, cloakConfig.programId);
            cachedTree = undefined;
            await sleep(STALE_RETRY_DELAY_MS);
            return runRow({
              ...args,
              attempt: args.attempt + 1,
              cachedTree: undefined,
            });
          }
          dismissProofRefreshing({
            flow: "batch",
            runId,
            rowId: args.row.id,
          });
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

  const retryFailed = React.useCallback(
    async (
      runId: string,
    ): Promise<BatchRetryOutcome | null> => {
      if (!wallet.publicKey) throw new Error("Connect your wallet first.");
      if (!wallet.signTransaction)
        throw new Error("Wallet does not support transaction signing.");
      if (!wallet.signMessage)
        throw new Error(
          "Wallet does not support signMessage, which is required to register the viewing key.",
        );

      const sender = wallet.publicKey;
      const senderBase58 = sender.toBase58();
      const signTransaction = wallet.signTransaction;
      const signMessage = wallet.signMessage;
      cancelRef.current = false;
      const startedAt = Date.now();

      const queueRun = loadBatchRun(senderBase58, solanaConfig.cluster, runId);
      if (!queueRun) {
        throw new Error(
          "Couldn't find this batch in your retry queue. It may have already been cleared.",
        );
      }
      const orphans = loadOrphans(senderBase58, solanaConfig.cluster);
      const orphan = orphans.find((o) => o.id === runId);
      if (!orphan) {
        throw new Error(
          "No recoverable change UTXO is on record for this batch, so the failed rows can't be retried automatically.",
        );
      }
      const remaining = pendingOrFailedRows(queueRun);
      if (remaining.length === 0) return null;

      applyBufferPolyfill();

      const ephemeralKeypair = {
        privateKey: hexToBigint(orphan.utxo.keypair.privateKey),
        publicKey: hexToBigint(orphan.utxo.keypair.publicKey),
      };
      let currentUtxo: Utxo = deserializeOrphanUtxo(orphan.utxo);

      // Echo the queue state into the in-memory state machine so the receipt
      // table stays consistent during the retry: rows that confirmed in the
      // original run stay green; pending/failed rows transition through
      // paying-proof / paying-submit just like the first run.
      const initialRows: Record<number, BatchRowState> = {};
      for (const qRow of queueRun.rows) {
        initialRows[qRow.rowId] =
          qRow.state === "confirmed"
            ? {
                status: "confirmed",
                progress: null,
                proofPercent: 100,
                payoutSignature: qRow.payoutSignature,
              }
            : {
                status: "pending",
                progress: null,
                proofPercent: null,
                errorMessage: qRow.errorMessage,
              };
      }
      setState((s) => ({
        // Keep the previous summary visible during the retry so the receipt
        // doesn't blank out; the loop's setState updates rows in place, and
        // we recompute the summary at the end.
        status: "running",
        phase: "paying",
        rows: initialRows,
        activeRowId: null,
        activeStartedAt: Date.now(),
        depositPercent: 100,
        depositProgress: null,
        depositSignature: queueRun.depositSignature,
        summary: s.summary,
      }));

      let cachedTree: MerkleTree | undefined = await loadMerkleTreeCache(
        solanaConfig.cluster,
        cloakConfig.programId,
      );

      const results: BatchRetryRowResult[] = [];

      for (const qRow of remaining) {
        if (cancelRef.current) break;

        await sleep(RELAY_SETTLE_DELAY_MS);

        const rowInput: BatchRowInput = {
          id: qRow.rowId,
          recipient: qRow.recipient,
          amountBaseUnits: BigInt(qRow.amountRaw),
          netBaseUnits: BigInt(qRow.netRaw),
        };
        const rowOutcome = await runRetryRow({
          row: rowInput,
          attempt: 0,
          currentUtxo,
          cachedTree,
        });

        if (rowOutcome.ok) {
          currentUtxo = rowOutcome.changeUtxo;
          cachedTree = rowOutcome.tree ?? cachedTree;
          saveMerkleTreeCache(
            solanaConfig.cluster,
            cloakConfig.programId,
            cachedTree,
          );
          updateOrphan(senderBase58, solanaConfig.cluster, runId, {
            utxo: serializeUtxo(currentUtxo, ephemeralKeypair),
            rowsRemaining: Math.max(0, orphan.rowsRemaining - 1),
          });
          updateBatchRow(
            senderBase58,
            solanaConfig.cluster,
            runId,
            qRow.rowId,
            {
              state: "confirmed",
              payoutSignature: rowOutcome.signature,
              confirmedAt: Date.now(),
              errorMessage: undefined,
            },
          );
          results.push({
            rowId: qRow.rowId,
            recipient: qRow.recipient,
            amountRaw: qRow.amountRaw,
            netRaw: qRow.netRaw,
            ok: true,
            payoutSig: rowOutcome.signature,
          });
          setState((s) => ({
            ...s,
            rows: {
              ...s.rows,
              [qRow.rowId]: {
                status: "confirmed",
                progress: null,
                proofPercent: 100,
                payoutSignature: rowOutcome.signature,
              },
            },
          }));
        } else {
          updateBatchRow(
            senderBase58,
            solanaConfig.cluster,
            runId,
            qRow.rowId,
            {
              state: "failed",
              errorMessage: rowOutcome.error.message,
            },
          );
          results.push({
            rowId: qRow.rowId,
            recipient: qRow.recipient,
            amountRaw: qRow.amountRaw,
            netRaw: qRow.netRaw,
            ok: false,
            error: rowOutcome.error,
          });
          setState((s) => ({
            ...s,
            rows: {
              ...s.rows,
              [qRow.rowId]: {
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
      const newlyConfirmed = results.filter((r) => r.ok).length;
      const newlyFailed = results.filter((r) => !r.ok).length;

      // Recompute totals against the latest queue state so the summary
      // reflects original-confirmed + retry-confirmed in one tally.
      const refreshed =
        loadBatchRun(senderBase58, solanaConfig.cluster, runId) ?? queueRun;
      const totalConfirmed = refreshed.rows.filter(
        (r) => r.state === "confirmed",
      ).length;
      const totalFailed = refreshed.rows.filter(
        (r) => r.state === "failed",
      ).length;

      if (runIsComplete(refreshed)) {
        clearBatchRun(senderBase58, solanaConfig.cluster, runId);
        clearOrphan(senderBase58, solanaConfig.cluster, runId);
      }

      setState((s) => ({
        ...s,
        status: "done",
        phase: "done",
        activeRowId: null,
        activeStartedAt: null,
        summary: {
          total: refreshed.rows.length,
          confirmed: totalConfirmed,
          failed: totalFailed,
          startedAt,
          finishedAt,
          depositSignature: queueRun.depositSignature,
          runId,
        },
      }));

      return {
        runId,
        depositSignature: queueRun.depositSignature,
        attempted: results.length,
        confirmed: newlyConfirmed,
        failed: newlyFailed,
        results,
      };

      async function runRetryRow(args: {
        row: BatchRowInput;
        attempt: number;
        currentUtxo: Utxo;
        cachedTree: MerkleTree | undefined;
      }): Promise<
        | { ok: true; changeUtxo: Utxo; tree: MerkleTree | undefined; signature: string }
        | { ok: false; error: Error }
      > {
        updateBatchRow(senderBase58, solanaConfig.cluster, runId, args.row.id, {
          state: "in-flight",
          attempts: args.attempt + 1,
          lastAttemptAt: Date.now(),
          errorMessage: undefined,
        });
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
          dismissProofRefreshing({
            flow: "batch",
            runId,
            rowId: args.row.id,
          });
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
            showProofRefreshing(
              { flow: "batch", runId, rowId: args.row.id },
              args.attempt + 2,
              STALE_RETRY_MAX + 1,
            );
            clearMerkleTreeCache(solanaConfig.cluster, cloakConfig.programId);
            cachedTree = undefined;
            await sleep(STALE_RETRY_DELAY_MS);
            return runRetryRow({
              ...args,
              attempt: args.attempt + 1,
              cachedTree: undefined,
            });
          }
          dismissProofRefreshing({
            flow: "batch",
            runId,
            rowId: args.row.id,
          });
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

  return { ...state, run, retryFailed, reset, cancel };
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

function deserializeOrphanUtxo(stored: SerializedUtxo): Utxo {
  return {
    amount: BigInt(stored.amount),
    blinding: hexToBigint(stored.blinding),
    mintAddress: new PublicKey(stored.mintAddress),
    index: stored.index,
    commitment:
      stored.commitment !== undefined
        ? hexToBigint(stored.commitment)
        : undefined,
    siblingCommitment:
      stored.siblingCommitment !== undefined
        ? hexToBigint(stored.siblingCommitment)
        : undefined,
    keypair: {
      privateKey: hexToBigint(stored.keypair.privateKey),
      publicKey: hexToBigint(stored.keypair.publicKey),
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
