# Teaching Architecture Diagram

## Trigger

- User explicitly asks to create a 教学架构图, 教学框架图, 课程建设架构图, 教学改革框架图, or similar teaching architecture visual.
- User provides a document or text and asks for a formal teaching framework diagram.

## Do Not Trigger

- User only asks for advice about a teaching framework.
- User asks for a general image, PPT, Word, Excel, or knowledge graph.
- User asks to edit Academic PPT output.

## Missing Inputs To Ask

- Topic or source content is empty.
- Diagram type or scope is ambiguous and cannot be inferred.
- User asks to revise an existing task but no task id/current task is available.

## Allowed Existing Tools

- `/api/smart-tools/teaching-architecture-diagram`
- `lib/smart-tools/teaching-architecture-diagram/client.ts`

## Forbidden Tools

- Do not modify teaching diagram business code from Agent Runtime V2 phase 1.
- Do not call Academic PPT or capability-map code.
- Do not edit generated task artifacts under `data/smart-tools/**/tasks`.

## Output Format

- Create or reference a teaching diagram task when execution is explicitly requested.
- Otherwise discuss structure in chat.

## Failure Handling

- Report task creation or generation failure with retry guidance.
- Do not claim generated output exists until the task exists.
