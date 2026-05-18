import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

type Params = {
  params: Promise<{ id: string }>;
};

const validRoles = ["ADMIN", "TEACHER", "STUDENT"] as const;
type UserRole = (typeof validRoles)[number];

function normalizeUserRole(value?: string | null): UserRole | null {
  const role = value?.trim().toUpperCase();
  if (!role) return null;
  if (role === "USER") return "TEACHER";
  return validRoles.includes(role as UserRole) ? (role as UserRole) : null;
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { user, response } = await requireAdmin();
  if (response) return response;

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { role?: string } | null;
  const role = normalizeUserRole(body?.role);

  if (!role) {
    return NextResponse.json({ message: "角色无效，仅支持 admin、teacher、student" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) {
    return NextResponse.json({ message: "用户不存在" }, { status: 404 });
  }

  if (target.role === "ADMIN" && role !== "ADMIN") {
    const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
    if (adminCount <= 1) {
      return NextResponse.json({ message: "不能移除最后一个管理员角色" }, { status: 400 });
    }
  }

  if (target.id === user!.id && role !== "ADMIN") {
    return NextResponse.json({ message: "不能将当前登录管理员改为非管理员" }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id },
    data: { role: role as never },
    select: { id: true, username: true, role: true, created_at: true, updated_at: true }
  });

  return NextResponse.json({ user: updated });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { user, response } = await requireAdmin();
  if (response) {
    return response;
  }

  const { id } = await params;
  const target = await prisma.user.findUnique({ where: { id } });

  if (!target) {
    return NextResponse.json({ message: "用户不存在" }, { status: 404 });
  }

  if (target.id === user!.id) {
    return NextResponse.json({ message: "不能删除当前登录账号" }, { status: 400 });
  }

  if (target.role === "ADMIN") {
    const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
    if (adminCount <= 1) {
      return NextResponse.json({ message: "不允许删除最后一个管理员账号" }, { status: 400 });
    }
  }

  await prisma.user.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
