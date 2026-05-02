// Smoke-test scanTransactions in walletPublicKey mode without a private key.
//
// The walletPublicKey fallback detects withdrawals that landed on the
// wallet's ATA without needing to decrypt chain notes, so we only need a
// public key. We pass a deterministic placeholder `nk` so trial-decryption
// runs (and finds nothing) — incoming withdrawals still surface via the
// ATA-match path.
//
// Usage:
//   pnpm exec tsx scripts/test/scan.ts <walletPubkey>
//   CLUSTER=mainnet-beta pnpm exec tsx scripts/test/scan.ts <walletPubkey>

import { scanTransactions, toComplianceReport } from "@cloak.dev/sdk";
import { Connection, PublicKey } from "@solana/web3.js";

import {
  formatBaseUnits,
  logHeader,
  logKv,
  pickCluster,
  readEnv,
  solscanTxUrl,
} from "./_shared";

const PLACEHOLDER_NK = new Uint8Array(32);
PLACEHOLDER_NK.fill(0);

async function main() {
  const walletArg = process.argv[2];
  if (!walletArg) {
    throw new Error("Usage: tsx scripts/test/scan.ts <walletPubkey>");
  }
  const wallet = new PublicKey(walletArg);
  const preset = pickCluster();
  // getSignaturesForAddress requires at least `confirmed`, so build a
  // dedicated Connection rather than reusing the test helper which uses
  // `processed` for fast-send.
  const rpcUrl = readEnv("RPC_URL", preset.defaultRpcUrl)!;
  const connection = new Connection(rpcUrl, "confirmed");

  logHeader(`Scan · ${preset.cluster} · ${wallet.toBase58()}`);
  logKv({
    rpc: connection.rpcEndpoint,
    program: preset.programId.toBase58(),
  });

  const startedAt = Date.now();
  const result = await scanTransactions({
    connection,
    programId: preset.programId,
    viewingKeyNk: PLACEHOLDER_NK,
    walletPublicKey: wallet.toBase58(),
    onStatus: (s) => console.log(`  · ${s}`),
  });
  const elapsedMs = Date.now() - startedAt;

  const report = toComplianceReport(result);

  logHeader("Summary");
  logKv({
    transactions: report.summary.transactionCount,
    deposits: formatBaseUnits(BigInt(report.summary.totalDeposits), 9) + " SOL",
    withdrawals:
      formatBaseUnits(BigInt(report.summary.totalWithdrawals), 9) + " SOL",
    fees: formatBaseUnits(BigInt(report.summary.totalFees), 9) + " SOL",
    netChange: formatBaseUnits(BigInt(report.summary.netChange), 9) + " SOL",
    rpcCallsMade: report.rpcCallsMade,
    elapsedMs,
  });

  if (report.transactions.length === 0) {
    console.log("\n  (no transactions found for this wallet)");
    return;
  }

  logHeader(`Transactions (${report.transactions.length})`);
  for (const tx of report.transactions) {
    const decimals = tx.decimals ?? 9;
    const symbol = tx.symbol ?? "";
    const direction = tx.txType === "deposit" ? "→ pool" : "← pool";
    const amount = formatBaseUnits(BigInt(tx.netAmount), decimals);
    const ts = new Date(tx.timestamp).toISOString().replace("T", " ").slice(0, 19);
    console.log(
      `  ${ts}  ${tx.txType.padEnd(8)} ${direction}  ${amount} ${symbol}`,
    );
    if (tx.signature) {
      console.log(`             ${solscanTxUrl(tx.signature, preset.cluster)}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
