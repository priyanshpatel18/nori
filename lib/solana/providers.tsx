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
    <ConnectionProvider endpoint={solanaConfig.rpcUrl}>
      <WalletProvider wallets={wallets} autoConnect>
        {children}
      </WalletProvider>
    </ConnectionProvider>
  );
}
