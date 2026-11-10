import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { buildPublicPropertyFilterParams, buildPublicPropertyOrderBySql, buildPublicPropertyWhereSql } from "./property-search-sql.ts";
import { normalizeIranianPhoneForMatch, normalizedIranianPhoneSql } from "./phone-normalization.ts";

type Fixture = {
  id: string;
  transaction_type: string;
  property_type: string;
  title: string;
  neighborhood: string;
  address: string;
  area_m2: number;
  price: number | null;
  deposit: number | null;
  rent: number | null;
  bedrooms: number;
  parking: boolean;
  latitude: number;
  longitude: number;
  features: string[];
};

const fixtures: Fixture[] = [
  {
    id: "sale-a",
    transaction_type: "buy",
    property_type: "apartment",
    title: "فروش آپارتمان ۲ خواب",
    neighborhood: "شهرک ولی‌عصر",
    address: "خیابان آزادی",
    area_m2: 120,
    price: 2_000_000_000,
    deposit: null,
    rent: null,
    bedrooms: 2,
    parking: true,
    latitude: 32.65,
    longitude: 51.66,
    features: ["نورگیر", "بازسازی‌شده"],
  },
  {
    id: "sale-b",
    transaction_type: "buy",
    property_type: "apartment",
    title: "آپارتمان نوساز",
    neighborhood: "شهرک ولیعصر",
    address: "خیابان بهار",
    area_m2: 110,
    price: 1_300_000_000,
    deposit: null,
    rent: null,
    bedrooms: 2,
    parking: false,
    latitude: 32.651,
    longitude: 51.661,
    features: ["آسانسور"],
  },
  {
    id: "rent-c",
    transaction_type: "rent",
    property_type: "apartment",
    title: "اجاره آپارتمان",
    neighborhood: "جلفا",
    address: "خیابان حکیم نظامی",
    area_m2: 85,
    price: null,
    deposit: 700_000_000,
    rent: 20_000_000,
    bedrooms: 2,
    parking: false,
    latitude: 32.64,
    longitude: 51.65,
    features: ["آسانسور", "انباری"],
  },
  {
    id: "land-d",
    transaction_type: "buy",
    property_type: "land",
    title: "زمین درچه",
    neighborhood: "درچه",
    address: "خیابان اصلی",
    area_m2: 300,
    price: 900_000_000,
    deposit: null,
    rent: null,
    bedrooms: 0,
    parking: false,
    latitude: 32.61,
    longitude: 51.58,
    features: ["سند تک‌برگ"],
  },
  {
    id: "mortgage-e",
    transaction_type: "mortgage",
    property_type: "apartment",
    title: "رهن کامل خانه",
    neighborhood: "جلفا",
    address: "خیابان حکیم",
    area_m2: 95,
    price: null,
    deposit: 1_100_000_000,
    rent: null,
    bedrooms: 2,
    parking: true,
    latitude: 32.641,
    longitude: 51.652,
    features: ["انباری"],
  },
  {
    id: "sell-f",
    transaction_type: "sell",
    property_type: "apartment",
    title: "فروش واحد اداری",
    neighborhood: "احمدآباد",
    address: "خیابان بزرگمهر",
    area_m2: 70,
    price: 1_600_000_000,
    deposit: null,
    rent: null,
    bedrooms: 1,
    parking: false,
    latitude: 32.655,
    longitude: 51.67,
    features: ["سند اداری"],
  },
];

