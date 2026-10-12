/**
 * Local counterpart of `scripts/seed-browser-smoke.mjs` for the PGlite dev
 * database (the case with no DATABASE_URL, where the dev server keeps its data
 * under `.grok/pglite.data`). Without it the browser smoke has no published
 * listing to navigate from on a plain `npm run dev` checkout.
 *
 * CI uses the Postgres seeder instead — this one only ever touches the local
 * PGlite data directory.
 *
 *   node scripts/local-pglite-fixture.mjs           # seed
 *   node scripts/local-pglite-fixture.mjs --cleanup # remove the main row
 */
import { PGlite } from "@electric-sql/pglite";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { pendingMigrations } from "./migration-plan.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dataDir = join(root, ".grok", "pglite.data");
// Same guard src/lib/db.ts uses: PGlite does not create parent directories.
mkdirSync(dirname(dataDir), { recursive: true });

const id = process.env.BROWSER_SMOKE_PROPERTY_ID?.trim() || "browser-smoke-property-001";
const slug =
  process.env.BROWSER_SMOKE_PROPERTY_SLUG?.trim() ||
  "آپارتمان-تست-ناوبری-۱۴۰۵-browser-smoke";
const title =
  process.env.BROWSER_SMOKE_PROPERTY_TITLE?.trim() ||
  "فایل تست ناوبری جزئیات هیرمند";

const pg = new PGlite({ dataDir });
await pg.waitReady;
await pg.exec(
  "create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())",
);

const files = readdirSync(join(root, "migrations")).filter((f) => f.endsWith(".sql")).sort();
const doneRows = await pg.query("select name from _migrations");
const done = doneRows.rows.map((r) => r.name);
for (const { name } of pendingMigrations(files, done)) {
  await pg.exec(readFileSync(join(root, "migrations", name), "utf8"));
  await pg.query("insert into _migrations (name) values ($1)", [name]);
  console.log("[fixture] applied migration", name);
}

if (process.argv.includes("--cleanup")) {
  await pg.query("delete from properties where id = $1", [id]);
  console.log("[fixture] removed", id);
} else {
  await pg.query(
    `insert into properties (
      id, slug, status, featured, title, transaction_type, property_type, city,
      neighborhood, address, area_m2, bedrooms, bathrooms, floor, total_floors,
      built_year, parking, elevator, storage, price, description, features, images,
      contact_name, contact_phone, published_at
    ) values (
      $1, $2, 'published', false, $3, 'sell', 'apartment', 'اصفهان',
      'مرکز شهر', 'خیابان تست', 123, 2, 2, 4, 8,
      1405, true, true, false, 12300000000,
      $4, $5::jsonb, $6::jsonb,
      'مشاور تست', '09120000000', current_timestamp
    )
    on conflict (id) do update set
      slug = excluded.slug, status = excluded.status, title = excluded.title,
      neighborhood = excluded.neighborhood, address = excluded.address,
      area_m2 = excluded.area_m2, bedrooms = excluded.bedrooms,
      bathrooms = excluded.bathrooms, floor = excluded.floor,
      total_floors = excluded.total_floors, built_year = excluded.built_year,
      parking = excluded.parking, elevator = excluded.elevator, price = excluded.price,
      description = excluded.description, features = excluded.features,
      images = excluded.images, contact_name = excluded.contact_name,
      contact_phone = excluded.contact_phone, published_at = excluded.published_at,
      updated_at = current_timestamp`,
    [
      id,
      slug,
      title,
      "این رکورد فقط برای Browser Smoke است و برای تست کامل مسیر کارت، جزئیات، گالری، مشخصات و refresh استفاده می‌شود.",
      JSON.stringify(["تست ناوبری", "آسانسور", "پارکینگ"]),
      JSON.stringify([]),
    ],
  );

  // A second published row with a real gallery image + coordinates: exercises
  // the image rendering path and unrelated-to-fixture card ordering.
  await pg.query(
    `insert into properties (
      id, slug, status, featured, title, transaction_type, property_type, city,
      neighborhood, address, area_m2, bedrooms, price, description, features, images,
      contact_name, contact_phone, published_at, latitude, longitude
    ) values (
      $1, $2, 'published', true, $3, 'buy', 'villa', 'اصفهان',
      'شهرک ولی‌عصر', 'خیابان نمونه', 260, 4, 5500000000,
      $4, $5::jsonb, $6::jsonb, 'مشاور تصویری', '09120000001', current_timestamp, 32.6, 51.6
    ) on conflict (id) do update set slug = excluded.slug, status = excluded.status,
      images = excluded.images, price = excluded.price, featured = excluded.featured,
      latitude = excluded.latitude, longitude = excluded.longitude`,
    [
      "browser-smoke-property-002",
      "ویلای-تست-گالری-۳۴۵۵۵۵d4-browser-smoke",
      "ویلای تست گالری تصویر هیرمند",
      "رکورد دوم برای تست گالری تصویر، ویژه‌بودن و مختصات نقشه.",
      JSON.stringify(["استخر", "باغ"]),
      JSON.stringify(["/images/type-villa.jpg"]),
    ],
  );

  // A production-shaped uuid row: the slug ends with the same 8-hex fragment
  // saveProperty uses (id.slice(0, 8)), so /file/<fragment> can be exercised.
  await pg.query(
    `insert into properties (
      id, slug, status, featured, title, transaction_type, property_type, city,
      neighborhood, address, area_m2, bedrooms, price, description, features, images,
      contact_name, contact_phone, published_at
    ) values (
      $1, $2, 'published', false, $3, 'rent', 'apartment', 'اصفهان',
      'شهرک ولی‌عصر', 'خیابان نمونه', 147, 2, 0,
      $4, $5::jsonb, $6::jsonb, 'مشاور هگز', '09120000003', current_timestamp
    ) on conflict (id) do update set slug = excluded.slug, status = excluded.status,
      title = excluded.title, deposit = excluded.deposit, rent = excluded.rent`,
    [
      "345555d4-1111-4222-8333-444455556666",
      "آپارتمان-تست-لینک-قدیمی-شهرک-ولی‌عصر-345555d4",
      "آپارتمان تست لینک قدیمی هیرمند",
      "رکورد سوم شبیه production برای تست /file/<8-hex-fragment>.",
      JSON.stringify(["تست لینک قدیمی"]),
      JSON.stringify(["/images/type-apartment.jpg"]),
    ],
  );
  await pg.query(
    `update properties set deposit = 1200000000, rent = 20000000 where id = $1`,
    ["345555d4-1111-4222-8333-444455556666"],
  );

  // A draft row: must never appear in public listings or resolve on detail.
  await pg.query(
    `insert into properties (
      id, slug, status, title, transaction_type, property_type, neighborhood,
      description, features, images, contact_name, contact_phone
    ) values (
      'browser-smoke-property-draft', 'پیش‌نویس-تست-داخلی-browser-smoke', 'draft',
      'پیش‌نویس منتشرنشده هیرمند', 'sell', 'apartment', 'مرکز شهر',
      'این رکورد پیش‌نویس است و نباید در صفحات عمومی دیده شود.', '[]'::jsonb, '[]'::jsonb,
      'مشاور تست', '09120000002'
    ) on conflict (id) do update set status = excluded.status, slug = excluded.slug`,
  );

  console.log("[fixture] ready", { id, slug, title });
}

await pg.close();
