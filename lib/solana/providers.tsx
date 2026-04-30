"use client";

import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { useMemo, type ReactNode } from "react";

import { solanaConfig } from "./config";

export function SolanaProvider({ children }: { children: ReactNode }) {
  // Modern Solana wallets register via the Wallet Standard, so an empty array
  // works for Phantom, Solflare, Backpack, etc. Append legacy adapters from
  // @solana/wallet-adapter-wallets here if you need to support a non-standard wallet.
  const wallets = useMemo(() => [], []);

  return (
    // `processed` is the lowest commitment level. Solana txs at this level have
    // been included in a leader's block but not voted on yet. Reorg risk is
    // <1% in normal conditions, and our SDK retry path (stale-note + RootNotFound)
    // catches the rare case. Trade: faster `confirmTransaction` returns →
    // noticeably snappier fast-send flow, especially in batch payroll.
    <ConnectionProvider
      endpoint={solanaConfig.rpcUrl}
      config={{ commitment: "processed" }}
    >
      <WalletProvider wallets={wallets} autoConnect>
        {children}
      </WalletProvider>
    </ConnectionProvider>
  );
}
