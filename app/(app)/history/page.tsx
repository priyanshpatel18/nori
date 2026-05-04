"use client";

import {
  ArrowDown01Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  ArrowUp01Icon,
  Calendar03Icon,
  Coins01Icon,
  Exchange01Icon,
  EyeIcon,
  Loading03Icon,
  Refresh01Icon,
  Search01Icon,
  UserMultipleIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { motion } from "motion/react";
import * as React from "react";

import { useWallet } from "@solana/wallet-adapter-react";

import { SolanaLogo, UsdcLogo, UsdtLogo } from "@/components/logos";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  formatBaseUnits,
  inferPaymentSource,
  migratePaymentRecords,
  type PaymentRecord,
  type PaymentSource,
} from "@/lib/cloak/payment-history";
import type {
  ReceivedTransaction,
  StoredScan,
} from "@/lib/cloak/scanned-history";
import { usePaymentHistory } from "@/lib/cloak/use-payment-history";
import {
  useScannedHistory,
  type ScanStatus,
} from "@/lib/cloak/use-scanned-history";
import { solanaConfig } from "@/lib/solana/config";
import { solscanTxUrl } from "@/lib/solana/explorer";
import { cn } from "@/lib/utils";

type Group =
  | { kind: "single"; record: PaymentRecord }
  | { kind: "batch"; batchId: string; records: PaymentRecord[] }
  | { kind: "received"; tx: ReceivedTransaction };

type FilterId = "all" | PaymentSource | "received";

const FILTERS: { id: FilterId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "pay", label: "Pay" },
  { id: "swap", label: "Swap" },
  { id: "payroll", label: "Payroll" },
  { id: "recurring", label: "Recurring" },
  { id: "received", label: "Received" },
];

const PAGE_SIZE = 5;

