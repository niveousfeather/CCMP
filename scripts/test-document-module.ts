import { createDocxBuffer } from "@/lib/document/create";
import { planDocumentTask } from "@/lib/document/planner";

const markdown = `# 测试文档

这是一份用于验证 NexusAI Word 独立模块的文档。

## 核心能力

- 从 Markdown 生成 DOCX
- 应用正式文档样式
- 保留后续批注修订扩展入口

| 模块 | 状态 |
| --- | --- |
| Word 生成 | 已接入 |
| 批注修订 | 已预留 |
`;

const plan = planDocumentTask({
  userId: "test-user",
  title: "NexusAI Word 模块验证",
  markdown,
  fileName: "NexusAI Word 模块验证"
});

const buffer = createDocxBuffer({
  markdown,
  title: plan.title,
  template: plan.template
});

const zipHeaderOk = buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
const hasDocumentXml = buffer.includes(Buffer.from("word/document.xml"));
const hasStylesXml = buffer.includes(Buffer.from("word/styles.xml"));

if (!zipHeaderOk || !hasDocumentXml || !hasStylesXml) {
  throw new Error(
    `Document module verification failed: zipHeaderOk=${zipHeaderOk}, hasDocumentXml=${hasDocumentXml}, hasStylesXml=${hasStylesXml}`
  );
}

console.log(
  JSON.stringify(
    {
      ok: true,
      bytes: buffer.length,
      mode: plan.mode,
      template: plan.template,
      reportItems: plan.report.length
    },
    null,
    2
  )
);
