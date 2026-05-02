"use client";

import {
  ArrowDown01Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  ArrowUp01Icon,
  Calendar03Icon,
  Coins01Icon,
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

import { PageHeader } from "@/components/app-shell/page-header";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FancyButton } from "@/components/ui/fancy-button";
import { Input } from "@/components/ui/input";
import {
  formatBaseUnits,
  inferPaymentSource,
  migratePaymentRecords,
  type PaymentRecord,
  type PaymentSource,
} from "@/lib/cloak/payment-history";
import type { ReceivedTransaction } from "@/lib/cloak/scanned-history";
import { usePaymentHistory } from "@/lib/cloak/use-payment-history";
import { useScannedHistory } from "@/lib/cloak/use-scanned-history";
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
    received,
    status: scanStatus,
    progress: scanProgress,
    error: scanError,
    sync: runScan,
  } = useScannedHistory();
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
  }, [filter, query]);

  const sourceCounts = React.useMemo(() => {
    const counts = { pay: 0, payroll: 0, recurring: 0 };
    for (const r of records) counts[inferPaymentSource(r)] += 1;
    return counts;
  }, [records]);

  const groups = React.useMemo(
    () => buildGroups(records, received, filter),
    [records, received, filter],
  );

  const filteredGroups = React.useMemo(() => {
    if (!query) return groups;
    const q = query.toLowerCase();
    return groups.filter((g) => {
      if (g.kind === "single") return matches(g.record, q);
      if (g.kind === "batch") {
        if (g.batchId.toLowerCase().includes(q)) return true;
        return g.records.some((r) => matches(r, q));
      }
      return matchesReceived(g.tx, q);
    });
  }, [groups, query]);

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

  const pageCount = Math.max(1, Math.ceil(filteredGroups.length / PAGE_SIZE));
  // Clamp during render in case items disappeared (e.g., search narrowed),
  // without depending on an effect that would lag a frame behind.
  const safePage = Math.min(page, pageCount - 1);
  const pageStart = safePage * PAGE_SIZE;
  const pagedGroups = filteredGroups.slice(pageStart, pageStart + PAGE_SIZE);
  const showPagination = filteredGroups.length > PAGE_SIZE;

  return (
    <>
      <PageHeader
        eyebrow="Private ledger"
        title="History"
        description="Every payment you've sent through Nori. The chain sees a transaction. Only you see what's inside."
      />

      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10 sm:px-8">
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
            <FancyButton
              type="button"
              variant="neutral"
              size="md"
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
                className={cn(
                  scanStatus === "scanning" && "animate-spin",
                )}
              />
              <span className="text-[12.5px]">
                {scanStatus === "scanning" ? "Syncing" : "Sync received"}
              </span>
            </FancyButton>
          </div>
        </div>

        {scanStatus === "scanning" && scanProgress && (
          <p className="text-[11.5px] text-muted-foreground">{scanProgress}</p>
        )}
        {scanStatus === "error" && scanError && (
          <p className="text-[11.5px] text-destructive">
            Sync failed: {scanError.message}
          </p>
        )}

        <ul className="flex flex-col gap-2">
          {pagedGroups.map((g, i) =>
            g.kind === "single" ? (
              <SingleRow key={g.record.id} tx={g.record} index={i} />
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
                    : "No matches"}
              </p>
              <p className="text-[12px] text-muted-foreground">
                {records.length + received.length === 0
                  ? "Your sent payments will appear here after you make one on Pay. Click Sync received to scan for incoming payments."
                  : emptyForFilter
                    ? emptyHintFor(filter)
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
    </>
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
        <button
          type="button"
          onClick={onPrev}
          disabled={atStart}
          aria-label="Previous page"
          className={cn(
            "inline-flex size-8 items-center justify-center rounded-lg border border-border bg-card/40 transition-colors",
            atStart
              ? "text-muted-foreground/40"
              : "text-foreground hover:border-primary/30 hover:bg-card/70",
          )}
        >
          <HugeiconsIcon
            icon={ArrowLeft01Icon}
            size={14}
            strokeWidth={2}
          />
        </button>
        <span className="px-2 font-mono text-[11.5px] tabular-nums text-muted-foreground">
          {page + 1} / {pageCount}
        </span>
        <button
          type="button"
          onClick={onNext}
          disabled={atEnd}
          aria-label="Next page"
          className={cn(
            "inline-flex size-8 items-center justify-center rounded-lg border border-border bg-card/40 transition-colors",
            atEnd
              ? "text-muted-foreground/40"
              : "text-foreground hover:border-primary/30 hover:bg-card/70",
          )}
        >
          <HugeiconsIcon
            icon={ArrowRight01Icon}
            size={14}
            strokeWidth={2}
          />
        </button>
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
  counts: { pay: number; payroll: number; recurring: number };
  receivedCount: number;
}) {
  const totalAll =
    counts.pay + counts.payroll + counts.recurring + receivedCount;

  const countFor = (id: FilterId): number => {
    if (id === "all") return totalAll;
    if (id === "received") return receivedCount;
    return counts[id];
  };

  return (
    <div className="flex h-10 items-center gap-1 rounded-xl border border-border bg-input/60 p-1 sm:self-start">
      {FILTERS.map((f) => {
        const isActive = value === f.id;
        const count = countFor(f.id);
        return (
          <button
            key={f.id}
            type="button"
            onClick={() => onChange(f.id)}
            className={cn(
              "relative flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] font-medium transition-colors",
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
          </button>
        );
      })}
    </div>
  );
}

function DirChip({ direction }: { direction: "in" | "out" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-1.5 py-px font-mono text-[9.5px] font-medium uppercase leading-none tracking-[0.16em]",
        direction === "in"
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
          : "border-border bg-background/60 text-foreground/70",
      )}
    >
      {direction === "in" ? "In" : "Out"}
    </span>
  );
}

function TypeChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-background/40 px-1.5 py-px font-mono text-[9.5px] font-medium uppercase leading-none tracking-[0.16em] text-muted-foreground">
      {children}
    </span>
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
  const bySig = new Map<string, PaymentRecord[]>();
  for (const r of records) {
    const sig = r.batchId ?? r.depositSignature;
    const arr = bySig.get(sig);
    if (arr) arr.push(r);
    else bySig.set(sig, [r]);
  }

  const seen = new Set<string>();
  const groups: Group[] = [];
  for (const r of records) {
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
  return (
    r.recipient.toLowerCase().includes(q) ||
    r.depositSignature.toLowerCase().includes(q) ||
    r.withdrawSignature.toLowerCase().includes(q)
  );
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
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group flex w-full items-center gap-4 px-4 py-3.5 text-left"
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
        </button>
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
