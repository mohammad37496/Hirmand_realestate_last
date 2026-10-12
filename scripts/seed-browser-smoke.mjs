import pg from "pg";

const id = process.env.BROWSER_SMOKE_PROPERTY_ID?.trim() || "browser-smoke-property-001";
const slug =
  process.env.BROWSER_SMOKE_PROPERTY_SLUG?.trim() ||
  "آپارتمان-تست-ناوبری-۱۴۰۵-browser-smoke";
const title =
  process.env.BROWSER_SMOKE_PROPERTY_TITLE?.trim() ||
  "فایل تست ناوبری جزئیات هیرمند";
const databaseUrl = process.env.DATABASE_URL?.trim();

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for the browser smoke fixture.");
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });

try {
  const client = await pool.connect();
  try {
    if (process.argv.includes("--cleanup")) {
      await client.query("delete from properties where id = $1", [id]);
      console.log("[browser-smoke] fixture removed");
    } else {
      await client.query(
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
          slug = excluded.slug,
          status = excluded.status,
          title = excluded.title,
          neighborhood = excluded.neighborhood,
          address = excluded.address,
          area_m2 = excluded.area_m2,
          bedrooms = excluded.bedrooms,
          bathrooms = excluded.bathrooms,
          floor = excluded.floor,
          total_floors = excluded.total_floors,
          built_year = excluded.built_year,
          parking = excluded.parking,
          elevator = excluded.elevator,
          price = excluded.price,
          description = excluded.description,
          features = excluded.features,
          images = excluded.images,
          contact_name = excluded.contact_name,
          contact_phone = excluded.contact_phone,
          published_at = excluded.published_at,
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
      console.log("[browser-smoke] fixture ready", { id, slug });
    }
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}
