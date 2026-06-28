import type { CourseAbilityGraphPayload } from "@/lib/capability-map/course-ability-graph";

export const CAPABILITY_MAP_MOCK_NOTICE = "当前为本地示例数据，未接入真实资料库，不能作为正式引用。";
export const CAPABILITY_MAP_MODEL_NOTICE = "当前为 GPT-5.4 生成结果，未接入真实资料库，需人工审核，不能作为正式引用。";
export const CAPABILITY_MAP_PARTIAL_NOTICE = "部分内容由本地示例数据补齐，需人工审核，不能作为正式引用。";
export const CAPABILITY_MAP_FALLBACK_NOTICE = "GPT-5.4 生成失败，当前展示本地示例数据。";

export function hasCapabilityMapStageFallback(graph: CourseAbilityGraphPayload) {
  return graph.meta.warnings.some((warning) => warning.includes("_FAILED") || warning.includes("NORMALIZE_FALLBACK_USED"));
}

export function hasCapabilityMapMappingPatch(graph: CourseAbilityGraphPayload) {
  return graph.meta.warnings.some((warning) =>
    warning.includes("NORMALIZE_MODULE_MAPPING_PATCHED") ||
    warning.includes("MODULE_MAPPING_PARTIAL_PLACEHOLDER_USED") ||
    warning.includes("MODULE_MAPPING_ALL_PLACEHOLDER_USED")
  );
}

export function hasCapabilityMapLocalSupplement(graph: CourseAbilityGraphPayload) {
  return hasCapabilityMapStageFallback(graph) || hasCapabilityMapMappingPatch(graph);
}

export function capabilityMapSourceNotice(graph: CourseAbilityGraphPayload) {
  if (graph.meta.source === "model" && hasCapabilityMapLocalSupplement(graph)) return CAPABILITY_MAP_PARTIAL_NOTICE;
  if (graph.meta.source === "model") return CAPABILITY_MAP_MODEL_NOTICE;
  if (graph.meta.source === "mock-fallback") return CAPABILITY_MAP_FALLBACK_NOTICE;
  return CAPABILITY_MAP_MOCK_NOTICE;
}

export function capabilityMapProductStatusSummary(graph: CourseAbilityGraphPayload) {
  if (graph.meta.source === "mock-fallback") return "模型生成未完成，当前展示本地示例链路，页面仍可演示完整流程。";
  if (graph.meta.source === "model" && hasCapabilityMapStageFallback(graph)) return "GPT-5.4 已生成部分链路，其余内容由本地规则补齐，建议人工审核后演示。";
  if (graph.meta.source === "model" && hasCapabilityMapMappingPatch(graph)) return "GPT-5.4 已生成主体内容，课程映射已按最终教学模块自动补齐。";
  if (graph.meta.source === "model") return "GPT-5.4 已完成六阶段链路生成，课程映射已与教学模块对齐。";
  return "当前展示本地示例链路，用于演示产业变化如何逐层影响课程建设。";
}

export function capabilityMapDiagnosticSummary(graph: CourseAbilityGraphPayload) {
  if (graph.meta.source === "model" && !hasCapabilityMapLocalSupplement(graph)) {
    return "生成诊断：三阶段模型生成完成，结构已校验。";
  }
  if (graph.meta.source === "model") return "生成诊断：模型生成完成，部分结构已由本地规则补齐。";
  if (graph.meta.source === "mock-fallback") return "生成诊断：模型生成未完成，已启用本地示例。";
  return "生成诊断：当前使用本地示例数据。";
}

export function capabilityMapSourceBadge(graph: CourseAbilityGraphPayload) {
  if (graph.meta.source === "model" && hasCapabilityMapLocalSupplement(graph)) return "模型生成 + 本地补齐";
  if (graph.meta.source === "model") return "GPT-5.4 生成";
  if (graph.meta.source === "mock-fallback") return "本地 fallback";
  return "本地示例";
}

export function capabilityMapCompactEvidenceStatus(graph: CourseAbilityGraphPayload) {
  if (graph.meta.source === "model" && hasCapabilityMapLocalSupplement(graph)) return "模型生成 + 本地补齐，需人工审核";
  if (graph.meta.source === "model") return "GPT-5.4 生成，需人工审核";
  if (graph.meta.source === "mock-fallback") return "本地 fallback，需人工审核";
  return "本地示例，不能正式引用";
}
