-- CreateTable
CREATE TABLE "FileShare" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "fileId" INTEGER NOT NULL,
    "ownerId" INTEGER NOT NULL,
    "recipientId" INTEGER NOT NULL,
    "permission" TEXT NOT NULL DEFAULT 'read',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FileShare_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "File" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FileShare_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FileShare_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "FileShare_recipientId_idx" ON "FileShare"("recipientId");

-- CreateIndex
CREATE INDEX "FileShare_ownerId_idx" ON "FileShare"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "FileShare_fileId_recipientId_key" ON "FileShare"("fileId", "recipientId");
