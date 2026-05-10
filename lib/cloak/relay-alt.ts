"use client";

import {
  AddressLookupTableAccount,
  PublicKey,
  type Connection,
} from "@solana/web3.js";

import { solanaConfig } from "@/lib/solana/config";

// The Cloak SDK builds V0 deposit transactions and tries to fetch a shared
// Address Lookup Table from `${relayUrl}/health.tx_alt_addresses`. When that
// fetch (or the follow-up `connection.getAddressLookupTable` lookup against
// the user's RPC) returns nothing, `submitTransactionDirect` falls into
// `createEphemeralALT`, a separate Solana tx that needs its own wallet
// signature before the actual deposit. The user sees two popups instead of
// one.
//
// Mainnet doesn't hit this because users are wired to a paid Helius RPC
// that resolves the relay ALT instantly. Devnet defaults to the public
// `api.devnet.solana.com`, which is rate-limited and frequently returns
// nothing for `getAddressLookupTable` under load.
//
// Fix: ask our `/api/relay-alt` route to resolve the ALT server-side
// against the same paid Helius pool the `scan-received` route already
// uses (`CLOAK_SCAN_RPC_URL_DEVNET`). The route returns the raw account
// data, the client deserializes it, and we pass `addressLookupTableAccounts`
// explicitly to every SDK deposit-style call. The SDK's own resolve path
// becomes a no-op because we already provided what it would have fetched.
//
// Returns an empty list on mainnet so the SDK's existing path runs
// byte-for-byte unchanged.

const cache = new Map<string, AddressLookupTableAccount[]>();
const inflight = new Map<string, Promise<AddressLookupTableAccount[]>>();

type RelayAltEntry = { key: string; data: string };
type RelayAltResponse = { entries: RelayAltEntry[] };

async function resolveViaServer(
  cluster: "mainnet-beta" | "devnet",
): Promise<AddressLookupTableAccount[]> {
  try {
    const res = await fetch(
      `/api/relay-alt?cluster=${encodeURIComponent(cluster)}`,
      { cache: "no-store" },
    );
    if (!res.ok) return [];
    const body = (await res.json()) as RelayAltResponse;
    if (!body || !Array.isArray(body.entries)) return [];
    const out: AddressLookupTableAccount[] = [];
    for (const entry of body.entries) {
      if (
        typeof entry?.key !== "string" ||
        typeof entry?.data !== "string" ||
        entry.data.length === 0
      ) {
        continue;
      }
      try {
        const key = new PublicKey(entry.key);
        const data = Uint8Array.from(Buffer.from(entry.data, "base64"));
        const state = AddressLookupTableAccount.deserialize(data);
        out.push(new AddressLookupTableAccount({ key, state }));
      } catch {
        // Skip malformed entries; an empty result still lets the SDK
        // fall back to its own path rather than throwing here.
      }
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Resolve the Cloak relay's published ALT accounts so the SDK can build V0
 * deposit transactions without falling back to an ephemeral ALT (the second
 * wallet popup on devnet). Returns an empty list on mainnet.
 *
 * `connection` is unused today; kept in the signature so call sites don't
 * need to change if we later switch back to client-side resolution.
 */
export async function loadDevnetRelayAlt(
  _connection: Connection,
  relayUrl: string,
): Promise<AddressLookupTableAccount[]> {
  if (solanaConfig.cluster !== "devnet") return [];

  const cacheKey = relayUrl;
  const cached = cache.get(cacheKey);
  if (cached) return cached;
  const existing = inflight.get(cacheKey);
  if (existing) return existing;

  const promise = (async (): Promise<AddressLookupTableAccount[]> => {
    const resolved = await resolveViaServer("devnet");
    cache.set(cacheKey, resolved);
    return resolved;
  })();

  inflight.set(cacheKey, promise);
  try {
    return await promise;
  } finally {
    inflight.delete(cacheKey);
  }
}

export function clearDevnetRelayAltCache(): void {
  cache.clear();
  inflight.clear();
}
