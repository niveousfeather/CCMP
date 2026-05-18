import { NextResponse } from "next/server";

import { requirePlatformOwnerAdmin } from "@/lib/auth";
import { getAdminAnalytics } from "@/lib/admin-analytics";

export async function GET() {
  const { response } = await requirePlatformOwnerAdmin();
  if (response) return response;

  const analytics = await getAdminAnalytics();
  return NextResponse.json(analytics);
}
