import { PublicKey } from "@solana/web3.js";

import { solanaConfig, type SolanaCluster } from "@/lib/solana/config";

type CloakClusterConfig = {
  programId: PublicKey;
  relayUrl: string;
};

const CLUSTER_CONFIG: Partial<Record<SolanaCluster, CloakClusterConfig>> = {
  "mainnet-beta": {
    programId: new PublicKey("zh1eLd6rSphLejbFfJEneUwzHRfMKxgzrgkfwA6qRkW"),
    relayUrl: "https://api.cloak.ag",
  },
  devnet: {
    programId: new PublicKey("Zc1kHfp4rajSMeASFDwFFgkHRjv7dFQuLheJoQus27h"),
    relayUrl: "https://api.devnet.cloak.ag",
  },
};

const fromCluster = CLUSTER_CONFIG[solanaConfig.cluster];
if (!fromCluster) {
  throw new Error(
    `Cloak is not configured for cluster "${solanaConfig.cluster}". Set NEXT_PUBLIC_SOLANA_CLUSTER to "mainnet-beta" or "devnet".`,
  );
}

export const cloakConfig = {
  programId: fromCluster.programId,
  relayUrl: process.env.NEXT_PUBLIC_CLOAK_RELAY_URL ?? fromCluster.relayUrl,
} as const;

export const SHIELD_DEPOSIT_MIN_LAMPORTS = 10_000_000n;
