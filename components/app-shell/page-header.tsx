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
    <div className="flex flex-col gap-3 border-b border-border px-4 pt-5 pb-4 sm:flex-row sm:items-end sm:justify-between sm:px-8">
      <div className="min-w-0">
        {eyebrow && (
          <motion.p
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="font-mono text-[10.5px] font-medium uppercase tracking-[0.2em] text-primary/80"
          >
            {eyebrow}
          </motion.p>
        )}
        <motion.h1
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.04 }}
          className="mt-1.5 text-[24px] font-semibold leading-tight tracking-tight text-foreground sm:text-[28px]"
        >
          {title}
        </motion.h1>
        {description && (
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.08 }}
            className="mt-2 max-w-xl text-[13.5px] leading-5 text-muted-foreground"
          >
            {description}
          </motion.p>
        )}
      </div>

      {actions && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.12 }}
          className="flex shrink-0 items-center gap-2"
        >
          {actions}
        </motion.div>
      )}
    </div>
  );
}
