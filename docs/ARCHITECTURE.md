# Nori architecture and transaction flows

Five runtime surfaces, four data flows, one trust boundary.

This doc maps out where things live and how a user action turns into on-chain state. All diagrams are Mermaid; they render natively on GitHub and in Mintlify.

## System overview

```mermaid
flowchart LR
  subgraph Browser["User's browser"]
    UI[Nori app<br/>Next.js + React]
    Wallet[Wallet adapter<br/>Phantom / Backpack / Solflare]
    SDK["@cloak.dev/sdk<br/>(client-side)"]
    Cache[("session + local storage<br/>UTXOs · Merkle tree<br/>batch queue · history")]
  end

  Relay[Cloak relay<br/>api.cloak.ag]
  Chain[Solana<br/>shield-pool program]

  UI -->|user actions| SDK
  UI <-->|sign tx · sign message| Wallet
  SDK <-->|signMessage<br/>signTransaction| Wallet
  SDK <-->|fetch commitments<br/>submit signed tx| Relay
  SDK -->|read history<br/>via RPC| Chain
  Relay -->|submit| Chain
  SDK <-->|persist + restore| Cache

  classDef trusted fill:#fef3c7,stroke:#f59e0b,color:#78350f
  classDef untrusted fill:#e0e7ff,stroke:#6366f1,color:#3730a3
  classDef chain fill:#d1fae5,stroke:#10b981,color:#064e3b
  class Browser trusted
  class Relay untrusted
  class Chain chain
```

The trust boundary lives at the browser. Spend keys, viewing keys, and the witnesses that go into a Groth16 proof never leave it. The relay sees signed transactions and public inputs; it cannot link payments to recipients or amounts. Solana sees the same thing the relay does.

The cache layer lets a follow-up send in the same tab skip the relay's commitments fetch (`cloak:merkle-tree:v1:*`), survive a reload mid-batch (`cloak:batch-queue:v1:*`), and recover orphaned change UTXOs (`cloak:orphan-utxo:v1:*`).

## Fast-send: single private payment

The pattern most consumer apps want: deposit + withdraw in one click, ephemeral keypair, one wallet popup. Source: `lib/cloak/fast-send-core.ts`.

```mermaid
sequenceDiagram
  autonumber
  actor User
  participant UI as Nori UI
  participant SDK as Cloak SDK
  participant Wallet
  participant Relay
  participant Chain as shield-pool<br/>program

  User->>UI: Enter amount + recipient<br/>Click Send
  UI->>SDK: generateUtxoKeypair()<br/>createUtxo(amount, eph, mint)
  Note over SDK: Phase: deposit-proof
  SDK->>Wallet: signMessage (viewing key derive)
  Wallet-->>SDK: signature
  SDK->>SDK: Build Groth16 proof (~3s in browser)
  SDK->>Wallet: signTransaction (deposit)
  Wallet-->>SDK: signed tx
  SDK->>Relay: submit deposit
  Relay->>Chain: forward
  Chain-->>Chain: verify proof<br/>append commitment to tree<br/>record nullifier
  Chain-->>Relay: confirmed
  Relay-->>SDK: depositSignature
  Note over SDK: Phase: deposit-submit → done

  Note over UI,Relay: Sleep ~4s so relay indexes deposit

  Note over SDK: Phase: withdraw-proof
  SDK->>SDK: Build withdraw proof<br/>(uses cachedMerkleTree from deposit)
  SDK->>Wallet: signTransaction (withdraw)
  Wallet-->>SDK: signed tx
  SDK->>Relay: submit fullWithdraw
  Relay->>Chain: forward
  Chain-->>Chain: verify proof<br/>burn nullifier<br/>transfer to recipient
  Chain-->>Relay: confirmed
  Relay-->>SDK: withdrawSignature
  SDK-->>UI: { depositSignature, withdrawSignature }
  UI-->>User: Success card + Solscan links
```

Wallet popups: 2 (one signMessage, one signTransaction... actually `signTransaction` is called twice, once per leg, so 3 total prompts on first send; subsequent sends in the session memoize the signMessage so it drops to 2). The signMessage is what the SDK uses to derive the viewing key; Nori caches that signature in `lib/cloak/sign-message-cache.ts` so repeat sends don't re-prompt.

