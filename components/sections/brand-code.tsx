"use client";

import { Tick01Icon, Copy01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import * as React from "react";

import { cn } from "@/lib/utils";

const SNIPPET = `import { transact, createUtxo } from "@cloak.dev/sdk";

await transact(
  {
    inputUtxos: [/* your shielded UTXOs */],
    outputUtxos: [await createUtxo(amount, owner, mint)],
    externalAmount: amount,
    depositor: wallet.publicKey,
  },
  { connection, wallet, relayUrl, programId },
);`;

export function BrandCode() {
  const [copied, setCopied] = React.useState(false);

  const onCopy = React.useCallback(() => {
    navigator.clipboard.writeText(SNIPPET).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  }, []);

  return (
    <section
      aria-label="SDK"
      className="relative border-t border-border bg-background"
    >
      <div className="mx-auto w-full max-w-6xl px-6 py-24 md:px-8 md:py-32">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[1fr_1.4fr] lg:items-start lg:gap-16">
          <div>
            <h2 className="text-[clamp(1.7rem,3vw,2.4rem)] font-semibold leading-[1.1] tracking-[-0.02em] text-foreground">
              One call from your code.
            </h2>
            <p className="mt-5 max-w-[42ch] text-[15.5px] leading-7 text-foreground/65">
              Same flow whether you’re shipping a wallet, an app, or a payroll runner.
              Inputs in, proof out, transaction signed, recipient paid.
            </p>
            <p className="mt-6 font-mono text-[12.5px] text-foreground/55">
              <span className="text-foreground/85">npm install @cloak.dev/sdk</span>
            </p>
          </div>

          <div className="overflow-hidden rounded-[8px] border border-border bg-card/60">
            <div className="flex items-center justify-between border-b border-border bg-background/60 px-4 py-2.5">
              <div className="flex items-center gap-2 font-mono text-[11.5px] text-foreground/55">
                <span className="size-1 rounded-full bg-primary/80" />
                pay.ts
              </div>
              <button
                type="button"
                onClick={onCopy}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background/60 px-2 py-1 font-mono text-[11px] text-foreground/65 transition-colors hover:text-foreground"
              >
                <HugeiconsIcon
                  icon={copied ? Tick01Icon : Copy01Icon}
                  size={11}
                  strokeWidth={2}
                  className={cn(copied && "text-primary")}
                />
                {copied ? "copied" : "copy"}
              </button>
            </div>
            <pre className="overflow-x-auto px-5 py-5 font-mono text-[13px] leading-[1.65] text-foreground/85 sm:px-6">
              <code>{highlight(SNIPPET)}</code>
            </pre>
          </div>
        </div>
      </div>
    </section>
  );
}

const KW = new Set([
  "import",
  "from",
  "await",
  "const",
  "let",
  "return",
  "async",
]);
const FUN = new Set([
  "transact",
  "createUtxo",
  "createZeroUtxo",
]);
const TYPES = new Set(["NATIVE_SOL_MINT"]);

function highlight(src: string): React.ReactNode {
  // Tokenizer light enough to keep the snippet readable without a full lib.
  const out: React.ReactNode[] = [];
  const re = /(\/\/[^\n]*|`[^`]*`|"[^"]*"|'[^']*'|[A-Za-z_][A-Za-z0-9_]*|\d+\.?\d*|\s+|.)/g;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(src))) {
    const t = m[0];
    if (t.startsWith("//")) {
      out.push(<span key={i++} className="text-foreground/40">{t}</span>);
    } else if (t.startsWith('"') || t.startsWith("'") || t.startsWith("`")) {
      out.push(<span key={i++} className="text-primary/85">{t}</span>);
    } else if (KW.has(t)) {
      out.push(<span key={i++} className="text-foreground">{t}</span>);
    } else if (FUN.has(t)) {
      out.push(<span key={i++} className="text-primary">{t}</span>);
    } else if (TYPES.has(t)) {
      out.push(<span key={i++} className="text-foreground/85">{t}</span>);
    } else if (/^\s+$/.test(t)) {
      out.push(t);
    } else {
      out.push(<span key={i++} className="text-foreground/75">{t}</span>);
    }
  }
  return out;
}
