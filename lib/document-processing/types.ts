export type DocumentParserName = "txt" | "markdown" | "docx" | "pdf" | "pptx";

export type DocumentParseStatus = "parsed" | "partial" | "failed" | "empty" | "unsupported";

export type DocumentParseErrorCode =
  | "DOCUMENT_UNSUPPORTED_TYPE"
  | "DOCUMENT_TOO_LARGE"
  | "DOCUMENT_PARSE_FAILED"
  | "DOCUMENT_EMPTY_TEXT"
  | "DOCUMENT_PARSE_TIMEOUT"
  | "DOCUMENT_PASSWORD_PROTECTED"
  | "DOCUMENT_CORRUPTED";

export type DocumentParseWarning = {
  code: DocumentParseErrorCode | "DOCUMENT_TRUNCATED" | "DOCUMENT_NORMALIZED" | "DOCUMENT_PARSER_WARNING";
  message: string;
  fileName?: string;
};

export type DocumentChunk = {
  index: number;
  text: string;
  startOffset: number;
  endOffset: number;
  textLength: number;
};

export type DocumentParseFileInput = {
  fileName: string;
  mimeType?: string;
  size?: number;
  extension?: string;
  buffer?: Buffer | Uint8Array | ArrayBuffer;
  path?: string;
  file?: File;
};

export type DocumentParseInput = {
  sourceType?: "file";
  files: Array<DocumentParseFileInput | File>;
  maxChars?: number;
  chunkSize?: number;
  timeoutMs?: number;
  maxFileSizeBytes?: number;
};

export type ParsedFileResult = {
  fileName: string;
  mimeType: string;
  size: number;
  extension: string;
  parser?: DocumentParserName;
  status: Exclude<DocumentParseStatus, "partial">;
  textLength: number;
  pageCount?: number;
  slideCount?: number;
  warnings: DocumentParseWarning[];
  errorCode?: DocumentParseErrorCode;
  errorMessage?: string;
  text?: string;
  normalizedText?: string;
};

export type DocumentParseResult = {
  sourceType: "file";
  status: DocumentParseStatus;
  files: ParsedFileResult[];
  fullText: string;
  normalizedText: string;
  effectiveText: string;
  chunks: DocumentChunk[];
  textLength: number;
  effectiveTextLength: number;
  warnings: DocumentParseWarning[];
};
