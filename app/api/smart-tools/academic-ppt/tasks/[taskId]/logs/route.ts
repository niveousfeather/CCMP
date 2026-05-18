import { NextResponse } from "next/server";

import { readAcademicPptLogs } from "@/lib/smart-tools/academic-ppt/server-task-store";
import type { AcademicPptLogsResponse } from "@/lib/smart-tools/academic-ppt/types";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ taskId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { taskId } = await context.params;
    const { searchParams } = new URL(request.url);
    const limit = Math.min(Math.max(Number(searchParams.get("limit") || 100), 1), 100);
    const response: AcademicPptLogsResponse = {
      taskId,
      logs: await readAcademicPptLogs(taskId, limit)
    };
    return NextResponse.json(response);
  } catch {
    return NextResponse.json({ code: "TASK_LOGS_NOT_FOUND", message: "学术PPT任务日志不存在。" }, { status: 404 });
  }
}
