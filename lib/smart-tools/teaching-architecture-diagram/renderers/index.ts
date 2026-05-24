import "server-only";

import type { DiagramScene } from "@/lib/smart-tools/teaching-architecture-diagram/diagram-scene";
import { renderCentralModelSvg } from "@/lib/smart-tools/teaching-architecture-diagram/renderers/central-model-renderer";
import { renderClosedLoopSvg } from "@/lib/smart-tools/teaching-architecture-diagram/renderers/closed-loop-renderer";
import { renderLeftCenterRightFlowSvg } from "@/lib/smart-tools/teaching-architecture-diagram/renderers/left-center-right-flow-renderer";
import { renderThreeLayerSvg } from "@/lib/smart-tools/teaching-architecture-diagram/renderers/three-layer-renderer";
import { renderTreeModuleSvg } from "@/lib/smart-tools/teaching-architecture-diagram/renderers/tree-module-renderer";

export function renderTeachingArchitectureSvg(scene: DiagramScene) {
  if (scene.layout === "closed_loop") return renderClosedLoopSvg(scene);
  if (scene.layout === "left_center_right_flow") return renderLeftCenterRightFlowSvg(scene);
  if (scene.layout === "three_layer") return renderThreeLayerSvg(scene);
  if (scene.layout === "tree_module") return renderTreeModuleSvg(scene);
  return renderCentralModelSvg(scene);
}
