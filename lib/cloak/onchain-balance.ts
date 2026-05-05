import type { ScanResult } from "@cloak.dev/sdk";

import type { SolanaCluster } from "@/lib/solana/config";

const STORAGE_PREFIX = "cloak:onchain-balance:v1";

export type OnChainBalanceByMint = Record<string, string>;

export type StoredOnChainBalance = {
  wallet: string;
  cluster: SolanaCluster;
  balanceByMint: OnChainBalanceByMint;
  totalDepositCount: number;
  totalWithdrawCount: number;
  lastSignature?: string;
  scannedAt: number;
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
    new CustomEvent("cloak:onchain-balance-updated", {
      detail: { wallet, cluster },
    }),
  );
}

export function loadOnChainBalance(
  wallet: string | null | undefined,
  cluster: SolanaCluster,
): StoredOnChainBalance | null {
  if (!isBrowser() || !wallet) return null;
  try {
    const raw = window.localStorage.getItem(key(wallet, cluster));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredOnChainBalance;
    if (!parsed || parsed.wallet !== wallet) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveOnChainBalance(
  wallet: string,
  cluster: SolanaCluster,
  snapshot: Omit<StoredOnChainBalance, "wallet" | "cluster" | "scannedAt">,
): StoredOnChainBalance {
  const stored: StoredOnChainBalance = {
    wallet,
    cluster,
    scannedAt: Date.now(),
    ...snapshot,
  };
  if (!isBrowser()) return stored;
  try {
    window.localStorage.setItem(key(wallet, cluster), JSON.stringify(stored));
    notify(wallet, cluster);
  } catch {
    // ignore quota / serialization errors
  }
  return stored;
}

export function clearOnChainBalance(
  wallet: string,
  cluster: SolanaCluster,
): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(key(wallet, cluster));
    notify(wallet, cluster);
  } catch {
    // ignore
  }
}

// Compute per-mint balance from a ScanResult. The scanner's view of the chain
// is "every Cloak tx whose chain note decrypts under this nk", which matches
// the user's view of their own activity:
//   - deposits they made           → +amount  (their own chain note)
//   - withdrawals they made        → -amount  (change-output note, gross out)
//   - swaps they originated        → -amount  (gross out of the input mint)
//   - transfers they sent          → -amount  (sender sees own change note)
//   - transfers they received      → +netAmount (recipient sees their own note)
//
// Transfers and swaps are imperfect: a transfer that consumes the entire input
// (no change for the sender) won't appear in the sender's scan. Same caveat as
// any compact-note scanner.
export function computeBalanceByMint(
  result: ScanResult,
): OnChainBalanceByMint {
  const balances = new Map<string, bigint>();
  for (const tx of result.transactions) {
    const mint = tx.mint;
    if (!mint) continue;
    const cur = balances.get(mint) ?? 0n;
    if (tx.txType === "deposit") {
      balances.set(mint, cur + tx.amount);
    } else if (
      tx.txType === "withdraw" ||
      tx.txType === "swap" ||
      tx.txType === "transfer"
    ) {
      balances.set(mint, cur - tx.amount);
    }
  }
  const out: OnChainBalanceByMint = {};
  for (const [mint, amount] of balances) {
    if (amount === 0n) continue;
    out[mint] = amount.toString();
  }
  return out;
}

export function mergeBalances(
  prev: OnChainBalanceByMint | null | undefined,
  delta: OnChainBalanceByMint,
): OnChainBalanceByMint {
  const merged = new Map<string, bigint>();
  if (prev) {
    for (const [mint, amount] of Object.entries(prev)) {
      merged.set(mint, BigInt(amount));
    }
  }
  for (const [mint, amount] of Object.entries(delta)) {
    const cur = merged.get(mint) ?? 0n;
    merged.set(mint, cur + BigInt(amount));
  }
  const out: OnChainBalanceByMint = {};
  for (const [mint, amount] of merged) {
    if (amount === 0n) continue;
    out[mint] = amount.toString();
  }
  return out;
}

export function countByType(result: ScanResult): {
  deposits: number;
  withdrawals: number;
} {
  let deposits = 0;
  let withdrawals = 0;
  for (const tx of result.transactions) {
    if (tx.txType === "deposit") deposits += 1;
    else if (
      tx.txType === "withdraw" ||
      tx.txType === "swap" ||
      tx.txType === "transfer"
    ) {
      withdrawals += 1;
    }
  }
  return { deposits, withdrawals };
}
