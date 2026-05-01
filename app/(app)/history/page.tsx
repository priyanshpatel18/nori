"use client";

import {
  ArrowUp01Icon,
  Coins01Icon,
  EyeIcon,
  Search01Icon,
  UserMultipleIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AnimatePresence, motion } from "motion/react";
import * as React from "react";

import { PageHeader } from "@/components/app-shell/page-header";
import { Input } from "@/components/ui/input";
import {
  formatBaseUnits,
  type PaymentRecord,
} from "@/lib/cloak/payment-history";
import { usePaymentHistory } from "@/lib/cloak/use-payment-history";
import { solscanTxUrl } from "@/lib/solana/explorer";

type Group =
  | { kind: "single"; record: PaymentRecord }
  | { kind: "batch"; batchId: string; records: PaymentRecord[] };

export default function HistoryPage() {
  const [query, setQuery] = React.useState("");
  const { records, ready } = usePaymentHistory();

  const groups = React.useMemo(() => groupRecords(records), [records]);

  const filteredGroups = React.useMemo(() => {
    if (!query) return groups;
    const q = query.toLowerCase();
    return groups.filter((g) => {
      if (g.kind === "single") return matches(g.record, q);
      if (g.batchId.toLowerCase().includes(q)) return true;
      return g.records.some((r) => matches(r, q));
    });
  }, [groups, query]);

  return (
    <>
      <PageHeader
        eyebrow="Private ledger"
        title="History"
        description="Every payment you've sent through Nori. The chain sees a transaction. Only you see what's inside."
      />

      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10 sm:px-8">
        <div className="sm:max-w-sm sm:self-end">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search recipient or signature"
            leadingIcon={
              <HugeiconsIcon icon={Search01Icon} size={14} strokeWidth={1.8} />
            }
          />
        </div>

        <ul className="flex flex-col gap-2">
          {filteredGroups.map((g, i) =>
            g.kind === "single" ? (
              <SingleRow key={g.record.id} tx={g.record} index={i} />
            ) : (
              <BatchRow
                key={g.batchId}
                batchId={g.batchId}
                rows={g.records}
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
                {records.length === 0
                  ? "No private payments yet"
                  : "No matches"}
              </p>
              <p className="text-[12px] text-muted-foreground">
                {records.length === 0
                  ? "Your sent payments will appear here after you make one on Pay."
                  : "Try a different filter or clear your search."}
              </p>
            </motion.li>
          )}
        </ul>
      </div>
    </>
  );
}

function groupRecords(records: PaymentRecord[]): Group[] {
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

function matches(r: PaymentRecord, q: string): boolean {
  return (
    r.recipient.toLowerCase().includes(q) ||
    r.depositSignature.toLowerCase().includes(q) ||
    r.withdrawSignature.toLowerCase().includes(q)
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
        <p className="text-[12px] text-muted-foreground">
          {dateLabel} · Sent privately
        </p>
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

function BatchRow({
  batchId,
  rows,
  index,
}: {
  batchId: string;
  rows: PaymentRecord[];
  index: number;
}) {
  const [expanded, setExpanded] = React.useState(false);
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

  return (
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
        onClick={() => setExpanded((e) => !e)}
        className="group flex w-full items-center gap-4 px-4 py-3.5 text-left"
        aria-expanded={expanded}
      >
        <div className="grid size-9 shrink-0 place-items-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
          <HugeiconsIcon icon={UserMultipleIcon} size={14} strokeWidth={1.8} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-[13.5px] font-medium text-foreground">
              Payroll · {rows.length} recipient{rows.length === 1 ? "" : "s"}
            </p>
            <span className="hidden font-mono text-[10.5px] text-muted-foreground sm:inline">
              {sigShort}
            </span>
          </div>
          <p className="text-[12px] text-muted-foreground">
            {dateLabel} · {expanded ? "Hide details" : "Show recipients"}
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="font-mono text-[13.5px] text-foreground">
              −{formatBaseUnits(totalNet.toString(), decimals)}{" "}
              <span className="text-muted-foreground">{token}</span>
            </p>
            <p className="text-[11px] text-muted-foreground">
              {expanded ? "Collapse" : "Expand"}
            </p>
          </div>
        </div>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="batch-details"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden border-t border-border bg-background/30"
          >
            <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-[11.5px] text-muted-foreground">
              <span>
                Batch deposit:{" "}
                <a
                  href={depositUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-foreground/80 underline underline-offset-2"
                >
                  {sigShort} ↗
                </a>
              </span>
              <span className="font-mono">
                Gross {formatBaseUnits(totalAmount.toString(), decimals)} {token}
              </span>
            </div>
            <ul className="divide-y divide-border">
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
                      <HugeiconsIcon icon={EyeIcon} size={14} strokeWidth={1.8} />
                    </a>
                  </li>
                );
              })}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
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
