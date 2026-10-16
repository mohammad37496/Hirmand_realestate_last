import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { buildPublicPropertyFilterParams, buildPublicPropertyWhereSql } from "./property-search-sql.ts";

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
    title: "فروش آپارتمان دو خواب",
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
    params.slice(0, 36),
  );
  return result.rows.map((row) => row.id);
}

test("controlled database fixture: no filters returns every published property", async () => {
  const db = await createFixtureDb();
  try {
    assert.deepEqual(await searchIds(db, {}), ["land-d", "rent-c", "sale-a", "sale-b"]);
  } finally {
    await db.close();
  }
});

test("controlled fixture: a single transaction filter narrows results", async () => {
  const db = await createFixtureDb();
  try {
    assert.deepEqual(await searchIds(db, { transactionType: "rent" }), ["rent-c"]);
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

test("controlled fixture: Persian spelling variants, city and street text find the same listing", async () => {
  const db = await createFixtureDb();
  try {
    assert.deepEqual(await searchIds(db, { search: "شهرک ولیعصر" }), ["sale-a", "sale-b"]);
    assert.deepEqual(await searchIds(db, { search: "اصفهان خیابان آزادی" }), ["sale-a"]);
    assert.deepEqual(await searchIds(db, { search: "خیابان آزادی" }), ["sale-a"]);
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

test("controlled fixture: result count and pagination use the same WHERE contract", async () => {
  const db = await createFixtureDb();
  try {
    const params = buildPublicPropertyFilterParams({ transactionType: "buy" });
    const where = buildPublicPropertyWhereSql();
    const count = await db.query<{ count: number }>(
      `select count(*)::int as count from properties where ${where}`,
      params.slice(0, 36),
    );
    const page = await db.query<{ id: string }>(
      `select id from properties where ${where} order by price asc nulls last limit 1 offset 1`,
      params.slice(0, 36),
    );
    assert.equal(count.rows[0]?.count, 3);
    assert.deepEqual(page.rows.map((row) => row.id), ["sale-a"]);
  } finally {
    await db.close();
  }
});
