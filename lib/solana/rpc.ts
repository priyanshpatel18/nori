import { createSolanaRpc, createSolanaRpcSubscriptions } from "@solana/kit";

import { solanaConfig } from "./config";

export const rpc = createSolanaRpc(solanaConfig.rpcUrl);
export const rpcSubscriptions = createSolanaRpcSubscriptions(
  solanaConfig.wsUrl,
);

export type SolanaRpc = typeof rpc;
export type SolanaRpcSubscriptions = typeof rpcSubscriptions;
