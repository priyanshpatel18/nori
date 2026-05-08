"use client";

import { useSyncExternalStore } from "react";

import type { SolanaCluster } from "@/lib/solana/config";

/**
 * Per-wallet, route-aware product tour. Two branches:
 *
 *   - "devnet"   compulsory path that walks a new user from Settings (flip
 *                Demo mode) → Faucet (mint test USDC) → Pay (send privately).
 *                The Demo-mode step survives the page reload that demo mode
 *                triggers because state lives in localStorage; on remount,
 *                if the satisfied() predicate returns true the engine
 *                advances automatically.
 *
 *   - "mainnet"  short overview that highlights Shield, Pay, and Compliance
 *                without requiring any actions.
 */

export type TourPath = "devnet" | "mainnet";

export type TourContext = {
  cluster: SolanaCluster;
};

export type TourStep = {
  id: string;
  route: string;
  /**
   * `data-tour` attribute on the element to halo. Optional: a step without
   * a target still shows the coachmark, just without the pulse.
   */
  target?: string;
  title: string;
  body: string;
  /**
   * Hint shown on the action button instead of "Continue". Useful when the
   * step expects the user to perform a specific action (e.g. "Toggle on").
   */
  actionLabel?: string;
  /**
   * If provided and returns true at mount/route-change, the engine advances
   * past this step automatically. Lets the demo-toggle step finish itself
   * after the forced page reload.
   */
  satisfied?: (ctx: TourContext) => boolean;
  /**
   * Optional signal name. When a page calls
   * `signalTourAction(pubkey, signal)` after the user completes the step's
   * underlying action (e.g. successful payment), the engine advances past
   * this step automatically without waiting for a click on the coachmark.
   */
  signal?: string;
};

export const DEVNET_TOUR: TourStep[] = [
  {
    id: "settings-demo",
    route: "/settings",
    target: "demo-toggle",
    title: "Switch to devnet.",
    body: "Flip Demo mode on. The page will reload so the cluster switch can take effect, then the tour picks up automatically.",
    actionLabel: "Toggle on to continue",
    satisfied: (ctx) => ctx.cluster === "devnet",
  },
  {
    id: "settings-faucet",
    route: "/settings",
    target: "faucet-link",
    title: "Open the faucet.",
    body: "We'll line up some test SOL for fees and mock USDC to spend. Click the Faucet card to head over.",
  },
  {
    id: "faucet-sol",
    route: "/faucet",
    target: "sol-claim",
    title: "Claim devnet SOL.",
    body: "You'll need a sliver of SOL for transaction fees. Cloak's devnet faucet drops it once per wallet, straight to your address.",
    actionLabel: "Claim to continue",
    signal: "sol-claimed",
  },
  {
    id: "faucet-mint",
    route: "/faucet",
    target: "usdc-mint",
    title: "Mint test USDC.",
    body: "Click Mint to drop 100 mock USDC straight into your USDC ATA. Devnet only, nothing real at stake.",
    actionLabel: "Mint to continue",
    signal: "usdc-minted",
  },
  {
    id: "pay",
    route: "/pay",
    target: "pay-form",
    title: "Send a private payment.",
    body: "You're set up. Choose a token, set the amount, paste a recipient. Cloak generates a Groth16 proof in your browser before submitting.",
    actionLabel: "I'm done",
    signal: "pay-sent",
  },
];

export const MAINNET_TOUR: TourStep[] = [
  {
    id: "shield",
    route: "/shield",
    target: "shield-action",
    title: "Shield once. Spend many.",
    body: "Deposit into your shielded balance. Every spend after that is private by default.",
  },
  {
    id: "pay",
    route: "/pay",
    target: "pay-form",
    title: "Send privately.",
    body: "Transfer to any Solana wallet, fully shielded with a Groth16 proof generated in your browser.",
  },
  {
    id: "compliance",
    route: "/compliance",
    target: "compliance-issue",
    title: "Compliance ready.",
    body: "Issue a viewing key when you need to disclose selectively. Auditors get exactly what you sign for, nothing more.",
    actionLabel: "Done",
  },
];

export function tourSteps(path: TourPath): TourStep[] {
  return path === "devnet" ? DEVNET_TOUR : MAINNET_TOUR;
}

type TourState = {
  path: TourPath | null;
  stepId: string | null;
  done: boolean;
};

