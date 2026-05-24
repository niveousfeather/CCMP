# Simple PPT

## Trigger

- User explicitly asks to generate, create, export, save, or download a normal PPT/PPTX/slides/课件 file.
- User provides a topic, source file, or outline and asks for a simple presentation.

## Do Not Trigger

- User asks how to make a PPT or wants outline advice only.
- User asks for Academic PPT, paper-to-PPT, built-in academic templates, or smart-tool academic pipeline behavior.
- User asks for Word, Excel, image, teaching diagram, or knowledge graph.

## Missing Inputs To Ask

- Topic is too vague.
- User asks to convert uploaded material but no material is available.
- Required audience, slide count, or style is essential and absent.

## Allowed Existing Tools

- `createPresentation`
- `lib/presentation/**`
- Existing chat `create_presentation` path in `runAgent`.

## Forbidden Tools

- Do not call `lib/smart-tools/academic-ppt/**`.
- Do not call `/api/smart-tools/academic-ppt/**`.
- Do not modify Academic PPT code.

## Output Format

- Chat response plus generated `.pptx` attachment when execution is allowed.
- Ask a concise follow-up when inputs are insufficient.

## Failure Handling

- Report generation failure and keep the request retryable.
- Do not claim a PPT is ready without an attachment.
