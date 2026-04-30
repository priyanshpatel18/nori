import type { SolanaCluster } from "@/lib/solana/config";
import type { ShieldTokenId } from "./tokens";

const STORAGE_PREFIX = "cloak:payments:v1";
const MAX_RECORDS = 200;

export type PaymentRecord = {
  id: string;
  cluster: SolanaCluster;
  sender: string;
  recipient: string;
  token: ShieldTokenId;
  mint: string;
  decimals: number;
  amountRaw: string;
  netRaw: string;
  depositSignature: string;
  withdrawSignature: string;
  timestamp: number;
};

function key(sender: string, cluster: SolanaCluster): string {
  return `${STORAGE_PREFIX}:${cluster}:${sender}`;
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function loadPayments(
  sender: string | null | undefined,
  cluster: SolanaCluster,
): PaymentRecord[] {
  if (!isBrowser() || !sender) return [];
  try {
    const raw = window.localStorage.getItem(key(sender, cluster));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isPaymentRecord);
  } catch {
    return [];
  }
}

export function appendPayment(
  sender: string,
  cluster: SolanaCluster,
  record: PaymentRecord,
): PaymentRecord[] {
  if (!isBrowser()) return [];
  const current = loadPayments(sender, cluster);
  const without = current.filter((r) => r.id !== record.id);
  const next = [record, ...without].slice(0, MAX_RECORDS);
  try {
    window.localStorage.setItem(key(sender, cluster), JSON.stringify(next));
    window.dispatchEvent(
      new CustomEvent("cloak:payments-updated", {
        detail: { sender, cluster },
      }),
    );
  } catch {
    // ignore
  }
  return next;
}

export function clearPayments(sender: string, cluster: SolanaCluster): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(key(sender, cluster));
    window.dispatchEvent(
      new CustomEvent("cloak:payments-updated", {
        detail: { sender, cluster },
      }),
    );
  } catch {
    // ignore
  }
}

function isPaymentRecord(value: unknown): value is PaymentRecord {
  if (!value || typeof value !== "object") return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.cluster === "string" &&
    typeof r.sender === "string" &&
    typeof r.recipient === "string" &&
    typeof r.token === "string" &&
    typeof r.mint === "string" &&
    typeof r.decimals === "number" &&
    typeof r.amountRaw === "string" &&
    typeof r.netRaw === "string" &&
    typeof r.depositSignature === "string" &&
    typeof r.withdrawSignature === "string" &&
    typeof r.timestamp === "number"
  );
}

/** Format a base-unit string into a decimal display string. */
export function formatBaseUnits(raw: string, decimals: number): string {
  let amount: bigint;
  try {
    amount = BigInt(raw);
  } catch {
    return "0";
  }
  if (amount === 0n) return "0";
  const negative = amount < 0n;
  const abs = negative ? -amount : amount;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const frac = abs % base;
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  const display = fracStr ? `${whole}.${fracStr}` : `${whole}`;
  return negative ? `-${display}` : display;
}
