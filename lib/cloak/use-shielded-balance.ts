"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import * as React from "react";

import { solanaConfig, type SolanaCluster } from "@/lib/solana/config";
import { getShieldTokenByMint, type ShieldTokenId } from "@/lib/cloak/tokens";
import {
  loadUtxos,
  type StoredUtxo,
} from "@/lib/cloak/utxo-store";

export type ShieldedBalances = Partial<Record<ShieldTokenId, bigint>>;

export type ShieldedBalanceState = {
  utxos: StoredUtxo[];
  unspent: StoredUtxo[];
  balances: ShieldedBalances;
};

const EMPTY_UTXOS: StoredUtxo[] = [];

const empty: ShieldedBalanceState = {
  utxos: EMPTY_UTXOS,
  unspent: EMPTY_UTXOS,
  balances: {},
};

// useSyncExternalStore requires referentially stable snapshots between
// renders when nothing has changed. localStorage reads + JSON.parse give
// fresh references each call, so cache and invalidate on subscribe events.
const snapshotCache = new Map<string, StoredUtxo[]>();

function snapshotKey(walletKey: string, cluster: SolanaCluster): string {
  return `${cluster}:${walletKey}`;
}

function getStoredSnapshot(
  walletKey: string,
  cluster: SolanaCluster,
): StoredUtxo[] {
  const key = snapshotKey(walletKey, cluster);
  const cached = snapshotCache.get(key);
  if (cached) return cached;
  const snap = loadUtxos(walletKey, cluster);
  snapshotCache.set(key, snap);
  return snap;
}

function invalidateSnapshot(walletKey?: string, cluster?: SolanaCluster): void {
  if (walletKey && cluster) {
    snapshotCache.delete(snapshotKey(walletKey, cluster));
  } else {
    snapshotCache.clear();
  }
}

function compute(utxos: StoredUtxo[]): ShieldedBalanceState {
  if (utxos.length === 0) return empty;
  const unspent = utxos.filter((u) => !u.isSpent);
  const balances: ShieldedBalances = {};
  for (const u of unspent) {
    const token = getShieldTokenByMint(u.mint);
    if (!token) continue;
    const prev = balances[token.id] ?? 0n;
    balances[token.id] = prev + BigInt(u.amount);
  }
  return { utxos, unspent, balances };
}

/**
 * Owned shielded UTXOs + per-token balances for the connected wallet on the
 * active cluster. Subscribes to `cloak:utxos-updated` (same-tab writes) and
 * `storage` (cross-tab writes) via useSyncExternalStore so renders only
 * happen when the underlying notes change.
 */
export function useShieldedBalance(): ShieldedBalanceState {
  const wallet = useWallet();
  const walletKey = wallet.publicKey?.toBase58() ?? null;
  const cluster = solanaConfig.cluster;

  const subscribe = React.useCallback(
    (onChange: () => void) => {
      if (!walletKey || typeof window === "undefined") return () => {};

      const onCustom = (e: Event) => {
        const detail = (
          e as CustomEvent<{ wallet: string; cluster: string }>
        ).detail;
        if (detail?.wallet === walletKey && detail.cluster === cluster) {
          invalidateSnapshot(walletKey, cluster);
          onChange();
        }
      };
      const onStorage = (e: StorageEvent) => {
        if (e.key?.startsWith("cloak:owned-utxos:v1:")) {
          invalidateSnapshot();
          onChange();
        }
      };

      window.addEventListener("cloak:utxos-updated", onCustom);
      window.addEventListener("storage", onStorage);
      return () => {
        window.removeEventListener("cloak:utxos-updated", onCustom);
        window.removeEventListener("storage", onStorage);
      };
    },
    [walletKey, cluster],
  );

  const getSnapshot = React.useCallback(() => {
    if (!walletKey) return EMPTY_UTXOS;
    return getStoredSnapshot(walletKey, cluster);
  }, [walletKey, cluster]);

  const getServerSnapshot = React.useCallback(() => EMPTY_UTXOS, []);

  const utxos = React.useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  return React.useMemo(() => compute(utxos), [utxos]);
}
