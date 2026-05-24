import type { DiagramScene } from "@/lib/smart-tools/teaching-architecture-diagram/diagram-scene";
import { line, pathLine, renderBackground, renderCircleNode, renderTitle, svgDocument, textLabel } from "@/lib/smart-tools/teaching-architecture-diagram/renderers/svg-utils";

export function renderClosedLoopSvg(scene: DiagramScene) {
  const width = scene.width;
  const height = scene.height;
  const center = { x: width / 2, y: height / 2 + 40 };
  const centerRadius = 178;
  const ringRadiusX = 335;
  const ringRadiusY = 475;
  const nodeRadius = scene.nodes.length > 6 ? 112 : 124;
  const mainNodes = scene.nodes.filter((node) => node.role !== "center").slice(0, 6);
  const centerNode = scene.nodes.find((node) => node.role === "center") || scene.nodes[0];
  const angleOffset = -90;
  const positions = mainNodes.map((node, index) => {
    const angle = ((angleOffset + (360 / mainNodes.length) * index) * Math.PI) / 180;
    return {
      node,
      x: center.x + Math.cos(angle) * ringRadiusX,
      y: center.y + Math.sin(angle) * ringRadiusY,
      angle
    };
  });

  const content = [
    renderBackground(width, height, scene.background),
    renderTitle(scene.title, width, 82, 42),
    ...positions.map((position) => {
      const dx = position.x - center.x;
      const dy = position.y - center.y;
      const distance = Math.sqrt(dx * dx + dy * dy) || 1;
      const unit = { x: dx / distance, y: dy / distance };
      return line(
        {
          x: center.x + unit.x * (centerRadius + 8),
          y: center.y + unit.y * (centerRadius + 8)
        },
        {
          x: position.x - unit.x * (nodeRadius + 10),
          y: position.y - unit.y * (nodeRadius + 10)
        },
        { dashed: true, width: 3, color: "#6B8FC8" }
      );
    }),
    ...positions.map((position, index) => {
      const next = positions[(index + 1) % positions.length];
      const startAngle = position.angle + 0.22;
      const endAngle = next.angle - 0.22;
      const start = {
        x: center.x + Math.cos(startAngle) * ringRadiusX,
        y: center.y + Math.sin(startAngle) * ringRadiusY
      };
      const end = {
        x: center.x + Math.cos(endAngle) * ringRadiusX,
        y: center.y + Math.sin(endAngle) * ringRadiusY
      };
      const largeArc = mainNodes.length <= 3 ? 1 : 0;
      return pathLine(`M ${start.x} ${start.y} A ${ringRadiusX} ${ringRadiusY} 0 ${largeArc} 1 ${end.x} ${end.y}`, {
        marker: true,
        width: 5
      });
    }),
    renderCircleNode({
      node: centerNode,
      cx: center.x,
      cy: center.y,
      r: centerRadius,
      fill: scene.theme.secondary,
      titleSize: 32,
      titleChars: 8,
      titleLines: 3
    }),
    ...positions.map((position, index) =>
      renderCircleNode({
        node: position.node,
        cx: position.x,
        cy: position.y,
        r: nodeRadius,
        fill: index >= Math.max(0, positions.length - 2) ? "#FFF4E6" : "#ffffff",
        titleSize: 30,
        tagSize: 22,
        titleChars: 6
      })
    ),
    ...["诊断", "实施", "评价", "反馈", "改进"].slice(0, Math.max(0, positions.length - 1)).map((label, index) => {
      const from = positions[index];
      const to = positions[(index + 1) % positions.length];
      return textLabel(label, (from.x + to.x) / 2, (from.y + to.y) / 2 - 18, { size: 22 });
    })
  ].join("\n");

  return svgDocument({ width, height, title: scene.title, content });
}
