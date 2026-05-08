"use client";

import {
  ArrowUpRight01Icon,
  CheckmarkCircle01Icon,
  Copy01Icon,
  Loading03Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useWallet } from "@solana/wallet-adapter-react";
import * as React from "react";

import { PageHeader } from "@/components/app-shell/page-header";
import { AmountInput } from "@/components/cloak/amount-input";
import { SolanaLogo, UsdcLogo } from "@/components/logos";
import { ConnectButton } from "@/components/solana/connect-button";
import { Button } from "@/components/ui/button";
import { FancyButton } from "@/components/ui/fancy-button";
import { markSolClaimed } from "@/lib/cloak/faucet-claimed";
import { signalTourAction } from "@/lib/cloak/tour";
import { useFaucetSolClaimed } from "@/lib/cloak/use-faucet-claimed";
import { solanaConfig } from "@/lib/solana/config";
import { solscanTxUrl } from "@/lib/solana/explorer";
import { useSolBalance } from "@/lib/solana/hooks/use-sol-balance";
import {
  airdropDevnetMockUsdc,
  claimDevnetSol,
  MOCK_USDC_COOLDOWN_SECONDS,
  MOCK_USDC_MAX_PER_REQUEST,
  MOCK_USDC_MAX_PER_WALLET_24H,
  SOL_DROP_AMOUNT,
  SOLANA_PUBLIC_FAUCET_URL,
  type FaucetMintResult,
  type SolFaucetResult,
} from "@/lib/solana/faucet";
import { toast, toastPromise } from "@/lib/toast";
import { cn } from "@/lib/utils";

const USDC_PRESETS = [10, 100, 500, 1_000];

type ClaimEntry = {
  id: string;
  token: "SOL" | "USDC";
  amount: number;
  signature?: string;
  explorer?: string;
  ts: number;
};

