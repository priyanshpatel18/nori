"use client";

import {
  PublicKey,
  type AddressLookupTableAccount,
  type Connection,
} from "@solana/web3.js";

import { solanaConfig } from "@/lib/solana/config";

// The Cloak SDK fetches the relay's `tx_alt_addresses` from `/health` inside
// `transact` / `partialWithdraw` (sdk/dist/index.js: fetchAltAddressesFromRelayHealth).
// That fetch swallows network errors and returns `[]`, which makes the SDK fall
// through to `createEphemeralALT` for SPL deposits, encrypted-note deposits,
// and risk-quote paths. Each ephemeral ALT is its own Solana tx, which means
// an extra wallet popup the user has to approve before the actual deposit.
//
// On devnet the Helius RPC is shared and slow, the public devnet RPC is
// rate-limited, and we have repeatedly observed the SDK falling into the
// ephemeral-ALT path mid-flow. Pre-fetching the relay ALT once per session
// (and passing it explicitly to the SDK) guarantees the SDK never has to
// create one. Mainnet is left alone; the helper short-circuits and returns
// an empty list so callers behave exactly like before.
//
// Empty return is the safe default: passing `addressLookupTableAccounts: []`
// to the SDK is treated identically to "not passed", and the SDK still falls
// back to its own resolve path. We simply skip pre-fetching for non-devnet.

const cache = new Map<string, AddressLookupTableAccount[]>();
const inflight = new Map<string, Promise<AddressLookupTableAccount[]>>();

async function fetchAltAddresses(relayUrl: string): Promise<string[]> {
  const url = `${relayUrl.replace(/\/$/, "")}/health`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return [];
    const body = (await res.json()) as {
      tx_alt_addresses?: unknown;
      alt_addresses?: unknown;
    };
    const raw = (body.tx_alt_addresses ?? body.alt_addresses ?? []) as unknown[];
    return raw.filter(
      (v): v is string => typeof v === "string" && v.length > 0,
    );
  } catch {
    return [];
  }
}

/**
 * Resolve the relay's published ALT accounts so the SDK can build V0 deposit
 * transactions without falling back to an ephemeral ALT (extra wallet popup).
 *
 * Returns an empty list on mainnet (the SDK's own path is left intact) or
 * when the relay does not publish ALT addresses. Callers should pass the
 * result through to `addressLookupTableAccounts` on the SDK options.
 */
export async function loadDevnetRelayAlt(
  connection: Connection,
  relayUrl: string,
): Promise<AddressLookupTableAccount[]> {
  if (solanaConfig.cluster !== "devnet") return [];

  const cacheKey = `${connection.rpcEndpoint}|${relayUrl}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;
  const existing = inflight.get(cacheKey);
  if (existing) return existing;

  const promise = (async (): Promise<AddressLookupTableAccount[]> => {
    const addresses = await fetchAltAddresses(relayUrl);
    if (addresses.length === 0) {
      cache.set(cacheKey, []);
      return [];
    }
    const resolved = await Promise.all(
      addresses.map(async (a) => {
        try {
          const result = await connection.getAddressLookupTable(
            new PublicKey(a),
          );
          return result.value;
        } catch {
          return null;
        }
      }),
    );
    const present = resolved.filter(
      (v): v is AddressLookupTableAccount => !!v,
    );
    cache.set(cacheKey, present);
    return present;
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
