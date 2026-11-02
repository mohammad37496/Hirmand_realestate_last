/**
 * End-to-end business workflow for the real admin UI and PostgreSQL.
 * Covers create-as-draft, admin search, edit, publish, public detail, CRM
 * matching, and excluding unavailable properties. Requires a disposable DB.
 */
import pg from "pg";
import { chromium } from "playwright";
import { randomUUID } from "node:crypto";
import { hashAdminPassword } from "../src/lib/admin-password.server.ts";

const normalizeDigits = (value) => value.replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));

const baseUrl = (process.argv[2] || process.env.QA_BASE_URL || "http://127.0.0.1:8081").replace(/\/$/, "");
const adminKey = process.env.HIRMAND_ADMIN_KEY?.trim();
const databaseUrl = process.env.DATABASE_URL?.trim();
const roleCheckPropertyId = process.env.BROWSER_SMOKE_PROPERTY_ID?.trim();
const title = process.env.ADMIN_WORKFLOW_PROPERTY_TITLE?.trim() || ("فایل آزمون گردش کار هیرمند " + Date.now());
const price = process.env.ADMIN_WORKFLOW_PROPERTY_PRICE?.trim() || "12345678901";
const editedTitle = title + " (ویرایش)";
const editedPrice = (BigInt(price) + 10_000_000n).toString();

if (!adminKey) throw new Error("HIRMAND_ADMIN_KEY is required for the business workflow E2E.");
if (!databaseUrl) throw new Error("DATABASE_URL is required for the business workflow E2E.");
if (!roleCheckPropertyId) throw new Error("BROWSER_SMOKE_PROPERTY_ID is required for the property-performance role E2E.");
const database = new URL(databaseUrl);
const databaseName = decodeURIComponent(database.pathname.slice(1));
if (!["localhost", "127.0.0.1", "::1"].includes(database.hostname) || !/(?:^|[_-])(?:test|verify)$/i.test(databaseName)) {
  throw new Error("Admin business E2E requires a local disposable database ending in _test or _verify.");
}
if (!/^\d{1,20}$/.test(price) || BigInt(price) <= 0n) {
  throw new Error("ADMIN_WORKFLOW_PROPERTY_PRICE must be a positive integer money value.");
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
let browser;
let context;
let salesContext;
let client;
let propertyId = null;
let leadId = null;
let unavailableLeadId = null;
let salesAccountId = null;
let salesTestAgencyName = null;
let ownerFixtureOriginal = null;
let ownerFixtureMarker = null;
let ownerFixturePhone = null;
let ownerFixtureRestoreError = null;
const temporaryRoleAccounts = [];
const temporaryRoleContexts = [];

async function postJsonFromPage(page, endpoint, payload, label) {
  // Use the live browser page so secure/session cookies and same-origin checks
  // behave exactly as they do when an admin uses the CRM UI.
  const result = await page.evaluate(async ({ endpoint, payload }) => {
    const response = await fetch(endpoint, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    return { status: response.status, bodyText: await response.text() };
  }, { endpoint, payload });

  if (result.status < 200 || result.status >= 300) {
    throw new Error(label + " failed: HTTP " + result.status + " · " + result.bodyText.slice(0, 500));
  }
  try {
    return JSON.parse(result.bodyText);
  } catch {
    throw new Error(label + " returned invalid JSON: " + result.bodyText.slice(0, 500));
  }
}

async function loginAsTemporaryRole(role) {
  const accountId = randomUUID();
  const username = "qa-" + role + "-" + randomUUID();
  const password = "QA-Role-Password-2026!";
  const passwordHash = await hashAdminPassword(password);
  await client.query(
    "insert into admin_accounts (id,username,display_name,password_hash,role,is_active) values ($1,$2,$3,$4,$5,true)",
    [accountId, username, "QA " + role, passwordHash, role],
  );
  temporaryRoleAccounts.push(accountId);
  const roleContext = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "fa-IR" });
  temporaryRoleContexts.push(roleContext);
  const response = await roleContext.request.post(baseUrl + "/api/admin/session", {
    data: { action: "login", username, password },
  });
  if (!response.ok()) throw new Error("Temporary " + role + " account login failed: HTTP " + response.status());
  const rolePage = await roleContext.newPage();
  await rolePage.goto(baseUrl + "/admin", { waitUntil: "domcontentloaded", timeout: 45000 });
  await rolePage.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => undefined);
  return rolePage;
}

async function consultantTargetsResponse(page) {
  return page.evaluate(async () => {
    const response = await fetch("/api/admin-consultant-targets", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "list", month: "2026-11" }),
    });
    return { status: response.status, bodyText: await response.text() };
  });
}

async function dataHealthResponse(page) {
  return page.evaluate(async () => {
    const response = await fetch("/api/admin-data-health", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "scan" }),
    });
    return { status: response.status, bodyText: await response.text() };
  });
}

async function propertyPerformanceResponse(page, propertyId) {
  return page.evaluate(async (id) => {
    const response = await fetch("/api/admin-property-performance", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ propertyId: id }),
    });
    return { status: response.status, bodyText: await response.text() };
  }, propertyId);
}

