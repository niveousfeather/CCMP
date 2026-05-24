import { NextResponse } from "next/server";

import {
  createTeachingArchitectureTask,
  isTeachingArchitectureDiagramType,
  isTeachingArchitectureSourceType
} from "@/lib/smart-tools/teaching-architecture-diagram/task-store";
import type { TeachingArchitectureCreateTaskResponse } from "@/lib/smart-tools/teaching-architecture-diagram/types";

export const runtime = "nodejs";

function requestOrigin(request: Request) {
  return new URL(request.url).origin;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const sourceType = formData.get("sourceType");
    const file = formData.get("file");
    const textPrompt = formData.get("textPrompt");
    const diagramType = formData.get("diagramType");

    if (typeof sourceType !== "string" || !isTeachingArchitectureSourceType(sourceType)) {
      return NextResponse.json({ code: "INVALID_SOURCE_TYPE", message: "请选择文字描述或文件上传作为输入来源。" }, { status: 400 });
    }
    if (typeof diagramType !== "string" || !isTeachingArchitectureDiagramType(diagramType)) {
      return NextResponse.json({ code: "INVALID_DIAGRAM_TYPE", message: "请选择有效的图型。" }, { status: 400 });
    }

    if (sourceType === "file" && !(file instanceof File)) {
      return NextResponse.json({ code: "MISSING_FILE", message: "请先上传教学资料文件。" }, { status: 400 });
    }
    const uploadedFile = file instanceof File ? file : undefined;

    const task =
      sourceType === "text"
        ? await createTeachingArchitectureTask({
            sourceType,
            textPrompt: typeof textPrompt === "string" ? textPrompt : "",
            diagramType,
            requestOrigin: requestOrigin(request)
          })
        : await createTeachingArchitectureTask({
            sourceType,
            file: uploadedFile as File,
            diagramType,
            requestOrigin: requestOrigin(request)
          });

    const response: TeachingArchitectureCreateTaskResponse = {
      taskId: task.taskId,
      status: task.status,
      stage: task.stage
    };
    return NextResponse.json(response, { status: 202 });
  } catch (error) {
    return NextResponse.json(
      {
        code: "TEACHING_ARCHITECTURE_CREATE_FAILED",
        message: error instanceof Error ? error.message : "教学架构图任务创建失败。"
      },
      { status: 400 }
    );
  }
}
