import { NextRequest, NextResponse } from "next/server";

import { getSessionFromRequest } from "@/lib/session-edge";

const protectedRoutes = ["/workspace", "/chat", "/image", "/video", "/users", "/settings", "/smart-tools"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = await getSessionFromRequest(request);

  if (pathname === "/login" && session) {
    return NextResponse.redirect(new URL("/workspace", request.url));
  }

  const isProtected = protectedRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );

  if (!isProtected) {
    return NextResponse.next();
  }

  if (!session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if ((pathname === "/users" || pathname.startsWith("/users/")) && session.role !== "ADMIN") {
    return NextResponse.redirect(new URL("/workspace", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/login", "/workspace/:path*", "/chat/:path*", "/image/:path*", "/video/:path*", "/users/:path*", "/settings/:path*", "/smart-tools/:path*"]
};
