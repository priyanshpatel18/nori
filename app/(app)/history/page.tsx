"use client";

import {
  ArrowDown01Icon,
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
import { cn } from "@/lib/utils";

type Tx = {
  id: string;
  direction: "out" | "in";
  counterparty: string;
  memo?: string;
  amount: string;
  token: "SOL" | "USDC" | "USDT";
  date: string;
  status: "settled" | "pending";
};

const TXS: Tx[] = [
  {
    id: "0xf0…3a91",
    direction: "out",
    counterparty: "Engineering · April",
    memo: "18 recipients",
    amount: "184,500",
    token: "USDC",
    date: "Apr 28, 2026 · 09:14",
    status: "settled",
  },
  {
    id: "0xa1…07cd",
    direction: "in",
    counterparty: "Treasury rebalance",
    amount: "120",
    token: "SOL",
    date: "Apr 22, 2026 · 14:02",
    status: "settled",
  },
  {
    id: "0x88…12b2",
    direction: "out",
    counterparty: "Design contractors",
    memo: "Q2 prepay",
    amount: "32,000",
    token: "USDC",
    date: "Apr 18, 2026 · 11:48",
    status: "settled",
  },
  {
    id: "0xb3…ee04",
    direction: "out",
    counterparty: "Audit · Trail of Bits",
    amount: "65,000",
    token: "USDT",
    date: "Apr 12, 2026 · 16:30",
    status: "settled",
  },
  {
    id: "0xc7…5f1a",
    direction: "out",
    counterparty: "Engineering · March",
    memo: "18 recipients",
    amount: "182,000",
    token: "USDC",
    date: "Mar 28, 2026 · 09:08",
    status: "settled",
  },
];

const FILTERS = ["All", "Outgoing", "Incoming", "Payroll"] as const;

export default function HistoryPage() {
  const [filter, setFilter] = React.useState<(typeof FILTERS)[number]>("All");
  const [query, setQuery] = React.useState("");

  const filtered = React.useMemo(() => {
    return TXS.filter((t) => {
      if (filter === "Outgoing" && t.direction !== "out") return false;
      if (filter === "Incoming" && t.direction !== "in") return false;
      if (filter === "Payroll" && !t.memo?.includes("recipients")) return false;
      if (query) {
        const q = query.toLowerCase();
        return (
          t.counterparty.toLowerCase().includes(q) ||
          t.memo?.toLowerCase().includes(q) ||
          t.id.includes(q)
        );
      }
      return true;
    });
  }, [filter, query]);

  return (
    <>
      <PageHeader
        eyebrow="Private ledger"
        title="History"
        description="Every payment you've sent through Nori. The chain sees a transaction. Only you see what's inside."
      />

      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10 sm:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-1 rounded-xl border border-border bg-card/40 p-1">
            {FILTERS.map((f) => {
              const isActive = filter === f;
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={cn(
                    "relative rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                    isActive
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {isActive && (
                    <motion.span
                      layoutId="history-filter-active"
                      aria-hidden="true"
                      className="absolute inset-0 -z-0 rounded-lg bg-secondary"
                      transition={{
                        type: "spring",
                        stiffness: 380,
                        damping: 30,
                      }}
                    />
                  )}
                  <span className="relative z-10">{f}</span>
                </button>
              );
            })}
          </div>

          <div className="sm:w-72">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search counterparty or hash"
              leadingIcon={
                <HugeiconsIcon icon={Search01Icon} size={14} strokeWidth={1.8} />
              }
            />
          </div>
        </div>

        <ul className="flex flex-col gap-2">
          {filtered.map((tx, i) => (
            <motion.li
              key={tx.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: 0.05 + i * 0.04,
                duration: 0.28,
                ease: [0.22, 1, 0.36, 1],
              }}
              className="group flex items-center gap-4 rounded-xl border border-border bg-card/40 px-4 py-3.5 transition-colors hover:border-primary/30 hover:bg-card/70"
            >
              <div
                className={cn(
                  "grid size-9 shrink-0 place-items-center rounded-lg border",
                  tx.direction === "out"
                    ? "border-primary/20 bg-primary/10 text-primary"
                    : "border-border bg-background/60 text-foreground/70",
                )}
              >
                <HugeiconsIcon
                  icon={tx.direction === "out" ? ArrowUp01Icon : ArrowDown01Icon}
                  size={14}
                  strokeWidth={2}
                />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-[14px] font-medium text-foreground">
                    {tx.counterparty}
                  </p>
                  <span className="hidden font-mono text-[10.5px] text-muted-foreground sm:inline">
                    {tx.id}
                  </span>
                </div>
                <p className="text-[12px] text-muted-foreground">
                  {tx.date}
                  {tx.memo ? ` · ${tx.memo}` : ""}
                </p>
              </div>

              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p
                    className={cn(
                      "font-mono text-[13.5px]",
                      tx.direction === "out"
                        ? "text-foreground"
                        : "text-primary",
                    )}
                  >
                    {tx.direction === "out" ? "−" : "+"}
                    {tx.amount}{" "}
                    <span className="text-muted-foreground">{tx.token}</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground capitalize">
                    {tx.status}
                  </p>
                </div>
                <button
                  type="button"
                  className="text-muted-foreground transition-colors hover:text-primary"
                  aria-label="View receipt"
                >
                  <HugeiconsIcon icon={EyeIcon} size={15} strokeWidth={1.8} />
                </button>
              </div>
            </motion.li>
          ))}

          {filtered.length === 0 && (
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
              <p className="text-[13.5px] text-foreground">No matches</p>
              <p className="text-[12px] text-muted-foreground">
                Try a different filter or clear your search.
              </p>
            </motion.li>
          )}
        </ul>
      </div>
    </>
  );
}
