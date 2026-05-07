// Surfaces stale-root retry attempts (RootNotFoundError / "is beyond
// next_index") as a single, auto-updating loading toast per scope. Keeps
// concurrent flows (fast-send + batch + swap) from clobbering each other
// by namespacing the toast id.

import { toast } from "@/lib/toast";

const TOAST_ID_PREFIX = "cloak:proof-refresh";

export type ProofRefreshScope =
  | { flow: "fast-send"; depositSignature?: string }
  | { flow: "swap"; depositSignature: string }
  | { flow: "batch"; runId: string; rowId: number };

function toastIdFor(scope: ProofRefreshScope): string {
  if (scope.flow === "fast-send") {
    return `${TOAST_ID_PREFIX}:fast-send:${scope.depositSignature ?? "pre-deposit"}`;
  }
  if (scope.flow === "swap") {
    return `${TOAST_ID_PREFIX}:swap:${scope.depositSignature}`;
  }
  return `${TOAST_ID_PREFIX}:batch:${scope.runId}:${scope.rowId}`;
}

export function showProofRefreshing(
  scope: ProofRefreshScope,
  attempt: number,
  max: number,
): void {
  const id = toastIdFor(scope);
  toast.loading("Refreshing proof", {
    id,
    description: `Pool advanced. Retrying ${attempt}/${max}.`,
  });
}

export function dismissProofRefreshing(scope: ProofRefreshScope): void {
  toast.dismiss(toastIdFor(scope));
}
