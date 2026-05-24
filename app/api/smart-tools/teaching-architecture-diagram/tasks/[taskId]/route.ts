import { NextResponse } from "next/server";

import { deleteTeachingArchitectureTask, readTeachingArchitectureTaskResponse } from "@/lib/smart-tools/teaching-architecture-diagram/task-store";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ taskId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { taskId } = await context.params;
    return NextResponse.json(await readTeachingArchitectureTaskResponse(taskId));
  } catch {
    return NextResponse.json({ code: "TASK_NOT_FOUND", message: "教学架构图任务不存在。" }, { status: 404 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { taskId } = await context.params;
    await deleteTeachingArchitectureTask(taskId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        code: "TASK_DELETE_FAILED",
        message: error instanceof Error ? error.message : "历史任务删除失败。"
      },
      { status: 400 }
    );
  }
}
