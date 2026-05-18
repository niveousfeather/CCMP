import { ImagePlus, SlidersHorizontal, X } from "lucide-react";
import { useRef } from "react";

import {
  durationOptions,
  modelCapabilities,
  ratioOptions,
  videoModelOptions,
  videoResolutionOptions
} from "@/components/video-generation/video-data";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getVideoModelDisplayName } from "@/lib/video/config";

export function VideoParameterPanel({
  prompt,
  model,
  duration,
  ratio,
  resolution,
  imagePreviewUrl,
  generating,
  quotaSummary,
  onPromptChange,
  onModelChange,
  onDurationChange,
  onRatioChange,
  onResolutionChange,
  onImageChange,
  onImageRemove,
  onGenerate
}: {
  prompt: string;
  model: string;
  duration: string;
  ratio: string;
  resolution: string;
  imagePreviewUrl: string | null;
  generating: boolean;
  quotaSummary?: string | null;
  onPromptChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onDurationChange: (value: string) => void;
  onRatioChange: (value: string) => void;
  onResolutionChange: (value: string) => void;
  onImageChange: (file: File) => void;
  onImageRemove: () => void;
  onGenerate: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const capability = modelCapabilities[model as keyof typeof modelCapabilities];
  const supportedResolutions = capability?.supportedResolutions || [];
  const supportedDurations = capability?.supportedDurations || [];

  function handleFile(file?: File) {
    if (file) onImageChange(file);
  }

  return (
    <Card className="p-5 xl:h-full">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <Badge>生成参数</Badge>
          <h2 className="mt-3 text-lg font-semibold text-[var(--color-text)]">视频生成</h2>
        </div>
        <div className="grid h-10 w-10 place-items-center rounded-lg border border-[color:var(--color-border)] bg-[var(--color-soft)] text-[var(--color-text-muted)]">
          <SlidersHorizontal className="h-4 w-4" />
        </div>
      </div>

      <div className="mb-5 grid gap-2">
        <div className="flex items-center justify-between">
          <span className="text-sm text-[var(--color-text-muted)]">参考图片</span>
          <Badge>可选</Badge>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(event) => handleFile(event.target.files?.[0])}
        />
        {imagePreviewUrl ? (
          <div className="relative h-40 overflow-hidden rounded-lg border border-[color:var(--color-border)] bg-[var(--color-soft)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imagePreviewUrl} alt="参考图片预览" className="h-full w-full object-contain" />
            <button
              type="button"
              onClick={onImageRemove}
              className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full border border-[color:var(--color-border)] bg-[var(--color-panel)] text-[var(--color-text)] shadow-soft"
              aria-label="删除参考图片"
            >
              <X className="h-4 w-4" />
            </button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="absolute bottom-2 left-2"
              onClick={() => inputRef.current?.click()}
            >
              替换图片
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="grid h-36 place-items-center rounded-lg border border-dashed border-[color:var(--color-border)] bg-[var(--color-soft)] text-center transition hover:bg-[var(--color-hover)]"
          >
            <span className="grid gap-2 text-xs text-[var(--color-text-faint)]">
              <ImagePlus className="mx-auto h-5 w-5 text-[var(--color-text-muted)]" />
              点击上传参考图片
              <span>支持 jpg、jpeg、png、webp</span>
            </span>
          </button>
        )}
      </div>

      <label className="grid gap-2">
        <span className="text-sm text-[var(--color-text-muted)]">Prompt</span>
        <textarea
          value={prompt}
          onChange={(event) => onPromptChange(event.target.value)}
          rows={7}
          placeholder="描述视频主体、动作、场景、节奏和使用场景..."
          className="min-h-36 resize-none rounded-lg border border-[color:var(--color-border)] bg-[var(--color-soft)] px-3 py-3 text-sm leading-6 text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-faint)] focus:border-[color:var(--color-border-strong)]"
        />
      </label>

      <div className="mt-5 grid gap-4">
        <SelectField label="模型" value={model} options={[...videoModelOptions]} onChange={onModelChange} />
        <SelectField label="时长" value={duration} options={[...durationOptions]} supportedOptions={[...supportedDurations]} onChange={onDurationChange} />
        <SelectField label="比例" value={ratio} options={[...ratioOptions]} onChange={onRatioChange} />
        <div className="grid gap-2">
          <span className="text-sm text-[var(--color-text-muted)]">分辨率</span>
          <div className="grid grid-cols-2 gap-2">
            {videoResolutionOptions.map((item) => {
              const disabled = !supportedResolutions.includes(item as "720P");
              return (
                <button
                  key={item}
                  type="button"
                  disabled={disabled}
                  onClick={() => onResolutionChange(item)}
                  className={cn(
                    "h-10 rounded-lg border text-sm font-medium transition",
                    resolution === item
                      ? "border-sky-600 bg-sky-600 text-white shadow-sm hover:bg-sky-700"
                      : "border-[color:var(--color-border)] bg-[var(--color-soft)] text-[var(--color-text)] hover:bg-[var(--color-hover)]",
                    disabled && "cursor-not-allowed border-[color:var(--color-border)] bg-[var(--color-soft)] text-[var(--color-text-faint)] opacity-70 hover:bg-[var(--color-soft)]"
                  )}
                >
                  {item}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-[var(--color-text-faint)]">当前模型暂不支持 1080P。</p>
        </div>
      </div>

      {quotaSummary ? (
        <div className="mt-4 rounded-lg border border-[color:var(--color-border)] bg-[var(--color-soft)] px-3 py-2 text-xs text-[var(--color-text-muted)]">
          {quotaSummary}
        </div>
      ) : null}

      <Button className="mt-6 w-full" variant="primary" size="lg" disabled={generating} onClick={onGenerate}>
        {generating ? "提交中..." : "生成视频"}
      </Button>
    </Card>
  );
}

function SelectField({
  label,
  value,
  options,
  supportedOptions,
  onChange
}: {
  label: string;
  value: string;
  options: readonly string[];
  supportedOptions?: readonly string[];
  onChange: (value: string) => void;
}) {
  const supportedSet = supportedOptions ? new Set(supportedOptions) : null;
  return (
    <label className="grid gap-2">
      <span className="text-sm text-[var(--color-text-muted)]">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 rounded-lg border border-[color:var(--color-border)] bg-[var(--color-soft)] px-3 text-sm text-[var(--color-text)] outline-none focus:border-[color:var(--color-border-strong)]"
      >
        {options.map((option) => {
          const disabled = Boolean(supportedSet && !supportedSet.has(option));
          return (
            <option key={option} value={option} disabled={disabled}>
              {disabled ? `${getVideoModelDisplayName(option)}（暂不支持）` : getVideoModelDisplayName(option)}
            </option>
          );
        })}
      </select>
    </label>
  );
}
