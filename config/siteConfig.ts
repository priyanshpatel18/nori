import { Metadata } from "next";

const { title, titleLong, description, ogImage, baseURL, socials } = {
  title: "Nori",
  titleLong: "Nori | Private payroll on Solana",
  description:
    "Private payroll and payments on Solana. Pay contributors in SOL, USDC, and USDT with ZK-shielded transactions and selective compliance disclosure.",
  baseURL: "https://usenori.xyz",
  ogImage: "https://usenori.xyz/open-graph.png",
  socials: {
    xHandle: "UseNori",
    xUrl: "https://x.com/UseNori",
    githubOrg: "UseNori",
  },
};

export const siteConfig: Metadata = {
  title: {
    default: titleLong,
    template: `%s | ${title}`,
  },
  description,
  metadataBase: new URL(baseURL),
  openGraph: {
    title: titleLong,
    description,
    images: [ogImage],
    url: baseURL,
    siteName: title,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: titleLong,
    description,
    images: [ogImage],
    creator: `@${socials.xHandle}`,
    site: `@${socials.xHandle}`,
  },
  icons: {
    icon: "/favicon.ico",
  },
  applicationName: title,
  alternates: {
    canonical: baseURL,
  },
  keywords: [
    "Nori",
    "UseNori",
    "Solana",
    "private payroll",
    "crypto payroll",
    "ZK payments",
    "shielded payments",
    "USDC payroll",
    "batch payroll",
    "stealth payments",
    "DAO payroll",
    "Solana payments",
    "compliance export",
    "Cloak SDK",
  ],
};
