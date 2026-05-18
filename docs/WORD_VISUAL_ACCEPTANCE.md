# Word Visual Acceptance

Generated at: 2026-05-12

## Scope

This pass reviewed the previous Word generation and upload-modification outputs before making new layout changes. The review used:

- `docs/WORD_GENERATION_ACCEPTANCE.md`
- Recent DOCX files under `public/mock-storage/users/.../exports`
- Raw DOCX package inspection of `word/document.xml`, `word/styles.xml`, relationships, tables, numbering, and section properties

Microsoft Word COM PDF export was attempted for visual page rendering, but the headless export timed out and produced no PDF. The timeout left a no-window `WINWORD` process, which was cleaned up. Because of that, this report does not claim pixel-level visual approval; it records structural and layout findings visible from the generated DOCX packages.

## Reviewed Generation Outputs

Representative generated files matched the prior five-class acceptance set:

- Lesson plan: 三维动画教学课程 / 第一章节 / 动画规律
- Report: 社区养老服务满意度
- Proposal: 校园低碳行动
- Work summary: 2026 年第一季度客户成功团队工作总结
- Meeting minutes: 产品例会会议纪要

The inspected package structure confirms the generated DOCX files open as valid Word packages and contain headings, paragraphs, tables, styles, and numbering definitions.

## Findings

### 1. Hidden Template Markers Are Extractable

Several generated documents contain visible/extractable marker text such as:

- `DocTemplate Lesson Plan Cover`
- `DocTemplate Info Band`

These markers were intended as internal template markers, but they appear in extracted document text. In a formal deliverable, internal marker text should not be present in the document body at all.

Severity: high.

### 2. Title Area Is Functional But Still Feels Like a Template Surface

Generated documents have a title area and info band, but the current implementation relies on internal markers and a date line. For short professional documents this is acceptable, but it can feel generated rather than authored.

Needed improvement:

- Remove internal marker paragraphs from user-visible document XML.
- Keep a formal title block without a blank cover page unless the document is long enough.
- Avoid forced cover-page behavior for concise files.

Severity: medium.

### 3. No Header/Footer Or Page Numbers In New Documents

Generated DOCX files currently do not include `headerReference` or `footerReference`, and no page-number field is present. For reports, proposals, summaries, and longer generated documents, page numbers improve handoff quality.

Needed improvement:

- Add a simple footer with page number.
- Do not include platform signatures or model names.

Severity: medium.

### 4. Long Documents Have No TOC Or Section Overview Strategy

The reviewed documents are short, but the renderer has no threshold-based table of contents or section overview. For longer plans/reports, readers need a navigation aid.

Needed improvement:

- For documents with many sections or long body text, add a compact "章节概览" section.
- Prefer a static overview table/list over fragile Word TOC fields unless field update behavior is validated.

Severity: medium.

### 5. Tables Are Valid But Use Fixed Equal Column Widths

Tables render as real `<w:tbl>` structures with explicit widths, but column widths are equal for all columns. This is acceptable for simple fixtures, yet can squeeze wide columns such as "教师活动 / 学生活动 / 设计意图", "问题原因 / 改进建议", or responsibility matrices.

Needed improvement:

- Keep DXA widths.
- Weight common wide text columns more generously.
- Keep header shading and visible borders.

Severity: medium.

### 6. Upload DOCX Modification Preserves Package Entries, But Complex Real-World Coverage Is Thin

The previous upload acceptance passed title edit, section expansion, paragraph-to-table conversion, and comment revision. However, fixtures were compact and did not cover:

- Headers and footers
- Images and media relationships
- Editing paragraphs inside existing tables
- Long documents where only one section should change
- Existing tracked changes

Needed improvement:

- Add complex DOCX fixtures with these structures.
- Verify modifications do not drop package entries or rewrite the whole document.

Severity: high.

## Initial Acceptance Decision

Current Word output is usable for baseline delivery, but not yet production-grade for complex real documents.

Primary gaps to fix next:

1. Remove internal template marker text from generated DOCX bodies.
2. Add footer/page-number support for new Word documents.
3. Add a section overview for long generated documents.
4. Improve table column width heuristics.
5. Add complex upload DOCX acceptance for headers, footers, images, existing tables, long section-scoped edits, comments, and tracked changes.

## Post-Fix Acceptance Update

Updated at: 2026-05-12

The renderer and upload-modification path were hardened after the initial findings:

- Internal `DocTemplate ...` marker paragraphs were removed from generated Word bodies and template metadata.
- New generated Word files now include a footer relationship, `word/footer1.xml`, and a Word `PAGE` field for page numbers.
- Multi-section formal documents now receive a compact `章节概览` navigation block without introducing an extra table before the main content.
- Table rendering now uses DXA column-width weighting based on header and cell text length instead of equal-width columns.
- Long document generation was verified with a 24-topic report package: 170,113 bytes, 25 Heading1 entries including the overview, 24 tables, and 24 independent numbered-list definitions.
- Complex upload acceptance now covers preserved page header/footer references, image media and relationships, complex table edits, section-scoped expansion, comment clearing, and tracked-change preservation.
- Real upload acceptance was rerun through the frontend: 4/4 upload cases deliverable, all first-path `claudecoder:gpt-5.4`, no fallback.

