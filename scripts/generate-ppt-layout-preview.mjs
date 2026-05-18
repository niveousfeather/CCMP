import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

function read(path) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function compileLocalModule(entryPath, modules) {
  const tempRoot = resolve(tmpdir(), `nexus-ppt-preview-${Date.now()}`);
  const resolved = new Map();

  function resolveImport(fromPath, specifier) {
    if (specifier.startsWith("@/")) return resolve(process.cwd(), specifier.slice(2));
    if (specifier.startsWith(".")) return resolve(dirname(fromPath), specifier);
    return null;
  }

  function resolveTsPath(pathWithoutExtension) {
    for (const candidate of [pathWithoutExtension, `${pathWithoutExtension}.ts`, `${pathWithoutExtension}.tsx`]) {
      if (modules.some((modulePath) => resolve(process.cwd(), modulePath) === candidate)) return candidate;
    }
    return null;
  }

  function visit(filePath) {
    const fullPath = filePath.endsWith(".ts") || filePath.endsWith(".tsx") ? filePath : resolveTsPath(filePath);
    if (!fullPath || resolved.has(fullPath)) return;
    const relative = fullPath.slice(process.cwd().length + 1).replace(/\\/g, "/");
    if (!modules.includes(relative)) throw new Error(`Unexpected module import: ${relative}`);
    const source = read(relative);
    resolved.set(fullPath, source);
    for (const match of source.matchAll(/from\s+["']([^"']+)["']/g)) {
      const next = resolveImport(fullPath, match[1]);
      if (next) visit(next);
    }
  }

  visit(resolve(process.cwd(), entryPath));

  for (const [sourcePath, source] of resolved) {
    const output = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ES2022,
        target: ts.ScriptTarget.ES2022,
        moduleResolution: ts.ModuleResolutionKind.Bundler
      }
    }).outputText;
    const relative = sourcePath.slice(process.cwd().length + 1).replace(/\\/g, "/").replace(/\.(ts|tsx)$/, ".mjs");
    const outputPath = resolve(tempRoot, relative);
    mkdirSync(dirname(outputPath), { recursive: true });
    let rewritten = output;
    for (const modulePath of modules) {
      const tsPath = modulePath.replace(/\\/g, "/");
      const withoutExt = tsPath.replace(/\.(ts|tsx)$/, "");
      const mjsPath = `/${withoutExt}.mjs`;
      rewritten = rewritten
        .replaceAll(`"@/${withoutExt}"`, `"${pathToFileURL(resolve(tempRoot, mjsPath.slice(1))).href}"`)
        .replaceAll(`'@/${withoutExt}'`, `'${pathToFileURL(resolve(tempRoot, mjsPath.slice(1))).href}'`);
    }
    writeFileSync(outputPath, rewritten);
  }

  return {
    entryUrl: pathToFileURL(resolve(tempRoot, entryPath.replace(/\.(ts|tsx)$/, ".mjs"))).href,
    cleanup: () => rmSync(tempRoot, { recursive: true, force: true })
  };
}

const compiled = compileLocalModule("lib/presentation/providers/local.ts", [
  "lib/presentation/providers/local.ts",
  "lib/presentation/types.ts"
]);

try {
  const { createLocalPresentationProvider } = await import(compiled.entryUrl);
  const provider = createLocalPresentationProvider();
  const generated = await provider.generate({
    deck: {
      title: "三维动画教学 第一章",
      subtitle: "动画基础理论与核心工作流",
      theme: "clean_education",
      slides: [
        { type: "cover", title: "三维动画教学：第一章", subtitle: "动画基础理论与核心工作流", visualBrief: "3D animation learning workstation" },
        { type: "agenda", title: "课程目录", bullets: ["三维动画概述", "经典动画十二法则", "关键帧与插值技术", "标准制作流程"] },
        {
          type: "content",
          title: "三维动画概述",
          bullets: ["定义：在虚拟三维空间中构建模型并按时间驱动运动", "核心要素：模型、骨骼、权重、材质与渲染", "应用领域：影视、游戏开发、工业仿真与广告制作", "空间逻辑：理解 XYZ 轴向及镜头运动关系"],
          visualBrief: "3D animation studio"
        },
        {
          type: "content",
          title: "经典动画十二法则（3D 应用）",
          bullets: ["挤压与拉伸：体现物体的质量、重量感与柔韧性", "预备动作：引导观众注意力，增强动作的逻辑性与真实性", "节奏与间距：通过关键帧控制动作速度和力度层次", "跟随与重叠：处理肢体末端的延迟动作，增强动画灵动性"],
          visualBrief: "animation principles"
        },
        { type: "cards", title: "关键帧与插值技术", bullets: ["关键帧：定义动作起始、结束及转折点", "插值曲线：控制中间帧的速度变化", "曲线编辑器：通过缓入缓出塑造节奏", "线性插值：用于机械、匀速或特殊风格运动"] },
        { type: "timeline", title: "三维动画标准制作流程", bullets: ["前期策划", "角色绑定", "动画实施", "渲染输出", "合成校验"] },
        { type: "closing", title: "感谢观看", subtitle: "Q&A / 课后练习安排" }
      ]
    }
  });
  const output = resolve(process.cwd(), "tmp/ppt-layout-preview.pptx");
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, generated.buffer);
  console.log(JSON.stringify({ ok: true, output }, null, 2));
} finally {
  compiled.cleanup();
}
