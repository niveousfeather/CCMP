# File Analysis

## Trigger

- User uploads one or more files and asks to analyze, summarize, compare, extract, explain, or answer based on them.
- User says the answer should be based on the uploaded attachment, document, picture, spreadsheet, or video.

## Do Not Trigger

- User only asks how to make a Word, PPT, Excel, image, teaching diagram, or knowledge graph.
- User requests a generated file and the content can be created without reading an attachment.
- User selected the image generation tool and uploaded images as visual references.

## Missing Inputs To Ask

- No file is available when the request depends on an attachment.
- The user asks to compare files but uploaded only one file.
- The user asks for a specific extraction target that is ambiguous.

## Allowed Existing Tools

- `parseDocumentsWithKimi`
- `parseImagesWithVision`
- `parseVideosWithKimi`
- `lib/document-processing/**`
- `fetchWebContextResult` only when web search is explicitly enabled and useful.

## Forbidden Tools

- Do not generate Word, PPT, Excel, images, teaching diagrams, or knowledge graphs unless the user explicitly asks for that output.
- Do not call Academic PPT business code.

## Output Format

- Direct answer in chat with concise references to uploaded file names when useful.
- If extraction fails and the task depends on the file, explain the failure and ask for a clearer or supported file.

## Failure Handling

- If parsing is optional, continue from text context and disclose that file parsing failed.
- If parsing is required, stop and ask the user to retry or upload a supported file.
