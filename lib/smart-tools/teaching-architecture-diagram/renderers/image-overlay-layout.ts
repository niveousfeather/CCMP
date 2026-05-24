import type { TeachingArchitectureVisualPreset } from "@/lib/smart-tools/teaching-architecture-diagram/prompts";
import type {
  TeachingArchitectureDiagramScene,
  TeachingArchitectureDiagramSceneEdge,
  TeachingArchitectureDiagramSceneNode,
  TeachingArchitectureSceneEdit
} from "@/lib/smart-tools/teaching-architecture-diagram/types";
import type { TextFitRole } from "@/lib/smart-tools/teaching-architecture-diagram/renderers/text-fit";

export type NormalizedTextBox = {
  id: string;
  editablePath: string;
  edit: TeachingArchitectureSceneEdit;
  label: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  align?: "start" | "middle" | "end";
  valign?: "top" | "middle" | "bottom";
  role?: TextFitRole;
  cover?: boolean;
  coverFill?: string;
  coverOpacity?: number;
  textFill?: string;
  fontWeight?: number;
  radius?: number;
};

type BoxSpec = Omit<NormalizedTextBox, "edit" | "editablePath" | "id" | "label" | "text">;

export function buildTeachingArchitectureOverlayLayout(params: {
  scene: TeachingArchitectureDiagramScene;
  visualPreset?: TeachingArchitectureVisualPreset;
}) {
  const preset = params.visualPreset || inferPresetFromScene(params.scene);
  const mainNodes = params.scene.nodes.filter((node) => node.role !== "center");
  const centerNode = params.scene.nodes.find((node) => node.role === "center") || params.scene.nodes[0];
  const boxes: NormalizedTextBox[] = [
    makeTitleBox(params.scene, getTitleBox(preset)),
    ...makePresetNodeBoxes(preset, mainNodes, centerNode),
    ...makeEdgeBoxes(params.scene.edges, getEdgeBoxes(preset)),
    makeCaptionBox(params.scene, preset)
  ];

  return boxes.filter((box) => Boolean(box.text));
}

function makePresetNodeBoxes(
  preset: TeachingArchitectureVisualPreset,
  mainNodes: TeachingArchitectureDiagramSceneNode[],
  centerNode?: TeachingArchitectureDiagramSceneNode
) {
  if (preset === "symmetric-capability-framework") return makeSymmetricBoxes(mainNodes, centerNode);
  if (preset === "vertical-implementation-route") return makeVerticalBoxes(mainNodes, centerNode);
  if (preset === "horizontal-research-framework") return makeHorizontalBoxes(mainNodes, centerNode);
  return makeTeachingLoopBoxes(mainNodes, centerNode);
}

