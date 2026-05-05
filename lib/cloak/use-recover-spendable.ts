"use client";

import {
  deriveViewKey,
  expandSpendKey,
  fetchCommitments,
  type CommitmentEntry,
} from "@cloak.dev/sdk";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  Connection,
  type ConfirmedSignatureInfo,
  type ParsedTransactionWithMeta,
  type PartiallyDecodedInstruction,
} from "@solana/web3.js";
import * as React from "react";

import { applyBufferPolyfill } from "@/lib/buffer-polyfill";
import { cloakConfig } from "@/lib/cloak/config";
import {
  decryptRecoverableNotes,
  noteDataToStoredUtxo,
} from "@/lib/cloak/recoverable-notes";
import { createMemoizedSignMessage } from "@/lib/cloak/sign-message-cache";
import { deriveSpendKey } from "@/lib/cloak/spend-key";
import { listShieldTokens } from "@/lib/cloak/tokens";
import { appendUtxos, loadUtxos, type StoredUtxo } from "@/lib/cloak/utxo-store";
import { solanaConfig } from "@/lib/solana/config";

// Cloak shield-pool instruction layout (mirrors sdk/dist/index.js:6482-6488):
//   1 byte  tag (0 = transact, 1 = transact_swap)
// 256 bytes proof
// 264 bytes public inputs
//  72 bytes swap params (only when tag = 1)
//   1 byte  chain-notes version marker (= 2)
//   1 byte  note count
//   for each note: 1 byte length, then `length` bytes of payload
const TAG_TRANSACT = 0;
const TAG_TRANSACT_SWAP = 1;
const PROOF_LEN = 256;
const PUBLIC_INPUTS_LEN = 264;
const SWAP_PARAMS_LEN = 72;
const CHAIN_NOTES_VERSION = 2;
const CHAIN_NOTES_OFFSET_TRANSACT = 1 + PROOF_LEN + PUBLIC_INPUTS_LEN;
const CHAIN_NOTES_OFFSET_SWAP = CHAIN_NOTES_OFFSET_TRANSACT + SWAP_PARAMS_LEN;

const SIGNATURES_PAGE = 200;
const TX_BATCH_SIZE = 3;

export type RecoverStatus = "idle" | "scanning" | "success" | "error";

export type RecoverResult = {
  added: StoredUtxo[];
  scannedTxs: number;
  skippedExisting: number;
};

export type UseRecoverSpendable = {
  status: RecoverStatus;
  progress: string | null;
  error: Error | null;
  lastResult: RecoverResult | null;
  /** Walk Cloak program signatures, decrypt rich notes, populate the
   *  spendable UTXO store with anything new. Triggers a wallet popup the
   *  first time per session to derive the view key. */
  recover: () => Promise<RecoverResult>;
};

