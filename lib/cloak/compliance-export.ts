import {
  formatComplianceCsv,
  type ComplianceReport,
} from "@cloak.dev/sdk";

// The report we receive here was already produced by the SDK pipeline:
// scanTransactions → toComplianceReport (called server-side in
// /api/scan-received) and cached via useScannedHistory. Here we narrow it to
// a date window and hand it to formatComplianceCsv for the user-facing
// download.

/**
 * Slice a compliance report down to a [fromMs, toMs) window. `from = -Infinity`
 * and `to = +Infinity` are treated as "unbounded on that side". Returns the
 * original reference when the window is fully open so callers can avoid an
 * unnecessary copy.
 */
export function filterReportByRange(
  report: ComplianceReport,
  fromMs: number,
  toMs: number,
): ComplianceReport {
  if (
    fromMs === Number.NEGATIVE_INFINITY &&
    toMs === Number.POSITIVE_INFINITY
  ) {
    return report;
  }
  const transactions = report.transactions.filter(
    (tx) => tx.timestamp >= fromMs && tx.timestamp < toMs,
  );

  // Recompute summary so the CSV preamble reflects the filtered slice rather
  // than the full scan totals.
  let totalDeposits = 0;
  let totalWithdrawals = 0;
  let totalFees = 0;
  for (const tx of transactions) {
    if (tx.txType === "deposit") {
      totalDeposits += tx.amount;
    } else {
      totalWithdrawals += tx.amount;
      totalFees += tx.fee;
    }
  }
  const netChange = totalDeposits - totalWithdrawals;

  return {
    ...report,
    transactions,
    summary: {
      totalDeposits,
      totalWithdrawals,
      totalFees,
      netChange,
      transactionCount: transactions.length,
      finalBalance: netChange,
    },
  };
}

/** Produce the CSV bytes for a (possibly date-windowed) compliance report. */
export function buildComplianceCsv(
  report: ComplianceReport,
  fromMs: number,
  toMs: number,
): { csv: string; transactionCount: number } {
  const filtered = filterReportByRange(report, fromMs, toMs);
  return {
    csv: formatComplianceCsv(filtered),
    transactionCount: filtered.transactions.length,
  };
}

export function csvFilename(fromDate: string, toDate: string): string {
  const today = new Date().toISOString().slice(0, 10);
  if (fromDate && toDate) return `compliance-${fromDate}_to_${toDate}.csv`;
  if (fromDate) return `compliance-from-${fromDate}.csv`;
  if (toDate) return `compliance-to-${toDate}.csv`;
  return `compliance-${today}.csv`;
}

/** Trigger a browser download for `csv` under `filename`. SSR-safe no-op. */
export function downloadCsv(filename: string, csv: string): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Defer revoke so Safari has time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
