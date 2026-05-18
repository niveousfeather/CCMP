import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { PrismaClient } from "@prisma/client";

import { parseUsersPayload } from "../lib/import-users";
import { hashPassword } from "../lib/password";
import { getDefaultUserQuota } from "../lib/quota";

const prisma = new PrismaClient();

async function main() {
  const filePath = process.argv[2];

  if (!filePath) {
    console.error("用法：pnpm import-users ./users.csv 或 pnpm import-users ./users.json");
    process.exit(1);
  }

  const defaultPassword = process.env.DEFAULT_USER_PASSWORD || "ChangeMe123!";
  const payload = readFileSync(resolve(filePath), "utf8");
  const parsed = parseUsersPayload(payload, defaultPassword);
  const failed = [...parsed.failed];
  let successCount = 0;

  for (const item of parsed.users) {
    const existing = await prisma.user.findUnique({ where: { username: item.username } });
    if (existing) {
      failed.push({
        username: item.username,
        row: item.row,
        reason: "用户名已存在，已跳过"
      });
      continue;
    }

    await prisma.user.create({
      data: {
        username: item.username,
        role: item.role as never,
        password_hash: await hashPassword(item.password),
        quota: {
          create: {
            totalQuota: getDefaultUserQuota(),
            usedQuota: 0
          }
        }
      }
    });
    successCount += 1;
  }

  console.log(`导入完成：成功 ${successCount} 个，失败 ${failed.length} 个`);
  if (failed.length) {
    console.table(failed);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
