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

function solscanSuffix(): string {
  switch (solanaConfig.cluster) {
    case "mainnet-beta":
      return "";
    case "devnet":
      return "?cluster=devnet";
    case "testnet":
      return "?cluster=testnet";
    case "localnet":
      return `?cluster=custom&customUrl=${encodeURIComponent(solanaConfig.rpcUrl)}`;
  }
}

export function solscanTxUrl(signature: string): string {
  return `https://solscan.io/tx/${signature}${solscanSuffix()}`;
}

export function solscanAddressUrl(address: string): string {
  return `https://solscan.io/account/${address}${solscanSuffix()}`;
}
