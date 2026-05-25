export type Conversation = {
  userId: string;
  conversationId: string;
  type: "chat";
  title: string;
  summary: string;
  status: "新对话" | "活跃" | "已归档";
  model: string;
  isFavorite?: boolean;
  favoriteId?: string;
  createdAt: string;
  updatedAt: string;
};

export type ChatAttachmentStatus = "已添加" | "已发送" | "仅前端展示";

export type ChatAttachment = {
  id: string;
  name: string;
  type: string;
  size: number;
  kind: "image" | "video" | "pdf" | "word" | "spreadsheet" | "text" | "file";
  file?: File;
  previewUrl?: string;
  downloadUrl?: string;
  uploadedAt: string;
  status: ChatAttachmentStatus;
  objectKey?: string | null;
  url?: string | null;
  providerFileId?: string | null;
};

export type ChatImageGeneration = {
  generationId: string;
  originalPrompt: string;
  finalPrompt?: string | null;
  model: string;
  aspectRatio?: string;
  resolution?: string;
  status: string;
  images?: string[];
  referenceImages?: Array<{
    url: string;
    name?: string;
  }>;
  retryCount?: number;
  failureReason?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type ChatWebContext = {
  provider: "nexus_self_hosted" | "baidu_qianfan";
  query: string;
  summary?: string;
  items: Array<{
    id?: string;
    title: string;
    url: string;
    snippet?: string;
    website?: string;
    date?: string;
    type?: string;
  }>;
  rawMeta?: {
    requestId?: string;
    source?: string;
    fetchedPages?: number;
    fallbackUsed?: boolean;
    fallbackFrom?: string;
    searchDepth?: "light" | "standard" | "deep";
  };
};

export type DeepWritingSectionStatus = "pending" | "writing" | "completed";

export type DeepWritingPanelState = {
  isOpen: boolean;
  taskId: string;
  title: string;
  currentStage: string;
  progress: number;
  outline: Array<{
    id: string;
    title: string;
    status: DeepWritingSectionStatus;
    preview?: string;
  }>;
  currentSection?: {
    id: string;
    title: string;
    draft: string;
  };
  sources: Array<{
    title: string;
    summary: string;
    url?: string;
    adopted: boolean;
  }>;
  canResume: boolean;
  downloadUrl?: string;
};

export type ChatTaskCard = {
  kind: "task_card";
  taskType: "ppt" | "word" | "excel" | "image" | "file-analysis" | "teaching-diagram" | "knowledge-graph";
  status: "queued" | "running" | "completed" | "failed";
  title: string;
  description?: string;
  taskId?: string;
  downloadUrl?: string | null;
  openUrl?: string | null;
  retryable?: boolean;
  failureReason?: string | null;
  mode?: "deep_writing";
  deepWritingTaskId?: string;
  panelAvailable?: boolean;
  panelAutoOpen?: boolean;
  currentStage?: string;
  deepWritingPanelState?: DeepWritingPanelState | null;
};

export type ChatMessage = {
  id: string;
  clientKey?: string;
  requestId?: string;
  role: "user" | "assistant";
  content: string;
  streamStatus?: "pending" | "streaming" | "finalizing" | "completed" | "interrupted" | "failed";
  streamError?: string;
  createdAt: string;
  statusText?: string;
  reveal?: boolean;
  attachments?: ChatAttachment[];
  imageGeneration?: ChatImageGeneration | null;
  webContext?: ChatWebContext | null;
  taskCard?: ChatTaskCard | null;
  pendingFileGeneration?: {
    taskId?: string;
    kind: "word" | "ppt";
    fileName: string;
    status: "generating" | "failed";
    failureReason?: string | null;
  } | null;
  pendingAgentTask?: {
    taskId?: string;
    label: string;
    status: "generating" | "failed";
    failureReason?: string | null;
  } | null;
  fallback?: boolean;
};

export type SuggestionPrompt = {
  id: string;
  text: string;
};

export function createEmptyConversation(): Conversation {
  const now = Date.now();
  return {
    userId: "current-user",
    conversationId: `draft-${now}`,
    type: "chat",
    title: "新对话",
    summary: "Nexus AI 已就绪。输入问题，或添加智能体开始创作。",
    status: "新对话",
    model: "Nexus AI",
    createdAt: new Date(now).toLocaleString("zh-CN"),
    updatedAt: "刚刚"
  };
}

export const conversations: Conversation[] = [];

export const initialMessages: Record<string, ChatMessage[]> = {};

export const suggestionPrompts: SuggestionPrompt[] = [
  { id: "s1", text: "帮我设计一份小学语文《春晓》教学设计" },
  { id: "s2", text: "生成一份三年级数学单元复习课 PPT 大纲" },
  { id: "s3", text: "Excel 里多条件求和应该怎么写公式？" },
  { id: "s4", text: "把这份资料整理成一份 Word 教案并给我下载链接" }
];

export const models = ["Nexus AI"] as const;
