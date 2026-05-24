"use client";

import type { MouseEvent, ReactNode } from "react";

import type {
  TeachingArchitectureDiagramScene,
  TeachingArchitectureDiagramSceneNode,
  TeachingArchitectureSceneEdit
} from "@/lib/smart-tools/teaching-architecture-diagram/types";
import type { TeachingArchitectureVisualPreset } from "@/lib/smart-tools/teaching-architecture-diagram/prompts";
import { buildTeachingArchitectureOverlayLayout } from "@/lib/smart-tools/teaching-architecture-diagram/renderers/image-overlay-layout";
import type { NormalizedTextBox } from "@/lib/smart-tools/teaching-architecture-diagram/renderers/image-overlay-layout";
import { fitTextIntoBox } from "@/lib/smart-tools/teaching-architecture-diagram/renderers/text-fit";

type EditTarget =
  | {
      label: string;
      maxChars: number;
      edit: TeachingArchitectureSceneEdit;
    };
type EditHandler = (target: EditTarget, event: MouseEvent<SVGElement>) => void;

const FONT_FAMILY = "\"Microsoft YaHei\", \"SimHei\", \"Noto Sans CJK SC\", sans-serif";

export function TeachingArchitectureSvgTextEditor({
  backgroundImageDataUri,
  scene,
  visualPreset,
  onEditText
}: {
  backgroundImageDataUri?: string;
  scene: TeachingArchitectureDiagramScene;
  visualPreset?: TeachingArchitectureVisualPreset;
  onEditText: EditHandler;
}) {
  const overlayBoxes = backgroundImageDataUri ? buildTeachingArchitectureOverlayLayout({ scene, visualPreset }) : [];
  return (
    <svg
      data-teaching-architecture-svg="editor"
      className="h-full w-full select-none"
      viewBox={`0 0 ${scene.width} ${scene.height}`}
      role="img"
      aria-label={scene.title}
    >
      <defs>
        <marker id="editor-arrow-blue" markerWidth="14" markerHeight="14" refX="11" refY="7" orient="auto" markerUnits="strokeWidth">
          <path d="M 1 1 L 12 7 L 1 13 z" fill={scene.theme.primary} />
        </marker>
      </defs>
      <rect width={scene.width} height={scene.height} fill={scene.background || "#ffffff"} />
      {backgroundImageDataUri ? (
        <>
          <image href={backgroundImageDataUri} x={0} y={0} width={scene.width} height={scene.height} preserveAspectRatio="none" />
          <g data-layer="editable-text-overlays">
            {overlayBoxes.map((box) => (
              <OverlayEditableText key={box.id} box={box} scene={scene} onEditText={onEditText} />
            ))}
          </g>
        </>
      ) : (
        renderScene(scene, onEditText)
      )}
    </svg>
  );
}

function renderScene(scene: TeachingArchitectureDiagramScene, onEditText: EditHandler) {
  if (scene.layout === "closed_loop") return renderClosedLoop(scene, onEditText);
  if (scene.layout === "left_center_right_flow") return renderLeftRightFlow(scene, onEditText);
  if (scene.layout === "three_layer") return renderThreeLayer(scene, onEditText);
  if (scene.layout === "tree_module") return renderTreeModule(scene, onEditText);
  return renderCentralModel(scene, onEditText);
}

function renderTitle(scene: TeachingArchitectureDiagramScene, onEditText: EditHandler, y = 82, fontSize = 42) {
  return (
    <EditableText
      key="title"
      x={scene.width / 2}
      y={y}
      fontSize={fontSize}
      fontWeight={800}
      lines={wrapChineseText(scene.title, scene.width > 1200 ? 24 : 18, 2)}
      target={{ label: "总标题", maxChars: 40, edit: { targetType: "title", value: scene.title } }}
      onEditText={onEditText}
    />
  );
}

