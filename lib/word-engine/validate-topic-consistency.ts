import { extractDeepWritingTopicProfile } from "./topic-profile";
import type { WordContent, WordRequest } from "./types";

export type TopicConsistencyInput = {
  userRequest: string;
  content: WordContent;
  topicFingerprint?: string;
  subject?: string;
  grade?: string;
};

export type TopicConsistencyResult =
  | { ok: true; warnings: string[] }
  | { ok: false; errors: string[]; warnings: string[] };

const animationLeakTerms = ["三维动画", "建模", "材质", "灯光", "渲染", "关键帧", "Maya", "Blender"];

function contentText(content: WordContent) {
  return [
    content.title,
    content.subtitle,
    ...content.sections.flatMap((section) => [section.heading, ...section.paragraphs]),
    ...content.tables.flatMap((table) => [table.title, ...table.headers, ...table.rows.flat()])
  ]
    .filter(Boolean)
    .join("\n");
}

export function validateTopicConsistency(input: TopicConsistencyInput): TopicConsistencyResult {
  const profile = extractDeepWritingTopicProfile(input.userRequest);
  const text = contentText(input.content);
  const warnings: string[] = [];
  const errors: string[] = [];

  if (profile.domain === "primary_language") {
    const leaked = animationLeakTerms.filter((term) => text.includes(term));
    if (leaked.length) {
      errors.push(`TOPIC_LEAK_ANIMATION_IN_PRIMARY_LANGUAGE:${leaked.join(",")}`);
    }
  }

  if (input.topicFingerprint && profile.topicFingerprint !== input.topicFingerprint) {
    warnings.push("TOPIC_FINGERPRINT_DIFFERS_FROM_REQUEST");
  }

  return errors.length ? { ok: false, errors, warnings } : { ok: true, warnings };
}

export function assertTopicConsistencyForGeneratedDocx(request: WordRequest, content: WordContent) {
  if (request.contentOrigin !== "generated_content") return;
  const result = validateTopicConsistency({
    userRequest: request.instruction || request.title,
    content
  });
  if (!result.ok) throw new Error(result.errors.join(";"));
}
