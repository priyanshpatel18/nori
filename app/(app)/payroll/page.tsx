"use client";

import {
  Alert02Icon,
  ArrowRight01Icon,
  CheckmarkCircle01Icon,
  Coins01Icon,
  Delete02Icon,
  ArrowReloadHorizontalIcon,
  Upload01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AnimatePresence, motion } from "motion/react";
import * as React from "react";

import { useWallet } from "@solana/wallet-adapter-react";
import Link from "next/link";

import { PageHeader } from "@/components/app-shell/page-header";
import { EmptyState } from "@/components/cloak/empty-state";
import { SolanaLogo, UsdcLogo, UsdtLogo } from "@/components/logos";
import { ConnectButton } from "@/components/solana/connect-button";
import { DueBanner } from "@/components/team/due-banner";
import { DueRunDialog } from "@/components/team/due-run-dialog";
import { FancyButton } from "@/components/ui/fancy-button";
import {
  appendPayment,
  formatBaseUnits,
} from "@/lib/cloak/payment-history";
import {
  getShieldToken,
  isShieldTokenSupported,
  type ShieldTokenId,
} from "@/lib/cloak/tokens";
import { checkPreflightBalance } from "@/lib/cloak/preflight";
import {
  useBatchPayroll,
  type BatchRowState,
  type BatchRowStatus,
  type BatchRunSummary,
} from "@/lib/cloak/use-batch-payroll";
import { useWalletBalances } from "@/lib/cloak/use-wallet-balances";
import {
  parsePayrollCsv,
  type PayrollParseResult,
} from "@/lib/payroll/parse-csv";
import {
  describeRowIssue,
  totalsFor,
  validateRows,
  type ValidatedRow,
} from "@/lib/payroll/validate";
import { solanaConfig } from "@/lib/solana/config";
import { solscanTxUrl } from "@/lib/solana/explorer";
import { useDueMembers } from "@/lib/team/use-due-members";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

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
  const wallet = useWallet();
  const [drag, setDrag] = React.useState(false);
  const [parse, setParse] = React.useState<ParseState>({ kind: "idle" });
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const due = useDueMembers();
  const [runOpen, setRunOpen] = React.useState(false);

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
        title="Payroll, one transaction."
        description="Upload a CSV. One signature covers the whole batch, every recipient paid privately from the shielded pool."
      />

      <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 md:px-8 md:py-8">
        <DueBanner
          total={due.total}
          groups={due.groups}
          onRunNow={() => setRunOpen(true)}
        />

        <AnimatePresence mode="wait" initial={false}>
          {!wallet.connected ? (
            <EmptyState
              key="connect"
              icon={
                <HugeiconsIcon
                  icon={Upload01Icon}
                  size={20}
                  strokeWidth={1.6}
                />
              }
              title="Connect a wallet to run payroll"
              description="Payroll signs from the connected wallet and pays each recipient privately. Connect to upload a roster."
              action={<ConnectButton />}
            />
          ) : showDropzone ? (
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
                "group relative flex cursor-pointer flex-col items-center justify-center gap-4 overflow-hidden rounded-[8px] border border-dashed border-border bg-background/40 px-6 py-12 text-center transition-colors sm:px-8 sm:py-16",
                "hover:border-primary/40 hover:bg-background/60",
                drag && "border-primary/60 bg-primary/[0.04]",
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

              <span
                aria-hidden="true"
                className="grid size-9 place-items-center rounded-md border border-border bg-background/60 text-foreground/70"
              >
                <HugeiconsIcon icon={Upload01Icon} size={16} strokeWidth={1.7} />
              </span>

              <div className="flex flex-col gap-1.5">
                <p className="text-[15px] font-medium tracking-tight text-foreground">
                  Drop your roster CSV
                </p>
                <p className="text-[13px] text-foreground/55">
                  Columns: wallet, amount. Optional: label. Up to 1,000 rows.
                </p>
              </div>

              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/60 px-2.5 py-1 font-mono text-[11px] text-foreground/55">
                <HugeiconsIcon icon={Coins01Icon} size={11} strokeWidth={2} />
                {TOKEN_OPTIONS.filter((t) => isShieldTokenSupported(t.id))
                  .map((t) => t.label)
                  .join(" · ")}
              </span>

              {parse.kind === "error" && (
                <div className="mt-3 flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-[12px] text-destructive">
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

      </div>

      <DueRunDialog
        open={runOpen}
        groups={due.groups}
        onClose={() => setRunOpen(false)}
      />
    </>
  );
}

const TOKEN_OPTIONS: {
  id: ShieldTokenId;
  label: string;
  Logo: React.ComponentType<{ className?: string }>;
}[] = [
  { id: "SOL", label: "SOL", Logo: SolanaLogo },
  { id: "USDC", label: "USDC", Logo: UsdcLogo },
  { id: "USDT", label: "USDT", Logo: UsdtLogo },
];

function ParsedSummary({
  state,
  onReset,
}: {
  state: Extract<ParseState, { kind: "ready" } | { kind: "parsing" }>;
  onReset: () => void;
}) {
  const [tokenId, setTokenId] = React.useState<ShieldTokenId>("USDC");
  const shieldToken = React.useMemo(() => getShieldToken(tokenId), [tokenId]);
  const tokenSupported = isShieldTokenSupported(tokenId);
  const wallet = useWallet();
  const batch = useBatchPayroll();
  const walletBalances = useWalletBalances();

  const validated: ValidatedRow[] = React.useMemo(() => {
    if (state.kind !== "ready" || !shieldToken) return [];
    return validateRows(state.result.rows, shieldToken);
  }, [state, shieldToken]);

  const totals = React.useMemo(() => totalsFor(validated), [validated]);

  const tokenDecimals = shieldToken?.decimals ?? 0;

  const canRun =
    batch.status === "idle" &&
    tokenSupported &&
    wallet.connected &&
    totals.validCount > 0;

  const runLabel =
    batch.status === "running"
      ? batch.phase === "depositing-proof"
        ? `Shielding · ${Math.round(batch.depositPercent)}%`
        : batch.phase === "depositing-submit"
          ? "Submitting deposit"
          : `Paying ${runProgress(batch.rows)}`
      : batch.status === "done"
        ? "Run complete"
        : !wallet.connected
          ? "Connect wallet to run"
          : totals.validCount === 0
            ? "No valid rows"
            : `Run payroll (${totals.validCount})`;

  const onRun = React.useCallback(async () => {
    if (!shieldToken || !wallet.publicKey) return;
    const validRows = validated.filter((r) => r.isValid);
    const validById = new Map(validRows.map((r) => [r.row.rowNumber, r]));

    const preflight = checkPreflightBalance({
      amountBaseUnits: totals.totalBaseUnits,
      decimals: shieldToken.decimals,
      symbol: tokenId,
      tokenId,
      operations: validRows.length,
      walletBalances: walletBalances.balances,
    });
    if (!preflight.ok) {
      toast.error(preflight.reason, { description: preflight.description });
      return;
    }

    const outcome = await batch.run({
      rows: validRows.map((r) => ({
        id: r.row.rowNumber,
        recipient: r.wallet,
        amountBaseUnits: r.amountBaseUnits!,
        netBaseUnits: r.netBaseUnits!,
      })),
      mint: shieldToken.mint,
      tokenId,
      decimals: shieldToken.decimals,
    });

    if (!outcome || !wallet.publicKey) return;

    const sender = wallet.publicKey.toBase58();
    for (const result of outcome.results) {
      if (!result.ok) continue;
      const r = validById.get(result.id);
      if (!r) continue;
      // The whole batch shares one deposit; each row has its own payout sig.
      // Use payoutSig as the record id so /history shows N distinct rows.
      appendPayment(sender, solanaConfig.cluster, {
        id: result.payoutSig,
        cluster: solanaConfig.cluster,
        sender,
        recipient: r.wallet,
        token: tokenId,
        mint: shieldToken.mint.toBase58(),
        decimals: shieldToken.decimals,
        amountRaw: r.amountBaseUnits!.toString(),
        netRaw: r.netBaseUnits!.toString(),
        depositSignature: outcome.depositSignature,
        withdrawSignature: result.payoutSig,
        timestamp: Date.now(),
        batchId: outcome.depositSignature,
        source: "payroll",
      });
    }
  }, [batch, shieldToken, tokenId, validated, wallet.publicKey, totals, walletBalances]);

  const onRetryFailed = React.useCallback(async () => {
    const runId = batch.summary?.runId;
    if (!runId || !shieldToken || !wallet.publicKey) return;
    const outcome = await batch.retryFailed(runId);
    if (!outcome || !wallet.publicKey) return;
    const sender = wallet.publicKey.toBase58();
    for (const result of outcome.results) {
      if (!result.ok) continue;
      appendPayment(sender, solanaConfig.cluster, {
        id: result.payoutSig,
        cluster: solanaConfig.cluster,
        sender,
        recipient: result.recipient,
        token: tokenId,
        mint: shieldToken.mint.toBase58(),
        decimals: shieldToken.decimals,
        amountRaw: result.amountRaw,
        netRaw: result.netRaw,
        depositSignature: outcome.depositSignature,
        withdrawSignature: result.payoutSig,
        timestamp: Date.now(),
        batchId: outcome.depositSignature,
        source: "payroll",
      });
    }
  }, [batch, shieldToken, tokenId, wallet.publicKey]);

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      className="flex min-h-0 flex-1 flex-col gap-5 rounded-[8px] border border-border bg-card/60 p-4 sm:p-5 md:p-6"
    >
      <div className="flex shrink-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col">
          <p className="text-[13px] text-foreground/55">Roster</p>
          <p className="mt-1 truncate font-mono text-[13.5px] text-foreground">
            {state.fileName}
          </p>
          {state.kind === "ready" && (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[10.5px]">
              <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-1.5 py-0.5 uppercase tracking-[0.18em] text-primary">
                <HugeiconsIcon
                  icon={CheckmarkCircle01Icon}
                  size={10}
                  strokeWidth={2}
                />
                {totals.validCount} valid
              </span>
              {totals.invalidCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full border border-destructive/30 bg-destructive/10 px-1.5 py-0.5 uppercase tracking-[0.18em] text-destructive">
                  <HugeiconsIcon
                    icon={Alert02Icon}
                    size={10}
                    strokeWidth={2}
                  />
                  {totals.invalidCount} invalid
                </span>
              )}
              {state.result.errors.length > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary/60 px-1.5 py-0.5 uppercase tracking-[0.18em] text-foreground/60">
                  {state.result.errors.length} parse issue
                  {state.result.errors.length === 1 ? "" : "s"}
                </span>
              )}
            </div>
          )}
          {state.kind === "parsing" && (
            <p className="mt-1 text-[12.5px] text-foreground/55">Parsing…</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-0.5 rounded-md border border-border bg-background/60 p-0.5">
            {TOKEN_OPTIONS.filter((t) => isShieldTokenSupported(t.id)).map((t) => {
              const isActive = tokenId === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTokenId(t.id)}
                  className={cn(
                    "relative flex items-center gap-1.5 rounded-sm px-2.5 py-2 text-[12px] font-medium transition-colors sm:py-1.5",
                    isActive
                      ? "text-foreground"
                      : "text-foreground/55 hover:text-foreground",
                  )}
                >
                  {isActive && (
                    <motion.span
                      layoutId="payroll-token-active"
                      aria-hidden="true"
                      className="absolute inset-0 -z-0 rounded-sm bg-secondary/80"
                      transition={{
                        type: "spring",
                        stiffness: 380,
                        damping: 30,
                      }}
                    />
                  )}
                  <span className="relative z-10 flex items-center gap-1.5">
                    <t.Logo className="size-3.5" />
                    {t.label}
                  </span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background/60 px-2.5 py-2 text-[12px] text-foreground/65 transition-colors hover:border-destructive/40 hover:text-destructive sm:py-1.5"
          >
            <HugeiconsIcon icon={Delete02Icon} size={12} strokeWidth={2} />
            Clear
          </button>
        </div>
      </div>

      {!tokenSupported && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
          <HugeiconsIcon icon={Alert02Icon} size={12} strokeWidth={2.2} />
          {tokenId} is not available on {solanaConfig.cluster}.
        </div>
      )}

      {state.kind === "ready" && state.result.errors.length > 0 && (
        <ul className="flex flex-col gap-1.5 rounded-[6px] border border-destructive/20 bg-destructive/5 p-3 text-[12px] text-destructive">
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

      {state.kind === "ready" &&
        validated.length > 0 &&
        shieldToken &&
        !batch.summary && (
          <PreviewTable
            rows={validated}
            tokenId={tokenId}
            decimals={tokenDecimals}
            execRows={batch.rows}
            activeRowId={batch.activeRowId}
            activeStartedAt={batch.activeStartedAt}
          />
        )}

      {state.kind === "ready" && validated.length > 0 && !batch.summary && (
        <TotalsCard
          totals={totals}
          tokenId={tokenId}
          tokenDecimals={tokenDecimals}
        />
      )}

      {state.kind === "ready" && validated.length > 0 && !batch.summary && (
        <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <FancyButton
            type="button"
            variant="primary"
            size="lg"
            disabled={!canRun}
            onClick={onRun}
          >
            {runLabel}
            <HugeiconsIcon
              icon={ArrowRight01Icon}
              size={14}
              strokeWidth={2.2}
            />
          </FancyButton>

          {(batch.phase === "depositing-proof" ||
            batch.phase === "depositing-submit") && (
            <span className="inline-flex items-center gap-2 text-[12px] text-muted-foreground">
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/40" />
                <span className="relative inline-flex size-1.5 rounded-full bg-primary" />
              </span>
              <span className="truncate">
                {batch.depositProgress ?? "Shielding into pool"}
              </span>
            </span>
          )}
        </div>
      )}

      {state.kind === "ready" && batch.summary && (
        <Receipt
          summary={batch.summary}
          validated={validated}
          execRows={batch.rows}
          retrying={batch.status === "running"}
          onRetryFailed={
            batch.summary.runId && batch.summary.failed > 0
              ? onRetryFailed
              : null
          }
          onRunAnother={() => {
            batch.reset();
            onReset();
          }}
        />
      )}
    </motion.section>
  );
}

function Receipt({
  summary,
  validated,
  execRows,
  retrying,
  onRetryFailed,
  onRunAnother,
}: {
  summary: BatchRunSummary;
  validated: ValidatedRow[];
  execRows: Record<number, BatchRowState>;
  retrying: boolean;
  onRetryFailed: (() => void | Promise<void>) | null;
  onRunAnother: () => void;
}) {
  const durationSeconds = (summary.finishedAt - summary.startedAt) / 1000;
  const validRows = validated.filter((r) => r.isValid);
  const invalidSkipped = validated.length - validRows.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
      className="flex min-h-0 flex-1 flex-col gap-5 rounded-[8px] border border-border bg-background/40 p-4 sm:p-5 md:p-6"
    >
      <div className="flex shrink-0 items-start gap-3">
        <motion.span
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1], delay: 0.05 }}
          className="flex size-8 shrink-0 items-center justify-center rounded-full border border-primary/40 bg-primary/10 text-primary"
          aria-hidden="true"
        >
          <HugeiconsIcon
            icon={CheckmarkCircle01Icon}
            size={16}
            strokeWidth={2}
          />
        </motion.span>
        <div className="flex flex-col">
          <h3 className="text-[16px] font-medium tracking-tight text-foreground">
            Roster complete
          </h3>
          <p className="mt-1 text-[12.5px] leading-5 text-foreground/65">
            <span className="font-medium text-foreground">
              {summary.confirmed} of {summary.total}
            </span>{" "}
            confirmed
            {summary.failed > 0 && (
              <>
                {" · "}
                <span className="font-medium text-destructive">
                  {summary.failed} failed
                </span>
              </>
            )}
            {" · "}
            {durationSeconds.toFixed(1)}s
            {invalidSkipped > 0 && ` · ${invalidSkipped} skipped`}
          </p>
          <p className="mt-1 font-mono text-[11px] text-foreground/55">
            Total: <span className="text-foreground/75">[redacted]</span>
          </p>
          {summary.depositSignature && (
            <p className="mt-1 text-[11px] text-foreground/55">
              Batch deposit:{" "}
              <a
                href={solscanTxUrl(summary.depositSignature)}
                target="_blank"
                rel="noreferrer"
                className="link-underline font-mono text-foreground/85"
              >
                {shortSig(summary.depositSignature)} ↗
              </a>
            </p>
          )}
        </div>
      </div>

      <div className="flex max-h-[360px] min-h-0 flex-1 flex-col overflow-hidden rounded-[6px] border border-border bg-background/40">
        <div className="scrollbar-cloak min-h-0 flex-1 overflow-x-auto overflow-y-auto">
          <table className="w-full min-w-[480px] text-left text-[12.5px]">
            <thead className="sticky top-0 z-10 bg-background/80 backdrop-blur">
              <tr className="border-b border-border text-[11px] text-foreground/55">
                <th className="px-4 py-2.5 font-normal">#</th>
                <th className="px-4 py-2.5 font-normal">Recipient</th>
                <th className="px-4 py-2.5 font-normal">Outcome</th>
                <th className="px-4 py-2.5 text-right font-normal">Tx</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {validRows.map((r) => {
                const exec = execRows[r.row.rowNumber];
                const isConfirmed = exec?.status === "confirmed";
                const isFailed = exec?.status === "failed";
                return (
                  <tr
                    key={r.row.rowNumber}
                    className={cn(
                      isFailed && "bg-destructive/[0.06]",
                      isConfirmed && "bg-primary/[0.025]",
                    )}
                  >
                    <td className="px-4 py-3 font-mono text-[11px] text-foreground/55">
                      {r.row.rowNumber}
                    </td>
                    <td className="px-4 py-3 font-mono text-foreground">
                      {shortAddr(r.wallet)}
                    </td>
                    <td className="px-4 py-3">
                      {isConfirmed ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.18em] text-primary">
                          <HugeiconsIcon
                            icon={CheckmarkCircle01Icon}
                            size={10}
                            strokeWidth={2}
                          />
                          confirmed
                        </span>
                      ) : isFailed ? (
                        <span
                          title={exec?.errorMessage}
                          className="inline-flex items-center gap-1 rounded-full border border-destructive/40 bg-destructive/10 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.18em] text-destructive"
                        >
                          <HugeiconsIcon
                            icon={Alert02Icon}
                            size={10}
                            strokeWidth={2}
                          />
                          {truncate(exec?.errorMessage ?? "failed", 40)}
                        </span>
                      ) : (
                        <span className="text-foreground/40">·</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isConfirmed && exec?.payoutSignature ? (
                        <a
                          href={solscanTxUrl(exec.payoutSignature)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-md border border-border bg-background/60 px-2 py-1 font-mono text-[11px] text-foreground transition-colors hover:bg-secondary/80"
                          title="Open payout on Solscan"
                        >
                          <span>{shortSig(exec.payoutSignature)}</span>
                          <span aria-hidden="true">↗</span>
                        </a>
                      ) : (
                        <span className="text-foreground/40">·</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {onRetryFailed && (
          <FancyButton
            type="button"
            variant="primary"
            size="md"
            disabled={retrying}
            onClick={() => {
              void onRetryFailed();
            }}
          >
            {retrying ? (
              <>
                <span className="relative flex size-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary-foreground/40" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-primary-foreground" />
                </span>
                Retrying {runProgress(execRows)}
              </>
            ) : (
              <>
                Retry {summary.failed} failed
                <HugeiconsIcon
                  icon={ArrowReloadHorizontalIcon}
                  size={14}
                  strokeWidth={2.2}
                />
              </>
            )}
          </FancyButton>
        )}
        <FancyButton
          type="button"
          variant={onRetryFailed ? "neutral" : "primary"}
          size="md"
          disabled={retrying}
          onClick={onRunAnother}
        >
          Run another roster
          <HugeiconsIcon icon={ArrowRight01Icon} size={14} strokeWidth={2.2} />
        </FancyButton>
        <Link
          href="/history"
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background/60 px-3 py-2 text-[12.5px] text-foreground/85 transition-colors hover:border-primary/30 hover:text-foreground"
        >
          View in history
          <span aria-hidden="true">→</span>
        </Link>
      </div>
    </motion.div>
  );
}

function shortSig(sig: string): string {
  if (sig.length <= 10) return sig;
  return `${sig.slice(0, 4)}…${sig.slice(-4)}`;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

function runProgress(rows: Record<number, BatchRowState>): string {
  const ids = Object.keys(rows);
  const total = ids.length;
  if (total === 0) return "";
  const done = ids.filter((id) => {
    const s = rows[Number(id)]?.status;
    return s === "confirmed" || s === "failed";
  }).length;
  return `${done}/${total}`;
}

function PreviewTable({
  rows,
  tokenId,
  decimals,
  execRows,
  activeRowId,
  activeStartedAt,
}: {
  rows: ValidatedRow[];
  tokenId: ShieldTokenId;
  decimals: number;
  execRows: Record<number, BatchRowState>;
  activeRowId: number | null;
  activeStartedAt: number | null;
}) {
  // Tick once a second so the active row's elapsed timer updates without
  // re-rendering the whole table on every event from the SDK.
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (activeRowId === null || activeStartedAt === null) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [activeRowId, activeStartedAt]);
  const activeElapsedMs =
    activeStartedAt !== null ? Math.max(0, now - activeStartedAt) : 0;

  return (
    <div className="flex max-h-[360px] min-h-0 flex-1 flex-col overflow-hidden rounded-[6px] border border-border bg-background/40">
      <div className="scrollbar-cloak min-h-0 flex-1 overflow-x-auto overflow-y-auto">
        <table className="w-full min-w-[560px] text-left text-[12.5px]">
          <thead className="sticky top-0 z-10 bg-background/80 backdrop-blur">
            <tr className="border-b border-border text-[11px] text-foreground/55">
              <th className="px-4 py-2.5 font-normal">#</th>
              <th className="px-4 py-2.5 font-normal">Wallet</th>
              <th className="px-4 py-2.5 text-right font-normal">Amount</th>
              <th className="px-4 py-2.5 text-right font-normal">Net</th>
              <th className="px-4 py-2.5 text-right font-normal">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => {
              const exec = execRows[r.row.rowNumber];
              const isActive = activeRowId === r.row.rowNumber;
              return (
                <tr
                  key={r.row.rowNumber}
                  className={cn(
                    "transition-colors",
                    !r.isValid && "bg-destructive/5",
                    isActive && "bg-primary/[0.04]",
                    exec?.status === "confirmed" && "bg-primary/[0.03]",
                    exec?.status === "failed" && "bg-destructive/[0.08]",
                  )}
                >
                  <td className="px-4 py-3 font-mono text-[11px] text-foreground/55">
                    {r.row.rowNumber}
                  </td>
                  <td
                    className={cn(
                      "px-4 py-3 font-mono",
                      r.walletIssue ? "text-destructive" : "text-foreground",
                    )}
                  >
                    {r.wallet ? shortAddr(r.wallet) : "·"}
                    {r.walletIssue && (
                      <span className="ml-2 font-sans text-[10.5px] uppercase tracking-[0.16em]">
                        {describeRowIssue(r.walletIssue)}
                      </span>
                    )}
                  </td>
                  <td
                    className={cn(
                      "px-4 py-3 text-right tabular-nums",
                      r.amountIssue ? "text-destructive" : "text-foreground",
                    )}
                  >
                    {r.amount || "·"}{" "}
                    <span className="text-foreground/55">{tokenId}</span>
                    {r.amountIssue && (
                      <div className="mt-0.5 font-sans text-[10.5px] uppercase tracking-[0.16em]">
                        {describeRowIssue(r.amountIssue)}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {r.isValid && r.netBaseUnits !== undefined ? (
                      <span className="text-primary">
                        {formatBaseUnits(r.netBaseUnits.toString(), decimals)}{" "}
                        <span className="text-foreground/55">{tokenId}</span>
                      </span>
                    ) : (
                      <span className="text-foreground/40">·</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <RowStatus
                      validRow={r.isValid}
                      exec={exec}
                      elapsedMs={isActive ? activeElapsedMs : null}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RowStatus({
  validRow,
  exec,
  elapsedMs,
}: {
  validRow: boolean;
  exec?: BatchRowState;
  elapsedMs: number | null;
}) {
  if (!validRow) {
    return (
      <span
        title="Invalid"
        className="inline-flex items-center gap-1 rounded-full border border-destructive/40 bg-destructive/10 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.18em] text-destructive"
      >
        <HugeiconsIcon icon={Alert02Icon} size={10} strokeWidth={2} />
        invalid
      </span>
    );
  }

  if (!exec || exec.status === "pending") {
    return (
      <span
        title="Queued"
        className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary/60 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.18em] text-foreground/60"
      >
        <span className="size-1 rounded-full bg-foreground/45" />
        queued
      </span>
    );
  }

  if (exec.status === "confirmed") {
    return (
      <span
        title="Confirmed"
        className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.18em] text-primary"
      >
        <HugeiconsIcon icon={CheckmarkCircle01Icon} size={10} strokeWidth={2} />
        ok
      </span>
    );
  }

  if (exec.status === "failed") {
    return (
      <span
        title={exec.errorMessage ?? "Failed"}
        className="inline-flex items-center gap-1 rounded-full border border-destructive/40 bg-destructive/10 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.18em] text-destructive"
      >
        <HugeiconsIcon icon={Alert02Icon} size={10} strokeWidth={2} />
        failed
      </span>
    );
  }

  // proving / submitting: small inline label with %, plus elapsed timer
  // so the row feels alive during the longer waits.
  const elapsedSec = elapsedMs !== null ? Math.floor(elapsedMs / 1000) : null;
  return (
    <span
      title={exec.progress ?? statusLabel(exec.status)}
      className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.18em] text-primary"
    >
      <span className="size-1 animate-pulse rounded-full bg-primary" />
      {phaseShort(exec.status)}
      {exec.proofPercent !== null && exec.status === "paying-proof" && (
        <span className="font-mono normal-case tracking-normal">
          {Math.round(exec.proofPercent)}%
        </span>
      )}
      {elapsedSec !== null && (
        <span className="font-mono normal-case tracking-normal text-primary/70">
          {elapsedSec}s
        </span>
      )}
    </span>
  );
}

function statusLabel(s: BatchRowStatus): string {
  switch (s) {
    case "paying-proof":
      return "Generating payout proof";
    case "paying-submit":
      return "Submitting payout";
    case "confirmed":
      return "Confirmed";
    case "failed":
      return "Failed";
    default:
      return "Pending";
  }
}

function phaseShort(s: BatchRowStatus): string {
  switch (s) {
    case "paying-proof":
      return "Payout";
    case "paying-submit":
      return "Settle";
    default:
      return "";
  }
}

function TotalsCard({
  totals,
  tokenId,
  tokenDecimals,
}: {
  totals: ReturnType<typeof totalsFor>;
  tokenId: ShieldTokenId;
  tokenDecimals: number;
}) {
  const fmt = (raw: bigint) => formatBaseUnits(raw.toString(), tokenDecimals);
  const fmtSol = (lamports: bigint) => formatBaseUnits(lamports.toString(), 9);
  return (
    <div className="shrink-0 rounded-[6px] border border-border bg-background/40">
      <div className="grid grid-cols-2 divide-x divide-border border-b border-border md:grid-cols-3">
        <Cell
          label="Gross"
          value={`${fmt(totals.totalBaseUnits)} ${tokenId}`}
        />
        <Cell
          label="Fee"
          value={`${fmt(totals.totalVariableFeeBaseUnits)} ${tokenId} + ${fmtSol(totals.totalFixedFeeLamports)} SOL`}
          muted
        />
        <Cell
          label="Net"
          value={`${fmt(totals.totalNetBaseUnits)} ${tokenId}`}
          accent
        />
      </div>
      <div className="grid grid-cols-3 divide-x divide-border text-[12px]">
        <FootCell label="Recipients" value={`${totals.validCount}`} />
        <FootCell label="Variable" value="0.30%" />
        <FootCell label="Network" value={`${totals.validCount} × 0.005 SOL`} />
      </div>
    </div>
  );
}

function Cell({
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
    <div className="flex flex-col gap-1 px-4 py-3.5">
      <span className="text-[11.5px] text-foreground/55">{label}</span>
      <span
        className={cn(
          "tabular-nums",
          accent && "text-primary",
          muted && "text-foreground/70",
          !accent && !muted && "text-foreground",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function FootCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 px-4 py-2.5">
      <span className="text-foreground/55">{label}</span>
      <span className="font-mono text-foreground/85 tabular-nums">{value}</span>
    </div>
  );
}

function shortAddr(s: string): string {
  if (!s) return "";
  if (s.length <= 12) return s;
  return `${s.slice(0, 6)}…${s.slice(-6)}`;
}
