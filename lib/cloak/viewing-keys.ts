import type { SolanaCluster } from "@/lib/solana/config";

import type { PaymentRecord } from "./payment-history";

const STORAGE_PREFIX = "cloak:viewing-keys:v1";
const MAX_KEYS = 50;

export type IssuedKey = {
  /**
   * Stable display id for the issuance record. Today this is an opaque
   * tracking identifier, not the wire-format viewing key, the spend-key /
   * sign-in flow that produces real `nk` bytes lives outside this module.
   * Existing IDs round-trip safely once that lands.
   */
  id: string;
  cluster: SolanaCluster;
  /** Issuer wallet that the auditor's view will be tied to. */
  issuer: string;
  auditor: string;
  /** YYYY-MM-DD; empty means open-ended on that side. */
  fromDate: string;
  toDate: string;
  /** Intended hand-off destination. Stored locally only; never sent on-chain. */
  email: string;
  createdAt: number;
  /** Set when the user revokes. Revocation here is a UI/local-state flag, */
  /** the actual decryption power is invalidated by deleting the key bytes. */
  revokedAt?: number;
};

export type KeyStatus = "active" | "revoked";

export function keyStatus(k: IssuedKey): KeyStatus {
  return k.revokedAt ? "revoked" : "active";
}

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
    new CustomEvent("cloak:keys-updated", {
      detail: { wallet, cluster },
    }),
  );
}

export function loadKeys(
  wallet: string | null | undefined,
  cluster: SolanaCluster,
): IssuedKey[] {
  if (!isBrowser() || !wallet) return [];
  try {
    const raw = window.localStorage.getItem(key(wallet, cluster));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isIssuedKey);
  } catch {
    return [];
  }
}

export function appendKey(
  wallet: string,
  cluster: SolanaCluster,
  record: IssuedKey,
): IssuedKey[] {
  if (!isBrowser()) return [];
  const current = loadKeys(wallet, cluster);
  const without = current.filter((k) => k.id !== record.id);
  const next = [record, ...without].slice(0, MAX_KEYS);
  try {
    window.localStorage.setItem(key(wallet, cluster), JSON.stringify(next));
    notify(wallet, cluster);
  } catch {
    // ignore quota / serialization errors
  }
  return next;
}

export function revokeKey(
  wallet: string,
  cluster: SolanaCluster,
  id: string,
): IssuedKey[] {
  if (!isBrowser()) return [];
  const current = loadKeys(wallet, cluster);
  const next = current.map((k) =>
    k.id === id && !k.revokedAt ? { ...k, revokedAt: Date.now() } : k,
  );
  try {
    window.localStorage.setItem(key(wallet, cluster), JSON.stringify(next));
    notify(wallet, cluster);
  } catch {
    // ignore
  }
  return next;
}

export function deleteKey(
  wallet: string,
  cluster: SolanaCluster,
  id: string,
): IssuedKey[] {
  if (!isBrowser()) return [];
  const current = loadKeys(wallet, cluster);
  const next = current.filter((k) => k.id !== id);
  try {
    window.localStorage.setItem(key(wallet, cluster), JSON.stringify(next));
    notify(wallet, cluster);
  } catch {
    // ignore
  }
  return next;
}

/**
 * Mint a fresh display id of the form `vk_aaaa…bbbb`. Uses crypto.getRandomValues
 * when available, falling back to Math.random in non-browser contexts (the
 * fallback path never runs in production since persistence requires a window).
 */
export function generateKeyId(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  return `vk_${hex.slice(0, 4).toUpperCase()}…${hex.slice(-4).toUpperCase()}`;
}

/** Format an issued key's range for display. */
export function formatKeyRange(k: IssuedKey): string {
  if (k.fromDate && k.toDate) return `${k.fromDate} → ${k.toDate}`;
  if (k.fromDate) return `from ${k.fromDate}`;
  if (k.toDate) return `until ${k.toDate}`;
  return "All time";
}

