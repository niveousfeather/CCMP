import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hashPassword, validatePassword } from "@/lib/password";
import { getDefaultUserQuota } from "@/lib/quota";

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;
const validRoles = ["ADMIN", "TEACHER", "STUDENT"] as const;
type UserRole = (typeof validRoles)[number];

function normalizeUserRole(value?: string | null): UserRole | null {
  const role = value?.trim().toUpperCase();
  if (!role) return "TEACHER";
  if (role === "USER") return "TEACHER";
  return validRoles.includes(role as UserRole) ? (role as UserRole) : null;
}

export async function GET(request: NextRequest) {
  const { response } = await requireAdmin();
  if (response) {
    return response;
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim();
  const role = searchParams.get("role")?.trim().toUpperCase();
  const page = Math.max(Number(searchParams.get("page") || "1"), 1);
  const pageSize = Math.min(
    Math.max(Number(searchParams.get("pageSize") || DEFAULT_PAGE_SIZE), 1),
    MAX_PAGE_SIZE
  );

  const where: Prisma.UserWhereInput = {};
  if (search) {
    where.username = { contains: search };
  }
  if (role && validRoles.includes(role as UserRole)) {
    where.role = role as never;
  }

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { created_at: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        username: true,
        role: true,
        created_at: true,
        updated_at: true
      }
    })
  ]);

  return NextResponse.json({
    users,
    total,
    page,
    pageSize,
    totalPages: Math.max(Math.ceil(total / pageSize), 1)
  });
}

export async function POST(request: NextRequest) {
  const { response } = await requireAdmin();
  if (response) {
    return response;
  }

  const body = (await request.json().catch(() => null)) as {
    username?: string;
    role?: UserRole;
    password?: string;
  } | null;

  const username = body?.username?.trim();
  const role = normalizeUserRole(body?.role);
  const password = body?.password || process.env.DEFAULT_USER_PASSWORD || "ChangeMe123!";

  if (!username) {
    return NextResponse.json({ message: "用户名不能为空" }, { status: 400 });
  }

  if (!role) {
    return NextResponse.json({ message: "角色无效" }, { status: 400 });
  }

  const passwordError = validatePassword(password);
  if (passwordError) {
    return NextResponse.json({ message: passwordError }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    return NextResponse.json({ message: "用户名已存在" }, { status: 409 });
  }

  const user = await prisma.user.create({
    data: {
      username,
      role: role as never,
      password_hash: await hashPassword(password),
      quota: {
        create: {
          totalQuota: getDefaultUserQuota(),
          usedQuota: 0
        }
      }
    },
    select: {
      id: true,
      username: true,
      role: true,
      created_at: true,
      updated_at: true
    }
  });

  return NextResponse.json({ user }, { status: 201 });
}