export default function HistoryPage() {
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<FilterId>("all");
  const [page, setPage] = React.useState(0);
  const { records, ready } = usePaymentHistory();
  const {
    scan,
    received,
    status: scanStatus,
    progress: scanProgress,
    error: scanError,
    sync: runScan,
    reset: resetScan,
  } = useScannedHistory();
  const [fromDate, setFromDate] = React.useState<string>("");
  const [toDate, setToDate] = React.useState<string>("");
  const wallet = useWallet();
  const sender = wallet.publicKey?.toBase58() ?? null;

  // One-time backfill per (wallet, cluster). Tags legacy records with a
  // `source` and coerces stringly-typed numeric fields so BigInt parsing
  // doesn't throw on older entries. Idempotent: subsequent loads no-op.
  React.useEffect(() => {
    if (!sender) return;
    migratePaymentRecords(sender, solanaConfig.cluster);
  }, [sender]);

  // Reset to first page whenever the visible result set changes shape.
  React.useEffect(() => {
    setPage(0);
  }, [filter, query, fromDate, toDate]);

  // Parse the date inputs once per render. `toDate` is treated as
  // inclusive — add 24h so the end-of-day boundary works as users expect.
  const fromMs = React.useMemo(() => {
    if (!fromDate) return Number.NEGATIVE_INFINITY;
    const t = Date.parse(fromDate);
    return Number.isFinite(t) ? t : Number.NEGATIVE_INFINITY;
  }, [fromDate]);
  const toMs = React.useMemo(() => {
    if (!toDate) return Number.POSITIVE_INFINITY;
    const t = Date.parse(toDate);
    return Number.isFinite(t) ? t + 86_400_000 : Number.POSITIVE_INFINITY;
  }, [toDate]);
  const dateActive =
    fromMs !== Number.NEGATIVE_INFINITY || toMs !== Number.POSITIVE_INFINITY;

  const sourceCounts = React.useMemo(() => {
    const counts = { pay: 0, payroll: 0, recurring: 0, swap: 0 };
    for (const r of records) counts[inferPaymentSource(r)] += 1;
    return counts;
  }, [records]);

  const tokenSummaries = React.useMemo(
    () => summarizeByToken(records, received),
    [records, received],
  );

  const groups = React.useMemo(
    () => buildGroups(records, received, filter),
    [records, received, filter],
  );

  const filteredGroups = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return groups.filter((g) => {
      const ts = groupTimestamp(g);
      if (ts < fromMs || ts >= toMs) return false;
      if (!q) return true;
      if (g.kind === "single") return matches(g.record, q);
      if (g.kind === "batch") {
        if (g.batchId.toLowerCase().includes(q)) return true;
        return g.records.some((r) => matches(r, q));
      }
      return matchesReceived(g.tx, q);
    });
  }, [groups, query, fromMs, toMs]);

  const visibleSourceCount =
    filter === "received"
      ? received.length
      : filter === "all"
        ? records.length + received.length
        : records.filter((r) => inferPaymentSource(r) === filter).length;

  const emptyForFilter =
    ready && records.length + received.length > 0 && visibleSourceCount === 0;

  const handleSync = React.useCallback(() => {
    runScan().catch(() => {
      // Error already surfaced via scanError.
    });
  }, [runScan]);

  const handleReset = React.useCallback(() => {
    resetScan().catch(() => {
      // Error already surfaced via scanError.
    });
  }, [resetScan]);

  const clearDateRange = React.useCallback(() => {
    setFromDate("");
    setToDate("");
  }, []);

  const pageCount = Math.max(1, Math.ceil(filteredGroups.length / PAGE_SIZE));
  // Clamp during render in case items disappeared (e.g., search narrowed),
  // without depending on an effect that would lag a frame behind.
  const safePage = Math.min(page, pageCount - 1);
  const pageStart = safePage * PAGE_SIZE;
  const pagedGroups = filteredGroups.slice(pageStart, pageStart + PAGE_SIZE);
  const showPagination = filteredGroups.length > PAGE_SIZE;

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] w-full flex-col overflow-hidden">
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24 }}
        className="flex items-center justify-between gap-4 border-b border-border px-4 py-3 sm:px-6"
      >
        <div className="min-w-0">
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-primary/80">
            Private ledger
          </p>
          <p className="mt-0.5 truncate text-[12.5px] text-muted-foreground">
            Every payment you've sent through Nori. The chain sees a transaction. Only you see what's inside.
          </p>
        </div>
      </motion.div>

      <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col gap-3 p-4 sm:p-6">
        <BalanceSummary summaries={tokenSummaries} />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <FilterTabs
            value={filter}
            onChange={setFilter}
            counts={sourceCounts}
            receivedCount={received.length}
          />
          <div className="flex items-center gap-2 sm:max-w-md">
            <div className="flex-1 sm:min-w-[16rem]">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search recipient or signature"
                leadingIcon={
                  <HugeiconsIcon
                    icon={Search01Icon}
                    size={14}
                    strokeWidth={1.8}
                  />
                }
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="default"
              onClick={handleSync}
              disabled={scanStatus === "scanning" || !sender}
              title={
                sender
                  ? "Scan the chain for payments received by this wallet"
                  : "Connect your wallet to sync received payments"
              }
            >
              <HugeiconsIcon
                icon={scanStatus === "scanning" ? Loading03Icon : Refresh01Icon}
                size={14}
                strokeWidth={1.8}
                className={cn(scanStatus === "scanning" && "animate-spin")}
              />
              {scanStatus === "scanning" ? "Syncing" : "Sync received"}
            </Button>
          </div>
        </div>

        <DateRangeBar
          from={fromDate}
          to={toDate}
          onFromChange={setFromDate}
          onToChange={setToDate}
          onClear={clearDateRange}
          active={dateActive}
        />

        <ScanStatusBar
          scan={scan}
          status={scanStatus}
          progress={scanProgress}
          error={scanError}
          onReset={handleReset}
        />

        <ul className="scrollbar-cloak flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
          {pagedGroups.map((g, i) =>
            g.kind === "single" ? (
              g.record.swap ? (
                <SwapRow key={g.record.id} tx={g.record} index={i} />
              ) : (
                <SingleRow key={g.record.id} tx={g.record} index={i} />
              )
            ) : g.kind === "batch" ? (
              <BatchRow
                key={g.batchId}
                batchId={g.batchId}
                rows={g.records}
                index={i}
              />
            ) : (
              <ReceivedRow
                key={`recv-${g.tx.signature ?? g.tx.commitment}`}
                tx={g.tx}
                index={i}
              />
            ),
          )}

          {ready && filteredGroups.length === 0 && (
            <motion.li
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className="grid place-items-center gap-2 rounded-xl border border-dashed border-border bg-card/30 px-6 py-12 text-center"
            >
              <HugeiconsIcon
                icon={Coins01Icon}
                size={20}
                strokeWidth={1.6}
                className="text-muted-foreground"
              />
              <p className="text-[13.5px] text-foreground">
                {records.length + received.length === 0
                  ? "No private payments yet"
                  : emptyForFilter
                    ? `No ${filterLabel(filter).toLowerCase()} payments yet`
                    : dateActive
                      ? "No payments in this date range"
                      : "No matches"}
              </p>
              <p className="text-[12px] text-muted-foreground">
                {records.length + received.length === 0
                  ? "Your sent payments will appear here after you make one on Pay. Click Sync received to scan for incoming payments."
                  : emptyForFilter
                    ? emptyHintFor(filter)
                    : dateActive
                      ? "Widen the date range or clear it to see more results."
                      : "Try a different filter or clear your search."}
              </p>
            </motion.li>
          )}
        </ul>

        {showPagination && (
          <Pagination
            page={safePage}
            pageCount={pageCount}
            pageStart={pageStart}
            pageEnd={Math.min(pageStart + PAGE_SIZE, filteredGroups.length)}
            total={filteredGroups.length}
            onPrev={() => setPage((p) => Math.max(0, p - 1))}
            onNext={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
          />
        )}
      </div>
    </div>
  );
}

