"use client";

import {
  ArrowReloadHorizontalIcon,
  ArrowRight01Icon,
  ArrowUpRight01Icon,
  CheckmarkCircle01Icon,
  Delete02Icon,
  Download01Icon,
  EyeIcon,
  KeyIcon,
  Link01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AnimatePresence, motion } from "motion/react";
import * as React from "react";

import { PageHeader } from "@/components/app-shell/page-header";
import { EmptyState } from "@/components/cloak/empty-state";
import { ViewingKeyButton } from "@/components/cloak/viewing-key-button";
import { SolanaLogo, UsdcLogo, UsdtLogo } from "@/components/logos";
import { ConnectButton } from "@/components/solana/connect-button";
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
import { useIssuedKeys } from "@/lib/cloak/use-issued-keys";
import { useScannedHistory } from "@/lib/cloak/use-scanned-history";
import { useViewingKey } from "@/lib/cloak/use-viewing-key";
import {
  appendKey,
  buildAuditorUrl,
  deleteKey,
  formatKeyRange,
  generateKeyId,
  keyStatus,
  revokeKey,
  type IssuedKey,
} from "@/lib/cloak/viewing-keys";
import {
  resolveDecimals as resolveMintDecimals,
  resolveSymbol as resolveMintSymbol,
} from "@/lib/cloak/known-mints";
import { solanaConfig } from "@/lib/solana/config";
import { solscanAddressUrl, solscanTxUrl } from "@/lib/solana/explorer";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

