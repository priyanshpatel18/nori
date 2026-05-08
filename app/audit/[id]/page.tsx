"use client";

import { useParams } from "next/navigation";
import * as React from "react";
import { Suspense } from "react";

import {
  Content,
  Header,
  LoadingPanel,
  type HydratedShare,
} from "@/app/compliance/view/page";
import type { AuditorSentEntry } from "@/lib/cloak/viewing-keys";

type StoredPayload = {
  v?: number;
  nk?: string;
  wallet?: string | null;
  cluster?: "mainnet-beta" | "devnet";
  fromDate?: string;
  toDate?: string;
  sent?: AuditorSentEntry[];
};

export default function ComplianceShortShareView() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [hydrated, setHydrated] = React.useState<HydratedShare | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!id) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/compliance/share/${id}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          throw new Error(
            res.status === 404
              ? "This share link is no longer available."
              : `Failed to load share (${res.status}).`,
          );
        }
        const json = (await res.json()) as { payload?: string };
        if (typeof json.payload !== "string") {
          throw new Error("Share returned no payload.");
        }
        const decoded = JSON.parse(json.payload) as StoredPayload;
        if (cancelled) return;
        setHydrated({
          nk: decoded.nk ?? "",
          wallet: decoded.wallet ?? "",
          from: decoded.fromDate ?? "",
          to: decoded.toDate ?? "",
          sent: Array.isArray(decoded.sent) ? decoded.sent : [],
          cluster: decoded.cluster,
        });
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <div className="flex h-svh flex-col bg-background">
      <Header />
      {error ? (
        <main className="mx-auto max-w-5xl px-4 py-10 sm:px-8">
          <div
            role="alert"
            className="rounded-2xl border border-destructive/40 bg-destructive/5 p-6 text-[13px] text-destructive"
          >
            {error}
          </div>
        </main>
      ) : hydrated ? (
        <Suspense fallback={<LoadingPanel />}>
          <Content hydrated={hydrated} />
        </Suspense>
      ) : (
        <LoadingPanel />
      )}
    </div>
  );
}
