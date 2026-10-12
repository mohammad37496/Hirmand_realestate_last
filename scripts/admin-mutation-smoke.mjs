import pg from "pg";
import { chromium } from "playwright";

const baseUrl = (process.argv[2] || "http://127.0.0.1:8081").replace(/\/$/, "");
const adminKey = process.env.HIRMAND_ADMIN_KEY?.trim();
const databaseUrl = process.env.DATABASE_URL?.trim();
const title = process.env.ADMIN_SMOKE_PROPERTY_TITLE?.trim() || "فایل تست mutation ادمین هیرمند";
const price = process.env.ADMIN_SMOKE_PROPERTY_PRICE?.trim() || "12345678901";

if (!adminKey) throw new Error("HIRMAND_ADMIN_KEY is required for the admin mutation smoke.");
if (!databaseUrl) throw new Error("DATABASE_URL is required for the admin mutation smoke.");

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    const login = await context.request.post(baseUrl + "/api/admin/session", {
      data: { action: "login", adminKey },
    });
    if (!login.ok()) {
      throw new Error("Admin session login failed: HTTP " + login.status());
    }

    const page = await context.newPage();
    await page.goto(baseUrl + "/admin", { waitUntil: "domcontentloaded", timeout: 45000 });
    // Open the form through the sidebar's "new property" control, which is
    // always rendered. The empty-state "افزودن فایل" button only exists when
    // the database holds zero properties, so it disappeared as soon as the
    // browser-smoke fixture was seeded — the smoke was passing or failing on
    // the state of the database rather than on the code under test. Scoping to
    // the desktop sidebar also keeps it unambiguous: the topbar carries a
    // second button with the same label, and the mobile drawer reuses the
    // same nav markup under a different wrapper.
    await page
      .locator(".admin-sidebar .admin-sidebar-nav")
      .getByRole("button", { name: "فایل جدید" })
      .click();

    const form = page.locator("form.admin-form-wrap");
    await form.waitFor({ state: "visible", timeout: 10000 });
    // Filling before React hydrates mutates the DOM without updating component
    // state, so the save would submit empty values. Wait for hydration first.
    await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => undefined);
    await form.getByLabel("عنوان", { exact: true }).fill(title);
    await form.getByLabel("محله").fill("مرکز شهر");
    // The form carries both a "توضیحات" field and an "اطلاعات و توضیحات صاحب فایل"
    // field. Label matching is substring-based by default, so this one has to be
    // exact or the strict-mode locator resolves to two textareas and throws.
    await form.getByLabel("توضیحات", { exact: true }).fill(
      "این رکورد فقط برای تست واقعی مسیر Admin Form تا mutation و PostgreSQL ایجاد شده است.",
    );
    await form.getByLabel("قیمت فروش (تومان)").fill(price);
    // A new file intentionally starts as a draft (emptyForm() in _admin_impl.tsx
    // sets status: "draft"), but the step after this one opens the public
    // /properties/:slug page, which only serves published listings. Choose the
    // status explicitly so the smoke does not depend on that default.
    // The status <select> is the only one carrying a "published" option, so
    // targeting it by that option keeps the locator stable.
    await form.locator('select:has(option[value="published"])').selectOption("published");

    await form.getByRole("button", { name: "ذخیره", exact: true }).click();
    try {
      // The first server-function call in a cold Nitro preview is compiled on
      // demand, so the very first save legitimately takes far longer than a
      // warm one. A 15s budget turned that cold start into a false failure.
      await page
        .getByText("فایل جدید ذخیره شد.", { exact: true })
        .waitFor({ state: "visible", timeout: 60000 });
    } catch {
      // Report the toast the form actually raised. A bare timeout here hid a
      // validation rejection behind an unhelpful Playwright message.
      const toasts = await page.locator("[data-sonner-toast]").allInnerTexts().catch(() => []);
      throw new Error(
        "Admin save never reported success. Visible toasts: " +
          (toasts.map((text) => text.replace(/\s+/g, " ").trim()).join(" | ") || "(none)"),
      );
    }

    const client = await pool.connect();
    try {
      const rows = await client.query(
        `select id, slug, status, price, deposit, rent, area_m2, bedrooms, bathrooms
         from properties
         where title = $1
         order by created_at desc
         limit 1`,
        [title],
      );
      if (!rows.rows[0]) throw new Error("Admin mutation returned success but PostgreSQL row was not found.");
      const row = rows.rows[0];
      if (row.status !== "published") throw new Error("Admin publish result is not published.");
      if (String(row.price) !== price) throw new Error("Persisted price does not match the submitted money contract.");
      if (row.deposit !== null || row.rent !== null) {
        throw new Error("Optional money columns must persist as SQL NULL, not string-like null values.");
      }
      if (!Number.isInteger(Number(row.area_m2 ?? 0)) || !Number.isInteger(Number(row.bedrooms ?? 0)) || !Number.isInteger(Number(row.bathrooms ?? 0))) {
        throw new Error("Integer property fields did not persist with the expected database types.");
      }

      const detail = await page.goto(
        baseUrl + "/properties/" + encodeURIComponent(String(row.slug)),
        { waitUntil: "domcontentloaded", timeout: 45000 },
      );
      if (!detail || detail.status() >= 400) {
        throw new Error("Published property detail returned HTTP " + (detail?.status() ?? 0));
      }
      const body = await page.locator("body").innerText();
      if (!body.includes(title)) throw new Error("Published property detail does not contain the created title.");

      console.log(JSON.stringify({
        ok: true,
        mutation: "Admin Form -> saveProperty -> PostgreSQL",
        id: String(row.id),
        slug: String(row.slug),
        status: row.status,
        price: String(row.price),
        optionalMoneyNull: row.deposit === null && row.rent === null,
        detailStatus: detail.status(),
      }, null, 2));
    } finally {
      await client.query("delete from properties where title = $1", [title]);
      client.release();
    }
  } finally {
    await context.close();
  }
} finally {
  await browser.close();
  await pool.end();
}
