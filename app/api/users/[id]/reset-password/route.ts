import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hashPassword, validatePassword } from "@/lib/password";

type Params = {
  params: Promise<{ id: string }>;
};

function getResetPassword(input?: string) {
  const password = input?.trim();
  if (password) return password;
  if (process.env.DEFAULT_USER_PASSWORD) return process.env.DEFAULT_USER_PASSWORD;
  if (process.env.NODE_ENV === "production") return null;
  return "ChangeMe123!";
}

export async function POST(request: NextRequest, { params }: Params) {
  const { response } = await requireAdmin();
  if (response) return response;

  const body = (await request.json().catch(() => null)) as {
    password?: string;
  } | null;
  const password = getResetPassword(body?.password);

  if (!password) {
    return NextResponse.json({ message: "生产环境必须配置 DEFAULT_USER_PASSWORD 或手动输入新密码" }, { status: 500 });
  }

  const passwordError = validatePassword(password);
  if (passwordError) {
    return NextResponse.json({ message: passwordError }, { status: 400 });
  }

  const { id } = await params;
  const target = await prisma.user.findUnique({ where: { id } });

  if (!target) {
    return NextResponse.json({ message: "用户不存在" }, { status: 404 });
  }

  await prisma.user.update({
    where: { id },
    data: { password_hash: await hashPassword(password) }
  });

  return NextResponse.json({ ok: true });
}
