import type { AcademicPptInformationDensity } from "@/lib/smart-tools/academic-ppt/types";

const ELLIPSIS = "...";

export function normalizeAcademicPptText(value: string | undefined) {
  return (value || "").replace(/\s+/g, " ").trim();
}

export function truncateAcademicPptText(value: string | undefined, maxLength: number) {
  const normalized = normalizeAcademicPptText(value);
  if (estimateAcademicPptTextUnits(normalized) <= maxLength) return normalized;
  if (maxLength <= ELLIPSIS.length) return normalized.slice(0, maxLength);
  let units = 0;
  let index = 0;
  for (; index < normalized.length; index += 1) {
    units += textUnit(normalized[index] || "");
    if (units >= maxLength - ELLIPSIS.length) break;
  }
  return `${normalized.slice(0, Math.max(index, 1))}${ELLIPSIS}`;
}

function textUnit(char: string) {
  if (!char) return 0;
  return /[\u4e00-\u9fff\u3040-\u30ff\uff00-\uffef]/.test(char) ? 1.65 : 1;
}

export function estimateAcademicPptTextUnits(value: string | undefined) {
  return Array.from(normalizeAcademicPptText(value)).reduce((sum, char) => sum + textUnit(char), 0);
}

export function splitAcademicPptBullet(value: string, maxLength: number) {
  const normalized = normalizeAcademicPptText(value);
  if (!normalized) return [];
  if (normalized.length <= maxLength) return [normalized];
  const parts = normalized
    .split(/(?<=[。！？!?;；])\s*/)
    .map((item) => normalizeAcademicPptText(item))
    .filter(Boolean);
  if (parts.length > 1) return parts.map((part) => truncateAcademicPptText(part, maxLength)).filter(Boolean);
  return [truncateAcademicPptText(normalized, maxLength)];
}

export function getAcademicPptTextLimits(density: AcademicPptInformationDensity) {
  if (density === "low") {
    return { title: 54, subtitle: 86, bullet: 90, bullets: 3, emphasis: 88, visualHint: 112 };
  }
  if (density === "high") {
    return { title: 70, subtitle: 112, bullet: 124, bullets: 5, emphasis: 120, visualHint: 158 };
  }
  return { title: 62, subtitle: 102, bullet: 108, bullets: 4, emphasis: 104, visualHint: 140 };
}

export function normalizeAcademicPptBullets(
  bullets: string[] | undefined,
  options: { density: AcademicPptInformationDensity; minCount?: number }
) {
  const limits = getAcademicPptTextLimits(options.density);
  const items = (bullets || [])
    .flatMap((bullet) => splitAcademicPptBullet(bullet, limits.bullet))
    .map((bullet) => truncateAcademicPptText(bullet, limits.bullet))
    .filter(Boolean);
  const maxCount = limits.bullets;
  const normalized = items.slice(0, maxCount);
  if (normalized.length >= (options.minCount || 0)) return normalized;
  return normalized;
}

export function estimateAcademicPptTextDensity(slide: { title?: string; subtitle?: string; bullets?: string[]; emphasis?: string }) {
  const total =
    estimateAcademicPptTextUnits(slide.title) +
    estimateAcademicPptTextUnits(slide.subtitle) +
    estimateAcademicPptTextUnits(slide.emphasis) +
    (slide.bullets || []).reduce((sum, bullet) => sum + estimateAcademicPptTextUnits(bullet), 0);
  if (total > 500 || (slide.bullets || []).length > 5) return "high" as const;
  if (total < 190 && (slide.bullets || []).length <= 3) return "low" as const;
  return "normal" as const;
}
