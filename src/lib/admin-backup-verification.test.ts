import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "./db.ts";
import { ADMIN_BACKUP_TABLES, createAdminBackupExport, pruneAdminBackupHistory, recordAdminBackupExport, verifyAdminBackupTables } from "./admin-backup-verification.ts";

function createSql(query: (text: string, params: unknown[]) => Promise<unknown[]>) {
  return {
    query: async <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
      await query(text, params) as T[],
  } as unknown as Pick<Sql, "query">;
}

test("reports a healthy backup schema and keeps a genuine zero-row table distinct", async () => {
  const sql = createSql(async (text) => text.includes("to_regclass")
    ? [{ name: "public.test_table" }]
    : [{ count: 0 }]);
  const result = await verifyAdminBackupTables(sql, {
    tables: ["properties"],
    coreTables: ["properties"],
    now: () => new Date("2026-11-11T01:00:00.000Z"),
  });
  assert.equal(result.status, "healthy");
  assert.equal(result.complete, true);
  assert.equal(result.coreReady, true);
  assert.equal(result.lastSuccessfulAt, "2026-11-11T01:00:00.000Z");
  assert.deepEqual(result.tables[0], { table: "properties", status: "available", exists: true, count: 0 });
});

test("runs the verification and backup-history SQL against a real PGlite database", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`
      create table properties (id text primary key);
      insert into properties(id) values ('p-1'), ('p-2');
      create table admin_backup_log (
        id bigserial primary key,
        kind text not null,
        table_counts jsonb not null,
        created_at timestamptz not null default current_timestamp
      );
    `);
    const sql = {
      query: async <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
        (await pg.query<T>(text, params)).rows,
    } as unknown as Pick<Sql, "query">;

    const result = await verifyAdminBackupTables(sql, {
      tables: ["properties", "leads", "admin_backup_log"],
      coreTables: ["properties", "admin_backup_log"],
    });
    assert.equal(result.status, "degraded");
    assert.equal(result.coreReady, true);
    assert.equal(result.tables[0]?.count, 2);
    assert.equal(result.tables[1]?.status, "missing");
    assert.equal(result.tables[2]?.status, "available");

    await recordAdminBackupExport(sql, { properties: 2 });
    const history = await pg.query<{ kind: string; table_counts: { properties: number } }>(
      "select kind,table_counts from admin_backup_log",
    );
    assert.deepEqual(history.rows[0], { kind: "json_export", table_counts: { properties: 2 } });
  } finally {
    await pg.close();
  }
});

test("creates one repeatable-read backup snapshot and records it in the same transaction", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`
      create table properties (id text primary key);
      create table leads (id text primary key);
      create table lead_activities (id text primary key);
      create table finance_transactions (id text primary key);
      create table consultants (id text primary key);
      create table staff_attendance (id text primary key);
      create table staff_mobile_devices (id text primary key);
      create table admin_tasks (id text primary key);
      create table property_change_history (id text primary key);
      create table site_events (id text primary key);
      create table admin_backup_log (id bigserial primary key, kind text not null, table_counts jsonb not null);
      create table admin_audit_log (id bigserial primary key, action text not null, entity_type text not null, entity_id text, entity_title text not null default '', actor text not null default 'admin', metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default current_timestamp);
      insert into properties(id) values ('p-1');
      insert into admin_tasks(id) values ('t-1');
      insert into property_change_history(id) values ('h-1'), ('h-2');
      insert into site_events(id) values ('e-1'), ('e-2'), ('e-3');
      insert into admin_backup_log(kind,table_counts) values ('json_export','{}');
      insert into admin_audit_log(action,entity_type) values ('test','admin_backup');
      insert into leads(id) values ('l-1'), ('l-2');
    `);
    const sql = {
      query: async <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
        (await pg.query<T>(text, params)).rows,
      transaction: async <T>(callback: (transactionSql: Sql) => Promise<T>) =>
        pg.transaction(async (tx) => callback({
          query: async <R = Record<string, unknown>>(text: string, params: unknown[] = []) =>
            (await tx.query<R>(text, params)).rows,
        } as unknown as Sql)),
    } as unknown as Sql;

    const json = await createAdminBackupExport(sql, () => new Date("2026-11-11T01:00:00.000Z"));
    const backup = JSON.parse(json) as { version: number; scope: { kind: string; includedTables: string[]; excluded: string[] }; integrity: { totalRows: number; kind: string; tableCounts: Record<string, number> }; adminTasks: unknown[]; propertyChangeHistory: unknown[]; siteEvents: unknown[]; backupHistory: unknown[]; adminAuditLog: unknown[] };
    assert.equal(backup.version, 4);
    assert.equal(backup.scope.kind, "selected-business-data-export");
    assert.deepEqual(backup.scope.includedTables, [...ADMIN_BACKUP_TABLES]);
    assert.ok(backup.scope.excluded.some((item) => item.includes("Object Storage")));
    assert.ok(backup.scope.excluded.some((item) => item.includes("Customer property submissions")));
    assert.ok(backup.scope.excluded.some((item) => item.includes("commission settlements")));
    assert.equal(backup.integrity.kind, "selected-table-row-count");
    assert.equal(backup.integrity.totalRows, 11);
    assert.deepEqual(backup.integrity.tableCounts, {
      properties: 1,
      leads: 2,
      leadActivities: 0,
      financeTransactions: 0,
      consultants: 0,
      attendance: 0,
      staffMobileDevices: 0,
      adminTasks: 1,
      propertyChangeHistory: 2,
      siteEvents: 3,
      backupHistory: 1,
      adminAuditLog: 1,
    });
    assert.equal(backup.adminTasks.length, 1);
    assert.equal(backup.propertyChangeHistory.length, 2);
    assert.equal(backup.siteEvents.length, 3);
    assert.equal(backup.backupHistory.length, 1);
    assert.equal(backup.adminAuditLog.length, 1);
    const history = await pg.query<{ kind: string; table_counts: Record<string, number> }>("select kind,table_counts from admin_backup_log order by id desc limit 1");
    assert.deepEqual(history.rows[0], { kind: "json_export", table_counts: backup.integrity.tableCounts });
  } finally {
    await pg.close();
  }
});

