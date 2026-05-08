-- CreateTable
CREATE TABLE "compliance_shares" (
    "id" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "compliance_shares_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "compliance_shares_issuer_idx" ON "compliance_shares"("issuer", "created_at" DESC);
