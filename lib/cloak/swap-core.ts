"use client";

import {
  createUtxo,
  createZeroUtxo,
  generateUtxoKeypair,
  isRootNotFoundError,
  swapWithChange,
  transact,
  type TransactResult,
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
  | "success";

export type SwapCallbacks = {
  onPhase?: (phase: SwapPhase) => void;
  onProgress?: (status: string) => void;
  onProofProgress?: (percent: number) => void;
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
  swapStatePda: string;
  requestId?: string;
  recipientAta: string;
  depositMerkleTree?: TransactResult["merkleTree"];
};

const SWAP_MAX_ATTEMPTS = 3;
const SWAP_RETRY_DELAY_MS = 1500;
const POST_DEPOSIT_BASE_DELAY_MS = 4000;

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
  } = args;

  applyBufferPolyfill();

  onPhase?.("deposit-proof");

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

  onPhase?.("success");

  return {
    depositSignature: depositResult.signature,
    swapSignature: swapResult.signature,
    swapStatePda: swapResult.swapStatePda,
    requestId: swapResult.requestId,
    recipientAta: recipientAta.toBase58(),
    depositMerkleTree: depositResult.merkleTree,
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
