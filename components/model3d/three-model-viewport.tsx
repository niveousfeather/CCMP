"use client";

import { useEffect, useRef, useState } from "react";
import { Move3D, Rotate3D, RotateCcw, Scaling } from "lucide-react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";

import { Model3DSceneNode, Model3DSceneSelection, Model3DSceneStats, Model3DSceneTransformRequest } from "@/components/model3d/model3d-data";
import { cn } from "@/lib/utils";

type EnvironmentPreset = "studio" | "desert" | "forest" | "indoor" | "night" | "coast";
type MaterialMode = "clay" | "texture" | "display" | "unlit" | "normal" | "toon" | "sketch" | "hologram";
type DisplayShading = "flat" | "smooth";
type TransformMode = "translate" | "rotate" | "scale";

type ThreeModelViewportProps = {
  displayShading: DisplayShading;
  environment: EnvironmentPreset;
  environmentRotation: number;
  exposure: number;
  gridVisible: boolean;
  fallbackModelUrl?: string | null;
  hiddenNodeIds: string[];
  isolatedNodeId: string | null;
  materialMode: MaterialMode;
  modelFileName?: string | null;
  modelUrl: string | null;
  selectionRequest: string | null;
  transformRequest: (Model3DSceneTransformRequest & { requestId: number }) | null;
  onError: () => void;
  onLoad: () => void;
  onSceneHierarchyChange: (hierarchy: Model3DSceneNode | null) => void;
  onSceneSelectionChange: (selection: Model3DSceneSelection | null) => void;
  onSceneStatsChange: (stats: Model3DSceneStats) => void;
  onSceneTransformCommit: (selection: Model3DSceneSelection) => void;
  onViewRotationChange: (rotation: { x: number; y: number }) => void;
  resetSignal: number;
};

type StoredMeshMaterial = {
  flatShading?: boolean;
  material: THREE.Material | THREE.Material[];
};

type HologramUniforms = {
  uBeamCoreWidth: THREE.IUniform<number>;
  uBeamHaloWidth: THREE.IUniform<number>;
  uMaxY: THREE.IUniform<number>;
  uMinY: THREE.IUniform<number>;
  uScanY: THREE.IUniform<number>;
  uTime: THREE.IUniform<number>;
};

type HologramMaterial = THREE.ShaderMaterial & {
  userData: {
    hologramUniforms?: HologramUniforms;
  };
};

type MutableRef<T> = {
  current: T;
};

type TransformSnapshot = {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
};

type CameraFocusTween = {
  duration: number;
  elapsed: number;
  fromPosition: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toPosition: THREE.Vector3;
  toTarget: THREE.Vector3;
};

const RENDER_HELPER_KEY = "__nexusViewportRenderHelper";
const REUSES_PARENT_GEOMETRY_KEY = "__nexusViewportReusesParentGeometry";
const SCENE_NODE_ID_KEY = "__nexusSceneNodeId";

const environmentLighting: Record<EnvironmentPreset, { ambient: number; key: number; keyColor: number; rim: number; rimColor: number }> = {
  studio: { ambient: 0.78, key: 2.6, keyColor: 0xffffff, rim: 1.2, rimColor: 0xbfe7ff },
  desert: { ambient: 0.92, key: 3.1, keyColor: 0xffe0ae, rim: 0.8, rimColor: 0xfff3d1 },
  forest: { ambient: 0.64, key: 2.25, keyColor: 0xe3ffd1, rim: 1.35, rimColor: 0x9edfff },
  indoor: { ambient: 0.7, key: 2.05, keyColor: 0xfff1d6, rim: 0.7, rimColor: 0xd8e7ff },
  night: { ambient: 0.38, key: 1.35, keyColor: 0xb5c7ff, rim: 1.65, rimColor: 0x75e7ff },
  coast: { ambient: 0.86, key: 2.75, keyColor: 0xe3fbff, rim: 1.1, rimColor: 0xffe1bc }
};

