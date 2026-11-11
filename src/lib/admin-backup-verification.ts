import type { Sql } from "./db.ts";

export const ADMIN_BACKUP_TABLES = [
  "properties",
  "leads",
  "lead_activities",
  "finance_transactions",
  "consultants",
  "staff_attendance",
  "staff_mobile_devices",
  "admin_tasks",
  "property_change_history",
  "site_events",
  "admin_backup_log",
] as const;

export const ADMIN_BACKUP_CORE_TABLES = ["properties", "leads", "consultants", "admin_backup_log"] as const;

export type AdminBackupTableStatus = "available" | "missing" | "error" | "timeout";
export type AdminBackupVerificationStatus = "healthy" | "degraded" | "error" | "timeout";

export type AdminBackupTableCheck = {
  table: string;
  status: AdminBackupTableStatus;
  exists: boolean | null;
  count: number | null;
};

export type AdminBackupVerification = {
  checkedAt: string;
  lastSuccessfulAt: string | null;
  status: AdminBackupVerificationStatus;
  coreReady: boolean;
  complete: boolean;
  tables: AdminBackupTableCheck[];
};

function isTimeout(error: unknown) {
  if (!(error instanceof Error)) return false;
  const code = (error as Error & { code?: string }).code;
  return error.name === "AdminBackupVerificationTimeout"
    || code === "57014"
    || code === "ETIMEDOUT"
    || code === "ESOCKETTIMEDOUT"
    || /timed?\s*out|timeout|statement timeout/i.test(error.message);
}

async function queryWithTimeout<T>(task: () => Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(task),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          const error = new Error("Admin backup verification timed out.");
          error.name = "AdminBackupVerificationTimeout";
          reject(error);
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function checkTable(
  sql: Pick<Sql, "query">,
  table: string,
  timeoutMs: number,
): Promise<AdminBackupTableCheck> {
  let existsRows: Array<{ name: string | null }>;
  try {
    existsRows = await queryWithTimeout(
      () => sql.query<{ name: string | null }>("select to_regclass($1) as name", [table]),
      timeoutMs,
    );
  } catch (error) {
    return { table, status: isTimeout(error) ? "timeout" : "error", exists: null, count: null };
  }
  if (!existsRows[0] || !("name" in existsRows[0])) {
    return { table, status: "error", exists: null, count: null };
  }
  if (!existsRows[0].name) {
    return { table, status: "missing", exists: false, count: null };
  }

  try {
    const countRows = await queryWithTimeout(
      () => sql.query<{ count: number | string }>(`select count(*)::int as count from ${table}`),
      timeoutMs,
    );
    const count = Number(countRows[0]?.count);
    if (!countRows[0] || !Number.isSafeInteger(count) || count < 0) {
      return { table, status: "error", exists: true, count: null };
    }
    return { table, status: "available", exists: true, count };
  } catch (error) {
    return {
      table,
      status: isTimeout(error) ? "timeout" : "error",
      exists: true,
      count: null,
    };
  }
}

export async function verifyAdminBackupTables(
  sql: Pick<Sql, "query">,
  options: {
    tables?: readonly string[];
    coreTables?: readonly string[];
    timeoutMs?: number;
    now?: () => Date;
  } = {},
): Promise<AdminBackupVerification> {
  const tables = options.tables ?? ADMIN_BACKUP_TABLES;
  const coreTables = options.coreTables ?? ADMIN_BACKUP_CORE_TABLES;
  const timeoutMs = options.timeoutMs ?? 8_000;
  const checked = await Promise.all(tables.map((table) => checkTable(sql, table, timeoutMs)));
  const hasTimeout = checked.some((item) => item.status === "timeout");
  const hasError = checked.some((item) => item.status === "error");
  const hasMissing = checked.some((item) => item.status === "missing");
  const status: AdminBackupVerificationStatus = hasTimeout
    ? "timeout"
    : hasError
      ? "error"
      : hasMissing
        ? "degraded"
        : "healthy";
  const checkedAt = (options.now ?? (() => new Date()))().toISOString();
  const complete = checked.every((item) => item.status === "available");
  return {
    checkedAt,
    lastSuccessfulAt: status === "healthy" ? checkedAt : null,
    status,
    coreReady: coreTables.every((table) => checked.some((item) => item.table === table && item.status === "available")),
    complete,
    tables: checked,
  };
}

export async function recordAdminBackupExport(
  sql: Pick<Sql, "query">,
  tableCounts: Record<string, number>,
) {
  await sql.query(
    "insert into admin_backup_log(kind,table_counts) values($1,$2::jsonb)",
    ["json_export", JSON.stringify(tableCounts)],
  );
}

export async function createAdminBackupExport(sql: Sql, now: () => Date = () => new Date()) {
  if (!sql.transaction) throw new Error("Admin backup export requires transaction support.");
  return sql.transaction(async (transactionSql) => {
    await transactionSql.query("set transaction isolation level repeatable read");
    const [properties, leads, activities, finance, consultants, attendance, staffMobileDevices] = await Promise.all([
      transactionSql.query("select * from properties"),
      transactionSql.query("select * from leads"),
      transactionSql.query("select * from lead_activities"),
      transactionSql.query("select * from finance_transactions"),
      transactionSql.query("select * from consultants"),
      transactionSql.query("select * from staff_attendance"),
      transactionSql.query("select * from staff_mobile_devices"),
    ]);
    const tableCounts = {
      properties: properties.length,
      leads: leads.length,
      leadActivities: activities.length,
      financeTransactions: finance.length,
      consultants: consultants.length,
      attendance: attendance.length,
      staffMobileDevices: staffMobileDevices.length,
    };
    const payload = {
      exportedAt: now().toISOString(),
      app: "Hirmand Real Estate",
      version: 3,
      integrity: {
        kind: "row-count",
        tableCounts,
        totalRows: Object.values(tableCounts).reduce((sum, value) => sum + value, 0),
      },
      properties,
      leads,
      leadActivities: activities,
      financeTransactions: finance,
      consultants,
      attendance,
      staffMobileDevices,
    };
    await recordAdminBackupExport(transactionSql, tableCounts);
    return JSON.stringify(payload, null, 2);
  });
}
