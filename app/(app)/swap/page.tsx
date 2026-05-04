"use client";

import {
  Alert02Icon,
  ArrowDataTransferVerticalIcon,
  ArrowRight01Icon,
  CheckmarkCircle01Icon,
  LockIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useWallet } from "@solana/wallet-adapter-react";
import { motion } from "motion/react";
import * as React from "react";

import { PageHeader } from "@/components/app-shell/page-header";
import { TokenLogo, TokenSelector } from "@/components/cloak/token-selector";
import { FancyButton } from "@/components/ui/fancy-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getShieldToken,
  listShieldTokens,
  type ShieldTokenId,
} from "@/lib/cloak/tokens";
import {
  formatBaseUnits,
  useSwapQuote,
} from "@/lib/cloak/use-swap-quote";
import { solanaConfig } from "@/lib/solana/config";
import { cn } from "@/lib/utils";

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
  const defaultPair = React.useMemo<{ sell: ShieldTokenId; buy: ShieldTokenId }>(
    () => pickDefaultPair(tokens.map((t) => t.id)),
    [tokens],
  );

  const [sell, setSell] = React.useState<ShieldTokenId>(defaultPair.sell);
  const [buy, setBuy] = React.useState<ShieldTokenId>(defaultPair.buy);
  const [amount, setAmount] = React.useState("");
  const [amountTouched, setAmountTouched] = React.useState(false);

  const wallet = useWallet();
  const sellToken = React.useMemo(() => getShieldToken(sell), [sell]);
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

  function handleSwitchDirection() {
    setSell(buy);
    setBuy(sell);
    setAmount("");
    setAmountTouched(false);
  }

  function handleSelectSell(next: ShieldTokenId) {
    if (next === buy) {
      setBuy(sell);
    }
    setSell(next);
  }

  function handleSelectBuy(next: ShieldTokenId) {
    if (next === sell) {
      setSell(buy);
    }
    setBuy(next);
  }

  const buyDisplay =
    quote && status === "ready"
      ? formatBaseUnits(quote.outAmountBaseUnits, quote.outDecimals)
      : "";

  const canSubmit = false; // Wired in once private-swap path lands.

  return (
    <>
      <PageHeader
        eyebrow="Private swap"
        title="Trade tokens, privately."
        description="Swap inside the Cloak shielded pool. The chain sees a generic pool tx, not your tokens or amounts."
      />

      <div className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-10 sm:px-8 lg:grid-cols-[1.4fr_1fr]">
        <motion.form
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col gap-3 rounded-2xl border border-border bg-card/60 p-6 sm:p-8"
          onSubmit={(e) => {
            e.preventDefault();
            setAmountTouched(true);
          }}
          noValidate
        >
          <div className="flex flex-col gap-2 rounded-2xl border border-border bg-background/40 p-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="sell-amount" className="text-muted-foreground">
                You sell
              </Label>
              <TokenSelector
                value={sell}
                options={tokens}
                disabledIds={[buy]}
                onChange={handleSelectSell}
                label="Sell token"
              />
            </div>
            <div className="flex items-center gap-3">
              <TokenLogo id={sell} className="size-7" />
              <Input
                id="sell-amount"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                onBlur={() => setAmountTouched(true)}
                invalid={showAmountError}
                aria-invalid={showAmountError || undefined}
                className="border-transparent bg-transparent! font-mono text-[18px] focus-within:border-transparent"
                trailingIcon={
                  amountValid ? (
                    <HugeiconsIcon
                      icon={CheckmarkCircle01Icon}
                      size={14}
                      strokeWidth={2}
                      className="text-primary"
                    />
                  ) : showAmountError ? (
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
          </div>

          <div className="relative h-0">
            <button
              type="button"
              onClick={handleSwitchDirection}
              aria-label="Switch direction"
              className={cn(
                "absolute left-1/2 top-1/2 z-10 grid size-9 -translate-x-1/2 -translate-y-1/2 place-items-center",
                "rounded-full border border-border bg-card text-foreground shadow-sm",
                "transition-colors hover:bg-secondary",
              )}
            >
              <HugeiconsIcon
                icon={ArrowDataTransferVerticalIcon}
                size={16}
                strokeWidth={2}
              />
            </button>
          </div>

          <div className="flex flex-col gap-2 rounded-2xl border border-border bg-background/40 p-4">
            <div className="flex items-center justify-between">
              <Label className="text-muted-foreground">You receive</Label>
              <TokenSelector
                value={buy}
                options={tokens}
                disabledIds={[sell]}
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

          <FancyButton
            type="submit"
            variant="primary"
            size="lg"
            className="mt-2 self-start"
            disabled={!canSubmit}
          >
            {wallet.connected ? "Coming soon" : "Connect wallet"}
            <HugeiconsIcon icon={ArrowRight01Icon} size={14} strokeWidth={2.2} />
          </FancyButton>

          {quoteError && (
            <p className="text-[12px] text-destructive">{quoteError.message}</p>
          )}
        </motion.form>

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
                    : "—"
                }
              />
              <Row
                label="Fee"
                value={quote ? `${(quote.feeBps / 100).toFixed(2)}%` : "—"}
                hint={quote ? `${quote.feeBps} bps` : undefined}
              />
              <Row
                label="Price impact"
                value={quote ? `${quote.priceImpactPct.toFixed(2)}%` : "—"}
              />
              <Row
                label="Route"
                value={quote ? quote.route : "—"}
                emphasis
              />
            </dl>
            <p className="mt-3 text-[11.5px] text-muted-foreground">
              Indicative pricing. Live router lands with the swap circuit on{" "}
              {solanaConfig.cluster}.
            </p>
          </div>

          <ul className="flex flex-col gap-2 rounded-2xl border border-border bg-card/40 p-5">
            {[
              { icon: LockIcon, text: "Quote and proof generated locally." },
              {
                icon: CheckmarkCircle01Icon,
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
                <HugeiconsIcon
                  icon={it.icon}
                  size={14}
                  strokeWidth={1.8}
                  className="mt-0.5 text-primary"
                />
                <span>{it.text}</span>
              </motion.li>
            ))}
          </ul>
        </motion.aside>
      </div>
    </>
  );
}

function pickDefaultPair(ids: ShieldTokenId[]): {
  sell: ShieldTokenId;
  buy: ShieldTokenId;
} {
  const fallback: ShieldTokenId = ids[0] ?? "SOL";
  const sell = ids.includes("USDC") ? "USDC" : fallback;
  const buy = ids.find((i) => i !== sell) ?? fallback;
  return { sell, buy };
}

function formatNumber(n: number) {
  if (!Number.isFinite(n)) return "—";
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
}: {
  label: string;
  value: string;
  hint?: string;
  emphasis?: boolean;
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
          emphasis ? "text-foreground" : "text-foreground/80",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
