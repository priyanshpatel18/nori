-- CreateTable
CREATE TABLE "faucet_claims" (
    "wallet" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "lamports" BIGINT NOT NULL,
    "ip_hash" TEXT,
    "claimed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "faucet_claims_pkey" PRIMARY KEY ("wallet")
);

-- CreateIndex
CREATE INDEX "faucet_claims_ip_hash_idx" ON "faucet_claims"("ip_hash", "claimed_at" DESC);