export default function FaucetPage() {
  const wallet = useWallet();
  const recipient = wallet.publicKey?.toBase58() ?? "";

  const isDevnet = solanaConfig.cluster === "devnet";

  const [usdcAmount, setUsdcAmount] = React.useState("100");
  const [usdcBusy, setUsdcBusy] = React.useState(false);
  const [solBusy, setSolBusy] = React.useState(false);
  // Persisted in localStorage per cluster, so "already claimed" survives
  // reloads. The DB ledger remains authoritative, this is purely a UX
  // shortcut to avoid showing an enabled button that would 409 on click.
  const solAlreadyClaimed = useFaucetSolClaimed(recipient || null);
  const [claims, setClaims] = React.useState<ClaimEntry[]>([]);

  function recordClaim(entry: ClaimEntry) {
    setClaims((prev) => [entry, ...prev].slice(0, 5));
  }

  // If the wallet already holds devnet SOL, signal the tour to skip the
  // SOL-claim step. The signal is a no-op when the tour is on any other
  // step (or no tour is active), so the check is safe to run on every
  // balance update without coupling this page to tour state.
  const solBalance = useSolBalance(recipient || null);
  const balanceLamports =
    solBalance.status === "success" ? solBalance.lamports : null;
  React.useEffect(() => {
    if (!recipient) return;
    if (balanceLamports === null) return;
    if (balanceLamports > 0n) {
      signalTourAction(recipient, "sol-claimed");
    }
  }, [recipient, balanceLamports]);

  async function handleUsdc() {
    if (!recipient || usdcBusy) return;
    const amount = Number(usdcAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter a valid amount.");
      return;
    }
    setUsdcBusy(true);
    try {
      const result: FaucetMintResult = await toastPromise(
        airdropDevnetMockUsdc(recipient, amount),
        {
          loading: `Minting ${amount} mock USDC…`,
          success: `Minted ${amount} mock USDC.`,
          error: (err) =>
            err instanceof Error
              ? `Faucet failed: ${err.message}`
              : "Faucet failed.",
        },
      );
      recordClaim({
        id: `${result.signature}-${Date.now()}`,
        token: "USDC",
        amount,
        signature: result.signature,
        explorer: result.explorer ?? solscanTxUrl(result.signature),
        ts: Date.now(),
      });
      if (recipient) signalTourAction(recipient, "usdc-minted");
    } catch {
      /* error already toasted */
    } finally {
      setUsdcBusy(false);
    }
  }

  async function handleSol() {
    if (!recipient || solBusy || solAlreadyClaimed) return;
    setSolBusy(true);
    try {
      const result: SolFaucetResult = await toastPromise(
        claimDevnetSol(recipient),
        {
          loading: `Claiming ${SOL_DROP_AMOUNT} devnet SOL…`,
          success: `Sent ${SOL_DROP_AMOUNT} devnet SOL.`,
          error: (err) =>
            err instanceof Error
              ? `Claim failed: ${err.message}`
              : "Claim failed.",
        },
      );
      recordClaim({
        id: `${result.signature}-${Date.now()}`,
        token: "SOL",
        amount: result.sol,
        signature: result.signature,
        explorer: result.explorer ?? solscanTxUrl(result.signature),
        ts: Date.now(),
      });
      markSolClaimed(recipient, solanaConfig.cluster);
      signalTourAction(recipient, "sol-claimed");
    } catch (err) {
      const status =
        err && typeof err === "object" && "status" in err
          ? (err as { status?: number }).status
          : undefined;
      if (status === 409) {
        markSolClaimed(recipient, solanaConfig.cluster);
        // Treat "already claimed" as a satisfied step: the wallet does in
        // fact have devnet SOL from a previous claim, so the tour should
        // move on rather than stall on a button the user can't press.
        signalTourAction(recipient, "sol-claimed");
      }
    } finally {
      setSolBusy(false);
    }
  }

  async function handleSolFallback() {
    if (!recipient) return;
    try {
      await navigator.clipboard.writeText(recipient);
    } catch {
      /* clipboard unavailable, user can paste manually */
    }
    window.open(SOLANA_PUBLIC_FAUCET_URL, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        eyebrow="Devnet"
        title="Faucet"
        description="Pull test funds straight to a Solana devnet wallet. Mock USDC mints in-app, devnet SOL airdrops through a backend RPC."
      />

      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 p-4 sm:p-6 lg:gap-5 lg:p-7">
        {!isDevnet && (
          <div className="rounded-2xl border border-dashed border-border bg-card/40 p-5 text-[13px] text-muted-foreground">
            The faucet is devnet only. Switch to devnet from{" "}
            <a
              href="/settings"
              className="underline underline-offset-2 hover:text-foreground"
            >
              Settings
            </a>{" "}
            (or enable demo mode) to unlock test funds.
          </div>
        )}

        <RecipientStrip
          recipient={recipient}
          connected={wallet.connected}
        />

        <div className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5">
          <FaucetCard
            disabled={!isDevnet}
            logo={<UsdcLogo className="size-7" />}
            title="Mock USDC"
            subtitle="Nori's devnet faucet mints 6-decimal mock USDC straight to your USDC ATA."
          >
            {!recipient ? (
              <ConnectPanel />
            ) : (
              <>
                <div className="flex flex-col gap-2">
                  <label
                    htmlFor="usdc-amount"
                    className="text-[10.5px] font-medium uppercase tracking-[0.18em] text-muted-foreground"
                  >
                    Amount
                  </label>
                  <div className="flex items-center gap-2 rounded-xl border border-border bg-background/40 px-3 py-2 focus-within:border-foreground/30">
                    <AmountInput
                      id="usdc-amount"
                      value={usdcAmount}
                      onValueChange={setUsdcAmount}
                      decimals={6}
                      placeholder="100"
                      className="flex-1 border-0 bg-transparent p-0 text-[18px] focus-visible:ring-0"
                    />
                    <span className="text-[12.5px] font-medium text-muted-foreground">
                      USDC
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {USDC_PRESETS.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setUsdcAmount(String(p))}
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-[11.5px] font-medium tracking-tight transition-colors",
                          Number(usdcAmount) === p
                            ? "border-foreground/30 bg-foreground/5 text-foreground"
                            : "border-border bg-card/40 text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>

                <FancyButton
                  type="button"
                  variant="primary"
                  size="lg"
                  disabled={usdcBusy || !isDevnet}
                  onClick={handleUsdc}
                  data-tour="usdc-mint"
                  className="w-full"
                >
                  {usdcBusy ? (
                    <>
                      <HugeiconsIcon
                        icon={Loading03Icon}
                        strokeWidth={2}
                        className="animate-spin"
                      />
                      Minting…
                    </>
                  ) : (
                    `Mint ${usdcAmount || "0"} mock USDC`
                  )}
                </FancyButton>

                <p className="text-[11.5px] leading-5 text-muted-foreground">
                  Limits: {MOCK_USDC_MAX_PER_REQUEST.toLocaleString()} per
                  request, {MOCK_USDC_MAX_PER_WALLET_24H.toLocaleString()} per
                  wallet / 24h, {MOCK_USDC_COOLDOWN_SECONDS}s cooldown.
                </p>
              </>
            )}
          </FaucetCard>

          <FaucetCard
            disabled={!isDevnet}
            logo={<SolanaLogo className="size-7" />}
            title="Devnet SOL"
            subtitle={`Cloak's treasury sends a one-time ${SOL_DROP_AMOUNT} SOL drop to cover transaction fees on devnet.`}
          >
            {!recipient ? (
              <ConnectPanel />
            ) : (
              <>
                <div className="rounded-xl border border-border bg-background/40 px-3 py-3">
                  <p className="text-[10.5px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                    Drop
                  </p>
                  <p className="mt-1 font-mono text-[18px] text-foreground">
                    {SOL_DROP_AMOUNT} SOL
                  </p>
                  <p className="mt-1 text-[11.5px] text-muted-foreground">
                    Each wallet can claim once. Need more? Top up via the
                    official faucet.
                  </p>
                </div>

                <FancyButton
                  type="button"
                  variant="primary"
                  size="lg"
                  disabled={solBusy || !isDevnet || solAlreadyClaimed}
                  onClick={handleSol}
                  data-tour="sol-claim"
                  className="w-full"
                >
                  {solBusy ? (
                    <>
                      <HugeiconsIcon
                        icon={Loading03Icon}
                        strokeWidth={2}
                        className="animate-spin"
                      />
                      Sending…
                    </>
                  ) : solAlreadyClaimed ? (
                    "Already claimed"
                  ) : (
                    `Claim ${SOL_DROP_AMOUNT} devnet SOL`
                  )}
                </FancyButton>

                <p className="text-[11.5px] leading-5 text-muted-foreground">
                  Backed up?{" "}
                  <button
                    type="button"
                    onClick={handleSolFallback}
                    className="underline underline-offset-2 hover:text-foreground"
                  >
                    Use the official faucet
                  </button>
                  .
                </p>
              </>
            )}
          </FaucetCard>
        </div>

        {claims.length > 0 && (
          <RecentClaims claims={claims} />
        )}
      </div>
    </div>
  );
}

function RecipientStrip({
  recipient,
  connected,
}: {
  recipient: string;
  connected: boolean;
}) {
  const [copied, setCopied] = React.useState(false);

  async function handleCopy() {
    if (!recipient) return;
    try {
      await navigator.clipboard.writeText(recipient);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card/40 p-3 sm:px-4">
      <div className="flex min-w-0 items-center gap-3">
        <span className="rounded-full border border-border/60 bg-card/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Recipient
        </span>
        {connected && recipient ? (
          <span className="min-w-0 truncate font-mono text-[12.5px] text-foreground">
            {recipient}
          </span>
        ) : (
          <span className="text-[12.5px] text-muted-foreground">
            No wallet connected.
          </span>
        )}
      </div>
      {connected && recipient ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={handleCopy}
          aria-label="Copy recipient address"
        >
          <HugeiconsIcon
            icon={copied ? CheckmarkCircle01Icon : Copy01Icon}
            strokeWidth={2}
          />
        </Button>
      ) : (
        <ConnectButton />
      )}
    </div>
  );
}

function FaucetCard({
  logo,
  title,
  subtitle,
  disabled,
  children,
}: {
  logo: React.ReactNode;
  title: string;
  subtitle: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "flex flex-col gap-4 rounded-2xl border border-border bg-card/40 p-5 sm:p-6",
        disabled && "opacity-60",
      )}
    >
      <header className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-border bg-background/40">
          {logo}
        </span>
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
          <p className="mt-1 text-[12.5px] leading-5 text-muted-foreground">
            {subtitle}
          </p>
        </div>
      </header>
      <div className="flex flex-1 flex-col gap-3">{children}</div>
    </section>
  );
}

