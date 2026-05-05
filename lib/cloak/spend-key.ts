"use client";

import {
  deriveSpendKey as sdkDeriveSpendKey,
  expandSpendKey,
  type ExpandedSpendKey,
  type SpendKey,
} from "@cloak.dev/sdk";

/**
 * Versioned, namespaced message the wallet signs to seed a stable shield
 * spend key. ed25519 signatures are deterministic (RFC 8032), so the same
 * (wallet, message) tuple always yields the same signature, which is what
 * gives the spend key its "stable across sessions, never persisted" property.
 *
 * Bumping the version (`v1` → `v2`) is the key-rotation lever: it produces a
 * different seed, hence a different spend key, hence a different shielded
 * identity. Don't change the v1 string.
 */
export const SHIELD_KEY_MESSAGE = "Cloak shield key v1";
const SHIELD_KEY_VERSION = "v1";

export type SignMessage = (message: Uint8Array) => Promise<Uint8Array>;

export type ShieldSpendKeys = {
  /** SHA-256(signature) — 32-byte deterministic seed. */
  masterSeed: Uint8Array;
  /** Spend authority for owned UTXOs. Treat as secret. Never persist or log. */
  spendKey: SpendKey;
  /** Zcash-style expansion: ask (spend auth), nsk (incoming view base), ovk. */
  expanded: ExpandedSpendKey;
};

type CacheEntry = {
  /** In-flight or settled derivation. Promise so concurrent callers dedupe. */
  promise: Promise<ShieldSpendKeys>;
};

const cache = new Map<string, CacheEntry>();

function cacheKey(walletPubkey: string): string {
  return `${walletPubkey}:${SHIELD_KEY_VERSION}`;
}

/**
 * Derive a stable shield spend key for `walletPubkey` by having the wallet
 * sign `SHIELD_KEY_MESSAGE`. The result is cached in-process for the lifetime
 * of the page so subsequent shield operations in the same session don't
 * re-prompt the wallet. The cache holds the in-flight promise too, so two
 * concurrent callers share a single popup.
 *
 * Pass the wallet's raw `signMessage` — this module does its own caching
 * keyed on wallet pubkey + message version, so layering with
 * `createMemoizedSignMessage` is unnecessary (and would double-cache the
 * same bytes).
 */
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

    // Copy into a fresh ArrayBuffer so crypto.subtle.digest accepts the
    // BufferSource regardless of how the wallet adapter typed `signature`
    // (TS 5.7+ leaves Uint8Array generic over ArrayBufferLike).
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

/**
 * Drop cached spend keys. Call with no args to wipe everything (e.g. on
 * wallet disconnect or sign-out); pass a pubkey to drop just that entry.
 *
 * JS can't guarantee secure zeroing of the underlying bytes, but dropping the
 * Map references lets the GC reclaim them when no other holder remains.
 */
export function clearSpendKeyCache(walletPubkey?: string): void {
  if (!walletPubkey) {
    cache.clear();
    return;
  }
  cache.delete(cacheKey(walletPubkey));
}
