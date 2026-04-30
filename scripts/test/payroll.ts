// Batch payroll integration test. Mirrors the frontend's batch architecture:
// one transact() depositing the total, then one partialWithdraw per recipient.
// Failed rows leave the residual UTXO recoverable.
//
// Examples:
//
//   KEYPAIR=~/.config/solana/test.json \
//   CLUSTER=devnet TOKEN=USDC \
//   CSV=./scripts/test/sample-roster.csv \
//     pnpm test:payroll
//
//   CLUSTER=mainnet-beta RPC_URL=https://mainnet.helius-rpc.com/?api-key=... \
//   KEYPAIR=~/.config/solana/mainnet.json TOKEN=USDC \
//   CSV=./payroll-april.csv \
//     pnpm test:payroll

import { readFileSync } from "node:fs";

import {
  createUtxo,
  createZeroUtxo,
  generateUtxoKeypair,
  isRootNotFoundError,
  partialWithdraw,
  transact,
  type MerkleTree,
  type Utxo,
} from "@cloak.dev/sdk";
import { PublicKey } from "@solana/web3.js";

import { isStaleNoteError } from "@/lib/cloak/fast-send-core";
import type { ShieldToken } from "@/lib/cloak/tokens";
import { parsePayrollCsvText } from "@/lib/payroll/parse-csv";
import {
  describeRowIssue,
  totalsFor,
  validateRows,
} from "@/lib/payroll/validate";

import {
  buildConnection,
  expandHome,
  formatBaseUnits,
  keypairSigner,
  loadKeypair,
  logHeader,
  logKv,
  pickCluster,
  pickTokenFromEnv,
  requireEnv,
  solscanTxUrl,
} from "./_shared";

