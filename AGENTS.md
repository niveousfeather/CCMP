# GitNexus Code Intelligence

This repository is indexed by GitNexus. Use GitNexus MCP tools when they are available to understand code, assess impact, and verify change scope.

If a GitNexus tool reports that the index is stale, run:

```powershell
npx gitnexus analyze
```

## GitNexus Workflow

- Before editing a function, class, method, or shared module, run GitNexus impact analysis when the MCP tool is available.
- Report the affected callers, execution flows, and risk level before making high-risk edits.
- Before committing, run GitNexus change detection when the MCP tool is available.
- If GitNexus MCP tools are not exposed in the current session, state that clearly and use `git diff`, `rg`, focused local scripts, and type/build checks as the fallback review path.
- Do not rename symbols with plain find-and-replace when a semantic rename tool is available.

## Git Safety

- Do not use `git add .`.
- Stage files explicitly by path.
- Keep each commit scoped to one feature line or cleanup line.
- Do not mix Agent Runtime, Excel Engine, Academic PPT, Python services, teaching architecture diagram, and documentation cleanup in one commit unless the user explicitly asks for a combined commit.
- Before every commit, run:

```powershell
git status --short
git diff --cached --name-only
```

- If staged files include anything outside the approved scope, unstage them before continuing.
- Do not revert or delete unrelated dirty files unless the user explicitly asks.

## Sensitive And Generated Files

- Do not commit environment configuration files, credentials, private keys, local account details, or provider configuration.
- Do not commit runtime artifacts under generated data directories.
- Do not commit local patch backups unless the user explicitly asks.
- Do not commit local agent tool caches or machine-specific configuration directories.
- Do not write local absolute paths or personal home-directory paths into committed documentation.

## Module Boundaries

- Agent Runtime changes belong in Agent Runtime files, adapter files, runtime tests, and runtime docs.
- Excel generation belongs in the standalone Excel Engine. The chat runtime should only route and call adapters.
- Academic PPT frontend/API changes, Python services changes, template assets, and verification scripts should be committed separately.
- Teaching architecture diagram changes should stay inside its own app/API/component/lib paths and related docs.
- Do not change capability-map or unrelated smart-tool internals while working on a scoped phase.

## Verification

- Run the verification command that matches the change before claiming success.
- For TypeScript or frontend-affecting changes, run:

```powershell
npm.cmd exec -- tsc --noEmit
```

- For larger frontend changes, also run:

```powershell
npm.cmd run build
```

- For Agent Runtime changes, run the relevant runtime regression scripts.
- For Academic PPT changes, run the relevant Academic PPT stability scripts when their required local services are available.
- If a verification step cannot run because a local service is not started, record the exact reason instead of reporting it as passed.

## Collaboration Rules

- Audit first, then edit, then verify, then stage, then commit.
- Prefer small, reviewable commits.
- Keep user-facing errors readable and avoid exposing internal provider details.
- Keep debug traces hidden from ordinary users.
- Document unresolved risks and skipped checks in the final handoff.
