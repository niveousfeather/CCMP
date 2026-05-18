import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

import { callChatModel } from "@/lib/agent/router";
import { callKimiChat, isDocumentFile, parseDocumentsWithKimi } from "@/lib/agent/skills/parse-document";
import { fetchWebContextResult } from "@/lib/agent/tools/web-context";
import type { WebContextResult } from "@/lib/agent/types";
import type { AgentChatMessage } from "@/lib/agent/types";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

type KnowledgeGraphCategory = {
  id: string;
  label: string;
  color: string;
};

type KnowledgeGraphNode = {
  id: string;
  label: string;
  category: string;
  size?: number;
  description?: string;
};

type KnowledgeGraphLink = {
  source: string;
  target: string;
  label?: string;
  dashed?: boolean;
};

type KnowledgeGraphPayload = {
  title: string;
  subtitle?: string;
  categories: KnowledgeGraphCategory[];
  nodes: KnowledgeGraphNode[];
  links: KnowledgeGraphLink[];
};

type KnowledgeGraphStatus = "pending" | "completed" | "failed";

type KnowledgeGraphPayloadWithStatus = KnowledgeGraphPayload & {
  status?: KnowledgeGraphStatus;
  statusMessage?: string;
  taskId?: string;
  errorMessage?: string;
};

type BufferedKnowledgeGraphFile = {
  buffer: Buffer;
  name: string;
  size: number;
  type: string;
};

export const maxDuration = 300;

const KNOWLEDGE_GRAPH_TIMEOUT_MS = 240_000;
const MAX_FILES = 4;
const MAX_FILE_SIZE = 12 * 1024 * 1024;
const defaultCategoryColors = ["#1d4ed8", "#2563eb", "#0891b2", "#059669", "#d97706", "#7c3aed", "#db2777", "#475569"];

function jsonError(code: string, message: string, status: number) {
  return NextResponse.json({ code, message }, { status });
}

function safeJsonText(text: string) {
  return text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
}

function normalizeId(value: string, fallback: string) {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return cleaned || fallback;
}

function normalizeGraph(raw: unknown, topic: string): KnowledgeGraphPayload {
  const body = raw && typeof raw === "object" ? (raw as Partial<KnowledgeGraphPayload>) : {};
  const rawCategories = Array.isArray(body.categories) ? body.categories : [];
  const categories = rawCategories
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const rawItem = item as Partial<KnowledgeGraphCategory>;
      const label = typeof rawItem.label === "string" && rawItem.label.trim() ? rawItem.label.trim().slice(0, 12) : `分类${index + 1}`;
      return {
        id: normalizeId(String(rawItem.id || label), `category-${index}`),
        label,
        color:
          typeof rawItem.color === "string" && /^#[0-9a-f]{6}$/i.test(rawItem.color)
            ? rawItem.color
            : defaultCategoryColors[index % defaultCategoryColors.length]
      };
    })
    .filter(Boolean) as KnowledgeGraphCategory[];

  if (!categories.some((category) => category.id === "core")) {
    categories.unshift({ id: "core", label: "核心主题", color: "#1d4ed8" });
  }

  const categoryIds = new Set(categories.map((category) => category.id));
  const rawNodes = Array.isArray(body.nodes) ? body.nodes : [];
  const nodes = rawNodes
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const rawItem = item as Partial<KnowledgeGraphNode>;
      const label = typeof rawItem.label === "string" && rawItem.label.trim() ? rawItem.label.trim().slice(0, 18) : "";
      if (!label) return null;
      const category = typeof rawItem.category === "string" && categoryIds.has(rawItem.category) ? rawItem.category : categories[Math.min(index, categories.length - 1)].id;
      const rawSummary = (rawItem as { summary?: unknown }).summary;
      const description =
        typeof rawItem.description === "string" && rawItem.description.trim()
          ? rawItem.description.trim().slice(0, 140)
          : typeof rawSummary === "string" && rawSummary.trim()
            ? rawSummary.trim().slice(0, 140)
            : undefined;
      return {
        id: normalizeId(String(rawItem.id || label), `node-${index}`),
        label,
        category,
        size: typeof rawItem.size === "number" ? Math.max(28, Math.min(92, rawItem.size)) : undefined,
        description
      };
    })
    .filter(Boolean) as KnowledgeGraphNode[];

  if (!nodes.length) {
    nodes.push({ id: "core", label: topic.slice(0, 18), category: "core", size: 86, description: `围绕“${topic}”展开的核心知识主题。` });
  }
  if (!nodes.some((node) => node.id === "core")) {
    nodes.unshift({ id: "core", label: topic.slice(0, 18), category: "core", size: 86, description: `围绕“${topic}”展开的核心知识主题。` });
  }

  const nodeIds = new Set(nodes.map((node) => node.id));
  const rawLinks = Array.isArray(body.links) ? body.links : [];
  const links = rawLinks
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const rawItem = item as Partial<KnowledgeGraphLink>;
      const source = typeof rawItem.source === "string" ? normalizeId(rawItem.source, "") : "";
      const target = typeof rawItem.target === "string" ? normalizeId(rawItem.target, "") : "";
      if (!nodeIds.has(source) || !nodeIds.has(target) || source === target) return null;
      return {
        source,
        target,
        label: typeof rawItem.label === "string" ? rawItem.label.slice(0, 12) : undefined,
        dashed: rawItem.dashed === true
      };
    })
    .filter(Boolean) as KnowledgeGraphLink[];

  if (!links.length) {
    nodes.filter((node) => node.id !== "core").slice(0, 8).forEach((node) => links.push({ source: "core", target: node.id }));
  }

  return {
    title: typeof body.title === "string" && body.title.trim() ? body.title.trim().slice(0, 32) : `${topic}知识图谱`,
    subtitle: typeof body.subtitle === "string" ? body.subtitle.trim().slice(0, 60) : "由 Nexus Agent 联网分析生成",
    categories: categories.slice(0, 8),
    nodes: nodes.slice(0, 64),
    links: links.slice(0, 96)
  };
}

