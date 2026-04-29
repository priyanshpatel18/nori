"use client";

import {
  createUtxo,
  createZeroUtxo,
  fullWithdraw,
  generateUtxoKeypair,
  isRootNotFoundError,
  transact,
  type TransactResult,
} from "@cloak.dev/sdk";
import {
  useConnection,
  useWallet,
} from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import * as React from "react";

import { applyBufferPolyfill } from "@/lib/buffer-polyfill";

import { cloakConfig } from "./config";

export type FastSendStatus =
  | "idle"
  | "deposit-proof"
  | "deposit-submit"
  | "withdraw-proof"
  | "withdraw-submit"
  | "success"
  | "error";

export type FastSendState = {
  status: FastSendStatus;
  progress: string | null;
  proofPercent: number | null;
  depositSignature: string | null;
  withdrawSignature: string | null;
  error: Error | null;
};

const initialState: FastSendState = {
  status: "idle",
  progress: null,
  proofPercent: null,
  depositSignature: null,
  withdrawSignature: null,
  error: null,
};

const WITHDRAW_MAX_ATTEMPTS = 3;
const WITHDRAW_RETRY_DELAY_MS = 1500;

export function useFastSend() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [state, setState] = React.useState<FastSendState>(initialState);

  const reset = React.useCallback(() => setState(initialState), []);

  const send = React.useCallback(
    async ({
      amountBaseUnits,
      mint,
      recipient,
    }: {
      amountBaseUnits: bigint;
      mint: PublicKey;
      recipient: PublicKey;
    }): Promise<{ depositSignature: string; withdrawSignature: string }> => {
      if (!wallet.publicKey) throw new Error("Connect your wallet first.");
      if (!wallet.signTransaction)
        throw new Error("Wallet does not support transaction signing.");
      if (!wallet.signMessage)
        throw new Error(
          "Wallet does not support signMessage, which is required to register the viewing key.",
        );

      const sender = wallet.publicKey;

      applyBufferPolyfill();

      try {
        // Phase 1 — deposit proof
        setState({
          status: "deposit-proof",
          progress: "Generating deposit proof",
          proofPercent: 0,
          depositSignature: null,
          withdrawSignature: null,
          error: null,
        });

        const ephemeralOwner = await generateUtxoKeypair();
        const output = await createUtxo(amountBaseUnits, ephemeralOwner, mint);

        const depositResult: TransactResult = await transact(
          {
            inputUtxos: [await createZeroUtxo(mint)],
            outputUtxos: [output],
            externalAmount: amountBaseUnits,
            depositor: sender,
          },
          {
            connection,
            programId: cloakConfig.programId,
            relayUrl: cloakConfig.relayUrl,
            depositorPublicKey: sender,
            walletPublicKey: sender,
            signTransaction: wallet.signTransaction,
            signMessage: wallet.signMessage,
            onProgress: (status) =>
              setState((s) => {
                if (s.status === "error" || s.status === "success") return s;
                const next: FastSendState = { ...s, progress: status };
                if (
                  s.status === "deposit-proof" &&
                  isSubmittingStatus(status)
                ) {
                  next.status = "deposit-submit";
                  next.proofPercent = 100;
                }
                return next;
              }),
            onProofProgress: (percent) =>
              setState((s) =>
                s.status !== "deposit-proof"
                  ? s
                  : {
                      ...s,
                      proofPercent: Math.max(
                        s.proofPercent ?? 0,
                        clampPercent(percent),
                      ),
                    },
              ),
          },
        );

        setState((s) => ({
          ...s,
          depositSignature: depositResult.signature,
        }));

        // Phase 2 — withdraw proof + submit, with stale-root retry
        let withdrawResult: TransactResult | undefined;
        for (let attempt = 1; attempt <= WITHDRAW_MAX_ATTEMPTS; attempt += 1) {
          setState((s) => ({
            ...s,
            status: "withdraw-proof",
            progress:
              attempt === 1
                ? "Generating withdraw proof"
                : `Generating withdraw proof (retry ${attempt}/${WITHDRAW_MAX_ATTEMPTS})`,
            proofPercent: 0,
          }));

          try {
            withdrawResult = await fullWithdraw(
              depositResult.outputUtxos,
              recipient,
              {
                connection,
                programId: cloakConfig.programId,
                relayUrl: cloakConfig.relayUrl,
                walletPublicKey: sender,
                signTransaction: wallet.signTransaction,
                signMessage: wallet.signMessage,
                cachedMerkleTree: depositResult.merkleTree,
                onProgress: (status) =>
                  setState((s) => {
                    if (s.status === "error" || s.status === "success") return s;
                    const next: FastSendState = { ...s, progress: status };
                    if (
                      s.status === "withdraw-proof" &&
                      isSubmittingStatus(status)
                    ) {
                      next.status = "withdraw-submit";
                      next.proofPercent = 100;
                    }
                    return next;
                  }),
                onProofProgress: (percent) =>
                  setState((s) =>
                    s.status !== "withdraw-proof"
                      ? s
                      : {
                          ...s,
                          proofPercent: Math.max(
                            s.proofPercent ?? 0,
                            clampPercent(percent),
                          ),
                        },
                  ),
              },
            );
            break;
          } catch (err) {
            if (
              !isRootNotFoundError(err) ||
              attempt === WITHDRAW_MAX_ATTEMPTS
            ) {
              throw err;
            }
            await sleep(WITHDRAW_RETRY_DELAY_MS);
          }
        }

        if (!withdrawResult) {
          throw new Error("Withdraw did not produce a result");
        }

        setState({
          status: "success",
          progress: null,
          proofPercent: 100,
          depositSignature: depositResult.signature,
          withdrawSignature: withdrawResult.signature,
          error: null,
        });

        return {
          depositSignature: depositResult.signature,
          withdrawSignature: withdrawResult.signature,
        };
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        logFastSendError(error, {
          mint: mint.toBase58(),
          amountBaseUnits: amountBaseUnits.toString(),
          sender: sender.toBase58(),
          recipient: recipient.toBase58(),
          relayUrl: cloakConfig.relayUrl,
          programId: cloakConfig.programId.toBase58(),
        });
        setState((s) => ({
          status: "error",
          progress: null,
          proofPercent: null,
          depositSignature: s.depositSignature,
          withdrawSignature: null,
          error,
        }));
        throw error;
      }
    },
    [connection, wallet],
  );

  return { ...state, send, reset };
}

function clampPercent(p: number): number {
  if (!Number.isFinite(p)) return 0;
  if (p < 0) return 0;
  if (p > 100) return 100;
  return p;
}

function isSubmittingStatus(status: string): boolean {
  const s = status.toLowerCase();
  return (
    s.includes("submit") ||
    s.includes("send") ||
    s.includes("relay") ||
    s.includes("broadcast") ||
    s.includes("confirm")
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type FastSendErrorContext = {
  mint: string;
  amountBaseUnits: string;
  sender: string;
  recipient: string;
  relayUrl: string;
  programId: string;
};

function logFastSendError(error: Error, ctx: FastSendErrorContext): void {
  const cause = (error as { cause?: unknown }).cause;
  console.group("[cloak] fast-send failed");
  console.error(error);
  console.error("message:", error.message);
  if (error.stack) console.error("stack:", error.stack);
  if (cause !== undefined) console.error("cause:", cause);
  console.error("context:", ctx);
  console.groupEnd();
}
