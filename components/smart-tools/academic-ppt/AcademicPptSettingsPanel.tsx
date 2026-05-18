"use client";

import { memo } from "react";
import { PauseCircle, PlayCircle, Settings2 } from "lucide-react";

import {
  aspectRatioOptions,
  detailLevelOptions,
  informationDensityOptions,
  outputLanguageOptions,
  templateStyleOptions
} from "@/components/smart-tools/academic-ppt/academic-ppt-options";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/input";
import type { AcademicPptSettings, AcademicPptTaskStatus } from "@/lib/smart-tools/academic-ppt/types";

function SelectField<T extends string>({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: T;
  options: Array<{ label: string; value: T; disabled?: boolean }>;
  onChange: (value: T) => void;
}) {
  return (
    <Field label={label}>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="h-8 w-full min-w-0 rounded-lg border border-[color:var(--color-border)] bg-[var(--color-soft)] px-2 text-xs text-[var(--color-text)] outline-none transition focus:border-[color:var(--color-border-strong)]"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

function ToggleRow({
  checked,
  disabled,
  label,
  description,
  onChange
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  description: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-w-0 max-w-full items-center justify-between gap-3 overflow-hidden rounded-lg border border-[color:var(--color-border)] bg-[var(--color-soft)] px-2.5 py-2">
      <span className="min-w-0 flex-1 overflow-hidden">
        <span className="block text-xs font-medium text-[var(--color-text)]">{label}</span>
        <span className="mt-0.5 block whitespace-normal break-words text-[11px] leading-4 text-[var(--color-text-muted)] line-clamp-2">
          {description}
        </span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 shrink-0 accent-blue-600 disabled:opacity-50"
      />
    </label>
  );
}

export const AcademicPptSettingsPanel = memo(function AcademicPptSettingsPanel({
  canStart,
  cancelDisabledReason,
  settings,
  taskStatus,
  onSettingsChange,
  onStart,
  onCancel
}: {
  canStart: boolean;
  cancelDisabledReason?: string;
  settings: AcademicPptSettings;
  taskStatus: AcademicPptTaskStatus;
  onSettingsChange: (settings: AcademicPptSettings) => void;
  onStart: () => void;
  onCancel: () => void;
}) {
  const isGenerating = taskStatus === "queued" || taskStatus === "pending" || taskStatus === "running";

  return (
    <aside className="flex min-h-0 w-[300px] min-w-[280px] max-w-[320px] shrink-0 flex-col gap-2 overflow-hidden overflow-x-hidden">
      <Card className="min-h-0 max-w-full flex-1 overflow-x-hidden overflow-y-auto p-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-blue-600" />
            <h2 className="text-sm font-semibold text-[var(--color-text)]">生成配置</h2>
          </div>
        </div>

        <div className="mt-2.5 grid min-w-0 gap-2">
          <SelectField
            label="模板风格"
            value={settings.templateStyle}
            options={templateStyleOptions}
            onChange={(templateStyle) => onSettingsChange({ ...settings, templateStyle })}
          />
          <div className="grid min-w-0 max-w-full grid-cols-2 gap-2">
            <SelectField
              label="页面比例"
              value={settings.aspectRatio}
              options={aspectRatioOptions}
              onChange={(aspectRatio) => onSettingsChange({ ...settings, aspectRatio })}
            />
            <SelectField
              label="输出语言"
              value={settings.outputLanguage}
              options={outputLanguageOptions}
              onChange={(outputLanguage) => onSettingsChange({ ...settings, outputLanguage })}
            />
          </div>
          <Field label="目标页数">
            <Input
              className="h-8 px-2 text-xs"
              min={6}
              max={60}
              type="number"
              value={settings.targetSlides}
              onChange={(event) => onSettingsChange({ ...settings, targetSlides: Number(event.target.value) || 16 })}
            />
          </Field>
          <div className="grid min-w-0 max-w-full grid-cols-2 gap-2">
            <SelectField
              label="详细程度"
              value={settings.detailLevel}
              options={detailLevelOptions}
              onChange={(detailLevel) => onSettingsChange({ ...settings, detailLevel })}
            />
            <SelectField
              label="信息密度"
              value={settings.informationDensity}
              options={informationDensityOptions}
              onChange={(informationDensity) => onSettingsChange({ ...settings, informationDensity })}
            />
          </div>

          <ToggleRow
            checked={settings.enableDeepResearch}
            label="深度研究"
            description="深入分析资料结构，提炼研究背景、问题、方法与结论。"
            onChange={(enableDeepResearch) =>
              onSettingsChange({ ...settings, enableDeepResearch, deepResearchEnabled: enableDeepResearch })
            }
          />

          <details className="max-w-full overflow-hidden rounded-lg border border-[color:var(--color-border)] bg-[var(--color-soft)] p-2">
            <summary className="cursor-pointer text-xs font-medium text-[var(--color-text)]">高级选项</summary>
            <div className="mt-2 grid min-w-0 gap-2">
              <ToggleRow
                checked={settings.enableExternalResearch}
                label="外部研究增强"
                description="联网补充公开资料，丰富背景信息和参考依据。"
                onChange={(enableExternalResearch) =>
                  onSettingsChange({
                    ...settings,
                    enableExternalResearch,
                    externalResearchEnabled: enableExternalResearch,
                    webSearchEnabled: enableExternalResearch,
                    searchProvider: "nexus-searxng"
                  })
                }
              />

              <ToggleRow
                checked={settings.enableVisualQa}
                label="视觉 QA"
                description="检查版式、可读性和内容完整度。"
                onChange={(enableVisualQa) => onSettingsChange({ ...settings, enableVisualQa, visualQaEnabled: enableVisualQa })}
              />

              <ToggleRow
                checked={settings.enableIconDecoration}
                label="图标装饰"
                description="自动添加图标、点缀元素和视觉辅助。"
                onChange={(enableIconDecoration) =>
                  onSettingsChange({ ...settings, enableIconDecoration, iconSearchEnabled: enableIconDecoration })
                }
              />
            </div>
          </details>

          <p className="whitespace-normal break-words rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] leading-4 text-amber-700">
            支持 PDF、TXT、Markdown、PPTX 等资料，PDF 解析耗时可能更长。
          </p>

          <Field label="补充要求">
            <Textarea
              className="h-20 min-h-0 w-full resize-none px-2 py-2 text-xs leading-5"
              value={settings.extraRequirements}
              placeholder="例如：突出研究问题、实验结果和贡献点。"
              onChange={(event) => onSettingsChange({ ...settings, extraRequirements: event.target.value })}
            />
          </Field>
        </div>
      </Card>

      <Card className="shrink-0 p-2.5">
        <div className="grid grid-cols-2 gap-2">
          <Button
            className="inline-flex h-9 min-w-0 items-center justify-center gap-1.5 whitespace-nowrap px-2 text-xs"
            type="button"
            variant="primary"
            disabled={!canStart || isGenerating}
            onClick={onStart}
            title={!canStart ? "请先选择来源文件" : undefined}
          >
            <PlayCircle className="h-4 w-4 shrink-0" />
            开始生成
          </Button>
          <Button
            className="inline-flex h-9 min-w-0 items-center justify-center gap-1.5 whitespace-nowrap px-2 text-xs"
            type="button"
            variant="secondary"
            disabled={!isGenerating || Boolean(cancelDisabledReason)}
            onClick={onCancel}
            title={cancelDisabledReason}
          >
            <PauseCircle className="h-4 w-4 shrink-0" />
            取消
          </Button>
        </div>
      </Card>
    </aside>
  );
});
