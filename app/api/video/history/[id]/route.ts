import { NextRequest, NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import * as storage from "@/lib/storage";

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireUser();
  if (response) return response;

  const { id } = await params;
  const generation = await prisma.videoGeneration.findFirst({
    where: { id, userId: user!.id }
  });

  if (!generation) {
    return NextResponse.json({ message: "视频历史记录不存在。" }, { status: 404 });
  }

  const keys = [
    generation.imageObjectKey,
    generation.resultVideoObjectKey,
    generation.coverImageObjectKey
  ].filter((key): key is string => Boolean(key));

  await Promise.all(keys.map((key) => storage.deleteObject(key).catch(() => false)));
  await prisma.$transaction([
    prisma.favorite.deleteMany({ where: { userId: user!.id, targetType: "video", targetId: generation.id } }),
    prisma.videoGeneration.delete({ where: { id: generation.id } })
  ]);

  return NextResponse.json({ ok: true });
}

