"use client";

import { Box, Check, ImageIcon, Images, Loader2, Pencil, Sparkles, UploadCloud, WandSparkles, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { type DragEvent, type ReactNode, useState } from "react";

import { Model3DApiFeature } from "@/components/model3d/model3d-api-features";
import {
  MODEL3D_FACE_COUNT_MAX,
  MODEL3D_FACE_COUNT_MIN,
  MODEL3D_RETOPO_FACE_COUNT_MAX,
  Model3DGenerationProfile,
  Model3DInputImage,
  Model3DMode,
  Model3DQuality,
  Model3DTextureQuality,
  Model3DTopology,
  model3DModelOptions
} from "@/components/model3d/model3d-data";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Model3DTool = "model" | "part-split" | "part-complete" | "retopo" | "texture" | "edit" | "texture-upscale" | "pbr" | "animation";
type ModelInputSource = "single" | "multi" | "batch" | "text";
type TextureInputMode = "image" | "multi" | "text";

type PanelProps = {
  prompt: string;
  mode: Model3DMode;
  model: string;
  generationProfile: Model3DGenerationProfile;
  quality: Model3DQuality;
  imageAutoOptimizeEnabled: boolean;
  smartMeshEnabled: boolean;
  highPrecisionTopology: Model3DTopology;
  highPrecisionFaceCount: number | "auto";
  smartMeshTopology: Model3DTopology;
  smartMeshFaceCount: number;
  retopoEnabled: boolean;
  retopoTopology: Model3DTopology;
  retopoFaceCount: number;
  textureEnabled: boolean;
  textureInputMode: TextureInputMode;
  textureQuality: Model3DTextureQuality;
  pbrEnabled: boolean;
  generatePartsEnabled: boolean;
  inputImages: Model3DInputImage[];
  activeModelResourceName?: string | null;
  submitting: boolean;
  onPromptChange: (value: string) => void;
  onModeChange: (value: Model3DMode) => void;
  onModelChange: (value: string) => void;
  onGenerationProfileChange: (value: Model3DGenerationProfile) => void;
  onQualityChange: (value: Model3DQuality) => void;
  onImageAutoOptimizeChange: (value: boolean) => void;
  onSmartMeshChange: (value: boolean) => void;
  onHighPrecisionTopologyChange: (value: Model3DTopology) => void;
  onHighPrecisionFaceCountChange: (value: number | "auto") => void;
  onSmartMeshTopologyChange: (value: Model3DTopology) => void;
  onSmartMeshFaceCountChange: (value: number) => void;
  onRetopoChange: (value: boolean) => void;
  onRetopoTopologyChange: (value: Model3DTopology) => void;
  onRetopoFaceCountChange: (value: number) => void;
  onTextureChange: (value: boolean) => void;
  onTextureInputModeChange: (value: TextureInputMode) => void;
  onTextureQualityChange: (value: Model3DTextureQuality) => void;
  onPbrChange: (value: boolean) => void;
  onGeneratePartsChange: (value: boolean) => void;
  onImageChange: (files: File[], label?: string) => void;
  onImageRemove: (id: string) => void;
  onGenerate: (feature?: Model3DApiFeature, options?: { animation?: { motionId?: string; rigModel?: string } }) => void;
};

const toolItems: Array<{ value: Model3DTool; label: string; icon: LucideIcon; parent?: Model3DTool }> = [
  { value: "model", label: "模型", icon: Sparkles },
  { value: "part-split", label: "部件拆分", icon: Box },
  { value: "part-complete", label: "部件补全", icon: Box },
  { value: "retopo", label: "重拓扑", icon: Box },
  { value: "texture", label: "纹理生成", icon: ImageIcon },
  { value: "edit", label: "纹理编辑", icon: Pencil, parent: "texture" },
  { value: "texture-upscale", label: "纹理放大", icon: Images, parent: "texture" },
  { value: "pbr", label: "PBR", icon: ImageIcon, parent: "texture" },
  { value: "animation", label: "动画", icon: WandSparkles }
];

const textureChildTools = new Set<Model3DTool>(["edit", "texture-upscale", "pbr"]);
const multiViewSlots = ["前视图", "后视图", "左视图", "右视图"];

const modelInputSources: Array<{ value: ModelInputSource; mode: Model3DMode; label: string; hint: string; icon: LucideIcon }> = [
  { value: "single", mode: "image-to-3d", label: "单图", hint: "上传 1 张参考图生成模型", icon: ImageIcon },
  { value: "multi", mode: "multi-view-to-3d", label: "多视图", hint: "上传前、后、左、右视图", icon: Box },
  { value: "batch", mode: "batch-image-to-3d", label: "批量", hint: "一次上传多张参考图", icon: Images },
  { value: "text", mode: "text-to-3d", label: "文本", hint: "用文字描述模型结构", icon: Pencil }
];

const textureInputSources: Array<{ value: TextureInputMode; label: string; hint: string; icon: LucideIcon }> = [
  { value: "image", label: "上传图片", hint: "用参考图生成或迁移纹理", icon: ImageIcon },
  { value: "multi", label: "多视图上传", hint: "前后左右视图辅助纹理生成", icon: Images },
  { value: "text", label: "文本", hint: "用文字描述纹理风格", icon: Pencil }
];

export function Model3DParameterPanel(props: PanelProps) {
  const [activeTool, setActiveTool] = useState<Model3DTool>("model");
  const textureToolsExpanded = activeTool === "texture" || textureChildTools.has(activeTool);

  return (
    <aside className="model3d-parameter-panel flex h-full min-h-0 overflow-hidden rounded-xl border border-[color:var(--color-border)] bg-[var(--color-panel)] text-[var(--color-text)] shadow-soft">
      <nav className="flex w-11 shrink-0 flex-col border-r border-[color:var(--color-border)] bg-[var(--color-soft)]">
        {toolItems
          .filter((item) => !item.parent || textureToolsExpanded)
          .map((item) => {
            const Icon = item.icon;
            const active = activeTool === item.value;
            return (
              <button
                key={item.value}
                type="button"
                onClick={() => setActiveTool(item.value)}
                className={cn(
                  "grid min-h-[52px] place-items-center border-b border-[color:var(--color-border)] px-0.5 py-1.5 text-[8px] font-semibold leading-3 text-[var(--color-text-muted)] transition hover:bg-[var(--color-hover)] hover:text-blue-400",
                  item.parent && "min-h-[48px] bg-[var(--color-soft)]",
                  active && "bg-[var(--color-panel)] text-blue-400"
                )}
                title={item.label}
              >
                <span className="grid place-items-center gap-1">
                  <Icon className="h-3.5 w-3.5" />
                  <span>{item.label}</span>
                  {item.value === "texture" && textureToolsExpanded ? <span className="h-0 w-0 border-x-[4px] border-t-[5px] border-x-transparent border-t-current" /> : null}
                </span>
              </button>
            );
          })}
      </nav>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="model3d-parameter-content min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-3">
          {activeTool === "model" ? <ModelPanel {...props} /> : null}
          {activeTool === "part-split" ? (
            <SourceActionPanel
              icon={Box}
              title="部件拆分"
              activeModelResourceName={props.activeModelResourceName}
              description="将模型拆分为可单独选择、查看和编辑的父子层级。"
              action="开始拆分"
              submitting={props.submitting}
              onAction={() => props.onGenerate("part-split")}
            />
          ) : null}
          {activeTool === "part-complete" ? (
            <SourceActionPanel
              icon={Box}
              title="部件补全"
              activeModelResourceName={props.activeModelResourceName}
              description="根据选中部件的轮廓与连接关系补齐缺失结构。"
              action="部件补全"
              submitting={props.submitting}
              onAction={() => props.onGenerate("part-complete")}
            />
          ) : null}
          {activeTool === "retopo" ? <RetopoPanel {...props} /> : null}
          {activeTool === "texture" ? <TextureGeneratePanel {...props} /> : null}
          {activeTool === "edit" ? <TextureEditPanel {...props} /> : null}
          {activeTool === "texture-upscale" ? (
            <SourceActionPanel
              icon={Images}
              title="纹理放大"
              activeModelResourceName={props.activeModelResourceName}
              description={
                <span>
                  为已有的贴图模型
                  <br />
                  提升纹理<span className="text-blue-500">分辨率</span>
                </span>
              }
              action="立即放大"
              submitting={props.submitting}
              onAction={() => props.onGenerate("texture-upscale")}
            />
          ) : null}
          {activeTool === "pbr" ? (
            <SourceActionPanel
              icon={ImageIcon}
              title="PBR 材质"
              activeModelResourceName={props.activeModelResourceName}
              description={
                <span>
                  为已有贴图的模型
                  <br />
                  创建真实物理效果的<span className="text-blue-500">PBR 材质</span>
                </span>
              }
              action="生成 PBR"
              submitting={props.submitting}
              onAction={() => props.onGenerate("pbr-material")}
            />
          ) : null}
          {activeTool === "animation" ? <AnimationPanel {...props} /> : null}
        </div>
      </div>
    </aside>
  );
}

function ModelPanel(props: PanelProps) {
  const highPrecisionActive = props.generationProfile === "high-precision";
  return (
    <div className="grid min-w-0 gap-3 overflow-hidden">
      <PanelTitle icon={Sparkles} title="生成模型" />
      <div className="grid grid-cols-2 rounded-full border border-[color:var(--color-border)] bg-[var(--color-soft)] p-1">
        <ProfileButton active={highPrecisionActive} label="高精度模型" onClick={() => props.onGenerationProfileChange("high-precision")} />
        <ProfileButton active={props.generationProfile === "smart-mesh"} label="智能网格" onClick={() => props.onGenerationProfileChange("smart-mesh")} />
      </div>

      <ModelInputSwitcher {...props} />

      {highPrecisionActive ? (
        <>
          <SettingCard title="基础生成设置">
            <ToggleRow checked={props.textureEnabled} label="标准纹理" description="生成可直接预览的基础贴图，让模型具备清晰色彩与表面细节。" onChange={props.onTextureChange} />
            <Segmented<Model3DTextureQuality> value={props.textureQuality} options={[{ value: "standard", label: "标准纹理" }, { value: "hd", label: "高清纹理" }]} onChange={props.onTextureQualityChange} />
            <Segmented<Model3DQuality> value={props.quality} options={[{ value: "standard", label: "标准结构" }, { value: "high", label: "精细结构" }]} onChange={props.onQualityChange} />
            <ToggleRow checked={props.imageAutoOptimizeEnabled} label="图片自动优化" description="优化参考图主体、边缘与视角信息，提升建模识别稳定性。" onChange={props.onImageAutoOptimizeChange} />
            <ToggleRow checked={props.generatePartsEnabled} label="分部件生成" description="生成可拆分的模型部件层级，便于后续单独选择与编辑。" onChange={props.onGeneratePartsChange} />
            <ToggleRow checked={props.pbrEnabled} label="PBR 材质" description="创建更接近真实光照反应的材质通道，适合精细展示。" onChange={props.onPbrChange} />
          </SettingCard>
          <TopologyCard topology={props.highPrecisionTopology} faceCount={props.highPrecisionFaceCount} onTopologyChange={props.onHighPrecisionTopologyChange} onFaceCountChange={props.onHighPrecisionFaceCountChange} allowAuto max={MODEL3D_FACE_COUNT_MAX} />
          <ModelSelector model={props.model} onModelChange={props.onModelChange} />
        </>
      ) : (
        <SettingCard title="智能网格">
          <ToggleRow checked={props.smartMeshEnabled} label="启用智能网格" description="生成轻量化三角网格，适合快速预览与后续编辑。" onChange={props.onSmartMeshChange} />
          <TopologyButtons topology={props.smartMeshTopology} onTopologyChange={props.onSmartMeshTopologyChange} quadDisabled />
          <NumberSlider value={props.smartMeshFaceCount} min={MODEL3D_FACE_COUNT_MIN} max={MODEL3D_FACE_COUNT_MAX} onChange={props.onSmartMeshFaceCountChange} suffix="面" />
          <ModelSelector model={props.model} onModelChange={props.onModelChange} />
        </SettingCard>
      )}

      <GenerateButton label="生成模型" submitting={props.submitting} onClick={() => props.onGenerate("generate-model")} />
    </div>
  );
}

function RetopoPanel(props: PanelProps) {
  return (
    <div className="grid min-w-0 gap-3 overflow-hidden">
      <PanelTitle icon={Box} title="重拓扑" />
      <ActiveResourceBox name={props.activeModelResourceName} />
      <SettingCard title="重拓扑参数">
        <ToggleRow checked={props.retopoEnabled} label="智能低模" description="按目标面数重建网格结构，保留主要外形。" onChange={props.onRetopoChange} />
        <TopologyButtons topology={props.retopoTopology} onTopologyChange={props.onRetopoTopologyChange} />
        <NumberSlider value={props.retopoFaceCount} min={0} max={MODEL3D_RETOPO_FACE_COUNT_MAX} onChange={props.onRetopoFaceCountChange} suffix={props.retopoFaceCount <= 0 ? "Auto" : "面"} />
      </SettingCard>
      <GenerateButton label="执行重拓扑" submitting={props.submitting} onClick={() => props.onGenerate("retopo")} />
    </div>
  );
}

function TextureGeneratePanel(props: PanelProps) {
  return (
    <div className="grid min-w-0 gap-3 overflow-hidden">
      <PanelTitle icon={ImageIcon} title="纹理生成" />
      <ActiveResourceBox name={props.activeModelResourceName} />
      <TextureInputSwitcher {...props} />
      <SettingCard title="纹理选项">
        <Segmented<Model3DTextureQuality> value={props.textureQuality} options={[{ value: "standard", label: "标准纹理" }, { value: "hd", label: "高清纹理" }]} onChange={props.onTextureQualityChange} />
      </SettingCard>
      <GenerateButton label="生成纹理" submitting={props.submitting} onClick={() => props.onGenerate("texture-generate")} />
    </div>
  );
}

function TextureInputSwitcher(props: PanelProps) {
  const activeSource = textureInputSources.find((item) => item.value === props.textureInputMode) || textureInputSources[0];
  return (
    <section className="min-w-0 overflow-hidden rounded-2xl border border-[color:var(--color-border)] bg-[var(--color-panel)] p-2.5 shadow-sm">
      <div className="mb-2 grid min-w-0 grid-cols-3 gap-1.5 rounded-full border border-blue-100 bg-[var(--color-soft)] p-1 shadow-inner">
        {textureInputSources.map((item) => {
          const Icon = item.icon;
          const active = props.textureInputMode === item.value;
          return (
            <button
              key={item.value}
              type="button"
              onClick={() => props.onTextureInputModeChange(item.value)}
              className={cn("grid h-8 min-w-0 place-items-center rounded-full text-[var(--color-text-muted)] transition hover:bg-[var(--color-hover)] hover:text-blue-400", active && "bg-gradient-to-r from-blue-500 to-cyan-400 !text-white shadow-sm")}
              title={`${item.label}：${item.hint}`}
            >
              <Icon className="h-4 w-4" />
            </button>
          );
        })}
      </div>
      <div className="min-h-[142px] min-w-0 overflow-hidden rounded-2xl border border-dashed border-[color:var(--color-border-strong)] bg-[var(--color-soft)] p-2">
        {props.textureInputMode === "text" ? (
          <TextPromptBox prompt={props.prompt} onPromptChange={props.onPromptChange} placeholder="描述想生成的贴图风格、颜色和材质细节..." compact />
        ) : props.textureInputMode === "multi" ? (
          <MultiViewUpload inputImages={props.inputImages} onImageChange={props.onImageChange} onImageRemove={props.onImageRemove} compact dense />
        ) : (
          <UploadTile label={activeSource.label} inputImages={props.inputImages} onImageChange={props.onImageChange} onImageRemove={props.onImageRemove} compact />
        )}
      </div>
    </section>
  );
}

function TextureEditPanel(props: PanelProps) {
  const [editMode, setEditMode] = useState<"generate" | "paint">("generate");
  return (
    <div className="grid min-w-0 gap-3 overflow-hidden">
      <PanelTitle icon={Pencil} title="纹理编辑" />
      <ActiveResourceBox name={props.activeModelResourceName} />
      <div className="grid min-w-0 grid-cols-2 gap-2">
        <ProfileButton active={editMode === "generate"} label="生成模式" onClick={() => setEditMode("generate")} />
        <ProfileButton active={editMode === "paint"} label="绘制模式" onClick={() => setEditMode("paint")} />
      </div>
      <TextPromptBox prompt={props.prompt} onPromptChange={props.onPromptChange} placeholder={editMode === "generate" ? "输入纹理编辑描述..." : "描述需要绘制或遮罩编辑的区域..."} />
      <GenerateButton label={editMode === "generate" ? "生成纹理预览" : "应用绘制编辑"} submitting={props.submitting} onClick={() => props.onGenerate("texture-edit")} />
    </div>
  );
}

function AnimationPanel(props: PanelProps) {
  return (
    <div className="grid min-w-0 gap-3 overflow-hidden">
      <PanelTitle icon={WandSparkles} title="动画" />
      <ActiveResourceBox name={props.activeModelResourceName} />
      <GenerateButton label="自动绑定" submitting={props.submitting} onClick={() => props.onGenerate("animation-rig")} />
      <SettingCard title="动作预设">
        {[
          { label: "站立展示", motionId: "idle" },
          { label: "行走循环", motionId: "walk" },
          { label: "教学挥手", motionId: "wave" }
        ].map((preset) => (
          <button key={preset.motionId} type="button" onClick={() => props.onGenerate("animation-apply", { animation: { motionId: preset.motionId } })} className="flex h-10 items-center justify-between rounded-xl border border-[color:var(--color-border)] bg-[var(--color-soft)] px-3 text-xs font-bold text-[var(--color-text)] hover:border-blue-300">
            {preset.label}
            <WandSparkles className="h-3.5 w-3.5 text-blue-500" />
          </button>
        ))}
      </SettingCard>
    </div>
  );
}

function SourceActionPanel({ icon, title, activeModelResourceName, description, action, submitting, onAction }: { icon: LucideIcon; title: string; activeModelResourceName?: string | null; description: ReactNode; action: string; submitting: boolean; onAction: () => void }) {
  return (
    <div className="grid min-w-0 gap-3 overflow-hidden">
      <PanelTitle icon={icon} title={title} />
      <ActiveResourceBox name={activeModelResourceName} />
      <div className="grid min-h-[180px] min-w-0 place-items-center overflow-hidden rounded-2xl border border-[color:var(--color-border)] bg-[var(--color-soft)] px-4 text-center text-sm leading-6 text-[var(--color-text-muted)]">
        <p>{description}</p>
      </div>
      <GenerateButton label={action} submitting={submitting} onClick={onAction} />
    </div>
  );
}

function ModelInputSwitcher(props: PanelProps) {
  const activeSource = modelInputSources.find((item) => item.mode === props.mode) || modelInputSources[3];
  return (
    <section className="min-w-0 overflow-hidden rounded-2xl border border-[color:var(--color-border)] bg-[var(--color-panel)] p-2.5 shadow-sm">
      <div className="mb-2 flex h-10 min-w-0 items-center gap-1.5 rounded-full border border-blue-100 bg-[var(--color-soft)] p-1 shadow-inner">
        {modelInputSources.map((item) => {
          const Icon = item.icon;
          const active = props.mode === item.mode;
          return (
            <button
              key={item.value}
              type="button"
              onClick={() => props.onModeChange(item.mode)}
              className={cn("grid h-8 min-w-0 flex-1 place-items-center rounded-full text-[var(--color-text-muted)] transition hover:bg-[var(--color-hover)] hover:text-blue-400", active && "bg-gradient-to-r from-blue-500 to-cyan-400 !text-white shadow-sm")}
              title={`${item.label}：${item.hint}`}
            >
              <Icon className="h-4 w-4" />
            </button>
          );
        })}
      </div>
      <div className="min-h-[142px] min-w-0 overflow-hidden rounded-2xl border border-dashed border-[color:var(--color-border-strong)] bg-[var(--color-soft)] p-2">
        {props.mode === "text-to-3d" ? (
          <TextPromptBox prompt={props.prompt} onPromptChange={props.onPromptChange} placeholder="描述想生成的模型..." compact />
        ) : props.mode === "multi-view-to-3d" ? (
          <MultiViewUpload inputImages={props.inputImages} onImageChange={props.onImageChange} onImageRemove={props.onImageRemove} compact dense />
        ) : (
          <UploadTile label={activeSource.label} inputImages={props.inputImages} onImageChange={props.onImageChange} onImageRemove={props.onImageRemove} multiple={props.mode === "batch-image-to-3d"} compact />
        )}
      </div>
    </section>
  );
}

function MultiViewUpload({ inputImages, onImageChange, onImageRemove, compact = false, dense = false }: { inputImages: Model3DInputImage[]; onImageChange: (files: File[], label?: string) => void; onImageRemove: (id: string) => void; compact?: boolean; dense?: boolean }) {
  return (
    <div className="grid min-w-0 grid-cols-2 gap-2">
      {multiViewSlots.map((slot) => (
        <UploadTile key={slot} compact={compact} dense={dense} label={slot} inputImages={inputImages.filter((image) => image.label === slot)} onImageChange={(files) => onImageChange(files, slot)} onImageRemove={onImageRemove} />
      ))}
    </div>
  );
}

function UploadTile({ label, inputImages, onImageChange, onImageRemove, multiple = false, compact = false, dense = false }: { label: string; inputImages: Model3DInputImage[]; onImageChange: (files: File[], label?: string) => void; onImageRemove: (id: string) => void; multiple?: boolean; compact?: boolean; dense?: boolean }) {
  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    onImageChange(Array.from(event.dataTransfer.files), label);
  }

  return (
    <label onDragOver={(event) => event.preventDefault()} onDrop={handleDrop} className={cn("model3d-upload-tile relative grid min-w-0 cursor-pointer place-items-center overflow-hidden rounded-2xl border border-dashed border-[color:var(--color-border-strong)] bg-[var(--color-soft)] p-3 text-center transition hover:border-blue-300 hover:bg-[var(--color-hover)]", dense ? "h-[62px] min-h-0 p-1.5" : compact ? "h-[112px] min-h-0" : "h-[154px] min-h-0")}>
      <input type="file" accept="image/png,image/jpeg,image/webp" multiple={multiple} className="hidden" onChange={(event) => onImageChange(Array.from(event.target.files || []), label)} />
      {inputImages.length ? (
        dense ? (
          <span className="relative h-full w-full min-w-0 overflow-hidden rounded-xl bg-[var(--color-panel)]">
            <img src={inputImages[0].url} alt={inputImages[0].name} className="h-full w-full object-cover" />
            <span className="absolute inset-x-1 bottom-1 truncate rounded-full border border-[color:var(--color-border)] bg-[var(--color-panel)]/88 px-1.5 py-0.5 text-[9px] font-bold text-[var(--color-text)] shadow-sm backdrop-blur">{label}</span>
          </span>
        ) : (
        <span className="relative h-full w-full min-w-0 overflow-hidden rounded-xl bg-[var(--color-panel)] shadow-sm">
            <img src={inputImages[0].url} alt={inputImages[0].name} className="h-full w-full object-cover" />
            <span className="absolute inset-x-2 bottom-2 flex min-w-0 items-center gap-2 rounded-xl border border-[color:var(--color-border)] bg-[var(--color-panel)]/92 px-2 py-1.5 text-left text-[11px] font-semibold text-[var(--color-text)] shadow-sm backdrop-blur">
              <span className="min-w-0 flex-1 truncate">{inputImages[0].name}</span>
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  onImageRemove(inputImages[0].id);
                }}
                className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[var(--color-text-muted)] hover:bg-red-500/10 hover:text-red-400"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
            {inputImages.length > 1 ? <span className="absolute right-2 top-2 rounded-full bg-blue-500 px-2 py-0.5 text-[10px] font-black text-white shadow">+{inputImages.length - 1}</span> : null}
          </span>
        )
      ) : (
        <span className="grid gap-2 text-xs text-[var(--color-text-muted)]">
          <UploadCloud className={cn("mx-auto h-6 w-6 text-blue-500", dense && "h-4 w-4")} />
          <span className="font-bold text-[var(--color-text)]">{label}</span>
          {dense ? null : <span>点击或拖拽上传 PNG/JPG/WEBP</span>}
        </span>
      )}
    </label>
  );
}

