"use client";

import {
  ArrowRight01Icon,
  CheckmarkCircle01Icon,
  Loading03Icon,
  Refresh01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { motion } from "motion/react";
import * as React from "react";

import {
  BalancesIcon,
  DownArrowIcon,
  RightArrowIcon,
  SendIcon,
  ShieldIcon,
  UpArrowIcon,
  VerifiedTickIcon,
  type IconProps,
} from "@/components/Icons";
import { PageHeader } from "@/components/app-shell/page-header";
import { AmountInput } from "@/components/cloak/amount-input";
import { EmptyState } from "@/components/cloak/empty-state";
import { SolanaLogo, UsdcLogo, UsdtLogo } from "@/components/logos";
import { ConnectButton } from "@/components/solana/connect-button";
import { Button } from "@/components/ui/button";
import { FancyButton } from "@/components/ui/fancy-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getShieldToken,
  listShieldTokens,
  toBaseUnits,
  type ShieldTokenId,
} from "@/lib/cloak/tokens";
import { useOnChainBalance } from "@/lib/cloak/use-onchain-balance";
import { useRecoverSpendable } from "@/lib/cloak/use-recover-spendable";
import { useShield } from "@/lib/cloak/use-shield";
import { useShieldedBalance } from "@/lib/cloak/use-shielded-balance";
import { useWalletBalances } from "@/lib/cloak/use-wallet-balances";
import { solanaConfig } from "@/lib/solana/config";
import { solscanTxUrl } from "@/lib/solana/explorer";
import { InlineError } from "@/components/cloak/inline-error";
import { toast, toastCloakError } from "@/lib/toast";
import { cn } from "@/lib/utils";

type Action = "deposit" | "send" | "withdraw";

const ACTIONS: Array<{
  id: Action;
  label: string;
  icon: React.ComponentType<IconProps>;
  description: string;
}> = [
  {
    id: "deposit",
    label: "Deposit",
    icon: DownArrowIcon,
    description: "Move funds from your wallet into the shielded pool.",
  },
  {
    id: "send",
    label: "Send",
    icon: SendIcon,
    description: "Send shielded balance to any Solana address.",
  },
  {
    id: "withdraw",
    label: "Withdraw",
    icon: UpArrowIcon,
    description: "Withdraw shielded balance back to your wallet.",
  },
];

const TOKEN_LOGO: Record<ShieldTokenId, React.ComponentType<{ className?: string }>> = {
  SOL: SolanaLogo,
  USDC: UsdcLogo,
  USDT: UsdtLogo,
};

// Reserve set aside when computing Max for a SOL deposit so the wallet can
// still cover the network fee (a few thousand lamports) plus any rent for
// new ATAs the deposit may create. Conservative; users can always type in
// the exact amount themselves.
const SOL_DEPOSIT_RESERVE = 10_000_000n; // 0.01 SOL

