"use client";

import * as React from "react";

import { solanaConfig } from "@/lib/solana/config";

import { getStorageKey, hasClaimedSol } from "./faucet-claimed";

export function useFaucetSolClaimed(
  wallet: string | null | undefined,
): boolean {
  const cluster = solanaConfig.cluster;

  const subscribe = React.useCallback((notify: () => void) => {
    if (typeof window === "undefined") return () => {};
    const onCustom = () => notify();
    const onStorage = (e: StorageEvent) => {
      if (!e.key || e.key === getStorageKey(cluster)) notify();
    };
    window.addEventListener("cloak:faucet-claimed-updated", onCustom);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("cloak:faucet-claimed-updated", onCustom);
      window.removeEventListener("storage", onStorage);
    };
  }, [cluster]);

  const getSnapshot = React.useCallback(
    () => (wallet ? hasClaimedSol(wallet, cluster) : false),
    [wallet, cluster],
  );

  return React.useSyncExternalStore(subscribe, getSnapshot, () => false);
}