export function ThreeModelViewport({ displayShading, environment, environmentRotation, exposure, gridVisible, fallbackModelUrl, hiddenNodeIds, isolatedNodeId, materialMode, modelFileName, modelUrl, selectionRequest, transformRequest, onError, onLoad, onSceneHierarchyChange, onSceneSelectionChange, onSceneStatsChange, onSceneTransformCommit, onViewRotationChange, resetSignal }: ThreeModelViewportProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const cameraFocusTweenRef = useRef<CameraFocusTween | null>(null);
  const displayShadingRef = useRef(displayShading);
  const environmentRef = useRef(environment);
  const environmentRotationRef = useRef(environmentRotation);
  const exposureRef = useRef(exposure);
  const gridVisibleRef = useRef(gridVisible);
  const hiddenNodeIdsRef = useRef(hiddenNodeIds);
  const isolatedNodeIdRef = useRef(isolatedNodeId);
  const materialModeRef = useRef(materialMode);
  const onViewRotationChangeRef = useRef(onViewRotationChange);
  const modelRef = useRef<THREE.Object3D | null>(null);
  const sceneNodeMapRef = useRef(new Map<string, THREE.Object3D>());
  const originalMaterialsRef = useRef(new Map<THREE.Mesh, StoredMeshMaterial>());
  const selectedObjectRef = useRef<THREE.Object3D | null>(null);
  const selectionBoxRef = useRef<THREE.BoxHelper | null>(null);
  const transformControlsRef = useRef<TransformControls | null>(null);
  const transformModeRef = useRef<TransformMode>("translate");
  const initialTransformsRef = useRef(new Map<THREE.Object3D, TransformSnapshot>());
  const onSceneHierarchyChangeRef = useRef(onSceneHierarchyChange);
  const onSceneSelectionChangeRef = useRef(onSceneSelectionChange);
  const onSceneStatsChangeRef = useRef(onSceneStatsChange);
  const onSceneTransformCommitRef = useRef(onSceneTransformCommit);
  const [selectedObjectName, setSelectedObjectName] = useState<string | null>(null);
  const [transformMode, setTransformMode] = useState<TransformMode>("translate");

  useEffect(() => {
    displayShadingRef.current = displayShading;
    if (modelRef.current) {
      applyModelRenderMode(modelRef.current, originalMaterialsRef.current, materialModeRef.current, displayShadingRef.current);
    }
  }, [displayShading]);

  useEffect(() => {
    environmentRef.current = environment;
  }, [environment]);

  useEffect(() => {
    environmentRotationRef.current = environmentRotation;
  }, [environmentRotation]);

  useEffect(() => {
    exposureRef.current = exposure;
  }, [exposure]);

  useEffect(() => {
    gridVisibleRef.current = gridVisible;
  }, [gridVisible]);

  useEffect(() => {
    hiddenNodeIdsRef.current = hiddenNodeIds;
    applySceneVisibility(sceneNodeMapRef.current, hiddenNodeIdsRef.current, isolatedNodeIdRef.current);
    const selectedObject = selectedObjectRef.current;
    if (selectedObject && !selectedObject.visible) {
      const transformControls = transformControlsRef.current;
      const scene = selectionBoxRef.current?.parent;
      if (transformControls && scene instanceof THREE.Scene) {
        selectViewportObject(null, transformControls, scene, selectionBoxRef, selectedObjectRef, setSelectedObjectName, onSceneSelectionChangeRef.current);
      }
    }
  }, [hiddenNodeIds]);

  useEffect(() => {
    isolatedNodeIdRef.current = isolatedNodeId;
    applySceneVisibility(sceneNodeMapRef.current, hiddenNodeIdsRef.current, isolatedNodeIdRef.current);
  }, [isolatedNodeId]);

  useEffect(() => {
    materialModeRef.current = materialMode;
    if (modelRef.current) {
      applyModelRenderMode(modelRef.current, originalMaterialsRef.current, materialModeRef.current, displayShadingRef.current);
    }
  }, [materialMode]);

  useEffect(() => {
    onViewRotationChangeRef.current = onViewRotationChange;
  }, [onViewRotationChange]);

  useEffect(() => {
    onSceneHierarchyChangeRef.current = onSceneHierarchyChange;
  }, [onSceneHierarchyChange]);

  useEffect(() => {
    onSceneSelectionChangeRef.current = onSceneSelectionChange;
  }, [onSceneSelectionChange]);

  useEffect(() => {
    onSceneStatsChangeRef.current = onSceneStatsChange;
  }, [onSceneStatsChange]);

  useEffect(() => {
    onSceneTransformCommitRef.current = onSceneTransformCommit;
  }, [onSceneTransformCommit]);

  useEffect(() => {
    transformModeRef.current = transformMode;
    transformControlsRef.current?.setMode(transformMode);
  }, [transformMode]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      const selectedObject = selectedObjectRef.current;
      if (!selectedObject) return;
      if (event.key.toLowerCase() === "w") {
        event.preventDefault();
        handleTransformModeChange("translate");
      }
      if (event.key.toLowerCase() === "e") {
        event.preventDefault();
        handleTransformModeChange("rotate");
      }
      if (event.key.toLowerCase() === "r") {
        event.preventDefault();
        handleTransformModeChange("scale");
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (!selectionRequest) return;
    const nodeId = selectionRequest.split(":")[0];
    const transformControls = transformControlsRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const scene = selectionBoxRef.current?.parent || modelRef.current?.parent;
    const object = sceneNodeMapRef.current.get(nodeId) || null;
    if (!transformControls || !(scene instanceof THREE.Scene)) return;
    selectViewportObject(object, transformControls, scene, selectionBoxRef, selectedObjectRef, setSelectedObjectName, onSceneSelectionChangeRef.current);
    if (object && camera && controls && getSceneNodeType(object) !== "model") {
      focusCameraToObject(camera, controls, object, cameraFocusTweenRef, 1.35);
    }
  }, [selectionRequest]);

  useEffect(() => {
    if (!transformRequest) return;
    const object = sceneNodeMapRef.current.get(transformRequest.nodeId);
    if (!object) return;
    if (transformRequest.reset) {
      restoreInitialTransform(object, initialTransformsRef.current);
    } else if (transformRequest.transform) {
      applySceneTransform(object, transformRequest.transform);
    }
    selectionBoxRef.current?.update();
    onSceneSelectionChangeRef.current(buildSceneSelection(object));
  }, [transformRequest]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const scene = new THREE.Scene();
    scene.background = null;
    scene.fog = new THREE.Fog(0x5f5f5f, 9, 34);

    const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
    camera.position.set(4.5, 3.2, 5.8);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = exposure;
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.cursor = "grab";
    renderer.domElement.style.touchAction = "none";
    host.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = true;
    controls.screenSpacePanning = true;
    controls.minDistance = 0.6;
    controls.maxDistance = 80;
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: THREE.MOUSE.PAN
    };
    controls.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN
    };
    controls.target.set(0, 0.7, 0);
    controlsRef.current = controls;

    const preventCanvasContextMenu = (event: MouseEvent) => event.preventDefault();
    const setGrabbingCursor = () => {
      renderer.domElement.style.cursor = "grabbing";
    };
    const setGrabCursor = () => {
      renderer.domElement.style.cursor = "grab";
    };

    renderer.domElement.addEventListener("contextmenu", preventCanvasContextMenu);
    host.addEventListener("contextmenu", preventCanvasContextMenu);
    controls.addEventListener("start", setGrabbingCursor);
    controls.addEventListener("end", setGrabCursor);

    const transformControls = new TransformControls(camera, renderer.domElement);
    transformControls.enabled = false;
    transformControls.setMode("translate");
    transformControls.setSize(0.82);
    transformControls.addEventListener("dragging-changed", (event) => {
      controls.enabled = !Boolean(event.value);
      renderer.domElement.style.cursor = event.value ? "grabbing" : "grab";
      if (!event.value && selectedObjectRef.current) {
        onSceneTransformCommitRef.current(buildSceneSelection(selectedObjectRef.current));
      }
    });
    transformControls.addEventListener("objectChange", () => {
      const selectedObject = selectedObjectRef.current;
      if (!selectedObject) return;
      selectionBoxRef.current?.update();
      onSceneSelectionChangeRef.current(buildSceneSelection(selectedObject));
    });
    scene.add(transformControls.getHelper());
    transformControlsRef.current = transformControls;

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerDownPosition: { x: number; y: number } | null = null;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.78);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.6);
    keyLight.position.set(4.5, 7, 4);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xbfe7ff, 1.2);
    rimLight.position.set(-5, 4, -4);
    scene.add(rimLight);

    const worldGrid = createWorldOriginGrid();
    scene.add(worldGrid);

    let mounted = true;
    let animationFrame = 0;
    if (!modelUrl) {
      onSceneHierarchyChangeRef.current(null);
      onSceneStatsChangeRef.current({ faces: 0, triangles: 0, vertices: 0 });
      onSceneSelectionChangeRef.current(null);
    }

    if (modelUrl) {
      loadModelByFormat(
        modelUrl,
        modelFileName,
        (loadedModel) => {
          if (!mounted) return;
          const model = loadedModel;
          normalizeModel(model);
          registerSceneHierarchy(model, sceneNodeMapRef.current);
          prepareModelMeshes(model, originalMaterialsRef.current);
          applyModelRenderMode(model, originalMaterialsRef.current, materialModeRef.current, displayShadingRef.current);
          scene.add(model);
          modelRef.current = model;
          captureInitialTransforms(model, initialTransformsRef.current);
          onSceneHierarchyChangeRef.current(buildSceneHierarchy(model));
          onSceneStatsChangeRef.current(calculateSceneStats(model));
          applySceneVisibility(sceneNodeMapRef.current, hiddenNodeIdsRef.current, isolatedNodeIdRef.current);
          selectViewportObject(model, transformControls, scene, selectionBoxRef, selectedObjectRef, setSelectedObjectName, onSceneSelectionChangeRef.current);
          fitCameraToObject(camera, controls, model);
          onLoad();
        },
        undefined,
        () => {
          if (mounted && fallbackModelUrl) {
            loadModelByFormat(
              fallbackModelUrl,
              modelFileName,
              (fallbackModel) => {
                if (!mounted) return;
                normalizeModel(fallbackModel);
                registerSceneHierarchy(fallbackModel, sceneNodeMapRef.current);
                prepareModelMeshes(fallbackModel, originalMaterialsRef.current);
                applyModelRenderMode(fallbackModel, originalMaterialsRef.current, materialModeRef.current, displayShadingRef.current);
                scene.add(fallbackModel);
                modelRef.current = fallbackModel;
                captureInitialTransforms(fallbackModel, initialTransformsRef.current);
                onSceneHierarchyChangeRef.current(buildSceneHierarchy(fallbackModel));
                onSceneStatsChangeRef.current(calculateSceneStats(fallbackModel));
                applySceneVisibility(sceneNodeMapRef.current, hiddenNodeIdsRef.current, isolatedNodeIdRef.current);
                selectViewportObject(fallbackModel, transformControls, scene, selectionBoxRef, selectedObjectRef, setSelectedObjectName, onSceneSelectionChangeRef.current);
                fitCameraToObject(camera, controls, fallbackModel);
                onLoad();
              },
              undefined,
              () => {
                if (mounted) onError();
              }
            );
            return;
          }
          if (mounted) onError();
        }
      );
    }

    function resize() {
      if (!hostRef.current) return;
      const width = Math.max(1, hostRef.current.clientWidth);
      const height = Math.max(1, hostRef.current.clientHeight);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    }

    function updatePointer(event: PointerEvent) {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    }

    function handlePointerDown(event: PointerEvent) {
      if (event.button !== 0) return;
      pointerDownPosition = { x: event.clientX, y: event.clientY };
    }

    function handlePointerUp(event: PointerEvent) {
      if (event.button !== 0 || !pointerDownPosition) return;
      const movedDistance = Math.hypot(event.clientX - pointerDownPosition.x, event.clientY - pointerDownPosition.y);
      pointerDownPosition = null;
      if (transformControls.dragging) return;
      if (movedDistance > 4) return;
      updatePointer(event);
      const selectable = modelRef.current;
      if (!selectable || !selectable.visible) {
        selectViewportObject(null, transformControls, scene, selectionBoxRef, selectedObjectRef, setSelectedObjectName, onSceneSelectionChangeRef.current);
        return;
      }
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObject(selectable, true).filter((hit) => !isRenderHelper(hit.object));
      selectViewportObject(hits.length ? selectable : null, transformControls, scene, selectionBoxRef, selectedObjectRef, setSelectedObjectName, onSceneSelectionChangeRef.current);
    }

    renderer.domElement.addEventListener("pointerdown", handlePointerDown);
    renderer.domElement.addEventListener("pointerup", handlePointerUp);

    let lastFrameTime = performance.now();

    function animate() {
      animationFrame = window.requestAnimationFrame(animate);
      const frameTime = performance.now();
      const deltaSeconds = Math.min(0.08, (frameTime - lastFrameTime) / 1000);
      lastFrameTime = frameTime;
      worldGrid.visible = gridVisibleRef.current;
      renderer.toneMappingExposure = exposureRef.current;
      updateEnvironmentLights(ambientLight, keyLight, rimLight, environmentRef.current, environmentRotationRef.current, exposureRef.current, materialModeRef.current);
      updateHologramScan(scene, performance.now() * 0.001);
      selectionBoxRef.current?.update();
      updateCameraFocusTween(camera, controls, cameraFocusTweenRef, deltaSeconds);
      controls.update();
      onViewRotationChangeRef.current(getCameraRotation(camera, controls));
      renderer.render(scene, camera);
    }

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    resize();
    animate();

    return () => {
      mounted = false;
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      host.removeEventListener("contextmenu", preventCanvasContextMenu);
      renderer.domElement.removeEventListener("contextmenu", preventCanvasContextMenu);
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      renderer.domElement.removeEventListener("pointerup", handlePointerUp);
      controls.removeEventListener("start", setGrabbingCursor);
      controls.removeEventListener("end", setGrabCursor);
      clearSelectionBox(scene, selectionBoxRef);
      transformControls.detach();
      transformControls.dispose();
      controls.dispose();
      renderer.dispose();
      disposeObject(scene);
      host.removeChild(renderer.domElement);
      controlsRef.current = null;
      cameraRef.current = null;
      cameraFocusTweenRef.current = null;
      modelRef.current = null;
      selectedObjectRef.current = null;
      selectionBoxRef.current = null;
      transformControlsRef.current = null;
      sceneNodeMapRef.current.clear();
      originalMaterialsRef.current.clear();
      initialTransformsRef.current.clear();
      onSceneHierarchyChangeRef.current(null);
      onSceneSelectionChangeRef.current(null);
      onSceneStatsChangeRef.current({ faces: 0, triangles: 0, vertices: 0 });
      setSelectedObjectName(null);
    };
  }, [fallbackModelUrl, modelFileName, modelUrl]);

  useEffect(() => {
    cameraRef.current?.updateProjectionMatrix();
  }, [exposure, gridVisible]);

  useEffect(() => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const model = modelRef.current;
    if (!camera || !controls) return;
    if (model) {
      fitCameraToObject(camera, controls, model);
      return;
    }
    camera.position.set(4.5, 3.2, 5.8);
    controls.target.set(0, 0.7, 0);
    controls.update();
  }, [resetSignal]);

  function handleTransformModeChange(mode: TransformMode) {
    transformModeRef.current = mode;
    transformControlsRef.current?.setMode(mode);
    setTransformMode(mode);
  }

  function resetSelectedTransform() {
    const selectedObject = selectedObjectRef.current;
    if (!selectedObject) return;
    restoreInitialTransform(selectedObject, initialTransformsRef.current);
    transformControlsRef.current?.attach(selectedObject);
    selectionBoxRef.current?.update();
  }

  function clearSelectionFromToolbar() {
    const transformControls = transformControlsRef.current;
    const scene = selectionBoxRef.current?.parent;
    if (!transformControls || !(scene instanceof THREE.Scene)) return;
    selectViewportObject(null, transformControls, scene, selectionBoxRef, selectedObjectRef, setSelectedObjectName, onSceneSelectionChangeRef.current);
  }

  return (
    <div className="absolute inset-0 h-full w-full">
      <div ref={hostRef} className="absolute inset-0 h-full w-full" />
      <ViewportTransformToolbar
        mode={transformMode}
        selectedName={selectedObjectName}
        onClearSelection={clearSelectionFromToolbar}
        onModeChange={handleTransformModeChange}
        onResetTransform={resetSelectedTransform}
      />
    </div>
  );
}