function renderClosedLoop(scene: TeachingArchitectureDiagramScene, onEditText: EditHandler) {
  const center = { x: scene.width / 2, y: scene.height / 2 + 40 };
  const centerRadius = 178;
  const ringRadiusX = 335;
  const ringRadiusY = 475;
  const nodeRadius = scene.nodes.length > 6 ? 112 : 124;
  const centerNode = scene.nodes.find((node) => node.role === "center") || scene.nodes[0];
  const mainNodes = scene.nodes.filter((node) => node.role !== "center").slice(0, 6);
  const positions = mainNodes.map((node, index) => {
    const angle = ((-90 + (360 / mainNodes.length) * index) * Math.PI) / 180;
    return {
      node,
      x: center.x + Math.cos(angle) * ringRadiusX,
      y: center.y + Math.sin(angle) * ringRadiusY,
      angle
    };
  });

  return (
    <>
      {renderTitle(scene, onEditText)}
      {positions.map((position) => {
        const unit = unitVector(center, position);
        return (
          <line
            key={`center-line-${position.node.id}`}
            x1={center.x + unit.x * (centerRadius + 8)}
            y1={center.y + unit.y * (centerRadius + 8)}
            x2={position.x - unit.x * (nodeRadius + 10)}
            y2={position.y - unit.y * (nodeRadius + 10)}
            stroke="#6B8FC8"
            strokeWidth={3}
            strokeLinecap="round"
            strokeDasharray="12 14"
          />
        );
      })}
      {positions.map((position, index) => {
        const next = positions[(index + 1) % positions.length];
        const startAngle = position.angle + 0.22;
        const endAngle = next.angle - 0.22;
        const start = { x: center.x + Math.cos(startAngle) * ringRadiusX, y: center.y + Math.sin(startAngle) * ringRadiusY };
        const end = { x: center.x + Math.cos(endAngle) * ringRadiusX, y: center.y + Math.sin(endAngle) * ringRadiusY };
        return (
          <path
            key={`loop-${position.node.id}`}
            d={`M ${start.x} ${start.y} A ${ringRadiusX} ${ringRadiusY} 0 0 1 ${end.x} ${end.y}`}
            fill="none"
            stroke={scene.theme.primary}
            strokeWidth={5}
            strokeLinecap="round"
            strokeLinejoin="round"
            markerEnd="url(#editor-arrow-blue)"
          />
        );
      })}
      <CircleNode node={centerNode} cx={center.x} cy={center.y} r={centerRadius} fill={scene.theme.secondary} titleSize={32} titleChars={8} titleLines={3} onEditText={onEditText} />
      {positions.map((position, index) => (
        <CircleNode
          key={position.node.id}
          node={position.node}
          cx={position.x}
          cy={position.y}
          r={nodeRadius}
          fill={index >= Math.max(0, positions.length - 2) ? "#FFF4E6" : "#ffffff"}
          titleSize={30}
          titleChars={6}
          onEditText={onEditText}
        />
      ))}
      {["诊断", "实施", "评价", "反馈", "改进"].slice(0, Math.max(0, positions.length - 1)).map((label, index) => {
        const from = positions[index];
        const to = positions[(index + 1) % positions.length];
        return (
          <ReadonlyText key={label} x={(from.x + to.x) / 2} y={(from.y + to.y) / 2 - 18} fontSize={22}>
            {label}
          </ReadonlyText>
        );
      })}
    </>
  );
}

function renderLeftRightFlow(scene: TeachingArchitectureDiagramScene, onEditText: EditHandler) {
  const mainNodes = scene.nodes.filter((node) => node.role !== "center").slice(0, 5);
  const moduleWidth = 250;
  const moduleHeight = 380;
  const gap = (scene.width - 96 * 2 - moduleWidth * mainNodes.length) / Math.max(1, mainNodes.length - 1);
  const top = 300;
  const boxes = mainNodes.map((node, index) => ({
    node,
    x: 96 + index * (moduleWidth + gap),
    y: top,
    width: moduleWidth,
    height: moduleHeight
  }));

  return (
    <>
      {renderTitle(scene, onEditText, 82, 48)}
      {boxes.map((box, index) => (
        <RectNode
          key={box.node.id}
          node={box.node}
          box={box}
          titleFill={index === 0 || index === boxes.length - 1 ? scene.theme.primary : "#DCEBFF"}
          titleColor={index === 0 || index === boxes.length - 1 ? "#ffffff" : scene.theme.text}
          titleSize={34}
          tagSize={26}
          titleChars={5}
          onEditText={onEditText}
        />
      ))}
      {boxes.slice(0, -1).map((box, index) => {
        const next = boxes[index + 1];
        const y = top + moduleHeight / 2;
        return <Path key={`arrow-${box.node.id}`} d={`M ${box.x + box.width + 28} ${y} L ${next.x - 28} ${y}`} width={6} />;
      })}
      {boxes.length ? (
        <>
          <Path
            d={`M ${boxes[boxes.length - 1].x + boxes[boxes.length - 1].width / 2} ${top + moduleHeight + 28} L ${boxes[boxes.length - 1].x + boxes[boxes.length - 1].width / 2} ${scene.height - 185} L ${boxes[0].x + boxes[0].width / 2} ${scene.height - 185} L ${boxes[0].x + boxes[0].width / 2} ${top + moduleHeight + 8}`}
            width={4}
            dashed
          />
          <rect x={scene.width / 2 - 190} y={scene.height - 230} width={380} height={82} rx={16} fill="#ffffff" stroke={scene.theme.primary} strokeWidth={3} strokeDasharray="10 10" />
          <EditableText
            x={scene.width / 2}
            y={scene.height - 178}
            fontSize={32}
            fontWeight={800}
            lines={[scene.edges.find((edge) => edge.type === "feedback")?.label || "评价反馈 · 持续改进"]}
            target={{
              label: "连线标签",
              maxChars: 8,
              edit: { targetType: "edgeLabel", edgeId: scene.edges.find((edge) => edge.type === "feedback")?.id || "edge-feedback", value: scene.edges.find((edge) => edge.type === "feedback")?.label || "评价反馈" }
            }}
            onEditText={onEditText}
          />
        </>
      ) : null}
    </>
  );
}

