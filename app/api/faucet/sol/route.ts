import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  sendAndConfirmTransaction,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

import { getDbPool } from "@/lib/db/pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Fixed drop. 100 SOL of treasury → 10,000 wallets at 0.01 SOL each.
const DROP_LAMPORTS = 10_000_000; // 0.01 SOL
const DEVNET_RPC_FALLBACK = "https://api.devnet.solana.com";

// Origins that are allowed to call this endpoint. Browsers send the
// `Origin` header automatically on POSTs from a page; curl/Postman/random
// scripts don't, so requiring it filters out the common spam vectors. Not
// a security boundary on its own (Origin is forgeable from a custom
// client) but raises the bar enough that abuse needs intent.
const DEV_ALLOWED_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"];

function allowedOrigins(): string[] {
  const env = process.env.CLOAK_FAUCET_ALLOWED_ORIGINS?.trim();
  const fromEnv = env
    ? env
        .split(",")
        .map((s) => s.trim().replace(/\/$/, ""))
        .filter(Boolean)
    : [];
  if (process.env.NODE_ENV !== "production") {
    return [...new Set([...DEV_ALLOWED_ORIGINS, ...fromEnv])];
  }
  return fromEnv;
}

function originAllowed(req: Request): boolean {
  const origin = req.headers.get("origin")?.trim().replace(/\/$/, "");
  if (!origin) return false;
  return allowedOrigins().includes(origin);
}

let treasuryCache: Keypair | null = null;
function getTreasury(): Keypair {
  if (treasuryCache) return treasuryCache;
  const raw = process.env.CLOAK_FAUCET_WALLET?.trim();
  if (!raw) throw new Error("CLOAK_FAUCET_WALLET is not set.");
  if (!raw.startsWith("[")) {
    throw new Error(
      "CLOAK_FAUCET_WALLET must be a JSON byte array (solana-keygen format).",
    );
  }
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed) || parsed.length !== 64) {
    throw new Error("CLOAK_FAUCET_WALLET must be a 64-byte array.");
  }
  treasuryCache = Keypair.fromSecretKey(Uint8Array.from(parsed as number[]));
  return treasuryCache;
}

function pickRpcUrl(): string {
  return process.env.CLOAK_FAUCET_RPC_URL?.trim() || DEVNET_RPC_FALLBACK;
}

function pickRpcHeaders(): Record<string, string> | undefined {
  const raw = process.env.CLOAK_FAUCET_RPC_HEADERS?.trim();
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      Object.values(parsed as Record<string, unknown>).every(
        (v) => typeof v === "string",
      )
    ) {
      return parsed as Record<string, string>;
    }
  } catch {
    /* fall through */
  }
  return undefined;
}

function isBase58Address(value: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);
}

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

type SolFaucetRequest = {
  wallet?: unknown;
};

export async function POST(req: Request) {
  if (!originAllowed(req)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  let body: SolFaucetRequest;
  try {
    body = (await req.json()) as SolFaucetRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const wallet = body.wallet;
  if (typeof wallet !== "string" || !isBase58Address(wallet)) {
    return NextResponse.json(
      { error: "wallet must be a base58 Solana address." },
      { status: 400 },
    );
  }

  let recipientPk: PublicKey;
  try {
    recipientPk = new PublicKey(wallet);
  } catch {
    return NextResponse.json(
      { error: "Invalid wallet pubkey." },
      { status: 400 },
    );
  }

  // Persistent one-shot guard: try to insert with a placeholder signature.
  // If the wallet already has a row, the PK conflict short-circuits to 409.
  // We update the row with the real signature once the transfer confirms,
  // and delete it on transfer failure so the user can retry.
  const ipHash = createHash("sha256").update(clientIp(req)).digest("hex");
  let pool;
  try {
    pool = await getDbPool();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[faucet/sol] db init failed: ${message}`);
    return NextResponse.json(
      { error: "Faucet temporarily unavailable (db)." },
      { status: 503 },
    );
  }

  try {
    const res = await pool.query(
      `INSERT INTO faucet_claims (wallet, signature, lamports, ip_hash, claimed_at)
       VALUES ($1, 'pending', $2, $3, NOW())
       ON CONFLICT (wallet) DO NOTHING
       RETURNING wallet`,
      [wallet, BigInt(DROP_LAMPORTS).toString(), ipHash],
    );
    if (res.rowCount === 0) {
      return NextResponse.json(
        { error: "This wallet has already claimed from the faucet." },
        { status: 409 },
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[faucet/sol] reservation failed: ${message}`);
    return NextResponse.json(
      { error: "Faucet temporarily unavailable (db)." },
      { status: 503 },
    );
  }

  let treasury: Keypair;
  try {
    treasury = getTreasury();
  } catch (err) {
    await pool
      .query("DELETE FROM faucet_claims WHERE wallet = $1", [wallet])
      .catch(() => {});
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[faucet/sol] treasury load failed: ${message}`);
    return NextResponse.json(
      { error: "Faucet treasury misconfigured." },
      { status: 500 },
    );
  }

  const connection = new Connection(pickRpcUrl(), {
    commitment: "confirmed",
    httpHeaders: pickRpcHeaders(),
  });

  try {
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: treasury.publicKey,
        toPubkey: recipientPk,
        lamports: DROP_LAMPORTS,
      }),
    );
    const signature = await sendAndConfirmTransaction(connection, tx, [
      treasury,
    ]);

    await pool
      .query("UPDATE faucet_claims SET signature = $1 WHERE wallet = $2", [
        signature,
        wallet,
      ])
      .catch((e) => {
        // Transfer landed; row already exists. Stale signature column is a
        // book-keeping miss, not a user-facing failure.
        console.error(
          `[faucet/sol] signature update failed: ${e instanceof Error ? e.message : String(e)}`,
        );
      });

    return NextResponse.json({
      signature,
      lamports: DROP_LAMPORTS,
      sol: DROP_LAMPORTS / LAMPORTS_PER_SOL,
      explorer: `https://explorer.solana.com/tx/${signature}?cluster=devnet`,
    });
  } catch (err) {
    await pool
      .query("DELETE FROM faucet_claims WHERE wallet = $1", [wallet])
      .catch(() => {});
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[faucet/sol] transfer failed wallet=${wallet}: ${message}`);
    const isRateLimited = /429|rate.?limit|too many/i.test(message);
    return NextResponse.json(
      { error: `Transfer failed: ${message}` },
      { status: isRateLimited ? 429 : 502 },
    );
  }
}