export function useRecoverSpendable(): UseRecoverSpendable {
  const wallet = useWallet();

  // App-wide Connection is `processed`-commitment for snappy confirmations,
  // but getSignaturesForAddress / getParsedTransaction need at least
  // `confirmed`. Use our own.
  const scanConnection = React.useMemo(
    () => new Connection(solanaConfig.rpcUrl, "confirmed"),
    [],
  );

  const [status, setStatus] = React.useState<RecoverStatus>("idle");
  const [progress, setProgress] = React.useState<string | null>(null);
  const [error, setError] = React.useState<Error | null>(null);
  const [lastResult, setLastResult] = React.useState<RecoverResult | null>(
    null,
  );
  const inflightRef = React.useRef<Promise<RecoverResult> | null>(null);

  const signMessageCacheRef = React.useRef<{
    publicKey: string | null;
    fn: ((message: Uint8Array) => Promise<Uint8Array>) | null;
  }>({ publicKey: null, fn: null });

  const recover = React.useCallback(async (): Promise<RecoverResult> => {
    if (!wallet.publicKey || !wallet.signMessage) {
      throw new Error(
        "Connect a wallet that supports signMessage to recover from chain.",
      );
    }
    if (inflightRef.current) return inflightRef.current;

    applyBufferPolyfill();

    const senderBase58 = wallet.publicKey.toBase58();

    setStatus("scanning");
    setError(null);
    setProgress("Deriving view key");

    const run = (async (): Promise<RecoverResult> => {
      try {
        let memoized = signMessageCacheRef.current.fn;
        if (
          signMessageCacheRef.current.publicKey !== senderBase58 ||
          !memoized
        ) {
          memoized = createMemoizedSignMessage(wallet.signMessage!);
          signMessageCacheRef.current = {
            publicKey: senderBase58,
            fn: memoized,
          };
        }

        const { spendKey } = await deriveSpendKey(senderBase58, memoized);
        // expandSpendKey is unused here but pulled in to keep this hook
        // co-located with other key-derivation surfaces — the recoverable-
        // notes flow uses the view key, not the expanded spend key.
        void expandSpendKey;
        const viewKey = deriveViewKey(spendKey.sk_spend);

        const programId = cloakConfig.programId;
        const cluster = solanaConfig.cluster;
        const tokens = listShieldTokens();

        // Walk Cloak program signatures from newest to oldest. We don't
        // page back further than SIGNATURES_PAGE on a single recover call;
        // call again to walk older history.
        setProgress("Listing recent shielded transactions");
        const signatures: ConfirmedSignatureInfo[] =
          await scanConnection.getSignaturesForAddress(programId, {
            limit: SIGNATURES_PAGE,
          });

        const filtered = signatures.filter((s) => !s.err);
        let scannedTxs = 0;
        const candidateNotes: {
          b64: string;
          signature: string;
          outputCommitmentsHex: string[];
          isSwap: boolean;
        }[] = [];

        // Batched fetch with bounded parallelism so we don't hammer the RPC
        // on networks where free-tier limits bite.
        for (let i = 0; i < filtered.length; i += TX_BATCH_SIZE) {
          const window = filtered.slice(i, i + TX_BATCH_SIZE);
          setProgress(
            `Reading transactions ${i + 1}-${i + window.length} of ${filtered.length}`,
          );
          const txs = await Promise.all(
            window.map((sig) =>
              scanConnection
                .getParsedTransaction(sig.signature, {
                  maxSupportedTransactionVersion: 0,
                  commitment: "confirmed",
                })
                .catch(() => null),
            ),
          );
          for (let j = 0; j < txs.length; j += 1) {
            const tx = txs[j];
            const sig = window[j].signature;
            if (!tx) continue;
            scannedTxs += 1;
            for (const ix of cloakInstructions(tx, programId)) {
              const data = decodeBase58Maybe(ix.data);
              if (!data) continue;
              const tag = data[0];
              if (tag !== TAG_TRANSACT && tag !== TAG_TRANSACT_SWAP) continue;
              const isSwap = tag === TAG_TRANSACT_SWAP;
              const notes = parseChainNotes(data, isSwap);
              if (notes.length === 0) continue;
              const outputCommitmentsHex = parseOutputCommitments(data);
              for (const noteBytes of notes) {
                const b64 = bytesToBase64(noteBytes);
                candidateNotes.push({
                  b64,
                  signature: sig,
                  outputCommitmentsHex,
                  isSwap,
                });
              }
            }
          }
        }

        setProgress(
          `Trial-decrypting ${candidateNotes.length} notes`,
        );
        const decrypted = decryptRecoverableNotes(
          candidateNotes.map((c) => c.b64),
          viewKey,
        );
        if (decrypted.length === 0) {
          const result: RecoverResult = {
            added: [],
            scannedTxs,
            skippedExisting: 0,
          };
          setLastResult(result);
          setStatus("success");
          setProgress(null);
          return result;
        }

        // Map decrypted commitment back to the tx that produced it. The SDK's
        // scanNotesForWallet doesn't return per-note origin metadata, so we
        // re-pair: the decrypted commitment hex must appear in some scanned
        // tx's output commitments.
        type Resolved = (typeof decrypted)[number] & {
          signature: string;
          outputCommitmentsHex: string[];
        };
        const decryptedByCommitment = new Map<string, Resolved>();
        for (const note of decrypted) {
          const cand = candidateNotes.find((c) =>
            c.outputCommitmentsHex.some(
              (oc) => oc.toLowerCase() === note.commitment.toLowerCase(),
            ),
          );
          if (!cand) continue;
          decryptedByCommitment.set(note.commitment.toLowerCase(), {
            ...note,
            signature: cand.signature,
            outputCommitmentsHex: cand.outputCommitmentsHex,
          });
        }

        if (decryptedByCommitment.size === 0) {
          const result: RecoverResult = {
            added: [],
            scannedTxs,
            skippedExisting: 0,
          };
          setLastResult(result);
          setStatus("success");
          setProgress(null);
          return result;
        }

        // Fetch commitment indices per mint via the relay. One request per
        // configured mint covers every owned commitment in that pool.
        setProgress("Fetching commitment indices");
        const commitmentIndexByMint = new Map<
          string,
          Map<string, CommitmentEntry>
        >();
        for (const t of tokens) {
          try {
            const entries = await fetchCommitments(cloakConfig.relayUrl, {
              mint: t.mint,
            });
            const byHex = new Map<string, CommitmentEntry>();
            for (const e of entries) {
              byHex.set(e.commitment.toLowerCase(), e);
            }
            commitmentIndexByMint.set(t.mint.toBase58(), byHex);
          } catch {
            // Skip mints the relay can't return. We'll just miss recovery
            // for that mint on this run.
          }
        }

        const existing = new Set(
          loadUtxos(senderBase58, cluster).map((u) => u.commitment),
        );
        let skippedExisting = 0;
        const newRecords: StoredUtxo[] = [];
        for (const [
          commitmentHex,
          decryptedNote,
        ] of decryptedByCommitment.entries()) {
          const commitmentDec = BigInt("0x" + commitmentHex).toString();
          if (existing.has(commitmentDec)) {
            skippedExisting += 1;
            continue;
          }
          // Find the mint whose commitment list contains this hex, and pick
          // up its index. If no relay returned a match, we skip recovery
          // for this note (we lack the Merkle index needed to spend it).
          let matchedMint: string | undefined;
          let matchedIndex: number | undefined;
          for (const [mint, byHex] of commitmentIndexByMint) {
            const entry = byHex.get(commitmentHex);
            if (entry) {
              matchedMint = mint;
              matchedIndex = entry.index;
              break;
            }
          }
          if (matchedMint === undefined || matchedIndex === undefined) {
            continue;
          }
          // Sibling commitment in the same tx is the *other* output. We
          // pull it from the instruction data we cached; if the tx had
          // only one output (rare), sibling is undefined and the SDK
          // treats it as zero on spend.
          const siblingHex = decryptedNote.outputCommitmentsHex.find(
            (oc) => oc.toLowerCase() !== commitmentHex,
          );
          const siblingCommitment = siblingHex
            ? BigInt("0x" + siblingHex)
            : undefined;
          newRecords.push(
            noteDataToStoredUtxo({
              note: decryptedNote,
              mint: matchedMint,
              index: matchedIndex,
              siblingCommitment,
              source: "deposit",
              addSig: decryptedNote.signature,
            }),
          );
        }

        if (newRecords.length > 0) {
          appendUtxos(senderBase58, cluster, newRecords);
        }

        const result: RecoverResult = {
          added: newRecords,
          scannedTxs,
          skippedExisting,
        };
        setLastResult(result);
        setStatus("success");
        setProgress(null);
        return result;
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        setError(e);
        setStatus("error");
        setProgress(null);
        throw e;
      } finally {
        inflightRef.current = null;
      }
    })();

    inflightRef.current = run;
    return run;
  }, [wallet, scanConnection]);

  return { status, progress, error, lastResult, recover };
}

