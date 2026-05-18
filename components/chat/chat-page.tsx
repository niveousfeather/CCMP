"use client";

import { DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, GraduationCap, Presentation, Table2, X } from "lucide-react";
import { useSearchParams } from "next/navigation";

import {
  ChatAttachment,
  ChatMessage as ChatMessageType,
  Conversation,
  createEmptyConversation
} from "@/components/chat/chat-data";
import { ChatComposer, ContentToolId } from "@/components/chat/chat-composer";
import { ChatImagePreviewDialog } from "@/components/chat/chat-image-preview-dialog";
import { KnowledgeGraphCanvas } from "@/components/chat/knowledge-graph-canvas";
import { ChatThread } from "@/components/chat/chat-thread";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { shouldShowLocalFileGenerationCard } from "@/lib/agent/reliability";
import { cn } from "@/lib/utils";

type ChatMode = "agent";
type AgentView = "chat" | "discover" | "graph";
type DiscoverAgentId = "lesson" | "ppt" | "excel";

type ConversationDetailResponse = {
  conversation?: Conversation;
  messages?: ChatMessageType[];
  message?: string;
};

type AiChatResponse = {
  content?: string;
  model?: string;
  provider?: "xheai" | "moonshot" | "agent";
  conversationId?: string;
  conversation?: Conversation;
  assistantMessage?: ChatMessageType;
  message?: string;
  code?: string;
};

type AiChatResult = { failed: true } | { failed: false; data: AiChatResponse };

type ChatToolSelection = {
  webSearch: boolean;
  contentMode: ContentToolId | null;
};

type ImageTaskResponse = {
  task?: {
    taskId: string;
    status: string;
    images?: string[];
    finalPrompt?: string | null;
    ratio?: string;
    resolution?: string;
    failureReason?: string | null;
    createdAt?: string;
    updatedAt?: string;
  };
};

type ChatFileTaskResponse = {
  task?: {
    taskId: string;
    status: "generating" | "completed" | "failed";
    kind: "agent" | "word" | "ppt";
    label?: string;
    fileName: string;
    content?: string;
    failureReason?: string | null;
    attachments?: ChatAttachment[];
    webContext?: ChatMessageType["webContext"] | null;
    updatedAt?: string;
  };
};

type ChatImageGenerationMeta = NonNullable<ChatMessageType["imageGeneration"]>;

const DEFAULT_MODEL = "gpt-5.4";
const IMAGE_PENDING_STATUSES = new Set(["生成中", "queued", "pending", "processing", "retrying"]);
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;
const MAX_ATTACHMENTS = 5;
const allowedExtensions = new Set(["png", "jpg", "jpeg", "webp", "pdf", "txt", "md", "doc", "docx", "xls", "xlsx", "csv", "mp4", "mov", "webm", "m4v"]);
const executableExtensions = new Set(["exe", "msi", "bat", "cmd", "sh", "ps1", "app", "dmg", "com", "scr", "js", "jar"]);

const discoverAgents: Array<{
  id: DiscoverAgentId;
  tool: ContentToolId;
  title: string;
  subtitle: string;
  description: string;
  icon: typeof GraduationCap;
  accent: string;
  prompts: string[];
}> = [
  {
    id: "lesson",
    tool: "write",
    title: "教案写作",
    subtitle: "教学设计专家",
    description: "围绕教学目标、重难点、教学过程、课堂活动与评价方式，生成可直接修改的教案方案。",
    icon: GraduationCap,
    accent: "from-amber-100 to-white text-amber-700",
    prompts: [
      "设计一份三维动画课程的教学方案",
      "帮我写一份小学语文《观潮》的第二课时教案",
      "生成一份初中信息科技项目式学习教学设计",
      "把这节公开课设计成导入、探究、展示、评价四个环节"
    ]
  },
  {
    id: "ppt",
    tool: "ppt",
    title: "PPT生成",
    subtitle: "教学课件制作",
    description: "根据课程主题生成课件结构、页面标题、讲授重点和图文内容建议，后续可接第三方 PPT 生成接口。",
    icon: Presentation,
    accent: "from-blue-100 to-white text-blue-700",
    prompts: [
      "生成一份小学科学《声音的产生》教学 PPT",
      "做一份班主任家长会汇报 PPT 大纲",
      "帮我生成一份三维动画课程介绍课件",
      "根据这份资料整理一份图文并茂的教学 PPT"
    ]
  },
  {
    id: "excel",
    tool: "write",
    title: "excel大师",
    subtitle: "表格公式顾问",
    description: "解答 Excel 公式、函数、多条件统计、数据清洗和教学成绩表处理问题。",
    icon: Table2,
    accent: "from-emerald-100 to-white text-emerald-700",
    prompts: [
      "Excel 多条件求和应该怎么写公式？",
      "帮我设计一个学生成绩自动统计表",
      "如何按班级和分数段统计人数？",
      "讲一下 VLOOKUP、XLOOKUP 和 FILTER 的区别"
    ]
  }
];

const welcomePrompts = [
  "帮我整理一份项目方案 Word",
  "生成一份产品介绍 PPT 大纲",
  "Excel 多条件求和怎么写？",
  "把资料整理成 Word 文档",
  "生成一张活动海报配图"
];

