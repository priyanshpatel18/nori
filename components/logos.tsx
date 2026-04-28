import * as React from "react";

import { cn } from "@/lib/utils";

export type LogoProps = {
  className?: string;
  title?: string;
};

function PublicLogo({
  src,
  className,
  title,
}: {
  src: string;
  className?: string;
  title?: string;
}) {
  return (
    <img
      src={src}
      alt={title ?? ""}
      aria-hidden={title ? undefined : true}
      className={cn("size-6", className)}
      draggable={false}
    />
  );
}

// Public assets (from `nori/public/*`). Cloak excluded per earlier request.
export function SolanaLogo(props: LogoProps) {
  return <PublicLogo src="/Solana.svg" {...props} />;
}
export function UsdcLogo(props: LogoProps) {
  return <PublicLogo src="/USDC.svg" {...props} />;
}
export function UsdtLogo(props: LogoProps) {
  return <PublicLogo src="/USDT.svg" {...props} />;
}
export function PhantomLogo(props: LogoProps) {
  return <PublicLogo src="/PhantomApp.svg" {...props} />;
}
export function PhantomGhostLogo(props: LogoProps) {
  return <PublicLogo src="/PhantomGhost.svg" {...props} />;
}
export function SolflareLogo(props: LogoProps) {
  return <PublicLogo src="/Solflare.svg" {...props} />;
}
export function BackpackLogo(props: LogoProps) {
  return <PublicLogo src="/Backpack.svg" {...props} />;
}

// Kept inline (not sourced from `public/`).
export function CloakLogo({ className, title, ...props }: LogoProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      className={cn("size-6", className)}
      xmlns="http://www.w3.org/2000/svg"
      {...(props as React.SVGAttributes<SVGSVGElement>)}
    >
      {title ? <title>{title}</title> : null}
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

export function NoriMark({ className, title, ...props }: LogoProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      className={cn("size-6", className)}
      xmlns="http://www.w3.org/2000/svg"
      {...(props as React.SVGAttributes<SVGSVGElement>)}
    >
      {title ? <title>{title}</title> : null}
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

export const PROTOCOL_LOGOS = {
  solana: { name: "Solana", Logo: SolanaLogo },
  usdc: { name: "USDC", Logo: UsdcLogo },
  usdt: { name: "USDT", Logo: UsdtLogo },
  phantom: { name: "Phantom", Logo: PhantomLogo },
  solflare: { name: "Solflare", Logo: SolflareLogo },
  backpack: { name: "Backpack", Logo: BackpackLogo },
  cloak: { name: "Cloak", Logo: CloakLogo },
} as const;

export type ProtocolId = keyof typeof PROTOCOL_LOGOS;

