<h1>
  <img src="public/nori-wordmark.svg" alt="Nori" height="80" />
</h1>

**Private payroll and payments for Solana.**

Your company's payroll is public on Solana. Every salary, every contractor rate, every vendor payment is permanently readable and indexed forever. Nori makes it private, with full compliance when you need it.

- **Website:** [usenori.xyz](https://usenori.xyz)
- **X:** [@UseNori](https://x.com/UseNori)

## What Nori does

Nori is a private payments layer for crypto-native teams (DAOs, startups, and protocols) paying contributors in SOL, USDC, or USDT. Every transaction is settled through a zero-knowledge shielded pool, so amounts and recipients stay off the public ledger while staying fully auditable for the people you choose.

### Core flows

1. **Single private send.** Pick a token, enter an amount and a recipient, and Nori shields the transfer end to end. The chain sees an opaque transaction, the recipient gets the funds.
2. **Batch payroll.** Drop in a CSV of `wallet_address, amount`. Nori previews the run with totals and fees, then pays each recipient in its own private transaction. One row failing does not stop the rest, and you can retry only the failures.
3. **Payment claim links.** Generate a link or QR for someone who has never used Nori. They connect any Solana wallet and the funds land in their account, no prior setup needed.
4. **Private history.** Your viewing key stays on your device. Nori reads Cloak transactions from Solana RPC and decrypts only the ones that belong to you, with running balances and gross/fee/net per row.
5. **Compliance export.** Pick a date range, download a CSV, or share a scoped viewing key. Auditors get the full record without the chain learning anything.
6. **Private swaps.** Swap between SOL and USDC entirely inside the shielded pool, so positions and rebalances stay off public dashboards and away from MEV bots.

## Who Nori is for

- **DAOs and protocols** paying 10+ contributors who don't want every salary debate to happen in public.
- **Treasury teams** whose buyback or rebalance strategy gets front-run because every move is visible before it lands.
- **Cross-border freelancers and vendors** whose invoice amounts are indexed by anyone who knows their wallet address.

## Use cases

- **Monthly contributor payroll.** A 20-person DAO uploads a CSV every month and pays the whole team in one click. No public salary leaderboard, no quarterly comp debates triggered by Solscan.
- **Vendor and contractor invoices.** Pay a design agency, a legal firm, or a freelance auditor without publishing the rate they negotiated. Their wallet address stays unlinked from your other payments.
- **Treasury rebalancing.** A protocol moves SOL into USDC ahead of a planned buyback. With Nori, the swap and downstream transfers stay inside the shielded pool, so MEV bots and competitors can't read the position before it settles.
- **Grant programs.** A foundation distributes funding to dozens of recipients on a schedule. Recipients keep their identity and award size private, the foundation keeps a full internal record via viewing keys.
- **Cross-border payouts.** Send USDC to a contractor whose local bank rails would expose the amount to intermediaries. They claim from a link with any Solana wallet, no Nori account required.
- **Stealth receive for new users.** Onboard a contributor who has never touched Cloak. They receive a claim link, connect a fresh wallet, and the funds arrive privately on first use.
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

### Privacy and compliance

Nori is private by default and auditable on demand. Viewing keys give you selective disclosure:

- Keep them to yourself for full personal privacy.
- Share a full viewing key with your accountant or finance team.
- Scope a key to a date range for an external auditor or regulator.
- Revoke and rotate when an engagement ends.

Privacy and accountability, not privacy versus accountability.

### Fees

Fees are enforced by the on-chain program, not by Nori. Each transfer costs a fixed 0.005 SOL plus 0.3% of the amount. Nori always shows the breakdown (gross, fee, net) before you confirm.

## Built on

Nori is built on [Cloak](https://docs.cloak.ag), a UTXO-based shielded pool on Solana with Groth16 ZK proofs and a 32-deep Merkle tree of commitments.

## Stack

- [Next.js 16](https://nextjs.org) (App Router) and React 19
- TypeScript
- Tailwind CSS 4 with [shadcn/ui](https://ui.shadcn.com)
- [Base UI](https://base-ui.com) primitives
- `@solana/wallet-adapter-react` for wallet connection
- `@cloak.dev/sdk` for shielded transactions, proof generation, and history scanning

## Getting started

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Script | Description |
|---|---|
| `pnpm dev` | Start the local dev server |
| `pnpm build` | Build the production bundle |
| `pnpm start` | Run the production server |
| `pnpm lint` | Run ESLint |

## License

[LICENSE](LICENSE).