function ConnectPanel() {
  return (
    <div className="flex flex-1 flex-col items-start justify-center gap-3 rounded-xl border border-dashed border-border bg-background/40 px-4 py-6">
      <p className="text-[12.5px] text-muted-foreground">
        Connect a wallet to use the faucet.
      </p>
      <ConnectButton />
    </div>
  );
}

function RecentClaims({ claims }: { claims: ClaimEntry[] }) {
  return (
    <section className="rounded-2xl border border-border bg-card/40 p-4 sm:p-5">
      <header className="flex items-center justify-between gap-3">
        <h3 className="text-[13px] font-semibold tracking-tight">
          Recent claims
        </h3>
        <span className="text-[10.5px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          This session
        </span>
      </header>
      <ul className="mt-3 flex flex-col divide-y divide-border/60">
        {claims.map((c) => (
          <li
            key={c.id}
            className="flex items-center justify-between gap-3 py-2.5 text-[12.5px]"
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="grid size-6 place-items-center rounded-full border border-border bg-background/40">
                {c.token === "USDC" ? (
                  <UsdcLogo className="size-4" />
                ) : (
                  <SolanaLogo className="size-4" />
                )}
              </span>
              <span className="font-mono text-foreground">
                {c.token === "USDC"
                  ? `${c.amount.toLocaleString()} mock USDC`
                  : "Devnet SOL claim"}
              </span>
              <span className="text-muted-foreground">
                · {formatRelative(c.ts)}
              </span>
            </div>
            {c.explorer ? (
              <a
                href={c.explorer}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[12px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                View
                <HugeiconsIcon
                  icon={ArrowUpRight01Icon}
                  strokeWidth={2}
                  className="size-3"
                />
              </a>
            ) : (
              <span className="text-[11.5px] text-muted-foreground">
                via faucet.solana.com
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 5_000) return "just now";
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return new Date(ts).toLocaleTimeString();
}
