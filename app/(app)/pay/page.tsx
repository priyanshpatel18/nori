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
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { AnimatePresence, motion } from "motion/react";
import * as React from "react";

import { PageHeader } from "@/components/app-shell/page-header";
import { SolanaLogo, UsdcLogo, UsdtLogo } from "@/components/logos";
import { FancyButton } from "@/components/ui/fancy-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ProgressIndicator,
  ProgressTrack,
} from "@/components/ui/progress";
import { Progress as ProgressPrimitive } from "@base-ui/react/progress";
import {
  getShieldToken,
  isShieldTokenSupported,
  toBaseUnits,
  type ShieldTokenId,
} from "@/lib/cloak/tokens";
import { appendPayment } from "@/lib/cloak/payment-history";
import { useFastSend } from "@/lib/cloak/use-fast-send";
import { solanaConfig } from "@/lib/solana/config";
import { solscanTxUrl } from "@/lib/solana/explorer";
import { cn } from "@/lib/utils";

const TOKENS = [
  { id: "SOL", label: "SOL", Logo: SolanaLogo, decimals: 9, min: 0.01 },
  { id: "USDC", label: "USDC", Logo: UsdcLogo, decimals: 6, min: 0.01 },
  { id: "USDT", label: "USDT", Logo: UsdtLogo, decimals: 6, min: 0.01 },
] as const;

