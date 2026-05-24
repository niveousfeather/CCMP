import type { DiagramScene } from "@/lib/smart-tools/teaching-architecture-diagram/diagram-scene";
import { line, renderBackground, renderRectNode, renderTitle, svgDocument } from "@/lib/smart-tools/teaching-architecture-diagram/renderers/svg-utils";

export function renderTreeModuleSvg(scene: DiagramScene) {
  const width = scene.width;
  const height = scene.height;
  const centerNode = scene.nodes.find((node) => node.role === "center") || scene.nodes[0];
  const mainNodes = scene.nodes.filter((node) => node.role !== "center").slice(0, 5);
  const rootBox = { x: width / 2 - 230, y: 180, width: 460, height: 150 };
  const branchY = 520;
  const childWidth = 245;
  const childHeight = 210;
  const gap = (width - 120 * 2 - childWidth * mainNodes.length) / Math.max(1, mainNodes.length - 1);
  const boxes = mainNodes.map((node, index) => ({
    node,
    x: 120 + index * (childWidth + gap),
    y: branchY,
    width: childWidth,
    height: childHeight
  }));
  const trunkY = 410;

  const content = [
    renderBackground(width, height, scene.background),
    renderTitle(scene.title, width, 78, 46),
    renderRectNode({
      node: centerNode,
      box: rootBox,
      fill: "#EAF4FF",
      titleSize: 31,
      tagSize: 22,
      titleChars: 9,
      header: false
    }),
    line({ x: width / 2, y: rootBox.y + rootBox.height }, { x: width / 2, y: trunkY }, { width: 4 }),
    line({ x: boxes[0].x + boxes[0].width / 2, y: trunkY }, { x: boxes[boxes.length - 1].x + boxes[boxes.length - 1].width / 2, y: trunkY }, { width: 4 }),
    ...boxes.map((box) => [
      line({ x: box.x + box.width / 2, y: trunkY }, { x: box.x + box.width / 2, y: box.y - 16 }, { marker: true, width: 4 }),
      renderRectNode({
        node: box.node,
        box,
        fill: "#ffffff",
        titleFill: "#0B4EA2",
        titleSize: 28,
        tagSize: 21,
        titleChars: 5,
        header: true
      })
    ].join("\n"))
  ].join("\n");

  return svgDocument({ width, height, title: scene.title, content });
}
