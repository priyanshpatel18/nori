// Devnet mock-USDC faucet test.
//
// Mints mock USDC to a wallet via Cloak's public faucet API
// (POST https://devnet.cloak.ag/api/faucet). Default amount is 100 mock USDC.
//
// Rate limits: 1000 mock USDC per request, 5000 per wallet/24h, 30s cooldown.
//
// Examples:
//
//   WALLET=8gm5X1Nq8f28qu5XPTXk236FVmEufFprFmceRssYzMuk pnpm test:faucet
//   KEYPAIR=~/.config/solana/test.json AMOUNT=500 pnpm test:faucet

import { PublicKey } from "@solana/web3.js";

import {
  loadKeypair,
  logHeader,
  logKv,
  readEnv,
  requireEnv,
} from "./_shared";

const FAUCET_URL = "https://devnet.cloak.ag/api/faucet";
const USDC_DECIMALS = 6;

async function main() {
  let wallet: PublicKey;
  const walletStr = readEnv("WALLET");
  if (walletStr) {
    wallet = new PublicKey(walletStr);
  } else {
    const kpPath = requireEnv("KEYPAIR");
    wallet = loadKeypair(kpPath).publicKey;
  }

  const amountDecimal = Number(readEnv("AMOUNT", "100"));
  if (!Number.isFinite(amountDecimal) || amountDecimal <= 0) {
    throw new Error(`Invalid AMOUNT "${amountDecimal}".`);
  }
  const amountBaseUnits = Math.floor(amountDecimal * 10 ** USDC_DECIMALS);

  logHeader(`Devnet mock-USDC faucet · ${amountDecimal} mock USDC`);
  logKv({
    wallet: wallet.toBase58(),
    amountBaseUnits: amountBaseUnits.toString(),
    endpoint: FAUCET_URL,
  });

  const res = await fetch(FAUCET_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      wallet: wallet.toBase58(),
      amount: amountBaseUnits,
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Faucet HTTP ${res.status}: ${text}`);
  }

  let json: {
    signature?: string;
    mintedAmount?: number;
    recipientAta?: string;
    explorer?: string;
  };
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Faucet returned non-JSON: ${text}`);
  }

  logHeader("Minted");
  logKv({
    signature: json.signature ?? "·",
    mintedAmount: json.mintedAmount?.toString() ?? "·",
    recipientAta: json.recipientAta ?? "·",
    explorer: json.explorer ?? "·",
  });
}

main().catch((err) => {
  console.error("");
  console.error("Failed:");
  console.error(err);
  process.exit(1);
});