async function main() {
  const preset = pickCluster();
  const token = pickTokenFromEnv(preset);
  const keypairPath = requireEnv("KEYPAIR");
  const csvPath = requireEnv("CSV");

  const sender = loadKeypair(keypairPath);
  const connection = buildConnection(preset);
  const signer = keypairSigner(sender);

  const csvText = readFileSync(expandHome(csvPath), "utf8");
  const parsed = parsePayrollCsvText(csvText);

  const shieldToken: ShieldToken = {
    id: token.id,
    decimals: token.decimals,
    mint: token.mint,
  };

  const validated = validateRows(parsed.rows, shieldToken);
  const totals = totalsFor(validated);
  const validRows = validated.filter((r) => r.isValid);

  logHeader(`Batch payroll · ${preset.cluster} · ${token.id}`);
  logKv({
    rpc: connection.rpcEndpoint,
    relay: preset.relayUrl,
    program: preset.programId.toBase58(),
    sender: sender.publicKey.toBase58(),
    csv: csvPath,
    parsed: `${parsed.rows.length} rows`,
    valid: `${totals.validCount}`,
    invalid: `${totals.invalidCount}`,
    grossTotal: `${formatBaseUnits(totals.totalBaseUnits, token.decimals)} ${token.id}`,
    netTotal: `${formatBaseUnits(totals.totalNetBaseUnits, token.decimals)} ${token.id}`,
    fixedFeeTotal: `${formatBaseUnits(totals.totalFixedFeeLamports, 9)} SOL`,
  });

  if (parsed.errors.length > 0) {
    logHeader("Parse issues");
    for (const e of parsed.errors) {
      console.log(
        `  ${e.rowNumber !== null ? `row ${e.rowNumber}: ` : ""}${e.message}`,
      );
    }
  }

  const invalidRows = validated.filter((r) => !r.isValid);
  if (invalidRows.length > 0) {
    logHeader("Invalid rows (skipped)");
    for (const r of invalidRows) {
      const issues = [
        r.walletIssue && describeRowIssue(r.walletIssue),
        r.amountIssue && describeRowIssue(r.amountIssue),
      ]
        .filter(Boolean)
        .join("; ");
      console.log(
        `  row ${r.row.rowNumber}: ${r.wallet || "<empty>"} → ${issues}`,
      );
    }
  }

  if (validRows.length === 0) {
    logHeader("Nothing to send");
    return;
  }

  const startedAt = Date.now();

  const total = validRows.reduce((acc, r) => acc + r.amountBaseUnits!, 0n);
  logHeader(`Phase 1 · Depositing ${formatBaseUnits(total, token.decimals)} ${token.id} into pool`);

  const ephemeralKeypair = await generateUtxoKeypair();
  const depositOutput = await createUtxo(total, ephemeralKeypair, token.mint);

  let lastPhase = "";
  const depositResult = await transact(
    {
      inputUtxos: [await createZeroUtxo(token.mint)],
      outputUtxos: [depositOutput],
      externalAmount: total,
      depositor: sender.publicKey,
    },
    {
      connection,
      programId: preset.programId,
      relayUrl: preset.relayUrl,
      depositorPublicKey: sender.publicKey,
      walletPublicKey: sender.publicKey,
      signTransaction: signer.signTransaction,
      signMessage: signer.signMessage,
      enforceViewingKeyRegistration: false,
      onProgress: (status) => {
        if (status !== lastPhase) {
          lastPhase = status;
          process.stdout.write(`\n  ${status}`);
        }
      },
      onProofProgress: (pct) => {
        process.stdout.write(`\r  proof ${pct.toFixed(0).padStart(3)}%   `);
      },
    },
  );
  process.stdout.write(
    `\n  ✓ deposited in ${((Date.now() - startedAt) / 1000).toFixed(1)}s` +
      `\n    ${solscanTxUrl(depositResult.signature, preset.cluster)}\n`,
  );

  logHeader(`Phase 2 · Paying ${validRows.length} recipients from shielded balance`);

  let currentUtxo: Utxo = depositResult.outputUtxos[0];
  let cachedTree: MerkleTree | undefined = depositResult.merkleTree;

  let confirmed = 0;
  let failed = 0;

  const RELAY_SETTLE_DELAY_MS = 4000;
  const STALE_RETRY_MAX = 2;
  const STALE_RETRY_DELAY_MS = 4000;

  for (let i = 0; i < validRows.length; i += 1) {
    const r = validRows[i];

    await sleep(RELAY_SETTLE_DELAY_MS);

    process.stdout.write(`\n  [${r.row.rowNumber}] ${shortAddr(r.wallet)} `);
    const rowStart = Date.now();

    let attempt = 0;
    let success = false;
    let lastError: Error | null = null;
    let lastSig: string | null = null;
    let nextUtxo = currentUtxo;
    let nextTree = cachedTree;

    while (attempt <= STALE_RETRY_MAX) {
      let phaseSeen = "";
      if (attempt > 0) {
        process.stdout.write(
          `\n           ↻ retry (relay tree was stale, attempt ${attempt + 1})`,
        );
      }
      try {
        const result = await partialWithdraw(
          [currentUtxo],
          new PublicKey(r.wallet),
          r.amountBaseUnits!,
          {
            connection,
            programId: preset.programId,
            relayUrl: preset.relayUrl,
            walletPublicKey: sender.publicKey,
            signTransaction: signer.signTransaction,
            signMessage: signer.signMessage,
            enforceViewingKeyRegistration: false,
            cachedMerkleTree: cachedTree,
            onProgress: (status) => {
              if (status !== phaseSeen) {
                phaseSeen = status;
                process.stdout.write(`\n           → ${status}`);
              }
            },
            onProofProgress: (pct) => {
              process.stdout.write(
                `\r           proof ${pct.toFixed(0).padStart(3)}%   `,
              );
            },
          },
        );
        success = true;
        lastSig = result.signature;
        nextUtxo = result.outputUtxos[0];
        nextTree = result.merkleTree;
        break;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (
          (isStaleNoteError(lastError) || isRootNotFoundError(lastError)) &&
          attempt < STALE_RETRY_MAX
        ) {
          attempt += 1;
          await sleep(STALE_RETRY_DELAY_MS);
          continue;
        }
        break;
      }
    }

    if (success && lastSig) {
      confirmed += 1;
      currentUtxo = nextUtxo;
      cachedTree = nextTree;
      process.stdout.write(
        `\n           ✓ confirmed in ${((Date.now() - rowStart) / 1000).toFixed(1)}s` +
          `\n             payout ${solscanTxUrl(lastSig, preset.cluster)}`,
      );
    } else {
      failed += 1;
      const message = lastError ? lastError.message : "unknown";
      process.stdout.write(`\n           ✗ failed: ${truncate(message, 100)}`);
    }
  }

  process.stdout.write("\n");
  logHeader("Run complete");
  logKv({
    confirmed: `${confirmed}`,
    failed: `${failed}`,
    duration: `${((Date.now() - startedAt) / 1000).toFixed(1)}s`,
    deposit: solscanTxUrl(depositResult.signature, preset.cluster),
  });

  if (failed > 0) {
    logHeader("Recoverable balance");
    console.log(
      "  Some rows failed. The shielded UTXO still holds their funds.",
    );
    console.log(
      `  Ephemeral spend key (hex): ${ephemeralKeypair.privateKey.toString(16)}`,
    );
    console.log(
      "  Save this somewhere safe to recover via fullWithdraw later.",
    );
    process.exit(1);
  }
}

function shortAddr(s: string): string {
  if (s.length <= 12) return s;
  return `${s.slice(0, 6)}…${s.slice(-6)}`;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((err) => {
  process.stdout.write("\n\n");
  console.error("Failed:");
  console.error(err);
  process.exit(1);
});
