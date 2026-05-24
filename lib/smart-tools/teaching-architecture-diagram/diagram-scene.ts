import "server-only";

import type {
  TeachingArchitectureBlueprint,
  TeachingArchitectureDiagramType,
  TeachingArchitectureDiagramScene,
  TeachingArchitectureDiagramSceneEdge,
  TeachingArchitectureDiagramSceneLayout,
  TeachingArchitectureDiagramSceneNode,
  TeachingArchitectureDiagramSceneNodeRole,
  TeachingArchitectureImageNode
} from "@/lib/smart-tools/teaching-architecture-diagram/types";

export type DiagramSceneLayout = TeachingArchitectureDiagramSceneLayout;
export type DiagramSceneNodeRole = TeachingArchitectureDiagramSceneNodeRole;
export type DiagramSceneNode = TeachingArchitectureDiagramSceneNode;
export type DiagramSceneEdge = TeachingArchitectureDiagramSceneEdge;
export type DiagramScene = TeachingArchitectureDiagramScene;

const DEFAULT_THEME: DiagramScene["theme"] = {
  primary: "#0B4EA2",
  secondary: "#EAF4FF",
  accent: "#F28C28",
  success: "#1F8A70",
  danger: "#D23B3B",
  text: "#111827",
  muted: "#4B5563",
  stroke: "#0F56B3"
};

export function buildTeachingArchitectureDiagramScene(blueprint: TeachingArchitectureBlueprint): DiagramScene {
  const layout = resolveSceneLayout(blueprint);
  const { width, height } = getSceneSize(layout, blueprint.visualPlan.size);
  const mainNodes = normalizeSceneNodes(blueprint.imageNodes);
  const nodes: DiagramSceneNode[] = [
    {
      id: "center",
      index: 0,
      title: blueprint.coreTheme || blueprint.title,
      tags: [],
      role: "center"
    },
    ...mainNodes.map((node, index) => ({
      id: `node-${index + 1}`,
      index: index + 1,
      title: node.title,
      tags: node.shortTags.slice(0, 2),
      role: getNodeRole(layout, index, mainNodes.length)
    }))
  ];

  return {
    title: blueprint.title,
    layout,
    width,
    height,
    background: "#ffffff",
    theme: DEFAULT_THEME,
    nodes,
    edges: buildSceneEdges(layout, nodes)
  };
}

function resolveSceneLayout(blueprint: TeachingArchitectureBlueprint): DiagramSceneLayout {
  const type = blueprint.diagramType === "auto" ? blueprint.layoutIntent.recommendedType : blueprint.diagramType;
  return type === "auto" ? "central_model" : type;
}

function getSceneSize(layout: DiagramSceneLayout, preferredSize: TeachingArchitectureBlueprint["visualPlan"]["size"]) {
  if (layout === "left_center_right_flow" || preferredSize === "1792x1024") return { width: 1792, height: 1024 };
  if (layout === "three_layer" || layout === "tree_module" || preferredSize === "1536x1024") return { width: 1536, height: 1024 };
  return { width: 1024, height: 1536 };
}

function normalizeSceneNodes(imageNodes: TeachingArchitectureImageNode[]) {
  const fallback: TeachingArchitectureImageNode[] = [
    { title: "问题导向", shortTags: ["需求牵引"], category: "combined", evidence: [] },
    { title: "目标引领", shortTags: ["能力提升"], category: "constructionGoals", evidence: [] },
    { title: "资源支撑", shortTags: ["课程资源"], category: "teachingResources", evidence: [] },
    { title: "课堂实施", shortTags: ["分段推进"], category: "implementationPath", evidence: [] },
    { title: "评价反馈", shortTags: ["持续改进"], category: "evaluationMechanism", evidence: [] }
  ];
  const nodes = imageNodes.length ? imageNodes : fallback;
  return nodes.slice(0, 6).map((node) => ({
    ...node,
    title: node.title || "关键节点",
    shortTags: node.shortTags.slice(0, 2)
  }));
}

function getNodeRole(layout: DiagramSceneLayout, index: number, total: number): DiagramSceneNodeRole {
  if (layout === "left_center_right_flow") {
    if (index >= total - 1) return "output";
    if (index === total - 2) return "feedback";
    return index < 2 ? "support" : "main";
  }
  if (layout === "closed_loop" && index >= total - 2) return "feedback";
  if (layout === "tree_module" && index >= Math.max(3, total - 1)) return "support";
  return "main";
}

function buildSceneEdges(layout: DiagramSceneLayout, nodes: DiagramSceneNode[]): DiagramSceneEdge[] {
  const mainNodes = nodes.filter((node) => node.role !== "center");
  if (!mainNodes.length) return [];

  if (layout === "closed_loop") {
    return [
      ...mainNodes.map((node, index) => ({
        id: `edge-${index + 1}`,
        from: node.id,
        to: mainNodes[(index + 1) % mainNodes.length].id,
        type: "loop" as const
      })),
      ...mainNodes.map((node, index) => ({
        id: `edge-center-${index + 1}`,
        from: "center",
        to: node.id,
        type: "dashed" as const
      }))
    ];
  }

  if (layout === "left_center_right_flow") {
    return [
      ...mainNodes.slice(0, -1).map((node, index) => ({
        id: `edge-${index + 1}`,
        from: node.id,
        to: mainNodes[index + 1].id,
        type: "solid" as const
      })),
      {
        id: "edge-feedback",
        from: mainNodes[mainNodes.length - 1].id,
        to: mainNodes[0].id,
        type: "feedback" as const,
        label: "评价反馈 · 持续改进"
      }
    ];
  }

  if (layout === "central_model") {
    return mainNodes.map((node, index) => ({
      id: `edge-${index + 1}`,
      from: "center",
      to: node.id,
      type: "solid" as const
    }));
  }

  if (layout === "tree_module") {
    return mainNodes.map((node, index) => ({
      id: `edge-${index + 1}`,
      from: "center",
      to: node.id,
      type: "solid" as const
    }));
  }

  return mainNodes.slice(0, -1).map((node, index) => ({
    id: `edge-${index + 1}`,
    from: node.id,
    to: mainNodes[index + 1].id,
    type: "solid" as const
  }));
}
