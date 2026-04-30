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

import { cloakConfig } from "./config";

export type FastSendPhase =
  | "deposit-proof"
  | "deposit-submit"
  | "withdraw-proof"
  | "withdraw-submit"
  | "success";

export type FastSendCallbacks = {
  onPhase?: (phase: FastSendPhase) => void;
  /** Mirrors the SDK's onProgress for both legs. */
  onProgress?: (status: string) => void;
  /** 0–100 from the SDK's onProofProgress for the active proof phase. */
  onProofProgress?: (percent: number) => void;
};

export type FastSendOnceArgs = {
  amountBaseUnits: bigint;
  mint: PublicKey;
  recipient: PublicKey;
  sender: PublicKey;
  connection: Connection;
  signTransaction: <T extends Transaction | VersionedTransaction>(
    transaction: T,
  ) => Promise<T>;
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
} & FastSendCallbacks;

export type FastSendOnceResult = {
  depositSignature: string;
  withdrawSignature: string;
  /**
   * The deposit Merkle tree, returned in case the caller wants to chain another
   * operation off this UTXO before it propagates to the relay.
   */
  depositMerkleTree?: TransactResult["merkleTree"];
};

const WITHDRAW_MAX_ATTEMPTS = 3;
const WITHDRAW_RETRY_DELAY_MS = 1500;

/**
 * Execute one fast-send (deposit + fullWithdraw to recipient). Pure async
 * function — no React state. Callers (single-send hook, batch hook, etc.)
 * subscribe to phase / progress via callbacks.
 */
export async function fastSendOnce(
  args: FastSendOnceArgs,
): Promise<FastSendOnceResult> {
  const {
    amountBaseUnits,
    mint,
    recipient,
    sender,
    connection,
    signTransaction,
    signMessage,
    onPhase,
    onProgress,
    onProofProgress,
  } = args;

  applyBufferPolyfill();

  // Phase 1 — deposit proof + submit
  onPhase?.("deposit-proof");

  const ephemeralOwner = await generateUtxoKeypair();
  const output = await createUtxo(amountBaseUnits, ephemeralOwner, mint);

  let depositPhase: FastSendPhase = "deposit-proof";

  const depositResult = await transact(
    {
      inputUtxos: [await createZeroUtxo(mint)],
      outputUtxos: [output],
      externalAmount: amountBaseUnits,
      depositor: sender,
    },
    {
      connection,
      programId: cloakConfig.programId,
      relayUrl: cloakConfig.relayUrl,
      depositorPublicKey: sender,
      walletPublicKey: sender,
      signTransaction,
      signMessage,
      onProgress: (status) => {
        if (
          depositPhase === "deposit-proof" &&
          isSubmittingStatus(status)
        ) {
          depositPhase = "deposit-submit";
          onPhase?.("deposit-submit");
        }
        onProgress?.(status);
      },
      onProofProgress: (percent) => onProofProgress?.(percent),
    },
  );

  // Phase 2 — withdraw proof + submit, with stale-root retry
  let withdrawResult: TransactResult | undefined;
  for (let attempt = 1; attempt <= WITHDRAW_MAX_ATTEMPTS; attempt += 1) {
    let withdrawPhase: FastSendPhase = "withdraw-proof";
    onPhase?.("withdraw-proof");
    onProgress?.(
      attempt === 1
        ? "Generating withdraw proof"
        : `Generating withdraw proof (retry ${attempt}/${WITHDRAW_MAX_ATTEMPTS})`,
    );

    try {
      withdrawResult = await fullWithdraw(depositResult.outputUtxos, recipient, {
        connection,
        programId: cloakConfig.programId,
        relayUrl: cloakConfig.relayUrl,
        walletPublicKey: sender,
        signTransaction,
        signMessage,
        cachedMerkleTree: depositResult.merkleTree,
        onProgress: (status) => {
          if (
            withdrawPhase === "withdraw-proof" &&
            isSubmittingStatus(status)
          ) {
            withdrawPhase = "withdraw-submit";
            onPhase?.("withdraw-submit");
          }
          onProgress?.(status);
        },
        onProofProgress: (percent) => onProofProgress?.(percent),
      });
      break;
    } catch (err) {
      if (!isRootNotFoundError(err) || attempt === WITHDRAW_MAX_ATTEMPTS) {
        throw err;
      }
      await sleep(WITHDRAW_RETRY_DELAY_MS);
    }
  }

  if (!withdrawResult) {
    throw new Error("Withdraw did not produce a result");
  }

  onPhase?.("success");

  return {
    depositSignature: depositResult.signature,
    withdrawSignature: withdrawResult.signature,
    depositMerkleTree: depositResult.merkleTree,
  };
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
