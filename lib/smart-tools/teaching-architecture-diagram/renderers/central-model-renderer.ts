import type { DiagramScene } from "@/lib/smart-tools/teaching-architecture-diagram/diagram-scene";
import {
  line,
  pathLine,
  renderBackground,
  renderRectNode,
  renderTitle,
  svgDocument,
  textLabel,
  wrapChineseText
} from "@/lib/smart-tools/teaching-architecture-diagram/renderers/svg-utils";

export function renderCentralModelSvg(scene: DiagramScene) {
  const width = scene.width;
  const height = scene.height;
  const mainNodes = scene.nodes.filter((node) => node.role !== "center").slice(0, 6);
  const centerNode = scene.nodes.find((node) => node.role === "center") || scene.nodes[0];
  const isPortrait = height > width;

  if (!isPortrait) return renderLandscapeCentralModelSvg(scene, mainNodes, centerNode);

  const stageNodes = mainNodes.slice(0, 5);
  const mechanismNodes = mainNodes.slice(1, 5);
  const leftNodes = [mainNodes[4], mainNodes[5]].filter(Boolean);
  const rightNodes = [mainNodes[0], mainNodes[2], mainNodes[3]].filter(Boolean);
  const supportNodes = [mainNodes[3], mainNodes[4], mainNodes[5], mainNodes[1]].filter(Boolean);
  const core = { x: width / 2, y: 755 };
  const mechanismBoxes = [
    { node: mechanismNodes[0], x: 366, y: 485, width: 292, height: 126 },
    { node: mechanismNodes[1], x: 528, y: 655, width: 210, height: 132 },
    { node: mechanismNodes[2], x: 366, y: 905, width: 292, height: 126 },
    { node: mechanismNodes[3], x: 286, y: 655, width: 210, height: 132 }
  ].filter((item) => item.node);

  const content = [
    renderBackground(width, height, scene.background),
    renderTitle(scene.title, width, 72, 38),
    `<rect x="62" y="128" width="900" height="1225" rx="22" fill="none" stroke="#9DB7D8" stroke-width="2" stroke-dasharray="12 10"/>`,
    `<rect x="94" y="148" width="188" height="48" rx="14" fill="${scene.theme.primary}"/>`,
    textLabel("建设路径", 188, 181, { size: 25, fill: "#ffffff", weight: 800 }),
    ...renderStageRow(stageNodes, scene),
    `<rect x="272" y="430" width="480" height="670" rx="28" fill="#F7FBFF" stroke="#9DB7D8" stroke-width="3" stroke-dasharray="12 10"/>`,
    textLabel("协同共育核心机制", width / 2, 468, { size: 27, fill: scene.theme.primary, weight: 800 }),
    pathLine("M 248 790 A 276 276 0 0 1 776 622", { marker: true, width: 5, color: scene.theme.success }),
    pathLine("M 776 890 A 276 276 0 0 1 248 720", { marker: true, width: 5, color: scene.theme.success }),
    textLabel("数智驱动", 512, 402, { size: 24, fill: scene.theme.success, weight: 800 }),
    textLabel("反馈改进", 812, 760, { size: 24, fill: scene.theme.accent, weight: 800 }),
    textLabel("持续优化", 512, 1125, { size: 24, fill: scene.theme.success, weight: 800 }),
    textLabel("标准引领", 210, 760, { size: 24, fill: scene.theme.accent, weight: 800 }),
    ...renderSidePanel("驱动支撑", leftNodes, { x: 72, y: 455, width: 196, height: 585 }, scene.theme.primary),
    ...renderSidePanel("建设成效", rightNodes, { x: 756, y: 455, width: 196, height: 585 }, scene.theme.primary),
    ...mechanismBoxes.map((box) =>
      line({ x: core.x, y: core.y }, { x: box.x + box.width / 2, y: box.y + box.height / 2 }, { dashed: true, width: 2, color: "#8AA9D6" })
    ),
    ...mechanismBoxes.map((item, index) =>
      renderRectNode({
        node: item.node,
        box: item,
        fill: index % 2 === 0 ? "#ffffff" : "#FFF4E6",
        titleFill: index % 2 === 0 ? scene.theme.primary : scene.theme.accent,
        titleSize: 25,
        tagSize: 18,
        titleChars: 6,
        header: false
      })
    ),
    renderHexCore(centerNode, core.x, core.y, scene.theme.primary),
    `<rect x="80" y="1165" width="864" height="130" rx="18" fill="#F7FBFF" stroke="${scene.theme.primary}" stroke-width="3"/>`,
    `<rect x="420" y="1138" width="184" height="58" rx="14" fill="${scene.theme.success}"/>`,
    textLabel("保障体系", 512, 1175, { size: 28, fill: "#ffffff", weight: 800 }),
    ...renderSupportStrip(supportNodes, scene)
  ].join("\n");

  return svgDocument({ width, height, title: scene.title, content });
}

