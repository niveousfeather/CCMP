import { NextRequest, NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import * as storage from "@/lib/storage";

function maskVideoUrl(value: string) {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return "invalid-url";
  }
}

export async function GET(request: NextRequest) {
  const { user, response } = await requireUser();
  if (response) return response;

  const source = request.nextUrl.searchParams.get("url");
  const taskId = request.nextUrl.searchParams.get("taskId");

  if (!source) {
    return new NextResponse("Missing video url", { status: 400 });
  }

  let sourceUrl: URL;
  try {
    sourceUrl = new URL(source);
  } catch {
    return new NextResponse("Invalid video url", { status: 400 });
  }

  if (!["http:", "https:"].includes(sourceUrl.protocol)) {
    return new NextResponse("Unsupported video url", { status: 400 });
  }

  const generation = taskId
    ? await prisma.videoGeneration.findFirst({
        where: { id: taskId, userId: user!.id },
        select: { resultVideoUrl: true, resultVideoObjectKey: true }
      })
    : await prisma.videoGeneration.findFirst({
        where: { userId: user!.id, resultVideoUrl: sourceUrl.toString() },
        select: { resultVideoUrl: true, resultVideoObjectKey: true }
      });

  if (!generation?.resultVideoUrl) {
    return new NextResponse("Video preview source is not allowed", { status: 403 });
  }

  const resolvedSource = generation.resultVideoObjectKey
    ? await storage.getPublicOrSignedUrl(generation.resultVideoObjectKey).catch(() => null)
    : generation.resultVideoUrl;

  if (!resolvedSource) {
    return new NextResponse("Video preview source is not available", { status: 404 });
  }

  if (!generation.resultVideoObjectKey && generation.resultVideoUrl !== sourceUrl.toString()) {
    return new NextResponse("Video preview source is not allowed", { status: 403 });
  }

  try {
    sourceUrl = new URL(resolvedSource);
  } catch {
    return new NextResponse("Invalid resolved video url", { status: 500 });
  }

  const range = request.headers.get("range");
  const headers: HeadersInit = {};
  if (range) headers.Range = range;

  try {
    const upstream = await fetch(sourceUrl.toString(), { headers, cache: "no-store" });
    const responseHeaders = new Headers();
    const contentType = upstream.headers.get("content-type") || "video/mp4";
    const contentLength = upstream.headers.get("content-length");
    const contentRange = upstream.headers.get("content-range");

    responseHeaders.set("Content-Type", contentType);
    responseHeaders.set("Accept-Ranges", upstream.headers.get("accept-ranges") || "bytes");
    responseHeaders.set("Cache-Control", "private, no-store");
    responseHeaders.set("Content-Disposition", "inline");
    if (contentLength) responseHeaders.set("Content-Length", contentLength);
    if (contentRange) responseHeaders.set("Content-Range", contentRange);

    if (!upstream.ok && upstream.status !== 206) {
      console.error(`[video:preview] upstream_failed status=${upstream.status} source=${maskVideoUrl(sourceUrl.toString())}`);
      return new NextResponse("Video preview unavailable", { status: upstream.status });
    }

    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: responseHeaders
    });
  } catch (error) {
    console.error(`[video:preview] proxy_failed source=${maskVideoUrl(sourceUrl.toString())} error=${error instanceof Error ? error.message : "unknown"}`);
    return new NextResponse("Video preview unavailable", { status: 502 });
  }
}
