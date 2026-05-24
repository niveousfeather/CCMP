# Knowledge Graph

## Trigger

- User explicitly asks to build, generate, or visualize a 知识图谱, 概念图谱, 关系图谱, or knowledge graph.
- User asks to extract concepts and relationships from text/files into a graph.

## Do Not Trigger

- User asks for a normal explanation, outline, or list of concepts.
- User asks for teaching architecture diagrams, PPT, Word, Excel, or images.
- User only asks what a knowledge graph is.

## Missing Inputs To Ask

- Topic/source is too vague.
- User wants a graph from documents but no documents are available.
- User requires web freshness but web search is disabled.

## Allowed Existing Tools

- `/api/ai/knowledge-graph`
- `fetchWebContextResult` when web search is explicitly enabled.
- Existing file parsing tools for source extraction.

## Forbidden Tools

- Do not call teaching diagram renderer.
- Do not call Academic PPT or capability-map code.

## Output Format

- Knowledge graph payload/task when execution is allowed.
- Chat explanation or clarification otherwise.

## Failure Handling

- Use existing knowledge graph fallback only when it honestly represents available sources.
- Return failure state if graph creation fails.
