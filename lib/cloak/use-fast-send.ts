"use client";

import {
  useConnection,
  useWallet,
} from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import * as React from "react";

import { cloakConfig } from "./config";
import {
  fastSendOnce,
  isSubmittingStatus,
  type FastSendPhase,
} from "./fast-send-core";
import { createMemoizedSignMessage } from "./sign-message-cache";

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

const SUBMIT_TICK = 3;

export function useFastSend() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [state, setState] = React.useState<FastSendState>(initialState);

  // Per-session signMessage cache, keyed on wallet pubkey. The Cloak SDK
  // signs a deterministic string for viewing-key registration; cache the
  // signature so subsequent sends in the same session don't re-prompt.
  const signMessageCacheRef = React.useRef<{
    publicKey: string | null;
    fn: ((message: Uint8Array) => Promise<Uint8Array>) | null;
  }>({ publicKey: null, fn: null });

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
      const senderBase58 = sender.toBase58();

      // Refresh the signMessage memoizer if the wallet changed since last send.
      let memoizedSignMessage = signMessageCacheRef.current.fn;
      if (
        signMessageCacheRef.current.publicKey !== senderBase58 ||
        !memoizedSignMessage
      ) {
        memoizedSignMessage = createMemoizedSignMessage(wallet.signMessage);
        signMessageCacheRef.current = {
          publicKey: senderBase58,
          fn: memoizedSignMessage,
        };
      }

      try {
        setState({
          ...initialState,
          status: "deposit-proof",
          progress: "Generating deposit proof",
          uiPercent: PHASE_WINDOW["deposit-proof"].enter,
        });

        const result = await fastSendOnce({
          amountBaseUnits,
          mint,
          recipient,
          sender,
          connection,
          programId: cloakConfig.programId,
          relayUrl: cloakConfig.relayUrl,
          signTransaction: wallet.signTransaction,
          signMessage: memoizedSignMessage,
          onPhase: (phase) =>
            setState((s) => onPhaseTick(s, phase)),
          onProgress: (status) =>
            setState((s) => onProgressTick(s, status)),
          onProofProgress: (percent) =>
            setState((s) => applyProofPercent(s, percent)),
        });

        setState({
          status: "success",
          progress: null,
          uiPercent: 100,
          depositSignature: result.depositSignature,
          withdrawSignature: result.withdrawSignature,
          error: null,
        });

        return {
          depositSignature: result.depositSignature,
          withdrawSignature: result.withdrawSignature,
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

function onPhaseTick(s: FastSendState, phase: FastSendPhase): FastSendState {
  if (s.status === "error" || s.status === "success") return s;
  const window = PHASE_WINDOW[phase];
  return {
    ...s,
    status: phase,
    uiPercent: Math.max(s.uiPercent, window.enter),
  };
}

function onProgressTick(s: FastSendState, message: string): FastSendState {
  if (s.status === "error" || s.status === "success") return s;
  const transitionedToSubmit =
    (s.status === "deposit-proof" || s.status === "withdraw-proof") &&
    isSubmittingStatus(message);

  let nextStatus = s.status;
  let nextPercent = s.uiPercent + SUBMIT_TICK;

  if (transitionedToSubmit) {
    nextStatus =
      s.status === "deposit-proof" ? "deposit-submit" : "withdraw-submit";
    nextPercent = Math.max(nextPercent, PHASE_WINDOW[nextStatus].enter);
  }

  const window = PHASE_WINDOW[nextStatus as keyof typeof PHASE_WINDOW];
  if (window) nextPercent = Math.min(nextPercent, window.ceiling);

  return {
    ...s,
    status: nextStatus,
    progress: message,
    uiPercent: Math.max(s.uiPercent, nextPercent),
  };
}

function applyProofPercent(s: FastSendState, percent: number): FastSendState {
  const window = PHASE_WINDOW[s.status as keyof typeof PHASE_WINDOW] ?? null;
  if (!window) return s;
  const clamped = clampPercent(percent);
  const target =
    window.enter + ((window.ceiling - window.enter) * clamped) / 100;
  return { ...s, uiPercent: Math.max(s.uiPercent, target) };
}

function clampPercent(p: number): number {
  if (!Number.isFinite(p)) return 0;
  if (p < 0) return 0;
  if (p > 100) return 100;
  return p;
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
