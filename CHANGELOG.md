# Changelog

All notable changes to Nori are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning follows [SemVer](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-05-09

First production release. Nori is a private payments and payroll app built on the Cloak shielded pool.

### Pay

- Private SOL and USDC payments via the Cloak SDK `transact()` flow, with deposit-into-pool and recipient routing.
- Amount input with validation, recipient address validation, and preflight balance guards.
- Proof-generation progress bar (0% → 100%) and success cards with action-specific labels.
- Payment history list with smooth progress states.

### Payroll

- CSV upload and parse (`wallet`, `amount` columns) via `papaparse`.
- Preview table with totals, per-row validation, and bad-row flagging.
- Sequential execution loop with per-row status and retries.
- One-signature batch path: single deposit + N `partialWithdraw` calls.
- Team list page with add/edit/delete members, persisted to `localStorage`.
- Per-member schedules `{ cadence, dayOfCycle, amount, mint, lastPaidAt }`.
- Due-payments detector with dashboard banner ("N due, run now").

### Shield (shielded balance)

- "Your shielded balance" view: deposit, send from balance, withdraw.
- Stable spend-key derivation from wallet `signMessage`.
- Cross-device shielded balance visibility with opt-in recovery.
- Auto-consolidate and amount shortcuts (max / half).
- Self-hosted Cloak circuit artifacts to bypass S3 CORS hang.

### Swap

- Swap UI: input/output token selector and quote.
- `swapWithChange` wiring, slippage input, and min-output display.
- Two-phase status (Tx1 open swap state → Tx2 settlement) with polling.
- Real Jupiter pricing with hardened swap-core and recovery UI.
- Pause submission and harden swap-core for safe re-enable.
- Swap success state and history integration.

### History

- Paginated history with source filter and stable layout.
- Direction labels (in/out) and per-row classification.
- Per-token running balance summary.
- Date-range filter with `lastSignature` pagination cache.
- Fixed-viewport layout matching compliance.

### Compliance

- Compliance page scaffold with summary stats card (in / out / fees / net).
- Date-range picker (from–to).
- CSV export via `toComplianceReport` + `formatComplianceCsv`.
- Per-tx detail drawer with Solscan and raw fields.
- Active viewing-keys persistence (`localStorage` + `useIssuedKeys`), controlled form, copy/revoke/delete.
- Viewing-key derive + display (masked) + copy-to-clipboard.
- Auditor read-only history view via imported viewing key.
- Short audit links, server-side scan, per-token rollups.
- Outbound sends surfaced in dashboard and auditor link.
- Copy-working auditor link from issue form and key rows.
- Inline "Sync" button on transactions card.

### Reliability

- Background status polling for in-flight transactions.
- Manual "Retry failed" on payroll receipts.
- Batch retry queue with per-row state machine.
- Merkle-tree session-storage cache across operations (perf).
- User-visible error messages mapped from `CloakError` categories.

### UX & UI

- Sidebar nav: Pay / Payroll / History / Compliance.
- Brand icon set, sidebar collapse.
- Toast notification system (`sonner`) for success / error / pending.
- Empty states for `/history`, `/payroll`, `/compliance`, `/shield`.
- Mobile responsive sweep across all pages.
- Consistent compact `PageHeader` and viewport-locked shell.
- Portfolio card with preflight balance guards across send flows.
- First-use guided tour for new wallets.

### Onboarding & demo

- Demo-mode toggle in settings (devnet + faucet).
- Mock-USDC + devnet-SOL faucet UI wired to Cloak's faucet API.

### Marketing

- Black/amber themed homepage with AlignUI primitives and cursor-spotlight bento.
- Simpler landing redesign and brand-aligned app pages.

### Docs

- `README.md` with problem statement, product walkthrough, setup, deployed links.
- Architecture diagram and transaction flow diagrams.
- Integration guide for devs consuming the Cloak SDK directly.
- `REVIEWER.md` and Nori wordmark.
- Ecosystem contributions log.

### Stack

- Next.js 14, shadcn/ui, Tailwind CSS, Solana wallet-adapter, Prisma.
- Cloak SDK (`@cloak.dev/sdk`) for shielded transact / withdraw / swap flows.

[1.0.0]: https://github.com/priyanshpatel18/nori/releases/tag/v1.0.0
