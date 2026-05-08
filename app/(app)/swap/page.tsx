"use client";

import {
  Alert02Icon,
  ArrowDown01Icon,
  ArrowRight01Icon,
  CheckmarkCircle01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useWallet } from "@solana/wallet-adapter-react";
import { AnimatePresence, motion } from "motion/react";
import { Progress as ProgressPrimitive } from "@base-ui/react/progress";
import * as React from "react";

import { ShieldIcon, VerifiedTickIcon } from "@/components/Icons";
import { PageHeader } from "@/components/app-shell/page-header";
import { AmountInput } from "@/components/cloak/amount-input";
import { InlineError } from "@/components/cloak/inline-error";
import { SlippageInput } from "@/components/cloak/slippage-input";
import { TokenLogo, TokenSelector } from "@/components/cloak/token-selector";
import { useWalletBalances } from "@/lib/cloak/use-wallet-balances";
import { FancyButton } from "@/components/ui/fancy-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProgressIndicator, ProgressTrack } from "@/components/ui/progress";
import {
  getShieldToken,
  listShieldTokens,
  toBaseUnits,
  type ShieldTokenId,
} from "@/lib/cloak/tokens";
import {
  appendPayment,
  formatBaseUnits as formatBaseUnitsString,
} from "@/lib/cloak/payment-history";
import { useSwap, type SwapTxRecord } from "@/lib/cloak/use-swap";
import {
  applySlippageBps,
  formatBaseUnits,
  useSwapQuote,
} from "@/lib/cloak/use-swap-quote";
import { useSwapRecovery } from "@/lib/cloak/use-swap-recovery";
import type { PendingSwapRecord } from "@/lib/cloak/pending-swaps";
import { solanaConfig } from "@/lib/solana/config";
import { solscanTxUrl } from "@/lib/solana/explorer";
import { cn } from "@/lib/utils";

const DEFAULT_SLIPPAGE_BPS = 50;

type AmountError =
  | { kind: "format" }
  | { kind: "non-positive" }
  | { kind: "decimals"; max: number };

function validateAmount(raw: string, decimals: number): AmountError | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!/^\d*\.?\d*$/.test(trimmed) || trimmed === ".") return { kind: "format" };
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n <= 0) return { kind: "non-positive" };
  const dot = trimmed.indexOf(".");
  const frac = dot === -1 ? 0 : trimmed.length - dot - 1;
  if (frac > decimals) return { kind: "decimals", max: decimals };
  return null;
}

function amountErrorMessage(err: AmountError) {
  switch (err.kind) {
    case "format":
      return "Numbers only. Use a single decimal point.";
    case "non-positive":
      return "Amount must be greater than zero.";
    case "decimals":
      return `Up to ${err.max} decimal places for this token.`;
  }
}