function Pagination({
  page,
  pageCount,
  pageStart,
  pageEnd,
  total,
  onPrev,
  onNext,
}: {
  page: number;
  pageCount: number;
  pageStart: number;
  pageEnd: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  const atStart = page === 0;
  const atEnd = page >= pageCount - 1;

  return (
    <div className="flex items-center justify-between gap-3 pt-1">
      <p className="text-[11.5px] text-muted-foreground">
        <span className="font-mono text-foreground/80">
          {pageStart + 1}–{pageEnd}
        </span>{" "}
        of <span className="font-mono text-foreground/80">{total}</span>
      </p>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          onClick={onPrev}
          disabled={atStart}
          aria-label="Previous page"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} size={14} strokeWidth={2} />
        </Button>
        <span className="px-2 font-mono text-[11.5px] tabular-nums text-muted-foreground">
          {page + 1} / {pageCount}
        </span>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          onClick={onNext}
          disabled={atEnd}
          aria-label="Next page"
        >
          <HugeiconsIcon icon={ArrowRight01Icon} size={14} strokeWidth={2} />
        </Button>
      </div>
    </div>
  );
}

function filterLabel(id: FilterId): string {
  return FILTERS.find((f) => f.id === id)?.label ?? "All";
}

function emptyHintFor(id: FilterId): string {
  switch (id) {
    case "pay":
      return "Single payments from /pay land here.";
    case "payroll":
      return "CSV roster runs from /payroll land here.";
    case "recurring":
      return "Scheduled team payments land here once they run.";
    case "received":
      return "Click Sync received to scan the chain for payments to this wallet.";
    default:
      return "Try a different filter or clear your search.";
  }
}

function FilterTabs({
  value,
  onChange,
  counts,
  receivedCount,
}: {
  value: FilterId;
  onChange: (id: FilterId) => void;
  counts: { pay: number; payroll: number; recurring: number; swap: number };
  receivedCount: number;
}) {
  const totalAll =
    counts.pay + counts.payroll + counts.recurring + counts.swap + receivedCount;

  const countFor = (id: FilterId): number => {
    if (id === "all") return totalAll;
    if (id === "received") return receivedCount;
    return counts[id];
  };

  return (
    <div className="flex h-9 items-center gap-1 rounded-xl border border-border bg-input/60 p-1 sm:self-start">
      {FILTERS.map((f) => {
        const isActive = value === f.id;
        const count = countFor(f.id);
        return (
          <Button
            key={f.id}
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => onChange(f.id)}
            className={cn(
              // Override the variant defaults: the active indicator is a
              // motion-animated pill underneath, so we want no hover bg
              // and a normal-cased label.
              "relative h-7 rounded-lg px-2.5 text-[12px] font-medium hover:bg-transparent",
              isActive
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {isActive && (
              <motion.span
                layoutId="history-filter-active"
                aria-hidden="true"
                className="absolute inset-0 -z-0 rounded-lg border border-primary/30 bg-primary/15"
                transition={{
                  type: "spring",
                  stiffness: 380,
                  damping: 30,
                }}
              />
            )}
            <span className="relative z-10">{f.label}</span>
            <span
              className={cn(
                "relative z-10 font-mono text-[10.5px] tabular-nums",
                isActive ? "text-primary" : "text-muted-foreground/70",
              )}
            >
              {count}
            </span>
          </Button>
        );
      })}
    </div>
  );
}

function DateRangeBar({
  from,
  to,
  onFromChange,
  onToChange,
  onClear,
  active,
}: {
  from: string;
  to: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  onClear: () => void;
  active: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Label
        htmlFor="history-from"
        className="font-mono text-[11px] uppercase tracking-[0.16em] text-foreground/60"
      >
        Range
      </Label>
      <Input
        id="history-from"
        type="date"
        value={from}
        max={to || undefined}
        onChange={(e) => onFromChange(e.target.value)}
        aria-label="From date"
        className="h-9 w-[10.5rem] px-2.5"
      />
      <span className="text-[11px] text-muted-foreground/60">→</span>
      <Input
        id="history-to"
        type="date"
        value={to}
        min={from || undefined}
        onChange={(e) => onToChange(e.target.value)}
        aria-label="To date"
        className="h-9 w-[10.5rem] px-2.5"
      />
      {active && (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={onClear}
          className="font-mono uppercase tracking-[0.14em]"
        >
          Clear
        </Button>
      )}
    </div>
  );
}

function ScanStatusBar({
  scan,
  status,
  progress,
  error,
  onReset,
}: {
  scan: StoredScan | null;
  status: ScanStatus;
  progress: string | null;
  error: Error | null;
  onReset: () => void;
}) {
  if (status === "scanning" && progress) {
    return (
      <p className="text-[11.5px] text-muted-foreground">{progress}</p>
    );
  }
  if (status === "error" && error) {
    return (
      <p className="text-[11.5px] text-destructive">
        Sync failed: {error.message}
      </p>
    );
  }
  if (!scan) return null;
  const cursor = scan.report.lastSignature
    ? `${scan.report.lastSignature.slice(0, 4)}…${scan.report.lastSignature.slice(-4)}`
    : "—";
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
      <span>Synced {formatRelative(scan.scannedAt)}</span>
      <span className="text-muted-foreground/60">·</span>
      <span className="font-mono">
        {scan.report.transactions.length} cached
      </span>
      <span className="text-muted-foreground/60">·</span>
      <span className="font-mono" title="Incremental scan cursor (lastSignature)">
        cursor {cursor}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="xs"
        onClick={onReset}
        className="ml-1 font-mono uppercase tracking-[0.14em]"
      >
        Reset cache
      </Button>
    </div>
  );
}

