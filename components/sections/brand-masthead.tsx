"use client";

import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import * as React from "react";

import {
  NoriWordmark,
  SolanaLogo,
  UsdcLogo,
  UsdtLogo,
} from "@/components/logos";
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
  const ref = React.useRef<HTMLElement>(null);

  const onMove = React.useCallback((e: React.MouseEvent<HTMLElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--x", `${e.clientX - rect.left}px`);
    el.style.setProperty("--y", `${e.clientY - rect.top}px`);
  }, []);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect();
        const h = Math.max(1, rect.height);
        // 0 at top of page, 1 after ~65% of the hero has scrolled past.
        const progress = Math.min(
          1,
          Math.max(0, -rect.top / (h * 0.65) || 0),
        );
        el.style.setProperty("--hero-fade", String(progress));
      });
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <header
      ref={ref}
      onMouseMove={onMove}
      className="group/hero relative isolate overflow-hidden bg-background"
    >
      {/* Black overlay that fades the hero out as you scroll */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 bg-black"
        style={{ opacity: "var(--hero-fade, 0)" }}
      />

      {/* Cursor-tracked primary spotlight */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 transition-opacity duration-300"
        style={{
          background:
            "radial-gradient(720px circle at var(--x, 50%) var(--y, 30%), color-mix(in oklch, var(--primary) 14%, transparent), transparent 55%)",
          opacity: "calc(1 - var(--hero-fade, 0))",
        }}
      />

      {/* Always-on top glow, anchors the page so it never reads as flat */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background:
            "radial-gradient(900px circle at 50% -10%, color-mix(in oklch, var(--primary) 6%, transparent), transparent 60%)",
          opacity: "calc(1 - var(--hero-fade, 0))",
        }}
      />

      {/* Hairline grid for structure */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          backgroundImage:
            "linear-gradient(color-mix(in oklch, var(--foreground) 60%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in oklch, var(--foreground) 60%, transparent) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
          maskImage:
            "radial-gradient(ellipse at 50% 30%, black 30%, transparent 80%)",
          opacity: "calc((1 - var(--hero-fade, 0)) * 0.06)",
        }}
      />

      {/* Bottom dissolve into the next section's background */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-48 bg-gradient-to-b from-transparent to-black"
      />

      {/* Top bar */}
      <div className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between gap-6 px-6 py-5 md:px-8">
        <Link href="/" aria-label="Nori, home">
          <NoriWordmark markClassName="size-7" textClassName="text-[22px]" />
        </Link>

        <nav className="hidden items-center gap-6 text-[14px] text-foreground/65 md:flex">
          {NAV.map((n) => (
            <Link
              key={n.label}
              href={n.href}
              className="link-underline transition-colors hover:text-foreground"
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <ConnectButton />
        </div>
      </div>

      {/* Headline */}
      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col justify-center px-6 pb-32 pt-24 min-h-[78dvh] md:px-8 md:pb-48 md:pt-40 md:min-h-[82dvh]">
        <h1 className="max-w-[16ch] text-[clamp(2.6rem,7.4vw,5.5rem)] font-semibold leading-[1.02] tracking-[-0.025em] text-foreground">
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
            className="link-underline text-[14.5px] text-foreground/65 transition-colors hover:text-foreground"
          >
            or send a single payment
          </Link>
        </div>

        <div className="mt-16 flex flex-col gap-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Works with
          </p>
          <ul className="flex flex-wrap items-center gap-x-7 gap-y-3 text-muted-foreground">
            <TokenChip Logo={SolanaLogo} label="SOL" />
            <TokenChip Logo={UsdcLogo} label="USDC" />
            <TokenChip Logo={UsdtLogo} label="USDT" />
          </ul>
        </div>
      </div>
    </header>
  );
}

function TokenChip({
  Logo,
  label,
}: {
  Logo: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <li className="flex items-center gap-2 text-[14px] text-foreground/85">
      <Logo className="size-6" />
      {label}
    </li>
  );
}
