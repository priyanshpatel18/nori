"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import * as React from "react";

import { cloakConfig } from "./config";
import { isSubmittingStatus } from "./fast-send-core";
import { createMemoizedSignMessage } from "./sign-message-cache";
import {
  swapOnce,
  type SwapPhase,
  type SwapTxUpdate,
} from "./swap-core";

export type SwapStatus =
  | "idle"
  | "deposit-proof"
  | "deposit-submit"
  | "swap-proof"
  | "swap-submit"
  | "swap-settle"
  | "success"
  | "error";

export type SwapTxStatus = "pending" | "submitted" | "settled" | "failed";

export type SwapTxRecord = {
  signature: string | null;
  status: SwapTxStatus;
  error?: string;
};

export type SwapState = {
  status: SwapStatus;
  progress: string | null;
  uiPercent: number;
  depositTx: SwapTxRecord;
  openSwapStateTx: SwapTxRecord;
  settlementTx: SwapTxRecord;
  swapStatePda: string | null;
  requestId: string | null;
  recipientAta: string | null;
  error: Error | null;
};

const PENDING_TX: SwapTxRecord = { signature: null, status: "pending" };

const initialState: SwapState = {
  status: "idle",
  progress: null,
  uiPercent: 0,
  depositTx: PENDING_TX,
  openSwapStateTx: PENDING_TX,
  settlementTx: PENDING_TX,
  swapStatePda: null,
  requestId: null,
  recipientAta: null,
  error: null,
};

const PHASE_WINDOW: Record<
  Exclude<SwapStatus, "idle" | "error">,
  { enter: number; ceiling: number }
> = {
  "deposit-proof": { enter: 5, ceiling: 30 },
  "deposit-submit": { enter: 30, ceiling: 45 },
  "swap-proof": { enter: 45, ceiling: 75 },
  "swap-submit": { enter: 75, ceiling: 88 },
  "swap-settle": { enter: 88, ceiling: 98 },
  success: { enter: 100, ceiling: 100 },
};

const SUBMIT_TICK = 3;

export function useSwap() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [state, setState] = React.useState<SwapState>(initialState);

  const signMessageCacheRef = React.useRef<{
    publicKey: string | null;
    fn: ((message: Uint8Array) => Promise<Uint8Array>) | null;
  }>({ publicKey: null, fn: null });

  const reset = React.useCallback(() => setState(initialState), []);

  const send = React.useCallback(
    async ({
      sellAmountBaseUnits,
      sellMint,
      buyMint,
      minOutputBaseUnits,
    }: {
      sellAmountBaseUnits: bigint;
      sellMint: PublicKey;
      buyMint: PublicKey;
      minOutputBaseUnits: bigint;
    }) => {
      if (!wallet.publicKey) throw new Error("Connect your wallet first.");
      if (!wallet.signTransaction)
        throw new Error("Wallet does not support transaction signing.");
      if (!wallet.signMessage)
        throw new Error(
          "Wallet does not support signMessage, which is required to register the viewing key.",
        );

      const sender = wallet.publicKey;
      const senderBase58 = sender.toBase58();

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

        const result = await swapOnce({
          sellAmountBaseUnits,
          sellMint,
          buyMint,
          minOutputBaseUnits,
          sender,
          connection,
          programId: cloakConfig.programId,
          relayUrl: cloakConfig.relayUrl,
          signTransaction: wallet.signTransaction,
          signMessage: memoizedSignMessage,
          onPhase: (phase) => setState((s) => onPhaseTick(s, phase)),
          onProgress: (status) =>
            setState((s) => onProgressTick(s, status)),
          onProofProgress: (percent) =>
            setState((s) => applyProofPercent(s, percent)),
          onTxUpdate: (update) =>
            setState((s) => applyTxUpdate(s, update)),
        });

        setState((s) => ({
          ...s,
          status: "success",
          progress: null,
          uiPercent: 100,
          swapStatePda: result.swapStatePda,
          requestId: result.requestId,
          recipientAta: result.recipientAta,
          settlementTx: result.settlementSignature
            ? { signature: result.settlementSignature, status: "settled" }
            : s.settlementTx,
          error: null,
        }));

        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setState((s) => ({
          ...s,
          status: "error",
          progress: null,
          uiPercent: 0,
          error,
        }));
        throw error;
      }
    },
    [connection, wallet],
  );

  return { ...state, send, reset };
}

function onPhaseTick(s: SwapState, phase: SwapPhase): SwapState {
  if (s.status === "error" || s.status === "success") return s;
  const window = PHASE_WINDOW[phase];
  return {
    ...s,
    status: phase,
    uiPercent: Math.max(s.uiPercent, window.enter),
  };
}

function onProgressTick(s: SwapState, message: string): SwapState {
  if (s.status === "error" || s.status === "success") return s;
  const transitionedToSubmit =
    (s.status === "deposit-proof" || s.status === "swap-proof") &&
    isSubmittingStatus(message);

  let nextStatus = s.status;
  let nextPercent = s.uiPercent + SUBMIT_TICK;

  if (transitionedToSubmit) {
    nextStatus =
      s.status === "deposit-proof" ? "deposit-submit" : "swap-submit";
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

function applyTxUpdate(s: SwapState, update: SwapTxUpdate): SwapState {
  const record: SwapTxRecord = {
    signature: update.signature,
    status: update.status,
    error: update.error,
  };
  switch (update.kind) {
    case "deposit":
      return { ...s, depositTx: record };
    case "open-swap-state":
      return { ...s, openSwapStateTx: record };
    case "settlement":
      return { ...s, settlementTx: record };
  }
}

function applyProofPercent(s: SwapState, percent: number): SwapState {
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
