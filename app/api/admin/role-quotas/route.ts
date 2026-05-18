import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { ensureRoleQuotas, getRoleQuota } from "@/lib/quota";

const roles = ["ADMIN", "TEACHER", "STUDENT"] as const;

export async function GET() {
  const { response } = await requireAdmin();
  if (response) return response;

  await ensureRoleQuotas();
  const quotas = await Promise.all(roles.map((role) => getRoleQuota(role)));
  return NextResponse.json({ quotas });
}
