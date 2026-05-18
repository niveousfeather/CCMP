"use client";

import { memo } from "react";
import { AlertCircle, Info, TriangleAlert } from "lucide-react";

import { Badge, Card } from "@/components/ui/card";
import { ACADEMIC_PPT_LOG_RENDER_LIMIT } from "@/lib/smart-tools/academic-ppt/task-api";
import type { AcademicPptTaskLog } from "@/lib/smart-tools/academic-ppt/types";
import { cn } from "@/lib/utils";

function getLogIcon(level: AcademicPptTaskLog["level"]) {
  if (level === "error") return AlertCircle;
  if (level === "warn") return TriangleAlert;
  return Info;
}

function toProductLogMessage(message: string) {
  const lower = message.toLowerCase();
  const generatedSlide = message.match(/Generated slide\s+(\d+)\s*\/\s*(\d+)/i);
  if (generatedSlide) return `已生成第 ${generatedSlide[1]}/${generatedSlide[2]} 页。`;
  if (/stage=academic_ppt:(research|manuscript|strategy|design_spec|generation|svg|repair|visual_qa)/i.test(message)) {
    if (/visual_qa/i.test(message)) return "正在检查版式和可读性。";
    if (/strategy|design_spec/i.test(message)) return "正在规划页面结构。";
    if (/research|manuscript/i.test(message)) return "正在分析资料内容。";
    if (/svg|generation/i.test(message)) return "正在生成页面内容。";
    if (/repair/i.test(message)) return "正在优化页面。";
  }
  if (
    /model bridge|primary model|fallback model|subrouter|moonshot|kimi|gpt-5\.4|stage=academic_ppt|request started|attempt \d+\/\d+/i.test(
      message
    )
  ) {
    return /completed|success/i.test(message) ? "当前生成步骤已完成。" : "正在分析和生成内容。";
  }
  if (/dependencies are not installed|missing:|module named|pip install|requirements\.txt/i.test(message)) {
    return "生成服务依赖尚未就绪，任务已停止。";
  }
  if (
    lower.includes("python") ||
    lower.includes("sidecar") ||
    lower.includes("paper-ppt-agent") ||
    lower.includes("pipeline") ||
    lower.includes("tools engine") ||
    lower.includes("adapter") ||
    message.includes("AI_TOOLS_ENGINE_URL") ||
    message.includes("ACADEMIC_PPT_AGENT_URL")
  ) {
    return "生成服务正在处理任务。";
  }
  if (/fallbackReason|modelSource|modelName/i.test(message) || lower.includes("requestid") || lower.includes("request id")) {
    return "已记录生成状态。";
  }
  if (/api[_-]?key|authorization|bearer|base url|provider/i.test(message)) {
    return "生成配置由服务端安全处理。";
  }
  if (/fallback|兜底/i.test(message)) return "当前结果质量有限，建议重新生成。";
  if (/^Template .+ loaded/i.test(message)) return "已选择模板。";
  if (/soffice|pdftoppm|libreoffice|outline/i.test(message)) {
    return "PPTX 图片预览暂不可用，已显示结构化占位预览。";
  }
  return message;
}

export const AcademicPptLogsPanel = memo(function AcademicPptLogsPanel({ logs }: { logs: AcademicPptTaskLog[] }) {
  const visibleLogs = logs.slice(-ACADEMIC_PPT_LOG_RENDER_LIMIT);

  return (
    <Card className="min-h-0 overflow-hidden p-3">
      <div className="flex h-5 items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-[var(--color-text)]">生成日志</h2>
        <Badge className="h-5 px-1.5 text-[10px]">{logs.length}</Badge>
      </div>
      <div className="mt-2 h-[78px] overflow-y-auto rounded-lg border border-[color:var(--color-border)] bg-[var(--color-soft)]">
        {visibleLogs.length ? (
          <div className="grid">
            {visibleLogs.map((log, index) => {
              const Icon = getLogIcon(log.level);
              return (
                <div key={`${log.time}-${index}`} className="flex gap-2 border-b border-[color:var(--color-border)] px-2 py-1.5 last:border-b-0">
                  <Icon
                    className={cn(
                      "mt-0.5 h-3 w-3 shrink-0",
                      log.level === "error" && "text-red-600",
                      log.level === "warn" && "text-amber-600",
                      log.level === "info" && "text-blue-600"
                    )}
                  />
                  <div className="min-w-0">
                    <p className="text-[10px] text-[var(--color-text-faint)]">{log.time}</p>
                    <p className="truncate text-xs text-[var(--color-text-muted)]">{toProductLogMessage(log.message)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="p-3 text-xs text-[var(--color-text-muted)]">任务开始后会显示生成日志。</p>
        )}
      </div>
    </Card>
  );
});