async function rawAdminPost(page, endpoint, payload = {}) {
  return page.evaluate(async ({ endpoint, payload }) => {
    const response = await fetch(endpoint, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    return { status: response.status, bodyText: await response.text() };
  }, { endpoint, payload });
}

const ownerDirectoryResponse = (page) => rawAdminPost(page, "/api/admin-owners", { action: "list" });
const ownerExportResponse = (page) => rawAdminPost(page, "/api/admin/properties-export", {});
const customerSubmissionResponse = (page, action = "list") =>
  rawAdminPost(page, "/api/admin-customer-property-submissions", { action, id: "qa-owner-directory-denied" });
const productivitySummaryResponse = (page) => rawAdminPost(page, "/api/admin-productivity", { action: "summary" });
const managementReportResponse = (page) => page.evaluate(async () => {
  const response = await fetch("/api/admin-management-report?days=30", { credentials: "same-origin" });
  return { status: response.status, bodyText: await response.text() };
});
const dashboardResponse = (page) => rawAdminPost(page, "/api/admin-dashboard", {});

async function responseWhileSensitiveTableLocked(page, role, tableName, request) {
  await client.query("begin");
  let response;
  try {
    await client.query(`lock table ${tableName} in access exclusive mode`);
    let timeoutId;
    try {
      response = await Promise.race([
        request(page),
        new Promise((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error(role + " report request queried restricted table " + tableName + " before permission filtering.")), 3000);
        }),
      ]);
    } finally {
      clearTimeout(timeoutId);
    }
  } finally {
    await client.query("rollback");
  }
  if (response.status !== 200) throw new Error(role + " report request should remain available without querying restricted table " + tableName + "; received HTTP " + response.status + ".");
  return response;
}

