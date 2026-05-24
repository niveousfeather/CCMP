import type { WorkbookBlueprint } from "@/lib/excel-engine/types";

export function validateWorkbookBlueprint(blueprint: WorkbookBlueprint) {
  if (!blueprint.title.trim()) throw new Error("EXCEL_BLUEPRINT_MISSING_TITLE");
  if (!blueprint.sheets.length) throw new Error("EXCEL_BLUEPRINT_MISSING_SHEET");

  for (const sheet of blueprint.sheets) {
    if (!sheet.name.trim()) throw new Error("EXCEL_BLUEPRINT_BAD_SHEET_NAME");
    if (!sheet.columns.length) throw new Error("EXCEL_BLUEPRINT_MISSING_COLUMNS");
    const keys = new Set<string>();
    for (const column of sheet.columns) {
      if (!column.key.trim() || !column.header.trim()) throw new Error("EXCEL_BLUEPRINT_BAD_COLUMN");
      if (keys.has(column.key)) throw new Error("EXCEL_BLUEPRINT_DUPLICATE_COLUMN");
      keys.add(column.key);
    }
    for (const formula of sheet.formulas || []) {
      if (!formula.formula.trim()) throw new Error("EXCEL_BLUEPRINT_BAD_FORMULA");
      if (formula.targetColumnKey && !keys.has(formula.targetColumnKey)) {
        throw new Error("EXCEL_BLUEPRINT_UNKNOWN_FORMULA_COLUMN");
      }
    }
  }

  return blueprint;
}
