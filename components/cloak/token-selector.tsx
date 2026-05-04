"use client";

import { ArrowDown01Icon, CheckmarkCircle01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import * as React from "react";

import {
  SolanaLogo,
  UsdcLogo,
  UsdtLogo,
  type LogoProps,
} from "@/components/logos";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { ShieldToken, ShieldTokenId } from "@/lib/cloak/tokens";
import { cn } from "@/lib/utils";

export function TokenLogo({
  id,
  className,
}: { id: ShieldTokenId } & LogoProps) {
  switch (id) {
    case "SOL":
      return <SolanaLogo className={className} />;
    case "USDC":
      return <UsdcLogo className={className} />;
    case "USDT":
      return <UsdtLogo className={className} />;
    default:
      return <SolanaLogo className={className} />;
  }
}

export type TokenSelectorProps = {
  value: ShieldTokenId;
  options: ShieldToken[];
  disabledIds?: ShieldTokenId[];
  onChange: (id: ShieldTokenId) => void;
  label?: string;
  className?: string;
};

export function TokenSelector({
  value,
  options,
  disabledIds,
  onChange,
  label = "Select token",
  className,
}: TokenSelectorProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <button
            type="button"
            className={cn(
              "inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-card/60 pl-2 pr-2.5 text-[13px] font-medium text-foreground transition-colors hover:bg-secondary",
              className,
            )}
            aria-label={`${label}, current ${value}`}
          />
        }
      >
        <TokenLogo id={value} className="size-5" />
        <span>{value}</span>
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          size={14}
          strokeWidth={2}
          className="text-muted-foreground"
        />
      </DialogTrigger>

      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
        </DialogHeader>
        <ul className="flex flex-col gap-1">
          {options.map((opt) => {
            const isActive = opt.id === value;
            const isDisabled = disabledIds?.includes(opt.id) ?? false;
            return (
              <li key={opt.id}>
                <button
                  type="button"
                  disabled={isDisabled}
                  onClick={() => {
                    onChange(opt.id);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left transition-colors",
                    "hover:bg-secondary",
                    isActive && "bg-secondary/70 border-border",
                    isDisabled && "opacity-50 cursor-not-allowed hover:bg-transparent",
                  )}
                >
                  <TokenLogo id={opt.id} className="size-6" />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="text-[13.5px] font-medium text-foreground">
                      {opt.id}
                    </span>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {shortMint(opt.mint.toBase58())}
                    </span>
                  </div>
                  {isActive && (
                    <HugeiconsIcon
                      icon={CheckmarkCircle01Icon}
                      size={16}
                      strokeWidth={2}
                      className="text-primary"
                    />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

function shortMint(mint: string): string {
  if (mint.length <= 12) return mint;
  return `${mint.slice(0, 4)}…${mint.slice(-4)}`;
}
