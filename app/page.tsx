import {
  ArrowRight01Icon,
  CheckmarkCircle01Icon,
  MailSend01Icon,
  Plug01Icon,
  Upload01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";

import { Hero } from "@/components/sections/hero";
import { IntegrationsBento } from "@/components/sections/integrations-bento";
import { SiteFooter } from "@/components/sections/site-footer";
import { fancyButtonVariants } from "@/components/ui/fancy-button";
import { Spotlight } from "@/components/ui/spotlight";

export default function Home() {
  return (
    <div className="dark relative isolate flex min-h-screen flex-col bg-background text-foreground">
      <Hero />
      <TrustStrip />
      <HowItWorks />
      <IntegrationsBento />
      <FinalCta />
      <SiteFooter />
    </div>
  );
}

function TrustStrip() {
  const stats: { label: string; value: string }[] = [
    { label: "Proof time, in browser", value: "~3s" },
    { label: "Merkle tree height", value: "32" },
    { label: "Public signals", value: "9" },
    { label: "Fixed fee", value: "0.005 SOL" },
    { label: "Variable fee", value: "0.30%" },
  ];
  return (
    <section className="relative border-y border-border bg-background">
      <div className="mx-auto grid w-full max-w-6xl grid-cols-2 px-6 sm:grid-cols-5 sm:px-8">
        {stats.map((s) => (
          <div
            key={s.label}
            className="flex flex-col items-start gap-1 px-2 py-6 sm:px-4"
          >
            <span className="font-mono text-[20px] tracking-tight text-primary">
              {s.value}
            </span>
            <span className="text-[11.5px] uppercase tracking-[0.14em] text-muted-foreground">
              {s.label}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps: {
    n: string;
    title: string;
    body: string;
    icon: typeof Plug01Icon;
  }[] = [
      {
        n: "01",
        title: "Connect your treasury wallet",
        icon: Plug01Icon,
        body: "Phantom, Solflare, Backpack, or any Solana wallet. No new keys, no new app to install.",
      },
      {
        n: "02",
        title: "Upload a CSV of your team",
        icon: Upload01Icon,
        body: "Names, addresses, amounts, tokens. Save the roster once and reuse it every cycle.",
      },
      {
        n: "03",
        title: "Run payroll in one click",
        icon: MailSend01Icon,
        body: "Each payment is a Groth16 proof, generated in your browser, settled on Solana. The chain sees a transaction. Nothing else.",
      },
      {
        n: "04",
        title: "Export when your auditor asks",
        icon: CheckmarkCircle01Icon,
        body: "Share a viewing key with one accountant. They see your records. The chain still sees nothing.",
      },
    ];
  return (
    <section
      id="how"
      className="relative mx-auto w-full max-w-6xl px-6 py-24 sm:px-8"
    >
      <div className="mb-12 max-w-2xl">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary/80">
          How it works
        </p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Four steps. Quiet from the first click.
        </h2>
      </div>

      <ol className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {steps.map((s) => (
          <Spotlight
            as="li"
            key={s.n}
            className="relative overflow-hidden rounded-2xl border border-border bg-card/60 p-6 transition-colors hover:border-primary/30"
          >
            <div className="flex items-start gap-5">
              <div className="grid size-10 shrink-0 place-items-center rounded-xl border border-primary/20 bg-primary/10">
                <HugeiconsIcon
                  icon={s.icon}
                  size={18}
                  strokeWidth={1.6}
                  className="text-primary"
                />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] tracking-widest text-muted-foreground">
                    {s.n}
                  </span>
                  <h3 className="text-[16px] font-medium text-foreground">
                    {s.title}
                  </h3>
                </div>
                <p className="mt-1.5 text-[14px] leading-6 text-muted-foreground">
                  {s.body}
                </p>
              </div>
            </div>
          </Spotlight>
        ))}
      </ol>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="relative mx-auto w-full max-w-6xl px-6 pb-24 sm:px-8">
      <div className="overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-b from-primary/5 to-transparent px-8 py-14 sm:px-14">
        <div className="grid gap-8 sm:grid-cols-[1.4fr_1fr] sm:items-end">
          <div>
            <h2 className="max-w-xl text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl">
              Run your next payroll without putting your team on a public ledger.
            </h2>
            <p className="mt-4 max-w-md text-[14.5px] leading-7 text-muted-foreground">
              Nori is live on Solana mainnet. Connect your treasury wallet, upload your roster, and run private payroll in a click.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:items-end">
            <Link
              href="/payroll"
              className={fancyButtonVariants({ variant: "primary", size: "xl" })}
            >
              Launch app
              <HugeiconsIcon
                icon={ArrowRight01Icon}
                size={16}
                strokeWidth={2.2}
              />
            </Link>
            <span className="font-mono text-[11.5px] text-muted-foreground">
              api.cloak.ag · audited Q1 2026
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
