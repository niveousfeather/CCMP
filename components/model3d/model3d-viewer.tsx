"use client";

import { Box, ChevronDown, Download, Eye, FileUp, Grid3X3, ImageIcon, Lightbulb, Loader2, Maximize2, Moon, Palette, PenLine, Play, Rotate3D, RotateCcw, Settings2, Sparkles, SunMedium, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Model3DExportFormat, Model3DExportRequest, Model3DExportResolution } from "@/components/model3d/model3d-api-features";
import { isModel3DTaskProcessing, Model3DSceneNode, Model3DSceneSelection, Model3DSceneStats, Model3DSceneTransformRequest, Model3DTaskStatus } from "@/components/model3d/model3d-data";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ThreeModelViewport } from "./three-model-viewport";

type ViewerState = "empty" | "loading" | "ready" | "failed";
type EnvironmentPreset = "studio" | "desert" | "forest" | "indoor" | "night" | "coast";
type MaterialMode = "clay" | "texture" | "display" | "unlit" | "normal" | "toon" | "sketch" | "hologram";

const environmentOptions: Array<{ value: EnvironmentPreset; label: string; image: string }> = [
  { value: "studio", label: "工作室", image: "/model3d/environments/studio.jpg" },
  { value: "desert", label: "沙漠", image: "/model3d/environments/desert.jpg" },
  { value: "forest", label: "森林", image: "/model3d/environments/forest.jpg" },
  { value: "indoor", label: "室内", image: "/model3d/environments/indoor.jpg" },
  { value: "night", label: "夜晚", image: "/model3d/environments/night.jpg" },
  { value: "coast", label: "海滩", image: "/model3d/environments/coast.jpg" }
];

const materialModes: Array<{ value: MaterialMode; label: string; icon?: typeof Palette; className: string }> = [
  { value: "clay", label: "白模", className: "bg-[radial-gradient(circle_at_35%_30%,#ffffff,#d7d7d7_58%,#9a9a9a)]" },
  { value: "texture", label: "纹理视图", className: "bg-[radial-gradient(circle_at_35%_30%,#f8fafc,#7dd3fc_35%,#a78bfa_68%,#334155)]" },
  { value: "display", label: "显示设置", icon: Settings2, className: "bg-gradient-to-r from-blue-500 to-cyan-400" },
  { value: "unlit", label: "无光照", className: "bg-[radial-gradient(circle_at_35%_30%,#f8fafc,#cbd5e1_50%,#111827)]" },
  { value: "normal", label: "法线", className: "bg-[radial-gradient(circle_at_35%_30%,#22d3ee,#8b5cf6_42%,#f43f5e_78%)]" },
  { value: "toon", label: "卡通风格", className: "bg-[radial-gradient(circle_at_35%_30%,#fde68a,#f97316_52%,#7c2d12)]" },
  { value: "sketch", label: "素描风格", icon: PenLine, className: "bg-[radial-gradient(circle_at_35%_30%,#f8fafc,#a3a3a3_58%,#404040)]" },
  { value: "hologram", label: "全息风格", className: "bg-[radial-gradient(circle_at_35%_30%,#a5f3fc,#22d3ee_45%,#4338ca_80%)]" }
];

