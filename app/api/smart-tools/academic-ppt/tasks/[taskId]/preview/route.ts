import { NextResponse } from "next/server";

import { readAcademicPptPreviewManifest } from "@/lib/smart-tools/academic-ppt/server-task-store";
import type { AcademicPptPreviewResponse } from "@/lib/smart-tools/academic-ppt/types";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ taskId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { taskId } = await context.params;
    const manifest = await readAcademicPptPreviewManifest(taskId);
    const response: AcademicPptPreviewResponse = {
      taskId,
      ...manifest
    };
    return NextResponse.json(response, { status: manifest.status === "pending" ? 202 : 200 });
  } catch {
    return NextResponse.json({ code: "PREVIEW_NOT_FOUND", message: "学术PPT预览不存在。" }, { status: 404 });
  }
}
