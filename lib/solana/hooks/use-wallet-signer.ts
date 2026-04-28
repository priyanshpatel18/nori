"use client";

import type { TransactionPartialSigner } from "@solana/kit";
import { useWallet } from "@solana/wallet-adapter-react";
import { useMemo } from "react";

import { createWalletAdapterSigner } from "../signer";

export function useWalletSigner(): TransactionPartialSigner | null {
  const wallet = useWallet();
  const publicKey = wallet.publicKey?.toBase58() ?? null;

  return useMemo(
    () => createWalletAdapterSigner(wallet),
    // The signer captures `wallet` by closure; rebuild only when the connected
    // identity changes so downstream effects keep stable references.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [publicKey],
  );
}
