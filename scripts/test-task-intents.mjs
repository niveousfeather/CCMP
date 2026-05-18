import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

const source = readFileSync(resolve(process.cwd(), "lib/agent/task-intents.ts"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022
  }
}).outputText;

const module = { exports: {} };
const evaluator = new Function(
  "exports",
  "module",
  compiled
);
evaluator(module.exports, module);
const { getExplicitFileGenerationTool, isFunctionalArtifactTask } = module.exports;

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

function assertFalse(actual, label) {
  if (actual) throw new Error(`${label}: expected false`);
}

assertEqual(getExplicitFileGenerationTool("帮我做一个关于三维动画的10页商务汇报PPT，给领导看"), "ppt", "PPT generation");
assertEqual(getExplicitFileGenerationTool("生成一份产品介绍 PPT"), "ppt", "spaced PPT generation");
assertEqual(getExplicitFileGenerationTool("帮我生成一个三维动画教学的教案，主要讲第一章节，动画规律"), "write", "lesson plan generation");
assertEqual(getExplicitFileGenerationTool("设计一份三维动画课程教学设计"), "write", "teaching design generation");
assertEqual(getExplicitFileGenerationTool("帮我整理一份项目方案 Word"), "write", "Word generation");
assertEqual(getExplicitFileGenerationTool("教案怎么写？"), null, "lesson-plan file classifier should stay chat");
assertFalse(isFunctionalArtifactTask("你好"), "greeting should stay chat");
assertFalse(isFunctionalArtifactTask("教案怎么写？"), "lesson-plan question should stay chat");
assertFalse(isFunctionalArtifactTask("PPT怎么做？"), "presentation how-to question should stay chat");
assertFalse(isFunctionalArtifactTask("联网查一下今天的行业新闻"), "web research should stay chat");

console.log(JSON.stringify({ ok: true }, null, 2));
