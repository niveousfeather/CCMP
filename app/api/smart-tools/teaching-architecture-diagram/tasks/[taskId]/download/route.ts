import { NextResponse } from "next/server";

import { getTeachingArchitectureDownload } from "@/lib/smart-tools/teaching-architecture-diagram/task-store";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ taskId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { taskId } = await context.params;
    const searchParams = new URL(request.url).searchParams;
    const isPreview = searchParams.get("preview") === "1";
    const requestedFormat = searchParams.get("format");
    const format = requestedFormat === "svg" || requestedFormat === "png" ? requestedFormat : "auto";
    const download = await getTeachingArchitectureDownload(taskId, format);
    if (!download.ready) {
      return NextResponse.json({ code: "TASK_NOT_READY", message: "教学架构图任务尚未完成。" }, { status: 409 });
    }
    const extension = download.fileName.endsWith(".svg") ? "svg" : "png";

    return new Response(download.stream as unknown as BodyInit, {
      headers: {
        "Content-Type": download.contentType,
        "Content-Length": String(download.size),
        "Content-Disposition": `${isPreview ? "inline" : "attachment"}; filename="${encodeURIComponent(`teaching-architecture-diagram-${taskId}.${extension}`)}"`
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        code: "DOWNLOAD_FAILED",
        message: error instanceof Error ? error.message : "教学架构图下载失败。"
      },
      { status: 404 }
    );
  }
}
