import pg from "pg";

const id = process.env.BROWSER_SMOKE_PROPERTY_ID?.trim() || "browser-smoke-property-001";
const slug =
  process.env.BROWSER_SMOKE_PROPERTY_SLUG?.trim() ||
  "آپارتمان-تست-ناوبری-۱۴۰۵-browser-smoke";
const title =
  process.env.BROWSER_SMOKE_PROPERTY_TITLE?.trim() ||
  "فایل تست ناوبری جزئیات هیرمند";
const spatialFixtureIds = [
  "browser-smoke-map-inside",
  "browser-smoke-map-outside",
  "browser-smoke-map-other-neighborhood",
  "browser-smoke-map-no-coordinates",
];
const databaseUrl = process.env.DATABASE_URL?.trim();

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for the browser smoke fixture.");
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });

try {
  const client = await pool.connect();
  try {
    if (process.argv.includes("--cleanup")) {
      await client.query(
        "delete from properties where id = any($1::text[])",
        [[id, ...spatialFixtureIds]],
      );
      console.log("[browser-smoke] navigation and map fixtures removed");
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
      // Temporary published fixtures exercise the real SQL combination of
      // bbox + deal type + price + area + exact neighborhood. They live only
      // in the disposable Verify database and are removed by --cleanup.
      const spatialFixtures = [
        {
          id: spatialFixtureIds[0],
          slug: "browser-smoke-map-inside",
          title: "فایل تست نقشه داخل محدوده",
          neighborhood: "شهرک ولی‌عصر",
          latitude: 32.739,
          longitude: 51.660,
        },
        {
          id: spatialFixtureIds[1],
          slug: "browser-smoke-map-outside",
          title: "فایل تست نقشه خارج محدوده",
          neighborhood: "شهرک ولی‌عصر",
          latitude: 32.749,
          longitude: 51.660,
        },
        {
          id: spatialFixtureIds[2],
          slug: "browser-smoke-map-other-neighborhood",
          title: "فایل تست نقشه محله دیگر",
          neighborhood: "سپاهان‌شهر",
          latitude: 32.739,
          longitude: 51.660,
        },
        {
          id: spatialFixtureIds[3],
          slug: "browser-smoke-map-no-coordinates",
          title: "فایل تست نقشه بدون مختصات",
          neighborhood: "شهرک ولی‌عصر",
          latitude: null,
          longitude: null,
        },
      ];

      for (const fixture of spatialFixtures) {
        await client.query(
          `insert into properties (
            id, slug, status, featured, title, transaction_type, property_type, city,
            neighborhood, address, area_m2, bedrooms, bathrooms, floor, total_floors,
            built_year, parking, elevator, storage, price, description, features, images,
            contact_name, contact_phone, published_at, latitude, longitude
          ) values (
            $1, $2, 'published', false, $3, 'sell', 'apartment', 'اصفهان',
            $4, 'موقعیت آزمایشی نقشه', 100, 2, 1, 3, 5,
            1400, true, true, true, 6000000000, 'Browser smoke geo filter fixture',
            '[]'::jsonb, '[]'::jsonb, 'مشاور تست', '09120000000',
            '2000-01-01T00:00:00Z'::timestamptz, $5, $6
          )
          on conflict (id) do update set
            slug = excluded.slug,
            status = excluded.status,
            title = excluded.title,
            transaction_type = excluded.transaction_type,
            property_type = excluded.property_type,
            neighborhood = excluded.neighborhood,
            area_m2 = excluded.area_m2,
            price = excluded.price,
            published_at = excluded.published_at,
            latitude = excluded.latitude,
            longitude = excluded.longitude,
            updated_at = current_timestamp`,
          [
            fixture.id,
            fixture.slug,
            fixture.title,
            fixture.neighborhood,
            fixture.latitude,
            fixture.longitude,
          ],
        );
      }
    }
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}
