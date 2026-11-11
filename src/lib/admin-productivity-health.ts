import type { Sql } from "./db.ts";

export const ADMIN_PRODUCTIVITY_COUNTERS = [
  { key: "properties", table: "properties", core: true },
  { key: "leads", table: "leads", core: true },
  { key: "consultants", table: "consultants", core: true },
  { key: "media", table: "media_objects", core: false },
  { key: "tasks", table: "admin_tasks", core: true },
] as const;

export type AdminProductivityCounterStatus = "available" | "missing" | "error" | "timeout";
export type AdminProductivityStatus = "healthy" | "degraded" | "error" | "timeout";

function isCountRow(row: Record<string, unknown> | undefined, keys: readonly string[]) {
  return Boolean(row) && keys.every((key) => {
    const value = Number(row?.[key]);
    return Number.isSafeInteger(value) && value >= 0;
  });
}

export function hasCompleteAdminProductivitySummary(
  taskRows: Record<string, unknown>[],
  propertyRows: Record<string, unknown>[],
  duplicateRows: Record<string, unknown>[],
) {
  if (!isCountRow(taskRows[0], ["open", "overdue", "today", "next7"])) return false;
  if (!isCountRow(propertyRows[0], ["total", "published", "without_images", "incomplete", "stale", "expired_featured"])) return false;
  return duplicateRows.every((row) => {
    const fileCount = Number(row.file_count);
    return Number.isSafeInteger(fileCount) && fileCount >= 2 && Array.isArray(row.files) && row.files.length === fileCount;
  });
}

function errorCode(error: unknown) {
  return error instanceof Error ? (error as Error & { code?: string }).code : undefined;
}

function isTimeout(error: unknown) {
  return error instanceof Error && (
    error.name === "AdminProductivityCounterTimeout"
    || ["57014", "ETIMEDOUT", "ESOCKETTIMEDOUT"].includes(errorCode(error) ?? "")
    || /timed?\s*out|timeout|statement timeout/i.test(error.message)
  );
}

export function isAdminProductivityTimeoutError(error: unknown) {
  return isTimeout(error);
}

function isMissingRelation(error: unknown) {
  return errorCode(error) === "42P01"
    || (error instanceof Error && /relation .* does not exist/i.test(error.message));
}

async function queryWithTimeout<T>(task: () => Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(task),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error("Admin productivity counter query timed out.");
          error.name = "AdminProductivityCounterTimeout";
          reject(error);
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function loadAdminProductivitySystemCounts(
  sql: Pick<Sql, "query">,
  options: { timeoutMs?: number; now?: () => Date } = {},
) {
  const timeoutMs = options.timeoutMs ?? 8_000;
  const results = await Promise.all(ADMIN_PRODUCTIVITY_COUNTERS.map(async (counter) => {
    try {
      const rows = await queryWithTimeout(
        () => sql.query<{ count: number | string }>(`select count(*)::int as count from ${counter.table}`),
        timeoutMs,
      );
      const count = Number(rows[0]?.count);
      if (!rows[0] || !Number.isSafeInteger(count) || count < 0) {
        return { key: counter.key, status: "error" as const, count: null };
      }
      return { key: counter.key, status: "available" as const, count };
    } catch (error) {
      return {
        key: counter.key,
        status: isTimeout(error) ? "timeout" as const : isMissingRelation(error) ? "missing" as const : "error" as const,
        count: null,
      };
    }
  }));

  const statuses = Object.fromEntries(results.map((item) => [item.key, item.status])) as Record<string, AdminProductivityCounterStatus>;
  const counts = Object.fromEntries(results.map((item) => [item.key, item.count])) as Record<string, number | null>;
  const hasTimeout = results.some((item) => item.status === "timeout");
  const hasError = results.some((item) => item.status === "error");
  const hasMissing = results.some((item) => item.status === "missing");
  const status: AdminProductivityStatus = hasTimeout
    ? "timeout"
    : hasError
      ? "error"
      : hasMissing
        ? "degraded"
        : "healthy";
  const coreReady = ADMIN_PRODUCTIVITY_COUNTERS
    .filter((counter) => counter.core)
    .every((counter) => statuses[counter.key] === "available");
  const generatedAt = (options.now ?? (() => new Date()))().toISOString();

  return {
    database: coreReady ? "connected" : status === "degraded" ? "degraded" : "unavailable",
    status,
    coreReady,
    counts,
    counterStatus: statuses,
    unavailableCounters: results.filter((item) => item.status !== "available").map((item) => item.key),
    timedOutCounters: results.filter((item) => item.status === "timeout").map((item) => item.key),
    generatedAt,
    lastSuccessfulAt: status === "healthy" ? generatedAt : null,
  };
}
