import { fetchSelfHostedWebSearch } from "@/lib/agent/tools/web-context";

export type DeepWritingSearchQuery = {
  taskId: string;
  topic: string;
  documentKind: string;
  keywords: string[];
  questions: string[];
  sourceSummary?: string;
  conversationSummary?: string;
  maxResults: number;
};

export type DeepWritingSourceType = "internal_search" | "uploaded_file" | "conversation" | "not_configured";

export type DeepWritingSearchResult = {
  id: string;
  title: string;
  url?: string;
  sourceType: DeepWritingSourceType;
  snippet: string;
  summary: string;
  relevance: "low" | "medium" | "high";
  adopted: boolean;
  [key: string]: unknown;
};

export type DeepWritingSearchProvider = {
  search(input: DeepWritingSearchQuery): Promise<DeepWritingSearchResult[]>;
};

const NOT_CONFIGURED_MESSAGE = "未检测到可用的自建搜索，当前基于已上传资料和对话内容继续写作。";

export function createNotConfiguredSearchProvider(): DeepWritingSearchProvider {
  return {
    async search() {
      return [createNotConfiguredResult()];
    }
  };
}

export function createDefaultDeepWritingSearchProvider(): DeepWritingSearchProvider {
  return {
    async search(input) {
      if (!isSelfHostedSearchConfigured()) return [createNotConfiguredResult()];

      const query = buildSearchQuery(input);
      if (!query) return [createNotConfiguredResult()];

      const result = await fetchSelfHostedWebSearch(query);
      if (!result.items.length) return [createNotConfiguredResult(result.summary)];

      return result.items.slice(0, input.maxResults).map((item, index) => {
        const title = cleanText(item.title || `搜索资料 ${index + 1}`, 120);
        const summary = cleanText(item.snippet || item.website || title, 600);
        return {
          id: item.id || `internal-search-${index + 1}`,
          title,
          ...(item.url ? { url: item.url } : {}),
          sourceType: "internal_search" as const,
          snippet: summary,
          summary,
          relevance: inferRelevance(`${title} ${summary}`, input.keywords),
          adopted: Boolean(title && summary)
        };
      });
    }
  };
}

function createNotConfiguredResult(summary = NOT_CONFIGURED_MESSAGE): DeepWritingSearchResult {
  return {
    id: "not-configured",
    title: "自建搜索未配置",
    sourceType: "not_configured",
    snippet: cleanText(summary, 240),
    summary: cleanText(summary || NOT_CONFIGURED_MESSAGE, 240),
    relevance: "low",
    adopted: false
  };
}

function isSelfHostedSearchConfigured() {
  if (process.env.AGENT_WEB_SELF_HOSTED_ENABLED === "false") return false;
  return Boolean(process.env.AGENT_SEARXNG_ENDPOINT || process.env.AGENT_DEEP_WRITING_SEARCH_ENABLED === "true");
}

function buildSearchQuery(input: DeepWritingSearchQuery) {
  const parts = [
    input.topic,
    input.documentKind,
    input.keywords.slice(0, 5).join(" "),
    input.questions.slice(0, 2).join(" ")
  ];
  return cleanText(parts.join(" "), 260);
}

function inferRelevance(text: string, keywords: string[]): "low" | "medium" | "high" {
  const normalized = text.toLowerCase();
  const hits = keywords.filter((keyword) => keyword && normalized.includes(keyword.toLowerCase())).length;
  if (hits >= 2) return "high";
  if (hits >= 1) return "medium";
  return "low";
}

function cleanText(value: string, maxLength: number) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}
