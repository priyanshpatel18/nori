// Persistent per-row state for in-flight or partially-failed batch payroll
// runs. Survives page reload, so the UI can show "3/10 confirmed, 7 still
// to send" and (commit 3) re-run only the failed rows.
//
// localStorage rather than IndexedDB: the data is small (a few hundred
// bytes per row, dozens of rows per run, dozens of runs at most), the rest
// of the cloak/* persistence layer is localStorage, and a sync API keeps
// the run loop from having to await every state transition.

import type { SolanaCluster } from "@/lib/solana/config";

const STORAGE_PREFIX = "cloak:batch-queue:v1";
export const BATCH_QUEUE_EVENT = "cloak:batch-queue-updated";

export type BatchRowState =
  | "pending"
  | "in-flight"
  | "confirmed"
  | "failed";

export type BatchQueueRow = {
  rowId: number;
  recipient: string;
  /** Gross amount in base units (decimal string, bigint-safe). */
  amountRaw: string;
  /** What the recipient actually receives after fees, captured at run
   *  setup so the retry path can write payment-history without having to
   *  reconstruct the validation pipeline. */
  netRaw: string;
  state: BatchRowState;
  attempts: number;
  payoutSignature?: string;
  errorMessage?: string;
  lastAttemptAt?: number;
  confirmedAt?: number;
};

export type BatchRun = {
  /** `${sender}:${cluster}:${depositSignature}`, same shape as orphan-utxo-store ids
   *  so retry flows can reconcile change UTXOs with row state by id. */
  id: string;
  cluster: SolanaCluster;
  sender: string;
  tokenId: string;
  decimals: number;
  mint: string;
  totalRaw: string;
  depositSignature: string;
  createdAt: number;
  updatedAt: number;
  rows: BatchQueueRow[];
};

function key(sender: string, cluster: SolanaCluster): string {
  return `${STORAGE_PREFIX}:${cluster}:${sender}`;
}

function isBrowser(): boolean {
  return (
    typeof window !== "undefined" && typeof window.localStorage !== "undefined"
  );
}

function notify(sender: string, cluster: SolanaCluster): void {
  if (!isBrowser()) return;
  try {
    window.dispatchEvent(
      new CustomEvent(BATCH_QUEUE_EVENT, {
        detail: { sender, cluster },
      }),
    );
  } catch {
    // ignore
  }
}

function isQueueRow(value: unknown): value is BatchQueueRow {
  if (!value || typeof value !== "object") return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.rowId === "number" &&
    typeof r.recipient === "string" &&
    typeof r.amountRaw === "string" &&
    typeof r.netRaw === "string" &&
    typeof r.state === "string" &&
    (r.state === "pending" ||
      r.state === "in-flight" ||
      r.state === "confirmed" ||
      r.state === "failed") &&
    typeof r.attempts === "number"
  );
}

function isBatchRun(value: unknown): value is BatchRun {
  if (!value || typeof value !== "object") return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.cluster === "string" &&
    typeof r.sender === "string" &&
    typeof r.tokenId === "string" &&
    typeof r.decimals === "number" &&
    typeof r.mint === "string" &&
    typeof r.totalRaw === "string" &&
    typeof r.depositSignature === "string" &&
    typeof r.createdAt === "number" &&
    typeof r.updatedAt === "number" &&
    Array.isArray(r.rows) &&
    r.rows.every(isQueueRow)
  );
}

export function loadBatchRuns(
  sender: string | null | undefined,
  cluster: SolanaCluster,
): BatchRun[] {
  if (!isBrowser() || !sender) return [];
  try {
    const raw = window.localStorage.getItem(key(sender, cluster));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isBatchRun);
  } catch {
    return [];
  }
}

export function loadBatchRun(
  sender: string,
  cluster: SolanaCluster,
  id: string,
): BatchRun | undefined {
  return loadBatchRuns(sender, cluster).find((r) => r.id === id);
}

function persist(
  sender: string,
  cluster: SolanaCluster,
  next: BatchRun[],
): void {
  if (!isBrowser()) return;
  try {
    if (next.length === 0) {
      window.localStorage.removeItem(key(sender, cluster));
    } else {
      window.localStorage.setItem(key(sender, cluster), JSON.stringify(next));
    }
    notify(sender, cluster);
  } catch {
    // ignore quota / serialization errors
  }
}

export function saveBatchRun(
  sender: string,
  cluster: SolanaCluster,
  run: BatchRun,
): void {
  const current = loadBatchRuns(sender, cluster);
  const without = current.filter((r) => r.id !== run.id);
  persist(sender, cluster, [run, ...without]);
}

export function clearBatchRun(
  sender: string,
  cluster: SolanaCluster,
  id: string,
): void {
  const current = loadBatchRuns(sender, cluster);
  const next = current.filter((r) => r.id !== id);
  if (next.length === current.length) return;
  persist(sender, cluster, next);
}

export function updateBatchRow(
  sender: string,
  cluster: SolanaCluster,
  runId: string,
  rowId: number,
  patch: Partial<Omit<BatchQueueRow, "rowId">>,
): void {
  const current = loadBatchRuns(sender, cluster);
  const idx = current.findIndex((r) => r.id === runId);
  if (idx < 0) return;
  const run = current[idx];
  const rowIdx = run.rows.findIndex((r) => r.rowId === rowId);
  if (rowIdx < 0) return;
  const nextRow: BatchQueueRow = { ...run.rows[rowIdx], ...patch };
  const nextRows = [...run.rows];
  nextRows[rowIdx] = nextRow;
  current[idx] = { ...run, rows: nextRows, updatedAt: Date.now() };
  persist(sender, cluster, current);
}

// Mid-run page reloads leave rows stuck in "in-flight" because the partial
// withdraw promise died with the page. Reset those back to "pending" on
// hook mount so the UI doesn't claim work is happening when nothing is.
export function resetInFlightRows(
  sender: string,
  cluster: SolanaCluster,
): void {
  const current = loadBatchRuns(sender, cluster);
  let dirty = false;
  const next = current.map((run) => {
    let runDirty = false;
    const rows = run.rows.map((row) => {
      if (row.state !== "in-flight") return row;
      runDirty = true;
      return {
        ...row,
        state: "pending" as const,
        // Preserve attempts + lastAttemptAt; the row is just no longer
        // mid-flight. The retry path will pick it up from "pending".
      };
    });
    if (!runDirty) return run;
    dirty = true;
    return { ...run, rows, updatedAt: Date.now() };
  });
  if (dirty) persist(sender, cluster, next);
}

export function runIsComplete(run: BatchRun): boolean {
  return run.rows.every((r) => r.state === "confirmed");
}

export function pendingOrFailedRows(run: BatchRun): BatchQueueRow[] {
  return run.rows.filter(
    (r) => r.state === "pending" || r.state === "failed",
  );
}

export function buildRunId(
  sender: string,
  cluster: SolanaCluster,
  depositSignature: string,
): string {
  return `${sender}:${cluster}:${depositSignature}`;
}
