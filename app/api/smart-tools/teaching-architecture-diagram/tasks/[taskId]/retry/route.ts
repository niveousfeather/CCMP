import { NextResponse } from "next/server";

import { readTeachingArchitectureTaskResponse, retryTeachingArchitectureTask } from "@/lib/smart-tools/teaching-architecture-diagram/task-store";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ taskId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { taskId } = await context.params;
    await retryTeachingArchitectureTask(taskId);
    return NextResponse.json(await readTeachingArchitectureTaskResponse(taskId), { status: 202 });
  } catch (error) {
    return NextResponse.json(
      {
        code: "TEACHING_ARCHITECTURE_RETRY_FAILED",
        message: error instanceof Error ? error.message : "教学架构图重试生成失败。"
      },
      { status: 400 }
    );
  }
}
