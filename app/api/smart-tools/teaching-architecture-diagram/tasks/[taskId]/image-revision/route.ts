import { NextResponse } from "next/server";

import { requestTeachingArchitectureImageRevision } from "@/lib/smart-tools/teaching-architecture-diagram/task-store";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ taskId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { taskId } = await context.params;
    const body = (await request.json().catch(() => ({}))) as { instruction?: string };
    const response = await requestTeachingArchitectureImageRevision(taskId, body.instruction || "");
    return NextResponse.json(response, { status: 202 });
  } catch (error) {
    return NextResponse.json(
      {
        code: "IMAGE_REVISION_FAILED",
        message: error instanceof Error ? error.message : "图片修改任务创建失败。"
      },
      { status: 400 }
    );
  }
}
