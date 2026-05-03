"use client";

import {
  ArrowRight01Icon,
  ArrowUpRight01Icon,
  Copy01Icon,
  Download01Icon,
  EyeIcon,
  KeyIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { motion } from "motion/react";
import * as React from "react";

import { SolanaLogo, UsdcLogo, UsdtLogo } from "@/components/logos";
import { FancyButton } from "@/components/ui/fancy-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  buildComplianceCsv,
  csvFilename,
  downloadCsv,
} from "@/lib/cloak/compliance-export";
import {
  formatBaseUnits,
  type PaymentRecord,
} from "@/lib/cloak/payment-history";
import type { ReceivedTransaction } from "@/lib/cloak/scanned-history";
import { usePaymentHistory } from "@/lib/cloak/use-payment-history";
import { useScannedHistory } from "@/lib/cloak/use-scanned-history";
import { solscanAddressUrl, solscanTxUrl } from "@/lib/solana/explorer";
import { cn } from "@/lib/utils";

const KEYS: { id: string; auditor: string; range: string; status: "active" | "revoked" }[] = [
  {
    id: "vk_2A8…91Fc",
    auditor: "Trail of Bits",
    range: "Jan 1 – Mar 31, 2026",
    status: "active",
  },
  {
    id: "vk_71D…04Ae",
    auditor: "Internal · Finance",
    range: "Q1 2026",
    status: "active",
  },
  {
    id: "vk_5C0…8b22",
    auditor: "Withum tax filing",
    range: "FY 2025",
    status: "revoked",
  },
];

export default function CompliancePage() {
  const { records } = usePaymentHistory();
  const { scan, received } = useScannedHistory();

  // YYYY-MM-DD strings — empty = unbounded. Shared between the issue-key
  // form (where the auditor's window is picked) and the summary preview
  // above (so the user sees exactly what the auditor would see).
  const [fromDate, setFromDate] = React.useState<string>("");
  const [toDate, setToDate] = React.useState<string>("");

  const fromMs = React.useMemo(() => {
    if (!fromDate) return Number.NEGATIVE_INFINITY;
    const t = Date.parse(fromDate);
    return Number.isFinite(t) ? t : Number.NEGATIVE_INFINITY;
  }, [fromDate]);
  const toMs = React.useMemo(() => {
    if (!toDate) return Number.POSITIVE_INFINITY;
    const t = Date.parse(toDate);
    // Treat the picker's "to" as inclusive of that whole day.
    return Number.isFinite(t) ? t + 86_400_000 : Number.POSITIVE_INFINITY;
  }, [toDate]);
  const dateActive =
    fromMs !== Number.NEGATIVE_INFINITY || toMs !== Number.POSITIVE_INFINITY;

  const filteredRecords = React.useMemo(
    () => records.filter((r) => r.timestamp >= fromMs && r.timestamp < toMs),
    [records, fromMs, toMs],
  );
  const filteredReceived = React.useMemo(
    () => received.filter((tx) => tx.timestamp >= fromMs && tx.timestamp < toMs),
    [received, fromMs, toMs],
  );
  const summaries = React.useMemo(
    () => summarizeByToken(filteredRecords, filteredReceived),
    [filteredRecords, filteredReceived],
  );

  const clearDateRange = React.useCallback(() => {
    setFromDate("");
    setToDate("");
  }, []);

  const handleExportCsv = React.useCallback(() => {
    if (!scan) return;
    const { csv } = buildComplianceCsv(scan.report, fromMs, toMs);
    downloadCsv(csvFilename(fromDate, toDate), csv);
  }, [scan, fromMs, toMs, fromDate, toDate]);

  const inRangeTransactions = React.useMemo<ReceivedTransaction[]>(() => {
    if (!scan) return [];
    if (
      fromMs === Number.NEGATIVE_INFINITY &&
      toMs === Number.POSITIVE_INFINITY
    ) {
      return [...scan.report.transactions].sort(
        (a, b) => b.timestamp - a.timestamp,
      );
    }
    return scan.report.transactions
      .filter((tx) => tx.timestamp >= fromMs && tx.timestamp < toMs)
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [scan, fromMs, toMs]);

  // Drawer state. We key the selected tx by signature ?? commitment so
  // re-renders of the underlying scan keep the same row open.
  const [selectedKey, setSelectedKey] = React.useState<string | null>(null);
  const selectedTx = React.useMemo(
    () =>
      selectedKey == null
        ? null
        : (inRangeTransactions.find(
            (tx) => (tx.signature ?? tx.commitment) === selectedKey,
          ) ?? null),
    [selectedKey, inRangeTransactions],
  );

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
            Selective disclosure
          </p>
          <p className="mt-0.5 truncate text-[12.5px] text-muted-foreground">
            Hand a viewing key to one auditor. They reconstruct your ledger off-chain. The chain still sees nothing.
          </p>
        </div>
      </motion.div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 p-4 sm:p-6">
        <SummaryStats
          summaries={summaries}
          dateActive={dateActive}
          fromLabel={fromDate}
          toLabel={toDate}
        />

        <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[1.4fr_1fr]">
          <IssueViewingKey
            fromDate={fromDate}
            toDate={toDate}
            onFromChange={setFromDate}
            onToChange={setToDate}
            onClear={clearDateRange}
            dateActive={dateActive}
          />

          <div className="flex min-h-0 flex-col gap-3">
            <ActiveKeysCard />
            <TransactionsCard
              transactions={inRangeTransactions}
              hasScan={Boolean(scan)}
              dateActive={dateActive}
              onSelect={(tx) => setSelectedKey(tx.signature ?? tx.commitment)}
              onExport={handleExportCsv}
            />
          </div>
        </div>
      </div>

      <TxDetailDrawer
        tx={selectedTx}
        open={selectedTx !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedKey(null);
        }}
      />
    </div>
  );
}

