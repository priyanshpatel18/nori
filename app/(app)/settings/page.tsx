"use client";

import {
  ArrowUpRight01Icon,
  CheckmarkCircle01Icon,
  Copy01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useWallet } from "@solana/wallet-adapter-react";
import { motion } from "motion/react";
import Link from "next/link";
import * as React from "react";

import { PageHeader } from "@/components/app-shell/page-header";
import { FaucetIcon, SettingsIcon } from "@/components/Icons";
import { Button } from "@/components/ui/button";
import {
  disableDemoMode,
  enableDemoMode,
  useDemoMode,
} from "@/lib/cloak/demo-mode";
import { cloakConfig } from "@/lib/cloak/config";
import { resetOnboarding } from "@/lib/cloak/onboarding";
import { resetTour } from "@/lib/cloak/tour";
import { solanaConfig, type SolanaCluster } from "@/lib/solana/config";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

const CLUSTER_LABEL: Record<SolanaCluster, string> = {
  "mainnet-beta": "Mainnet",
  devnet: "Devnet",
  testnet: "Testnet",
  localnet: "Localnet",
};

const ENV_CLUSTER = (process.env.NEXT_PUBLIC_SOLANA_CLUSTER ??
  "devnet") as SolanaCluster;

export default function SettingsPage() {
  const demo = useDemoMode();
  const wallet = useWallet();
  const pubkey = wallet.publicKey?.toBase58() ?? null;

  const [busy, setBusy] = React.useState<null | "demo-on" | "demo-off">(null);

  const cluster = solanaConfig.cluster;
  const isDevnetActive = cluster === "devnet";

  function handleToggleDemo(next: boolean) {
    if (next) {
      setBusy("demo-on");
      enableDemoMode();
    } else {
      setBusy("demo-off");
      disableDemoMode();
    }
  }

  function handleReplayTour() {
    if (!pubkey) {
      toast.error("Connect a wallet to replay the welcome tour.");
      return;
    }
    resetOnboarding(pubkey);
    resetTour(pubkey);
    toast("Welcome tour reset", {
      description: "Reopening the walkthrough for this wallet.",
    });
  }

  const clusterDot =
    cluster === "devnet"
      ? "bg-amber-400"
      : cluster === "mainnet-beta"
        ? "bg-emerald-400"
        : cluster === "testnet"
          ? "bg-sky-400"
          : "bg-violet-400";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader eyebrow="Configuration" title="Settings" />

      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 p-4 sm:p-6 lg:gap-5 lg:p-7">
        {/* Hero strip: cluster identity on the left, demo mode on the right */}
        <section className="grid grid-cols-1 overflow-hidden rounded-2xl border border-border bg-card/40 lg:grid-cols-[1.3fr_1fr]">
          <div className="flex flex-col justify-between gap-6 p-5 sm:p-6">
            <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              <span aria-hidden="true" className={cn("size-1.5 rounded-full", clusterDot)} />
              Active cluster
            </div>
            <div>
              <p className="font-heading text-[44px] font-semibold leading-none tracking-[-0.03em] text-foreground sm:text-[52px]">
                {CLUSTER_LABEL[cluster]}
              </p>
              <p className="mt-3 max-w-md text-[13px] leading-6 text-muted-foreground">
                {demo.hasOverride
                  ? `Overridden by demo mode. The build cluster is ${CLUSTER_LABEL[ENV_CLUSTER]}; turn demo off to switch back.`
                  : `Used for every RPC call, program lookup, and relay submission this client makes.`}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Fee" value="0.005 SOL" hint="+ 0.3%" />
              <Stat label="Min deposit" value="0.01 SOL" />
              <Stat label="Tree height" value="32" />
              <Stat label="Root history" value="100" />
            </div>
          </div>

          <div className="flex flex-col justify-between gap-4 border-t border-border/60 p-5 sm:p-6 lg:border-l lg:border-t-0">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <SettingsIcon size={16} className="text-foreground/70" />
                  <h2 className="text-[14px] font-semibold tracking-tight">
                    Demo mode
                  </h2>
                  {demo.enabled && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/60 px-1.5 py-0.5 text-[9.5px] font-medium uppercase tracking-[0.18em] text-foreground/75 backdrop-blur-sm">
                      <span className="size-1 rounded-full bg-amber-400" />
                      On
                    </span>
                  )}
                </div>
                <p className="mt-2 max-w-prose text-[13px] leading-6 text-muted-foreground">
                  Run Nori on Solana devnet with a built-in faucet for test
                  funds. Nothing real is at stake.
                </p>
              </div>
              <span data-tour="demo-toggle" className="rounded-full">
                <DemoToggle
                  enabled={demo.enabled}
                  busy={busy !== null}
                  onChange={handleToggleDemo}
                />
              </span>
            </div>
            {ENV_CLUSTER !== "devnet" && (
              <p className="text-[11.5px] leading-5 text-muted-foreground">
                Toggling reloads the page so the cluster switch can take
                effect.
              </p>
            )}

            <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-4">
              <div className="min-w-0">
                <p className="text-[12.5px] font-medium tracking-tight text-foreground">
                  Welcome tour
                </p>
                <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                  Replay the first-use walkthrough for this wallet.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleReplayTour}
                disabled={!pubkey}
              >
                Replay
              </Button>
            </div>
          </div>
        </section>

        {/* Action grid: identifiers on the left, faucet on the right */}
        <div className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5">
          <section className="flex flex-col rounded-2xl border border-border bg-card/40 p-5 sm:p-6">
            <header className="flex items-center justify-between gap-3">
              <h2 className="text-[14px] font-semibold tracking-tight">
                Endpoints
              </h2>
              <ClusterPill cluster={cluster} />
            </header>
            <dl className="mt-5 flex flex-1 flex-col justify-around gap-4 text-[12.5px]">
              <Field
                label="RPC"
                value={solanaConfig.rpcUrl}
                mono
                copy
                secret
              />
              <Field
                label="Program ID"
                value={cloakConfig.programId.toBase58()}
                mono
                copy
              />
              <Field label="Relay" value={cloakConfig.relayUrl} mono copy />
            </dl>
          </section>

          <Link
            href="/faucet"
            data-tour="faucet-link"
            className={cn(
              "group/faucet flex flex-col rounded-2xl border border-border bg-card/40 p-5 sm:p-6",
              "transition-colors hover:border-foreground/25 hover:bg-card/60",
              !isDevnetActive && "pointer-events-none opacity-60",
            )}
            aria-disabled={!isDevnetActive}
          >
            <header className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <FaucetIcon size={16} className="text-foreground/70" />
                <h2 className="text-[14px] font-semibold tracking-tight">
                  Faucet
                </h2>
              </div>
              <HugeiconsIcon
                icon={ArrowUpRight01Icon}
                strokeWidth={2}
                className="size-4 text-muted-foreground transition-transform group-hover/faucet:-translate-y-px group-hover/faucet:translate-x-px"
              />
            </header>
            <p className="mt-3 max-w-prose flex-1 text-[12.5px] leading-5 text-muted-foreground">
              {isDevnetActive
                ? "Mint mock USDC straight to your ATA, or open Solana's official faucet for devnet SOL. Devnet only."
                : `Available on devnet only. Active cluster is ${CLUSTER_LABEL[cluster]}.`}
            </p>
            {isDevnetActive && (
              <div className="mt-auto flex flex-wrap items-center gap-3 pt-4 text-[11.5px] text-muted-foreground">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/40 px-2 py-0.5 font-mono text-[11px]">
                  Mock USDC
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/40 px-2 py-0.5 font-mono text-[11px]">
                  Devnet SOL
                </span>
              </div>
            )}
          </Link>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p className="font-mono text-[13px] font-medium text-foreground">
        {value}
        {hint && (
          <span className="ml-1 text-[11px] font-normal text-muted-foreground">
            {hint}
          </span>
        )}
      </p>
    </div>
  );
}

