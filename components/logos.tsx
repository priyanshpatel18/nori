/**
 * Brand marks for the protocols Nori plugs into.
 *
 * Each logo is a single component that accepts `className` so it can be sized
 * with Tailwind. Marks are simplified for small sizes (24-40px) but stay
 * faithful to each brand's primary color and silhouette.
 */
import * as React from "react";

import { cn } from "@/lib/utils";

type LogoProps = React.SVGAttributes<SVGSVGElement> & {
  className?: string;
};

const baseProps = (className?: string): React.SVGAttributes<SVGSVGElement> => ({
  viewBox: "0 0 24 24",
  width: 24,
  height: 24,
  "aria-hidden": true,
  className: cn("size-6", className),
});

/* ------------------------------ Solana ----------------------------------- */

export function SolanaLogo({ className, ...props }: LogoProps) {
  return (
    <svg {...baseProps(className)} {...props}>
      <defs>
        <linearGradient id="sol-gradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#9945FF" />
          <stop offset="1" stopColor="#14F195" />
        </linearGradient>
      </defs>
      <path
        fill="url(#sol-gradient)"
        d="M5.6 8.6h12.5c.3 0 .5.4.3.6l-1.9 1.9a.4.4 0 0 1-.3.1H3.7c-.3 0-.5-.4-.3-.6l1.9-1.9c.1-.1.2-.1.3-.1Zm0 6.3h12.5c.3 0 .5.4.3.6l-1.9 1.9a.4.4 0 0 1-.3.1H3.7c-.3 0-.5-.4-.3-.6l1.9-1.9c.1-.1.2-.1.3-.1Zm14.7-3.5H7.8c-.3 0-.5-.4-.3-.6l1.9-1.9c.1-.1.2-.1.3-.1h12.5c.3 0 .5.4.3.6l-1.9 1.9a.4.4 0 0 1-.3.1Z"
      />
    </svg>
  );
}

/* ------------------------------- USDC ------------------------------------ */

export function UsdcLogo({ className, ...props }: LogoProps) {
  return (
    <svg {...baseProps(className)} {...props}>
      <circle cx="12" cy="12" r="11" fill="#2775CA" />
      <path
        fill="#fff"
        d="M11.5 4.6c-3.7.3-6.6 3.4-6.6 7.4 0 4 3 7.1 6.7 7.4v-1.6c-2.8-.3-5.1-2.6-5.1-5.5v-.1c.1-3 2.3-5.4 5-5.6V4.6Zm1 0v1.6c2.8.3 5 2.6 5 5.6v.1c0 2.9-2.2 5.2-5 5.5v1.6c3.7-.3 6.7-3.4 6.7-7.4 0-4-3-7.1-6.7-7.4Z"
      />
      <path
        fill="#fff"
        d="M11.6 8v.7c-1.2.1-2 .9-2 1.9 0 .9.7 1.5 1.9 1.7l.1 0c.9.2 1.3.4 1.3.9 0 .5-.4.8-1.2.8-1 0-1.6-.4-1.7-1H8.6c.1 1.1.9 1.8 2.2 2v.8h.9V15c1.3-.1 2.1-.9 2.1-1.9 0-1-.7-1.5-1.9-1.7l-.2 0c-.9-.2-1.3-.4-1.3-.9 0-.4.4-.7 1.1-.7.9 0 1.4.4 1.5.9h1.4c-.1-1-.9-1.7-2.1-1.9V8h-.9Z"
      />
    </svg>
  );
}

/* ------------------------------- USDT ------------------------------------ */

export function UsdtLogo({ className, ...props }: LogoProps) {
  return (
    <svg {...baseProps(className)} {...props}>
      <circle cx="12" cy="12" r="11" fill="#26A17B" />
      <path
        fill="#fff"
        d="M13.4 11.5v-1.4h3.2V8H7.4v2.1h3.2v1.4c-2.6.1-4.5.6-4.5 1.3 0 .6 1.9 1.2 4.5 1.3v4.4h2.8v-4.4c2.6-.1 4.5-.6 4.5-1.3 0-.6-1.9-1.2-4.5-1.3Zm0 2.2-.2 0c-.4.1-.9.1-1.4.1s-1 0-1.4-.1l-.2 0c-2.1-.1-3.7-.5-3.7-1 0-.4 1.6-.8 3.7-1v1.6c.4 0 .9.1 1.4.1s1 0 1.4-.1V11.7c2.1.1 3.7.5 3.7 1 0 .4-1.6.8-3.7 1Z"
      />
    </svg>
  );
}

/* ------------------------------- SOL ------------------------------------- */

export function SolLogo({ className, ...props }: LogoProps) {
  return (
    <svg {...baseProps(className)} {...props}>
      <defs>
        <linearGradient id="sol-coin" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#9945FF" />
          <stop offset="1" stopColor="#14F195" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="11" fill="url(#sol-coin)" opacity="0.18" />
      <circle cx="12" cy="12" r="11" fill="none" stroke="url(#sol-coin)" strokeOpacity="0.7" />
      <path
        fill="url(#sol-coin)"
        d="M7.5 9.5h7.8c.3 0 .4.3.2.5l-1 1c-.1.1-.2.1-.3.1H6.5c-.3 0-.4-.3-.2-.5l1-1c.1-.1.2-.1.3-.1Zm0 5h7.8c.3 0 .4.3.2.5l-1 1c-.1.1-.2.1-.3.1H6.5c-.3 0-.4-.3-.2-.5l1-1c.1-.1.2-.1.3-.1Zm9-2.5H8.7c-.3 0-.4-.3-.2-.5l1-1c.1-.1.2-.1.3-.1h7.8c.3 0 .4.3.2.5l-1 1c-.1.1-.2.1-.3.1Z"
      />
    </svg>
  );
}

