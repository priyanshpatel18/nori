"use client";

import {
  Alert02Icon,
  ArrowRight01Icon,
  CheckmarkCircle01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { isAddress } from "@solana/kit";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { AnimatePresence, motion } from "motion/react";
import * as React from "react";

import {
  RightArrowIcon,
  ShieldIcon,
  VerifiedTickIcon,
} from "@/components/Icons";
import { PageHeader } from "@/components/app-shell/page-header";
import { SolanaLogo, UsdcLogo, UsdtLogo } from "@/components/logos";
import { FancyButton } from "@/components/ui/fancy-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ProgressIndicator,
  ProgressTrack,
} from "@/components/ui/progress";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { Progress as ProgressPrimitive } from "@base-ui/react/progress";
import {
  getShieldToken,
  isShieldTokenSupported,
  toBaseUnits,
  type ShieldTokenId,
} from "@/lib/cloak/tokens";
import { appendPayment } from "@/lib/cloak/payment-history";
import { checkPreflightBalance } from "@/lib/cloak/preflight";
import { signalTourAction } from "@/lib/cloak/tour";
import { useFastSend } from "@/lib/cloak/use-fast-send";
import { solanaConfig } from "@/lib/solana/config";
import { solscanTxUrl } from "@/lib/solana/explorer";
import { AmountInput } from "@/components/cloak/amount-input";
import { InlineError } from "@/components/cloak/inline-error";
import { useWalletBalances } from "@/lib/cloak/use-wallet-balances";
import { toast, toastCloakError } from "@/lib/toast";
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
  const walletBalances = useWalletBalances();
  const isMobile = useIsMobile();
  const [confirmOpen, setConfirmOpen] = React.useState(false);

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
  const walletTokenBalance = walletBalances.balances[token] ?? 0n;
  const amountBaseUnits =
    amountValid && shieldToken
      ? toBaseUnits(amount, shieldToken.decimals)
      : 0n;
  const overWalletBalance =
    amountValid && wallet.connected && amountBaseUnits > walletTokenBalance;
  const canSubmit =
    amountValid &&
    addressValid &&
    tokenSupported &&
    wallet.connected &&
    !overWalletBalance &&
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
        <span className="font-medium text-primary">
          ~{formatAmount(recipientReceives)} {token}
        </span>
      </>
    ) : undefined;

  const runSend = React.useCallback(async () => {
    if (!shieldToken || !wallet.connected) return;
    const amountBaseUnits = toBaseUnits(amount, shieldToken.decimals);
    const preflight = checkPreflightBalance({
      amountBaseUnits,
      decimals: shieldToken.decimals,
      symbol: token,
      tokenId: token,
      walletBalances: walletBalances.balances,
    });
    if (!preflight.ok) {
      toast.error(preflight.reason, { description: preflight.description });
      return;
    }
    setLastSend({
      amount: numericAmount,
      net: recipientReceives,
      token,
      recipient: recipient.trim(),
    });
    const toastId = toast.loading("Sending privately", {
      description: `${numericAmount} ${token}`,
    });
    try {
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
          source: "pay",
        });
      }
      toast.success("Payment sent privately", {
        id: toastId,
        description: `${recipientReceives} ${token} delivered`,
        action: {
          label: "View",
          onClick: () =>
            window.open(
              solscanTxUrl(result.withdrawSignature),
              "_blank",
              "noopener,noreferrer",
            ),
        },
      });
      if (wallet.publicKey) {
        signalTourAction(wallet.publicKey.toBase58(), "pay-sent");
      }
    } catch (err) {
      toastCloakError(toastId, err);
    }
  }, [
    shieldToken,
    wallet,
    amount,
    recipient,
    token,
    numericAmount,
    recipientReceives,
    fastSend,
    walletBalances,
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Single payment"
        title="Pay one recipient, privately."
        description="The transaction is shielded with a Groth16 proof generated in your browser. The chain never sees the recipient or the amount."
      />

      <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8 sm:px-6 sm:py-10 md:px-8 lg:grid-cols-[1.4fr_1fr]">
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
          data-tour="pay-form"
          className="flex min-w-0 flex-col gap-6 rounded-[8px] border border-border bg-card/60 p-4 sm:p-5 md:p-6"
          onSubmit={(e) => {
            e.preventDefault();
            setAmountTouched(true);
            setRecipientTouched(true);
            if (!amountValid || !addressValid) return;
            if (!shieldToken) return;
            if (!wallet.connected) return;
            if (isMobile) {
              setConfirmOpen(true);
            } else {
              void runSend();
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
              <AmountInput
                id="amount"
                placeholder="0.00"
                value={amount}
                onValueChange={setAmount}
                decimals={shieldToken?.decimals}
                onBlur={() => setAmountTouched(true)}
                invalid={showAmountError || overWalletBalance}
                aria-invalid={showAmountError || overWalletBalance || undefined}
                aria-describedby={showAmountError ? "amount-error" : undefined}
                className="font-mono sm:flex-1"
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
              <div className="flex items-center gap-0.5 rounded-md border border-border bg-background/60 p-0.5">
                {TOKENS.filter((t) => isShieldTokenSupported(t.id)).map((t) => {
                  const isActive = token === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setToken(t.id)}
                      className={cn(
                        "relative flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-[12px] font-medium transition-colors",
                        isActive
                          ? "text-foreground"
                          : "text-foreground/55 hover:text-foreground",
                      )}
                    >
                      {isActive && (
                        <motion.span
                          layoutId="pay-token-active"
                          aria-hidden="true"
                          className="absolute inset-0 -z-0 rounded-sm bg-secondary/80"
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
              error={
                overWalletBalance && shieldToken
                  ? `Wallet only has ${formatBalance(walletTokenBalance, shieldToken.decimals)} ${token}.`
                  : showAmountError
                    ? amountErrorMessage(amountError!)
                    : null
              }
            />
            {wallet.connected && shieldToken && (
              <p className="text-[11.5px] text-foreground/55">
                Wallet:{" "}
                <span className="font-mono text-foreground/85">
                  {formatBalance(walletTokenBalance, shieldToken.decimals)} {token}
                </span>
              </p>
            )}
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
              <p className="text-[12px] text-foreground/55">
                {token} is not available on {solanaConfig.cluster}.
              </p>
            )}

            <TransactionProgress
              show={submitting}
              percent={fastSend.uiPercent}
              message={fastSend.progress ?? phaseLabel(fastSend.status)}
            />

            {fastSend.status === "error" && fastSend.error && (
              <InlineError err={fastSend.error} />
            )}
          </div>
        </motion.form>
        )}

        <motion.aside
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, delay: 0.06, ease: [0.22, 1, 0.36, 1] }}
          className="hidden flex-col gap-4 md:flex"
        >
          <div className="rounded-[8px] border border-border bg-card/60 p-5">
            <p className="text-[13px] text-foreground/55">
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
              <p className="mt-3 text-[11.5px] text-foreground/55">
                Network fee is paid separately from your SOL balance.
              </p>
            )}
          </div>

          <ul className="hidden flex-col gap-2 rounded-[8px] border border-border bg-background/40 p-5 sm:flex">
            {[
              { Icon: ShieldIcon, text: "Proof generated locally in your browser." },
              {
                Icon: VerifiedTickIcon,
                text: "Verified on-chain by the Cloak shield-pool program.",
              },
              {
                Icon: RightArrowIcon,
                text: "Settles in a single Solana transaction.",
              },
            ].map((it, i) => (
              <motion.li
                key={it.text}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.16 + i * 0.05, duration: 0.25 }}
                className="flex items-start gap-2.5 text-[13px] leading-6 text-foreground/65"
              >
                <it.Icon size={14} className="mt-0.5 text-primary" />
                <span>{it.text}</span>
              </motion.li>
            ))}
          </ul>
        </motion.aside>
      </div>

      <Sheet open={confirmOpen} onOpenChange={setConfirmOpen}>
        <SheetContent
          side="bottom"
          className="rounded-t-[12px] border-t border-border pb-[max(1.25rem,env(safe-area-inset-bottom))]"
        >
          <SheetHeader>
            <SheetTitle>Confirm payment</SheetTitle>
            <SheetDescription>
              Review and sign in your wallet to send privately.
            </SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-4 px-6 pb-2">
            <dl className="flex flex-col divide-y divide-border rounded-[6px] border border-border bg-background/40 px-3 text-[13.5px]">
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
            <div className="flex flex-col gap-1">
              <span className="text-[13px] text-foreground/55">
                To
              </span>
              <span className="break-all font-mono text-[12px] text-foreground/80">
                {recipient.trim()}
              </span>
            </div>
            <FancyButton
              type="button"
              variant="primary"
              size="lg"
              className="mt-1 w-full"
              disabled={!canSubmit}
              onClick={() => {
                setConfirmOpen(false);
                void runSend();
              }}
            >
              Confirm & sign
              <HugeiconsIcon
                icon={ArrowRight01Icon}
                size={14}
                strokeWidth={2.2}
              />
            </FancyButton>
          </div>
        </SheetContent>
      </Sheet>
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
            className="text-[11.5px] text-foreground/55"
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
      className="flex flex-col gap-6 rounded-[8px] border border-border bg-card/60 p-4 sm:p-5 md:p-6"
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
          className="flex size-8 shrink-0 items-center justify-center rounded-full border border-primary/40 bg-primary/10 text-primary"
          aria-hidden="true"
        >
          <HugeiconsIcon
            icon={CheckmarkCircle01Icon}
            size={16}
            strokeWidth={2}
          />
        </motion.span>
        <div className="flex flex-col">
          <h2 className="text-[17px] font-medium tracking-tight text-foreground">
            Sent privately
          </h2>
          <p className="mt-1 text-[13.5px] leading-6 text-foreground/65">
            Recipient received{" "}
            <span className="text-primary">
              {formatAmount(net)} {token}
            </span>
            . The chain shows the payment from the Cloak shield-pool, not your
            wallet.
          </p>
          <p className="mt-1 font-mono text-[11.5px] text-foreground/55">
            to {shortAddress(recipient)}
          </p>
        </div>
      </div>

      <div className="flex flex-col divide-y divide-border overflow-hidden rounded-[6px] border border-border bg-background/40">
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
        <span className="text-[11.5px] text-foreground/55">{hint}</span>
      </div>
      {signature ? (
        <a
          href={solscanTxUrl(signature)}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 rounded-md border border-border bg-background/60 px-2.5 py-1 font-mono text-[11.5px] text-foreground transition-colors hover:border-primary/30"
        >
          <span>{shortSig(signature)}</span>
          <span aria-hidden="true">↗</span>
          <span className="sr-only">Open on Solscan</span>
        </a>
      ) : (
        <span className="font-mono text-[11.5px] text-foreground/40">·</span>
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
      <dt className="flex items-center gap-2 text-foreground/55">
        <span>{label}</span>
        {hint && (
          <span className="font-mono text-[11px] text-foreground/40">
            {hint}
          </span>
        )}
      </dt>
      <dd
        className={cn(
          "font-mono tabular-nums",
          accent
            ? "text-primary"
            : emphasis
              ? "text-foreground"
              : "text-foreground/85",
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

function formatBalance(amount: bigint, decimals: number): string {
  const base = 10n ** BigInt(decimals);
  const whole = amount / base;
  const frac = amount % base;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${whole.toString()}.${fracStr}`;
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
          <div className="flex items-center justify-between gap-2 text-[11.5px] text-foreground/65">
            <span className="min-w-0 flex-1 truncate">{message}</span>
            <span className="shrink-0 font-mono tabular-nums text-foreground/85">
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
