import { isAddress } from "@solana/kit";

import { toBaseUnits, type ShieldToken } from "@/lib/cloak/tokens";

import type { PayrollRow } from "./parse-csv";

export type RowIssue =
  | { kind: "wallet-empty" }
  | { kind: "wallet-invalid" }
  | { kind: "amount-empty" }
  | { kind: "amount-format" }
  | { kind: "amount-non-positive" }
  | { kind: "amount-decimals"; max: number }
  | { kind: "amount-below-min"; min: string };

export type ValidatedRow = {
  row: PayrollRow;
  wallet: string;
  amount: string;
  walletIssue?: Extract<RowIssue, { kind: "wallet-empty" | "wallet-invalid" }>;
  amountIssue?: Exclude<
    RowIssue,
    { kind: "wallet-empty" | "wallet-invalid" }
  >;
  /** Amount in token base units, only set when valid. */
  amountBaseUnits?: bigint;
  /** Variable fee in token base units (0.3% of amount). */
  variableFeeBaseUnits?: bigint;
  /** Recipient net (amount - variable - fixed-when-SOL). */
  netBaseUnits?: bigint;
  isValid: boolean;
};

const VARIABLE_FEE_BPS = 30; // 0.30%
const FIXED_FEE_LAMPORTS = 5_000_000n; // 0.005 SOL
const MIN_AMOUNT_DECIMAL = "0.01";

export function validateRows(
  rows: PayrollRow[],
  token: ShieldToken,
): ValidatedRow[] {
  return rows.map((row) => {
    const wallet = row.wallet.trim();
    const amount = row.amount.trim();

    const walletIssue = validateWallet(wallet);
    const amountIssue = validateAmount(amount, token);

    if (walletIssue || amountIssue) {
      return {
        row,
        wallet,
        amount,
        walletIssue,
        amountIssue,
        isValid: false,
      };
    }

    const amountBaseUnits = toBaseUnits(amount, token.decimals);
    const variableFeeBaseUnits =
      (amountBaseUnits * BigInt(VARIABLE_FEE_BPS)) / 10_000n;
    const fixedDeducted = token.id === "SOL" ? FIXED_FEE_LAMPORTS : 0n;
    const net = amountBaseUnits - variableFeeBaseUnits - fixedDeducted;
    const netBaseUnits = net < 0n ? 0n : net;

    return {
      row,
      wallet,
      amount,
      amountBaseUnits,
      variableFeeBaseUnits,
      netBaseUnits,
      isValid: true,
    };
  });
}

export type RowValidationOnly = ReturnType<typeof validateRows>;

export type PayrollTotals = {
  validCount: number;
  invalidCount: number;
  /** Sum of valid row amounts, in token base units. */
  totalBaseUnits: bigint;
  /** Sum of recipient nets, in token base units. */
  totalNetBaseUnits: bigint;
  /** Sum of variable fees, in token base units. */
  totalVariableFeeBaseUnits: bigint;
  /** Total fixed fees in lamports. Always SOL. (validCount × 0.005 SOL.) */
  totalFixedFeeLamports: bigint;
};

export function totalsFor(validated: ValidatedRow[]): PayrollTotals {
  let validCount = 0;
  let invalidCount = 0;
  let totalBaseUnits = 0n;
  let totalNetBaseUnits = 0n;
  let totalVariableFeeBaseUnits = 0n;

  for (const r of validated) {
    if (!r.isValid) {
      invalidCount++;
      continue;
    }
    validCount++;
    totalBaseUnits += r.amountBaseUnits!;
    totalNetBaseUnits += r.netBaseUnits!;
    totalVariableFeeBaseUnits += r.variableFeeBaseUnits!;
  }

  const totalFixedFeeLamports = FIXED_FEE_LAMPORTS * BigInt(validCount);

  return {
    validCount,
    invalidCount,
    totalBaseUnits,
    totalNetBaseUnits,
    totalVariableFeeBaseUnits,
    totalFixedFeeLamports,
  };
}

export function describeRowIssue(issue: RowIssue): string {
  switch (issue.kind) {
    case "wallet-empty":
      return "Wallet is empty";
    case "wallet-invalid":
      return "Not a valid Solana address";
    case "amount-empty":
      return "Amount is empty";
    case "amount-format":
      return "Amount must be a number";
    case "amount-non-positive":
      return "Amount must be greater than zero";
    case "amount-decimals":
      return `Up to ${issue.max} decimal places`;
    case "amount-below-min":
      return `Below minimum (${issue.min})`;
  }
}

function validateWallet(
  wallet: string,
): Extract<RowIssue, { kind: "wallet-empty" | "wallet-invalid" }> | undefined {
  if (!wallet) return { kind: "wallet-empty" };
  if (wallet.length < 32 || wallet.length > 44 || !isAddress(wallet)) {
    return { kind: "wallet-invalid" };
  }
  return undefined;
}

function validateAmount(
  amount: string,
  token: ShieldToken,
):
  | Exclude<RowIssue, { kind: "wallet-empty" | "wallet-invalid" }>
  | undefined {
  if (!amount) return { kind: "amount-empty" };
  if (!/^\d*\.?\d*$/.test(amount) || amount === ".") {
    return { kind: "amount-format" };
  }
  const numeric = Number(amount);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return { kind: "amount-non-positive" };
  }
  const dot = amount.indexOf(".");
  const decimals = dot === -1 ? 0 : amount.length - dot - 1;
  if (decimals > token.decimals) {
    return { kind: "amount-decimals", max: token.decimals };
  }
  if (numeric < Number(MIN_AMOUNT_DECIMAL)) {
    return { kind: "amount-below-min", min: MIN_AMOUNT_DECIMAL };
  }
  return undefined;
}
