import { NextResponse } from "next/server";

import { resumeAcademicPptGeneration } from "@/lib/smart-tools/academic-ppt/sidecar-client";
import { enqueueAcademicPptTask, scheduleAcademicPptQueue } from "@/lib/smart-tools/academic-ppt/task-queue";
import { toAcademicPptSnapshot } from "@/lib/smart-tools/academic-ppt/server-task-store";
import type { ResumeAcademicPptTaskResponse } from "@/lib/smart-tools/academic-ppt/types";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ taskId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { taskId } = await context.params;
    const record = await resumeAcademicPptGeneration(taskId);
    await enqueueAcademicPptTask(taskId, { resume: true, requestOrigin: new URL(request.url).origin });
    await scheduleAcademicPptQueue();
    const response: ResumeAcademicPptTaskResponse = {
      taskId: record.taskId,
      status: "queued",
      task: toAcademicPptSnapshot(record)
    };
    return NextResponse.json(response, { status: 202 });
  } catch (error) {
    return NextResponse.json(
      {
        code: "ACADEMIC_PPT_RESUME_FAILED",
        message: error instanceof Error ? error.message : "任务无法继续生成。"
      },
      { status: 409 }
    );
  }
}
