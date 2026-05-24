export type TextFitRole = "title" | "core" | "module" | "tag" | "edgeLabel" | "caption";

type TextFitParams = {
  text: string;
  boxWidth: number;
  boxHeight: number;
  role: TextFitRole;
};

type TextFitResult = {
  fontSize: number;
  lines: string[];
  lineHeight: number;
};

const ROLE_LIMITS: Record<TextFitRole, { max: number; min: number; maxLines: number; weight: number }> = {
  title: { max: 46, min: 26, maxLines: 2, weight: 0.58 },
  core: { max: 40, min: 24, maxLines: 3, weight: 0.58 },
  module: { max: 28, min: 16, maxLines: 2, weight: 0.58 },
  tag: { max: 22, min: 13, maxLines: 2, weight: 0.56 },
  edgeLabel: { max: 20, min: 12, maxLines: 1, weight: 0.56 },
  caption: { max: 26, min: 16, maxLines: 1, weight: 0.56 }
};

export function fitTextIntoBox(params: TextFitParams): TextFitResult {
  const spec = ROLE_LIMITS[params.role];
  const normalized = normalizeText(params.text);
  const safeWidth = Math.max(1, params.boxWidth);
  const safeHeight = Math.max(1, params.boxHeight);

  for (let fontSize = spec.max; fontSize >= spec.min; fontSize -= 1) {
    const lineHeight = Math.ceil(fontSize * 1.22);
    const maxCharsPerLine = Math.max(1, Math.floor(safeWidth / (fontSize * spec.weight)));
    const maxLines = Math.max(1, Math.min(spec.maxLines, Math.floor(safeHeight / lineHeight)));
    const lines = wrapText(normalized, maxCharsPerLine, maxLines);
    const widest = Math.max(...lines.map((line) => estimateTextWidth(line, fontSize, spec.weight)), 0);
    if (widest <= safeWidth && lines.length * lineHeight <= safeHeight) {
      return { fontSize, lines, lineHeight };
    }
  }

  const fontSize = spec.min;
  const lineHeight = Math.ceil(fontSize * 1.22);
  const maxCharsPerLine = Math.max(1, Math.floor(safeWidth / (fontSize * spec.weight)));
  const maxLines = Math.max(1, Math.min(spec.maxLines, Math.floor(safeHeight / lineHeight)));
  return {
    fontSize,
    lines: wrapText(normalized, maxCharsPerLine, maxLines),
    lineHeight
  };
}

function normalizeText(text: string) {
  return (text || "").replace(/\s+/g, " ").trim() || " ";
}

function wrapText(text: string, maxCharsPerLine: number, maxLines: number) {
  const tokens = tokenize(text);
  const lines: string[] = [];
  let current = "";

  for (const token of tokens) {
    const next = current ? current + token : token;
    if (visualLength(next) <= maxCharsPerLine || !current) {
      current = next;
      continue;
    }
    lines.push(current);
    current = token.trimStart();
    if (lines.length >= maxLines) break;
  }

  if (lines.length < maxLines && current) lines.push(current);
  const limited = lines.slice(0, maxLines);
  if (tokens.join("").length > limited.join("").length && limited.length) {
    limited[limited.length - 1] = ellipsize(limited[limited.length - 1], maxCharsPerLine);
  }
  return limited.length ? limited : [" "];
}

function tokenize(text: string) {
  const tokens: string[] = [];
  let latin = "";
  for (const char of Array.from(text)) {
    if (/[\w.-]/.test(char)) {
      latin += char;
      continue;
    }
    if (latin) {
      tokens.push(latin);
      latin = "";
    }
    if (char === " ") {
      tokens.push(" ");
    } else {
      tokens.push(char);
    }
  }
  if (latin) tokens.push(latin);
  return tokens;
}

function visualLength(text: string) {
  return Array.from(text).reduce((total, char) => total + (/[\x00-\x7F]/.test(char) ? 0.56 : 1), 0);
}

function estimateTextWidth(text: string, fontSize: number, weight: number) {
  return visualLength(text) * fontSize * weight;
}

function ellipsize(text: string, maxChars: number) {
  const chars = Array.from(text);
  if (chars.length <= Math.max(1, maxChars)) return text;
  return `${chars.slice(0, Math.max(1, maxChars - 1)).join("")}…`;
}
