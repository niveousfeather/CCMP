import { NextRequest, NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { writeErrorLog } from "@/lib/error-log";
import { createTripoModel3DClient } from "@/lib/model3d/tripo";
import * as storage from "@/lib/storage";

const MAX_UPLOAD_SIZE = 80 * 1024 * 1024;
const allowedExtensions = new Set(["fbx", "glb", "gltf", "jpeg", "jpg", "obj", "png", "stl", "webp"]);
const allowedMimeTypes = new Set([
  "",
  "application/octet-stream",
  "image/jpeg",
  "image/png",
  "image/webp",
  "model/gltf+json",
  "model/gltf-binary"
]);

function jsonError(code: string, message: string, status: number) {
  return NextResponse.json({ code, message }, { status });
}

function getExtension(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase() || "";
}

function isAllowedFile(file: File) {
  return allowedExtensions.has(getExtension(file.name)) && allowedMimeTypes.has(file.type || "");
}

function getContentType(file: File) {
  if (file.type) return file.type;
  const extension = getExtension(file.name);
  if (extension === "glb") return "model/gltf-binary";
  if (extension === "gltf") return "model/gltf+json";
  if (extension === "obj") return "model/obj";
  if (extension === "stl") return "model/stl";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  return "application/octet-stream";
}

function getDatePath() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, "");
}

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "-").slice(0, 80) || "asset";
}

export async function POST(request: NextRequest) {
  const { user, response } = await requireUser();
  if (response) return response;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return jsonError("INVALID_FORM_DATA", "3D 上传请求格式不正确。", 400);
  }

  const file = formData.get("file");
  if (!(file instanceof File)) return jsonError("MISSING_FILE", "请上传图片或 3D 模型文件。", 400);
  if (!isAllowedFile(file)) return jsonError("UNSUPPORTED_FILE_TYPE", "仅支持 PNG、JPG、WEBP、GLB、GLTF、FBX、OBJ、STL 文件。", 400);
  if (file.size > MAX_UPLOAD_SIZE) return jsonError("FILE_TOO_LARGE", "文件不能超过 80MB。", 400);

  try {
    const extension = getExtension(file.name);
    const uploadResult = await storage.uploadFile({
      key: `users/${user!.id}/model3d-inputs/${getDatePath()}/${Date.now()}-${sanitizeFileName(file.name)}`,
      file,
      contentType: getContentType(file)
    });
    const storedUrl = await storage.getPublicOrSignedUrl(uploadResult.key).catch(() => uploadResult.url);
    const client = createTripoModel3DClient();
    const uploadResponse = await client.uploadFile(file);
    const token = uploadResponse.data?.image_token || uploadResponse.data?.file_token || uploadResponse.data?.token;

    if (!token) {
      return jsonError("TRIPO_UPLOAD_TOKEN_MISSING", "Tripo 上传成功但未返回可用 token，请核对 upload schema。", 502);
    }

    return NextResponse.json({
      file: {
        fileType: extension === "jpg" ? "jpeg" : extension,
        name: file.name,
        objectKey: uploadResult.key,
        size: file.size,
        storageUrl: storedUrl || uploadResult.url || null,
        token,
        type: file.type || null,
        url: storedUrl || uploadResult.url || uploadResponse.data?.url || null
      },
      provider: "tripo"
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "3D 文件上传失败。";
    const status = message.includes("TRIPO_API_KEY") ? 503 : 500;
    await writeErrorLog({
      userId: user!.id,
      route: "/api/model3d/upload",
      method: "POST",
      status,
      code: "MODEL3D_UPLOAD_FAILED",
      provider: "tripo",
      message
    });
    return jsonError("MODEL3D_UPLOAD_FAILED", message, status);
  }
}
