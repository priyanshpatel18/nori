"use client";

import {
  Alert02Icon,
  ArrowRight01Icon,
  CheckmarkCircle01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useWallet } from "@solana/wallet-adapter-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FancyButton } from "@/components/ui/fancy-button";
import {
  appendPayment,
  formatBaseUnits,
} from "@/lib/cloak/payment-history";
import { toBaseUnits } from "@/lib/cloak/tokens";
import { useBatchPayroll } from "@/lib/cloak/use-batch-payroll";
import { solanaConfig } from "@/lib/solana/config";
import { solscanTxUrl } from "@/lib/solana/explorer";
import { markMemberPaid } from "@/lib/team/storage";
import type { DueGroup } from "@/lib/team/use-due-members";
import { cn } from "@/lib/utils";

const VARIABLE_FEE_BPS = 30n;
const FIXED_FEE_LAMPORTS = 5_000_000n;

type GroupOutcome = {
  confirmed: number;
  failed: number;
  total: number;
  depositSignature: string | null;
};

export function DueRunDialog({
  open,
  groups,
  onClose,
}: {
  open: boolean;
  groups: DueGroup[];
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => (v ? null : onClose())}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Run scheduled payments</DialogTitle>
          <DialogDescription>
            One signature per token group. Each batch shields, then pays each
            recipient privately.
          </DialogDescription>
        </DialogHeader>

        {open && <DueRunBody groups={groups} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function DueRunBody({
  groups,
  onClose,
}: {
  groups: DueGroup[];
  onClose: () => void;
}) {
  const wallet = useWallet();
  const batch = useBatchPayroll();

  const [activeMint, setActiveMint] = React.useState<string | null>(null);
  const [outcomes, setOutcomes] = React.useState<Record<string, GroupOutcome>>({});
  const [allRunning, setAllRunning] = React.useState(false);

  const isRunning = batch.status === "running" || allRunning;
  const remainingGroups = groups.filter((g) => !outcomes[g.mint]);

  const runGroup = React.useCallback(async (group: DueGroup) => {
    if (!wallet.publicKey) return;
    if (batch.status !== "idle") batch.reset();

    setActiveMint(group.mint);

    const rows = group.members
      .filter((m) => m.schedule)
      .map((m, i) => ({
        memberId: m.id,
        amountBaseUnits: toBaseUnits(m.schedule!.amount, group.token.decimals),
        recipient: m.wallet,
        rowId: i + 1,
      }));

    const idToRow = new Map(rows.map((r) => [r.rowId, r]));

    const outcome = await batch.run({
      rows: rows.map((r) => ({
        id: r.rowId,
        recipient: r.recipient,
        amountBaseUnits: r.amountBaseUnits,
      })),
      mint: group.token.mint,
      tokenId: group.token.id,
      decimals: group.token.decimals,
    });

    if (!outcome) {
      setActiveMint(null);
      return;
    }

    const sender = wallet.publicKey.toBase58();

    for (const result of outcome.results) {
      if (!result.ok) continue;
      const row = idToRow.get(result.id);
      if (!row) continue;

      markMemberPaid(solanaConfig.cluster, row.memberId);

      const variableFee =
        (row.amountBaseUnits * VARIABLE_FEE_BPS) / 10_000n;
      const fixedDeducted =
        group.token.id === "SOL" ? FIXED_FEE_LAMPORTS : 0n;
      const net = row.amountBaseUnits - variableFee - fixedDeducted;
      const netSafe = net < 0n ? 0n : net;

      appendPayment(sender, solanaConfig.cluster, {
        id: result.payoutSig,
        cluster: solanaConfig.cluster,
        sender,
        recipient: row.recipient,
        token: group.token.id,
        mint: group.token.mint.toBase58(),
        decimals: group.token.decimals,
        amountRaw: row.amountBaseUnits.toString(),
        netRaw: netSafe.toString(),
        depositSignature: outcome.depositSignature,
        withdrawSignature: result.payoutSig,
        timestamp: Date.now(),
        batchId: outcome.depositSignature,
      });
    }

    setOutcomes((prev) => ({
      ...prev,
      [group.mint]: {
        confirmed: outcome.confirmed,
        failed: outcome.failed,
        total: outcome.total,
        depositSignature: outcome.depositSignature,
      },
    }));
    setActiveMint(null);
    batch.reset();
  }, [batch, wallet.publicKey]);

  const runAll = React.useCallback(async () => {
    if (!wallet.publicKey) return;
    setAllRunning(true);
    try {
      // Snapshot the unfinished groups now so the loop isn't influenced by
      // outcome-state updates between iterations.
      const pending = groups.filter((g) => !outcomes[g.mint]);
      for (const group of pending) {
        await runGroup(group);
      }
    } finally {
      setAllRunning(false);
    }
  }, [groups, outcomes, runGroup, wallet.publicKey]);

  const totalDueRows = groups.reduce((acc, g) => acc + g.members.length, 0);
  const remainingCount = remainingGroups.length;
  const completedCount = groups.length - remainingCount;
  const showPayAll = remainingCount > 0;

  return (
    <>
      {!wallet.connected && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12.5px] text-destructive">
          <HugeiconsIcon icon={Alert02Icon} size={12} strokeWidth={2.2} />
          Connect your wallet to run scheduled payments.
        </div>
      )}

      {showPayAll && (
        <div className="flex flex-col gap-3 rounded-xl border border-primary/40 bg-primary/10 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-4">
          <div className="flex flex-col">
            <p className="text-[13.5px] font-medium text-foreground">
              Pay all {totalDueRows} recipient
              {totalDueRows === 1 ? "" : "s"} in one click
            </p>
            <p className="mt-0.5 text-[11.5px] text-muted-foreground">
              {remainingCount === 1
                ? "1 wallet signature"
                : `${remainingCount} wallet signatures`}{" "}
              · one shielded deposit per token, then private payouts
              {completedCount > 0 && ` · ${completedCount} already done`}
            </p>
          </div>
          <FancyButton
            type="button"
            variant="primary"
            size="md"
            disabled={isRunning || !wallet.connected}
            onClick={runAll}
            className="self-stretch sm:self-auto"
          >
            {allRunning
              ? activeMint
                ? `Paying ${tokenLabelFor(groups, activeMint)}…`
                : "Running…"
              : "Pay all"}
            {!allRunning && (
              <HugeiconsIcon
                icon={ArrowRight01Icon}
                size={14}
                strokeWidth={2.2}
              />
            )}
          </FancyButton>
        </div>
      )}

      <div className="flex flex-col gap-4">
        {groups.map((group) => {
          const outcome = outcomes[group.mint];
          const running = activeMint === group.mint && isRunning;
          return (
            <GroupCard
              key={group.mint}
              group={group}
              outcome={outcome}
              running={running}
              disabled={isRunning || !wallet.connected}
              onRun={() => runGroup(group)}
            />
          );
        })}
      </div>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={isRunning}
        >
          {remainingCount === 0 ? "Done" : "Close"}
        </Button>
      </DialogFooter>
    </>
  );
}

