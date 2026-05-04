"use client";

import * as React from "react";

import { getShieldToken, type ShieldTokenId } from "@/lib/cloak/tokens";

export type SwapQuoteStatus = "idle" | "loading" | "ready" | "error";

export type SwapQuote = {
  inAmountBaseUnits: bigint;
  outAmountBaseUnits: bigint;
  inDecimals: number;
  outDecimals: number;
  /** Sell units per 1 buy unit, in human form. */
  price: number;
  priceImpactPct: number;
  feeBps: number;
  route: string;
  asOf: number;
};

export type UseSwapQuoteInput = {
  sell: ShieldTokenId;
  buy: ShieldTokenId;
  /** Human-decimal amount of the sell token. Empty / non-positive disables the quote. */
  amount: string;
  /** Debounce in ms. Defaults to 300. */
  debounceMs?: number;
};

type QuoteState =
  | { status: "idle"; quote: null; error: null }
  | { status: "loading"; quote: SwapQuote | null; error: null }
  | { status: "ready"; quote: SwapQuote; error: null }
  | { status: "error"; quote: null; error: Error };

export type UseSwapQuoteResult = {
  status: SwapQuoteStatus;
  quote: SwapQuote | null;
  error: Error | null;
  /** Force a refetch with the current inputs. */
  refresh: () => void;
};

const IDLE_STATE: QuoteState = { status: "idle", quote: null, error: null };

// Indicative reference prices, expressed as USD per 1 token.
// These drive the scaffold's quote math until a live router is wired in.
const REFERENCE_USD: Record<ShieldTokenId, number> = {
  SOL: 165,
  USDC: 1,
  USDT: 1,
};

const DEFAULT_FEE_BPS = 30;

function parseAmountToBaseUnits(amount: string, decimals: number): bigint | null {
  const trimmed = amount.trim();
  if (!trimmed) return null;
  if (!/^\d*\.?\d*$/.test(trimmed) || trimmed === ".") return null;
  const [whole, frac = ""] = trimmed.split(".");
  if (frac.length > decimals) return null;
  const padded = (frac + "0".repeat(decimals)).slice(0, decimals);
  const n = BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(padded || "0");
  if (n <= 0n) return null;
  return n;
}

function indicativeQuote(input: {
  sell: ShieldTokenId;
  buy: ShieldTokenId;
  inBase: bigint;
  inDecimals: number;
  outDecimals: number;
}): SwapQuote {
  const { sell, buy, inBase, inDecimals, outDecimals } = input;
  const sellUsd = REFERENCE_USD[sell];
  const buyUsd = REFERENCE_USD[buy];

  const inHuman = Number(inBase) / 10 ** inDecimals;
  const grossOutHuman = (inHuman * sellUsd) / buyUsd;
  const feeFactor = 1 - DEFAULT_FEE_BPS / 10_000;
  const netOutHuman = grossOutHuman * feeFactor;

  const outBase = BigInt(Math.max(0, Math.floor(netOutHuman * 10 ** outDecimals)));

  const price = sell === buy ? 1 : sellUsd / buyUsd;

  return {
    inAmountBaseUnits: inBase,
    outAmountBaseUnits: outBase,
    inDecimals,
    outDecimals,
    price,
    priceImpactPct: 0,
    feeBps: DEFAULT_FEE_BPS,
    route: `${sell} → ${buy}`,
    asOf: Date.now(),
  };
}

/**
 * Indicative swap quote for the scaffold. Replace `indicativeQuote()` with a
 * real router call (Jupiter, SDK, etc.) once the swap path is wired.
 */
type QuoteJob =
  | { kind: "idle" }
  | { kind: "error"; error: Error }
  | {
      kind: "compute";
      sell: ShieldTokenId;
      buy: ShieldTokenId;
      inBase: bigint;
      inDecimals: number;
      outDecimals: number;
    };

function planQuoteJob(input: UseSwapQuoteInput): QuoteJob {
  const { sell, buy, amount } = input;
  if (sell === buy) return { kind: "idle" };

  const sellToken = getShieldToken(sell);
  const buyToken = getShieldToken(buy);
  if (!sellToken || !buyToken) {
    return {
      kind: "error",
      error: new Error("Token not supported on this cluster."),
    };
  }

  const inBase = parseAmountToBaseUnits(amount, sellToken.decimals);
  if (inBase === null) return { kind: "idle" };

  return {
    kind: "compute",
    sell,
    buy,
    inBase,
    inDecimals: sellToken.decimals,
    outDecimals: buyToken.decimals,
  };
}

export function useSwapQuote(input: UseSwapQuoteInput): UseSwapQuoteResult {
  const { sell, buy, amount, debounceMs = 300 } = input;
  const [state, setState] = React.useState<QuoteState>(IDLE_STATE);
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    const job = planQuoteJob({ sell, buy, amount, debounceMs });

    if (job.kind === "idle") {
      setState(IDLE_STATE);
      return;
    }
    if (job.kind === "error") {
      setState({ status: "error", quote: null, error: job.error });
      return;
    }

    setState((prev) => ({
      status: "loading",
      quote: prev.status === "ready" ? prev.quote : null,
      error: null,
    }));

    let cancelled = false;
    const timer = window.setTimeout(() => {
      try {
        if (cancelled) return;
        const q = indicativeQuote({
          sell: job.sell,
          buy: job.buy,
          inBase: job.inBase,
          inDecimals: job.inDecimals,
          outDecimals: job.outDecimals,
        });
        setState({ status: "ready", quote: q, error: null });
      } catch (e) {
        if (cancelled) return;
        setState({
          status: "error",
          quote: null,
          error: e instanceof Error ? e : new Error("Quote failed"),
        });
      }
    }, debounceMs);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [sell, buy, amount, debounceMs, tick]);

  const refresh = React.useCallback(() => setTick((n) => n + 1), []);

  return {
    status: state.status,
    quote: state.quote,
    error: state.error,
    refresh,
  };
}

/**
 * Apply a slippage tolerance (in basis points) to an output amount.
 * `minOutput = floor(outAmount * (10_000 - slippageBps) / 10_000)`.
 */
export function applySlippageBps(
  outAmount: bigint,
  slippageBps: number,
): bigint {
  if (!Number.isFinite(slippageBps) || slippageBps < 0) return outAmount;
  if (slippageBps >= 10_000) return 0n;
  const bps = BigInt(Math.floor(slippageBps));
  const min = (outAmount * (10_000n - bps)) / 10_000n;
  return min < 0n ? 0n : min;
}

export function formatBaseUnits(
  amount: bigint,
  decimals: number,
  maxFractionDigits = 6,
): string {
  if (amount === 0n) return "0";
  const base = 10n ** BigInt(decimals);
  const whole = amount / base;
  const frac = amount % base;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  const trimmed = fracStr.slice(0, maxFractionDigits);
  return trimmed ? `${whole.toString()}.${trimmed}` : whole.toString();
}
