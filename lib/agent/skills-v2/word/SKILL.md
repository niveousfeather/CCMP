# Word Document

## Trigger

- User explicitly asks to generate, export, save, download, rewrite into, or revise a Word or DOCX file.
- User asks for a report, proposal, lesson plan, meeting minutes, formal document, summary document, or manual as a downloadable file.
- User uploads a Word file and asks to revise comments or preserve original layout.

## Do Not Trigger

- User asks how to write a document, how to format Word, or wants advice only.
- User mentions Word/文档 as a topic but does not ask for file creation.
- User asks for PPT, Excel, image, teaching diagram, or knowledge graph.

## Missing Inputs To Ask

- Document subject is too vague.
- Revision depends on an uploaded source file but no file is available.
- User requests comment revision without a `.docx` source containing comments.

## Allowed Existing Tools

- `createWordDocument`
- `runDocumentTask`
- `extractWordGenerationIntent`
- Word revision helpers in `lib/document/**`

## Forbidden Tools

- Do not use Academic PPT.
- Do not call Excel or image generation for Word-only tasks.
- Do not alter the underlying Word generator in this phase.

## Output Format

- Chat response plus generated `.docx` attachment when execution is allowed.
- Clarification question when required inputs are missing.

## Failure Handling

- Return a concise failure message and keep the conversation state ready for retry.
- Do not pretend a document was generated if the attachment was not created.
