// Server-only in-memory store for compliance share payloads. Keyed by the
// 10-char public id, values are opaque JSON strings the API echoes back to
// the auditor's browser. Ephemeral by design — restarting the server (or
// scaling across instances) drops the map. Trade-off: zero database,
// microsecond lookups, simple to reason about. If durability is needed
// later, swap this module for a real KV store (Upstash, Redis, etc.)
// without touching the route handlers.

type StoredShare = {
  payload: string;
  issuer: string;
  createdAt: number;
};

// Cap to keep memory bounded under abuse. With ~5 KB per payload, 10k
// entries cap at ~50 MB. FIFO eviction since `Map` iteration order is
// insertion order in JS.
const MAX_ENTRIES = 10_000;

declare global {
  // eslint-disable-next-line no-var
  var __noriShareStore: Map<string, StoredShare> | undefined;
}

const store: Map<string, StoredShare> =
  globalThis.__noriShareStore ?? new Map<string, StoredShare>();

if (!globalThis.__noriShareStore) {
  globalThis.__noriShareStore = store;
}

export function putShare(
  id: string,
  payload: string,
  issuer: string,
): void {
  if (store.size >= MAX_ENTRIES) {
    const firstKey = store.keys().next().value;
    if (firstKey !== undefined) store.delete(firstKey);
  }
  store.set(id, { payload, issuer, createdAt: Date.now() });
}

export function getShare(
  id: string,
): { payload: string; createdAt: number } | null {
  const row = store.get(id);
  if (!row) return null;
  return { payload: row.payload, createdAt: row.createdAt };
}

export function hasShare(id: string): boolean {
  return store.has(id);
}
