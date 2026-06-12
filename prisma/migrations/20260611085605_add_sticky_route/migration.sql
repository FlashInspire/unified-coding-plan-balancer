-- CreateTable
CREATE TABLE "StickyRoute" (
    "apiKeyId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "pmId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,

    PRIMARY KEY ("apiKeyId", "modelId")
);

-- CreateIndex
CREATE INDEX "StickyRoute_expiresAt_idx" ON "StickyRoute"("expiresAt");
