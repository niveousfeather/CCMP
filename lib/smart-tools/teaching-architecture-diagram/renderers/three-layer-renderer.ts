import type { DiagramScene } from "@/lib/smart-tools/teaching-architecture-diagram/diagram-scene";
import { line, renderBackground, renderRectNode, renderTitle, svgDocument, textLabel } from "@/lib/smart-tools/teaching-architecture-diagram/renderers/svg-utils";

export function renderThreeLayerSvg(scene: DiagramScene) {
  const width = scene.width;
  const height = scene.height;
  const mainNodes = scene.nodes.filter((node) => node.role !== "center").slice(0, 6);
  const layers = [
    { title: "目标牵引层", nodes: mainNodes.slice(0, 2), y: 205, fill: "#EAF4FF" },
    { title: "实施运行层", nodes: mainNodes.slice(2, 4), y: 470, fill: "#ffffff" },
    { title: "支撑保障层", nodes: mainNodes.slice(4), y: 735, fill: "#FFF4E6" }
  ].filter((layer) => layer.nodes.length);
  const layerX = 110;
  const layerWidth = width - layerX * 2;
  const layerHeight = 210;

  const content = [
    renderBackground(width, height, scene.background),
    renderTitle(scene.title, width, 78, 46),
    ...layers.map((layer) => [
      `<rect x="${layerX}" y="${layer.y}" width="${layerWidth}" height="${layerHeight}" rx="22" fill="${layer.fill}" stroke="#0B4EA2" stroke-width="4"/>`,
      textLabel(layer.title, layerX + 110, layer.y + 55, { size: 30, fill: "#0B4EA2", weight: 800 }),
      ...layer.nodes.map((node, index) => {
        const boxWidth = 280;
        const gap = 54;
        const startX = layerX + 250 + (layerWidth - 250 - layer.nodes.length * boxWidth - (layer.nodes.length - 1) * gap) / 2;
        return renderRectNode({
          node,
          box: { x: startX + index * (boxWidth + gap), y: layer.y + 42, width: boxWidth, height: 130 },
          fill: "#ffffff",
          titleSize: 27,
          tagSize: 20,
          titleChars: 6,
          header: false
        });
      })
    ].join("\n")),
    ...layers.slice(0, -1).map((layer, index) =>
      line(
        { x: width / 2, y: layer.y + layerHeight + 15 },
        { x: width / 2, y: layers[index + 1].y - 18 },
        { marker: true, width: 5 }
      )
    )
  ].join("\n");

  return svgDocument({ width, height, title: scene.title, content });
}