function TextPromptBox({ prompt, onPromptChange, placeholder, compact = false }: { prompt: string; onPromptChange: (value: string) => void; placeholder: string; compact?: boolean }) {
  return (
    <div className={cn("model3d-prompt-box h-36 rounded-2xl border border-[color:var(--color-border)] bg-[var(--color-panel)] p-3 shadow-sm", compact && "h-[124px] border-0 shadow-none")}>
      <textarea value={prompt} onChange={(event) => onPromptChange(event.target.value)} placeholder={placeholder} className="model3d-prompt-textarea h-full w-full resize-none bg-transparent text-sm leading-6 text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-faint)]" />
    </div>
  );
}

function TopologyCard({ topology, faceCount, onTopologyChange, onFaceCountChange, allowAuto, max }: { topology: Model3DTopology; faceCount: number | "auto"; onTopologyChange: (value: Model3DTopology) => void; onFaceCountChange: (value: number | "auto") => void; allowAuto?: boolean; max: number }) {
  return (
    <SettingCard title="拓扑设置">
      <TopologyButtons topology={topology} onTopologyChange={onTopologyChange} />
      <div className="grid gap-2">
        {allowAuto ? (
          <button type="button" onClick={() => onFaceCountChange("auto")} className={cn("h-9 rounded-xl border border-[color:var(--color-border)] bg-[var(--color-soft)] text-xs font-bold text-[var(--color-text-muted)]", faceCount === "auto" && "border-blue-300 bg-gradient-to-r from-blue-500 to-cyan-400 !text-white")}>
            Auto 面数
          </button>
        ) : null}
        <NumberSlider value={faceCount === "auto" ? MODEL3D_FACE_COUNT_MIN : faceCount} min={MODEL3D_FACE_COUNT_MIN} max={max} onChange={onFaceCountChange} suffix="面" />
      </div>
    </SettingCard>
  );
}

