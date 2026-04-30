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
  } = args;

  applyBufferPolyfill();

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

  // The relay validates each UTXO's commitment against its just-fetched
  // leaves (SDK dist/index.js:4699) even when we pass cachedMerkleTree. Sleep
  // before the withdraw so the relay's view includes our deposit. Backoff on
  // retry: 4s, 8s, 12s.
  let withdrawResult: TransactResult | undefined;
  for (let attempt = 1; attempt <= WITHDRAW_MAX_ATTEMPTS; attempt += 1) {
    let withdrawPhase: FastSendPhase = "withdraw-proof";
    onPhase?.("withdraw-proof");
    onProgress?.(
      attempt === 1
        ? "Waiting for relay to index deposit"
        : `Waiting for relay (retry ${attempt}/${WITHDRAW_MAX_ATTEMPTS})`,
    );

    const settleDelay = POST_DEPOSIT_BASE_DELAY_MS * attempt;
    await sleep(settleDelay);

    onProgress?.(
      attempt === 1
        ? "Generating withdraw proof"
        : `Generating withdraw proof (retry ${attempt}/${WITHDRAW_MAX_ATTEMPTS})`,
    );

    try {
      withdrawResult = await fullWithdraw(depositResult.outputUtxos, recipient, {
        connection,
        programId,
        relayUrl,
        walletPublicKey: sender,
        signTransaction,
        signMessage,
        enforceViewingKeyRegistration: false,
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
      const recoverable =
        isRootNotFoundError(err) || isStaleNoteError(err);
      if (!recoverable || attempt === WITHDRAW_MAX_ATTEMPTS) {
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
