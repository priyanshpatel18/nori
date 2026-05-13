"use client";

import {
  createDefaultAddressSelector,
  createDefaultAuthorizationResultCache,
  createDefaultWalletNotFoundHandler,
  SolanaMobileWalletAdapter,
} from "@solana-mobile/wallet-adapter-mobile";
import type { Adapter } from "@solana/wallet-adapter-base";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { useMemo, type ReactNode } from "react";

import { solanaConfig, type SolanaCluster } from "./config";

// MWA only speaks "mainnet-beta" | "devnet" | "testnet". Localnet falls back to
// devnet so dev builds against a local validator still surface a usable wallet
// option when opened on a phone over LAN.
function mwaCluster(cluster: SolanaCluster): "mainnet-beta" | "devnet" | "testnet" {
  return cluster === "localnet" ? "devnet" : cluster;
}

export function SolanaProvider({ children }: { children: ReactNode }) {
  // Modern Solana wallets register via the Wallet Standard, so desktop browsers
  // pick up Phantom, Solflare, Backpack, etc. without any explicit entries.
  // On mobile (Android Chrome / Firefox, not in-app), `@solana/wallet-adapter-react`
  // also auto-registers a Mobile Wallet Adapter. We pass our own instance instead
  // so the wallet handoff shows "Nori" + icon instead of a bare URL, and so the
  // cluster matches the configured RPC (auto-registration infers cluster from
  // the endpoint string and would mis-tag custom RPC URLs).
  const wallets = useMemo<Adapter[]>(
    () => [
      new SolanaMobileWalletAdapter({
        addressSelector: createDefaultAddressSelector(),
        appIdentity: {
          name: "Nori",
          uri:
            typeof window !== "undefined"
              ? `${window.location.protocol}//${window.location.host}`
              : "https://usenori.xyz",
          icon: "/favicon.ico",
        },
        authorizationResultCache: createDefaultAuthorizationResultCache(),
        cluster: mwaCluster(solanaConfig.cluster),
        onWalletNotFound: createDefaultWalletNotFoundHandler(),
      }),
    ],
    [],
  );

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