function formatRelative(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
  return `${Math.round(diff / 86_400_000)}d ago`;
}

type TokenSummary = {
  mint: string;
  symbol: string;
  decimals: number;
  inflow: bigint;
  outflow: bigint;
  count: number;
};

function summarizeByToken(
  records: PaymentRecord[],
  received: ReceivedTransaction[],
): TokenSummary[] {
  const map = new Map<string, TokenSummary>();

  const upsert = (
    mint: string,
    symbol: string,
    decimals: number,
  ): TokenSummary => {
    const existing = map.get(mint);
    if (existing) {
      // Prefer the first non-empty symbol we've seen (scan rows sometimes
      // ship empty symbols). Decimals should be stable per mint.
      if (!existing.symbol && symbol) existing.symbol = symbol;
      return existing;
    }
    const entry: TokenSummary = {
      mint,
      symbol,
      decimals,
      inflow: 0n,
      outflow: 0n,
      count: 0,
    };
    map.set(mint, entry);
    return entry;
  };

  for (const r of records) {
    if (!r.mint) continue;
    const e = upsert(r.mint, r.token, r.decimals);
    try {
      // amountRaw is gross — what actually left the wallet — so use it
      // (not netRaw) for the user's running outflow. The fee is the
      // difference between the two.
      e.outflow += BigInt(r.amountRaw);
    } catch {
      // ignore malformed legacy records
    }
    e.count += 1;
  }

  for (const tx of received) {
    // For swaps, attribute the inflow to the output mint the user actually
    // received. For deposits / withdraws / transfers, fall back to `mint`.
    const mint = (tx.outputMint ?? tx.mint ?? "").trim();
    if (!mint) continue;
    const symbol = (tx.outputSymbol ?? tx.symbol ?? "").trim();
    const decimals = tx.decimals ?? 9;
    const e = upsert(mint, symbol, decimals);
    try {
      e.inflow += BigInt(String(tx.netAmount));
    } catch {
      // ignore
    }
    e.count += 1;
  }

  return Array.from(map.values()).sort((a, b) => {
    // Largest absolute net first, then by tx count.
    const netA = a.inflow - a.outflow;
    const netB = b.inflow - b.outflow;
    const absA = netA < 0n ? -netA : netA;
    const absB = netB < 0n ? -netB : netB;
    if (absA !== absB) return absB > absA ? 1 : -1;
    return b.count - a.count;
  });
}

