import type { Utxo } from "@cloak.dev/sdk";
import { PublicKey } from "@solana/web3.js";

import type { SolanaCluster } from "@/lib/solana/config";

const STORAGE_PREFIX = "cloak:pending-swaps:v1";
const MAX_ENTRIES = 50;

// Status meanings:
//  - pending     : swap was submitted to relay; awaiting settlement.
//  - settled     : relay reported success; output token landed at recipient ATA.
//  - refunded    : settlement failed and the auto-refund (fullWithdraw) ran ok.
//  - needs-recovery : settlement failed AND the refund failed too. The
//    deposit is still in the shielded pool, owned by a UTXO keypair that
//    is deterministically re-derivable from the wallet sig — recovery
//    is a manual fullWithdraw using the persisted note metadata.
export type PendingSwapStatus =
  | "pending"
  | "settled"
  | "refunded"
  | "needs-recovery";

// Serialized form of a SDK `Utxo`. bigints become decimal strings, the mint
// becomes a base58 string. `keypair.publicKey` and `keypair.privateKey` are
// bigints in the SDK's internal field-element representation.
export type SerializedUtxo = {
  amount: string;
  blinding: string;
  mint: string;
  index?: number;
  commitment?: string;
  siblingCommitment?: string;
  keypair: {
    publicKey: string;
    privateKey: string;
  };
};

export type PendingSwapRecord = {
  /** Unique id; we use the deposit signature so the record is stable across
   *  retries and across devices that share the same wallet (deposit sig is
   *  globally unique). */
  id: string;
  cluster: SolanaCluster;
  wallet: string;
  depositSignature: string;
  /** Tx1 signature (transact_swap). Not known until after the relay accepts. */
  swapSignature: string | null;
  /** Relay request id used for status polling. */
  requestId: string | null;
  /** Tx2 signature (settlement). Set when status = settled. */
  settlementSignature: string | null;
  /** Refund tx signature when status = refunded. */
  refundSignature: string | null;
  recipientAta: string;
  sellMint: string;
  buyMint: string;
  sellAmountRaw: string;
  minOutRaw: string;
  /** Persisted deposit output UTXOs needed to refund the deposit. Includes
   *  the SDK-deterministic keypair so recovery doesn't depend on the
   *  originating tab/session. */
  outputUtxos: SerializedUtxo[];
  status: PendingSwapStatus;
  /** Last error surfaced for status = needs-recovery. */
  error?: string;
  createdAt: number;
  updatedAt: number;
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
    new CustomEvent("cloak:pending-swaps-updated", {
      detail: { wallet, cluster },
    }),
  );
}

function isRecord(value: unknown): value is PendingSwapRecord {
  if (!value || typeof value !== "object") return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.cluster === "string" &&
    typeof r.wallet === "string" &&
    typeof r.depositSignature === "string" &&
    typeof r.recipientAta === "string" &&
    typeof r.sellMint === "string" &&
    typeof r.buyMint === "string" &&
    typeof r.sellAmountRaw === "string" &&
    typeof r.minOutRaw === "string" &&
    Array.isArray(r.outputUtxos) &&
    typeof r.status === "string" &&
    typeof r.createdAt === "number" &&
    typeof r.updatedAt === "number"
  );
}

export function loadPendingSwaps(
  wallet: string | null | undefined,
  cluster: SolanaCluster,
): PendingSwapRecord[] {
  if (!isBrowser() || !wallet) return [];
  try {
    const raw = window.localStorage.getItem(key(wallet, cluster));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRecord);
  } catch {
    return [];
  }
}

function persist(
  wallet: string,
  cluster: SolanaCluster,
  next: PendingSwapRecord[],
): PendingSwapRecord[] {
  if (!isBrowser()) return next;
  try {
    window.localStorage.setItem(key(wallet, cluster), JSON.stringify(next));
    notify(wallet, cluster);
  } catch {
    // ignore quota / serialization
  }
  return next;
}

export function appendPendingSwap(
  wallet: string,
  cluster: SolanaCluster,
  record: Omit<PendingSwapRecord, "createdAt" | "updatedAt"> & {
    createdAt?: number;
    updatedAt?: number;
  },
): PendingSwapRecord {
  const now = Date.now();
  const full: PendingSwapRecord = {
    ...record,
    createdAt: record.createdAt ?? now,
    updatedAt: record.updatedAt ?? now,
  };
  const current = loadPendingSwaps(wallet, cluster);
  const without = current.filter((r) => r.id !== full.id);
  const next = [full, ...without].slice(0, MAX_ENTRIES);
  persist(wallet, cluster, next);
  return full;
}

export function updatePendingSwap(
  wallet: string,
  cluster: SolanaCluster,
  id: string,
  patch: Partial<Omit<PendingSwapRecord, "id" | "wallet" | "cluster">>,
): PendingSwapRecord | null {
  const current = loadPendingSwaps(wallet, cluster);
  const idx = current.findIndex((r) => r.id === id);
  if (idx < 0) return null;
  const merged: PendingSwapRecord = {
    ...current[idx],
    ...patch,
    updatedAt: Date.now(),
  };
  const next = [...current];
  next[idx] = merged;
  persist(wallet, cluster, next);
  return merged;
}

export function removePendingSwap(
  wallet: string,
  cluster: SolanaCluster,
  id: string,
): void {
  const current = loadPendingSwaps(wallet, cluster);
  const next = current.filter((r) => r.id !== id);
  if (next.length === current.length) return;
  persist(wallet, cluster, next);
}

export function serializeUtxo(utxo: Utxo): SerializedUtxo {
  return {
    amount: utxo.amount.toString(),
    blinding: utxo.blinding.toString(),
    mint: utxo.mintAddress.toBase58(),
    index: utxo.index,
    commitment: utxo.commitment?.toString(),
    siblingCommitment: utxo.siblingCommitment?.toString(),
    keypair: {
      publicKey: utxo.keypair.publicKey.toString(),
      privateKey: utxo.keypair.privateKey.toString(),
    },
  };
}

export function deserializeUtxo(stored: SerializedUtxo): Utxo {
  return {
    amount: BigInt(stored.amount),
    blinding: BigInt(stored.blinding),
    mintAddress: new PublicKey(stored.mint),
    index: stored.index,
    commitment:
      stored.commitment !== undefined ? BigInt(stored.commitment) : undefined,
    siblingCommitment:
      stored.siblingCommitment !== undefined
        ? BigInt(stored.siblingCommitment)
        : undefined,
    keypair: {
      publicKey: BigInt(stored.keypair.publicKey),
      privateKey: BigInt(stored.keypair.privateKey),
    },
  };
}

/** True for entries the user might want to act on (refund or re-poll). */
export function isUnresolved(record: PendingSwapRecord): boolean {
  return record.status === "pending" || record.status === "needs-recovery";
}
