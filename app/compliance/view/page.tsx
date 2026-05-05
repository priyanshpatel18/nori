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
import {
  hexToBytes,
  scanTransactions,
  toComplianceReport,
  type ComplianceReport,
} from "@cloak.dev/sdk";
import { useConnection } from "@solana/wallet-adapter-react";
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
import { cloakConfig } from "@/lib/cloak/config";
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
    <div className="min-h-svh bg-background">
      <Header />
      <Suspense fallback={<LoadingPanel />}>
        <Content />
      </Suspense>
    </div>
  );
}

function Header() {
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

function LoadingPanel() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-8">
      <div className="rounded-2xl border border-border bg-card/40 p-8 text-[13px] text-muted-foreground">
        Loading…
      </div>
    </main>
  );
}

function Content() {
  const searchParams = useSearchParams();
  const initial = React.useMemo(
    () => parseSearchParams(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );

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

  const canScan =
    typeof validatedNk === "string" &&
    validatedNk.length > 0 &&
    validatedWallet !== "";

  const { connection } = useConnection();
  const [report, setReport] = React.useState<ComplianceReport | null>(null);
  const [scanning, setScanning] = React.useState(false);
  const [progress, setProgress] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const inflight = React.useRef<AbortController | null>(null);

  const runScan = React.useCallback(async () => {
    if (!canScan || !validatedNk) return;

    inflight.current?.abort();
    const controller = new AbortController();
    inflight.current = controller;

    setReport(null);
    setError(null);
    setProgress("Fetching signatures…");
    setScanning(true);

    try {
      const nkBytes = hexToBytes(validatedNk);
      const result = await scanTransactions({
        connection,
        programId: cloakConfig.programId,
        viewingKeyNk: nkBytes,
        walletPublicKey: validatedWallet ?? undefined,
        afterTimestamp: dates.fromMs ?? undefined,
        beforeTimestamp: dates.toMs ?? undefined,
        onStatus: (status) => {
          if (controller.signal.aborted) return;
          setProgress(status);
        },
      });
      if (controller.signal.aborted) return;
      setReport(toComplianceReport(result));
      setProgress(null);
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(err instanceof Error ? err.message : String(err));
      setProgress(null);
    } finally {
      if (!controller.signal.aborted) setScanning(false);
    }
  }, [canScan, validatedNk, validatedWallet, dates, connection]);

  // Auto-run when arriving via a share URL. queueMicrotask defers the
  // setState chain out of the effect body.
  const autoRanRef = React.useRef(false);
  React.useEffect(() => {
    if (autoRanRef.current) return;
    if (initial.nk && canScan) {
      autoRanRef.current = true;
      queueMicrotask(() => void runScan());
    }
  }, [initial.nk, canScan, runScan]);

  React.useEffect(() => {
    return () => inflight.current?.abort();
  }, []);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-10 sm:px-8">
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex flex-col gap-4 rounded-2xl border border-border bg-card/60 p-6 sm:p-8"
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

      {report && <ReportPanel report={report} />}

      <p className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
        <HugeiconsIcon icon={LockIcon} size={12} strokeWidth={2} />
        Scan runs locally on {solanaConfig.cluster}. The viewing key never
        leaves this browser.
      </p>
    </main>
  );
}

function ReportPanel({ report }: { report: ComplianceReport }) {
  const { transactions, summary } = report;

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col gap-4 rounded-2xl border border-border bg-card/60 p-6 sm:p-8"
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Transactions" value={String(summary.transactionCount)} />
        <Stat label="Deposits" value={formatNumber(summary.totalDeposits)} />
        <Stat label="Withdrawals" value={formatNumber(summary.totalWithdrawals)} />
        <Stat label="Net change" value={formatNumber(summary.netChange)} />
      </div>

      <div className="flex flex-col">
        <div className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 border-b border-border px-1 pb-2 text-[10.5px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          <span>Type</span>
          <span>Counterparty</span>
          <span className="text-right">Amount</span>
          <span className="text-right">Time</span>
        </div>
        {transactions.length === 0 ? (
          <div className="px-1 py-8 text-center text-[12.5px] text-muted-foreground">
            No transactions in this range.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {transactions.map((tx) => (
              <li
                key={tx.signature ?? tx.commitment}
                className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 px-1 py-3 text-[13px]"
              >
                <TxTypeBadge type={tx.txType} />
                <Counterparty value={tx.recipient} signature={tx.signature} />
                <span className="text-right font-mono tabular-nums">
                  {formatTxAmount(tx)}
                </span>
                <span className="text-right font-mono text-[12px] tabular-nums text-muted-foreground">
                  {formatTime(tx.timestamp)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </motion.section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-background/40 p-3">
      <span className="text-[10.5px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </span>
      <span className="font-mono text-[15px] tabular-nums">{value}</span>
    </div>
  );
}

function TxTypeBadge({ type }: { type: string }) {
  const isDeposit = /deposit/i.test(type);
  const isWithdraw = /withdraw|swap/i.test(type);
  const Icon = isDeposit ? ArrowDownLeft01Icon : ArrowUpRight01Icon;
  const tone = isDeposit
    ? "text-primary"
    : isWithdraw
      ? "text-foreground"
      : "text-muted-foreground";
  return (
    <span className={cn("flex items-center gap-1.5", tone)}>
      <HugeiconsIcon icon={Icon} size={13} strokeWidth={2} />
      <span className="text-[12.5px] capitalize">{type.toLowerCase()}</span>
    </span>
  );
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

function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

function formatTxAmount(tx: ComplianceReport["transactions"][number]): string {
  const symbol = tx.symbol ?? "";
  const value = formatNumber(tx.amount);
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
