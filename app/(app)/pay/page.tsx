"use client";

import {
  Alert02Icon,
  ArrowRight01Icon,
  CheckmarkCircle01Icon,
  Coins01Icon,
  LockIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { isAddress } from "@solana/kit";
import { AnimatePresence, motion } from "motion/react";
import * as React from "react";

import { PageHeader } from "@/components/app-shell/page-header";
import { SolanaLogo, UsdcLogo, UsdtLogo } from "@/components/logos";
import { FancyButton } from "@/components/ui/fancy-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const TOKENS = [
  { id: "SOL", label: "SOL", Logo: SolanaLogo, decimals: 9, min: 0.01 },
  { id: "USDC", label: "USDC", Logo: UsdcLogo, decimals: 6, min: 0 },
  { id: "USDT", label: "USDT", Logo: UsdtLogo, decimals: 6, min: 0 },
] as const;

type TokenId = (typeof TOKENS)[number]["id"];

type AmountError =
  | { kind: "format" }
  | { kind: "non-positive" }
  | { kind: "decimals"; max: number }
  | { kind: "below-min"; min: number; token: TokenId };

type AddressError = { kind: "format" } | { kind: "length" };

function validateAmount(raw: string, token: TokenId): AmountError | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (!/^\d*\.?\d*$/.test(trimmed) || trimmed === ".") {
    return { kind: "format" };
  }

  const n = Number(trimmed);
  if (!Number.isFinite(n) || n <= 0) return { kind: "non-positive" };

  const dot = trimmed.indexOf(".");
  const decimals = dot === -1 ? 0 : trimmed.length - dot - 1;
  const tokenMeta = TOKENS.find((t) => t.id === token)!;
  if (decimals > tokenMeta.decimals) {
    return { kind: "decimals", max: tokenMeta.decimals };
  }

  if (tokenMeta.min > 0 && n < tokenMeta.min) {
    return { kind: "below-min", min: tokenMeta.min, token };
  }

  return null;
}

function validateAddress(raw: string): AddressError | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed.length < 32 || trimmed.length > 44) {
    return { kind: "length" };
  }

  if (!isAddress(trimmed)) return { kind: "format" };
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
    case "below-min":
      return `Minimum is ${err.min} ${err.token}.`;
  }
}

function addressErrorMessage(err: AddressError) {
  switch (err.kind) {
    case "length":
      return "A Solana address is 32 to 44 characters.";
    case "format":
      return "Not a valid Solana address.";
  }
}

