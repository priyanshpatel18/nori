import type { MetadataRoute } from "next";

const { appName, description } = {
  appName: "Nori",
  description:
    "Private payroll and payments on Solana. Pay contributors in SOL, USDC, and USDT with ZK-shielded transactions and selective compliance disclosure.",
};

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: appName,
    short_name: appName,
    description: description,
    start_url: "/",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#00F666",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
      {
        src: "/nori/mainlogo.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