function renderCentralModel(scene: TeachingArchitectureDiagramScene, onEditText: EditHandler) {
  const isPortrait = scene.height > scene.width;
  const mainNodes = scene.nodes.filter((node) => node.role !== "center").slice(0, 6);
  const centerNode = scene.nodes.find((node) => node.role === "center") || scene.nodes[0];

  if (!isPortrait) return renderLandscapeCentralModel(scene, mainNodes, centerNode, onEditText);

  const stageNodes = mainNodes.slice(0, 5);
  const mechanismNodes = mainNodes.slice(1, 5);
  const leftNodes = [mainNodes[4], mainNodes[5]].filter(Boolean);
  const rightNodes = [mainNodes[0], mainNodes[2], mainNodes[3]].filter(Boolean);
  const supportNodes = [mainNodes[3], mainNodes[4], mainNodes[5], mainNodes[1]].filter(Boolean);
  const core = { x: scene.width / 2, y: 755 };
  const mechanismBoxes = [
    { node: mechanismNodes[0], x: 366, y: 485, width: 292, height: 126 },
    { node: mechanismNodes[1], x: 528, y: 655, width: 210, height: 132 },
    { node: mechanismNodes[2], x: 366, y: 905, width: 292, height: 126 },
    { node: mechanismNodes[3], x: 286, y: 655, width: 210, height: 132 }
  ].filter((item) => item.node);

  return (
    <>
      {renderTitle(scene, onEditText, 72, 38)}
      <rect x={62} y={128} width={900} height={1225} rx={22} fill="none" stroke="#9DB7D8" strokeWidth={2} strokeDasharray="12 10" />
      <rect x={94} y={148} width={188} height={48} rx={14} fill={scene.theme.primary} />
      <ReadonlyText x={188} y={181} fontSize={25} fill="#ffffff">建设路径</ReadonlyText>
      <StageRow nodes={stageNodes} scene={scene} onEditText={onEditText} />
      <rect x={272} y={430} width={480} height={670} rx={28} fill="#F7FBFF" stroke="#9DB7D8" strokeWidth={3} strokeDasharray="12 10" />
      <ReadonlyText x={scene.width / 2} y={468} fontSize={27} fill={scene.theme.primary}>协同共育核心机制</ReadonlyText>
      <path d="M 248 790 A 276 276 0 0 1 776 622" fill="none" stroke={scene.theme.success} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" markerEnd="url(#editor-arrow-blue)" />
      <path d="M 776 890 A 276 276 0 0 1 248 720" fill="none" stroke={scene.theme.success} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" markerEnd="url(#editor-arrow-blue)" />
      <ReadonlyText x={512} y={402} fontSize={24} fill={scene.theme.success}>数智驱动</ReadonlyText>
      <ReadonlyText x={812} y={760} fontSize={24} fill={scene.theme.accent}>反馈改进</ReadonlyText>
      <ReadonlyText x={512} y={1125} fontSize={24} fill={scene.theme.success}>持续优化</ReadonlyText>
      <ReadonlyText x={210} y={760} fontSize={24} fill={scene.theme.accent}>标准引领</ReadonlyText>
      <SidePanel title="驱动支撑" nodes={leftNodes} box={{ x: 72, y: 455, width: 196, height: 585 }} color={scene.theme.primary} onEditText={onEditText} />
      <SidePanel title="建设成效" nodes={rightNodes} box={{ x: 756, y: 455, width: 196, height: 585 }} color={scene.theme.primary} onEditText={onEditText} />
      {mechanismBoxes.map((box) => (
        <line key={`core-line-${box.node.id}`} x1={core.x} y1={core.y} x2={box.x + box.width / 2} y2={box.y + box.height / 2} stroke="#8AA9D6" strokeWidth={2} strokeLinecap="round" strokeDasharray="10 10" />
      ))}
      {mechanismBoxes.map((item, index) => (
        <RectNode
          key={`mechanism-${item.node.id}`}
          node={item.node}
          box={item}
          fill={index % 2 === 0 ? "#ffffff" : "#FFF4E6"}
          titleFill={index % 2 === 0 ? scene.theme.primary : scene.theme.accent}
          titleSize={25}
          tagSize={18}
          titleChars={6}
          header={false}
          onEditText={onEditText}
        />
      ))}
      <HexCore node={centerNode} x={core.x} y={core.y} color={scene.theme.primary} onEditText={onEditText} />
      <rect x={80} y={1165} width={864} height={130} rx={18} fill="#F7FBFF" stroke={scene.theme.primary} strokeWidth={3} />
      <rect x={420} y={1138} width={184} height={58} rx={14} fill={scene.theme.success} />
      <ReadonlyText x={512} y={1175} fontSize={28} fill="#ffffff">保障体系</ReadonlyText>
      <SupportStrip nodes={supportNodes} onEditText={onEditText} />
    </>
  );
}

function renderLandscapeCentralModel(
  scene: TeachingArchitectureDiagramScene,
  mainNodes: TeachingArchitectureDiagramSceneNode[],
  centerNode: TeachingArchitectureDiagramSceneNode,
  onEditText: EditHandler
) {
  const moduleWidth = 245;
  const moduleHeight = 170;
  const top = 325;
  const count = Math.min(mainNodes.length, 5);
  const gap = (scene.width - 120 * 2 - moduleWidth * count) / Math.max(1, count - 1);
  const boxes = mainNodes.slice(0, 5).map((node, index) => ({
    node,
    x: 120 + index * (moduleWidth + gap),
    y: top,
    width: moduleWidth,
    height: moduleHeight
  }));
  return (
    <>
      {renderTitle(scene, onEditText, 82, 44)}
      <rect x={80} y={170} width={scene.width - 160} height={scene.height - 280} rx={24} fill="none" stroke="#9DB7D8" strokeWidth={2} strokeDasharray="12 10" />
      <HexCore node={centerNode} x={scene.width / 2} y={660} color={scene.theme.primary} onEditText={onEditText} />
      {boxes.map((box, index) => (
        <RectNode
          key={box.node.id}
          node={box.node}
          box={box}
          fill={index % 2 ? "#FFF4E6" : "#ffffff"}
          titleFill={index % 2 ? scene.theme.accent : scene.theme.primary}
          titleSize={28}
          tagSize={21}
          titleChars={6}
          onEditText={onEditText}
        />
      ))}
      {boxes.slice(0, -1).map((box, index) => (
        <line key={`arrow-${box.node.id}`} x1={box.x + box.width + 18} y1={box.y + box.height / 2} x2={boxes[index + 1].x - 18} y2={box.y + box.height / 2} stroke={scene.theme.primary} strokeWidth={5} strokeLinecap="round" markerEnd="url(#editor-arrow-blue)" />
      ))}
      <rect x={180} y={820} width={scene.width - 360} height={94} rx={18} fill="#F7FBFF" stroke={scene.theme.success} strokeWidth={3} />
      <ReadonlyText x={scene.width / 2} y={878} fontSize={30} fill={scene.theme.success}>支撑保障  ·  反馈改进  ·  成果推广</ReadonlyText>
    </>
  );
}

function renderThreeLayer(scene: TeachingArchitectureDiagramScene, onEditText: EditHandler) {
  const mainNodes = scene.nodes.filter((node) => node.role !== "center").slice(0, 6);
  const layers = [
    { title: "目标牵引层", nodes: mainNodes.slice(0, 2), y: 205, fill: "#EAF4FF" },
    { title: "实施运行层", nodes: mainNodes.slice(2, 4), y: 470, fill: "#ffffff" },
    { title: "支撑保障层", nodes: mainNodes.slice(4), y: 735, fill: "#FFF4E6" }
  ].filter((layer) => layer.nodes.length);
  const layerX = 110;
  const layerWidth = scene.width - layerX * 2;
  const layerHeight = 210;
  return (
    <>
      {renderTitle(scene, onEditText, 78, 46)}
      {layers.map((layer) => (
        <g key={layer.title}>
          <rect x={layerX} y={layer.y} width={layerWidth} height={layerHeight} rx={22} fill={layer.fill} stroke={scene.theme.primary} strokeWidth={4} />
          <ReadonlyText x={layerX + 110} y={layer.y + 55} fontSize={30} fill={scene.theme.primary}>{layer.title}</ReadonlyText>
          {layer.nodes.map((node, index) => {
            const boxWidth = 280;
            const gap = 54;
            const startX = layerX + 250 + (layerWidth - 250 - layer.nodes.length * boxWidth - (layer.nodes.length - 1) * gap) / 2;
            return <RectNode key={node.id} node={node} box={{ x: startX + index * (boxWidth + gap), y: layer.y + 42, width: boxWidth, height: 130 }} header={false} titleSize={27} tagSize={20} titleChars={6} onEditText={onEditText} />;
          })}
        </g>
      ))}
      {layers.slice(0, -1).map((layer, index) => (
        <line key={`layer-arrow-${layer.title}`} x1={scene.width / 2} y1={layer.y + layerHeight + 15} x2={scene.width / 2} y2={layers[index + 1].y - 18} stroke={scene.theme.primary} strokeWidth={5} strokeLinecap="round" markerEnd="url(#editor-arrow-blue)" />
      ))}
    </>
  );
}

function renderTreeModule(scene: TeachingArchitectureDiagramScene, onEditText: EditHandler) {
  const centerNode = scene.nodes.find((node) => node.role === "center") || scene.nodes[0];
  const mainNodes = scene.nodes.filter((node) => node.role !== "center").slice(0, 5);
  const rootBox = { x: scene.width / 2 - 230, y: 180, width: 460, height: 150 };
  const branchY = 520;
  const childWidth = 245;
  const childHeight = 210;
  const gap = (scene.width - 120 * 2 - childWidth * mainNodes.length) / Math.max(1, mainNodes.length - 1);
  const boxes = mainNodes.map((node, index) => ({ node, x: 120 + index * (childWidth + gap), y: branchY, width: childWidth, height: childHeight }));
  const trunkY = 410;
  return (
    <>
      {renderTitle(scene, onEditText, 78, 46)}
      <RectNode node={centerNode} box={rootBox} fill="#EAF4FF" header={false} titleSize={31} tagSize={22} titleChars={9} onEditText={onEditText} />
      <line x1={scene.width / 2} y1={rootBox.y + rootBox.height} x2={scene.width / 2} y2={trunkY} stroke={scene.theme.primary} strokeWidth={4} strokeLinecap="round" />
      {boxes.length ? <line x1={boxes[0].x + boxes[0].width / 2} y1={trunkY} x2={boxes[boxes.length - 1].x + boxes[boxes.length - 1].width / 2} y2={trunkY} stroke={scene.theme.primary} strokeWidth={4} strokeLinecap="round" /> : null}
      {boxes.map((box) => (
        <g key={box.node.id}>
          <line x1={box.x + box.width / 2} y1={trunkY} x2={box.x + box.width / 2} y2={box.y - 16} stroke={scene.theme.primary} strokeWidth={4} strokeLinecap="round" markerEnd="url(#editor-arrow-blue)" />
          <RectNode node={box.node} box={box} titleSize={28} tagSize={21} titleChars={5} onEditText={onEditText} />
        </g>
      ))}
    </>
  );
}

function StageRow({
  nodes,
  onEditText,
  scene
}: {
  nodes: TeachingArchitectureDiagramSceneNode[];
  scene: TeachingArchitectureDiagramScene;
  onEditText: EditHandler;
}) {
  if (!nodes.length) return null;
  const startX = 92;
  const y = 220;
  const width = 158;
  const height = 138;
  const gap = (840 - nodes.length * width) / Math.max(1, nodes.length - 1);
  return (
    <>
      {nodes.map((node, index) => {
        const x = startX + index * (width + gap);
        return (
          <g key={`stage-${node.id}`}>
            <RectNode node={node} box={{ x, y, width, height }} fill="#ffffff" header={false} titleSize={22} tagSize={16} titleChars={5} onEditText={onEditText} />
            <circle cx={x + width / 2} cy={y + height + 3} r={25} fill={scene.theme.success} />
            <ReadonlyText x={x + width / 2} y={y + height + 12} fontSize={22} fill="#ffffff">
              {String(index + 1).padStart(2, "0")}
            </ReadonlyText>
            {index < nodes.length - 1 ? (
              <polygon
                points={`${x + width + gap / 2 - 8},${y + height / 2 - 14} ${x + width + gap / 2 + 10},${y + height / 2} ${x + width + gap / 2 - 8},${y + height / 2 + 14}`}
                fill={scene.theme.success}
              />
            ) : null}
          </g>
        );
      })}
    </>
  );
}

function SidePanel({
  box,
  color,
  nodes,
  onEditText,
  title
}: {
  box: { x: number; y: number; width: number; height: number };
  color: string;
  nodes: TeachingArchitectureDiagramSceneNode[];
  onEditText: EditHandler;
  title: string;
}) {
  const itemHeight = 128;
  const gap = 28;
  return (
    <g>
      <rect x={box.x} y={box.y} width={box.width} height={box.height} rx={18} fill="#ffffff" stroke="#6EA8D9" strokeWidth={3} />
      <rect x={box.x} y={box.y} width={box.width} height={62} rx={18} fill={color} />
      <ReadonlyText x={box.x + box.width / 2} y={box.y + 41} fontSize={27} fill="#ffffff">
        {title}
      </ReadonlyText>
      {nodes.slice(0, 3).map((node, index) => (
        <RectNode
          key={`side-${title}-${node.id}`}
          node={node}
          box={{ x: box.x + 18, y: box.y + 88 + index * (itemHeight + gap), width: box.width - 36, height: itemHeight }}
          fill="#EAF4FF"
          header={false}
          titleSize={21}
          tagSize={16}
          titleChars={5}
          onEditText={onEditText}
        />
      ))}
    </g>
  );
}

function SupportStrip({
  nodes,
  onEditText
}: {
  nodes: TeachingArchitectureDiagramSceneNode[];
  onEditText: EditHandler;
}) {
  const startX = 108;
  const y = 1212;
  const width = 184;
  const gap = 30;
  return (
    <>
      {nodes.slice(0, 4).map((node, index) => (
        <RectNode
          key={`support-${node.id}`}
          node={{ ...node, tags: [] }}
          box={{ x: startX + index * (width + gap), y, width, height: 66 }}
          fill="#ffffff"
          header={false}
          titleSize={20}
          tagSize={16}
          titleChars={6}
          onEditText={onEditText}
        />
      ))}
    </>
  );
}

function HexCore({
  color,
  node,
  onEditText,
  x,
  y
}: {
  color: string;
  node: TeachingArchitectureDiagramSceneNode;
  onEditText: EditHandler;
  x: number;
  y: number;
}) {
  const points = [
    [x, y - 70],
    [x + 82, y - 38],
    [x + 82, y + 38],
    [x, y + 70],
    [x - 82, y + 38],
    [x - 82, y - 38]
  ]
    .map((point) => point.join(","))
    .join(" ");
  return (
    <g>
      <polygon points={points} fill={color} stroke="#083B7A" strokeWidth={5} />
      <polygon points={points} fill="none" stroke="#ffffff" strokeWidth={2} strokeDasharray="8 8" opacity={0.75} />
      <EditableText
        x={x}
        y={y + 10}
        fontSize={32}
        fontWeight={800}
        fill="#ffffff"
        lines={wrapChineseText(node.title, 6, 3)}
        target={{ label: "节点标题", maxChars: 16, edit: { targetType: "nodeTitle", nodeId: node.id, value: node.title } }}
        onEditText={onEditText}
      />
    </g>
  );
}

function CircleNode(props: { node: TeachingArchitectureDiagramSceneNode; cx: number; cy: number; r: number; fill: string; titleSize: number; titleChars: number; titleLines?: number; onEditText: EditHandler }) {
  return (
    <g>
      <circle cx={props.cx} cy={props.cy} r={props.r} fill={props.fill} stroke="#0B4EA2" strokeWidth={4} />
      <NodeText node={props.node} x={props.cx} y={props.cy} titleSize={props.titleSize} titleChars={props.titleChars} titleLines={props.titleLines} onEditText={props.onEditText} />
    </g>
  );
}

function RectNode(props: { node: TeachingArchitectureDiagramSceneNode; box: { x: number; y: number; width: number; height: number }; fill?: string; titleFill?: string; titleColor?: string; titleSize: number; tagSize: number; titleChars: number; header?: boolean; onEditText: EditHandler }) {
  const header = props.header !== false;
  const headerHeight = header ? Math.min(90, props.box.height * 0.28) : 0;
  const titleY = props.box.y + (headerHeight ? headerHeight / 2 + props.titleSize / 3 : 46);
  const tagStartY = props.box.y + (headerHeight ? headerHeight + 58 : 104);
  return (
    <g>
      <rect x={props.box.x} y={props.box.y} width={props.box.width} height={props.box.height} rx={18} fill={props.fill || "#ffffff"} stroke="#0B4EA2" strokeWidth={4} />
      {headerHeight ? <rect x={props.box.x + 14} y={props.box.y + 14} width={props.box.width - 28} height={headerHeight - 20} rx={10} fill={props.titleFill || "#0B4EA2"} /> : null}
      <EditableText
        x={props.box.x + props.box.width / 2}
        y={titleY}
        fontSize={props.titleSize}
        fontWeight={800}
        fill={headerHeight ? props.titleColor || "#ffffff" : "#111827"}
        lines={wrapChineseText(props.node.title, props.titleChars, 2)}
        target={{ label: "节点标题", maxChars: 16, edit: { targetType: "nodeTitle", nodeId: props.node.id, value: props.node.title } }}
        onEditText={props.onEditText}
      />
      {props.node.tags.slice(0, 2).map((tag, index) => (
        <EditableText
          key={`${props.node.id}-tag-${index}`}
          x={props.box.x + props.box.width / 2}
          y={tagStartY + index * (props.tagSize + 26)}
          fontSize={props.tagSize}
          fontWeight={600}
          lines={wrapChineseText(tag, 8, 1)}
          target={{ label: "节点标签", maxChars: 12, edit: { targetType: "nodeTag", nodeId: props.node.id, tagIndex: index, value: tag } }}
          onEditText={props.onEditText}
        />
      ))}
    </g>
  );
}

function NodeText(props: { node: TeachingArchitectureDiagramSceneNode; x: number; y: number; titleSize: number; titleChars: number; titleLines?: number; onEditText: EditHandler }) {
  const titleLines = wrapChineseText(props.node.title, props.titleChars, props.titleLines || 2);
  const tagLines = props.node.tags.slice(0, 2).map((tag, index) => ({ tag, index, lines: wrapChineseText(tag, 7, 1) }));
  const tagSize = 22;
  const titleBlockHeight = titleLines.length * (props.titleSize + 6);
  const tagBlockHeight = tagLines.length ? tagLines.length * (tagSize + 8) + 12 : 0;
  const startY = props.y - (titleBlockHeight + tagBlockHeight) / 2 + props.titleSize;
  return (
    <>
      <EditableText
        x={props.x}
        y={startY}
        fontSize={props.titleSize}
        fontWeight={800}
        lines={titleLines}
        target={{ label: "节点标题", maxChars: 16, edit: { targetType: "nodeTitle", nodeId: props.node.id, value: props.node.title } }}
        onEditText={props.onEditText}
      />
      {tagLines.map((item, index) => (
        <EditableText
          key={`${props.node.id}-tag-${item.index}`}
          x={props.x}
          y={startY + titleBlockHeight + 12 + index * (tagSize + 8)}
          fontSize={tagSize}
          fontWeight={500}
          lines={item.lines}
          target={{ label: "节点标签", maxChars: 12, edit: { targetType: "nodeTag", nodeId: props.node.id, tagIndex: item.index, value: item.tag } }}
          onEditText={props.onEditText}
        />
      ))}
    </>
  );
}

function OverlayEditableText({
  box,
  scene,
  onEditText
}: {
  box: NormalizedTextBox;
  scene: TeachingArchitectureDiagramScene;
  onEditText: EditHandler;
}) {
  const abs = {
    x: box.x * scene.width,
    y: box.y * scene.height,
    width: box.width * scene.width,
    height: box.height * scene.height
  };
  const role = box.role || "module";
  const fitted = fitTextIntoBox({
    text: box.text,
    boxWidth: Math.max(1, abs.width - 10),
    boxHeight: Math.max(1, abs.height - 8),
    role
  });
  const textAnchor = box.align === "start" ? "start" : box.align === "end" ? "end" : "middle";
  const textX = box.align === "start" ? abs.x + 6 : box.align === "end" ? abs.x + abs.width - 6 : abs.x + abs.width / 2;
  const blockHeight = fitted.lines.length * fitted.lineHeight;
  const startY =
    box.valign === "top"
      ? abs.y + 6 + fitted.fontSize
      : box.valign === "bottom"
        ? abs.y + abs.height - blockHeight + fitted.fontSize - 6
        : abs.y + (abs.height - blockHeight) / 2 + fitted.fontSize * 0.82;
  const target = toEditTarget(box);

  return (
    <g
      data-editable="true"
      data-editable-path={box.editablePath}
      data-editable-kind={box.edit.targetType}
      className="cursor-text"
      onClick={(event) => onEditText(target, event)}
    >
      {box.cover !== false ? (
        <rect
          x={abs.x}
          y={abs.y}
          width={abs.width}
          height={abs.height}
          rx={box.radius ?? 8}
          fill={box.coverFill || "#ffffff"}
          opacity={box.coverOpacity ?? 0.92}
          pointerEvents="all"
        />
      ) : null}
      <text
        x={textX}
        y={startY}
        textAnchor={textAnchor}
        fontFamily={FONT_FAMILY}
        fontSize={fitted.fontSize}
        fontWeight={box.fontWeight || 800}
        fill={box.textFill || "#0f172a"}
        pointerEvents="none"
        style={{ textRendering: "geometricPrecision" }}
      >
        {fitted.lines.map((line, index) => (
          <tspan key={`${box.id}-${index}`} x={textX} y={startY + index * fitted.lineHeight}>
            {line}
          </tspan>
        ))}
      </text>
    </g>
  );
}

function toEditTarget(box: NormalizedTextBox): EditTarget {
  const maxChars =
    box.edit.targetType === "title"
      ? 40
      : box.edit.targetType === "nodeTitle"
        ? 16
        : box.edit.targetType === "nodeTag"
          ? 12
          : 8;
  return {
    label: box.label,
    maxChars,
    edit: box.edit
  };
}

function EditableText(props: { x: number; y: number; lines: string[]; fontSize: number; fontWeight: number; fill?: string; target: EditTarget; onEditText: EditHandler }) {
  return (
    <text
      data-edit-target={props.target.label}
      x={props.x}
      y={props.y}
      textAnchor="middle"
      fontFamily={FONT_FAMILY}
      fontSize={props.fontSize}
      fontWeight={props.fontWeight}
      fill={props.fill || "#111827"}
      className="cursor-text"
      style={{ textRendering: "geometricPrecision" }}
      onClick={(event) => props.onEditText(props.target, event)}
    >
      {props.lines.map((line, index) => (
        <tspan key={`${line}-${index}`} x={props.x} dy={index === 0 ? 0 : props.fontSize + 8}>
          {line}
        </tspan>
      ))}
    </text>
  );
}

function ReadonlyText(props: { x: number; y: number; fontSize: number; fill?: string; children: ReactNode }) {
  return (
    <text x={props.x} y={props.y} textAnchor="middle" fontFamily={FONT_FAMILY} fontSize={props.fontSize} fontWeight={800} fill={props.fill || "#4B5563"}>
      {props.children}
    </text>
  );
}

function Path({ d, width, dashed }: { d: string; width: number; dashed?: boolean }) {
  return <path d={d} fill="none" stroke="#0B4EA2" strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={dashed ? "12 14" : undefined} markerEnd="url(#editor-arrow-blue)" />;
}

function wrapChineseText(text: string, maxCharsPerLine: number, maxLines: number) {
  const chars = Array.from((text || "").replace(/\s+/g, ""));
  const lines: string[] = [];
  for (let index = 0; index < chars.length && lines.length < maxLines; index += maxCharsPerLine) {
    lines.push(chars.slice(index, index + maxCharsPerLine).join(""));
  }
  if (chars.length > maxCharsPerLine * maxLines && lines.length) {
    const last = Array.from(lines[lines.length - 1]);
    lines[lines.length - 1] = `${last.slice(0, Math.max(1, maxCharsPerLine - 1)).join("")}…`;
  }
  return lines.length ? lines : [""];
}

function unitVector(from: { x: number; y: number }, to: { x: number; y: number }) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.sqrt(dx * dx + dy * dy) || 1;
  return { x: dx / distance, y: dy / distance };
}
