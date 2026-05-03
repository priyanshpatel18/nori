# Reviewing Nori

A walkthrough of every shipped feature, in the order a real user touches them. Follow it top to bottom. Each section assumes the previous one has run at least once, since they share state (history, balances, payment records).

You can run on **devnet** (free, recommended for the first pass) or **mainnet** (real funds). The flows are identical; only the program ID, relay URL, and tokens differ.

---

## 0. Setup

### Wallet

Connect any Wallet Standard wallet from the topbar **Connect** button:

- Phantom
- Backpack
- Solflare

The cluster badge in the topbar confirms which network you are on. On devnet it is visible; on mainnet it hides itself.

### Local dev (optional)

The deployed app at [usenori.xyz](https://usenori.xyz) is the canonical target. To run locally:

```bash
pnpm install
pnpm dev
```

Open http://localhost:3000.

To force devnet locally, set `nori/.env.local`:

```
NEXT_PUBLIC_SOLANA_CLUSTER=devnet
NEXT_PUBLIC_SOLANA_RPC_URL=<your-devnet-rpc>
```

### Funding

On devnet:

- **SOL:** any public devnet faucet (faucet.solana.com, solfaucet.com).
- **Mock USDC:** run `pnpm test:faucet` from `nori/`. It drips 1000 mock USDC per wallet per 24h via the Cloak devnet faucet.

On mainnet, you fund yourself (small amounts are enough; minimum deposit is 0.01 SOL).

---

## 1. Single private send: `/pay`

The headline flow. One signature, one private payment.

### Steps

1. Open `/pay`.
2. Pick a token: SOL, USDC, or USDT.
3. Enter an amount.
4. Enter a recipient address (any Solana address; the SDK auto-creates the recipient ATA if it does not exist).
5. The fee breakdown appears: gross, variable fee (0.3%), fixed network fee (0.005 SOL), and the recipient net.
6. Click **Send privately**.
7. Approve the wallet popup. **One** wallet signature for the entire flow.
8. Watch the progress bar advance through build, prove (~3s in-browser), relay, settle.
9. The success card shows both Solscan links: the deposit transaction and the payout transaction.

### What to verify

- The fee breakdown is shown **before** you confirm, not after.
- The recipient net is highlighted in the brand amber color.
- Click the deposit Solscan link. The instruction data is opaque; no recipient address or amount is visible.
- Click the payout Solscan link. The payout to the recipient ATA is visible (it must be, the recipient receives funds), but it is not linkable to the deposit by an outside observer.
- The form resets cleanly after success. Click **Send another** to verify.
- The new send appears in `/history` once you sync (section 4).

---

## 2. Batch payroll: `/payroll`

CSV in, one signature, everyone paid privately.

### Steps

1. Prepare a CSV. Format: `wallet_address,amount`. Example:

   ```csv
   wallet_address,amount
   8xKjP...8H1,1.5
   3FzN1...4kQ,0.25
   AbqW9...vTm,2.0
   ```

2. Open `/payroll`.
3. Pick the token (one token per run). The selector is at the top.
4. Drop the CSV onto the upload zone.
5. Verify the **preview table**: per-row state and totals (gross, variable fee, network fee, recipients receive).
6. Click **Run batch**.
7. Approve the wallet popup. **One** signature for the whole batch.
8. Watch each row progress: `pending` → `paying-proof` → `paying-submit` → `confirmed` (or `failed`).
9. Receipt at the end: `Paid N contributors. Total: ... Batch deposit tx: ...`

### What to verify

- Bad rows are flagged in the preview (`invalid-address`, `bad-amount`) and excluded from the run.
- One row failing does not stop the rest. To test: include one row with a deliberately mistyped address. Either the preview catches it (status: `invalid-address`) or the runner marks it `failed` and continues.
- Net wallet popups: **one** for the whole batch, not one per recipient.
- Each confirmed row appends to `/history`, all sharing the same batch deposit signature.
- On Solscan, the batch deposit is one transaction. Each recipient receives a separate payout. Solscan cannot reconstruct who got how much.

### Recovering a failed run

If the deposit lands but some payouts fail (rare), the change UTXO and ephemeral keypair are persisted to localStorage. Any residual is recoverable via `fullWithdraw` later.

---

## 3. Team and recurring payments: `/team`

Save the team once. Attach a cadence per member. Run all due payments with one click.

### Steps

1. Open `/team`.
2. Click **Add member**.
3. Fill: name, wallet, default token, default amount, optional note.
4. (Optional) Attach a schedule:
   - Cadence: `daily`, `weekly`, `biweekly`, `monthly`, or `test` (for QA).
   - Day of cycle (e.g. day 1 for monthly = 1st of each month).
   - Amount and mint.
5. Save. Repeat for 2 or 3 members.
6. When members are due (based on `lastPaidAt` + cadence), the **Due banner** appears at the top of `/team` and `/payroll`.
7. Click **Run due** in the banner.
8. The dialog snapshots the due list (so it does not go blank as members are paid mid-run) and groups by mint.
9. Approve one wallet popup per token group.

### What to verify

- Members and schedules survive page reload (localStorage `nori:team:v1:<cluster>`).
- The "Paid X ago" indicator updates on each scheduled row after a run.
- The new payments land in `/history` under the **Recurring** tab with `source: "recurring"`.
- Open a second tab on `/team`. Add or edit a member in tab A; tab B reflects the change without a refresh (the `nori:team-updated` event drives the cross-tab sync).

### Honest constraint

Recurring is **reminder-based**, not autonomous. Each run requires a click and a signature. There is no server holding signing power. That is a deliberate privacy trade-off: a server signer would mean handing your spend key to a third party, which kills the entire privacy story.

---

## 4. Private history: `/history`

Chain-native scanner. Your viewing key stays on your device. The chain has the data; only you can read it.

### Steps

1. Open `/history`.
2. Click **Sync received** in the toolbar.
3. Wait for `Synced just now · N cached`. The first scan reads up to 200 recent program transactions; subsequent syncs are incremental from the cached `lastSignature` cursor.
4. Browse the list. Filter tabs at the top: **All**, **Pay**, **Payroll**, **Recurring**, **Received**.
5. Set a date range to narrow further.
6. Use the search box to find a recipient or signature.
7. Click a row for details (a Dialog opens for batch rows so the page does not jump).

### What to verify

- The **per-token summary** at the top (In, Out, Net, with tx count) reflects everything in the filtered range.
- **Outgoing** rows come from the local `payment-history` store (written when you send via `/pay` or `/payroll`).
- **Received** rows come from the on-chain scan, decrypted locally.
- Direction chips: green "In" for incoming, neutral "Out" for outgoing.
- Type chips: Pay, Payroll, Recurring, Deposit, Withdraw, Transfer, Swap.
- Each row's Solscan link opens the on-chain tx; the same opacity check from `/pay` applies.

### If sync fails (429s)

Free-tier RPC providers throttle. Click **Reset cache** to drop the cursor, then sync again. The scanner is incremental, so reset is rarely needed; it is there for completeness.

---

## 5. Compliance: `/compliance`

Selective disclosure end to end. The page does not scroll; everything fits in one viewport (`h-[calc(100dvh-3.5rem)]`).

### A. Summary stats

Top of the page, full width.

- Token chips on the left switch the active token.
- Four tiles on the right: **In**, **Out**, **Fees**, **Net** for that token.
- Subtitle shows tx count, or the active date range when one is set.

### B. Date range picker

1. In the **Issue a viewing key** form (left column), set the From and To dates.
2. The summary subtitle flips to `2026-04-01 → 2026-04-30`.
3. The Transactions list on the right shrinks to in-range rows only.
4. The picker enforces `from <= to` via cross-bound `min`/`max` on the inputs.
5. The **Clear** link appears next to the Date range label whenever a range is active.

### C. Per-transaction detail drawer

1. Click any row in the **Transactions** card on the right.
2. A drawer slides in from the right.
3. Verify:
   - **Header**: type chip (Deposit / Withdraw / Transfer / Swap), signed net amount in mono with the token symbol, full timestamp.
   - **Three top tiles**: Amount / Fee / Net in human-formatted units.
   - **View on Solscan**: prominent button. Opens `solscan.io/tx/<sig>` (with `?cluster=devnet` on devnet) in a new tab.
   - **Raw fields**: every property of `ComplianceReport.transactions[number]`. Type, raw timestamp (ms), signature (linked to Solscan tx), commitment, recipient (linked to Solscan address), mint, optional output mint for swaps, decimals, raw amount, raw fee, raw net, raw running balance. Each raw value carries a hint with its human-formatted equivalent.
4. ESC or the close button dismisses the drawer.

### D. CSV export

1. With or without a date range set, click **Export CSV** in the Transactions card header.
2. A file downloads.
3. Filename pattern:
   - `compliance-2026-04-01_to_2026-04-30.csv` when both bounds are set.
   - `compliance-from-2026-04-01.csv` or `compliance-to-2026-04-30.csv` when only one bound is set.
   - `compliance-<today>.csv` when no range is set.
4. Open the file. Header row:

   ```
   Date,Type,Asset,Gross Amount,Fee,Net Amount,Running Asset Balance,Recipient,Commitment,Signature,Input Mint,Output Asset,Output Mint
   ```

5. One row per in-range transaction, sorted by timestamp ascending. Date is ISO 8601. Amounts are decimal-formatted to the token's precision.

### E. Issue a viewing key (UI scaffolding)

1. Type an auditor name (e.g. `Trail of Bits`). The Generate button stays disabled until this is non-empty.
2. (Optional) Pick a date range as in section 5B. This becomes the auditor's window.
3. (Optional) Type a delivery email. Stored locally as metadata; never sent anywhere.
4. Click **Generate viewing key**.
5. A success banner appears: `Issued for Trail of Bits vk_AAAA…BBBB`. It auto-dismisses after about 5 seconds.
6. The key appears at the top of the **Active keys** card.
7. Click the copy icon to copy the id; the icon flips to a green check briefly.
8. Click the trash icon to **revoke**. The row dims and shows a `Revoked` pill. The trash icon now functions as Delete; click again to remove the row.
9. Reload the page. Keys persist in localStorage, scoped per `(wallet, cluster)`.

### F. Cross-tab sync

Open a second tab on `/compliance`. Issue a key in tab A. Within a tick, tab B's Active keys card updates without a refresh. Same for revoke and delete.

### Honest gap

The id rendered today (`vk_AAAA…BBBB`) is a **tracking identifier**, not the cryptographic key bytes that an auditor would use to decrypt. Real key derivation belongs to Day 9 of the roadmap: `signMessage` to derive a master seed, then `deriveDiversifiedViewingKey` per auditor. The form, the persistence layer, and the Active keys list slot directly into that work without changing shape.

Until that lands:

- Issuance is a record of intent, useful as an audit trail of who you handed a key to and when.
- Revocation is a UI flag, not cryptographic invalidation. (The chain has nothing to revoke; revocation in the real flow means rotating the diversifier so new commitments stop matching.)
- The CSV export in section 5D is the **functional** auditor hand-off today: pick a range, export, share via your encrypted channel of choice.

---

## 6. Side-by-side privacy check

This is the demo that proves "private but auditable" is real:

1. Open the CSV from section 5D. Pick a row. Note the **Signature** value.
2. Paste the signature into a new tab on `solscan.io`. Use no cluster param for mainnet, or `?cluster=devnet` for devnet.
3. Compare:
   - **CSV row**: Date, Type, full Gross / Fee / Net, Recipient, Commitment, Signature, Mint, plus running balance.
   - **Solscan**: a call to the shield-pool program, a nullifier, a new Merkle commitment, a relay paying gas.

For internal **transfers**, Solscan shows no token movement at all. The amount and the sender/recipient relationship are entirely sealed.

For **deposits** and **withdrawals**, the external leg (the wallet that sent SOL in or that received SOL out) is necessarily public; the chain has to track those balances. But Solscan cannot tell which deposit corresponds to which withdrawal, and cannot reconstruct the path through the pool.

The CSV reader sees the full ledger. The chain reader sees one of N possible interpretations.

---

## 7. What is intentionally not done yet

This is the honest list, mapped to the public roadmap:

| Gap | Roadmap day |
|---|---|
| Real cryptographic viewing key derivation, masked display, auditor reader at `/compliance/view?nk=...` | Day 9 |
| Toast notification system, mobile responsive sweep, friendly error copy | Day 10 |
| Reliability work (queue for failed batch rows, manual retry, background polling) | Day 11 |
| Demo mode toggle, first-use onboarding, faucet button on `/pay` | Day 12 |
| Public README rewrite, integration guide, architecture diagrams, demo video | Day 13 |
| Programmatic API (Solana Pay deep links, webhooks) | Day 17 |

---

## Quick reference

| Where | What |
|---|---|
| `/pay` | Single private send |
| `/payroll` | CSV batch payroll |
| `/team` | Saved team and recurring schedules |
| `/history` | Chain-native private history |
| `/compliance` | Summary, date range, per-tx drawer, CSV export, viewing keys |

| Constant | Value |
|---|---|
| Mainnet program ID | `zh1eLd6rSphLejbFfJEneUwzHRfMKxgzrgkfwA6qRkW` |
| Devnet program ID | `Zc1kHfp4rajSMeASFDwFFgkHRjv7dFQuLheJoQus27h` |
| Mainnet relay | `https://api.cloak.ag` |
| Devnet relay | `https://api.devnet.cloak.ag` |
| Fee | 0.005 SOL fixed plus 0.3% of amount |
| Minimum deposit | 0.01 SOL (10,000,000 lamports) |
| Merkle tree height | 32 |
| Root history | 100-entry ring buffer |

| Script | What it does |
|---|---|
| `pnpm dev` | Local dev server |
| `pnpm build` | Production bundle |
| `pnpm lint` | ESLint |
| `pnpm test:faucet` | Devnet mock USDC drip (1000 USDC per wallet per 24h) |
| `pnpm test:pay` | Scripted single private send |
| `pnpm test:payroll` | Scripted batch payroll loop |

---

## Reporting issues

- **GitHub:** [github.com/priyanshpatel18/nori](https://github.com/priyanshpatel18/nori)
- **X:** [@UseNori](https://x.com/UseNori)

When filing, include cluster, wallet (or a wallet that reproduces the issue, never your real one with funds), browser, and the failing signature if there is one.
