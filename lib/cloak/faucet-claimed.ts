import type { SolanaCluster } from "@/lib/solana/config";

// Tracks which wallets have already claimed from /api/faucet/sol on this
// browser. The DB ledger is the authoritative one-shot guard; this just
// lets the UI remember "already claimed" across reloads without a
// pre-flight network request. Cluster-scoped so a wallet that's claimed
// on devnet shows correctly only on devnet.
const STORAGE_PREFIX = "cloak:faucet-sol-claimed:v1";

function key(cluster: SolanaCluster): string {
  return `${STORAGE_PREFIX}:${cluster}`;
}

function isBrowser(): boolean {
  return (
    typeof window !== "undefined" && typeof window.localStorage !== "undefined"
  );
}

function load(cluster: SolanaCluster): string[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(key(cluster));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s === "string") : [];
  } catch {
    return [];
  }
}

export function hasClaimedSol(
  wallet: string | null | undefined,
  cluster: SolanaCluster,
): boolean {
  if (!wallet) return false;
  return load(cluster).includes(wallet);
}

export function markSolClaimed(wallet: string, cluster: SolanaCluster): void {
  if (!isBrowser() || !wallet) return;
  const current = load(cluster);
  if (current.includes(wallet)) return;
  const next = [wallet, ...current].slice(0, 100);
  try {
    window.localStorage.setItem(key(cluster), JSON.stringify(next));
    window.dispatchEvent(
      new CustomEvent("cloak:faucet-claimed-updated", {
        detail: { cluster },
      }),
    );
  } catch {
    /* ignore quota errors */
  }
}

export function getStorageKey(cluster: SolanaCluster): string {
  return key(cluster);
}
