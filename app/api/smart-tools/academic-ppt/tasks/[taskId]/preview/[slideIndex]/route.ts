import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";

import {
  getAcademicPptPreviewImageInfo,
  readAcademicPptPreviewManifest,
  readAcademicPptTaskRecord
} from "@/lib/smart-tools/academic-ppt/server-task-store";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ taskId: string; slideIndex: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { taskId, slideIndex } = await context.params;
    const pageNumber = Number(slideIndex);
    if (!Number.isInteger(pageNumber) || pageNumber <= 0 || pageNumber > 200) {
      return NextResponse.json({ code: "INVALID_SLIDE_INDEX", message: "预览页码无效。" }, { status: 400 });
    }

    const imageInfo = await getAcademicPptPreviewImageInfo(taskId, pageNumber);
    if (!imageInfo) {
      const [record, manifest] = await Promise.all([
        readAcademicPptTaskRecord(taskId),
        readAcademicPptPreviewManifest(taskId).catch(() => undefined)
      ]);
      const pending =
        manifest?.status === "pending" || record.status === "queued" || record.status === "pending" || record.status === "running";

      return NextResponse.json(
        {
          code: pending ? "PREVIEW_PENDING" : "PREVIEW_UNAVAILABLE",
          message: pending ? "真实预览生成中。" : "预览暂不可用，请下载 PPTX 查看。",
          taskId,
          pageNumber,
          status: pending ? "pending" : "unavailable"
        },
        { status: pending ? 202 : 200 }
      );
    }

    const bytes = await readFile(imageInfo.filePath);
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": imageInfo.contentType,
        "Cache-Control": "private, max-age=300"
      }
    });
  } catch {
    return NextResponse.json({ code: "PREVIEW_NOT_FOUND", message: "学术PPT任务不存在。" }, { status: 404 });
  }
}
