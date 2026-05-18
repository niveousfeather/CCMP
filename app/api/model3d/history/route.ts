import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { model3DGenerationToTask } from "@/lib/model3d/history";

export async function GET() {
  const { user, response } = await requireUser();
  if (response) return response;

  const generations = await prisma.model3DGeneration.findMany({
    where: { userId: user!.id },
    orderBy: { updatedAt: "desc" },
    take: 100
  });

  const tasks = await Promise.all(generations.map(model3DGenerationToTask));
  return NextResponse.json({ tasks });
}
