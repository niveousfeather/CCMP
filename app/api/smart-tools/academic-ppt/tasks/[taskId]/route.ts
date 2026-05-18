import { NextResponse } from "next/server";

import { scheduleAcademicPptQueue } from "@/lib/smart-tools/academic-ppt/task-queue";
import { reconcileAcademicPptTaskRecovery } from "@/lib/smart-tools/academic-ppt/task-recovery";
import { toAcademicPptSnapshot } from "@/lib/smart-tools/academic-ppt/server-task-store";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ taskId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { taskId } = await context.params;
    const record = await reconcileAcademicPptTaskRecovery(taskId);
    if (record.status === "queued") await scheduleAcademicPptQueue();
    return NextResponse.json(toAcademicPptSnapshot(record));
  } catch {
    return NextResponse.json({ code: "TASK_NOT_FOUND", message: "学术PPT任务不存在。" }, { status: 404 });
  }
}
