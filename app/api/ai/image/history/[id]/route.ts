import { NextRequest, NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import * as storage from "@/lib/storage";

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireUser();
  if (response) return response;

  const { id } = await params;
  const generation = await prisma.imageGeneration.findFirst({
    where: { id, userId: user!.id },
    include: { assets: true }
  });

  if (!generation) {
    return NextResponse.json({ message: "历史记录不存在" }, { status: 404 });
  }

  await Promise.all(
    generation.assets
      .filter((asset) => Boolean(asset.objectKey))
      .map((asset) => storage.deleteObject(asset.objectKey!))
  );
  await prisma.$transaction([
    prisma.favorite.deleteMany({ where: { userId: user!.id, targetType: "image", targetId: generation.id } }),
    prisma.imageGeneration.delete({ where: { id: generation.id } })
  ]);

  return NextResponse.json({ ok: true });
}
