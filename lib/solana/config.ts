export type SolanaCluster = "mainnet-beta" | "devnet" | "testnet" | "localnet";

const DEFAULT_RPC: Record<SolanaCluster, string> = {
  "mainnet-beta": "https://api.mainnet-beta.solana.com",
  devnet: "https://api.devnet.solana.com",
  testnet: "https://api.testnet.solana.com",
  localnet: "http://127.0.0.1:8899",
};

const DEFAULT_WS: Record<SolanaCluster, string> = {
  "mainnet-beta": "wss://api.mainnet-beta.solana.com",
  devnet: "wss://api.devnet.solana.com",
  testnet: "wss://api.testnet.solana.com",
  localnet: "ws://127.0.0.1:8900",
};

const cluster: SolanaCluster =
  (process.env.NEXT_PUBLIC_SOLANA_CLUSTER as SolanaCluster | undefined) ??
  "devnet";

export const solanaConfig = {
  cluster,
  rpcUrl: process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? DEFAULT_RPC[cluster],
  wsUrl: process.env.NEXT_PUBLIC_SOLANA_WS_URL ?? DEFAULT_WS[cluster],
} as const;

export type SolanaConfig = typeof solanaConfig;

export const LAMPORTS_PER_SOL = 1_000_000_000n;