async function createFixtureDb() {
  const db = new PGlite();
  await db.exec(`
    create table properties (
      id text primary key,
      deleted_at timestamptz default null,
      status text not null default 'published',
      publish_at timestamptz default null,
      unpublish_at timestamptz default null,
      transaction_type text,
      property_type text,
      neighborhood text,
      featured boolean not null default false,
      featured_until timestamptz default null,
      title text,
      city text default 'اصفهان',
      address text,
      description text default '',
      features jsonb default '[]'::jsonb,
      area_m2 integer,
      price numeric,
      deposit numeric,
      rent numeric,
      bedrooms integer,
      bathrooms integer default 1,
      floor integer default 1,
      total_floors integer default 5,
      built_year integer default 1400,
      parking boolean default false,
      elevator boolean default false,
      storage boolean default false,
      cabinet_type text,
      flooring_type text,
      cooling_system text,
      heating_system text,
      wall_closet_type text,
      other_amenities jsonb default '[]'::jsonb,
      images jsonb default '[]'::jsonb,
      latitude double precision,
      longitude double precision,
      floor_label text,
      orientation text,
      convertible boolean default false,
      published_at timestamptz default now(),
      created_at timestamptz default now()
    );
  `);

  for (const item of fixtures) {
    await db.query(
      `insert into properties (
        id, transaction_type, property_type, title, neighborhood, address, city,
        area_m2, price, deposit, rent, bedrooms, parking, latitude, longitude,
        features, images
      ) values (
        $1, $2, $3, $4, $5, $6, 'اصفهان',
        $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb, '["test-image"]'::jsonb
      )`,
      [
        item.id,
        item.transaction_type,
        item.property_type,
        item.title,
        item.neighborhood,
        item.address,
        item.area_m2,
        item.price,
        item.deposit,
        item.rent,
        item.bedrooms,
        item.parking,
        item.latitude,
        item.longitude,
        JSON.stringify(item.features),
      ],
    );
  }
  return db;
}

async function searchIds(db: PGlite, filters: Record<string, unknown>, order = "id asc") {
  const params = buildPublicPropertyFilterParams(filters as Parameters<typeof buildPublicPropertyFilterParams>[0]);
  const result = await db.query<{ id: string }>(
    `select id from properties where ${buildPublicPropertyWhereSql()} order by ${order}`,
    params.slice(0, 37),
  );
  return result.rows.map((row) => row.id);
}

test("controlled database fixture: no filters returns every published property", async () => {
  const db = await createFixtureDb();
  try {
    assert.deepEqual(await searchIds(db, {}), ["land-d", "mortgage-e", "rent-c", "sale-a", "sale-b", "sell-f"]);
  } finally {
    await db.close();
  }
});

test("controlled fixture: a single transaction filter narrows results", async () => {
  const db = await createFixtureDb();
  try {
    assert.deepEqual(await searchIds(db, { transactionType: "rent" }), ["rent-c"]);
    assert.deepEqual(await searchIds(db, { transactionType: "mortgage" }), ["mortgage-e"]);
    assert.deepEqual(await searchIds(db, { transactionType: "sell" }), ["sell-f"]);
  } finally {
    await db.close();
  }
});

test("controlled fixture: several filters compose with AND and removing one broadens results", async () => {
  const db = await createFixtureDb();
  try {
    const shared = { transactionType: "buy", neighborhood: "شهرک ولیعصر", minArea: 100, minPrice: 1_000_000_000 };
    assert.deepEqual(await searchIds(db, { ...shared, parkingOnly: true }), ["sale-a"]);
    assert.deepEqual(await searchIds(db, shared), ["sale-a", "sale-b"]);
  } finally {
    await db.close();
  }
});

test("spec filters OR within each group and AND across selected groups", async () => {
  const db = await createFixtureDb();
  try {
    await db.exec(`
      update properties
         set cabinet_type='mdf', flooring_type='ceramic', heating_system='split', other_amenities='["pool"]'::jsonb
       where id='sale-a';
      update properties
         set cabinet_type='wood', flooring_type='laminate', heating_system='split', other_amenities='["garden"]'::jsonb
       where id='sale-b';
    `);

    assert.deepEqual(await searchIds(db, { specFilters: ["cabinet:mdf", "flooring:ceramic"] }), ["sale-a"]);
    assert.deepEqual(await searchIds(db, { specFilters: ["cabinet:mdf", "cabinet:wood"] }), ["sale-a", "sale-b"]);
    assert.deepEqual(await searchIds(db, { specFilters: ["pool", "garden"] }), ["sale-a", "sale-b"]);
    assert.deepEqual(await searchIds(db, { specFilters: ["cabinet:mdf", "pool"] }), ["sale-a"]);
  } finally {
    await db.close();
  }
});

