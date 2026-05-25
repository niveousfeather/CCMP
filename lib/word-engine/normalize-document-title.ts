const instructionWords =
  /^(?:请帮我|写一个|写一份|写一篇|做一个|做一份|请|麻烦|帮我|给我|为我|生成|起草|撰写|制作|设计|输出|导出|整理|创建|写|做|把|将)+/;
const fileWords = /\b(?:Word|word|DOCX|docx|document|Excel|excel|PPT|ppt|PowerPoint|powerpoint)\b|文档/g;
const punctuation = /[，。；、！？：:"“”‘’（）()[\]{}<>《》]/g;
const documentKindWords = ["教案", "教学设计", "课程设计", "课程方案", "方案", "报告", "通知", "总结", "手册", "白皮书"];
const coreSchoolSubjects = ["语文", "数学", "英语", "化学", "物理", "生物", "历史", "地理", "政治", "道德与法治", "科学", "信息科技", "信息技术"];

function compactSpaces(value: string) {
  return value.replace(/\.docx$/i, "").replace(/[?？]/g, " ").replace(/\s+/g, " ").trim();
}

function stripInstruction(value: string) {
  let cleaned = compactSpaces(value)
    .replace(fileWords, " ")
    .replace(punctuation, " ")
    .replace(/课程的/g, "课程")
    .replace(/的\s*(教案|教学设计|课程设计|课程方案|方案|报告|通知|总结|手册|白皮书)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

  let previous = "";
  while (cleaned && cleaned !== previous) {
    previous = cleaned;
    cleaned = cleaned.replace(instructionWords, "").replace(/^(?:一个|一份|一篇)\s*/, "").trim();
  }

  cleaned = cleaned
    .replace(/^(?:下面这段内容|以上内容|当前内容|这段内容|这个内容|这份资料|这个文件|这份文件)\s*/, "")
    .replace(/(?:细致一点|详细一点|完整一点|授课内容也要完整|授课内容完整|正式|规范|可直接使用|可下载|生成出来)$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned;
}

function detectDocumentKind(text: string) {
  return documentKindWords.find((kind) => text.includes(kind));
}

function detectGrade(text: string) {
  const full =
    text.match(/(?:小学|初中|高中|高职|中职|大学)\s*[一二三四五六七八九十\d]\s*年级/) ||
    text.match(/(?:小|初|高)\s*[一二三四五六七八九十\d]/);
  if (!full) return "";
  return full[0]
    .replace(/\s+/g, "")
    .replace(/^小(?=[一二三四五六七八九十\d])/, "小学")
    .replace(/^初(?=[一二三四五六七八九十\d])/, "初中")
    .replace(/^高(?=[一二三四五六七八九十\d])/, "高中")
    .replace(/(\d)(?=年级)/g, (digit) => ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"][Number(digit)] || digit);
}

function detectSubject(text: string) {
  if (/三维动画|3D\s*动画|3d\s*动画/i.test(text)) return "三维动画";
  return coreSchoolSubjects.find((subject) => text.includes(subject)) || "";
}

function isPracticalCourse(subject: string, text: string) {
  return subject === "三维动画" || /实训|实践|技能|职业|项目|作品|建模|渲染|动画/.test(text);
}

function normalizeLessonTitle(text: string, fallback: string) {
  const grade = detectGrade(text);
  const subject = detectSubject(text);
  if (subject) {
    const courseWord = isPracticalCourse(subject, text) ? "课程" : "";
    return `${grade}${subject}${courseWord}教案`;
  }
  const cleaned = stripDocumentKindSuffix(fallback, "教案");
  return `${cleaned || "课程"}教案`;
}

function stripDocumentKindSuffix(value: string, kind: string) {
  return value
    .replace(new RegExp(`(?:的)?${kind}$`), "")
    .replace(/课程$/, "课程")
    .replace(/的$/g, "")
    .trim();
}

function isGenericTitle(value?: string | null) {
  const cleaned = compactSpaces(String(value || ""))
    .replace(fileWords, " ")
    .replace(punctuation, " ")
    .trim();
  return !cleaned || /^(?:Word|DOCX)?\s*(?:文档|文件)?$/i.test(cleaned);
}

export function normalizeDocumentTitle(input: {
  title?: string | null;
  instruction?: string | null;
  documentKind?: string | null;
  fallback?: string;
}) {
  const titleSource = compactSpaces(String(input.title || ""));
  const instructionSource = compactSpaces(String(input.instruction || ""));
  const source = !isGenericTitle(titleSource) ? titleSource : instructionSource || input.fallback || "Word 文档";
  const contextSource = compactSpaces([source, instructionSource && instructionSource !== source ? instructionSource : ""].join(" "));
  const cleaned = stripInstruction(source);
  const kind = input.documentKind === "lesson_plan" ? "教案" : detectDocumentKind(contextSource);

  if (kind === "教案" || /教案|教学设计|课程设计|授课计划/.test(contextSource)) {
    return normalizeLessonTitle(contextSource, cleaned).replace(/的$/g, "").slice(0, 60);
  }

  if (kind && !cleaned.endsWith(kind)) {
    return `${stripDocumentKindSuffix(cleaned, kind)}${kind}`.replace(/的$/g, "").slice(0, 60);
  }

  return (cleaned || input.fallback || "Word 文档").replace(/的$/g, "").slice(0, 60);
}

export function normalizeDocumentFileBase(input: Parameters<typeof normalizeDocumentTitle>[0]) {
  const title = normalizeDocumentTitle(input).replace(/[\\/:*?"<>|]/g, "").trim();
  return title || "Word 文档";
}
