"use client";

import {
  computeUtxoCommitment,
  createUtxo,
  createZeroUtxo,
  deriveUtxoKeypairFromSpendKey,
  deriveViewKey,
  fullWithdraw,
  partialWithdraw,
  transact,
  type SpendKey,
  type Utxo,
} from "@cloak.dev/sdk";
import {
  type Connection,
  type PublicKey,
  type Transaction,
  type VersionedTransaction,
} from "@solana/web3.js";

import { applyBufferPolyfill } from "@/lib/buffer-polyfill";
import { isStaleNoteError } from "@/lib/cloak/fast-send-core";
import {
  clearMerkleTreeCache,
  loadMerkleTreeCache,
  saveMerkleTreeCache,
} from "@/lib/cloak/merkle-tree-cache";
import {
  buildRecoverableNoteB64,
  RECOVERABLE_SHIELDS_ENABLED,
} from "@/lib/cloak/recoverable-notes";
import {
  appendUtxos,
  hydrateUtxo,
  markSpent,
  utxosToStored,
  type StoredUtxo,
} from "@/lib/cloak/utxo-store";
import type { SolanaCluster } from "@/lib/solana/config";

export type ShieldPhase =
  | "deriving-key"
  | "consolidating"
  | "building-proof"
  | "submitting"
  | "confirming"
  | "success";

export type ShieldCallbacks = {
  onPhase?: (phase: ShieldPhase) => void;
  onProgress?: (status: string) => void;
  onProofProgress?: (percent: number) => void;
};

type SharedSdkOptions = {
  connection: Connection;
  programId: PublicKey;
  relayUrl: string;
  walletPublicKey: PublicKey;
  signTransaction: <T extends Transaction | VersionedTransaction>(
    transaction: T,
  ) => Promise<T>;
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
};

export type ShieldDepositArgs = SharedSdkOptions &
  ShieldCallbacks & {
    cluster: SolanaCluster;
    spendKey: SpendKey;
    amountBaseUnits: bigint;
    mint: PublicKey;
  };

export type ShieldDepositResult = {
  signature: string;
  added: StoredUtxo[];
};

export async function shieldDeposit(
  args: ShieldDepositArgs,
): Promise<ShieldDepositResult> {
  applyBufferPolyfill();

  const {
    cluster,
    spendKey,
    amountBaseUnits,
    mint,
    connection,
    programId,
    relayUrl,
    walletPublicKey,
    signTransaction,
    signMessage,
    onPhase,
    onProgress,
    onProofProgress,
  } = args;

  onPhase?.("deriving-key");
  const ownerKeypair = await deriveUtxoKeypairFromSpendKey(spendKey.sk_spend);

  onPhase?.("building-proof");
  const output = await createUtxo(amountBaseUnits, ownerKeypair, mint);
  const zero = await createZeroUtxo(mint);

  // When recoverable shields are enabled, attach a rich `EncryptedNote`
  // payload that carries the full NoteData (amount, blinding, per-UTXO
  // private key, commitment) encrypted to the wallet's view key. This is
  // what makes a future device able to rebuild a *spendable* UTXO from
  // chain alone. Trade-off: passing `encryptedNotes` replaces the SDK's
  // auto-generated compact chain note, so this shield won't appear in the
  // compact-note scanner used by `useOnChainBalance` / scan-received.
  // Discovery happens through the recoverable-notes scanner instead.
  let encryptedNotes: string[] | undefined;
  if (RECOVERABLE_SHIELDS_ENABLED) {
    const ownerViewKey = deriveViewKey(spendKey.sk_spend);
    const commitment = await computeUtxoCommitment(output);
    encryptedNotes = [
      buildRecoverableNoteB64({
        output,
        commitment,
        ownerViewKey,
      }),
    ];
  }

  let phase: ShieldPhase = "building-proof";

  const cachedTree = await loadMerkleTreeCache(cluster, programId);
  let result;
  try {
    result = await transact(
      {
        inputUtxos: [zero],
        outputUtxos: [output],
        externalAmount: amountBaseUnits,
        depositor: walletPublicKey,
      },
      {
        connection,
        programId,
        relayUrl,
        depositorPublicKey: walletPublicKey,
        walletPublicKey,
        signTransaction,
        signMessage,
        enforceViewingKeyRegistration: false,
        cachedMerkleTree: cachedTree,
        ...(encryptedNotes ? { encryptedNotes } : {}),
        onProgress: (status) => {
          if (phase === "building-proof" && /submit|send|broadcast/i.test(status)) {
            phase = "submitting";
            onPhase?.("submitting");
          } else if (phase === "submitting" && /confirm/i.test(status)) {
            phase = "confirming";
            onPhase?.("confirming");
          }
          onProgress?.(status);
        },
        onProofProgress: (pct) => onProofProgress?.(pct),
      } as Parameters<typeof transact>[1],
    );
  } catch (err) {
    if (isStaleNoteError(err)) clearMerkleTreeCache(cluster, programId);
    throw err;
  }
  saveMerkleTreeCache(cluster, programId, result.merkleTree);

  const added = utxosToStored(
    result.outputUtxos,
    ownerKeypair.publicKey,
    "deposit",
    result.signature,
  );
  appendUtxos(walletPublicKey.toBase58(), cluster, added);

  onPhase?.("success");
  return { signature: result.signature, added };
}