function makeTeachingLoopBoxes(mainNodes: TeachingArchitectureDiagramSceneNode[], centerNode?: TeachingArchitectureDiagramSceneNode) {
  const boxes: NormalizedTextBox[] = [];
  const stageBoxes = [
    { x: 0.045, y: 0.075, width: 0.145, height: 0.036, coverFill: "#0f766e", textFill: "#ffffff" },
    { x: 0.235, y: 0.075, width: 0.145, height: 0.036, coverFill: "#0f766e", textFill: "#ffffff" },
    { x: 0.425, y: 0.075, width: 0.145, height: 0.036, coverFill: "#0f766e", textFill: "#ffffff" },
    { x: 0.615, y: 0.075, width: 0.145, height: 0.036, coverFill: "#0f766e", textFill: "#ffffff" },
    { x: 0.805, y: 0.075, width: 0.145, height: 0.036, coverFill: "#0f766e", textFill: "#ffffff" }
  ];
  mainNodes.slice(0, 5).forEach((node, index) => {
    boxes.push(makeNodeTitleBox(node, stageBoxes[index], index));
  });

  const moduleBoxes = [
    { x: 0.43, y: 0.346, width: 0.14, height: 0.033, coverFill: "#f97316", textFill: "#ffffff" },
    { x: 0.255, y: 0.433, width: 0.14, height: 0.033, coverFill: "#f97316", textFill: "#ffffff" },
    { x: 0.61, y: 0.433, width: 0.14, height: 0.033, coverFill: "#f97316", textFill: "#ffffff" },
    { x: 0.255, y: 0.575, width: 0.14, height: 0.033, coverFill: "#f97316", textFill: "#ffffff" },
    { x: 0.61, y: 0.575, width: 0.14, height: 0.033, coverFill: "#f97316", textFill: "#ffffff" },
    { x: 0.43, y: 0.648, width: 0.14, height: 0.033, coverFill: "#f97316", textFill: "#ffffff" }
  ];
  mainNodes.slice(0, 6).forEach((node, index) => boxes.push(makeNodeTitleBox(node, moduleBoxes[index], index)));
  if (centerNode) boxes.push(makeNodeTitleBox(centerNode, { x: 0.414, y: 0.482, width: 0.17, height: 0.085, coverFill: "#0f766e", textFill: "#ffffff", role: "core" }, 0));
  boxes.push(...makeSideTags(mainNodes.slice(0, 5), "left", 0.048, 0.414, 0.13, 0.045));
  boxes.push(...makeSideTags(mainNodes.slice(0, 5), "right", 0.855, 0.414, 0.12, 0.045));
  boxes.push(...makeBottomTitles(mainNodes.slice(0, 5), 0.07, 0.855, 0.14, 0.042));
  return boxes;
}

function makeSymmetricBoxes(mainNodes: TeachingArchitectureDiagramSceneNode[], centerNode?: TeachingArchitectureDiagramSceneNode) {
  const boxes: NormalizedTextBox[] = [];
  const sideSpecs = [
    { x: 0.145, y: 0.307, width: 0.18, height: 0.055 },
    { x: 0.145, y: 0.455, width: 0.18, height: 0.055 },
    { x: 0.145, y: 0.605, width: 0.18, height: 0.055 },
    { x: 0.70, y: 0.307, width: 0.18, height: 0.055 },
    { x: 0.70, y: 0.455, width: 0.18, height: 0.055 },
    { x: 0.70, y: 0.605, width: 0.18, height: 0.055 }
  ];
  mainNodes.slice(0, 6).forEach((node, index) => boxes.push(makeNodeTitleBox(node, sideSpecs[index], index)));
  if (centerNode) boxes.push(makeNodeTitleBox(centerNode, { x: 0.36, y: 0.42, width: 0.28, height: 0.18, coverFill: "#6d28d9", textFill: "#ffffff", role: "core" }, 0));
  boxes.push(...makeBottomTitles(mainNodes.slice(0, 5), 0.055, 0.82, 0.16, 0.052));
  return boxes;
}

function makeVerticalBoxes(mainNodes: TeachingArchitectureDiagramSceneNode[], centerNode?: TeachingArchitectureDiagramSceneNode) {
  const boxes: NormalizedTextBox[] = [];
  const routeSpecs = [
    { x: 0.38, y: 0.16, width: 0.24, height: 0.055 },
    { x: 0.38, y: 0.30, width: 0.24, height: 0.055 },
    { x: 0.38, y: 0.44, width: 0.24, height: 0.055 },
    { x: 0.38, y: 0.58, width: 0.24, height: 0.055 },
    { x: 0.38, y: 0.72, width: 0.24, height: 0.055 }
  ];
  mainNodes.slice(0, 5).forEach((node, index) => boxes.push(makeNodeTitleBox(node, routeSpecs[index], index)));
  if (centerNode) boxes.push(makeNodeTitleBox(centerNode, { x: 0.35, y: 0.47, width: 0.30, height: 0.08, coverFill: "#1d4ed8", textFill: "#ffffff", role: "core" }, 0));
  boxes.push(...makeSideTags(mainNodes.slice(0, 3), "left", 0.08, 0.22, 0.18, 0.055));
  boxes.push(...makeSideTags(mainNodes.slice(3, 6), "right", 0.74, 0.22, 0.18, 0.055));
  return boxes;
}

