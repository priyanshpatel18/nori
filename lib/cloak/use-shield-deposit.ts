"use client";

import {
  NATIVE_SOL_MINT,
  createUtxo,
  createZeroUtxo,
  deriveUtxoKeypairFromSpendKey,
  transact,
  type TransactResult,
  type UtxoKeypair,
} from "@cloak.dev/sdk";
import {
  useConnection,
  useWallet,
} from "@solana/wallet-adapter-react";
import * as React from "react";

import { cloakConfig } from "./config";

const SHIELD_KEY_MESSAGE = "Cloak shield key v1";

export type ShieldDepositStatus =
  | "idle"
  | "deriving-key"
  | "building-proof"
  | "submitting"
  | "success"
  | "error";

export type ShieldDepositState = {
  status: ShieldDepositStatus;
  progress: string | null;
  signature: string | null;
  error: Error | null;
};

const initialState: ShieldDepositState = {
  status: "idle",
  progress: null,
  signature: null,
  error: null,
};

export function useShieldDeposit() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [state, setState] = React.useState<ShieldDepositState>(initialState);

  const keypairCache = React.useRef<{
    publicKey: string;
    keypair: UtxoKeypair;
  } | null>(null);

  const reset = React.useCallback(() => setState(initialState), []);

  const deposit = React.useCallback(
    async ({
      amountLamports,
    }: {
      amountLamports: bigint;
    }): Promise<TransactResult> => {
      if (!wallet.publicKey) throw new Error("Connect your wallet first.");
      if (!wallet.signTransaction)
        throw new Error("Wallet does not support transaction signing.");
      if (!wallet.signMessage)
        throw new Error(
          "Wallet does not support signMessage, which is required to derive your shield key.",
        );

      const ownerPubkey = wallet.publicKey;
      const ownerBase58 = ownerPubkey.toBase58();

      try {
        setState({
          status: "deriving-key",
          progress: "Deriving shield key from wallet",
          signature: null,
          error: null,
        });

        let utxoKeypair = keypairCache.current?.keypair ?? null;
        if (!utxoKeypair || keypairCache.current?.publicKey !== ownerBase58) {
          const signature = await wallet.signMessage(
            new TextEncoder().encode(SHIELD_KEY_MESSAGE),
          );
          const digest = await crypto.subtle.digest(
            "SHA-256",
            signature.buffer.slice(
              signature.byteOffset,
              signature.byteOffset + signature.byteLength,
            ) as ArrayBuffer,
          );
          const skSpend = new Uint8Array(digest);
          utxoKeypair = await deriveUtxoKeypairFromSpendKey(skSpend);
          keypairCache.current = { publicKey: ownerBase58, keypair: utxoKeypair };
        }

        setState((s) => ({
          ...s,
          status: "building-proof",
          progress: "Generating Groth16 proof",
        }));

        const result = await transact(
          {
            inputUtxos: [await createZeroUtxo(NATIVE_SOL_MINT)],
            outputUtxos: [
              await createUtxo(amountLamports, utxoKeypair, NATIVE_SOL_MINT),
            ],
            externalAmount: amountLamports,
            depositor: ownerPubkey,
          },
          {
            connection,
            programId: cloakConfig.programId,
            relayUrl: cloakConfig.relayUrl,
            depositorPublicKey: ownerPubkey,
            walletPublicKey: ownerPubkey,
            signTransaction: wallet.signTransaction,
            signMessage: wallet.signMessage,
            onProgress: (status) =>
              setState((s) =>
                s.status === "error" || s.status === "success"
                  ? s
                  : { ...s, progress: status },
              ),
          },
        );

        setState({
          status: "success",
          progress: null,
          signature: result.signature,
          error: null,
        });

        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setState({
          status: "error",
          progress: null,
          signature: null,
          error,
        });
        throw error;
      }
    },
    [connection, wallet],
  );

  return { ...state, deposit, reset };
}