/**
 * Compact projection of a PaymentRecord for embedding in the auditor URL.
 * Outbound shield-to-shield transfers are invisible to the on-chain scan
 * (the relay submits them, the issuer's wallet never signs), so the auditor
 * needs them shipped out-of-band. They ride in the URL hash fragment, which
 * never reaches any server.
 */
export type AuditorSentEntry = {
  id: string;
  recipient: string;
  mint: string;
  symbol: string;
  decimals: number;
  amountRaw: string;
  netRaw: string;
  signature: string;
  timestamp: number;
  txType: "transfer" | "swap";
  outputMint?: string;
  outputSymbol?: string;
  outputDecimals?: number;
  outAmountRaw?: string;
};

export function paymentToSentEntry(r: PaymentRecord): AuditorSentEntry {
  const swap = r.swap;
  return {
    id: r.id,
    recipient: r.recipient,
    mint: r.mint,
    symbol: r.token,
    decimals: r.decimals,
    amountRaw: r.amountRaw,
    netRaw: r.netRaw,
    signature: swap
      ? (swap.settlementSignature ?? swap.swapSignature)
      : r.withdrawSignature,
    timestamp: r.timestamp,
    txType: swap ? "swap" : "transfer",
    outputMint: swap?.outputMint,
    outputSymbol: swap?.outputToken,
    outputDecimals: swap?.outputDecimals,
    outAmountRaw: swap?.outAmountRaw,
  };
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  if (typeof btoa === "function") {
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  return Buffer.from(bin, "binary")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(encoded: string): Uint8Array {
  const padded = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const bin =
    typeof atob === "function"
      ? atob(padded + pad)
      : Buffer.from(padded + pad, "base64").toString("binary");
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function encodeSentHistory(entries: AuditorSentEntry[]): string {
  const json = JSON.stringify(entries);
  return toBase64Url(new TextEncoder().encode(json));
}

export function decodeSentHistory(encoded: string): AuditorSentEntry[] {
  try {
    const bytes = fromBase64Url(encoded);
    const json = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isAuditorSentEntry);
  } catch {
    return [];
  }
}

function isAuditorSentEntry(value: unknown): value is AuditorSentEntry {
  if (!value || typeof value !== "object") return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.recipient === "string" &&
    typeof r.mint === "string" &&
    typeof r.symbol === "string" &&
    typeof r.decimals === "number" &&
    typeof r.amountRaw === "string" &&
    typeof r.netRaw === "string" &&
    typeof r.signature === "string" &&
    typeof r.timestamp === "number" &&
    (r.txType === "transfer" || r.txType === "swap")
  );
}

/**
 * Build the URL an auditor opens to reconstruct the issuer's ledger.
 * `nkHex` is the wire-format viewing key, treat like a password. Date params
 * are passed through as YYYY-MM-DD strings, the auditor view interprets empty
 * sides as open-ended. `sentRecords` ride in the URL hash so outbound private
 * transfers (which the on-chain scan can't see) reach the auditor without
 * touching any server.
 */
export function buildAuditorUrl(opts: {
  nkHex: string;
  wallet: string | null;
  fromDate?: string;
  toDate?: string;
  sentRecords?: PaymentRecord[];
}): string {
  const params = new URLSearchParams({ nk: opts.nkHex });
  if (opts.wallet) params.set("wallet", opts.wallet);
  if (opts.fromDate) params.set("from", opts.fromDate);
  if (opts.toDate) params.set("to", opts.toDate);
  let path = `/compliance/view?${params.toString()}`;
  if (opts.sentRecords && opts.sentRecords.length > 0) {
    const entries = opts.sentRecords.map(paymentToSentEntry);
    path += `#h=${encodeSentHistory(entries)}`;
  }
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}${path}`;
}

function isIssuedKey(value: unknown): value is IssuedKey {
  if (!value || typeof value !== "object") return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.cluster === "string" &&
    typeof r.issuer === "string" &&
    typeof r.auditor === "string" &&
    typeof r.fromDate === "string" &&
    typeof r.toDate === "string" &&
    typeof r.email === "string" &&
    typeof r.createdAt === "number" &&
    (r.revokedAt === undefined || typeof r.revokedAt === "number")
  );
}
