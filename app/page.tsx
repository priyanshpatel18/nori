import { ConnectButton } from "@/components/solana/connect-button";
import { SolBalance } from "@/components/solana/sol-balance";

export default function Home() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 w-full max-w-3xl flex-col items-center justify-center gap-8 py-32 px-8 sm:items-start sm:px-16">
        <span className="inline-flex items-center rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium uppercase tracking-widest text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
          Nori, private payroll on Solana
        </span>
        <div className="flex flex-col items-center gap-6 text-center sm:items-start sm:text-left">
          <h1 className="max-w-2xl text-4xl font-semibold leading-tight tracking-tight text-black dark:text-zinc-50 sm:text-5xl">
            Your payroll is public on Solana. It doesn&apos;t have to be.
          </h1>
          <p className="max-w-md text-lg leading-8 text-zinc-600 dark:text-zinc-400">
            Pay contributors in SOL, USDC, and USDT with ZK shielded
            transactions. Upload a CSV, run payroll in one click, and export a
            compliance report when your auditor asks.
          </p>
        </div>
        <ul className="grid w-full max-w-md gap-3 text-sm text-zinc-600 dark:text-zinc-400 sm:grid-cols-2">
          <li className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
            <span className="block font-medium text-black dark:text-zinc-100">
              Private sends
            </span>
            SOL, USDC, USDT. Amounts and recipients hidden on chain.
          </li>
          <li className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
            <span className="block font-medium text-black dark:text-zinc-100">
              Batch payroll
            </span>
            Upload a CSV. One click pays everyone privately.
          </li>
          <li className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
            <span className="block font-medium text-black dark:text-zinc-100">
              Claim links
            </span>
            Send to anyone. They claim with any Solana wallet.
          </li>
          <li className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
            <span className="block font-medium text-black dark:text-zinc-100">
              Selective compliance
            </span>
            Share a viewing key with your auditor. The chain still sees nothing.
          </li>
        </ul>
        <div className="flex flex-col items-start gap-3">
          <ConnectButton />
        </div>
      </main>
    </div>
  );
}
