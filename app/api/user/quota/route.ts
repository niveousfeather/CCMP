import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { getUserDailyQuota } from "@/lib/quota";

export async function GET() {
  const { user, response } = await requireUser();
  if (response) return response;

  const quota = await getUserDailyQuota(user!.id);
  return NextResponse.json(quota);
}
