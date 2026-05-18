# Superseded Academic PPT Sidecar

This per-tool sidecar boundary has been superseded by the unified Python Tools Engine:

```text
services/ai-tools-engine
```

New academic-ppt backend integration should target:

```text
services/ai-tools-engine/app/tools/academic_ppt
```

Keep this directory only as historical notes. Do not add runtime code or Python dependencies here for the current architecture.

The active contract is:

```text
Next.js task system
-> Python Tools Engine
-> /tools/academic-ppt
-> local paper-ppt-agent backend core
-> outputs/academic-ppt-result.pptx
```

The frontend must continue to call only:

```text
/api/smart-tools/academic-ppt/*
```

The Python layer must not expose provider configuration, API keys, Base URLs, request IDs, stack traces, or local filesystem paths to the product UI.