The deposit's returned `merkleTree` is passed as `cachedMerkleTree` to the withdraw call. The relay still re-validates the commitments against its own freshly-fetched leaves (SDK `dist/index.js:4699`), so the cache is a hint that skips the SDK's own fetch, not a bypass.

If the withdraw throws `RootNotFoundError` or `"is beyond next_index"`, the loop sleeps and retries up to 3 times, dropping the cached tree on each retry so the SDK refetches from chain state.

## Batch payroll: one deposit, many recipients

CSV in, one wallet signature, N payouts from the shielded pool. Source: `lib/cloak/use-batch-payroll.ts`.

```mermaid
sequenceDiagram
  autonumber
  actor User
  participant UI as Nori UI
  participant SDK as Cloak SDK
  participant Wallet
  participant Relay
  participant Chain as shield-pool<br/>program
  participant Storage as localStorage<br/>(orphan + queue)

  User->>UI: Drop CSV<br/>Click Run
  UI->>UI: Validate rows + sum to total
  UI->>SDK: generateUtxoKeypair()<br/>createUtxo(total, eph, mint)

  Note over SDK,Chain: Single deposit for the whole batch
  SDK->>Wallet: signMessage (cached after first send)
  SDK->>Wallet: signTransaction (deposit)
  Wallet-->>SDK: signed tx
  SDK->>Relay: submit deposit
  Relay->>Chain: verify + append
  Chain-->>Relay: depositSignature
  Relay-->>SDK: confirmed

  UI->>Storage: saveOrphan(changeUtxo)<br/>saveBatchRun(rows: pending[])

  loop For each row in CSV
    Note over UI,Relay: Sleep 4s for relay to index previous payout
    UI->>Storage: updateBatchRow(rowId, in-flight)
    SDK->>SDK: Build partialWithdraw proof<br/>(uses cachedMerkleTree)
    SDK->>Relay: submit partialWithdraw
    Relay->>Chain: verify + transfer
    Chain-->>Relay: payoutSig
    Relay-->>SDK: { signature, merkleTree, outputUtxos[0] = changeUtxo }
    UI->>Storage: updateOrphan(changeUtxo)<br/>updateBatchRow(rowId, confirmed)
    UI->>UI: cachedTree = result.merkleTree<br/>currentUtxo = changeUtxo

    alt Stale root error
      UI->>UI: showProofRefreshing toast<br/>drop cachedTree
      Note right of UI: Retry up to 2x
    end
  end

  alt All rows confirmed
    UI->>Storage: clearOrphan + clearBatchRun
  else Some failed
    Note over UI,Storage: Receipt shows<br/>"Retry N failed" button
  end
  UI-->>User: Receipt with per-row outcomes
```

Wallet popups: 1 (the deposit). Every payout signs with the ephemeral keypair the SDK already has, so there's no second wallet prompt no matter how many recipients are in the CSV.

The chained-change-UTXO pattern is what makes this work: each `partialWithdraw` produces a change note owned by the same ephemeral keypair, and that note becomes the input for the next row. Failure of any row leaves the change note in `cloak:orphan-utxo:v1:*` so the user can recover the residual balance later. The `cloak:batch-queue:v1:*` mirror tracks per-row state so the "Retry failed" button on the receipt knows exactly which rows still need work.

A page reload mid-batch sweeps any `in-flight` rows back to `pending` on hook mount (the `partialWithdraw` promise died with the page), so the queue is honest about what's still to send.

## Selective disclosure: viewing keys

Privacy is half. The other half is showing the right things to the right people. Source: `lib/cloak/viewing-keys.ts`, `lib/cloak/compliance-export.ts`, `app/api/scan-received/route.ts`.

```mermaid
sequenceDiagram
  autonumber
  actor Owner
  actor Auditor
  participant SDK as Cloak SDK
  participant API as Nori API<br/>(/api/scan-received)
  participant RPC as Solana RPC
  participant Chain as shield-pool<br/>program

  Note over Owner,SDK: One time: derive a viewing key
  Owner->>SDK: signMessage (deterministic string)
  SDK->>SDK: Derive nk + ViewingKey<br/>from signature
  SDK-->>Owner: viewingKey (nk hex)

  Note over Owner,Auditor: Owner shares (optionally scoped)
  Owner->>Auditor: nk + date range

  Note over Auditor,API: Auditor reads /compliance/view?nk=...
  Auditor->>API: GET scan with nk
  API->>RPC: scanTransactions({<br/>connection, programId,<br/>viewingKeyNk: nk,<br/>walletPublicKey, limit })
  RPC->>Chain: getSignaturesForAddress<br/>+ getParsedTransactions
  Chain-->>RPC: program txs + chain notes
  RPC-->>API: ScannedTransaction[]
  API->>API: toComplianceReport(result)<br/>filter by date range<br/>formatComplianceCsv(report)
  API-->>Auditor: CSV download<br/>(date, type, gross, fee, net, sig)

  Note over Chain: Chain still shows nothing.<br/>Decryption happens off-chain<br/>using the auditor's nk.
```

