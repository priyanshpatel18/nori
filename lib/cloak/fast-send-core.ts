"use client";

import {
  createUtxo,
  createZeroUtxo,
  fullWithdraw,
  generateUtxoKeypair,
  isRootNotFoundError,
  transact,
  type TransactResult,
} from "@cloak.dev/sdk";
import {
  type Connection,
  type PublicKey,
  type Transaction,
  type VersionedTransaction,
} from "@solana/web3.js";

import { applyBufferPolyfill } from "@/lib/buffer-polyfill";

export type FastSendPhase =
  | "deposit-proof"
  | "deposit-submit"
  | "withdraw-proof"
  | "withdraw-submit"
  | "success";

export type FastSendCallbacks = {
  onPhase?: (phase: FastSendPhase) => void;
  onProgress?: (status: string) => void;
  onProofProgress?: (percent: number) => void;
};

export type FastSendOnceArgs = {
  amountBaseUnits: bigint;
  mint: PublicKey;
  recipient: PublicKey;
  sender: PublicKey;
  connection: Connection;
  programId: PublicKey;
  relayUrl: string;
  signTransaction: <T extends Transaction | VersionedTransaction>(
    transaction: T,
  ) => Promise<T>;
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
  /**
   * Emit a verbose step-by-step trace to the console. Default `true` while
   * the Cloak team is actively debugging the pay flow. Set to `false` from
   * scripts that have their own pretty-printer (e.g. scripts/test/pay.ts).
   */
  debug?: boolean;
} & FastSendCallbacks;

export type FastSendOnceResult = {
  depositSignature: string;
  withdrawSignature: string;
  depositMerkleTree?: TransactResult["merkleTree"];
};

const WITHDRAW_MAX_ATTEMPTS = 3;
const WITHDRAW_RETRY_DELAY_MS = 1500;

// Wait this long after the deposit lands before attempting the withdraw, so
// the relay's commitment-tree fetch sees our new note. Multiplied per retry:
// 4s, 8s, 12s.
const POST_DEPOSIT_BASE_DELAY_MS = 4000;

export async function fastSendOnce(
  args: FastSendOnceArgs,
): Promise<FastSendOnceResult> {
  const {
    amountBaseUnits,
    mint,
    recipient,
    sender,
    connection,
    programId,
    relayUrl,
    signTransaction,
    signMessage,
    onPhase,
    onProgress,
    onProofProgress,
    debug = true,
  } = args;

  applyBufferPolyfill();

  const log = createStepLogger(debug, {
    sender,
    recipient,
    mint,
    amountBaseUnits,
    programId,
    relayUrl,
    rpcEndpoint: connection.rpcEndpoint,
  });

  try {
    log.phase("deposit-proof");
    onPhase?.("deposit-proof");

    log.step("generating ephemeral utxo keypair");
    const ephemeralOwner = await generateUtxoKeypair();
    log.step("creating output utxo");
    const output = await createUtxo(amountBaseUnits, ephemeralOwner, mint);

    let depositPhase: FastSendPhase = "deposit-proof";

    log.step("calling sdk.transact() for deposit");
    const depositResult = await transact(
      {
        inputUtxos: [await createZeroUtxo(mint)],
        outputUtxos: [output],
        externalAmount: amountBaseUnits,
        depositor: sender,
      },
      {
        connection,
        programId,
        relayUrl,
        depositorPublicKey: sender,
        walletPublicKey: sender,
        signTransaction,
        signMessage,
        // Skipping registration drops the extra signMessage popup. Fast-send
        // uses ephemeral UTXOs, so no persistent shielded balance needs scanning.
        enforceViewingKeyRegistration: false,
        onProgress: (status) => {
          log.sdk(status);
          if (
            depositPhase === "deposit-proof" &&
            isSubmittingStatus(status)
          ) {
            depositPhase = "deposit-submit";
            log.phase("deposit-submit");
            onPhase?.("deposit-submit");
          }
          onProgress?.(status);
        },
        onProofProgress: (percent) => {
          log.proof(percent);
          onProofProgress?.(percent);
        },
      },
    );

    log.step(`deposit signature: ${depositResult.signature}`);

    // The relay validates each UTXO's commitment against its just-fetched
    // leaves (SDK dist/index.js:4699) even when we pass cachedMerkleTree.
    // Sleep before the withdraw so the relay's view includes our deposit.
    // Backoff on retry: 4s, 8s, 12s.
    let withdrawResult: TransactResult | undefined;
    for (let attempt = 1; attempt <= WITHDRAW_MAX_ATTEMPTS; attempt += 1) {
      let withdrawPhase: FastSendPhase = "withdraw-proof";
      log.phase("withdraw-proof");
      log.step(
        `withdraw attempt ${attempt}/${WITHDRAW_MAX_ATTEMPTS}`,
      );
      onPhase?.("withdraw-proof");
      onProgress?.(
        attempt === 1
          ? "Waiting for relay to index deposit"
          : `Waiting for relay (retry ${attempt}/${WITHDRAW_MAX_ATTEMPTS})`,
      );

      const settleDelay = POST_DEPOSIT_BASE_DELAY_MS * attempt;
      log.step(`sleeping ${settleDelay}ms before withdraw proof`);
      await sleep(settleDelay);

      onProgress?.(
        attempt === 1
          ? "Generating withdraw proof"
          : `Generating withdraw proof (retry ${attempt}/${WITHDRAW_MAX_ATTEMPTS})`,
      );

      try {
        log.step("calling sdk.fullWithdraw()");
        withdrawResult = await fullWithdraw(
          depositResult.outputUtxos,
          recipient,
          {
            connection,
            programId,
            relayUrl,
            walletPublicKey: sender,
            signTransaction,
            signMessage,
            enforceViewingKeyRegistration: false,
            cachedMerkleTree: depositResult.merkleTree,
            onProgress: (status) => {
              log.sdk(status);
              if (
                withdrawPhase === "withdraw-proof" &&
                isSubmittingStatus(status)
              ) {
                withdrawPhase = "withdraw-submit";
                log.phase("withdraw-submit");
                onPhase?.("withdraw-submit");
              }
              onProgress?.(status);
            },
            onProofProgress: (percent) => {
              log.proof(percent);
              onProofProgress?.(percent);
            },
          },
        );
        break;
      } catch (err) {
        const recoverable = isRootNotFoundError(err) || isStaleNoteError(err);
        log.step(
          `withdraw attempt ${attempt} threw: ${describeError(err)} (recoverable=${recoverable})`,
        );
        if (!recoverable || attempt === WITHDRAW_MAX_ATTEMPTS) {
          throw err;
        }
        await sleep(WITHDRAW_RETRY_DELAY_MS);
      }
    }

    if (!withdrawResult) {
      throw new Error("Withdraw did not produce a result");
    }

    log.phase("success");
    log.step(`withdraw signature: ${withdrawResult.signature}`);
    log.success(depositResult.signature, withdrawResult.signature);
    onPhase?.("success");

    return {
      depositSignature: depositResult.signature,
      withdrawSignature: withdrawResult.signature,
      depositMerkleTree: depositResult.merkleTree,
    };
  } catch (err) {
    log.failure(err);
    throw err;
  }
}