function BalanceSummary({ summaries }: { summaries: TokenSummary[] }) {
  if (summaries.length === 0) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-wrap items-center gap-1.5"
    >
      {summaries.map((s) => {
        const net = s.inflow - s.outflow;
        const netSign = net > 0n ? "+" : net < 0n ? "−" : "";
        const netAbs = net < 0n ? -net : net;
        const netStr = formatBaseUnits(netAbs.toString(), s.decimals);
        const inStr = formatBaseUnits(s.inflow.toString(), s.decimals);
        const outStr = formatBaseUnits(s.outflow.toString(), s.decimals);
        const symbolLabel = s.symbol || shortMint(s.mint);
        return (
          <Badge
            key={s.mint}
            variant="default"
            title={`In ${inStr} · Out ${outStr} · ${s.count} tx${s.count === 1 ? "" : "s"}`}
            className="gap-1.5 py-1 pl-1 pr-2.5 text-[11.5px] tracking-normal normal-case transition-colors hover:border-primary/30 hover:bg-card/70"
          >
            <TokenLogo
              mint={s.mint}
              symbol={s.symbol}
              className="size-4 shrink-0"
            />
            <span className="font-mono font-medium uppercase tracking-[0.14em] text-foreground/80">
              {symbolLabel}
            </span>
            <span
              className={cn(
                "font-mono tabular-nums",
                net > 0n
                  ? "text-emerald-400"
                  : net < 0n
                    ? "text-foreground"
                    : "text-muted-foreground",
              )}
            >
              {netSign}
              {netStr}
            </span>
            <span className="font-mono text-[10px] text-muted-foreground/70">
              {s.count}
            </span>
          </Badge>
        );
      })}
    </motion.div>
  );
}

function shortMint(mint: string): string {
  if (mint.length <= 8) return mint;
  return `${mint.slice(0, 4)}…${mint.slice(-4)}`;
}

// Bundled token logos. Cloak's mock-USDC on devnet shares the USDC logo so
// the dashboard reads the same across clusters.
const NATIVE_SOL = "So11111111111111111111111111111111111111112";
const USDC_MINTS = new Set<string>([
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // mainnet USDC
  "61ro7AExqfk4dZYoCyRzTahahCC2TdUUZ4M5epMPunJf", // devnet mock USDC
]);
const USDT_MINTS = new Set<string>([
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", // mainnet USDT
]);

function TokenLogo({
  mint,
  symbol,
  className,
}: {
  mint: string;
  symbol: string;
  className?: string;
}) {
  if (mint === NATIVE_SOL || symbol.toUpperCase() === "SOL") {
    return <SolanaLogo className={className} />;
  }
  if (USDC_MINTS.has(mint) || symbol.toUpperCase() === "USDC") {
    return <UsdcLogo className={className} />;
  }
  if (USDT_MINTS.has(mint) || symbol.toUpperCase() === "USDT") {
    return <UsdtLogo className={className} />;
  }
  // Unknown token: fall back to the symbol's first letter on a neutral disc.
  const letter = (symbol || mint || "?").charAt(0).toUpperCase();
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid place-items-center rounded-full border border-border bg-background/60 font-mono text-[9px] font-semibold uppercase text-foreground/70",
        className,
      )}
    >
      {letter}
    </span>
  );
}

function DirChip({ direction }: { direction: "in" | "out" }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "px-1.5 py-px font-mono text-[9.5px] tracking-[0.16em]",
        direction === "in"
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
          : "border-border bg-background/60 text-foreground/70",
      )}
    >
      {direction === "in" ? "In" : "Out"}
    </Badge>
  );
}

function TypeChip({ children }: { children: React.ReactNode }) {
  return (
    <Badge
      variant="default"
      className="border-border bg-background/40 px-1.5 py-px font-mono text-[9.5px] tracking-[0.16em] text-muted-foreground"
    >
      {children}
    </Badge>
  );
}

function txTypeLabel(txType: string): string {
  switch (txType) {
    case "deposit":
      return "Deposit";
    case "withdraw":
      return "Withdraw";
    case "transfer":
      return "Transfer";
    case "swap":
      return "Swap";
    default:
      return "Unknown";
  }
}

function buildGroups(
  records: PaymentRecord[],
  received: ReceivedTransaction[],
  filter: FilterId,
): Group[] {
  const sourceFiltered =
    filter === "all" || filter === "received"
      ? records
      : records.filter((r) => inferPaymentSource(r) === filter);

  const outgoingGroups: Group[] =
    filter === "received" ? [] : groupOutgoing(sourceFiltered);

  const receivedGroups: Group[] =
    filter === "all" || filter === "received"
      ? received.map((tx) => ({ kind: "received", tx }) satisfies Group)
      : [];

  const merged = [...outgoingGroups, ...receivedGroups];
  merged.sort((a, b) => groupTimestamp(b) - groupTimestamp(a));
  return merged;
}

