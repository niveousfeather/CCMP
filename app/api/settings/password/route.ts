import { NextRequest, NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hashPassword, validatePassword, verifyPassword } from "@/lib/password";

export async function PATCH(request: NextRequest) {
  const { user, response } = await requireUser();
  if (response) {
    return response;
  }

  const body = (await request.json().catch(() => null)) as {
    oldPassword?: string;
    newPassword?: string;
    confirmPassword?: string;
  } | null;

  if (!body?.oldPassword || !body?.newPassword || !body?.confirmPassword) {
    return NextResponse.json({ message: "请完整填写密码信息" }, { status: 400 });
  }

  if (body.newPassword !== body.confirmPassword) {
    return NextResponse.json({ message: "两次输入的新密码不一致" }, { status: 400 });
  }

  const passwordError = validatePassword(body.newPassword);
  if (passwordError) {
    return NextResponse.json({ message: passwordError }, { status: 400 });
  }

  const currentUser = await prisma.user.findUnique({ where: { id: user!.id } });
  if (!currentUser) {
    return NextResponse.json({ message: "当前用户不存在" }, { status: 404 });
  }

  const isOldPasswordValid = await verifyPassword(body.oldPassword, currentUser.password_hash);
  if (!isOldPasswordValid) {
    return NextResponse.json({ message: "旧密码不正确" }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: currentUser.id },
    data: { password_hash: await hashPassword(body.newPassword) }
  });

  return NextResponse.json({ ok: true });
}
