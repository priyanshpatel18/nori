"use client";

import {
  useConnection,
  useWallet,
} from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import * as React from "react";

import { fastSendOnce, type FastSendPhase } from "./fast-send-core";

export type BatchRowInput = {
  /** Stable id from the parsed CSV (rowNumber). */
  id: number;
  recipient: string; // base58
  amountBaseUnits: bigint;
};

export type BatchRowStatus =
  | "pending"
  | "proving-deposit"
  | "submitting-deposit"
  | "proving-withdraw"
  | "submitting-withdraw"
  | "confirmed"
  | "failed";

export type BatchRowState = {
  status: BatchRowStatus;
  progress: string | null;
  proofPercent: number | null;
  depositSignature?: string;
  withdrawSignature?: string;
  errorMessage?: string;
};

export type BatchRunStatus = "idle" | "running" | "done";

export type BatchRunSummary = {
  total: number;
  confirmed: number;
  failed: number;
  startedAt: number;
  finishedAt: number;
};

export type BatchPayrollState = {
  status: BatchRunStatus;
  rows: Record<number, BatchRowState>;
  activeRowId: number | null;
  summary: BatchRunSummary | null;
};

const initialState: BatchPayrollState = {
  status: "idle",
  rows: {},
  activeRowId: null,
  summary: null,
};

export type RunBatchArgs = {
  rows: BatchRowInput[];
  mint: PublicKey;
};

export function useBatchPayroll() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [state, setState] = React.useState<BatchPayrollState>(initialState);
  const cancelRef = React.useRef(false);

  const reset = React.useCallback(() => {
    cancelRef.current = false;
    setState(initialState);
  }, []);

  const cancel = React.useCallback(() => {
    cancelRef.current = true;
  }, []);

  const run = React.useCallback(
    async ({ rows, mint }: RunBatchArgs) => {
      if (!wallet.publicKey) throw new Error("Connect your wallet first.");
      if (!wallet.signTransaction)
        throw new Error("Wallet does not support transaction signing.");
      if (!wallet.signMessage)
        throw new Error(
          "Wallet does not support signMessage, which is required to register the viewing key.",
        );
      if (rows.length === 0) return null;

      const sender = wallet.publicKey;
      cancelRef.current = false;
      const startedAt = Date.now();

      const initialRows: Record<number, BatchRowState> = {};
      for (const r of rows) {
        initialRows[r.id] = {
          status: "pending",
          progress: null,
          proofPercent: null,
        };
      }
      setState({
        status: "running",
        rows: initialRows,
        activeRowId: null,
        summary: null,
      });

      const results: Array<
        | { id: number; ok: true; depositSig: string; withdrawSig: string }
        | { id: number; ok: false; error: Error }
      > = [];

      for (const row of rows) {
        if (cancelRef.current) break;

        setState((s) => ({
          ...s,
          activeRowId: row.id,
          rows: {
            ...s.rows,
            [row.id]: {
              status: "proving-deposit",
              progress: "Generating deposit proof",
              proofPercent: 0,
            },
          },
        }));

        try {
          const recipientPubkey = new PublicKey(row.recipient);
          const result = await fastSendOnce({
            amountBaseUnits: row.amountBaseUnits,
            mint,
            recipient: recipientPubkey,
            sender,
            connection,
            signTransaction: wallet.signTransaction,
            signMessage: wallet.signMessage,
            onPhase: (phase) =>
              setState((s) => updateRowPhase(s, row.id, phase)),
            onProgress: (msg) =>
              setState((s) => updateRowProgress(s, row.id, msg)),
            onProofProgress: (percent) =>
              setState((s) => updateRowProof(s, row.id, percent)),
          });

          results.push({
            id: row.id,
            ok: true,
            depositSig: result.depositSignature,
            withdrawSig: result.withdrawSignature,
          });

          setState((s) => ({
            ...s,
            rows: {
              ...s.rows,
              [row.id]: {
                status: "confirmed",
                progress: null,
                proofPercent: 100,
                depositSignature: result.depositSignature,
                withdrawSignature: result.withdrawSignature,
              },
            },
          }));
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          logBatchRowError(error, row);
          results.push({ id: row.id, ok: false, error });
          setState((s) => ({
            ...s,
            rows: {
              ...s.rows,
              [row.id]: {
                status: "failed",
                progress: null,
                proofPercent: null,
                errorMessage: error.message,
              },
            },
          }));
          // Continue to next row — failures don't abort the rest.
        }
      }

      const finishedAt = Date.now();
      const confirmed = results.filter((r) => r.ok).length;
      const failed = results.filter((r) => !r.ok).length;

      setState((s) => ({
        ...s,
        status: "done",
        activeRowId: null,
        summary: {
          total: rows.length,
          confirmed,
          failed,
          startedAt,
          finishedAt,
        },
      }));

      return {
        confirmed,
        failed,
        total: rows.length,
        results,
      };
    },
    [connection, wallet],
  );

  return { ...state, run, reset, cancel };
}

function updateRowPhase(
  s: BatchPayrollState,
  id: number,
  phase: FastSendPhase,
): BatchPayrollState {
  const current = s.rows[id];
  if (!current) return s;
  if (current.status === "confirmed" || current.status === "failed") return s;

  const status: BatchRowStatus =
    phase === "deposit-proof"
      ? "proving-deposit"
      : phase === "deposit-submit"
        ? "submitting-deposit"
        : phase === "withdraw-proof"
          ? "proving-withdraw"
          : phase === "withdraw-submit"
            ? "submitting-withdraw"
            : "confirmed";

  return {
    ...s,
    rows: {
      ...s.rows,
      [id]: {
        ...current,
        status,
        proofPercent:
          status === "proving-deposit" || status === "proving-withdraw"
            ? 0
            : current.proofPercent,
      },
    },
  };
}

function updateRowProgress(
  s: BatchPayrollState,
  id: number,
  message: string,
): BatchPayrollState {
  const current = s.rows[id];
  if (!current) return s;
  if (current.status === "confirmed" || current.status === "failed") return s;
  return {
    ...s,
    rows: { ...s.rows, [id]: { ...current, progress: message } },
  };
}

function updateRowProof(
  s: BatchPayrollState,
  id: number,
  percent: number,
): BatchPayrollState {
  const current = s.rows[id];
  if (!current) return s;
  if (current.status === "confirmed" || current.status === "failed") return s;
  const clamped =
    !Number.isFinite(percent) ? 0 : Math.max(0, Math.min(100, percent));
  const next = Math.max(current.proofPercent ?? 0, clamped);
  return {
    ...s,
    rows: { ...s.rows, [id]: { ...current, proofPercent: next } },
  };
}

function logBatchRowError(error: Error, row: BatchRowInput): void {
  console.group(`[cloak] batch row #${row.id} failed`);
  console.error(error);
  if (error.stack) console.error("stack:", error.stack);
  console.error("row:", {
    recipient: row.recipient,
    amountBaseUnits: row.amountBaseUnits.toString(),
  });
  console.groupEnd();
}
