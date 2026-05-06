"use client";

import { motion } from "motion/react";
import * as React from "react";

import { cn } from "@/lib/utils";

export type EmptyStateProps = {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  as?: "div" | "li";
  size?: "sm" | "md";
};

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  as = "div",
  size = "md",
}: EmptyStateProps) {
  const sizing =
    size === "sm"
      ? "gap-2 px-4 py-8"
      : "gap-3 px-6 py-12 sm:px-8 sm:py-14";
  const iconBox =
    size === "sm" ? "size-9 rounded-xl" : "size-12 rounded-2xl";
  const titleSize = size === "sm" ? "text-[13.5px]" : "text-[15px]";
  const descSize = size === "sm" ? "text-[12px]" : "text-[13px]";

  const Tag = as === "li" ? motion.li : motion.div;

  return (
    <Tag
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "grid place-items-center rounded-2xl border border-dashed border-border bg-card/40 text-center",
        sizing,
        className,
      )}
    >
      {icon && (
        <span
          aria-hidden="true"
          className={cn(
            "grid place-items-center border border-primary/20 bg-primary/10 text-primary",
            iconBox,
          )}
        >
          {icon}
        </span>
      )}
      <div className="flex flex-col gap-1">
        <p className={cn("font-medium text-foreground", titleSize)}>{title}</p>
        {description && (
          <p
            className={cn(
              "max-w-sm text-muted-foreground",
              descSize,
            )}
          >
            {description}
          </p>
        )}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </Tag>
  );
}
