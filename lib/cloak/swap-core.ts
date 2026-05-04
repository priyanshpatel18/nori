"use client";

import {
  createUtxo,
  createZeroUtxo,
  fullWithdraw,
  generateUtxoKeypair,
  isRootNotFoundError,
  RelayService,
  swapWithChange,
  transact,
  type TransactResult,
  type TxStatus,
  type UtxoSwapResult,
} from "@cloak.dev/sdk";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import {
  type Connection,
  type PublicKey,
  type Transaction,
  type VersionedTransaction,
} from "@solana/web3.js";

import { applyBufferPolyfill } from "@/lib/buffer-polyfill";
import { isStaleNoteError, isSubmittingStatus } from "./fast-send-core";

export type SwapPhase =
  | "deposit-proof"
  | "deposit-submit"
  | "swap-proof"
  | "swap-submit"
  | "swap-settle"
  | "swap-recover"
  | "success";

export type SwapTxKind =
  | "deposit"
  | "open-swap-state"
  | "settlement"
  | "recovery";

export type SwapTxUpdate = {
  kind: SwapTxKind;
  signature: string | null;
  status: "pending" | "submitted" | "settled" | "failed";
  error?: string;
};

export type SwapCallbacks = {
  onPhase?: (phase: SwapPhase) => void;
  onProgress?: (status: string) => void;
  onProofProgress?: (percent: number) => void;
  onTxUpdate?: (update: SwapTxUpdate) => void;
};

export type SwapOnceArgs = {
  sellAmountBaseUnits: bigint;
  sellMint: PublicKey;
  buyMint: PublicKey;
  /** Slippage-protected minimum output in base units of `buyMint`. */
  minOutputBaseUnits: bigint;
  sender: PublicKey;
  connection: Connection;
  programId: PublicKey;
  relayUrl: string;
  signTransaction: <T extends Transaction | VersionedTransaction>(
    tx: T,
  ) => Promise<T>;
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
  /**
   * Verbose console trace tagged `[cloak/swap]`. Default `true` while the
   * Cloak team debugs the swap flow. Set to `false` from scripts that own
   * their own pretty-printer.
   */
  debug?: boolean;
} & SwapCallbacks;

export type SwapOnceResult = {
  depositSignature: string;
  swapSignature: string;
  /** Tx2 signature, populated once the relay reports the settlement landed. */
  settlementSignature: string | null;
  swapStatePda: string;
  requestId: string | null;
  recipientAta: string;
  depositMerkleTree?: TransactResult["merkleTree"];
};

const SWAP_MAX_ATTEMPTS = 3;
const SWAP_RETRY_DELAY_MS = 1500;
const POST_DEPOSIT_BASE_DELAY_MS = 4000;

const SETTLE_POLL_INTERVAL_MS = 2_000;
const SETTLE_MAX_DURATION_MS = 90_000;

/**
 * Thrown when the swap fails post-deposit. Carries the recovery outcome so
 * the caller can show the user where their funds are.
 */
export class SwapFailedAfterDepositError extends Error {
  constructor(
    message: string,
    readonly cause: unknown,
    readonly depositSignature: string,
    readonly recovery:
      | { kind: "refunded"; signature: string }
      | { kind: "refund-failed"; error: Error }
      | { kind: "skipped"; reason: string },
  ) {
    super(message);
    this.name = "SwapFailedAfterDepositError";
  }
}

