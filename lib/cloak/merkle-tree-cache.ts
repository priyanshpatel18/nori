"use client";

import { buildMerkleTree, MERKLE_TREE_HEIGHT, type MerkleTree } from "@cloak.dev/sdk";
import type { PublicKey } from "@solana/web3.js";

import type { SolanaCluster } from "@/lib/solana/config";

const STORAGE_PREFIX = "cloak:merkle-tree:v1";

// The cached tree is a hint, not a source of truth: the relay re-validates
// commitments against its own freshly fetched leaves on every op (SDK
// dist/index.js:4699). 30 minutes keeps the cache useful across the typical
// "deposit, switch tabs, come back, withdraw" flow without letting it rot
// across days.
const MAX_AGE_MS = 30 * 60_000;

type SerializedTree = {
  height: number;
  leaves: string[];
  root: string;
  length: number;
  savedAt: number;
};

function isBrowser(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.sessionStorage !== "undefined"
  );
}

function programIdString(programId: PublicKey | string): string {
  return typeof programId === "string" ? programId : programId.toBase58();
}

function key(cluster: SolanaCluster, programId: PublicKey | string): string {
  return `${STORAGE_PREFIX}:${cluster}:${programIdString(programId)}`;
}

function bigintToHex(value: bigint): string {
  return value.toString(16);
}

function hexToBigint(value: string): bigint {
  return BigInt(`0x${value}`);
}

function isSerializedTree(value: unknown): value is SerializedTree {
  if (!value || typeof value !== "object") return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.height === "number" &&
    Array.isArray(r.leaves) &&
    r.leaves.every((l) => typeof l === "string") &&
    typeof r.root === "string" &&
    typeof r.length === "number" &&
    typeof r.savedAt === "number"
  );
}

export function saveMerkleTreeCache(
  cluster: SolanaCluster,
  programId: PublicKey | string,
  tree: MerkleTree | undefined,
): void {
  if (!isBrowser() || !tree) return;
  try {
    const leaves = tree.leaves();
    const serialized: SerializedTree = {
      height: MERKLE_TREE_HEIGHT,
      leaves: leaves.map(bigintToHex),
      root: bigintToHex(tree.root()),
      length: tree.length,
      savedAt: Date.now(),
    };
    window.sessionStorage.setItem(
      key(cluster, programId),
      JSON.stringify(serialized),
    );
  } catch {
    // ignore quota / serialization errors; cache is best-effort
  }
}

export async function loadMerkleTreeCache(
  cluster: SolanaCluster,
  programId: PublicKey | string,
): Promise<MerkleTree | undefined> {
  if (!isBrowser()) return undefined;
  const storageKey = key(cluster, programId);
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) return undefined;
    const parsed: unknown = JSON.parse(raw);
    if (!isSerializedTree(parsed)) {
      window.sessionStorage.removeItem(storageKey);
      return undefined;
    }
    if (Date.now() - parsed.savedAt > MAX_AGE_MS) {
      window.sessionStorage.removeItem(storageKey);
      return undefined;
    }
    const leaves = parsed.leaves.map(hexToBigint);
    return await buildMerkleTree(leaves, parsed.height);
  } catch {
    try {
      window.sessionStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
    return undefined;
  }
}

export function clearMerkleTreeCache(
  cluster: SolanaCluster,
  programId: PublicKey | string,
): void {
  if (!isBrowser()) return;
  try {
    window.sessionStorage.removeItem(key(cluster, programId));
  } catch {
    // ignore
  }
}
