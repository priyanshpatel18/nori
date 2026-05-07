"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import * as React from "react";

import { solanaConfig } from "@/lib/solana/config";

import {
  BATCH_QUEUE_EVENT,
  loadBatchRuns,
  pendingOrFailedRows,
  type BatchQueueRow,
  type BatchRun,
} from "./batch-queue";

const EMPTY: BatchRun[] = [];

export type RetryableBatchRun = BatchRun & {
  retryable: BatchQueueRow[];
};

export function useBatchQueue(): {
  runs: BatchRun[];
  retryable: RetryableBatchRun[];
  ready: boolean;
  sender: string | null;
} {
  const wallet = useWallet();
  const sender = wallet.publicKey?.toBase58() ?? null;

  const subscribe = React.useCallback(
    (notify: () => void) => {
      if (!sender || typeof window === "undefined") return () => {};
      const onCustom = (e: Event) => {
        const detail = (e as CustomEvent<{ sender: string; cluster: string }>)
          .detail;
        if (
          !detail ||
          (detail.sender === sender && detail.cluster === solanaConfig.cluster)
        ) {
          notify();
        }
      };
      const onStorage = (e: StorageEvent) => {
        if (!e.key) return;
        if (e.key.startsWith("cloak:batch-queue:v1:")) notify();
      };
      window.addEventListener(BATCH_QUEUE_EVENT, onCustom);
      window.addEventListener("storage", onStorage);
      return () => {
        window.removeEventListener(BATCH_QUEUE_EVENT, onCustom);
        window.removeEventListener("storage", onStorage);
      };
    },
    [sender],
  );

  const cacheRef = React.useRef<{
    sender: string | null;
    serialized: string;
    value: BatchRun[];
  }>({ sender: null, serialized: "[]", value: EMPTY });

  const getSnapshot = React.useCallback(() => {
    if (typeof window === "undefined") return EMPTY;
    const fresh = loadBatchRuns(sender, solanaConfig.cluster);
    const sorted = [...fresh].sort((a, b) => b.createdAt - a.createdAt);
    const serialized = JSON.stringify(sorted);
    const cache = cacheRef.current;
    if (cache.sender === sender && cache.serialized === serialized) {
      return cache.value;
    }
    cacheRef.current = { sender, serialized, value: sorted };
    return sorted;
  }, [sender]);

  const runs = React.useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);

  const retryable = React.useMemo<RetryableBatchRun[]>(() => {
    return runs
      .map((run) => ({ ...run, retryable: pendingOrFailedRows(run) }))
      .filter((run) => run.retryable.length > 0);
  }, [runs]);

  const ready =
    typeof window !== "undefined" && (sender !== null || runs.length === 0);

  return { runs, retryable, ready, sender };
}