export async function swapOnce(args: SwapOnceArgs): Promise<SwapOnceResult> {
  const {
    sellAmountBaseUnits,
    sellMint,
    buyMint,
    minOutputBaseUnits,
    sender,
    connection,
    programId,
    relayUrl,
    signTransaction,
    signMessage,
    onPhase,
    onProgress,
    onProofProgress,
    onTxUpdate,
    debug = true,
  } = args;

  applyBufferPolyfill();

  const log = createSwapStepLogger(debug, {
    sender,
    sellMint,
    buyMint,
    sellAmountBaseUnits,
    minOutputBaseUnits,
    programId,
    relayUrl,
    rpcEndpoint: connection.rpcEndpoint,
  });

  log.phase("deposit-proof");
  onPhase?.("deposit-proof");
  onTxUpdate?.({ kind: "deposit", signature: null, status: "pending" });
  onTxUpdate?.({ kind: "open-swap-state", signature: null, status: "pending" });
  onTxUpdate?.({ kind: "settlement", signature: null, status: "pending" });

  log.step("generating ephemeral utxo keypair");
  const ephemeralOwner = await generateUtxoKeypair();
  log.step("creating output utxo");
  const depositOutput = await createUtxo(
    sellAmountBaseUnits,
    ephemeralOwner,
    sellMint,
  );

  let depositPhase: SwapPhase = "deposit-proof";

  log.step("calling sdk.transact() for deposit");
  let depositResult: TransactResult;
  try {
    depositResult = await transact(
      {
        inputUtxos: [await createZeroUtxo(sellMint)],
        outputUtxos: [depositOutput],
        externalAmount: sellAmountBaseUnits,
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
        enforceViewingKeyRegistration: false,
        onProgress: (status) => {
          log.sdk(status);
          if (depositPhase === "deposit-proof" && isSubmittingStatus(status)) {
            depositPhase = "deposit-submit";
            log.phase("deposit-submit");
            onPhase?.("deposit-submit");
          }
          onProgress?.(status);
        },
        onProofProgress: (pct) => {
          log.proof(pct);
          onProofProgress?.(pct);
        },
      },
    );
  } catch (err) {
    log.failure("deposit-failed", err);
    onTxUpdate?.({
      kind: "deposit",
      signature: null,
      status: "failed",
      error: describeError(err),
    });
    throw err;
  }

  log.step(`deposit signature: ${depositResult.signature}`);
  onTxUpdate?.({
    kind: "deposit",
    signature: depositResult.signature,
    status: "settled",
  });

  // Anything after this point that throws strands the deposit on-chain. We
  // wrap so we can attempt an automatic refund (fullWithdraw) before the
  // error reaches the caller — the user only signed once, but their funds
  // are now in the pool, so we owe them at least a best-effort recovery.
  try {
    log.step("deriving recipient ATA");
    const recipientAta = await getAssociatedTokenAddress(buyMint, sender);
    log.step(`recipient ATA: ${recipientAta.toBase58()}`);

    let swapResult: UtxoSwapResult | undefined;
    for (let attempt = 1; attempt <= SWAP_MAX_ATTEMPTS; attempt += 1) {
      let swapPhase: SwapPhase = "swap-proof";
      log.phase("swap-proof");
      log.step(`swap attempt ${attempt}/${SWAP_MAX_ATTEMPTS}`);
      onPhase?.("swap-proof");
      onProgress?.(
        attempt === 1
          ? "Waiting for relay to index deposit"
          : `Waiting for relay (retry ${attempt}/${SWAP_MAX_ATTEMPTS})`,
      );

      const settleDelay = POST_DEPOSIT_BASE_DELAY_MS * attempt;
      log.step(`sleeping ${settleDelay}ms before swap proof`);
      await sleep(settleDelay);

      onProgress?.(
        attempt === 1
          ? "Generating swap proof"
          : `Generating swap proof (retry ${attempt}/${SWAP_MAX_ATTEMPTS})`,
      );

      try {
        // Drop the cached merkle tree on retries: the deposit's snapshot
        // can lag the relay's view (seen as "Leaf index N is beyond
        // next_index M" / "Local private notes may be stale"). Forcing a
        // refetch on retry lets the SDK rebuild from current chain state.
        const useFreshTree = attempt > 1;
        log.step(
          `calling sdk.swapWithChange() (cachedMerkleTree=${useFreshTree ? "off" : "on"})`,
        );
        swapResult = await swapWithChange(
          depositResult.outputUtxos,
          sellAmountBaseUnits,
          buyMint,
          recipientAta,
          minOutputBaseUnits,
          {
            connection,
            programId,
            relayUrl,
            walletPublicKey: sender,
            signTransaction,
            signMessage,
            enforceViewingKeyRegistration: false,
            cachedMerkleTree: useFreshTree
              ? undefined
              : depositResult.merkleTree,
            useUniqueNullifiers: true,
            onProgress: (status) => {
              log.sdk(status);
              if (swapPhase === "swap-proof" && isSubmittingStatus(status)) {
                swapPhase = "swap-submit";
                log.phase("swap-submit");
                onPhase?.("swap-submit");
              }
              onProgress?.(status);
            },
            onProofProgress: (pct) => {
              log.proof(pct);
              onProofProgress?.(pct);
            },
          },
          sender,
        );
        break;
      } catch (err) {
        const recoverable = isRootNotFoundError(err) || isStaleNoteError(err);
        log.step(
          `swap attempt ${attempt} threw: ${describeError(err)} (recoverable=${recoverable})`,
        );
        if (!recoverable || attempt === SWAP_MAX_ATTEMPTS) throw err;
        await sleep(SWAP_RETRY_DELAY_MS);
      }
    }

    if (!swapResult) throw new Error("Swap did not produce a result");

    log.step(`swap (Tx1) signature: ${swapResult.signature}`);
    log.step(`swap state PDA: ${swapResult.swapStatePda}`);
    if (swapResult.requestId) {
      log.step(`relay request id: ${swapResult.requestId}`);
    }
    onTxUpdate?.({
      kind: "open-swap-state",
      signature: swapResult.signature,
      status: "settled",
    });

    const requestId = swapResult.requestId ?? null;

    let settlementSignature: string | null = null;
    if (requestId) {
      log.phase("swap-settle");
      onPhase?.("swap-settle");
      onTxUpdate?.({
        kind: "settlement",
        signature: null,
        status: "submitted",
      });
      onProgress?.("Waiting for settlement");

      const settled = await pollSettlement(relayUrl, requestId, {
        onProgress,
        log,
      });
      settlementSignature = settled.txId ?? null;
      log.step(
        `settlement (Tx2) signature: ${settlementSignature ?? "<none>"}`,
      );
      onTxUpdate?.({
        kind: "settlement",
        signature: settlementSignature,
        status: "settled",
      });
    } else {
      log.step("no requestId returned — skipping settlement poll");
    }

    log.phase("success");
    log.success({
      deposit: depositResult.signature,
      swap: swapResult.signature,
      settlement: settlementSignature,
    });
    onPhase?.("success");

    return {
      depositSignature: depositResult.signature,
      swapSignature: swapResult.signature,
      settlementSignature,
      swapStatePda: swapResult.swapStatePda,
      requestId,
      recipientAta: recipientAta.toBase58(),
      depositMerkleTree: depositResult.merkleTree,
    };
  } catch (err) {
    log.failure("post-deposit-failed", err);
    onTxUpdate?.({
      kind: "settlement",
      signature: null,
      status: "failed",
      error: describeError(err),
    });

    const recovery = await attemptRefund({
      depositResult,
      sender,
      connection,
      programId,
      relayUrl,
      signTransaction,
      signMessage,
      onPhase,
      onProgress,
      onTxUpdate,
      log,
    });

    throw new SwapFailedAfterDepositError(
      buildPostDepositMessage(err, recovery),
      err,
      depositResult.signature,
      recovery,
    );
  }
}