export default function SwapPage() {
  const tokens = React.useMemo(() => listShieldTokens(), []);
  // Cloak swaps go SOL → Jupiter-supported token only: the program pulls
  // the SOL pool's next_index when generating the withdraw proof for the
  // swap, so any non-SOL input mint trips "Leaf index N is beyond
  // next_index M". Lock sell to SOL and pick a sensible default for buy.
  const buyOptions = React.useMemo(
    () => tokens.filter((t) => t.id !== "SOL"),
    [tokens],
  );
  const defaultBuy: ShieldTokenId =
    buyOptions[0]?.id ?? tokens[0]?.id ?? "USDC";

  const sell: ShieldTokenId = "SOL";
  const [buy, setBuy] = React.useState<ShieldTokenId>(defaultBuy);
  const [amount, setAmount] = React.useState("");
  const [amountTouched, setAmountTouched] = React.useState(false);
  const [slippageBps, setSlippageBps] = React.useState(DEFAULT_SLIPPAGE_BPS);

  const wallet = useWallet();
  const swap = useSwap();
  const recovery = useSwapRecovery();
  const walletBalances = useWalletBalances();
  const [lastSwap, setLastSwap] = React.useState<{
    sellToken: ShieldTokenId;
    buyToken: ShieldTokenId;
    sellAmountRaw: string;
    sellDecimals: number;
    minOutRaw: string;
    outDecimals: number;
  } | null>(null);
  const sellToken = React.useMemo(() => getShieldToken(sell), [sell]);
  const buyToken = React.useMemo(() => getShieldToken(buy), [buy]);
  const sellDecimals = sellToken?.decimals ?? 9;

  const amountError = React.useMemo(
    () => validateAmount(amount, sellDecimals),
    [amount, sellDecimals],
  );
  const showAmountError = amountTouched && !!amountError;
  const amountValid = !amountError && amount.trim() !== "";

  const { status, quote, error: quoteError } = useSwapQuote({
    sell,
    buy,
    amount: amountValid ? amount : "",
  });

  function handleSelectBuy(next: ShieldTokenId) {
    if (next === sell) return; // sell is locked to SOL; ignore SOL→SOL.
    setBuy(next);
  }

  const buyDisplay =
    quote && status === "ready"
      ? formatBaseUnits(quote.outAmountBaseUnits, quote.outDecimals)
      : "";

  const minOutputBaseUnits = quote
    ? applySlippageBps(quote.outAmountBaseUnits, slippageBps)
    : 0n;

  const minOutputDisplay =
    quote && minOutputBaseUnits > 0n
      ? formatBaseUnits(minOutputBaseUnits, quote.outDecimals)
      : "-";

  const submitting =
    swap.status === "deposit-proof" ||
    swap.status === "deposit-submit" ||
    swap.status === "swap-proof" ||
    swap.status === "swap-submit" ||
    swap.status === "swap-settle";

  const showTxStatus =
    submitting ||
    swap.status === "success" ||
    (swap.status === "error" &&
      (swap.depositTx.status !== "pending" ||
        swap.openSwapStateTx.status !== "pending"));

  const sellWalletBalance = walletBalances.balances[sell] ?? 0n;
  const sellAmountBaseUnits =
    amountValid && sellToken
      ? toBaseUnits(amount, sellToken.decimals)
      : 0n;
  const overWalletBalance =
    amountValid && wallet.connected && sellAmountBaseUnits > sellWalletBalance;

  // Swap submission is paused. Settlements have been timing out at the
  // relay; the relay's own refund path runs but races nori's auto-refund,
  // which then trips UtxoAlreadySpentError on the local fullWithdraw. Net
  // outcome was confusing UX even when funds returned ok. Quotes still
  // update so users can browse, and the recovery panel stays visible for
  // anyone with a still-pending deposit.
  const SWAP_DISABLED = true;
  const canSubmit =
    !SWAP_DISABLED &&
    wallet.connected &&
    !submitting &&
    amountValid &&
    !overWalletBalance &&
    !!sellToken &&
    !!buyToken &&
    status === "ready" &&
    quote !== null &&
    minOutputBaseUnits > 0n;

  return (
    <>
      <PageHeader
        eyebrow="Private swap"
        title="Trade tokens, privately."
        description="Swap inside the Cloak shielded pool. The chain sees a generic pool tx, not your tokens or amounts."
      />

      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10 sm:px-8">
        {recovery.unresolved.length > 0 && (
          <PendingSwapsPanel recovery={recovery} />
        )}
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        {swap.status === "success" && lastSwap ? (
          <SwapSuccessCard
            sellToken={lastSwap.sellToken}
            buyToken={lastSwap.buyToken}
            sellAmountRaw={lastSwap.sellAmountRaw}
            sellDecimals={lastSwap.sellDecimals}
            minOutRaw={lastSwap.minOutRaw}
            outDecimals={lastSwap.outDecimals}
            recipientAta={swap.recipientAta}
            depositSignature={swap.depositTx.signature}
            swapSignature={swap.openSwapStateTx.signature}
            settlementSignature={swap.settlementTx.signature}
            onSwapAnother={() => {
              swap.reset();
              setLastSwap(null);
              setAmount("");
              setAmountTouched(false);
            }}
          />
        ) : (
        <motion.form
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          className="flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-card/60 p-6 sm:p-8"
          onSubmit={async (e) => {
            e.preventDefault();
            setAmountTouched(true);
            if (!canSubmit || !sellToken || !buyToken || !wallet.publicKey) {
              return;
            }
            const sellAmountBaseUnits = toBaseUnits(amount, sellToken.decimals);
            const senderBase58 = wallet.publicKey.toBase58();
            setLastSwap({
              sellToken: sell,
              buyToken: buy,
              sellAmountRaw: sellAmountBaseUnits.toString(),
              sellDecimals: sellToken.decimals,
              minOutRaw: minOutputBaseUnits.toString(),
              outDecimals: buyToken.decimals,
            });
            try {
              const result = await swap.send({
                sellAmountBaseUnits,
                sellMint: sellToken.mint,
                buyMint: buyToken.mint,
                minOutputBaseUnits,
              });
              appendPayment(senderBase58, solanaConfig.cluster, {
                id: result.swapSignature,
                cluster: solanaConfig.cluster,
                sender: senderBase58,
                recipient: result.recipientAta,
                token: sell,
                mint: sellToken.mint.toBase58(),
                decimals: sellToken.decimals,
                amountRaw: sellAmountBaseUnits.toString(),
                netRaw: sellAmountBaseUnits.toString(),
                depositSignature: result.depositSignature,
                withdrawSignature:
                  result.settlementSignature ?? result.swapSignature,
                timestamp: Date.now(),
                source: "swap",
                swap: {
                  outputToken: buy,
                  outputMint: buyToken.mint.toBase58(),
                  outputDecimals: buyToken.decimals,
                  outAmountRaw: minOutputBaseUnits.toString(),
                  minOutRaw: minOutputBaseUnits.toString(),
                  swapSignature: result.swapSignature,
                  settlementSignature: result.settlementSignature,
                },
              });
            } catch {
              // surfaced via swap.error
            }
          }}
          noValidate
        >
          <div className="flex flex-col gap-2 rounded-2xl border border-border bg-background/40 p-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="sell-amount" className="text-muted-foreground">
                You sell
              </Label>
              <div
                className="inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-card/60 pl-2 pr-2.5 text-[13px] font-medium text-foreground"
                aria-label="Sell token (locked to SOL)"
                title="Swaps are SOL-input only today."
              >
                <TokenLogo id="SOL" className="size-5" />
                <span>SOL</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <TokenLogo id={sell} className="size-7" />
              <AmountInput
                id="sell-amount"
                placeholder="0.00"
                value={amount}
                onValueChange={setAmount}
                decimals={sellDecimals}
                onBlur={() => setAmountTouched(true)}
                invalid={showAmountError || overWalletBalance}
                aria-invalid={showAmountError || overWalletBalance || undefined}
                className="border-transparent bg-transparent! font-mono text-[18px] focus-within:border-transparent"
                trailingIcon={
                  amountValid && !overWalletBalance ? (
                    <HugeiconsIcon
                      icon={CheckmarkCircle01Icon}
                      size={14}
                      strokeWidth={2}
                      className="text-primary"
                    />
                  ) : showAmountError || overWalletBalance ? (
                    <HugeiconsIcon
                      icon={Alert02Icon}
                      size={14}
                      strokeWidth={2}
                      className="text-destructive"
                    />
                  ) : undefined
                }
              />
            </div>
            {showAmountError && (
              <p className="text-[11.5px] text-destructive">
                {amountErrorMessage(amountError!)}
              </p>
            )}
            {overWalletBalance && sellToken && (
              <p className="text-[11.5px] text-destructive">
                Wallet only has{" "}
                {formatBaseUnitsString(
                  sellWalletBalance.toString(),
                  sellToken.decimals,
                )}{" "}
                {sell}.
              </p>
            )}
            {wallet.connected && sellToken && (
              <p className="text-[11px] text-muted-foreground">
                Wallet:{" "}
                <span className="font-mono text-foreground/80">
                  {formatBaseUnitsString(
                    sellWalletBalance.toString(),
                    sellToken.decimals,
                  )}{" "}
                  {sell}
                </span>
              </p>
            )}
          </div>

          <div className="relative h-0">
            <div
              aria-hidden="true"
              className={cn(
                "absolute left-1/2 top-1/2 z-10 grid size-9 -translate-x-1/2 -translate-y-1/2 place-items-center",
                "rounded-full border border-border bg-card text-muted-foreground shadow-sm",
              )}
            >
              <HugeiconsIcon
                icon={ArrowDown01Icon}
                size={16}
                strokeWidth={2}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2 rounded-2xl border border-border bg-background/40 p-4">
            <div className="flex items-center justify-between">
              <Label className="text-muted-foreground">You receive</Label>
              <TokenSelector
                value={buy}
                options={buyOptions}
                onChange={handleSelectBuy}
                label="Buy token"
              />
            </div>
            <div className="flex items-center gap-3">
              <TokenLogo id={buy} className="size-7" />
              <div
                className={cn(
                  "flex h-11 flex-1 items-center font-mono text-[18px]",
                  buyDisplay ? "text-foreground" : "text-muted-foreground",
                )}
                aria-live="polite"
              >
                {status === "loading" ? (
                  <span className="text-muted-foreground/80">Quoting…</span>
                ) : buyDisplay ? (
                  buyDisplay
                ) : (
                  "0.00"
                )}
              </div>
            </div>
          </div>

          <div className="mt-2 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label className="text-muted-foreground">Slippage tolerance</Label>
              <span className="font-mono text-[11.5px] text-muted-foreground">
                {(slippageBps / 100).toFixed(slippageBps < 100 ? 2 : 1)}%
              </span>
            </div>
            <SlippageInput
              valueBps={slippageBps}
              onChangeBps={setSlippageBps}
            />
          </div>

          <div className="mt-2 flex flex-col gap-1.5">
            <FancyButton
              type="submit"
              variant="primary"
              size="lg"
              className="self-start"
              disabled={!canSubmit}
              aria-disabled={SWAP_DISABLED || undefined}
              title={
                SWAP_DISABLED
                  ? "Swap is paused while the relay settlement path is being stabilised."
                  : undefined
              }
            >
              {SWAP_DISABLED
                ? "Swap temporarily disabled"
                : submitButtonLabel(
                    swap.status,
                    wallet.connected,
                    status === "loading",
                  )}
              <HugeiconsIcon
                icon={ArrowRight01Icon}
                size={14}
                strokeWidth={2.2}
              />
            </FancyButton>
            <p className="text-[11.5px] text-muted-foreground">
              {SWAP_DISABLED
                ? "Quotes still update live. Submission is paused, relay-side settlement is being stabilised. Existing pending swaps can still be re-polled or refunded above."
                : "SOL → any Jupiter-supported token. Cloak deposits SOL into the shielded pool, runs the Jupiter swap inside the program, and sends the output directly to your wallet."}
            </p>
          </div>

          <SwapProgress
            show={submitting}
            percent={swap.uiPercent}
            message={swap.progress ?? phaseLabel(swap.status)}
          />

          {showTxStatus && (
            <SwapTxStatus
              openSwapStateTx={swap.openSwapStateTx}
              settlementTx={swap.settlementTx}
            />
          )}

          {swap.status === "error" && swap.error && (
            <InlineError err={swap.error} />
          )}

          {quoteError && (
            <p className="text-[12px] text-destructive">{quoteError.message}</p>
          )}
        </motion.form>
        )}

        <motion.aside
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, delay: 0.06, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col gap-4"
        >
          <div className="rounded-2xl border border-border bg-card/60 p-6">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              Quote
            </p>
            <dl className="mt-4 flex flex-col divide-y divide-border text-[13.5px]">
              <Row
                label="Rate"
                value={
                  quote
                    ? `1 ${buy} ≈ ${formatNumber(quote.price)} ${sell}`
                    : "-"
                }
              />
              <Row
                label="Fee"
                value={quote ? `${(quote.feeBps / 100).toFixed(2)}%` : "-"}
                hint={quote ? `${quote.feeBps} bps` : undefined}
              />
              <Row
                label="Price impact"
                value={quote ? `${quote.priceImpactPct.toFixed(2)}%` : "-"}
              />
              <Row
                label="Route"
                value={quote ? quote.route : "-"}
              />
              <Row
                label="Min received"
                value={
                  quote ? `${minOutputDisplay} ${buy}` : "-"
                }
                hint={`${(slippageBps / 100).toFixed(2)}% slippage`}
                emphasis
                accent
              />
            </dl>
            <p className="mt-3 text-[11.5px] text-muted-foreground">
              Indicative pricing. Live router lands with the swap circuit on{" "}
              {solanaConfig.cluster}.
            </p>
          </div>

          <ul className="flex flex-col gap-2 rounded-2xl border border-border bg-card/40 p-5">
            {[
              { Icon: ShieldIcon, text: "Quote and proof generated locally." },
              {
                Icon: VerifiedTickIcon,
                text: "Settles atomically in the shield-pool program.",
              },
            ].map((it, i) => (
              <motion.li
                key={it.text}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.16 + i * 0.05, duration: 0.25 }}
                className="flex items-start gap-2.5 text-[12.5px] leading-5 text-muted-foreground"
              >
                <it.Icon
                  size={14}
                  className="mt-0.5 text-primary"
                />
                <span>{it.text}</span>
              </motion.li>
            ))}
          </ul>
        </motion.aside>
        </div>
      </div>
    </>
  );
}