function createWorldOriginGrid() {
  const group = new THREE.Group();
  group.name = "world-origin-grid";

  const baseGrid = new THREE.GridHelper(48, 48, 0xd0d0d0, 0x9a9a9a);
  const majorGrid = new THREE.GridHelper(48, 12, 0xf4f4f4, 0xbdbdbd);

  baseGrid.material.opacity = 0.34;
  majorGrid.material.opacity = 0.46;

  [baseGrid, majorGrid].forEach((grid) => {
    grid.material.transparent = true;
    grid.position.y = 0;
    group.add(grid);
  });

  group.add(createAxisLine(new THREE.Vector3(-24, 0.002, 0), new THREE.Vector3(24, 0.002, 0), 0xffb1b1, 0.72));
  group.add(createAxisLine(new THREE.Vector3(0, 0.003, -24), new THREE.Vector3(0, 0.003, 24), 0x9edfff, 0.72));
  group.add(createAxisLine(new THREE.Vector3(0, 0.004, 0), new THREE.Vector3(0, 1.25, 0), 0xb7ff8f, 0.62));
  group.add(createOriginMarker());

  return group;
}

function selectViewportObject(
  object: THREE.Object3D | null,
  transformControls: TransformControls,
  scene: THREE.Scene,
  selectionBoxRef: MutableRef<THREE.BoxHelper | null>,
  selectedObjectRef: MutableRef<THREE.Object3D | null>,
  onSelectionNameChange: (name: string | null) => void,
  onSceneSelectionChange: (selection: Model3DSceneSelection | null) => void
) {
  const previous = selectedObjectRef.current;
  if (previous) {
    setSelectionHighlight(previous, false);
  }
  clearSelectionBox(scene, selectionBoxRef);

  if (!object) {
    transformControls.detach();
    transformControls.enabled = false;
    selectedObjectRef.current = null;
    onSelectionNameChange(null);
    onSceneSelectionChange(null);
    return;
  }

  const selectionType = getSceneNodeType(object);
  const selectionBox = new THREE.BoxHelper(object, selectionType === "model" ? 0x9defff : 0x5eead4);
  selectionBox.name = "viewport-selection-box";
  selectionBox.renderOrder = 90;
  const selectionMaterial = selectionBox.material as THREE.LineBasicMaterial;
  selectionMaterial.depthTest = false;
  selectionMaterial.opacity = selectionType === "model" ? 0.82 : 0.95;
  selectionMaterial.transparent = true;
  scene.add(selectionBox);
  selectionBoxRef.current = selectionBox;
  selectedObjectRef.current = object;
  transformControls.enabled = true;
  transformControls.attach(object);
  setSelectionHighlight(object, true);
  onSelectionNameChange(getSelectableObjectName(object));
  onSceneSelectionChange(buildSceneSelection(object));
}

