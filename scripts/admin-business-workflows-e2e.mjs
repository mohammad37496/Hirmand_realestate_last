/**
 * End-to-end business workflow for the real admin UI and PostgreSQL.
 * Covers create-as-draft, admin search, edit, publish, public detail, CRM
 * matching, and excluding unavailable properties. Requires a disposable DB.
 */
import pg from "pg";
import { chromium } from "playwright";
import { randomUUID } from "node:crypto";

const normalizeDigits = (value) => value.replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));

const baseUrl = (process.argv[2] || process.env.QA_BASE_URL || "http://127.0.0.1:8081").replace(/\/$/, "");
const adminKey = process.env.HIRMAND_ADMIN_KEY?.trim();
const databaseUrl = process.env.DATABASE_URL?.trim();
const title = process.env.ADMIN_WORKFLOW_PROPERTY_TITLE?.trim() || ("فایل آزمون گردش کار هیرمند " + Date.now());
const price = process.env.ADMIN_WORKFLOW_PROPERTY_PRICE?.trim() || "12345678901";
const editedTitle = title + " (ویرایش)";
const editedPrice = (BigInt(price) + 10_000_000n).toString();

if (!adminKey) throw new Error("HIRMAND_ADMIN_KEY is required for the business workflow E2E.");
if (!databaseUrl) throw new Error("DATABASE_URL is required for the business workflow E2E.");
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
let client;
let propertyId = null;
let leadId = null;
let unavailableLeadId = null;

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

try {
  client = await pool.connect();
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "fa-IR" });

  const login = await context.request.post(baseUrl + "/api/admin/session", {
    data: { action: "login", adminKey },
  });
  if (!login.ok()) throw new Error("Admin session login failed: HTTP " + login.status());

  const page = await context.newPage();
  await page.goto(baseUrl + "/admin", { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => undefined);

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
  if (context) await context.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});
  await pool.end();
}
