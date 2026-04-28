"use client";

import type { ReactNode } from "react";

import { SolanaProvider } from "@/lib/solana/providers";

export function Providers({ children }: { children: ReactNode }) {
  return <SolanaProvider>{children}</SolanaProvider>;
}