function setSelectionHighlight(object: THREE.Object3D, selected: boolean) {
  const selectionType = getSceneNodeType(object);
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || isRenderHelper(child)) return;
    getMaterialList(child.material).forEach((material) => {
      const materialWithEmissive = material as THREE.Material & { emissive?: THREE.Color; emissiveIntensity?: number };
      if (!materialWithEmissive.emissive) return;
      materialWithEmissive.emissive.setHex(selected ? (selectionType === "model" ? 0x123f47 : 0x0f766e) : 0x000000);
      materialWithEmissive.emissiveIntensity = selected ? (selectionType === "model" ? 0.18 : 0.32) : 0;
      materialWithEmissive.needsUpdate = true;
    });
  });
}

function clearSelectionBox(scene: THREE.Scene, selectionBoxRef: MutableRef<THREE.BoxHelper | null>) {
  const selectionBox = selectionBoxRef.current;
  if (!selectionBox) return;
  scene.remove(selectionBox);
  selectionBox.geometry.dispose();
  getMaterialList(selectionBox.material).forEach((material) => material.dispose());
  selectionBoxRef.current = null;
}

function getSelectableObjectName(object: THREE.Object3D) {
  return object.name || "当前模型";
}

function loadModelByFormat(
  modelUrl: string,
  modelFileName: string | null | undefined,
  onLoad: (model: THREE.Object3D) => void,
  onProgress?: (event: ProgressEvent<EventTarget>) => void,
  onError?: (event: unknown) => void
) {
  const extension = getModelExtension(modelUrl, modelFileName);

  if (extension === "fbx") {
    new FBXLoader().load(
      modelUrl,
      (model) => {
        model.name ||= modelFileName?.replace(/\.[^.]+$/, "") || "FBX Model";
        ensureImportedModelMaterials(model);
        onLoad(model);
      },
      onProgress,
      onError
    );
    return;
  }

  if (extension === "obj") {
    new OBJLoader().load(
      modelUrl,
      (model) => {
        model.name ||= modelFileName?.replace(/\.[^.]+$/, "") || "OBJ Model";
        ensureImportedModelMaterials(model);
        onLoad(model);
      },
      onProgress,
      onError
    );
    return;
  }

  new GLTFLoader().load(modelUrl, (gltf) => onLoad(gltf.scene), onProgress, onError);
}

function getModelExtension(modelUrl: string, modelFileName?: string | null) {
  const fileNameExtension = pickSupportedModelExtension(modelFileName);
  if (fileNameExtension) return fileNameExtension;
  return pickSupportedModelExtension(getModelUrlPath(modelUrl)) || "glb";
}

function pickSupportedModelExtension(source?: string | null) {
  const extension = source?.split("?")[0].split("#")[0].split(".").pop()?.toLowerCase();
  return extension && ["fbx", "glb", "gltf", "obj"].includes(extension) ? extension : null;
}

function getModelUrlPath(modelUrl: string) {
  try {
    return new URL(modelUrl).pathname;
  } catch {
    return modelUrl;
  }
}

