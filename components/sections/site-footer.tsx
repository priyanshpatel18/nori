import Link from "next/link";
import {
  ArrowRight01Icon,
  Mail01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { NoriMark } from "@/components/logos";
import { FancyButton } from "@/components/ui/fancy-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const NAV: { heading: string; items: { label: string; href: string }[] }[] = [
  {
    heading: "Product",
    items: [
      { label: "Pay", href: "/pay" },
      { label: "Payroll", href: "/payroll" },
      { label: "History", href: "/history" },
      { label: "Compliance", href: "/compliance" },
    ],
  },
  {
    heading: "Build",
    items: [
      { label: "Cloak SDK", href: "https://docs.cloak.ag" },
      { label: "Protocol", href: "https://docs.cloak.ag/protocol" },
      { label: "Relay API", href: "https://docs.cloak.ag/services" },
      { label: "Status", href: "https://status.cloak.ag" },
    ],
  },
  {
    heading: "Company",
    items: [
      { label: "About", href: "/about" },
      { label: "Brand", href: "/brand" },
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="relative border-t border-border bg-background">
      <div className="mx-auto w-full max-w-6xl px-6 pt-20 pb-10 sm:px-8">
        <div className="grid gap-12 lg:grid-cols-[1.1fr_2fr]">
          <div className="flex flex-col gap-6">
            <div className="flex items-center gap-2.5">
              <NoriMark className="size-7" />
              <span className="text-[17px] font-semibold tracking-tight text-foreground">
                Nori
              </span>
            </div>
            <p className="max-w-sm text-[14px] leading-6 text-muted-foreground">
              Private payroll for onchain companies. Pay your team in SOL, USDC, and USDT without putting their salary on a public ledger.
            </p>

            <form
              className="flex w-full max-w-md flex-col gap-2"
              action="#"
              method="post"
            >
              <Label htmlFor="footer-email" hint="No spam, ever">
                Get the launch note
              </Label>
              <div className="flex gap-2">
                <Input
                  id="footer-email"
                  name="email"
                  type="email"
                  placeholder="you@company.xyz"
                  autoComplete="email"
                  leadingIcon={
                    <HugeiconsIcon
                      icon={Mail01Icon}
                      size={16}
                      strokeWidth={1.8}
                    />
                  }
                />
                <FancyButton type="submit" variant="primary" size="md">
                  Notify me
                  <HugeiconsIcon
                    icon={ArrowRight01Icon}
                    size={14}
                    strokeWidth={2.2}
                  />
                </FancyButton>
              </div>
            </form>
          </div>

          <nav
            aria-label="Footer"
            className="grid grid-cols-2 gap-8 sm:grid-cols-3"
          >
            {NAV.map((col) => (
              <div key={col.heading} className="flex flex-col gap-3">
                <h3 className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                  {col.heading}
                </h3>
                <ul className="flex flex-col gap-2.5">
                  {col.items.map((it) => (
                    <li key={it.label}>
                      <Link
                        href={it.href}
                        className="text-[14px] text-foreground/80 transition-colors hover:text-primary"
                      >
                        {it.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="mt-16 flex flex-col gap-4 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-mono text-[12px] text-muted-foreground">
            © {new Date().getFullYear()} Nori Labs. All rights reserved.
          </p>
          <div className="flex items-center gap-5 text-[13px] text-muted-foreground">
            <Link
              href="https://x.com/UseNori"
              className="transition-colors hover:text-primary"
            >
              X
            </Link>
            <Link
              href="https://github.com/UseNori"
              className="transition-colors hover:text-primary"
            >
              GitHub
            </Link>
            <Link
              href="https://docs.cloak.ag"
              className="transition-colors hover:text-primary"
            >
              Docs
            </Link>
            <span className="font-mono text-[11px] text-muted-foreground">
              v0.1 · mainnet
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
