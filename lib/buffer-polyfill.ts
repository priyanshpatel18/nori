"use client";

import { Buffer as BufferPolyfill } from "buffer";
// `next/dist/compiled/buffer` is feross/buffer v5, which Turbopack auto-injects
// for any free `Buffer` reference in browser bundles. v5 lacks the BigInt
// read/write methods (added in v6), so the Cloak SDK call
// `Buffer.from(bytes).readBigInt64LE(0)` at @cloak.dev/sdk-devnet/dist/index.js:3940
// crashes with "publicAmountBuffer.readBigInt64LE is not a function".
//
// Turbopack's resolveAlias doesn't override this internal injection, so we
// import the same compiled module and patch the missing methods onto its
// `Buffer.prototype`. The SDK runs against the same prototype, so the patch
// is observed at call time. We also keep `globalThis.Buffer` set to the npm
// buffer@6 polyfill as a backup for any code that reads it from the global.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — Next's compiled buffer module has no published types.
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
  // Browser-only. On the server, Node's native Buffer already has BigInt
  // methods; replacing globalThis.Buffer there breaks SSR.
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
