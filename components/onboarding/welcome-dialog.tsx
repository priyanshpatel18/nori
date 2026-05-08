"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { motion } from "motion/react";
import * as React from "react";

import { NoriMark } from "@/components/logos";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  markWelcomeSeen,
  useOnboardingFlags,
  useOnboardingHydrated,
} from "@/lib/cloak/onboarding";
import { startTour, useTour } from "@/lib/cloak/tour";

export function WelcomeDialog() {
  const wallet = useWallet();
  const pubkey = wallet.publicKey?.toBase58() ?? null;
  const flags = useOnboardingFlags(pubkey);
  const tour = useTour(pubkey);
  const hydrated = useOnboardingHydrated();

  // Show the decision modal when:
  //   - the wallet is connected and onboarding metadata has finished loading
  //   - the wallet has not seen the welcome before
  //   - no tour is currently active for this wallet (so a Replay click can
  //     trigger it again, but we never overlap a tour and the modal)
  const open =
    hydrated && !!pubkey && !flags.welcomeSeen && tour.path === null;

  const shortPubkey = pubkey
    ? `${pubkey.slice(0, 4)}…${pubkey.slice(-4)}`
    : "";

  function handleClose() {
    if (pubkey) markWelcomeSeen(pubkey);
  }

  function handleDevnet() {
    if (!pubkey) return;
    markWelcomeSeen(pubkey);
    startTour(pubkey, "devnet");
  }

  function handleMainnet() {
    if (!pubkey) return;
    markWelcomeSeen(pubkey);
    startTour(pubkey, "mainnet");
  }

  function handleSkip() {
    if (pubkey) markWelcomeSeen(pubkey);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) handleClose();
      }}
    >
      <DialogContent className="max-w-[540px] gap-5 p-7">
        <DialogHeader className="gap-3">
          <span className="grid size-11 place-items-center rounded-2xl border border-border bg-background/40">
            <NoriMark className="size-7" />
          </span>
          <DialogTitle className="font-heading text-[24px] tracking-[-0.02em]">
            Welcome to Cloak.
          </DialogTitle>
          <DialogDescription className="text-[13.5px] leading-6">
            You&apos;re connected as{" "}
            <span className="font-mono text-foreground/85">{shortPubkey}</span>.
            Cloak shields balances on Solana, then spends them privately.
            Pick a path before your first move.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2.5">
          <PathOption
            recommended
            tag="Devnet"
            title="Try it on devnet first."
            body="We'll walk you through Settings, mint test USDC, and end at Pay. Nothing real at stake."
            onClick={handleDevnet}
            delay={0.05}
          />
          <PathOption
            tag="Mainnet"
            title="I'm already on mainnet."
            body="Quick three-step overview of Shield, Pay, and Compliance. No actions required."
            onClick={handleMainnet}
            delay={0.1}
          />
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-4">
          <p className="text-[11.5px] text-muted-foreground">
            Replay anytime from Settings.
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleSkip}
          >
            Skip tour
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PathOption({
  tag,
  title,
  body,
  recommended,
  onClick,
  delay,
}: {
  tag: string;
  title: string;
  body: string;
  recommended?: boolean;
  onClick: () => void;
  delay: number;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="group/path flex flex-col items-start gap-2 rounded-xl border border-border bg-card/40 px-4 py-3.5 text-left transition-colors hover:border-foreground/25 hover:bg-card/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {tag}
        </span>
        {recommended && (
          <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.18em] text-primary">
            <span aria-hidden="true" className="size-1 rounded-full bg-primary" />
            Recommended
          </span>
        )}
      </div>
      <p className="text-[14.5px] font-medium tracking-tight text-foreground">
        {title}
      </p>
      <p className="text-[12.5px] leading-5 text-muted-foreground">{body}</p>
    </motion.button>
  );
}
