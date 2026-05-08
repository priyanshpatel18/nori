import { formatBaseUnits } from "./payment-history";
import type { ShieldTokenId } from "./tokens";
import type { WalletBalances } from "./use-wallet-balances";

// Cloak fee shape (kept in sync with lib/payroll/validate.ts and the relay).
export const FIXED_FEE_LAMPORTS = 5_000_000n; // 0.005 SOL per operation
export const VARIABLE_FEE_BPS = 30n; // 0.30%
// Solana network signature fee, ~5000 lamports per signed tx. Padded a bit
// so a brief priority-fee bump doesn't push the wallet under.
const SIGNATURE_FEE_LAMPORTS = 10_000n;

export type PreflightInput = {
  /**
   * Total token amount the user is sending (base units). For payroll
   * batches, sum across all valid rows.
   */
  amountBaseUnits: bigint;
  /** Decimals for the chosen send token, used for messaging. */
  decimals: number;
  /** Symbol shown in error toasts (e.g. "USDC", "SOL"). */
  symbol: string;
  /** Token id from the registry, used to read the matching wallet balance. */
  tokenId: ShieldTokenId;
  /**
   * Number of distinct on-chain operations. 1 for shield/pay; N for
   * payroll batches (the relay pays N fixed fees, one per recipient).
   */
  operations?: number;
  /** Snapshot of wallet balances from useWalletBalances. */
  walletBalances: WalletBalances;
};

export type PreflightResult =
  | { ok: true }
  | { ok: false; reason: string; description: string };

/**
 * Block-before-submit check that prevents the user from spending the
 * Solana network fee on a tx that's guaranteed to fail because the wallet
 * doesn't have enough SOL (for the Cloak fixed fee + signature) or enough
 * of the send token (for amount + Cloak variable fee).
 *
 * The hot paths (shield deposit, pay, payroll, team) call this right
 * before kicking off proof generation; if it returns `ok: false`, the
 * caller surfaces the reason via toast and aborts.
 */
export function checkPreflightBalance(
  input: PreflightInput,
): PreflightResult {
  const { amountBaseUnits, tokenId, decimals, symbol, walletBalances } = input;
  const operations = BigInt(Math.max(1, Math.floor(input.operations ?? 1)));

  const variableFee = (amountBaseUnits * VARIABLE_FEE_BPS) / 10_000n;
  const solBalance = walletBalances.SOL ?? 0n;

  // SOL needs: per-op fixed fee + signature fee. SOL deposits fold the
  // amount and variable fee into this same SOL balance.
  const baseSolNeeded =
    (FIXED_FEE_LAMPORTS + SIGNATURE_FEE_LAMPORTS) * operations;
  const solNeeded =
    tokenId === "SOL"
      ? baseSolNeeded + amountBaseUnits + variableFee
      : baseSolNeeded;

  if (solBalance < solNeeded) {
    const have = formatBaseUnits(solBalance.toString(), 9);
    const need = formatBaseUnits(solNeeded.toString(), 9);
    const opsLabel =
      operations > 1n
        ? `${operations} fixed fees`
        : "the fixed fee";
    return {
      ok: false,
      reason: tokenId === "SOL" ? `Not enough SOL` : "Not enough SOL for fees",
      description:
        tokenId === "SOL"
          ? `Need ${need} SOL (amount + ${opsLabel} + signature). Wallet has ${have} SOL.`
          : `Need ${need} SOL for ${opsLabel} + signature. Wallet has ${have} SOL.`,
    };
  }

  if (tokenId !== "SOL") {
    const tokenBalance = walletBalances[tokenId] ?? 0n;
    const tokenNeeded = amountBaseUnits + variableFee;
    if (tokenBalance < tokenNeeded) {
      const have = formatBaseUnits(tokenBalance.toString(), decimals);
      const need = formatBaseUnits(tokenNeeded.toString(), decimals);
      return {
        ok: false,
        reason: `Not enough ${symbol}`,
        description: `Need ${need} ${symbol} (amount + 0.30% relay fee). Wallet has ${have} ${symbol}.`,
      };
    }
  }

  return { ok: true };
}