function groupOutgoing(records: PaymentRecord[]): Group[] {
  // Group by deposit signature. Any sig that appears more than once is a
  // payroll batch (one batch deposit, N recipients sharing it). Sig that
  // appears once is a single /pay row. This works for both old records
  // (no batchId field) and new records (where batchId === depositSignature).
  // Swaps are always single rows — never grouped, even if they coincidentally
  // share a deposit signature.
  const swaps: PaymentRecord[] = [];
  const grouped: PaymentRecord[] = [];
  for (const r of records) {
    if (r.swap) swaps.push(r);
    else grouped.push(r);
  }

  const bySig = new Map<string, PaymentRecord[]>();
  for (const r of grouped) {
    const sig = r.batchId ?? r.depositSignature;
    const arr = bySig.get(sig);
    if (arr) arr.push(r);
    else bySig.set(sig, [r]);
  }

  const seen = new Set<string>();
  const groups: Group[] = [];
  for (const r of grouped) {
    const sig = r.batchId ?? r.depositSignature;
    if (seen.has(sig)) continue;
    seen.add(sig);
    const bucket = bySig.get(sig)!;
    if (bucket.length > 1) {
      groups.push({ kind: "batch", batchId: sig, records: bucket });
    } else {
      groups.push({ kind: "single", record: bucket[0] });
    }
  }
  for (const r of swaps) {
    groups.push({ kind: "single", record: r });
  }
  return groups;
}

function groupTimestamp(g: Group): number {
  if (g.kind === "single") return g.record.timestamp;
  if (g.kind === "received") return g.tx.timestamp;
  return g.records.reduce(
    (max, r) => (r.timestamp > max ? r.timestamp : max),
    0,
  );
}

function matches(r: PaymentRecord, q: string): boolean {
  if (
    r.recipient.toLowerCase().includes(q) ||
    r.depositSignature.toLowerCase().includes(q) ||
    r.withdrawSignature.toLowerCase().includes(q)
  ) {
    return true;
  }
  if (r.swap) {
    if (r.swap.swapSignature.toLowerCase().includes(q)) return true;
    if (r.swap.settlementSignature?.toLowerCase().includes(q)) return true;
    if (r.swap.outputToken.toLowerCase().includes(q)) return true;
  }
  return false;
}

function matchesReceived(tx: ReceivedTransaction, q: string): boolean {
  return (
    tx.recipient.toLowerCase().includes(q) ||
    (tx.signature?.toLowerCase().includes(q) ?? false) ||
    tx.commitment.toLowerCase().includes(q)
  );
}

function SingleRow({ tx, index }: { tx: PaymentRecord; index: number }) {
  const sigShort = `${tx.depositSignature.slice(0, 4)}…${tx.depositSignature.slice(-4)}`;
  const recipientShort = `${tx.recipient.slice(0, 4)}…${tx.recipient.slice(-4)}`;
  const formattedNet = formatBaseUnits(tx.netRaw, tx.decimals);
  const dateLabel = formatDate(tx.timestamp);
  const payoutUrl = solscanTxUrl(tx.withdrawSignature);

  return (
    <motion.li
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        delay: 0.05 + Math.min(index, 8) * 0.04,
        duration: 0.28,
        ease: [0.22, 1, 0.36, 1],
      }}
      className="group flex items-center gap-4 rounded-xl border border-border bg-card/40 px-4 py-3.5 transition-colors hover:border-primary/30 hover:bg-card/70"
    >
      <div className="grid size-9 shrink-0 place-items-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
        <HugeiconsIcon icon={ArrowUp01Icon} size={14} strokeWidth={2} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-mono text-[13px] text-foreground">
            {recipientShort}
          </p>
          <span className="hidden font-mono text-[10.5px] text-muted-foreground sm:inline">
            {sigShort}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <span>{dateLabel}</span>
          <DirChip direction="out" />
          <TypeChip>Pay</TypeChip>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className="font-mono text-[13.5px] text-foreground">
            −{formattedNet}{" "}
            <span className="text-muted-foreground">{tx.token}</span>
          </p>
          <p className="text-[11px] text-muted-foreground">Settled</p>
        </div>
        <a
          href={payoutUrl}
          target="_blank"
          rel="noreferrer"
          className="text-muted-foreground transition-colors hover:text-primary"
          aria-label="Open payout transaction on Solscan"
          title="Open payout transaction on Solscan"
        >
          <HugeiconsIcon icon={EyeIcon} size={15} strokeWidth={1.8} />
        </a>
      </div>
    </motion.li>
  );
}

