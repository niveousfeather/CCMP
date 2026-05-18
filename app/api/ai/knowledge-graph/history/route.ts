import { NextRequest, NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

function parseGraphJson(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function getGraphStatus(graph: Record<string, unknown> | null) {
  return graph?.status === "pending" || graph?.status === "failed" ? graph.status : "completed";
}

export async function GET() {
  const { user, response } = await requireUser();
  if (response) return response;

  const items = await prisma.$queryRaw<
    Array<{
      id: string;
      topic: string;
      title: string;
      summary: string | null;
      graphJson: string;
      createdAt: Date | string;
    }>
  >`
    SELECT id, topic, title, summary, graphJson, createdAt
    FROM KnowledgeGraphHistory
    WHERE userId = ${user!.id}
    ORDER BY createdAt DESC
    LIMIT 12
  `;

  return NextResponse.json({
    items: items
      .map((item) => {
        const graph = parseGraphJson(item.graphJson);
        return {
          id: item.id,
          topic: item.topic,
          title: item.title,
          summary: item.summary,
          graph,
          status: getGraphStatus(graph),
          message: graph?.errorMessage || graph?.statusMessage || item.summary,
          createdAt: item.createdAt instanceof Date ? item.createdAt.toISOString() : new Date(item.createdAt).toISOString()
        };
      })
      .filter((item) => item.graph)
  });
}

export async function DELETE(request: NextRequest) {
  const { user, response } = await requireUser();
  if (response) return response;

  const id = request.nextUrl.searchParams.get("id")?.trim();
  if (!id) {
    return NextResponse.json({ code: "MISSING_ID", message: "缺少要删除的历史记录 ID。" }, { status: 400 });
  }

  await prisma.$executeRaw`
    DELETE FROM KnowledgeGraphHistory
    WHERE id = ${id} AND userId = ${user!.id}
  `;

  return NextResponse.json({ ok: true, id });
}
