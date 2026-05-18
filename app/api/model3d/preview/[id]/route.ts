import { NextRequest, NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import * as storage from "@/lib/storage";

function getModelContentType(path: string | null) {
  const normalized = path?.toLowerCase() || "";
  if (normalized.endsWith(".glb")) return "model/gltf-binary";
  if (normalized.endsWith(".gltf")) return "model/gltf+json";
  if (normalized.endsWith(".obj")) return "model/obj";
  if (normalized.endsWith(".fbx")) return "application/octet-stream";
  return "application/octet-stream";
}

function getSafeFileName(path: string | null) {
  const fallback = "nexus-3d-preview.glb";
  if (!path) return fallback;
  const clean = path.split("?")[0].split("#")[0].split("/").pop()?.replace(/[\\/:*?"<>|]/g, "-");
  return clean || fallback;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireUser();
  if (response) return response;

  const { id } = await params;
  const generation = await prisma.model3DGeneration.findFirst({
    where: { userId: user!.id, OR: [{ taskId: id }, { id }, { providerTaskId: id }] },
    select: {
      modelObjectKey: true,
      modelUrl: true
    }
  });

  if (!generation?.modelUrl && !generation?.modelObjectKey) {
    return new NextResponse("Model preview source is not available", { status: 404 });
  }

  const source = generation.modelObjectKey
    ? await storage.getPublicOrSignedUrl(generation.modelObjectKey).catch(() => null)
    : generation.modelUrl;

  if (!source) {
    return new NextResponse("Model preview source is not available", { status: 404 });
  }

  const range = request.headers.get("range");
  const headers: HeadersInit = {};
  if (range) headers.Range = range;

  try {
    const upstream = await fetch(source, { headers, cache: "no-store" });
    if (!upstream.ok && upstream.status !== 206) {
      return new NextResponse("Model preview unavailable", { status: upstream.status });
    }

    const responseHeaders = new Headers();
    responseHeaders.set("Content-Type", upstream.headers.get("content-type") || getModelContentType(generation.modelObjectKey || generation.modelUrl));
    responseHeaders.set("Accept-Ranges", upstream.headers.get("accept-ranges") || "bytes");
    responseHeaders.set("Cache-Control", "private, no-store");
    responseHeaders.set("Content-Disposition", `inline; filename="${encodeURIComponent(getSafeFileName(generation.modelObjectKey || generation.modelUrl))}"`);
    responseHeaders.set("Access-Control-Allow-Origin", "*");

    const contentLength = upstream.headers.get("content-length");
    const contentRange = upstream.headers.get("content-range");
    if (contentLength) responseHeaders.set("Content-Length", contentLength);
    if (contentRange) responseHeaders.set("Content-Range", contentRange);

    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: responseHeaders
    });
  } catch (error) {
    console.error(`[model3d:preview] proxy_failed id=${id} error=${error instanceof Error ? error.message : "unknown"}`);
    return new NextResponse("Model preview unavailable", { status: 502 });
  }
}