function SwapRow({ tx, index }: { tx: PaymentRecord; index: number }) {
  const swap = tx.swap!;
  const sigForLink = swap.settlementSignature ?? swap.swapSignature;
  const sigShort = `${sigForLink.slice(0, 4)}…${sigForLink.slice(-4)}`;
  const sellFormatted = formatBaseUnits(tx.amountRaw, tx.decimals);
  const buyFormatted = formatBaseUnits(swap.outAmountRaw, swap.outputDecimals);
  const dateLabel = formatDate(tx.timestamp);
  const settled = swap.settlementSignature !== null;

  return (
    <motion.li
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        delay: 0.05 + Math.min(index, 8) * 0.04,
        duration: 0.28,
        ease: [0.22, 1, 0.36, 1],
      }}
      className="group flex items-center gap-4 rounded-xl border border-border bg-card/40 px-4 py-3.5 transition-colors hover:border-primary/30 hover:bg-card/70"
    >
      <div className="grid size-9 shrink-0 place-items-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
        <HugeiconsIcon icon={Exchange01Icon} size={14} strokeWidth={2} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-mono text-[13px] text-foreground">
            {tx.token} → {swap.outputToken}
          </p>
          <span className="hidden font-mono text-[10.5px] text-muted-foreground sm:inline">
            {sigShort}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <span>{dateLabel}</span>
          <DirChip direction="out" />
          <TypeChip>Swap</TypeChip>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className="font-mono text-[13.5px] text-foreground">
            −{sellFormatted}{" "}
            <span className="text-muted-foreground">{tx.token}</span>
          </p>
          <p className="font-mono text-[12px] text-emerald-400">
            +{buyFormatted}{" "}
            <span className="text-muted-foreground">{swap.outputToken}</span>
          </p>
          <p className="text-[11px] text-muted-foreground">
            {settled ? "Settled" : "Pending settlement"}
          </p>
        </div>
        <a
          href={solscanTxUrl(sigForLink)}
          target="_blank"
          rel="noreferrer"
          className="text-muted-foreground transition-colors hover:text-primary"
          aria-label="Open swap transaction on Solscan"
          title="Open swap transaction on Solscan"
        >
          <HugeiconsIcon icon={EyeIcon} size={15} strokeWidth={1.8} />
        </a>
      </div>
    </motion.li>
  );
}

function ReceivedRow({
  tx,
  index,
}: {
  tx: ReceivedTransaction;
  index: number;
}) {
  const recipientShort = `${tx.recipient.slice(0, 4)}…${tx.recipient.slice(-4)}`;
  const sigShort = tx.signature
    ? `${tx.signature.slice(0, 4)}…${tx.signature.slice(-4)}`
    : null;
  const decimals = tx.decimals ?? 9;
  const symbol = tx.symbol ?? "";
  const formattedNet = formatBaseUnits(String(tx.netAmount), decimals);
  const dateLabel = formatDate(tx.timestamp);
  const explorerUrl = tx.signature ? solscanTxUrl(tx.signature) : null;

  return (
    <motion.li
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        delay: 0.05 + Math.min(index, 8) * 0.04,
        duration: 0.28,
        ease: [0.22, 1, 0.36, 1],
      }}
      className="group flex items-center gap-4 rounded-xl border border-border bg-card/40 px-4 py-3.5 transition-colors hover:border-primary/30 hover:bg-card/70"
    >
      <div className="grid size-9 shrink-0 place-items-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
        <HugeiconsIcon icon={ArrowDown01Icon} size={14} strokeWidth={2} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-mono text-[13px] text-foreground">
            {recipientShort}
          </p>
          {sigShort && (
            <span className="hidden font-mono text-[10.5px] text-muted-foreground sm:inline">
              {sigShort}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <span>{dateLabel}</span>
          <DirChip direction="in" />
          <TypeChip>{txTypeLabel(tx.txType)}</TypeChip>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className="font-mono text-[13.5px] text-emerald-400">
            +{formattedNet}{" "}
            <span className="text-muted-foreground">{symbol}</span>
          </p>
          <p className="text-[11px] text-muted-foreground">Settled</p>
        </div>
        {explorerUrl && (
          <a
            href={explorerUrl}
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground transition-colors hover:text-primary"
            aria-label="Open transaction on Solscan"
            title="Open transaction on Solscan"
          >
            <HugeiconsIcon icon={EyeIcon} size={15} strokeWidth={1.8} />
          </a>
        )}
      </div>
    </motion.li>
  );
}