test("does not return a backup when the history write fails inside the export transaction", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`
      create table properties (id text primary key);
      create table leads (id text primary key);
      create table lead_activities (id text primary key);
      create table finance_transactions (id text primary key);
      create table consultants (id text primary key);
      create table staff_attendance (id text primary key);
      create table staff_mobile_devices (id text primary key);
      create table admin_tasks (id text primary key);
      create table property_change_history (id text primary key);
      create table site_events (id text primary key);
      create table admin_audit_log (id bigserial primary key, action text not null, entity_type text not null, entity_id text, entity_title text not null default '', actor text not null default 'admin', metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default current_timestamp);
      insert into properties(id) values ('p-1');
    `);
    const sql = {
      query: async <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
        (await pg.query<T>(text, params)).rows,
      transaction: async <T>(callback: (transactionSql: Sql) => Promise<T>) =>
        pg.transaction(async (tx) => callback({
          query: async <R = Record<string, unknown>>(text: string, params: unknown[] = []) =>
            (await tx.query<R>(text, params)).rows,
        } as unknown as Sql)),
    } as unknown as Sql;

    await assert.rejects(createAdminBackupExport(sql), /admin_backup_log/);
    const properties = await pg.query("select * from properties");
    assert.equal(properties.rows.length, 1);
  } finally {
    await pg.close();
  }
});

test("reports missing core and optional tables as degraded, never as an empty table", async () => {
  const sql = createSql(async (text, params) => text.includes("to_regclass")
    ? [{ name: params[0] === "properties" ? null : "public." + String(params[0]) }]
    : [{ count: 3 }]);
  const result = await verifyAdminBackupTables(sql, {
    tables: ["properties", "leads", "optional_table"],
    coreTables: ["properties", "leads"],
  });
  assert.equal(result.status, "degraded");
  assert.equal(result.coreReady, false);
  assert.equal(result.complete, false);
  assert.deepEqual(result.tables[0], { table: "properties", status: "missing", exists: false, count: null });
});

test("propagates database failures as error status with no fabricated zero count", async () => {
  const sql = createSql(async (text) => {
    if (text.includes("to_regclass")) throw new Error("database unavailable");
    return [{ count: 0 }];
  });
  const result = await verifyAdminBackupTables(sql, { tables: ["properties"], coreTables: ["properties"] });
  assert.equal(result.status, "error");
  assert.equal(result.lastSuccessfulAt, null);
  assert.deepEqual(result.tables[0], { table: "properties", status: "error", exists: null, count: null });
});

test("keeps a verified table's existence when its count query fails", async () => {
  const sql = createSql(async (text) => {
    if (text.includes("to_regclass")) return [{ name: "public.properties" }];
    throw new Error("count query failed");
  });
  const result = await verifyAdminBackupTables(sql, { tables: ["properties"], coreTables: ["properties"] });
  assert.equal(result.status, "error");
  assert.deepEqual(result.tables[0], { table: "properties", status: "error", exists: true, count: null });
});

test("recognizes PostgreSQL statement-timeout errors as timeouts", async () => {
  const sql = createSql(async (text) => {
    if (text.includes("to_regclass")) return [{ name: "public.properties" }];
    throw Object.assign(new Error("canceling statement due to statement timeout"), { code: "57014" });
  });
  const result = await verifyAdminBackupTables(sql, { tables: ["properties"], coreTables: ["properties"] });
  assert.equal(result.status, "timeout");
  assert.deepEqual(result.tables[0], { table: "properties", status: "timeout", exists: true, count: null });
});

