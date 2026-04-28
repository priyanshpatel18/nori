"use client";

import { useWallet } from "@solana/wallet-adapter-react";

import { LAMPORTS_PER_SOL } from "@/lib/solana/config";
import { useSolBalance } from "@/lib/solana/hooks/use-sol-balance";

function formatSol(lamports: bigint, fractionDigits = 4): string {
  const whole = lamports / LAMPORTS_PER_SOL;
  const fraction = lamports % LAMPORTS_PER_SOL;
  const fractionStr = fraction
    .toString()
    .padStart(9, "0")
    .slice(0, fractionDigits);
  return `${whole}.${fractionStr}`;
}

export function SolBalance() {
  const { publicKey } = useWallet();
  const balance = useSolBalance(publicKey?.toBase58());

  if (!publicKey) return null;

  if (balance.status === "loading" || balance.status === "idle") {
    return <span className="text-sm text-zinc-500">Loading balance...</span>;
  }

  if (balance.status === "error") {
    return (
      <span className="text-sm text-red-500" title={balance.error.message}>
        Failed to load balance
      </span>
    );
  }

  return (
    <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
      {formatSol(balance.lamports)} SOL
    </span>
  );
}