export function Model3DViewer({
  modelUrl,
  fallbackModelUrl,
  modelFileName,
  title,
  status,
  hiddenNodeIds,
  isolatedNodeId,
  stats,
  selectionRequest,
  transformRequest,
  onModelFileChange,
  onSceneHierarchyChange,
  onSceneSelectionChange,
  onSceneStatsChange,
  onSceneTransformCommit,
  onDownload,
  onExport
}: {
  modelUrl: string | null;
  fallbackModelUrl?: string | null;
  modelFileName?: string | null;
  title: string;
  status: Model3DTaskStatus;
  hiddenNodeIds: string[];
  isolatedNodeId: string | null;
  stats: Model3DSceneStats;
  selectionRequest: string | null;
  transformRequest: (Model3DSceneTransformRequest & { requestId: number }) | null;
  onModelFileChange: (file: File) => void;
  onSceneHierarchyChange: (hierarchy: Model3DSceneNode | null) => void;
  onSceneSelectionChange: (selection: Model3DSceneSelection | null) => void;
  onSceneStatsChange: (stats: Model3DSceneStats) => void;
  onSceneTransformCommit: (selection: Model3DSceneSelection) => void;
  onDownload: () => void;
  onExport: (request: Model3DExportRequest) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [viewerState, setViewerState] = useState<ViewerState>(modelUrl ? "loading" : "empty");
  const [rotation, setRotation] = useState({ x: -10, y: -28 });
  const [lightingOpen, setLightingOpen] = useState(false);
  const [exposure, setExposure] = useState(1);
  const [environment, setEnvironment] = useState<EnvironmentPreset>("studio");
  const [environmentOpen, setEnvironmentOpen] = useState(false);
  const [environmentRotation, setEnvironmentRotation] = useState(0);
  const [environmentAutoRotate, setEnvironmentAutoRotate] = useState(false);
  const [gridVisible, setGridVisible] = useState(false);
  const [materialMode, setMaterialMode] = useState<MaterialMode>("texture");
  const [displaySettingsOpen, setDisplaySettingsOpen] = useState(false);
  const [displayShading, setDisplayShading] = useState<"flat" | "smooth">("flat");
  const [exportOpen, setExportOpen] = useState(false);
  const [exportName, setExportName] = useState("Nexus 3D Preview");
  const [exportFormat, setExportFormat] = useState<Model3DExportFormat>("GLB");
  const [exportResolution, setExportResolution] = useState<Model3DExportResolution>("4k");
  const [bottomCenterPivot, setBottomCenterPivot] = useState(false);
  const [resetSignal, setResetSignal] = useState(0);

  const canPreview = Boolean(modelUrl);
  const processing = isModel3DTaskProcessing(status);

  useEffect(() => {
    setViewerState(modelUrl ? "loading" : "empty");
    setRotation({ x: -10, y: -28 });
  }, [modelUrl]);

  useEffect(() => {
    if (!environmentAutoRotate) return;
    const timer = window.setInterval(() => {
      setEnvironmentRotation((value) => (value + 2) % 360);
    }, 60);
    return () => window.clearInterval(timer);
  }, [environmentAutoRotate]);

  const modelName = useMemo(() => {
    if (!modelUrl) return "";
    try {
      return modelFileName || decodeURIComponent(new URL(modelUrl).pathname.split("/").pop() || "model.glb");
    } catch {
      return modelFileName || modelUrl.split("/").pop() || "model.glb";
    }
  }, [modelFileName, modelUrl]);

  function resetView() {
    setRotation({ x: -10, y: -28 });
    setResetSignal((value) => value + 1);
  }

  const currentEnvironment = environmentOptions.find((option) => option.value === environment) || environmentOptions[0];
  const activeMaterialLabel = materialModes.find((modeItem) => modeItem.value === materialMode)?.label || "纹理视图";

  return (
    <section className="model3d-viewer-panel relative isolate flex min-h-[520px] flex-1 overflow-visible rounded-xl border border-[color:var(--color-border)] bg-[#5c5c5c] shadow-soft xl:min-h-0">
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept=".glb,.gltf,.fbx,.obj,model/gltf-binary,model/gltf+json,application/octet-stream"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onModelFileChange(file);
          event.currentTarget.value = "";
        }}
      />

      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_38%,#a8a8a8_0%,#898989_34%,#686868_66%,#555555_100%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.16),transparent_24%,rgba(0,0,0,0.18)_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_48%,transparent_0%,transparent_52%,rgba(0,0,0,0.22)_100%)]" />
        <div className="absolute left-1/2 top-[16%] h-24 w-[38%] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.22),transparent_72%)] blur-md" />
        <div className="absolute inset-x-16 bottom-8 h-32 rounded-[50%] bg-[radial-gradient(ellipse_at_center,rgba(20,20,20,0.26),transparent_72%)]" />
      </div>
      {canPreview || processing ? (
        <div className="model3d-viewer-title absolute left-4 top-4 z-10 flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-white/15 bg-[#666666]/72 px-3 py-1.5 text-xs font-semibold !text-white shadow-[0_12px_28px_rgba(0,0,0,0.22)] backdrop-blur-xl">
            {viewerState === "ready" ? modelName : "3D 预览画布"}
          </span>
          {processing ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 px-3 py-1.5 text-xs font-bold !text-white shadow-sm">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              正在生成
            </span>
          ) : null}
        </div>
      ) : null}

      {canPreview ? (
        <div className="model3d-viewer-actions absolute right-4 top-4 z-20 flex gap-2">
          <Button type="button" variant="secondary" size="icon" className="border-white/15 bg-[#666666]/72 !text-white shadow-[0_12px_28px_rgba(0,0,0,0.22)] backdrop-blur-xl hover:bg-[#777777]/82 hover:!text-white" onClick={() => fileInputRef.current?.click()} aria-label="上传 3D 模型">
            <FileUp className="h-4 w-4" />
          </Button>
          <Button type="button" variant="secondary" size="icon" className="border-white/15 bg-[#666666]/72 !text-white shadow-[0_12px_28px_rgba(0,0,0,0.22)] backdrop-blur-xl hover:bg-[#777777]/82 hover:!text-white" onClick={resetView} aria-label="重置视角">
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button type="button" variant="secondary" size="icon" className="border-white/15 bg-[#666666]/72 !text-white shadow-[0_12px_28px_rgba(0,0,0,0.22)] backdrop-blur-xl hover:bg-[#777777]/82 hover:!text-white disabled:opacity-45" onClick={onDownload} disabled={!modelUrl} aria-label="下载模型">
            <Download className="h-4 w-4" />
          </Button>
        </div>
      ) : null}

      <div className="model3d-viewer-gizmo absolute right-4 top-16 z-20 flex items-start gap-3">
        <ViewportStats stats={stats} />
        <div className="flex flex-col items-center gap-3">
          <AxisGizmo rotation={rotation} />
          <div className="grid gap-2 !text-white">
            <ViewerToolButton icon={SunMedium} label="环境设置" active={lightingOpen} onClick={() => setLightingOpen((value) => !value)} dark />
            <ViewerToolButton icon={RotateCcw} label="重置相机" onClick={resetView} dark />
            <ViewerToolButton icon={Grid3X3} label="网格" active={gridVisible} onClick={() => setGridVisible((value) => !value)} dark />
          </div>
        </div>
      </div>

      {lightingOpen ? (
        <div className="absolute right-[84px] top-24 z-[120] w-64 rounded-2xl border border-white/15 bg-[#747474]/95 p-4 !text-white shadow-[0_22px_70px_rgba(0,0,0,0.35)] backdrop-blur">
          <div className="mb-3 flex items-center justify-between text-sm font-bold">
            <span>环境设置</span>
            <button type="button" onClick={() => setLightingOpen(false)} className="!text-white/70 hover:!text-white" aria-label="关闭环境设置">
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="mb-2 text-xs !text-white/75">HDRI</p>
          <div className="relative mb-3 h-24 overflow-hidden rounded-lg border border-white/15 bg-[#4f4f4f] shadow-inner">
            <img src={currentEnvironment.image} alt={`${currentEnvironment.label} HDRI`} className="h-full w-full object-cover" />
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.12),rgba(0,0,0,0.18))]" />
          </div>
          <div className="relative mb-3">
            <button type="button" onClick={() => setEnvironmentOpen((value) => !value)} className="flex h-11 w-full items-center justify-between rounded-lg border border-white/15 bg-[#626262] px-3 text-sm font-semibold !text-white">
              {currentEnvironment.label}
              <ChevronDown className={cn("h-4 w-4 transition", environmentOpen && "rotate-180")} />
            </button>
            {environmentOpen ? (
              <div className="absolute left-0 top-[calc(100%+8px)] z-[140] grid max-h-72 w-full overflow-y-auto rounded-xl border border-white/15 bg-[#626262] py-1 text-sm font-semibold !text-white shadow-2xl">
                {environmentOptions.map((option) => (
                  <button key={option.value} type="button" onClick={() => { setEnvironment(option.value); setEnvironmentOpen(false); }} className={cn("flex h-12 items-center gap-2 px-2 text-left !text-white hover:bg-white/10", environment === option.value && "bg-gradient-to-r from-sky-300/70 to-cyan-300/70 !text-white")}>
                    <span className="h-8 w-14 overflow-hidden rounded-md border border-white/15 bg-[#4f4f4f]">
                      <img src={option.image} alt="" className="h-full w-full object-cover" />
                    </span>
                    <span>{option.label}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <ViewerRange label="强度" value={exposure} min={0} max={2} step={0.01} onChange={setExposure} dark />
          <ViewerRange label="旋转" value={environmentRotation} min={0} max={360} step={1} onChange={setEnvironmentRotation} dark />
          <ToggleRow label="自动旋转" checked={environmentAutoRotate} onChange={setEnvironmentAutoRotate} />
        </div>
      ) : null}

      <div className="model3d-canvas-stage relative z-[1] flex min-h-0 min-w-0 flex-1 select-none items-center justify-center p-8">
        <ViewportStatusStrip hiddenCount={hiddenNodeIds.length} isolated={Boolean(isolatedNodeId)} materialLabel={activeMaterialLabel} gridVisible={gridVisible} />
        <ThreeModelViewport
          displayShading={displayShading}
          environment={environment}
          environmentRotation={environmentRotation}
          exposure={exposure}
          gridVisible={gridVisible}
          materialMode={materialMode}
          modelUrl={modelUrl}
          fallbackModelUrl={fallbackModelUrl}
          modelFileName={modelFileName}
          hiddenNodeIds={hiddenNodeIds}
          isolatedNodeId={isolatedNodeId}
          selectionRequest={selectionRequest}
          transformRequest={transformRequest}
          onError={() => setViewerState("failed")}
          onLoad={() => setViewerState("ready")}
          onSceneHierarchyChange={onSceneHierarchyChange}
          onSceneSelectionChange={onSceneSelectionChange}
          onSceneStatsChange={onSceneStatsChange}
          onSceneTransformCommit={onSceneTransformCommit}
          onViewRotationChange={setRotation}
          resetSignal={resetSignal}
        />
        {canPreview && viewerState === "loading" ? (
          <div className="absolute inset-0 grid place-items-center">
            <div className="rounded-2xl border border-white/15 bg-[#666666]/82 px-5 py-4 text-center !text-white shadow-[0_18px_42px_rgba(0,0,0,0.28)] backdrop-blur-xl">
              <Loader2 className="mx-auto h-5 w-5 animate-spin" />
              <p className="mt-2 text-sm">正在加载模型...</p>
            </div>
          </div>
        ) : null}
        {canPreview && viewerState === "failed" ? (
          <div className="absolute inset-0 grid place-items-center">
            <div className="max-w-sm rounded-2xl border border-red-300/35 bg-[#6c5b5b]/88 px-5 py-4 text-center shadow-[0_18px_42px_rgba(0,0,0,0.28)] backdrop-blur-xl">
              <p className="font-medium text-red-200">模型暂时无法预览</p>
              <p className="mt-2 text-sm !text-white/72">请确认文件为 GLB、GLTF、FBX 或 OBJ，或稍后重新上传。</p>
            </div>
          </div>
        ) : null}
      </div>
      {displaySettingsOpen ? <DisplaySettingsPanel shading={displayShading} onShadingChange={setDisplayShading} onClose={() => setDisplaySettingsOpen(false)} /> : null}
      {exportOpen ? (
        <div className="absolute inset-0 z-[120]" onClick={() => setExportOpen(false)}>
          <ExportPanel
            fileName={exportName}
            format={exportFormat}
            resolution={exportResolution}
            bottomCenterPivot={bottomCenterPivot}
            onFileNameChange={setExportName}
            onFormatChange={setExportFormat}
            onResolutionChange={setExportResolution}
            onBottomCenterPivotChange={setBottomCenterPivot}
            onClose={() => setExportOpen(false)}
            onExport={() => onExport({ bottomCenterPivot, fileName: exportName, format: exportFormat, resolution: exportResolution })}
          />
        </div>
      ) : null}
      <MaterialDock
        activeMode={materialMode}
        onModeChange={(mode) => {
          setMaterialMode(mode);
          if (mode === "display") setDisplaySettingsOpen((value) => !value);
        }}
        onExportClick={() => setExportOpen(true)}
      />
    </section>
  );
}

type AxisName = "x" | "y" | "z";

type AxisProjection = {
  color: string;
  depth: number;
  endX: number;
  endY: number;
  label: string;
  labelX: number;
  labelY: number;
  name: AxisName;
  negativeX: number;
  negativeY: number;
  opacity: number;
  points: string;
  strokeWidth: number;
};

const AXIS_GIZMO_SIZE = 96;
const AXIS_GIZMO_ORIGIN = 48;
const AXIS_GIZMO_LENGTH = 34;
const AXIS_GIZMO_BACK_LENGTH = 15;

const axisGizmoConfig: Array<{ color: string; label: string; name: AxisName; vector: { x: number; y: number; z: number } }> = [
  { name: "x", label: "X", color: "#ef4444", vector: { x: 1, y: 0, z: 0 } },
  { name: "y", label: "Y", color: "#84cc16", vector: { x: 0, y: 1, z: 0 } },
  { name: "z", label: "Z", color: "#3b82f6", vector: { x: 0, y: 0, z: 1 } }
];

function ViewportStats({ stats }: { stats: Model3DSceneStats }) {
  return (
    <div className="model3d-viewport-stats flex items-start gap-3 pt-2 text-xs font-semibold !text-white">
      <div className="grid grid-cols-[32px_1fr] gap-x-3 gap-y-2 text-right">
        <span className="!text-white/55">拓扑</span>
        <span className="!text-white">Triangle</span>
        <span className="!text-white/55">面</span>
        <span className="!text-white">{formatStatNumber(stats.faces)} / {formatStatNumber(stats.triangles)}</span>
        <span className="!text-white/55">顶点</span>
        <span className="!text-white">{formatStatNumber(stats.vertices)}</span>
      </div>
    </div>
  );
}

function ViewportStatusStrip({ hiddenCount, isolated, materialLabel, gridVisible }: { hiddenCount: number; isolated: boolean; materialLabel: string; gridVisible: boolean }) {
  if (!hiddenCount && !isolated && !gridVisible) return null;
  return (
    <div className="pointer-events-none absolute left-1/2 top-4 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/15 bg-[#666666]/70 px-3 py-2 text-[11px] font-bold !text-white shadow-[0_16px_38px_rgba(0,0,0,0.22)] backdrop-blur-xl">
      {isolated ? <span className="rounded-full bg-white/16 px-2 py-0.5 !text-white">Solo 隔离中</span> : null}
      {hiddenCount ? <span className="rounded-full bg-white/16 px-2 py-0.5 !text-white">隐藏 {hiddenCount} 层</span> : null}
      {gridVisible ? <span className="rounded-full bg-white/16 px-2 py-0.5 !text-white">网格开启</span> : null}
      <span className="rounded-full bg-white/10 px-2 py-0.5 !text-white/80">{materialLabel}</span>
    </div>
  );
}

function formatStatNumber(value: number) {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function AxisGizmo({ rotation }: { rotation: { x: number; y: number } }) {
  const axes = getAxisProjections(rotation);
  return (
    <div className="model3d-axis-gizmo relative h-24 w-24 shrink-0 overflow-visible drop-shadow-[0_12px_24px_rgba(0,0,0,0.28)]" aria-label="3D XYZ 坐标轴">
      <svg className="absolute inset-0 overflow-visible" viewBox={`0 0 ${AXIS_GIZMO_SIZE} ${AXIS_GIZMO_SIZE}`} role="img">
        <defs>
          <radialGradient id="axis-origin-gradient" cx="35%" cy="30%" r="70%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#d9d9d9" />
          </radialGradient>
        </defs>
        <ellipse cx={AXIS_GIZMO_ORIGIN} cy="54" rx="29" ry="10" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.18)" strokeDasharray="3 3" />
        {[...axes].sort((firstAxis, secondAxis) => firstAxis.depth - secondAxis.depth).map((axis) => (
          <g key={axis.name}>
            <line x1={axis.negativeX} y1={axis.negativeY} x2={AXIS_GIZMO_ORIGIN} y2={AXIS_GIZMO_ORIGIN} stroke={axis.color} strokeWidth="1.6" strokeLinecap="round" opacity="0.32" />
            <line x1={AXIS_GIZMO_ORIGIN} y1={AXIS_GIZMO_ORIGIN} x2={axis.endX} y2={axis.endY} stroke={axis.color} strokeWidth={axis.strokeWidth} strokeLinecap="round" opacity={axis.opacity} />
            <polygon points={axis.points} fill={axis.color} opacity={axis.opacity} />
          </g>
        ))}
        <circle cx={AXIS_GIZMO_ORIGIN} cy={AXIS_GIZMO_ORIGIN} r="5.5" fill="url(#axis-origin-gradient)" stroke="rgba(255,255,255,0.85)" strokeWidth="1.4" />
      </svg>
      {axes.map((axis) => (
        <span
          key={axis.label}
          className="absolute grid h-6 w-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-[11px] font-black !text-white shadow-[0_10px_24px_rgba(0,0,0,0.28)]"
          style={{ backgroundColor: axis.color, left: axis.labelX, top: axis.labelY, opacity: axis.opacity }}
        >
          {axis.label}
        </span>
      ))}
    </div>
  );
}

function getAxisProjections(rotation: { x: number; y: number }): AxisProjection[] {
  return axisGizmoConfig.map((axis) => {
    const rotated = rotateAxisVector(axis.vector, rotation);
    const depthScale = 0.92 + (rotated.z + 1) * 0.08;
    const endX = AXIS_GIZMO_ORIGIN + rotated.x * AXIS_GIZMO_LENGTH * depthScale;
    const endY = AXIS_GIZMO_ORIGIN - rotated.y * AXIS_GIZMO_LENGTH * depthScale;
    const negativeX = AXIS_GIZMO_ORIGIN - rotated.x * AXIS_GIZMO_BACK_LENGTH;
    const negativeY = AXIS_GIZMO_ORIGIN + rotated.y * AXIS_GIZMO_BACK_LENGTH;
    const directionLength = Math.hypot(endX - AXIS_GIZMO_ORIGIN, endY - AXIS_GIZMO_ORIGIN) || 1;
    const unitX = (endX - AXIS_GIZMO_ORIGIN) / directionLength;
    const unitY = (endY - AXIS_GIZMO_ORIGIN) / directionLength;
    const normalX = -unitY;
    const normalY = unitX;
    const arrowBaseX = endX - unitX * 8;
    const arrowBaseY = endY - unitY * 8;

    return {
      ...axis,
      depth: rotated.z,
      endX,
      endY,
      labelX: endX + unitX * 10,
      labelY: endY + unitY * 10,
      negativeX,
      negativeY,
      opacity: 0.62 + (rotated.z + 1) * 0.18,
      points: `${endX},${endY} ${arrowBaseX + normalX * 4.5},${arrowBaseY + normalY * 4.5} ${arrowBaseX - normalX * 4.5},${arrowBaseY - normalY * 4.5}`,
      strokeWidth: 2.4 + (rotated.z + 1) * 0.45
    };
  });
}

function rotateAxisVector(vector: { x: number; y: number; z: number }, rotation: { x: number; y: number }) {
  const yaw = (-rotation.y * Math.PI) / 180;
  const pitch = (rotation.x * Math.PI) / 180;
  const yawX = vector.x * Math.cos(yaw) - vector.z * Math.sin(yaw);
  const yawZ = vector.x * Math.sin(yaw) + vector.z * Math.cos(yaw);
  const pitchY = vector.y * Math.cos(pitch) - yawZ * Math.sin(pitch);
  const pitchZ = vector.y * Math.sin(pitch) + yawZ * Math.cos(pitch);

  return {
    x: yawX,
    y: pitchY,
    z: pitchZ
  };
}

function ToolDivider() {
  return <span className="mx-auto h-px w-5 bg-white/18" />;
}

function ViewerToolButton({ icon: Icon, label, active = false, dark = false, onClick }: { icon: typeof Rotate3D; label: string; active?: boolean; dark?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={cn(
        "relative grid h-9 w-9 place-items-center rounded-full border border-white/15 bg-[#666666]/72 !text-white shadow-[0_12px_28px_rgba(0,0,0,0.22)] backdrop-blur-xl transition hover:bg-[#777777]/82 hover:!text-white",
        dark && "h-10 w-10 border-white/90 bg-white/[0.16] !text-white shadow-[0_12px_26px_rgba(0,0,0,0.18)] backdrop-blur-xl hover:bg-white/25 hover:!text-white",
        active && "border-white bg-gradient-to-br from-sky-200/70 via-cyan-100/55 to-white/50 !text-white shadow-[0_0_0_2px_rgba(255,255,255,0.38),0_0_24px_rgba(125,211,252,0.45)] hover:!text-white"
      )}
    >
      <Icon className={cn("h-4 w-4", active && "!text-white")} />
    </button>
  );
}

function ViewerRange({ label, value, min, max, step, dark = false, onChange }: { label: string; value: number; min: number; max: number; step: number; dark?: boolean; onChange: (value: number) => void }) {
  return (
    <label className="mb-2 block text-xs font-semibold">
      <span className="mb-1 flex items-center justify-between">
        <span>{label}</span>
        <span className={cn("text-blue-500", dark && "rounded-lg border border-white/10 bg-[#626262] px-3 py-1 !text-white")}>{Number.isInteger(value) ? value : value.toFixed(2)}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className="h-2 w-full accent-blue-500" />
    </label>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="mt-3 flex h-8 w-full items-center justify-between text-xs font-semibold !text-white">
      {label}
      <span className={cn("flex h-5 w-9 items-center rounded-full bg-white/10 p-0.5 transition", checked && "bg-gradient-to-r from-blue-500 to-cyan-400")}>
        <span className={cn("h-4 w-4 rounded-full bg-white transition", checked && "translate-x-4")} />
      </span>
    </button>
  );
}

function MaterialDock({ activeMode, onModeChange, onExportClick }: { activeMode: MaterialMode; onModeChange: (mode: MaterialMode) => void; onExportClick: () => void }) {
  return (
    <div className="model3d-material-dock absolute bottom-4 left-1/2 z-[80] flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/15 bg-[#686868]/86 px-4 py-2 shadow-[0_18px_45px_rgba(0,0,0,0.32)] backdrop-blur">
      {materialModes.map((mode) => {
        const Icon = mode.icon;
        const active = activeMode === mode.value;
        if (mode.value === "display") {
          return (
            <button key={mode.value} type="button" onClick={() => onModeChange(mode.value)} title={mode.label} className={cn("inline-flex h-8 items-center gap-1.5 rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 px-3 text-xs font-bold !text-white shadow transition hover:scale-105", active && "from-sky-300 to-cyan-200 !text-white")}>
              <Settings2 className="h-3.5 w-3.5 !text-white" />
              显示
            </button>
          );
        }
        return (
          <button key={mode.value} type="button" onClick={() => onModeChange(mode.value)} title={mode.label} className={cn("grid h-8 w-8 place-items-center rounded-full bg-white/8 ring-1 ring-white/8 transition hover:ring-white/40", active && "scale-110 bg-white/15 ring-white/25")}>
            <span className={cn("grid h-5 w-5 place-items-center rounded-full shadow-inner", mode.className)}>{Icon ? <Icon className="h-3 w-3 text-white drop-shadow" /> : null}</span>
          </button>
        );
      })}
      <button type="button" onClick={onExportClick} className="ml-2 inline-flex h-9 items-center gap-1.5 rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 px-4 text-xs font-bold !text-white shadow" title="导出模型">
        <Download className="h-3.5 w-3.5" />
        导出
      </button>
    </div>
  );
}

function DisplaySettingsPanel({ shading, onShadingChange, onClose }: { shading: "flat" | "smooth"; onShadingChange: (value: "flat" | "smooth") => void; onClose: () => void }) {
  return (
    <div className="absolute bottom-20 left-1/2 z-[130] w-64 -translate-x-1/2 rounded-2xl border border-white/15 bg-[#747474]/95 p-4 !text-white shadow-[0_22px_70px_rgba(0,0,0,0.35)] backdrop-blur">
      <div className="mb-2 flex items-center justify-between text-sm font-bold">
        显示设置
        <button type="button" onClick={onClose} className="!text-white/70 hover:!text-white" aria-label="关闭显示设置">
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="mb-3 text-xs !text-white/75">着色</p>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => onShadingChange("flat")} className={cn("h-9 rounded-lg border border-white/15 bg-[#626262] text-sm font-bold !text-white", shading === "flat" && "bg-gradient-to-r from-sky-300/80 to-cyan-300/80 !text-white")}>平直</button>
        <button type="button" onClick={() => onShadingChange("smooth")} className={cn("h-9 rounded-lg border border-white/15 bg-[#626262] text-sm font-bold !text-white", shading === "smooth" && "bg-gradient-to-r from-sky-300/80 to-cyan-300/80 !text-white")}>平滑</button>
      </div>
    </div>
  );
}