test("treats an incomplete schema lookup response as an error, not as a missing table", async () => {
  const sql = createSql(async () => []);
  const result = await verifyAdminBackupTables(sql, { tables: ["properties"], coreTables: ["properties"] });
  assert.equal(result.status, "error");
  assert.deepEqual(result.tables[0], { table: "properties", status: "error", exists: null, count: null });
});

test("marks a PostgreSQL statement timeout explicitly and returns to healthy after a successful retry", async () => {
  let shouldTimeout = true;
  const sql = createSql(async (text) => {
    if (shouldTimeout && text.includes("count(*)")) {
      throw Object.assign(new Error("canceling statement due to statement timeout"), { code: "57014" });
    }
    return text.includes("to_regclass") ? [{ name: "public.properties" }] : [{ count: 4 }];
  });
  const timedOut = await verifyAdminBackupTables(sql, { tables: ["properties"], coreTables: ["properties"] });
  assert.equal(timedOut.status, "timeout");
  assert.equal(timedOut.tables[0]?.status, "timeout");
  assert.equal(timedOut.tables[0]?.exists, true);
  assert.equal(timedOut.tables[0]?.count, null);
  assert.equal(timedOut.lastSuccessfulAt, null);

  shouldTimeout = false;
  const recovered = await verifyAdminBackupTables(sql, { tables: ["properties"], coreTables: ["properties"] });
  assert.equal(recovered.status, "healthy");
  assert.equal(recovered.tables[0]?.count, 4);
  assert.ok(recovered.lastSuccessfulAt);
});

test("waits for the SQL driver to settle instead of returning while a query is still pending", async () => {
  let rejectCountQuery: ((error: Error) => void) | undefined;
  const sql = createSql(async (text) => {
    if (text.includes("to_regclass")) return [{ name: "public.properties" }];
    return new Promise<unknown[]>((_, reject) => { rejectCountQuery = reject; });
  });
  let settled = false;
  const verification = verifyAdminBackupTables(sql, { tables: ["properties"], coreTables: ["properties"] })
    .finally(() => { settled = true; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(typeof rejectCountQuery, "function");
  assert.equal(settled, false);
  rejectCountQuery!(Object.assign(new Error("canceling statement due to statement timeout"), { code: "57014" }));
  const result = await verification;
  assert.equal(result.status, "timeout");
  assert.equal(settled, true);
});

test("does not report a backup export as recorded when its history insert fails", async () => {
  const sql = createSql(async () => { throw new Error("history table unavailable"); });
  await assert.rejects(recordAdminBackupExport(sql, { properties: 1 }), /history table unavailable/);
});

test("prunes backup history and records its audit entry in the same transaction", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`
      create table admin_backup_log (id bigserial primary key, created_at timestamptz not null);
      create table admin_audit_log (
        id bigserial primary key, action text not null, entity_type text not null,
        entity_id text, entity_title text not null default '', actor text not null default 'admin',
        metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default current_timestamp
      );
      insert into admin_backup_log(created_at) values
        (current_timestamp - interval '120 days'), (current_timestamp - interval '10 days');
    `);
    const sql = {
      query: async <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
        (await pg.query<T>(text, params)).rows,
      transaction: async <T>(callback: (transactionSql: Sql) => Promise<T>) =>
        pg.transaction(async (tx) => callback({
          query: async <R = Record<string, unknown>>(text: string, params: unknown[] = []) =>
            (await tx.query<R>(text, params)).rows,
        } as unknown as Sql)),
    } as unknown as Sql;

    assert.equal(await pruneAdminBackupHistory(sql, 90), 1);
    const remaining = await pg.query("select id from admin_backup_log");
    const audit = await pg.query<{ action: string; entity_type: string; metadata: { deleted: number; retentionDays: number } }>(
      "select action,entity_type,metadata from admin_audit_log",
    );
    assert.equal(remaining.rows.length, 1);
    assert.deepEqual(audit.rows[0], {
      action: "admin_backup_history_pruned",
      entity_type: "admin_backup",
      metadata: { deleted: 1, retentionDays: 90 },
    });
  } finally {
    await pg.close();
  }
});

test("rolls back backup-history pruning when its required audit write fails", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`
      create table admin_backup_log (id bigserial primary key, created_at timestamptz not null);
      insert into admin_backup_log(created_at) values (current_timestamp - interval '120 days');
    `);
    const sql = {
      query: async <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
        (await pg.query<T>(text, params)).rows,
      transaction: async <T>(callback: (transactionSql: Sql) => Promise<T>) =>
        pg.transaction(async (tx) => callback({
          query: async <R = Record<string, unknown>>(text: string, params: unknown[] = []) =>
            (await tx.query<R>(text, params)).rows,
        } as unknown as Sql)),
    } as unknown as Sql;

    await assert.rejects(pruneAdminBackupHistory(sql, 90), /admin_audit_log/);
    const remaining = await pg.query("select id from admin_backup_log");
    assert.equal(remaining.rows.length, 1);
  } finally {
    await pg.close();
  }
});