test("controlled fixture: Persian spelling variants, city and street text find the same listing", async () => {
  const db = await createFixtureDb();
  try {
    assert.deepEqual(await searchIds(db, { search: "شهرک ولیعصر" }), ["sale-a", "sale-b"]);
    assert.deepEqual(await searchIds(db, { search: "اصفهان خیابان آزادی" }), ["sale-a"]);
    assert.deepEqual(await searchIds(db, { search: "خیابان آزادی" }), ["sale-a"]);
    assert.deepEqual(await searchIds(db, { search: "آپارتمان ۲ خواب" }), ["sale-a"]);
    assert.deepEqual(await searchIds(db, { search: "آزادی %" }), ["sale-a"]);
    assert.deepEqual(await searchIds(db, { search: "آپارتمان خواب" }), ["sale-a"]);
  } finally {
    await db.close();
  }
});

test("controlled fixture: deposit and monthly rent are independent inclusive filters", async () => {
  const db = await createFixtureDb();
  try {
    assert.deepEqual(await searchIds(db, {
      transactionType: "rent",
      minDeposit: 600_000_000,
      maxDeposit: 800_000_000,
      minRent: 15_000_000,
      maxRent: 25_000_000,
    }), ["rent-c"]);
    assert.deepEqual(await searchIds(db, { minRent: 21_000_000 }), []);
  } finally {
    await db.close();
  }
});

test("selected neighborhoods use OR semantics while remaining ANDed with other filters", async () => {
  const db = await createFixtureDb();
  try {
    assert.deepEqual(await searchIds(db, {
      transactionType: "buy",
      propertyType: "apartment",
      neighborhoods: ["شهرک ولی‌عصر", "جلفا"],
    }), ["sale-a", "sale-b"]);

    assert.deepEqual(await searchIds(db, {
      transactionType: "buy",
      propertyType: "apartment",
      minPrice: 1_500_000_000,
      neighborhoods: ["شهرک ولی‌عصر", "جلفا"],
    }), ["sale-a"]);

    // Legacy callers can continue sending the single-neighborhood field.
    assert.deepEqual(await searchIds(db, { neighborhood: "جلفا" }), ["mortgage-e", "rent-c"]);
  } finally {
    await db.close();
  }
});

test("multi-neighborhood count, sort and pagination share the OR filter and exclude hidden rows", async () => {
  const db = await createFixtureDb();
  try {
    await db.exec(`
      update properties set status='draft' where id='sale-b';
      update properties set transaction_type='buy', price=1000000000 where id='rent-c';
    `);
    const filters = {
      transactionType: "buy",
      propertyType: "apartment",
      neighborhoods: ["شهرک ولیعصر", "جلفا"],
      offset: 0,
    };
    const firstParams = buildPublicPropertyFilterParams({ ...filters, offset: 0 });
    const secondParams = buildPublicPropertyFilterParams({ ...filters, offset: 1 });
    const where = buildPublicPropertyWhereSql();
    const count = await db.query<{ count: number }>(
      `select count(*)::int as count from properties where ${where}`,
      firstParams.slice(0, 37),
    );
    const orderBy = buildPublicPropertyOrderBySql();
    const firstPage = await db.query<{ id: string }>(
      `select id from properties where ${where} order by ${orderBy} limit 1 offset $38`,
      [...firstParams, "price_asc"],
    );
    const secondPage = await db.query<{ id: string }>(
      `select id from properties where ${where} order by ${orderBy} limit 1 offset $38`,
      [...secondParams, "price_asc"],
    );

    assert.equal(count.rows[0]?.count, 2);
    assert.deepEqual(firstPage.rows.map((row) => row.id), ["rent-c"]);
    assert.deepEqual(secondPage.rows.map((row) => row.id), ["sale-a"]);
  } finally {
    await db.close();
  }
});

test("multi-neighborhood parameters are authoritative while legacy single-neighborhood callers remain compatible", () => {
  const params = buildPublicPropertyFilterParams({
    neighborhood: "legacy stale value",
    neighborhoods: ["مرداویج", "جلفا", "جلفا"],
    offset: 48,
  });
  assert.equal(params[2], null);
  assert.deepEqual(params[36], ["مرداویج", "جلفا"]);
  assert.equal(params[37], 48);
  assert.match(buildPublicPropertyOrderBySql(), /\$39::text/);

  const legacyParams = buildPublicPropertyFilterParams({ neighborhood: "جلفا" });
  assert.equal(legacyParams[2], "جلفا");
  assert.deepEqual(legacyParams[36], []);
});

