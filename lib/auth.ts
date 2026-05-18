import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/session";
import type { SessionUser } from "@/lib/session";

export function isPlatformOwnerAdmin(user: SessionUser | null | undefined) {
  const ownerUsername = process.env.ADMIN_USERNAME || "admin";
  return user?.role === "ADMIN" && user.username === ownerUsername;
}

export async function requireUser() {
  const user = await getCurrentUser();

  if (!user) {
    return {
      user: null,
      response: NextResponse.json({ message: "请先登录" }, { status: 401 })
    };
  }

  return { user, response: null };
}

export async function requireAdmin() {
  const { user, response } = await requireUser();

  if (response) {
    return { user: null, response };
  }

  if (user?.role !== "ADMIN") {
    return {
      user: null,
      response: NextResponse.json({ message: "没有管理员权限" }, { status: 403 })
    };
  }

  return { user, response: null };
}

export async function requirePlatformOwnerAdmin() {
  const { user, response } = await requireUser();

  if (response) {
    return { user: null, response };
  }

  if (!isPlatformOwnerAdmin(user)) {
    return {
      user: null,
      response: NextResponse.json({ message: "没有平台管理员权限。" }, { status: 403 })
    };
  }

  return { user, response: null };
}