function cloakInstructions(
  tx: ParsedTransactionWithMeta,
  programId: { toBase58: () => string },
): PartiallyDecodedInstruction[] {
  const out: PartiallyDecodedInstruction[] = [];
  const target = programId.toBase58();
  const top = tx.transaction.message.instructions ?? [];
  for (const ix of top) {
    if ("programId" in ix && ix.programId.toBase58() === target && "data" in ix) {
      out.push(ix as PartiallyDecodedInstruction);
    }
  }
  // Cloak instructions are typically top-level; we don't bother with inner
  // CPI traversal since the shield-pool program isn't currently invoked from
  // CPI in any nori flow.
  return out;
}

function decodeBase58Maybe(data: string): Uint8Array | null {
  // Solana web3.js's getParsedTransaction returns instruction `data` as
  // base58-encoded for unparsed (PartiallyDecodedInstruction) ixes.
  try {
    return base58Decode(data);
  } catch {
    return null;
  }
}

const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58Decode(s: string): Uint8Array {
  if (s.length === 0) return new Uint8Array();
  const map: Record<string, number> = {};
  for (let i = 0; i < BASE58_ALPHABET.length; i += 1) {
    map[BASE58_ALPHABET[i]] = i;
  }
  let zeros = 0;
  while (zeros < s.length && s[zeros] === "1") zeros += 1;
  const size = Math.floor(((s.length - zeros) * 733) / 1000) + 1;
  const b256 = new Uint8Array(size);
  for (let i = zeros; i < s.length; i += 1) {
    const ch = s[i];
    const v = map[ch];
    if (v === undefined) throw new Error("invalid base58 character: " + ch);
    let carry = v;
    for (let j = size - 1; j >= 0; j -= 1) {
      carry += 58 * b256[j];
      b256[j] = carry & 0xff;
      carry >>= 8;
    }
    if (carry !== 0) throw new Error("base58 decode overflow");
  }
  // Skip leading zeros in b256 buffer
  let start = 0;
  while (start < b256.length - 1 && b256[start] === 0) start += 1;
  const out = new Uint8Array(zeros + (b256.length - start));
  for (let i = 0; i < zeros; i += 1) out[i] = 0;
  out.set(b256.subarray(start), zeros);
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let bin = "";
  for (let i = 0; i < bytes.length; i += 1) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin);
}

