import { NextResponse } from "next/server";

import { enqueueAcademicPptTask, scheduleAcademicPptQueue } from "@/lib/smart-tools/academic-ppt/task-queue";
import {
  assertAcademicPptFileAllowed,
  createAcademicPptTaskId,
  createAcademicPptTaskRecord,
  ensureAcademicPptStorage,
  listRecentAcademicPptTasks,
  writeAcademicPptUploadedFile,
  appendAcademicPptLog
} from "@/lib/smart-tools/academic-ppt/server-task-store";
import { defaultAcademicPptSettings, normalizeAcademicPptSettings } from "@/lib/smart-tools/academic-ppt/task-api";
import type {
  AcademicPptRecentTasksResponse,
  AcademicPptSettings,
  CreateAcademicPptTaskResponse
} from "@/lib/smart-tools/academic-ppt/types";

export const runtime = "nodejs";

function parseSettings(value: FormDataEntryValue | null): AcademicPptSettings {
  if (typeof value !== "string") return defaultAcademicPptSettings;
  try {
    return normalizeAcademicPptSettings(JSON.parse(value) as Partial<AcademicPptSettings>);
  } catch {
    return defaultAcademicPptSettings;
  }
}

function requestOrigin(request: Request) {
  return new URL(request.url).origin;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(Math.max(Number(searchParams.get("limit") || 10), 1), 10);
    const response: AcademicPptRecentTasksResponse = {
      tasks: await listRecentAcademicPptTasks(limit)
    };
    await scheduleAcademicPptQueue();
    return NextResponse.json(response);
  } catch {
    return NextResponse.json({ code: "ACADEMIC_PPT_TASKS_UNAVAILABLE", message: "最近任务暂不可用。" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureAcademicPptStorage();
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ code: "MISSING_FILE", message: "请先上传 PDF、PPTX 或 TeX 文件。" }, { status: 400 });
    }
    assertAcademicPptFileAllowed(file.name, file.size);

    const settings = parseSettings(formData.get("settings"));
    const taskId = createAcademicPptTaskId();
    const uploaded = await writeAcademicPptUploadedFile(taskId, file);
    await createAcademicPptTaskRecord({
      taskId,
      inputFileName: uploaded.safeName,
      inputFilePath: uploaded.filePath,
      settings
    });
    await appendAcademicPptLog(taskId, "info", `已接收上传文件：${uploaded.safeName}。`);
    await enqueueAcademicPptTask(taskId, { requestOrigin: requestOrigin(request) });
    await scheduleAcademicPptQueue();

    const response: CreateAcademicPptTaskResponse = {
      taskId,
      status: "queued"
    };
    return NextResponse.json(response, { status: 202 });
  } catch (error) {
    return NextResponse.json(
      {
        code: "ACADEMIC_PPT_CREATE_FAILED",
        message: error instanceof Error ? error.message : "学术PPT任务创建失败。"
      },
      { status: 400 }
    );
  }
}
