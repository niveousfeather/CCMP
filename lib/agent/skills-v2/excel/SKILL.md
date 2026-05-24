# Excel Spreadsheet

## Trigger

- User explicitly asks to create, modify, organize, calculate, summarize, sort, add columns, or export an Excel/XLSX/CSV/spreadsheet file.
- User uploads a spreadsheet and asks for a concrete transformation.

## Do Not Trigger

- User only asks for an Excel formula explanation or spreadsheet advice.
- User mentions a table but wants a prose answer.
- User asks for Word, PPT, image, teaching diagram, or knowledge graph.

## Missing Inputs To Ask

- A modification request requires an existing spreadsheet but none is uploaded.
- Requested calculation, grouping, or output columns are unclear.
- User asks to convert "this file" without uploading a file.

## Allowed Existing Tools

- `runSpreadsheetTask`
- `createSpreadsheet`
- `inspectWorkbookBuffer`
- `modifySpreadsheet`

## Forbidden Tools

- Do not use Word/PPT/image tools for spreadsheet-only tasks.
- Do not change spreadsheet generator internals in Agent Runtime V2 phase 1.

## Output Format

- Chat response plus generated `.xlsx` attachment when execution is allowed.
- Formula/advice requests should remain normal chat answers.

## Failure Handling

- If the workbook cannot be parsed or modified, report the issue and ask for a valid spreadsheet or clearer operation.