export default function PayPage() {
  const [token, setToken] = React.useState<TokenId>("USDC");
  const [amount, setAmount] = React.useState("");
  const [recipient, setRecipient] = React.useState("");
  const [amountTouched, setAmountTouched] = React.useState(false);
  const [recipientTouched, setRecipientTouched] = React.useState(false);

  const amountError = React.useMemo(
    () => validateAmount(amount, token),
    [amount, token],
  );
  const addressError = React.useMemo(
    () => validateAddress(recipient),
    [recipient],
  );

  const showAmountError = amountTouched && !!amountError;
  const showAddressError = recipientTouched && !!addressError;

  const amountValid = !amountError && amount.trim() !== "";
  const addressValid = !addressError && recipient.trim() !== "";
  const canSubmit = amountValid && addressValid;

  const numericAmount = amountValid ? Number(amount) : 0;
  const variableFee = numericAmount * 0.003;
  const total = numericAmount + variableFee;

  return (
    <>
      <PageHeader
        eyebrow="Single payment"
        title="Pay one recipient, privately."
        description="The transaction is shielded with a Groth16 proof generated in your browser. The chain never sees the recipient or the amount."
      />

      <div className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-10 sm:px-8 lg:grid-cols-[1.4fr_1fr]">
        <motion.form
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col gap-6 rounded-2xl border border-border bg-card/60 p-6 sm:p-8"
          onSubmit={(e) => {
            e.preventDefault();
            setAmountTouched(true);
            setRecipientTouched(true);
          }}
          noValidate
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="recipient">Recipient address</Label>
            <Input
              id="recipient"
              placeholder="Solana wallet address"
              autoComplete="off"
              spellCheck={false}
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              onBlur={() => setRecipientTouched(true)}
              invalid={showAddressError}
              aria-invalid={showAddressError || undefined}
              aria-describedby={
                showAddressError ? "recipient-error" : "recipient-hint"
              }
              className="font-mono text-[13px]"
              trailingIcon={
                addressValid ? (
                  <HugeiconsIcon
                    icon={CheckmarkCircle01Icon}
                    size={14}
                    strokeWidth={2}
                    className="text-primary"
                  />
                ) : showAddressError ? (
                  <HugeiconsIcon
                    icon={Alert02Icon}
                    size={14}
                    strokeWidth={2}
                    className="text-destructive"
                  />
                ) : undefined
              }
            />
            <FieldFootnote
              id="recipient"
              hint="Address is hashed into the proof. It is never written on-chain."
              error={showAddressError ? addressErrorMessage(addressError!) : null}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="amount">Amount</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="amount"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                onBlur={() => setAmountTouched(true)}
                invalid={showAmountError}
                aria-invalid={showAmountError || undefined}
                aria-describedby={showAmountError ? "amount-error" : undefined}
                className="font-mono sm:flex-1"
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
              <div className="flex items-center gap-1.5 rounded-xl border border-border bg-background/50 p-1">
                {TOKENS.map((t) => {
                  const isActive = token === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setToken(t.id)}
                      className={cn(
                        "relative flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium transition-colors",
                        isActive
                          ? "text-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {isActive && (
                        <motion.span
                          layoutId="pay-token-active"
                          aria-hidden="true"
                          className="absolute inset-0 -z-0 rounded-lg bg-secondary"
                          transition={{
                            type: "spring",
                            stiffness: 380,
                            damping: 30,
                          }}
                        />
                      )}
                      <span className="relative z-10 flex items-center gap-1.5">
                        <t.Logo className="size-3.5" />
                        {t.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            <FieldFootnote
              id="amount"
              error={showAmountError ? amountErrorMessage(amountError!) : null}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="memo" hint="Optional, encrypted">
              Memo
            </Label>
            <Input id="memo" placeholder="e.g. invoice #2026-04" />
          </div>

          <FancyButton
            type="submit"
            variant="primary"
            size="lg"
            className="self-start"
            disabled={!canSubmit}
          >
            Send privately
            <HugeiconsIcon
              icon={ArrowRight01Icon}
              size={14}
              strokeWidth={2.2}
            />
          </FancyButton>
        </motion.form>

        <motion.aside
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, delay: 0.06, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col gap-4"
        >
          <div className="rounded-2xl border border-border bg-card/60 p-6">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              Summary
            </p>

            <dl className="mt-4 flex flex-col divide-y divide-border text-[13.5px]">
              <Row
                label="Amount"
                value={`${formatAmount(numericAmount)} ${token}`}
              />
              <Row label="Fixed fee" value="0.005 SOL" />
              <Row
                label="Variable fee"
                value={`${formatAmount(variableFee)} ${token}`}
                hint="0.30%"
              />
              <Row
                label="Total"
                value={`${formatAmount(total)} ${token}`}
                emphasis
              />
            </dl>
          </div>

          <ul className="flex flex-col gap-2 rounded-2xl border border-border bg-card/40 p-5">
            {[
              { icon: LockIcon, text: "Proof generated locally in your browser." },
              {
                icon: CheckmarkCircle01Icon,
                text: "Verified on-chain by the Cloak shield-pool program.",
              },
              {
                icon: Coins01Icon,
                text: "Settles in a single Solana transaction.",
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

function FieldFootnote({
  id,
  hint,
  error,
}: {
  id: string;
  hint?: string;
  error: string | null;
}) {
  return (
    <div className="relative min-h-[16px]">
      <AnimatePresence mode="wait" initial={false}>
        {error ? (
          <motion.p
            key="error"
            id={`${id}-error`}
            role="alert"
            initial={{ opacity: 0, y: -2 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -2 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            className="text-[11.5px] text-destructive"
          >
            {error}
          </motion.p>
        ) : hint ? (
          <motion.p
            key="hint"
            id={`${id}-hint`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="text-[11.5px] text-muted-foreground"
          >
            {hint}
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  );
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

function formatAmount(n: number) {
  if (!Number.isFinite(n) || n === 0) return "0.00";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
}
