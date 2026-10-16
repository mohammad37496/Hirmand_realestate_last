/**
 * End-to-end business workflow for the real admin UI and PostgreSQL.
 * Covers create-as-draft, admin search, edit, publish, public detail, CRM
 * matching, and excluding unavailable properties. Requires a disposable DB.
 */
import pg from "pg";
import { chromium } from "playwright";
import { randomUUID } from "node:crypto";

const baseUrl = (process.argv[2] || process.env.QA_BASE_URL || "http://127.0.0.1:8081").replace(/\/$/, "");
const adminKey = process.env.HIRMAND_ADMIN_KEY?.trim();
const databaseUrl = process.env.DATABASE_URL?.trim();
const title = process.env.ADMIN_WORKFLOW_PROPERTY_TITLE?.trim() || ("فایل آزمون گردش کار هیرمند " + Date.now());
const price = process.env.ADMIN_WORKFLOW_PROPERTY_PRICE?.trim() || "12345678901";
const editedTitle = title + " (ویرایش)";
const editedPrice = (BigInt(price) + 10_000_000n).toString();

if (!adminKey) throw new Error("HIRMAND_ADMIN_KEY is required for the business workflow E2E.");
if (!databaseUrl) throw new Error("DATABASE_URL is required for the business workflow E2E.");
if (!/^\d{1,20}$/.test(price) || BigInt(price) <= 0n) {
  throw new Error("ADMIN_WORKFLOW_PROPERTY_PRICE must be a positive integer money value.");
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
let browser;
let context;
let client;
let propertyId = null;
let leadId = null;

async function assertMatchResponse(response, label) {
  const bodyText = await response.text();
  if (!response.ok()) throw new Error(label + " failed: HTTP " + response.status() + " · " + bodyText.slice(0, 500));
  try {
    return JSON.parse(bodyText);
  } catch {
    throw new Error(label + " returned invalid JSON: " + bodyText.slice(0, 500));
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
  await form.getByLabel("توضیحات", { exact: true }).fill(
    "این فایل صرفاً برای آزمون یکپارچه گردش کار پنل مدیریت، پایگاه داده، انتشار عمومی و تطبیق مشتری ایجاد شده است.",
  );
  await form.getByLabel("قیمت فروش (تومان)").fill(price);
  await form.locator('select:has(option[value="published"])').selectOption("draft");
  await form.getByRole("button", { name: "ذخیره", exact: true }).click();
  await page.getByText("فایل جدید ذخیره شد.", { exact: true }).waitFor({ state: "visible", timeout: 60000 });

  let rows = await client.query(
    "select id, slug, status, price, deposit, rent, availability_status from properties where title=$1 order by created_at desc limit 1",
    [title],
  );
  if (!rows.rows[0]) throw new Error("Create step reported success but no property row exists.");
  let row = rows.rows[0];
  propertyId = String(row.id);
  if (row.status !== "draft") throw new Error("New property must be saved as draft before publication.");
  if (String(row.price) !== price) throw new Error("Created draft price does not match the submitted value.");
  if (row.deposit !== null || row.rent !== null) throw new Error("Optional money columns must persist as SQL NULL.");

  // Search in the admin file list, then edit the exact matching listing.
  const search = page.getByLabel("جستجوی فایل‌ها");
  await search.fill(title);
  const editButton = page.getByRole("button", { name: "ویرایش «" + title + "»" });
  await editButton.waitFor({ state: "visible", timeout: 15000 });
  await editButton.click();

  form = page.locator("form.admin-form-wrap");
  await form.waitFor({ state: "visible", timeout: 10000 });
  await form.getByLabel("عنوان", { exact: true }).fill(editedTitle);
  await form.getByLabel("قیمت فروش (تومان)").fill(editedPrice);
  await form.locator('select:has(option[value="published"])').selectOption("published");
  await form.getByRole("button", { name: "ذخیره", exact: true }).click();
  await page.getByText("فایل به‌روزرسانی شد.", { exact: true }).waitFor({ state: "visible", timeout: 60000 });

  rows = await client.query(
    "select id, slug, status, price, deposit, rent, published_at, availability_status from properties where id=$1 limit 1",
    [propertyId],
  );
  if (!rows.rows[0]) throw new Error("Edited property row disappeared.");
  row = rows.rows[0];
  if (row.status !== "published") throw new Error("Edit/publish step did not persist published status.");
  if (String(row.price) !== editedPrice) throw new Error("Edited price was not persisted.");
  if (!row.published_at) throw new Error("Published property has no published_at timestamp.");
  if (String(row.availability_status ?? "available") !== "available") throw new Error("New listing should begin available.");

  await page.getByLabel("جستجوی فایل‌ها").fill(editedTitle);
  await page.getByRole("button", { name: "ویرایش «" + editedTitle + "»" })
    .waitFor({ state: "visible", timeout: 15000 });

  const detail = await page.goto(
    baseUrl + "/properties/" + encodeURIComponent(String(row.slug)),
    { waitUntil: "domcontentloaded", timeout: 45000 },
  );
  if (!detail || detail.status() >= 400) throw new Error("Published property detail returned HTTP " + (detail?.status() ?? 0));
  if (!(await page.locator("body").innerText()).includes(editedTitle)) {
    throw new Error("Published detail page does not reflect the edited listing title.");
  }

  // A genuine CRM lead targets the just-published apartment file.
  leadId = randomUUID();
  const minBudget = (BigInt(editedPrice) - 100_000_000n).toString();
  const maxBudget = (BigInt(editedPrice) + 100_000_000n).toString();
  await client.query(
    "insert into leads (id,name,phone,deal,property_type,neighborhood,status,source,budget_purchase,budget_purchase_min,budget_purchase_max,requested_amenities,requested_bedrooms) values ($1,$2,$3,$4,$5,$6,'new','website',$7,$8,$9,'[]'::jsonb,2)",
    [leadId, "مشتری آزمایشی گردش کار", "09129999999", "خرید", "آپارتمان", "مرکز شهر", editedPrice, minBudget, maxBudget],
  );

  let matchHttp = await context.request.post(baseUrl + "/api/admin-match", {
    data: { action: "match", leadId, mode: "smart", limit: 24 },
  });
  let matchResult = await assertMatchResponse(matchHttp, "Available-property CRM matching");
  if (!Array.isArray(matchResult.matches) || !matchResult.matches.some((item) => String(item.id) === propertyId)) {
    throw new Error("CRM matching did not return the published, available property for the matching lead.");
  }

  // Regression: a still-published listing marked sold must not be recommended.
  await client.query("update properties set availability_status='sold', updated_at=current_timestamp where id=$1", [propertyId]);
  matchHttp = await context.request.post(baseUrl + "/api/admin-match", {
    data: { action: "match", leadId, mode: "smart", limit: 24 },
  });
  matchResult = await assertMatchResponse(matchHttp, "Unavailable-property CRM matching");
  if (Array.isArray(matchResult.matches) && matchResult.matches.some((item) => String(item.id) === propertyId)) {
    throw new Error("CRM matching incorrectly included a sold/unavailable property.");
  }

  console.log(JSON.stringify({
    ok: true,
    scenarios: [
      { name: "create draft", ok: true },
      { name: "admin search", ok: true },
      { name: "edit listing", ok: true },
      { name: "publish listing", ok: true },
      { name: "public detail reflects saved data", ok: true, httpStatus: detail.status() },
      { name: "match available property to customer", ok: true },
      { name: "exclude sold property from matching", ok: true },
    ],
    propertyId,
    leadId,
    finalStatus: "published",
    editedPrice,
    matchedPropertyId: propertyId,
  }, null, 2));
} finally {
  if (client) {
    if (leadId) {
      await client.query("delete from lead_activities where lead_id=$1", [leadId]).catch(() => {});
      await client.query("delete from leads where id=$1", [leadId]).catch(() => {});
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
