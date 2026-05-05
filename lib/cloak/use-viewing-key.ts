"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import * as React from "react";

import { createMemoizedSignMessage } from "@/lib/cloak/sign-message-cache";
import {
  getViewingKey,
  type ViewingKeyMaterial,
} from "@/lib/cloak/viewing-key-derive";

type SignMessage = (message: Uint8Array) => Promise<Uint8Array>;

export type ViewingKeyState =
  | { status: "idle" }
  | { status: "deriving" }
  | { status: "ready"; material: ViewingKeyMaterial }
  | { status: "error"; error: string };

export function useViewingKey() {
  const wallet = useWallet();
  const walletKey = wallet.publicKey?.toBase58() ?? null;
  const [state, setState] = React.useState<ViewingKeyState>({ status: "idle" });

  const signMessageCacheRef = React.useRef<{
    publicKey: string | null;
    fn: SignMessage | null;
  }>({ publicKey: null, fn: null });

  // If the wallet disconnects or switches, drop any revealed key from local
  // state so it's never displayed against the wrong account. React's
  // documented "adjust state during render" pattern: cheaper than an effect
  // and avoids the lint rule against synchronous setState in effects.
  const [stateWalletKey, setStateWalletKey] = React.useState<string | null>(
    walletKey,
  );
  if (stateWalletKey !== walletKey) {
    setStateWalletKey(walletKey);
    setState({ status: "idle" });
  }

  const reveal = React.useCallback(async () => {
    if (!wallet.publicKey || !wallet.signMessage) {
      setState({
        status: "error",
        error: "Connect a wallet that supports message signing.",
      });
      return;
    }

    const pk = wallet.publicKey.toBase58();
    let memoized = signMessageCacheRef.current.fn;
    if (signMessageCacheRef.current.publicKey !== pk || !memoized) {
      memoized = createMemoizedSignMessage(wallet.signMessage);
      signMessageCacheRef.current = { publicKey: pk, fn: memoized };
    }

    setState({ status: "deriving" });
    try {
      const material = await getViewingKey(pk, memoized);
      setState({ status: "ready", material });
    } catch (err) {
      setState({
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }, [wallet]);

  const hide = React.useCallback(() => setState({ status: "idle" }), []);

  return { state, reveal, hide };
}
