import { NextRequest, NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";

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

function safeFilename(value: string | null) {
  const fallback = "nexusai-image.png";
  if (!value) return fallback;
  const cleaned = value.replace(/[\\/:*?"<>|]/g, "-").slice(0, 80);
  return cleaned || fallback;
}

function isPrivateOrLocalHost(hostname: string) {
  return PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(hostname));
}

function getAllowedStorageHosts() {
  const hosts = new Set<string>();
  const endpoint = process.env.ALI_OSS_ENDPOINT;
  const bucket = process.env.ALI_OSS_BUCKET;

  if (!endpoint) return hosts;

  try {
    const normalized = endpoint.startsWith("http://") || endpoint.startsWith("https://") ? endpoint : `https://${endpoint}`;
    const host = new URL(normalized).host;
    hosts.add(host);
    if (bucket && !host.startsWith(`${bucket}.`)) hosts.add(`${bucket}.${host}`);
  } catch {
    // Keep the proxy closed when OSS endpoint config is invalid.
  }

  return hosts;
}

function normalizeDownloadUrl(rawUrl: string, request: NextRequest) {
  if (rawUrl.startsWith("/mock-storage/")) {
    return new URL(rawUrl, request.nextUrl.origin);
  }
  return new URL(rawUrl);
}

function isAllowedDownloadUrl(url: URL, request: NextRequest) {
  if (!["http:", "https:"].includes(url.protocol)) return false;

  if (url.origin === request.nextUrl.origin && url.pathname.startsWith("/mock-storage/")) {
    return true;
  }

  if (isPrivateOrLocalHost(url.hostname)) {
    return false;
  }

  return getAllowedStorageHosts().has(url.host);
}

export async function GET(request: NextRequest) {
  const { response } = await requireUser();
  if (response) return response;

  const rawUrl = request.nextUrl.searchParams.get("url");
  const filename = safeFilename(request.nextUrl.searchParams.get("filename"));

  if (!rawUrl) {
    return NextResponse.json({ code: "INVALID_URL", message: "图片地址不正确。" }, { status: 400 });
  }

  let sourceUrl: URL;
  try {
    sourceUrl = normalizeDownloadUrl(rawUrl, request);
  } catch {
    return NextResponse.json({ code: "INVALID_URL", message: "图片地址不正确。" }, { status: 400 });
  }

  if (!isAllowedDownloadUrl(sourceUrl, request)) {
    return NextResponse.json({ code: "URL_NOT_ALLOWED", message: "图片下载地址不在允许范围内。" }, { status: 403 });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);

  try {
    const providerResponse = await fetch(sourceUrl.toString(), {
      signal: controller.signal
    });

    if (!providerResponse.ok) {
      return NextResponse.json({ code: "DOWNLOAD_FAILED", message: "图片下载失败。" }, { status: 502 });
    }

    const contentType = providerResponse.headers.get("content-type") || "image/png";
    if (!contentType.toLowerCase().startsWith("image/")) {
      return NextResponse.json({ code: "UNSUPPORTED_CONTENT_TYPE", message: "下载资源不是图片文件。" }, { status: 415 });
    }

    const bytes = await providerResponse.arrayBuffer();

    return new NextResponse(bytes, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`
      }
    });
  } catch (error) {
    const code = error instanceof Error && error.name === "AbortError" ? "TIMEOUT" : "DOWNLOAD_FAILED";
    const message = code === "TIMEOUT" ? "图片下载超时。" : "图片下载失败。";
    return NextResponse.json({ code, message }, { status: code === "TIMEOUT" ? 504 : 502 });
  } finally {
    clearTimeout(timer);
  }
}
