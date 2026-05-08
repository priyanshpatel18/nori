import * as React from "react";

const FAQ: { q: string; a: React.ReactNode }[] = [
  {
    q: "Where does the proof run?",
    a: "In your browser. Your wallet signs once. Inputs, amounts, and recipients never leave the laptop unencrypted.",
  },
  {
    q: "Can my auditor see what they need?",
    a: "Yes. A viewing key gives one auditor read-only access to your full ledger off-chain. Counterparties, amounts, timestamps. Revocable.",
  },
  {
    q: "Does my team need a new wallet?",
    a: "No. Phantom, Solflare, Backpack. Any Solana wallet. Recipients receive SOL, USDC, or USDT into their existing accounts.",
  },
];

export function BrandFaq() {
  return (
    <section
      aria-label="Common questions"
      className="relative border-t border-border bg-background"
    >
      <div className="mx-auto w-full max-w-6xl px-6 py-24 md:px-8 md:py-32">
        <h2 className="text-[clamp(1.7rem,3vw,2.4rem)] font-semibold leading-[1.1] tracking-[-0.02em] text-foreground">
          Common questions.
        </h2>

        <dl className="mt-12 flex flex-col">
          {FAQ.map((item) => (
            <div
              key={item.q}
              className="grid grid-cols-1 gap-y-2 border-t border-border py-7 last:border-b last:border-border md:grid-cols-[1fr_1.6fr] md:gap-x-12"
            >
              <dt className="text-[16.5px] font-medium tracking-tight text-foreground">
                {item.q}
              </dt>
              <dd className="max-w-[58ch] text-[15px] leading-7 text-foreground/65">
                {item.a}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
