import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { ADMIN_DASHBOARD_PROPERTY_STATS_SQL, ADMIN_DASHBOARD_PROPERTY_TYPES_SQL } from "./admin-dashboard-property-stats.ts";
import { isAdminDashboardPayload } from "./admin-dashboard-contract.ts";
import { ADMIN_CAMPAIGN_TOTALS_SQL } from "./admin-campaign-performance-sql.ts";

const emptyDashboard = {
  properties: { total: 0, published: 0, draft: 0, archived: 0, featured: 0, withoutImages: 0, newLast7: 0, incomplete: 0 },
  consultants: { total: 0, active: 0, withFiles: 0, withLeads: 0 },
  leads: { total: 0, new: 0, contacted: 0, follow_up: 0, visited: 0, contract: 0, closed: 0, spam: 0, today: 0, last7: 0, last30: 0 },
  propertyTypes: [], leadDays: [], music: { total: 0, active: 0, sizeBytes: 0 },
  visitors: { today: 0, last7: 0, last30: 0, pageviewsToday: 0, pageviewsLast7: 0, pageviewsLast30: 0, activeNow: 0 },
  visitorDays: [], topPages: [], topProperties: [], eventStats: [], visitorSources: [], consultantPerformance: [],
  leadSla: { overdue: 0, newOver4Hours: 0 }, followUps: { due: 0, next7: 0 }, recentLeads: [], unavailableSections: [],
};

test("dashboard response contract accepts empty database state and rejects missing sections", () => {
  assert.equal(isAdminDashboardPayload(emptyDashboard), true);
  const { consultantPerformance: _removed, ...missingConsultants } = emptyDashboard;
  assert.equal(isAdminDashboardPayload(missingConsultants), false);
  const { unavailableSections: _unavailableRemoved, ...missingAvailabilityStatus } = emptyDashboard;
  assert.equal(isAdminDashboardPayload(missingAvailabilityStatus), false);
  assert.equal(isAdminDashboardPayload({ ...emptyDashboard, leads: null }), false);
  assert.equal(isAdminDashboardPayload({ ...emptyDashboard, visitors: { ...emptyDashboard.visitors, today: "0" } }), false);
});

test("unconfigured database response includes the consultant performance collection used by the dashboard", () => {
  const route = readFileSync(new URL("../../server/routes/api/admin-dashboard.post.ts", import.meta.url), "utf8");
  const emptyResponse = route.split('if (dbSource === "unconfigured")')[1]?.split("const sql = await getSql()")[0] ?? "";
  assert.match(emptyResponse, /consultantPerformance:\s*\[\]/);
  assert.match(emptyResponse, /unavailableSections:\s*\["database"\]/);
});