function tokenLabelFor(groups: DueGroup[], mint: string): string {
  return groups.find((g) => g.mint === mint)?.token.id ?? "";
}

function GroupCard({
  group,
  outcome,
  running,
  disabled,
  onRun,
}: {
  group: DueGroup;
  outcome?: GroupOutcome;
  running: boolean;
  disabled: boolean;
  onRun: () => void;
}) {
  const totalRaw = group.members.reduce((acc, m) => {
    if (!m.schedule) return acc;
    try {
      return acc + toBaseUnits(m.schedule.amount, group.token.decimals);
    } catch {
      return acc;
    }
  }, 0n);
  const totalDisplay = formatBaseUnits(totalRaw.toString(), group.token.decimals);

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl border bg-card/40 p-4",
        outcome && outcome.failed === 0
          ? "border-primary/30"
          : outcome && outcome.failed > 0
            ? "border-destructive/30"
            : "border-border",
      )}
    >
      <header className="flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <p className="text-[13.5px] font-medium text-foreground">
            {group.members.length} {group.token.id} payment
            {group.members.length === 1 ? "" : "s"}
          </p>
          <p className="font-mono text-[11.5px] text-muted-foreground">
            Total {totalDisplay} {group.token.id}
          </p>
        </div>

        {outcome ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11.5px] font-medium",
              outcome.failed === 0
                ? "border-primary/40 bg-primary/15 text-primary"
                : "border-destructive/40 bg-destructive/10 text-destructive",
            )}
          >
            <HugeiconsIcon
              icon={
                outcome.failed === 0 ? CheckmarkCircle01Icon : Alert02Icon
              }
              size={11}
              strokeWidth={2.4}
            />
            {outcome.confirmed}/{outcome.total} paid
          </span>
        ) : (
          <FancyButton
            type="button"
            variant="primary"
            size="sm"
            disabled={disabled}
            onClick={onRun}
          >
            {running ? "Running…" : `Run ${group.members.length}`}
            {!running && (
              <HugeiconsIcon
                icon={ArrowRight01Icon}
                size={12}
                strokeWidth={2.2}
              />
            )}
          </FancyButton>
        )}
      </header>

      <ul className="flex flex-col divide-y divide-border/60 rounded-lg border border-border/60 bg-background/40">
        {group.members.map((m) => (
          <li
            key={m.id}
            className="flex items-center justify-between gap-3 px-3 py-2 text-[12.5px]"
          >
            <span className="flex min-w-0 flex-col">
              <span className="truncate font-medium text-foreground">
                {m.name}
              </span>
              <span className="truncate font-mono text-[11px] text-muted-foreground">
                {shortAddr(m.wallet)}
              </span>
            </span>
            <span className="shrink-0 font-mono text-[12px] text-foreground/90">
              {m.schedule?.amount} {group.token.id}
            </span>
          </li>
        ))}
      </ul>

      {outcome?.depositSignature && (
        <p className="text-[11px] text-muted-foreground">
          Batch deposit:{" "}
          <a
            href={solscanTxUrl(outcome.depositSignature)}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-foreground/80 underline underline-offset-2"
          >
            {shortSig(outcome.depositSignature)} ↗
          </a>
        </p>
      )}
    </div>
  );
}

function shortAddr(s: string): string {
  if (!s) return "";
  if (s.length <= 14) return s;
  return `${s.slice(0, 6)}…${s.slice(-6)}`;
}

function shortSig(s: string): string {
  if (s.length <= 10) return s;
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}
