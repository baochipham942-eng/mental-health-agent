-- AlterTable
ALTER TABLE "ProfileMemory" ADD COLUMN "fingerprint" TEXT;

-- CreateIndex
CREATE INDEX "ProfileMemory_userId_kind_fingerprint_idx"
  ON "ProfileMemory"("userId", "kind", "fingerprint");
