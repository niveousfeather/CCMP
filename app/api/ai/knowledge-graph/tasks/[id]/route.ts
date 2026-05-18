import { NextRequest, NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type KnowledgeGraphStatus = "pending" | "completed" | "failed";

function parseGraphJson(value: string) {
  try {
    return JSON.parse(value) as { status?: KnowledgeGraphStatus; errorMessage?: string; statusMessage?: string } & Record<string, unknown>;
  } catch {
    return null;
  }
}

function getGraphStatus(graph: ReturnType<typeof parseGraphJson>): KnowledgeGraphStatus {
  if (graph?.status === "pending" || graph?.status === "failed") return graph.status;
  return "completed";
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const { user, response } = await requireUser();
  if (response) return response;

  const params = await context.params;
  const id = params.id.trim();
  if (!id) return NextResponse.json({ code: "INVALID_TASK_ID", message: "知识图谱任务 ID 不能为空。" }, { status: 400 });

  const item = await prisma.$queryRaw<
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
    WHERE id = ${id} AND userId = ${user!.id}
    LIMIT 1
  `;

  const row = item[0];
  if (!row) return NextResponse.json({ code: "NOT_FOUND", message: "知识图谱任务不存在。" }, { status: 404 });

  const graph = parseGraphJson(row.graphJson);
  if (!graph) return NextResponse.json({ code: "BAD_GRAPH_DATA", message: "知识图谱数据解析失败。" }, { status: 500 });
  const status = getGraphStatus(graph);

  return NextResponse.json({
    task: {
      id: row.id,
      topic: row.topic,
      title: row.title,
      summary: row.summary,
      graph,
      status,
      message: graph.errorMessage || graph.statusMessage || row.summary,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : new Date(row.createdAt).toISOString()
    }
  });
}
