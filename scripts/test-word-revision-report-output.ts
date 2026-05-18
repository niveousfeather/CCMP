import type { GeneratedAgentFile } from "@/lib/agent/types";
import { createWordDocument } from "@/lib/agent/skills/create-document";
import { makeZip } from "@/lib/document/zip";

const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:pPr><w:pStyle w:val="Normal"/></w:pPr>
      <w:commentRangeStart w:id="0"/>
      <w:r><w:t>Original sentence with a typo.</w:t></w:r>
      <w:commentRangeEnd w:id="0"/>
      <w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:commentReference w:id="0"/></w:r>
    </w:p>
    <w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr>
  </w:body>
</w:document>`;

const commentsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:comment w:id="0" w:author="Reviewer"><w:p><w:r><w:t>Please correct the typo.</w:t></w:r></w:p></w:comment>
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
const result = await createWordDocument({
  userId: "test-user",
  title: "Revision Report Test",
  markdown: "# Revision Report Test",
  fileName: "Revision Report Test",
  sourceFiles: [{ fileName: "reviewed.docx", buffer: packageBuffer }],
  requestedMode: "revise_comments",
  reviseComments: {
    revisedParagraphs: [{ commentId: "0", revisedText: "Original sentence with the typo corrected." }]
  }
});

const primaryFile: GeneratedAgentFile = result.file;
const reportFile: GeneratedAgentFile | null | undefined = result.reportFile;
const files: GeneratedAgentFile[] = result.files;

if (!primaryFile.fileName.endsWith(".docx")) {
  throw new Error(`Expected primary docx file, got ${JSON.stringify(result)}`);
}

if (!reportFile?.fileName.endsWith(".md")) {
  throw new Error(`Expected markdown report file, got ${JSON.stringify(result)}`);
}

if (files.length !== 2) {
  throw new Error(`Expected exactly two generated files, got ${JSON.stringify(files)}`);
}

if (reportFile.mimeType !== "text/markdown; charset=utf-8") {
  throw new Error(`Unexpected report mime type: ${reportFile.mimeType}`);
}

console.log(JSON.stringify({ ok: true, files: files.map((file) => file.fileName) }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
