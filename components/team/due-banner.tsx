"use client";

import { ArrowRight01Icon, AlarmClockIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AnimatePresence, motion } from "motion/react";
import * as React from "react";

import { FancyButton } from "@/components/ui/fancy-button";
import { formatBaseUnits } from "@/lib/cloak/payment-history";
import type { DueGroup } from "@/lib/team/use-due-members";
import { toBaseUnits } from "@/lib/cloak/tokens";

export function DueBanner({
  total,
  groups,
  onRunNow,
}: {
  total: number;
  groups: DueGroup[];
  onRunNow: () => void;
}) {
  return (
    <AnimatePresence initial={false}>
      {total > 0 && (
        <motion.div
          key="due-banner"
          initial={{ opacity: 0, y: -8, height: 0 }}
          animate={{ opacity: 1, y: 0, height: "auto" }}
          exit={{ opacity: 0, y: -8, height: 0 }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          className="overflow-hidden"
        >
          <div className="relative flex flex-col gap-3 rounded-2xl border border-primary/40 bg-primary/10 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/20 text-primary"
              >
                <HugeiconsIcon
                  icon={AlarmClockIcon}
                  size={18}
                  strokeWidth={1.8}
                />
              </span>
              <div className="flex flex-col">
                <p className="text-[14.5px] font-medium text-foreground">
                  {total} payment{total === 1 ? "" : "s"} due now
                </p>
                <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                  {summarizeGroups(groups)}
                </p>
              </div>
            </div>

            <FancyButton
              type="button"
              variant="primary"
              size="md"
              onClick={onRunNow}
              className="self-stretch sm:self-auto"
            >
              Run now
              <HugeiconsIcon
                icon={ArrowRight01Icon}
                size={14}
                strokeWidth={2.2}
              />
            </FancyButton>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function summarizeGroups(groups: DueGroup[]): string {
  if (groups.length === 0) return "Awaiting wallet connection or token support.";
  const parts = groups.map((g) => {
    const total = g.members.reduce((acc, m) => {
      if (!m.schedule) return acc;
      try {
        return acc + toBaseUnits(m.schedule.amount, g.token.decimals);
      } catch {
        return acc;
      }
    }, 0n);
    const formatted = formatBaseUnits(total.toString(), g.token.decimals);
    return `${formatted} ${g.token.id}`;
  });
  return parts.join(" · ");
}
