import { NATIVE_SOL_MINT } from "@cloak.dev/sdk";
import { PublicKey } from "@solana/web3.js";

import { solanaConfig, type SolanaCluster } from "@/lib/solana/config";

export type ShieldTokenId = "SOL" | "USDC" | "USDT";

export type ShieldToken = {
  id: ShieldTokenId;
  decimals: number;
  mint: PublicKey;
};

const REGISTRY: Record<
  SolanaCluster,
  Partial<Record<ShieldTokenId, Omit<ShieldToken, "id">>>
> = {
  "mainnet-beta": {
    SOL: { decimals: 9, mint: NATIVE_SOL_MINT },
    USDC: {
      decimals: 6,
      mint: new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"),
    },
    USDT: {
      decimals: 6,
      mint: new PublicKey("Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"),
    },
  },
  devnet: {
    SOL: { decimals: 9, mint: NATIVE_SOL_MINT },
    // Cloak's mock USDC, faucet at https://devnet.cloak.ag/privacy/faucet.
    // See docs/development/devnet.mdx and DEVNET_MOCK_USDC_MINT in @cloak.dev/sdk-devnet.
    USDC: {
      decimals: 6,
      mint: new PublicKey("61ro7AExqfk4dZYoCyRzTahahCC2TdUUZ4M5epMPunJf"),
    },
  },
  testnet: {
    SOL: { decimals: 9, mint: NATIVE_SOL_MINT },
  },
  localnet: {
    SOL: { decimals: 9, mint: NATIVE_SOL_MINT },
  },
};

export function getShieldToken(id: ShieldTokenId): ShieldToken | null {
  const entry = REGISTRY[solanaConfig.cluster]?.[id];
  if (!entry) return null;
  return { id, ...entry };
}

export function isShieldTokenSupported(id: ShieldTokenId): boolean {
  return getShieldToken(id) !== null;
}

export function getShieldTokenByMint(mint: string): ShieldToken | null {
  const cluster = REGISTRY[solanaConfig.cluster];
  if (!cluster) return null;
  for (const id of Object.keys(cluster) as ShieldTokenId[]) {
    const entry = cluster[id];
    if (entry && entry.mint.toBase58() === mint) {
      return { id, ...entry };
    }
  }
  return null;
}

export function toBaseUnits(amount: string, decimals: number): bigint {
  const [whole, frac = ""] = amount.trim().split(".");
  const fracPadded = (frac + "0".repeat(decimals)).slice(0, decimals);
  const base = 10n ** BigInt(decimals);
  return BigInt(whole || "0") * base + BigInt(fracPadded || "0");
}
