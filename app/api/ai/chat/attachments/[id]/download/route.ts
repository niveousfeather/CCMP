import { NextRequest, NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import * as storage from "@/lib/storage";

const DOWNLOAD_TIMEOUT_MS = 60_000;
const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^0\.0\.0\.0$/,
  /^\[?::1\]?$/i
];

function safeFilename(value: string) {
  const cleaned = value.replace(/[\\/:*?"<>|]/g, "-").slice(0, 120);
  return cleaned || "nexusai-file";
}

function asciiFallback(filename: string) {
  const extension = filename.match(/\.[a-z0-9]+$/i)?.[0] || "";
  return `nexusai-file${extension}`;
}

function contentDisposition(filename: string) {
  const safe = safeFilename(filename);
  return `attachment; filename="${asciiFallback(safe)}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}

function isPrivateOrLocalHost(hostname: string) {
  return PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(hostname));
}

function normalizeSourceUrl(rawUrl: string, request: NextRequest) {
  if (rawUrl.startsWith("/mock-storage/")) return new URL(rawUrl, request.nextUrl.origin);
  return new URL(rawUrl);
}

function isAllowedSourceUrl(url: URL, request: NextRequest) {
  if (!["http:", "https:"].includes(url.protocol)) return false;
  if (url.origin === request.nextUrl.origin && url.pathname.startsWith("/mock-storage/")) return true;
  return !isPrivateOrLocalHost(url.hostname);
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireUser();
  if (response) return response;

  const { id } = await params;
  const attachment = await prisma.chatAttachment.findFirst({
    where: { id, userId: user!.id },
    select: {
      id: true,
      fileName: true,
      mimeType: true,
      objectKey: true,
      url: true
    }
  });

  if (!attachment) {
    return NextResponse.json({ code: "ATTACHMENT_NOT_FOUND", message: "附件不存在。" }, { status: 404 });
  }

  const rawUrl = attachment.objectKey
    ? await storage.getPublicOrSignedUrl(attachment.objectKey).catch(() => null)
    : attachment.url;
  if (!rawUrl) {
    return NextResponse.json({ code: "DOWNLOAD_URL_NOT_FOUND", message: "附件下载地址不存在。" }, { status: 404 });
  }

  let sourceUrl: URL;
  try {
    sourceUrl = normalizeSourceUrl(rawUrl, request);
  } catch {
    return NextResponse.json({ code: "INVALID_DOWNLOAD_URL", message: "附件下载地址不正确。" }, { status: 400 });
  }

  if (!isAllowedSourceUrl(sourceUrl, request)) {
    return NextResponse.json({ code: "DOWNLOAD_URL_NOT_ALLOWED", message: "附件下载地址不在允许范围内。" }, { status: 403 });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);

  try {
    const upstream = await fetch(sourceUrl.toString(), {
      signal: controller.signal,
      cache: "no-store"
    });

    if (!upstream.ok) {
      return NextResponse.json({ code: "DOWNLOAD_FAILED", message: "附件下载失败。" }, { status: 502 });
    }

    const headers = new Headers({
      "Content-Type": upstream.headers.get("content-type") || attachment.mimeType || "application/octet-stream",
      "Content-Disposition": contentDisposition(attachment.fileName)
    });
    const contentLength = upstream.headers.get("content-length");
    if (contentLength) headers.set("Content-Length", contentLength);

    return new NextResponse(upstream.body, { headers });
  } catch (error) {
    const code = error instanceof Error && error.name === "AbortError" ? "TIMEOUT" : "DOWNLOAD_FAILED";
    return NextResponse.json(
      { code, message: code === "TIMEOUT" ? "附件下载超时。" : "附件下载失败。" },
      { status: code === "TIMEOUT" ? 504 : 502 }
    );
  } finally {
    clearTimeout(timer);
  }
}
