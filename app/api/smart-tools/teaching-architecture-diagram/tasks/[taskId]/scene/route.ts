import { NextResponse } from "next/server";

import {
  readTeachingArchitectureSceneResponse,
  updateTeachingArchitectureSceneText
} from "@/lib/smart-tools/teaching-architecture-diagram/task-store";
import type { TeachingArchitectureSceneEdit } from "@/lib/smart-tools/teaching-architecture-diagram/types";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ taskId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { taskId } = await context.params;
    return NextResponse.json(await readTeachingArchitectureSceneResponse(taskId));
  } catch (error) {
    return NextResponse.json(
      {
        code: "SCENE_NOT_AVAILABLE",
        message: error instanceof Error ? error.message : "架构图编辑场景暂不可用。"
      },
      { status: 404 }
    );
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const { taskId } = await context.params;
    const body = (await request.json().catch(() => ({}))) as { edits?: TeachingArchitectureSceneEdit[] };
    return NextResponse.json(await updateTeachingArchitectureSceneText(taskId, body.edits || []));
  } catch (error) {
    return NextResponse.json(
      {
        code: "SCENE_SAVE_FAILED",
        message: error instanceof Error ? error.message : "架构图文字保存失败。"
      },
      { status: 400 }
    );
  }
}
