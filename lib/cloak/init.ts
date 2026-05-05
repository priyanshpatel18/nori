"use client";

import { setCircuitsPath } from "@cloak.dev/sdk";

// Self-host the Groth16 artifacts under /public/circuits to avoid CORS hangs
// against the SDK's default S3 bucket and to serve them from Vercel's edge.
// Files: public/circuits/0.1.0/transaction_js/transaction.wasm
//        public/circuits/0.1.0/transaction_final.zkey
const SELF_HOSTED_CIRCUITS_PATH =
  process.env.NEXT_PUBLIC_CLOAK_CIRCUITS_PATH ?? "/circuits/0.1.0";

if (typeof window !== "undefined") {
  setCircuitsPath(SELF_HOSTED_CIRCUITS_PATH);
}