function nowTime() {
  return new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function createFallbackReply(input: string) {
  return `模型服务暂时不可用，已进入本地 fallback。\n\n我已收到你的内容：“${input}”。你可以稍后补充 API Key 或重试请求。`;
}

function toApiMessages(messages: ChatMessageType[]) {
  return messages.slice(-20).map((message) => ({
    role: message.role,
    content: message.content
  }));
}

function makeTitle(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > 18 ? `${normalized.slice(0, 18)}...` : normalized || "文件分析";
}

function getImageReferencePreviews(items: ChatAttachment[]) {
  return items
    .filter((attachment) => attachment.kind === "image" && (attachment.previewUrl || attachment.url))
    .map((attachment) => ({
      url: attachment.previewUrl || attachment.url || "",
      name: attachment.name
    }))
    .filter((item) => item.url);
}

function createLocalImagePendingMessage(text: string, referenceImages: ChatImageGenerationMeta["referenceImages"] = []): ChatMessageType {
  const now = Date.now();
  return {
    id: `assistant-image-pending-${now}`,
    role: "assistant",
    content: `好的，我正在围绕“${text}”生成图片。`,
    createdAt: nowTime(),
    imageGeneration: {
      generationId: `local-${now}`,
      originalPrompt: text,
      finalPrompt: "正在优化提示词...",
      model: "gpt-image-2",
      aspectRatio: "自动判断",
      resolution: "1K",
      status: "准备生成",
      images: [],
      referenceImages
    }
  };
}

function createLocalFilePendingMessage(text: string, tool: ContentToolId | null): ChatMessageType | null {
  const inferredTool = shouldShowLocalFileGenerationCard(text, { contentMode: tool });
  if (inferredTool !== "write" && inferredTool !== "ppt") return null;
  const now = Date.now();
  const isPpt = inferredTool === "ppt";
  return {
    id: `assistant-file-pending-${now}`,
    role: "assistant",
    content: isPpt ? "好的，我正在整理结构并生成 PPT。" : "好的，我正在整理内容并生成 Word 文档。",
    createdAt: nowTime(),
    pendingFileGeneration: {
      kind: isPpt ? "ppt" : "word",
      fileName: isPpt ? "演示文稿.pptx" : "文档.docx",
      status: "generating"
    }
  };
}

function likelyNeedsWebSearch(text: string) {
  const normalized = text.toLowerCase().replace(/\s+/g, "");
  return /联网|搜索|网上|明天.*天气|今天.*天气|今日.*天气|当前.*政策|现在.*政策|最新|近期|实时|天气|温度|气温|新闻|课程标准|课标|政策|行业数据|市场数据|参考资料|查一下|帮我查/.test(
    normalized
  );
}

function hasLocalPendingAssistantMessage(messages: ChatMessageType[]) {
  return messages.some((message) =>
    message.imageGeneration?.generationId.startsWith("local-") ||
    message.pendingFileGeneration?.status === "generating" ||
    message.pendingAgentTask?.status === "generating"
  );
}

function revealAssistantMessage(message: ChatMessageType): ChatMessageType {
  if (message.role !== "assistant" || !message.content.trim()) return message;
  return { ...message, reveal: true };
}

function getExtension(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase() || "";
}

function getAttachmentKind(file: File): ChatAttachment["kind"] {
  const extension = getExtension(file.name);
  if (file.type.startsWith("image/") || ["png", "jpg", "jpeg", "webp"].includes(extension)) return "image";
  if (file.type.startsWith("video/") || ["mp4", "mov", "webm", "m4v"].includes(extension)) return "video";
  if (extension === "pdf") return "pdf";
  if (["xls", "xlsx", "csv"].includes(extension)) return "spreadsheet";
  if (["txt", "md"].includes(extension)) return "text";
  if (["doc", "docx"].includes(extension)) return "word";
  return "file";
}

function createAttachment(file: File): ChatAttachment {
  const extension = getExtension(file.name);
  const isImage = file.type.startsWith("image/") || ["png", "jpg", "jpeg", "webp"].includes(extension);

  return {
    id: `${Date.now()}-${crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`,
    name: file.name,
    type: file.type || extension.toUpperCase(),
    size: file.size,
    kind: getAttachmentKind(file),
    file,
    previewUrl: isImage ? URL.createObjectURL(file) : undefined,
    uploadedAt: nowTime(),
    status: "已添加"
  };
}

function isDocumentAttachment(attachment: ChatAttachment) {
  return ["pdf", "word", "spreadsheet", "text", "video"].includes(attachment.kind);
}

function hasImageAttachments(items: ChatAttachment[]) {
  return items.some((attachment) => attachment.kind === "image");
}

function hasDraggedFiles(event: DragEvent<HTMLElement>) {
  return Array.from(event.dataTransfer.types || []).includes("Files");
}

function getDraftConversation() {
  return createEmptyConversation();
}

function normalizeAgentView(value: string | null): AgentView {
  return value === "discover" || value === "graph" ? value : "chat";
}

export function ChatPage() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const [draftConversation, setDraftConversation] = useState<Conversation>(getDraftConversation);
  const [activeConversationId, setActiveConversationId] = useState(draftConversation.conversationId);
  const [messagesByConversation, setMessagesByConversation] = useState<Record<string, ChatMessageType[]>>({
    [draftConversation.conversationId]: []
  });
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [activeView, setActiveView] = useState<AgentView>(() => normalizeAgentView(searchParams.get("view")));
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [selectedContentTool, setSelectedContentTool] = useState<ContentToolId | null>(null);
  const [selectedDiscoverAgent, setSelectedDiscoverAgent] = useState<DiscoverAgentId | null>(null);
  const [mode] = useState<ChatMode>("agent");
  const [model] = useState(DEFAULT_MODEL);
  const [loading, setLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState("Nexus AI 正在思考");
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [dragDepth, setDragDepth] = useState(0);
  const [previewAttachment, setPreviewAttachment] = useState<ChatAttachment | null>(null);
  const [activeWebContext, setActiveWebContext] = useState<ChatMessageType["webContext"] | null>(null);
  const previewUrlsRef = useRef<Set<string>>(new Set());
  const handledDraftTokenRef = useRef<string | null>(null);
  const requestedConversationId = activeView === "chat" ? searchParams.get("conversationId") : null;

  useEffect(() => {
    const nextView = normalizeAgentView(searchParams.get("view"));
    const requestedConversationId = searchParams.get("conversationId");
    const draftToken = searchParams.get("draft");
    setActiveView(nextView);
    if (nextView !== "discover") setSelectedDiscoverAgent(null);
    if (nextView === "chat" && requestedConversationId && requestedConversationId !== activeConversationId) {
      setActiveWebContext(null);
      setActiveConversationId(requestedConversationId);
      if (!messagesByConversation[requestedConversationId]) void loadConversationDetail(requestedConversationId);
    }
    if (nextView === "chat" && draftToken && handledDraftTokenRef.current !== draftToken) {
      handledDraftTokenRef.current = draftToken;
      startNewDraft();
    }
  }, [searchParams, activeConversationId]);

  const messages = messagesByConversation[activeConversationId] || [];
  const isEmptyChat = activeView === "chat" && !requestedConversationId && messages.length === 0 && !loading;
  const shouldShowWelcomePrompts = isEmptyChat && attachments.length === 0;
  const isLoadingRequestedConversation =
    activeView === "chat" && Boolean(requestedConversationId) && requestedConversationId === activeConversationId && !messagesByConversation[activeConversationId];

  useEffect(() => {
    return () => {
      previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      previewUrlsRef.current.clear();
    };
  }, []);

  const pendingImageGenerationIds = useMemo(() => {
    const ids = new Set<string>();
    Object.values(messagesByConversation).forEach((items) => {
      items.forEach((message) => {
        const imageGeneration = message.imageGeneration;
        if (
          imageGeneration?.generationId &&
          !imageGeneration.generationId.startsWith("local-") &&
          IMAGE_PENDING_STATUSES.has(imageGeneration.status)
        ) {
          ids.add(imageGeneration.generationId);
        }
      });
    });
    return Array.from(ids).join(",");
  }, [messagesByConversation]);

  const pendingFileTaskIds = useMemo(() => {
    const ids = new Set<string>();
    Object.values(messagesByConversation).forEach((items) => {
      items.forEach((message) => {
        const taskId = message.pendingFileGeneration?.taskId;
        if (taskId && message.pendingFileGeneration?.status === "generating") ids.add(taskId);
      });
    });
    return Array.from(ids).join(",");
  }, [messagesByConversation]);

  const pendingAgentTaskIds = useMemo(() => {
    const ids = new Set<string>();
    Object.values(messagesByConversation).forEach((items) => {
      items.forEach((message) => {
        const taskId = message.pendingAgentTask?.taskId;
        if (taskId && message.pendingAgentTask?.status === "generating") ids.add(taskId);
      });
    });
    return Array.from(ids).join(",");
  }, [messagesByConversation]);

  useEffect(() => {
    if (!pendingImageGenerationIds) return;
    const ids = pendingImageGenerationIds.split(",").filter(Boolean);
    let cancelled = false;

    async function refreshImageTasks() {
      await Promise.all(
        ids.map(async (id) => {
          try {
            const response = await fetch(`/api/ai/image/tasks/${encodeURIComponent(id)}`);
            const data = (await response.json().catch(() => ({}))) as ImageTaskResponse;
            if (!response.ok || !data.task || cancelled) return;
            setMessagesByConversation((current) => {
              let changed = false;
              const next = Object.fromEntries(
                Object.entries(current).map(([conversationId, items]) => [
                  conversationId,
                  items.map((message) => {
                    if (message.imageGeneration?.generationId !== id) return message;
                    changed = true;
                    return {
                      ...message,
                      imageGeneration: {
                        ...message.imageGeneration,
                        status: data.task!.status,
                        images: data.task!.images || [],
                        finalPrompt: data.task!.finalPrompt || message.imageGeneration.finalPrompt,
                        aspectRatio: data.task!.ratio || message.imageGeneration.aspectRatio,
                        resolution: data.task!.resolution || message.imageGeneration.resolution,
                        failureReason: data.task!.failureReason || null,
                        createdAt: data.task!.createdAt,
                        updatedAt: data.task!.updatedAt
                      }
                    };
                  })
                ])
              ) as Record<string, ChatMessageType[]>;
              return changed ? next : current;
            });
          } catch {
            // Keep the existing pending card; the next polling tick can recover.
          }
        })
      );
    }

    void refreshImageTasks();
    const timer = window.setInterval(refreshImageTasks, 3500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [pendingImageGenerationIds]);

  useEffect(() => {
    if (!pendingFileTaskIds) return;
    const ids = pendingFileTaskIds.split(",").filter(Boolean);
    let cancelled = false;

    async function refreshFileTasks() {
      await Promise.all(
        ids.map(async (id) => {
          try {
            const response = await fetch(`/api/ai/chat/tasks/${encodeURIComponent(id)}`);
            const data = (await response.json().catch(() => ({}))) as ChatFileTaskResponse;
            if (!response.ok || !data.task || cancelled) return;
            setMessagesByConversation((current) => {
              let changed = false;
              const next = Object.fromEntries(
                Object.entries(current).map(([conversationId, items]) => [
                  conversationId,
                  items.map((message) => {
                    if (message.pendingFileGeneration?.taskId !== id) return message;
                    changed = true;
                    if (data.task!.status === "completed") {
                      return {
                        ...message,
                        content: data.task!.content || message.content,
                        attachments: data.task!.attachments || [],
                        pendingFileGeneration: null,
                        reveal: true
                      };
                    }
                    if (data.task!.status === "failed") {
                      return {
                        ...message,
                        content: "生成失败，请重新输入后重试。",
                        pendingFileGeneration: {
                          ...message.pendingFileGeneration!,
                          status: "failed",
                          failureReason: "生成失败，请重新输入后重试。"
                        },
                        reveal: true
                      };
                    }
                    return {
                      ...message,
                      pendingFileGeneration: {
                        ...message.pendingFileGeneration!,
                        fileName: data.task!.fileName || message.pendingFileGeneration!.fileName,
                        status: "generating"
                      }
                    };
                  })
                ])
              ) as Record<string, ChatMessageType[]>;
              return changed ? next : current;
            });
          } catch {
            // Keep the existing pending card; the next polling tick can recover.
          }
        })
      );
    }

    void refreshFileTasks();
    const timer = window.setInterval(refreshFileTasks, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [pendingFileTaskIds]);

  useEffect(() => {
    if (!pendingAgentTaskIds) return;
    const ids = pendingAgentTaskIds.split(",").filter(Boolean);
    let cancelled = false;

    async function refreshAgentTasks() {
      await Promise.all(
        ids.map(async (id) => {
          try {
            const response = await fetch(`/api/ai/chat/tasks/${encodeURIComponent(id)}`);
            const data = (await response.json().catch(() => ({}))) as ChatFileTaskResponse;
            if (!response.ok || !data.task || cancelled) return;
            setMessagesByConversation((current) => {
              let changed = false;
              const next = Object.fromEntries(
                Object.entries(current).map(([conversationId, items]) => [
                  conversationId,
                  items.map((message) => {
                    if (message.pendingAgentTask?.taskId !== id) return message;
                    changed = true;
                    if (data.task!.status === "completed") {
                      return {
                        ...message,
                        content: data.task!.content || message.content,
                        attachments: data.task!.attachments || [],
                        webContext: data.task!.webContext || null,
                        pendingAgentTask: null,
                        reveal: true
                      };
                    }
                    if (data.task!.status === "failed") {
                      return {
                        ...message,
                        content: "生成失败，请重新输入后重试。",
                        pendingAgentTask: {
                          ...message.pendingAgentTask!,
                          status: "failed",
                          failureReason: "生成失败，请重新输入后重试。"
                        },
                        reveal: true
                      };
                    }
                    return {
                      ...message,
                      pendingAgentTask: {
                        ...message.pendingAgentTask!,
                        label: data.task!.label || message.pendingAgentTask!.label,
                        status: "generating"
                      }
                    };
                  })
                ])
              ) as Record<string, ChatMessageType[]>;
              return changed ? next : current;
            });
          } catch {
            // Keep the existing pending state; the next polling tick can recover.
          }
        })
      );
    }

    void refreshAgentTasks();
    const timer = window.setInterval(refreshAgentTasks, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [pendingAgentTaskIds]);

  async function loadConversationDetail(id: string) {
    const response = await fetch(`/api/ai/chat/conversations/${encodeURIComponent(id)}`);
    const data = (await response.json().catch(() => ({}))) as ConversationDetailResponse;
    if (!response.ok || !data.conversation) {
      toast({ type: "error", message: data.message || "会话加载失败。" });
      return;
    }
    setMessagesByConversation((current) => ({ ...current, [id]: data.messages || [] }));
  }

  function updateConversationAfterSend(conversationId: string, text: string) {
    const updater = (conversation: Conversation) => ({
      ...conversation,
      title: conversation.title === "新对话" ? makeTitle(text) : conversation.title,
      summary: text,
      status: "活跃" as const,
      model: "Nexus AI",
      updatedAt: "刚刚"
    });

    if (conversationId === draftConversation.conversationId) {
      setDraftConversation((current) => updater(current));
    }
  }

  function startNewDraft() {
    const nextDraft = getDraftConversation();
    setDraftConversation(nextDraft);
    setActiveConversationId(nextDraft.conversationId);
    setMessagesByConversation((current) => ({ ...current, [nextDraft.conversationId]: [] }));
    setInput("");
    setAttachments([]);
    setActiveView("chat");
    setWebSearchEnabled(false);
    setSelectedContentTool(null);
    setSelectedDiscoverAgent(null);
    setActiveWebContext(null);
    setPreviewAttachment(null);
    setLoading(false);
    setLoadingLabel("Nexus AI 正在思考");
  }

  function addFiles(files: File[]) {
    if (!files.length) return;

    const accepted: ChatAttachment[] = [];
    const rejected: string[] = [];
    const remainingSlots = MAX_ATTACHMENTS - attachments.length;

    for (const file of files) {
      const extension = getExtension(file.name);
      if (accepted.length >= remainingSlots) {
        rejected.push(`${file.name}：单次最多上传 ${MAX_ATTACHMENTS} 个文件`);
        continue;
      }
      if (executableExtensions.has(extension) || !allowedExtensions.has(extension)) {
        rejected.push(`${file.name}：不支持该文件类型`);
        continue;
      }
      if (file.size > MAX_ATTACHMENT_SIZE) {
        rejected.push(`${file.name}：文件超过 10MB`);
        continue;
      }
      accepted.push(createAttachment(file));
    }

    if (accepted.length) {
      accepted.forEach((attachment) => {
        if (attachment.previewUrl) previewUrlsRef.current.add(attachment.previewUrl);
      });
      setAttachments((current) => [...current, ...accepted]);
      toast({ type: "success", message: `已添加 ${accepted.length} 个附件` });
    }

    if (rejected.length) toast({ type: "error", message: rejected.slice(0, 2).join("；") });
  }

  function removeAttachment(id: string) {
    setAttachments((current) => {
      const removed = current.find((attachment) => attachment.id === id);
      if (removed?.previewUrl) {
        URL.revokeObjectURL(removed.previewUrl);
        previewUrlsRef.current.delete(removed.previewUrl);
      }
      return current.filter((attachment) => attachment.id !== id);
    });
  }

  function openFileNotice(attachment: ChatAttachment) {
    if (attachment.kind === "image") {
      setPreviewAttachment(attachment);
      return;
    }
    const downloadUrl = attachment.downloadUrl || attachment.url;
    if (downloadUrl) {
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = attachment.name;
      link.rel = "noreferrer";
      document.body.appendChild(link);
      link.click();
      link.remove();
      return;
    }
    toast({ type: "error", message: "当前暂未接入该文件的预览能力" });
  }

  async function requestAssistantReply(
    nextMessages: ChatMessageType[],
    requestAttachments: ChatAttachment[],
    toolSelection: ChatToolSelection = getToolSelection()
  ): Promise<AiChatResult> {
    const hasDocumentAttachments = requestAttachments.some(isDocumentAttachment);
    const hasImagesForUnderstanding = toolSelection.contentMode !== "image" && hasImageAttachments(requestAttachments);
    try {
      const userText = nextMessages[nextMessages.length - 1]?.content || "";
      setLoadingLabel(
        toolSelection.webSearch && likelyNeedsWebSearch(userText)
          ? "Nexus AI 正在搜索网页并筛选来源"
          : hasImagesForUnderstanding
            ? "Nexus AI 正在理解图片内容"
            : hasDocumentAttachments
            ? "Nexus AI 正在解析文件并组织回答"
            : "Nexus AI 正在思考"
      );
      const response = requestAttachments.length
        ? await requestMultipartChat(nextMessages, requestAttachments, toolSelection)
        : await requestTextChat(nextMessages, toolSelection);
      const data = (await response.json().catch(() => ({}))) as AiChatResponse;

      if (response.ok && typeof data.content === "string" && data.conversationId) {
        return { failed: false as const, data };
      }

      if (data.code === "MISSING_API_KEY") {
        toast({ type: "error", message: "API Key 未配置，已使用本地 fallback 回复" });
        return {
          failed: false as const,
          data: {
            content: createFallbackReply(nextMessages[nextMessages.length - 1]?.content || ""),
            model: "Nexus AI",
            provider: "agent",
            conversationId: activeConversationId
          }
        };
      }

      toast({ type: "error", message: data.message || "模型请求失败，请稍后重试" });
      return { failed: true as const };
    } catch {
      toast({ type: "error", message: "模型请求失败，请稍后重试" });
      return { failed: true as const };
    }
  }

  function getToolSelection(): ChatToolSelection {
    return {
      webSearch: webSearchEnabled,
      contentMode: selectedContentTool
    };
  }

  function requestTextChat(nextMessages: ChatMessageType[], toolSelection: ChatToolSelection = getToolSelection()) {
    return fetch("/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode,
        conversationId: activeConversationId,
        model,
        messages: toApiMessages(nextMessages),
        tools: toolSelection
      })
    });
  }

  function requestMultipartChat(
    nextMessages: ChatMessageType[],
    requestAttachments: ChatAttachment[],
    toolSelection: ChatToolSelection = getToolSelection()
  ) {
    const formData = new FormData();
    formData.append("mode", mode);
    formData.append("conversationId", activeConversationId);
    formData.append("model", model);
    formData.append("messages", JSON.stringify(toApiMessages(nextMessages)));
    formData.append("tools", JSON.stringify(toolSelection));
    requestAttachments.forEach((attachment) => {
      if (attachment.file) formData.append("files", attachment.file, attachment.name);
    });

    return fetch("/api/ai/chat", { method: "POST", body: formData });
  }

  async function sendMessage() {
    const rawInput = input.trim();
    const pendingAttachments = attachments;
    const defaultText = pendingAttachments.length ? "我上传了文件，请帮我分析。" : "";
    const text = (rawInput || defaultText).trim();
    if (!text || loading) return;

    const conversationId = activeConversationId;
    const sentAttachments = pendingAttachments.map((attachment) => ({
      ...attachment,
      status: "已发送" as const,
      uploadedAt: nowTime()
    }));
    const userMessage: ChatMessageType = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
      createdAt: nowTime(),
      attachments: sentAttachments.length ? sentAttachments : undefined
    };
    const referenceImages = getImageReferencePreviews(sentAttachments);
    const localImagePendingMessage =
      selectedContentTool === "image" ? createLocalImagePendingMessage(text, referenceImages) : null;
    const localFilePendingMessage = !localImagePendingMessage
      ? createLocalFilePendingMessage(text, selectedContentTool)
      : null;
    const apiMessages = [...messages, userMessage];
    const localPendingMessage = localImagePendingMessage || localFilePendingMessage;
    const nextMessages = localPendingMessage ? [...apiMessages, localPendingMessage] : apiMessages;

    setMessagesByConversation((current) => ({ ...current, [conversationId]: nextMessages }));
    updateConversationAfterSend(conversationId, text);
    setInput("");
    setAttachments([]);
    setActiveView("chat");
    setLoading(true);
    setLoadingLabel(
      webSearchEnabled && likelyNeedsWebSearch(text)
        ? "Nexus AI 正在搜索网页并筛选来源"
        : selectedContentTool !== "image" && hasImageAttachments(sentAttachments)
          ? "Nexus AI 正在理解图片内容"
        : selectedContentTool === "image"
          ? "Nexus AI 正在创建图像任务"
          : "Nexus AI 正在思考"
    );

    const result = await requestAssistantReply(apiMessages, pendingAttachments);

    if (result.failed) {
      if (localPendingMessage) {
        setMessagesByConversation((current) => ({
          ...current,
          [conversationId]: apiMessages
        }));
      }
      setInput(rawInput);
      setAttachments(pendingAttachments);
      setLoading(false);
      return;
    }

    const data = result.data;
    const persistedConversationId = data.conversationId || conversationId;
    const assistantMessage: ChatMessageType = revealAssistantMessage(data.assistantMessage || {
      id: `assistant-${Date.now()}`,
      role: "assistant",
      content: data.content || "",
      createdAt: nowTime(),
      fallback: !data.assistantMessage
    });
    if (localImagePendingMessage?.imageGeneration && assistantMessage.imageGeneration && referenceImages.length) {
      assistantMessage.imageGeneration = {
        ...assistantMessage.imageGeneration,
        referenceImages
      };
    }

    if (persistedConversationId !== conversationId) {
      setMessagesByConversation((current) => {
        const next = { ...current };
        delete next[conversationId];
        next[persistedConversationId] = localPendingMessage
          ? (current[conversationId] || nextMessages).map((message) =>
              message.id === localPendingMessage.id ? assistantMessage : message
            )
          : [...apiMessages, assistantMessage];
        return next;
      });
      setActiveConversationId(persistedConversationId);
    } else {
      setMessagesByConversation((current) => ({
        ...current,
        [persistedConversationId]: localPendingMessage
          ? (current[persistedConversationId] || []).map((message) =>
              message.id === localPendingMessage.id ? assistantMessage : message
            )
          : [...(current[persistedConversationId] || []), assistantMessage]
      }));
    }

    if (data.conversation) {
      window.dispatchEvent(new Event("nexus-chat-conversations-updated"));
      setDraftConversation(createEmptyConversation());
    }
    setAttachments([]);
    setLoading(false);
    setLoadingLabel("Nexus AI 正在思考");
  }

  async function retryImageGeneration(imageGeneration: ChatImageGenerationMeta) {
    if (loading) return;
    const prompt = imageGeneration.originalPrompt || imageGeneration.finalPrompt || "";
    if (!prompt.trim()) {
      toast({ type: "error", message: "没有找到可重试的图像描述。" });
      return;
    }

    const conversationId = activeConversationId;
    const retryPrompt = prompt.trim();
    const userMessage: ChatMessageType = {
      id: `user-image-retry-${Date.now()}`,
      role: "user",
      content: retryPrompt,
      createdAt: nowTime()
    };
    const localImagePendingMessage = createLocalImagePendingMessage(retryPrompt, imageGeneration.referenceImages || []);
    localImagePendingMessage.imageGeneration = {
      ...localImagePendingMessage.imageGeneration!,
      retryCount: (imageGeneration.retryCount || 0) + 1
    };

    const apiMessages = [...messages, userMessage];
    setSelectedContentTool("image");
    setMessagesByConversation((current) => ({ ...current, [conversationId]: [...apiMessages, localImagePendingMessage] }));
    updateConversationAfterSend(conversationId, retryPrompt);
    setActiveView("chat");
    setLoading(true);
    setLoadingLabel("Nexus AI 正在重新创建图像任务");

    const result = await requestAssistantReply(apiMessages, [], { webSearch: webSearchEnabled, contentMode: "image" });
    if (result.failed) {
      setMessagesByConversation((current) => ({
        ...current,
        [conversationId]: (current[conversationId] || []).map((message) =>
          message.id === localImagePendingMessage.id
            ? {
                ...localImagePendingMessage,
                content: "图片重新生成没有成功。",
                imageGeneration: {
                  ...localImagePendingMessage.imageGeneration!,
                  status: "failed",
                  failureReason: "重新生成请求失败，请稍后再试。"
                }
              }
            : message
        )
      }));
      setLoading(false);
      return;
    }

    const data = result.data;
    const persistedConversationId = data.conversationId || conversationId;
    const assistantMessage: ChatMessageType = revealAssistantMessage(data.assistantMessage || {
      id: `assistant-image-retry-${Date.now()}`,
      role: "assistant",
      content: data.content || "",
      createdAt: nowTime(),
      fallback: !data.assistantMessage
    });
    if (assistantMessage.imageGeneration && imageGeneration.referenceImages?.length) {
      assistantMessage.imageGeneration = {
        ...assistantMessage.imageGeneration,
        referenceImages: imageGeneration.referenceImages,
        retryCount: (imageGeneration.retryCount || 0) + 1
      };
    }

    if (persistedConversationId !== conversationId) {
      setMessagesByConversation((current) => {
        const baseMessages = current[conversationId] || current[persistedConversationId] || [];
        const next = { ...current };
        delete next[conversationId];
        next[persistedConversationId] = baseMessages.map((message) =>
          message.id === localImagePendingMessage.id ? assistantMessage : message
        );
        return next;
      });
      setActiveConversationId(persistedConversationId);
    } else {
      setMessagesByConversation((current) => ({
        ...current,
        [persistedConversationId]: (current[persistedConversationId] || []).map((message) =>
          message.id === localImagePendingMessage.id ? assistantMessage : message
        )
      }));
    }

    if (data.conversation) {
      window.dispatchEvent(new Event("nexus-chat-conversations-updated"));
      setDraftConversation(createEmptyConversation());
    }
    setLoading(false);
    setLoadingLabel("Nexus AI 正在思考");
  }

  function handleDragEnter(event: DragEvent<HTMLElement>) {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    setDragDepth((current) => current + 1);
    setIsDraggingFile(true);
  }

  function handleDragOver(event: DragEvent<HTMLElement>) {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  function handleDragLeave(event: DragEvent<HTMLElement>) {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    setDragDepth((current) => {
      const next = Math.max(current - 1, 0);
      if (next === 0) setIsDraggingFile(false);
      return next;
    });
  }

  function handleDrop(event: DragEvent<HTMLElement>) {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    setDragDepth(0);
    setIsDraggingFile(false);
    addFiles(Array.from(event.dataTransfer.files || []));
  }

  function addAgentToChat(agent: (typeof discoverAgents)[number], prompt?: string) {
    setSelectedContentTool(agent.tool);
    setInput(prompt || "");
    setActiveView("chat");
    setSelectedDiscoverAgent(null);
  }

  return (
    <div
      className="relative flex h-[calc(100svh-8rem)] min-h-[620px] w-full overflow-hidden bg-[var(--color-panel)] md:h-[calc(100vh-8.5rem)]"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDraggingFile ? (
        <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center border border-dashed border-[color:var(--color-border-strong)] bg-[color-mix(in_srgb,var(--color-panel)_88%,transparent)] backdrop-blur-sm">
          <div className="rounded-xl border border-[color:var(--color-border)] bg-[var(--color-panel)] px-6 py-4 text-center shadow-[var(--shadow-panel)]">
            <p className="text-base font-semibold text-[var(--color-text)]">释放文件以上传</p>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">支持图片、PDF、文档和表格，单个文件不超过 10MB</p>
          </div>
        </div>
      ) : null}

      <ChatImagePreviewDialog attachment={previewAttachment} onClose={() => setPreviewAttachment(null)} />

      <section className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {activeView === "discover" ? (
          <DiscoverAgents
            selectedAgentId={selectedDiscoverAgent}
            onSelectAgent={setSelectedDiscoverAgent}
            onAddAgent={addAgentToChat}
          />
        ) : activeView === "graph" ? (
          <KnowledgeGraphCanvas />
        ) : isLoadingRequestedConversation ? (
          <ConversationOpening />
        ) : isEmptyChat ? (
          <ChatWelcome />
        ) : (
          <ChatThread
            key={activeConversationId}
            messages={messages}
            loading={loading && !hasLocalPendingAssistantMessage(messages)}
            loadingLabel={loadingLabel}
            onPreviewAttachment={setPreviewAttachment}
            onOpenFile={openFileNotice}
            onRetryImageGeneration={retryImageGeneration}
            onOpenWebContext={setActiveWebContext}
          />
        )}

        {activeView === "chat" ? (
          <ChatComposer
            value={input}
            loading={loading}
            attachments={attachments}
            webSearchEnabled={webSearchEnabled}
            selectedContentTool={selectedContentTool}
            placement={isEmptyChat ? "center" : "bottom"}
            onToggleWebSearch={() => setWebSearchEnabled((current) => !current)}
            onSelectContentTool={setSelectedContentTool}
            onChange={setInput}
            onSubmit={sendMessage}
            onAddFiles={addFiles}
            onRemoveAttachment={removeAttachment}
            onPreviewAttachment={setPreviewAttachment}
            onOpenFile={openFileNotice}
          />
        ) : null}
        {shouldShowWelcomePrompts ? <WelcomePromptChips onSelectPrompt={setInput} /> : null}
      </section>
      {activeView === "chat" ? (
        <>
          {activeWebContext ? (
            <button
              type="button"
              className="absolute inset-0 z-30 bg-black/5 backdrop-blur-[1px] md:bg-transparent md:backdrop-blur-0"
              onClick={() => setActiveWebContext(null)}
              aria-label="关闭搜索结果遮罩"
            />
          ) : null}
          <SearchResultsPanel webContext={activeWebContext} onClose={() => setActiveWebContext(null)} />
        </>
      ) : null}
    </div>
  );
}

function SearchResultsPanel({
  webContext,
  onClose
}: {
  webContext: ChatMessageType["webContext"] | null;
  onClose: () => void;
}) {
  const items = (webContext?.items || []).filter((item) => item.url && item.title);
  const providerLabel = webContext?.provider === "baidu_qianfan" ? "百度兜底" : "自建搜索";

  return (
    <aside
      className={cn(
        "absolute inset-y-0 right-0 z-40 flex w-[min(420px,calc(100vw-28px))] flex-col border-l border-[color:var(--color-border)] bg-[var(--color-panel)] shadow-[-18px_0_44px_rgba(15,23,42,0.08)] transition-transform duration-300",
        webContext ? "translate-x-0" : "translate-x-full"
      )}
      aria-hidden={!webContext}
    >
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-[color:var(--color-border)] px-4">
        <div>
          <p className="text-sm font-semibold text-[var(--color-text)]">搜索结果</p>
          <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
            {items.length ? `${providerLabel} / ${items.length} 个网页` : "暂无可展示来源"}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="grid h-8 w-8 place-items-center rounded-full text-[var(--color-text-muted)] transition hover:bg-[var(--color-soft)] hover:text-[var(--color-text)]"
          aria-label="关闭搜索结果"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {items.length ? (
          <div className="grid gap-3">
            {items.map((item, index) => (
              <a
                key={`${item.url}-${index}`}
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-2xl border border-[color:var(--color-border)] bg-[var(--color-bg-elevated)] p-4 shadow-sm transition hover:border-blue-200 hover:shadow-[0_14px_36px_rgba(15,23,42,0.08)]"
              >
                <div className="mb-2 flex items-center gap-2 text-xs text-[var(--color-text-faint)]">
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-blue-50 text-blue-600">
                    {index + 1}
                  </span>
                  <span className="truncate">{item.website || getHostname(item.url)}</span>
                  {item.date ? <span className="shrink-0">{item.date}</span> : null}
                </div>
                <h3 className="line-clamp-2 text-sm font-semibold leading-6 text-[var(--color-text)]">{item.title}</h3>
                {item.snippet ? (
                  <p className="mt-2 line-clamp-3 text-xs leading-5 text-[var(--color-text-muted)]">{item.snippet}</p>
                ) : null}
                <div className="mt-3 flex items-center gap-1.5 text-xs font-medium text-blue-600/85">
                  源网页
                  <ExternalLink className="h-3.5 w-3.5" />
                </div>
              </a>
            ))}
          </div>
        ) : (
          <div className="grid h-full place-items-center text-center">
            <div>
              <p className="text-sm font-medium text-[var(--color-text)]">暂无搜索结果</p>
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">这条回复没有可展示的网页来源。</p>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

function getHostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function ConversationOpening() {
  return (
    <div className="min-h-0 flex-1" aria-label="正在打开对话" />
  );
}

function ChatWelcome() {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[calc(50%-220px)] z-10 px-6 sm:top-[calc(50%-238px)]">
      <div className="mx-auto flex w-[min(100%-48px,980px)] items-end justify-between gap-6">
        <div className="pb-3 sm:pb-8">
          <h2 className="max-w-[11em] text-[26px] font-semibold leading-tight tracking-normal text-[var(--color-text)] sm:max-w-none sm:text-[28px] md:text-4xl">
            有什么需要我帮助你的吗？
          </h2>
        </div>
        <PixelCatShow />
      </div>
    </div>
  );
}

function WelcomePromptChips({ onSelectPrompt }: { onSelectPrompt: (prompt: string) => void }) {
  return (
    <div className="pointer-events-auto absolute left-1/2 top-[calc(50%+178px)] z-20 hidden max-h-none w-[min(100%-40px,980px)] -translate-x-1/2 flex-wrap justify-center gap-2 overflow-hidden px-2 sm:flex">
      {welcomePrompts.map((prompt) => (
        <button
          key={prompt}
          type="button"
          onClick={() => onSelectPrompt(prompt)}
          className="rounded-full bg-[var(--color-soft)] px-4 py-2 text-sm text-[var(--color-text-muted)] transition hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]"
        >
          {prompt}
        </button>
      ))}
    </div>
  );
}

function PixelCatShow() {
  return (
    <div className="relative hidden h-52 w-80 shrink-0 md:block" aria-hidden="true">
      <div className="cat-spark cat-spark-a" />
      <div className="cat-spark cat-spark-b" />
      <div className="cat-spark cat-spark-c" />
      <div className="pixel-cat pixel-cat-run" />
      <div className="pixel-cat pixel-cat-sleep" />
      <div className="absolute bottom-0 left-8 right-4 z-0 h-3 rounded-[50%] bg-orange-200/70 blur-[1px]" />
    </div>
  );
}

function DiscoverAgents({
  selectedAgentId,
  onSelectAgent,
  onAddAgent
}: {
  selectedAgentId: DiscoverAgentId | null;
  onSelectAgent: (id: DiscoverAgentId) => void;
  onAddAgent: (agent: (typeof discoverAgents)[number], prompt?: string) => void;
}) {
  const selectedAgent = discoverAgents.find((agent) => agent.id === selectedAgentId);

  if (selectedAgent) {
    const Icon = selectedAgent.icon;
    return (
      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-10">
        <div className="mx-auto max-w-2xl">
          <div className="flex items-center gap-5">
            <div className={cn("grid h-24 w-24 place-items-center rounded-full bg-gradient-to-br", selectedAgent.accent)}>
              <Icon className="h-10 w-10" />
            </div>
            <div>
              <p className="text-sm text-[var(--color-text-muted)]">{selectedAgent.subtitle}</p>
              <h2 className="mt-1 text-3xl font-semibold text-[var(--color-text)]">{selectedAgent.title}</h2>
              <Button className="mt-4" variant="primary" size="sm" onClick={() => onAddAgent(selectedAgent)}>
                添加到对话
              </Button>
            </div>
          </div>

          <p className="mt-8 text-sm leading-7 text-[var(--color-text-muted)]">{selectedAgent.description}</p>
          <div className="mt-8 grid gap-3">
            {selectedAgent.prompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => onAddAgent(selectedAgent, prompt)}
                className="w-fit rounded-xl bg-[var(--color-soft)] px-4 py-3 text-left text-sm text-[var(--color-text)] transition hover:bg-[var(--color-hover)]"
              >
                {prompt} →
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-8 py-10">
      <div className="mx-auto w-full max-w-4xl">
        <h2 className="text-2xl font-semibold text-[var(--color-text)]">发现 AI 智能体</h2>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">选择一个教学智能体，查看详情后添加到对话。</p>
        <div className="mt-8 grid gap-3 md:grid-cols-2">
          {discoverAgents.map((agent) => {
            const Icon = agent.icon;
            return (
              <button
                key={agent.id}
                type="button"
                onClick={() => onSelectAgent(agent.id)}
                className="flex min-h-[112px] items-center gap-4 rounded-xl border border-[color:var(--color-border)] bg-[var(--color-bg)] p-4 text-left transition hover:-translate-y-0.5 hover:border-[color:var(--color-border-strong)] hover:shadow-[var(--shadow-panel)]"
              >
                <span className={cn("grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br", agent.accent)}>
                  <Icon className="h-6 w-6" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-[var(--color-text)]">{agent.title}</span>
                  <span className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--color-text-muted)]">{agent.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

