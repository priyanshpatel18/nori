"use client";

import { useSyncExternalStore } from "react";

import type { SolanaCluster } from "@/lib/solana/config";

const FLAG_KEY = "cloak.demoMode";
const CLUSTER_OVERRIDE_KEY = "cloak.clusterOverride";

const ENV_CLUSTER = (process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet") as
  | SolanaCluster
  | string;

function safeRead(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeWrite(key: string, value: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* private mode, quota, etc. */
  }
}

export function isDemoModeOn(): boolean {
  return safeRead(FLAG_KEY) === "on";
}

export function readClusterOverride(): SolanaCluster | null {
  const raw = safeRead(CLUSTER_OVERRIDE_KEY);
  if (raw === "mainnet-beta" || raw === "devnet" || raw === "testnet" || raw === "localnet") {
    return raw;
  }
  return null;
}

/**
 * Demo mode = "I want devnet behaviour with the faucet UI exposed."
 *
 * Already on devnet at build time: just flip the flag, then reload so the
 * Settings UI re-renders. Reload also drops any RPC singletons that may have
 * cached transient state.
 *
 * Build is mainnet: also write a cluster override so `solanaConfig` picks
 * devnet on the next module load. The override is keyed independently from
 * the flag so a user can clear demo mode without forgetting they were also
 * shifted to devnet.
 */
export function enableDemoMode(): void {
  safeWrite(FLAG_KEY, "on");
  if (ENV_CLUSTER !== "devnet") {
    safeWrite(CLUSTER_OVERRIDE_KEY, "devnet");
  }
  if (typeof window !== "undefined") {
    window.location.reload();
  }
}

export function disableDemoMode(): void {
  safeWrite(FLAG_KEY, null);
  safeWrite(CLUSTER_OVERRIDE_KEY, null);
  if (typeof window !== "undefined") {
    window.location.reload();
  }
}

// Cross-tab sync: a storage event in another tab triggers re-renders here.
const subscribers = new Set<() => void>();
function notify() {
  for (const l of subscribers) l();
}
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === FLAG_KEY || event.key === CLUSTER_OVERRIDE_KEY) {
      notify();
    }
  });
}

function subscribe(listener: () => void): () => void {
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
  };
}

/**
 * SSR-safe hook. During SSR and the first client render it returns the
 * server snapshot (everything off) so hydration matches; React then swaps
 * to the live value once committed.
 */
export function useDemoMode(): {
  enabled: boolean;
  hasOverride: boolean;
} {
  const enabled = useSyncExternalStore(
    subscribe,
    () => isDemoModeOn(),
    () => false,
  );
  const hasOverride = useSyncExternalStore(
    subscribe,
    () => readClusterOverride() !== null,
    () => false,
  );
  return { enabled, hasOverride };
}
