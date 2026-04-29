"use client";

import {
  ArrowRight01Icon,
  CheckmarkCircle01Icon,
  Coins01Icon,
  Upload01Icon,
  UserMultipleIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { motion } from "motion/react";
import * as React from "react";

import { PageHeader } from "@/components/app-shell/page-header";
import { FancyButton } from "@/components/ui/fancy-button";
import { cn } from "@/lib/utils";

const ROSTERS: {
  name: string;
  count: number;
  cycle: string;
  total: string;
  status: "scheduled" | "draft";
}[] = [
  {
    name: "Engineering · April",
    count: 18,
    cycle: "Monthly",
    total: "184,500 USDC",
    status: "scheduled",
  },
  {
    name: "Contractors · Q2",
    count: 7,
    cycle: "One-off",
    total: "42 SOL",
    status: "draft",
  },
  {
    name: "Design · April",
    count: 5,
    cycle: "Monthly",
    total: "32,000 USDC",
    status: "scheduled",
  },
];

export default function PayrollPage() {
  const [drag, setDrag] = React.useState(false);

  return (
    <>
      <PageHeader
        eyebrow="Run a roster"
        title="Payroll, in one transaction."
        description="Upload a CSV of names, addresses, amounts, and tokens. Save it once, rerun it every cycle."
        actions={
          <FancyButton variant="primary" size="md">
            New roster
            <HugeiconsIcon
              icon={ArrowRight01Icon}
              size={14}
              strokeWidth={2.2}
            />
          </FancyButton>
        }
      />

      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10 sm:px-8">
        <motion.label
          htmlFor="roster-upload"
          onDragEnter={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
          }}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          className={cn(
            "group relative flex cursor-pointer flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl border border-dashed border-border bg-card/40 px-8 py-14 text-center transition-colors",
            "hover:border-primary/40 hover:bg-card/60",
            drag && "border-primary/60 bg-primary/5",
          )}
        >
          <input
            id="roster-upload"
            type="file"
            accept=".csv"
            className="sr-only"
          />

          <motion.div
            aria-hidden="true"
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.08, type: "spring", stiffness: 320, damping: 22 }}
            className="grid size-12 place-items-center rounded-2xl border border-primary/20 bg-primary/10 text-primary"
          >
            <HugeiconsIcon icon={Upload01Icon} size={20} strokeWidth={1.6} />
          </motion.div>

          <div className="flex flex-col gap-1">
            <p className="text-[15px] font-medium text-foreground">
              Drop your roster CSV
            </p>
            <p className="text-[13px] text-muted-foreground">
              Columns: name, address, amount, token. Up to 1,000 rows.
            </p>
          </div>

          <span className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-border bg-background/60 px-3 py-1 font-mono text-[11px] text-muted-foreground">
            <HugeiconsIcon icon={Coins01Icon} size={11} strokeWidth={2} />
            SOL · USDC · USDT
          </span>
        </motion.label>

        <div className="flex flex-col gap-3">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Saved rosters
              </p>
              <h2 className="mt-1 text-[18px] font-medium tracking-tight text-foreground">
                Reuse last month&apos;s payroll
              </h2>
            </div>
          </div>

          <ul className="flex flex-col gap-2">
            {ROSTERS.map((r, i) => (
              <motion.li
                key={r.name}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  delay: 0.12 + i * 0.05,
                  duration: 0.3,
                  ease: [0.22, 1, 0.36, 1],
                }}
              >
                <button
                  type="button"
                  className="group flex w-full items-center justify-between gap-4 rounded-xl border border-border bg-card/40 px-4 py-3.5 text-left transition-colors hover:border-primary/30 hover:bg-card/70"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-background/60 text-muted-foreground group-hover:text-primary">
                      <HugeiconsIcon
                        icon={UserMultipleIcon}
                        size={16}
                        strokeWidth={1.8}
                      />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-medium text-foreground">
                        {r.name}
                      </p>
                      <p className="text-[12px] text-muted-foreground">
                        {r.count} recipients · {r.cycle}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="hidden text-right sm:block">
                      <p className="font-mono text-[13px] text-foreground">
                        {r.total}
                      </p>
                      <p className="flex items-center justify-end gap-1 text-[11px] text-muted-foreground">
                        {r.status === "scheduled" ? (
                          <>
                            <HugeiconsIcon
                              icon={CheckmarkCircle01Icon}
                              size={11}
                              strokeWidth={2}
                              className="text-primary"
                            />
                            Scheduled
                          </>
                        ) : (
                          "Draft"
                        )}
                      </p>
                    </div>
                    <HugeiconsIcon
                      icon={ArrowRight01Icon}
                      size={14}
                      strokeWidth={2}
                      className="text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
                    />
                  </div>
                </button>
              </motion.li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}
