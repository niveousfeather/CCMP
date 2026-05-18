import { NextResponse } from "next/server";

import { getDashboardStats } from "@/lib/dashboard-stats";
import { requireUser } from "@/lib/auth";

export async function GET() {
  const { user, response } = await requireUser();
  if (response) return response;

  const stats = await getDashboardStats(user!);
  return NextResponse.json(stats);
}
