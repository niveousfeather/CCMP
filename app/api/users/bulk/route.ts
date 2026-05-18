import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { normalizeImportUsers, parseUsersPayload } from "@/lib/import-users";
import type { ImportFailure, ImportUserInput } from "@/lib/import-users";
import { hashPassword } from "@/lib/password";
import { getDefaultUserQuota } from "@/lib/quota";

export async function POST(request: NextRequest) {
  const { response } = await requireAdmin();
  if (response) {
    return response;
  }

  const body = (await request.json().catch(() => null)) as {
    payload?: string;
    users?: ImportUserInput[];
    defaultPassword?: string;
  } | null;

  const defaultPassword =
    body?.defaultPassword?.trim() || process.env.DEFAULT_USER_PASSWORD || "ChangeMe123!";
  const parsed = Array.isArray(body?.users)
    ? normalizeImportUsers(body.users, defaultPassword)
    : parseUsersPayload(body?.payload || "", defaultPassword);

  const failed: ImportFailure[] = [...parsed.failed];
  const duplicateUsernames: string[] = [];
  let successCount = 0;
  const seenInPayload = new Set<string>();

  for (const item of parsed.users) {
    const normalizedUsername = item.username.toLowerCase();
    if (seenInPayload.has(normalizedUsername)) {
      duplicateUsernames.push(item.username);
      failed.push({
        username: item.username,
        row: item.row,
        reason: "导入文件内用户名重复，已跳过"
      });
      continue;
    }
    seenInPayload.add(normalizedUsername);

    const existing = await prisma.user.findUnique({ where: { username: item.username } });
    if (existing) {
      duplicateUsernames.push(item.username);
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

  return NextResponse.json({
    totalCount: parsed.totalCount,
    successCount,
    failedCount: failed.length,
    duplicateUsernames,
    failed
  });
}

export async function DELETE(request: NextRequest) {
  const { user, response } = await requireAdmin();
  if (response) {
    return response;
  }

  const body = (await request.json().catch(() => null)) as { ids?: string[] } | null;
  const ids = Array.from(new Set(body?.ids || [])).filter(Boolean);

  if (!ids.length) {
    return NextResponse.json({ message: "请选择要删除的用户" }, { status: 400 });
  }

  const targets = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, username: true, role: true }
  });

  const failed: Array<{ id: string; username?: string; reason: string }> = [];
  const deletableIds = new Set(targets.map((target) => target.id));

  for (const id of ids) {
    if (!targets.some((target) => target.id === id)) {
      failed.push({ id, reason: "用户不存在" });
      deletableIds.delete(id);
    }
  }

  for (const target of targets) {
    if (target.id === user!.id) {
      failed.push({ id: target.id, username: target.username, reason: "不能删除当前登录账号" });
      deletableIds.delete(target.id);
    }
  }

  const remainingTargets = targets.filter((target) => deletableIds.has(target.id));
  const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
  const deletingAdminCount = remainingTargets.filter((target) => target.role === "ADMIN").length;

  if (adminCount - deletingAdminCount < 1) {
    for (const target of remainingTargets.filter((item) => item.role === "ADMIN")) {
      failed.push({
        id: target.id,
        username: target.username,
        reason: "不能删除最后一个管理员账号"
      });
      deletableIds.delete(target.id);
    }
  }

  const finalIds = Array.from(deletableIds);
  const result = finalIds.length
    ? await prisma.user.deleteMany({ where: { id: { in: finalIds } } })
    : { count: 0 };

  return NextResponse.json({
    deletedCount: result.count,
    failed
  });
}