function createFallbackGraphFromSources({
  topic,
  webContext,
  documentText
}: {
  topic: string;
  webContext?: WebContextResult | null;
  documentText: string;
}): KnowledgeGraphPayload {
  const sourceItems = webContext?.items?.slice(0, 10) || [];
  const keywordSource = [
    topic,
    documentText
      .replace(/[#*_`>|\-[\](){}]/g, " ")
      .split(/\s+/)
      .filter((item) => item.length >= 2 && item.length <= 12)
      .slice(0, 24)
      .join(" ")
  ].join(" ");
  const keywordMatches = Array.from(new Set(keywordSource.match(/[\u4e00-\u9fa5A-Za-z0-9]{2,12}/g) || []))
    .filter((item) => !["Nexus", "Agent", "http", "https"].includes(item))
    .slice(0, 14);
  const categories: KnowledgeGraphCategory[] = [
    { id: "core", label: "核心主题", color: "#1d4ed8" },
    { id: "module", label: "知识模块", color: "#0891b2" },
    { id: "source", label: "参考资料", color: "#059669" },
    { id: "concept", label: "关键概念", color: "#7c3aed" },
    { id: "practice", label: "应用拓展", color: "#d97706" }
  ];
  const nodes: KnowledgeGraphNode[] = [
    { id: "core", label: topic.slice(0, 18), category: "core", size: 86, description: `围绕“${topic}”展开的核心知识主题。` }
  ];
  const links: KnowledgeGraphLink[] = [];

  const moduleSeeds = [
    { id: "overview", label: "主题概览", category: "module", size: 62, description: "对主题背景、范围和核心问题进行总览。" },
    { id: "structure", label: "知识结构", category: "module", size: 58, description: "梳理该主题下主要知识模块之间的层级关系。" },
    { id: "application", label: "应用场景", category: "practice", size: 56, description: "将知识点迁移到实践任务、案例或教学活动中。" }
  ];
  moduleSeeds.forEach((node) => {
    nodes.push(node);
    links.push({ source: "core", target: node.id });
  });

  sourceItems.slice(0, 8).forEach((item, index) => {
    const id = `source-${index + 1}`;
    nodes.push({
      id,
      label: (item.title || item.website || `资料${index + 1}`).slice(0, 18),
      category: "source",
      size: index < 3 ? 52 : 44,
      description: (item.snippet || item.website || "联网搜索返回的参考资料，可辅助理解该知识点。").slice(0, 140)
    });
    links.push({ source: index % 2 ? "structure" : "overview", target: id, dashed: index > 4 });
  });

  keywordMatches.slice(0, 12).forEach((keyword, index) => {
    const id = `concept-${index + 1}`;
    nodes.push({
      id,
      label: keyword.slice(0, 18),
      category: "concept",
      size: index < 5 ? 46 : 38,
      description: `“${keyword}”是当前主题中的相关概念，可结合主干节点理解其位置和作用。`
    });
    links.push({ source: index % 3 === 0 ? "core" : index % 3 === 1 ? "structure" : "application", target: id });
  });

  return {
    title: `${topic.slice(0, 18)}知识图谱`,
    subtitle: sourceItems.length ? "已基于联网搜索结果生成基础图谱" : "已基于当前输入生成基础图谱",
    categories,
    nodes: nodes.slice(0, 36),
    links: links.slice(0, 52)
  };
}

async function generateGraphWithFallback({
  topic,
  webText,
  documentText,
  webContext,
  signal
}: {
  topic: string;
  webText: string;
  documentText: string;
  webContext?: WebContextResult | null;
  signal: AbortSignal;
}) {
  const messages = buildGraphPrompt({ topic, webContext: webText, documentContext: documentText });

  try {
    const content = await callChatModel({
      provider: "xheai",
      model: "gpt-5.4",
      messages,
      signal
    });
    return normalizeGraph(JSON.parse(safeJsonText(content)), topic);
  } catch (error) {
    if (signal.aborted || (error instanceof Error && error.name === "AbortError")) throw error;
    console.warn(`[knowledge-graph:model] gpt-5.4 failed, trying kimi fallback error=${error instanceof Error ? error.message : "unknown"}`);
  }

  try {
    const content = await callKimiChat({
      model: process.env.AGENT_KIMI_KNOWLEDGE_GRAPH_MODEL || process.env.AGENT_KIMI_SUMMARY_MODEL || "kimi-k2.5",
      messages,
      signal
    });
    return normalizeGraph(JSON.parse(safeJsonText(content)), topic);
  } catch (error) {
    if (signal.aborted || (error instanceof Error && error.name === "AbortError")) throw error;
    console.warn(`[knowledge-graph:model] kimi fallback failed, using local graph fallback error=${error instanceof Error ? error.message : "unknown"}`);
  }

  return createFallbackGraphFromSources({ topic, webContext, documentText });
}

function toHistoryItem(item: {
  id: string;
  topic: string;
  title: string;
  summary: string | null;
  graphJson: string;
  createdAt: Date | string;
}) {
  return {
    id: item.id,
    topic: item.topic,
    title: item.title,
    summary: item.summary,
    graph: JSON.parse(item.graphJson) as KnowledgeGraphPayload,
    createdAt: item.createdAt instanceof Date ? item.createdAt.toISOString() : new Date(item.createdAt).toISOString()
  };
}

function buildGraphPrompt({
  topic,
  webContext,
  documentContext
}: {
  topic: string;
  webContext: string;
  documentContext: string;
}): AgentChatMessage[] {
  return [
    {
      role: "system",
      content:
        "你是 Nexus Agent 的知识图谱生成器。你不继承任何聊天用户画像，不使用历史对话。请基于用户主题、联网资料和附件内容生成结构化知识图谱 JSON。只输出 JSON，不要 Markdown。"
    },
    {
      role: "user",
      content: [
        `主题：${topic}`,
        "",
        "生成要求：",
        "1. 根据学科/主题特点设计分类，不要固定套用同一套分类。",
        "2. 节点应包含核心主题、一级知识模块、二级细分知识点、关键概念、方法、案例、应用、易错点、评价和拓展关系。",
        "3. 节点数量控制在 28-52 个，关系 36-86 条；如果主题较复杂，优先生成更细的分支。",
        "4. id 使用短英文或拼音，不要空格；source/target 必须引用已有节点 id。",
        "5. 每个 category 给一个适合展示的 hex 颜色。",
        "6. 每个 node 必须包含 description，使用 1-2 句中文解释该节点在主题中的含义、作用或教学价值。",
        "7. size 用 30-90 表示节点重要程度。",
        "8. dashed=true 表示跨模块关联或迁移关系。",
        "",
        "输出 JSON schema：",
        JSON.stringify({
          title: "主题知识图谱",
          subtitle: "一句简短说明",
          categories: [{ id: "core", label: "核心主题", color: "#1d4ed8" }],
          nodes: [{ id: "core", label: "主题", category: "core", size: 86, description: "该节点的简短解释，说明它在主题中的含义和作用。" }],
          links: [{ source: "core", target: "node_id", label: "包含", dashed: false }]
        }),
        "",
        webContext ? `联网资料：\n${webContext.slice(0, 7000)}` : "联网资料：未检索到可用资料。",
        "",
        documentContext ? `附件内容：\n${documentContext.slice(0, 10000)}` : "附件内容：无。"
      ].join("\n")
    }
  ];
}

async function parseRequest(request: NextRequest) {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const topic = String(formData.get("topic") || "").trim();
    const files = formData.getAll("files").filter((item): item is File => item instanceof File);
    return { topic, files };
  }

  const body = (await request.json().catch(() => null)) as { topic?: string } | null;
  return { topic: String(body?.topic || "").trim(), files: [] as File[] };
}

function createPendingGraph(topic: string, taskId: string): KnowledgeGraphPayloadWithStatus {
  return {
    title: `${topic.slice(0, 18)}知识图谱`,
    subtitle: "Nexus Agent 正在生成中，可切换页面后回来继续查看",
    status: "pending",
    statusMessage: "正在联网检索、解析资料并生成节点关系",
    taskId,
    categories: [
      { id: "core", label: "核心主题", color: "#1d4ed8" },
      { id: "analysis", label: "生成中", color: "#60a5fa" }
    ],
    nodes: [
      {
        id: "core",
        label: topic.slice(0, 18) || "知识图谱",
        category: "core",
        size: 88,
        description: "任务已提交，系统会在后台继续生成知识图谱。"
      },
      {
        id: "pending",
        label: "生成中",
        category: "analysis",
        size: 54,
        description: "你可以离开当前页面，返回后会继续同步任务状态。"
      }
    ],
    links: [{ source: "core", target: "pending", label: "生成" }]
  };
}

function createFailedGraph(topic: string, taskId: string, message: string): KnowledgeGraphPayloadWithStatus {
  return {
    ...createPendingGraph(topic, taskId),
    subtitle: "知识图谱生成未完成",
    status: "failed",
    statusMessage: "生成失败",
    errorMessage: message,
    nodes: [
      {
        id: "core",
        label: topic.slice(0, 18) || "知识图谱",
        category: "core",
        size: 88,
        description: "本次知识图谱任务没有生成成功。"
      },
      {
        id: "failed",
        label: "生成失败",
        category: "analysis",
        size: 54,
        description: message
      }
    ],
    links: [{ source: "core", target: "failed", label: "失败" }]
  };
}

function getGraphStatus(graph: KnowledgeGraphPayloadWithStatus | null | undefined): KnowledgeGraphStatus {
  if (graph?.status === "pending" || graph?.status === "failed") return graph.status;
  return "completed";
}

async function createKnowledgeGraphHistory({
  graph,
  id,
  topic,
  userId
}: {
  graph: KnowledgeGraphPayloadWithStatus;
  id: string;
  topic: string;
  userId: string;
}) {
  const now = new Date();
  await prisma.$executeRaw`
    INSERT INTO KnowledgeGraphHistory (id, userId, topic, title, summary, graphJson, updatedAt)
    VALUES (${id}, ${userId}, ${topic}, ${graph.title}, ${graph.subtitle || null}, ${JSON.stringify(graph)}, ${now})
  `;
  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      topic: string;
      title: string;
      summary: string | null;
      graphJson: string;
      createdAt: Date | string;
    }>
  >`SELECT id, topic, title, summary, graphJson, createdAt FROM KnowledgeGraphHistory WHERE id = ${id} LIMIT 1`;
  return rows[0] ? toHistoryItem(rows[0]) : null;
}

