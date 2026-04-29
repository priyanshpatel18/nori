export type SolanaCluster = "mainnet-beta" | "devnet" | "testnet" | "localnet";

const VALID_CLUSTERS: readonly SolanaCluster[] = [
  "mainnet-beta",
  "devnet",
  "testnet",
  "localnet",
];

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

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function isHttpUrl(value: string | undefined): value is string {
  return !!value && (value.startsWith("http://") || value.startsWith("https://"));
}

function isWsUrl(value: string | undefined): value is string {
  return !!value && (value.startsWith("ws://") || value.startsWith("wss://"));
}

const rawCluster = clean(process.env.NEXT_PUBLIC_SOLANA_CLUSTER) ?? "devnet";
const cluster = VALID_CLUSTERS.find((c) => c === rawCluster);
if (!cluster) {
  throw new Error(
    `Invalid NEXT_PUBLIC_SOLANA_CLUSTER "${rawCluster}". Expected one of: ${VALID_CLUSTERS.join(", ")}.`,
  );
}

const envRpcUrl = clean(process.env.NEXT_PUBLIC_SOLANA_RPC_URL);
const envWsUrl = clean(process.env.NEXT_PUBLIC_SOLANA_WS_URL);

const rpcUrl = isHttpUrl(envRpcUrl) ? envRpcUrl : DEFAULT_RPC[cluster];
const wsUrl = isWsUrl(envWsUrl) ? envWsUrl : DEFAULT_WS[cluster];

if (envRpcUrl && envRpcUrl !== rpcUrl) {
  console.warn(
    `Ignoring NEXT_PUBLIC_SOLANA_RPC_URL "${envRpcUrl}" — must start with http:// or https://. Using ${rpcUrl}.`,
  );
}
if (envWsUrl && envWsUrl !== wsUrl) {
  console.warn(
    `Ignoring NEXT_PUBLIC_SOLANA_WS_URL "${envWsUrl}" — must start with ws:// or wss://. Using ${wsUrl}.`,
  );
}

export const solanaConfig = {
  cluster,
  rpcUrl,
  wsUrl,
} as const;

export type SolanaConfig = typeof solanaConfig;

export const LAMPORTS_PER_SOL = 1_000_000_000n;
