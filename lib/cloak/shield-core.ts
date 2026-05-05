"use client";

import {
  createUtxo,
  createZeroUtxo,
  deriveUtxoKeypairFromSpendKey,
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

  let phase: ShieldPhase = "building-proof";

  const result = await transact(
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
  const candidates = available
    .filter((u) => u.mint === mintBase58 && !u.isSpent)
    .map((u) => ({ stored: u, amount: BigInt(u.amount) }))
    .sort((a, b) => (b.amount > a.amount ? 1 : b.amount < a.amount ? -1 : 0));

  const selected: typeof candidates = [];
  let total = 0n;
  for (const c of candidates) {
    if (selected.length >= 2) break;
    selected.push(c);
    total += c.amount;
    if (total >= amountBaseUnits) break;
  }

  if (total < amountBaseUnits) {
    throw new InsufficientShieldedBalanceError(amountBaseUnits, total);
  }

  onPhase?.("deriving-key");
  const inputs: Utxo[] = await Promise.all(
    selected.map((s) => hydrateUtxo(s.stored, spendKey)),
  );
  const ownerPubkey = inputs[0].keypair.publicKey;

  onPhase?.("building-proof");
  let phase: ShieldPhase = "building-proof";

  const sdkOptions = {
    connection,
    programId,
    relayUrl,
    walletPublicKey,
    signTransaction,
    signMessage,
    enforceViewingKeyRegistration: false,
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

  const result =
    total === amountBaseUnits
      ? await fullWithdraw(inputs, recipient, sdkOptions)
      : await partialWithdraw(inputs, recipient, amountBaseUnits, sdkOptions);

  const walletKey = walletPublicKey.toBase58();
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
      `Insufficient shielded balance: needed ${requested}, top 2 UTXOs cover ${available}. Consolidate UTXOs first.`,
    );
    this.name = "InsufficientShieldedBalanceError";
    this.requested = requested;
    this.available = available;
  }
}
