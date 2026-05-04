"use client";

import { motion } from "motion/react";
import * as React from "react";

import { cn } from "@/lib/utils";

const PRESETS_BPS = [10, 50, 100] as const;

export const SLIPPAGE_MIN_BPS = 1;
export const SLIPPAGE_MAX_BPS = 5000;

export type SlippageInputProps = {
  /** Slippage tolerance, expressed in basis points (1bps = 0.01%). */
  valueBps: number;
  onChangeBps: (bps: number) => void;
  className?: string;
};

export function SlippageInput({
  valueBps,
  onChangeBps,
  className,
}: SlippageInputProps) {
  const [custom, setCustom] = React.useState<string>(() =>
    PRESETS_BPS.includes(valueBps as (typeof PRESETS_BPS)[number])
      ? ""
      : bpsToPercentString(valueBps),
  );
  const [touched, setTouched] = React.useState(false);

  const isCustom = !PRESETS_BPS.includes(
    valueBps as (typeof PRESETS_BPS)[number],
  );

  const customError = parseSlippageInput(custom);
  const showCustomError = touched && custom.trim() !== "" && customError.kind === "error";

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-center gap-1.5 rounded-xl border border-border bg-background/50 p-1">
        {PRESETS_BPS.map((bps) => {
          const isActive = !isCustom && valueBps === bps;
          return (
            <button
              key={bps}
              type="button"
              onClick={() => {
                onChangeBps(bps);
                setCustom("");
                setTouched(false);
              }}
              className={cn(
                "relative flex-1 rounded-lg px-2 py-1.5 text-[12.5px] font-medium transition-colors",
                isActive
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {isActive && (
                <motion.span
                  layoutId="slippage-active"
                  aria-hidden="true"
                  className="absolute inset-0 -z-0 rounded-lg bg-secondary"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}
              <span className="relative z-10 font-mono tabular-nums">
                {bpsToPercentString(bps)}%
              </span>
            </button>
          );
        })}
        <div
          className={cn(
            "relative flex flex-1 items-center rounded-lg border border-transparent transition-colors",
            isCustom && "border-border bg-background",
            showCustomError && "border-destructive",
          )}
        >
          <input
            inputMode="decimal"
            placeholder="Custom"
            value={custom}
            onChange={(e) => {
              const next = e.target.value;
              setCustom(next);
              setTouched(true);
              const parsed = parseSlippageInput(next);
              if (parsed.kind === "ok") onChangeBps(parsed.bps);
            }}
            onBlur={() => setTouched(true)}
            aria-label="Custom slippage in percent"
            aria-invalid={showCustomError || undefined}
            className="h-7 w-full min-w-0 rounded-lg bg-transparent px-2 text-right font-mono text-[12.5px] tabular-nums text-foreground outline-none placeholder:text-muted-foreground"
          />
          <span className="pr-2 text-[12.5px] text-muted-foreground">%</span>
        </div>
      </div>
      {showCustomError ? (
        <p className="text-[11.5px] text-destructive">{customError.message}</p>
      ) : valueBps >= 500 ? (
        <p className="text-[11.5px] text-yellow-600 dark:text-yellow-400">
          High slippage. You may receive significantly less.
        </p>
      ) : null}
    </div>
  );
}

function bpsToPercentString(bps: number): string {
  const pct = bps / 100;
  return pct.toLocaleString(undefined, {
    minimumFractionDigits: pct < 1 ? 1 : 0,
    maximumFractionDigits: 2,
  });
}

type SlippageParse =
  | { kind: "ok"; bps: number }
  | { kind: "empty" }
  | { kind: "error"; message: string };

function parseSlippageInput(raw: string): SlippageParse {
  const trimmed = raw.trim();
  if (!trimmed) return { kind: "empty" };
  if (!/^\d*\.?\d*$/.test(trimmed) || trimmed === ".") {
    return { kind: "error", message: "Numbers only." };
  }
  const pct = Number(trimmed);
  if (!Number.isFinite(pct) || pct <= 0) {
    return { kind: "error", message: "Must be greater than zero." };
  }
  const bps = Math.round(pct * 100);
  if (bps < SLIPPAGE_MIN_BPS) {
    return { kind: "error", message: "Minimum is 0.01%." };
  }
  if (bps > SLIPPAGE_MAX_BPS) {
    return { kind: "error", message: "Maximum is 50%." };
  }
  return { kind: "ok", bps };
}
