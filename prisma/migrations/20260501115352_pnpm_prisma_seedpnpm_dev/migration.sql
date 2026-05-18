-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_RoleQuota" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "role" TEXT NOT NULL,
    "imageDailyLimit" INTEGER NOT NULL DEFAULT 10,
    "videoDailyLimit" INTEGER NOT NULL DEFAULT 2,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_RoleQuota" ("createdAt", "id", "imageDailyLimit", "role", "updatedAt", "videoDailyLimit") SELECT "createdAt", "id", "imageDailyLimit", "role", "updatedAt", "videoDailyLimit" FROM "RoleQuota";
DROP TABLE "RoleQuota";
ALTER TABLE "new_RoleQuota" RENAME TO "RoleQuota";
CREATE UNIQUE INDEX "RoleQuota_role_key" ON "RoleQuota"("role");
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'TEACHER',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);
INSERT INTO "new_User" ("created_at", "id", "password_hash", "role", "updated_at", "username") SELECT "created_at", "id", "password_hash", "role", "updated_at", "username" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