function ClusterPill({ cluster }: { cluster: SolanaCluster }) {
  const dot: Record<SolanaCluster, string> = {
    "mainnet-beta": "bg-emerald-400",
    devnet: "bg-amber-400",
    testnet: "bg-sky-400",
    localnet: "bg-violet-400",
  };
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-2 rounded-full border border-border/60",
        "bg-card/60 px-2.5 py-1 text-[11px] font-medium tracking-tight text-foreground/80",
        "backdrop-blur-sm supports-backdrop-filter:bg-card/40",
      )}
    >
      <span aria-hidden="true" className={cn("size-1.5 rounded-full", dot[cluster])} />
      {CLUSTER_LABEL[cluster]}
    </span>
  );
}

function Field({
  label,
  value,
  hint,
  mono,
  copy,
  secret,
}: {
  label: string;
  value: string;
  hint?: string;
  mono?: boolean;
  copy?: boolean;
  /**
   * Treat the value as a credential. Render a fixed redaction marker only,
   * with no reveal toggle and no copy button. The actual value never reaches
   * the DOM so it can't be inspected, screenshotted, or extracted.
   */
  secret?: boolean;
}) {
  const [copied, setCopied] = React.useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <dt className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </dt>
      <dd
        className={cn(
          "flex items-center gap-2 break-all text-foreground",
          mono ? "font-mono text-[12.5px]" : "text-[13px]",
        )}
      >
        {secret ? (
          <span
            aria-label={`${label} is hidden`}
            className="inline-flex min-w-0 flex-1 items-center gap-2 text-muted-foreground"
          >
            <span aria-hidden="true" className="tracking-[0.4em]">
              ••••••••••••
            </span>
            <span className="text-[10.5px] font-medium uppercase tracking-[0.16em]">
              Hidden
            </span>
          </span>
        ) : (
          <span className="min-w-0 flex-1 truncate">{value}</span>
        )}
        {!secret && copy && (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={handleCopy}
            aria-label={`Copy ${label}`}
          >
            <HugeiconsIcon
              icon={copied ? CheckmarkCircle01Icon : Copy01Icon}
              strokeWidth={2}
            />
          </Button>
        )}
      </dd>
      {hint && (
        <p className="inline-flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
          <span aria-hidden="true" className="size-1 rounded-full bg-amber-400" />
          {hint}
        </p>
      )}
    </div>
  );
}

function DemoToggle({
  enabled,
  busy,
  onChange,
}: {
  enabled: boolean;
  busy: boolean;
  onChange: (next: boolean) => void;
}) {
  const checked = enabled;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={checked ? "Disable demo mode" : "Enable demo mode"}
      disabled={busy}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:cursor-not-allowed disabled:opacity-50",
        checked
          ? "border-foreground/25 bg-foreground/10"
          : "border-border bg-muted",
      )}
    >
      <motion.span
        aria-hidden="true"
        animate={{ x: checked ? 22 : 2 }}
        transition={{ type: "spring", stiffness: 400, damping: 28 }}
        className={cn(
          "inline-flex size-5 items-center justify-center rounded-full bg-background shadow ring-1",
          checked ? "ring-foreground/30" : "ring-border",
        )}
      >
        {checked && (
          <span aria-hidden="true" className="size-1.5 rounded-full bg-amber-400" />
        )}
      </motion.span>
    </button>
  );
}

