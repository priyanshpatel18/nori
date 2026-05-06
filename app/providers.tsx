"use client";

import "@/lib/buffer-polyfill";
import "@/lib/cloak/init";

import type { ReactNode } from "react";

import { SolanaProvider } from "@/lib/solana/providers";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SolanaProvider>
      <TooltipProvider>{children}</TooltipProvider>
      <Toaster />
    </SolanaProvider>
  );
}