function BatchRow({
  batchId,
  rows,
  index,
}: {
  batchId: string;
  rows: PaymentRecord[];
  index: number;
}) {
  const [open, setOpen] = React.useState(false);
  const head = rows[0];
  const decimals = head.decimals;
  const token = head.token;

  let totalNet = 0n;
  let totalAmount = 0n;
  for (const r of rows) {
    try {
      totalNet += BigInt(r.netRaw);
      totalAmount += BigInt(r.amountRaw);
    } catch {
      // ignore
    }
  }

  const newest = rows.reduce(
    (max, r) => (r.timestamp > max ? r.timestamp : max),
    0,
  );
  const dateLabel = formatDate(newest);
  const sigShort = `${batchId.slice(0, 4)}…${batchId.slice(-4)}`;
  const depositUrl = solscanTxUrl(batchId);
  const isRecurring = inferPaymentSource(head) === "recurring";
  const batchLabel = isRecurring ? "Recurring" : "Payroll";

  return (
    <>
      <motion.li
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          delay: 0.05 + Math.min(index, 8) * 0.04,
          duration: 0.28,
          ease: [0.22, 1, 0.36, 1],
        }}
        className="overflow-hidden rounded-xl border border-border bg-card/40 transition-colors hover:border-primary/30 hover:bg-card/70"
      >
        <Button
          type="button"
          variant="ghost"
          onClick={() => setOpen(true)}
          // The whole row is the click target — override variant defaults
          // (h-9, rounded-4xl, centered, no border) so it fills the card.
          className="group flex h-auto w-full items-center justify-start gap-4 rounded-none px-4 py-3.5 text-left hover:bg-transparent"
        >
          <div className="grid size-9 shrink-0 place-items-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
            <HugeiconsIcon
              icon={isRecurring ? Calendar03Icon : UserMultipleIcon}
              size={14}
              strokeWidth={1.8}
            />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-[13.5px] font-medium text-foreground">
                {batchLabel} · {rows.length} recipient
                {rows.length === 1 ? "" : "s"}
              </p>
              <span className="hidden font-mono text-[10.5px] text-muted-foreground sm:inline">
                {sigShort}
              </span>
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted-foreground">
              <span>{dateLabel}</span>
              <DirChip direction="out" />
              <TypeChip>{batchLabel}</TypeChip>
              <span className="text-muted-foreground/70">
                · Show recipients
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="font-mono text-[13.5px] text-foreground">
                −{formatBaseUnits(totalNet.toString(), decimals)}{" "}
                <span className="text-muted-foreground">{token}</span>
              </p>
              <p className="text-[11px] text-muted-foreground">View</p>
            </div>
          </div>
        </Button>
      </motion.li>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {batchLabel} · {rows.length} recipient
              {rows.length === 1 ? "" : "s"}
            </DialogTitle>
            <DialogDescription>
              {dateLabel} · Batch deposit{" "}
              <a
                href={depositUrl}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-foreground/80 underline underline-offset-2"
              >
                {sigShort} ↗
              </a>
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background/40 px-3 py-2 text-[11.5px] text-muted-foreground">
            <span className="font-mono">
              Gross {formatBaseUnits(totalAmount.toString(), decimals)} {token}
            </span>
            <span className="font-mono">
              Net −{formatBaseUnits(totalNet.toString(), decimals)} {token}
            </span>
          </div>

          <ul className="max-h-[320px] divide-y divide-border overflow-y-auto rounded-lg border border-border">
            {rows.map((r) => {
              const recipientShort = `${r.recipient.slice(0, 4)}…${r.recipient.slice(-4)}`;
              const formattedNet = formatBaseUnits(r.netRaw, r.decimals);
              const payoutUrl = solscanTxUrl(r.withdrawSignature);
              return (
                <li
                  key={r.id}
                  className="flex items-center gap-4 px-4 py-2.5"
                >
                  <span className="font-mono text-[12.5px] text-foreground/90">
                    {recipientShort}
                  </span>
                  <span className="ml-auto font-mono text-[12.5px] text-foreground/90">
                    −{formattedNet}{" "}
                    <span className="text-muted-foreground">{r.token}</span>
                  </span>
                  <a
                    href={payoutUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-muted-foreground transition-colors hover:text-primary"
                    aria-label="Open payout transaction on Solscan"
                    title="Open payout transaction on Solscan"
                  >
                    <HugeiconsIcon
                      icon={EyeIcon}
                      size={14}
                      strokeWidth={1.8}
                    />
                  </a>
                </li>
              );
            })}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}

function formatDate(ms: number): string {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "·";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
