// Symbol/decimals fallback for mints the SDK's token registry doesn't
// label. Devnet mock USDC in particular comes back from the scanner with an
// empty `tx.symbol`, which would render as "TOKEN" / a truncated mint
// across the dashboard. Centralising the table keeps history, the issuer
// compliance dashboard, and the auditor view in lockstep.

export const NATIVE_SOL_MINT = "So11111111111111111111111111111111111111112";

export type KnownMint = {
  symbol: string;
  decimals: number;
};

export const KNOWN_MINTS: Record<string, KnownMint> = {
  [NATIVE_SOL_MINT]: { symbol: "SOL", decimals: 9 },
  // mainnet USDC
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: { symbol: "USDC", decimals: 6 },
  // devnet mock USDC (used by Nori's devnet faucet/relay)
  "61ro7AExqfk4dZYoCyRzTahahCC2TdUUZ4M5epMPunJf": {
    symbol: "USDC",
    decimals: 6,
  },
  // mainnet USDT
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: { symbol: "USDT", decimals: 6 },
};

// Note on precedence: when the mint is in our curated table, that label
// always wins — the SDK sometimes returns a *truncated mint* (e.g.
// "61ro…unJf") as the "symbol" for tokens it doesn't know, which would
// otherwise leak through and render as a fake symbol. The raw value is
// only used as a fallback for mints we don't have an entry for.
export function resolveSymbol(
  mint: string | null | undefined,
  raw?: string | null,
): string {
  if (mint && KNOWN_MINTS[mint]) return KNOWN_MINTS[mint].symbol;
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return "";
  // Drop SDK-supplied "symbols" that are obviously the mint itself
  // (truncated form like "abcd…wxyz" or the full base58 address).
  if (mint && trimmed === mint) return "";
  if (/^[1-9A-HJ-NP-Za-km-z]{4,8}…[1-9A-HJ-NP-Za-km-z]{4,8}$/.test(trimmed)) {
    return "";
  }
  return trimmed;
}

export function resolveDecimals(
  mint: string | null | undefined,
  raw?: number | null,
): number | undefined {
  if (mint && KNOWN_MINTS[mint]) return KNOWN_MINTS[mint].decimals;
  if (typeof raw === "number" && raw > 0) return raw;
  return undefined;
}
