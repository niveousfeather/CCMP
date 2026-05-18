import { NextResponse } from "next/server";

import {
  requestAcademicPptTaskCancellation,
  toAcademicPptSnapshot
} from "@/lib/smart-tools/academic-ppt/server-task-store";
import type { CancelAcademicPptTaskResponse } from "@/lib/smart-tools/academic-ppt/types";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ taskId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { taskId } = await context.params;
    const record = await requestAcademicPptTaskCancellation(taskId);
    const response: CancelAcademicPptTaskResponse = {
      taskId: record.taskId,
      status: record.status
    };
    return NextResponse.json({ ...response, task: toAcademicPptSnapshot(record) });
  } catch {
    return NextResponse.json({ code: "TASK_NOT_FOUND", message: "学术PPT任务不存在。" }, { status: 404 });
  }
}
