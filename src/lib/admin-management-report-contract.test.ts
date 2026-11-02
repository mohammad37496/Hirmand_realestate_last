import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { emptyAdminManagementReport } from "./admin-management-report-contract.ts";
import { MANAGEMENT_REPORT_DEALS_SQL, MANAGEMENT_REPORT_TOP_CONSULTANTS_SQL } from "./admin-management-report-sql.ts";

test("unconfigured management report keeps every field the report UI and CSV consume", () => {
  const report = emptyAdminManagementReport(90);
  assert.equal(report.available, false);
  assert.match(report.statusMessage, /پایگاه داده در دسترس نیست/);
  assert.equal(report.days, 90);
  assert.deepEqual(report.properties, { created: 0, published: 0, draft: 0, archived: 0 });
  assert.deepEqual(report.leads, { created: 0, open: 0, contract: 0, closed: 0 });
  assert.deepEqual(report.deals, { created: 0, completed: 0, contracted: 0, volume: 0, commission: 0 });
  assert.equal(report.finance, null);
  assert.deepEqual(report.topConsultants, []);
});

test("the report route parses the requested range then fails closed when the database is unconfigured", () => {
  const route = readFileSync(new URL("../../server/routes/api/admin-management-report.get.ts", import.meta.url), "utf8");
  const daysIndex = route.indexOf("const query = getQuery(event)");
  const unavailableIndex = route.indexOf('if (dbSource === "unconfigured") throw createError({ statusCode: 503');
  assert.ok(daysIndex >= 0 && unavailableIndex > daysIndex);
  assert.ok(!route.includes("emptyAdminManagementReport(days)"));
  assert.ok(route.includes("statusCode: 503"));
  assert.match(route, /MANAGEMENT_REPORT_DEALS_SQL/);
  assert.match(route, /MANAGEMENT_REPORT_TOP_CONSULTANTS_SQL/);
});

test("management report excludes cancelled deals from business volume, commission and consultant ranking", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table admin_deals (
        id text primary key,
        consultant text not null,
        status text not null,
        amount numeric not null default 0,
        commission numeric not null default 0,
        created_at timestamptz not null default current_timestamp
      );
      insert into admin_deals (id,consultant,status,amount,commission,created_at) values
        ('a-completed','مشاور الف','completed',1000000,100000,current_timestamp-interval '1 day'),
        ('a-cancelled','مشاور الف','cancelled',9000000,900000,current_timestamp-interval '1 day'),
        ('b-prospect','مشاور ب','prospect',2000000,200000,current_timestamp-interval '1 day'),
        ('b-contracted','مشاور ب','contracted',3000000,300000,current_timestamp-interval '1 day'),
        ('d-agreement','مشاور د','agreement',4000000,400000,current_timestamp-interval '1 day'),
        ('c-cancelled','مشاور ج','cancelled',50000000,5000000,current_timestamp-interval '1 day');
    `);

    const totals = await db.query<{
      created: number;
      completed: number;
      contracted: number;
      volume: string;
      commission: string;
    }>(MANAGEMENT_REPORT_DEALS_SQL, [30]);
    assert.deepEqual(totals.rows[0], {
      created: 6,
      completed: 1,
      contracted: 1,
      volume: "10000000",
      commission: "400000",
    });

    const consultants = await db.query<{ consultant: string; deals: number; volume: string }>(
      MANAGEMENT_REPORT_TOP_CONSULTANTS_SQL,
      [30],
    );
    assert.deepEqual(consultants.rows, [
      { consultant: "مشاور ب", deals: 2, volume: "5000000" },
      { consultant: "مشاور د", deals: 1, volume: "4000000" },
      { consultant: "مشاور الف", deals: 1, volume: "1000000" },
    ]);
  } finally {
    await db.close();
  }
});

test("management report UI rejects unavailable payloads and never keeps stale period data", () => {
  const ui = readFileSync(new URL("../../src/components/hirmand/admin-management-report.tsx", import.meta.url), "utf8");
  assert.match(ui, /payload\.available !== true/);
  assert.match(ui, /const requestSequence = useRef\(0\)/);
  assert.match(ui, /requestId === requestSequence\.current/);
  assert.match(ui, /setData\(null\)/);
  assert.match(ui, /<AdminErrorBanner message=\{loadError\} onRetry=\{\(\) => void load\(\)\}/);
  assert.match(ui, /disabled=\{!data \|\| data\.days !== days \|\| loading\}/);
});

test("property CSV export fails with 503 instead of returning an empty success file without a database", () => {
  const route = readFileSync(new URL("../../server/routes/api/admin/properties-export.post.ts", import.meta.url), "utf8");
  const permissionIndex = route.indexOf('hasAdminPermission(normalizeAdminRole(claims?.role), "property.manage")');
  const unavailableIndex = route.indexOf('if (dbSource === "unconfigured")');
  assert.ok(permissionIndex >= 0 && unavailableIndex > permissionIndex, "permission must be checked before database availability");
  assert.match(route.slice(unavailableIndex), /statusCode:\s*503/);
  assert.doesNotMatch(route.slice(unavailableIndex), /return "\\uFEFF"/);
});
