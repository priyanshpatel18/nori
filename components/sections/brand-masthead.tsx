import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import * as React from "react";

import { NoriWordmark } from "@/components/logos";
import { ConnectButton } from "@/components/solana/connect-button";
import { fancyButtonVariants } from "@/components/ui/fancy-button";
import { cn } from "@/lib/utils";

const NAV = [
  { label: "Pay", href: "/pay" },
  { label: "Payroll", href: "/payroll" },
  { label: "History", href: "/history" },
  { label: "Compliance", href: "/compliance" },
  { label: "Docs", href: "https://docs.cloak.ag" },
];

export function BrandMasthead() {
  return (
    <header className="relative isolate bg-background">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-6 px-6 py-5 md:px-8">
        <Link href="/" aria-label="Nori, home">
          <NoriWordmark markClassName="size-7" textClassName="text-[22px]" />
        </Link>

        <nav className="hidden items-center gap-6 text-[14px] text-foreground/65 md:flex">
          {NAV.map((n) => (
            <Link
              key={n.label}
              href={n.href}
              className="transition-colors hover:text-foreground"
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <ConnectButton />
        </div>
      </div>

      <div className="mx-auto w-full max-w-6xl px-6 pb-24 pt-20 md:px-8 md:pb-32 md:pt-28">
        <div className="flex items-center gap-2 text-[13px] text-foreground/60">
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
            <span className="relative inline-flex size-1.5 rounded-full bg-primary" />
          </span>
          Live on Solana mainnet
        </div>

        <h1 className="mt-7 max-w-[16ch] text-[clamp(2.6rem,7.4vw,5.5rem)] font-semibold leading-[1.02] tracking-[-0.025em] text-foreground">
          Private payroll on Solana.
        </h1>

        <p className="mt-6 max-w-[52ch] text-[17px] leading-[1.55] text-foreground/65 md:text-[19px]">
          ZK-shielded payroll for onchain teams. Drop a CSV, sign once, run the cycle.
          The chain settles. The salary doesn’t.
        </p>

        <div className="mt-10 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-5">
          <Link
            href="/payroll"
            className={cn(fancyButtonVariants({ variant: "primary", size: "xl" }))}
          >
            Launch app
            <HugeiconsIcon icon={ArrowRight01Icon} size={16} strokeWidth={2.4} />
          </Link>
          <Link
            href="/pay"
            className="text-[14.5px] text-foreground/65 underline-offset-[5px] hover:text-foreground hover:underline"
          >
            or send a single payment
          </Link>
        </div>
      </div>
    </header>
  );
}
