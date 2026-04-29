"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import * as React from "react";

import { solanaConfig } from "@/lib/solana/config";

import { loadPayments, type PaymentRecord } from "./payment-history";

const EMPTY: PaymentRecord[] = [];

export function usePaymentHistory(): {
  records: PaymentRecord[];
  ready: boolean;
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
        if (e.key.startsWith("cloak:payments:v1:")) notify();
      };
      window.addEventListener("cloak:payments-updated", onCustom);
      window.addEventListener("storage", onStorage);
      return () => {
        window.removeEventListener("cloak:payments-updated", onCustom);
        window.removeEventListener("storage", onStorage);
      };
    },
    [sender],
  );

  const cacheRef = React.useRef<{
    sender: string | null;
    serialized: string;
    value: PaymentRecord[];
  }>({ sender: null, serialized: "[]", value: EMPTY });

  const getSnapshot = React.useCallback(() => {
    if (typeof window === "undefined") return EMPTY;
    const fresh = loadPayments(sender, solanaConfig.cluster);
    const serialized = JSON.stringify(fresh);
    const cache = cacheRef.current;
    if (cache.sender === sender && cache.serialized === serialized) {
      return cache.value;
    }
    cacheRef.current = { sender, serialized, value: fresh };
    return fresh;
  }, [sender]);

  const records = React.useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => EMPTY,
  );

  const ready =
    typeof window !== "undefined" && (sender !== null || records.length === 0);

  return { records, ready };
}
