"use client";

import { fullWithdraw, RelayService } from "@cloak.dev/sdk";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import * as React from "react";

import { applyBufferPolyfill } from "@/lib/buffer-polyfill";
import { cloakConfig } from "@/lib/cloak/config";
import {
  deserializeUtxo,
  isUnresolved,
  loadPendingSwaps,
  removePendingSwap,
  updatePendingSwap,
  type PendingSwapRecord,
} from "@/lib/cloak/pending-swaps";
import { createMemoizedSignMessage } from "@/lib/cloak/sign-message-cache";
import { solanaConfig, type SolanaCluster } from "@/lib/solana/config";

export type RecoveryActionStatus = "idle" | "running" | "success" | "error";

type ActionState = {
  id: string | null;
  kind: "refund" | "poll" | null;
  status: RecoveryActionStatus;
  error: Error | null;
};

const IDLE_ACTION: ActionState = {
  id: null,
  kind: null,
  status: "idle",
  error: null,
};

export type UseSwapRecovery = {
  pending: PendingSwapRecord[];
  unresolved: PendingSwapRecord[];
  action: ActionState;
  /** Re-query the relay for a pending swap; flips the local record to
   *  `settled` if the relay now reports completion. */
  poll: (record: PendingSwapRecord) => Promise<void>;
  /** Run fullWithdraw on the deposit's persisted output UTXOs to refund
   *  the sender's wallet. Updates the record to `refunded` on success. */
  refund: (record: PendingSwapRecord) => Promise<void>;
  /** Drop a record (typically used after the user inspects a settled or
   *  refunded entry). */
  dismiss: (record: PendingSwapRecord) => void;
};

export function useSwapRecovery(): UseSwapRecovery {
  const { connection } = useConnection();
  const wallet = useWallet();
  const walletKey = wallet.publicKey?.toBase58() ?? null;
  const cluster: SolanaCluster = solanaConfig.cluster;

  const cacheRef = React.useRef<{
    walletKey: string | null;
    serialized: string;
    value: PendingSwapRecord[];
  }>({ walletKey: null, serialized: "[]", value: [] });

  const subscribe = React.useCallback(
    (notify: () => void) => {
      if (typeof window === "undefined") return () => {};
      const onCustom = (e: Event) => {
        const detail = (e as CustomEvent<{ wallet: string; cluster: string }>)
          .detail;
        if (
          !detail ||
          (detail.wallet === walletKey && detail.cluster === cluster)
        ) {
          notify();
        }
      };
      const onStorage = (e: StorageEvent) => {
        if (!e.key) return;
        if (e.key.startsWith("cloak:pending-swaps:v1:")) notify();
      };
      window.addEventListener("cloak:pending-swaps-updated", onCustom);
      window.addEventListener("storage", onStorage);
      return () => {
        window.removeEventListener("cloak:pending-swaps-updated", onCustom);
        window.removeEventListener("storage", onStorage);
      };
    },
    [walletKey, cluster],
  );

  const getSnapshot = React.useCallback((): PendingSwapRecord[] => {
    if (typeof window === "undefined") return cacheRef.current.value;
    const fresh = loadPendingSwaps(walletKey, cluster);
    const serialized = JSON.stringify(fresh);
    const cache = cacheRef.current;
    if (cache.walletKey === walletKey && cache.serialized === serialized) {
      return cache.value;
    }
    cacheRef.current = { walletKey, serialized, value: fresh };
    return fresh;
  }, [walletKey, cluster]);

  const pending = React.useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => cacheRef.current.value,
  );

  const unresolved = React.useMemo(
    () => pending.filter(isUnresolved),
    [pending],
  );

  const [action, setAction] = React.useState<ActionState>(IDLE_ACTION);

  const poll = React.useCallback(
    async (record: PendingSwapRecord) => {
      if (!record.requestId) {
        setAction({
          id: record.id,
          kind: "poll",
          status: "error",
          error: new Error(
            "No request id was recorded for this swap; nothing to poll.",
          ),
        });
        return;
      }
      setAction({
        id: record.id,
        kind: "poll",
        status: "running",
        error: null,
      });
      try {
        const relay = new RelayService(cloakConfig.relayUrl);
        const status = await relay.getStatus(record.requestId);
        if (status.status === "completed") {
          updatePendingSwap(record.wallet, record.cluster, record.id, {
            status: "settled",
            settlementSignature: status.txId ?? record.settlementSignature,
          });
          setAction({
            id: record.id,
            kind: "poll",
            status: "success",
            error: null,
          });
        } else if (status.status === "failed") {
          updatePendingSwap(record.wallet, record.cluster, record.id, {
            status: "needs-recovery",
            error: status.error ?? "Relay reported failure.",
          });
          setAction({
            id: record.id,
            kind: "poll",
            status: "success",
            error: null,
          });
        } else {
          // still in flight, leave the record alone.
          setAction({
            id: record.id,
            kind: "poll",
            status: "success",
            error: null,
          });
        }
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        setAction({
          id: record.id,
          kind: "poll",
          status: "error",
          error: e,
        });
      }
    },
    [],
  );

  const refund = React.useCallback(
    async (record: PendingSwapRecord) => {
      if (!wallet.publicKey || !wallet.signTransaction || !wallet.signMessage) {
        setAction({
          id: record.id,
          kind: "refund",
          status: "error",
          error: new Error(
            "Connect a wallet that supports signing to run a refund.",
          ),
        });
        return;
      }
      if (record.outputUtxos.length === 0) {
        setAction({
          id: record.id,
          kind: "refund",
          status: "error",
          error: new Error("No output UTXOs were persisted for this swap."),
        });
        return;
      }

      applyBufferPolyfill();

      setAction({
        id: record.id,
        kind: "refund",
        status: "running",
        error: null,
      });

      const memoized = createMemoizedSignMessage(wallet.signMessage);
      const recipient = new PublicKey(record.wallet);

      try {
        const result = await fullWithdraw(
          record.outputUtxos.map(deserializeUtxo),
          recipient,
          {
            connection,
            programId: cloakConfig.programId,
            relayUrl: cloakConfig.relayUrl,
            walletPublicKey: recipient,
            signTransaction: wallet.signTransaction,
            signMessage: memoized,
            enforceViewingKeyRegistration: false,
          },
        );
        updatePendingSwap(record.wallet, record.cluster, record.id, {
          status: "refunded",
          refundSignature: result.signature,
        });
        setAction({
          id: record.id,
          kind: "refund",
          status: "success",
          error: null,
        });
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        updatePendingSwap(record.wallet, record.cluster, record.id, {
          status: "needs-recovery",
          error: e.message,
        });
        setAction({
          id: record.id,
          kind: "refund",
          status: "error",
          error: e,
        });
      }
    },
    [connection, wallet],
  );

  const dismiss = React.useCallback((record: PendingSwapRecord) => {
    removePendingSwap(record.wallet, record.cluster, record.id);
  }, []);

  return { pending, unresolved, action, poll, refund, dismiss };
}
