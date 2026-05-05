"use client";

import {
  deriveSpendKey as sdkDeriveSpendKey,
  expandSpendKey,
  type ExpandedSpendKey,
  type SpendKey,
} from "@cloak.dev/sdk";

// ed25519 signatures are deterministic per RFC 8032, so signing this exact
// string with the same wallet always yields the same bytes. Bumping `v1`
// rotates every shielded identity derived from it, so don't change the v1
// string.
export const SHIELD_KEY_MESSAGE = "Cloak shield key v1";
const SHIELD_KEY_VERSION = "v1";

export type SignMessage = (message: Uint8Array) => Promise<Uint8Array>;

export type ShieldSpendKeys = {
  masterSeed: Uint8Array;
  spendKey: SpendKey;
  expanded: ExpandedSpendKey;
};

type CacheEntry = { promise: Promise<ShieldSpendKeys> };

const cache = new Map<string, CacheEntry>();

function cacheKey(walletPubkey: string): string {
  return `${walletPubkey}:${SHIELD_KEY_VERSION}`;
}

export async function deriveSpendKey(
  walletPubkey: string,
  signMessage: SignMessage,
): Promise<ShieldSpendKeys> {
  const key = cacheKey(walletPubkey);
  const existing = cache.get(key);
  if (existing) return existing.promise;

  const promise = (async (): Promise<ShieldSpendKeys> => {
    const messageBytes = new TextEncoder().encode(SHIELD_KEY_MESSAGE);
    const signature = await signMessage(messageBytes);

    if (!(signature instanceof Uint8Array) || signature.length === 0) {
      throw new Error("Wallet returned an empty shield-key signature.");
    }

    // crypto.subtle.digest needs an ArrayBuffer-backed view; copy because
    // TS 5.7+ types Uint8Array as generic over ArrayBufferLike.
    const sigBuffer = new ArrayBuffer(signature.byteLength);
    new Uint8Array(sigBuffer).set(signature);
    const seedBuffer = await crypto.subtle.digest("SHA-256", sigBuffer);
    const masterSeed = new Uint8Array(seedBuffer);
    const spendKey = sdkDeriveSpendKey(masterSeed);
    const expanded = expandSpendKey(spendKey.sk_spend);

    return { masterSeed, spendKey, expanded };
  })();

  cache.set(key, { promise });

  try {
    return await promise;
  } catch (err) {
    cache.delete(key);
    throw err;
  }
}

export function clearSpendKeyCache(walletPubkey?: string): void {
  if (!walletPubkey) {
    cache.clear();
    return;
  }
  cache.delete(cacheKey(walletPubkey));
}

export function hasCachedSpendKey(walletPubkey: string): boolean {
  return cache.has(cacheKey(walletPubkey));
}