async function pollSettlement(
  relayUrl: string,
  requestId: string,
  hooks: {
    onProgress?: (status: string) => void;
    log: SwapStepLogger;
  },
): Promise<TxStatus> {
  const relay = new RelayService(relayUrl);
  const startedAt = Date.now();
  let lastStatus: TxStatus["status"] | null = null;
  let iteration = 0;

  while (true) {
    iteration += 1;
    const status = await relay.getStatus(requestId);
    hooks.log.step(
      `settle poll #${iteration}: status=${status.status}` +
        (status.txId ? ` txId=${status.txId}` : "") +
        (status.error ? ` error=${status.error}` : ""),
    );

    if (status.status !== lastStatus) {
      lastStatus = status.status;
      hooks.onProgress?.(`Settlement ${status.status}`);
    }

    if (status.status === "completed") return status;
    if (status.status === "failed") {
      throw new Error(
        `Settlement failed${status.error ? `: ${status.error}` : ""}`,
      );
    }

    if (Date.now() - startedAt > SETTLE_MAX_DURATION_MS) {
      throw new Error("Timed out waiting for settlement");
    }

    await sleep(SETTLE_POLL_INTERVAL_MS);
  }
}

type RecoveryOutcome =
  | { kind: "refunded"; signature: string }
  | { kind: "refund-failed"; error: Error }
  | { kind: "skipped"; reason: string };