function IssueViewingKey({
  fromDate,
  toDate,
  onFromChange,
  onToChange,
  onClear,
  dateActive,
}: {
  fromDate: string;
  toDate: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  onClear: () => void;
  dateActive: boolean;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="flex min-h-0 flex-col gap-4 rounded-2xl border border-border bg-card/60 p-5"
    >
      <div className="flex items-center gap-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
          <HugeiconsIcon icon={KeyIcon} size={16} strokeWidth={1.6} />
        </div>
        <div className="min-w-0">
          <h2 className="text-[14.5px] font-medium tracking-tight text-foreground">
            Issue a viewing key
          </h2>
          <p className="text-[12px] text-muted-foreground">
            Date-ranged, read-only, revocable.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="auditor">Auditor</Label>
        <Input id="auditor" placeholder="e.g. Trail of Bits" />
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="range-from">Date range</Label>
          {dateActive ? (
            <button
              type="button"
              onClick={onClear}
              className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:text-foreground"
            >
              Clear
            </button>
          ) : null}
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <Input
            id="range-from"
            type="date"
            value={fromDate}
            max={toDate || undefined}
            onChange={(e) => onFromChange(e.target.value)}
            aria-label="From date"
          />
          <span aria-hidden="true" className="text-[11px] text-muted-foreground/70">
            →
          </span>
          <Input
            id="range-to"
            type="date"
            value={toDate}
            min={fromDate || undefined}
            onChange={(e) => onToChange(e.target.value)}
            aria-label="To date"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email" hint="Encrypted out-of-band">
          Delivery email
        </Label>
        <Input
          id="email"
          type="email"
          placeholder="auditor@firm.example"
          autoComplete="off"
        />
      </div>

      <FancyButton variant="primary" size="lg" className="mt-auto self-start">
        Generate viewing key
        <HugeiconsIcon icon={ArrowRight01Icon} size={14} strokeWidth={2.2} />
      </FancyButton>
    </motion.section>
  );
}

