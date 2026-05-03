import { scanTransactions, toComplianceReport } from "@cloak.dev/sdk";
import { Connection, PublicKey } from "@solana/web3.js";
import { NextResponse } from "next/server";

import { cloakConfig } from "@/lib/cloak/config";
import { solanaConfig } from "@/lib/solana/config";

export const runtime = "nodejs";
// Scans can take seconds when there's a large delta; opt out of static
// caching since the response is wallet-specific and time-sensitive.
export const dynamic = "force-dynamic";

// Server-side scans use ATA-matching only — there's no per-user secret to
// pass in, so a zeroed nk is fine. The client never derives or stores a
// real viewing key for this flow.
const PLACEHOLDER_NK = new Uint8Array(32);

// Cap each scan to a small window of signatures. With `untilSignature` from
// the cached cursor, this is more than enough for incremental syncs: the
// delta is usually a handful of signatures. The first-ever scan pulls the
// most recent 200 program txs and saves the cursor — older history can be
// brought in by repeated incremental calls (each advances the cursor by up
// to LIMIT_DEFAULT). Bumping the cap risks triggering Helius free-tier
// 429s, which the SDK retries indefinitely and turns into a hot loop.
const LIMIT_DEFAULT = 200;
const LIMIT_MAX = 1000;

// `getTransaction` calls are issued in parallel batches. Helius free tier
// caps at ~10 RPS; 3 parallel keeps us well under that with headroom for
// the periodic `getSignaturesForAddress` page calls.
const BATCH_SIZE = 3;

// Hard wall-clock cap on the SDK call. If we hit it, we abort and return
// a 504 instead of letting an infinite retry loop run on the server.
const SCAN_TIMEOUT_MS = 30_000;

type ScanRequest = {
  wallet?: unknown;
  untilSignature?: unknown;
  limit?: unknown;
};

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

  // Prefer a server-only RPC URL so client credits stay isolated from
  // server credits. Falls back to the public RPC URL if the dedicated
  // server URL isn't configured.
  const rpcUrl =
    process.env.CLOAK_SCAN_RPC_URL ??
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL ??
    solanaConfig.rpcUrl;
  const connection = new Connection(rpcUrl, "confirmed");

  const startedAt = Date.now();
  try {
    const result = await withTimeout(
      scanTransactions({
        connection,
        programId: cloakConfig.programId,
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
      `[scan-received] ok wallet=${walletPk.toBase58().slice(0, 6)}… limit=${limit} txs=${report.transactions.length} rpc=${report.rpcCallsMade} elapsed=${Date.now() - startedAt}ms`,
    );
    return NextResponse.json({ report });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message === "scan-timeout" ? 504 : 500;
    console.error(
      `[scan-received] err wallet=${walletPk.toBase58().slice(0, 6)}… status=${status} elapsed=${Date.now() - startedAt}ms · ${message}`,
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
