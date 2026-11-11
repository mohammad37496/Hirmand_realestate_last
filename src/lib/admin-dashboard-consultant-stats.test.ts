import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "./db.ts";
import {
  loadAdminDashboardConsultantPerformance,
  loadAdminDashboardConsultantStats,
} from "./admin-dashboard-consultant-stats.ts";
import { loadAdminDashboardOptionalQuery } from "./admin-dashboard-optional-query.ts";
import { hasCompleteAdminDashboardSummaryRows } from "./admin-dashboard-summary.ts";

test("dashboard consultant aggregates use stable property IDs and return real values", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table consultants (id text primary key, name text not null, phone text not null, is_active boolean not null);
      create table properties (id text primary key, consultant_id text, status text not null, slug text not null, contact_name text, contact_phone text);
      create table leads (id text primary key, consultant text, consultant_id text, status text not null, created_at timestamptz not null);
      create table site_events (id text primary key, property_slug text not null, event_name text not null, day date not null);
      insert into consultants values ('consultant-1', 'نام جدید مشاور', '09130000000', true);
      insert into consultants values ('consultant-2', 'نام جدید مشاور', '09131111111', true);
      insert into properties values ('property-1', 'consultant-1', 'published', 'property-one', 'نام قدیمی مشاور', '09139999999');
      insert into leads values ('lead-1', 'نام قدیمی مشاور', 'consultant-1', 'contract', current_timestamp);
      insert into leads values ('lead-2', 'نام جدید مشاور', 'consultant-2', 'new', current_timestamp);
      insert into leads values ('legacy', 'نام جدید مشاور', null, 'contract', current_timestamp);
      insert into site_events values
        ('event-1', 'property-one', 'property_view', current_date),
        ('event-2', 'property-one', 'call_click', current_date),
        ('event-3', 'property-one', 'whatsapp_click', current_date);
    `);

    const sql = {
      query: async <T = Record<string, unknown>>(query: string, params: unknown[] = []) =>
        (await db.query<T>(query, params)).rows,
    } as unknown as Sql;

    const stats = await loadAdminDashboardConsultantStats(sql);
    assert.deepEqual(stats, [{
      total: 2,
      active: 2,
      consultants_with_files: 1,
      consultants_with_leads: 2,
    }]);

    const performance = await loadAdminDashboardConsultantPerformance(sql);
    assert.deepEqual(performance, [{
      id: "consultant-1",
      name: "نام جدید مشاور",
      phone: "09130000000",
      is_active: true,
      files: 1,
      leads: 1,
      contracts: 1,
      views: 1,
      calls: 1,
      whatsapp: 1,
    }, {
      id: "consultant-2",
      name: "نام جدید مشاور",
      phone: "09131111111",
      is_active: true,
      files: 0,
      leads: 1,
      contracts: 0,
      views: 0,
      calls: 0,
      whatsapp: 0,
    }]);
  } finally {
    await db.close();
  }
});

test("a successful empty consultant dataset remains a valid zero/empty result", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table consultants (id text primary key, name text not null, phone text not null, is_active boolean not null);
      create table properties (id text primary key, consultant_id text, status text not null, slug text not null);
      create table leads (id text primary key, consultant text, consultant_id text, status text not null, created_at timestamptz not null);
      create table site_events (id text primary key, property_slug text not null, event_name text not null, day date not null);
    `);
    const sql = {
      query: async <T = Record<string, unknown>>(query: string, params: unknown[] = []) =>
        (await db.query<T>(query, params)).rows,
    } as unknown as Sql;

    assert.deepEqual(await loadAdminDashboardConsultantStats(sql), [{
      total: 0,
      active: 0,
      consultants_with_files: 0,
      consultants_with_leads: 0,
    }]);
    assert.deepEqual(await loadAdminDashboardConsultantPerformance(sql), []);
  } finally {
    await db.close();
  }
});

test("dashboard consultant aggregate failures propagate instead of becoming zero or empty results", async () => {
  const sql = {
    query: <T = Record<string, unknown>>() =>
      Promise.reject(new Error("dashboard consultant query unavailable")) as Promise<T[]>,
  } as unknown as Sql;

  await assert.rejects(loadAdminDashboardConsultantStats(sql), /dashboard consultant query unavailable/);
  await assert.rejects(loadAdminDashboardConsultantPerformance(sql), /dashboard consultant query unavailable/);
});

test("optional dashboard telemetry distinguishes a successful empty result from a failed query", async () => {
  const db = new PGlite();
  try {
    await db.exec("create table dashboard_telemetry (value integer not null)");
    const sql = {
      query: async <T = Record<string, unknown>>(query: string, params: unknown[] = []) =>
        (await db.query<T>(query, params)).rows,
    } as unknown as Sql;

    const empty = await loadAdminDashboardOptionalQuery(
      "topPages",
      sql.query("select value from dashboard_telemetry"),
      [],
    );
    assert.deepEqual(empty, { section: "topPages", data: [], available: true, timedOut: false });

    const unavailable = await loadAdminDashboardOptionalQuery(
      "topPages",
      sql.query("select value from missing_dashboard_telemetry"),
      [],
    );
    assert.deepEqual(unavailable, { section: "topPages", data: [], available: false, timedOut: false });
  } finally {
    await db.close();
  }
});

test("optional dashboard telemetry identifies database timeouts separately from other failures", async () => {
  const timeout = Object.assign(new Error("canceling statement due to statement timeout"), { code: "57014" });
  const result = await loadAdminDashboardOptionalQuery("visitorStats", Promise.reject(timeout), [{}]);
  assert.deepEqual(result, { section: "visitorStats", data: [{}], available: false, timedOut: true });
});

test("dashboard rejects missing or malformed core summary rows instead of converting them to zeros", () => {
  const valid = {
    propertyStats: [{ total: 0, published: 0, draft: 0, archived: 0, featured: 0, without_images: 0, new_last7: 0, incomplete: 0 }],
    leadStats: [{ total: 0, new: 0, contacted: 0, follow_up: 0, visited: 0, contract: 0, closed: 0, spam: 0, today: 0, last7: 0, last30: 0 }],
    musicStats: [{ total: 0, active: 0, size_bytes: 0 }],
    followUps: [{ due: 0, next7: 0 }],
    consultantStats: [{ total: 0, active: 0, consultants_with_files: 0, consultants_with_leads: 0 }],
    leadSla: [{ overdue: 0, new_over_4h: 0 }],
  };
  assert.equal(hasCompleteAdminDashboardSummaryRows(valid), true);
  assert.equal(hasCompleteAdminDashboardSummaryRows({ ...valid, propertyStats: [] }), false);
  assert.equal(hasCompleteAdminDashboardSummaryRows({ ...valid, leadStats: [{ total: null }] }), false);
  assert.equal(hasCompleteAdminDashboardSummaryRows({ ...valid, musicStats: [{ total: 0, active: 0, size_bytes: null }] }), false);
});
