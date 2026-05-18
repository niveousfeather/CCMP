import { parseDocxPackage } from "@/lib/document/docx-package";
import { applyParagraphRevisions, extractEditableParagraphs } from "@/lib/document/docx-paragraphs";
import { clearDocxCommentsPackageEntries } from "@/lib/document/docx-comments";
import { makeZip } from "@/lib/document/zip";

function assert(condition: unknown, label: string): asserts condition {
  if (!condition) throw new Error(label);
}

function paragraph(text: string, style?: string) {
  const styleXml = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : "";
  return `<w:p>${styleXml}<w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
}

function textFromXml(xml: string) {
  return xml.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function fixtureBuffer() {
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    ${paragraph("复杂项目实施方案", "Title")}
    ${paragraph("一、项目背景", "Heading1")}
    ${paragraph("本段保持不变，用于验证只修改指定章节。")}
    ${paragraph("二、执行安排", "Heading1")}
    ${paragraph("执行安排需要扩写报名分组、物资准备和现场协调。")}
    ${paragraph("三、预算明细", "Heading1")}
    <w:tbl>
      <w:tblPr><w:tblW w:w="9026" w:type="dxa"/></w:tblPr>
      <w:tblGrid><w:gridCol w:w="1800"/><w:gridCol w:w="3600"/><w:gridCol w:w="1800"/><w:gridCol w:w="1826"/></w:tblGrid>
      <w:tr>
        <w:tc>${paragraph("类别")}</w:tc>
        <w:tc>${paragraph("说明")}</w:tc>
        <w:tc>${paragraph("金额")}</w:tc>
        <w:tc>${paragraph("备注")}</w:tc>
      </w:tr>
      <w:tr>
        <w:tc>${paragraph("宣传")}</w:tc>
        <w:tc>${paragraph("海报和推文")}</w:tc>
        <w:tc>${paragraph("500")}</w:tc>
        <w:tc>${paragraph("旧备注")}</w:tc>
      </w:tr>
      <w:tr>
        <w:tc>${paragraph("物资")}</w:tc>
        <w:tc>${paragraph("帐篷和桌椅")}</w:tc>
        <w:tc>${paragraph("800")}</w:tc>
        <w:tc>${paragraph("旧备注")}</w:tc>
      </w:tr>
    </w:tbl>
    ${paragraph("四、图片说明", "Heading1")}
    <w:p>
      <w:r>
        <w:drawing>
          <wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
            <wp:extent cx="914400" cy="914400"/>
            <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
              <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
                <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
                  <pic:blipFill><a:blip r:embed="rIdImage1"/></pic:blipFill>
                </pic:pic>
              </a:graphicData>
            </a:graphic>
          </wp:inline>
        </w:drawing>
      </w:r>
    </w:p>
    ${paragraph("图片说明需要扩写。")}
    ${paragraph("五、修订痕迹", "Heading1")}
    <w:p><w:r><w:t>保留正文 </w:t></w:r><w:ins w:id="3" w:author="Reviewer" w:date="2026-05-12T00:00:00Z"><w:r><w:t>新增痕迹</w:t></w:r></w:ins></w:p>
    <w:p>
      <w:commentRangeStart w:id="0"/>
      <w:r><w:t>这段语气比较口语。</w:t></w:r>
      <w:commentRangeEnd w:id="0"/>
      <w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:commentReference w:id="0"/></w:r>
    </w:p>
    <w:sectPr>
      <w:headerReference w:type="default" r:id="rIdHeader1"/>
      <w:footerReference w:type="default" r:id="rIdFooter1"/>
      <w:pgSz w:w="11906" w:h="16838"/>
    </w:sectPr>
  </w:body>
</w:document>`;
  const commentsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:comment w:id="0" w:author="Reviewer"><w:p><w:r><w:t>请改为正式表达。</w:t></w:r></w:p></w:comment>
</w:comments>`;

  return makeZip([
    {
      name: "[Content_Types].xml",
      content:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/></Types>'
    },
    {
      name: "word/_rels/document.xml.rels",
      content:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdHeader1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="rIdFooter1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/><Relationship Id="rIdImage1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/><Relationship Id="rIdComments" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="comments.xml"/></Relationships>'
    },
    { name: "word/document.xml", content: documentXml },
    { name: "word/header1.xml", content: '<?xml version="1.0" encoding="UTF-8"?><w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>项目页眉</w:t></w:r></w:p></w:hdr>' },
    { name: "word/footer1.xml", content: '<?xml version="1.0" encoding="UTF-8"?><w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>项目页脚</w:t></w:r></w:p></w:ftr>' },
    { name: "word/comments.xml", content: commentsXml },
    { name: "word/media/image1.png", content: Buffer.from("89504e470d0a1a0a", "hex") }
  ]);
}

function main() {
  const docx = parseDocxPackage(fixtureBuffer());
  const documentXml = docx.getText("word/document.xml") || "";
  const paragraphs = extractEditableParagraphs(documentXml);
  const execution = paragraphs.find((item) => item.text.includes("执行安排需要扩写"));
  const imageCaption = paragraphs.find((item) => item.text.includes("图片说明需要扩写"));
  const budgetRemarks = paragraphs.filter((item) => item.text === "旧备注");
  assert(execution && imageCaption && budgetRemarks.length === 2, "Expected editable body, image caption, and table-cell paragraphs.");

  const applied = applyParagraphRevisions(documentXml, paragraphs, [
    {
      paragraphIndex: execution.paragraphIndex,
      revisedText: "执行安排补充报名分组、物资准备、宣传节奏和现场协调，确保只修改本节正文。"
    },
    {
      paragraphIndex: imageCaption.paragraphIndex,
      revisedText: "图片说明：现场布置图用于说明报名点、物资区和志愿者引导路线。"
    },
    ...budgetRemarks.map((item) => ({
      paragraphIndex: item.paragraphIndex,
      revisedText: "已按最新预算口径更新"
    }))
  ]);
  docx.setText("word/document.xml", applied.documentXml);

  const cleaned = clearDocxCommentsPackageEntries({
    documentXml: docx.getText("word/document.xml") || "",
    relsXml: docx.getText("word/_rels/document.xml.rels"),
    contentTypesXml: docx.getText("[Content_Types].xml")
  });
  docx.setText("word/document.xml", cleaned.documentXml);
  if (cleaned.relsXml) docx.setText("word/_rels/document.xml.rels", cleaned.relsXml);
  if (cleaned.contentTypesXml) docx.setText("[Content_Types].xml", cleaned.contentTypesXml);
  docx.remove("word/comments.xml");

  const output = parseDocxPackage(docx.toBuffer());
  const outXml = output.getText("word/document.xml") || "";
  const outRels = output.getText("word/_rels/document.xml.rels") || "";
  const outTypes = output.getText("[Content_Types].xml") || "";
  const outText = textFromXml(outXml);

  assert(outText.includes("本段保持不变"), "Unrelated section should remain unchanged.");
  assert(outText.includes("报名分组") && outText.includes("现场协调"), "Specified section should be expanded.");
  assert(outText.includes("现场布置图"), "Image caption should be expanded.");
  assert((outText.match(/已按最新预算口径更新/g) || []).length === 2, "Existing table column cells should be modified.");
  assert(outXml.includes("<w:tbl>"), "Complex existing table should remain a real table.");
  assert(outXml.includes("<w:drawing>") && outRels.includes("media/image1.png"), "Image drawing and relationship should be preserved.");
  assert(output.getBuffer("word/media/image1.png"), "Image media file should be preserved.");
  assert(output.getText("word/header1.xml")?.includes("项目页眉"), "Header part should be preserved.");
  assert(output.getText("word/footer1.xml")?.includes("项目页脚"), "Footer part should be preserved.");
  assert(outXml.includes("<w:headerReference") && outXml.includes("<w:footerReference"), "Header/footer references should remain.");
  assert(outXml.includes("<w:ins"), "Existing tracked insertion should remain when not directly edited.");
  assert(!outXml.includes("commentRangeStart") && !outRels.includes("comments.xml") && !outTypes.includes("comments+xml"), "Comments should be cleared when applying comment revisions.");

  console.log(JSON.stringify({ ok: true, revisedCount: applied.revisedCount, bytes: docx.toBuffer().length }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
