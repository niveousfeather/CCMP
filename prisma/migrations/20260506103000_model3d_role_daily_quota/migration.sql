ALTER TABLE "RoleQuota" ADD COLUMN "model3DDailyLimit" INTEGER NOT NULL DEFAULT 2;

UPDATE "RoleQuota" SET "model3DDailyLimit" = 9999 WHERE "role" = 'ADMIN';
UPDATE "RoleQuota" SET "model3DDailyLimit" = 10 WHERE "role" = 'TEACHER';
UPDATE "RoleQuota" SET "model3DDailyLimit" = 2 WHERE "role" = 'STUDENT';
