"use client";

import type { ReactNode } from "react";

import { SolanaProvider } from "@/lib/solana/providers";
import { TooltipProvider } from "@/components/ui/tooltip";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SolanaProvider>
      <TooltipProvider>{children}</TooltipProvider>
    </SolanaProvider>
  );
}
