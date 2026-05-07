// Background poller for any submitted Solana signature. The SDK already
// confirms transactions before returning, but the relay-managed swap
// settlement (Tx2) and any future fire-and-forget paths need a primitive
// that keeps polling without blocking the UI thread.

import type {
  Connection,
  SignatureStatus,
  TransactionConfirmationStatus,
} from "@solana/web3.js";

const COMMITMENT_ORDER: TransactionConfirmationStatus[] = [
  "processed",
  "confirmed",
  "finalized",
];

export type WatchOptions = {
  /** Highest commitment level to wait for. Defaults to "confirmed". */
  commitment?: TransactionConfirmationStatus;
  /** Poll interval in ms. Default 3000. */
  pollIntervalMs?: number;
  /** Max wait time in ms. Default 90 seconds. */
  timeoutMs?: number;
  signal?: AbortSignal;
};

export type WatchOutcome =
  | { kind: "confirmed"; status: SignatureStatus; signature: string }
  | { kind: "failed"; signature: string; error: string }
  | { kind: "timeout"; signature: string }
  | { kind: "aborted"; signature: string };

export async function watchSignature(
  connection: Connection,
  signature: string,
  options: WatchOptions = {},
): Promise<WatchOutcome> {
  const target = options.commitment ?? "confirmed";
  const pollIntervalMs = options.pollIntervalMs ?? 3_000;
  const timeoutMs = options.timeoutMs ?? 90_000;
  const targetIdx = COMMITMENT_ORDER.indexOf(target);
  const startedAt = Date.now();

  while (true) {
    if (options.signal?.aborted) {
      return { kind: "aborted", signature };
    }
    if (Date.now() - startedAt > timeoutMs) {
      return { kind: "timeout", signature };
    }

    let status: SignatureStatus | null = null;
    try {
      const result = await connection.getSignatureStatus(signature, {
        searchTransactionHistory: true,
      });
      status = result?.value ?? null;
    } catch {
      // Transient network errors are expected; back off and retry.
      await sleep(pollIntervalMs, options.signal);
      continue;
    }

    if (status) {
      if (status.err) {
        return {
          kind: "failed",
          signature,
          error: stringifyErr(status.err),
        };
      }
      const confirmIdx = COMMITMENT_ORDER.indexOf(
        status.confirmationStatus ?? "processed",
      );
      if (confirmIdx >= 0 && confirmIdx >= targetIdx) {
        return { kind: "confirmed", status, signature };
      }
    }

    await sleep(pollIntervalMs, options.signal);
  }
}

function stringifyErr(err: unknown): string {
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      resolve();
    };
    signal?.addEventListener("abort", onAbort);
  });
}
