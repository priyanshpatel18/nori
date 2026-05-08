"use client";

import {
  CheckmarkCircle01Icon,
  Copy01Icon,
  Loading03Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useWallet } from "@solana/wallet-adapter-react";
import { motion } from "motion/react";
import * as React from "react";

import { PageHeader } from "@/components/app-shell/page-header";
import { SettingsIcon } from "@/components/Icons";
import { ConnectButton } from "@/components/solana/connect-button";
import { Button } from "@/components/ui/button";
import { FancyButton } from "@/components/ui/fancy-button";
import { Label } from "@/components/ui/label";
import {
  disableDemoMode,
  enableDemoMode,
  useDemoMode,
} from "@/lib/cloak/demo-mode";
import { cloakConfig } from "@/lib/cloak/config";
import {
  airdropDevnetMockUsdc,
  airdropDevnetSol,
} from "@/lib/solana/faucet";
import { solanaConfig, type SolanaCluster } from "@/lib/solana/config";
import { solscanTxUrl } from "@/lib/solana/explorer";
import { toast, toastPromise } from "@/lib/toast";
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
  const recipient = wallet.publicKey?.toBase58() ?? null;

  const [busy, setBusy] = React.useState<null | "demo-on" | "demo-off">(null);
  const [solBusy, setSolBusy] = React.useState(false);
  const [usdcBusy, setUsdcBusy] = React.useState(false);

  const cluster = solanaConfig.cluster;
  const isDevnetActive = cluster === "devnet";
  const showFaucet = isDevnetActive;

  function handleToggleDemo(next: boolean) {
    if (next) {
      setBusy("demo-on");
      enableDemoMode();
    } else {
      setBusy("demo-off");
      disableDemoMode();
    }
  }

  async function handleAirdropSol() {
    if (!recipient) return;
    setSolBusy(true);
    try {
      const sig = await toastPromise(airdropDevnetSol(recipient, 1), {
        loading: "Requesting 1 devnet SOL…",
        success: "Airdropped 1 devnet SOL.",
        error: (err) =>
          err instanceof Error
            ? `Airdrop failed: ${err.message}`
            : "Airdrop failed.",
      });
      toast("Devnet SOL received", {
        description: "View transaction on Solscan",
        action: {
          label: "Open",
          onClick: () => window.open(solscanTxUrl(sig), "_blank"),
        },
      });
    } catch {
      /* error already toasted */
    } finally {
      setSolBusy(false);
    }
  }

  async function handleAirdropUsdc() {
    if (!recipient) return;
    setUsdcBusy(true);
    try {
      const result = await toastPromise(
        airdropDevnetMockUsdc(recipient, 100),
        {
          loading: "Minting 100 mock USDC…",
          success: "Minted 100 mock USDC.",
          error: (err) =>
            err instanceof Error
              ? `Faucet failed: ${err.message}`
              : "Faucet failed.",
        },
      );
      if (result.signature) {
        toast("Mock USDC minted", {
          description: "View transaction on Solscan",
          action: {
            label: "Open",
            onClick: () =>
              window.open(
                result.explorer ?? solscanTxUrl(result.signature),
                "_blank",
              ),
          },
        });
      }
    } catch {
      /* error already toasted */
    } finally {
      setUsdcBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Configuration"
        title="Settings"
        description="Inspect the cluster you're connected to, switch into demo mode, and pull test funds from the devnet faucet."
      />

      <div className="flex flex-col gap-6 px-4 py-6 sm:px-8 sm:py-8">
        <section
          className={cn(
            "rounded-2xl border border-border bg-card/40 p-5 sm:p-6",
          )}
        >
          <header className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-[15px] font-semibold tracking-tight">
                Cluster
              </h2>
              <p className="mt-1 text-[13px] text-muted-foreground">
                Active configuration used for RPC calls, program lookups, and
                relay submissions.
              </p>
            </div>
            <ClusterPill cluster={cluster} />
          </header>

          <dl className="mt-5 grid grid-cols-1 gap-x-6 gap-y-3 text-[13px] sm:grid-cols-2">
            <Field label="Build cluster" value={CLUSTER_LABEL[ENV_CLUSTER]} />
            <Field
              label="Active cluster"
              value={CLUSTER_LABEL[cluster]}
              hint={demo.hasOverride ? "Overridden by demo mode" : undefined}
            />
            <Field label="RPC URL" value={solanaConfig.rpcUrl} mono copy />
            <Field
              label="Program ID"
              value={cloakConfig.programId.toBase58()}
              mono
              copy
            />
            <Field label="Relay" value={cloakConfig.relayUrl} mono copy />
          </dl>
        </section>

        <section
          className={cn(
            "rounded-2xl border bg-card/40 p-5 sm:p-6",
            demo.enabled
              ? "border-amber-500/40 bg-amber-500/5"
              : "border-border",
          )}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <SettingsIcon size={18} className="text-foreground/70" />
                <h2 className="text-[15px] font-semibold tracking-tight">
                  Demo mode
                </h2>
                {demo.enabled && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10.5px] font-medium uppercase tracking-[0.16em] text-amber-700 dark:text-amber-300">
                    <span className="size-1.5 rounded-full bg-amber-500" />
                    On
                  </span>
                )}
              </div>
              <p className="mt-2 max-w-prose text-[13px] leading-6 text-muted-foreground">
                Run Cloak against Solana devnet with a built-in faucet for
                test SOL and mock USDC. Useful for demos and integration
                testing. Nothing that runs in demo mode touches real funds.
              </p>
              {ENV_CLUSTER !== "devnet" && (
                <p className="mt-2 max-w-prose text-[12.5px] leading-5 text-amber-700 dark:text-amber-300">
                  Turning this on switches the active cluster to devnet and
                  reloads the page. Turn it off to return to the build cluster
                  ({CLUSTER_LABEL[ENV_CLUSTER]}).
                </p>
              )}
            </div>

            <DemoToggle
              enabled={demo.enabled}
              busy={busy !== null}
              onChange={handleToggleDemo}
            />
          </div>
        </section>

        <section
          className={cn(
            "rounded-2xl border border-border bg-card/40 p-5 sm:p-6",
            !showFaucet && "opacity-60",
          )}
        >
          <header className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-[15px] font-semibold tracking-tight">
                Devnet faucet
              </h2>
              <p className="mt-1 text-[13px] text-muted-foreground">
                Mint test funds straight to the connected wallet. Devnet only.
              </p>
            </div>
          </header>

          {!showFaucet && (
            <p className="mt-4 rounded-xl border border-dashed border-border bg-background/40 px-4 py-3 text-[12.5px] text-muted-foreground">
              The faucet is only available on devnet. Active cluster is{" "}
              {CLUSTER_LABEL[cluster]}.
            </p>
          )}

          {showFaucet && !recipient && (
            <div className="mt-4 flex flex-col items-start gap-3 rounded-xl border border-dashed border-border bg-background/40 px-4 py-4">
              <p className="text-[12.5px] text-muted-foreground">
                Connect a wallet to receive test funds.
              </p>
              <ConnectButton />
            </div>
          )}

          {showFaucet && recipient && (
            <div className="mt-4 flex flex-col gap-3">
              <div className="rounded-xl border border-border bg-background/40 px-4 py-3">
                <Label className="text-[10.5px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  Recipient
                </Label>
                <p className="mt-1 break-all font-mono text-[12.5px] text-foreground">
                  {recipient}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <FaucetTile
                  title="1 devnet SOL"
                  subtitle="Pulled from Solana's public devnet faucet."
                  busy={solBusy}
                  onClick={handleAirdropSol}
                />
                <FaucetTile
                  title="100 mock USDC"
                  subtitle="Minted to your wallet's USDC ATA on devnet."
                  busy={usdcBusy}
                  onClick={handleAirdropUsdc}
                />
              </div>

              <p className="text-[11.5px] text-muted-foreground">
                Faucet limits: 1000 mock USDC per request, 5000 per wallet
                every 24 hours, 30s cooldown.
              </p>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function ClusterPill({ cluster }: { cluster: SolanaCluster }) {
  const palette: Record<SolanaCluster, string> = {
    "mainnet-beta":
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    devnet:
      "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    testnet:
      "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
    localnet:
      "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  };
  return (
    <span
      className={cn(
        "shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium tracking-tight",
        palette[cluster],
      )}
    >
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
}: {
  label: string;
  value: string;
  hint?: string;
  mono?: boolean;
  copy?: boolean;
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
        <span className="min-w-0 flex-1 truncate">{value}</span>
        {copy && (
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
        <p className="text-[11.5px] text-amber-600 dark:text-amber-400">
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
          ? "border-amber-500/50 bg-amber-500/30"
          : "border-border bg-muted",
      )}
    >
      <motion.span
        aria-hidden="true"
        animate={{ x: checked ? 22 : 2 }}
        transition={{ type: "spring", stiffness: 400, damping: 28 }}
        className={cn(
          "inline-block size-5 rounded-full bg-background shadow ring-1",
          checked ? "ring-amber-500/40" : "ring-border",
        )}
      />
    </button>
  );
}

function FaucetTile({
  title,
  subtitle,
  busy,
  onClick,
}: {
  title: string;
  subtitle: string;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-background/40 p-4">
      <div>
        <p className="text-[14px] font-medium tracking-tight">{title}</p>
        <p className="mt-1 text-[12.5px] text-muted-foreground">{subtitle}</p>
      </div>
      <FancyButton
        type="button"
        variant="neutral"
        size="md"
        disabled={busy}
        onClick={onClick}
      >
        {busy ? (
          <>
            <HugeiconsIcon
              icon={Loading03Icon}
              strokeWidth={2}
              className="animate-spin"
            />
            Requesting…
          </>
        ) : (
          "Request"
        )}
      </FancyButton>
    </div>
  );
}
