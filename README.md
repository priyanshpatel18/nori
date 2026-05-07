<h1>
  <img src="public/nori-wordmark.svg" alt="Nori" height="80" />
</h1>

**Private payroll and payments for Solana.**

Every salary, every contractor rate, every vendor payment on Solana is permanently readable and indexed forever. Open Solscan, type a wallet, see every dollar that ever moved. Nori makes that private, with full compliance when you need it.

| | |
|---|---|
| **Live on mainnet** | [usenori.xyz](https://usenori.xyz) |
| **Twitter / X** | [@UseNori](https://x.com/UseNori) |
| **Source** | [github.com/priyanshpatel18/nori](https://github.com/priyanshpatel18/nori) |
| **Built on** | [Cloak](https://docs.cloak.ag) (UTXO-based shielded pool, Groth16 ZK proofs) |

## What Nori does

Nori is a private payments layer for crypto-native teams (DAOs, startups, and protocols) paying contributors in SOL, USDC, or USDT. Every transaction settles through a zero-knowledge shielded pool, so amounts and recipients stay off the public ledger while staying fully auditable for the people you choose.

## Product walkthrough

Each route is a discrete surface in the app. The chain-state side effect is the same shielded pool; the UI is shaped around the job-to-be-done.

| Route | What it does |
|---|---|
| [`/pay`](https://usenori.xyz/pay) | Single private send. Pick token, enter amount + recipient, one click. The chain sees an opaque transaction; the recipient gets the funds. |
| [`/payroll`](https://usenori.xyz/payroll) | Batch payroll from a CSV. One signature, N private payouts, per-row receipts in history. Failures don't abort the rest, and a "Retry failed" button on the receipt re-runs only the failures. |
| [`/team`](https://usenori.xyz/team) | Saved team members with per-member schedules. The app remembers cadences and surfaces a "N due" banner. One click runs all due payments. |
| [`/shield`](https://usenori.xyz/shield) | Deposit-once, send-many shielded balance. Useful when you'd rather amortize the deposit cost across many sends. |
| [`/swap`](https://usenori.xyz/swap) | Private SOL ↔ USDC swap routed through the relay (Jupiter on mainnet). UI is live; submission is gated until upstream SDK lifts the SOL-only cap. |
| [`/history`](https://usenori.xyz/history) | Chain-native transaction history scanned through your viewing key. Survives a reinstall, a new device, a new browser. |
| [`/compliance`](https://usenori.xyz/compliance) | Selective disclosure. Pick a date range, download a CSV with date, type, gross, fee, net, signature. Issue a scoped viewing key for an auditor. |
| [`/compliance/view?nk=...`](https://usenori.xyz/compliance) | Auditor-side read-only history view from a shared viewing key. |

## Who Nori is for

- **DAOs and protocols** paying 10+ contributors who don't want every salary debate to happen in public.
- **Treasury teams** whose buyback or rebalance strategy gets front-run because every move is visible before it lands.
- **Cross-border freelancers and vendors** whose invoice amounts are indexed by anyone who knows their wallet address.

## Use cases

- **Monthly contributor payroll.** A 20-person DAO uploads a CSV every month and pays the whole team in one click. No public salary leaderboard, no quarterly comp debates triggered by Solscan.
- **Vendor and contractor invoices.** Pay a design agency, a legal firm, or a freelance auditor without publishing the rate they negotiated. Their wallet address stays unlinked from your other payments.
- **Treasury rebalancing.** A protocol moves SOL into USDC ahead of a planned buyback. The swap and downstream transfers stay inside the shielded pool, so MEV bots and competitors can't read the position before it settles.
- **Grant programs.** A foundation distributes funding to dozens of recipients on a schedule. Recipients keep their identity and award size private, the foundation keeps a full internal record via viewing keys.
- **Cross-border payouts.** Send USDC to a contractor whose local bank rails would expose the amount to intermediaries.
- **Selective audit and tax reporting.** Hand your accountant a scoped viewing key for the fiscal year. They produce a full statement of inflows, outflows, and fees while the chain reveals nothing to outsiders.
- **Founder and employee comp.** Pay equity-equivalent token grants or bonuses without surfacing the amounts to recruiters scraping wallet activity.

## How it works

Under the hood, Nori uses a UTXO-based shielded pool on Solana. A payment is not an account-to-account transfer; it is a proof that some private state changed correctly.

A single private send walks through four phases:

1. **Build.** The client constructs input and output UTXOs. Inputs are spent (nullified), outputs are new shielded notes owned by the recipient.
2. **Prove.** A Groth16 zero-knowledge proof is generated in your browser in about three seconds. The proof shows the math is valid (no double-spends, conservation of value, correct fees) without revealing amounts, owners, or memos.
3. **Relay.** The proof and the public transaction data are sent to the Cloak relay, which validates and submits the transaction to Solana.
4. **Settle.** The on-chain Cloak program verifies the proof, appends new commitments to a Merkle tree, and records nullifiers so spent notes cannot be replayed.

Public observers see an encrypted transaction. The recipient sees their balance grow. You and the viewing keys you choose to share see the full ledger.

For sequence diagrams of fast-send, batch payroll, and selective disclosure, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

### Privacy and compliance

Nori is private by default and auditable on demand. Viewing keys give you selective disclosure:

- Keep them to yourself for full personal privacy.
- Share a full viewing key with your accountant or finance team.
- Scope a key to a date range for an external auditor or regulator.
- Revoke and rotate when an engagement ends.

Privacy and accountability, not privacy versus accountability.

### Fees

Fees are enforced by the on-chain program, not by Nori. Each transfer costs a fixed 0.005 SOL plus 0.30% of the amount. Nori always shows the breakdown (gross, fee, net) before you confirm.

## Deployed

| | Mainnet | Devnet |
|---|---|---|
| App | [usenori.xyz](https://usenori.xyz) | run locally with `NEXT_PUBLIC_SOLANA_CLUSTER=devnet` |
| Cloak shield-pool program | `zh1eLd6rSphLejbFfJEneUwzHRfMKxgzrgkfwA6qRkW` | `Zc1kHfp4rajSMeASFDwFFgkHRjv7dFQuLheJoQus27h` |
| Cloak relay | `https://api.cloak.ag` | `https://api.devnet.cloak.ag` |
| Mock-USDC faucet | n/a | `POST https://api.devnet.cloak.ag/api/faucet` (1,000 mock-USDC per wallet per 24h) |

## Stack

- [Next.js 16](https://nextjs.org) (App Router) and React 19
- TypeScript
- Tailwind CSS 4 with [shadcn/ui](https://ui.shadcn.com)
- [Base UI](https://base-ui.com) primitives
- [`@solana/wallet-adapter-react`](https://github.com/anza-xyz/wallet-adapter) for wallet connection
- [`@cloak.dev/sdk`](https://docs.cloak.ag) for shielded transactions, proof generation, and history scanning
- [Vercel](https://vercel.com) for hosting

## Getting started

### Prerequisites

- Node 20 or later, pnpm 9 or later
- A Solana wallet that supports `signMessage` (Phantom, Backpack, Solflare via Wallet Standard)
- For mainnet: a small amount of SOL plus the SPL token you want to send. The minimum deposit is 10,000,000 lamports (0.01 SOL or equivalent base units).
- For devnet: nothing. The Cloak relay's faucet drips mock-USDC; you can request devnet SOL from the standard Solana faucet.

### Run locally

```bash
git clone https://github.com/priyanshpatel18/nori.git
cd nori
pnpm install
cp .env.example .env
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment

The defaults in `.env.example` point at devnet, which is what you want for first-time setup.

| Variable | Default | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SOLANA_CLUSTER` | `devnet` | `mainnet-beta` switches all flows to mainnet program + relay |
| `NEXT_PUBLIC_SOLANA_RPC_URL` | cluster default | Override with a paid endpoint (Helius, Triton, QuickNode) for any non-trivial usage |
| `NEXT_PUBLIC_SOLANA_WS_URL` | cluster default | Override the WebSocket endpoint |
| `NEXT_PUBLIC_CLOAK_RELAY_URL` | cluster default | Point at a different Cloak relay (rare, mostly for relay development) |
| `CLOAK_SCAN_RPC_URL` | falls back to `NEXT_PUBLIC_SOLANA_RPC_URL` | Server-only RPC for `/api/scan-received` so scan credits stay isolated from the client bundle |

The public-mainnet RPC won't survive any meaningful traffic. Bring a paid endpoint.

### First send (devnet)

1. Connect Phantom (or another wallet adapter).
2. The cluster badge in the topbar should read "Devnet."
3. On `/pay`, request faucet drips through the relay if you don't have devnet funds yet.
4. Send 0.01 SOL or a few mock-USDC to a second wallet you control. The full deposit + withdraw flow is two transactions; the receipt links to both on Solscan.

### First send (mainnet)

1. Set `NEXT_PUBLIC_SOLANA_CLUSTER=mainnet-beta`.
2. Restart the dev server.
3. Bring a paid RPC. Public mainnet endpoints will throttle.
4. Start small. The fee is fixed 0.005 SOL plus 0.30% of the amount, applied per transfer.

### Buffer polyfill (Next 16 + Turbopack)

If your first SDK call throws `publicAmountBuffer.readBigInt64LE is not a function`, you've hit the Turbopack auto-injection of `next/dist/compiled/buffer` (feross v5, missing BigInt methods). The fix is in `next.config.ts` (resolveAlias) plus `lib/buffer-polyfill.ts` (prototype patch). See [docs/INTEGRATION.md](docs/INTEGRATION.md#the-buffer-polyfill-gotcha-next-16--turbopack) for the full explanation if you're integrating the SDK into your own project.

## Scripts

| Script | Description |
|---|---|
| `pnpm dev` | Start the local dev server |
| `pnpm build` | Build the production bundle |
| `pnpm start` | Run the production server |
| `pnpm lint` | Run ESLint |
| `pnpm test:pay` | Node integration test that exercises the same fast-send path as the UI |
| `pnpm test:payroll` | Node integration test of the full batch payroll loop |
| `pnpm test:faucet` | Devnet mock-USDC faucet helper |

The Node tests live in `scripts/test/` and use a local Solana keypair instead of a wallet popup. See `scripts/test/README.md` for keypair + env setup.

## Documentation

- [docs/INTEGRATION.md](docs/INTEGRATION.md): integration guide for devs consuming `@cloak.dev/sdk` directly. Install, the Buffer polyfill workaround, the fast-send pattern, batch payroll, scan-based history, compliance export, and per-cluster constants.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): runtime surfaces, trust boundaries, and Mermaid sequence diagrams for fast-send, batch payroll, and selective disclosure.

## License

[LICENSE](LICENSE).
