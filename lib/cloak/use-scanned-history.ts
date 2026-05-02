"use client";

import type { ComplianceReport } from "@cloak.dev/sdk";
import { useWallet } from "@solana/wallet-adapter-react";
import * as React from "react";

import { solanaConfig } from "@/lib/solana/config";

import {
  clearScan,
  isScanStale,
  loadScan,
  mergeReports,
  saveScan,
  selectReceivedTransactions,
  type ReceivedTransaction,
  type StoredScan,
} from "./scanned-history";

export type ScanStatus = "idle" | "scanning" | "success" | "error";

export type UseScannedHistory = {
  scan: StoredScan | null;
  received: ReceivedTransaction[];
  status: ScanStatus;
  progress: string | null;
  error: Error | null;
  /** Run (or re-run) a scan. Pure read — no wallet popup. */
  sync: () => Promise<StoredScan>;
  /** Drop the persisted cache and re-scan from chain head. */
  reset: () => Promise<StoredScan | null>;
};

// Re-scan in the background if the cached report is older than this. The
// API is incremental (only fetches NEW signatures since `lastSignature`),
// so this is cheap on the second hit.
const STALE_AFTER_MS = 5 * 60 * 1000;

export function useScannedHistory(): UseScannedHistory {
  const wallet = useWallet();
  const sender = wallet.publicKey?.toBase58() ?? null;

  // Stable view of the persisted scan, driven by storage events. Cached by
  // serialized payload so identical reads return the same object reference
  // and don't re-render unnecessarily.
  const cacheRef = React.useRef<{
    sender: string | null;
    serialized: string;
    value: StoredScan | null;
  }>({ sender: null, serialized: "null", value: null });

  const subscribe = React.useCallback(
    (notify: () => void) => {
      if (typeof window === "undefined") return () => {};
      const onCustom = (e: Event) => {
        const detail = (e as CustomEvent<{ wallet: string; cluster: string }>)
          .detail;
        if (
          !detail ||
          (detail.wallet === sender &&
            detail.cluster === solanaConfig.cluster)
        ) {
          notify();
        }
      };
      const onStorage = (e: StorageEvent) => {
        if (!e.key) return;
        if (e.key.startsWith("cloak:scanned:v1:")) notify();
      };
      window.addEventListener("cloak:scanned-updated", onCustom);
      window.addEventListener("storage", onStorage);
      return () => {
        window.removeEventListener("cloak:scanned-updated", onCustom);
        window.removeEventListener("storage", onStorage);
      };
    },
    [sender],
  );

  const getSnapshot = React.useCallback(() => {
    if (typeof window === "undefined") return cacheRef.current.value;
    const fresh = loadScan(sender, solanaConfig.cluster);
    const serialized = JSON.stringify(fresh);
    const cache = cacheRef.current;
    if (cache.sender === sender && cache.serialized === serialized) {
      return cache.value;
    }
    cacheRef.current = { sender, serialized, value: fresh };
    return fresh;
  }, [sender]);

  const scan = React.useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => null,
  );

  // Transient action state. Only mutated from inside `sync`.
  const [status, setStatus] = React.useState<ScanStatus>("idle");
  const [progress, setProgress] = React.useState<string | null>(null);
  const [error, setError] = React.useState<Error | null>(null);

  // Guard against overlapping syncs (e.g. auto-trigger racing the button).
  const inflightRef = React.useRef<Promise<StoredScan> | null>(null);

  const sync = React.useCallback(async () => {
    if (!sender) {
      throw new Error("Connect your wallet first.");
    }
    if (inflightRef.current) return inflightRef.current;

    const previous = loadScan(sender, solanaConfig.cluster);

    setStatus("scanning");
    setError(null);
    setProgress(
      previous?.report.lastSignature
        ? "Checking for new transactions"
        : "Scanning on-chain transactions",
    );

    const run = (async () => {
      try {
        const res = await fetch("/api/scan-received", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            wallet: sender,
            untilSignature: previous?.report.lastSignature,
          }),
        });
        if (!res.ok) {
          const detail = await safeReadError(res);
          throw new Error(detail);
        }
        const json = (await res.json()) as { report: ComplianceReport };

        const merged = mergeReports(previous?.report ?? null, json.report);
        const stored = saveScan(sender, solanaConfig.cluster, merged);
        setStatus("success");
        setProgress(null);
        return stored;
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        setError(e);
        setStatus("error");
        setProgress(null);
        throw e;
      } finally {
        inflightRef.current = null;
      }
    })();

    inflightRef.current = run;
    return run;
  }, [sender]);

  // Auto-sync once per (wallet, mount). Refreshes silently if the cache is
  // stale, otherwise no-ops. Uses a ref-keyed guard so the trigger fires for
  // a wallet at most once per mount even across re-renders.
  const autoSyncedFor = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!sender) return;
    if (autoSyncedFor.current === sender) return;
    autoSyncedFor.current = sender;
    const cached = loadScan(sender, solanaConfig.cluster);
    if (cached && !isScanStale(cached, STALE_AFTER_MS)) return;
    void sync().catch(() => {
      // Surfaced via `error` state.
    });
  }, [sender, sync]);

  const reset = React.useCallback(async () => {
    if (!sender) return null;
    clearScan(sender, solanaConfig.cluster);
    autoSyncedFor.current = null;
    return sync();
  }, [sender, sync]);

  const received = React.useMemo(
    () => selectReceivedTransactions(scan?.report),
    [scan],
  );

  return { scan, received, status, progress, error, sync, reset };
}

async function safeReadError(res: Response): Promise<string> {
  try {
    const json = (await res.json()) as { error?: string };
    if (json && typeof json.error === "string") return json.error;
  } catch {
    // not JSON
  }
  return `Scan failed (${res.status})`;
}