test("optional dashboard query failures are reported as unavailable instead of looking like empty data", () => {
  const route = readFileSync(new URL("../../server/routes/api/admin-dashboard.post.ts", import.meta.url), "utf8");
  for (const section of ["visitorStats", "activeVisitors", "visitorTrend", "topPages", "topProperties", "eventStats", "visitorSources", "followUps", "consultants", "leadSla", "consultantPerformance"]) {
    assert.match(route, new RegExp(`unavailableSections\\.add\\("${section}"\\)`), `${section} failure must be exposed to the client`);
  }
  assert.match(route, /unavailableSections:\s*\[\.\.\.unavailableSections\]/);

  const ui = readFileSync(new URL("../components/hirmand/admin-dashboard.tsx", import.meta.url), "utf8");
  assert.match(ui, /data\.unavailableSections\.length > 0/);
  assert.match(ui, /isUnavailable\("visitorStats"\) \? "—"/);
  assert.match(ui, /csvMetric\("database"/);
});

test("admin dashboard property metrics exclude trashed listings and expired featured flags", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table properties (
        id text primary key,
        status text not null,
        featured boolean not null default false,
        featured_until timestamptz,
        images jsonb,
        created_at timestamptz not null,
        description text,
        neighborhood text,
        property_type text,
        deleted_at timestamptz
      );
      insert into properties (id,status,featured,featured_until,images,created_at,description,neighborhood,property_type,deleted_at) values
        ('active-published','published',true,current_timestamp + interval '2 days','["/a.webp"]',current_timestamp,'A complete property description with more than one hundred and twenty characters. This is a realistic complete test description for the property.', 'مرکز شهر','apartment',null),
        ('active-draft','draft',true,current_timestamp - interval '1 day','[]',current_timestamp,'','', 'villa',null),
        ('active-archived','archived',true,current_timestamp + interval '2 days','["/archived.webp"]',current_timestamp,'An archived listing with complete description text long enough to pass quality checks. This additional sentence keeps the description above the dashboard completeness threshold.','مرکز شهر','apartment',null),
        ('trashed-published','published',true,null,'[]',current_timestamp,'','', 'land',current_timestamp);
    `);

    const stats = await db.query<Record<string, number>>(ADMIN_DASHBOARD_PROPERTY_STATS_SQL);
    assert.deepEqual(stats.rows[0], {
      total: 3,
      published: 1,
      draft: 1,
      archived: 1,
      featured: 1,
      without_images: 1,
      new_last7: 3,
      incomplete: 1,
    });

    const types = await db.query<{ property_type: string; count: number }>(ADMIN_DASHBOARD_PROPERTY_TYPES_SQL);
    assert.deepEqual(Object.fromEntries(types.rows.map((row) => [row.property_type, row.count])), {
      apartment: 2,
      villa: 1,
    });
  } finally {
    await db.close();
  }
});

test("campaign performance fails closed instead of turning query failures into empty metrics", () => {
  const route = readFileSync(new URL("../../server/routes/api/admin-campaign-performance.post.ts", import.meta.url), "utf8");
  const ui = readFileSync(new URL("../components/hirmand/admin-campaign-performance.tsx", import.meta.url), "utf8");
  const permissionIndex = route.indexOf('"reports.view"');
  const unavailableIndex = route.indexOf('if (dbSource === "unconfigured")');

  assert.ok(permissionIndex >= 0 && unavailableIndex > permissionIndex, "reports.view must be checked before database availability");
  assert.match(route, /statusCode:\s*503/);
  assert.equal((route.match(/\.catch\(\(error\)/g) ?? []).length, 0);
  assert.match(ui, /<AdminErrorBanner/);
  assert.match(ui, /setError\(/);
  assert.doesNotMatch(ui, /setData\(\{days:range,rows:\[\]/);
});

test("campaign totals include all grouped sources beyond the fifty visible rows", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table leads (
        id text primary key, acquisition_source text, source text, acquisition_medium text,
        acquisition_campaign text, last_contacted_at timestamptz, status text not null,
        visit_requested_at timestamptz, visit_status text, created_at timestamptz not null
      );
    `);
    for (let index = 0; index < 51; index += 1) {
      await db.query(
        `insert into leads (id,acquisition_source,acquisition_medium,acquisition_campaign,last_contacted_at,status,visit_requested_at,visit_status,created_at)
         values ($1,$2,'web',$3,$4,$5,$6,$7,current_timestamp)`,
        [
          `lead-${index}`,
          `source-${index}`,
          `campaign-${index}`,
          index % 2 === 0 ? new Date().toISOString() : null,
          index === 0 ? "contract" : "new",
          index % 3 === 0 ? new Date().toISOString() : null,
          index % 3 === 0 ? "requested" : "none",
        ],
      );
    }
    const result = await db.query<{
      campaigns: number;
      leads: number;
      contacted: number;
      visits: number;
      contracts: number;
    }>(ADMIN_CAMPAIGN_TOTALS_SQL, [30]);
    assert.deepEqual(result.rows[0], {
      campaigns: 51,
      leads: 51,
      contacted: 26,
      visits: 17,
      contracts: 1,
    });
  } finally {
    await db.close();
  }
});

test("property quality and publication queue distinguish unavailable storage from empty results", () => {
  const qualityRoute = readFileSync(new URL("../../server/routes/api/admin-property-quality.post.ts", import.meta.url), "utf8");
  const qualityUi = readFileSync(new URL("../components/hirmand/admin-property-quality-center.tsx", import.meta.url), "utf8");
  const publicationServer = readFileSync(new URL("./admin-publication.ts", import.meta.url), "utf8");
  const publicationUi = readFileSync(new URL("../components/hirmand/admin-publication-queue.tsx", import.meta.url), "utf8");
  const qualityPermissionIndex = qualityRoute.indexOf('"property.manage"');
  const qualityUnavailableIndex = qualityRoute.indexOf('if (dbSource === "unconfigured")');
  const publicationPermissionIndex = publicationServer.indexOf('await requirePublicationPermission("property.manage")');
  const publicationUnavailableIndex = publicationServer.indexOf('if (dbSource === "unconfigured")');

  assert.ok(qualityPermissionIndex >= 0 && qualityUnavailableIndex > qualityPermissionIndex, "property.manage must be checked before database availability");
  assert.match(qualityRoute, /statusCode:\s*503/);
  assert.doesNotMatch(qualityRoute, /return \{ success: true, media: \{ checked: 0, issues: \[\] \}/);
  assert.match(qualityUi, /<AdminErrorBanner/);
  assert.match(qualityUi, /loadError/);

  assert.ok(publicationPermissionIndex >= 0 && publicationUnavailableIndex > publicationPermissionIndex, "property.manage must be checked before database availability");
  assert.match(publicationServer, /if \(dbSource === "unconfigured"\)\s*\{\s*throw new Error/);
  assert.match(publicationUi, /<AdminErrorBanner/);
  assert.match(publicationUi, /loadError/);
});
