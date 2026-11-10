import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "./db.ts";
import {
  loadAdminDashboardConsultantPerformance,
  loadAdminDashboardConsultantStats,
} from "./admin-dashboard-consultant-stats.ts";

test("dashboard consultant aggregates use stable property IDs and return real values", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table consultants (id text primary key, name text not null, phone text not null, is_active boolean not null);
      create table properties (id text primary key, consultant_id text, status text not null, slug text not null, contact_name text, contact_phone text);
      create table leads (id text primary key, consultant text, status text not null, created_at timestamptz not null);
      create table site_events (id text primary key, property_slug text not null, event_name text not null, day date not null);
      insert into consultants values ('consultant-1', 'نام جدید مشاور', '09130000000', true);
      insert into properties values ('property-1', 'consultant-1', 'published', 'property-one', 'نام قدیمی مشاور', '09139999999');
      insert into leads values ('lead-1', 'نام جدید مشاور', 'contract', current_timestamp);
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
      total: 1,
      active: 1,
      consultants_with_files: 1,
      consultants_with_leads: 1,
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
    }]);
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