function ActiveKeysCard() {
  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
      className="flex shrink-0 flex-col rounded-2xl border border-border bg-card/60 p-4"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-[13px] font-medium tracking-tight text-foreground">
          Active keys
        </h3>
        <span className="font-mono text-[10.5px] text-muted-foreground">
          {KEYS.filter((k) => k.status === "active").length} issued
        </span>
      </div>

      <ul className="mt-3 flex flex-col gap-1.5">
        {KEYS.map((k, i) => (
          <motion.li
            key={k.id}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              delay: 0.12 + i * 0.04,
              duration: 0.24,
            }}
            className="group flex items-center gap-2.5 rounded-lg border border-border bg-background/40 px-2.5 py-2"
          >
            <span
              className={cn(
                "grid size-6 shrink-0 place-items-center rounded-md border",
                k.status === "active"
                  ? "border-primary/20 bg-primary/10 text-primary"
                  : "border-border bg-background/60 text-muted-foreground",
              )}
            >
              <HugeiconsIcon icon={EyeIcon} size={11} strokeWidth={1.8} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-medium text-foreground">
                {k.auditor}
              </p>
              <p className="truncate font-mono text-[10.5px] text-muted-foreground">
                {k.range} · {k.id}
              </p>
            </div>
            <button
              type="button"
              aria-label="Copy key id"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              <HugeiconsIcon icon={Copy01Icon} size={12} strokeWidth={1.8} />
            </button>
          </motion.li>
        ))}
      </ul>
    </motion.section>
  );
}

function TransactionsCard({
  transactions,
  hasScan,
  dateActive,
  onSelect,
  onExport,
}: {
  transactions: ReceivedTransaction[];
  hasScan: boolean;
  dateActive: boolean;
  onSelect: (tx: ReceivedTransaction) => void;
  onExport: () => void;
}) {
  const count = transactions.length;
  const canExport = hasScan && count > 0;
  const hint = !hasScan
    ? "Sync received first on History."
    : count === 0
      ? dateActive
        ? "No transactions in the selected range."
        : "No transactions yet."
      : `${count} ${count === 1 ? "tx" : "txs"}${dateActive ? " in range" : ""}`;

  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
      className="flex min-h-0 flex-1 flex-col rounded-2xl border border-border bg-card/60 p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-[13px] font-medium tracking-tight text-foreground">
            Transactions
          </h3>
          <p className="mt-0.5 truncate text-[10.5px] text-muted-foreground">
            {hint}
          </p>
        </div>
        <FancyButton
          variant="primary"
          size="sm"
          onClick={onExport}
          disabled={!canExport}
          aria-label="Export compliance CSV for the selected date range"
        >
          <HugeiconsIcon icon={Download01Icon} size={12} strokeWidth={2} />
          Export CSV
        </FancyButton>
      </div>

      <ul className="mt-3 flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pr-0.5">
        {transactions.map((tx, i) => (
          <TransactionRow
            key={tx.signature ?? tx.commitment}
            tx={tx}
            index={i}
            onSelect={onSelect}
          />
        ))}
        {transactions.length === 0 ? (
          <li className="grid place-items-center rounded-lg border border-dashed border-border bg-background/30 px-3 py-6 text-center text-[11px] text-muted-foreground">
            {hint}
          </li>
        ) : null}
      </ul>
    </motion.section>
  );
}

function TransactionRow({
  tx,
  index,
  onSelect,
}: {
  tx: ReceivedTransaction;
  index: number;
  onSelect: (tx: ReceivedTransaction) => void;
}) {
  const decimals = tx.decimals ?? 9;
  const amount = formatBaseUnits(String(tx.netAmount), decimals);
  const symbol = tx.outputSymbol ?? tx.symbol ?? "";
  const sigShort = tx.signature
    ? `${tx.signature.slice(0, 4)}…${tx.signature.slice(-4)}`
    : `${tx.commitment.slice(0, 4)}…${tx.commitment.slice(-4)}`;
  const isDeposit = tx.txType === "deposit";

  return (
    <motion.li
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        delay: 0.12 + Math.min(index, 6) * 0.03,
        duration: 0.22,
      }}
    >
      <button
        type="button"
        onClick={() => onSelect(tx)}
        className="group flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-background/40 px-2.5 py-2 text-left transition-colors hover:border-primary/30 hover:bg-card/70"
      >
        <div className="min-w-0">
          <p className="truncate text-[11.5px] font-medium text-foreground">
            <span
              className={cn(
                "mr-1.5 font-mono text-[9.5px] uppercase tracking-[0.16em]",
                isDeposit ? "text-foreground/70" : "text-emerald-400",
              )}
            >
              {txTypeLabel(tx.txType)}
            </span>
            <span className="font-mono text-foreground">
              {isDeposit ? "−" : "+"}
              {amount}
              {symbol ? (
                <span className="ml-1 text-muted-foreground">{symbol}</span>
              ) : null}
            </span>
          </p>
          <p className="truncate font-mono text-[10px] text-muted-foreground">
            {sigShort} · {formatTxDate(tx.timestamp)}
          </p>
        </div>
        <HugeiconsIcon
          icon={ArrowRight01Icon}
          size={12}
          strokeWidth={2}
          className="shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
        />
      </button>
    </motion.li>
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
      return txType || "Unknown";
  }
}

