"use client";

import {
  ArrowUp01Icon,
  Coins01Icon,
  EyeIcon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { motion } from "motion/react";
import * as React from "react";



import { PageHeader } from "@/components/app-shell/page-header";
import { Input } from "@/components/ui/input";
import {
  formatBaseUnits,
  type PaymentRecord,
} from "@/lib/cloak/payment-history";
import { usePaymentHistory } from "@/lib/cloak/use-payment-history";
import { solscanTxUrl } from "@/lib/solana/explorer";
import { cn } from "@/lib/utils";

export default function HistoryPage() {
  const [query, setQuery] = React.useState("");

  const { records, ready } = usePaymentHistory();

  const filtered = React.useMemo(() => {
    return records.filter((r) => {
      if (query) {
        const q = query.toLowerCase();
        return (
          r.recipient.toLowerCase().includes(q) ||
          r.depositSignature.toLowerCase().includes(q) ||
          r.withdrawSignature.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [records, query]);

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
          {filtered.map((tx, i) => (
            <HistoryRow key={tx.id} tx={tx} index={i} />
          ))}

          {ready && filtered.length === 0 && (
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

function HistoryRow({ tx, index }: { tx: PaymentRecord; index: number }) {
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
      <div
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-lg border",
          "border-primary/20 bg-primary/10 text-primary",
        )}
      >
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

