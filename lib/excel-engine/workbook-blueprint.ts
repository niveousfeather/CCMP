import type { ColumnBlueprint, ConversationExcelSource, ExcelCellValue, SheetBlueprint, WorkbookBlueprint } from "@/lib/excel-engine/types";

type BuildInput = {
  userText: string;
  requestedFileName?: string;
  conversationFiles?: ConversationExcelSource[];
};

const scoreColumns: ColumnBlueprint[] = [
  { key: "name", header: "姓名", type: "string", width: 14, required: true },
  { key: "studentId", header: "学号", type: "string", width: 16 },
  { key: "chinese", header: "语文", type: "number", width: 12 },
  { key: "math", header: "数学", type: "number", width: 12 },
  { key: "english", header: "英语", type: "number", width: 12 },
  { key: "total", header: "总分", type: "formula", width: 12 },
  { key: "average", header: "平均分", type: "formula", width: 12 }
];

function safeKey(value: string, index: number) {
  const ascii = value
    .trim()
    .replace(/[^\w\u4e00-\u9fa5]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return ascii || `col_${index + 1}`;
}

function splitCells(line: string) {
  return line
    .split(/[,，、\t|]/)
    .map((cell) => cell.trim())
    .filter(Boolean);
}

function parseScalar(value: string): ExcelCellValue {
  const normalized = value.trim();
  if (!normalized) return "";
  const percent = normalized.match(/^(-?\d+(?:\.\d+)?)%$/);
  if (percent) return Number(percent[1]) / 100;
  if (/^-?\d+(?:\.\d+)?$/.test(normalized)) return Number(normalized);
  return normalized;
}

function inferColumnType(values: ExcelCellValue[]): ColumnBlueprint["type"] {
  const present = values.filter((value) => value !== "" && value !== null);
  if (!present.length) return "string";
  if (present.every((value) => typeof value === "number")) return "number";
  return "string";
}

function parseInlineTable(text: string): SheetBlueprint | null {
  const source = text.split(/[:：]/).slice(1).join("：").trim();
  if (!source) return null;
  const lines = source
    .split(/[;；\n]+/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return null;
  const headers = splitCells(lines[0]);
  if (headers.length < 2) return null;
  const rawRows = lines.slice(1).map(splitCells).filter((row) => row.length >= 2);
  if (!rawRows.length) return null;
  const keys = headers.map(safeKey);
  const rows = rawRows.map((row) =>
    Object.fromEntries(keys.map((key, index) => [key, parseScalar(row[index] || "")]))
  );
  const columns = headers.map((header, index) => ({
    key: keys[index],
    header,
    type: inferColumnType(rows.map((row) => row[keys[index]])),
    width: Math.max(12, Math.min(24, header.length * 2 + 8))
  }));
  return {
    name: "数据表",
    title: "数据表",
    columns,
    rows,
    freezeHeader: true,
    autoFilter: true
  };
}

function parseFieldList(text: string) {
  const match = text.match(/包含(.+)$/);
  if (!match) return [];
  return splitCells(match[1]).map((value) => value.replace(/三个?sheets?|三张表|sheet/gi, "").trim()).filter(Boolean);
}

function makeScoreSheet(name = "成绩明细"): SheetBlueprint {
  return {
    name,
    title: name,
    columns: scoreColumns,
    rows: [],
    formulas: [
      { targetColumnKey: "total", formula: "SUM(C{row}:E{row})", description: "计算总分" },
      { targetColumnKey: "average", formula: "AVERAGE(C{row}:E{row})", description: "计算平均分" }
    ],
    summaryRows: [{ name: "平均", total: null, average: { value: null } as unknown as ExcelCellValue }],
    freezeHeader: true,
    autoFilter: true
  };
}

function makeInfoSheet(): SheetBlueprint {
  return {
    name: "学生信息",
    title: "学生信息",
    columns: [
      { key: "name", header: "姓名", type: "string", width: 14 },
      { key: "studentId", header: "学号", type: "string", width: 16 },
      { key: "className", header: "班级", type: "string", width: 14 },
      { key: "note", header: "备注", type: "string", width: 24 }
    ],
    rows: [],
    freezeHeader: true,
    autoFilter: true
  };
}

function makeSummarySheet(): SheetBlueprint {
  return {
    name: "统计汇总",
    title: "统计汇总",
    columns: [
      { key: "metric", header: "指标", type: "string", width: 18 },
      { key: "value", header: "数值", type: "formula", width: 16 },
      { key: "note", header: "说明", type: "string", width: 28 }
    ],
    rows: [
      { metric: "学生人数", value: null, note: "填写成绩明细后自动统计" },
      { metric: "平均分", value: null, note: "填写成绩明细后自动统计" }
    ],
    formulas: [
      { cell: "B3", formula: "COUNTA('成绩明细'!A3:A200)" },
      { cell: "B4", formula: "AVERAGE('成绩明细'!G3:G200)" }
    ],
    freezeHeader: true,
    autoFilter: true
  };
}

function makeSalesSheet(): SheetBlueprint {
  return {
    name: "销售统计",
    title: "销售统计",
    columns: [
      { key: "month", header: "月份", type: "string", width: 14 },
      { key: "sales", header: "销售额", type: "currency", width: 14 },
      { key: "growth", header: "增长率", type: "percent", width: 14 },
      { key: "note", header: "备注", type: "string", width: 24 }
    ],
    rows: [],
    summaryRows: [{ month: "合计", sales: null, growth: null, note: "" }],
    formulas: [{ cell: "B8", formula: "SUM(B3:B7)" }],
    freezeHeader: true,
    autoFilter: true
  };
}

function makeFileSheet(source: ConversationExcelSource): SheetBlueprint {
  const text = source.extractedText || source.textPreview || "";
  const lines = text
    .replace(/\r/g, "\n")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 80);
  const table = parseInlineTable(`数据：${lines.join("；")}`);
  if (table) return { ...table, name: "文件整理", title: source.fileName };
  return {
    name: "文件整理",
    title: source.fileName,
    columns: [
      { key: "index", header: "序号", type: "number", width: 10 },
      { key: "content", header: "内容", type: "string", width: 60 }
    ],
    rows: lines.map((line, index) => ({ index: index + 1, content: line })),
    freezeHeader: true,
    autoFilter: true
  };
}

function makeFieldTemplate(fields: string[]): SheetBlueprint {
  const columns = fields.map((field, index) => ({
    key: safeKey(field, index),
    header: field,
    type: /总分|平均分/.test(field) ? "formula" : /金额|销售额|成本|预算/.test(field) ? "currency" : /率|占比/.test(field) ? "percent" : "string",
    width: Math.max(12, Math.min(24, field.length * 2 + 8))
  })) satisfies ColumnBlueprint[];
  return {
    name: "模板",
    title: "空白模板",
    columns,
    rows: [],
    freezeHeader: true,
    autoFilter: true
  };
}

export function buildWorkbookBlueprintFromRequest(input: BuildInput): WorkbookBlueprint {
  const text = input.userText.trim();
  const inlineTable = parseInlineTable(text);
  if (inlineTable) {
    return {
      title: "Excel 数据导出",
      sheets: [inlineTable],
      defaultStylePreset: "formal",
      fileName: input.requestedFileName || "excel_data_export"
    };
  }

  const currentFile = input.conversationFiles?.find((file) => file.extractedText || file.textPreview);
  if (/文件|file/i.test(text) && currentFile) {
    return {
      title: "文件整理 Excel",
      description: `根据 ${currentFile.fileName} 整理`,
      sheets: [makeFileSheet(currentFile)],
      defaultStylePreset: "formal",
      fileName: input.requestedFileName || "file_to_excel"
    };
  }

  if (/三张表|三个sheet|多\s*sheet|学生信息|成绩明细|统计汇总/i.test(text)) {
    return {
      title: "班级成绩 Excel",
      sheets: [makeInfoSheet(), makeScoreSheet(), makeSummarySheet()],
      defaultStylePreset: "formal",
      fileName: input.requestedFileName || "class_score_workbook",
      template: true
    };
  }

  if (/学生|成绩|总分|平均分/.test(text)) {
    return {
      title: "学生成绩统计表",
      sheets: [makeScoreSheet()],
      defaultStylePreset: "formal",
      fileName: input.requestedFileName || "student_score_template",
      template: true
    };
  }

  if (/销售|销售额|增长率/.test(text)) {
    return {
      title: "销售统计 Excel",
      sheets: [makeSalesSheet()],
      defaultStylePreset: "formal",
      fileName: input.requestedFileName || "sales_statistics",
      template: true
    };
  }

  const fields = parseFieldList(text);
  if (fields.length >= 2) {
    return {
      title: "Excel 空白模板",
      sheets: [makeFieldTemplate(fields)],
      defaultStylePreset: "formal",
      fileName: input.requestedFileName || "excel_template",
      template: true
    };
  }

  throw new Error("EXCEL_DATA_REQUIRED");
}
