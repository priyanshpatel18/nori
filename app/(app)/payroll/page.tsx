"use client";

import {
  Alert02Icon,
  ArrowRight01Icon,
  CheckmarkCircle01Icon,
  Coins01Icon,
  Delete02Icon,
  Upload01Icon,
  UserMultipleIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AnimatePresence, motion } from "motion/react";
import * as React from "react";

import { PageHeader } from "@/components/app-shell/page-header";
import { FancyButton } from "@/components/ui/fancy-button";
import {
  parsePayrollCsv,
  type PayrollParseResult,
} from "@/lib/payroll/parse-csv";
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

type ParseState =
  | { kind: "idle" }
  | { kind: "parsing"; fileName: string }
  | {
      kind: "ready";
      fileName: string;
      result: PayrollParseResult;
    }
  | { kind: "error"; fileName: string; message: string };

export default function PayrollPage() {
  const [drag, setDrag] = React.useState(false);
  const [parse, setParse] = React.useState<ParseState>({ kind: "idle" });
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const handleFile = React.useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setParse({
        kind: "error",
        fileName: file.name,
        message: "Only .csv files are supported.",
      });
      return;
    }
    setParse({ kind: "parsing", fileName: file.name });
    try {
      const result = await parsePayrollCsv(file);
      setParse({ kind: "ready", fileName: file.name, result });
    } catch (err) {
      setParse({
        kind: "error",
        fileName: file.name,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, []);

  const reset = () => {
    setParse({ kind: "idle" });
    if (inputRef.current) inputRef.current.value = "";
  };

  const showDropzone = parse.kind === "idle" || parse.kind === "error";

  return (
    <>
      <PageHeader
        eyebrow="Run a roster"
        title="Payroll, in one transaction."
        description="Upload a CSV with wallet + amount columns. Save it once, rerun it every cycle."
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
        <AnimatePresence mode="wait" initial={false}>
          {showDropzone ? (
            <motion.label
              key="dropzone"
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
                const file = e.dataTransfer.files?.[0];
                if (file) void handleFile(file);
              }}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
              className={cn(
                "group relative flex cursor-pointer flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl border border-dashed border-border bg-card/40 px-8 py-14 text-center transition-colors",
                "hover:border-primary/40 hover:bg-card/60",
                drag && "border-primary/60 bg-primary/5",
              )}
            >
              <input
                ref={inputRef}
                id="roster-upload"
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleFile(file);
                }}
              />

              <motion.div
                aria-hidden="true"
                initial={{ scale: 0.92, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{
                  delay: 0.08,
                  type: "spring",
                  stiffness: 320,
                  damping: 22,
                }}
                className="grid size-12 place-items-center rounded-2xl border border-primary/20 bg-primary/10 text-primary"
              >
                <HugeiconsIcon icon={Upload01Icon} size={20} strokeWidth={1.6} />
              </motion.div>

              <div className="flex flex-col gap-1">
                <p className="text-[15px] font-medium text-foreground">
                  Drop your roster CSV
                </p>
                <p className="text-[13px] text-muted-foreground">
                  Columns: wallet, amount. Optional: label. Up to 1,000 rows.
                </p>
              </div>

              <span className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-border bg-background/60 px-3 py-1 font-mono text-[11px] text-muted-foreground">
                <HugeiconsIcon icon={Coins01Icon} size={11} strokeWidth={2} />
                SOL · USDC · USDT
              </span>

              {parse.kind === "error" && (
                <div className="mt-3 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-[12px] text-destructive">
                  <HugeiconsIcon
                    icon={Alert02Icon}
                    size={12}
                    strokeWidth={2.2}
                  />
                  <span>
                    <span className="font-mono">{parse.fileName}</span>:{" "}
                    {parse.message}
                  </span>
                </div>
              )}
            </motion.label>
          ) : (
            <ParsedSummary
              key="parsed"
              state={parse}
              onReset={reset}
            />
          )}
        </AnimatePresence>

        {parse.kind === "idle" && (
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
        )}
      </div>
    </>
  );
}

function ParsedSummary({
  state,
  onReset,
}: {
  state: Extract<ParseState, { kind: "ready" } | { kind: "parsing" }>;
  onReset: () => void;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col gap-4 rounded-2xl border border-border bg-card/60 p-6 sm:p-8"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Roster
          </p>
          <p className="mt-1 truncate font-mono text-[13.5px] text-foreground">
            {state.fileName}
          </p>
          {state.kind === "ready" && (
            <p className="mt-1 text-[12.5px] text-muted-foreground">
              {state.result.rows.length} row
              {state.result.rows.length === 1 ? "" : "s"} parsed
              {state.result.errors.length > 0 &&
                ` · ${state.result.errors.length} issue${state.result.errors.length === 1 ? "" : "s"}`}
            </p>
          )}
          {state.kind === "parsing" && (
            <p className="mt-1 text-[12.5px] text-muted-foreground">Parsing…</p>
          )}
        </div>

        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background/60 px-2.5 py-1.5 text-[12px] text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive"
        >
          <HugeiconsIcon icon={Delete02Icon} size={12} strokeWidth={2} />
          Clear
        </button>
      </div>

      {state.kind === "ready" && state.result.errors.length > 0 && (
        <ul className="flex flex-col gap-1.5 rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-[12px] text-destructive">
          {state.result.errors.slice(0, 5).map((err, i) => (
            <li key={i} className="flex items-start gap-2">
              <HugeiconsIcon
                icon={Alert02Icon}
                size={12}
                strokeWidth={2.2}
                className="mt-0.5 shrink-0"
              />
              <span>
                {err.rowNumber !== null ? `Row ${err.rowNumber}: ` : ""}
                {err.message}
              </span>
            </li>
          ))}
          {state.result.errors.length > 5 && (
            <li className="text-muted-foreground">
              +{state.result.errors.length - 5} more
            </li>
          )}
        </ul>
      )}

      {state.kind === "ready" && state.result.rows.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-left text-[12.5px]">
            <thead>
              <tr className="border-b border-border bg-background/40 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                <th className="px-3 py-2 font-medium">#</th>
                <th className="px-3 py-2 font-medium">Wallet</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border font-mono">
              {state.result.rows.slice(0, 10).map((row) => (
                <tr key={row.rowNumber}>
                  <td className="px-3 py-2 text-[11px] text-muted-foreground">
                    {row.rowNumber}
                  </td>
                  <td className="px-3 py-2 text-foreground/90">
                    {shortAddr(row.wallet) || (
                      <span className="text-destructive">missing</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-foreground/90">
                    {row.amount || (
                      <span className="text-destructive">missing</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {state.result.rows.length > 10 && (
            <p className="border-t border-border bg-background/40 px-3 py-1.5 text-[11px] text-muted-foreground">
              Showing 10 of {state.result.rows.length} rows. Full preview
              + per-row validation comes next.
            </p>
          )}
        </div>
      )}
    </motion.section>
  );
}

function shortAddr(s: string): string {
  if (!s) return "";
  if (s.length <= 12) return s;
  return `${s.slice(0, 6)}…${s.slice(-6)}`;
}
