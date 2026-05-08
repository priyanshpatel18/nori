"use client";

import {
  ArrowRight01Icon,
  CheckmarkCircle01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { motion } from "motion/react";
import * as React from "react";

import { NoriMark, UsdcLogo } from "@/components/logos";
import { cn } from "@/lib/utils";

type Pay = {
  name: string;
  addr: string;
  amount: string;
  status: "ok" | "queued";
};

const PAYROLL: Pay[] = [
  { name: "Alice Cheng",    addr: "8xKjP…8H1", amount: "4,200.00", status: "ok" },
  { name: "Ben Park",       addr: "3FzN1…4kQ", amount: "3,150.00", status: "ok" },
  { name: "Carla Mendes",   addr: "AbqW9…vTm", amount: "1,800.00", status: "queued" },
  { name: "Dev fund · ops", addr: "7gPw…nL9c", amount: "5,200.00", status: "queued" },
  { name: "Sasha Liu",      addr: "1xQs…vR2d", amount: "5,600.00", status: "queued" },
];

export function BrandProduct() {
  const totals = React.useMemo(() => {
    const gross = PAYROLL.reduce(
      (s, p) => s + Number(p.amount.replace(/,/g, "")),
      0,
    );
    const variable = gross * 0.003;
    const net = gross - variable;
    return {
      gross: gross.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      variable: variable.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      net: net.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    };
  }, []);

  return (
    <section
      aria-label="Product preview"
      className="relative bg-background"
    >
      <div className="mx-auto w-full max-w-6xl px-6 pb-24 md:px-8 md:pb-32">
        <motion.figure
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "0px 0px -8% 0px" }}
          transition={{ duration: 0.7, ease: [0.22, 0.6, 0.2, 1] }}
          className="overflow-hidden rounded-[10px] border border-border bg-card/60 shadow-[0_40px_120px_-40px_color-mix(in_oklch,black_70%,transparent)]"
        >
          <div className="flex items-center justify-between border-b border-border bg-background/60 px-5 py-3">
            <div className="font-mono text-[12px] text-foreground/55">
              usenori.xyz / payroll
            </div>
            <div className="flex items-center gap-1.5 text-[11.5px] text-foreground/60">
              <span className="size-1.5 rounded-full bg-primary" />
              mainnet
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[200px_1fr]">
            <aside className="hidden border-r border-border bg-background/40 p-5 md:block">
              <div className="flex items-center gap-2">
                <NoriMark className="size-5" />
                <span className="text-[14px] font-semibold tracking-tight text-foreground">
                  Nori
                </span>
              </div>
              <ul className="mt-7 flex flex-col gap-0.5 text-[13.5px]">
                <NavItem label="Pay" />
                <NavItem label="Payroll" active />
                <NavItem label="History" />
                <NavItem label="Compliance" />
                <NavItem label="Team" />
              </ul>

              <div className="mt-9 border-t border-border pt-4">
                <p className="text-[11.5px] text-foreground/55">Treasury</p>
                <p className="mt-1 truncate font-mono text-[12px] text-foreground/85">
                  4nM2…sR9k
                </p>
                <p className="mt-1 font-mono text-[12px] text-foreground/55 tabular-nums">
                  42,180.55 USDC
                </p>
              </div>
            </aside>

            <div className="flex flex-col gap-5 p-6 md:p-8">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-[12px] text-foreground/55">
                    Cycle 2026-05-01 · 5 contributors
                  </p>
                  <h3 className="mt-1.5 text-[22px] font-semibold tracking-tight text-foreground">
                    Run private payroll
                  </h3>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background/60 px-2.5 py-1.5 font-mono text-[12px] text-foreground/85">
                  <UsdcLogo className="size-3.5" />
                  USDC
                </span>
              </div>

              <div className="overflow-hidden rounded-[6px] border border-border bg-background/40">
                <div className="grid grid-cols-[1.4fr_1fr_auto_auto] gap-3 border-b border-border bg-background/60 px-4 py-2.5 text-[11.5px] text-foreground/55">
                  <span>Recipient</span>
                  <span>Address</span>
                  <span className="text-right">Amount</span>
                  <span className="w-16 text-right">Status</span>
                </div>
                <ul className="divide-y divide-border">
                  {PAYROLL.map((p) => (
                    <li
                      key={p.addr}
                      className="grid grid-cols-[1.4fr_1fr_auto_auto] items-center gap-3 px-4 py-3 text-[13.5px]"
                    >
                      <span className="truncate text-foreground">{p.name}</span>
                      <span className="truncate font-mono text-[12.5px] text-foreground/55">
                        {p.addr}
                      </span>
                      <span className="text-right tabular-nums text-foreground">
                        {p.amount}
                      </span>
                      <span className="flex w-16 justify-end">
                        <StatusPill status={p.status} />
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="grid grid-cols-3 gap-4 rounded-[6px] border border-border bg-background/40 px-4 py-3 text-[13px]">
                <Total label="Gross"  value={`${totals.gross} USDC`} />
                <Total label="Fee"    value={`${totals.variable} + 0.005 SOL`} muted />
                <Total label="Net"    value={`${totals.net} USDC`} accent />
              </div>

              <div className="flex items-center justify-between gap-4">
                <p className="text-[12.5px] text-foreground/55">
                  One signature. Three-second proof.
                </p>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-md border border-primary/40 bg-primary px-4 py-2 text-[13.5px] font-medium text-primary-foreground"
                >
                  Run batch
                  <HugeiconsIcon icon={ArrowRight01Icon} size={13} strokeWidth={2.4} />
                </button>
              </div>
            </div>
          </div>
        </motion.figure>
      </div>
    </section>
  );
}

function NavItem({ label, active }: { label: string; active?: boolean }) {
  return (
    <li
      className={cn(
        "rounded-md px-2.5 py-1.5",
        active ? "bg-primary/10 text-foreground" : "text-foreground/60",
      )}
    >
      <span className="flex items-center justify-between">
        {label}
        {active ? <span className="size-1 rounded-full bg-primary" /> : null}
      </span>
    </li>
  );
}

function StatusPill({ status }: { status: "ok" | "queued" }) {
  if (status === "ok") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[10.5px] text-primary">
        <HugeiconsIcon icon={CheckmarkCircle01Icon} size={10} strokeWidth={2} />
        ok
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary/60 px-1.5 py-0.5 text-[10.5px] text-foreground/60">
      <span className="size-1 rounded-full bg-foreground/45" />
      queued
    </span>
  );
}

function Total({
  label,
  value,
  muted,
  accent,
}: {
  label: string;
  value: string;
  muted?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11.5px] text-foreground/55">{label}</span>
      <span
        className={cn(
          "tabular-nums",
          accent && "text-primary",
          muted && "text-foreground/65",
          !accent && !muted && "text-foreground",
        )}
      >
        {value}
      </span>
    </div>
  );
}
