"use client";

import {
  ArrowDownLeft01Icon,
  ArrowUpRight01Icon,
  Cancel01Icon,
  EyeIcon,
  KeyIcon,
  Link01Icon,
  LockIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type ComplianceReport } from "@cloak.dev/sdk";
import { PublicKey } from "@solana/web3.js";
import { motion } from "motion/react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import * as React from "react";
import { Suspense } from "react";

import { NoriWordmark } from "@/components/logos";
import { FancyButton } from "@/components/ui/fancy-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resolveDecimals, resolveSymbol } from "@/lib/cloak/known-mints";
import {
  decodeSentHistory,
  type AuditorSentEntry,
} from "@/lib/cloak/viewing-keys";
import { solanaConfig } from "@/lib/solana/config";
import { solscanTxUrl } from "@/lib/solana/explorer";
import { cn } from "@/lib/utils";

const NK_HEX_RE = /^[0-9a-fA-F]{64}$/;

type ParsedParams = {
  nk: string | null;
  wallet: string | null;
  from: string | null;
  to: string | null;
};

function parseSearchParams(sp: URLSearchParams): ParsedParams {
  const get = (k: string): string | null => {
    const raw = sp.get(k);
    return raw && raw.trim() ? raw.trim() : null;
  };
  return {
    nk: get("nk"),
    wallet: get("wallet"),
    from: get("from"),
    to: get("to"),
  };
}

export default function ComplianceViewPage() {
  return (
    <div className="flex h-svh flex-col bg-background">
      <Header />
      <Suspense fallback={<LoadingPanel />}>
        <Content />
      </Suspense>
    </div>
  );
}

export type HydratedShare = {
  nk: string;
  wallet: string;
  from: string;
  to: string;
  sent: AuditorSentEntry[];
  cluster?: "mainnet-beta" | "devnet";
};

export function Header() {
  return (
    <header className="border-b border-border bg-background/70 backdrop-blur-sm">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-8">
        <Link
          href="/"
          aria-label="nori home"
          className="flex items-center gap-2 text-foreground"
        >
          <NoriWordmark className="h-5 w-auto" />
        </Link>
        <span className="flex items-center gap-1.5 rounded-full border border-border bg-card/60 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          <HugeiconsIcon icon={EyeIcon} size={12} strokeWidth={2} />
          Auditor view
        </span>
      </div>
    </header>
  );
}

export function LoadingPanel() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-8">
      <div className="rounded-2xl border border-border bg-card/40 p-8 text-[13px] text-muted-foreground">
        Loading…
      </div>
    </main>
  );
}

