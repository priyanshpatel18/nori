import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next 16 / Turbopack auto-injects `Buffer` references in node_modules via
  // `next/dist/compiled/buffer` (feross/buffer v5), which lacks `readBigInt64LE`
  // and friends. The Cloak SDK calls `Buffer.from(bytes).readBigInt64LE(0)` at
  // dist/index.js:3940, which fails with "publicAmountBuffer.readBigInt64LE is
  // not a function". Force `buffer` to resolve to the npm `buffer@6.x` package
  // (which implements the BigInt methods).
  turbopack: {
    resolveAlias: {
      buffer: {
        browser: "buffer",
        default: "node:buffer",
      },
    },
  },
};

export default nextConfig;
