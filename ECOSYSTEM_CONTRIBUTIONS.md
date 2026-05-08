# Ecosystem Contributions

A factual log of issues, fixes, and proposals shared with the Cloak team while building Nori. Sourced from Discord DMs with the Cloak core team (Arthur), 2026-04-29 to present.

This is not promotional copy. Each item below either changed something in the upstream SDK / infrastructure, surfaced an undocumented behavior that other integrators will hit, or proposed a structural change that the team has acknowledged. Where Nori worked around an issue rather than waiting on an upstream fix, the workaround is referenced so the next integrator can copy it.

## Issues Filed

### CORS Missing on Production Relay
**Filed 2026-04-29 · Resolved upstream 2026-05-01**

`api.cloak.ag` (mainnet relay) rejected browser requests from any deployed origin. Localhost worked because the dev server proxies; any production frontend other than the official Cloak app was blocked at preflight. Reported with screenshots of the failing OPTIONS response. Fixed by Cloak team within ~48 hours.

### CORS Missing on Circuit Artifact Bucket
**Filed 2026-05-01 · Resolved upstream 2026-05-03**

Follow-up discovered after the relay was fixed. The SDK's default `setCircuitsPath` URL pointed at an S3 bucket that also lacked CORS headers, so any frontend using the default circuits would fail proof generation in the browser even with a healthy relay. Cloak team added CORS to the bucket within 2 days.

### `swapWithChange` rejects non-SOL input
**Filed 2026-05-04 · Confirmed as intentional**

Calling `swapWithChange` with USDC input UTXOs returned `Leaf index N is beyond next_index M`. Index 418 matched the SOL tree's `next_index`, suggesting `swapUtxo` reads the SOL tree regardless of input mint. Confirmed by Cloak team as intentional: `NATIVE_SOL_MINT` is pinned; swaps are SOL-input-only today, with non-SOL output via Jupiter on the program side. Now reflected in Nori's swap UI as a SOL-locked input with an in-page tooltip explaining the constraint.

### Cold-Start Prover Latency Unusable in Browser
**Filed 2026-05-05 · Self-resolved · Workaround documented**

First Groth16 proof took 92s, second took 1.5s. The 92s cold-start was the proving key download from S3, not proof computation. Proposed a `warmup()` export from the SDK that frontends could call on wallet-connect to pre-load the artifacts.

Self-resolved by self-hosting the circuit artifacts at `public/circuits/0.1.0/transaction_js/transaction.wasm` and `transaction_final.zkey`, then pointing `setCircuitsPath` at the same origin so the artifacts ship from Vercel's edge. Pattern documented at `nori/lib/cloak/init.ts` as reference for future integrators.

### CORS Missing on Devnet Relay
**Filed 2026-05-07 · Pending upstream**

Same shape as the mainnet issue, this time on `api.devnet.cloak.ag`. Reported with preflight screenshots. Worked around in Nori by routing the devnet faucet call through a Next.js API route at `/api/faucet`, which talks to the upstream server-side and forwards the response. Pattern at `nori/app/api/faucet/route.ts`.

### Solana Earn Discord Invite Link Invalid
**Filed 2026-04-29 · Resolved**

The Discord invite link surfaced from the Solana Earn listing returned an "invalid invite" error. Rejoined via a direct invite from the team. Minor but blocked first-time integrators from reaching the support channel.

## Proposals

### Integrator Fee Support
**Submitted 2026-05-07 · Acknowledged**

> Applications building on top of Cloak currently have no native
> mechanism to monetize transaction flow or generate sustainable
> protocol revenue. This creates weak incentives for third-party teams
> to integrate, maintain, and grow products within the ecosystem.
>
> Introduce integrator fee support at the protocol or SDK layer. Allow
> applications integrating Cloak to specify a configurable fee
> percentage on supported transactions, similar to the fee-sharing
> model used by LI.FI.

Cloak team response: *"This is really good feedback. We'll think about it."* Under consideration.

## Patterns Nori Contributed Back to the Integrator Surface

Each of these started as a Nori workaround for an upstream gap. They are written up in the codebase as reference patterns the next builder on Cloak can copy:

| Workaround | Where it lives | What it solves |
|---|---|---|
| Self-hosted circuit artifacts | `nori/lib/cloak/init.ts` + `public/circuits/0.1.0/` | Cold-start prover RTT, S3 CORS gaps |
| SOL-locked swap UI with rationale tooltip | `nori/app/(app)/swap/page.tsx` | The `NATIVE_SOL_MINT` constraint surfaces cleanly to the user instead of erroring at submit |
| Same-origin faucet proxy | `nori/app/api/faucet/route.ts` | Browser cannot call `devnet.cloak.ag/api/faucet` directly without CORS |
| Self-managed devnet SOL faucet | `nori/app/api/faucet/sol/route.ts` (Postgres-backed once-per-wallet ledger) | The official faucet doesn't drop SOL; relying on `requestAirdrop` is rate-limited |

## Response

Average upstream response time: 1 to 3 days. Three of the six issues filed have shipped fixes; one was clarified as intentional behavior; two are pending. The Cloak team has been responsive and direct.

Nori plans to keep filing against real production usage as more flows go live (full devnet end-to-end, batch payroll under load, viewing-key issuance against external auditors), and to publish workaround patterns in this file as they ship.
