import { solanaConfig } from "./config";

function clusterSuffix(): string {
  return solanaConfig.cluster === "mainnet-beta"
    ? ""
    : `?cluster=${solanaConfig.cluster}`;
}

export function explorerTxUrl(signature: string): string {
  return `https://explorer.solana.com/tx/${signature}${clusterSuffix()}`;
}

export function explorerAddressUrl(addressString: string): string {
  return `https://explorer.solana.com/address/${addressString}${clusterSuffix()}`;
}
