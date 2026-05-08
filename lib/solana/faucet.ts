/**
 * Cloak's USDC faucet API can't be called directly from the browser:
 * `devnet.cloak.ag/api/faucet` doesn't return CORS headers, so any request
 * from a non-cloak.ag origin gets blocked at preflight. We proxy through
 * `app/api/faucet/route.ts` which talks to the upstream server-side and
 * forwards the response.
 */
export const FAUCET_PROXY_PATH = "/api/faucet";
export const MOCK_USDC_DECIMALS = 6;
export const MOCK_USDC_MAX_PER_REQUEST = 1_000;
export const MOCK_USDC_MAX_PER_WALLET_24H = 5_000;
export const MOCK_USDC_COOLDOWN_SECONDS = 30;

export const SOLANA_PUBLIC_FAUCET_URL = "https://faucet.solana.com/";

export type FaucetMintResult = {
  signature: string;
  mintedAmount: number;
  recipientAta: string;
  explorer?: string;
};

export async function airdropDevnetMockUsdc(
  recipient: string,
  amountUsdc: number,
): Promise<FaucetMintResult> {
  if (!Number.isFinite(amountUsdc) || amountUsdc <= 0) {
    throw new Error("Faucet amount must be a positive number.");
  }
  if (amountUsdc > MOCK_USDC_MAX_PER_REQUEST) {
    throw new Error(
      `Faucet amount exceeds the per-request limit of ${MOCK_USDC_MAX_PER_REQUEST} mock USDC.`,
    );
  }
  const amountBaseUnits = Math.floor(amountUsdc * 10 ** MOCK_USDC_DECIMALS);

  const res = await fetch(FAUCET_PROXY_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wallet: recipient, amount: amountBaseUnits }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(parseFaucetError(res.status, text));
  }
  try {
    return JSON.parse(text) as FaucetMintResult;
  } catch {
    throw new Error(`Faucet returned non-JSON response: ${text.slice(0, 200)}`);
  }
}

function parseFaucetError(status: number, body: string): string {
  try {
    const json = JSON.parse(body) as { error?: unknown; message?: unknown };
    if (typeof json.error === "string") return json.error;
    if (typeof json.message === "string") return json.message;
  } catch {
    /* fall through */
  }
  return `Faucet error (HTTP ${status}).`;
}
