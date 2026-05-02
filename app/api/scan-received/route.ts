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

type ScanRequest = {
  wallet?: unknown;
  untilSignature?: unknown;
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

  // Prefer a server-only RPC URL so client credits stay isolated from
  // server credits. Falls back to the public RPC URL if the dedicated
  // server URL isn't configured.
  const rpcUrl =
    process.env.CLOAK_SCAN_RPC_URL ??
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL ??
    solanaConfig.rpcUrl;
  const connection = new Connection(rpcUrl, "confirmed");

  try {
    const result = await scanTransactions({
      connection,
      programId: cloakConfig.programId,
      viewingKeyNk: PLACEHOLDER_NK,
      walletPublicKey: walletPk.toBase58(),
      untilSignature,
      // Default is 50, which fires 50 parallel getTransaction calls and
      // immediately trips Helius free-tier (~10 RPS). 5 keeps us under the
      // limit — slightly slower wall-clock but avoids retry storms.
      batchSize: 5,
    });
    const report = toComplianceReport(result);
    return NextResponse.json({ report });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[scan-received] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
