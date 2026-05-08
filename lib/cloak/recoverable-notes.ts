"use client";

import {
  encryptNoteForRecipient,
  scanNotesForWallet,
  type EncryptedNote,
  type NoteData,
  type SpendKey,
  type Utxo,
  type ViewKey,
} from "@cloak.dev/sdk";

import type { StoredUtxo, UtxoSource } from "@/lib/cloak/utxo-store";

// "Recoverable" output notes carry the full NoteData payload (amount, blinding
// `r`, the per-UTXO private key, and the commitment) encrypted to the owner's
// view key. With this on chain, any device that can re-derive the wallet's
// spend/view key can rebuild the spendable UTXO set without help from the
// originating browser. Compare to the SDK-default compact chain note, which
// only carries `{timestamp, commitment}` and is therefore not enough to spend
// the UTXO from a different device.
//
// SDK constraint: passing `options.encryptedNotes` to `transact` REPLACES the
// auto-generated compact note. Dual-emit ([compact, rich]) is not possible
// today because the on-chain chainNoteHash binds to the SDK's internal
// `chainNoteTimestamp` (sdk/dist/index.js:4895), and that timestamp is not
// observable from the caller. Until the SDK exposes the timestamp (or accepts
// extra notes alongside its own), opting in to recoverable shields means
// replacing compact-with-rich for those shields. The compact scanner used by
// `scanTransactions` won't find them; use `scanRecoverableNotesFromChain`
// (this module) to discover them instead.

const ENV_FLAG_KEYS = [
  "NEXT_PUBLIC_CLOAK_RECOVERABLE_SHIELDS",
  "NEXT_PUBLIC_CLOAK_RICH_NOTES",
] as const;

/** Read at module load: process.env in Next reads at build time, so flag
 *  changes require a rebuild. Not gated to `window` so it can be evaluated
 *  on the server during SSR too. */
export const RECOVERABLE_SHIELDS_ENABLED: boolean = (() => {
  for (const k of ENV_FLAG_KEYS) {
    const v = process.env[k];
    if (typeof v === "string" && v.trim() !== "" && v !== "0" && v !== "false") {
      return true;
    }
  }
  return false;
})();

function bigintToHex64(value: bigint): string {
  return value.toString(16).padStart(64, "0");
}

function hexToBigint(hex: string): bigint {
  return BigInt("0x" + hex.replace(/^0x/, ""));
}

function bytesToHex(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 1) {
    s += bytes[i].toString(16).padStart(2, "0");
  }
  return s;
}

/**
 * Build a recoverable note payload for an output we own. The encrypted
 * envelope is the SDK's `EncryptedNote` shape (`{ephemeral_pk, ciphertext,
 * nonce}`), which `tryDecryptNote` / `scanNotesForWallet` know how to read.
 *
 * The encoded base64 string is suitable for `transact`'s `options.encryptedNotes`.
 */
export function buildRecoverableNoteB64(args: {
  output: Utxo;
  commitment: bigint;
  ownerViewKey: ViewKey;
}): string {
  const { output, commitment, ownerViewKey } = args;

  const note: NoteData = {
    amount: Number(output.amount),
    r: bigintToHex64(output.blinding),
    // Encode the per-UTXO private key (not the wallet sk_spend). Anyone who
    // can decrypt this envelope is the owner; giving them the keypair private
    // key directly avoids needing wallet re-derivation on recovery.
    sk_spend: bigintToHex64(output.keypair.privateKey),
    commitment: bigintToHex64(commitment),
  };

  const encrypted = encryptNoteForRecipient(note, ownerViewKey.pvk);
  const json = JSON.stringify(encrypted);
  if (typeof Buffer !== "undefined") {
    return Buffer.from(json, "utf8").toString("base64");
  }
  // Browser fallback if Buffer polyfill isn't applied, we already polyfill
  // in shield-core, so this branch is only here for completeness.
  if (typeof btoa === "function") {
    return btoa(unescape(encodeURIComponent(json)));
  }
  throw new Error(
    "buildRecoverableNoteB64: no Buffer or btoa available to encode payload",
  );
}

/**
 * Decrypt a list of base64 note payloads with the owner's view key, returning
 * only those that match. Wraps the SDK's `scanNotesForWallet` so callers can
 * stay agnostic of the on-chain envelope shape.
 */
export function decryptRecoverableNotes(
  encryptedOutputsB64: string[],
  viewKey: ViewKey,
): NoteData[] {
  if (encryptedOutputsB64.length === 0) return [];
  return scanNotesForWallet(encryptedOutputsB64, viewKey);
}

/**
 * Convert a decrypted `NoteData` plus its on-chain Merkle index/sibling into
 * a `StoredUtxo` ready to drop into `appendUtxos`. The caller is responsible
 * for fetching index + sibling, we keep this synchronous and side-effect
 * free so it composes cleanly with whatever indexer the recovery flow uses.
 */
export function noteDataToStoredUtxo(args: {
  note: NoteData;
  mint: string;
  index: number;
  siblingCommitment: bigint | undefined;
  source: UtxoSource;
  addSig: string;
  addedAt?: number;
}): StoredUtxo {
  const { note, mint, index, siblingCommitment, source, addSig, addedAt } =
    args;
  return {
    amount: BigInt(note.amount).toString(),
    blinding: hexToBigint(note.r).toString(),
    commitment: hexToBigint(note.commitment).toString(),
    index,
    siblingCommitment: siblingCommitment?.toString(),
    mint,
    source,
    addedAt: addedAt ?? Date.now(),
    addSig,
  };
}

/** True when the `EncryptedNote` JSON shape parses out of a base64 blob. */
export function looksLikeRecoverableNote(b64: string): boolean {
  try {
    const json =
      typeof Buffer !== "undefined"
        ? Buffer.from(b64, "base64").toString("utf8")
        : decodeURIComponent(escape(atob(b64)));
    const parsed = JSON.parse(json) as Partial<EncryptedNote>;
    return (
      typeof parsed.ephemeral_pk === "string" &&
      typeof parsed.ciphertext === "string" &&
      typeof parsed.nonce === "string"
    );
  } catch {
    return false;
  }
}

// Re-export so callers don't reach into the SDK directly for the small set of
// types they need. Keeps recovery code self-contained.
export type { NoteData, ViewKey, SpendKey };
export { bytesToHex };