export function Content({ hydrated }: { hydrated?: HydratedShare } = {}) {
  const searchParams = useSearchParams();
  const initial = React.useMemo<ParsedParams>(() => {
    if (hydrated) {
      return {
        nk: hydrated.nk || null,
        wallet: hydrated.wallet || null,
        from: hydrated.from || null,
        to: hydrated.to || null,
      };
    }
    return parseSearchParams(new URLSearchParams(searchParams.toString()));
  }, [hydrated, searchParams]);

  const [nkInput, setNkInput] = React.useState(initial.nk ?? "");
  const [walletInput, setWalletInput] = React.useState(initial.wallet ?? "");
  const [fromInput, setFromInput] = React.useState(initial.from ?? "");
  const [toInput, setToInput] = React.useState(initial.to ?? "");

  const validatedNk = React.useMemo(() => {
    const trimmed = nkInput.trim();
    if (!trimmed) return null;
    return NK_HEX_RE.test(trimmed) ? trimmed.toLowerCase() : "";
  }, [nkInput]);

  const validatedWallet = React.useMemo(() => {
    const trimmed = walletInput.trim();
    if (!trimmed) return null;
    try {
      new PublicKey(trimmed);
      return trimmed;
    } catch {
      return "";
    }
  }, [walletInput]);

  const dates = React.useMemo(() => {
    const fromMs = parseDate(fromInput);
    const toMs = parseDate(toInput);
    return { fromMs, toMs };
  }, [fromInput, toInput]);

  // The auditor scan runs server-side via /api/scan-received: the public
  // RPC pool the auditor's browser would otherwise hit is rate-limited
  // enough to fail on real wallets. The wallet pubkey is the only required
  // input; nk is kept for forward compatibility (e.g. viewing-key-only
  // mode) but not currently sent on the wire.
  const canScan = validatedWallet !== null && validatedWallet !== "";

  const scanCluster: "mainnet-beta" | "devnet" =
    hydrated?.cluster ??
    (solanaConfig.cluster === "mainnet-beta" ? "mainnet-beta" : "devnet");

  const [report, setReport] = React.useState<ComplianceReport | null>(null);
  const [scanning, setScanning] = React.useState(false);
  const [progress, setProgress] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const inflight = React.useRef<AbortController | null>(null);

  const runScan = React.useCallback(async () => {
    if (!canScan || !validatedWallet) return;

    inflight.current?.abort();
    const controller = new AbortController();
    inflight.current = controller;

    setReport(null);
    setError(null);
    setProgress("Fetching transactions…");
    setScanning(true);

    try {
      const res = await fetch("/api/scan-received", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet: validatedWallet,
          cluster: scanCluster,
        }),
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if (!res.ok) {
        let detail = `Scan failed (${res.status}).`;
        try {
          const json = (await res.json()) as { error?: string };
          if (json?.error) detail = json.error;
        } catch {
          // ignore
        }
        throw new Error(detail);
      }
      const json = (await res.json()) as { report: ComplianceReport };
      if (controller.signal.aborted) return;
      setReport(json.report);
      setProgress(null);
    } catch (err) {
      if (controller.signal.aborted) return;
      if ((err as { name?: string }).name === "AbortError") return;
      setError(err instanceof Error ? err.message : String(err));
      setProgress(null);
    } finally {
      if (!controller.signal.aborted) setScanning(false);
    }
  }, [canScan, validatedWallet, scanCluster]);

  // Auto-run when arriving via a share URL. queueMicrotask defers the
  // setState chain out of the effect body.
  const autoRanRef = React.useRef(false);
  React.useEffect(() => {
    if (autoRanRef.current) return;
    if (canScan && (initial.nk || initial.wallet)) {
      autoRanRef.current = true;
      queueMicrotask(() => void runScan());
    }
  }, [initial.nk, initial.wallet, canScan, runScan]);

  React.useEffect(() => {
    return () => inflight.current?.abort();
  }, []);

  // Outbound private transfers reach the auditor either via a server-stored
  // payload (short share id) or — for legacy direct URLs — via the hash
  // fragment. Hydrated payload wins when present.
  const [embeddedSent, setEmbeddedSent] = React.useState<AuditorSentEntry[]>(
    hydrated?.sent ?? [],
  );
  React.useEffect(() => {
    if (hydrated) return;
    if (typeof window === "undefined") return;
    const raw = window.location.hash.replace(/^#/, "");
    if (!raw) return;
    const params = new URLSearchParams(raw);
    const encoded = params.get("h");
    if (!encoded) return;
    setEmbeddedSent(decodeSentHistory(encoded));
  }, [hydrated]);

  const mergedReport = React.useMemo(
    () => mergeSentIntoReport(report, embeddedSent, dates.fromMs, dates.toMs),
    [report, embeddedSent, dates],
  );

  return (
    <main className="mx-auto flex w-full max-w-5xl min-h-0 flex-1 flex-col gap-4 px-4 py-6 sm:px-8 sm:py-8">
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex shrink-0 flex-col gap-4 rounded-2xl border border-border bg-card/60 p-5 sm:p-6"
      >
        <div className="flex items-start gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
            <HugeiconsIcon icon={KeyIcon} size={16} strokeWidth={1.6} />
          </div>
          <div className="min-w-0">
            <h1 className="text-[16px] font-medium tracking-tight text-foreground">
              Read-only audit view
            </h1>
            <p className="text-[12.5px] text-muted-foreground">
              Paste a viewing key (nk) and the issuer wallet to reconstruct
              the ledger. The chain still sees nothing; this scan happens
              in your browser using the issued secret.
            </p>
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void runScan();
          }}
          className="flex flex-col gap-4"
          noValidate
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nk">Viewing key (nk)</Label>
            <Input
              id="nk"
              placeholder="64-char hex"
              autoComplete="off"
              spellCheck={false}
              value={nkInput}
              onChange={(e) => setNkInput(e.target.value)}
              invalid={validatedNk === ""}
              className="font-mono text-[12.5px]"
            />
            {validatedNk === "" && (
              <p className="text-[11.5px] text-destructive">
                Must be exactly 64 hex characters.
              </p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-[1.4fr_1fr_1fr]">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wallet">Issuer wallet (optional)</Label>
              <Input
                id="wallet"
                placeholder="Solana address"
                autoComplete="off"
                spellCheck={false}
                value={walletInput}
                onChange={(e) => setWalletInput(e.target.value)}
                invalid={validatedWallet === ""}
                className="font-mono text-[12.5px]"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="from">From</Label>
              <Input
                id="from"
                type="date"
                value={fromInput}
                onChange={(e) => setFromInput(e.target.value)}
                max={toInput || undefined}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="to">To</Label>
              <Input
                id="to"
                type="date"
                value={toInput}
                onChange={(e) => setToInput(e.target.value)}
                min={fromInput || undefined}
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <FancyButton
              type="submit"
              variant="primary"
              size="lg"
              disabled={!canScan || scanning}
              aria-busy={scanning || undefined}
            >
              <HugeiconsIcon icon={EyeIcon} size={14} strokeWidth={2} />
              {scanning ? "Scanning…" : report ? "Rescan" : "Run audit"}
            </FancyButton>
            {(nkInput || walletInput || fromInput || toInput) && (
              <button
                type="button"
                onClick={() => {
                  setNkInput("");
                  setWalletInput("");
                  setFromInput("");
                  setToInput("");
                  setReport(null);
                  setError(null);
                }}
                className="flex items-center gap-1 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
              >
                <HugeiconsIcon icon={Cancel01Icon} size={12} strokeWidth={2} />
                Clear
              </button>
            )}
          </div>

          {progress && (
            <p className="rounded-xl border border-border bg-background/50 px-3 py-2.5 text-[12.5px] text-muted-foreground">
              {progress}
            </p>
          )}
          {error && (
            <p
              role="alert"
              className="rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-2.5 text-[13px] text-destructive"
            >
              {error}
            </p>
          )}
        </form>
      </motion.section>

      {mergedReport && <ReportPanel report={mergedReport} />}

      <p className="flex shrink-0 items-center gap-2 text-[11.5px] text-muted-foreground">
        <HugeiconsIcon icon={LockIcon} size={12} strokeWidth={2} />
        Scan reads public on-chain transfers on {scanCluster}. Sent rows are
        hydrated from the share payload; the viewing key stays in your
        browser.
      </p>
    </main>
  );
}

