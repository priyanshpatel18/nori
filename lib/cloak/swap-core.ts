"use client";

import {
  createUtxo,
  createZeroUtxo,
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
  | "success";

export type SwapTxKind = "deposit" | "open-swap-state" | "settlement";

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
  } = args;

  applyBufferPolyfill();

  onPhase?.("deposit-proof");
  onTxUpdate?.({ kind: "deposit", signature: null, status: "pending" });
  onTxUpdate?.({ kind: "open-swap-state", signature: null, status: "pending" });
  onTxUpdate?.({ kind: "settlement", signature: null, status: "pending" });

  const ephemeralOwner = await generateUtxoKeypair();
  const depositOutput = await createUtxo(
    sellAmountBaseUnits,
    ephemeralOwner,
    sellMint,
  );

  let depositPhase: SwapPhase = "deposit-proof";

  const depositResult = await transact(
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
        if (depositPhase === "deposit-proof" && isSubmittingStatus(status)) {
          depositPhase = "deposit-submit";
          onPhase?.("deposit-submit");
        }
        onProgress?.(status);
      },
      onProofProgress: (pct) => onProofProgress?.(pct),
    },
  );

  onTxUpdate?.({
    kind: "deposit",
    signature: depositResult.signature,
    status: "settled",
  });

  const recipientAta = await getAssociatedTokenAddress(buyMint, sender);

  let swapResult: UtxoSwapResult | undefined;
  for (let attempt = 1; attempt <= SWAP_MAX_ATTEMPTS; attempt += 1) {
    let swapPhase: SwapPhase = "swap-proof";
    onPhase?.("swap-proof");
    onProgress?.(
      attempt === 1
        ? "Waiting for relay to index deposit"
        : `Waiting for relay (retry ${attempt}/${SWAP_MAX_ATTEMPTS})`,
    );

    await sleep(POST_DEPOSIT_BASE_DELAY_MS * attempt);

    onProgress?.(
      attempt === 1
        ? "Generating swap proof"
        : `Generating swap proof (retry ${attempt}/${SWAP_MAX_ATTEMPTS})`,
    );

    try {
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
          cachedMerkleTree: depositResult.merkleTree,
          useUniqueNullifiers: true,
          onProgress: (status) => {
            if (swapPhase === "swap-proof" && isSubmittingStatus(status)) {
              swapPhase = "swap-submit";
              onPhase?.("swap-submit");
            }
            onProgress?.(status);
          },
          onProofProgress: (pct) => onProofProgress?.(pct),
        },
        sender,
      );
      break;
    } catch (err) {
      const recoverable = isRootNotFoundError(err) || isStaleNoteError(err);
      if (!recoverable || attempt === SWAP_MAX_ATTEMPTS) throw err;
      await sleep(SWAP_RETRY_DELAY_MS);
    }
  }

  if (!swapResult) throw new Error("Swap did not produce a result");

  onTxUpdate?.({
    kind: "open-swap-state",
    signature: swapResult.signature,
    status: "settled",
  });

  const requestId = swapResult.requestId ?? null;

  let settlementSignature: string | null = null;
  if (requestId) {
    onPhase?.("swap-settle");
    onTxUpdate?.({
      kind: "settlement",
      signature: null,
      status: "submitted",
    });
    onProgress?.("Waiting for settlement");

    try {
      const settled = await pollSettlement(relayUrl, requestId, {
        onProgress,
      });
      settlementSignature = settled.txId ?? null;
      onTxUpdate?.({
        kind: "settlement",
        signature: settlementSignature,
        status: "settled",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      onTxUpdate?.({
        kind: "settlement",
        signature: null,
        status: "failed",
        error: message,
      });
      throw err;
    }
  }

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
}

async function pollSettlement(
  relayUrl: string,
  requestId: string,
  hooks: { onProgress?: (status: string) => void },
): Promise<TxStatus> {
  const relay = new RelayService(relayUrl);
  const startedAt = Date.now();
  let lastStatus: TxStatus["status"] | null = null;

  while (true) {
    const status = await relay.getStatus(requestId);

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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