Remaining non-blocking gap:

- Microsoft Word COM visual export still was not used as a pixel-level verifier in this pass; validation is structural/package-level plus frontend acceptance. A future pass can add a stable LibreOffice or Word screenshot pipeline if needed.

## Final Visual Close-Out

Updated at: 2026-05-12T06:38:46Z

This pass paused feature expansion and focused only on real Word visual acceptance. The files were generated through the real frontend task flow, then exported through:

```text
DOCX -> LibreOffice headless PDF -> Chrome PDF screenshot PNG
```

The preview artifacts are under:

- `tmp/word-visual-real/selected-files.json`
- `tmp/word-visual-real/preview/manifest.json`
- `tmp/word-visual-real/preview/manual-review-checklist.md`
- `tmp/word-visual-real/preview/**/pdf-preview.png`

LibreOffice was available at `C:\Program Files\LibreOffice\program\soffice.com`. Poppler `pdftoppm` and ImageMagick `magick` were not available, so PNG previews used the Chromium PDF screenshot fallback. Export failure is isolated to the acceptance tool and does not affect Word generation.

### Real Files Reviewed

The following 9 real frontend outputs were regenerated and visually reviewed:

1. Course lesson plan: `三维动画教学课程-第一章节-动画规律教案.docx`
2. Report: `社区养老服务满意度报告.docx`
3. Proposal: `校园低碳行动方案.docx`
4. Work summary: `2026年第一季度客户成功团队工作总结.docx`
5. Meeting minutes: `产品例会会议纪要.docx`
6. Uploaded DOCX title edit: `在原文档基础上修改并保留原格式-把标题改为-社区志愿服务活动实施方案-修.docx`
7. Uploaded DOCX section expansion: `在原文档基础上修改并保留原格式-扩写-执行安排-这一节-补充报名分组-物.docx`
8. Uploaded DOCX paragraph-to-table edit: `在原文档基础上修改并保留原格式-把-执行安排-段落改成表格形式-包含事项.docx`
9. Uploaded DOCX comment revision: `根据-批注修改正文-修改版.docx`

### Visual Findings

The five newly generated documents are directly deliverable from a visual/layout standpoint:

- Title areas render naturally and do not create empty cover pages.
- Heading hierarchy is clear.
- Body spacing is readable and not overly dense.
- Tables render as real tables with visible headers and acceptable column widths.
- Footer page numbers render in generated multi-page documents.
- Section overview appears near the front of longer generated documents.
- No platform signature or internal `DocTemplate` marker was visible.

Observed minor style notes:

- Generated files still show English type labels such as `Lesson Plan`, `Proposal`, `Document`, and `Meeting Minutes` in the title band. They are not platform/model names and are not blockers, but they make the documents feel slightly template-driven.
- The report case triggered local fallback in this run. It still passed QA and visual acceptance, but the acceptance report records the fallback so it is not mistaken for primary-model success.

The four upload-modification files preserved the compact source-document layout:

- Title edit changed the title while leaving the original three-section body intact.
- Section expansion modified only the requested section and kept the source layout.
- Paragraph-to-table conversion produced a readable table with visible header shading and reasonable column widths.
- Comment revision cleared comment markup and produced a clean short document.

Limitations of the upload fixtures remain explicit:

- These four real frontend upload cases use compact fixtures.
- They do not contain images, headers/footers, or complex real-world table layouts.
- The separate complex upload acceptance test covers preservation of image media, header/footer references, complex tables, tracked-change markers, section-scoped edits, and comment clearing at package level.

### Delivery Decision

Directly deliverable:

- Course lesson plan
- Proposal
- Work summary
- Meeting minutes
- Report, with the note that this run used local fallback
- The three original-format upload edits
- The comment-revision upload edit

No visual blocker was found that required a renderer hotfix in this pass. The current renderer output is acceptable for the final Word baseline.

### Preview Export Status

- DOCX to PDF: succeeded for all 9 files through LibreOffice headless.
- PDF to PNG: succeeded for all 9 files through Chrome screenshot fallback.
- Poppler/ImageMagick: not installed; not required for this pass.
- Word COM: not used, because the previous COM path was unstable.

### Layout Controls Checked

- Page numbers: present and visible in newly generated multi-page Word files.
- Section overview: present in longer generated documents and placed before detailed sections.
- Table width: acceptable in the reviewed pages; no obvious squeezing or over-wide overflow was visible.
- Blank space: acceptable in generated documents. Uploaded compact fixtures naturally leave large blank page areas because the source documents are short.
- Platform signature: none found.
- Template trace: no `DocTemplate` marker found. English document-type labels remain a minor style note, not a platform signature.

### Impact

This close-out added only visual acceptance tooling and documentation:

- `scripts/export-word-visual-preview.ts`
- `scripts/test-word-visual-preview.ts`
- `docs/WORD_VISUAL_ACCEPTANCE.md`

No model provider configuration was changed. No Word content strategy, document-type expansion, upload rewrite strategy, PPT, Excel, image, video, 3D, knowledge graph, or ordinary chat route was changed.
