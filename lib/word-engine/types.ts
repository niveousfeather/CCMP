export type WordSourceFile = {
  fileName: string;
  mimeType?: string;
  text?: string;
};

export type WordStylePreset = "professional" | "concise" | "formal";

export type WordRequest = {
  taskId?: string;
  conversationId?: string;
  title: string;
  instruction: string;
  sourceText?: string;
  sourceFiles?: WordSourceFile[];
  conversationSummary?: string;
  outputFileName?: string;
  stylePreset?: WordStylePreset;
  language?: "zh-CN" | "en-US" | string;
  resumeFromMemory?: WordTaskMemory | null;
  resumeInstruction?: string;
};

export type WordSection = {
  heading: string;
  paragraphs: string[];
};

export type WordTable = {
  title: string;
  headers: string[];
  rows: string[][];
};

export type WordPlan = {
  title: string;
  subtitle?: string;
  sections: WordSection[];
  tables: WordTable[];
  metadata: {
    language: string;
    stylePreset: WordStylePreset;
    sourceCount: number;
  };
};

export type WordContent = {
  title: string;
  subtitle?: string;
  sections: WordSection[];
  tables: WordTable[];
  footerNote?: string;
};

export type WordValidationResult =
  | { ok: true; warnings: string[] }
  | { ok: false; errors: string[]; warnings: string[] };

export type WordGenerateResult = {
  fileName: string;
  buffer: Buffer;
  mimeType: string;
  sizeBytes: number;
  warnings: string[];
  wordTaskMemory: WordTaskMemory;
};

export type WordTaskStage =
  | "planning"
  | "generating_content"
  | "sanitizing"
  | "rendering_docx"
  | "completed"
  | "failed"
  | "interrupted";

export type WordTaskMemory = {
  taskId?: string;
  conversationId: string;
  originalInstruction: string;
  title: string;
  sourceFileNames: string[];
  sourceSummary: string;
  plan: WordPlan | null;
  completedSections: string[];
  pendingSections: string[];
  currentStage: WordTaskStage;
  failureReason?: string;
  resumeInstruction?: string;
  createdAt: string;
  updatedAt: string;
};
