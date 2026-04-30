// Shared helpers for the integration test scripts.
//
// These are Node-side scripts that exercise the same SDK paths the frontend
// wires. They run against real devnet or mainnet endpoints with a local
// Solana keypair, so be deliberate when targeting mainnet.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import nacl from "tweetnacl";

import {
  NATIVE_SOL_MINT,
} from "@cloak.dev/sdk";

export type Cluster = "devnet" | "mainnet-beta";

export type TestTokenId = "SOL" | "USDC" | "USDT";

export type ClusterPreset = {
  cluster: Cluster;
  programId: PublicKey;
  relayUrl: string;
  defaultRpcUrl: string;
  tokens: Partial<
    Record<
      TestTokenId,
      {
        mint: PublicKey;
        decimals: number;
      }
    >
  >;
};

export const CLUSTERS: Record<Cluster, ClusterPreset> = {
  devnet: {
    cluster: "devnet",
    programId: new PublicKey("Zc1kHfp4rajSMeASFDwFFgkHRjv7dFQuLheJoQus27h"),
    relayUrl: "https://api.devnet.cloak.ag",
    defaultRpcUrl: "https://api.devnet.solana.com",
    tokens: {
      SOL: { mint: NATIVE_SOL_MINT, decimals: 9 },
      USDC: {
        mint: new PublicKey("61ro7AExqfk4dZYoCyRzTahahCC2TdUUZ4M5epMPunJf"),
        decimals: 6,
      },
    },
  },
  "mainnet-beta": {
    cluster: "mainnet-beta",
    programId: new PublicKey("zh1eLd6rSphLejbFfJEneUwzHRfMKxgzrgkfwA6qRkW"),
    relayUrl: "https://api.cloak.ag",
    defaultRpcUrl: "https://api.mainnet-beta.solana.com",
    tokens: {
      SOL: { mint: NATIVE_SOL_MINT, decimals: 9 },
      USDC: {
        mint: new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"),
        decimals: 6,
      },
      USDT: {
        mint: new PublicKey("Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"),
        decimals: 6,
      },
    },
  },
};

export function readEnv(
  key: string,
  fallback?: string,
): string | undefined {
  const v = process.env[key];
  if (v && v.trim()) return v.trim();
  return fallback;
}

export function requireEnv(key: string): string {
  const v = readEnv(key);
  if (!v) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return v;
}

export function expandHome(p: string): string {
  if (p.startsWith("~/")) return resolve(homedir(), p.slice(2));
  return resolve(p);
}

export function loadKeypair(path: string): Keypair {
  const expanded = expandHome(path);
  const raw = readFileSync(expanded, "utf8");
  const arr = JSON.parse(raw) as number[];
  if (!Array.isArray(arr) || arr.length !== 64) {
    throw new Error(
      `Keypair file ${expanded} is not a 64-byte JSON array (got length ${arr.length}).`,
    );
  }
  return Keypair.fromSecretKey(Uint8Array.from(arr));
}

/**
 * Wraps a Node-side Keypair so it speaks the same shape the SDK expects from a
 * browser wallet adapter (`signTransaction` + `signMessage`).
 */
export function keypairSigner(kp: Keypair) {
  return {
    publicKey: kp.publicKey,
    signTransaction: async <T extends Transaction | VersionedTransaction>(
      tx: T,
    ): Promise<T> => {
      if (tx instanceof VersionedTransaction) {
        tx.sign([kp]);
      } else {
        tx.partialSign(kp);
      }
      return tx;
    },
    signMessage: async (message: Uint8Array): Promise<Uint8Array> => {
      return nacl.sign.detached(message, kp.secretKey);
    },
  };
}

export function pickCluster(): ClusterPreset {
  const v = readEnv("CLUSTER", "devnet");
  if (v !== "devnet" && v !== "mainnet-beta") {
    throw new Error(
      `Invalid CLUSTER "${v}". Use "devnet" or "mainnet-beta".`,
    );
  }
  return CLUSTERS[v as Cluster];
}

export function pickToken(preset: ClusterPreset, tokenId: TestTokenId) {
  const t = preset.tokens[tokenId];
  if (!t) {
    throw new Error(
      `${tokenId} is not available on ${preset.cluster}. Available: ${Object.keys(preset.tokens).join(", ")}.`,
    );
  }
  return { id: tokenId, ...t };
}

export function pickTokenFromEnv(preset: ClusterPreset) {
  const v = (readEnv("TOKEN", "SOL") ?? "SOL").toUpperCase();
  if (v !== "SOL" && v !== "USDC" && v !== "USDT") {
    throw new Error(`Invalid TOKEN "${v}". Use SOL, USDC, or USDT.`);
  }
  return pickToken(preset, v as TestTokenId);
}

export function buildConnection(preset: ClusterPreset): Connection {
  const url = readEnv("RPC_URL", preset.defaultRpcUrl)!;
  // `processed` matches the frontend Connection so test runs feel the same
  // as what users see. Cuts ~10-20s/row off internal confirm waits.
  return new Connection(url, "processed");
}

export function toBaseUnits(amount: string, decimals: number): bigint {
  const [whole, frac = ""] = amount.trim().split(".");
  const fracPadded = (frac + "0".repeat(decimals)).slice(0, decimals);
  const base = 10n ** BigInt(decimals);
  return BigInt(whole || "0") * base + BigInt(fracPadded || "0");
}

export function formatBaseUnits(raw: bigint, decimals: number): string {
  if (raw === 0n) return "0";
  const negative = raw < 0n;
  const abs = negative ? -raw : raw;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const frac = abs % base;
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  const display = fracStr ? `${whole}.${fracStr}` : `${whole}`;
  return negative ? `-${display}` : display;
}

export function solscanTxUrl(signature: string, cluster: Cluster): string {
  if (cluster === "mainnet-beta") return `https://solscan.io/tx/${signature}`;
  return `https://solscan.io/tx/${signature}?cluster=devnet`;
}

export function logHeader(title: string): void {
  console.log("");
  console.log(`━━━ ${title} ━━━`);
}

export function logKv(rows: Record<string, string | number | bigint>): void {
  const keyWidth = Math.max(...Object.keys(rows).map((k) => k.length));
  for (const [k, v] of Object.entries(rows)) {
    console.log(`  ${k.padEnd(keyWidth)}  ${v}`);
  }
}
