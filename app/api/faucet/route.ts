import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UPSTREAM = "https://devnet.cloak.ag/api/faucet";

const MAX_PER_REQUEST_BASE_UNITS = 1_000 * 10 ** 6; // 1000 mock USDC

type FaucetRequest = {
  wallet?: unknown;
  amount?: unknown;
};

function isBase58Address(value: string): boolean {
  // Solana addresses are base58, 32-44 chars. Reject anything outside that
  // before forwarding to the upstream so we never proxy obvious garbage.
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);
}

export async function POST(req: Request) {
  let body: FaucetRequest;
  try {
    body = (await req.json()) as FaucetRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const wallet = body.wallet;
  const amount = body.amount;

  if (typeof wallet !== "string" || !isBase58Address(wallet)) {
    return NextResponse.json(
      { error: "wallet must be a base58 Solana address." },
      { status: 400 },
    );
  }
  if (
    typeof amount !== "number" ||
    !Number.isInteger(amount) ||
    amount <= 0 ||
    amount > MAX_PER_REQUEST_BASE_UNITS
  ) {
    return NextResponse.json(
      { error: "amount must be a positive integer up to 1,000,000,000 base units." },
      { status: 400 },
    );
  }

  const upstreamRes = await fetch(UPSTREAM, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wallet, amount }),
    cache: "no-store",
  });

  const text = await upstreamRes.text();

  // Pass through the upstream status and body verbatim. The client expects
  // `{ signature, mintedAmount, recipientAta, explorer }` on 2xx and
  // `{ error }` on 4xx/5xx.
  return new Response(text, {
    status: upstreamRes.status,
    headers: { "Content-Type": "application/json" },
  });
}