function ensureImportedModelMaterials(model: THREE.Object3D) {
  model.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || child.material) return;
    child.material = new THREE.MeshStandardMaterial({
      color: 0xd8d8d8,
      metalness: 0.08,
      roughness: 0.68
    });
  });
}

function registerSceneHierarchy(root: THREE.Object3D, sceneNodeMap: Map<string, THREE.Object3D>) {
  sceneNodeMap.clear();
  let nextIndex = 0;
  root.traverse((object) => {
    if (isRenderHelper(object)) return;
    const hasRenderableMesh = object instanceof THREE.Mesh || object.children.some((child) => containsRenderableMesh(child));
    if (!hasRenderableMesh) return;
    const id = object === root ? "scene-root" : `scene-node-${nextIndex++}`;
    object.userData[SCENE_NODE_ID_KEY] = id;
    sceneNodeMap.set(id, object);
  });
}

function buildSceneHierarchy(root: THREE.Object3D): Model3DSceneNode {
  return buildSceneNode(root) || {
    id: "scene-root",
    meshCount: 0,
    name: getSelectableObjectName(root),
    type: "model"
  };
}

function buildSceneNode(object: THREE.Object3D): Model3DSceneNode | null {
  if (isRenderHelper(object)) return null;
  const children = object.children.map((child) => buildSceneNode(child)).filter((node): node is Model3DSceneNode => Boolean(node));
  const meshCount = object instanceof THREE.Mesh ? 1 : children.reduce((sum, child) => sum + child.meshCount, 0);
  if (!meshCount && !children.length) return null;
  const id = object.userData[SCENE_NODE_ID_KEY] as string | undefined;
  return {
    children: children.length ? children : undefined,
    id: id || "scene-root",
    meshCount,
    name: getSelectableObjectName(object),
    type: getSceneNodeType(object)
  };
}

function buildSceneSelection(object: THREE.Object3D): Model3DSceneSelection {
  const rotation = new THREE.Euler().setFromQuaternion(object.quaternion);
  return {
    id: (object.userData[SCENE_NODE_ID_KEY] as string | undefined) || "scene-root",
    meshCount: countRenderableMeshes(object),
    name: getSelectableObjectName(object),
    transform: {
      position: [roundTransformValue(object.position.x), roundTransformValue(object.position.y), roundTransformValue(object.position.z)],
      rotation: [roundTransformValue(THREE.MathUtils.radToDeg(rotation.x)), roundTransformValue(THREE.MathUtils.radToDeg(rotation.y)), roundTransformValue(THREE.MathUtils.radToDeg(rotation.z))],
      scale: [roundTransformValue(object.scale.x), roundTransformValue(object.scale.y), roundTransformValue(object.scale.z)]
    },
    type: getSceneNodeType(object)
  };
}

function containsRenderableMesh(object: THREE.Object3D): boolean {
  if (object instanceof THREE.Mesh && !isRenderHelper(object)) return true;
  return object.children.some((child) => containsRenderableMesh(child));
}

function countRenderableMeshes(object: THREE.Object3D) {
  let count = 0;
  object.traverse((child) => {
    if (child instanceof THREE.Mesh && !isRenderHelper(child)) {
      count += 1;
    }
  });
  return count;
}

function calculateSceneStats(root: THREE.Object3D): Model3DSceneStats {
  const stats: Model3DSceneStats = { faces: 0, triangles: 0, vertices: 0 };
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || isRenderHelper(child)) return;
    const geometry = child.geometry;
    const position = geometry.getAttribute("position");
    const vertexCount = position?.count || 0;
    const triangleCount = geometry.index ? geometry.index.count / 3 : vertexCount / 3;
    stats.vertices += vertexCount;
    stats.triangles += Math.floor(triangleCount);
    stats.faces += Math.floor(triangleCount);
  });
  return stats;
}

function applySceneVisibility(sceneNodeMap: Map<string, THREE.Object3D>, hiddenNodeIds: string[], isolatedNodeId: string | null) {
  const hidden = new Set(hiddenNodeIds);
  sceneNodeMap.forEach((object, nodeId) => {
    const isolated = !isolatedNodeId || nodeId === isolatedNodeId || hasNodeAncestor(object, new Set([isolatedNodeId]));
    object.visible = isolated && !hidden.has(nodeId) && !hasNodeAncestor(object, hidden);
  });
}

function hasNodeAncestor(object: THREE.Object3D, nodeIds: Set<string>) {
  let parent = object.parent;
  while (parent) {
    const parentNodeId = parent.userData[SCENE_NODE_ID_KEY] as string | undefined;
    if (parentNodeId && nodeIds.has(parentNodeId)) return true;
    parent = parent.parent;
  }
  return false;
}

function getSceneNodeType(object: THREE.Object3D): Model3DSceneNode["type"] {
  if (object instanceof THREE.Mesh) return "mesh";
  if (object.parent?.type === "Scene") return "model";
  return "group";
}

function roundTransformValue(value: number) {
  return Number(value.toFixed(2));
}

function captureInitialTransform(object: THREE.Object3D, initialTransforms: Map<THREE.Object3D, TransformSnapshot>) {
  initialTransforms.set(object, {
    position: object.position.clone(),
    quaternion: object.quaternion.clone(),
    scale: object.scale.clone()
  });
}

function captureInitialTransforms(root: THREE.Object3D, initialTransforms: Map<THREE.Object3D, TransformSnapshot>) {
  root.traverse((object) => {
    if (object.userData[SCENE_NODE_ID_KEY]) {
      captureInitialTransform(object, initialTransforms);
    }
  });
}

function restoreInitialTransform(object: THREE.Object3D, initialTransforms: Map<THREE.Object3D, TransformSnapshot>) {
  const snapshot = initialTransforms.get(object);
  if (!snapshot) return;
  object.position.copy(snapshot.position);
  object.quaternion.copy(snapshot.quaternion);
  object.scale.copy(snapshot.scale);
  object.updateMatrixWorld(true);
}

function applySceneTransform(object: THREE.Object3D, transform: NonNullable<Model3DSceneTransformRequest["transform"]>) {
  object.position.set(transform.position[0], transform.position[1], transform.position[2]);
  object.rotation.set(THREE.MathUtils.degToRad(transform.rotation[0]), THREE.MathUtils.degToRad(transform.rotation[1]), THREE.MathUtils.degToRad(transform.rotation[2]));
  object.scale.set(Math.max(0.01, transform.scale[0]), Math.max(0.01, transform.scale[1]), Math.max(0.01, transform.scale[2]));
  object.updateMatrixWorld(true);
}

