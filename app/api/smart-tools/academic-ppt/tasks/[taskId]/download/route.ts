import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

import { getAcademicPptDownloadInfo } from "@/lib/smart-tools/academic-ppt/server-task-store";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ taskId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { taskId } = await context.params;
    const info = await getAcademicPptDownloadInfo(taskId);
    if (info.status !== "success") {
      return NextResponse.json({ code: "TASK_NOT_READY", message: "学术PPT任务尚未完成。" }, { status: 409 });
    }
    if (!info.filePath) {
      return NextResponse.json({ code: "OUTPUT_NOT_FOUND", message: "PPTX 输出文件不存在。" }, { status: 404 });
    }
    const fileStat = await stat(info.filePath);
    const stream = createReadStream(info.filePath);
    const fileName = path.basename(info.filePath);
    return new Response(stream as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Length": String(fileStat.size),
        "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
        "X-Academic-Ppt-Sha256": info.sha256 || "",
        ETag: info.sha256 ? `"${info.sha256}"` : ""
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        code: "DOWNLOAD_FAILED",
        message: error instanceof Error ? error.message : "学术PPT下载失败。"
      },
      { status: 404 }
    );
  }
}