export function isStaleNoteError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message;
  return (
    msg.includes("note index is stale") ||
    msg.includes("Local note commitment does not match relay tree")
  );
}

export function isSubmittingStatus(status: string): boolean {
  const s = status.toLowerCase();
  return (
    s.includes("submit") ||
    s.includes("send") ||
    s.includes("relay") ||
    s.includes("broadcast") ||
    s.includes("confirm")
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type StepLogger = {
  phase: (phase: FastSendPhase) => void;
  step: (msg: string) => void;
  sdk: (msg: string) => void;
  proof: (pct: number) => void;
  success: (deposit: string, withdraw: string) => void;
  failure: (err: unknown) => void;
};

type StepLoggerInputs = {
  sender: PublicKey;
  recipient: PublicKey;
  mint: PublicKey;
  amountBaseUnits: bigint;
  programId: PublicKey;
  relayUrl: string;
  rpcEndpoint: string;
};

const NOOP_LOGGER: StepLogger = {
  phase: () => {},
  step: () => {},
  sdk: () => {},
  proof: () => {},
  success: () => {},
  failure: () => {},
};

// Step-by-step trace of a fast-send. Tagged so it's easy to grep / filter
// in DevTools (`[cloak/fast-send]`). Each call prints a relative timestamp
// from the start of the operation so the Cloak team can see where the
// flow is wedging.
function createStepLogger(
  enabled: boolean,
  inputs: StepLoggerInputs,
): StepLogger {
  if (!enabled || typeof console === "undefined") return NOOP_LOGGER;

  const startedAt = Date.now();
  const phaseStart = new Map<FastSendPhase, number>();
  let activePhase: FastSendPhase | null = null;
  let lastProofBucket = -1;

  const ts = (): string => {
    const elapsed = (Date.now() - startedAt) / 1000;
    return `+${elapsed.toFixed(2).padStart(6)}s`;
  };
  const tag = (...rest: unknown[]) =>
    console.log(`[cloak/fast-send] ${ts()}`, ...rest);

  console.groupCollapsed(
    `[cloak/fast-send] start · ${shortKey(inputs.mint)} ${inputs.amountBaseUnits.toString()} → ${shortKey(inputs.recipient)}`,
  );
  console.log("inputs:", {
    sender: inputs.sender.toBase58(),
    recipient: inputs.recipient.toBase58(),
    mint: inputs.mint.toBase58(),
    amountBaseUnits: inputs.amountBaseUnits.toString(),
    programId: inputs.programId.toBase58(),
    relayUrl: inputs.relayUrl,
    rpcEndpoint: inputs.rpcEndpoint,
    startedAt: new Date(startedAt).toISOString(),
  });

  return {
    phase(phase) {
      const now = Date.now();
      if (activePhase) {
        const elapsedInPhase = now - (phaseStart.get(activePhase) ?? now);
        tag(`phase ${activePhase} → ${phase} (${elapsedInPhase}ms in prev)`);
      } else {
        tag(`phase → ${phase}`);
      }
      activePhase = phase;
      phaseStart.set(phase, now);
      lastProofBucket = -1;
    },
    step(msg) {
      tag(`${activePhase ?? "?"}: ${msg}`);
    },
    sdk(msg) {
      tag(`${activePhase ?? "?"}: sdk: ${msg}`);
    },
    proof(pct) {
      // Throttle to 10% buckets so a 0..100 stream doesn't spam the console.
      const bucket = Math.max(0, Math.min(100, Math.floor(pct / 10) * 10));
      if (bucket === lastProofBucket) return;
      lastProofBucket = bucket;
      tag(`${activePhase ?? "?"}: proof ${bucket}%`);
    },
    success(deposit, withdraw) {
      tag(`success · deposit=${deposit} withdraw=${withdraw}`);
      console.groupEnd();
    },
    failure(err) {
      tag(`FAILED · ${describeError(err)}`);
      console.error(err);
      const cause = (err as { cause?: unknown }).cause;
      if (cause !== undefined) console.error("cause:", cause);
      console.groupEnd();
    },
  };
}

function describeError(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  return String(err);
}

function shortKey(key: PublicKey): string {
  const s = key.toBase58();
  return s.length > 8 ? `${s.slice(0, 4)}…${s.slice(-4)}` : s;
}
