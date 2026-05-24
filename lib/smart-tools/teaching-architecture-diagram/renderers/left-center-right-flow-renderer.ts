import type { DiagramScene } from "@/lib/smart-tools/teaching-architecture-diagram/diagram-scene";
import { pathLine, renderBackground, renderRectNode, renderTitle, svgDocument, textLabel } from "@/lib/smart-tools/teaching-architecture-diagram/renderers/svg-utils";

export function renderLeftCenterRightFlowSvg(scene: DiagramScene) {
  const width = scene.width;
  const height = scene.height;
  const mainNodes = scene.nodes.filter((node) => node.role !== "center").slice(0, 5);
  const moduleWidth = 250;
  const moduleHeight = 380;
  const gap = (width - 96 * 2 - moduleWidth * mainNodes.length) / Math.max(1, mainNodes.length - 1);
  const top = 300;
  const boxes = mainNodes.map((node, index) => ({
    node,
    x: 96 + index * (moduleWidth + gap),
    y: top,
    width: moduleWidth,
    height: moduleHeight
  }));
  const feedbackLabel = scene.edges.find((edge) => edge.type === "feedback")?.label || "评价反馈 · 持续改进";

  const content = [
    renderBackground(width, height, scene.background),
    renderTitle(scene.title, width, 82, 48),
    ...boxes.map((box, index) =>
      renderRectNode({
        node: box.node,
        box,
        fill: "#ffffff",
        titleFill: index === 0 || index === boxes.length - 1 ? "#0B4EA2" : "#DCEBFF",
        titleColor: index === 0 || index === boxes.length - 1 ? "#ffffff" : "#111827",
        titleSize: 34,
        tagSize: 26,
        titleChars: 5,
        header: true
      })
    ),
    ...boxes.slice(0, -1).map((box, index) => {
      const next = boxes[index + 1];
      const y = top + moduleHeight / 2;
      return pathLine(`M ${box.x + box.width + 28} ${y} L ${next.x - 28} ${y}`, { marker: true, width: 6 });
    }),
    boxes.length
      ? pathLine(
          `M ${boxes[boxes.length - 1].x + boxes[boxes.length - 1].width / 2} ${top + moduleHeight + 28} L ${boxes[boxes.length - 1].x + boxes[boxes.length - 1].width / 2} ${height - 185} L ${boxes[0].x + boxes[0].width / 2} ${height - 185} L ${boxes[0].x + boxes[0].width / 2} ${top + moduleHeight + 8}`,
          { dashed: true, marker: true, width: 4 }
        )
      : "",
    boxes.length ? `<rect x="${width / 2 - 190}" y="${height - 230}" width="380" height="82" rx="16" fill="#ffffff" stroke="#0B4EA2" stroke-width="3" stroke-dasharray="10 10"/>` : "",
    boxes.length ? textLabel(feedbackLabel, width / 2, height - 178, { size: 32, fill: "#111827", weight: 800 }) : ""
  ].join("\n");

  return svgDocument({ width, height, title: scene.title, content });
}
