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
  uiPercent: number;
  depositSignature: string | null;
  withdrawSignature: string | null;
  error: Error | null;
};

const initialState: FastSendState = {
  status: "idle",
  progress: null,
  uiPercent: 0,
  depositSignature: null,
  withdrawSignature: null,
  error: null,
};

const WITHDRAW_MAX_ATTEMPTS = 3;
const WITHDRAW_RETRY_DELAY_MS = 1500;

// Phase windows for the global progress bar.
//   [enter, ceiling] — proof-progress fills toward ceiling, submit-events bump
//   the floor to ceiling, then we move into the next window.
const PHASE_WINDOW: Record<
  Exclude<FastSendStatus, "idle" | "error">,
  { enter: number; ceiling: number }
> = {
  "deposit-proof": { enter: 5, ceiling: 35 },
  "deposit-submit": { enter: 35, ceiling: 50 },
  "withdraw-proof": { enter: 50, ceiling: 85 },
  "withdraw-submit": { enter: 85, ceiling: 95 },
  success: { enter: 100, ceiling: 100 },
};

const SUBMIT_TICK = 3; // each onProgress event nudges the bar this many %.

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
          uiPercent: PHASE_WINDOW["deposit-proof"].enter,
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
              setState((s) => onProgressTick(s, status, "deposit")),
            onProofProgress: (percent) =>
              setState((s) =>
                s.status !== "deposit-proof"
                  ? s
                  : applyProofPercent(s, percent),
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
            uiPercent: Math.max(
              s.uiPercent,
              PHASE_WINDOW["withdraw-proof"].enter,
            ),
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
                  setState((s) => onProgressTick(s, status, "withdraw")),
                onProofProgress: (percent) =>
                  setState((s) =>
                    s.status !== "withdraw-proof"
                      ? s
                      : applyProofPercent(s, percent),
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
          uiPercent: 100,
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
          uiPercent: 0,
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

function onProgressTick(
  s: FastSendState,
  message: string,
  leg: "deposit" | "withdraw",
): FastSendState {
  if (s.status === "error" || s.status === "success") return s;

  const transitionedToSubmit =
    (s.status === "deposit-proof" || s.status === "withdraw-proof") &&
    isSubmittingStatus(message);

  let nextStatus = s.status;
  let nextPercent = s.uiPercent + SUBMIT_TICK;

  if (transitionedToSubmit) {
    nextStatus = leg === "deposit" ? "deposit-submit" : "withdraw-submit";
    nextPercent = Math.max(nextPercent, PHASE_WINDOW[nextStatus].enter);
  }

  // Cap at the active phase ceiling so we don't overshoot before the next
  // explicit transition.
  const window = PHASE_WINDOW[nextStatus as keyof typeof PHASE_WINDOW];
  if (window) {
    nextPercent = Math.min(nextPercent, window.ceiling);
  }

  return {
    ...s,
    status: nextStatus,
    progress: message,
    uiPercent: Math.max(s.uiPercent, nextPercent),
  };
}

function applyProofPercent(s: FastSendState, percent: number): FastSendState {
  const window =
    PHASE_WINDOW[s.status as keyof typeof PHASE_WINDOW] ?? null;
  if (!window) return s;
  const clamped = clampPercent(percent);
  const target = window.enter + ((window.ceiling - window.enter) * clamped) / 100;
  return {
    ...s,
    uiPercent: Math.max(s.uiPercent, target),
  };
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
