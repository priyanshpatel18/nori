// Persists the change UTXO + ephemeral keypair from a batch deposit so a
// failed/reloaded run leaves residual funds recoverable via fullWithdraw.

import type { SolanaCluster } from "@/lib/solana/config";

const STORAGE_PREFIX = "cloak:orphan-utxo:v1";

export type SerializedUtxo = {
  amount: string;
  blinding: string;
  mintAddress: string;
  index?: number;
  commitment?: string;
  siblingCommitment?: string;
  keypair: {
    privateKey: string;
    publicKey: string;
  };
};

export type OrphanUtxoRecord = {
  id: string;
  cluster: SolanaCluster;
  sender: string;
  utxo: SerializedUtxo;
  totalRaw: string;
  tokenId: string;
  decimals: number;
  rowsRemaining: number;
  createdAt: number;
  depositSignature: string;
};

function key(sender: string, cluster: SolanaCluster): string {
  return `${STORAGE_PREFIX}:${cluster}:${sender}`;
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function loadOrphans(
  sender: string | null | undefined,
  cluster: SolanaCluster,
): OrphanUtxoRecord[] {
  if (!isBrowser() || !sender) return [];
  try {
    const raw = window.localStorage.getItem(key(sender, cluster));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isOrphanRecord);
  } catch {
    return [];
  }
}

export function saveOrphan(
  sender: string,
  cluster: SolanaCluster,
  record: OrphanUtxoRecord,
): void {
  if (!isBrowser()) return;
  const current = loadOrphans(sender, cluster);
  const without = current.filter((r) => r.id !== record.id);
  const next = [record, ...without];
  try {
    window.localStorage.setItem(key(sender, cluster), JSON.stringify(next));
    notify(sender, cluster);
  } catch {
    // ignore
  }
}

export function updateOrphan(
  sender: string,
  cluster: SolanaCluster,
  id: string,
  patch: Partial<OrphanUtxoRecord>,
): void {
  if (!isBrowser()) return;
  const current = loadOrphans(sender, cluster);
  const idx = current.findIndex((r) => r.id === id);
  if (idx < 0) return;
  current[idx] = { ...current[idx], ...patch };
  try {
    window.localStorage.setItem(key(sender, cluster), JSON.stringify(current));
    notify(sender, cluster);
  } catch {
    // ignore
  }
}

export function clearOrphan(
  sender: string,
  cluster: SolanaCluster,
  id: string,
): void {
  if (!isBrowser()) return;
  const current = loadOrphans(sender, cluster);
  const next = current.filter((r) => r.id !== id);
  try {
    if (next.length === 0) {
      window.localStorage.removeItem(key(sender, cluster));
    } else {
      window.localStorage.setItem(key(sender, cluster), JSON.stringify(next));
    }
    notify(sender, cluster);
  } catch {
    // ignore
  }
}

function notify(sender: string, cluster: SolanaCluster): void {
  if (!isBrowser()) return;
  window.dispatchEvent(
    new CustomEvent("cloak:orphans-updated", {
      detail: { sender, cluster },
    }),
  );
}

function isOrphanRecord(value: unknown): value is OrphanUtxoRecord {
  if (!value || typeof value !== "object") return false;
  const r = value as Record<string, unknown>;
  const u = r.utxo as Record<string, unknown> | undefined;
  return (
    typeof r.id === "string" &&
    typeof r.cluster === "string" &&
    typeof r.sender === "string" &&
    typeof r.totalRaw === "string" &&
    typeof r.tokenId === "string" &&
    typeof r.decimals === "number" &&
    typeof r.rowsRemaining === "number" &&
    typeof r.createdAt === "number" &&
    typeof r.depositSignature === "string" &&
    !!u &&
    typeof u.amount === "string" &&
    typeof u.blinding === "string" &&
    typeof u.mintAddress === "string"
  );
}

export function bigintToHex(value: bigint): string {
  return value.toString(16);
}

export function hexToBigint(hex: string): bigint {
  if (!hex) return 0n;
  return BigInt(hex.startsWith("0x") ? hex : `0x${hex}`);
}
