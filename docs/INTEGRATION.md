# Cloak SDK integration guide

How to ship a private payments app on Solana with `@cloak.dev/sdk`. This guide is the recipe Nori uses, distilled to the parts you need to reproduce. All code is real, in-tree.

For protocol-level docs, see [docs.cloak.ag](https://docs.cloak.ag). For the full Nori source, browse `lib/cloak/` in this repo.

## What you get

The Cloak SDK gives you Groth16-proven shielded transfers on Solana with five capabilities you'll wire into your app:

| Capability | SDK call | Use it for |
|---|---|---|
| Deposit + send in one click | `transact` + `fullWithdraw` (the "fast-send" pattern) | Single private transfer, no shielded-balance UX needed |
| One deposit, many recipients | `transact` + `partialWithdraw` per row | Batch payroll |
| Read your private history | `scanTransactions` | History tabs, balance widgets |
| Compliance disclosure | `toComplianceReport` + `formatComplianceCsv` | Auditor CSVs and viewing-key shares |
| Private swaps | `swapWithChange` | SOL ↔ SPL inside the shielded pool |

## Install

```bash
pnpm add @cloak.dev/sdk @solana/web3.js @solana/wallet-adapter-react @solana/spl-token
```

For devnet, use the devnet build:

```bash
pnpm add @cloak.dev/sdk-devnet
```

The two packages share an API; the devnet one points at devnet circuits, devnet relay, and the devnet program by default.

## Per-cluster constants

| Constant | Mainnet | Devnet |
|---|---|---|
| Program ID | `zh1eLd6rSphLejbFfJEneUwzHRfMKxgzrgkfwA6qRkW` | `Zc1kHfp4rajSMeASFDwFFgkHRjv7dFQuLheJoQus27h` |
| Relay URL | `https://api.cloak.ag` | `https://api.devnet.cloak.ag` |
| SDK package | `@cloak.dev/sdk` | `@cloak.dev/sdk-devnet` |
| Fixed fee | 0.005 SOL | 0.005 SOL |
| Variable fee | 0.30% of amount | 0.30% of amount |
| Minimum deposit | 10,000,000 lamports | 10,000,000 lamports |
| Merkle tree height | 32 | 32 |
| Root history depth | 100 entries | 100 entries |

Nori centralises these in `lib/cloak/config.ts`, picking the right pair from `NEXT_PUBLIC_SOLANA_CLUSTER`:

```ts
import { PublicKey } from "@solana/web3.js";
import { solanaConfig, type SolanaCluster } from "@/lib/solana/config";

type CloakClusterConfig = { programId: PublicKey; relayUrl: string };

const CLUSTER_CONFIG: Partial<Record<SolanaCluster, CloakClusterConfig>> = {
  "mainnet-beta": {
    programId: new PublicKey("zh1eLd6rSphLejbFfJEneUwzHRfMKxgzrgkfwA6qRkW"),
    relayUrl: "https://api.cloak.ag",
  },
  devnet: {
    programId: new PublicKey("Zc1kHfp4rajSMeASFDwFFgkHRjv7dFQuLheJoQus27h"),
    relayUrl: "https://api.devnet.cloak.ag",
  },
};

const fromCluster = CLUSTER_CONFIG[solanaConfig.cluster];
if (!fromCluster) {
  throw new Error(`Cloak is not configured for cluster "${solanaConfig.cluster}".`);
}

export const cloakConfig = {
  programId: fromCluster.programId,
  relayUrl: process.env.NEXT_PUBLIC_CLOAK_RELAY_URL ?? fromCluster.relayUrl,
} as const;
```

## The Buffer polyfill gotcha (Next 16 / Turbopack)

If you're on Next 16 with Turbopack, your first `transact()` will throw:

```
TypeError: publicAmountBuffer.readBigInt64LE is not a function
```

What's happening: Turbopack auto-injects `next/dist/compiled/buffer` (feross/buffer v5) for any free `Buffer` reference in a browser bundle. v5 is missing `readBigInt64LE` and `readBigUInt64LE`. The Cloak SDK calls them while building the public-inputs blob.

The fix is two parts:

**Part A. Resolve `buffer` to npm's `buffer@6.x` for browser bundles** (`next.config.ts`):

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
```

**Part B. Patch the BigInt methods onto the compiled prototype the SDK actually references at runtime.** Turbopack's auto-injection bypasses the alias for code already hoisted into `next/dist/compiled/buffer`, so you have to monkey-patch it. Put this in `lib/buffer-polyfill.ts`:

```ts
"use client";

import { Buffer as BufferPolyfill } from "buffer";
// @ts-ignore: Next's compiled buffer module has no published types.
import { Buffer as CompiledBuffer } from "next/dist/compiled/buffer";

type BufferLike = Uint8Array & {
  buffer: ArrayBufferLike;
  byteOffset: number;
  byteLength: number;
};

function readBigInt64LE(this: BufferLike, offset = 0): bigint {
  return new DataView(this.buffer, this.byteOffset, this.byteLength)
    .getBigInt64(offset, true);
}

function readBigUInt64LE(this: BufferLike, offset = 0): bigint {
  return new DataView(this.buffer, this.byteOffset, this.byteLength)
    .getBigUint64(offset, true);
}

function patch(BufferClass: { prototype: Record<string, unknown> }) {
  if (typeof BufferClass?.prototype?.readBigInt64LE !== "function") {
    BufferClass.prototype.readBigInt64LE = readBigInt64LE;
  }
  if (typeof BufferClass?.prototype?.readBigUInt64LE !== "function") {
    BufferClass.prototype.readBigUInt64LE = readBigUInt64LE;
  }
}

export function applyBufferPolyfill(): void {
  if (typeof window === "undefined") return; // browser-only
  (globalThis as { Buffer?: unknown }).Buffer = BufferPolyfill;
  patch(CompiledBuffer as unknown as { prototype: Record<string, unknown> });
  patch(BufferPolyfill as unknown as { prototype: Record<string, unknown> });
}

applyBufferPolyfill();
```

Then load it as early as possible. Nori imports it from `instrumentation-client.ts`:

```ts
// instrumentation-client.ts
import "@/lib/buffer-polyfill";
```

And calls `applyBufferPolyfill()` at the top of every SDK-touching client function as a belt-and-suspenders guard against module load order surprises.

This isn't pretty. It's load-bearing for the SDK to work in any Next 16 + Turbopack project.

## The fast-send pattern

Most consumer apps don't want to expose a "shielded balance" surface to first-time users. Fast-send hides the deposit/withdraw two-step inside a single user-facing "send" button. The flow:

1. Generate an ephemeral UTXO keypair.
2. `transact()` deposits funds into a shielded note owned by that keypair.
3. `fullWithdraw()` immediately spends that note out to the recipient.
4. Net wallet popups: 1.

Drop the ephemeral keypair after the second leg lands; there's nothing left to spend.

```ts
import {
  createUtxo,
  createZeroUtxo,
  fullWithdraw,
  generateUtxoKeypair,
  transact,
} from "@cloak.dev/sdk";
import { Connection, PublicKey } from "@solana/web3.js";

import { cloakConfig } from "./config";
import { applyBufferPolyfill } from "@/lib/buffer-polyfill";

export async function fastSendOnce(args: {
  amountBaseUnits: bigint;
  mint: PublicKey;
  recipient: PublicKey;
  sender: PublicKey;
  connection: Connection;
  signTransaction: <T>(tx: T) => Promise<T>;
  signMessage: (m: Uint8Array) => Promise<Uint8Array>;
}) {
  applyBufferPolyfill();

  const ephemeral = await generateUtxoKeypair();
  const output = await createUtxo(args.amountBaseUnits, ephemeral, args.mint);

  // 1. Deposit into a shielded note owned by the ephemeral keypair.
  const deposit = await transact(
    {
      inputUtxos: [await createZeroUtxo(args.mint)],
      outputUtxos: [output],
      externalAmount: args.amountBaseUnits,
      depositor: args.sender,
    },
    {
      connection: args.connection,
      programId: cloakConfig.programId,
      relayUrl: cloakConfig.relayUrl,
      depositorPublicKey: args.sender,
      walletPublicKey: args.sender,
      signTransaction: args.signTransaction,
      signMessage: args.signMessage,
      // Fast-send doesn't keep a shielded balance, so registration is noise.
      enforceViewingKeyRegistration: false,
    },
  );

  // 2. Wait a few seconds for the relay to index the deposit, then spend
  //    it out to the recipient. The cached merkle tree from the deposit
  //    skips a relay refetch.
  await sleep(4_000);
  const withdraw = await fullWithdraw(deposit.outputUtxos, args.recipient, {
    connection: args.connection,
    programId: cloakConfig.programId,
    relayUrl: cloakConfig.relayUrl,
    walletPublicKey: args.sender,
    signTransaction: args.signTransaction,
    signMessage: args.signMessage,
    enforceViewingKeyRegistration: false,
    cachedMerkleTree: deposit.merkleTree,
  });

  return {
    depositSignature: deposit.signature,
    withdrawSignature: withdraw.signature,
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
```

The full Nori implementation in `lib/cloak/fast-send-core.ts` adds:

- A 3-attempt retry around `fullWithdraw` for `RootNotFoundError` and stale-note errors.
- A session-storage Merkle-tree cache so a second send in the same tab doesn't refetch the tree.
- A `[cloak/fast-send]` step logger for debugging proof timings.
- Phase callbacks (`deposit-proof` → `deposit-submit` → `withdraw-proof` → `withdraw-submit` → `success`) that drive the progress bar.

## Stale-root retry

Between proof generation and on-chain submission, more deposits land. If enough of them land, the root your proof committed to falls out of the program's 100-entry root history and the tx fails with `RootNotFoundError`.

Detect, drop the cached tree, regenerate:

```ts
import { isRootNotFoundError } from "@cloak.dev/sdk";
import { isStaleNoteError } from "@/lib/cloak/fast-send-core";

for (let attempt = 1; attempt <= 3; attempt += 1) {
  try {
    return await fullWithdraw(notes, recipient, {
      ...options,
      cachedMerkleTree: attempt === 1 ? deposit.merkleTree : undefined,
    });
  } catch (err) {
    const recoverable = isRootNotFoundError(err) || isStaleNoteError(err);
    if (!recoverable || attempt === 3) throw err;
    await sleep(1_500 * attempt);
  }
}
```

Nori exports `isStaleNoteError` from `lib/cloak/fast-send-core.ts`; it matches the SDK's error messages including `"Local private notes may be stale"` and `"is beyond next_index"`.

## Batch payroll: one deposit, many recipients

The pattern is the same shape as fast-send, but the second leg is a `partialWithdraw` loop. Each iteration produces a change UTXO that becomes the input for the next row.

```ts
import { partialWithdraw, transact, type MerkleTree, type Utxo } from "@cloak.dev/sdk";

// 1. One deposit for the gross sum.
const total = rows.reduce((acc, r) => acc + r.amount, 0n);
const ephemeral = await generateUtxoKeypair();
const depositOutput = await createUtxo(total, ephemeral, mint);
const deposit = await transact(
  { inputUtxos: [await createZeroUtxo(mint)], outputUtxos: [depositOutput], externalAmount: total, depositor: sender },
  { connection, programId, relayUrl, depositorPublicKey: sender, walletPublicKey: sender, signTransaction, signMessage, enforceViewingKeyRegistration: false },
);

// 2. Loop, threading the change UTXO + cached tree through each call.
let currentUtxo: Utxo = deposit.outputUtxos[0];
let cachedTree: MerkleTree | undefined = deposit.merkleTree;

for (const row of rows) {
  await sleep(4_000); // let the relay index the previous payout

  const result = await partialWithdraw([currentUtxo], row.recipient, row.amount, {
    connection, programId, relayUrl,
    walletPublicKey: sender,
    signTransaction, signMessage,
    enforceViewingKeyRegistration: false,
    cachedMerkleTree: cachedTree,
  });

  currentUtxo = result.outputUtxos[0];
  cachedTree = result.merkleTree ?? cachedTree;
}
```

Nori's `lib/cloak/use-batch-payroll.ts` adds a per-row state machine, a persistent retry queue keyed by `(sender, cluster, depositSignature)`, an orphan-UTXO store so a half-finished batch is recoverable, and stale-root toasts. See `lib/cloak/batch-queue.ts` and `lib/cloak/orphan-utxo-store.ts`.

## Reading your private history

Pass the user's wallet pubkey; the SDK derives the viewing key on demand. No on-chain registration needed for the read path. Mirror your scan in a Next route handler so you can keep the RPC URL out of the browser:

```ts
// app/api/scan-received/route.ts
import { NextResponse } from "next/server";
import { Connection } from "@solana/web3.js";
import { scanTransactions, toComplianceReport } from "@cloak.dev/sdk";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const wallet = url.searchParams.get("wallet")!;
  const limit = Number(url.searchParams.get("limit") ?? 50);

  const connection = new Connection(process.env.CLOAK_SCAN_RPC_URL!, "confirmed");

  const result = await scanTransactions({
    connection,
    programId: cloakConfig.programId,
    walletPublicKey: wallet,
    limit,
    batchSize: 5,
  });

  const report = toComplianceReport(result);
  return NextResponse.json({ report });
}
```

`ScannedTransaction` entries carry `txType` (`"deposit" | "withdraw" | "transfer" | "swap"`), `amount`, `fee`, `netAmount`, `recipient`, and `signature`. Use them directly for a history list, or pipe through `toComplianceReport` and `formatComplianceCsv` for an auditor export.

## Compliance export

`toComplianceReport(scanResult)` produces a `ComplianceReport`. `formatComplianceCsv(report)` produces auditor-ready CSV. Filter to a date range before formatting:

```ts
import { formatComplianceCsv, type ComplianceReport } from "@cloak.dev/sdk";

function filterReportByRange(
  report: ComplianceReport,
  fromMs: number,
  toMs: number,
): ComplianceReport {
  return {
    ...report,
    transactions: report.transactions.filter(
      (tx) => tx.timestamp >= fromMs && tx.timestamp < toMs,
    ),
  };
}

const csv = formatComplianceCsv(filterReportByRange(report, from, to));
```

## Operational gotchas

- **Wallet `signMessage` is required.** The SDK uses it to derive the user's viewing key. Memoize it across operations in the same session so the user doesn't see repeat prompts. Nori uses `lib/cloak/sign-message-cache.ts`.
- **The relay re-validates UTXOs against its own freshly-fetched leaves**, even when you pass `cachedMerkleTree` (SDK `dist/index.js:4699`). Cache it as a hint to skip the SDK's fetch, not as a bypass. Sleep a few seconds after a deposit before the next call so the relay's view catches up.
- **Confirmation commitment.** `transact()` and friends return after the SDK has confirmed the transaction. For relay-managed work like swap settlement (Tx2), poll `RelayService.getStatus(requestId)` and optionally watch the on-chain signature with `connection.getSignatureStatus`. See `lib/cloak/tx-watcher.ts`.
- **Buffer.** See above. Don't skip it.
- **Minimum deposit.** 10,000,000 lamports per deposit (`MIN_DEPOSIT_LAMPORTS` from the SDK). Block your form before the user signs.

## Files to study in this repo

| Concern | File |
|---|---|
| Cluster + relay constants | `lib/cloak/config.ts` |
| Buffer polyfill | `lib/buffer-polyfill.ts`, `next.config.ts`, `instrumentation-client.ts` |
| Fast-send (single private send) | `lib/cloak/fast-send-core.ts`, `lib/cloak/use-fast-send.ts` |
| Batch payroll + retry queue | `lib/cloak/use-batch-payroll.ts`, `lib/cloak/batch-queue.ts`, `lib/cloak/orphan-utxo-store.ts` |
| Merkle tree session cache | `lib/cloak/merkle-tree-cache.ts` |
| Stale-root + tx-watch toasts | `lib/cloak/proof-refresh-toast.ts`, `lib/cloak/tx-watcher.ts` |
| Shielded balance (deposit-once, send-many) | `lib/cloak/shield-core.ts`, `lib/cloak/utxo-store.ts` |
| Private swap | `lib/cloak/swap-core.ts`, `lib/cloak/use-swap.ts` |
| Scan-based history | `lib/cloak/scanned-history.ts`, `app/api/scan-received/route.ts` |
| Compliance CSV | `lib/cloak/compliance-export.ts` |

## Further reading

- [ARCHITECTURE.md](./ARCHITECTURE.md): runtime surfaces, fast-send + batch + compliance flow diagrams
- Cloak protocol docs: [docs.cloak.ag](https://docs.cloak.ag)
- Nori source: [github.com/priyanshpatel18/nori](https://github.com/priyanshpatel18/nori)
- Live mainnet app: [usenori.xyz](https://usenori.xyz)