export default function CompliancePage() {
  const { records } = usePaymentHistory();
  const {
    scan,
    received,
    status: scanStatus,
    sync: runScan,
  } = useScannedHistory();
  const handleSync = React.useCallback(() => {
    void runScan().catch(() => {
      // Errors are surfaced via the hook's `error` state and toast in the
      // existing /history flow; failing silently here keeps the compliance
      // page calm.
    });
  }, [runScan]);

  // YYYY-MM-DD strings, empty = unbounded. Shared between the issue-key
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
    const scanned = scan
      ? scan.report.transactions.filter(
          (tx) => tx.timestamp >= fromMs && tx.timestamp < toMs,
        )
      : [];

    // Outbound private transfers are invisible to the on-chain scan (relay-
    // submitted, no wallet sig), so the local payment-history records are the
    // only place they exist. Project them into the same shape and merge.
    const sendRows = filteredRecords.map(paymentRecordToDisplayTx);

    // The wallet-anchored scan does pick up the deposit phase of a Pay/Payroll
    // (the wallet signs the deposit). When a local send record references that
    // same depositSignature, keep the richer local row (it knows the
    // recipient and mint) and drop the bare scan deposit.
    const sendDepositSigs = new Set(
      filteredRecords.map((r) => r.depositSignature).filter(Boolean),
    );
    const dedupedScanned = scanned.filter(
      (tx) => !(tx.txType === "deposit" && tx.signature && sendDepositSigs.has(tx.signature)),
    );

    return [...sendRows, ...dedupedScanned].sort(
      (a, b) => b.timestamp - a.timestamp,
    );
  }, [scan, fromMs, toMs, filteredRecords]);

  // Issued viewing keys (live, persisted per wallet/cluster).
  const { keys: issuedKeys, issuer } = useIssuedKeys();

  // Viewing-key derivation is shared between the issue form (to attach a
  // working auditor link to the success banner) and active-key rows (where
  // the user copies a link for any previously-issued range). The nk is held
  // only in this hook's memory, never persisted.
  const viewingKey = useViewingKey();

  const ensureNkHex = React.useCallback(async (): Promise<string | null> => {
    if (viewingKey.state.status === "ready") {
      return viewingKey.state.material.nkHex;
    }
    const material = await viewingKey.reveal();
    return material?.nkHex ?? null;
  }, [viewingKey]);

  const handleIssueKey = React.useCallback(
    async (input: {
      auditor: string;
      email: string;
    }): Promise<{ record: IssuedKey; link: string } | null> => {
      if (!issuer) return null;
      const nkHex = await ensureNkHex();
      if (!nkHex) return null;
      const record: IssuedKey = {
        id: generateKeyId(),
        cluster: solanaConfig.cluster,
        issuer,
        auditor: input.auditor.trim(),
        fromDate,
        toDate,
        email: input.email.trim(),
        createdAt: Date.now(),
      };
      appendKey(issuer, solanaConfig.cluster, record);
      const link = await buildAuditorUrl({
        nkHex,
        wallet: issuer,
        fromDate,
        toDate,
        sentRecords: filteredRecords,
      });
      return { record, link };
    },
    [issuer, fromDate, toDate, ensureNkHex, filteredRecords],
  );

  const buildLinkForRecord = React.useCallback(
    async (record: IssuedKey): Promise<string | null> => {
      const nkHex = await ensureNkHex();
      if (!nkHex) return null;
      // Re-filter records against the issued key's own range (which may differ
      // from whatever the user has the date pickers set to right now).
      const recFromMs = record.fromDate
        ? Date.parse(record.fromDate)
        : Number.NEGATIVE_INFINITY;
      const recToMs = record.toDate
        ? Date.parse(record.toDate) + 86_400_000
        : Number.POSITIVE_INFINITY;
      const sentRecords = records.filter(
        (r) => r.timestamp >= recFromMs && r.timestamp < recToMs,
      );
      return buildAuditorUrl({
        nkHex,
        wallet: record.issuer,
        fromDate: record.fromDate,
        toDate: record.toDate,
        sentRecords,
      });
    },
    [ensureNkHex, records],
  );

  const handleRevokeKey = React.useCallback(
    (id: string) => {
      if (!issuer) return;
      revokeKey(issuer, solanaConfig.cluster, id);
    },
    [issuer],
  );

  const handleDeleteKey = React.useCallback(
    (id: string) => {
      if (!issuer) return;
      deleteKey(issuer, solanaConfig.cluster, id);
    },
    [issuer],
  );

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
    <div className="flex w-full flex-col lg:min-h-0 lg:flex-1 lg:overflow-hidden">
      <PageHeader
        eyebrow="Selective disclosure"
        title="Compliance"
        description="Hand a viewing key to one auditor. They reconstruct your ledger off-chain. The chain still sees nothing."
        actions={<ViewingKeyButton />}
      />

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 p-4 sm:p-6 lg:min-h-0 lg:flex-1 lg:p-8">
        {!issuer ? (
          <EmptyState
            icon={
              <HugeiconsIcon icon={KeyIcon} size={20} strokeWidth={1.6} />
            }
            title="Connect a wallet to issue viewing keys"
            description="Compliance keys are bound to your wallet so the auditor can verify the link to your account."
            action={<ConnectButton />}
          />
        ) : (
          <>
        <div className="shrink-0">
          <SummaryStats
            summaries={summaries}
            dateActive={dateActive}
            fromLabel={fromDate}
            toLabel={toDate}
          />
        </div>

        <div className="flex flex-col gap-3 lg:grid lg:min-h-0 lg:flex-1 lg:grid-cols-[1.4fr_1fr] lg:grid-rows-[minmax(0,1fr)]">
          <div className="flex flex-col lg:min-h-0" data-tour="compliance-issue">
            <IssueViewingKey
              fromDate={fromDate}
              toDate={toDate}
              onFromChange={setFromDate}
              onToChange={setToDate}
              onClear={clearDateRange}
              dateActive={dateActive}
              walletReady={Boolean(issuer)}
              onIssue={handleIssueKey}
              isDerivingKey={viewingKey.state.status === "deriving"}
            />
          </div>

          <div className="flex flex-col gap-3 lg:h-full lg:min-h-0">
            <div className="flex shrink-0 flex-col lg:scrollbar-cloak lg:max-h-[50%] lg:overflow-y-auto">
              <ActiveKeysCard
                keys={issuedKeys}
                walletReady={Boolean(issuer)}
                onRevoke={handleRevokeKey}
                onDelete={handleDeleteKey}
                onCopyLink={buildLinkForRecord}
                isDerivingKey={viewingKey.state.status === "deriving"}
              />
            </div>
            <TransactionsCard
              transactions={inRangeTransactions}
              hasScan={Boolean(scan)}
              dateActive={dateActive}
              onSelect={(tx) => setSelectedKey(tx.signature ?? tx.commitment)}
              onExport={handleExportCsv}
              onSync={handleSync}
              syncing={scanStatus === "scanning"}
              walletConnected={Boolean(issuer)}
            />
          </div>
        </div>
          </>
        )}
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
  walletReady,
  onIssue,
  isDerivingKey,
}: {
  fromDate: string;
  toDate: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  onClear: () => void;
  dateActive: boolean;
  walletReady: boolean;
  onIssue: (input: {
    auditor: string;
    email: string;
  }) => Promise<{ record: IssuedKey; link: string } | null>;
  isDerivingKey: boolean;
}) {
  const [auditor, setAuditor] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  const canSubmit =
    walletReady && auditor.trim().length > 0 && !submitting && !isDerivingKey;

  const handleSubmit = React.useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!canSubmit) return;
      setSubmitting(true);
      try {
        const issued = await onIssue({ auditor, email });
        if (!issued) return;
        toast.success("Key issued", {
          description: `Copy the auditor link for ${issued.record.auditor} from Active keys.`,
        });
        setAuditor("");
        setEmail("");
      } finally {
        setSubmitting(false);
      }
    },
    [canSubmit, onIssue, auditor, email],
  );

  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="flex min-h-0 flex-1 flex-col rounded-[8px] border border-border bg-card/60 p-4 sm:p-5"
    >
      <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-md border border-primary/40 bg-primary/10 text-primary">
            <HugeiconsIcon icon={KeyIcon} size={16} strokeWidth={1.6} />
          </div>
          <div className="min-w-0">
            <h2 className="text-[14.5px] font-medium tracking-tight text-foreground">
              Issue a viewing key
            </h2>
            <p className="text-[12.5px] text-foreground/65">
              Date-ranged, read-only, revocable.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="auditor">Auditor</Label>
          <Input
            id="auditor"
            placeholder="e.g. Trail of Bits"
            value={auditor}
            onChange={(e) => setAuditor(e.target.value)}
            autoComplete="off"
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="range-from">Date range</Label>
            {dateActive ? (
              <button
                type="button"
                onClick={onClear}
                className="text-[12px] text-foreground/55 transition-colors hover:text-foreground"
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
            <span
              aria-hidden="true"
              className="text-[12px] text-foreground/40"
            >
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
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="off"
          />
        </div>

        <FancyButton
          type="submit"
          variant="primary"
          size="lg"
          className="mt-auto self-start"
          disabled={!canSubmit}
          aria-busy={submitting || isDerivingKey || undefined}
          title={
            walletReady
              ? undefined
              : "Connect a wallet first to bind the key to your account."
          }
        >
          {isDerivingKey
            ? "Signing…"
            : submitting
              ? "Generating…"
              : "Generate viewing key"}
          <HugeiconsIcon icon={ArrowRight01Icon} size={14} strokeWidth={2.2} />
        </FancyButton>
      </form>
    </motion.section>
  );
}

