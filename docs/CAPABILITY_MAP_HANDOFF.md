# Capability Map Handoff

Updated: 2026-05-25

## Integration

Capability Map is integrated as an isolated Smart Tools workspace.

- Smart Tools entry: `/smart-tools`
- Workspace page: `/smart-tools/capability-map`
- Page file: `app/(dashboard)/smart-tools/capability-map/page.tsx`
- API route: `app/api/capability-map/course-ability-graph/route.ts`
- Components: `components/capability-map/`
- Domain logic: `lib/capability-map/`
- Check script: `scripts/capability-map/check-capability-map.ts`

The Smart Tools card is defined in `components/smart-tools/smart-tools-data.ts`.

## Current Behavior

The first version uses local mock generation from `lib/capability-map/course-ability-graph.ts`.
Users can enter a course name, major direction, and region, then generate a local course ability graph with:

- course profile
- workflow stages
- teaching modules
- task and skill nodes
- course mapping views
- industry impact paths
- evidence and update suggestion panels

The API sanitizes the payload before returning it and does not expose model/provider metadata.

## Explicit Non-Goals

This phase does not connect Capability Map to:

- `/api/ai/chat`
- Agent runtime
- taskCard
- generatedFiles
- Word, Excel, or PPT export
- Academic PPT
- Teaching Architecture Diagram
- database schema or Prisma
- `data/**`
- real web search
- real model/provider calls

## Boundaries

Capability Map code should stay inside:

- `app/(dashboard)/smart-tools/capability-map/`
- `app/api/capability-map/`
- `components/capability-map/`
- `lib/capability-map/`
- `scripts/capability-map/`
- this handoff document

Do not move Capability Map logic into chat routes, agent runtime adapters, existing knowledge-graph code, Word engine, Excel engine, Academic PPT, services, Prisma, or generated data directories.

## Follow-Up Options

Recommended next phases:

1. Add browser regression checks for `/smart-tools/capability-map`.
2. Add import/export only inside the capability-map namespace.
3. Add persisted graph storage after a separate schema review.
4. Add real search/model enrichment behind a dedicated `lib/capability-map/` service.
5. Add source citation quality checks before any formal reporting/export feature.
