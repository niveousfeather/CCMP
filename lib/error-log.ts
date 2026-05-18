import { prisma } from "@/lib/db";

type ErrorLogInput = {
  userId?: string | null;
  route: string;
  method?: string;
  status?: number;
  code?: string;
  provider?: string;
  traceId?: string | null;
  message: string;
  detail?: unknown;
};

function serializeDetail(detail: unknown) {
  if (detail === undefined || detail === null) return undefined;
  if (typeof detail === "string") return detail.slice(0, 4000);

  try {
    return JSON.stringify(detail).slice(0, 4000);
  } catch {
    return String(detail).slice(0, 4000);
  }
}

export async function writeErrorLog(input: ErrorLogInput) {
  try {
    await prisma.errorLog.create({
      data: {
        userId: input.userId || null,
        route: input.route,
        method: input.method || "POST",
        status: input.status,
        code: input.code,
        provider: input.provider,
        traceId: input.traceId || null,
        message: input.message.slice(0, 1000),
        detail: serializeDetail(input.detail)
      }
    });
  } catch (error) {
    console.error(`[error-log] write_failed route=${input.route} error=${error instanceof Error ? error.message : "unknown"}`);
  }
}