function ViewportTransformToolbar({
  mode,
  selectedName,
  onClearSelection,
  onModeChange,
  onResetTransform
}: {
  mode: TransformMode;
  selectedName: string | null;
  onClearSelection: () => void;
  onModeChange: (mode: TransformMode) => void;
  onResetTransform: () => void;
}) {
  const transformModes: Array<{ icon: typeof Move3D; label: string; value: TransformMode }> = [
    { icon: Move3D, label: "移动模型", value: "translate" },
    { icon: Rotate3D, label: "旋转模型", value: "rotate" },
    { icon: Scaling, label: "缩放模型", value: "scale" }
  ];

  return (
    <div className="pointer-events-none absolute bottom-5 left-5 z-30 rounded-2xl border border-white/18 bg-[#666666]/72 p-2 !text-white shadow-[0_18px_55px_rgba(0,0,0,0.3)] backdrop-blur-xl">
      {selectedName ? <div className="mb-1 max-w-44 truncate px-2 text-[10px] font-bold !text-white/78">{selectedName}</div> : null}
      <div className="flex items-center gap-1.5">
        {transformModes.map((item) => {
          const Icon = item.icon;
          return (
          <button
            key={item.value}
            type="button"
            disabled={!selectedName}
            title={selectedName ? item.label : "点击模型后启用坐标轴"}
            onClick={() => onModeChange(item.value)}
            className={cn(
              "pointer-events-auto grid h-9 w-9 place-items-center rounded-full border border-white/12 bg-white/10 !text-white transition hover:bg-white/18 disabled:cursor-not-allowed disabled:opacity-40",
              selectedName && mode === item.value && "border-sky-200/75 bg-gradient-to-r from-sky-300/82 to-cyan-300/82 shadow-[0_0_18px_rgba(125,211,252,0.28)]"
            )}
          >
            <Icon className="h-4 w-4 !text-white" />
          </button>
          );
        })}
        <button
          type="button"
          disabled={!selectedName}
          title="复位模型变换"
          onClick={onResetTransform}
          className="pointer-events-auto grid h-9 w-9 place-items-center rounded-full border border-white/12 bg-white/10 !text-white transition hover:bg-white/18 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <RotateCcw className="h-4 w-4 !text-white" />
        </button>
      </div>
      <div className="mt-1 flex justify-center gap-2 px-1 text-[9px] font-bold !text-white/48">
        <span>W 移动</span>
        <span>E 旋转</span>
        <span>R 缩放</span>
      </div>
    </div>
  );
}

function getCameraRotation(camera: THREE.PerspectiveCamera, controls: OrbitControls) {
  const offset = camera.position.clone().sub(controls.target);
  const spherical = new THREE.Spherical().setFromVector3(offset);
  return {
    x: THREE.MathUtils.radToDeg(spherical.phi) - 90,
    y: THREE.MathUtils.radToDeg(spherical.theta)
  };
}

function createAxisLine(start: THREE.Vector3, end: THREE.Vector3, color: number, opacity: number) {
  const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
  const material = new THREE.LineBasicMaterial({ color, opacity, transparent: true });
  return new THREE.Line(geometry, material);
}

function createOriginMarker() {
  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(0.055, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xffffff, opacity: 0.88, transparent: true })
  );
  marker.position.set(0, 0.055, 0);
  return marker;
}

function prepareModelMeshes(model: THREE.Object3D, originalMaterials: Map<THREE.Mesh, StoredMeshMaterial>) {
  originalMaterials.clear();
  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    if (isRenderHelper(object)) return;
    originalMaterials.set(object, {
      flatShading: getFirstMaterial(object.material)?.flatShading,
      material: object.material
    });
    getMaterialList(object.material).forEach((material) => {
      if ("envMapIntensity" in material) {
        material.envMapIntensity = 0.9;
      }
    });
  });
}

function applyModelRenderMode(model: THREE.Object3D, originalMaterials: Map<THREE.Mesh, StoredMeshMaterial>, mode: MaterialMode, shading: DisplayShading) {
  clearRenderHelpers(model);
  const hologramBounds = mode === "hologram" ? getObjectWorldBounds(model) : null;
  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    if (isRenderHelper(object)) return;
    const stored = originalMaterials.get(object);
    if (!stored) return;

    const replacement = createModeMaterial(mode, object, stored, hologramBounds || undefined);
    disposeTransientMaterials(object.material, stored.material);
    object.material = replacement || stored.material;
    getMaterialList(object.material).forEach((material) => {
      if ("flatShading" in material) {
        material.flatShading = shading === "flat" || mode === "toon" || mode === "sketch";
      }
      material.needsUpdate = true;
    });
    if (mode === "sketch") {
      object.add(createSketchAccentOutlineMesh(object));
      object.add(createSketchSilhouetteMesh(object));
      object.add(createSketchOutlineMesh(object));
    }
    if (mode === "hologram") {
      object.add(createHologramGlowMesh(object));
    }
  });
}

function createModeMaterial(mode: MaterialMode, mesh: THREE.Mesh, stored: StoredMeshMaterial, hologramBounds?: { maxY: number; minY: number }) {
  const original = getFirstMaterial(stored.material);
  const originalColor = original && "color" in original ? original.color : new THREE.Color(0xdedede);
  const baseColor = originalColor instanceof THREE.Color ? originalColor : new THREE.Color(0xdedede);

  switch (mode) {
    case "clay":
      return new THREE.MeshStandardMaterial({ color: 0xe7e7e7, metalness: 0.02, roughness: 0.72 });
    case "unlit":
      return new THREE.MeshBasicMaterial({ color: baseColor, map: original?.map || null });
    case "normal":
      return new THREE.MeshNormalMaterial();
    case "toon":
      return new THREE.MeshToonMaterial({ color: 0xf4b46a, map: original?.map || null });
    case "sketch":
      return createSketchMaterial(mesh);
    case "hologram":
      return createHologramMaterial(hologramBounds);
    case "display":
    case "texture":
    default:
      return null;
  }
}

