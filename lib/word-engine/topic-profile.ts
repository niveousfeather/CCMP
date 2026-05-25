export type DeepWritingTopicDomain =
  | "primary_language"
  | "animation_course"
  | "primary_math"
  | "primary_english"
  | "chemistry_course"
  | "general_course"
  | "general";

export type DeepWritingTopicProfile = {
  topic: string;
  subject?: string;
  grade?: string;
  domain: DeepWritingTopicDomain;
  topicFingerprint: string;
};

const chineseGradeMap: Record<string, string> = {
  一: "一",
  二: "二",
  三: "三",
  四: "四",
  五: "五",
  六: "六",
  "1": "一",
  "2": "二",
  "3": "三",
  "4": "四",
  "5": "五",
  "6": "六"
};

function cleanTopicText(value: string) {
  return String(value || "")
    .replace(/帮我|请|生成|写一个|写一份|写一篇|起草|设计|制作/g, " ")
    .replace(/Word|word|docx|文档|文件|教案|教学设计|课程设计|课程方案/g, " ")
    .replace(/细致一点|详细一点|完整一点|完整|授课内容也要完整|授课内容完整/g, " ")
    .replace(/\d+\s*(?:个)?\s*(?:课时|学时)|\d+\s*字/g, " ")
    .replace(/[，。；、！？:：\s]+/g, " ")
    .trim();
}

function normalizeFingerprint(value: string) {
  return value
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[，。；、！？:：,.!?;'"“”‘’（）()【】\[\]-]/g, "");
}

function gradeFromText(text: string) {
  const full = text.match(/(小学|初中|高中|高职|中职|大学)\s*([一二三四五六七八九十1-9])\s*年级/);
  if (full?.[1] && full?.[2]) return `${full[1]}${chineseGradeMap[full[2]] || full[2]}年级`;
  const grade = text.match(/([一二三四五六1-6])\s*年级/);
  if (grade?.[1]) return `${chineseGradeMap[grade[1]] || grade[1]}年级`;
  return undefined;
}

function subjectFromText(text: string) {
  if (/三维动画|3D\s*动画|3d\s*动画|动画课程/i.test(text)) return "三维动画";
  if (/语文|阅读|识字|课文|朗读/.test(text)) return "语文";
  if (/数学/.test(text)) return "数学";
  if (/化学|实验|反应现象|化学方程式/.test(text)) return "化学";
  if (/英语/.test(text)) return "英语";
  const course = text.match(/([\u4e00-\u9fa5A-Za-z0-9]{2,24})(?:课程|课)/)?.[1];
  return course ? cleanTopicText(course) || course : undefined;
}

function domainFor(subject?: string, grade?: string): DeepWritingTopicDomain {
  if (subject === "三维动画") return "animation_course";
  if (subject === "语文" && grade?.startsWith("小学")) return "primary_language";
  if (subject === "数学" && grade?.startsWith("小学")) return "primary_math";
  if (subject === "英语" && grade?.startsWith("小学")) return "primary_english";
  if (subject === "化学") return "chemistry_course";
  if (subject) return "general_course";
  return "general";
}

function topicFromParts(text: string, subject?: string, grade?: string) {
  if (grade && subject) return `${grade}${subject}课程`;
  if (subject) return subject === "三维动画" ? "三维动画课程" : `${subject}课程`;
  const cleaned = cleanTopicText(text);
  return cleaned || "本课程";
}

export function extractDeepWritingTopicProfile(text: string): DeepWritingTopicProfile {
  const normalizedText = String(text || "");
  const grade = gradeFromText(normalizedText);
  const subject = subjectFromText(normalizedText);
  const domain = domainFor(subject, grade);
  const topic = topicFromParts(normalizedText, subject, grade);
  const topicFingerprint = normalizeFingerprint([domain, grade || "", subject || "", topic].join("|"));
  return {
    topic,
    subject,
    grade,
    domain,
    topicFingerprint
  };
}

export function topicFingerprintFromText(text: string) {
  return extractDeepWritingTopicProfile(text).topicFingerprint;
}

export function hasExplicitDifferentTopic(text: string, previousFingerprint?: string) {
  const profile = extractDeepWritingTopicProfile(text);
  const hasRewriteSignal = /改成|换成|改为|重新写成|另写|新的/.test(text);
  const hasExplicitTopic = Boolean(profile.subject || profile.grade || (hasRewriteSignal && /课程|教案|报告|方案|手册/.test(text)));
  return Boolean(hasExplicitTopic && previousFingerprint && profile.topicFingerprint !== previousFingerprint);
}