async function attemptRefund(args: {
  depositResult: TransactResult;
  sender: PublicKey;
  connection: Connection;
  programId: PublicKey;
  relayUrl: string;
  signTransaction: <T extends Transaction | VersionedTransaction>(
    tx: T,
  ) => Promise<T>;
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
  onPhase?: (phase: SwapPhase) => void;
  onProgress?: (status: string) => void;
  onTxUpdate?: (update: SwapTxUpdate) => void;
  log: SwapStepLogger;
}): Promise<RecoveryOutcome> {
  const {
    depositResult,
    sender,
    connection,
    programId,
    relayUrl,
    signTransaction,
    signMessage,
    onPhase,
    onProgress,
    onTxUpdate,
    log,
  } = args;

  if (!depositResult.outputUtxos || depositResult.outputUtxos.length === 0) {
    log.step("recovery skipped: no output utxos to refund");
    return { kind: "skipped", reason: "no output utxos" };
  }

  log.phase("swap-recover");
  onPhase?.("swap-recover");
  onProgress?.("Refunding your deposit");
  onTxUpdate?.({ kind: "recovery", signature: null, status: "submitted" });

  try {
    log.step("calling sdk.fullWithdraw() to refund deposit");
    const refund = await fullWithdraw(depositResult.outputUtxos, sender, {
      connection,
      programId,
      relayUrl,
      walletPublicKey: sender,
      signTransaction,
      signMessage,
      enforceViewingKeyRegistration: false,
      cachedMerkleTree: depositResult.merkleTree,
      onProgress: (status) => {
        log.sdk(`recovery: ${status}`);
        onProgress?.(`Refund: ${status}`);
      },
    });

    log.step(`recovery signature: ${refund.signature}`);
    onTxUpdate?.({
      kind: "recovery",
      signature: refund.signature,
      status: "settled",
    });
    return { kind: "refunded", signature: refund.signature };
  } catch (refundErr) {
    const error =
      refundErr instanceof Error
        ? refundErr
        : new Error(describeError(refundErr));
    log.step(`recovery FAILED: ${describeError(error)}`);
    onTxUpdate?.({
      kind: "recovery",
      signature: null,
      status: "failed",
      error: describeError(error),
    });
    return { kind: "refund-failed", error };
  }
}

function buildPostDepositMessage(
  cause: unknown,
  recovery: RecoveryOutcome,
): string {
  const causeMsg = describeError(cause);
  switch (recovery.kind) {
    case "refunded":
      return `Swap failed (${causeMsg}). Your funds were refunded in tx ${recovery.signature}.`;
    case "refund-failed":
      return `Swap failed (${causeMsg}) and the automatic refund also failed (${describeError(recovery.error)}). Your deposit is still shielded — contact support with the deposit signature.`;
    case "skipped":
      return `Swap failed (${causeMsg}). Recovery skipped: ${recovery.reason}.`;
  }
}

type SwapStepLogger = {
  phase: (phase: SwapPhase) => void;
  step: (msg: string) => void;
  sdk: (msg: string) => void;
  proof: (pct: number) => void;
  success: (sigs: {
    deposit: string;
    swap: string;
    settlement: string | null;
  }) => void;
  failure: (where: string, err: unknown) => void;
};

type SwapStepLoggerInputs = {
  sender: PublicKey;
  sellMint: PublicKey;
  buyMint: PublicKey;
  sellAmountBaseUnits: bigint;
  minOutputBaseUnits: bigint;
  programId: PublicKey;
  relayUrl: string;
  rpcEndpoint: string;
};

const NOOP_SWAP_LOGGER: SwapStepLogger = {
  phase: () => {},
  step: () => {},
  sdk: () => {},
  proof: () => {},
  success: () => {},
  failure: () => {},
};

function createSwapStepLogger(
  enabled: boolean,
  inputs: SwapStepLoggerInputs,
): SwapStepLogger {
  if (!enabled || typeof console === "undefined") return NOOP_SWAP_LOGGER;

  const startedAt = Date.now();
  const phaseStart = new Map<SwapPhase, number>();
  let activePhase: SwapPhase | null = null;
  let lastProofBucket = -1;

  const ts = (): string => {
    const elapsed = (Date.now() - startedAt) / 1000;
    return `+${elapsed.toFixed(2).padStart(6)}s`;
  };
  const tag = (...rest: unknown[]) =>
    console.log(`[cloak/swap] ${ts()}`, ...rest);

  console.groupCollapsed(
    `[cloak/swap] start · ${shortKey(inputs.sellMint)} ${inputs.sellAmountBaseUnits.toString()} → ${shortKey(inputs.buyMint)} (min ${inputs.minOutputBaseUnits.toString()})`,
  );
  console.log("inputs:", {
    sender: inputs.sender.toBase58(),
    sellMint: inputs.sellMint.toBase58(),
    buyMint: inputs.buyMint.toBase58(),
    sellAmountBaseUnits: inputs.sellAmountBaseUnits.toString(),
    minOutputBaseUnits: inputs.minOutputBaseUnits.toString(),
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
      const bucket = Math.max(0, Math.min(100, Math.floor(pct / 10) * 10));
      if (bucket === lastProofBucket) return;
      lastProofBucket = bucket;
      tag(`${activePhase ?? "?"}: proof ${bucket}%`);
    },
    success(sigs) {
      tag(
        `success · deposit=${sigs.deposit} swap=${sigs.swap} settlement=${sigs.settlement ?? "<none>"}`,
      );
      console.groupEnd();
    },
    failure(where, err) {
      tag(`FAILED at ${where} · ${describeError(err)}`);
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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
