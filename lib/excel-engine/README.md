# Excel Engine

`lib/excel-engine` is the standalone backend module for chat-native Excel generation.

It is intentionally independent from Agent Runtime and Chat UI:

- Agent Runtime decides whether Excel is needed.
- `excel-adapter` validates input and builds an Engine request.
- Excel Engine builds, parses, modifies, styles, and persists `.xlsx` files.

## Main Types

- `WorkbookBlueprint`
- `SheetBlueprint`
- `ColumnBlueprint`
- `FormulaBlueprint`

The blueprint is serializable and can be reused by other future entry points.

## Current Scope

- Generate styled `.xlsx` files from inline table data.
- Generate blank templates when the user explicitly asks for a template structure.
- Generate multi-sheet workbooks.
- Convert current-conversation extracted file text into workbook rows.
- Modify an uploaded `.xlsx` by exporting a new workbook with supported formula columns.

## Boundaries

- No Excel web page.
- No online spreadsheet editor.
- No BI workspace.
- No pivot table or complex charts in this first version.
- No cross-conversation file lookup.
- No fabricated business data when the user has not supplied data or a template schema.
