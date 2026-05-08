"use client";

import { useSyncExternalStore } from "react";

import { useDemoMode } from "@/lib/cloak/demo-mode";
import { solanaConfig } from "@/lib/solana/config";
import { cn } from "@/lib/utils";

const STYLES: Record<
  typeof solanaConfig.cluster,
  { label: string; dot: string; chip: string } | null
> = {
  "mainnet-beta": null,
  devnet: {
    label: "Devnet",
    dot: "bg-amber-500",
    chip: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
  testnet: {
    label: "Testnet",
    dot: "bg-sky-500",
    chip: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  },
  localnet: {
    label: "Localnet",
    dot: "bg-violet-500",
    chip: "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  },
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

  const style = STYLES[solanaConfig.cluster];
  if (!style) return null;

  const showDemo = demo.enabled;
  const label = showDemo ? `Demo · ${style.label}` : style.label;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5",
        "text-[11px] font-medium tracking-tight",
        style.chip,
        className,
      )}
      title={
        showDemo
          ? `Demo mode (${style.label}). Use Settings to switch back.`
          : `Connected to ${style.label}`
      }
      aria-label={
        showDemo
          ? `Demo mode active on ${style.label}`
          : `Cluster: ${style.label}`
      }
    >
      <span
        aria-hidden="true"
        className={cn("size-1.5 rounded-full", style.dot)}
      />
      {label}
    </span>
  );
}
