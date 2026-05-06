"use client";

import { NATIVE_SOL_MINT } from "@cloak.dev/sdk";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import * as React from "react";

import {
  listShieldTokens,
  type ShieldTokenId,
} from "@/lib/cloak/tokens";

export type WalletBalances = Partial<Record<ShieldTokenId, bigint>>;

export type WalletBalanceStatus = "idle" | "loading" | "success" | "error";

export type UseWalletBalances = {
  balances: WalletBalances;
  status: WalletBalanceStatus;
  error: Error | null;
  /** Force a fresh fetch. Returns the new map (or {} on failure). */
  refetch: () => Promise<WalletBalances>;
};

/**
 * Fetch the connected wallet's on-chain balance for each registered shield
 * token (SOL + SPL mints) using the configured RPC. SPL balances come from
 * `getTokenAccountsByOwner({ mint })` filtered to the program token, which
 * works on any standard JSON-RPC including Helius.
 *
 * Returns balances keyed by `ShieldTokenId`, in base units (lamports for SOL,
 * smallest unit for SPL). Missing tokens (or wallets with no ATA yet) report
 * as `0n`, not `undefined` — only an unconnected wallet returns `{}`.
 */
export function useWalletBalances(): UseWalletBalances {
  const { connection } = useConnection();
  const wallet = useWallet();
  const walletKey = wallet.publicKey?.toBase58() ?? null;

  const [balances, setBalances] = React.useState<WalletBalances>({});
  const [status, setStatus] = React.useState<WalletBalanceStatus>("idle");
  const [error, setError] = React.useState<Error | null>(null);

  const fetchAll = React.useCallback(async (): Promise<WalletBalances> => {
    if (!walletKey) {
      setBalances({});
      setStatus("idle");
      setError(null);
      return {};
    }

    setStatus("loading");
    setError(null);
    const owner = new PublicKey(walletKey);
    const tokens = listShieldTokens();
    const out: WalletBalances = {};

    try {
      await Promise.all(
        tokens.map(async (t) => {
          if (t.mint.equals(NATIVE_SOL_MINT)) {
            const lamports = await connection.getBalance(owner);
            out[t.id] = BigInt(lamports);
            return;
          }
          // For SPL tokens we use getTokenAccountsByOwner so we don't need
          // to derive the ATA up front — handles legacy + Token-2022 owners
          // who may have multiple accounts (we sum them).
          const resp = await connection.getTokenAccountsByOwner(
            owner,
            { mint: t.mint, programId: TOKEN_PROGRAM_ID },
            "confirmed",
          );
          let total = 0n;
          for (const { pubkey } of resp.value) {
            const balance = await connection.getTokenAccountBalance(
              pubkey,
              "confirmed",
            );
            total += BigInt(balance.value.amount);
          }
          out[t.id] = total;
        }),
      );

      setBalances(out);
      setStatus("success");
      return out;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      setStatus("error");
      return {};
    }
  }, [connection, walletKey]);

  React.useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  return { balances, status, error, refetch: fetchAll };
}
