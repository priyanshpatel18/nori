"use client";

import { deriveSpendKey, type SignMessage } from "@/lib/cloak/spend-key";

export type ViewingKeyMaterial = {
  /** 32-byte nk (incoming view base) from expandSpendKey().nsk. */
  nk: Uint8Array;
  /** Lowercase 64-char hex; the bytes an auditor needs to scan + decrypt. */
  nkHex: string;
  /** Display-safe form: `nk_AAAA…BBBB` (first 4 + last 4 hex chars, uppercase). */
  masked: string;
};

function bytesToHex(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 1) {
    s += bytes[i].toString(16).padStart(2, "0");
  }
  return s;
}

export function maskNkHex(nkHex: string): string {
  const head = nkHex.slice(0, 4).toUpperCase();
  const tail = nkHex.slice(-4).toUpperCase();
  return `nk_${head}…${tail}`;
}

/**
 * Derive the wallet's stable viewing key (incoming view base, `nk`). Reuses
 * the cached spend-key derivation from `lib/cloak/spend-key.ts`, so the
 * first call prompts the wallet once and subsequent calls are free.
 *
 * The returned `nkHex` is the wire form to hand an auditor; treat it like
 * a password (read-only access to the user's full chain-note history).
 */
export async function getViewingKey(
  walletPubkey: string,
  signMessage: SignMessage,
): Promise<ViewingKeyMaterial> {
  const { expanded } = await deriveSpendKey(walletPubkey, signMessage);
  const nk = expanded.nsk;
  const nkHex = bytesToHex(nk);
  return { nk, nkHex, masked: maskNkHex(nkHex) };
}