function PendingSwapsPanel({
  recovery,
}: {
  recovery: ReturnType<typeof useSwapRecovery>;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/5 p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-[13px] font-semibold text-amber-600 dark:text-amber-300">
            Unresolved swaps ({recovery.unresolved.length})
          </h2>
          <p className="text-[11.5px] text-muted-foreground">
            These deposits landed in the shielded pool but the swap or refund
            never finished. Re-poll the relay first; if it stayed failed, run
            a manual refund to pull SOL back to your wallet.
          </p>
        </div>
      </div>
      <ul className="flex flex-col gap-2">
        {recovery.unresolved.map((rec) => (
          <PendingSwapRow key={rec.id} record={rec} recovery={recovery} />
        ))}
      </ul>
    </section>
  );
}

function PendingSwapRow({
  record,
  recovery,
}: {
  record: PendingSwapRecord;
  recovery: ReturnType<typeof useSwapRecovery>;
}) {
  const isActiveAction = recovery.action.id === record.id;
  const isPolling =
    isActiveAction &&
    recovery.action.kind === "poll" &&
    recovery.action.status === "running";
  const isRefunding =
    isActiveAction &&
    recovery.action.kind === "refund" &&
    recovery.action.status === "running";
  const actionError =
    isActiveAction && recovery.action.status === "error"
      ? recovery.action.error
      : null;

  return (
    <li className="flex flex-col gap-2 rounded-xl border border-border bg-background/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col">
          <span className="text-[12.5px] font-medium text-foreground">
            {record.sellAmountRaw} of {shortMint(record.sellMint)} → {shortMint(record.buyMint)}
          </span>
          <span className="text-[11px] text-muted-foreground">
            Status: {record.status}
            {record.error ? ` · ${record.error}` : ""}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => recovery.poll(record).catch(() => {})}
            disabled={isPolling || !record.requestId}
            className="rounded-md border border-border bg-card/60 px-2.5 py-1 text-[11px] font-medium hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPolling ? "Polling…" : "Re-poll relay"}
          </button>
          <button
            type="button"
            onClick={() => recovery.refund(record).catch(() => {})}
            disabled={isRefunding}
            className="rounded-md border border-amber-500/60 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-700 hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50 dark:text-amber-300"
          >
            {isRefunding ? "Refunding…" : "Refund deposit"}
          </button>
          <button
            type="button"
            onClick={() => recovery.dismiss(record)}
            className="text-[11px] text-muted-foreground hover:text-foreground"
            title="Remove from this list"
          >
            Dismiss
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-3 text-[10.5px] text-muted-foreground">
        <span>
          Deposit:{" "}
          <a
            className="font-mono text-foreground/80 underline-offset-2 hover:underline"
            href={solscanTxUrl(record.depositSignature)}
            target="_blank"
            rel="noreferrer"
          >
            {shortSig(record.depositSignature)}
          </a>
        </span>
        {record.swapSignature && (
          <span>
            Swap:{" "}
            <a
              className="font-mono text-foreground/80 underline-offset-2 hover:underline"
              href={solscanTxUrl(record.swapSignature)}
              target="_blank"
              rel="noreferrer"
            >
              {shortSig(record.swapSignature)}
            </a>
          </span>
        )}
        {record.requestId && (
          <span>
            Request: <span className="font-mono">{record.requestId}</span>
          </span>
        )}
      </div>
      {actionError && (
        <p className="text-[11px] text-destructive">{actionError.message}</p>
      )}
    </li>
  );
}

