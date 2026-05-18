import { Image as ImageIcon, SlidersHorizontal, UploadCloud, X } from "lucide-react";
import { DragEvent, useRef, useState } from "react";

import {
  ImageResolution,
  UploadedImage,
  modelOptions,
  ratioOptions,
  resolutionOptions,
  styleOptions
} from "@/components/image-generation/image-data";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/card";

export function ImageParameterPanel({
  prompt,
  style,
  ratio,
  resolution,
  model,
  uploadedImage,
  loading,
  modelSupportsImageUpload,
  quotaSummary,
  onPromptChange,
  onStyleChange,
  onRatioChange,
  onResolutionChange,
  onModelChange,
  onImageSelect,
  onImageRemove,
  onImagePreview,
  onGenerate
}: {
  prompt: string;
  style: string;
  ratio: string;
  resolution: ImageResolution;
  model: string;
  uploadedImage: UploadedImage | null;
  loading: boolean;
  modelSupportsImageUpload: boolean;
  quotaSummary?: string | null;
  onPromptChange: (value: string) => void;
  onStyleChange: (value: string) => void;
  onRatioChange: (value: string) => void;
  onResolutionChange: (value: ImageResolution) => void;
  onModelChange: (value: string) => void;
  onImageSelect: (file: File) => void;
  onImageRemove: () => void;
  onImagePreview: () => void;
  onGenerate: () => void;
}) {
  return (
    <Card className="p-5 xl:h-full">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <Badge>生成参数</Badge>
          <h2 className="mt-3 text-lg font-semibold text-[var(--color-text)]">图片生成</h2>
        </div>
        <div className="grid h-10 w-10 place-items-center rounded-lg border border-[color:var(--color-border)] bg-[var(--color-soft)] text-[var(--color-text-muted)]">
          <SlidersHorizontal className="h-4 w-4" />
        </div>
      </div>

      <ImageUploadArea
        uploadedImage={uploadedImage}
        disabled={!modelSupportsImageUpload}
        onImageSelect={onImageSelect}
        onImageRemove={onImageRemove}
        onImagePreview={onImagePreview}
      />

      <div className="mt-4 rounded-lg border border-[color:var(--color-border)] bg-[var(--color-soft)] px-3 py-2 text-xs text-[var(--color-text-muted)]">
        当前模式：{uploadedImage && modelSupportsImageUpload ? "图生图 / 图片编辑" : "文生图"}
      </div>

      <label className="mt-5 grid gap-2">
        <span className="text-sm text-[var(--color-text-muted)]">Prompt</span>
        <textarea
          value={prompt}
          onChange={(event) => onPromptChange(event.target.value)}
          rows={7}
          placeholder="描述你想生成或编辑的画面、风格、构图和用途..."
          className="min-h-36 resize-none rounded-lg border border-[color:var(--color-border)] bg-[var(--color-soft)] px-3 py-3 text-sm leading-6 text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-faint)] focus:border-[color:var(--color-border-strong)]"
        />
      </label>

      <div className="mt-5 grid gap-4">
        <ModelSelectField label="模型" value={model} onChange={onModelChange} />
        <SelectField label="风格" value={style} options={[...styleOptions]} onChange={onStyleChange} />
        <SelectField label="比例" value={ratio} options={[...ratioOptions]} onChange={onRatioChange} />
        <div className="grid gap-2">
          <span className="text-sm text-[var(--color-text-muted)]">分辨率</span>
          <div className="grid grid-cols-3 gap-2">
            {resolutionOptions.map((option) => (
              <Button
                key={option}
                type="button"
                variant={resolution === option ? "primary" : "secondary"}
                size="sm"
                onClick={() => onResolutionChange(option)}
              >
                {option}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {quotaSummary ? (
        <div className="mt-4 rounded-lg border border-[color:var(--color-border)] bg-[var(--color-soft)] px-3 py-2 text-xs text-[var(--color-text-muted)]">
          {quotaSummary}
        </div>
      ) : null}

      <Button className="mt-6 w-full" variant="primary" size="lg" disabled={loading} onClick={onGenerate}>
        {loading ? "任务创建中..." : uploadedImage && modelSupportsImageUpload ? "生成编辑结果" : "立即生成"}
      </Button>
    </Card>
  );
}

function ImageUploadArea({
  uploadedImage,
  disabled,
  onImageSelect,
  onImageRemove,
  onImagePreview
}: {
  uploadedImage: UploadedImage | null;
  disabled: boolean;
  onImageSelect: (file: File) => void;
  onImageRemove: () => void;
  onImagePreview: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);

  function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (file && !disabled) onImageSelect(file);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (!disabled) setDragging(true);
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    handleFiles(event.dataTransfer.files);
  }

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-[var(--color-text-muted)]">参考图片</span>
        <Badge>{disabled ? "仅文生图" : uploadedImage ? "图生图" : "可选"}</Badge>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(event) => {
          handleFiles(event.target.files);
          event.currentTarget.value = "";
        }}
      />
      {uploadedImage ? (
        <div className="overflow-hidden rounded-lg border border-[color:var(--color-border)] bg-[var(--color-soft)]">
          <div className="relative aspect-[4/3] w-full bg-[var(--color-panel)]">
            <button type="button" onClick={onImagePreview} className="absolute inset-0" aria-label="预览上传图片">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={uploadedImage.previewUrl} alt="" className="h-full w-full object-contain" />
            </button>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="absolute right-2 top-2 h-8 w-8"
              onClick={onImageRemove}
              aria-label="删除上传图片"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <Button
            type="button"
            className="m-2 w-[calc(100%-16px)]"
            variant="secondary"
            size="sm"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
          >
            替换图片
          </Button>
        </div>
      ) : (
        <div
          role="button"
          tabIndex={0}
          onClick={() => {
            if (!disabled) inputRef.current?.click();
          }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`grid cursor-pointer place-items-center rounded-lg border border-dashed p-5 text-center transition ${
            disabled
              ? "cursor-not-allowed border-[color:var(--color-border)] bg-[var(--color-soft)] opacity-70"
              : dragging
                ? "border-[color:var(--color-border-strong)] bg-[var(--color-hover)]"
                : "border-[color:var(--color-border)] bg-[var(--color-soft)] hover:border-[color:var(--color-border-strong)]"
          }`}
        >
          <div className="grid h-10 w-10 place-items-center rounded-lg border border-[color:var(--color-border)] bg-[var(--color-panel)] text-[var(--color-text-muted)]">
            {dragging ? <UploadCloud className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />}
          </div>
          <p className="mt-3 text-sm font-medium text-[var(--color-text)]">
            {disabled ? "当前模型暂不支持参考图" : "点击或拖拽上传图片"}
          </p>
          <p className="mt-1 text-xs text-[var(--color-text-faint)]">支持 jpg、jpeg、png、webp，当前仅支持单图</p>
        </div>
      )}
    </div>
  );
}

function ModelSelectField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-2">
      <span className="text-sm text-[var(--color-text-muted)]">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 rounded-lg border border-[color:var(--color-border)] bg-[var(--color-soft)] px-3 text-sm text-[var(--color-text)] outline-none focus:border-[color:var(--color-border-strong)]"
      >
        {modelOptions.map((option) => (
          <option key={option.id} value={option.id} disabled={!option.enabled}>
            {option.enabled ? option.label : `${option.label}（暂不可用）`}
          </option>
        ))}
      </select>
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm text-[var(--color-text-muted)]">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 rounded-lg border border-[color:var(--color-border)] bg-[var(--color-soft)] px-3 text-sm text-[var(--color-text)] outline-none focus:border-[color:var(--color-border-strong)]"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}