export type ShieldWithdrawArgs = SharedSdkOptions &
  ShieldCallbacks & {
    cluster: SolanaCluster;
    spendKey: SpendKey;
    amountBaseUnits: bigint;
    mint: PublicKey;
    recipient: PublicKey;
    available: StoredUtxo[];
  };

export type ShieldWithdrawResult = {
  signature: string;
  spent: StoredUtxo[];
  added: StoredUtxo[];
};

// Same SDK call powers both "send to address" and "withdraw to my wallet";
// the recipient is the only difference.
export async function shieldWithdrawTo(
  args: ShieldWithdrawArgs,
): Promise<ShieldWithdrawResult> {
  applyBufferPolyfill();

  const {
    cluster,
    spendKey,
    amountBaseUnits,
    mint,
    recipient,
    available,
    connection,
    programId,
    relayUrl,
    walletPublicKey,
    signTransaction,
    signMessage,
    onPhase,
    onProgress,
    onProofProgress,
  } = args;

  const mintBase58 = mint.toBase58();
  // SDK is 2-in/2-out per tx, so a single withdraw can spend at most the
  // top two notes by amount. If the user has more notes than that and the
  // top two don't cover the requested amount, we have to merge notes
  // (self-transfer 2 → 1) until the top two suffice. Each merge is its own
  // wallet popup + ZK proof, so we surface a `consolidating` phase to the UI.
  const walletKey = walletPublicKey.toBase58();
  let pool = available
    .filter((u) => u.mint === mintBase58 && !u.isSpent)
    .map((u) => ({ stored: u, amount: BigInt(u.amount) }))
    .sort((a, b) => (b.amount > a.amount ? 1 : b.amount < a.amount ? -1 : 0));

  const trueAvailable = pool.reduce((acc, c) => acc + c.amount, 0n);
  if (trueAvailable < amountBaseUnits) {
    throw new InsufficientShieldedBalanceError(amountBaseUnits, trueAvailable);
  }

  onPhase?.("deriving-key");
  const ownerKeypair = await deriveUtxoKeypairFromSpendKey(spendKey.sk_spend);

  // Consolidation loop. Each iteration merges the two smallest notes into
  // one larger note, reducing the pool by 1. Bounded by the initial pool
  // length so we can't infinite-loop on a programming bug.
  const consolidationSigs: string[] = [];
  for (let safety = pool.length; safety > 0; safety -= 1) {
    const top2 = pool[0].amount + (pool[1]?.amount ?? 0n);
    if (top2 >= amountBaseUnits || pool.length < 2) break;

    onPhase?.("consolidating");
    onProgress?.(
      `Merging ${pool.length} notes (${consolidationSigs.length + 1})`,
    );

    // Merge the two smallest notes, leaves the largest in place so we
    // converge fastest toward "top 2 covers".
    const a = pool[pool.length - 1];
    const b = pool[pool.length - 2];
    const mergedAmount = a.amount + b.amount;
    const inA = await hydrateUtxo(a.stored, spendKey);
    const inB = await hydrateUtxo(b.stored, spendKey);
    const mergedOutput = await createUtxo(mergedAmount, ownerKeypair, mint);
    const zeroOutput = await createZeroUtxo(mint);

    let mergeEncryptedNotes: string[] | undefined;
    if (RECOVERABLE_SHIELDS_ENABLED) {
      const ownerViewKey = deriveViewKey(spendKey.sk_spend);
      const commitment = await computeUtxoCommitment(mergedOutput);
      mergeEncryptedNotes = [
        buildRecoverableNoteB64({
          output: mergedOutput,
          commitment,
          ownerViewKey,
        }),
      ];
    }

    const cachedMergeTree = await loadMerkleTreeCache(cluster, programId);
    let mergeResult;
    try {
      mergeResult = await transact(
        {
          inputUtxos: [inA, inB],
          outputUtxos: [mergedOutput, zeroOutput],
          externalAmount: 0n,
        },
        {
          connection,
          programId,
          relayUrl,
          walletPublicKey,
          signTransaction,
          signMessage,
          enforceViewingKeyRegistration: false,
          cachedMerkleTree: cachedMergeTree,
          ...(mergeEncryptedNotes
            ? { encryptedNotes: mergeEncryptedNotes }
            : {}),
          onProgress: (status: string) => onProgress?.(status),
          onProofProgress: (pct: number) => onProofProgress?.(pct),
        } as Parameters<typeof transact>[1],
      );
    } catch (err) {
      if (isStaleNoteError(err)) clearMerkleTreeCache(cluster, programId);
      throw err;
    }
    saveMerkleTreeCache(cluster, programId, mergeResult.merkleTree);
    consolidationSigs.push(mergeResult.signature);

    // Reflect the merge in local UTXO state so a mid-flow failure leaves
    // the pool consistent with chain.
    markSpent(
      walletKey,
      cluster,
      [a.stored.commitment, b.stored.commitment],
      mergeResult.signature,
    );
    const mergedStored = utxosToStored(
      mergeResult.outputUtxos,
      ownerKeypair.publicKey,
      "change",
      mergeResult.signature,
    );
    appendUtxos(walletKey, cluster, mergedStored);

    // Rebuild the candidate pool from the merged outputs + remaining notes.
    const remaining = pool.slice(0, pool.length - 2);
    const mergedAsCandidates = mergedStored.map((u) => ({
      stored: u,
      amount: BigInt(u.amount),
    }));
    pool = [...remaining, ...mergedAsCandidates].sort((x, y) =>
      y.amount > x.amount ? 1 : y.amount < x.amount ? -1 : 0,
    );
  }

  // Now pick the top two for the actual withdraw.
  const selected: typeof pool = [];
  let total = 0n;
  for (const c of pool) {
    if (selected.length >= 2) break;
    selected.push(c);
    total += c.amount;
    if (total >= amountBaseUnits) break;
  }

  if (total < amountBaseUnits) {
    // Should be unreachable given the consolidation loop; defensive guard.
    throw new InsufficientShieldedBalanceError(amountBaseUnits, total);
  }

  const inputs: Utxo[] = await Promise.all(
    selected.map((s) => hydrateUtxo(s.stored, spendKey)),
  );
  const ownerPubkey = inputs[0].keypair.publicKey;

  onPhase?.("building-proof");
  let phase: ShieldPhase = "building-proof";

  const cachedWithdrawTree = await loadMerkleTreeCache(cluster, programId);
  const sdkOptions = {
    connection,
    programId,
    relayUrl,
    walletPublicKey,
    signTransaction,
    signMessage,
    enforceViewingKeyRegistration: false,
    cachedMerkleTree: cachedWithdrawTree,
    onProgress: (status: string) => {
      if (phase === "building-proof" && /submit|send|broadcast/i.test(status)) {
        phase = "submitting";
        onPhase?.("submitting");
      } else if (phase === "submitting" && /confirm/i.test(status)) {
        phase = "confirming";
        onPhase?.("confirming");
      }
      onProgress?.(status);
    },
    onProofProgress: (pct: number) => onProofProgress?.(pct),
  } as Parameters<typeof partialWithdraw>[3];

  let result;
  try {
    result =
      total === amountBaseUnits
        ? await fullWithdraw(inputs, recipient, sdkOptions)
        : await partialWithdraw(inputs, recipient, amountBaseUnits, sdkOptions);
  } catch (err) {
    if (isStaleNoteError(err)) clearMerkleTreeCache(cluster, programId);
    throw err;
  }
  saveMerkleTreeCache(cluster, programId, result.merkleTree);

  const spent = markSpent(
    walletKey,
    cluster,
    selected.map((s) => s.stored.commitment),
    result.signature,
  ).filter((u) => selected.some((s) => s.stored.commitment === u.commitment));

  const added = utxosToStored(
    result.outputUtxos,
    ownerPubkey,
    "change",
    result.signature,
  );
  appendUtxos(walletKey, cluster, added);

  onPhase?.("success");
  return { signature: result.signature, spent, added };
}

export class InsufficientShieldedBalanceError extends Error {
  readonly requested: bigint;
  readonly available: bigint;
  constructor(requested: bigint, available: bigint) {
    super(
      `Insufficient shielded balance: needed ${requested}, total spendable on this device is ${available}.`,
    );
    this.name = "InsufficientShieldedBalanceError";
    this.requested = requested;
    this.available = available;
  }
}
