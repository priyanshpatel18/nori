import type { ComplianceReport } from "@cloak.dev/sdk";

import type { SolanaCluster } from "@/lib/solana/config";

const STORAGE_PREFIX = "cloak:scanned:v1";

export type StoredScan = {
  wallet: string;
  cluster: SolanaCluster;
  report: ComplianceReport;
  scannedAt: number;
};

export type ReceivedTransaction = ComplianceReport["transactions"][number];

function key(wallet: string, cluster: SolanaCluster): string {
  return `${STORAGE_PREFIX}:${cluster}:${wallet}`;
}

function isBrowser(): boolean {
  return (
    typeof window !== "undefined" && typeof window.localStorage !== "undefined"
  );
}

function notify(wallet: string, cluster: SolanaCluster): void {
  if (!isBrowser()) return;
  window.dispatchEvent(
    new CustomEvent("cloak:scanned-updated", {
      detail: { wallet, cluster },
    }),
  );
}

export function loadScan(
  wallet: string | null | undefined,
  cluster: SolanaCluster,
): StoredScan | null {
  if (!isBrowser() || !wallet) return null;
  try {
    const raw = window.localStorage.getItem(key(wallet, cluster));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredScan;
    if (!parsed || parsed.wallet !== wallet) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveScan(
  wallet: string,
  cluster: SolanaCluster,
  report: ComplianceReport,
): StoredScan {
  const stored: StoredScan = {
    wallet,
    cluster,
    report,
    scannedAt: Date.now(),
  };
  if (!isBrowser()) return stored;
  try {
    window.localStorage.setItem(key(wallet, cluster), JSON.stringify(stored));
    notify(wallet, cluster);
  } catch {
    // ignore quota / serialization errors
  }
  return stored;
}

export function clearScan(wallet: string, cluster: SolanaCluster): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(key(wallet, cluster));
    notify(wallet, cluster);
  } catch {
    // ignore
  }
}

// Pull "received" rows out of a scan: anything that ISN'T a deposit, since
// deposits are funds *this wallet* sent into the pool (already shown via the
// local payments cache as outgoing rows). Withdrawals / transfers / swaps
// landing on this wallet's ATA are incoming payments worth surfacing.
export function selectReceivedTransactions(
  report: ComplianceReport | null | undefined,
): ReceivedTransaction[] {
  if (!report) return [];
  return report.transactions
    .filter((tx) => tx.txType !== "deposit")
    .sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Merge a fresh delta scan into the prior cached report. Dedupes by
 * signature/commitment, recomputes summary totals from the merged set, and
 * advances `lastSignature` to the newest cursor so the next call only
 * fetches transactions newer than this one.
 */
export function mergeReports(
  prev: ComplianceReport | null | undefined,
  next: ComplianceReport,
): ComplianceReport {
  if (!prev) return next;

  const seen = new Set<string>();
  for (const tx of prev.transactions) {
    const key = tx.signature ?? tx.commitment;
    if (key) seen.add(key);
  }

  const fresh = next.transactions.filter((tx) => {
    const key = tx.signature ?? tx.commitment;
    return key ? !seen.has(key) : true;
  });

  const merged = [...fresh, ...prev.transactions].sort(
    (a, b) => b.timestamp - a.timestamp,
  );

  let totalDeposits = 0;
  let totalWithdrawals = 0;
  let totalFees = 0;
  for (const tx of merged) {
    if (tx.txType === "deposit") {
      totalDeposits += tx.amount;
    } else {
      totalWithdrawals += tx.amount;
      totalFees += tx.fee;
    }
  }
  const netChange = totalDeposits - totalWithdrawals;

  return {
    transactions: merged,
    summary: {
      totalDeposits,
      totalWithdrawals,
      totalFees,
      netChange,
      transactionCount: merged.length,
      finalBalance: netChange,
    },
    lastSignature: next.lastSignature ?? prev.lastSignature,
    rpcCallsMade: (prev.rpcCallsMade ?? 0) + next.rpcCallsMade,
  };
}

/** True when the cached scan is missing or older than `staleAfterMs`. */
export function isScanStale(
  scan: StoredScan | null,
  staleAfterMs: number,
): boolean {
  if (!scan) return true;
  return Date.now() - scan.scannedAt > staleAfterMs;
}