function TopologyButtons({ topology, onTopologyChange, quadDisabled = false }: { topology: Model3DTopology; onTopologyChange: (value: Model3DTopology) => void; quadDisabled?: boolean }) {
  return (
    <div className="grid min-w-0 grid-cols-2 gap-2">
    <button type="button" disabled={quadDisabled} onClick={() => onTopologyChange("quad")} className={cn("model3d-compact-button h-10 min-w-0 truncate rounded-xl border border-[color:var(--color-border)] bg-[var(--color-soft)] px-2 text-xs font-bold text-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-45", topology === "quad" && "border-blue-300 bg-gradient-to-r from-blue-500 to-cyan-400 !text-white")}>
        四边面
      </button>
      <button type="button" onClick={() => onTopologyChange("triangle")} className={cn("model3d-compact-button h-10 min-w-0 truncate rounded-xl border border-[color:var(--color-border)] bg-[var(--color-soft)] px-2 text-xs font-bold text-[var(--color-text)]", topology === "triangle" && "border-blue-300 bg-gradient-to-r from-blue-500 to-cyan-400 !text-white")}>
        三角面
      </button>
    </div>
  );
}

function NumberSlider({ value, min, max, suffix, onChange }: { value: number; min: number; max: number; suffix: string; onChange: (value: number) => void }) {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between text-[11px] font-semibold text-[var(--color-text-muted)]">
        <span>{min}</span>
        <span>{value <= 0 ? suffix : `${value.toLocaleString()} ${suffix}`}</span>
        <span>{max.toLocaleString()}</span>
      </div>
      <input type="range" min={min} max={max} value={Math.max(min, Math.min(max, value || min))} onChange={(event) => onChange(Number(event.target.value))} className="accent-blue-500" />
    </div>
  );
}

