import { NextResponse } from "next/server";

import { listTeachingArchitectureTasks } from "@/lib/smart-tools/teaching-architecture-diagram/task-store";
import type { TeachingArchitectureTaskListResponse } from "@/lib/smart-tools/teaching-architecture-diagram/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(Math.max(Number(searchParams.get("limit") || 10), 1), 20);
    const response: TeachingArchitectureTaskListResponse = {
      tasks: await listTeachingArchitectureTasks(limit)
    };
    return NextResponse.json(response);
  } catch {
    return NextResponse.json({ code: "TEACHING_ARCHITECTURE_TASKS_UNAVAILABLE", message: "最近任务暂不可用。" }, { status: 500 });
  }
}
