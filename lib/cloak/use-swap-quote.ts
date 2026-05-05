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

// Jupiter Lite endpoint (free, no API key). Same route the relay uses for
// settlement, so the on-screen quote and the real fill stay close.
// Override via NEXT_PUBLIC_JUPITER_QUOTE_URL when running against a paid
// or self-hosted Jupiter instance.
const JUPITER_QUOTE_URL =
  process.env.NEXT_PUBLIC_JUPITER_QUOTE_URL ??
  "https://lite-api.jup.ag/swap/v1/quote";

// Slippage we ask Jupiter to plan for. The UI applies its own slippage on
// top of this for the on-chain min-out, so this just nudges Jupiter to
// pick routes that are robust to small price moves between quote and fill.
const QUOTE_SLIPPAGE_BPS = 50;

function parseAmountToBaseUnits(
  amount: string,
  decimals: number,
): bigint | null {
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

type JupiterRouteStep = {
  swapInfo?: { label?: string; ammKey?: string };
};

type JupiterQuoteResponse = {
  inputMint?: string;
  outputMint?: string;
  inAmount?: string;
  outAmount?: string;
  priceImpactPct?: string | number;
  routePlan?: JupiterRouteStep[];
  slippageBps?: number;
  contextSlot?: number;
};

async function fetchJupiterQuote(args: {
  inputMint: string;
  outputMint: string;
  amountBaseUnits: bigint;
  signal: AbortSignal;
}): Promise<{
  outAmountBaseUnits: bigint;
  priceImpactPct: number;
  route: string;
}> {
  const url = new URL(JUPITER_QUOTE_URL);
  url.searchParams.set("inputMint", args.inputMint);
  url.searchParams.set("outputMint", args.outputMint);
  url.searchParams.set("amount", args.amountBaseUnits.toString());
  url.searchParams.set("slippageBps", String(QUOTE_SLIPPAGE_BPS));

  const res = await fetch(url.toString(), {
    signal: args.signal,
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Jupiter quote failed (${res.status}): ${text || res.statusText}`,
    );
  }
  const json = (await res.json()) as JupiterQuoteResponse;

  if (!json.outAmount) {
    throw new Error("Jupiter quote response missing outAmount");
  }

  let outAmountBaseUnits: bigint;
  try {
    outAmountBaseUnits = BigInt(json.outAmount);
  } catch {
    throw new Error(`Jupiter outAmount not parseable: ${json.outAmount}`);
  }

  const priceImpactPct = parseFloat(String(json.priceImpactPct ?? "0"));
  const route = (json.routePlan ?? [])
    .map((step) => step.swapInfo?.label)
    .filter((label): label is string => typeof label === "string" && label !== "")
    .join(" → ");

  return {
    outAmountBaseUnits,
    priceImpactPct: Number.isFinite(priceImpactPct) ? priceImpactPct : 0,
    route,
  };
}

type QuoteJob =
  | { kind: "idle" }
  | { kind: "error"; error: Error }
  | {
      kind: "fetch";
      sell: ShieldTokenId;
      buy: ShieldTokenId;
      inBase: bigint;
      inDecimals: number;
      outDecimals: number;
      inputMint: string;
      outputMint: string;
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
    kind: "fetch",
    sell,
    buy,
    inBase,
    inDecimals: sellToken.decimals,
    outDecimals: buyToken.decimals,
    inputMint: sellToken.mint.toBase58(),
    outputMint: buyToken.mint.toBase58(),
  };
}

export function useSwapQuote(input: UseSwapQuoteInput): UseSwapQuoteResult {
  const { sell, buy, amount, debounceMs = 350 } = input;
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

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const fetched = await fetchJupiterQuote({
          inputMint: job.inputMint,
          outputMint: job.outputMint,
          amountBaseUnits: job.inBase,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;

        // Compute display price as sell-per-buy in human units.
        const inHuman = Number(job.inBase) / 10 ** job.inDecimals;
        const outHuman =
          Number(fetched.outAmountBaseUnits) / 10 ** job.outDecimals;
        const price = outHuman > 0 ? inHuman / outHuman : 0;

        setState({
          status: "ready",
          quote: {
            inAmountBaseUnits: job.inBase,
            outAmountBaseUnits: fetched.outAmountBaseUnits,
            inDecimals: job.inDecimals,
            outDecimals: job.outDecimals,
            price,
            priceImpactPct: fetched.priceImpactPct,
            feeBps: 0,
            route: fetched.route || `${job.sell} → ${job.buy}`,
            asOf: Date.now(),
          },
          error: null,
        });
      } catch (e) {
        if (controller.signal.aborted) return;
        setState({
          status: "error",
          quote: null,
          error: e instanceof Error ? e : new Error("Quote failed"),
        });
      }
    }, debounceMs);

    return () => {
      controller.abort();
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
