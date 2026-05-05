"use client";

import {
  deriveUtxoKeypairFromSpendKey,
  type SpendKey,
  type Utxo,
} from "@cloak.dev/sdk";
import { PublicKey } from "@solana/web3.js";

import type { SolanaCluster } from "@/lib/solana/config";

const STORAGE_PREFIX = "cloak:owned-utxos:v1";
const MAX_UTXOS = 500;

export type UtxoSource = "deposit" | "transfer" | "change";

export type StoredUtxo = {
  // bigints stored as decimal strings since localStorage is JSON
  amount: string;
  blinding: string;
  commitment: string;
  index: number;
  siblingCommitment?: string;
  mint: string;
  source: UtxoSource;
  addedAt: number;
  addSig: string;
  isSpent?: boolean;
  spentAt?: number;
  spentSig?: string;
};

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
    new CustomEvent("cloak:utxos-updated", {
      detail: { wallet, cluster },
    }),
  );
}

function isStoredUtxo(value: unknown): value is StoredUtxo {
  if (!value || typeof value !== "object") return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.amount === "string" &&
    typeof r.blinding === "string" &&
    typeof r.commitment === "string" &&
    typeof r.index === "number" &&
    typeof r.mint === "string" &&
    typeof r.source === "string" &&
    typeof r.addedAt === "number" &&
    typeof r.addSig === "string"
  );
}

export function loadUtxos(
  wallet: string | null | undefined,
  cluster: SolanaCluster,
): StoredUtxo[] {
  if (!isBrowser() || !wallet) return [];
  try {
    const raw = window.localStorage.getItem(key(wallet, cluster));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isStoredUtxo);
  } catch {
    return [];
  }
}

function persist(
  wallet: string,
  cluster: SolanaCluster,
  next: StoredUtxo[],
): StoredUtxo[] {
  if (!isBrowser()) return next;
  try {
    window.localStorage.setItem(key(wallet, cluster), JSON.stringify(next));
    notify(wallet, cluster);
  } catch {
    // ignore quota / serialization errors
  }
  return next;
}

export function appendUtxos(
  wallet: string,
  cluster: SolanaCluster,
  records: StoredUtxo[],
): StoredUtxo[] {
  if (!records.length) return loadUtxos(wallet, cluster);
  const current = loadUtxos(wallet, cluster);
  const seen = new Set(current.map((u) => u.commitment));
  const additions = records.filter((r) => !seen.has(r.commitment));
  if (!additions.length) return current;
  const next = [...additions, ...current].slice(0, MAX_UTXOS);
  return persist(wallet, cluster, next);
}

export function markSpent(
  wallet: string,
  cluster: SolanaCluster,
  commitments: string[],
  spentSig: string,
): StoredUtxo[] {
  if (!commitments.length) return loadUtxos(wallet, cluster);
  const set = new Set(commitments);
  const now = Date.now();
  const current = loadUtxos(wallet, cluster);
  const next = current.map((u) =>
    set.has(u.commitment) && !u.isSpent
      ? { ...u, isSpent: true, spentAt: now, spentSig }
      : u,
  );
  return persist(wallet, cluster, next);
}

export function clearUtxos(wallet: string, cluster: SolanaCluster): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(key(wallet, cluster));
    notify(wallet, cluster);
  } catch {
    // ignore
  }
}

// SDK pads outputs to 2; the synthetic zero note is spendable but not
// balance-relevant, so we drop it here.
export function utxosToStored(
  utxos: Utxo[],
  ownerPubkey: bigint,
  source: UtxoSource,
  addSig: string,
  addedAt: number = Date.now(),
): StoredUtxo[] {
  return utxos
    .filter(
      (u) =>
        u.amount > 0n &&
        u.keypair.publicKey === ownerPubkey &&
        typeof u.index === "number" &&
        u.commitment !== undefined,
    )
    .map((u) => ({
      amount: u.amount.toString(),
      blinding: u.blinding.toString(),
      commitment: u.commitment!.toString(),
      index: u.index!,
      siblingCommitment: u.siblingCommitment?.toString(),
      mint: u.mintAddress.toBase58(),
      source,
      addedAt,
      addSig,
    }));
}

// Re-derives the UTXO keypair from the spend key. Spend key bytes never
// touch storage; this is the only legitimate way to revive a stored note.
export async function hydrateUtxo(
  stored: StoredUtxo,
  spendKey: SpendKey,
): Promise<Utxo> {
  const keypair = await deriveUtxoKeypairFromSpendKey(spendKey.sk_spend);
  return {
    amount: BigInt(stored.amount),
    keypair,
    blinding: BigInt(stored.blinding),
    mintAddress: new PublicKey(stored.mint),
    index: stored.index,
    commitment: BigInt(stored.commitment),
    siblingCommitment: stored.siblingCommitment
      ? BigInt(stored.siblingCommitment)
      : undefined,
  };
}