function renderLandscapeCentralModelSvg(scene: DiagramScene, mainNodes: DiagramScene["nodes"], centerNode: DiagramScene["nodes"][number]) {
  const width = scene.width;
  const height = scene.height;
  const moduleWidth = 245;
  const moduleHeight = 170;
  const top = 325;
  const gap = (width - 120 * 2 - moduleWidth * Math.min(mainNodes.length, 5)) / Math.max(1, Math.min(mainNodes.length, 5) - 1);
  const boxes = mainNodes.slice(0, 5).map((node, index) => ({
    node,
    x: 120 + index * (moduleWidth + gap),
    y: top,
    width: moduleWidth,
    height: moduleHeight
  }));

  const content = [
    renderBackground(width, height, scene.background),
    renderTitle(scene.title, width, 82, 44),
    `<rect x="80" y="170" width="${width - 160}" height="${height - 280}" rx="24" fill="none" stroke="#9DB7D8" stroke-width="2" stroke-dasharray="12 10"/>`,
    renderHexCore(centerNode, width / 2, 660, scene.theme.primary),
    ...boxes.map((box, index) =>
      renderRectNode({
        node: box.node,
        box,
        fill: index % 2 ? "#FFF4E6" : "#ffffff",
        titleFill: index % 2 ? scene.theme.accent : scene.theme.primary,
        titleSize: 28,
        tagSize: 21,
        titleChars: 6
      })
    ),
    ...boxes.slice(0, -1).map((box, index) =>
      line({ x: box.x + box.width + 18, y: box.y + box.height / 2 }, { x: boxes[index + 1].x - 18, y: box.y + box.height / 2 }, { marker: true, width: 5 })
    ),
    `<rect x="180" y="820" width="${width - 360}" height="94" rx="18" fill="#F7FBFF" stroke="${scene.theme.success}" stroke-width="3"/>`,
    textLabel("支撑保障  ·  反馈改进  ·  成果推广", width / 2, 878, { size: 30, fill: scene.theme.success, weight: 800 })
  ].join("\n");

  return svgDocument({ width, height, title: scene.title, content });
}

function renderStageRow(nodes: DiagramScene["nodes"], scene: DiagramScene) {
  if (!nodes.length) return [];
  const startX = 92;
  const y = 220;
  const width = 158;
  const height = 138;
  const gap = (840 - nodes.length * width) / Math.max(1, nodes.length - 1);
  return nodes.flatMap((node, index) => {
    const x = startX + index * (width + gap);
    return [
      renderRectNode({
        node,
        box: { x, y, width, height },
        fill: "#ffffff",
        titleFill: scene.theme.success,
        titleSize: 22,
        tagSize: 16,
        titleChars: 5,
        header: false
      }),
      `<circle cx="${x + width / 2}" cy="${y + height + 3}" r="25" fill="${scene.theme.success}"/>`,
      textLabel(String(index + 1).padStart(2, "0"), x + width / 2, y + height + 12, { size: 22, fill: "#ffffff", weight: 800 }),
      index < nodes.length - 1
        ? `<polygon points="${x + width + gap / 2 - 8},${y + height / 2 - 14} ${x + width + gap / 2 + 10},${y + height / 2} ${x + width + gap / 2 - 8},${y + height / 2 + 14}" fill="${scene.theme.success}"/>`
        : ""
    ];
  });
}

function renderSidePanel(title: string, nodes: DiagramScene["nodes"], box: { x: number; y: number; width: number; height: number }, color: string) {
  const itemHeight = 128;
  const gap = 28;
  return [
    `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="18" fill="#ffffff" stroke="#6EA8D9" stroke-width="3"/>`,
    `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="62" rx="18" fill="${color}"/>`,
    textLabel(title, box.x + box.width / 2, box.y + 41, { size: 27, fill: "#ffffff", weight: 800 }),
    ...nodes.slice(0, 3).map((node, index) =>
      renderRectNode({
        node,
        box: { x: box.x + 18, y: box.y + 88 + index * (itemHeight + gap), width: box.width - 36, height: itemHeight },
        fill: "#EAF4FF",
        stroke: "#B8D4F2",
        titleSize: 21,
        tagSize: 16,
        titleChars: 5,
        header: false
      })
    )
  ];
}

function renderSupportStrip(nodes: DiagramScene["nodes"], scene: DiagramScene) {
  const startX = 108;
  const y = 1212;
  const width = 184;
  const gap = 30;
  return nodes.slice(0, 4).map((node, index) =>
    renderRectNode({
      node: { ...node, tags: [] },
      box: { x: startX + index * (width + gap), y, width, height: 66 },
      fill: "#ffffff",
      stroke: "#B8D4F2",
      titleSize: 20,
      tagSize: 0,
      titleChars: 6,
      header: false
    })
  );
}

function renderHexCore(node: DiagramScene["nodes"][number], cx: number, cy: number, color: string) {
  const points = [
    [cx, cy - 70],
    [cx + 82, cy - 38],
    [cx + 82, cy + 38],
    [cx, cy + 70],
    [cx - 82, cy + 38],
    [cx - 82, cy - 38]
  ]
    .map((point) => point.join(","))
    .join(" ");
  const titleLines = wrapChineseText(node.title, 6, 3);
  const startY = cy - ((titleLines.length - 1) * 40) / 2 + 8;
  return [
    `<polygon points="${points}" fill="${color}" stroke="#083B7A" stroke-width="5"/>`,
    `<polygon points="${points}" fill="none" stroke="#ffffff" stroke-width="2" stroke-dasharray="8 8" opacity="0.75"/>`,
    ...titleLines.map((lineText, index) => textLabel(lineText, cx, startY + index * 44, { size: 32, fill: "#ffffff", weight: 800 }))
  ].join("\n");
}