try {
  client = await pool.connect();
  const ownerFixtureRows = await client.query(
    "select owner_name,owner_phone,owner_info from properties where id=$1 limit 1",
    [roleCheckPropertyId],
  );
  if (!ownerFixtureRows.rows[0]) throw new Error("Owner-directory E2E fixture property does not exist.");
  ownerFixtureOriginal = ownerFixtureRows.rows[0];
  ownerFixtureMarker = "QA_OWNER_DIRECTORY_" + randomUUID();
  ownerFixturePhone = "09" + randomUUID().replace(/\D/g, "").padEnd(9, "1").slice(0, 9);
  await client.query(
    "update properties set owner_name=$2,owner_phone=$3,owner_info=$4 where id=$1",
    [roleCheckPropertyId, ownerFixtureMarker, ownerFixturePhone, ownerFixtureMarker + "_PRIVATE_NOTE"],
  );
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "fa-IR" });

  const login = await context.request.post(baseUrl + "/api/admin/session", {
    data: { action: "login", adminKey },
  });
  if (!login.ok()) throw new Error("Admin session login failed: HTTP " + login.status());
  const ownerManagementReport = await context.request.get(baseUrl + "/api/admin-management-report?days=30");
  if (!ownerManagementReport.ok() || (await ownerManagementReport.json()).finance === null) {
    throw new Error("Owner role must retain finance and deal access in management reports.");
  }

  // Exercise the real account-login/session path with a temporary sales role.
  salesAccountId = randomUUID();
  const salesUsername = "qa-sales-" + randomUUID();
  const salesPassword = "QA-Sales-Password-2026!";
  const salesPasswordHash = await hashAdminPassword(salesPassword);
  await client.query(
    "insert into admin_accounts (id,username,display_name,password_hash,role,is_active) values ($1,$2,'QA Sales', $3,'sales',true)",
    [salesAccountId, salesUsername, salesPasswordHash],
  );
  salesContext = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "fa-IR" });
  const salesLogin = await salesContext.request.post(baseUrl + "/api/admin/session", {
    data: { action: "login", username: salesUsername, password: salesPassword },
  });
  if (!salesLogin.ok()) throw new Error("Temporary sales account login failed: HTTP " + salesLogin.status());
  const salesPage = await salesContext.newPage();
  await salesPage.goto(baseUrl + "/admin", { waitUntil: "domcontentloaded", timeout: 45000 });
  await salesPage.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => undefined);

  const salesTargetsResponse = await consultantTargetsResponse(salesPage);
  if (salesTargetsResponse.status !== 200) {
    throw new Error("Sales role must be able to read consultant targets; received HTTP " + salesTargetsResponse.status);
  }
  const salesDataHealthResponse = await dataHealthResponse(salesPage);
  if (salesDataHealthResponse.status !== 403) {
    throw new Error("Sales role must receive HTTP 403 for data-health scan; received HTTP " + salesDataHealthResponse.status);
  }
  const salesPropertyPerformance = await propertyPerformanceResponse(salesPage, roleCheckPropertyId);
  if (salesPropertyPerformance.status !== 200) {
    throw new Error("Sales role must be able to read property performance; received HTTP " + salesPropertyPerformance.status);
  }
  const salesDashboard = await dashboardResponse(salesPage);
  const salesDashboardData = JSON.parse(salesDashboard.bodyText);
  if (salesDashboard.status !== 200 || !Array.isArray(salesDashboardData.recentLeads) || !Array.isArray(salesDashboardData.consultantPerformance)) {
    throw new Error("Sales role with lead.manage must retain the CRM dashboard detail collections.");
  }

  const ownerSensitiveSnapshot = async () => {
    const snapshot = await client.query(`
      select
        (select md5(coalesce(string_agg(to_jsonb(s)::text, E'\\n' order by s.id),'')) from customer_property_submissions s) as submissions,
        (select md5(coalesce(string_agg(to_jsonb(e)::text, E'\\n' order by e.id),'')) from customer_property_submission_events e) as submission_events,
        (select md5(coalesce(string_agg(to_jsonb(h)::text, E'\\n' order by h.id),'')) from property_change_history h) as property_history,
        (select md5(coalesce(string_agg(to_jsonb(a)::text, E'\\n' order by a.id),'')) from admin_audit_log a) as admin_audit
    `);
    return snapshot.rows[0];
  };
  const ownerDirectoryDeniedBeforeSensitiveQuery = async (restrictedPage, role) => {
    await client.query("begin");
    let response;
    try {
      // Hold the table lock from a separate connection. An unauthorized
      // request must return 403 without waiting for (or issuing) the owner
      // directory SELECT. If the handler queries first, this request times out.
      await client.query("lock table properties in access exclusive mode");
      let timeoutId;
      try {
        response = await Promise.race([
          ownerDirectoryResponse(restrictedPage),
          new Promise((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error(role + " owner-directory request waited on the sensitive properties query before authorization.")), 3000);
          }),
        ]);
      } finally {
        clearTimeout(timeoutId);
      }
    } finally {
      await client.query("rollback");
    }
    if (response.status !== 403 || response.bodyText.includes(ownerFixtureMarker) || response.bodyText.includes(ownerFixturePhone)) {
      throw new Error(role + " role must be denied before the owner-directory database query and receive no private owner data.");
    }
    return response;
  };
  const customerSubmissionDeniedBeforeSensitiveQuery = async (restrictedPage, role) => {
    await client.query("begin");
    let response;
    try {
      await client.query("lock table customer_property_submissions in access exclusive mode");
      let timeoutId;
      try {
        response = await Promise.race([
          customerSubmissionResponse(restrictedPage, "reject"),
          new Promise((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error(role + " customer-submission request waited on private submission SQL before authorization.")), 3000);
          }),
        ]);
      } finally {
        clearTimeout(timeoutId);
      }
    } finally {
      await client.query("rollback");
    }
    if (response.status !== 403 || response.bodyText.includes(ownerFixtureMarker) || response.bodyText.includes(ownerFixturePhone)) {
      throw new Error(role + " role must be denied before customer-submission owner data is queried or mutated.");
    }
    return response;
  };
  const ownerSnapshotBeforeDeniedSales = await ownerSensitiveSnapshot();
  await ownerDirectoryDeniedBeforeSensitiveQuery(salesPage, "sales");
  const salesOwnerExport = await ownerExportResponse(salesPage);
  if (salesOwnerExport.status !== 200 || salesOwnerExport.bodyText.includes(ownerFixtureMarker) || salesOwnerExport.bodyText.includes("صاحب فایل")) {
    throw new Error("Sales property export must retain property data but omit private owner fields and CSV columns.");
  }
  await customerSubmissionDeniedBeforeSensitiveQuery(salesPage, "sales");
  const salesProductivitySummary = await productivitySummaryResponse(salesPage);
  if (salesProductivitySummary.status !== 200 || salesProductivitySummary.bodyText.includes(ownerFixtureMarker) || salesProductivitySummary.bodyText.includes(ownerFixturePhone)) {
    throw new Error("Sales productivity summary must omit private duplicate-owner groups and phone numbers.");
  }
  const salesManagementReport = await responseWhileSensitiveTableLocked(salesPage, "sales", "finance_transactions", managementReportResponse);
  const salesManagementReportData = JSON.parse(salesManagementReport.bodyText);
  if (salesManagementReportData.finance !== null) {
    throw new Error("Sales management report must not query or return finance totals without finance.manage.");
  }
  if (typeof salesManagementReportData.deals?.created !== "number" || salesManagementReportData.deals?.volume === undefined) {
    throw new Error("Sales management report should retain the permitted deal summary without finance totals.");
  }
  const salesPropertyTitleRows = await client.query("select title from properties where id=$1", [roleCheckPropertyId]);
  await salesPage.locator(".admin-sidebar .admin-sidebar-nav").getByRole("button", { name: "فایل‌های ملک" }).click();
  const salesPropertySearch = salesPage.getByLabel("جستجوی فایل‌ها");
  await salesPropertySearch.waitFor({ state: "visible", timeout: 10000 });
  await salesPropertySearch.fill(String(salesPropertyTitleRows.rows[0]?.title ?? ""));
  await salesPage.getByText(String(salesPropertyTitleRows.rows[0]?.title ?? ""), { exact: true }).waitFor({ state: "visible", timeout: 15000 });
  await salesPropertySearch.fill(ownerFixturePhone);
  await salesPage.getByText(String(salesPropertyTitleRows.rows[0]?.title ?? ""), { exact: true }).waitFor({ state: "hidden", timeout: 15000 });
  const salesPropertyListText = await salesPage.locator("body").innerText();
  if (salesPropertyListText.includes(ownerFixtureMarker) || salesPropertyListText.includes(ownerFixturePhone)) {
    throw new Error("Sales property server-function list exposed private owner fields in the UI.");
  }
  const ownerSnapshotAfterDeniedSales = await ownerSensitiveSnapshot();
  if (JSON.stringify(ownerSnapshotAfterDeniedSales) !== JSON.stringify(ownerSnapshotBeforeDeniedSales)) {
    throw new Error("Denied sales customer-submission mutation changed submission, history, or audit data.");
  }
  console.log("ok   sales is denied before the owner-directory SQL, receives redacted property exports, and cannot mutate private submission data");

  salesTestAgencyName = "QA Partner Permission " + randomUUID();
  const partnerSnapshot = async () => {
    const snapshot = await client.query(`
      select
        (select coalesce(md5(string_agg(to_jsonb(a)::text, chr(10) order by a.id)), md5('')) from partner_accounts a) as accounts,
        (select coalesce(md5(string_agg(to_jsonb(c)::text, chr(10) order by c.id)), md5('')) from partner_contracts c) as contracts,
        (select coalesce(md5(string_agg(to_jsonb(r)::text, chr(10) order by r.id)), md5('')) from partner_rewards r) as rewards,
        (select coalesce(md5(string_agg(to_jsonb(a)::text, chr(10) order by a.id)), md5('')) from partner_audit_logs a) as audits
    `);
    return snapshot.rows[0];
  };
  const partnerSnapshotBefore = await partnerSnapshot();
  const salesPartnerActions = [
    { action: "list" },
    { action: "pending" },
    { action: "details", partnerId: "qa-missing-partner" },
    { action: "create", agencyName: salesTestAgencyName, contactName: "QA Sales", phone: "09" + randomUUID().replace(/\D/g, "").padEnd(9, "1").slice(0, 9) },
    { action: "approve", contractId: "qa-missing-contract" },
    { action: "reject", contractId: "qa-missing-contract" },
    { action: "new-card", partnerId: "qa-missing-partner" },
    { action: "claim-reward", partnerId: "qa-missing-partner" },
    { action: "status", partnerId: "qa-missing-partner", status: "suspended" },
  ];
  const salesPartnerResponses = await salesPage.evaluate(async (actions) => Promise.all(actions.map(async (payload) => {
    const response = await fetch("/api/admin/partners", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    return { action: payload.action, status: response.status };
  })), salesPartnerActions);
  for (const response of salesPartnerResponses) {
    if (response.status !== 403) {
      throw new Error("Sales role must receive HTTP 403 for partner action " + response.action + "; received " + response.status);
    }
  }
  const partnerSnapshotAfter = await partnerSnapshot();
  if (JSON.stringify(partnerSnapshotAfter) !== JSON.stringify(partnerSnapshotBefore)) {
    throw new Error("A denied sales partner request changed partner accounts, contracts, rewards, or audit rows.");
  }
  console.log("ok   active sales account is denied every partner-administration action without changing partner data");

  const managerPage = await loginAsTemporaryRole("manager");
  const managerTargetsResponse = await consultantTargetsResponse(managerPage);
  if (managerTargetsResponse.status !== 200) {
    throw new Error("Manager role must be able to read consultant targets; received HTTP " + managerTargetsResponse.status);
  }
  const managerDataHealthResponse = await dataHealthResponse(managerPage);
  if (managerDataHealthResponse.status !== 200) {
    throw new Error("Manager role must be able to run data-health scan; received HTTP " + managerDataHealthResponse.status);
  }
  const managerPropertyPerformance = await propertyPerformanceResponse(managerPage, roleCheckPropertyId);
  if (managerPropertyPerformance.status !== 200) {
    throw new Error("Manager role must be able to read property performance; received HTTP " + managerPropertyPerformance.status);
  }
  const managerOwnerDirectory = await ownerDirectoryResponse(managerPage);
  if (managerOwnerDirectory.status !== 200 || !managerOwnerDirectory.bodyText.includes(ownerFixtureMarker)) {
    throw new Error("Manager role must be able to read the authorized owner directory, including its fixture owner.");
  }
  const managerManagementReport = await managementReportResponse(managerPage);
  if (managerManagementReport.status !== 200 || JSON.parse(managerManagementReport.bodyText).finance === null) {
    throw new Error("Manager role must retain finance access in management reports.");
  }
  const managerOwnerExport = await ownerExportResponse(managerPage);
  if (managerOwnerExport.status !== 200 || !managerOwnerExport.bodyText.includes(ownerFixtureMarker)) {
    throw new Error("Manager property export must include owner fields after owner-directory authorization.");
  }
  const managerCustomerSubmissions = await customerSubmissionResponse(managerPage);
  if (managerCustomerSubmissions.status !== 200) {
    throw new Error("Manager role must be able to read the customer-property submission queue; received HTTP " + managerCustomerSubmissions.status);
  }
  if (await managerPage.locator(".admin-sidebar .admin-sidebar-nav").getByRole("button", { name: "مالکین" }).count() !== 1) {
    throw new Error("Manager navigation must expose the owner-directory view.");
  }

  for (const role of ["content", "viewer", "staff"]) {
    const restrictedPage = await loginAsTemporaryRole(role);
    const targetsResponse = await consultantTargetsResponse(restrictedPage);
    if (targetsResponse.status !== 403) {
      throw new Error(role + " role must receive HTTP 403 for consultant target list; received " + targetsResponse.status);
    }
    if (/commissionTarget|leadTarget|consultantTarget|"commissions"/.test(targetsResponse.bodyText)) {
      throw new Error(role + " role received consultant target data in a denied response.");
    }
    const dataHealth = await dataHealthResponse(restrictedPage);
    if (dataHealth.status !== 403) {
      throw new Error(role + " role must receive HTTP 403 for data-health scan; received HTTP " + dataHealth.status);
    }
    if (/orphan_lead|unknown_consultant|entityId|"findings"/.test(dataHealth.bodyText)) {
      throw new Error(role + " role received CRM integrity data in a denied response.");
    }
    const propertyPerformance = await propertyPerformanceResponse(restrictedPage, roleCheckPropertyId);
    const expectedPropertyPerformanceStatus = role === "content" ? 200 : 403;
    if (propertyPerformance.status !== expectedPropertyPerformanceStatus) {
      throw new Error(role + " role must receive HTTP " + expectedPropertyPerformanceStatus + " for property performance; received " + propertyPerformance.status);
    }
    if (expectedPropertyPerformanceStatus === 403 && /contactName|leadSources|"leads"/.test(propertyPerformance.bodyText)) {
      throw new Error(role + " role received private property or lead performance data in a denied response.");
    }
    await ownerDirectoryDeniedBeforeSensitiveQuery(restrictedPage, role);
    if (role === "content" || role === "viewer") {
      const restrictedManagementReport = await responseWhileSensitiveTableLocked(restrictedPage, role, "finance_transactions", managementReportResponse);
      const restrictedDealReport = await responseWhileSensitiveTableLocked(restrictedPage, role, "admin_deals", managementReportResponse);
      const restrictedManagementReportData = JSON.parse(restrictedManagementReport.bodyText);
      const restrictedDealReportData = JSON.parse(restrictedDealReport.bodyText);
      if (restrictedManagementReportData.finance !== null || restrictedDealReportData.deals?.created !== 0 || restrictedDealReportData.deals?.completed !== 0 || restrictedDealReportData.deals?.contracted !== 0 || restrictedDealReportData.deals?.volume !== 0 || restrictedDealReportData.deals?.commission !== 0 || restrictedDealReportData.topConsultants?.length !== 0) {
        throw new Error(role + " report must not query or expose finance/deal details without their underlying permissions.");
      }
      const restrictedDashboard = await dashboardResponse(restrictedPage);
      if (restrictedDashboard.status !== 200) throw new Error(role + " report dashboard should remain available; received HTTP " + restrictedDashboard.status);
      const restrictedDashboardData = JSON.parse(restrictedDashboard.bodyText);
      if (restrictedDashboardData.recentLeads?.length !== 0 || restrictedDashboardData.consultantPerformance?.length !== 0 || restrictedDashboardData.consultantPerformance?.some((item) => item.phone) || restrictedDashboardData.consultants?.withFiles !== null) {
        throw new Error(role + " dashboard queried or returned private lead/consultant performance or phone details without lead.manage.");
      }
      if (await restrictedPage.getByRole("heading", { name: "آخرین درخواست‌ها" }).count() !== 0) {
        throw new Error(role + " dashboard rendered the private recent-leads section without lead.manage.");
      }
    } else {
      const staffManagementReport = await managementReportResponse(restrictedPage);
      if (staffManagementReport.status !== 403) throw new Error("Staff role must be denied management reports without reports.view.");
    }
    const ownerExport = await ownerExportResponse(restrictedPage);
    const expectedOwnerExportStatus = role === "content" ? 200 : 403;
    if (ownerExport.status !== expectedOwnerExportStatus) {
      throw new Error(role + " role must receive HTTP " + expectedOwnerExportStatus + " for property export; received " + ownerExport.status);
    }
    if (expectedOwnerExportStatus === 200 && (ownerExport.bodyText.includes(ownerFixtureMarker) || ownerExport.bodyText.includes("صاحب فایل"))) {
      throw new Error(role + " role received private owner fields in property CSV export.");
    }
    const beforeDeniedSubmissionMutation = await ownerSensitiveSnapshot();
    await customerSubmissionDeniedBeforeSensitiveQuery(restrictedPage, role);
    const afterDeniedSubmissionMutation = await ownerSensitiveSnapshot();
    if (JSON.stringify(afterDeniedSubmissionMutation) !== JSON.stringify(beforeDeniedSubmissionMutation)) {
      throw new Error(role + " denied customer-submission mutation changed submission, history, or audit data.");
    }
    const productivity = await productivitySummaryResponse(restrictedPage);
    if (productivity.status === 200 && (productivity.bodyText.includes(ownerFixtureMarker) || productivity.bodyText.includes(ownerFixturePhone))) {
      throw new Error(role + " role received private duplicate-owner data in productivity summary.");
    }
    if (await restrictedPage.locator(".admin-sidebar .admin-sidebar-nav").getByRole("button", { name: "مالکین" }).count() !== 0) {
      throw new Error(role + " role must not see the owner-directory navigation item.");
    }
    if (role === "content") {
      const propertyTitle = String(salesPropertyTitleRows.rows[0]?.title ?? "");
      await restrictedPage.locator(".admin-sidebar .admin-sidebar-nav").getByRole("button", { name: "فایل‌های ملک" }).click();
      const propertySearch = restrictedPage.getByLabel("جستجوی فایل‌ها");
      await propertySearch.waitFor({ state: "visible", timeout: 10000 });
      await propertySearch.fill(propertyTitle);
      await restrictedPage.getByText(propertyTitle, { exact: true }).waitFor({ state: "visible", timeout: 15000 });
      await propertySearch.fill(ownerFixturePhone);
      await restrictedPage.getByText(propertyTitle, { exact: true }).waitFor({ state: "hidden", timeout: 15000 });
      const contentPropertyListText = await restrictedPage.locator("body").innerText();
      if (contentPropertyListText.includes(ownerFixtureMarker) || contentPropertyListText.includes(ownerFixturePhone)) {
        throw new Error("Content property list exposed private owner fields or matched an owner-only phone search.");
      }
    }
  }
  console.log("ok   consultant targets are readable by sales/manager and denied to content/viewer over direct API requests");
  console.log("ok   data-health scans are restricted to owner/manager over direct API requests");

  await salesContext.close();
  salesContext = null;
  await client.query("delete from admin_sessions where account_id=$1", [salesAccountId]);
  await client.query("delete from admin_accounts where id=$1", [salesAccountId]);
  salesAccountId = null;

  const page = await context.newPage();
  await page.goto(baseUrl + "/admin", { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => undefined);
  const ownerTargetsResponse = await consultantTargetsResponse(page);
  if (ownerTargetsResponse.status !== 200) {
    throw new Error("Owner role must be able to read consultant targets; received HTTP " + ownerTargetsResponse.status);
  }
  const ownerDataHealthResponse = await dataHealthResponse(page);
  if (ownerDataHealthResponse.status !== 200) {
    throw new Error("Owner role must be able to run data-health scan; received HTTP " + ownerDataHealthResponse.status);
  }
  const ownerPropertyPerformance = await propertyPerformanceResponse(page, roleCheckPropertyId);
  if (ownerPropertyPerformance.status !== 200) {
    throw new Error("Owner role must be able to read property performance; received HTTP " + ownerPropertyPerformance.status);
  }
  const ownerDirectory = await ownerDirectoryResponse(page);
  if (ownerDirectory.status !== 200 || !ownerDirectory.bodyText.includes(ownerFixtureMarker)) {
    throw new Error("Owner role must be able to read the authorized owner directory, including its fixture owner.");
  }
  const ownerExport = await ownerExportResponse(page);
  if (ownerExport.status !== 200 || !ownerExport.bodyText.includes(ownerFixtureMarker)) {
    throw new Error("Owner property export must include owner fields after owner-directory authorization.");
  }
  const ownerCustomerSubmissions = await customerSubmissionResponse(page);
  if (ownerCustomerSubmissions.status !== 200) {
    throw new Error("Owner role must be able to read customer property submissions; received HTTP " + ownerCustomerSubmissions.status);
  }
  if (await page.locator(".admin-sidebar .admin-sidebar-nav").getByRole("button", { name: "مالکین" }).count() !== 1) {
    throw new Error("Owner navigation must expose the owner-directory view.");
  }

  await page.locator(".admin-sidebar .admin-sidebar-nav")
    .getByRole("button", { name: "فایل جدید" })
    .click();

  let form = page.locator("form.admin-form-wrap");
  await form.waitFor({ state: "visible", timeout: 10000 });
  await form.getByLabel("عنوان", { exact: true }).fill(title);
  await form.getByLabel("محله").fill("مرکز شهر");
  await form.getByLabel("توضیحات", { exact: true }).fill("");
  await form.getByLabel("قیمت فروش (تومان)").fill("");
  await form.locator('select:has(option[value="published"])').selectOption("draft");
  await form.getByRole("button", { name: "ذخیره", exact: true }).click();
  await page.getByText("فایل جدید ذخیره شد.", { exact: true }).waitFor({ state: "visible", timeout: 60000 });

  let rows = await client.query(
    "select id, slug, status, price, deposit, rent, description, availability_status from properties where title=$1 order by created_at desc limit 1",
    [title],
  );
  if (!rows.rows[0]) throw new Error("Create step reported success but no property row exists.");
  let row = rows.rows[0];
  propertyId = String(row.id);
  if (row.status !== "draft") throw new Error("New property must be saved as draft before publication.");
  if (row.price !== null || row.deposit !== null || row.rent !== null) {
    throw new Error("An incomplete draft must persist empty money columns as SQL NULL.");
  }
  if (String(row.description ?? "") !== "") {
    throw new Error("An incomplete draft must preserve its empty description.");
  }

  // Search in the admin file list, then edit the exact matching listing.
  const search = page.getByLabel("جستجوی فایل‌ها");
  await search.fill(title);
  const editButton = page.getByRole("button", { name: "ویرایش «" + title + "»" });
  await editButton.waitFor({ state: "visible", timeout: 15000 });
  await editButton.click();

  form = page.locator("form.admin-form-wrap");
  await form.waitFor({ state: "visible", timeout: 10000 });
  await form.getByLabel("عنوان", { exact: true }).fill(editedTitle);
  await form.getByLabel("توضیحات", { exact: true }).fill(
    "این فایل صرفاً برای آزمون یکپارچه گردش کار پنل مدیریت، پایگاه داده، انتشار عمومی و تطبیق مشتری ایجاد شده است.",
  );
  await form.getByLabel("قیمت فروش (تومان)").fill(editedPrice);
  await form.locator('select:has(option[value="published"])').selectOption("published");
  await form.getByRole("button", { name: "ذخیره", exact: true }).click();
  await page.getByText("فایل به‌روزرسانی شد.", { exact: true }).waitFor({ state: "visible", timeout: 60000 });

  rows = await client.query(
    "select id, slug, title, status, price, deposit, rent, published_at, availability_status from properties where id=$1 limit 1",
    [propertyId],
  );
  if (!rows.rows[0]) throw new Error("Edited property row disappeared.");
  row = rows.rows[0];
  if (String(row.title) !== editedTitle) throw new Error("Edit step did not persist the new title in PostgreSQL: " + String(row.title ?? "(null)"));
  if (row.status !== "published") throw new Error("Edit/publish step did not persist published status.");
  if (String(row.price) !== editedPrice) throw new Error("Edited price was not persisted.");
  if (!row.published_at) throw new Error("Published property has no published_at timestamp.");
  if (String(row.availability_status ?? "available") !== "available") throw new Error("New listing should begin available.");

  await page.getByLabel("جستجوی فایل‌ها").fill(editedTitle);
  await page.getByRole("button", { name: "ویرایش «" + editedTitle + "»" })
    .waitFor({ state: "visible", timeout: 15000 });

  const detailPage = await context.newPage();
  const detail = await detailPage.goto(
    baseUrl + "/properties/" + encodeURIComponent(String(row.slug)),
    { waitUntil: "networkidle", timeout: 45000 },
  );
  if (!detail || detail.status() >= 400) throw new Error("Published property detail returned HTTP " + (detail?.status() ?? 0));
  const detailHeading = detailPage.locator(".property-detail-title-block");
  await detailHeading.waitFor({ state: "visible", timeout: 15000 });
  const renderedTitle = await detailHeading.innerText();
  if (!normalizeDigits(renderedTitle).includes(normalizeDigits(editedTitle))) {
    throw new Error("Published detail heading mismatch: expected " + editedTitle + ", received " + (renderedTitle || "(empty)") + "; url=" + detailPage.url());
  }

  // Create a lead through the public API so the production automatic matcher runs.
  const leadPhone = () => "09" + randomUUID().replace(/[^0-9]/g, "").padEnd(9, "1").slice(0, 9);
  const minBudget = (BigInt(editedPrice) - 100_000_000n).toString();
  const maxBudget = (BigInt(editedPrice) + 100_000_000n).toString();
  const leadPayload = {
    name: "مشتری آزمایشی گردش کار",
    phone: leadPhone(),
    deal: "خرید",
    propertyType: "آپارتمان",
    neighborhood: "مرکز شهر",
    budgetPurchase: Number(editedPrice),
    budgetPurchaseMin: Number(minBudget),
    budgetPurchaseMax: Number(maxBudget),
    source: "website",
  };
  const createdLead = await postJsonFromPage(page, "/api/leads", leadPayload, "Automatic CRM lead creation");
  leadId = String(createdLead.id ?? "");
  if (!leadId) throw new Error("Public lead creation did not return an id.");
  const automaticRows = await client.query("select matched_properties from leads where id=$1", [leadId]);
  const automaticMatches = Array.isArray(automaticRows.rows[0]?.matched_properties)
    ? automaticRows.rows[0].matched_properties
    : [];
  if (!automaticMatches.some((item) => String(item.id) === propertyId)) {
    throw new Error("Automatic lead matching did not include the published, available property.");
  }

  // Manual CRM matching must return the same available listing.
  let matchResult = await postJsonFromPage(
    page,
    "/api/admin-match",
    { action: "match", leadId, mode: "smart", limit: 24 },
    "Available-property CRM matching",
  );
  if (!Array.isArray(matchResult.matches) || !matchResult.matches.some((item) => String(item.id) === propertyId)) {
    throw new Error("Manual CRM matching did not return the published, available property.");
  }

  // A sold listing must disappear from both automatic and manual CRM results.
  await client.query("update properties set availability_status='sold', updated_at=current_timestamp where id=$1", [propertyId]);
  matchResult = await postJsonFromPage(
    page,
    "/api/admin-match",
    { action: "match", leadId, mode: "smart", limit: 24 },
    "Unavailable-property CRM matching",
  );
  if (Array.isArray(matchResult.matches) && matchResult.matches.some((item) => String(item.id) === propertyId)) {
    throw new Error("Manual CRM matching incorrectly included a sold/unavailable property.");
  }

  const secondLead = await postJsonFromPage(
    page,
    "/api/leads",
    { ...leadPayload, phone: leadPhone() },
    "Unavailable-property automatic CRM lead creation",
  );
  unavailableLeadId = String(secondLead.id ?? "");
  if (!unavailableLeadId) throw new Error("Second public lead creation did not return an id.");
  const unavailableRows = await client.query("select matched_properties from leads where id=$1", [unavailableLeadId]);
  const unavailableMatches = Array.isArray(unavailableRows.rows[0]?.matched_properties)
    ? unavailableRows.rows[0].matched_properties
    : [];
  if (unavailableMatches.some((item) => String(item.id) === propertyId)) {
    throw new Error("Automatic CRM matching incorrectly included a sold/unavailable property.");
  }

  console.log(JSON.stringify({
    ok: true,
    scenarios: [
      { name: "consultant targets role enforcement", ok: true },
      { name: "data-health role enforcement", ok: true },
      { name: "individual property-performance role enforcement", ok: true },
      { name: "create draft", ok: true },
      { name: "admin search", ok: true },
      { name: "edit listing", ok: true },
      { name: "publish listing", ok: true },
      { name: "public detail reflects saved data", ok: true, httpStatus: detail.status() },
      { name: "automatic match includes available property", ok: true },
      { name: "manual match includes available property", ok: true },
      { name: "automatic match excludes sold property", ok: true },
      { name: "manual match excludes sold property", ok: true },
    ],
    propertyId,
    leadId,
    unavailableLeadId,
    finalStatus: "published",
    editedPrice,
    matchedPropertyId: propertyId,
  }, null, 2));
} finally {
  if (client) {
    if (ownerFixtureOriginal) {
      try {
        await client.query(
          "update properties set owner_name=$2,owner_phone=$3,owner_info=$4 where id=$1",
          [roleCheckPropertyId, ownerFixtureOriginal.owner_name, ownerFixtureOriginal.owner_phone, ownerFixtureOriginal.owner_info],
        );
        const restored = await client.query(
          "select owner_name,owner_phone,owner_info from properties where id=$1 limit 1",
          [roleCheckPropertyId],
        );
        const restoredRow = restored.rows[0];
        if (!restoredRow || ["owner_name", "owner_phone", "owner_info"].some((key) => restoredRow[key] !== ownerFixtureOriginal[key])) {
          ownerFixtureRestoreError = new Error("Owner-directory E2E fixture private fields were not restored to their original values.");
        }
      } catch (error) {
        ownerFixtureRestoreError = error;
      }
    }
    for (const accountId of temporaryRoleAccounts) {
      await client.query("delete from admin_sessions where account_id=$1", [accountId]).catch(() => {});
      await client.query("delete from admin_accounts where id=$1", [accountId]).catch(() => {});
    }
    if (salesAccountId) {
      await client.query("delete from admin_sessions where account_id=$1", [salesAccountId]).catch(() => {});
      await client.query("delete from admin_accounts where id=$1", [salesAccountId]).catch(() => {});
    }
    if (salesTestAgencyName) await client.query("delete from partner_accounts where agency_name=$1", [salesTestAgencyName]).catch(() => {});
    const cleanupLeadIds = [leadId, unavailableLeadId].filter(Boolean);
    if (cleanupLeadIds.length) {
      await client.query("delete from admin_tasks where entity_type='lead' and entity_id=any($1::text[])", [cleanupLeadIds]).catch(() => {});
      await client.query("delete from lead_activities where lead_id=any($1::text[])", [cleanupLeadIds]).catch(() => {});
      await client.query("delete from leads where id=any($1::text[])", [cleanupLeadIds]).catch(() => {});
    }
    if (propertyId) {
      await client.query("delete from property_change_history where property_id=$1", [propertyId]).catch(() => {});
      await client.query("delete from properties where id=$1", [propertyId]).catch(() => {});
    } else {
      await client.query("delete from properties where title = any($1::text[])", [[title, editedTitle]]).catch(() => {});
    }
    client.release();
  }
  for (const roleContext of temporaryRoleContexts) await roleContext.close().catch(() => {});
  if (salesContext) await salesContext.close().catch(() => {});
  if (context) await context.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});
  await pool.end();
}

if (ownerFixtureRestoreError) throw ownerFixtureRestoreError;
