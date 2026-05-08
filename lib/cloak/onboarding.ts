"use client";

import { useSyncExternalStore } from "react";

/**
 * Per-wallet onboarding state. Each connected wallet gets its own flag set
 * keyed under `cloak.onboarding.<pubkey>`. When a different wallet is
 * connected, the welcome dialog runs again for that identity, which is the
 * right behaviour for a privacy product where each wallet may belong to a
 * separate person or persona.
 */

const KEY_PREFIX = "cloak.onboarding.";

type OnboardingFlags = {
  welcomeSeen: boolean;
};

const DEFAULT: OnboardingFlags = { welcomeSeen: false };

function storageKey(walletPubkey: string): string {
  return `${KEY_PREFIX}${walletPubkey}`;
}

function rawRead(walletPubkey: string): OnboardingFlags {
  if (typeof window === "undefined") return DEFAULT;
  try {
    const raw = window.localStorage.getItem(storageKey(walletPubkey));
    if (!raw) return DEFAULT;
    const parsed = JSON.parse(raw) as Partial<OnboardingFlags>;
    return { ...DEFAULT, ...parsed };
  } catch {
    return DEFAULT;
  }
}

// `useSyncExternalStore` requires `getSnapshot` to return a stable reference
// while the underlying state is unchanged. Return a freshly-built object
// every call and React treats each render as a new state, which trips the
// "getSnapshot should be cached" warning and loops the tree. We memoise per
// pubkey and only invalidate when something actually mutates (notify()).
const snapshotCache = new Map<string, OnboardingFlags>();

function safeRead(walletPubkey: string): OnboardingFlags {
  const cached = snapshotCache.get(walletPubkey);
  if (cached) return cached;
  const fresh = rawRead(walletPubkey);
  snapshotCache.set(walletPubkey, fresh);
  return fresh;
}

function safeWrite(walletPubkey: string, flags: OnboardingFlags): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(walletPubkey), JSON.stringify(flags));
    notify();
  } catch {
    /* private mode, quota, etc. */
  }
}

const subscribers = new Set<() => void>();
function notify(): void {
  // Drop cached snapshots so the next read picks up the new value. Without
  // this, subscribers re-render but `getSnapshot` keeps returning the stale
  // cached reference and the change is invisible to the UI.
  snapshotCache.clear();
  for (const l of subscribers) l();
}
function subscribe(listener: () => void): () => void {
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
  };
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (typeof event.key === "string" && event.key.startsWith(KEY_PREFIX)) {
      notify();
    }
  });
}

const noopSubscribe = () => () => {};

/**
 * SSR-safe hook. Returns DEFAULT during SSR and the first client commit so
 * hydration matches; React swaps to the live value once committed.
 */
export function useOnboardingFlags(
  walletPubkey: string | null,
): OnboardingFlags {
  return useSyncExternalStore(
    subscribe,
    () => (walletPubkey ? safeRead(walletPubkey) : DEFAULT),
    () => DEFAULT,
  );
}

/**
 * Returns `true` only after the first client commit. Use this to gate any
 * UI that depends on `useOnboardingFlags` so the welcome dialog can't flash
 * for a wallet that has already been onboarded but whose localStorage value
 * is still being read.
 */
export function useOnboardingHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

export function markWelcomeSeen(walletPubkey: string): void {
  safeWrite(walletPubkey, {
    ...safeRead(walletPubkey),
    welcomeSeen: true,
  });
}

export function resetOnboarding(walletPubkey: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey(walletPubkey));
    notify();
  } catch {
    /* ignore */
  }
}
