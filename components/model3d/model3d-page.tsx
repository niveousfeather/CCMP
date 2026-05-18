"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  initialModel3DTasks,
  isModel3DTaskProcessing,
  MODEL3D_DEFAULT_FACE_COUNT,
  MODEL3D_DEFAULT_RETOPO_FACE_COUNT,
  initialModel3DPrompt,
  MODEL3D_DEFAULT_MODEL,
  Model3DGenerationProfile,
  Model3DInputImage,
  Model3DMode,
  Model3DOperationRecord,
  Model3DQuality,
  Model3DSceneNode,
  Model3DSceneSelection,
  Model3DSceneStats,
  Model3DSceneTransform,
  Model3DTextureQuality,
  Model3DTopology,
  Model3DTask
} from "@/components/model3d/model3d-data";
import { Model3DHistoryPanel } from "@/components/model3d/model3d-history-panel";
import { Model3DParameterPanel } from "@/components/model3d/model3d-parameter-panel";
import { Model3DViewer } from "@/components/model3d/model3d-viewer";
import { getModel3DApiFeatureMeta, Model3DApiFeature, Model3DExportRequest } from "@/components/model3d/model3d-api-features";
import { useToast } from "@/components/ui/toast";

export function Model3DPage() {
  const { toast } = useToast();
  const [prompt, setPrompt] = useState(initialModel3DPrompt);
  const [mode, setMode] = useState<Model3DMode>("text-to-3d");
  const [model, setModel] = useState(MODEL3D_DEFAULT_MODEL);
  const [generationProfile, setGenerationProfile] = useState<Model3DGenerationProfile>("high-precision");
  const [quality, setQuality] = useState<Model3DQuality>("standard");
  const [imageAutoOptimizeEnabled, setImageAutoOptimizeEnabled] = useState(false);
  const [smartMeshEnabled, setSmartMeshEnabled] = useState(false);
  const [highPrecisionTopology, setHighPrecisionTopology] = useState<Model3DTopology>("triangle");
  const [highPrecisionFaceCount, setHighPrecisionFaceCount] = useState<number | "auto">("auto");
  const [smartMeshTopology, setSmartMeshTopology] = useState<Model3DTopology>("triangle");
  const [smartMeshFaceCount, setSmartMeshFaceCount] = useState(MODEL3D_DEFAULT_FACE_COUNT);
  const [retopoEnabled, setRetopoEnabled] = useState(false);
  const [retopoTopology, setRetopoTopology] = useState<Model3DTopology>("triangle");
  const [retopoFaceCount, setRetopoFaceCount] = useState(MODEL3D_DEFAULT_RETOPO_FACE_COUNT);
  const [textureEnabled, setTextureEnabled] = useState(true);
  const [textureQuality, setTextureQuality] = useState<Model3DTextureQuality>("standard");
  const [textureInputMode, setTextureInputMode] = useState<"image" | "multi" | "text">("text");
  const [pbrEnabled, setPbrEnabled] = useState(false);
  const [generatePartsEnabled, setGeneratePartsEnabled] = useState(false);
  const [inputImages, setInputImages] = useState<Model3DInputImage[]>([]);
  const [modelUrl, setModelUrl] = useState<string | null>(null);
  const [previewModelUrl, setPreviewModelUrl] = useState<string | null>(null);
  const [modelFileName, setModelFileName] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Model3DTask[]>(initialModel3DTasks);
  const [activeTask, setActiveTask] = useState<Model3DTask | null>(null);
  const [sceneHierarchy, setSceneHierarchy] = useState<Model3DSceneNode | null>(null);
  const [sceneSelection, setSceneSelection] = useState<Model3DSceneSelection | null>(null);
  const [sceneStats, setSceneStats] = useState<Model3DSceneStats>({ faces: 0, triangles: 0, vertices: 0 });
  const [hiddenSceneNodeIds, setHiddenSceneNodeIds] = useState<string[]>([]);
  const [isolatedSceneNodeId, setIsolatedSceneNodeId] = useState<string | null>(null);
  const [sceneSelectionRequest, setSceneSelectionRequest] = useState<string | null>(null);
  const [sceneTransformRequest, setSceneTransformRequest] = useState<{ nodeId: string; requestId: number; reset?: boolean; transform?: Model3DSceneTransform } | null>(null);
  const latestTransformRef = useRef<{ nodeId: string; transform: Model3DSceneTransform } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
  const [leftPanelManuallyToggled, setLeftPanelManuallyToggled] = useState(false);
  const submittingRef = useRef(false);
  const modelInputRef = useRef<HTMLInputElement | null>(null);
  const objectUrlsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrlsRef.current.clear();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadModel3DHistory() {
      try {
        const response = await fetch("/api/model3d/history", { cache: "no-store" });
        const result = (await response.json().catch(() => null)) as { tasks?: Model3DTask[] } | null;
        if (!response.ok) throw new Error("3D history load failed");
        if (cancelled) return;
        const remoteTasks = result?.tasks || [];
        setTasks(remoteTasks);
        const requestedTaskId = new URLSearchParams(window.location.search).get("taskId");
        const firstReadyTask = remoteTasks.find((task) => task.id === requestedTaskId || task.providerTaskId === requestedTaskId) || remoteTasks.find((task) => task.modelUrl) || remoteTasks[0] || null;
        if (firstReadyTask) {
          setActiveTask(firstReadyTask);
          setModelUrl(firstReadyTask.modelUrl || null);
          setPreviewModelUrl(firstReadyTask.previewModelUrl || firstReadyTask.modelUrl || null);
          setModelFileName(firstReadyTask.title);
        }
      } catch {
        if (!cancelled) {
          toast({ type: "error", message: "3D 资产历史加载失败，请稍后刷新。" });
        }
      }
    }
    void loadModel3DHistory();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  useEffect(() => {
    if (leftPanelManuallyToggled) return;
    const mediaQuery = window.matchMedia("(max-width: 1199px)");
    const updateCollapsedState = () => setLeftPanelCollapsed(mediaQuery.matches);
    updateCollapsedState();
    mediaQuery.addEventListener("change", updateCollapsedState);
    return () => mediaQuery.removeEventListener("change", updateCollapsedState);
  }, [leftPanelManuallyToggled]);

  useEffect(() => {
    const pendingTripoTasks = tasks.filter((task) => task.provider === "tripo" && isModel3DTaskProcessing(task.status));
    if (!pendingTripoTasks.length) return;

    const timer = window.setInterval(() => {
      pendingTripoTasks.forEach((task) => {
        void refreshRemoteModel3DTask(task);
      });
    }, 5000);

    return () => window.clearInterval(timer);
  }, [tasks]);

  function rememberObjectUrl(url: string) {
    objectUrlsRef.current.add(url);
    return url;
  }

  function handleImageChange(files: File[], label?: string) {
    if (!files.length) return;
    const accepted: Model3DInputImage[] = [];
    const maxCount = mode === "multi-view-to-3d" ? 4 : mode === "batch-image-to-3d" ? 10 : 1;
    const sizeLimit = 20 * 1024 * 1024;

    for (const file of files) {
      if (!file.type.startsWith("image/")) {
        toast({ type: "error", message: "请上传 PNG、JPG 或 WEBP 图片。" });
        continue;
      }
      if (file.size > sizeLimit) {
        toast({ type: "error", message: `${file.name} 超过 20MB，请压缩后再上传。` });
        continue;
      }
      accepted.push({
        id: `${Date.now()}-${crypto.randomUUID?.() || Math.random().toString(36).slice(2)}`,
        file,
        url: rememberObjectUrl(URL.createObjectURL(file)),
        name: file.name,
        size: file.size,
        label
      });
    }

    if (!accepted.length) return;

    setInputImages((current) => {
      const sameSlotRemoved = label ? current.filter((item) => item.label !== label) : current;
      const next = [...sameSlotRemoved, ...accepted].slice(0, maxCount);
      if (next.length < sameSlotRemoved.length + accepted.length) {
        toast({ type: "error", message: `当前模式最多上传 ${maxCount} 张图片。` });
      }
      return next;
    });
  }

  function handleImageRemove(id: string) {
    setInputImages((current) => {
      const removed = current.find((item) => item.id === id);
      if (removed?.url.startsWith("blob:")) {
        URL.revokeObjectURL(removed.url);
        objectUrlsRef.current.delete(removed.url);
      }
      return current.filter((item) => item.id !== id);
    });
  }

  function handleModeChange(nextMode: Model3DMode) {
    setMode(nextMode);
    setInputImages((current) => {
      const nextLimit = nextMode === "multi-view-to-3d" ? 4 : nextMode === "batch-image-to-3d" ? 10 : nextMode === "text-to-3d" ? 0 : 1;
      if (nextLimit === 0) return [];
      return current.slice(0, nextLimit);
    });
  }

  function handleSmartMeshChange(enabled: boolean) {
    setSmartMeshEnabled(enabled);
    if (enabled) {
      setSmartMeshTopology("triangle");
      setSmartMeshFaceCount((current) => current || MODEL3D_DEFAULT_FACE_COUNT);
    }
  }

  function handleRetopoChange(enabled: boolean) {
    setRetopoEnabled(enabled);
    if (enabled) {
      setRetopoTopology("triangle");
      setRetopoFaceCount((current) => current || MODEL3D_DEFAULT_RETOPO_FACE_COUNT);
    }
  }

  function handleTextureQualityChange(nextQuality: Model3DTextureQuality) {
    setTextureQuality(nextQuality);
    setQuality(nextQuality === "hd" ? "high" : "standard");
  }

  function handleGenerationProfileChange(profile: Model3DGenerationProfile) {
    setGenerationProfile(profile);
    if (profile === "smart-mesh") {
      handleSmartMeshChange(true);
    }
  }

  function validateInputs() {
    if (mode === "text-to-3d") {
      if (!prompt.trim()) {
        toast({ type: "error", message: "文本转 3D 需要输入模型描述。" });
        return false;
      }
      return true;
    }
    if (mode === "multi-view-to-3d") {
      const required = ["前", "后", "左侧", "右侧"];
      const missing = required.filter((label) => !inputImages.some((image) => image.label === label));
      if (missing.length) {
        toast({ type: "error", message: `多视图生成需要补齐：${missing.join("、")}。` });
        return false;
      }
      return true;
    }
    if (mode === "batch-image-to-3d") {
      if (!inputImages.length) {
        toast({ type: "error", message: "批量图片转 3D 至少需要上传 1 张图片。" });
        return false;
      }
      return true;
    }
    if (!inputImages.length) {
      toast({ type: "error", message: "请上传 PNG、JPG 或 WEBP 参考图。" });
      return false;
    }
    return true;
  }

  function handleModelFileChange(file: File) {
    const lowerName = file.name.toLowerCase();
    if (!/\.(glb|gltf|fbx|obj)$/i.test(lowerName)) {
      toast({ type: "error", message: "画布预览支持 GLB、GLTF、FBX、OBJ 模型文件。" });
      return;
    }
    if (file.size > 80 * 1024 * 1024) {
      toast({ type: "error", message: "模型文件不能超过 80MB。" });
      return;
    }

    const nextModelUrl = rememberObjectUrl(URL.createObjectURL(file));
    const createdAt = nowTime();
    setModelUrl(nextModelUrl);
    setPreviewModelUrl(nextModelUrl);
    setModelFileName(file.name);

    const task: Model3DTask = {
      id: `local-model-${Date.now()}`,
      title: makeTitle(file.name.replace(/\.(glb|gltf|fbx|obj)$/i, "")),
      prompt: prompt.trim() || "本地上传模型预览",
      mode,
      status: "succeeded",
      model,
      generationProfile,
      quality,
      imageAutoOptimizeEnabled,
      smartMeshEnabled,
      highPrecisionTopology,
      highPrecisionFaceCount,
      smartMeshTopology,
      smartMeshFaceCount,
      retopoEnabled,
      retopoTopology,
      retopoFaceCount,
      topology: highPrecisionTopology,
      faceCount: smartMeshFaceCount,
      textureFaceCount: highPrecisionFaceCount,
      textureEnabled,
      textureQuality,
      pbrEnabled,
      generatePartsEnabled,
      inputImageUrl: inputImages[0]?.url || null,
      inputImages: inputImages.map(({ url, name, label }) => ({ url, name, label })),
      modelUrl: nextModelUrl,
      operations: [makeOperationRecord("model", "模型生成", createdAt, "scene-root")],
      createdAt,
      updatedAt: createdAt
    };
    setTasks((current) => [task, ...current]);
    setActiveTask(task);
    toast({ type: "success", message: "模型已载入预览区。" });
  }

  async function handleGenerate(feature: Model3DApiFeature = "generate-model", options?: { animation?: { motionId?: string; rigModel?: string } }) {
    if (submittingRef.current) return;
    if (!validateInputs()) return;
    const sourceRequiredFeatures = new Set<Model3DApiFeature>(["animation-apply", "animation-rig", "export-model", "part-complete", "part-split", "pbr-material", "retopo", "texture-edit", "texture-generate", "texture-upscale"]);
    if (sourceRequiredFeatures.has(feature) && !getActiveTripoSourceTaskId()) {
      const apiFeatureMeta = getModel3DApiFeatureMeta(feature);
      toast({ type: "error", message: `${apiFeatureMeta.label}需要先选择一个已成功返回的 Tripo 模型。` });
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    const createdAt = nowTime();
    const apiFeatureMeta = getModel3DApiFeatureMeta(feature);
    const task: Model3DTask = {
      id: `model3d-draft-${Date.now()}`,
      title: makeTitle(prompt || "3D 模型任务"),
      prompt: prompt.trim() || "根据参考图生成 3D 模型",
      mode,
      status: "pending",
      model,
      generationProfile,
      quality,
      imageAutoOptimizeEnabled,
      smartMeshEnabled,
      highPrecisionTopology,
      highPrecisionFaceCount,
      smartMeshTopology,
      smartMeshFaceCount,
      retopoEnabled,
      retopoTopology,
      retopoFaceCount,
      topology: highPrecisionTopology,
      faceCount: smartMeshFaceCount,
      textureFaceCount: highPrecisionFaceCount,
      textureEnabled,
      textureQuality,
      pbrEnabled,
      generatePartsEnabled,
      inputImageUrl: inputImages[0]?.url || null,
      inputImages: inputImages.map(({ url, name, label }) => ({ url, name, label })),
      operations: [makeOperationRecord(getOperationKind(feature), apiFeatureMeta.label, createdAt, "scene-root")],
      createdAt,
      updatedAt: createdAt
    };
    setTasks((current) => [task, ...current]);
    setActiveTask(task);
    setModelUrl(null);
    try {
      const imageRefs = await uploadInputImagesForModel3D();
      const response = await fetch("/api/model3d", {
        body: JSON.stringify(buildModel3DCreateRequest(feature, imageRefs, task.id, options)),
        headers: {
          "content-type": "application/json"
        },
        method: "POST"
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        const message = result?.message || `${apiFeatureMeta.label}接口暂不可用，已保留任务草稿。`;
        throw new Error(message);
      }
      const queuedTaskId = result?.taskId || result?.task?.task_id || result?.task?.taskId || task.id;
      setTasks((current) =>
        current.map((item) =>
          item.id === task.id
            ? {
                ...item,
                id: String(queuedTaskId),
                provider: "tripo",
                providerTaskId: result?.providerTaskId || result?.task?.provider_task_id || null,
                status: "pending",
                updatedAt: nowTime()
              }
            : item
        )
      );
      setActiveTask((current) =>
        current?.id === task.id
          ? {
              ...current,
              id: String(queuedTaskId),
              provider: "tripo",
              providerTaskId: result?.providerTaskId || result?.task?.provider_task_id || null,
              status: "pending",
              updatedAt: nowTime()
            }
          : current
      );
      toast({ type: "success", message: `${apiFeatureMeta.label}任务已进入生成队列，页面会持续更新状态。` });
    } catch (error) {
      const message = error instanceof Error ? error.message : `${apiFeatureMeta.label}接口暂不可用，已保留任务草稿。`;
      setTasks((current) =>
        current.map((item) =>
          item.id === task.id
            ? {
                ...item,
                status: "failed",
                errorMessage: message
              }
            : item
        )
      );
      setActiveTask((current) =>
        current?.id === task.id
          ? {
              ...current,
              status: "failed",
              errorMessage: message
            }
          : current
      );
      toast({ type: "error", message });
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  async function refreshRemoteModel3DTask(task: Model3DTask) {
    const taskLookupId = task.providerTaskId || task.id;
    if (!taskLookupId) return;
    try {
      const response = await fetch(`/api/model3d/tasks/${encodeURIComponent(taskLookupId)}`);
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.message || "3D 任务状态查询失败。");

      const normalized = result?.normalized;
      if (!normalized) return;
      const updatedTask: Model3DTask = {
        ...task,
        errorMessage: normalized.errorMessage || null,
        exportUrl: normalized.exportUrl || task.exportUrl || null,
        modelUrl: normalized.modelUrl || task.modelUrl || null,
        previewModelUrl:
          normalized.previewModelUrl ||
          task.previewModelUrl ||
          (normalized.modelUrl && taskLookupId ? `/api/model3d/preview/${encodeURIComponent(task.id)}` : null) ||
          normalized.modelUrl ||
          task.modelUrl ||
          null,
        providerTaskId: normalized.providerTaskId || normalized.taskId || task.providerTaskId || null,
        previewImageUrl: normalized.previewImageUrl || task.previewImageUrl || null,
        rawStatus: normalized.rawStatus || task.rawStatus || null,
        status: normalized.status || task.status,
        updatedAt: nowTime()
      };

      setTasks((current) => current.map((item) => (item.id === task.id || (task.providerTaskId && item.providerTaskId === task.providerTaskId) ? updatedTask : item)));
      if (updatedTask.status === "succeeded" && updatedTask.modelUrl) {
        setModelUrl(updatedTask.modelUrl);
        setPreviewModelUrl(updatedTask.previewModelUrl || updatedTask.modelUrl);
        setModelFileName(updatedTask.title);
      }
      setActiveTask((current) => {
        if (current?.id !== task.id && (!task.providerTaskId || current?.providerTaskId !== task.providerTaskId)) return current;
        if (updatedTask.status === "succeeded" && updatedTask.modelUrl) {
          setModelUrl(updatedTask.modelUrl);
          setPreviewModelUrl(updatedTask.previewModelUrl || updatedTask.modelUrl);
        }
        return updatedTask;
      });

      if (updatedTask.status === "succeeded" && updatedTask.modelUrl) {
        toast({ type: "success", message: "3D 模型已生成，已载入视口。" });
      }
      if (updatedTask.status === "failed") {
        toast({ type: "error", message: updatedTask.errorMessage || "3D 任务生成失败。" });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "3D 任务状态查询失败。";
      setTasks((current) => current.map((item) => (item.id === task.id ? { ...item, errorMessage: message, updatedAt: nowTime() } : item)));
    }
  }

  async function uploadInputImagesForModel3D() {
    const uploaded: Array<{ fileType?: string; label?: string; objectKey?: string | null; storageUrl?: string; token: string; tripoToken?: boolean; url?: string }> = [];
    for (const image of inputImages) {
      if (!image.file) {
        uploaded.push({
          fileType: image.name,
          label: image.label,
          token: image.id,
          url: image.url
        });
        continue;
      }

      const formData = new FormData();
      formData.append("file", image.file, image.file.name);
      const response = await fetch("/api/model3d/upload", {
        body: formData,
        method: "POST"
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.message || `${image.name} 上传失败。`);
      }

      uploaded.push({
        fileType: result?.file?.fileType || image.file.type || image.name,
        label: image.label,
        objectKey: result?.file?.objectKey || null,
        storageUrl: result?.file?.storageUrl || result?.file?.url || image.url,
        token: result?.file?.token || image.id,
        tripoToken: Boolean(result?.file?.token),
        url: result?.file?.url || image.url
      });
    }
    return uploaded;
  }

  function buildModel3DCreateRequest(feature: Model3DApiFeature, imageRefs: Array<{ fileType?: string; label?: string; objectKey?: string | null; storageUrl?: string; token: string; tripoToken?: boolean; url?: string }>, clientRequestId?: string, options?: { animation?: { motionId?: string; rigModel?: string } }) {
    const sourceTaskId = getActiveTripoSourceTaskId();
    const activeTopology = generationProfile === "smart-mesh" ? smartMeshTopology : highPrecisionTopology;
    const activeFaceCount = generationProfile === "smart-mesh" ? smartMeshFaceCount : highPrecisionFaceCount;
    return {
      feature,
      clientRequestId,
      sourceModelUrl: activeTask?.modelUrl || modelUrl || undefined,
      sourceTaskId,
      prompt: prompt.trim(),
      mode,
      model,
      imageRefs,
      generateParts: generatePartsEnabled,
      imageAutoOptimize: imageAutoOptimizeEnabled,
      modelProfile: generationProfile,
      quality,
      topology: feature === "retopo" ? retopoTopology : activeTopology,
      faceCount: feature === "retopo" ? (retopoFaceCount <= 0 ? "auto" : retopoFaceCount) : activeFaceCount,
      texture: {
        enabled: textureEnabled,
        inputMode: textureInputMode,
        quality: textureQuality
      },
      pbr: {
        enabled: pbrEnabled
      },
      animation: options?.animation
    };
  }

  function getActiveTripoSourceTaskId() {
    if (!activeTask?.providerTaskId || activeTask.status !== "succeeded") return undefined;
    return activeTask.providerTaskId;
  }

  function handleSelectTask(task: Model3DTask) {
    setActiveTask(task);
    setSceneHierarchy(null);
    setSceneSelection(null);
    setSceneStats({ faces: 0, triangles: 0, vertices: 0 });
    setHiddenSceneNodeIds([]);
    setIsolatedSceneNodeId(null);
    setSceneSelectionRequest(null);
    setSceneTransformRequest(null);
    setPrompt(task.prompt);
    setMode(task.mode);
    setModel(task.model);
    setGenerationProfile("high-precision");
    setQuality(task.textureQuality === "hd" ? "high" : task.quality);
    setImageAutoOptimizeEnabled(Boolean(task.imageAutoOptimizeEnabled));
    setSmartMeshEnabled(Boolean(task.smartMeshEnabled));
    setHighPrecisionTopology(task.highPrecisionTopology || task.topology || "triangle");
    setHighPrecisionFaceCount(task.highPrecisionFaceCount || "auto");
    setSmartMeshTopology(task.smartMeshTopology || "triangle");
    setSmartMeshFaceCount(task.smartMeshFaceCount || task.faceCount || MODEL3D_DEFAULT_FACE_COUNT);
    setRetopoEnabled(Boolean(task.retopoEnabled));
    setRetopoTopology(task.retopoTopology || "triangle");
    setRetopoFaceCount(task.retopoFaceCount || MODEL3D_DEFAULT_RETOPO_FACE_COUNT);
    setTextureEnabled(task.textureEnabled);
    setTextureQuality(task.textureQuality || "standard");
    setPbrEnabled(Boolean(task.pbrEnabled));
    setGeneratePartsEnabled(Boolean(task.generatePartsEnabled));
    setInputImages(
      (task.inputImages || (task.inputImageUrl ? [{ url: task.inputImageUrl, name: "参考图" }] : [])).map((item, index) => ({
        id: `${task.id}-${index}`,
        url: item.url,
        name: item.name,
        size: 0,
        label: item.label
      }))
    );
    setModelUrl(task.modelUrl || null);
    setPreviewModelUrl(task.previewModelUrl || task.modelUrl || null);
    setModelFileName(task.title);
  }

  async function handleDeleteTask(task: Model3DTask) {
    if (!task.id.startsWith("local-model-") && !task.id.startsWith("model3d-asset-")) {
      try {
        const response = await fetch(`/api/model3d/history/${encodeURIComponent(task.id)}`, { method: "DELETE" });
        const result = await response.json().catch(() => null);
        if (!response.ok) throw new Error(result?.message || "3D 资产删除失败。");
      } catch (error) {
        toast({ type: "error", message: error instanceof Error ? error.message : "3D 资产删除失败。" });
        return;
      }
    }
    setTasks((current) => current.filter((item) => item.id !== task.id));
    if (activeTask?.id === task.id) {
      const nextTask = tasks.find((item) => item.id !== task.id) || null;
      setActiveTask(nextTask);
      setModelUrl(nextTask?.modelUrl || null);
      setPreviewModelUrl(nextTask?.previewModelUrl || nextTask?.modelUrl || null);
      setSceneHierarchy(null);
      setSceneSelection(null);
      setSceneStats({ faces: 0, triangles: 0, vertices: 0 });
      setHiddenSceneNodeIds([]);
      setIsolatedSceneNodeId(null);
      setSceneSelectionRequest(null);
      setSceneTransformRequest(null);
    }
    toast({ type: "success", message: "已删除 3D 工作区记录。" });
  }

  function handleDownload(task = activeTask) {
    const url = task?.modelUrl || modelUrl;
    if (!url) {
      toast({ type: "error", message: "暂无可下载的 3D 模型文件。" });
      return;
    }
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${task?.title || modelFileName || "nexus-3d-model"}.glb`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  async function handleExportRequest(request: Model3DExportRequest) {
    const apiFeatureMeta = getModel3DApiFeatureMeta("export-model");
    const sourceTaskId = getActiveTripoSourceTaskId();
    if (!sourceTaskId) {
      toast({ type: "error", message: `${apiFeatureMeta.label}需要先有 Tripo 模型任务，当前先按本地 GLB 下载处理。` });
      handleDownload();
      return;
    }

    try {
      const response = await fetch("/api/model3d", {
        body: JSON.stringify({
          ...request,
          feature: "export-model",
          sourceTaskId
        }),
        headers: {
          "content-type": "application/json"
        },
        method: "POST"
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.message || `${apiFeatureMeta.label}接口暂不可用。`);
      const queuedTaskId = result?.taskId || result?.task?.task_id || result?.task?.taskId;
      if (!queuedTaskId) throw new Error("导出任务未返回 task_id。");
      toast({ type: "success", message: "导出任务已提交，正在等待 Tripo 返回文件。" });
      const exportUrl = await waitForModel3DExportUrl(String(queuedTaskId));
      downloadRemoteFile(exportUrl, request.fileName, request.format.toLowerCase());
    } catch (error) {
      const message = error instanceof Error ? error.message : `${apiFeatureMeta.label}接口暂不可用。`;
      toast({ type: "error", message });
    }
  }

  async function waitForModel3DExportUrl(taskId: string) {
    const maxAttempts = 60;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      await sleep(3000);
      const response = await fetch(`/api/model3d/tasks/${encodeURIComponent(taskId)}`);
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.message || "导出任务查询失败。");

      const normalized = result?.normalized;
      if (normalized?.status === "failed") throw new Error(normalized.errorMessage || "导出任务失败。");
      if (normalized?.exportUrl) return String(normalized.exportUrl);
      if (normalized?.modelUrl) return String(normalized.modelUrl);
    }
    throw new Error("导出任务等待超时，请稍后在资产记录中重试。");
  }

  function downloadRemoteFile(url: string, fileName: string, extension: string) {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${fileName || "nexus-3d-export"}.${extension}`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  function handleSceneNodeSelect(nodeId: string) {
    setSceneSelectionRequest(`${nodeId}:${Date.now()}`);
  }

  function handleSceneNodeVisibilityToggle(nodeId: string) {
    setHiddenSceneNodeIds((current) => (current.includes(nodeId) ? current.filter((id) => id !== nodeId) : [...current, nodeId]));
  }

  function handleSceneNodeIsolate(nodeId: string) {
    setIsolatedSceneNodeId((current) => (current === nodeId ? null : nodeId));
  }

  function handleSceneTransformChange(nodeId: string, transform: Model3DSceneTransform) {
    latestTransformRef.current = { nodeId, transform };
    setSceneTransformRequest({ nodeId, requestId: Date.now(), transform });
    setSceneSelection((current) => (current?.id === nodeId ? { ...current, transform } : current));
  }

  function handleSceneTransformCommit(selection: Model3DSceneSelection) {
    latestTransformRef.current = { nodeId: selection.id, transform: selection.transform };
    setSceneSelection(selection);
    if (!activeTask) return;
    const operationTime = nowTime();
    const nodeName = selection.id === "scene-root" ? undefined : selection.name;
    const operation = makeOperationRecord("transform", nodeName ? `调整 ${nodeName}` : "变换修改", operationTime, selection.id, nodeName, selection.transform);
    const updatedTask: Model3DTask = {
      ...activeTask,
      operations: [operation, ...(activeTask.operations || [])],
      updatedAt: operationTime
    };
    setActiveTask(updatedTask);
    setTasks((current) => current.map((task) => (task.id === activeTask.id ? updatedTask : task)));
  }

  function handleSaveOperationAsAsset(task: Model3DTask, operationTitle: string) {
    const clonedTask: Model3DTask = {
      ...task,
      id: `model3d-asset-${Date.now()}`,
      title: makeTitle(`${task.title}-${operationTitle}`),
      operations: [makeOperationRecord("model", `另存：${operationTitle}`, nowTime(), "scene-root"), ...(task.operations || [])],
      createdAt: nowTime(),
      updatedAt: nowTime()
    };
    setTasks((current) => [clonedTask, ...current]);
    handleSelectTask(clonedTask);
    toast({ type: "success", message: "已另存为新的 3D 资产。" });
  }

  function handleOperationSelect(task: Model3DTask, operation: Model3DOperationRecord) {
    handleSelectTask(task);
    if (operation.nodeId) {
      setSceneSelectionRequest(`${operation.nodeId}:${Date.now()}`);
      setSceneTransformRequest({ nodeId: operation.nodeId, requestId: Date.now(), reset: !operation.transform, transform: operation.transform });
    }
  }

  return (
    <div
      className="model3d-workspace -m-4 flex min-h-0 w-[calc(100%+2rem)] min-w-0 flex-col gap-3 bg-[var(--color-bg)] p-3 md:-m-8 md:w-[calc(100%+4rem)] md:p-3 xl:h-[calc(100vh-64px)] xl:min-h-[720px] xl:overflow-hidden xl:flex-row"
      data-left-collapsed={leftPanelCollapsed ? "true" : "false"}
    >
      <input
        ref={modelInputRef}
        type="file"
        className="hidden"
        accept=".glb,.gltf,.fbx,.obj,model/gltf-binary,model/gltf+json,application/octet-stream"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) handleModelFileChange(file);
          event.currentTarget.value = "";
        }}
      />
      <div className="model3d-left-panel relative min-h-0 w-full overflow-y-auto xl:w-[292px] xl:shrink-0 2xl:w-[300px]">
        <button
          type="button"
          onClick={() => {
            setLeftPanelCollapsed((value) => !value);
            setLeftPanelManuallyToggled(true);
          }}
          className="model3d-left-collapse-button absolute right-2 top-2 z-30 grid h-8 w-8 place-items-center rounded-full border border-[color:var(--color-border)] bg-[var(--color-panel)] text-[var(--color-text-muted)] shadow-soft transition hover:border-blue-300 hover:text-blue-400"
          title={leftPanelCollapsed ? "展开左侧工作区" : "折叠左侧工作区"}
          aria-label={leftPanelCollapsed ? "展开左侧工作区" : "折叠左侧工作区"}
        >
          {leftPanelCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
        <CollapsedModel3DPanel mode={mode} activeModelResourceName={modelUrl ? modelFileName || activeTask?.title || null : null} />
        <Model3DParameterPanel
          prompt={prompt}
          mode={mode}
          model={model}
          generationProfile={generationProfile}
          quality={quality}
          imageAutoOptimizeEnabled={imageAutoOptimizeEnabled}
          smartMeshEnabled={smartMeshEnabled}
          highPrecisionTopology={highPrecisionTopology}
          highPrecisionFaceCount={highPrecisionFaceCount}
          smartMeshTopology={smartMeshTopology}
          smartMeshFaceCount={smartMeshFaceCount}
          retopoEnabled={retopoEnabled}
          retopoTopology={retopoTopology}
          retopoFaceCount={retopoFaceCount}
          textureEnabled={textureEnabled}
          textureInputMode={textureInputMode}
          textureQuality={textureQuality}
          pbrEnabled={pbrEnabled}
          generatePartsEnabled={generatePartsEnabled}
          inputImages={inputImages}
          activeModelResourceName={modelUrl ? modelFileName || activeTask?.title || "当前预览模型" : null}
          submitting={submitting}
          onPromptChange={setPrompt}
          onModeChange={handleModeChange}
          onModelChange={setModel}
          onGenerationProfileChange={handleGenerationProfileChange}
          onQualityChange={setQuality}
          onImageAutoOptimizeChange={setImageAutoOptimizeEnabled}
          onSmartMeshChange={handleSmartMeshChange}
          onHighPrecisionTopologyChange={setHighPrecisionTopology}
          onHighPrecisionFaceCountChange={setHighPrecisionFaceCount}
          onSmartMeshTopologyChange={setSmartMeshTopology}
          onSmartMeshFaceCountChange={setSmartMeshFaceCount}
          onRetopoChange={handleRetopoChange}
          onRetopoTopologyChange={setRetopoTopology}
          onRetopoFaceCountChange={setRetopoFaceCount}
          onTextureChange={setTextureEnabled}
          onTextureQualityChange={handleTextureQualityChange}
          onTextureInputModeChange={setTextureInputMode}
          onPbrChange={setPbrEnabled}
          onGeneratePartsChange={setGeneratePartsEnabled}
          onImageChange={handleImageChange}
          onImageRemove={handleImageRemove}
          onGenerate={handleGenerate}
        />
      </div>

      <Model3DViewer
        modelUrl={previewModelUrl || modelUrl}
        fallbackModelUrl={previewModelUrl && modelUrl && previewModelUrl !== modelUrl ? modelUrl : null}
        modelFileName={modelFileName}
        title={activeTask?.title || "3D工作区"}
        status={activeTask?.status || "idle"}
        hiddenNodeIds={hiddenSceneNodeIds}
        isolatedNodeId={isolatedSceneNodeId}
        stats={sceneStats}
        selectionRequest={sceneSelectionRequest}
        transformRequest={sceneTransformRequest}
        onModelFileChange={handleModelFileChange}
        onSceneHierarchyChange={setSceneHierarchy}
        onSceneSelectionChange={setSceneSelection}
        onSceneStatsChange={setSceneStats}
        onSceneTransformCommit={handleSceneTransformCommit}
        onDownload={() => handleDownload()}
        onExport={handleExportRequest}
      />

      <div className="model3d-right-panel hidden min-h-0 w-full xl:block xl:w-[300px] xl:shrink-0">
        <Model3DHistoryPanel
          tasks={tasks}
          activeTaskId={activeTask?.id || null}
          sceneHierarchy={sceneHierarchy}
          sceneSelection={sceneSelection}
          hiddenNodeIds={hiddenSceneNodeIds}
          isolatedNodeId={isolatedSceneNodeId}
          onSelect={handleSelectTask}
          onSceneNodeSelect={handleSceneNodeSelect}
          onSceneNodeVisibilityToggle={handleSceneNodeVisibilityToggle}
          onSceneNodeIsolate={handleSceneNodeIsolate}
          onSceneTransformChange={handleSceneTransformChange}
          onOperationSelect={handleOperationSelect}
          onSaveOperationAsAsset={handleSaveOperationAsAsset}
          onDelete={handleDeleteTask}
          onDownload={handleDownload}
          onUploadModel={() => modelInputRef.current?.click()}
        />
      </div>
    </div>
  );
}

function CollapsedModel3DPanel({ activeModelResourceName, mode }: { activeModelResourceName?: string | null; mode: Model3DMode }) {
  const modeLabel =
    mode === "text-to-3d"
      ? "文本"
      : mode === "image-to-3d"
        ? "单图"
        : mode === "multi-view-to-3d"
          ? "多视图"
          : "批量";

  return (
    <aside className="model3d-collapsed-left-panel hidden h-full min-h-0 flex-col items-center gap-3 overflow-hidden rounded-xl border border-[color:var(--color-border)] bg-[var(--color-panel)] px-2 py-3 text-[var(--color-text)] shadow-soft">
      <div className="mt-10 grid gap-2 text-center">
        <span className="rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 px-2 py-1 text-[10px] font-black !text-white">{modeLabel}</span>
        <span className="model3d-vertical-label max-h-44 text-[11px] font-bold tracking-[0.08em] text-[var(--color-text-muted)]">3D 工作区</span>
      </div>
      <div className="mt-auto h-24 w-full rounded-full border border-[color:var(--color-border)] bg-[var(--color-soft)] p-1" title={activeModelResourceName || "暂无模型"}>
        <div className="h-full rounded-full bg-[radial-gradient(circle_at_50%_22%,rgba(59,130,246,0.38),transparent_58%),var(--color-panel)]" />
      </div>
    </aside>
  );
}

function nowTime() {
  return new Date().toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function makeTitle(text: string) {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > 18 ? `${compact.slice(0, 18)}...` : compact || "3D 模型";
}

function makeOperationRecord(kind: Model3DOperationRecord["kind"], title: string, createdAt: string, nodeId?: string, nodeName?: string, transform?: Model3DSceneTransform): Model3DOperationRecord {
  return {
    createdAt,
    id: `operation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    nodeId,
    nodeName,
    title,
    transform
  };
}

function getOperationKind(feature: Model3DApiFeature): Model3DOperationRecord["kind"] {
  if (feature === "part-split") return "structure";
  if (feature === "texture-edit" || feature === "texture-generate" || feature === "texture-upscale" || feature === "pbr-material") return "texture";
  return "model";
}