function formatTxDate(ms: number): string {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function TxDetailDrawer({
  tx,
  open,
  onOpenChange,
}: {
  tx: ReceivedTransaction | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto data-[side=right]:sm:max-w-md"
      >
        {tx ? <TxDetailBody tx={tx} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function TxDetailBody({ tx }: { tx: ReceivedTransaction }) {
  const decimals = tx.decimals ?? 9;
  const symbol = tx.symbol ?? "";
  const outputSymbol = tx.outputSymbol ?? "";
  const amount = formatBaseUnits(String(tx.amount), decimals);
  const fee = formatBaseUnits(String(tx.fee), decimals);
  const netAmount = formatBaseUnits(String(tx.netAmount), decimals);
  const runningBalance = formatBaseUnits(
    String(tx.runningBalance),
    decimals,
  );
  const solscanUrl = tx.signature ? solscanTxUrl(tx.signature) : null;
  const recipientUrl = tx.recipient ? solscanAddressUrl(tx.recipient) : null;
  const timestampLabel = new Date(tx.timestamp).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <>
      <SheetHeader className="border-b border-border">
        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-primary/80">
          {txTypeLabel(tx.txType)}
        </p>
        <SheetTitle className="font-mono text-[18px] tabular-nums text-foreground">
          {tx.txType === "deposit" ? "−" : "+"}
          {netAmount}
          {symbol ? (
            <span className="ml-1.5 text-[14px] text-muted-foreground">
              {symbol}
            </span>
          ) : null}
        </SheetTitle>
        <SheetDescription className="text-[12px]">
          {timestampLabel}
        </SheetDescription>
      </SheetHeader>

      <div className="flex flex-col gap-4 p-6">
        <div className="grid grid-cols-3 gap-2">
          <DrawerStat label="Amount" value={amount} symbol={symbol} />
          <DrawerStat label="Fee" value={fee} symbol={symbol} muted />
          <DrawerStat label="Net" value={netAmount} symbol={symbol} />
        </div>

        {solscanUrl ? (
          <a
            href={solscanUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between gap-2 rounded-xl border border-primary/20 bg-primary/10 px-3 py-2.5 text-[12.5px] text-foreground transition-colors hover:border-primary/40 hover:bg-primary/15"
          >
            <span className="flex items-center gap-2">
              <HugeiconsIcon
                icon={ArrowUpRight01Icon}
                size={13}
                strokeWidth={2}
                className="text-primary"
              />
              View on Solscan
            </span>
            <span className="font-mono text-[10.5px] text-muted-foreground">
              {tx.signature?.slice(0, 6)}…{tx.signature?.slice(-6)}
            </span>
          </a>
        ) : (
          <div className="rounded-xl border border-dashed border-border bg-background/40 px-3 py-2.5 text-[12px] text-muted-foreground">
            Signature not recorded — Solscan link unavailable.
          </div>
        )}

        <div className="flex flex-col gap-2">
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground/80">
            Raw fields
          </p>
          <dl className="grid grid-cols-1 divide-y divide-border/70 rounded-xl border border-border bg-background/30 text-[12px]">
            <RawField
              label="Type"
              value={tx.txType}
              mono
            />
            <RawField
              label="Timestamp"
              value={String(tx.timestamp)}
              hint={`${tx.timestamp} ms`}
              mono
            />
            <RawField
              label="Signature"
              value={tx.signature ?? "—"}
              href={solscanUrl ?? undefined}
              mono
            />
            <RawField
              label="Commitment"
              value={tx.commitment}
              mono
            />
            <RawField
              label="Recipient"
              value={tx.recipient}
              href={recipientUrl ?? undefined}
              mono
            />
            <RawField
              label="Mint"
              value={tx.mint ?? "—"}
              hint={symbol || undefined}
              mono
            />
            {tx.outputMint ? (
              <RawField
                label="Output mint"
                value={tx.outputMint}
                hint={outputSymbol || undefined}
                mono
              />
            ) : null}
            <RawField
              label="Decimals"
              value={String(decimals)}
            />
            <RawField
              label="Amount (raw)"
              value={String(tx.amount)}
              hint={`${amount} ${symbol}`.trim()}
              mono
            />
            <RawField
              label="Fee (raw)"
              value={String(tx.fee)}
              hint={`${fee} ${symbol}`.trim()}
              mono
            />
            <RawField
              label="Net (raw)"
              value={String(tx.netAmount)}
              hint={`${netAmount} ${symbol}`.trim()}
              mono
            />
            <RawField
              label="Running balance"
              value={String(tx.runningBalance)}
              hint={`${runningBalance} ${symbol}`.trim()}
              mono
            />
          </dl>
        </div>
      </div>
    </>
  );
}

function DrawerStat({
  label,
  value,
  symbol,
  muted,
}: {
  label: string;
  value: string;
  symbol: string;
  muted?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border border-border bg-background/40 px-3 py-2">
      <span className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-muted-foreground/80">
        {label}
      </span>
      <span
        className={cn(
          "truncate font-mono text-[13px] tabular-nums",
          muted ? "text-foreground/80" : "text-foreground",
        )}
        title={`${value} ${symbol}`.trim()}
      >
        {value}
        {symbol ? (
          <span className="ml-1 text-[10.5px] text-muted-foreground">
            {symbol}
          </span>
        ) : null}
      </span>
    </div>
  );
}

function RawField({
  label,
  value,
  hint,
  href,
  mono,
}: {
  label: string;
  value: string;
  hint?: string;
  href?: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 px-3 py-2">
      <dt className="shrink-0 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/80">
        {label}
      </dt>
      <dd className="min-w-0 flex-1 text-right">
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className={cn(
              "block truncate text-foreground underline-offset-2 hover:underline",
              mono && "font-mono",
            )}
            title={value}
          >
            {value}
          </a>
        ) : (
          <span
            className={cn(
              "block truncate text-foreground",
              mono && "font-mono",
            )}
            title={value}
          >
            {value}
          </span>
        )}
        {hint ? (
          <span className="block truncate text-[10px] text-muted-foreground/80">
            {hint}
          </span>
        ) : null}
      </dd>
    </div>
  );
}

type TokenSummary = {
  mint: string;
  symbol: string;
  decimals: number;
  inflow: bigint;
  outflow: bigint;
  fees: bigint;
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
      if (!existing.symbol && symbol) existing.symbol = symbol;
      return existing;
    }
    const entry: TokenSummary = {
      mint,
      symbol,
      decimals,
      inflow: 0n,
      outflow: 0n,
      fees: 0n,
      count: 0,
    };
    map.set(mint, entry);
    return entry;
  };

  for (const r of records) {
    if (!r.mint) continue;
    const e = upsert(r.mint, r.token, r.decimals);
    try {
      // amountRaw is gross (what left the wallet), netRaw is what landed at
      // the recipient. The difference is what the user paid in fees.
      const gross = BigInt(r.amountRaw);
      const net = BigInt(r.netRaw);
      e.outflow += gross;
      e.fees += gross - net;
    } catch {
      // ignore malformed legacy records
    }
    e.count += 1;
  }

  for (const tx of received) {
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
    const grossA = a.inflow + a.outflow;
    const grossB = b.inflow + b.outflow;
    if (grossA !== grossB) return grossB > grossA ? 1 : -1;
    return b.count - a.count;
  });
}

