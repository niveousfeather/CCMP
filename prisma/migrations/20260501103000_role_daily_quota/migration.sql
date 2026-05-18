-- Add role-based daily quotas without removing the legacy UserQuota table.
-- Existing USER accounts are migrated to TEACHER so older users keep normal access.
UPDATE "User" SET "role" = 'TEACHER' WHERE "role" = 'USER' OR "role" IS NULL;

CREATE TABLE "RoleQuota" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "role" TEXT NOT NULL,
    "imageDailyLimit" INTEGER NOT NULL DEFAULT 10,
    "videoDailyLimit" INTEGER NOT NULL DEFAULT 2,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "RoleQuota_role_key" ON "RoleQuota"("role");

CREATE TABLE "UsageRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "featureType" TEXT NOT NULL,
    "relatedTaskId" TEXT,
    "status" TEXT,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UsageRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "UsageRecord_userId_featureType_createdAt_idx" ON "UsageRecord"("userId", "featureType", "createdAt");
CREATE INDEX "UsageRecord_relatedTaskId_idx" ON "UsageRecord"("relatedTaskId");

INSERT INTO "RoleQuota" ("id", "role", "imageDailyLimit", "videoDailyLimit", "createdAt", "updatedAt")
VALUES
  ('role_quota_admin', 'ADMIN', 9999, 9999, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('role_quota_teacher', 'TEACHER', 50, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('role_quota_student', 'STUDENT', 10, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