type TokenId = (typeof TOKENS)[number]["id"] & ShieldTokenId;

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

  const wallet = useWallet();
  const fastSend = useFastSend();

  const [lastSend, setLastSend] = React.useState<{
    amount: number;
    net: number;
    token: TokenId;
    recipient: string;
  } | null>(null);

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
  const shieldToken = React.useMemo(() => getShieldToken(token), [token]);
  const tokenSupported = isShieldTokenSupported(token);
  const submitting =
    fastSend.status === "deposit-proof" ||
    fastSend.status === "deposit-submit" ||
    fastSend.status === "withdraw-proof" ||
    fastSend.status === "withdraw-submit";
  const canSubmit =
    amountValid &&
    addressValid &&
    tokenSupported &&
    wallet.connected &&
    !submitting;

  const numericAmount = amountValid ? Number(amount) : 0;
  const variableFee = numericAmount * 0.003;
  const recipientReceives =
    numericAmount > 0
      ? Math.max(
          0,
          numericAmount - variableFee - (token === "SOL" ? 0.005 : 0),
        )
      : 0;
  const recipientHint: React.ReactNode =
    numericAmount > 0 && recipientReceives > 0 ? (
      <>
        Recipient gets{" "}
        <span className="font-medium text-yellow-600 dark:text-yellow-400">
          ~{formatAmount(recipientReceives)} {token}
        </span>
      </>
    ) : undefined;

  return (
    <>
      <PageHeader
        eyebrow="Single payment"
        title="Pay one recipient, privately."
        description="The transaction is shielded with a Groth16 proof generated in your browser. The chain never sees the recipient or the amount."
      />

      <div className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-10 sm:px-8 lg:grid-cols-[1.4fr_1fr]">
        {fastSend.status === "success" && lastSend ? (
          <SuccessCard
            net={lastSend.net}
            token={lastSend.token}
            recipient={lastSend.recipient}
            depositSignature={fastSend.depositSignature}
            withdrawSignature={fastSend.withdrawSignature}
            onSendAnother={() => {
              fastSend.reset();
              setLastSend(null);
              setAmount("");
              setRecipient("");
              setAmountTouched(false);
              setRecipientTouched(false);
            }}
          />
        ) : (
        <motion.form
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col gap-6 rounded-2xl border border-border bg-card/60 p-6 sm:p-8"
          onSubmit={async (e) => {
            e.preventDefault();
            setAmountTouched(true);
            setRecipientTouched(true);
            if (!amountValid || !addressValid) return;
            if (!shieldToken) return;
            if (!wallet.connected) return;
            setLastSend({
              amount: numericAmount,
              net: recipientReceives,
              token,
              recipient: recipient.trim(),
            });
            try {
              const amountBaseUnits = toBaseUnits(
                amount,
                shieldToken.decimals,
              );
              const recipientPubkey = new PublicKey(recipient.trim());
              const result = await fastSend.send({
                amountBaseUnits,
                mint: shieldToken.mint,
                recipient: recipientPubkey,
              });
              if (wallet.publicKey) {
                appendPayment(wallet.publicKey.toBase58(), solanaConfig.cluster, {
                  id: result.depositSignature,
                  cluster: solanaConfig.cluster,
                  sender: wallet.publicKey.toBase58(),
                  recipient: recipientPubkey.toBase58(),
                  token,
                  mint: shieldToken.mint.toBase58(),
                  decimals: shieldToken.decimals,
                  amountRaw: amountBaseUnits.toString(),
                  netRaw: netBaseUnits(amountBaseUnits, token === "SOL").toString(),
                  depositSignature: result.depositSignature,
                  withdrawSignature: result.withdrawSignature,
                  timestamp: Date.now(),
                });
              }
            } catch {
              // surfaced via fastSend.error
            }
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
              hint={recipientHint}
              error={showAmountError ? amountErrorMessage(amountError!) : null}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="memo" hint="Optional, encrypted">
              Memo
            </Label>
            <Input id="memo" placeholder="e.g. invoice #2026-04" />
          </div>

          <div className="flex flex-col gap-3">
            <FancyButton
              type="submit"
              variant="primary"
              size="lg"
              className="self-start"
              disabled={!canSubmit}
            >
              {submitButtonLabel(fastSend.status, wallet.connected)}
              <HugeiconsIcon
                icon={ArrowRight01Icon}
                size={14}
                strokeWidth={2.2}
              />
            </FancyButton>

            {!tokenSupported && (
              <p className="text-[12px] text-muted-foreground">
                {token} is not available on {solanaConfig.cluster}.
              </p>
            )}

            <TransactionProgress
              show={submitting}
              percent={fastSend.uiPercent}
              message={fastSend.progress ?? phaseLabel(fastSend.status)}
            />

            {fastSend.status === "error" && fastSend.error && (
              <p className="text-[12px] text-destructive">
                {fastSend.error.message}
              </p>
            )}
          </div>
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
              Summary
            </p>

            <dl className="mt-4 flex flex-col divide-y divide-border text-[13.5px]">
              <Row
                label="You send"
                value={`${formatAmount(numericAmount)} ${token}`}
              />
              <Row
                label="Variable fee"
                value={`${formatAmount(variableFee)} ${token}`}
                hint="0.30%"
              />
              <Row label="Network fee" value="0.005 SOL" />
              <Row
                label="Recipient gets"
                value={`${formatAmount(recipientReceives)} ${token}`}
                emphasis
                accent
              />
            </dl>
            {token !== "SOL" && (
              <p className="mt-3 text-[11.5px] text-muted-foreground">
                Network fee is paid separately from your SOL balance.
              </p>
            )}
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
  hint?: React.ReactNode;
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

function SuccessCard({
  net,
  token,
  recipient,
  depositSignature,
  withdrawSignature,
  onSendAnother,
}: {
  net: number;
  token: TokenId;
  recipient: string;
  depositSignature: string | null;
  withdrawSignature: string | null;
  onSendAnother: () => void;
}) {
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
            Sent privately
          </h2>
          <p className="mt-1 text-[13px] leading-5 text-muted-foreground">
            Recipient received{" "}
            <span className="font-medium text-yellow-600 dark:text-yellow-400">
              {formatAmount(net)} {token}
            </span>
            . The chain shows the payment from the Cloak shield-pool, not your
            wallet.
          </p>
          <p className="mt-1 font-mono text-[11.5px] text-muted-foreground">
            to {shortAddress(recipient)}
          </p>
        </div>
      </div>

      <div className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border bg-background/40">
        <SuccessTxRow
          label="Shield tx"
          hint="Your deposit into the pool"
          signature={depositSignature}
        />
        <SuccessTxRow
          label="Payout tx"
          hint="What the recipient sees"
          signature={withdrawSignature}
        />
      </div>

      <FancyButton
        type="button"
        variant="primary"
        size="lg"
        className="self-start"
        onClick={onSendAnother}
      >
        Send another
        <HugeiconsIcon icon={ArrowRight01Icon} size={14} strokeWidth={2.2} />
      </FancyButton>
    </motion.div>
  );
}

function SuccessTxRow({
  label,
  hint,
  signature,
}: {
  label: string;
  hint: string;
  signature: string | null;
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
        <span className="font-mono text-[11.5px] text-muted-foreground">—</span>
      )}
    </div>
  );
}

function netBaseUnits(amount: bigint, tokenIsSol: boolean): bigint {
  const variable = (amount * 3n) / 1000n;
  const fixed = tokenIsSol ? 5_000_000n : 0n;
  const net = amount - variable - fixed;
  return net < 0n ? 0n : net;
}

function shortSig(sig: string): string {
  if (sig.length <= 10) return sig;
  return `${sig.slice(0, 4)}…${sig.slice(-4)}`;
}

function shortAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-6)}`;
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

function formatAmount(n: number) {
  if (!Number.isFinite(n) || n === 0) return "0.00";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
}

function TransactionProgress({
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
          key="tx-progress"
          initial={{ opacity: 0, y: -2 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -2 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="flex flex-col gap-1.5"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center justify-between text-[11.5px] text-muted-foreground">
            <span className="truncate pr-2">{message}</span>
            <span className="font-mono tabular-nums text-foreground/80">
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

function submitButtonLabel(
  status: ReturnType<typeof useFastSend>["status"],
  connected: boolean,
): string {
  if (!connected) return "Connect wallet to send";
  switch (status) {
    case "deposit-proof":
      return "Generating proof (1/2)…";
    case "deposit-submit":
      return "Shielding…";
    case "withdraw-proof":
      return "Generating proof (2/2)…";
    case "withdraw-submit":
      return "Paying recipient…";
    case "success":
      return "Send another";
    default:
      return "Send privately";
  }
}

function phaseLabel(status: ReturnType<typeof useFastSend>["status"]): string {
  switch (status) {
    case "deposit-proof":
      return "Generating deposit proof";
    case "deposit-submit":
      return "Shielding into pool";
    case "withdraw-proof":
      return "Generating withdraw proof";
    case "withdraw-submit":
      return "Paying recipient";
    default:
      return "Working";
  }
}
