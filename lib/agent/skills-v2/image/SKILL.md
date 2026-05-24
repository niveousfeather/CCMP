# Image

## Trigger

- User explicitly asks to generate, draw, create, edit, revise, or regenerate an image.
- User selected the image content tool.
- User supplies a reference image and asks for image-to-image editing.

## Do Not Trigger

- User asks to analyze or describe an uploaded image without asking for a new image.
- User only asks for image prompt suggestions.
- User asks for video, 3D, Word, Excel, PPT, teaching diagram, or knowledge graph.

## Missing Inputs To Ask

- Visual subject is too vague.
- Image edit request lacks a target image or clear edit instruction.
- Aspect ratio or use case is required for the result and absent.

## Allowed Existing Tools

- `/api/ai/image`
- `lib/image/config.ts`
- `lib/image/subrouter.ts`
- `lib/image/jimeng.ts`

## Forbidden Tools

- Do not call video or 3D generation.
- Do not expose provider/model internals to the user interface.
- Do not fabricate success when image generation fails.

## Output Format

- Chat response with image generation task metadata when accepted.
- Clarification question for vague prompts.

## Failure Handling

- Use existing image task failure/retry behavior.
- Preserve failure state instead of replacing it with a local fake result.
