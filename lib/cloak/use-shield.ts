"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import * as React from "react";

import { cloakConfig } from "@/lib/cloak/config";
import {
  InsufficientShieldedBalanceError,
  shieldDeposit,
  shieldWithdrawTo,
  type ShieldPhase,
} from "@/lib/cloak/shield-core";
import { createMemoizedSignMessage } from "@/lib/cloak/sign-message-cache";
import { deriveSpendKey } from "@/lib/cloak/spend-key";
import type { StoredUtxo } from "@/lib/cloak/utxo-store";
import { solanaConfig } from "@/lib/solana/config";

export type ShieldActionStatus = "idle" | "processing" | "success" | "error";

export type ShieldActionState = {
  status: ShieldActionStatus;
  phase: ShieldPhase | null;
  progress: string | null;
  proofPercent: number | null;
  signature: string | null;
  error: string | null;
};

const initialState: ShieldActionState = {
  status: "idle",
  phase: null,
  progress: null,
  proofPercent: null,
  signature: null,
  error: null,
};

export type DepositArgs = { amountBaseUnits: bigint; mint: PublicKey };

export type WithdrawArgs = {
  amountBaseUnits: bigint;
  mint: PublicKey;
  recipient: PublicKey;
  available: StoredUtxo[];
};

export function useShield() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [state, setState] = React.useState<ShieldActionState>(initialState);

  const signMessageCacheRef = React.useRef<{
    publicKey: string | null;
    fn: ((message: Uint8Array) => Promise<Uint8Array>) | null;
  }>({ publicKey: null, fn: null });

  const reset = React.useCallback(() => setState(initialState), []);

  const prepare = React.useCallback(() => {
    if (!wallet.publicKey) throw new Error("Connect your wallet first.");
    if (!wallet.signTransaction)
      throw new Error("Wallet does not support transaction signing.");
    if (!wallet.signMessage)
      throw new Error(
        "Wallet does not support signMessage, which is required to derive your shield key.",
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

    return {
      sender,
      senderBase58,
      signTransaction: wallet.signTransaction,
      signMessage: memoizedSignMessage,
    };
  }, [wallet]);

  const callbacks = React.useMemo(
    () => ({
      onPhase: (phase: ShieldPhase) =>
        setState((s) => ({ ...s, phase })),
      onProgress: (progress: string) =>
        setState((s) => ({ ...s, progress })),
      onProofProgress: (proofPercent: number) =>
        setState((s) => ({ ...s, proofPercent })),
    }),
    [],
  );

  const beginProcessing = React.useCallback(() => {
    setState({
      status: "processing",
      phase: "deriving-key",
      progress: null,
      proofPercent: null,
      signature: null,
      error: null,
    });
  }, []);

  const handleError = React.useCallback((err: unknown) => {
    const message =
      err instanceof InsufficientShieldedBalanceError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err);
    setState({
      status: "error",
      phase: null,
      progress: null,
      proofPercent: null,
      signature: null,
      error: message,
    });
  }, []);

  const deposit = React.useCallback(
    async ({ amountBaseUnits, mint }: DepositArgs) => {
      const ctx = prepare();
      beginProcessing();

      try {
        const { spendKey } = await deriveSpendKey(
          ctx.senderBase58,
          ctx.signMessage,
        );

        const result = await shieldDeposit({
          cluster: solanaConfig.cluster,
          spendKey,
          amountBaseUnits,
          mint,
          connection,
          programId: cloakConfig.programId,
          relayUrl: cloakConfig.relayUrl,
          walletPublicKey: ctx.sender,
          signTransaction: ctx.signTransaction,
          signMessage: ctx.signMessage,
          ...callbacks,
        });

        setState((s) => ({ ...s, status: "success", signature: result.signature }));
        return result;
      } catch (err) {
        handleError(err);
        throw err;
      }
    },
    [prepare, beginProcessing, callbacks, connection, handleError],
  );

  const withdraw = React.useCallback(
    async ({
      amountBaseUnits,
      mint,
      recipient,
      available,
    }: WithdrawArgs) => {
      const ctx = prepare();
      beginProcessing();

      try {
        const { spendKey } = await deriveSpendKey(
          ctx.senderBase58,
          ctx.signMessage,
        );

        const result = await shieldWithdrawTo({
          cluster: solanaConfig.cluster,
          spendKey,
          amountBaseUnits,
          mint,
          recipient,
          available,
          connection,
          programId: cloakConfig.programId,
          relayUrl: cloakConfig.relayUrl,
          walletPublicKey: ctx.sender,
          signTransaction: ctx.signTransaction,
          signMessage: ctx.signMessage,
          ...callbacks,
        });

        setState((s) => ({ ...s, status: "success", signature: result.signature }));
        return result;
      } catch (err) {
        handleError(err);
        throw err;
      }
    },
    [prepare, beginProcessing, callbacks, connection, handleError],
  );

  return { state, deposit, withdraw, reset };
}