The viewing key is the diversifier handed to `scanTransactions`. The SDK reads chain notes off-chain via RPC and decrypts only the ones that match. Revoking access is just rotating the diversifier and re-issuing; previously issued keys can no longer decrypt newly-emitted notes (Day 9 cryptographic revocation; the Day 7 UI flag is a tracking aid until that lands).

The chain transcript is unchanged. Auditors don't need on-chain access; they just need the viewing key bytes.

## Background reliability layer

A few pieces are not on the user's critical path but matter for keeping the product feeling solid.

```mermaid
flowchart LR
  Op[Any SDK call<br/>transact / fullWithdraw /<br/>partialWithdraw / swapWithChange]
  Cache["session storage<br/>cloak:merkle-tree:v1"]
  Toast["sonner toast<br/>'Refreshing proof…'"]
  Watcher["tx-watcher<br/>getSignatureStatus poll"]

  Op -->|on success| Cache
  Op -->|on stale-root catch| Toast
  Op -->|relay-async settlement<br/>e.g. swap Tx2| Watcher
  Watcher -->|confirmed / failed / timeout| Toast
  Toast -.->|dismiss on resolve| Op

  classDef bg fill:#f3e8ff,stroke:#a855f7,color:#581c87
  class Cache,Toast,Watcher bg
```

- **Merkle tree session cache** keeps a follow-up op in the same tab from refetching the tree. Invalidated on any stale-root error.
- **Proof-refresh toast** surfaces the auto-retry that happens when the pool advanced past the root your proof committed to. Scoped per-flow id (`fast-send:<sig>`, `swap:<sig>`, `batch:<runId>:<rowId>`) so concurrent flows don't collide.
- **Tx watcher** polls `connection.getSignatureStatus` until target commitment for relay-managed signatures (notably the swap settlement Tx2). Fires success / error / timeout toasts independently of the page the user is on.

Sources: `lib/cloak/merkle-tree-cache.ts`, `lib/cloak/proof-refresh-toast.ts`, `lib/cloak/tx-watcher.ts`.

## Key constants

| Constant | Value | Where |
|---|---|---|
| Mainnet program ID | `zh1eLd6rSphLejbFfJEneUwzHRfMKxgzrgkfwA6qRkW` | `lib/cloak/config.ts` |
| Devnet program ID | `Zc1kHfp4rajSMeASFDwFFgkHRjv7dFQuLheJoQus27h` | `lib/cloak/config.ts` |
| Mainnet relay | `https://api.cloak.ag` | `lib/cloak/config.ts` |
| Devnet relay | `https://api.devnet.cloak.ag` | `lib/cloak/config.ts` |
| Merkle tree height | 32 | SDK `MERKLE_TREE_HEIGHT` |
| Root history depth | 100 entries (ring buffer) | shield-pool program |
| Fixed fee | 0.005 SOL | SDK `FIXED_FEE_LAMPORTS` |
| Variable fee | 0.30% of gross | SDK `VARIABLE_FEE_RATE` |
| Minimum deposit | 10,000,000 lamports | SDK `MIN_DEPOSIT_LAMPORTS` |
| Relay-settle delay between rows | 4,000 ms | `RELAY_SETTLE_DELAY_MS` in `use-batch-payroll.ts` |
| Stale-root retry budget | 3 attempts | `WITHDRAW_MAX_ATTEMPTS`, `STALE_RETRY_MAX` |
| Merkle cache TTL | 30 minutes | `MAX_AGE_MS` in `merkle-tree-cache.ts` |

## Further reading

- [INTEGRATION.md](./INTEGRATION.md): drop the SDK into your own Next 16 app
- [Cloak protocol docs](https://docs.cloak.ag): UTXO model, circuit signals, on-chain layout
- Live mainnet app: [usenori.xyz](https://usenori.xyz)
