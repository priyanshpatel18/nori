import {
  CloakError,
  RelayInternalError,
  RootNotFoundError,
  SanctionsQuoteError,
  UtxoAlreadySpentError,
  isRootNotFoundError,
} from "@cloak.dev/sdk";

import { isStaleNoteError } from "./fast-send-core";
import { InsufficientShieldedBalanceError } from "./shield-core";
import { SwapFailedAfterDepositError } from "./swap-core";

export type UiError = {
  title: string;
  message: string;
  suggestion?: string;
  retryable: boolean;
};

/**
 * Map any thrown error from SDK / app code into UI-ready copy.
 * Preference order: specific error classes → CloakError categories → generic.
 */
export function formatCloakError(err: unknown): UiError {
  if (err instanceof InsufficientShieldedBalanceError) {
    return {
      title: "Not enough shielded balance",
      message:
        "You're trying to send more than this device's shielded notes cover.",
      suggestion:
        "Sync from chain to pull notes shielded on other devices, or reduce the amount.",
      retryable: false,
    };
  }

  if (err instanceof SwapFailedAfterDepositError) {
    if (err.recovery.kind === "refunded") {
      return {
        title: "Swap failed, deposit refunded",
        message:
          "Your deposit was returned to your wallet automatically.",
        retryable: true,
      };
    }
    if (err.recovery.kind === "refund-failed") {
      return {
        title: "Swap failed, refund pending",
        message:
          "The swap couldn't complete and the auto-refund didn't land.",
        suggestion: "Open Swap recovery and try the refund again.",
        retryable: false,
      };
    }
    return {
      title: "Swap failed after deposit",
      message: "Your deposit landed but the swap didn't.",
      suggestion: "Open Swap recovery to refund or retry the swap.",
      retryable: false,
    };
  }

  if (err instanceof UtxoAlreadySpentError) {
    return {
      title: "Note already spent",
      message:
        "These shielded notes were already spent, likely from another device or session.",
      suggestion: "Sync from chain to refresh your local view, then try again.",
      retryable: true,
    };
  }

  if (err instanceof RootNotFoundError || isRootNotFoundError(err)) {
    return {
      title: "Pool advanced — proof out of date",
      message:
        "More deposits landed while we were preparing your proof, so its Merkle root is no longer in history.",
      suggestion: "Try again. We'll regenerate the proof against the fresh root.",
      retryable: true,
    };
  }

  if (err instanceof SanctionsQuoteError) {
    const subKind = err.subKind;
    return {
      title: "Compliance quote rejected on-chain",
      message:
        subKind === "expired"
          ? "The relay's compliance quote expired before the transaction landed."
          : subKind === "wallet_mismatch"
            ? "The compliance quote was issued for a different wallet."
            : "The compliance instruction was missing from the transaction.",
      suggestion:
        subKind === "expired"
          ? "Try again. We'll request a fresh quote."
          : "If this keeps happening, the relay may be on a different version. Reach out to support.",
      retryable: subKind === "expired",
    };
  }

  if (err instanceof RelayInternalError) {
    return {
      title: "Relay error",
      message: err.relayMessage?.trim()
        ? err.relayMessage
        : "The relay returned an internal error.",
      suggestion: "Try again in a moment.",
      retryable: true,
    };
  }

  if (isStaleNoteError(err)) {
    return {
      title: "Local notes are stale",
      message:
        "This device's view of the pool is behind the chain — your saved notes don't match the relay's tree.",
      suggestion: "Sync from chain and try again.",
      retryable: true,
    };
  }

  if (err instanceof CloakError || isCloakErrorShape(err)) {
    return mapCloakCategory(err as CloakError);
  }

  if (err instanceof Error) {
    return {
      title: "Something went wrong",
      message: err.message || "Unknown error.",
      retryable: false,
    };
  }

  return {
    title: "Something went wrong",
    message: typeof err === "string" && err.trim() ? err : "Unknown error.",
    retryable: false,
  };
}

function isCloakErrorShape(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "category" in err &&
    "retryable" in err &&
    "message" in err
  );
}

function mapCloakCategory(err: CloakError): UiError {
  switch (err.category) {
    case "wallet":
      return {
        title: "Wallet rejected the request",
        message:
          err.message ||
          "Your wallet declined the signing request, or the popup was dismissed.",
        suggestion: "Open your wallet, approve the request, and retry.",
        retryable: true,
      };
    case "network":
      return {
        title: "Network error",
        message:
          err.message ||
          "Couldn't reach the relay or the Solana cluster.",
        suggestion: "Check your connection and try again.",
        retryable: true,
      };
    case "validation":
      return {
        title: "Invalid input",
        message: err.message || "One of the fields didn't pass validation.",
        retryable: false,
      };
    case "service":
    case "relay":
      return {
        title: "Service unavailable",
        message:
          err.message ||
          "The Cloak relay didn't respond as expected.",
        suggestion: "Try again in a moment.",
        retryable: err.retryable,
      };
    case "prover":
      return {
        title: "Proof generation failed",
        message:
          err.message ||
          "The ZK proof couldn't be built in the browser.",
        suggestion: "Reload the page and try again.",
        retryable: err.retryable,
      };
    case "indexer":
      return {
        title: "Pool indexer behind",
        message:
          err.message ||
          "The relay's pool snapshot hasn't caught up to the chain yet.",
        suggestion: "Try again in a moment.",
        retryable: true,
      };
    case "environment":
      return {
        title: "Environment misconfigured",
        message:
          err.message ||
          "The SDK is missing a required configuration value.",
        suggestion: "Reach out to support — this is likely a config issue.",
        retryable: false,
      };
    default:
      return {
        title: "Something went wrong",
        message: err.message || "Unknown error.",
        retryable: err.retryable,
      };
  }
}
