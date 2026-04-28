"use client";

import {
  type Address,
  type SignatureBytes,
  type Transaction,
  type TransactionPartialSigner,
  getTransactionDecoder,
  getTransactionEncoder,
} from "@solana/kit";
import { fromLegacyPublicKey } from "@solana/compat";
import { VersionedTransaction } from "@solana/web3.js";
import type { WalletContextState } from "@solana/wallet-adapter-react";

export function createWalletAdapterSigner(
  wallet: WalletContextState,
): TransactionPartialSigner | null {
  if (!wallet.publicKey || !wallet.signTransaction) return null;

  const address = fromLegacyPublicKey(wallet.publicKey);
  const encoder = getTransactionEncoder();
  const decoder = getTransactionDecoder();

  return {
    address,
    signTransactions: async (transactions: readonly Transaction[]) => {
      const legacyTxs = transactions.map((tx) =>
        VersionedTransaction.deserialize(new Uint8Array(encoder.encode(tx))),
      );

      const signed = wallet.signAllTransactions
        ? await wallet.signAllTransactions(legacyTxs)
        : await Promise.all(
            legacyTxs.map((tx) => wallet.signTransaction!(tx)),
          );

      return signed.map((legacyTx) => {
        const decoded = decoder.decode(legacyTx.serialize());
        const signature = decoded.signatures[address];
        if (!signature) {
          throw new Error("Wallet returned a transaction with no signature");
        }
        return { [address]: signature } as Record<Address, SignatureBytes>;
      });
    },
  };
}
