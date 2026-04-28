import {
  CheckmarkCircle01Icon,
  Coins01Icon,
  EyeIcon,
  File01Icon,
  LockIcon,
  MailSend01Icon,
  Upload01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { CloakLogo } from "@/components/logos";
import { Badge } from "@/components/ui/badge";
import { Spotlight } from "@/components/ui/spotlight";
import { cn } from "@/lib/utils";

type Card = {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  icon: React.ReactNode;
  span?: "single" | "wide" | "tall";
  footer?: React.ReactNode;
};

function IconBadge({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid size-10 shrink-0 place-items-center rounded-xl border border-border bg-card shadow-[0_1px_0_0_color-mix(in_oklch,var(--foreground)_5%,transparent)_inset]">
      {children}
    </div>
  );
}

function StatChip({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex items-baseline gap-2 rounded-lg border border-border bg-background/60 px-2.5 py-1.5">
      <span className="font-mono text-[12px] text-primary">{value}</span>
      <span className="text-[11px] text-muted-foreground">{label}</span>
    </div>
  );
}

const CARDS: Card[] = [
  {
    id: "cloak",
    eyebrow: "Privacy engine",
    title: "Powered by Cloak",
    body: "Every payment is a Groth16 proof generated in your browser. The on-chain program verifies the proof, updates the Merkle tree, and records the nullifier. No relayed amounts. No leaked recipients.",
    span: "wide",
    icon: (
      <IconBadge>
        <CloakLogo className="size-6" />
      </IconBadge>
    ),
    footer: (
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <StatChip value="~3s" label="proof time" />
        <StatChip value="height 32" label="merkle tree" />
        <StatChip value="100" label="root history" />
      </div>
    ),
  },
  {
    id: "compliance",
    eyebrow: "Selective disclosure",
    title: "Viewing-key compliance",
    body: "Generate a read-only viewing key and hand it to one auditor. They reconstruct your full ledger off-chain. The chain still sees nothing.",
    span: "tall",
    icon: (
      <IconBadge>
        <HugeiconsIcon
          icon={EyeIcon}
          size={20}
          strokeWidth={1.6}
          className="text-primary"
        />
      </IconBadge>
    ),
    footer: (
      <div className="mt-6 space-y-2.5">
        <ChecklistItem>Date-ranged ledger</ChecklistItem>
        <ChecklistItem>Counterparty resolution</ChecklistItem>
        <ChecklistItem>Signed proof of records</ChecklistItem>
        <ChecklistItem>Revoke any time</ChecklistItem>
      </div>
    ),
  },
  {
    id: "csv",
    eyebrow: "Operations",
    title: "CSV in, payroll out",
    body: "Upload a sheet of names, addresses, amounts, and tokens. Save the roster once and rerun it every cycle.",
    icon: (
      <IconBadge>
        <HugeiconsIcon
          icon={Upload01Icon}
          size={20}
          strokeWidth={1.6}
          className="text-primary"
        />
      </IconBadge>
    ),
  },
  {
    id: "audit",
    eyebrow: "Reports",
    title: "Auditor-ready exports",
    body: "One button. A signed CSV with totals, fees, and per-employee records lands in your downloads folder.",
    icon: (
      <IconBadge>
        <HugeiconsIcon
          icon={File01Icon}
          size={20}
          strokeWidth={1.6}
          className="text-primary"
        />
      </IconBadge>
    ),
    footer: (
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <StatChip value="CSV" label="format" />
        <StatChip value="signed" label="proof" />
      </div>
    ),
  },
];

function ChecklistItem({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-[13px] text-foreground/80">
      <HugeiconsIcon
        icon={CheckmarkCircle01Icon}
        size={14}
        strokeWidth={1.8}
        className="text-primary"
      />
      <span>{children}</span>
    </div>
  );
}

function BentoCard({ card }: { card: Card }) {
  return (
    <Spotlight
      className={cn(
        "rounded-2xl border border-border bg-card/60 p-6",
        "transition-colors duration-300 hover:border-primary/30",
        card.span === "wide" && "md:col-span-2",
        card.span === "tall" && "md:row-span-2",
      )}
    >
      <div className="flex items-start gap-4">
        {card.icon}
        <div className="min-w-0 flex-1">
          <p className="text-[10.5px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            {card.eyebrow}
          </p>
          <h3 className="mt-1 text-[15.5px] font-medium tracking-tight text-foreground">
            {card.title}
          </h3>
          <p className="mt-1.5 text-[13.5px] leading-6 text-muted-foreground">
            {card.body}
          </p>
          {card.footer}
        </div>
      </div>
    </Spotlight>
  );
}

export function IntegrationsBento() {
  return (
    <section
      id="integrations"
      className="relative mx-auto w-full max-w-6xl px-6 py-24 sm:px-8"
    >
      <div className="mb-10 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Badge className="gap-1.5 text-primary">
            <HugeiconsIcon
              icon={LockIcon}
              size={12}
              strokeWidth={2}
            />
            Built on the rails you already use
          </Badge>
          <h2 className="mt-2 max-w-xl text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            One pool. Every Solana wallet. Every dollar.
          </h2>
        </div>
        <p className="max-w-sm text-[14px] leading-6 text-muted-foreground">
          Nori sits on top of Cloak, a UTXO-based shielded pool with Groth16 proofs. Your team uses the wallets and stablecoins they already trust.
        </p>
      </div>

      <div className="grid auto-rows-[minmax(0,1fr)] grid-cols-1 gap-3 md:grid-cols-3">
        {CARDS.map((c) => (
          <BentoCard key={c.id} card={c} />
        ))}
      </div>

      <div className="mt-6 flex flex-col items-start gap-2 text-[12.5px] text-muted-foreground sm:flex-row sm:items-center sm:gap-3">
        <span className="inline-flex items-center gap-2">
          <HugeiconsIcon
            icon={MailSend01Icon}
            size={14}
            strokeWidth={1.8}
          />
          Mainnet program
          <span className="font-mono text-foreground/80">
            zh1eLd6rSphLejbFfJEneUwzHRfMKxgzrgkfwA6qRkW
          </span>
        </span>
        <span className="hidden text-muted-foreground/50 sm:inline">·</span>
        <span className="inline-flex items-center gap-2">
          <HugeiconsIcon
            icon={Coins01Icon}
            size={14}
            strokeWidth={1.8}
          />
          Fee
          <span className="font-mono text-foreground/80">
            0.005 SOL + 0.30%
          </span>
        </span>
      </div>
    </section>
  );
}
