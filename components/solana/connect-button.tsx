"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { WalletReadyState } from "@solana/wallet-adapter-base";
import Image from "next/image";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function formatPublicKey(publicKeyBase58: string) {
  return `${publicKeyBase58.slice(0, 4)}…${publicKeyBase58.slice(-4)}`;
}

export function ConnectButton() {
  const {
    publicKey,
    disconnect,
    connected,
    connecting,
    disconnecting,
    wallets,
    select,
  } = useWallet();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const isBusy = connecting || disconnecting;

  const connectableWallets = useMemo(() => {
    return wallets.filter((w) => w.readyState !== WalletReadyState.Unsupported);
  }, [wallets]);

  if (!connected || !publicKey) {
    return (
      <>
        <Button
          type="button"
          onClick={() => setIsDialogOpen(true)}
          disabled={isBusy}
          size="lg"
          className="px-5"
        >
          {connecting ? "Connecting…" : "Connect wallet"}
        </Button>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Connect wallet</DialogTitle>
              <DialogDescription>
                Choose a wallet to connect.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-2">
              {connectableWallets.map((w) => {
                const isDisabled = w.readyState === WalletReadyState.Unsupported;
                const subtitle =
                  w.readyState === WalletReadyState.Installed
                    ? "Installed"
                    : w.readyState === WalletReadyState.NotDetected
                      ? "Not detected"
                      : w.readyState === WalletReadyState.Loadable
                        ? "Loadable"
                        : undefined;

                return (
                  <Button
                    key={w.adapter.name}
                    type="button"
                    variant="outline"
                    className="h-auto justify-start gap-3 py-3"
                    disabled={isDisabled || isBusy}
                    onClick={() => {
                      select(w.adapter.name);
                      setIsDialogOpen(false);
                    }}
                  >
                    {w.adapter.icon ? (
                      <Image
                        src={w.adapter.icon}
                        alt={`${w.adapter.name} icon`}
                        width={20}
                        height={20}
                        unoptimized
                        className="size-5 shrink-0 rounded-sm"
                      />
                    ) : (
                      <span
                        aria-hidden="true"
                        className="size-5 shrink-0 rounded-sm bg-muted"
                      />
                    )}
                    <span className="flex flex-col items-start">
                      <span className="text-sm font-medium">
                        {w.adapter.name}
                      </span>
                      {subtitle && (
                        <span className="text-xs text-muted-foreground">
                          {subtitle}
                        </span>
                      )}
                    </span>
                  </Button>
                );
              })}
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  const address = publicKey.toBase58();

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="outline"
              disabled={isBusy}
              size="lg"
              className="px-5"
            />
          }
        >
          {formatPublicKey(address)}
        </DropdownMenuTrigger>

        <DropdownMenuContent sideOffset={8} align="end">
          <DropdownMenuItem
            onClick={async () => {
              await navigator.clipboard.writeText(address);
            }}
          >
            Copy address
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setIsDialogOpen(true)}>
            Change wallet
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => disconnect()}>
            Disconnect
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Switch wallet</DialogTitle>
            <DialogDescription>
              Select a different wallet.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            {connectableWallets.map((w) => {
              const isDisabled = w.readyState === WalletReadyState.Unsupported;
              const subtitle =
                w.readyState === WalletReadyState.Installed
                  ? "Installed"
                  : w.readyState === WalletReadyState.NotDetected
                    ? "Not detected"
                    : w.readyState === WalletReadyState.Loadable
                      ? "Loadable"
                      : undefined;

              return (
                <Button
                  key={w.adapter.name}
                  type="button"
                  variant="outline"
                  className="h-auto justify-start gap-3 py-3"
                  disabled={isDisabled || isBusy}
                  onClick={() => {
                    select(w.adapter.name);
                    setIsDialogOpen(false);
                  }}
                >
                  {w.adapter.icon ? (
                    <Image
                      src={w.adapter.icon}
                      alt={`${w.adapter.name} icon`}
                      width={20}
                      height={20}
                      unoptimized
                      className="size-5 shrink-0 rounded-sm"
                    />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="size-5 shrink-0 rounded-sm bg-muted"
                    />
                  )}
                  <span className="flex flex-col items-start">
                    <span className="text-sm font-medium">{w.adapter.name}</span>
                    {subtitle && (
                      <span className="text-xs text-muted-foreground">
                        {subtitle}
                      </span>
                    )}
                  </span>
                </Button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
