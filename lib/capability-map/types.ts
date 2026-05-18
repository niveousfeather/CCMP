export type CapabilityMapDomain = "embodied_ai";

export type CapabilityNodeType =
  | "domain"
  | "capability"
  | "skill"
  | "tool"
  | "paper"
  | "company"
  | "dataset"
  | "benchmark"
  | "application";

export type CapabilityRelationType =
  | "includes"
  | "depends_on"
  | "enables"
  | "evaluated_by"
  | "used_in"
  | "related_to"
  | "evidenced_by";

export type CapabilityEvidenceSourceType =
  | "web"
  | "paper"
  | "dataset"
  | "benchmark"
  | "company"
  | "manual";

export type CapabilityMapRefreshMode = "manual" | "scheduled";

export type CapabilityMapExportFormat = "csv" | "xlsx" | "markdown" | "docx";

export type CapabilityNodeDraft = {
  id: string;
  domain: CapabilityMapDomain;
  type: CapabilityNodeType;
  name: string;
  aliases?: string[];
  summary?: string;
  keywords?: string[];
  evidenceIds?: string[];
  confidence?: number;
  updatedAt?: string;
};

export type CapabilityRelationDraft = {
  id: string;
  domain: CapabilityMapDomain;
  type: CapabilityRelationType;
  sourceNodeId: string;
  targetNodeId: string;
  evidenceIds?: string[];
  confidence?: number;
};

export type CapabilityEvidenceDraft = {
  id: string;
  domain: CapabilityMapDomain;
  sourceType: CapabilityEvidenceSourceType;
  title: string;
  url?: string;
  publisher?: string;
  publishedAt?: string;
  retrievedAt?: string;
  summary?: string;
  keywords?: string[];
};

export type CapabilityMapDraft = {
  domain: CapabilityMapDomain;
  title: string;
  version: string;
  nodes: CapabilityNodeDraft[];
  relations: CapabilityRelationDraft[];
  evidence: CapabilityEvidenceDraft[];
  refreshedAt?: string;
};

export type CapabilityMapRefreshPlan = {
  domain: CapabilityMapDomain;
  mode: CapabilityMapRefreshMode;
  searchQueries: string[];
  maxSources: number;
  exportFormats?: CapabilityMapExportFormat[];
};
