"use client";

import { deriveSpendKey, type SignMessage } from "@/lib/cloak/spend-key";

export type ViewingKeyMaterial = {
  nk: Uint8Array;
  nkHex: string;
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

// nkHex is the wire form to hand an auditor: full read-only access to the
// user's chain-note history. Treat it like a password.
export async function getViewingKey(
  walletPubkey: string,
  signMessage: SignMessage,
): Promise<ViewingKeyMaterial> {
  const { expanded } = await deriveSpendKey(walletPubkey, signMessage);
  const nk = expanded.nsk;
  const nkHex = bytesToHex(nk);
  return { nk, nkHex, masked: maskNkHex(nkHex) };
}