const DEFAULT: TourState = { path: null, stepId: null, done: false };
const KEY_PREFIX = "cloak.tour.";

function storageKey(pubkey: string): string {
  return `${KEY_PREFIX}${pubkey}`;
}

function rawRead(pubkey: string): TourState {
  if (typeof window === "undefined") return DEFAULT;
  try {
    const raw = window.localStorage.getItem(storageKey(pubkey));
    if (!raw) return DEFAULT;
    const parsed = JSON.parse(raw) as Partial<TourState>;
    return { ...DEFAULT, ...parsed };
  } catch {
    return DEFAULT;
  }
}

// `useSyncExternalStore` requires a stable reference between calls when
// nothing has changed. Cache by pubkey, invalidate on every mutation.
const snapshotCache = new Map<string, TourState>();

function safeRead(pubkey: string): TourState {
  const cached = snapshotCache.get(pubkey);
  if (cached) return cached;
  const fresh = rawRead(pubkey);
  snapshotCache.set(pubkey, fresh);
  return fresh;
}

function safeWrite(pubkey: string, state: TourState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(pubkey), JSON.stringify(state));
    notify();
  } catch {
    /* private mode, quota, etc. */
  }
}

const subscribers = new Set<() => void>();
function notify(): void {
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

export function useTour(pubkey: string | null): TourState {
  return useSyncExternalStore(
    subscribe,
    () => (pubkey ? safeRead(pubkey) : DEFAULT),
    () => DEFAULT,
  );
}

export function startTour(pubkey: string, path: TourPath): void {
  const steps = tourSteps(path);
  safeWrite(pubkey, { path, stepId: steps[0].id, done: false });
}

export function advanceTour(pubkey: string): void {
  const state = safeRead(pubkey);
  if (!state.path || !state.stepId) return;
  const steps = tourSteps(state.path);
  const i = steps.findIndex((s) => s.id === state.stepId);
  if (i < 0) return;
  if (i >= steps.length - 1) {
    safeWrite(pubkey, { path: state.path, stepId: null, done: true });
  } else {
    safeWrite(pubkey, {
      path: state.path,
      stepId: steps[i + 1].id,
      done: false,
    });
  }
}

export function endTour(pubkey: string): void {
  // Mark done without clearing the path, so "you skipped this tour" can be
  // recognised on a Replay action.
  const state = safeRead(pubkey);
  safeWrite(pubkey, { path: state.path, stepId: null, done: true });
}

/**
 * Page-side hook for action-completion. The page that owns a step's target
 * calls this after the user successfully completes the underlying action,
 * and the engine advances past the step iff the current step declared a
 * matching `signal`. Safe to call at any time: a no-op when the wallet has
 * no active tour or the current step doesn't expect this signal, so the
 * page doesn't need to know whether a tour is running.
 */
export function signalTourAction(pubkey: string, signal: string): void {
  const state = safeRead(pubkey);
  if (!state.path || !state.stepId) return;
  const step = getCurrentStep(state);
  if (!step || step.signal !== signal) return;
  advanceTour(pubkey);
}

export function resetTour(pubkey: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey(pubkey));
    notify();
  } catch {
    /* ignore */
  }
}

export function getCurrentStep(state: TourState): TourStep | null {
  if (!state.path || !state.stepId) return null;
  return tourSteps(state.path).find((s) => s.id === state.stepId) ?? null;
}

export function getStepCounter(
  state: TourState,
): { current: number; total: number } | null {
  if (!state.path || !state.stepId) return null;
  const steps = tourSteps(state.path);
  const i = steps.findIndex((s) => s.id === state.stepId);
  if (i < 0) return null;
  return { current: i + 1, total: steps.length };
}

/**
 * Synchronous, framework-agnostic check used by `lib/toast.ts` to suppress
 * toasts while a tour is in progress. We can't use the React hook here
 * because toast helpers are called from event handlers and async flows
 * outside the render cycle. Reads localStorage directly and bails on the
 * first wallet that has an active step.
 */
export function isAnyTourActive(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const ls = window.localStorage;
    for (let i = 0; i < ls.length; i++) {
      const key = ls.key(i);
      if (!key || !key.startsWith(KEY_PREFIX)) continue;
      const raw = ls.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as Partial<TourState>;
      if (parsed && typeof parsed.stepId === "string" && parsed.stepId) {
        return true;
      }
    }
  } catch {
    /* corrupt entry, treat as inactive */
  }
  return false;
}
