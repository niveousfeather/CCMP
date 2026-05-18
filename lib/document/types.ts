import type { GeneratedAgentFile } from "@/lib/agent/types";
import type { DocxTableRevision } from "@/lib/document/docx-paragraphs";
import type { WordGenerationIntent } from "@/lib/document/plan";

export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export type DocumentTaskMode = "create" | "create_from_sources" | "revise_comments" | "revise_original" | "polish";

export type DocumentTemplate = "general" | "report" | "proposal" | "meeting_minutes" | "lesson_plan" | "formal_doc";

export type DocumentTaskInput = {
  userId: string;
  title: string;
  markdown: string;
  generationPrompt?: string;
  generationIntent?: WordGenerationIntent;
  fileName?: string;
  sourceFileNames?: string[];
  sourceFiles?: Array<{
    fileName: string;
    mimeType?: string;
    buffer: Buffer;
  }>;
  requestedMode?: DocumentTaskMode;
  template?: DocumentTemplate;
  reviseComments?: {
    instruction?: string;
    revisedParagraphs?: Array<{
      commentId: string;
      revisedText: string;
    }>;
  };
  reviseOriginal?: {
    instruction?: string;
    revisedParagraphs?: Array<{
      paragraphIndex: number;
      revisedText: string;
    }>;
    tableRevisions?: DocxTableRevision[];
  };
};

export type DocumentTaskPlan = {
  mode: DocumentTaskMode;
  template: DocumentTemplate;
  title: string;
  fileName?: string;
  sourceFileNames: string[];
  report: string[];
};

export type DocumentTaskResult = {
  file: GeneratedAgentFile;
  files: GeneratedAgentFile[];
  plan: DocumentTaskPlan;
  reportFile?: GeneratedAgentFile | null;
  reportMarkdown?: string;
};