function parseChainNotes(data: Uint8Array, isSwap: boolean): Uint8Array[] {
  const offset = isSwap ? CHAIN_NOTES_OFFSET_SWAP : CHAIN_NOTES_OFFSET_TRANSACT;
  if (data.length <= offset) return [];
  const tail = data.slice(offset);
  if (tail.length < 2 || tail[0] !== CHAIN_NOTES_VERSION) return [];
  const count = tail[1];
  let cur = 2;
  const out: Uint8Array[] = [];
  for (let i = 0; i < count; i += 1) {
    if (cur + 1 > tail.length) break;
    const len = tail[cur];
    cur += 1;
    if (cur + len > tail.length) break;
    out.push(tail.slice(cur, cur + len));
    cur += len;
  }
  return out;
}

function parseOutputCommitments(data: Uint8Array): string[] {
  // Public inputs layout in this SDK build (mirrors sdk/dist/index.js):
  //   root      [0..32)
  //   nullifier [32..64)
  //   nullifier [64..96)
  //   commit0   [96..128)
  //   commit1   [128..160)
  //   ... fee/amount fields after
  const piStart = 1 + PROOF_LEN;
  if (data.length < piStart + 160) return [];
  const c0 = data.slice(piStart + 96, piStart + 128);
  const c1 = data.slice(piStart + 128, piStart + 160);
  const out: string[] = [];
  if (!c0.every((b) => b === 0)) out.push(bytesToHex(c0));
  if (!c1.every((b) => b === 0)) out.push(bytesToHex(c1));
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 1) {
    s += bytes[i].toString(16).padStart(2, "0");
  }
  return s;
}
