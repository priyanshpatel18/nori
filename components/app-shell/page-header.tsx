"use client";

import { motion } from "motion/react";
import * as React from "react";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-border px-4 pt-7 pb-6 sm:flex-row sm:items-end sm:justify-between sm:px-8 sm:pt-8 sm:pb-7">
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.22, 0.6, 0.2, 1] }}
        className="min-w-0"
      >
        {eyebrow ? (
          <p className="text-[13px] text-foreground/55">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="mt-1 text-[26px] font-semibold leading-[1.08] tracking-[-0.02em] text-foreground sm:text-[30px]">
          {title}
        </h1>
        {description ? (
          <p className="mt-3 max-w-[58ch] text-[14.5px] leading-7 text-foreground/65">
            {description}
          </p>
        ) : null}
      </motion.div>

      {actions ? (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05, ease: [0.22, 0.6, 0.2, 1] }}
          className="flex shrink-0 items-center gap-2"
        >
          {actions}
        </motion.div>
      ) : null}
    </div>
  );
}
