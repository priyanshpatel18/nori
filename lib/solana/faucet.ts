import { address as toAddress, airdropFactory, lamports } from "@solana/kit";

import { rpc, rpcSubscriptions } from "./rpc";

export const FAUCET_API = "https://devnet.cloak.ag/api/faucet";
export const MOCK_USDC_DECIMALS = 6;

const airdrop = airdropFactory({
  rpc,
  rpcSubscriptions,
});

export async function airdropDevnetSol(
  recipient: string,
  amountSol: number,
): Promise<string> {
  if (!Number.isFinite(amountSol) || amountSol <= 0) {
    throw new Error("Airdrop amount must be a positive number.");
  }
  const amountLamports = BigInt(Math.floor(amountSol * 1_000_000_000));
  const signature = await airdrop({
    commitment: "confirmed",
    recipientAddress: toAddress(recipient),
    lamports: lamports(amountLamports),
  });
  return signature as unknown as string;
}

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
  const amountBaseUnits = Math.floor(amountUsdc * 10 ** MOCK_USDC_DECIMALS);
  const res = await fetch(FAUCET_API, {
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
