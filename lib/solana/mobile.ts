// Helpers for routing mobile users into a wallet's in-app browser.
//
// On iOS Safari / Chrome — and Android browsers without Mobile Wallet Adapter
// support — no Solana wallet injects itself into the page, so the Wallet
// Standard adapter list is empty and the Connect dialog has nothing to offer.
// The accepted workaround is the wallet's "browse" universal link: tapping it
// opens the wallet app and re-loads the dApp inside the wallet's own in-app
// browser, where the wallet *is* injected and the normal Connect flow works.
//
// Detection here is intentionally UA-based. Wallet Standard's `Installed`
// status is the source of truth for whether a wallet is actually usable; UA
// sniffing only decides whether to surface the deeplink shortcuts at all.

export type MobileWalletId = "phantom" | "solflare" | "backpack";

function userAgent(): string {
  if (typeof navigator === "undefined") return "";
  return navigator.userAgent || "";
}

export function isIOSDevice(): boolean {
  const ua = userAgent();
  // iPadOS 13+ reports as "Macintosh" with touch support; check both.
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  if (
    typeof navigator !== "undefined" &&
    /Mac/i.test(ua) &&
    "maxTouchPoints" in navigator &&
    navigator.maxTouchPoints > 1
  ) {
    return true;
  }
  return false;
}

export function isAndroidDevice(): boolean {
  return /Android/i.test(userAgent());
}

export function isMobileDevice(): boolean {
  return isIOSDevice() || isAndroidDevice();
}

// Each wallet's in-app browser leaves a distinctive token in the UA. We check
// these so we never show "Open in Phantom" while the user is already inside
// Phantom — in that case the wallet is injected and the normal list works.
const IN_APP_UA_PATTERNS: Record<MobileWalletId, RegExp> = {
  phantom: /Phantom/i,
  solflare: /Solflare/i,
  backpack: /Backpack/i,
};

export function isInWalletInAppBrowser(wallet: MobileWalletId): boolean {
  return IN_APP_UA_PATTERNS[wallet].test(userAgent());
}

export function isInAnyWalletInAppBrowser(): boolean {
  return (
    isInWalletInAppBrowser("phantom") ||
    isInWalletInAppBrowser("solflare") ||
    isInWalletInAppBrowser("backpack")
  );
}

// Universal-link templates for each wallet's "open this URL in my in-app
// browser" deeplink. Verified against each wallet's public deeplink docs.
// HTTPS universal links degrade gracefully: tapping the link with the wallet
// installed launches it, without it the user lands on the wallet's marketing
// page where they can install. App schemes (phantom://, solflare://, etc.)
// 404 silently when the app isn't installed, so we avoid them.
const DEEPLINK_TEMPLATES: Record<MobileWalletId, (url: string, ref: string) => string> = {
  phantom: (url, ref) =>
    `https://phantom.app/ul/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent(ref)}`,
  solflare: (url, ref) =>
    `https://solflare.com/ul/v1/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent(ref)}`,
  backpack: (url, ref) =>
    `https://backpack.app/ul/v1/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent(ref)}`,
};

// Build a deeplink that re-opens the *current* page inside the wallet's in-app
// browser. The `ref` parameter is the same origin so the wallet's analytics /
// safe-browsing checks can identify Nori as the requester.
export function walletInAppBrowserDeeplink(
  wallet: MobileWalletId,
  currentUrl: string,
  ref: string,
): string {
  return DEEPLINK_TEMPLATES[wallet](currentUrl, ref);
}

export type MobileWalletOption = {
  id: MobileWalletId;
  label: string;
  appStoreUrl: string;
};

// Order matches market share on Solana mobile — Phantom first, then Solflare,
// then Backpack. The connect dialog renders them in this order so the most
// likely tap target sits on top.
export const MOBILE_WALLET_OPTIONS: readonly MobileWalletOption[] = [
  {
    id: "phantom",
    label: "Phantom",
    appStoreUrl: "https://phantom.app/download",
  },
  {
    id: "solflare",
    label: "Solflare",
    appStoreUrl: "https://solflare.com/download",
  },
  {
    id: "backpack",
    label: "Backpack",
    appStoreUrl: "https://backpack.app/downloads",
  },
] as const;
