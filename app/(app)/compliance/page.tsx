"use client";

import {
  ArrowRight01Icon,
  Copy01Icon,
  Download01Icon,
  EyeIcon,
  FileSecurityIcon,
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
  formatBaseUnits,
  type PaymentRecord,
} from "@/lib/cloak/payment-history";
import type { ReceivedTransaction } from "@/lib/cloak/scanned-history";
import { usePaymentHistory } from "@/lib/cloak/use-payment-history";
import { useScannedHistory } from "@/lib/cloak/use-scanned-history";
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

const EXPORTS: { name: string; date: string; size: string }[] = [
  { name: "Q1-2026-ledger.csv", date: "Apr 02, 2026", size: "184 KB" },
  { name: "FY-2025-summary.csv", date: "Jan 18, 2026", size: "612 KB" },
];

export default function CompliancePage() {
  const { records } = usePaymentHistory();
  const { received } = useScannedHistory();
  const summaries = React.useMemo(
    () => summarizeByToken(records, received),
    [records, received],
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
        <SummaryStats summaries={summaries} />

        <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[1.4fr_1fr]">
          <IssueViewingKey />

          <div className="flex min-h-0 flex-col gap-3">
            <ActiveKeysCard />
            <RecentExportsCard />
          </div>
        </div>
      </div>
    </div>
  );
}

function IssueViewingKey() {
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

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="auditor">Auditor</Label>
          <Input id="auditor" placeholder="e.g. Trail of Bits" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="range">Date range</Label>
          <Input id="range" placeholder="2026-01-01 to 2026-03-31" />
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
      className="flex min-h-0 flex-1 flex-col rounded-2xl border border-border bg-card/60 p-4"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-[13px] font-medium tracking-tight text-foreground">
          Active keys
        </h3>
        <span className="font-mono text-[10.5px] text-muted-foreground">
          {KEYS.filter((k) => k.status === "active").length} issued
        </span>
      </div>

      <ul className="mt-3 flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pr-0.5">
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

function RecentExportsCard() {
  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
      className="flex min-h-0 flex-col rounded-2xl border border-border bg-card/60 p-4"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-[13px] font-medium tracking-tight text-foreground">
          Recent exports
        </h3>
        <HugeiconsIcon
          icon={FileSecurityIcon}
          size={13}
          strokeWidth={1.8}
          className="text-muted-foreground"
        />
      </div>

      <ul className="mt-3 flex flex-col gap-1.5">
        {EXPORTS.map((e, i) => (
          <motion.li
            key={e.name}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              delay: 0.16 + i * 0.04,
              duration: 0.24,
            }}
            className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background/40 px-2.5 py-2"
          >
            <div className="min-w-0">
              <p className="truncate font-mono text-[11.5px] text-foreground">
                {e.name}
              </p>
              <p className="text-[10.5px] text-muted-foreground">
                {e.date} · {e.size}
              </p>
            </div>
            <button
              type="button"
              aria-label="Download"
              className="grid size-7 place-items-center rounded-md border border-border text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary"
            >
              <HugeiconsIcon icon={Download01Icon} size={12} strokeWidth={1.8} />
            </button>
          </motion.li>
        ))}
      </ul>
    </motion.section>
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

function SummaryStats({ summaries }: { summaries: TokenSummary[] }) {
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
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            {active.count} {active.count === 1 ? "tx" : "txs"} on this token
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
