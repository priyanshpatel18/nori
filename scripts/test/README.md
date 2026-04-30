# Integration test scripts

Node-side smoke tests that exercise the same Cloak SDK paths the frontend
wires (`fastSendOnce` → `transact` + `fullWithdraw`), with a local Solana
keypair instead of a wallet adapter.

These submit **real transactions** on the cluster you target. Use a dedicated
test keypair and small amounts.

## Setup

1. Have a Solana keypair JSON file (Solana CLI format — a 64-byte JSON array).
   Quickest way:

   ```sh
   solana-keygen new --outfile ~/.config/solana/test.json
   ```

2. Fund the keypair:

   - **Devnet SOL:** `solana airdrop 2 --keypair ~/.config/solana/test.json --url https://api.devnet.solana.com`
   - **Devnet mock USDC:** see the `test:faucet` script below.
   - **Mainnet:** real SOL / USDC / USDT, from your usual sources. Tiny amounts only.

3. For mainnet, set a paid RPC URL (the public one will 403 you):

   ```sh
   export RPC_URL=https://mainnet.helius-rpc.com/?api-key=...
   ```

## Scripts

All read config from env vars. Every script exits with a non-zero status on
failure so they're CI-friendly.

### `pnpm test:pay`

Single private send (deposit → fullWithdraw to recipient's wallet).

| env | required | example |
|---|---|---|
| `KEYPAIR` | yes | `~/.config/solana/test.json` |
| `CLUSTER` | no, default `devnet` | `devnet` \| `mainnet-beta` |
| `TOKEN` | no, default `SOL` | `SOL` \| `USDC` \| `USDT` (USDT is mainnet-only) |
| `AMOUNT` | yes | `0.05` (decimal in token units) |
| `RECIPIENT` | yes | base58 Solana wallet address |
| `RPC_URL` | no | required for mainnet (public RPC blocks browser-origin) |

```sh
KEYPAIR=~/.config/solana/test.json \
CLUSTER=devnet TOKEN=SOL AMOUNT=0.05 \
RECIPIENT=8gm5X1Nq8f28qu5XPTXk236FVmEufFprFmceRssYzMuk \
  pnpm test:pay
```

### `pnpm test:faucet`

Mints mock USDC to a devnet wallet via Cloak's public faucet.

| env | required | example |
|---|---|---|
| `WALLET` | one of `WALLET` or `KEYPAIR` | base58 wallet address |
| `KEYPAIR` | one of `WALLET` or `KEYPAIR` | path to keypair JSON |
| `AMOUNT` | no, default `100` | mock USDC (decimal, capped at `1000` per request) |

```sh
WALLET=8gm5X1Nq8f28qu5XPTXk236FVmEufFprFmceRssYzMuk pnpm test:faucet
```

Devnet only. Mainnet uses real Circle USDC.

### `pnpm test:payroll`

Runs a CSV through the same sequential `fastSendOnce` loop the `/payroll`
batch hook uses. Failures don't abort; per-row outcome is printed live.

| env | required | example |
|---|---|---|
| `KEYPAIR` | yes | `~/.config/solana/test.json` |
| `CLUSTER` | no, default `devnet` | |
| `TOKEN` | no, default `SOL` | |
| `CSV` | yes | path to CSV with `wallet`, `amount` columns |
| `RPC_URL` | no | required for mainnet |

```sh
KEYPAIR=~/.config/solana/test.json \
CLUSTER=devnet TOKEN=USDC \
CSV=./scripts/test/sample-roster.csv \
  pnpm test:payroll
```

## Pre-prod gate

Before pushing changes that touch the SDK integration to prod:

```sh
# 1. Devnet SOL — proves the fast-send wiring works.
KEYPAIR=~/.config/solana/test.json TOKEN=SOL AMOUNT=0.05 RECIPIENT=… pnpm test:pay

# 2. Devnet mock USDC — proves the SPL path works.
KEYPAIR=~/.config/solana/test.json TOKEN=USDC AMOUNT=1 RECIPIENT=… pnpm test:pay

# 3. Devnet batch — proves the loop + per-row state.
KEYPAIR=~/.config/solana/test.json TOKEN=USDC CSV=./scripts/test/sample-roster.csv pnpm test:payroll

# 4. Mainnet smoke — only when devnet is clean.
RPC_URL=… KEYPAIR=…/mainnet.json CLUSTER=mainnet-beta TOKEN=SOL AMOUNT=0.01 RECIPIENT=… pnpm test:pay
```

If all four pass: ship.