function createSketchMaterial(mesh: THREE.Mesh) {
  const tint = new THREE.Color(getSketchColor(mesh));
  return new THREE.ShaderMaterial({
    depthTest: true,
    depthWrite: true,
    polygonOffset: true,
    polygonOffsetFactor: 0.8,
    polygonOffsetUnits: 0.8,
    uniforms: {
      uBaseTint: { value: tint },
      uInkColor: { value: new THREE.Color(0x151515) },
      uWarmInkColor: { value: new THREE.Color(0xd3b325) }
    },
    vertexShader: `
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;
      varying vec3 vViewNormal;

      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        vViewNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 uBaseTint;
      uniform vec3 uInkColor;
      uniform vec3 uWarmInkColor;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;
      varying vec3 vViewNormal;

      float stripe(vec2 point, float scale, float width) {
        float line = fract((point.x + point.y) * scale);
        float primary = 1.0 - smoothstep(width, width + 0.018, min(line, 1.0 - line));
        return primary;
      }

      void main() {
        vec3 normal = normalize(vWorldNormal);
        vec3 lightDirection = normalize(vec3(-0.42, 0.78, 0.48));
        float diffuse = dot(normal, lightDirection) * 0.5 + 0.5;
        float viewRim = pow(1.0 - abs(normalize(vViewNormal).z), 1.85);
        float shadow = smoothstep(0.72, 0.18, diffuse);
        float deepShadow = smoothstep(0.42, 0.05, diffuse);
        float hatch = stripe(gl_FragCoord.xy, 0.075, 0.12) * shadow;
        float fineHatch = stripe(vec2(gl_FragCoord.x * 0.72 - gl_FragCoord.y * 0.72, gl_FragCoord.y), 0.065, 0.055) * deepShadow;
        float contourInk = smoothstep(0.52, 0.96, viewRim);
        float paperGrain = fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453) * 0.025;

        vec3 lit = mix(vec3(0.78, 0.78, 0.75), vec3(1.0, 0.995, 0.965), smoothstep(0.18, 0.92, diffuse));
        vec3 color = lit * uBaseTint;
        color = mix(color, uInkColor, clamp(hatch * 0.42 + fineHatch * 0.34 + contourInk * 0.28, 0.0, 0.72));
        color = mix(color, uWarmInkColor, contourInk * 0.08);
        color -= paperGrain;

        gl_FragColor = vec4(color, 1.0);
      }
    `
  });
}

function createSketchOutlineMesh(mesh: THREE.Mesh) {
  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(mesh.geometry, 24),
    new THREE.LineBasicMaterial({
      color: 0x050505,
      depthTest: true,
      depthWrite: false,
      opacity: 0.92,
      transparent: true
    })
  );
  outline.name = "sketch-visible-outline";
  markRenderHelper(outline, true);
  return outline;
}

function createSketchSilhouetteMesh(mesh: THREE.Mesh) {
  const silhouette = new THREE.Mesh(
    mesh.geometry,
    new THREE.ShaderMaterial({
      depthTest: true,
      depthWrite: false,
      side: THREE.BackSide,
      uniforms: {
        uColor: { value: new THREE.Color(0x050505) },
        uOffset: { value: 0.018 }
      },
      vertexShader: `
        uniform float uOffset;

        void main() {
          vec3 expanded = position + normal * uOffset;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(expanded, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;

        void main() {
          gl_FragColor = vec4(uColor, 0.94);
        }
      `
    })
  );
  silhouette.name = "sketch-black-silhouette";
  markRenderHelper(silhouette, true);
  return silhouette;
}

function createSketchAccentOutlineMesh(mesh: THREE.Mesh) {
  const accent = new THREE.Mesh(
    mesh.geometry,
    new THREE.ShaderMaterial({
      depthTest: true,
      depthWrite: false,
      side: THREE.BackSide,
      transparent: true,
      uniforms: {
        uColor: { value: new THREE.Color(0xd7bc2e) },
        uOffset: { value: 0.031 }
      },
      vertexShader: `
        uniform float uOffset;

        void main() {
          vec3 expanded = position + normal * uOffset;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(expanded, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;

        void main() {
          gl_FragColor = vec4(uColor, 0.58);
        }
      `
    })
  );
  accent.name = "sketch-warm-accent-silhouette";
  accent.position.x -= 0.003;
  accent.position.y -= 0.002;
  markRenderHelper(accent, true);
  return accent;
}

function createHologramMaterial(hologramBounds?: { maxY: number; minY: number }) {
  const uniforms: HologramUniforms = {
    uBeamCoreWidth: { value: 0.072 },
    uBeamHaloWidth: { value: 0.24 },
    uMaxY: { value: hologramBounds?.maxY ?? 1 },
    uMinY: { value: hologramBounds?.minY ?? 0 },
    uScanY: { value: 0 },
    uTime: { value: 0 }
  };

  const material: HologramMaterial = new THREE.ShaderMaterial({
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    uniforms,
    vertexShader: `
      varying vec3 vWorldPosition;
      varying vec3 vNormal;

      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      uniform float uBeamCoreWidth;
      uniform float uBeamHaloWidth;
      uniform float uMaxY;
      uniform float uMinY;
      uniform float uScanY;
      uniform float uTime;
      varying vec3 vWorldPosition;
      varying vec3 vNormal;

      void main() {
        float rangeY = max(0.001, uMaxY - uMinY);
        float heightMix = clamp((vWorldPosition.y - uMinY) / rangeY, 0.0, 1.0);
        float scanCore = smoothstep(uBeamCoreWidth, 0.0, abs(vWorldPosition.y - uScanY));
        float scanHalo = smoothstep(uBeamHaloWidth, 0.0, abs(vWorldPosition.y - uScanY)) * 0.44;
        float scanGlow = smoothstep(uBeamHaloWidth * 1.55, 0.0, abs(vWorldPosition.y - uScanY)) * 0.18;
        float scan = clamp(scanCore + scanHalo, 0.0, 1.0);
        float fresnel = pow(1.0 - abs(vNormal.z), 2.2);
        vec3 base = vec3(0.2, 0.88, 0.96);
        vec3 scanColor = vec3(0.88, 1.22, 1.24);
        float softPulse = 0.88 + 0.12 * sin(uTime * 1.2);
        float alpha = 0.17 + scanCore * 0.58 * softPulse + scanHalo * 0.2 + scanGlow * 0.1 + fresnel * 0.12;
        vec3 glowColor = mix(base, scanColor, clamp(scanCore + scanGlow * 0.48, 0.0, 1.0));
        gl_FragColor = vec4(glowColor, clamp(alpha, 0.14, 0.74));
      }
    `
  });

  material.userData.hologramUniforms = uniforms;
  return material;
}

function createHologramGlowMesh(mesh: THREE.Mesh) {
  const glow = new THREE.Mesh(
    mesh.geometry,
    new THREE.MeshBasicMaterial({
      blending: THREE.AdditiveBlending,
      color: 0xc8ffff,
      depthWrite: false,
      opacity: 0.09,
      side: THREE.BackSide,
      transparent: true
    })
  );
  glow.name = "hologram-cyan-glow-shell";
  glow.scale.setScalar(1.035);
  markRenderHelper(glow, true);
  return glow;
}

function getMaterialList(material: THREE.Material | THREE.Material[]) {
  return Array.isArray(material) ? material : [material];
}

