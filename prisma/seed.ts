import { PrismaClient } from "@prisma/client";

import { hashPassword } from "../lib/password";
import { ensureRoleQuotas, getDefaultUserQuota } from "../lib/quota";

const prisma = new PrismaClient();

async function main() {
  const username = process.env.ADMIN_USERNAME || "admin";
  const password = process.env.ADMIN_PASSWORD || (process.env.NODE_ENV === "production" ? "" : "Admin123456");
  if (!password) {
    throw new Error("ADMIN_PASSWORD is required in production");
  }
  const defaultQuota = getDefaultUserQuota();
  await ensureRoleQuotas();
  await backfillLegacyUserRoles();

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    await backfillMissingQuotas(defaultQuota);
    console.log(`Admin user "${username}" already exists.`);
    return;
  }

  await prisma.user.create({
    data: {
      username,
      password_hash: await hashPassword(password),
      role: "ADMIN",
      quota: {
        create: {
          totalQuota: getDefaultUserQuota(),
          usedQuota: 0
        }
      }
    }
  });

  await backfillMissingQuotas(defaultQuota);
  console.log(`Admin user created: ${username}`);
}

async function backfillMissingQuotas(defaultQuota: number) {
  const users = await prisma.user.findMany({
    where: { quota: null },
    select: { id: true }
  });

  if (!users.length) return;

  await prisma.userQuota.createMany({
    data: users.map((user) => ({
      userId: user.id,
      totalQuota: defaultQuota,
      usedQuota: 0
    }))
  });

  console.log(`Backfilled quota for ${users.length} existing user(s).`);
}

async function backfillLegacyUserRoles() {
  await prisma.$executeRawUnsafe(
    `UPDATE "User" SET "role" = 'TEACHER' WHERE "role" = 'USER' OR "role" IS NULL`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
