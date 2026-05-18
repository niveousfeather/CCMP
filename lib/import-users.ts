import Papa from "papaparse";

export const MAX_IMPORT_USERS = 500;

export type ImportUserInput = {
  username?: string;
  role?: string;
  password?: string;
  row?: number;
};

export type NormalizedImportUser = {
  username: string;
  role: "ADMIN" | "TEACHER" | "STUDENT";
  password: string;
  row: number;
};

export type ImportFailure = {
  username?: string;
  row: number;
  reason: string;
};

export type ParseImportResult = {
  users: NormalizedImportUser[];
  failed: ImportFailure[];
  totalCount: number;
};

const REQUIRED_HEADERS = ["username", "role", "password"];

export function parseUsersPayload(payload: string, defaultPassword: string): ParseImportResult {
  const trimmed = payload.trim();
  if (!trimmed) {
    return { users: [], failed: [{ row: 0, reason: "导入内容为空" }], totalCount: 0 };
  }

  const rawUsers = trimmed.startsWith("[") ? parseJson(trimmed) : parseCsv(trimmed);
  if ("error" in rawUsers) {
    return { users: [], failed: [{ row: 0, reason: rawUsers.error }], totalCount: 0 };
  }

  return normalizeImportUsers(rawUsers.data, defaultPassword);
}

export function normalizeImportUsers(
  data: ImportUserInput[],
  defaultPassword: string
): ParseImportResult {
  const nonEmptyRows = data.filter((item) =>
    Boolean(item.username?.trim() || item.role?.trim() || item.password?.trim())
  );
  const users: NormalizedImportUser[] = [];
  const failed: ImportFailure[] = [];

  if (nonEmptyRows.length > MAX_IMPORT_USERS) {
    return {
      users: [],
      failed: [{ row: 0, reason: `单次最多导入 ${MAX_IMPORT_USERS} 条用户` }],
      totalCount: nonEmptyRows.length
    };
  }

  nonEmptyRows.forEach((item, index) => {
    const row = typeof item.row === "number" ? item.row : index + 2;
    const username = item.username?.trim();
    const role = normalizeImportRole(item.role);
    const password = item.password?.trim() || defaultPassword;

    if (!username) {
      failed.push({ row, reason: "用户名为空" });
      return;
    }

    if (!role) {
      failed.push({ username, row, reason: "角色无效，仅支持 admin、teacher 或 student" });
      return;
    }

    if (!password || password.length < 8) {
      failed.push({ username, row, reason: "密码长度不足，至少 8 位" });
      return;
    }

    users.push({ username, role, password, row });
  });

  return { users, failed, totalCount: nonEmptyRows.length };
}

export function normalizeImportRole(value?: string) {
  const role = value?.trim().toUpperCase();
  if (!role) return "TEACHER" as const;
  if (role === "USER") return "TEACHER" as const;
  if (role === "ADMIN" || role === "TEACHER" || role === "STUDENT") return role;
  return null;
}

function parseJson(value: string): { data: ImportUserInput[] } | { error: string } {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return { error: "JSON 必须是用户数组" };
    }
    return { data: parsed };
  } catch {
    return { error: "JSON 格式错误" };
  }
}

function parseCsv(value: string): { data: ImportUserInput[] } | { error: string } {
  const parsed = Papa.parse<ImportUserInput>(value, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim()
  });

  if (parsed.errors.length) {
    return { error: "CSV 格式错误" };
  }

  const headers = parsed.meta.fields || [];
  const isHeaderValid =
    headers.length >= REQUIRED_HEADERS.length &&
    REQUIRED_HEADERS.every((header, index) => headers[index] === header);

  if (!isHeaderValid) {
    return { error: "表头必须为 username, role, password" };
  }

  return { data: parsed.data };
}
