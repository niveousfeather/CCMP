import { NextRequest, NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import * as storage from "@/lib/storage";

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireUser();
  if (response) return response;

  const { id } = await params;
  const generation = await prisma.model3DGeneration.findFirst({
    where: { userId: user!.id, OR: [{ taskId: id }, { id }, { providerTaskId: id }] }
  });

  if (!generation) {
    return NextResponse.json({ message: "3D 资产记录不存在或无权访问。" }, { status: 404 });
  }

  const keys = [generation.modelObjectKey, generation.previewImageObjectKey, generation.exportObjectKey].filter((key): key is string => Boolean(key));
  await Promise.all(keys.map((key) => storage.deleteObject(key).catch(() => false)));
  await prisma.$transaction([
    prisma.favorite.deleteMany({ where: { userId: user!.id, targetType: "model3d", targetId: generation.taskId } }),
    prisma.model3DGeneration.delete({ where: { id: generation.id } })
  ]);

  return NextResponse.json({ ok: true });
}
