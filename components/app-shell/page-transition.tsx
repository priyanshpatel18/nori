"use client";

import { motion } from "motion/react";
import { usePathname } from "next/navigation";
import * as React from "react";

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <motion.div
      key={pathname}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className="flex min-h-0 flex-1 flex-col overflow-y-auto"
    >
      {children}
    </motion.div>
  );
}
