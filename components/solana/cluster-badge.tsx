"use client";

import { useSyncExternalStore } from "react";

import { useDemoMode } from "@/lib/cloak/demo-mode";
import { solanaConfig } from "@/lib/solana/config";
import { cn } from "@/lib/utils";

type DotStyle = { label: string; dot: string };

const DOT: Record<typeof solanaConfig.cluster, DotStyle | null> = {
  "mainnet-beta": null,
  devnet: { label: "Devnet", dot: "bg-amber-400" },
  testnet: { label: "Testnet", dot: "bg-sky-400" },
  localnet: { label: "Localnet", dot: "bg-violet-400" },
};

const noop = () => () => {};
function useHydrated(): boolean {
  // SSR / first commit returns false; React swaps to true after hydration.
  // Lets us defer cluster-dependent markup so a client-side cluster override
  // (demo mode) never disagrees with the server-rendered HTML.
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}

export function ClusterBadge({ className }: { className?: string }) {
  const hydrated = useHydrated();
  const demo = useDemoMode();

  if (!hydrated) return null;

  const style = DOT[solanaConfig.cluster];
  if (!style) return null;

  const showDemo = demo.enabled;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-border/60",
        "bg-card/60 px-2 py-1 text-[11px] font-medium tracking-tight text-foreground/75",
        "backdrop-blur-sm supports-backdrop-filter:bg-card/40",
        className,
      )}
      title={
        showDemo
          ? `Demo mode (${style.label}). Switch off in Settings.`
          : `Connected to ${style.label}`
      }
      aria-label={
        showDemo
          ? `Demo mode active on ${style.label}`
          : `Cluster: ${style.label}`
      }
    >
      {showDemo && (
        <span className="rounded-full border border-foreground/15 px-1.5 py-px font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-foreground/80">
          Demo
        </span>
      )}
      <span className="inline-flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className={cn("size-1.5 rounded-full", style.dot)}
        />
        {style.label}
      </span>
    </span>
  );
}