function getFirstMaterial(material: THREE.Material | THREE.Material[]) {
  return getMaterialList(material)[0] as (THREE.Material & { color?: THREE.Color; map?: THREE.Texture | null; flatShading?: boolean }) | undefined;
}

function disposeTransientMaterials(currentMaterial: THREE.Material | THREE.Material[], originalMaterial: THREE.Material | THREE.Material[]) {
  const originalSet = new Set(getMaterialList(originalMaterial));
  getMaterialList(currentMaterial).forEach((material) => {
    if (!originalSet.has(material)) {
      material.dispose();
    }
  });
}

function clearRenderHelpers(root: THREE.Object3D) {
  const helpers: THREE.Object3D[] = [];
  root.traverse((object) => {
    if (object.userData[RENDER_HELPER_KEY]) {
      helpers.push(object);
    }
  });

  helpers.forEach((helper) => {
    helper.parent?.remove(helper);
    disposeHelperObject(helper);
  });
}

function disposeHelperObject(object: THREE.Object3D) {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
      if (!child.userData[REUSES_PARENT_GEOMETRY_KEY]) {
        child.geometry.dispose();
      }
      getMaterialList(child.material).forEach((material) => material.dispose());
    }
  });
}

function isRenderHelper(object: THREE.Object3D) {
  return Boolean(object.userData[RENDER_HELPER_KEY]);
}

function markRenderHelper(object: THREE.Object3D, reusesParentGeometry = false) {
  object.userData[RENDER_HELPER_KEY] = true;
  object.userData[REUSES_PARENT_GEOMETRY_KEY] = reusesParentGeometry;
}

function updateHologramScan(scene: THREE.Scene, time: number) {
  const scanPhase = (time * 0.095) % 1;
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    getMaterialList(object.material).forEach((material) => {
      const hologramMaterial = material as HologramMaterial;
      const uniforms = hologramMaterial.userData.hologramUniforms;
      if (!uniforms) return;
      const minY = uniforms.uMinY.value;
      const maxY = uniforms.uMaxY.value;
      const travelPadding = (maxY - minY) * 0.18;
      uniforms.uMinY.value = minY;
      uniforms.uMaxY.value = maxY;
      uniforms.uScanY.value = THREE.MathUtils.lerp(minY - travelPadding, maxY + travelPadding, scanPhase);
      uniforms.uTime.value = time;
    });
  });
}

function getObjectWorldBounds(object: THREE.Object3D) {
  const box = new THREE.Box3().setFromObject(object);
  return {
    maxY: Number.isFinite(box.max.y) ? box.max.y : 1,
    minY: Number.isFinite(box.min.y) ? box.min.y : 0
  };
}

function getSketchColor(mesh: THREE.Mesh) {
  const nameSeed = mesh.name.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return nameSeed % 3 === 0 ? 0xece6d8 : 0xf7f2e7;
}

function updateEnvironmentLights(
  ambientLight: THREE.AmbientLight,
  keyLight: THREE.DirectionalLight,
  rimLight: THREE.DirectionalLight,
  environment: EnvironmentPreset,
  rotation: number,
  exposure: number,
  materialMode: MaterialMode
) {
  const lighting = environmentLighting[environment];
  const unlitScale = materialMode === "unlit" || materialMode === "normal" ? 0 : 1;
  const angle = THREE.MathUtils.degToRad(rotation);
  const radius = 7;

  ambientLight.intensity = lighting.ambient * Math.max(0.12, exposure);
  keyLight.intensity = lighting.key * Math.max(0.08, exposure) * unlitScale;
  rimLight.intensity = lighting.rim * Math.max(0.08, exposure) * unlitScale;
  keyLight.color.setHex(lighting.keyColor);
  rimLight.color.setHex(lighting.rimColor);
  keyLight.position.set(Math.cos(angle) * radius, 6.5, Math.sin(angle) * radius);
  rimLight.position.set(Math.cos(angle + Math.PI) * 5.5, 4.2, Math.sin(angle + Math.PI) * 5.5);
}

function normalizeModel(model: THREE.Object3D) {
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxAxis = Math.max(size.x, size.y, size.z) || 1;
  const scale = 2.6 / maxAxis;

  model.position.sub(center);
  model.scale.setScalar(scale);

  const normalizedBox = new THREE.Box3().setFromObject(model);
  model.position.y -= normalizedBox.min.y;
}

function fitCameraToObject(camera: THREE.PerspectiveCamera, controls: OrbitControls, object: THREE.Object3D, distanceMultiplier = 2.35) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxSize = Math.max(size.x, size.y, size.z) || 1;
  const distance = maxSize * distanceMultiplier;

  controls.target.copy(center);
  controls.target.y = Math.max(center.y, size.y * 0.38);
  camera.position.set(center.x + distance, center.y + distance * 0.62, center.z + distance);
  camera.near = Math.max(0.01, distance / 100);
  camera.far = Math.max(100, distance * 80);
  camera.updateProjectionMatrix();
  controls.update();
}

function focusCameraToObject(camera: THREE.PerspectiveCamera, controls: OrbitControls, object: THREE.Object3D, tweenRef: MutableRef<CameraFocusTween | null>, distanceMultiplier = 1.35) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxSize = Math.max(size.x, size.y, size.z) || 1;
  const distance = Math.max(0.8, maxSize * distanceMultiplier);
  const direction = camera.position.clone().sub(controls.target).normalize();
  if (!Number.isFinite(direction.lengthSq()) || direction.lengthSq() < 0.01) {
    direction.set(1, 0.55, 1).normalize();
  }
  const target = center.clone();
  target.y = Math.max(center.y, size.y * 0.38);
  tweenRef.current = {
    duration: 0.42,
    elapsed: 0,
    fromPosition: camera.position.clone(),
    fromTarget: controls.target.clone(),
    toPosition: target.clone().add(direction.multiplyScalar(distance)),
    toTarget: target
  };
}

function updateCameraFocusTween(camera: THREE.PerspectiveCamera, controls: OrbitControls, tweenRef: MutableRef<CameraFocusTween | null>, deltaSeconds: number) {
  const tween = tweenRef.current;
  if (!tween) return;
  tween.elapsed += deltaSeconds;
  const progress = Math.min(1, tween.elapsed / tween.duration);
  const eased = 1 - Math.pow(1 - progress, 3);
  camera.position.lerpVectors(tween.fromPosition, tween.toPosition, eased);
  controls.target.lerpVectors(tween.fromTarget, tween.toTarget, eased);
  if (progress >= 1) {
    tweenRef.current = null;
  }
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => material.dispose());
  });
}