test("controlled fixture: map bounds combine with price and transaction filters", async () => {
  const db = await createFixtureDb();
  try {
    assert.deepEqual(await searchIds(db, {
      transactionType: "buy",
      minPrice: 1_000_000_000,
      mapBounds: [51.655, 32.645, 51.665, 32.655],
    }), ["sale-a", "sale-b"]);
  } finally {
    await db.close();
  }
});

test("map bounds use the same rounded public coordinates as visible markers", async () => {
  const db = await createFixtureDb();
  try {
    await db.exec("update properties set longitude=51.66441 where id='sale-a'; update properties set longitude=51.67 where id='sale-b';");
    assert.deepEqual(await searchIds(db, {
      transactionType: "buy",
      mapBounds: [51.65, 32.64, 51.6644, 32.66],
    }), ["sale-a"]);

    await db.exec("update properties set longitude=51.66459 where id='sale-a';");
    assert.deepEqual(await searchIds(db, {
      transactionType: "buy",
      mapBounds: [51.65, 32.64, 51.6646, 32.66],
    }), []);
  } finally {
    await db.close();
  }
});

test("controlled fixture: result count and pagination use the same WHERE contract", async () => {
  const db = await createFixtureDb();
  try {
    const params = buildPublicPropertyFilterParams({ transactionType: "buy" });
    const where = buildPublicPropertyWhereSql();
    const count = await db.query<{ count: number }>(
      `select count(*)::int as count from properties where ${where}`,
      params.slice(0, 37),
    );
    const page = await db.query<{ id: string }>(
      `select id from properties where ${where} order by price asc nulls last limit 1 offset 1`,
      params.slice(0, 37),
    );
    assert.equal(count.rows[0]?.count, 3);
    assert.deepEqual(page.rows.map((row) => row.id), ["sale-b"]);
  } finally {
    await db.close();
  }
});

test("public listing order prioritizes active featured properties and deterministically paginates ties", async () => {
  const db = await createFixtureDb();
  try {
    await db.exec(`
      update properties
         set published_at='2026-11-01 12:00:00+00', created_at='2026-10-01 12:00:00+00';
      update properties set featured=true, featured_until='2099-01-01 00:00:00+00' where id='sale-a';
      update properties set featured=true, featured_until='2000-01-01 00:00:00+00' where id='sale-b';
    `);
    const params = ["newest"];
    const orderBy = buildPublicPropertyOrderBySql("$1::text");
    const firstPage = await db.query<{ id: string }>(
      `select id from properties order by ${orderBy} limit 3 offset 0`,
      params,
    );
    const secondPage = await db.query<{ id: string }>(
      `select id from properties order by ${orderBy} limit 3 offset 3`,
      params,
    );
    assert.deepEqual(firstPage.rows.map((row) => row.id), ["sale-a", "sell-f", "sale-b"]);
    assert.deepEqual(secondPage.rows.map((row) => row.id), ["rent-c", "mortgage-e", "land-d"]);
    assert.equal(new Set([...firstPage.rows, ...secondPage.rows].map((row) => row.id)).size, 6);

    const source = await readFile(new URL("./properties.ts", import.meta.url), "utf8");
    assert.equal((source.match(/"order by " \+ buildPublicPropertyOrderBySql\(\)/g) ?? []).length, 2);
    const byContactStart = source.indexOf("export const listPublishedPropertiesByContact");
    const byContactEnd = source.indexOf("export const getPublishedPropertyByFileCode", byContactStart);
    const byContact = source.slice(byContactStart, byContactEnd);
    assert.match(byContact, /order by \$\{buildPublicPropertyOrderBySql\("'newest'"\)\}/);
    assert.doesNotMatch(byContact, /order by featured desc/);
    const byConsultantStart = source.indexOf("export const listPublishedPropertiesByConsultant");
    const byConsultantEnd = source.indexOf("export const getPublishedPropertyByFileCode", byConsultantStart);
    const byConsultant = source.slice(byConsultantStart, byConsultantEnd);
    assert.match(byConsultant, /consultant_id = \$1/);
    assert.match(byConsultant, /consultant_id is null/);
    assert.match(byConsultant, /select count\(\*\)[\s\S]*?from consultants legacy_consultant/);
    const consultantProfile = await readFile(new URL("../routes/consultants.$id.tsx", import.meta.url), "utf8");
    assert.match(consultantProfile, /consultantId: person\.id, consultantName: person\.name, phone: person\.phone/);
  } finally {
    await db.close();
  }
});