function makeHorizontalBoxes(mainNodes: TeachingArchitectureDiagramSceneNode[], centerNode?: TeachingArchitectureDiagramSceneNode) {
  const boxes: NormalizedTextBox[] = [];
  if (centerNode) boxes.push(makeNodeTitleBox(centerNode, { x: 0.40, y: 0.43, width: 0.20, height: 0.10, coverFill: "#1e3a8a", textFill: "#ffffff", role: "core" }, 0));
  const specs = [
    { x: 0.11, y: 0.38, width: 0.20, height: 0.08 },
    { x: 0.11, y: 0.55, width: 0.20, height: 0.08 },
    { x: 0.40, y: 0.26, width: 0.20, height: 0.07 },
    { x: 0.69, y: 0.38, width: 0.20, height: 0.08 },
    { x: 0.69, y: 0.55, width: 0.20, height: 0.08 },
    { x: 0.40, y: 0.70, width: 0.20, height: 0.07 }
  ];
  mainNodes.slice(0, 6).forEach((node, index) => boxes.push(makeNodeTitleBox(node, specs[index], index)));
  return boxes;
}

function makeSideTags(nodes: TeachingArchitectureDiagramSceneNode[], side: "left" | "right", x: number, startY: number, width: number, height: number) {
  return nodes.flatMap((node, nodeIndex) =>
    node.tags.slice(0, 2).map((tag, tagIndex) =>
      makeNodeTagBox(node, tag, tagIndex, {
        x,
        y: startY + nodeIndex * 0.105 + tagIndex * (height * 0.94),
        width,
        height,
        coverFill: "#eef6ff",
        textFill: "#0f172a",
        role: "tag",
        radius: 6
      }, side)
    )
  );
}

function makeBottomTitles(nodes: TeachingArchitectureDiagramSceneNode[], startX: number, y: number, width: number, height: number) {
  return nodes.map((node, index) =>
    makeNodeTitleBox(node, {
      x: startX + index * (width + 0.04),
      y,
      width,
      height,
      coverFill: "#eef6ff",
      role: "module",
      radius: 8
    }, index)
  );
}

function makeTitleBox(scene: TeachingArchitectureDiagramScene, spec: BoxSpec): NormalizedTextBox {
  return {
    id: "scene-title",
    editablePath: "scene.title",
    edit: { targetType: "title", value: scene.title },
    label: "总标题",
    text: scene.title,
    role: "title",
    align: "middle",
    valign: "middle",
    cover: true,
    coverFill: "#ffffff",
    coverOpacity: 0.9,
    textFill: "#0f172a",
    fontWeight: 900,
    radius: 10,
    ...spec
  };
}

function makeCaptionBox(scene: TeachingArchitectureDiagramScene, preset: TeachingArchitectureVisualPreset): NormalizedTextBox {
  return {
    id: "scene-caption",
    editablePath: "scene.title",
    edit: { targetType: "title", value: scene.title },
    label: "图题",
    text: `图 1  ${scene.title}`,
    x: preset === "horizontal-research-framework" ? 0.22 : 0.21,
    y: 0.948,
    width: preset === "horizontal-research-framework" ? 0.56 : 0.58,
    height: 0.035,
    role: "caption",
    align: "middle",
    valign: "middle",
    cover: true,
    coverFill: "#ffffff",
    coverOpacity: 0.92,
    textFill: "#0f172a",
    fontWeight: 800,
    radius: 8
  };
}