function ExportPanel({
  fileName,
  format,
  resolution,
  bottomCenterPivot,
  onFileNameChange,
  onFormatChange,
  onResolutionChange,
  onBottomCenterPivotChange,
  onClose,
  onExport
}: {
  fileName: string;
  format: Model3DExportFormat;
  resolution: Model3DExportResolution;
  bottomCenterPivot: boolean;
  onFileNameChange: (value: string) => void;
  onFormatChange: (value: Model3DExportFormat) => void;
  onResolutionChange: (value: Model3DExportResolution) => void;
  onBottomCenterPivotChange: (value: boolean) => void;
  onClose: () => void;
  onExport: () => void;
}) {
  const formats: Model3DExportFormat[] = ["FBX", "OBJ", "STL", "GLB"];
  const resolutions: Model3DExportResolution[] = ["512", "1k", "2k", "4k"];
  return (
    <div className="absolute bottom-20 left-1/2 z-[130] w-72 translate-x-[54px] rounded-2xl border border-white/15 bg-[#747474]/95 p-4 !text-white shadow-[0_22px_70px_rgba(0,0,0,0.35)] backdrop-blur" onClick={(event) => event.stopPropagation()}>
      <div className="mb-4 flex items-center justify-between text-sm font-bold">
        导出
        <button type="button" onClick={onClose} className="!text-white/70 hover:!text-white" aria-label="关闭导出">
          <X className="h-4 w-4" />
        </button>
      </div>
      <label className="mb-3 block text-xs font-semibold !text-white/75">
        文件名
        <input value={fileName} onChange={(event) => onFileNameChange(event.target.value)} className="mt-2 h-10 w-full rounded-lg border border-white/15 bg-[#626262] px-3 text-sm font-semibold !text-white outline-none placeholder:!text-white/45" />
      </label>
      <label className="mb-3 block text-xs font-semibold !text-white/75">
        格式
        <select value={format} onChange={(event) => onFormatChange(event.target.value as Model3DExportFormat)} className="mt-2 h-10 w-full rounded-lg border border-white/15 bg-[#626262] px-3 text-sm font-semibold !text-white outline-none">
          {formats.map((item) => <option key={item}>{item}</option>)}
        </select>
      </label>
      <div className="mb-3 text-xs font-semibold !text-white/75">
        纹理分辨率
        <div className="mt-2 grid grid-cols-4 gap-2">
          {resolutions.map((item) => (
            <button key={item} type="button" onClick={() => onResolutionChange(item)} className={cn("h-9 rounded-lg border border-white/20 bg-[#8a8a8a] text-sm font-bold !text-white/80", resolution === item && "border-sky-200 bg-gradient-to-r from-sky-300/80 to-cyan-300/80 !text-white")}>{item}</button>
          ))}
        </div>
      </div>
      <button type="button" onClick={() => onBottomCenterPivotChange(!bottomCenterPivot)} className="mb-4 flex h-8 w-full items-center justify-between text-sm font-bold">
        <span className="!text-white">底部中心轴点</span>
        <span className={cn("flex h-5 w-9 items-center rounded-full bg-white/10 p-0.5 transition", bottomCenterPivot && "bg-gradient-to-r from-blue-500 to-cyan-400")}>
          <span className={cn("h-4 w-4 rounded-full bg-white transition", bottomCenterPivot && "translate-x-4")} />
        </span>
      </button>
      <div className="grid grid-cols-[1fr_2fr] gap-3">
        <button type="button" className="h-11 rounded-full border border-yellow-300 text-sm font-bold text-yellow-300">发送至</button>
        <button type="button" onClick={onExport} className="h-11 rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 text-sm font-bold !text-white">导出</button>
      </div>
    </div>
  );
}
