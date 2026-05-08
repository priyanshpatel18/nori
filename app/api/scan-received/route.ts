import { scanTransactions, toComplianceReport } from "@cloak.dev/sdk";
import { Connection, PublicKey } from "@solana/web3.js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
// Scans can take seconds when there's a large delta; opt out of static
// caching since the response is wallet-specific and time-sensitive.
export const dynamic = "force-dynamic";

// Server-side scans use ATA-matching only, there's no per-user secret to
// pass in, so a zeroed nk is fine. The client never derives or stores a
// real viewing key for this flow.
const PLACEHOLDER_NK = new Uint8Array(32);

// Cap each scan to a small window of signatures. With `untilSignature` from
// the cached cursor, this is more than enough for incremental syncs: the
// delta is usually a handful of signatures. The first-ever scan pulls the
// most recent 200 program txs and saves the cursor, older history can be
// brought in by repeated incremental calls (each advances the cursor by up
// to LIMIT_DEFAULT). Bumping the cap risks triggering Helius free-tier
// 429s, which the SDK retries indefinitely and turns into a hot loop.
// Smaller initial window so the first-ever scan finishes inside the wall
// clock budget on rate-limited RPCs. Subsequent syncs use the cached
// `untilSignature` cursor and only fetch the delta, so 100 is plenty.
const LIMIT_DEFAULT = 100;
const LIMIT_MAX = 1000;

// `getTransaction` calls are issued in parallel batches. Bumped from 3 to
// 5 — paid Helius tiers handle this comfortably, and the previous setting
// made every scan sequential enough to hit the 30s wall on busy wallets.
const BATCH_SIZE = 5;

// Hard wall-clock cap on the SDK call. If we hit it, we abort and return
// a 504 instead of letting an infinite retry loop run on the server.
const SCAN_TIMEOUT_MS = 45_000;

type ScanRequest = {
  wallet?: unknown;
  untilSignature?: unknown;
  limit?: unknown;
  cluster?: unknown;
};

type SupportedCluster = "mainnet-beta" | "devnet";

const CLUSTER_PROGRAM_IDS: Record<SupportedCluster, PublicKey> = {
  "mainnet-beta": new PublicKey(
    "zh1eLd6rSphLejbFfJEneUwzHRfMKxgzrgkfwA6qRkW",
  ),
  devnet: new PublicKey("Zc1kHfp4rajSMeASFDwFFgkHRjv7dFQuLheJoQus27h"),
};

const CLUSTER_DEFAULT_RPC: Record<SupportedCluster, string> = {
  "mainnet-beta": "https://api.mainnet-beta.solana.com",
  devnet: "https://api.devnet.solana.com",
};

function resolveCluster(value: unknown): SupportedCluster {
  return value === "mainnet-beta" || value === "devnet" ? value : "devnet";
}

function resolveRpcUrl(cluster: SupportedCluster): string {
  // Per-cluster overrides take precedence so a deployment can wire each
  // cluster to its own dedicated RPC pool. Falls back to the legacy single
  // CLOAK_SCAN_RPC_URL only when it matches the request cluster (otherwise
  // the legacy env would silently mis-route — e.g. a mainnet URL for a
  // devnet client). Public defaults catch the unconfigured case.
  const perCluster =
    cluster === "mainnet-beta"
      ? process.env.CLOAK_SCAN_RPC_URL_MAINNET
      : process.env.CLOAK_SCAN_RPC_URL_DEVNET;
  if (perCluster) return perCluster;
  return CLUSTER_DEFAULT_RPC[cluster];
}

export async function POST(req: Request) {
  let body: ScanRequest;
  try {
    body = (await req.json()) as ScanRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const wallet = typeof body.wallet === "string" ? body.wallet.trim() : "";
  if (!wallet) {
    return NextResponse.json({ error: "Missing wallet" }, { status: 400 });
  }
  let walletPk: PublicKey;
  try {
    walletPk = new PublicKey(wallet);
  } catch {
    return NextResponse.json(
      { error: "Invalid wallet pubkey" },
      { status: 400 },
    );
  }

  const untilSignature =
    typeof body.untilSignature === "string" && body.untilSignature.trim()
      ? body.untilSignature.trim()
      : undefined;

  const limit = clampLimit(body.limit);
  const cluster = resolveCluster(body.cluster);
  const programId = CLUSTER_PROGRAM_IDS[cluster];
  const rpcUrl = resolveRpcUrl(cluster);
  // Log just the host so we can verify which RPC the server actually used
  // without leaking api keys from the query string.
  const rpcHost = (() => {
    try {
      return new URL(rpcUrl).host;
    } catch {
      return "unknown";
    }
  })();
  const connection = new Connection(rpcUrl, "confirmed");

  const startedAt = Date.now();
  try {
    const result = await withTimeout(
      scanTransactions({
        connection,
        programId,
        viewingKeyNk: PLACEHOLDER_NK,
        walletPublicKey: walletPk.toBase58(),
        untilSignature,
        limit,
        batchSize: BATCH_SIZE,
      }),
      SCAN_TIMEOUT_MS,
    );
    const report = toComplianceReport(result);
    console.log(
      `[scan-received] ok cluster=${cluster} host=${rpcHost} wallet=${walletPk.toBase58().slice(0, 6)}… limit=${limit} txs=${report.transactions.length} rpc=${report.rpcCallsMade} elapsed=${Date.now() - startedAt}ms`,
    );
    return NextResponse.json({ report });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message === "scan-timeout" ? 504 : 500;
    console.error(
      `[scan-received] err cluster=${cluster} host=${rpcHost} wallet=${walletPk.toBase58().slice(0, 6)}… status=${status} elapsed=${Date.now() - startedAt}ms · ${message}`,
    );
    return NextResponse.json({ error: message }, { status });
  }
}

function clampLimit(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return LIMIT_DEFAULT;
  if (raw <= 0) return LIMIT_DEFAULT;
  return Math.min(LIMIT_MAX, Math.floor(raw));
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const handle = setTimeout(() => reject(new Error("scan-timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(handle);
        resolve(value);
      },
      (err) => {
        clearTimeout(handle);
        reject(err);
      },
    );
  });
}
