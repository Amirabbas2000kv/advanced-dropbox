-- AlterTable
ALTER TABLE "File" ADD COLUMN "deletedAt" DATETIME;

-- CreateIndex
CREATE INDEX "File_userId_deletedAt_idx" ON "File"("userId", "deletedAt");
