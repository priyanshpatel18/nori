"use client";

import { address as toAddress } from "@solana/kit";
import { useEffect, useState } from "react";

import { rpc } from "../rpc";

type Idle = { status: "idle"; lamports: null; error: null };
type Loading = { status: "loading"; lamports: bigint | null; error: null };
type Success = { status: "success"; lamports: bigint; error: null };
type Failure = { status: "error"; lamports: null; error: Error };

export type SolBalanceState = Idle | Loading | Success | Failure;

export function useSolBalance(addressString: string | null | undefined) {
  const [state, setState] = useState<SolBalanceState>({
    status: "idle",
    lamports: null,
    error: null,
  });

  useEffect(() => {
    if (!addressString) {
      setState({ status: "idle", lamports: null, error: null });
      return;
    }

    let cancelled = false;
    setState((prev) => ({
      status: "loading",
      lamports: prev.status === "success" ? prev.lamports : null,
      error: null,
    }));

    (async () => {
      try {
        const { value } = await rpc.getBalance(toAddress(addressString)).send();
        if (!cancelled) {
          setState({ status: "success", lamports: value, error: null });
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            status: "error",
            lamports: null,
            error: error instanceof Error ? error : new Error(String(error)),
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [addressString]);

  return state;
}
