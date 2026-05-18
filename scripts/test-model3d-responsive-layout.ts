import { readFileSync } from "node:fs";

function read(path: string) {
  return readFileSync(path, "utf8");
}

function assertIncludes(text: string, needle: string, message: string) {
  if (!text.includes(needle)) throw new Error(message);
}

function assertMatches(text: string, pattern: RegExp, message: string) {
  if (!pattern.test(text)) throw new Error(message);
}

const globals = read("app/globals.css");
const page = read("components/model3d/model3d-page.tsx");
const parameterPanel = read("components/model3d/model3d-parameter-panel.tsx");
const historyPanel = read("components/model3d/model3d-history-panel.tsx");
const viewer = read("components/model3d/model3d-viewer.tsx");
const viewport = read("components/model3d/three-model-viewport.tsx");

assertIncludes(page, "model3d-workspace", "3D page should expose a workspace layout hook.");
assertIncludes(page, "model3d-left-panel", "3D page should expose a left panel layout hook.");
assertIncludes(page, "model3d-right-panel", "3D page should expose a right panel layout hook.");
assertIncludes(page, "leftPanelCollapsed", "3D page should support manual left panel collapsing.");
assertIncludes(page, "matchMedia(\"(max-width: 1199px)\")", "3D page should auto-collapse the left panel on low-resolution screens.");
assertIncludes(page, "data-left-collapsed", "3D workspace should expose collapsed state to CSS.");
assertIncludes(page, "model3d-left-collapse-button", "3D workspace should render a manual collapse/expand control.");
assertIncludes(page, "model3d-collapsed-left-panel", "3D workspace should render a compact collapsed left rail.");
assertIncludes(viewer, "model3d-viewer-panel", "3D viewer should expose a canvas panel hook.");

assertIncludes(globals, "--m3d-left-panel-width", "Responsive CSS should define adaptive left panel width.");
assertIncludes(globals, "--m3d-right-panel-width", "Responsive CSS should define adaptive right panel width.");
assertIncludes(globals, "--m3d-left-collapsed-width", "Responsive CSS should define a collapsed left panel width.");
assertMatches(globals, /grid-template-columns:[\s\S]*minmax\(220px,\s*var\(--m3d-left-panel-width\)\)[\s\S]*minmax\(var\(--m3d-canvas-min-width\),\s*1fr\)/, "Workspace should keep the central canvas in a minmax(0/usable, 1fr) track.");
assertMatches(globals, /data-left-collapsed="true"[\s\S]*grid-template-columns:\s*var\(--m3d-left-collapsed-width\)\s*minmax\(var\(--m3d-canvas-min-width\),\s*1fr\)/, "Collapsed workspace should let the canvas extend into the left panel space.");
assertMatches(globals, /@media \(min-width: 1200px\)[\s\S]*model3d-right-panel[\s\S]*display: block !important/, "Right asset panel should reappear only when viewport is wide enough.");
assertMatches(globals, /@media \(max-width: 1199px\)[\s\S]*model3d-right-panel[\s\S]*display: none !important/, "Right asset panel should collapse on small workspaces.");
assertMatches(globals, /@media \(max-width: 1439px\)[\s\S]*--m3d-icon-size:\s*0\.875rem/, "Compact mode should shrink icon sizes below 1440px.");
assertMatches(globals, /model3d-prompt-box[\s\S]*height:\s*6\.75rem !important/, "Compact mode should compress prompt input height.");
assertMatches(globals, /model3d-upload-tile[\s\S]*height:\s*5\.25rem !important/, "Compact mode should compress upload cards.");
assertMatches(globals, /model3d-viewport-stats[\s\S]*display:\s*none !important/, "Compact mode should hide secondary canvas stats.");

assertIncludes(parameterPanel, "model3d-parameter-panel", "Parameter panel should opt into compact CSS.");
assertIncludes(parameterPanel, "model3d-setting-card", "Setting cards should opt into compact CSS.");
assertIncludes(parameterPanel, "model3d-generate-button", "Generate button should opt into compact CSS.");
assertIncludes(historyPanel, "model3d-asset-grid", "Asset grid should opt into compact CSS.");
assertIncludes(historyPanel, "model3d-asset-card", "Asset cards should opt into compact CSS.");
assertIncludes(viewer, "model3d-material-dock", "Viewer bottom dock should opt into compact CSS.");
assertIncludes(viewport, "ResizeObserver", "Canvas viewport should resize when the adaptive layout changes.");

function clamp(min: number, preferred: number, max: number) {
  return Math.min(Math.max(preferred, min), max);
}

function estimateLayout(width: number) {
  const rem = 16;
  const gap = width <= 1439 ? 0.5 * rem : 0.75 * rem;
  const large = width >= 1800;
  const mid = width <= 1799;
  let left = clamp(220, width * 0.23, 360);
  let right = clamp(200, width * 0.21, 340);
  let rightVisible = width >= 1200;
  if (large) {
    left = clamp(320, width * 0.18, 360);
    right = clamp(300, width * 0.17, 340);
  } else if (mid) {
    left = clamp(260, width * 0.2, 300);
    right = clamp(240, width * 0.18, 280);
  }
  if (width <= 1199) {
    left = clamp(220, width * 0.24, 250);
    rightVisible = false;
  }
  const canvas = width - left - (rightVisible ? right : 0) - (rightVisible ? gap * 2 : gap);
  return { canvas, left, right: rightVisible ? right : 0, rightVisible };
}

function estimateCollapsedLayout(width: number) {
  const rem = 16;
  const gap = width <= 1439 ? 0.5 * rem : 0.75 * rem;
  const rightVisible = width >= 1200;
  const right = rightVisible ? (width >= 1800 ? clamp(300, width * 0.17, 340) : clamp(240, width * 0.18, 280)) : 0;
  const left = 52;
  const canvas = width - left - right - (rightVisible ? gap * 2 : gap);
  return { canvas, left, right, rightVisible };
}

const viewportExpectations = [
  { width: 1920, minCanvas: 1200, rightVisible: true },
  { width: 1536, minCanvas: 900, rightVisible: true },
  { width: 1366, minCanvas: 800, rightVisible: true },
  { width: 1280, minCanvas: 720, rightVisible: true },
  { width: 1024, minCanvas: 700, rightVisible: false }
];

const viewportResults = viewportExpectations.map((item) => {
  const estimated = estimateLayout(item.width);
  const collapsed = estimateCollapsedLayout(item.width);
  return {
    ...item,
    collapsedCanvas: collapsed.canvas,
    estimatedRightVisible: estimated.rightVisible,
    canvas: estimated.canvas,
    left: estimated.left,
    right: estimated.right
  };
});
for (const item of viewportResults) {
  if (item.canvas < item.minCanvas) {
    throw new Error(`Estimated ${item.width}px canvas is too narrow: ${JSON.stringify(item)}`);
  }
  if (item.estimatedRightVisible !== item.rightVisible) {
    throw new Error(`Estimated right panel visibility is wrong: ${JSON.stringify(item)}`);
  }
  if (item.collapsedCanvas <= item.canvas) {
    throw new Error(`Collapsed left panel should increase canvas width: ${JSON.stringify(item)}`);
  }
}
assertMatches(globals, /@media \(max-width: 1023px\)[\s\S]*model3d-viewer-panel[\s\S]*min-height:\s*min\(66vh,\s*520px\)/, "Tiny viewport should keep a usable canvas height.");

console.log(JSON.stringify({ ok: true, viewportResults }, null, 2));
