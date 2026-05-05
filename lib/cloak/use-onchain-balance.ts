"use client";

import { scanTransactions } from "@cloak.dev/sdk";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import * as React from "react";

import { applyBufferPolyfill } from "@/lib/buffer-polyfill";
import { cloakConfig } from "@/lib/cloak/config";
import { createMemoizedSignMessage } from "@/lib/cloak/sign-message-cache";
import { deriveSpendKey } from "@/lib/cloak/spend-key";
import {
  clearOnChainBalance,
  computeBalanceByMint,
  countByType,
  loadOnChainBalance,
  mergeBalances,
  saveOnChainBalance,
  type OnChainBalanceByMint,
  type StoredOnChainBalance,
} from "@/lib/cloak/onchain-balance";
import { expandSpendKey } from "@cloak.dev/sdk";
import { solanaConfig, type SolanaCluster } from "@/lib/solana/config";

export type OnChainBalanceStatus = "idle" | "scanning" | "success" | "error";

export type UseOnChainBalance = {
  snapshot: StoredOnChainBalance | null;
  balanceByMint: OnChainBalanceByMint;
  status: OnChainBalanceStatus;
  progress: string | null;
  error: Error | null;
  /** Run an incremental scan from `lastSignature`. Triggers a wallet popup the first time per session to derive nk. */
  sync: () => Promise<StoredOnChainBalance>;
  /** Drop the cached snapshot and rescan from chain head. */
  reset: () => Promise<StoredOnChainBalance | null>;
};

// Cap each scan to a small window of signatures, same reasoning as the
// scan-received endpoint: large windows hit Helius free-tier rate limits.
// Subsequent calls advance the cursor incrementally.
const SCAN_LIMIT = 200;
const SCAN_BATCH_SIZE = 3;

export function useOnChainBalance(): UseOnChainBalance {
  const { connection } = useConnection();
  const wallet = useWallet();
  const walletKey = wallet.publicKey?.toBase58() ?? null;
  const cluster: SolanaCluster = solanaConfig.cluster;

  const cacheRef = React.useRef<{
    walletKey: string | null;
    serialized: string;
    value: StoredOnChainBalance | null;
  }>({ walletKey: null, serialized: "null", value: null });

  const subscribe = React.useCallback(
    (notify: () => void) => {
      if (typeof window === "undefined") return () => {};
      const onCustom = (e: Event) => {
        const detail = (e as CustomEvent<{ wallet: string; cluster: string }>)
          .detail;
        if (
          !detail ||
          (detail.wallet === walletKey && detail.cluster === cluster)
        ) {
          notify();
        }
      };
      const onStorage = (e: StorageEvent) => {
        if (!e.key) return;
        if (e.key.startsWith("cloak:onchain-balance:v1:")) notify();
      };
      window.addEventListener("cloak:onchain-balance-updated", onCustom);
      window.addEventListener("storage", onStorage);
      return () => {
        window.removeEventListener("cloak:onchain-balance-updated", onCustom);
        window.removeEventListener("storage", onStorage);
      };
    },
    [walletKey, cluster],
  );

  const getSnapshot = React.useCallback(() => {
    if (typeof window === "undefined") return cacheRef.current.value;
    const fresh = loadOnChainBalance(walletKey, cluster);
    const serialized = JSON.stringify(fresh);
    const cache = cacheRef.current;
    if (cache.walletKey === walletKey && cache.serialized === serialized) {
      return cache.value;
    }
    cacheRef.current = { walletKey, serialized, value: fresh };
    return fresh;
  }, [walletKey, cluster]);

  const snapshot = React.useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => null,
  );

  const [status, setStatus] = React.useState<OnChainBalanceStatus>("idle");
  const [progress, setProgress] = React.useState<string | null>(null);
  const [error, setError] = React.useState<Error | null>(null);
  const inflightRef = React.useRef<Promise<StoredOnChainBalance> | null>(null);

  const signMessageCacheRef = React.useRef<{
    publicKey: string | null;
    fn: ((message: Uint8Array) => Promise<Uint8Array>) | null;
  }>({ publicKey: null, fn: null });

  const sync = React.useCallback(async () => {
    if (!wallet.publicKey || !wallet.signMessage) {
      throw new Error(
        "Connect a wallet that supports signMessage to recover from chain.",
      );
    }
    if (inflightRef.current) return inflightRef.current;

    applyBufferPolyfill();

    const senderBase58 = wallet.publicKey.toBase58();
    const previous = loadOnChainBalance(senderBase58, cluster);

    setStatus("scanning");
    setError(null);
    setProgress(
      previous?.lastSignature
        ? "Checking for new shielded activity"
        : "Scanning shielded activity",
    );

    const run = (async (): Promise<StoredOnChainBalance> => {
      try {
        let memoized = signMessageCacheRef.current.fn;
        if (
          signMessageCacheRef.current.publicKey !== senderBase58 ||
          !memoized
        ) {
          memoized = createMemoizedSignMessage(wallet.signMessage!);
          signMessageCacheRef.current = {
            publicKey: senderBase58,
            fn: memoized,
          };
        }

        const { spendKey } = await deriveSpendKey(senderBase58, memoized);
        const expanded = expandSpendKey(spendKey.sk_spend);
        const nk = expanded.nsk;

        // Viewing-key-only mode (no walletPublicKey) so it discovers chain
        // notes addressed to nk regardless of who signed the tx — this is
        // the only way to surface shields done from a different origin.
        const result = await scanTransactions({
          connection,
          programId: cloakConfig.programId,
          viewingKeyNk: nk,
          limit: SCAN_LIMIT,
          batchSize: SCAN_BATCH_SIZE,
          untilSignature: previous?.lastSignature,
        });

        const delta = computeBalanceByMint(result);
        const merged = mergeBalances(previous?.balanceByMint, delta);
        const counts = countByType(result);

        const stored = saveOnChainBalance(senderBase58, cluster, {
          balanceByMint: merged,
          totalDepositCount:
            (previous?.totalDepositCount ?? 0) + counts.deposits,
          totalWithdrawCount:
            (previous?.totalWithdrawCount ?? 0) + counts.withdrawals,
          lastSignature: result.lastSignature ?? previous?.lastSignature,
        });

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
  }, [wallet, connection, cluster]);

  const reset = React.useCallback(async () => {
    if (!wallet.publicKey) return null;
    clearOnChainBalance(wallet.publicKey.toBase58(), cluster);
    return sync();
  }, [wallet.publicKey, cluster, sync]);

  return {
    snapshot,
    balanceByMint: snapshot?.balanceByMint ?? {},
    status,
    progress,
    error,
    sync,
    reset,
  };
}