export default function ShieldPage() {
  const wallet = useWallet();
  const balance = useShieldedBalance();
  const onChain = useOnChainBalance();
  const recover = useRecoverSpendable();
  const shield = useShield();
  const walletBalances = useWalletBalances();

  const tokens = React.useMemo(() => listShieldTokens(), []);
  const [action, setAction] = React.useState<Action>("deposit");
  const [tokenId, setTokenId] = React.useState<ShieldTokenId>(
    tokens[0]?.id ?? "SOL",
  );
  const [amount, setAmount] = React.useState("");
  const [recipient, setRecipient] = React.useState("");

  const token = getShieldToken(tokenId);
  const isProcessing = shield.state.status === "processing";
  const isSuccess = shield.state.status === "success";

  const numericAmount = parseFloat(amount);
  const amountValid =
    !!token &&
    /^\d*\.?\d*$/.test(amount.trim()) &&
    amount.trim() !== "" &&
    Number.isFinite(numericAmount) &&
    numericAmount > 0;

  const recipientValid = (() => {
    if (action !== "send") return true;
    try {
      new PublicKey(recipient.trim());
      return recipient.trim().length >= 32;
    } catch {
      return false;
    }
  })();

  const tokenBalance = token ? balance.balances[token.id] ?? 0n : 0n;
  const tokenUnspent = token
    ? balance.unspent.filter((u) => u.mint === token.mint.toBase58())
    : [];

  const walletBalance = token
    ? walletBalances.balances[token.id] ?? 0n
    : 0n;
  // What the user can actually spend in the current action: deposit pulls
  // from the wallet, send/withdraw pulls from shielded notes.
  const availableForAction = action === "deposit" ? walletBalance : tokenBalance;
  // For a SOL deposit, hold back a small reserve so the wallet still has
  // enough for tx fees and ATA rent.
  const maxForAction =
    action === "deposit" && token?.id === "SOL"
      ? availableForAction > SOL_DEPOSIT_RESERVE
        ? availableForAction - SOL_DEPOSIT_RESERVE
        : 0n
      : availableForAction;
  const amountBaseUnits =
    amountValid && token ? toBaseUnits(amount, token.decimals) : 0n;
  const overBalance =
    amountValid && amountBaseUnits > availableForAction;
  const overMax = amountValid && amountBaseUnits > maxForAction;

  type LastSubmit = {
    action: Action;
    amount: string;
    tokenId: ShieldTokenId;
    decimals: number;
    recipient: string;
  };
  const [lastSubmit, setLastSubmit] = React.useState<LastSubmit | null>(null);

  const reset = () => {
    shield.reset();
    setAmount("");
    setRecipient("");
    setLastSubmit(null);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !wallet.publicKey || !amountValid) return;
    if (action === "send" && !recipientValid) return;
    if (overBalance) return;

    const recipientPk =
      action === "deposit"
        ? wallet.publicKey
        : action === "withdraw"
          ? wallet.publicKey
          : new PublicKey(recipient.trim());

    setLastSubmit({
      action,
      amount,
      tokenId: token.id,
      decimals: token.decimals,
      recipient: recipientPk.toBase58(),
    });

    const loadingLabel =
      action === "deposit"
        ? "Shielding deposit"
        : action === "send"
          ? "Sending shielded"
          : "Withdrawing";
    const successLabel =
      action === "deposit"
        ? "Deposit shielded"
        : action === "send"
          ? "Shielded transfer sent"
          : "Withdraw complete";

    const toastId = toast.loading(loadingLabel, {
      description: `${amount} ${token.id}`,
    });

    try {
      const result =
        action === "deposit"
          ? await shield.deposit({ amountBaseUnits, mint: token.mint })
          : await shield.withdraw({
              amountBaseUnits,
              mint: token.mint,
              recipient: recipientPk,
              available: tokenUnspent,
            });

      toast.success(successLabel, {
        id: toastId,
        description: `${amount} ${token.id}`,
        action: result.signature
          ? {
              label: "View",
              onClick: () =>
                window.open(
                  solscanTxUrl(result.signature),
                  "_blank",
                  "noopener,noreferrer",
                ),
            }
          : undefined,
      });
    } catch (err) {
      toastCloakError(toastId, err);
    }
  };

  const submitDisabled =
    !wallet.connected ||
    !token ||
    !amountValid ||
    (action === "send" && !recipientValid) ||
    overBalance ||
    isProcessing;

  return (
    <>
      <PageHeader
        eyebrow="Shielded balance"
        title="Your private vault on Solana."
        description="Deposit once. Spend many. Each transaction is shielded with a Groth16 proof generated in your browser."
      />

      <div className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-10 sm:px-8 lg:grid-cols-[1.4fr_1fr]">
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          data-tour="shield-action"
          className="flex min-w-0 flex-col gap-6 sm:rounded-2xl sm:border sm:border-border sm:bg-card/60 sm:p-8 lg:self-start"
        >
          <div className="flex items-center gap-1 rounded-xl border border-border bg-background/50 p-1">
            {ACTIONS.map((a) => {
              const isActive = action === a.id;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => {
                    setAction(a.id);
                    if (shield.state.status !== "idle") shield.reset();
                    shield.prewarm();
                  }}
                  className={cn(
                    "relative flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors",
                    isActive
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  aria-pressed={isActive}
                >
                  {isActive && (
                    <motion.span
                      layoutId="shield-action-active"
                      aria-hidden="true"
                      className="absolute inset-0 -z-0 rounded-lg bg-secondary"
                      transition={{ type: "spring", stiffness: 380, damping: 30 }}
                    />
                  )}
                  <span className="relative z-10 flex items-center gap-1.5">
                    <a.icon size={14} />
                    {a.label}
                  </span>
                </button>
              );
            })}
          </div>

          <p className="text-[13px] text-muted-foreground">
            {ACTIONS.find((a) => a.id === action)?.description}
          </p>

          {isSuccess && shield.state.signature && lastSubmit ? (
            <SuccessBlock
              submit={lastSubmit}
              walletPubkey={wallet.publicKey?.toBase58() ?? null}
              signature={shield.state.signature}
              onAgain={reset}
            />
          ) : (
            <form className="flex flex-col gap-6" onSubmit={onSubmit} noValidate>
              {action === "send" && (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="recipient">Recipient address</Label>
                  <Input
                    id="recipient"
                    placeholder="Solana wallet address"
                    autoComplete="off"
                    spellCheck={false}
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                    invalid={recipient.trim().length > 0 && !recipientValid}
                    className="font-mono text-[13px]"
                    trailingIcon={
                      recipientValid && recipient.trim().length > 0 ? (
                        <HugeiconsIcon
                          icon={CheckmarkCircle01Icon}
                          size={14}
                          strokeWidth={2}
                          className="text-primary"
                        />
                      ) : undefined
                    }
                  />
                </div>
              )}

              <div className="flex flex-col gap-2">
                <Label htmlFor="amount">Amount</Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <AmountInput
                    id="amount"
                    placeholder="0.00"
                    value={amount}
                    onValueChange={setAmount}
                    decimals={token?.decimals}
                    onFocus={() => shield.prewarm()}
                    invalid={overBalance || undefined}
                    className="font-mono sm:flex-1"
                  />
                  <div className="flex w-full items-center gap-1.5 rounded-xl border border-border bg-background/50 p-1 sm:w-auto">
                    {tokens.map((t) => {
                      const Logo = TOKEN_LOGO[t.id];
                      const isActive = tokenId === t.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setTokenId(t.id)}
                          className={cn(
                            "relative flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium transition-colors sm:flex-none",
                            isActive
                              ? "text-foreground"
                              : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {isActive && (
                            <motion.span
                              layoutId="shield-token-active"
                              aria-hidden="true"
                              className="absolute inset-0 -z-0 rounded-lg bg-secondary"
                              transition={{ type: "spring", stiffness: 380, damping: 30 }}
                            />
                          )}
                          <span className="relative z-10 flex items-center gap-1.5">
                            <Logo className="size-3.5" />
                            {t.id}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                {token && wallet.connected && (
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted-foreground">
                    <span>
                      {action === "deposit" ? "Wallet" : "Available"}:{" "}
                      <span className="font-mono text-foreground">
                        {formatBaseUnits(availableForAction, token.decimals)}{" "}
                        {token.id}
                      </span>
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          setAmount(
                            formatBaseUnits(maxForAction / 2n, token.decimals),
                          )
                        }
                        disabled={maxForAction <= 0n}
                        className="rounded-md border border-border bg-background/60 px-2 py-0.5 text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Half
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setAmount(
                            formatBaseUnits(maxForAction, token.decimals),
                          )
                        }
                        disabled={maxForAction <= 0n}
                        className="rounded-md border border-border bg-background/60 px-2 py-0.5 text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Max
                      </button>
                    </div>
                  </div>
                )}
                {overBalance && token && (
                  <p className="text-[11.5px] text-destructive">
                    Amount exceeds your{" "}
                    {action === "deposit" ? "wallet" : "shielded"} balance of{" "}
                    {formatBaseUnits(availableForAction, token.decimals)}{" "}
                    {token.id}.
                  </p>
                )}
                {!overBalance &&
                  overMax &&
                  action === "deposit" &&
                  token?.id === "SOL" && (
                    <p className="text-[11.5px] text-amber-500">
                      Leave a small reserve for network fees. Max button caps at{" "}
                      {formatBaseUnits(maxForAction, token.decimals)} {token.id}.
                    </p>
                  )}
              </div>

              <FancyButton
                type="submit"
                variant="primary"
                size="lg"
                className="self-start"
                disabled={submitDisabled}
              >
                {submitButtonLabel(action, isProcessing, wallet.connected)}
                <HugeiconsIcon icon={ArrowRight01Icon} size={14} strokeWidth={2} />
              </FancyButton>

              {isProcessing && (
                <ProcessingBlock
                  phase={shield.state.phase}
                  progress={shield.state.progress}
                  proofPercent={shield.state.proofPercent}
                />
              )}

              {shield.state.status === "error" && shield.state.error && (
                <InlineError err={shield.state.error} />
              )}
            </form>
          )}
        </motion.section>

        <motion.aside
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col gap-3"
        >
          <div className="flex items-center justify-between gap-2 px-1">
            <div className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              <ShieldIcon size={12} />
              Shielded balance
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                onChain.sync().catch(() => {});
              }}
              disabled={onChain.status === "scanning" || !wallet.publicKey}
              title={
                wallet.publicKey
                  ? "Scan the chain for shields done on other devices"
                  : "Connect your wallet to sync from chain"
              }
              className="h-7 gap-1.5 px-2 text-[11px]"
            >
              <HugeiconsIcon
                icon={
                  onChain.status === "scanning" ? Loading03Icon : Refresh01Icon
                }
                size={12}
                strokeWidth={1.8}
                className={cn(
                  onChain.status === "scanning" && "animate-spin",
                )}
              />
              {onChain.status === "scanning" ? "Syncing" : "Sync from chain"}
            </Button>
          </div>
          <div className="flex flex-col gap-2.5">
            {!wallet.publicKey && (
              <EmptyState
                size="sm"
                icon={<ShieldIcon size={18} />}
                title="Connect to view your shielded balance"
                description="Once connected, your shielded notes are read locally — never the chain."
                action={<ConnectButton />}
              />
            )}
            {wallet.publicKey && tokens.map((t) => {
              const Logo = TOKEN_LOGO[t.id];
              const amt = balance.balances[t.id] ?? 0n;
              const noteCount = balance.unspent.filter(
                (u) => u.mint === t.mint.toBase58(),
              ).length;
              const onChainAmt = bigOrZero(
                onChain.balanceByMint[t.mint.toBase58()],
              );
              const elsewhere = onChainAmt > amt ? onChainAmt - amt : 0n;
              return (
                <div
                  key={t.id}
                  className="flex flex-col gap-2 rounded-2xl border border-border bg-card/60 p-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Logo className="size-7" />
                      <div className="flex flex-col">
                        <span className="text-[13px] font-medium">{t.id}</span>
                        <span className="text-[11px] text-muted-foreground">
                          {noteCount} {noteCount === 1 ? "note" : "notes"} on
                          this device
                        </span>
                      </div>
                    </div>
                    <span className="font-mono text-[15px] tabular-nums">
                      {formatBaseUnits(amt, t.decimals)}
                    </span>
                  </div>
                  {elsewhere > 0n && (
                    <div className="flex items-center justify-between border-t border-border/60 pt-2 text-[11.5px]">
                      <span className="text-muted-foreground">
                        Shielded from another device
                      </span>
                      <span className="font-mono tabular-nums text-amber-500">
                        +{formatBaseUnits(elsewhere, t.decimals)}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
            {wallet.publicKey && tokens.length === 0 && (
              <p className="rounded-xl border border-dashed border-border bg-card/30 px-3 py-4 text-[12.5px] text-muted-foreground">
                No tokens configured for {solanaConfig.cluster}.
              </p>
            )}
          </div>
          {onChain.error && (
            <p className="rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-2 text-[11.5px] text-destructive">
              {onChain.error.message}
            </p>
          )}
          {hasOffDeviceBalance(tokens, balance.balances, onChain.balanceByMint) && (
            <div className="flex flex-col gap-1.5 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] font-medium text-amber-600 dark:text-amber-300">
                  Try cross-device recovery
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    recover.recover().catch(() => {});
                  }}
                  disabled={recover.status === "scanning" || !wallet.publicKey}
                  className="h-7 gap-1.5 px-2 text-[11px]"
                >
                  <HugeiconsIcon
                    icon={
                      recover.status === "scanning"
                        ? Loading03Icon
                        : Refresh01Icon
                    }
                    size={12}
                    strokeWidth={1.8}
                    className={cn(
                      recover.status === "scanning" && "animate-spin",
                    )}
                  />
                  {recover.status === "scanning"
                    ? "Recovering"
                    : "Recover spendable"}
                </Button>
              </div>
              <p className="text-[11.5px] text-muted-foreground">
                Only shields done with recoverable mode enabled
                (NEXT_PUBLIC_CLOAK_RECOVERABLE_SHIELDS) can be rebuilt
                cross-device. Shields done before that flag was set need their
                originating device.
              </p>
              {recover.lastResult && (
                <p className="text-[11px] tabular-nums text-muted-foreground">
                  Last run: {recover.lastResult.added.length} added,{" "}
                  {recover.lastResult.skippedExisting} already known across{" "}
                  {recover.lastResult.scannedTxs} txs.
                </p>
              )}
              {recover.error && (
                <p className="text-[11px] text-destructive">
                  {recover.error.message}
                </p>
              )}
            </div>
          )}
          <div className="mt-1 hidden items-start gap-2 rounded-xl border border-border/60 bg-card/30 p-3 text-[12px] text-muted-foreground sm:flex">
            <BalancesIcon size={20} className="mt-0.5 shrink-0 text-primary" />
            <span>
              {onChain.snapshot
                ? "On-chain totals are computed from your viewing key. Balances marked “from another device” are shielded but cannot be spent here unless the originating device used recoverable mode."
                : "Balance is reconstructed from notes saved locally on this device. Spending requires the wallet that deposited them. Hit Sync from chain to see your full on-chain shielded balance across devices."}
            </span>
          </div>
        </motion.aside>
      </div>
    </>
  );
}

function ProcessingBlock({
  phase,
  progress,
  proofPercent,
}: {
  phase: ReturnType<typeof useShield>["state"]["phase"];
  progress: string | null;
  proofPercent: number | null;
}) {
  const label = phase ? phaseLabel(phase) : "Working";
  const detail = progress ?? label;
  const pct = proofPercent ?? null;
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-background/40 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2 text-[12.5px]">
        <span className="min-w-0 flex-1 truncate text-muted-foreground">
          {detail}
        </span>
        {pct !== null && (
          <span className="shrink-0 font-mono tabular-nums text-foreground">
            {Math.round(pct)}%
          </span>
        )}
      </div>
      {pct !== null && (
        <div className="h-1 w-full overflow-hidden rounded-full bg-secondary">
          <motion.div
            className="h-full bg-primary"
            initial={false}
            animate={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
            transition={{ duration: 0.25 }}
          />
        </div>
      )}
    </div>
  );
}

function SuccessBlock({
  submit,
  walletPubkey,
  signature,
  onAgain,
}: {
  submit: {
    action: Action;
    amount: string;
    tokenId: ShieldTokenId;
    decimals: number;
    recipient: string;
  };
  walletPubkey: string | null;
  signature: string;
  onAgain: () => void;
}) {
  const { action, amount, tokenId, recipient } = submit;
  const headline =
    action === "deposit"
      ? "Shielded"
      : action === "withdraw"
        ? "Withdrawn"
        : "Sent privately";
  const subheadline =
    action === "deposit"
      ? "Now spendable from your shielded balance."
      : action === "withdraw"
        ? "Funds are back in your wallet."
        : "The recipient sees the payout, not your wallet.";

  const recipientLabel =
    action === "deposit"
      ? "From"
      : action === "withdraw"
        ? "To your wallet"
        : "To";
  const isOwnWallet = walletPubkey === recipient;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col gap-5 rounded-2xl border border-primary/30 bg-primary/5 p-5 sm:p-6"
    >
      <div className="flex items-start gap-3">
        <motion.span
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1], delay: 0.05 }}
          className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/15 text-primary"
          aria-hidden="true"
        >
          <VerifiedTickIcon size={18} />
        </motion.span>
        <div className="flex flex-col">
          <h2 className="text-[17px] font-medium tracking-tight text-foreground">
            {headline}{" "}
            <span className="font-mono text-yellow-600 tabular-nums dark:text-yellow-400">
              {amount} {tokenId}
            </span>
          </h2>
          <p className="mt-1 text-[12.5px] leading-5 text-muted-foreground">
            {subheadline}
          </p>
        </div>
      </div>

      <dl className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border bg-background/40 text-[12.5px]">
        <SuccessRow label={recipientLabel}>
          <span className="font-mono text-foreground">
            {shortAddress(recipient)}
          </span>
          {isOwnWallet && (
            <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.18em] text-primary/80">
              You
            </span>
          )}
        </SuccessRow>
        <SuccessRow label="Solana tx">
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
        </SuccessRow>
      </dl>

      <FancyButton
        type="button"
        variant="primary"
        size="lg"
        className="self-start"
        onClick={onAgain}
      >
        Run another
        <RightArrowIcon size={14} />
      </FancyButton>
    </motion.div>
  );
}

function SuccessRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
      <dt className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </dt>
      <dd className="flex items-center">{children}</dd>
    </div>
  );
}

function shortAddress(s: string): string {
  if (s.length <= 12) return s;
  return `${s.slice(0, 6)}…${s.slice(-4)}`;
}

function shortSig(s: string): string {
  if (s.length <= 14) return s;
  return `${s.slice(0, 8)}…${s.slice(-6)}`;
}

function submitButtonLabel(
  action: Action,
  processing: boolean,
  connected: boolean,
): string {
  if (!connected) return "Connect wallet";
  switch (action) {
    case "deposit":
      return processing ? "Depositing…" : "Deposit";
    case "send":
      return processing ? "Sending…" : "Send";
    case "withdraw":
      return processing ? "Withdrawing…" : "Withdraw";
  }
}

function phaseLabel(phase: NonNullable<ReturnType<typeof useShield>["state"]["phase"]>): string {
  switch (phase) {
    case "deriving-key":
      return "Deriving shield key";
    case "consolidating":
      return "Merging notes";
    case "building-proof":
      return "Generating ZK proof";
    case "submitting":
      return "Submitting transaction";
    case "confirming":
      return "Confirming on-chain";
    case "success":
      return "Done";
  }
}

function formatBaseUnits(amount: bigint, decimals: number): string {
  const base = 10n ** BigInt(decimals);
  const whole = amount / base;
  const frac = amount % base;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${whole.toString()}.${fracStr}`;
}

function bigOrZero(value: string | undefined): bigint {
  if (!value) return 0n;
  try {
    return BigInt(value);
  } catch {
    return 0n;
  }
}

function hasOffDeviceBalance(
  tokens: ReturnType<typeof listShieldTokens>,
  localBalances: Partial<Record<ShieldTokenId, bigint>>,
  onChainBalanceByMint: Record<string, string>,
): boolean {
  for (const t of tokens) {
    const local = localBalances[t.id] ?? 0n;
    const onChain = bigOrZero(onChainBalanceByMint[t.mint.toBase58()]);
    if (onChain > local) return true;
  }
  return false;
}