function ActiveKeysCard({
  keys,
  walletReady,
  onRevoke,
  onDelete,
  onCopyLink,
  isDerivingKey,
}: {
  keys: IssuedKey[];
  walletReady: boolean;
  onRevoke: (id: string) => void;
  onDelete: (id: string) => void;
  onCopyLink: (record: IssuedKey) => Promise<string | null>;
  isDerivingKey: boolean;
}) {
  const activeCount = keys.filter((k) => keyStatus(k) === "active").length;

  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
      className="flex shrink-0 flex-col rounded-[8px] border border-border bg-card/60 p-4"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-[13px] font-medium tracking-tight text-foreground">
          Active keys
        </h3>
        <span className="font-mono text-[10.5px] text-foreground/55">
          {activeCount} issued
        </span>
      </div>

      {keys.length === 0 ? (
        <p className="mt-3 rounded-md border border-dashed border-border bg-background/30 px-3 py-5 text-center text-[12px] text-foreground/55">
          {walletReady
            ? "No keys issued yet. Use the form to hand one to an auditor."
            : "Connect a wallet to issue keys."}
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-1.5">
          <AnimatePresence initial={false}>
            {keys.map((k) => (
              <ActiveKeyRow
                key={k.id}
                k={k}
                onRevoke={onRevoke}
                onDelete={onDelete}
                onCopyLink={onCopyLink}
                isDerivingKey={isDerivingKey}
              />
            ))}
          </AnimatePresence>
        </ul>
      )}
    </motion.section>
  );
}

