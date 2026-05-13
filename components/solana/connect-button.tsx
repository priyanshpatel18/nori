"use client";

import { useWallet, type Wallet } from "@solana/wallet-adapter-react";
import { WalletReadyState } from "@solana/wallet-adapter-base";
import Image from "next/image";
import { useMemo, useState, useSyncExternalStore } from "react";

import { BackpackLogo, PhantomLogo, SolflareLogo } from "@/components/logos";
import { Button } from "@/components/ui/button";
import { FancyButton } from "@/components/ui/fancy-button";
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
import { Spotlight } from "@/components/ui/spotlight";
import {
  isInAnyWalletInAppBrowser,
  isMobileDevice,
  MOBILE_WALLET_OPTIONS,
  walletInAppBrowserDeeplink,
  type MobileWalletId,
} from "@/lib/solana/mobile";

const MOBILE_WALLET_LOGOS: Record<MobileWalletId, React.ComponentType<{ className?: string }>> = {
  phantom: PhantomLogo,
  solflare: SolflareLogo,
  backpack: BackpackLogo,
};

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
        <FancyButton
          type="button"
          onClick={() => setIsDialogOpen(true)}
          disabled={isBusy}
          size="lg"
          variant="primary"
        >
          {connecting ? "Connecting…" : "Connect wallet"}
        </FancyButton>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Connect wallet</DialogTitle>
              <DialogDescription>
                Choose a wallet to connect.
              </DialogDescription>
            </DialogHeader>

            <WalletList
              wallets={connectableWallets}
              busy={isBusy}
              onSelect={(name) => {
                select(name);
                setIsDialogOpen(false);
              }}
            />

            <MobileDeeplinkSection
              hasInstalledWallet={connectableWallets.some(
                (w) => w.readyState === WalletReadyState.Installed,
              )}
            />
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
              className="px-3 sm:px-5"
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
            <DialogDescription>Select a different wallet.</DialogDescription>
          </DialogHeader>

          <WalletList
            wallets={connectableWallets}
            busy={isBusy}
            onSelect={(name) => {
              select(name);
              setIsDialogOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

function WalletList({
  wallets,
  busy,
  onSelect,
}: {
  wallets: Wallet[];
  busy: boolean;
  onSelect: (name: Wallet["adapter"]["name"]) => void;
}) {
  if (wallets.length === 0) return null;
  return (
    <div className="grid gap-2">
      {wallets.map((w) => {
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
          <Spotlight key={w.adapter.name} className="rounded-xl">
            <Button
              type="button"
              variant="outline"
              className="h-auto w-full justify-start gap-3 py-3"
              disabled={isDisabled || busy}
              onClick={() => onSelect(w.adapter.name)}
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
          </Spotlight>
        );
      })}
    </div>
  );
}

// SSR / first commit returns false; React swaps to true after hydration.
// Defers UA-dependent rendering so the server-rendered HTML never disagrees
// with the client's first paint.
const noopSubscribe = () => () => {};
function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

// Mobile users in iOS Safari / Chrome can't connect via Wallet Standard
// (wallets don't inject themselves into the page) and MWA is Android-only.
// The deeplink section gives them an "Open in <wallet>" shortcut that
// re-launches Nori inside the wallet's own in-app browser, where the wallet
// is injected and the standard list above starts working.
//
// Hidden when:
//   - The user is already inside a wallet in-app browser (deeplinks would
//     either re-open the same wallet or send them to a different one mid-flow).
//   - A Wallet Standard wallet is already `Installed` (extension on desktop,
//     or the in-app wallet successfully registered). Deeplinks would be noise.
//   - The device isn't mobile at all (desktop users have extensions).
function MobileDeeplinkSection({
  hasInstalledWallet,
}: {
  hasInstalledWallet: boolean;
}) {
  const hydrated = useHydrated();
  if (!hydrated) return null;

  const show =
    isMobileDevice() &&
    !isInAnyWalletInAppBrowser() &&
    !hasInstalledWallet;
  if (!show) return null;

  const currentUrl =
    typeof window !== "undefined" ? window.location.href : "https://usenori.xyz";
  const ref =
    typeof window !== "undefined"
      ? `${window.location.protocol}//${window.location.host}`
      : "https://usenori.xyz";

  return (
    <div className="mt-1 flex flex-col gap-2 border-t border-border pt-4">
      <p className="text-xs text-muted-foreground">
        On mobile? Open Nori inside your wallet app:
      </p>
      <div className="grid gap-2">
        {MOBILE_WALLET_OPTIONS.map((opt) => {
          const Logo = MOBILE_WALLET_LOGOS[opt.id];
          const href = walletInAppBrowserDeeplink(opt.id, currentUrl, ref);
          return (
            <Spotlight key={opt.id} className="rounded-xl">
              <a
                href={href}
                rel="noreferrer"
                className="flex h-auto w-full items-center gap-3 rounded-md border border-border bg-background/60 px-3 py-3 text-left transition-colors hover:border-primary/40 hover:bg-background/80"
              >
                <Logo className="size-5 shrink-0" />
                <span className="flex flex-col items-start">
                  <span className="text-sm font-medium">
                    Open in {opt.label}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Launches the {opt.label} app
                  </span>
                </span>
              </a>
            </Spotlight>
          );
        })}
      </div>
    </div>
  );
}