test("public listing area sort honors ascending and descending directions", async () => {
  const db = await createFixtureDb();
  try {
    const orderBy = buildPublicPropertyOrderBySql("$1::text");
    const params = (sort: string) => [sort, ["sale-a", "sale-b"]];
    const ascending = await db.query<{ id: string }>(
      `select id from properties where id=any($2::text[]) order by ${orderBy}`,
      params("area_asc"),
    );
    const descending = await db.query<{ id: string }>(
      `select id from properties where id=any($2::text[]) order by ${orderBy}`,
      params("area_desc"),
    );

    assert.deepEqual(ascending.rows.map((row) => row.id), ["sale-b", "sale-a"]);
    assert.deepEqual(descending.rows.map((row) => row.id), ["sale-a", "sale-b"]);
  } finally {
    await db.close();
  }
});

test("malformed legacy other-amenities JSONB objects do not false-match spec filters", async () => {
  const db = await createFixtureDb();
  try {
    await db.exec(`
      update properties
         set other_amenities='{"pool":true}'::jsonb
       where id='sale-a';
      update properties
         set other_amenities='42'::jsonb
       where id='sale-b';
      update properties
         set other_amenities='["pool"]'::jsonb
       where id='rent-c';
      update properties
         set other_amenities=null
       where id='land-d';
      update properties
         set other_amenities='null'::jsonb
       where id='sell-f';
    `);

    assert.deepEqual(await searchIds(db, { specFilters: ["pool"] }), ["rent-c"]);
  } finally {
    await db.close();
  }
});

test("malformed legacy features JSONB values do not crash feature search", async () => {
  const db = await createFixtureDb();
  try {
    await db.exec(`
      update properties set features='{"unexpected":true}'::jsonb where id='sale-a';
      update properties set features='"legacy scalar"'::jsonb where id='sale-b';
      update properties set features='["بالکن"]'::jsonb where id='rent-c';
      update properties set features=null where id='land-d';
      update properties set features='null'::jsonb where id='sell-f';
    `);

    assert.deepEqual(await searchIds(db, { featureSearch: "بالکن" }), ["rent-c"]);
  } finally {
    await db.close();
  }
});


test("public property SQL excludes unsupported legacy floor values", () => {
  assert.match(buildPublicPropertyWhereSql(), /floor is null or floor = -60 or floor between 0 and 20/);
});

test("consultant property lookup matches legacy phone formats without changing stored values", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table contact_phone_samples (contact_phone text not null);
      insert into contact_phone_samples (contact_phone) values
        ('09131056029'),
        ('+98 913 105 6029'),
        ('+98 0913 105 6029'),
        ('۰۰۹۸ ۹۱۳ ۱۰۵ ۶۰۲۹'),
        ('۰۰۹۸ ۰۹۱۳ ۱۰۵ ۶۰۲۹'),
        ('٠٩١٣١٠٥٦٠٢٩'),
        ('09139999999');
    `);
    const normalizedSql = normalizedIranianPhoneSql("contact_phone");
    const result = await db.query<{ contact_phone: string }>(
      `select contact_phone from contact_phone_samples where ${normalizedSql} = $1 order by contact_phone`,
      [normalizeIranianPhoneForMatch("+98 913 105 6029")],
    );
    assert.deepEqual(result.rows.map((row) => row.contact_phone).sort(), [
      "+98 913 105 6029",
      "+98 0913 105 6029",
      "09131056029",
      "٠٩١٣١٠٥٦٠٢٩",
      "۰۰۹۸ ۹۱۳ ۱۰۵ ۶۰۲۹",
      "۰۰۹۸ ۰۹۱۳ ۱۰۵ ۶۰۲۹",
    ].sort());
  } finally {
    await db.close();
  }
});
