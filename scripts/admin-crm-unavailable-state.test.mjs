import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("message-template API distinguishes an unconfigured database from an available template list", () => {
  const route = read("server/routes/api/admin-message-templates.post.ts");
  assert.match(route, /dbSource === "unconfigured"\) \{\s*if \(action === "list"\) return \{ available: false, templates: \[\] \};\s*throw createError\(\{ statusCode: 503/);
  assert.match(route, /available: true,\s*templates: rows\.map/);
});

test("message-template UI keeps API errors visible and disables writes until templates are available", () => {
  const ui = read("src/components/hirmand/admin-lead-message-templates.tsx");
  assert.match(ui, /setLoadError\(message\)/);
  assert.match(ui, /loadError \? <AdminErrorBanner/);
  assert.match(ui, /available === false && !loadError/);
  assert.match(ui, /disabled=\{saving \|\| available !== true\}/);
  assert.match(ui, /loadError && !templates\.length \? null/);
});

test("lead CRM does not report successful mutations or an empty list when the database is unconfigured", () => {
  const route = read("server/routes/api/leads-admin.post.ts");
  const ui = read("src/components/hirmand/admin-lead-manager.tsx");
  const fixture = read("scripts/admin-fixtures.mjs");
  assert.match(route, /if \(dbSource === "unconfigured"\) \{\s*if \(!body\.action \|\| body\.action === "list"\) return \{ available: false, leads: \[\], total: 0 \};\s*throw createError\(\{ statusCode: 503/);
  assert.match(route, /available: true,\s*total: Number\(countRows\[0\]\?\.count\)/);
  assert.match(ui, /data\.available === false/);
  assert.match(ui, /loadError && filteredLeads\.length === 0/);
  assert.match(fixture, /JSON\.stringify\(\{ available: true, total, leads:/);
});

test("action center distinguishes an unavailable database and refuses task completion without storage", () => {
  const route = read("server/routes/api/admin-action-center.post.ts");
  const ui = read("src/components/hirmand/admin-action-center.tsx");
  assert.match(route, /if \(dbSource === "unconfigured"\) \{\s*if \(body\.action === "completeTask"\) throw createError\(\{ statusCode: 503/);
  assert.match(route, /available: false, summary:/);
  assert.match(route, /available: true,\s*summary:/);
  assert.match(ui, /typeof result\?\.available !== "boolean"/);
  assert.match(ui, /available === false \?\s*\(\s*<AdminErrorBanner/);
  assert.match(ui, /available === true \? summary\.total/);
});

test("admin agenda distinguishes an empty schedule from unavailable or failed data", () => {
  const route = read("server/routes/api/admin-agenda.post.ts");
  const ui = read("src/components/hirmand/admin-agenda.tsx");
  assert.match(route, /dbSource === "unconfigured"\) return \{ available: false,/);
  assert.match(route, /available: true,/);
  assert.match(ui, /typeof payload\?\.available!=="boolean"/);
  assert.match(ui, /loadError \? <AdminErrorBanner/);
  assert.match(ui, /data\?\.available===false \? <AdminErrorBanner/);
  assert.doesNotMatch(ui, /setData\(\{overdueFollowUps:\[\],upcomingVisits:\[\],upcomingCallbacks:\[\]\}\)/);
});

test("sales funnel distinguishes unavailable analytics from a genuinely empty funnel", () => {
  const route = read("server/routes/api/admin-sales-funnel.get.ts");
  const ui = read("src/components/hirmand/admin-sales-funnel.tsx");
  assert.match(route, /dbSource === "unconfigured"[\s\S]*statusCode: 503/);
  assert.match(route, /available: true/);
  assert.match(ui, /payload\.available !== true/);
  assert.match(ui, /payload\.days !== days/);
  assert.match(ui, /Array\.isArray\(payload\.statuses\)/);
  assert.match(ui, /Array\.isArray\(payload\.sources\)/);
  assert.match(ui, /Array\.isArray\(payload\.aging\)/);
  assert.match(ui, /error \? <div className="admin-empty" role="alert">/);
  assert.match(ui, /onClick=\{\(\) => void load\(\)\}/);
});

test("customer property submission queue distinguishes unavailable storage from a genuinely empty queue", () => {
  const route = read("server/routes/api/admin-customer-property-submissions.post.ts");
  const ui = read("src/components/hirmand/admin-customer-property-submissions.tsx");
  assert.match(route, /if \(dbSource === "unconfigured"\) \{\s*if \(action !== "list"\) throw createError\(\{ statusCode: 503/);
  assert.match(route, /available: false,[\s\S]*submissions: \[\]/);
  assert.match(route, /available: true,[\s\S]*submissions: rows\.map/);
  assert.match(ui, /typeof data\?\.available !== "boolean"/);
  assert.match(ui, /available === false \? <AdminErrorBanner/);
  assert.match(ui, /available === true && !loadError \? <>/);
  const loadCatch = ui.split("} catch (error) {")[1]?.split("} finally")[0] ?? "";
  assert.doesNotMatch(loadCatch, /setSubmissions\(\[\]\)/);
});

test("sales control center does not turn unavailable or failed analytics queries into zero performance", () => {
  const route = read("server/routes/api/admin-sales-control-center.post.ts");
  const ui = read("src/components/hirmand/admin-sales-control-center.tsx");
  assert.match(route, /if \(dbSource === "unconfigured"\) \{\s*return \{\s*available: false,/);
  assert.match(route, /return \{\s*available: true,/);
  assert.doesNotMatch(route, /consultant query unavailable|pipeline query unavailable|\)\.catch\(\(error\)/);
  assert.match(ui, /!result \|\| typeof result\.available !== "boolean"/);
  assert.match(ui, /data\?\.available === true && !error \? <>/);
  assert.match(ui, /error \? <div className="admin-sales-error" role="alert">/);
  assert.match(ui, /onClick=\{\(\) => void load\(days\)\}/);
});

test("owner directory distinguishes unavailable property data from no registered owners", () => {
  const route = read("server/routes/api/admin-owners.post.ts");
  const ui = read("src/components/hirmand/admin-owner-manager.tsx");
  assert.match(route, /available: false, owners: \[\]/);
  assert.match(route, /available: true,[\s\S]*owners: rows\.map/);
  assert.match(ui, /typeof data\.available!=="boolean"/);
  assert.match(ui, /error\?<AdminErrorBanner/);
  assert.match(ui, /available!==true\?/);
  assert.match(ui, /available===true&&!error\?/);
});

test("KPI history distinguishes an unavailable database from a day without a snapshot", () => {
  const route = read("server/routes/api/admin-kpi-snapshot.post.ts");
  const ui = read("src/components/hirmand/admin-kpi-history.tsx");
  assert.match(route, /if \(dbSource === "unconfigured"\) \{\s*if \(String\(query\.action \?\? ""\) === "sync"\) throw createError\(\{ statusCode: 503/);
  assert.match(route, /return \{ available: false, snapshots: \[\] \}/);
  assert.match(route, /available: true,/);
  assert.match(ui, /typeof data\.available !== "boolean"/);
  assert.match(ui, /error \? <AdminErrorBanner/);
  assert.match(ui, /available === true && !latest \? <div className="admin-empty">هنوز snapshot/);
});

test("finance insights do not report zero revenue or settlements when the database is unavailable", () => {
  const route = read("server/routes/api/admin-finance-insights.get.ts");
  const ui = read("src/components/hirmand/admin-finance-insights.tsx");
  assert.match(route, /available:false,months:\[\],categories:\[\],consultants:\[\],outstanding:0/);
  assert.match(route, /available:true,/);
  assert.match(ui, /typeof result\.available !== "boolean"/);
  assert.match(ui, /error \? <AdminErrorBanner/);
  assert.match(ui, /data\?\.available \? <>/);
});


test("lead dedupe distinguishes unavailable storage from a genuinely empty duplicate list", () => {
  const route = read("server/routes/api/admin-lead-dedupe.post.ts");
  const ui = read("src/components/hirmand/admin-lead-dedupe.tsx");
  assert.match(route, /action === "list"\) return \{ available: false, groups: \[\], total: 0 \}/);
  assert.match(route, /available: true,\s*total: rows\.length/);
  assert.match(route, /dbSource === "unconfigured"[\s\S]*statusCode: 503/);
  assert.match(ui, /data\.available !== true/);
  assert.match(ui, /loadError \? <AdminErrorBanner/);
  assert.match(ui, /available === true && !loadError && !groups\.length/);
});

test("neighborhood demand radar never shows an unavailable database as no demand", () => {
  const route = read("server/routes/api/admin-neighborhood-demand.post.ts");
  const ui = read("src/components/hirmand/admin-neighborhood-demand-radar.tsx");
  assert.match(route, /dbSource === "unconfigured"\) return \{ available: false, items: \[\] \}/);
  assert.match(route, /available: true,\s*items: rows\.map/);
  assert.match(ui, /result\.available !== true/);
  assert.match(ui, /loadError \? <AdminErrorBanner/);
  assert.match(ui, /available === true && !items\.length/);
  assert.match(ui, /catch \(error\)/);
});

test("property lifecycle does not claim an empty queue or successful task creation without storage", () => {
  const route = read("server/routes/api/admin-property-lifecycle.post.ts");
  const ui = read("src/components/hirmand/admin-property-lifecycle-panel.tsx");
  assert.match(route, /dbSource === "unconfigured"[\s\S]*body\.action === "createTasks"[\s\S]*statusCode: 503/);
  assert.match(route, /available: false, items: \[\], createdTasks: 0/);
  assert.match(route, /available: true, items, createdTasks/);
  assert.match(ui, /result\.available !== true/);
  assert.match(ui, /disabled=\{available !== true \|\| creating/);
  assert.match(ui, /loadError \? <AdminErrorBanner/);
  assert.match(ui, /available === true \? <div className="admin-breakdown">/);
});

test("customer submission history query errors remain visible instead of becoming an empty event list", () => {
  const route = read("server/routes/api/admin-customer-property-submissions.post.ts");
  const ui = read("src/components/hirmand/admin-customer-property-submissions.tsx");
  assert.doesNotMatch(route, /customer_property_submission_events[\s\S]{0,260}\.catch\(\(\) => \[\]\)/);
  assert.match(ui, /const \[historyError, setHistoryError\] = useState\(""\)/);
  assert.match(ui, /setHistoryError\(message\)/);
  assert.match(ui, /historyError \? <AdminErrorBanner/);
});

test("CRM operations and saved lead segments fail closed instead of returning zero metrics", () => {
  const operations = read("server/routes/api/admin-operations.post.ts");
  const operationsUi = read("src/components/hirmand/admin-operations-center.tsx");
  const segments = read("server/routes/api/admin-lead-segments.post.ts");
  const segmentsUi = read("src/components/hirmand/admin-lead-segments.tsx");

  assert.match(operations, /dbSource === "unconfigured"[\s\S]{0,220}statusCode: 503/);
  assert.doesNotMatch(operations, /dueLeads:\[\],dueCount:0,next7Count:0/);
  assert.match(operationsUi, /setData\(null\);setError/);
  assert.match(segments, /dbSource===['"']unconfigured['"']\)throw createError\(\{statusCode:503/);
  assert.doesNotMatch(segments, /return\{segments:\[\]\}/);
  assert.match(segmentsUi, /loadError\?\s*<AdminErrorBanner/);
  assert.match(segmentsUi, /setItems\(\[\]\);setLoadError/);


});

test("property viewing capacity cannot be presented as free when storage is unavailable", () => {
  const route = read("server/routes/api/property-viewing-slots.get.ts");
  const ui = read("src/components/hirmand/property-viewing-request.tsx");
  assert.match(route, /dbSource === "unconfigured"[\s\S]{0,220}statusCode: 503/);
  assert.doesNotMatch(route, /success:\s*true,\s*occupiedTimes:\s*\[\]/);
  assert.match(ui, /if \(!response\.ok\) throw new Error/);
  assert.match(ui, /payload\?\.success !== true \|\| !Array\.isArray\(payload\?\.occupiedTimes\)/);
  assert.match(ui, /setSlotsAvailable\(false\)/);
  assert.match(ui, /disabled=\{loadingSlots \|\| !slotsAvailable\}/);
  assert.match(ui, /if \(!slotsAvailable\)/);
});

test("backup verification and export-log write failures are propagated instead of fabricated as zero or success", () => {
  const route = read("server/routes/api/admin-backup.get.ts");
  assert.doesNotMatch(route, /to_regclass\(\$1\)[^;]*\.catch\(/);
  assert.doesNotMatch(route, /count\(\*\)[^;]*\.catch\(/);
  assert.doesNotMatch(route, /insert into admin_backup_log[^;]*\.catch\(/);
  assert.match(route, /await sql\.query\("insert into admin_backup_log/);
});

test("public questions, customer workspace, watch, owner status, and report APIs return unavailable errors", () => {
  const routes = [
    "server/routes/api/property-questions.post.ts",
    "server/routes/api/customer-workspace.get.ts",
    "server/routes/api/customer-workspace.post.ts",
    "server/routes/api/property-watch.post.ts",
    "server/routes/api/property-watch-target.post.ts",
    "server/routes/api/owner-property-status.post.ts",
    "server/routes/api/property-reports.post.ts",
  ];
  for (const path of routes) {
    const route = read(path);
    assert.match(route, /dbSource\s*===\s*"unconfigured"[\s\S]{0,260}statusCode\s*:\s*503/, `${path} must use HTTP 503`);
  }
  assert.doesNotMatch(read("server/routes/api/property-questions.post.ts"), /accepted:\s*false/);
  assert.match(read("server/routes/api/customer-workspace.get.ts"), /dbSource === "unconfigured"[\s\S]{0,220}statusCode: 503/);
  assert.doesNotMatch(read("server/routes/api/property-watch.post.ts"), /ok:\s*true,\s*enabled:\s*false/);
});

test("admin property tools, watermark, phone bridge, and music endpoints do not report fake empty success", () => {
  const routes = [
    "server/routes/api/admin-property-duplicates.post.ts",
    "server/routes/api/admin-property-price-history.post.ts",
    "server/routes/api/admin-watermark.post.ts",
    "server/routes/api/admin-phone-bridge.post.ts",
    "server/routes/api/music-admin.post.ts",
    "server/routes/api/music.get.ts",
    "server/routes/api/music/file/[id].get.ts",
  ];
  for (const path of routes) {
    const route = read(path);
    assert.match(route, /dbSource\s*===\s*"unconfigured"[\s\S]{0,260}statusCode\s*:\s*503/, `${path} must use HTTP 503`);
  }
  assert.doesNotMatch(read("server/routes/api/admin-property-duplicates.post.ts"), /return \{ matches: \[\] \}/);
  assert.doesNotMatch(read("server/routes/api/admin-property-price-history.post.ts"), /return \{ property: null, history: \[\] \}/);
  assert.doesNotMatch(read("server/routes/api/admin-watermark.post.ts"), /return \{ success: true, settings: DEFAULTS \}/);
  assert.doesNotMatch(read("server/routes/api/admin-phone-bridge.post.ts"), /ok: true, devices: \[\], commands: \[\], unconfigured: true/);
  assert.doesNotMatch(read("server/routes/api/music.get.ts"), /autoplay: true, tracks: \[\]/);
});

test("property price history and duplicate check UIs do not preserve stale results after an unavailable response", () => {
  const history = read("src/components/hirmand/admin-property-price-history.tsx");
  const duplicates = read("src/components/hirmand/admin-property-duplicate-check.tsx");
  assert.match(history, /setLoadError\(message\)/);
  assert.match(history, /loadError \? <AdminErrorBanner/);
  assert.match(duplicates, /setChecked\(false\);setMatches\(\[\]\)/);
});

test("campaign KPIs use uncapped aggregate totals and ignore stale range responses", () => {
  const route = read("server/routes/api/admin-campaign-performance.post.ts");
  const totalsSql = read("src/lib/admin-campaign-performance-sql.ts");
  const ui = read("src/components/hirmand/admin-campaign-performance.tsx");
  assert.match(route, /ADMIN_CAMPAIGN_TOTALS_SQL/);
  assert.match(route, /totalRows/);
  assert.match(route, /campaigns:\s*Number\(totalsBase\.campaigns\)/);
  assert.match(totalsSql, /count\(\*\)::int as campaigns/);
  assert.match(route, /limit 50/);
  assert.doesNotMatch(route, /const totals = mapped\.reduce/);
  assert.match(ui, /const requestSequence\s*=\s*useRef\(0\)/);
  assert.match(ui, /const requestId=\+\+requestSequence\.current/);
  assert.match(ui, /requestId===requestSequence\.current/);
  assert.match(ui, /return\s*\(\)=>\{requestSequence\.current\+=1;\}/);
});

test("sales funnel ignores stale range responses and clears data after a failed refresh", () => {
  const ui = read("src/components/hirmand/admin-sales-funnel.tsx");
  assert.match(ui, /const requestSequence\s*=\s*useRef\(0\)/);
  assert.match(ui, /const requestId = \+\+requestSequence\.current/);
  assert.match(ui, /requestId === requestSequence\.current/);
  assert.match(ui, /setData\(null\);\s*setError\(message\)/);
  assert.match(ui, /setError\(""\);\s*setData\(null\);\s*try/);
  assert.match(ui, /return \(\) => \{ requestSequence\.current \+= 1; \};/);
});

test("sales control center maps period leads, calculates period conversion and excludes trashed files", () => {
  const route = read("server/routes/api/admin-sales-control-center.post.ts");
  const dashboard = read("server/routes/api/admin-dashboard.post.ts");
  const ui = read("src/components/hirmand/admin-sales-control-center.tsx");
  const fileStats = route.split("with file_stats as (")[1]?.split("lead_stats as (")[0] ?? "";
  const eventStats = route.split("event_stats as (")[1]?.split("\n       )")[0] ?? "";
  const dashboardEventStats = dashboard.split("event_stats as (")[1]?.split("\n       )")[0] ?? "";
  assert.match(route, /periodLeads:\s*Number\(row\.period_leads\)\s*\|\|\s*0/);
  assert.match(route, /conversionRate:\s*Number\(row\.period_leads\)\s*>\s*0/);
  assert.match(ui, /periodLeads:\s*number/);
  assert.match(ui, /fa\(item\.periodLeads\)/);
  assert.match(fileStats, /deleted_at is null/);
  assert.match(fileStats, /status = 'published'/);
  assert.match(eventStats, /p\.deleted_at is null/, "consultant views must exclude soft-deleted properties");
  assert.match(dashboardEventStats, /p\.deleted_at is null/, "dashboard consultant views must exclude soft-deleted properties");
  assert.match(ui, /const requestSequence\s*=\s*useRef\(0\)/);
  assert.match(ui, /const requestId = \+\+requestSequence\.current/);
  assert.match(ui, /requestId === requestSequence\.current/);
  assert.match(ui, /return \(\) => \{ requestSequence.current \+= 1; \};/);
  assert.match(ui, /onClick=\{\(\) => void load\(days\)\}/);
  assert.doesNotMatch(ui, /setDays\(next\);\s*void load\(next\)/, "the range effect must issue only one request");
});

test("owner search and consultant performance invalidate responses after query changes or unmount", () => {
  const owners = read("src/components/hirmand/admin-owner-manager.tsx");
  const performance = read("src/components/hirmand/admin-consultant-performance.tsx");
  const matching = read("src/components/hirmand/admin-matching-manager.tsx");
  assert.match(owners, /const requestSequence\s*=\s*useRef\(0\)/);
  assert.match(owners, /if\(requestId!==requestSequence\.current\)return/);
  assert.match(owners, /requestSequence\.current\+=1/);
  assert.match(performance, /const requestId = \+\+requestRef\.current/);
  assert.match(performance, /return \(\) => \{ requestRef.current \+= 1; \};/);
  assert.match(matching, /const leadsRequestSequence = useRef\(0\)/);
  assert.match(matching, /const requestId = \+\+leadsRequestSequence\.current/);
  assert.match(matching, /if \(requestId !== leadsRequestSequence\.current\) return/);
  assert.match(matching, /return \(\) => \{ leadsRequestSequence\.current \+= 1; \};/);
});
