-- CreateTable
CREATE TABLE "UploadSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "totalSize" INTEGER NOT NULL,
    "chunkSize" INTEGER NOT NULL,
    "totalChunks" INTEGER NOT NULL,
    "folderId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UploadSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "UploadSession_userId_idx" ON "UploadSession"("userId");