function ToggleRow({ checked, label, description, onChange }: { checked: boolean; label: string; description: ReactNode; onChange: (value: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="model3d-toggle-row flex min-w-0 items-center justify-between gap-3 overflow-hidden rounded-xl bg-[var(--color-soft)] px-3 py-2 text-left">
      <span className="min-w-0">
        <span className="block truncate text-xs font-bold text-[var(--color-text)]">{label}</span>
        <span className="mt-0.5 block truncate text-[10px] leading-4 text-[var(--color-text-muted)]">{description}</span>
      </span>
      <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-full border border-[color:var(--color-border)] bg-[var(--color-panel)]", checked && "border-blue-400 bg-blue-500")}>{checked ? <Check className="h-3.5 w-3.5 text-white" /> : null}</span>
    </button>
  );
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: Array<{ value: T; label: string }>; onChange: (value: T) => void }) {
  return (
    <div className="grid min-w-0 grid-cols-2 gap-2">
      {options.map((option) => (
        <button key={option.value} type="button" onClick={() => onChange(option.value)} className={cn("model3d-compact-button h-9 min-w-0 truncate rounded-xl border border-[color:var(--color-border)] bg-[var(--color-soft)] px-2 text-xs font-bold text-[var(--color-text-muted)]", value === option.value && "border-blue-300 bg-gradient-to-r from-blue-500 to-cyan-400 !text-white")}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

function ModelSelector({ model, onModelChange }: { model: string; onModelChange: (value: string) => void }) {
  const activeOption = model3DModelOptions.find((option) => option.id === model) || model3DModelOptions[0];
  return (
    <SettingCard title="AI 模型">
      <select value={model} onChange={(event) => onModelChange(event.target.value)} className="model3d-compact-button h-10 rounded-xl border border-[color:var(--color-border)] bg-[var(--color-soft)] px-3 text-xs font-bold text-[var(--color-text)] outline-none">
        {model3DModelOptions.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
      <p className="line-clamp-2 text-[10px] leading-4 text-[var(--color-text-muted)]">{activeOption.description}</p>
    </SettingCard>
  );
}

function ActiveResourceBox({ name }: { name?: string | null }) {
  return (
    <div className="model3d-setting-card min-w-0 overflow-hidden rounded-2xl border border-[color:var(--color-border)] bg-[var(--color-soft)] p-3">
      <p className="text-[11px] font-semibold text-[var(--color-text-muted)]">当前模型资源</p>
      <p className="mt-1 block max-w-full truncate text-sm font-bold text-[var(--color-text)]">{name || "暂无真实模型资源"}</p>
    </div>
  );
}

function PanelTitle({ icon: Icon, title }: { icon: LucideIcon; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="model3d-panel-title-icon grid h-8 w-8 place-items-center rounded-xl border border-[color:var(--color-border)] bg-[var(--color-soft)] text-blue-400">
        <Icon className="h-4 w-4" />
      </span>
      <h2 className="model3d-panel-title-text text-sm font-bold text-[var(--color-text)]">{title}</h2>
    </div>
  );
}

function SettingCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="model3d-setting-card grid min-w-0 gap-2 overflow-hidden rounded-2xl border border-[color:var(--color-border)] bg-[var(--color-panel)] p-3">
      <h3 className="text-xs font-bold text-[var(--color-text)]">{title}</h3>
      {children}
    </section>
  );
}

function ProfileButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cn("model3d-profile-button h-9 min-w-0 truncate rounded-full px-3 text-xs font-bold text-[var(--color-text-muted)] transition", active && "bg-gradient-to-r from-blue-500 to-cyan-400 !text-white shadow")}>
      {label}
    </button>
  );
}

function GenerateButton({ label, submitting, onClick }: { label: string; submitting: boolean; onClick: () => void }) {
  return (
    <Button type="button" size="lg" onClick={onClick} disabled={submitting} className="model3d-generate-button min-w-0 w-full overflow-hidden border-0 bg-gradient-to-r from-blue-500 to-cyan-400 text-base font-black !text-white shadow-lg hover:opacity-95">
      {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
      {label}
    </Button>
  );
}
