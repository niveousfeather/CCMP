# Word Engine

`lib/word-engine` is a small backend wrapper for chat-native Word generation.

It does not decide user intent, call models, create chat task cards, or replace the existing Word renderer. Agent Runtime and future adapters can pass a validated `WordRequest` into this module, and the engine returns an in-memory `.docx` result.

## Responsibilities

- Validate a `WordRequest` and return user-readable errors for missing inputs.
- Build a deterministic `WordPlan` from `instruction`, `sourceText`, source file summaries, or current conversation summary.
- Sanitize generated content before rendering.
- Reuse the existing `lib/document/create.ts` renderer to produce the final `.docx` buffer.

## Non-goals

- No Agent Runtime routing.
- No model calls.
- No direct file upload parsing.
- No Word editor UI.
- No changes to `lib/document/**`.

Future phases can connect `word-adapter` to this wrapper while keeping the low-level `.docx` renderer isolated.
