"use client";

import {
  Cancel01Icon,
  CheckmarkCircle01Icon,
  Copy01Icon,
  KeyIcon,
  Link01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useWallet } from "@solana/wallet-adapter-react";
import { AnimatePresence, motion } from "motion/react";
import * as React from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FancyButton } from "@/components/ui/fancy-button";
import { useViewingKey } from "@/lib/cloak/use-viewing-key";
import { cn } from "@/lib/utils";

const COPIED_FEEDBACK_MS = 1600;

function buildAuditorUrl(nkHex: string, walletPubkey: string | null): string {
  const params = new URLSearchParams({ nk: nkHex });
  if (walletPubkey) params.set("wallet", walletPubkey);
  const path = `/compliance/view?${params.toString()}`;
  if (typeof window === "undefined") return path;
  return `${window.location.origin}${path}`;
}

export function ViewingKeyButton() {
  const wallet = useWallet();
  const { state, reveal, hide } = useViewingKey();
  const [copied, setCopied] = React.useState(false);
  const copyTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, []);

  const writeToClipboard = React.useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
    } catch {
      // clipboard may be blocked (insecure context); masked value stays on screen
    }
  }, []);

  const onCopyHex = React.useCallback(() => {
    if (state.status !== "ready") return;
    void writeToClipboard(state.material.nkHex);
  }, [state, writeToClipboard]);

  const onCopyAuditorLink = React.useCallback(() => {
    if (state.status !== "ready") return;
    const url = buildAuditorUrl(
      state.material.nkHex,
      wallet.publicKey?.toBase58() ?? null,
    );
    void writeToClipboard(url);
  }, [state, wallet.publicKey, writeToClipboard]);

  if (state.status === "ready") {
    return (
      <motion.div
        initial={{ opacity: 0, y: -2 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18 }}
        className="flex items-center gap-1.5 rounded-xl border border-border bg-card/60 px-2 py-1.5"
      >
        <HugeiconsIcon
          icon={KeyIcon}
          size={13}
          strokeWidth={2}
          className="ml-1 text-primary"
        />
        <span
          className="font-mono text-[12.5px] tabular-nums text-foreground"
          aria-label="Your viewing key (first and last 4 hex chars)"
        >
          {state.material.masked}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={copied ? "Copied" : "Copy options"}
            className={cn(
              "flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] font-medium",
              "transition-colors",
              copied
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/60",
            )}
          >
            <AnimatePresence initial={false} mode="wait">
              {copied ? (
                <motion.span
                  key="copied"
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.92 }}
                  transition={{ duration: 0.14 }}
                  className="flex items-center gap-1"
                >
                  <HugeiconsIcon
                    icon={CheckmarkCircle01Icon}
                    size={12}
                    strokeWidth={2}
                  />
                  Copied
                </motion.span>
              ) : (
                <motion.span
                  key="copy"
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.92 }}
                  transition={{ duration: 0.14 }}
                  className="flex items-center gap-1"
                >
                  <HugeiconsIcon icon={Copy01Icon} size={12} strokeWidth={2} />
                  Copy
                </motion.span>
              )}
            </AnimatePresence>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={6}>
            <DropdownMenuItem onClick={onCopyHex}>
              <HugeiconsIcon icon={Copy01Icon} size={12} strokeWidth={2} />
              Copy hex (nk)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onCopyAuditorLink}>
              <HugeiconsIcon icon={Link01Icon} size={12} strokeWidth={2} />
              Copy auditor link
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <button
          type="button"
          onClick={() => {
            setCopied(false);
            hide();
          }}
          aria-label="Hide viewing key"
          className="grid size-6 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={12} strokeWidth={2} />
        </button>
      </motion.div>
    );
  }

  const isError = state.status === "error";
  const isDeriving = state.status === "deriving";
  const disabled = !wallet.publicKey || isDeriving;

  return (
    <div className="flex flex-col items-end gap-1">
      <FancyButton
        type="button"
        variant="neutral"
        size="sm"
        onClick={reveal}
        disabled={disabled}
        aria-busy={isDeriving || undefined}
      >
        <HugeiconsIcon icon={KeyIcon} size={13} strokeWidth={2} />
        {!wallet.publicKey
          ? "Connect to reveal"
          : isDeriving
            ? "Signing…"
            : "Reveal viewing key"}
      </FancyButton>
      {isError && (
        <p
          role="alert"
          className="max-w-[260px] text-right text-[11px] text-destructive"
        >
          {state.error}
        </p>
      )}
    </div>
  );
}
