"use client";

import { rpc, rpcSubscriptions } from "../rpc";

export function useSolanaRpc() {
  return { rpc, rpcSubscriptions };
}