/* ----------------------------- Phantom ----------------------------------- */

export function PhantomLogo({ className, ...props }: LogoProps) {
  return (
    <svg {...baseProps(className)} {...props}>
      <rect width="24" height="24" rx="6" fill="#AB9FF2" />
      <path
        fill="#fff"
        d="M19.7 12.3c0-4.3-3.4-7.7-7.7-7.7s-7.7 3.4-7.7 7.7c0 .8.6 1.4 1.4 1.4h2.5c.5 0 .9.3 1 .8l.2 1.1c.1.4.6.6.9.3 1.2-1 2.6-2.4 3-3.5.1-.3.4-.5.7-.5h.4c.4 0 .7.3.7.7v.7c0 .9.8 1.7 1.7 1.7h1.4c.7 0 1.5-.6 1.5-1.4v-1.3Zm-9.3 1.2a.9.9 0 1 1 0-1.9.9.9 0 0 1 0 1.9Zm3.4 0a.9.9 0 1 1 0-1.9.9.9 0 0 1 0 1.9Z"
      />
    </svg>
  );
}

/* ----------------------------- Solflare ---------------------------------- */

export function SolflareLogo({ className, ...props }: LogoProps) {
  return (
    <svg {...baseProps(className)} {...props}>
      <rect width="24" height="24" rx="6" fill="#0E0E15" />
      <defs>
        <linearGradient id="solflare-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFD747" />
          <stop offset="1" stopColor="#FC4F00" />
        </linearGradient>
      </defs>
      <path
        fill="url(#solflare-g)"
        d="M12 4.5c.6 2.6 2.5 4.5 5.1 5.1-2.6.6-4.5 2.5-5.1 5.1-.6-2.6-2.5-4.5-5.1-5.1 2.6-.6 4.5-2.5 5.1-5.1Zm-3.4 11c.4 1.6 1.6 2.7 3.1 3.1-1.6.4-2.7 1.6-3.1 3.1-.4-1.6-1.6-2.7-3.1-3.1 1.6-.4 2.7-1.6 3.1-3.1Z"
      />
    </svg>
  );
}

/* ----------------------------- Backpack ---------------------------------- */

export function BackpackLogo({ className, ...props }: LogoProps) {
  return (
    <svg {...baseProps(className)} {...props}>
      <rect width="24" height="24" rx="6" fill="#E33E3F" />
      <path
        fill="#fff"
        d="M9 5.6h6c.6 0 1 .4 1 1v.8c1.5.4 2.5 1.7 2.5 3.3v6.8c0 .6-.4 1-1 1h-11c-.6 0-1-.4-1-1v-6.8c0-1.6 1-2.9 2.5-3.3v-.8c0-.6.4-1 1-1Zm.5 1.4v.6h5v-.6h-5Zm-1.7 4.2v1.6h8.4v-1c0-1-.8-1.8-1.8-1.8H9.6c-1 0-1.8.8-1.8 1.8v-.6Z"
      />
    </svg>
  );
}

/* ------------------------------ Jupiter ---------------------------------- */

export function JupiterLogo({ className, ...props }: LogoProps) {
  return (
    <svg {...baseProps(className)} {...props}>
      <rect width="24" height="24" rx="6" fill="#0E1822" />
      <defs>
        <linearGradient id="jup-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#C7F284" />
          <stop offset="1" stopColor="#28B179" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="5.5" fill="none" stroke="url(#jup-g)" strokeWidth="1.5" />
      <path
        d="M5.5 12.5c2.6-2.5 7.5-3.5 13 0"
        fill="none"
        stroke="url(#jup-g)"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <circle cx="14.5" cy="9.5" r="1" fill="#C7F284" />
    </svg>
  );
}

/* ----------------------------- Cloak SDK --------------------------------- */

export function CloakLogo({ className, ...props }: LogoProps) {
  return (
    <svg {...baseProps(className)} {...props}>
      <rect width="24" height="24" rx="6" fill="var(--background)" />
      <circle
        cx="12"
        cy="12"
        r="6.5"
        fill="none"
        stroke="var(--primary)"
        strokeWidth="1.4"
      />
      <path d="M12 5.5a6.5 6.5 0 0 0 0 13V5.5Z" fill="var(--primary)" />
    </svg>
  );
}

/* ----------------------------- Nori mark --------------------------------- */

export function NoriMark({ className, ...props }: LogoProps) {
  return (
    <svg {...baseProps(className)} {...props}>
      <circle cx="12" cy="12" r="11" fill="var(--background)" />
      <circle
        cx="12"
        cy="12"
        r="10.5"
        fill="none"
        stroke="var(--primary)"
        strokeOpacity="0.35"
      />
      <path d="M12 1.5a10.5 10.5 0 0 0 0 21V1.5Z" fill="var(--primary)" />
    </svg>
  );
}

/**
 * Lookup table for any place that needs a "render a logo by id" pattern.
 */
export const PROTOCOL_LOGOS = {
  solana: { name: "Solana", Logo: SolanaLogo },
  sol: { name: "SOL", Logo: SolLogo },
  usdc: { name: "USDC", Logo: UsdcLogo },
  usdt: { name: "USDT", Logo: UsdtLogo },
  phantom: { name: "Phantom", Logo: PhantomLogo },
  solflare: { name: "Solflare", Logo: SolflareLogo },
  backpack: { name: "Backpack", Logo: BackpackLogo },
  jupiter: { name: "Jupiter", Logo: JupiterLogo },
  cloak: { name: "Cloak", Logo: CloakLogo },
} as const;

export type ProtocolId = keyof typeof PROTOCOL_LOGOS;
