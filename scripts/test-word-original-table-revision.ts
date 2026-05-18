import { applyParagraphRevisions, extractEditableParagraphs } from "@/lib/document/docx-paragraphs";

function assert(condition: unknown, label: string): asserts condition {
  if (!condition) throw new Error(label);
}

function paragraph(text: string, style?: string) {
  const styleXml = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : "";
  return `<w:p>${styleXml}<w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
}

function main() {
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${paragraph("旧标题：社区活动方案", "Title")}
    ${paragraph("二、执行安排", "Heading1")}
    ${paragraph("报名、物资、宣传需要进一步梳理。")}
    ${paragraph("三、反馈方式", "Heading1")}
    ${paragraph("活动结束后收集居民意见。")}
    <w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr>
  </w:body>
</w:document>`;

  const paragraphs = extractEditableParagraphs(documentXml);
  const title = paragraphs.find((item) => item.text.includes("旧标题"));
  const arrangement = paragraphs.find((item) => item.text.includes("报名、物资、宣传"));

  assert(title, "Expected editable title paragraph");
  assert(arrangement, "Expected editable arrangement paragraph");

  const result = applyParagraphRevisions(
    documentXml,
    paragraphs,
    [{ paragraphIndex: title.paragraphIndex, revisedText: "社区志愿服务活动实施方案" }],
    [
      {
        paragraphIndex: arrangement.paragraphIndex,
        headers: ["事项", "负责人", "时间节点"],
        rows: [
          ["报名分组", "社区办公室", "第1周"],
          ["物资准备", "后勤协调人", "活动前3天"],
          ["宣传发布", "宣传负责人", "活动前1周"]
        ]
      }
    ]
  );

  assert(result.revisedCount === 2, `Expected two applied revisions, got ${result.revisedCount}`);
  assert(result.documentXml.includes("社区志愿服务活动实施方案"), "Expected paragraph revision to remain applied");
  assert(result.documentXml.includes("<w:tbl>"), "Expected structural table XML");
  assert(result.documentXml.includes("事项"), "Expected table header");
  assert(result.documentXml.includes("报名分组"), "Expected table row content");
  assert(!result.documentXml.includes("报名、物资、宣传需要进一步梳理。"), "Expected source paragraph to be replaced");
  assert(!result.documentXml.includes("<w:numPr>"), "Table conversion should not introduce list numbering");

  console.log(JSON.stringify({ ok: true, revisedCount: result.revisedCount }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
