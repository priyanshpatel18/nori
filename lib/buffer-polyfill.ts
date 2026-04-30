"use client";

import { Buffer as BufferPolyfill } from "buffer";
// Turbopack auto-injects `next/dist/compiled/buffer` (feross/buffer v5) for any
// free `Buffer` reference in browser bundles. v5 lacks BigInt methods, which
// breaks the Cloak SDK at `Buffer.from(bytes).readBigInt64LE(0)`. resolveAlias
// doesn't override that internal injection, so we patch the missing methods
// onto the same compiled prototype the SDK references at runtime.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore: Next's compiled buffer module has no published types.
import { Buffer as CompiledBuffer } from "next/dist/compiled/buffer";

type BufferLike = Uint8Array & {
  buffer: ArrayBufferLike;
  byteOffset: number;
  byteLength: number;
};

function readBigInt64LE(this: BufferLike, offset = 0): bigint {
  if (offset < 0 || offset + 8 > this.byteLength) {
    throw new RangeError(
      `Out of bounds: offset=${offset}, length=${this.byteLength}`,
    );
  }
  return new DataView(this.buffer, this.byteOffset, this.byteLength).getBigInt64(
    offset,
    true,
  );
}

function readBigUInt64LE(this: BufferLike, offset = 0): bigint {
  if (offset < 0 || offset + 8 > this.byteLength) {
    throw new RangeError(
      `Out of bounds: offset=${offset}, length=${this.byteLength}`,
    );
  }
  return new DataView(this.buffer, this.byteOffset, this.byteLength).getBigUint64(
    offset,
    true,
  );
}

function patchBigIntMethods(BufferClass: { prototype: Record<string, unknown> }) {
  if (typeof BufferClass?.prototype?.readBigInt64LE !== "function") {
    BufferClass.prototype.readBigInt64LE = readBigInt64LE;
  }
  if (typeof BufferClass?.prototype?.readBigUInt64LE !== "function") {
    BufferClass.prototype.readBigUInt64LE = readBigUInt64LE;
  }
}

export function applyBufferPolyfill(): void {
  // Browser-only: Node's native Buffer already has BigInt methods, and
  // replacing globalThis.Buffer server-side breaks SSR.
  if (typeof window === "undefined") return;
  const g = globalThis as { Buffer?: unknown };
  g.Buffer = BufferPolyfill;
  patchBigIntMethods(
    CompiledBuffer as unknown as { prototype: Record<string, unknown> },
  );
  patchBigIntMethods(
    BufferPolyfill as unknown as { prototype: Record<string, unknown> },
  );
}

applyBufferPolyfill();
