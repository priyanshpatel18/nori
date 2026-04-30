import Papa from "papaparse";

export type PayrollRow = {
  /** 1-based row number from the original CSV (post-header). */
  rowNumber: number;
  /** Recipient Solana wallet (base58). May be empty if the column is missing. */
  wallet: string;
  /** Raw amount string as typed in the CSV. Validation happens later. */
  amount: string;
  /** Optional human label; first matched column among label/name/memo. */
  label?: string;
};

export type PayrollParseError = {
  rowNumber: number | null;
  message: string;
};

export type PayrollParseResult = {
  rows: PayrollRow[];
  errors: PayrollParseError[];
  /** Header column names that were detected, lower-cased and trimmed. */
  headers: string[];
};

const WALLET_HEADERS = ["wallet", "wallet_address", "address", "recipient"];
const AMOUNT_HEADERS = ["amount", "amount_usdc", "amount_sol", "value"];
const LABEL_HEADERS = ["label", "name", "memo", "note"];
const MAX_ROWS = 1000;

export async function parsePayrollCsv(
  file: File,
): Promise<PayrollParseResult> {
  const text = await file.text();

  return new Promise((resolve) => {
    Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h) => h.trim().toLowerCase(),
      complete: (result) => {
        resolve(buildResult(result));
      },
    });
  });
}

function buildResult(
  result: Papa.ParseResult<Record<string, string>>,
): PayrollParseResult {
  const errors: PayrollParseError[] = result.errors.map((e) => ({
    rowNumber: typeof e.row === "number" ? e.row + 1 : null,
    message: e.message,
  }));

  const headers = (result.meta.fields ?? []).map((f) => f.trim().toLowerCase());

  const walletKey = headers.find((h) => WALLET_HEADERS.includes(h));
  const amountKey = headers.find((h) => AMOUNT_HEADERS.includes(h));
  const labelKey = headers.find((h) => LABEL_HEADERS.includes(h));

  if (!walletKey) {
    errors.push({
      rowNumber: null,
      message: `Missing wallet column. Expected one of: ${WALLET_HEADERS.join(", ")}.`,
    });
  }
  if (!amountKey) {
    errors.push({
      rowNumber: null,
      message: `Missing amount column. Expected one of: ${AMOUNT_HEADERS.join(", ")}.`,
    });
  }

  const rows: PayrollRow[] = [];

  for (let i = 0; i < result.data.length; i += 1) {
    if (rows.length >= MAX_ROWS) {
      errors.push({
        rowNumber: null,
        message: `CSV exceeds the ${MAX_ROWS}-row limit. Extra rows were ignored.`,
      });
      break;
    }

    const record = result.data[i] ?? {};
    const wallet = walletKey ? (record[walletKey] ?? "").trim() : "";
    const amount = amountKey ? (record[amountKey] ?? "").trim() : "";
    const label = labelKey ? (record[labelKey] ?? "").trim() : "";

    if (!wallet && !amount) continue;

    rows.push({
      rowNumber: i + 1,
      wallet,
      amount,
      label: label || undefined,
    });
  }

  return { rows, errors, headers };
}