const PAGE_SIZE = 10;

type TokenRollup = {
  mint: string;
  symbol: string;
  decimals: number;
  inflow: number;
  outflow: number;
  count: number;
};

function isOutgoingType(t: string): boolean {
  return t === "deposit" || t === "send-transfer" || t === "send-swap";
}


function rollupByToken(transactions: ReportTransaction[]): TokenRollup[] {
  const map = new Map<string, TokenRollup>();
  for (const tx of transactions) {
    const mint = (tx.outputMint ?? tx.mint ?? "").trim() || "(unknown)";
    const symbol = resolveSymbol(mint, tx.outputSymbol ?? tx.symbol);
    const decimals = resolveDecimals(mint, tx.decimals) ?? 9;
    let row = map.get(mint);
    if (!row) {
      row = { mint, symbol, decimals, inflow: 0, outflow: 0, count: 0 };
      map.set(mint, row);
    }
    if (!row.symbol && symbol) row.symbol = symbol;
    if (isOutgoingType(tx.txType)) row.outflow += tx.amount;
    else row.inflow += tx.amount;
    row.count += 1;
  }
  return Array.from(map.values()).sort((a, b) => {
    return b.inflow + b.outflow - (a.inflow + a.outflow);
  });
}

function ReportPanel({ report }: { report: ComplianceReport }) {
  const { transactions } = report;
  const [page, setPage] = React.useState(0);

  const rollups = React.useMemo(() => rollupByToken(transactions), [transactions]);

  const totalPages = Math.max(1, Math.ceil(transactions.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const start = safePage * PAGE_SIZE;
  const visible = transactions.slice(start, start + PAGE_SIZE);
  const showingFrom = transactions.length === 0 ? 0 : start + 1;
  const showingTo = Math.min(start + PAGE_SIZE, transactions.length);

  React.useEffect(() => {
    setPage(0);
  }, [transactions]);

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex min-h-0 flex-1 flex-col gap-4 rounded-2xl border border-border bg-card/60 p-5 sm:p-6"
    >
      <div className="flex shrink-0 items-baseline justify-between gap-3">
        <h2 className="text-[14.5px] font-medium tracking-tight text-foreground">
          Activity by token
        </h2>
        <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
          {transactions.length} {transactions.length === 1 ? "tx" : "txs"}
        </span>
      </div>

      {rollups.length === 0 ? (
        <div className="shrink-0 rounded-xl border border-dashed border-border bg-background/30 px-3 py-4 text-center text-[12px] text-muted-foreground">
          No on-chain activity in this range.
        </div>
      ) : (
        <div className="grid shrink-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {rollups.map((r) => (
            <TokenCard key={r.mint} rollup={r} />
          ))}
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-background/40">
        <div className="hidden grid-cols-[auto_1fr_auto_auto] items-center gap-3 border-b border-border px-3 py-2 text-[10.5px] font-medium uppercase tracking-[0.18em] text-muted-foreground sm:grid">
          <span>Type</span>
          <span>Counterparty</span>
          <span className="text-right">Amount</span>
          <span className="text-right">Time</span>
        </div>
        <ul className="scrollbar-cloak flex min-h-0 flex-1 flex-col divide-y divide-border overflow-y-auto">
          {visible.length === 0 ? (
            <li className="px-3 py-8 text-center text-[12.5px] text-muted-foreground">
              No transactions in this range.
            </li>
          ) : (
            visible.map((tx) => (
              <li
                key={tx.signature ?? tx.commitment}
                className="flex flex-col gap-1.5 px-3 py-3 text-[13px] sm:grid sm:grid-cols-[auto_1fr_auto_auto] sm:items-center sm:gap-3"
              >
                <div className="flex items-center justify-between gap-3 sm:contents">
                  <TxTypeBadge type={tx.txType} />
                  <span className="font-mono tabular-nums sm:hidden">
                    {formatTxAmount(tx)}
                  </span>
                </div>
                <div className="flex min-w-0 items-center justify-between gap-3 sm:contents">
                  <Counterparty value={tx.recipient} signature={tx.signature} />
                  <span className="hidden text-right font-mono tabular-nums sm:inline">
                    {formatTxAmount(tx)}
                  </span>
                  <span className="text-right font-mono text-[11.5px] tabular-nums text-muted-foreground sm:text-[12px]">
                    {formatTime(tx.timestamp)}
                  </span>
                </div>
              </li>
            ))
          )}
        </ul>
      </div>

      {transactions.length > PAGE_SIZE && (
        <div className="flex shrink-0 items-center justify-between gap-3 text-[12px] text-muted-foreground">
          <span className="font-mono tabular-nums">
            {showingFrom}–{showingTo} of {transactions.length}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={safePage === 0}
              className="rounded-md border border-border bg-background/60 px-2.5 py-1 text-[12px] text-foreground transition-colors hover:border-primary/30 disabled:cursor-not-allowed disabled:opacity-50"
            >
              ← Prev
            </button>
            <span className="font-mono text-[11px] tabular-nums">
              {safePage + 1}/{totalPages}
            </span>
            <button
              type="button"
              onClick={() =>
                setPage((p) => Math.min(totalPages - 1, p + 1))
              }
              disabled={safePage >= totalPages - 1}
              className="rounded-md border border-border bg-background/60 px-2.5 py-1 text-[12px] text-foreground transition-colors hover:border-primary/30 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </motion.section>
  );
}

function TokenCard({ rollup }: { rollup: TokenRollup }) {
  const symbol = rollup.symbol || "TOKEN";
  const inStr = formatBaseAmount(rollup.inflow, rollup.decimals);
  const outStr = formatBaseAmount(rollup.outflow, rollup.decimals);
  const net = rollup.inflow - rollup.outflow;
  const netStr = formatBaseAmount(Math.abs(net), rollup.decimals);
  const netSign = net > 0 ? "+" : net < 0 ? "−" : "";
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-background/40 px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[11.5px] uppercase tracking-[0.16em] text-foreground">
          {symbol}
        </span>
        <span className="font-mono text-[10.5px] text-muted-foreground tabular-nums">
          {rollup.count} {rollup.count === 1 ? "tx" : "txs"}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-1 text-[11.5px]">
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            In
          </span>
          <span
            className={cn(
              "truncate font-mono tabular-nums",
              rollup.inflow > 0 ? "text-emerald-400" : "text-foreground/55",
            )}
            title={`+${inStr} ${symbol}`}
          >
            {rollup.inflow > 0 ? "+" : ""}
            {inStr}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Out
          </span>
          <span
            className="truncate font-mono tabular-nums text-foreground/85"
            title={`−${outStr} ${symbol}`}
          >
            {rollup.outflow > 0 ? "−" : ""}
            {outStr}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Net
          </span>
          <span
            className={cn(
              "truncate font-mono tabular-nums",
              net > 0 ? "text-emerald-400" : net < 0 ? "text-foreground" : "text-foreground/55",
            )}
            title={`${netSign}${netStr} ${symbol}`}
          >
            {netSign}
            {netStr}
          </span>
        </div>
      </div>
    </div>
  );
}

function TxTypeBadge({ type }: { type: string }) {
  const isSend = type === "send-transfer" || type === "send-swap";
  const isDeposit = /deposit/i.test(type);
  const isOutgoing = isDeposit || isSend;
  const Icon = isOutgoing ? ArrowUpRight01Icon : ArrowDownLeft01Icon;
  const label = txLabel(type);
  const tone = isSend
    ? "text-foreground"
    : isDeposit
      ? "text-foreground"
      : "text-primary";
  return (
    <span className={cn("flex items-center gap-1.5", tone)}>
      <HugeiconsIcon icon={Icon} size={13} strokeWidth={2} />
      <span className="text-[12.5px]">{label}</span>
    </span>
  );
}

function txLabel(type: string): string {
  switch (type) {
    case "deposit":
      return "Deposit";
    case "withdraw":
      return "Withdraw";
    case "transfer":
      return "Transfer";
    case "swap":
      return "Swap";
    case "send-transfer":
      return "Sent";
    case "send-swap":
      return "Swap (sent)";
    default:
      return type
        ? type.charAt(0).toUpperCase() + type.slice(1).toLowerCase()
        : "Unknown";
  }
}

function Counterparty({
  value,
  signature,
}: {
  value: string;
  signature?: string;
}) {
  if (!value) {
    return signature ? (
      <a
        href={solscanTxUrl(signature)}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 font-mono text-[12px] text-muted-foreground hover:text-foreground"
      >
        <HugeiconsIcon icon={Link01Icon} size={11} strokeWidth={2} />
        {truncate(signature)}
      </a>
    ) : (
      <span className="font-mono text-[12px] text-muted-foreground">n/a</span>
    );
  }
  return (
    <span className="font-mono text-[12.5px] text-foreground">
      {truncate(value)}
    </span>
  );
}

function parseDate(value: string): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

// Format a base-unit integer (as the SDK returns) into a human decimal
// string. Falls back to BigInt for safe handling of large lamport values.
function formatBaseAmount(amount: number, decimals: number): string {
  if (!Number.isFinite(amount) || amount === 0) return "0";
  const negative = amount < 0;
  const abs = Math.abs(Math.round(amount));
  let display: string;
  try {
    const n = BigInt(abs);
    const base = BigInt(10) ** BigInt(Math.max(0, decimals));
    const whole = n / base;
    const frac = n % base;
    if (frac === 0n) {
      display = whole.toLocaleString();
    } else {
      const fracStr = frac
        .toString()
        .padStart(decimals, "0")
        .replace(/0+$/, "");
      display = `${whole.toLocaleString()}.${fracStr}`;
    }
  } catch {
    display = (abs / 10 ** decimals).toString();
  }
  return negative ? `-${display}` : display;
}

function formatTxAmount(tx: ComplianceReport["transactions"][number]): string {
  const mint = (tx.outputMint ?? tx.mint ?? "").trim();
  const symbol = resolveSymbol(mint, tx.outputSymbol ?? tx.symbol);
  const decimals = resolveDecimals(mint, tx.decimals) ?? 9;
  const value = formatBaseAmount(tx.amount, decimals);
  return symbol ? `${value} ${symbol}` : value;
}

function formatTime(ms: number): string {
  if (!ms) return "n/a";
  const d = new Date(ms);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function truncate(s: string): string {
  if (s.length <= 12) return s;
  return `${s.slice(0, 6)}…${s.slice(-4)}`;
}

type ReportTransaction = ComplianceReport["transactions"][number];

function rawToNumber(raw: string): number {
  // amountRaw / netRaw on PaymentRecord are already base-unit integer
  // strings (e.g. "1500000" for 1.5 USDC). Keep them as base units so they
  // line up with the SDK's `tx.amount` convention; format-on-render handles
  // decimals.
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function sentEntryToTransaction(e: AuditorSentEntry): ReportTransaction {
  const amount = rawToNumber(e.amountRaw);
  const net = rawToNumber(e.netRaw);
  // Tag with synthetic types so the badge can render them as outgoing,
  // distinct from the SDK's "transfer"/"swap" which mean *received*.
  const txType = e.txType === "swap" ? "send-swap" : "send-transfer";
  return {
    txType,
    amount,
    fee: Math.max(0, amount - net),
    netAmount: net,
    runningBalance: 0,
    timestamp: e.timestamp,
    recipient: e.recipient,
    commitment: `pay-${e.id}`,
    signature: e.signature,
    mint: e.mint,
    decimals: e.decimals,
    symbol: e.symbol,
    outputMint: e.outputMint,
    outputSymbol: e.outputSymbol,
  };
}

function mergeSentIntoReport(
  report: ComplianceReport | null,
  sent: AuditorSentEntry[],
  fromMs: number | null,
  toMs: number | null,
): ComplianceReport | null {
  if (!report) return null;

  const lo = fromMs ?? Number.NEGATIVE_INFINITY;
  const hi = toMs !== null ? toMs + 86_400_000 : Number.POSITIVE_INFINITY;
  const dateActive =
    lo !== Number.NEGATIVE_INFINITY || hi !== Number.POSITIVE_INFINITY;

  // Server scan returns the full window; apply the auditor's date filter
  // here so the date pickers behave the same as the rest of the dashboard.
  const scanInRange = dateActive
    ? report.transactions.filter(
        (tx) => tx.timestamp >= lo && tx.timestamp < hi,
      )
    : report.transactions;

  const sentInRange = sent.filter(
    (e) => e.timestamp >= lo && e.timestamp < hi,
  );

  const seen = new Set<string>();
  for (const tx of scanInRange) {
    const key = tx.signature ?? tx.commitment;
    if (key) seen.add(key);
  }
  const freshSent = sentInRange
    .map(sentEntryToTransaction)
    .filter((tx) => {
      const key = tx.signature ?? tx.commitment;
      return key ? !seen.has(key) : true;
    });

  const merged = [...freshSent, ...scanInRange].sort(
    (a, b) => b.timestamp - a.timestamp,
  );

  let totalDeposits = 0;
  let totalWithdrawals = 0;
  let totalFees = 0;
  for (const tx of merged) {
    if (tx.txType === "deposit") {
      totalDeposits += tx.amount;
    } else {
      totalWithdrawals += tx.amount;
      totalFees += tx.fee;
    }
  }

  return {
    ...report,
    transactions: merged,
    summary: {
      ...report.summary,
      totalDeposits,
      totalWithdrawals,
      totalFees,
      netChange: totalDeposits - totalWithdrawals,
      transactionCount: merged.length,
      finalBalance: totalDeposits - totalWithdrawals,
    },
  };
}
