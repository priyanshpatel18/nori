import * as React from "react";

const STATS: { value: string; suffix?: string; note: string }[] = [
  { value: "~3", suffix: "s", note: "Proof generated in your browser, before you sign." },
  { value: "0.30", suffix: "%", note: "Plus 0.005 SOL per payment. Paid to the protocol. No markup." },
  { value: "1", note: "Wallet signature per cycle, no matter how many contributors." },
];

export function BrandStats() {
  return (
    <section
      aria-label="Specifications"
      className="relative border-t border-border bg-background"
    >
      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 md:grid-cols-3">
        {STATS.map((s, i) => (
          <div
            key={i}
            className={
              "flex flex-col gap-3 px-6 py-12 md:px-8 md:py-14 " +
              (i < STATS.length - 1
                ? "border-b border-border md:border-b-0 md:border-r"
                : "")
            }
          >
            <span className="text-[clamp(2.4rem,4.6vw,3.6rem)] font-semibold leading-none tracking-tight text-foreground tabular-nums">
              {s.value}
              {s.suffix ? (
                <span className="text-foreground/45">{s.suffix}</span>
              ) : null}
            </span>
            <span className="max-w-[36ch] text-[14px] leading-6 text-foreground/65">
              {s.note}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