function shortMint(mint: string): string {
  if (mint.length <= 10) return mint;
  return `${mint.slice(0, 4)}…${mint.slice(-4)}`;
}

function formatNumber(n: number) {
  if (!Number.isFinite(n)) return "-";
  if (n === 0) return "0";
  if (n >= 1) {
    return n.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    });
  }
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 4,
    maximumFractionDigits: 8,
  });
}

function Row({
  label,
  value,
  hint,
  emphasis,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  emphasis?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <dt className="flex items-center gap-2 text-muted-foreground">
        <span>{label}</span>
        {hint && (
          <span className="font-mono text-[11px] text-muted-foreground/70">
            {hint}
          </span>
        )}
      </dt>
      <dd
        className={cn(
          "font-mono",
          accent
            ? "font-medium text-yellow-600 dark:text-yellow-400"
            : emphasis
              ? "text-foreground"
              : "text-foreground/80",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function submitButtonLabel(
  status: ReturnType<typeof useSwap>["status"],
  connected: boolean,
  quoting: boolean,
): string {
  if (!connected) return "Connect wallet to swap";
  switch (status) {
    case "deposit-proof":
      return "Generating proof (1/2)…";
    case "deposit-submit":
      return "Shielding…";
    case "swap-proof":
      return "Generating proof (2/2)…";
    case "swap-submit":
      return "Opening swap state…";
    case "swap-settle":
      return "Waiting for settlement…";
    case "success":
      return "Swap another";
    default:
      return quoting ? "Quoting…" : "Swap privately";
  }
}

function phaseLabel(status: ReturnType<typeof useSwap>["status"]): string {
  switch (status) {
    case "deposit-proof":
      return "Generating deposit proof";
    case "deposit-submit":
      return "Shielding into pool";
    case "swap-proof":
      return "Generating swap proof";
    case "swap-submit":
      return "Opening swap state on-chain";
    case "swap-settle":
      return "Waiting for settlement (Tx2)";
    default:
      return "Working";
  }
}

function SwapProgress({
  show,
  percent,
  message,
}: {
  show: boolean;
  percent: number;
  message: string;
}) {
  const display = Math.round(Math.max(0, Math.min(100, percent)));
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.div
          key="swap-progress"
          initial={{ opacity: 0, y: -2 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -2 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="flex flex-col gap-1.5"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center justify-between gap-2 text-[11.5px] text-muted-foreground">
            <span className="min-w-0 flex-1 truncate">{message}</span>
            <span className="shrink-0 font-mono tabular-nums text-foreground/80">
              {display}%
            </span>
          </div>
          <ProgressPrimitive.Root value={display}>
            <ProgressTrack className="h-1.5 bg-secondary/70">
              <ProgressIndicator />
            </ProgressTrack>
          </ProgressPrimitive.Root>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function SwapTxStatus({
  openSwapStateTx,
  settlementTx,
}: {
  openSwapStateTx: SwapTxRecord;
  settlementTx: SwapTxRecord;
}) {
  return (
    <div className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border bg-background/40">
      <SwapTxRow
        index={1}
        label="Open swap state"
        hint="Verifies your private input on-chain"
        record={openSwapStateTx}
      />
      <SwapTxRow
        index={2}
        label="Settle"
        hint="Relay executes the trade and pays your ATA"
        record={settlementTx}
      />
    </div>
  );
}

function SwapTxRow({
  index,
  label,
  hint,
  record,
}: {
  index: number;
  label: string;
  hint: string;
  record: SwapTxRecord;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <span
          aria-hidden="true"
          className="grid size-5 shrink-0 place-items-center rounded-full border border-border bg-card/60 font-mono text-[10.5px] text-muted-foreground"
        >
          {index}
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="text-[12.5px] font-medium text-foreground">
            Tx{index} · {label}
          </span>
          <span className="truncate text-[11px] text-muted-foreground">
            {record.error ?? hint}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <SwapTxPill status={record.status} />
        {record.signature ? (
          <a
            href={solscanTxUrl(record.signature)}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 rounded-md border border-border bg-card/60 px-2 py-0.5 font-mono text-[11px] text-foreground transition-colors hover:bg-secondary"
          >
            <span>{shortSig(record.signature)}</span>
            <span aria-hidden="true">↗</span>
            <span className="sr-only">Open on Solscan</span>
          </a>
        ) : (
          <span className="font-mono text-[11px] text-muted-foreground">·</span>
        )}
      </div>
    </div>
  );
}

function SwapTxPill({ status }: { status: SwapTxRecord["status"] }) {
  const cls = cn(
    "inline-flex h-5 items-center gap-1 rounded-full border px-2 font-mono text-[10.5px] uppercase tracking-wide",
    status === "settled" &&
      "border-primary/30 bg-primary/10 text-primary",
    status === "submitted" &&
      "border-yellow-600/30 bg-yellow-600/10 text-yellow-700 dark:text-yellow-400",
    status === "failed" && "border-destructive/40 bg-destructive/10 text-destructive",
    status === "pending" &&
      "border-border bg-card/60 text-muted-foreground",
  );
  const dotCls = cn(
    "size-1.5 rounded-full",
    status === "settled" && "bg-primary",
    status === "submitted" && "bg-yellow-500 animate-pulse",
    status === "failed" && "bg-destructive",
    status === "pending" && "bg-muted-foreground/50",
  );
  const label =
    status === "settled"
      ? "Done"
      : status === "submitted"
        ? "In flight"
        : status === "failed"
          ? "Failed"
          : "Waiting";
  return (
    <span className={cls}>
      <span aria-hidden="true" className={dotCls} />
      <span>{label}</span>
    </span>
  );
}

function SwapSuccessCard({
  sellToken,
  buyToken,
  sellAmountRaw,
  sellDecimals,
  minOutRaw,
  outDecimals,
  recipientAta,
  depositSignature,
  swapSignature,
  settlementSignature,
  onSwapAnother,
}: {
  sellToken: ShieldTokenId;
  buyToken: ShieldTokenId;
  sellAmountRaw: string;
  sellDecimals: number;
  minOutRaw: string;
  outDecimals: number;
  recipientAta: string | null;
  depositSignature: string | null;
  swapSignature: string | null;
  settlementSignature: string | null;
  onSwapAnother: () => void;
}) {
  const sellDisplay = formatBaseUnitsString(sellAmountRaw, sellDecimals);
  const minOutDisplay = formatBaseUnitsString(minOutRaw, outDecimals);
  const settled = settlementSignature !== null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col gap-6 rounded-2xl border border-border bg-card/60 p-6 sm:p-8"
    >
      <div className="flex items-start gap-3">
        <motion.span
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{
            duration: 0.32,
            ease: [0.22, 1, 0.36, 1],
            delay: 0.05,
          }}
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary"
          aria-hidden="true"
        >
          <HugeiconsIcon
            icon={CheckmarkCircle01Icon}
            size={18}
            strokeWidth={2.2}
          />
        </motion.span>
        <div className="flex flex-col">
          <h2 className="text-[18px] font-medium tracking-tight text-foreground">
            {settled ? "Swap settled" : "Swap submitted"}
          </h2>
          <p className="mt-1 text-[13px] leading-5 text-muted-foreground">
            You sold{" "}
            <span className="font-medium text-foreground">
              {sellDisplay} {sellToken}
            </span>{" "}
            for at least{" "}
            <span className="font-medium text-yellow-600 dark:text-yellow-400">
              {minOutDisplay} {buyToken}
            </span>
            . The chain shows a generic shield-pool tx, not your trade.
          </p>
          {recipientAta && (
            <p className="mt-1 font-mono text-[11.5px] text-muted-foreground">
              to ATA {shortSig(recipientAta)}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border bg-background/40">
        <SwapSuccessTxRow
          label="Shield tx"
          hint="Your deposit into the pool"
          signature={depositSignature}
        />
        <SwapSuccessTxRow
          label="Open swap state"
          hint="Tx1 verifies your private input"
          signature={swapSignature}
        />
        <SwapSuccessTxRow
          label="Settlement"
          hint={
            settled
              ? "Tx2 trade landed and paid your ATA"
              : "Tx2 pending, relay still settling"
          }
          signature={settlementSignature}
          pending={!settled}
        />
      </div>

      <FancyButton
        type="button"
        variant="primary"
        size="lg"
        className="self-start"
        onClick={onSwapAnother}
      >
        Swap another
        <HugeiconsIcon icon={ArrowRight01Icon} size={14} strokeWidth={2.2} />
      </FancyButton>
    </motion.div>
  );
}

function SwapSuccessTxRow({
  label,
  hint,
  signature,
  pending,
}: {
  label: string;
  hint: string;
  signature: string | null;
  pending?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="flex flex-col">
        <span className="text-[12.5px] font-medium text-foreground">
          {label}
        </span>
        <span className="text-[11px] text-muted-foreground">{hint}</span>
      </div>
      {signature ? (
        <a
          href={solscanTxUrl(signature)}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 rounded-lg border border-border bg-card/60 px-2.5 py-1 font-mono text-[11.5px] text-foreground transition-colors hover:bg-secondary"
        >
          <span>{shortSig(signature)}</span>
          <span aria-hidden="true">↗</span>
          <span className="sr-only">Open on Solscan</span>
        </a>
      ) : (
        <span className="font-mono text-[11.5px] text-muted-foreground">
          {pending ? "pending" : "·"}
        </span>
      )}
    </div>
  );
}

function shortSig(sig: string): string {
  if (sig.length <= 10) return sig;
  return `${sig.slice(0, 4)}…${sig.slice(-4)}`;
}
