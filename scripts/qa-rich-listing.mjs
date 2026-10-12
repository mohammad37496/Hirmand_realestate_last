/**
 * Seeds one fully-populated listing into the local PGlite dev database.
 *
 * The default browser-smoke fixture is deliberately minimal, so the
 * property-detail QA can never reach the branches that only render when real
 * data exists: the amenities accordion, the map section, orientation,
 * cabinet/flooring/closet options, cooling and heating systems, and a
 * multi-image gallery with a counter and thumbnails.
 *
 *   node scripts/qa-rich-listing.mjs           # seed
 *   node scripts/qa-rich-listing.mjs --cleanup # remove the row
 */
import { PGlite } from "@electric-sql/pglite";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { pendingMigrations } from "./migration-plan.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dataDir = join(root, ".grok", "pglite.data");
mkdirSync(dirname(dataDir), { recursive: true });

const ID = "qa-rich-property-001";
const SLUG = "آپارتمان-لوکس-چشم‌انداز-اصفهان-qa-rich";

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
}

if (process.argv.includes("--cleanup")) {
  await pg.query("delete from properties where id = $1", [ID]);
  console.log("[rich] removed", ID);
  await pg.close();
  process.exit(0);
}

const row = {
  id: ID,
  slug: SLUG,
  title: "آپارتمان لوکس ۱۴۸ متری با چشم‌انداز باز در مرکز اصفهان",
  transaction_type: "sell",
  property_type: "apartment",
  city: "اصفهان",
  neighborhood: "مرکز شهر",
  address: "خیابان چهارباغ بالا، کوچه شهید نوروزی، پلاک ۱۲",
  area_m2: 148,
  bedrooms: 3,
  bathrooms: 2,
  floor: 6,
  total_floors: 12,
  built_year: 1402,
  parking: true,
  elevator: true,
  storage: true,
  painted: true,
  wallpaper: true,
  orientation: "southeast",
  cabinet_type: "modern",
  flooring_type: "stone",
  cooling_system: "central",
  heating_system: "radiator",
  wall_closet_type: "built_in",
  price: 14500000000,
  latitude: 32.6546,
  longitude: 51.668,
  // amenity keys, not labels: the view maps them through PROPERTY_*_OPTIONS
  other_amenities: [
    "balcony",
    "video_intercom",
    "central_vacuum",
    "water_purifier",
    "cctv",
    "lobby",
    "gym",
    "private_park",
    "doorman",
    "fire_alarm",
  ],
  features: [
    "نور طبیعی کامل در تمام ساعات روز",
    "دسترسی آسان به مراکز خرید، مدارس و درمان",
    "ساختمان نوساز با سال ساخت بالا",
    "متراژ مناسب برای خانواده با تعداد فرزند",
    "قیمت مناسب نسبت به منطقه",
    "امکان بازدید در هر ساعت شبانه‌روز",
  ],
  // Only real files in public/images, so a gallery 404 never masquerades as an
  // app defect during QA. The trailing entry is a video: the gallery renders a
  // custom player for it, which is a layout path no image-only fixture reaches.
  images: [
    "/images/type-apartment.jpg",
    "/images/type-villa.jpg",
    "/images/type-office.jpg",
    "/images/type-heritage.jpg",
    "/images/isfahan-arch.jpg",
    "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
  ],
  description: [
    "این آپارتمان در طبقه ششم ساختمانی نوساز با چشم‌انداز باز قرار دارد و نور طبیعی در تمام ساعات روز در آن جریان دارد.",
    "واحد دارای سه خواب، دو سرویس، انباری اختصاصی و پارکینگ اختصاصی است. کابینت‌ها به‌صورت مدرن و کف‌پوش سنگ اجرا شده‌اند.",
    "ساختمان دارای سیستم اطفاء حریق، دوربین مداربسته، نگهبانی شبانه‌روز، سالن اجتماعی و باشگاه ورزشی است.",
    "دسترسی به پارکینگ اختصاصی، آسانسور لوکس و سیستم هوشمند ساختمان از امکانات شاخص این فایل است.",
  ].join("\n\n"),
  contact_name: "مشاور تست غنی",
  contact_phone: "09121112233",
};

const columns = Object.keys(row);
const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
const values = columns.map((c) => row[c]);
const assignments = columns
  .filter((c) => c !== "id")
  .map((c) => `${c} = excluded.${c}`)
  .join(", ");

try {
  await pg.query(
    `insert into properties (${columns.join(", ")})
     values (${placeholders})
     on conflict (id) do update set ${assignments}, updated_at = now()`,
    values,
  );
  console.log("[rich] ready", { id: ID, slug: SLUG, columns: columns.length });
} catch (err) {
  // PGlite's thrown error is a multi-megabyte bundle dump; keep the message.
  console.error("[rich] failed:", err?.message ?? err);
  await pg.close();
  process.exit(1);
}

await pg.close();
