import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { normalizeRole } from "@/lib/quota";
import { setSessionCookie } from "@/lib/session";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    username?: string;
    password?: string;
  } | null;

  const username = body?.username?.trim();
  const password = body?.password;

  if (!username || !password) {
    return NextResponse.json({ message: "请输入账号和密码" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return NextResponse.json({ message: "账号或密码错误" }, { status: 401 });
  }

  const role = normalizeRole(user.role);
  await setSessionCookie({
    id: user.id,
    username: user.username,
    role
  });

  return NextResponse.json({
    user: {
      id: user.id,
      username: user.username,
      role
    }
  });
}
