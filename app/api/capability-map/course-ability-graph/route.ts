import { NextRequest, NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import type { CourseAbilityGraphInput } from "@/lib/capability-map/course-ability-graph";
import {
  createMockFallbackCourseAbilityGraph,
  generateCourseAbilityGraph
} from "@/lib/capability-map/course-ability-graph-server";
import { courseAbilityDiagnosticCodeFromError } from "@/lib/capability-map/diagnostics";

export const maxDuration = 120;

const REQUEST_TIMEOUT_MS = 115_000;

function jsonError(code: string, message: string, status: number) {
  return NextResponse.json({ code, message }, { status });
}

function cleanInput(value: unknown, maxLength = 40) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export async function POST(request: NextRequest) {
  const { response } = await requireUser();
  if (response) return response;

  const body = await request.json().catch(() => null) as Partial<CourseAbilityGraphInput> | null;
  const input: CourseAbilityGraphInput = {
    courseName: cleanInput(body?.courseName),
    majorDirection: cleanInput(body?.majorDirection),
    region: cleanInput(body?.region)
  };

  if (!input.courseName || !input.majorDirection || !input.region) {
    return jsonError("INVALID_COURSE_ABILITY_INPUT", "请输入课程名称、专业方向和地区。", 400);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error(`course_ability_graph_request_timeout:${REQUEST_TIMEOUT_MS}`)), REQUEST_TIMEOUT_MS);
  const abort = () => controller.abort(new Error("client_abort"));

  if (request.signal.aborted) abort();
  else request.signal.addEventListener("abort", abort, { once: true });

  try {
    const graph = await generateCourseAbilityGraph(input, { signal: controller.signal });
    return NextResponse.json(graph);
  } catch (error) {
    const code = courseAbilityDiagnosticCodeFromError(error);
    console.warn(`[capability-map:api] generation_route_fallback code=${code}`);
    return NextResponse.json(createMockFallbackCourseAbilityGraph(input, code));
  } finally {
    clearTimeout(timeout);
    request.signal.removeEventListener("abort", abort);
  }
}