async function updateKnowledgeGraphHistory({
  graph,
  id,
  summary,
  title
}: {
  graph: KnowledgeGraphPayloadWithStatus;
  id: string;
  summary: string | null;
  title: string;
}) {
  const now = new Date();
  await prisma.$executeRaw`
    UPDATE KnowledgeGraphHistory
    SET title = ${title}, summary = ${summary}, graphJson = ${JSON.stringify(graph)}, updatedAt = ${now}
    WHERE id = ${id}
  `;
}

async function bufferKnowledgeGraphFiles(files: File[]): Promise<BufferedKnowledgeGraphFile[]> {
  return Promise.all(
    files.map(async (file) => ({
      buffer: Buffer.from(await file.arrayBuffer()),
      name: file.name,
      size: file.size,
      type: file.type || "application/octet-stream"
    }))
  );
}

function bufferedFileToFile(file: BufferedKnowledgeGraphFile) {
  const blob = new Blob([new Uint8Array(file.buffer)], { type: file.type });
  return new File([blob], file.name, { type: file.type });
}

async function runKnowledgeGraphHistoryTask({
  files,
  historyId,
  topic,
  userId
}: {
  files: BufferedKnowledgeGraphFile[];
  historyId: string;
  topic: string;
  userId: string;
}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), KNOWLEDGE_GRAPH_TIMEOUT_MS);

  try {
    const restoredFiles = files.map(bufferedFileToFile);
    const [webContext, extractedDocuments] = await Promise.all([
      fetchWebContextResult(topic, { summarize: false }).catch((error) => {
        console.warn(`[knowledge-graph:web] failed error=${error instanceof Error ? error.message : "unknown"}`);
        return null;
      }),
      restoredFiles.length ? parseDocumentsWithKimi(restoredFiles, controller.signal) : Promise.resolve([])
    ]);

    const webText = webContext?.messages.map((message) => message.content).join("\n\n") || "";
    const documentText = extractedDocuments.map((file) => file.extractedMarkdown).join("\n\n---\n\n");
    const graph = await generateGraphWithFallback({
      topic,
      webText,
      documentText,
      webContext: webContext?.result || null,
      signal: controller.signal
    });

    await updateKnowledgeGraphHistory({
      id: historyId,
      title: graph.title,
      summary: graph.subtitle || null,
      graph: { ...graph, status: "completed", taskId: historyId }
    });
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "知识图谱生成超时，请稍后重试。"
        : error instanceof Error
          ? error.message
          : "知识图谱生成失败，请稍后重试。";
    console.error(`[knowledge-graph] background_failed userId=${userId} historyId=${historyId} error=${message}`);
    const failedGraph = createFailedGraph(topic, historyId, message);
    await updateKnowledgeGraphHistory({
      id: historyId,
      title: failedGraph.title,
      summary: message,
      graph: failedGraph
    }).catch((historyError) => {
      console.warn(`[knowledge-graph:history] failure_save_failed error=${historyError instanceof Error ? historyError.message : "unknown"}`);
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(request: NextRequest) {
  const { user, response } = await requireUser();
  if (response) return response;

  let parsed: Awaited<ReturnType<typeof parseRequest>>;
  try {
    parsed = await parseRequest(request);
  } catch {
    return jsonError("INVALID_REQUEST", "请求格式不正确。", 400);
  }

  const topic = parsed.topic.slice(0, 80);
  if (!topic) return jsonError("INVALID_TOPIC", "请输入知识图谱主题。", 400);
  if (parsed.files.length > MAX_FILES) return jsonError("TOO_MANY_FILES", `最多上传 ${MAX_FILES} 个文件。`, 400);
  for (const file of parsed.files) {
    if (!isDocumentFile(file)) return jsonError("UNSUPPORTED_FILE_TYPE", `${file.name} 暂不支持用于知识图谱。`, 400);
    if (file.size > MAX_FILE_SIZE) return jsonError("FILE_TOO_LARGE", `${file.name} 超过 12MB。`, 400);
  }

  try {
    const historyId = randomUUID();
    const graph = createPendingGraph(topic, historyId);
    const historyItem = await createKnowledgeGraphHistory({
      topic,
      graph,
      id: historyId,
      userId: user!.id
    });
    const bufferedFiles = await bufferKnowledgeGraphFiles(parsed.files);

    setTimeout(() => {
      void runKnowledgeGraphHistoryTask({
        files: bufferedFiles,
        historyId,
        topic,
        userId: user!.id
      });
    }, 0);

    return NextResponse.json(
      {
        graph,
        historyItem,
        status: getGraphStatus(graph),
        taskId: historyId,
        webContext: null
      },
      { status: 202 }
    );
  } catch (error) {
    console.error(`[knowledge-graph] enqueue_failed error=${error instanceof Error ? error.message : "unknown"}`);
    return jsonError("KNOWLEDGE_GRAPH_ENQUEUE_FAILED", "知识图谱任务提交失败，请稍后重试。", 502);
  }
}
