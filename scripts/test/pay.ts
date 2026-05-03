import { PublicKey } from "@solana/web3.js";

import { fastSendOnce } from "@/lib/cloak/fast-send-core";

import {
  buildConnection,
  keypairSigner,
  loadKeypair,
  logHeader,
  logKv,
  pickCluster,
  pickTokenFromEnv,
  requireEnv,
  solscanTxUrl,
  toBaseUnits,
} from "./_shared";

async function main() {
  const preset = pickCluster();
  const token = pickTokenFromEnv(preset);
  const keypairPath = requireEnv("KEYPAIR");
  const recipientStr = requireEnv("RECIPIENT");
  const amountStr = requireEnv("AMOUNT");

  const sender = loadKeypair(keypairPath);
  const connection = buildConnection(preset);
  const signer = keypairSigner(sender);
  const recipient = new PublicKey(recipientStr);
  const amountBaseUnits = toBaseUnits(amountStr, token.decimals);

  logHeader(`Private pay · ${preset.cluster} · ${token.id} ${amountStr}`);
  logKv({
    rpc: connection.rpcEndpoint,
    relay: preset.relayUrl,
    program: preset.programId.toBase58(),
    sender: sender.publicKey.toBase58(),
    recipient: recipient.toBase58(),
    mint: token.mint.toBase58(),
    amountBaseUnits: amountBaseUnits.toString(),
  });

  let lastPhase = "";
  const startedAt = Date.now();

  const result = await fastSendOnce({
    amountBaseUnits,
    mint: token.mint,
    recipient,
    sender: sender.publicKey,
    connection,
    programId: preset.programId,
    relayUrl: preset.relayUrl,
    signTransaction: signer.signTransaction,
    signMessage: signer.signMessage,
    // Script has its own pretty-printer below — skip the duplicate
    // `[cloak/fast-send]` console group from fast-send-core.
    debug: false,
    onPhase: (phase) => {
      if (phase !== lastPhase) {
        lastPhase = phase;
        process.stdout.write(`\n  → ${phase}`);
      }
    },
    onProgress: (msg) => {
      process.stdout.write(`\n     ${msg}`);
    },
    onProofProgress: (pct) => {
      process.stdout.write(
        `\r     proof ${pct.toFixed(0).padStart(3)}%   `,
      );
    },
  });

  process.stdout.write("\n");
  logHeader(`Confirmed in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
  logKv({
    "Shield tx": solscanTxUrl(result.depositSignature, preset.cluster),
    "Payout tx": solscanTxUrl(result.withdrawSignature, preset.cluster),
  });
}

main().catch((err) => {
  process.stdout.write("\n\n");
  console.error("Failed:");
  console.error(err);
  process.exit(1);
});
