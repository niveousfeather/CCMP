# Agent Skill V2

Skill V2 is the contract layer for Agent Runtime V2. A skill describes when a capability should be selected, when it must not be selected, what inputs are missing, which existing project tools it may call, and how to report failures.

Phase 1 is a decision layer only. The runtime may emit an internal decision with `intent`, `targetTool`, `confidence`, `needsTool`, `needsConfirmation`, `missingInputs`, and `activeTaskId`, but existing Word, Excel, image, simple PPT, file analysis, teaching diagram, and knowledge graph implementations remain on their current code paths.

Runtime rules:

- Do not call a tool just because a user mentions a file type or capability.
- Call a tool only when execution intent is explicit, inputs are sufficient, skill match is clear, and risk is controlled.
- Ask a clarification question when the user is exploring, comparing, asking how-to, or missing a required source/subject/style.
- Keep conversation-level memory only: recent summary, uploaded file summary, task status, and current-session preferences.
- Do not write long-term memory or sensitive personal data.

Skill files are intentionally plain Markdown so future model providers can load the same rules without depending on a framework.
