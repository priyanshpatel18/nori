import { Connection, PublicKey } from "@solana/web3.js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Resolves the Cloak relay's published Address Lookup Table(s) server-side
// and returns the raw account data so the client can reconstruct
// `AddressLookupTableAccount` and pass it explicitly to the SDK.
//
// Why a server route at all: `loadDevnetRelayAlt` previously did this work
// in the browser against the user's wallet connection. On devnet that's
// the public `api.devnet.solana.com` (rate-limited), so `getAddressLookupTable`
// often fails silently → the SDK falls into `createEphemeralALT`, which is a
// second wallet popup before the actual deposit. Mainnet works because
// users are wired to Helius. This route lets devnet use the same paid
// Helius pool the scan-received route already uses (`CLOAK_SCAN_RPC_URL_DEVNET`),
// so the resolution behaves like mainnet does.

const RELAY_URLS: Record<"mainnet-beta" | "devnet", string> = {
  "mainnet-beta": "https://api.cloak.ag",
  devnet: "https://api.devnet.cloak.ag",
};

const FALLBACK_RPC: Record<"mainnet-beta" | "devnet", string> = {
  "mainnet-beta": "https://api.mainnet-beta.solana.com",
  devnet: "https://api.devnet.solana.com",
};

function resolveCluster(value: unknown): "mainnet-beta" | "devnet" {
  return value === "mainnet-beta" ? "mainnet-beta" : "devnet";
}

function resolveRpcUrl(cluster: "mainnet-beta" | "devnet"): string {
  const env =
    cluster === "mainnet-beta"
      ? process.env.CLOAK_SCAN_RPC_URL_MAINNET
      : process.env.CLOAK_SCAN_RPC_URL_DEVNET;
  return env && env.trim() ? env.trim() : FALLBACK_RPC[cluster];
}

async function fetchRelayAltAddresses(relayUrl: string): Promise<string[]> {
  try {
    const res = await fetch(`${relayUrl.replace(/\/$/, "")}/health`, {
      cache: "no-store",
    });
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

export async function GET(req: Request) {
  const url = new URL(req.url);
  const cluster = resolveCluster(url.searchParams.get("cluster"));
  const relayUrl = RELAY_URLS[cluster];
  const rpcUrl = resolveRpcUrl(cluster);

  const addresses = await fetchRelayAltAddresses(relayUrl);
  if (addresses.length === 0) {
    return NextResponse.json({ entries: [] }, {
      headers: { "Cache-Control": "private, max-age=300" },
    });
  }

  const connection = new Connection(rpcUrl, "confirmed");
  const entries: Array<{ key: string; data: string }> = [];
  for (const addr of addresses) {
    let pubkey: PublicKey;
    try {
      pubkey = new PublicKey(addr);
    } catch {
      continue;
    }
    try {
      const info = await connection.getAccountInfo(pubkey, "confirmed");
      if (!info) continue;
      const data = Buffer.from(info.data).toString("base64");
      entries.push({ key: pubkey.toBase58(), data });
    } catch {
      // Skip a single bad lookup rather than failing the whole resolution.
    }
  }

  return NextResponse.json(
    { entries },
    {
      // Five-minute cache: ALT contents change rarely and a stale entry just
      // costs the SDK an extra round-trip via its own fallback. Per-user
      // cache so cookie-bearing requests aren't cross-contaminated.
      headers: { "Cache-Control": "private, max-age=300" },
    },
  );
}