const NATIVE_SOL = "So11111111111111111111111111111111111111112";
const USDC_MINTS = new Set<string>([
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "61ro7AExqfk4dZYoCyRzTahahCC2TdUUZ4M5epMPunJf",
]);
const USDT_MINTS = new Set<string>([
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
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

function shortMint(mint: string): string {
  if (mint.length <= 8) return mint;
  return `${mint.slice(0, 4)}…${mint.slice(-4)}`;
}

function SummaryStats({
  summaries,
  dateActive,
  fromLabel,
  toLabel,
}: {
  summaries: TokenSummary[];
  dateActive: boolean;
  fromLabel: string;
  toLabel: string;
}) {
  const empty = summaries.length === 0;
  const rows: TokenSummary[] = empty
    ? [
        {
          mint: NATIVE_SOL,
          symbol: "SOL",
          decimals: 9,
          inflow: 0n,
          outflow: 0n,
          fees: 0n,
          count: 0,
        },
      ]
    : summaries;

  const [activeMint, setActiveMint] = React.useState<string | null>(null);
  // Derive the active token: respect the user's pick when it still exists in
  // the current set, otherwise fall back to the first (highest activity) row.
  const active = rows.find((r) => r.mint === activeMint) ?? rows[0];
  const net = active.inflow - active.outflow;
  const subtitle = dateActive
    ? `${fromLabel || "earliest"} → ${toLabel || "latest"}`
    : `${active.count} ${active.count === 1 ? "tx" : "txs"} on this token`;

  return (
    <motion.section
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      aria-label="Account summary"
      className="grid items-stretch gap-3 rounded-2xl border border-border bg-card/60 p-4 sm:grid-cols-[auto_1fr]"
    >
      <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-start sm:justify-center sm:border-r sm:border-border/70 sm:pr-4">
        <div className="min-w-0">
          <p className="font-mono text-[9.5px] font-medium uppercase tracking-[0.2em] text-primary/80">
            Account summary
          </p>
          <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
            {subtitle}
          </p>
        </div>
        {rows.length > 1 ? (
          <div className="flex flex-wrap items-center gap-1">
            {rows.map((r) => {
              const isActive = r.mint === active.mint;
              const label = r.symbol || shortMint(r.mint);
              return (
                <button
                  key={r.mint}
                  type="button"
                  onClick={() => setActiveMint(r.mint)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md border px-1.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.14em] transition-colors",
                    isActive
                      ? "border-primary/30 bg-primary/10 text-foreground"
                      : "border-border bg-background/40 text-muted-foreground hover:border-primary/20 hover:text-foreground",
                  )}
                >
                  <TokenLogo
                    mint={r.mint}
                    symbol={r.symbol}
                    className="size-3.5 shrink-0"
                  />
                  {label}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <TokenLogo
              mint={active.mint}
              symbol={active.symbol}
              className="size-4 shrink-0"
            />
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-foreground/80">
              {active.symbol || shortMint(active.mint)}
            </span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat
          label="In"
          value={formatBaseUnits(active.inflow.toString(), active.decimals)}
          tone={active.inflow > 0n ? "positive" : "neutral"}
          prefix={active.inflow > 0n ? "+" : ""}
        />
        <Stat
          label="Out"
          value={formatBaseUnits(active.outflow.toString(), active.decimals)}
          tone="neutral"
          prefix={active.outflow > 0n ? "−" : ""}
        />
        <Stat
          label="Fees"
          value={formatBaseUnits(active.fees.toString(), active.decimals)}
          tone="muted"
        />
        <Stat
          label="Net"
          value={formatBaseUnits(
            (net < 0n ? -net : net).toString(),
            active.decimals,
          )}
          tone={net > 0n ? "positive" : net < 0n ? "negative" : "neutral"}
          prefix={net > 0n ? "+" : net < 0n ? "−" : ""}
        />
      </div>
    </motion.section>
  );
}

function Stat({
  label,
  value,
  prefix,
  tone,
}: {
  label: string;
  value: string;
  prefix?: string;
  tone: "positive" | "negative" | "neutral" | "muted";
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border border-border bg-background/40 px-3 py-2">
      <span className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-muted-foreground/80">
        {label}
      </span>
      <span
        className={cn(
          "truncate font-mono text-[13.5px] tabular-nums",
          tone === "positive" && "text-emerald-400",
          tone === "negative" && "text-foreground",
          tone === "neutral" && "text-foreground",
          tone === "muted" && "text-foreground/80",
        )}
        title={`${prefix ?? ""}${value}`}
      >
        {prefix}
        {value}
      </span>
    </div>
  );
}
