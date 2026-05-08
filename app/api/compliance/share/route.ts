import { randomBytes } from "node:crypto";

import { NextResponse } from "next/server";

import { hasShare, putShare } from "@/lib/cloak/share-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ID_LEN = 10;
const ID_ALPHABET =
  "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const MAX_PAYLOAD_BYTES = 256 * 1024;
const ID_RETRIES = 5;

type ShareRequest = {
  payload?: unknown;
  issuer?: unknown;
};

function generateId(len = ID_LEN): string {
  // 60 bits of entropy across base62. Collisions are astronomical even with
  // millions of stored entries; the retry loop below covers the edge.
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) {
    out += ID_ALPHABET[bytes[i] % ID_ALPHABET.length];
  }
  return out;
}

function isBase58Address(value: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);
}

export async function POST(req: Request) {
  let body: ShareRequest;
  try {
    body = (await req.json()) as ShareRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const payload = body.payload;
  const issuer = body.issuer;

  if (typeof payload !== "string" || payload.length === 0) {
    return NextResponse.json(
      { error: "payload must be a non-empty string." },
      { status: 400 },
    );
  }
  if (payload.length > MAX_PAYLOAD_BYTES) {
    return NextResponse.json(
      { error: `payload exceeds ${MAX_PAYLOAD_BYTES} bytes.` },
      { status: 413 },
    );
  }
  if (typeof issuer !== "string" || !isBase58Address(issuer)) {
    return NextResponse.json(
      { error: "issuer must be a base58 Solana address." },
      { status: 400 },
    );
  }

  for (let attempt = 0; attempt < ID_RETRIES; attempt++) {
    const id = generateId();
    if (hasShare(id)) continue;
    putShare(id, payload, issuer);
    return NextResponse.json({ id });
  }

  return NextResponse.json(
    { error: "Could not allocate a share id, try again." },
    { status: 503 },
  );
}