function makeNodeTitleBox(node: TeachingArchitectureDiagramSceneNode, spec: BoxSpec, index: number): NormalizedTextBox {
  return {
    id: `${node.id}-title-${index}`,
    editablePath: `scene.nodes[${node.index}].title`,
    edit: { targetType: "nodeTitle", nodeId: node.id, value: node.title },
    label: "节点标题",
    text: node.title,
    role: spec.role || "module",
    align: "middle",
    valign: "middle",
    cover: true,
    coverFill: "#ffffff",
    coverOpacity: 0.9,
    textFill: "#0f172a",
    fontWeight: spec.role === "core" ? 900 : 800,
    radius: 10,
    ...spec
  };
}

function makeNodeTagBox(node: TeachingArchitectureDiagramSceneNode, tag: string, tagIndex: number, spec: BoxSpec, suffix: string): NormalizedTextBox {
  return {
    id: `${node.id}-tag-${tagIndex}-${suffix}`,
    editablePath: `scene.nodes[${node.index}].tags[${tagIndex}]`,
    edit: { targetType: "nodeTag", nodeId: node.id, tagIndex, value: tag },
    label: "节点标签",
    text: tag,
    role: "tag",
    align: "middle",
    valign: "middle",
    cover: true,
    coverFill: "#f8fafc",
    coverOpacity: 0.88,
    textFill: "#0f172a",
    fontWeight: 700,
    radius: 6,
    ...spec
  };
}

function makeEdgeBoxes(edges: TeachingArchitectureDiagramSceneEdge[], specs: BoxSpec[]) {
  return edges
    .filter((edge) => edge.label)
    .slice(0, specs.length)
    .map((edge, index): NormalizedTextBox => ({
      id: `${edge.id}-label`,
      editablePath: `scene.edges[${index}].label`,
      edit: { targetType: "edgeLabel", edgeId: edge.id, value: edge.label || "" },
      label: "连线标签",
      text: edge.label || "",
      role: "edgeLabel",
      align: "middle",
      valign: "middle",
      cover: true,
      coverFill: "#ffffff",
      coverOpacity: 0.86,
      textFill: "#0f172a",
      fontWeight: 800,
      radius: 8,
      ...specs[index]
    }));
}

function getTitleBox(preset: TeachingArchitectureVisualPreset): BoxSpec {
  if (preset === "symmetric-capability-framework") return { x: 0.06, y: 0.018, width: 0.88, height: 0.052, coverFill: "#ffffff", textFill: "#0b1f58" };
  if (preset === "horizontal-research-framework") return { x: 0.09, y: 0.025, width: 0.82, height: 0.06, coverFill: "#1e3a8a", textFill: "#ffffff" };
  return { x: 0.10, y: 0.018, width: 0.80, height: 0.052, coverFill: "#ffffff", textFill: "#0f172a" };
}

function getEdgeBoxes(preset: TeachingArchitectureVisualPreset): BoxSpec[] {
  if (preset === "symmetric-capability-framework") return [{ x: 0.42, y: 0.72, width: 0.16, height: 0.04, coverFill: "#6d28d9", textFill: "#ffffff" }];
  if (preset === "vertical-implementation-route") return [{ x: 0.42, y: 0.86, width: 0.16, height: 0.035 }];
  if (preset === "horizontal-research-framework") return [{ x: 0.42, y: 0.82, width: 0.16, height: 0.035 }];
  return [{ x: 0.43, y: 0.76, width: 0.14, height: 0.035, coverFill: "#0f766e", textFill: "#ffffff" }];
}

function inferPresetFromScene(scene: TeachingArchitectureDiagramScene): TeachingArchitectureVisualPreset {
  const text = [scene.title, ...scene.nodes.flatMap((node) => [node.title, ...node.tags])].join(" ");
  if (/人才培养|能力|评价体系|协同共育|专业群/.test(text)) return "symmetric-capability-framework";
  if (/实施路径|治理|修复|监测|保障机制|预警|风险|生态/.test(text)) return "vertical-implementation-route";
  if (/工艺|技术路线|性能优化|机制研究|制备|材料|装备/.test(text)) return "horizontal-research-framework";
  return "teaching-loop-model";
}