function ActiveKeyRow({
  k,
  onRevoke,
  onDelete,
  onCopyLink,
  isDerivingKey,
}: {
  k: IssuedKey;
  onRevoke: (id: string) => void;
  onDelete: (id: string) => void;
  onCopyLink: (record: IssuedKey) => Promise<string | null>;
  isDerivingKey: boolean;
}) {
  const status = keyStatus(k);
  const [copied, setCopied] = React.useState(false);
  const [copying, setCopying] = React.useState(false);

  const handleCopy = React.useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    setCopying(true);
    try {
      const link = await onCopyLink(k);
      if (!link) return;
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      // ignore, clipboard or sign rejection
    } finally {
      setCopying(false);
    }
  }, [k, onCopyLink]);

  React.useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1200);
    return () => clearTimeout(t);
  }, [copied]);

  const busy = copying || isDerivingKey;

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginTop: 0, paddingTop: 0, paddingBottom: 0 }}
      transition={{ duration: 0.22 }}
      className={cn(
        "group flex items-center gap-2.5 rounded-md border bg-background/40 px-2.5 py-2",
        status === "active" ? "border-border" : "border-border/60 opacity-70",
      )}
    >
      <span
        className={cn(
          "grid size-6 shrink-0 place-items-center rounded-md border",
          status === "active"
            ? "border-primary/40 bg-primary/10 text-primary"
            : "border-border bg-secondary/60 text-foreground/45",
        )}
      >
        <HugeiconsIcon icon={EyeIcon} size={11} strokeWidth={1.8} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] font-medium text-foreground">
          {k.auditor}
          {status === "revoked" ? (
            <span className="ml-1.5 inline-flex items-center rounded-full border border-border bg-secondary/60 px-1.5 py-px font-mono text-[9.5px] uppercase tracking-[0.18em] text-foreground/55">
              Revoked
            </span>
          ) : null}
        </p>
        <p className="truncate font-mono text-[10.5px] text-foreground/55">
          {formatKeyRange(k)} · {k.id}
        </p>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={handleCopy}
          disabled={status !== "active" || busy}
          aria-label={
            copied
              ? "Auditor link copied"
              : status === "active"
                ? "Copy auditor link"
                : "Auditor link unavailable for revoked keys"
          }
          title={
            status !== "active"
              ? "Revoked"
              : copied
                ? "Copied"
                : busy
                  ? "Signing…"
                  : "Copy auditor link"
          }
          className={cn(
            "text-foreground/55 transition-colors hover:text-foreground",
            (status !== "active" || busy) &&
              "cursor-not-allowed opacity-60 hover:text-foreground/55",
          )}
        >
          <HugeiconsIcon
            icon={copied ? CheckmarkCircle01Icon : Link01Icon}
            size={12}
            strokeWidth={1.8}
            className={cn(copied && "text-primary")}
          />
        </button>
        {status === "active" ? (
          <button
            type="button"
            onClick={() => onRevoke(k.id)}
            aria-label={`Revoke key for ${k.auditor}`}
            title="Revoke"
            className="text-foreground/55 transition-colors hover:text-destructive"
          >
            <HugeiconsIcon icon={Delete02Icon} size={12} strokeWidth={1.8} />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onDelete(k.id)}
            aria-label={`Remove key for ${k.auditor}`}
            title="Remove"
            className="text-foreground/55 transition-colors hover:text-destructive"
          >
            <HugeiconsIcon icon={Delete02Icon} size={12} strokeWidth={1.8} />
          </button>
        )}
      </div>
    </motion.li>
  );
}

