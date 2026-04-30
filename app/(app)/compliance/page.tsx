"use client";

import {
  ArrowRight01Icon,
  CheckmarkCircle01Icon,
  Copy01Icon,
  Download01Icon,
  EyeIcon,
  FileSecurityIcon,
  KeyIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { motion } from "motion/react";
import * as React from "react";

import { PageHeader } from "@/components/app-shell/page-header";
import { FancyButton } from "@/components/ui/fancy-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const KEYS: { id: string; auditor: string; range: string; status: "active" | "revoked" }[] = [
  {
    id: "vk_2A8…91Fc",
    auditor: "Trail of Bits",
    range: "Jan 1 – Mar 31, 2026",
    status: "active",
  },
  {
    id: "vk_71D…04Ae",
    auditor: "Internal · Finance",
    range: "Q1 2026",
    status: "active",
  },
  {
    id: "vk_5C0…8b22",
    auditor: "Withum tax filing",
    range: "FY 2025",
    status: "revoked",
  },
];

const EXPORTS: { name: string; date: string; size: string }[] = [
  { name: "Q1-2026-ledger.csv", date: "Apr 02, 2026", size: "184 KB" },
  { name: "FY-2025-summary.csv", date: "Jan 18, 2026", size: "612 KB" },
];

export default function CompliancePage() {
  return (
    <>
      <PageHeader
        eyebrow="Selective disclosure"
        title="Compliance"
        description="Hand a viewing key to one auditor. They reconstruct your full ledger off-chain. The chain still sees nothing."
      />

      <div className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-10 sm:px-8 lg:grid-cols-[1.4fr_1fr]">
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col gap-6 rounded-2xl border border-border bg-card/60 p-6 sm:p-8"
        >
          <div className="flex items-start gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
              <HugeiconsIcon icon={KeyIcon} size={18} strokeWidth={1.6} />
            </div>
            <div>
              <h2 className="text-[16px] font-medium tracking-tight text-foreground">
                Issue a viewing key
              </h2>
              <p className="mt-1 text-[13px] leading-5 text-muted-foreground">
                Date-ranged, read-only, revocable. The recipient can decrypt entries you signed for them, nothing else.
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="auditor">Auditor</Label>
              <Input id="auditor" placeholder="e.g. Trail of Bits" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="range">Date range</Label>
              <Input id="range" placeholder="2026-01-01 to 2026-03-31" />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="email" hint="Encrypted out-of-band">
              Delivery email
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="auditor@firm.example"
              autoComplete="off"
            />
          </div>

          <div className="flex flex-col gap-3 rounded-xl border border-dashed border-primary/20 bg-primary/5 p-4">
            {[
              "Generated locally from your master key.",
              "Hand off via your preferred encrypted channel.",
              "Revoke any time. Every receipt becomes unreadable instantly.",
            ].map((t, i) => (
              <motion.p
                key={t}
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.16 + i * 0.05, duration: 0.25 }}
                className="flex items-start gap-2 text-[12.5px] leading-5 text-foreground/85"
              >
                <HugeiconsIcon
                  icon={CheckmarkCircle01Icon}
                  size={13}
                  strokeWidth={2}
                  className="mt-0.5 text-primary"
                />
                {t}
              </motion.p>
            ))}
          </div>

          <FancyButton variant="primary" size="lg" className="self-start">
            Generate viewing key
            <HugeiconsIcon
              icon={ArrowRight01Icon}
              size={14}
              strokeWidth={2.2}
            />
          </FancyButton>
        </motion.section>

        <div className="flex flex-col gap-6">
          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.32, delay: 0.06, ease: [0.22, 1, 0.36, 1] }}
            className="rounded-2xl border border-border bg-card/60 p-6"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-[14px] font-medium tracking-tight text-foreground">
                Active keys
              </h3>
              <span className="font-mono text-[11px] text-muted-foreground">
                {KEYS.filter((k) => k.status === "active").length} issued
              </span>
            </div>

            <ul className="mt-4 flex flex-col gap-2">
              {KEYS.map((k, i) => (
                <motion.li
                  key={k.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    delay: 0.18 + i * 0.05,
                    duration: 0.28,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  className="group flex items-start gap-3 rounded-xl border border-border bg-background/40 p-3"
                >
                  <span
                    className={cn(
                      "mt-0.5 grid size-7 shrink-0 place-items-center rounded-md border",
                      k.status === "active"
                        ? "border-primary/20 bg-primary/10 text-primary"
                        : "border-border bg-background/60 text-muted-foreground",
                    )}
                  >
                    <HugeiconsIcon icon={EyeIcon} size={12} strokeWidth={1.8} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-foreground">
                      {k.auditor}
                    </p>
                    <p className="text-[11.5px] text-muted-foreground">
                      {k.range}
                    </p>
                    <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground/80">
                      {k.id}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label="Copy key id"
                    className="text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <HugeiconsIcon
                      icon={Copy01Icon}
                      size={13}
                      strokeWidth={1.8}
                    />
                  </button>
                </motion.li>
              ))}
            </ul>
          </motion.section>

          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.32, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
            className="rounded-2xl border border-border bg-card/60 p-6"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-[14px] font-medium tracking-tight text-foreground">
                Recent exports
              </h3>
              <HugeiconsIcon
                icon={FileSecurityIcon}
                size={14}
                strokeWidth={1.8}
                className="text-muted-foreground"
              />
            </div>

            <ul className="mt-4 flex flex-col gap-2">
              {EXPORTS.map((e, i) => (
                <motion.li
                  key={e.name}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    delay: 0.24 + i * 0.05,
                    duration: 0.28,
                  }}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background/40 p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-mono text-[12.5px] text-foreground">
                      {e.name}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {e.date} · {e.size}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label="Download"
                    className="grid size-8 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary"
                  >
                    <HugeiconsIcon
                      icon={Download01Icon}
                      size={14}
                      strokeWidth={1.8}
                    />
                  </button>
                </motion.li>
              ))}
            </ul>
          </motion.section>
        </div>
      </div>
    </>
  );
}
