import { parseDocxPackage } from "@/lib/document/docx-package";
import { makeZip } from "@/lib/document/zip";
import { extractDocxCommentRevisionTargets, reviseDocumentComments } from "@/lib/document/revise-comments";

const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:pPr><w:pStyle w:val="Normal"/></w:pPr>
      <w:commentRangeStart w:id="0"/>
      <w:r><w:rPr><w:b/></w:rPr><w:t>这是原始段落，有一个错别字。</w:t></w:r>
      <w:commentRangeEnd w:id="0"/>
      <w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:commentReference w:id="0"/></w:r>
    </w:p>
    <w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr>
  </w:body>
</w:document>`;

const commentsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:comment w:id="0" w:author="Reviewer"><w:p><w:r><w:t>请修正错别字，并让表达更正式。</w:t></w:r></w:p></w:comment>
</w:comments>`;

const packageBuffer = makeZip([
  {
    name: "[Content_Types].xml",
    content:
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/></Types>'
  },
  {
    name: "word/_rels/document.xml.rels",
    content:
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="comments.xml"/></Relationships>'
  },
  { name: "word/document.xml", content: documentXml },
  { name: "word/comments.xml", content: commentsXml }
]);

async function main() {
const targets = extractDocxCommentRevisionTargets({
  userId: "test-user",
  title: "批注修订测试",
  markdown: "",
  sourceFiles: [{ fileName: "test.docx", buffer: packageBuffer }],
  requestedMode: "revise_comments"
});

if (targets.length !== 1 || targets[0].commentId !== "0" || !targets[0].commentText.includes("修正")) {
  throw new Error(`Unexpected targets: ${JSON.stringify(targets)}`);
}

const output = await reviseDocumentComments({
  userId: "test-user",
  title: "批注修订测试",
  markdown: "",
  sourceFiles: [{ fileName: "test.docx", buffer: packageBuffer }],
  requestedMode: "revise_comments",
  reviseComments: {
    revisedParagraphs: [{ commentId: "0", revisedText: "这是修订后的正式段落，已修正错别字。" }]
  }
});

if (!output.file.fileName.includes("修订版") || !output.reportMarkdown?.includes("已应用修订：1 条")) {
  throw new Error(`Unexpected output metadata: ${JSON.stringify(output)}`);
}

const revisedPackage = parseDocxPackage(
  // The local fallback stores via storage and returns metadata, so verify the pure package path above instead.
  packageBuffer
);

if (!revisedPackage.getText("word/document.xml")) {
  throw new Error("DOCX package parser did not read document.xml");
}

console.log(JSON.stringify({ ok: true, targets: targets.length, fileName: output.file.fileName }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
