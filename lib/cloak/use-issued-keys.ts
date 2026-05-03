"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import * as React from "react";

import { solanaConfig } from "@/lib/solana/config";

import { loadKeys, type IssuedKey } from "./viewing-keys";

const EMPTY: IssuedKey[] = [];

export function useIssuedKeys(): {
  keys: IssuedKey[];
  ready: boolean;
  issuer: string | null;
} {
  const wallet = useWallet();
  const issuer = wallet.publicKey?.toBase58() ?? null;

  const subscribe = React.useCallback(
    (notify: () => void) => {
      if (!issuer || typeof window === "undefined") return () => {};
      const onCustom = (e: Event) => {
        const detail = (e as CustomEvent<{ wallet: string; cluster: string }>)
          .detail;
        if (
          !detail ||
          (detail.wallet === issuer && detail.cluster === solanaConfig.cluster)
        ) {
          notify();
        }
      };
      const onStorage = (e: StorageEvent) => {
        if (!e.key) return;
        if (e.key.startsWith("cloak:viewing-keys:v1:")) notify();
      };
      window.addEventListener("cloak:keys-updated", onCustom);
      window.addEventListener("storage", onStorage);
      return () => {
        window.removeEventListener("cloak:keys-updated", onCustom);
        window.removeEventListener("storage", onStorage);
      };
    },
    [issuer],
  );

  const cacheRef = React.useRef<{
    issuer: string | null;
    serialized: string;
    value: IssuedKey[];
  }>({ issuer: null, serialized: "[]", value: EMPTY });

  const getSnapshot = React.useCallback(() => {
    if (typeof window === "undefined") return EMPTY;
    const fresh = loadKeys(issuer, solanaConfig.cluster);
    const serialized = JSON.stringify(fresh);
    const cache = cacheRef.current;
    if (cache.issuer === issuer && cache.serialized === serialized) {
      return cache.value;
    }
    cacheRef.current = { issuer, serialized, value: fresh };
    return fresh;
  }, [issuer]);

  const keys = React.useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);

  const ready =
    typeof window !== "undefined" && (issuer !== null || keys.length === 0);

  return { keys, ready, issuer };
}