function TransactionsCard({
  transactions,
  hasScan,
  dateActive,
  onSelect,
  onExport,
  onSync,
  syncing,
  walletConnected,
}: {
  transactions: ReceivedTransaction[];
  hasScan: boolean;
  dateActive: boolean;
  onSelect: (tx: ReceivedTransaction) => void;
  onExport: () => void;
  onSync: () => void;
  syncing: boolean;
  walletConnected: boolean;
}) {
  const count = transactions.length;
  const canExport = hasScan && count > 0;
  const hint = syncing
    ? "Syncing received from chain…"
    : !hasScan
      ? "Click Sync to read receives off-chain."
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
      className="flex min-h-0 flex-1 flex-col rounded-[8px] border border-border bg-card/60 p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-[13px] font-medium tracking-tight text-foreground">
            Transactions
          </h3>
          <p className="mt-0.5 truncate text-[11.5px] text-foreground/55">
            {hint}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={onSync}
            disabled={syncing || !walletConnected}
            aria-label="Sync received transactions from chain"
            title={
              walletConnected
                ? "Re-scan the chain for new receives, withdraws and swaps"
                : "Connect a wallet to sync"
            }
            className={cn(
              "inline-flex items-center gap-1 rounded-md border border-border bg-background/60 px-2.5 py-1.5 text-[11.5px] font-medium text-foreground/80 transition-colors",
              "hover:border-primary/30 hover:text-foreground",
              "disabled:cursor-not-allowed disabled:opacity-50",
            )}
          >
            <HugeiconsIcon
              icon={ArrowReloadHorizontalIcon}
              size={12}
              strokeWidth={2}
              className={cn(syncing && "animate-spin")}
            />
            {syncing ? "Syncing" : "Sync"}
          </button>
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
      </div>

      <ul className="scrollbar-cloak mt-3 flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pr-1">
        {transactions.map((tx, i) => (
          <TransactionRow
            key={tx.signature ?? tx.commitment}
            tx={tx}
            index={i}
            onSelect={onSelect}
          />
        ))}
        {transactions.length === 0 ? (
          <li className="grid place-items-center rounded-md border border-dashed border-border bg-background/30 px-3 py-6 text-center text-[12px] text-foreground/55">
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
  const mintForRow = (tx.outputMint ?? tx.mint ?? "").trim();
  const decimals = resolveMintDecimals(mintForRow, tx.decimals) ?? 9;
  const amount = formatBaseUnits(String(tx.netAmount), decimals);
  const symbol = resolveMintSymbol(mintForRow, tx.outputSymbol ?? tx.symbol);
  const sigShort = tx.signature
    ? `${tx.signature.slice(0, 4)}…${tx.signature.slice(-4)}`
    : `${tx.commitment.slice(0, 4)}…${tx.commitment.slice(-4)}`;
  const isOutgoing = isOutgoingTxType(tx.txType);

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
        className="group flex w-full items-center justify-between gap-2 rounded-md border border-border bg-background/40 px-2.5 py-2 text-left transition-colors hover:border-primary/30 hover:bg-background/60"
      >
        <div className="min-w-0">
          <p className="truncate text-[11.5px] font-medium text-foreground">
            <span
              className={cn(
                "mr-1.5 font-mono text-[9.5px] uppercase tracking-[0.16em]",
                isOutgoing ? "text-foreground/70" : "text-emerald-400",
              )}
            >
              {txTypeLabel(tx.txType)}
            </span>
            <span className="font-mono text-foreground">
              {isOutgoing ? "−" : "+"}
              {amount}
              {symbol ? (
                <span className="ml-1 text-foreground/55">{symbol}</span>
              ) : null}
            </span>
          </p>
          <p className="truncate font-mono text-[10.5px] text-foreground/55">
            {sigShort} · {formatTxDate(tx.timestamp)}
          </p>
        </div>
        <HugeiconsIcon
          icon={ArrowRight01Icon}
          size={12}
          strokeWidth={2}
          className="shrink-0 text-foreground/55 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
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
    case "send-transfer":
      return "Sent";
    case "send-swap":
      return "Swap (sent)";
    default:
      return txType || "Unknown";
  }
}

function isOutgoingTxType(txType: string): boolean {
  return (
    txType === "deposit" ||
    txType === "send-transfer" ||
    txType === "send-swap"
  );
}

// Project a local PaymentRecord into the same shape the rest of the
// dashboard renders. Send rows are tagged with synthetic txTypes so the
// row UI can render them as outgoing without colliding with the SDK's
// "transfer"/"swap" semantics (which mean *received* in scan results).
function paymentRecordToDisplayTx(r: PaymentRecord): ReceivedTransaction {
  const swap = r.swap;
  if (swap) {
    return {
      txType: "send-swap",
      amount: numberFromRaw(r.amountRaw),
      fee: Math.max(0, numberFromRaw(r.amountRaw) - numberFromRaw(r.netRaw)),
      netAmount: numberFromRaw(r.netRaw),
      runningBalance: 0,
      timestamp: r.timestamp,
      recipient: r.recipient,
      commitment: `pay-${r.id}`,
      signature: swap.settlementSignature ?? swap.swapSignature,
      mint: r.mint,
      decimals: r.decimals,
      symbol: r.token,
      outputMint: swap.outputMint,
      outputSymbol: swap.outputToken,
    };
  }
  return {
    txType: "send-transfer",
    amount: numberFromRaw(r.amountRaw),
    fee: Math.max(0, numberFromRaw(r.amountRaw) - numberFromRaw(r.netRaw)),
    netAmount: numberFromRaw(r.netRaw),
    runningBalance: 0,
    timestamp: r.timestamp,
    recipient: r.recipient,
    commitment: `pay-${r.id}`,
    // Per-row payout sig is unique; depositSignature collides across rows of
    // the same payroll batch and would clash with React's list keys.
    signature: r.withdrawSignature || r.depositSignature,
    mint: r.mint,
    decimals: r.decimals,
    symbol: r.token,
  };
}

function numberFromRaw(raw: string): number {
  // Base-unit string (already an integer); Number() is lossy beyond 2^53 but
  // matches how the SDK already returns these values.
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function formatTxDate(ms: number): string {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "-";
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
  const sellMint = (tx.mint ?? "").trim();
  const buyMint = (tx.outputMint ?? "").trim();
  const decimals = resolveMintDecimals(sellMint, tx.decimals) ?? 9;
  const symbol = resolveMintSymbol(sellMint, tx.symbol);
  const outputSymbol = resolveMintSymbol(buyMint, tx.outputSymbol);
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
          {isOutgoingTxType(tx.txType) ? "−" : "+"}
          {netAmount}
          {symbol ? (
            <span className="ml-1.5 text-[14px] text-foreground/55">
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
            className="flex items-center justify-between gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 py-2.5 text-[12.5px] text-foreground transition-colors hover:border-primary/60 hover:bg-primary/[0.14]"
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
            <span className="font-mono text-[10.5px] text-foreground/55">
              {tx.signature?.slice(0, 6)}…{tx.signature?.slice(-6)}
            </span>
          </a>
        ) : (
          <div className="rounded-md border border-dashed border-border bg-background/40 px-3 py-2.5 text-[12px] text-foreground/55">
            Signature not recorded, Solscan link unavailable.
          </div>
        )}

        <div className="flex flex-col gap-2">
          <p className="text-[12.5px] text-foreground/55">
            Raw fields
          </p>
          <dl className="grid grid-cols-1 divide-y divide-border/70 rounded-md border border-border bg-background/30 text-[12px]">
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
              value={tx.signature ?? "-"}
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
              value={tx.mint ?? "-"}
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
    <div className="flex flex-col gap-0.5 rounded-[6px] border border-border bg-background/40 px-3 py-2">
      <span className="text-[10.5px] text-foreground/55">
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
          <span className="ml-1 text-[10.5px] text-foreground/55">
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
      <dt className="shrink-0 text-[11.5px] text-foreground/55">
        {label}
      </dt>
      <dd className="min-w-0 flex-1 text-right">
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className={cn(
              "link-underline block truncate text-foreground",
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
          <span className="block truncate text-[10.5px] text-foreground/45">
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
    const symbol = resolveMintSymbol(mint, tx.outputSymbol ?? tx.symbol);
    const decimals = resolveMintDecimals(mint, tx.decimals) ?? 9;
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
      className="grid items-stretch gap-3 rounded-[8px] border border-border bg-card/60 p-4 sm:grid-cols-[auto_1fr]"
    >
      <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-start sm:justify-center sm:border-r sm:border-border/70 sm:pr-4">
        <div className="min-w-0">
          <p className="text-[12px] text-foreground/55">
            Account summary
          </p>
          <p className="mt-0.5 truncate text-[12px] text-foreground/55">
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
                      ? "border-primary/40 bg-primary/10 text-foreground"
                      : "border-border bg-background/60 text-foreground/55 hover:border-primary/30 hover:text-foreground",
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
    <div className="flex flex-col gap-0.5 rounded-[6px] border border-border bg-background/40 px-3 py-2">
      <span className="text-[10.5px] text-foreground/55">
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
