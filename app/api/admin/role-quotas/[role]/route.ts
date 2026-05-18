import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { DEFAULT_ROLE_QUOTAS, normalizeRole, type AppRole } from "@/lib/quota";
import { prisma } from "@/lib/db";

type Params = {
  params: Promise<{ role: string }>;
};

function normalizeLimit(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return null;
  return Math.floor(number);
}

function isRole(value: string): value is AppRole {
  return value === "ADMIN" || value === "TEACHER" || value === "STUDENT";
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { response } = await requireAdmin();
  if (response) return response;

  const { role: roleParam } = await params;
  const role = normalizeRole(roleParam);
  if (!isRole(roleParam.toUpperCase()) && roleParam.toUpperCase() !== "USER") {
    return NextResponse.json({ message: "角色无效，仅支持 admin、teacher、student" }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as {
    imageDailyLimit?: number;
    videoDailyLimit?: number;
    model3DDailyLimit?: number;
  } | null;

  const imageDailyLimit = normalizeLimit(body?.imageDailyLimit);
  const videoDailyLimit = normalizeLimit(body?.videoDailyLimit);
  const model3DDailyLimit = normalizeLimit(body?.model3DDailyLimit);

  if (imageDailyLimit === null || videoDailyLimit === null || model3DDailyLimit === null) {
    return NextResponse.json({ message: "每日额度必须是大于等于 0 的数字" }, { status: 400 });
  }

  const prismaWithRoleQuota = prisma as typeof prisma & {
    roleQuota: {
      upsert: (args: {
        where: { role: AppRole };
        update: { imageDailyLimit: number; videoDailyLimit: number; model3DDailyLimit: number };
        create: { role: AppRole; imageDailyLimit: number; videoDailyLimit: number; model3DDailyLimit: number };
      }) => Promise<unknown>;
    };
  };

  const quota = await prismaWithRoleQuota.roleQuota.upsert({
    where: { role },
    update: { imageDailyLimit, videoDailyLimit, model3DDailyLimit },
    create: {
      role,
      imageDailyLimit: imageDailyLimit ?? DEFAULT_ROLE_QUOTAS[role].imageDailyLimit,
      videoDailyLimit: videoDailyLimit ?? DEFAULT_ROLE_QUOTAS[role].videoDailyLimit,
      model3DDailyLimit: model3DDailyLimit ?? DEFAULT_ROLE_QUOTAS[role].model3DDailyLimit
    }
  });

  return NextResponse.json({ quota });
}
