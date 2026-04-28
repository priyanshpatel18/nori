"use client";

import {
  ArrowRight01Icon,
  Mail01Icon,
  Shield01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import * as React from "react";

import {
  BackpackLogo,
  CloakLogo,
  NoriMark,
  PhantomLogo,
  SolanaLogo,
  SolflareLogo,
  UsdcLogo,
  UsdtLogo,
} from "@/components/logos";
import { ConnectButton } from "@/components/solana/connect-button";
import { Badge } from "@/components/ui/badge";
import { FancyButton } from "@/components/ui/fancy-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function TopBar() {
  return (
    <header className="relative z-20 mx-auto flex w-full max-w-6xl items-center justify-between px-6 pt-6 sm:px-10">
      <Link href="/" className="flex items-center gap-2">
        <NoriMark className="size-7" />
        <span className="text-[15px] font-semibold tracking-tight text-foreground">
          Nori
        </span>
      </Link>

      <div className="flex items-center gap-2">
        <ConnectButton />
      </div>
    </header>
  );
}

export function Hero() {
  const ref = React.useRef<HTMLDivElement>(null);

  const onMove = React.useCallback((e: React.MouseEvent<HTMLDivElement>) => {
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
        // 0 at top-of-page, 1 after you scroll through ~65% of the hero
        const progress = Math.min(
          1,
          Math.max(0, (-rect.top / (h * 0.65)) || 0),
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
    <section
      ref={ref}
      onMouseMove={onMove}
      className="group/hero relative overflow-hidden bg-background"
    >
      {/* As you scroll, we fade the hero into a flat black page. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 bg-black"
        style={{ opacity: "var(--hero-fade, 0)" }}
      />
      {/* Cursor-tracked primary spotlight (same effect as the bento). */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 transition-opacity duration-300"
        style={{
          background:
            "radial-gradient(720px circle at var(--x, 50%) var(--y, 30%), color-mix(in oklch, var(--primary) 14%, transparent), transparent 55%)",
          opacity: "calc(1 - var(--hero-fade, 0))",
        }}
      />
      {/* Faint always-on glow seeded at the top so the page never reads as flat. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background:
            "radial-gradient(900px circle at 50% -10%, color-mix(in oklch, var(--primary) 6%, transparent), transparent 60%)",
          opacity: "calc(1 - var(--hero-fade, 0))",
        }}
      />
      {/* Hairline grid for structure. */}
      <div
        aria-hidden="true"
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
      {/* Bottom fade so the section dissolves cleanly into background. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-48 bg-gradient-to-b from-transparent to-black"
      />

      <div className="relative z-10">
        <TopBar />
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col items-start px-6 pt-24 pb-32 sm:px-10 sm:pt-32 sm:pb-40">
        <Badge className="gap-2 px-3">
          <HugeiconsIcon
            icon={Shield01Icon}
            size={12}
            strokeWidth={2}
            className="text-primary"
          />
          Private payroll on Solana
        </Badge>

        <h1 className="mt-7 max-w-3xl text-[44px] font-semibold leading-[1.05] tracking-tight text-foreground sm:text-[64px]">
          Your payroll is public on Solana.
          <br />
          <span className="text-muted-foreground">
            It doesn&apos;t have to be.
          </span>
        </h1>

        <p className="mt-6 max-w-xl text-[16.5px] leading-7 text-foreground/80">
          Pay contributors in SOL, USDC, and USDT through a ZK shielded pool. Upload a CSV, run payroll in one click, and export a compliance report when your auditor asks.
        </p>

        <form
          action="#"
          method="post"
          className="mt-10 flex w-full max-w-xl flex-col gap-3"
          aria-label="Request early access"
        >
          <Label htmlFor="hero-email" hint="Mainnet beta, by invite">
            Work email
          </Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="hero-email"
              name="email"
              type="email"
              placeholder="you@company.xyz"
              autoComplete="email"
              className="sm:flex-1"
              leadingIcon={
                <HugeiconsIcon icon={Mail01Icon} size={16} strokeWidth={1.8} />
              }
            />
            <FancyButton type="submit" variant="primary" size="lg">
              Request access
              <HugeiconsIcon
                icon={ArrowRight01Icon}
                size={14}
                strokeWidth={2.2}
              />
            </FancyButton>
          </div>
          <p className="font-mono text-[11.5px] text-muted-foreground">
            zh1eLd6r…6qRkW · mainnet · audited
          </p>
        </form>

        <div className="mt-16 flex w-full flex-col gap-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Works with
          </p>
          <ul className="flex flex-wrap items-center gap-x-6 gap-y-3 text-muted-foreground">
            <LogoChip Logo={SolanaLogo} label="Solana" />
            <LogoChip Logo={UsdcLogo} label="USDC" />
            <LogoChip Logo={UsdtLogo} label="USDT" />
            <LogoChip Logo={PhantomLogo} label="Phantom" />
            <LogoChip Logo={SolflareLogo} label="Solflare" />
            <LogoChip Logo={BackpackLogo} label="Backpack" />
            <LogoChip Logo={CloakLogo} label="Cloak SDK" />
          </ul>
        </div>
      </div>
    </section>
  );
}

function LogoChip({
  Logo,
  label,
}: {
  Logo: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <li className="flex items-center gap-2 text-[13px] text-muted-foreground">
      <Logo className="size-5" />
      <span>{label}</span>
    </li>
  );
}
