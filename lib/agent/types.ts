export type AgentMode = "agent" | "manual";

export type AgentChatRole = "system" | "user" | "assistant";

export type AgentChatMessage = {
  role: AgentChatRole;
  content: string;
};

export type AgentProvider = "xheai" | "moonshot" | "claudecoder" | "subrouter";

export type AgentTaskType = "general_chat" | "analyze_file" | "create_document" | "create_presentation" | "create_spreadsheet" | "clarify";

export type AgentOutputFormat = "text" | "docx" | "pptx" | "xlsx" | "unknown";

export type AgentContentMode = "write" | "ppt" | "image";

export type AgentDecisionAction =
  | "answer"
  | "search_then_answer"
  | "analyze_file"
  | "create_document"
  | "create_presentation"
  | "create_spreadsheet"
  | "generate_image"
  | "clarify";

export type AgentDecision = {
  action: AgentDecisionAction;
  reason: string;
  confidence: number;
};

export type AgentToolDegradation = {
  canContinue: boolean;
  message: string;
  routeReason: string;
};

export type AgentToolSelection = {
  webSearch?: boolean;
  contentMode?: AgentContentMode | null;
};

export type AgentDocumentType =
  | "report"
  | "summary"
  | "proposal"
  | "meeting_minutes"
  | "manual"
  | "briefing"
  | "formal_doc"
  | "lesson_plan"
  | "document";

export type AgentTransformMode = "summarize" | "concise" | "rewrite_formal" | "structured";

export type AgentLengthHint = "short" | "medium" | "long" | "1000_words" | "2_pages";

export type AgentOperationType = "answer" | "analyze" | "summarize" | "rewrite" | "extract" | "create" | "export";

export type AgentTaskField = "outputFormat" | "documentType" | "fileName" | "style" | "length" | "file";

export type AgentTask = {
  type: AgentTaskType;
  outputFormat: AgentOutputFormat;
  operation: AgentOperationType;
  requestedFileName?: string;
  documentType?: AgentDocumentType;
  transformMode?: AgentTransformMode;
  lengthHint?: AgentLengthHint;
  styleHint?: string;
  contentMode?: AgentContentMode;
  requiresFile: boolean;
  hasFiles: boolean;
  missingFields: AgentTaskField[];
  clarificationQuestion?: string;
  defaultsApplied: string[];
  confidence: number;
  reasons: string[];
};

export type AgentPreferences = {
  fileName?: string | null;
  documentType?: AgentDocumentType | string | null;
  styleHint?: string | null;
  lengthHint?: AgentLengthHint | string | null;
};

export type ExtractedDocument = {
  fileName: string;
  fileId: string;
  content: string;
  extractedMarkdown: string;
  structuredFacts?: ExtractedDocumentFact[];
};

export type ExtractedDocumentFactKind =
  | "title"
  | "abstract"
  | "background"
  | "problem"
  | "method"
  | "architecture"
  | "experiment"
  | "comparison"
  | "limitation"
  | "conclusion"
  | "metric"
  | "figure"
  | "source";

export type ExtractedDocumentFact = {
  kind: ExtractedDocumentFactKind;
  text: string;
  source: string;
  score?: number;
};

export type GeneratedAgentFile = {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  objectKey: string | null;
  url: string | null;
};

export type AgentRunResult = {
  content: string;
  modelUsed: string;
  providerUsed: AgentProvider;
  routeReason: string;
  fallbackUsed: boolean;
  extractedDocuments: ExtractedDocument[];
  generatedFiles: GeneratedAgentFile[];
  agentTask?: AgentTask;
  pendingTask?: AgentTask | null;
  defaultsApplied?: string[];
  webContext?: WebContextResult | null;
};

export type WebContextProvider = "nexus_self_hosted" | "baidu_qianfan";

export type WebContextResult = {
  provider: WebContextProvider;
  query: string;
  summary: string;
  items: Array<{
    id?: string;
    title: string;
    url: string;
    snippet: string;
    website?: string;
    date?: string;
    type?: string;
  }>;
  rawMeta?: {
    requestId?: string;
    source?: string;
    fetchedPages?: number;
    fallbackUsed?: boolean;
    fallbackFrom?: WebContextProvider;
    searchDepth?: "light" | "standard" | "deep";
    usage?: {
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
    };
  };
};
