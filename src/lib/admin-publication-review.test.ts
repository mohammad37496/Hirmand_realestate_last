import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { reviewPropertyPublicationWithSql, type PublicationDecision } from "./admin-publication-review.ts";

const property = {
  title: "Ready apartment", transaction_type: "sell", neighborhood: "Test neighborhood",
  description: "A complete property description with enough detail to satisfy publication readiness checks and help a prospective buyer understand the listing.",
  contact_name: "QA consultant", contact_phone: "09131056029", price: 3800000000,
  deposit: null, rent: null, images: ["https://media.test/property.jpg"], area_m2: 120,
  features: ["parking", "elevator"], latitude: 32.65, longitude: 51.67,
};

async function createDb(deletedAt: string | null = null) {
  const db = new PGlite();
  await db.exec(`
    create table properties (
      id text primary key, title text not null, status text not null, deleted_at timestamptz,
      published_at timestamptz, updated_at timestamptz, transaction_type text, neighborhood text,
      description text, contact_name text, contact_phone text, price numeric, deposit numeric,
      rent numeric, images jsonb, area_m2 numeric, features jsonb, latitude numeric, longitude numeric
    );
    create table property_publication_reviews (
      id bigint primary key, property_id text not null, status text not null,
      reviewed_by text, review_note text, reviewed_at timestamptz
    );
  `);
  await db.query(
    `insert into properties
      (id,title,status,deleted_at,transaction_type,neighborhood,description,contact_name,contact_phone,price,deposit,rent,images,area_m2,features,latitude,longitude)
     values ('property-1',$1,'draft',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13::jsonb,$14,$15)`,
    [property.title, deletedAt, property.transaction_type, property.neighborhood, property.description,
      property.contact_name, property.contact_phone, property.price, property.deposit, property.rent,
      JSON.stringify(property.images), property.area_m2, JSON.stringify(property.features), property.latitude, property.longitude],
  );
  await db.query("insert into property_publication_reviews(id,property_id,status) values (1,'property-1','pending')");
  return db;
}

function transactionSql(tx: { query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }> }) {
  return { query: async <T>(text: string, params: unknown[] = []) => (await tx.query(text, params)).rows as T[] };
}

function decide(db: PGlite, decision: PublicationDecision) {
  return db.transaction((tx) => reviewPropertyPublicationWithSql(transactionSql(tx), {
    reviewId: 1, decision, note: "QA review", actor: "qa-admin",
  }));
}

test("approval of a trashed property fails and leaves its review pending", async () => {
  const db = await createDb("2026-11-01T00:00:00Z");
  try {
    await assert.rejects(decide(db, "approve"), /trashed property/);
    const rows = await db.query<{ property_status: string; deleted_at: string | null; review_status: string }>(
      `select p.status as property_status,p.deleted_at,r.status as review_status from properties p join property_publication_reviews r on r.property_id=p.id`,
    );
    assert.equal(rows.rows[0]?.property_status, "draft");
    assert.ok(rows.rows[0]?.deleted_at);
    assert.equal(rows.rows[0]?.review_status, "pending");
  } finally { await db.close(); }
});

test("approval publishes the property and approves the pending review together", async () => {
  const db = await createDb();
  try {
    await decide(db, "approve");
    const rows = await db.query<{ property_status: string; review_status: string; reviewed_by: string }>(
      `select p.status as property_status,r.status as review_status,r.reviewed_by from properties p join property_publication_reviews r on r.property_id=p.id`,
    );
    assert.deepEqual(rows.rows[0], { property_status: "published", review_status: "approved", reviewed_by: "qa-admin" });
  } finally { await db.close(); }
});

test("concurrent approval and rejection allow exactly one pending-review decision", async () => {
  const db = await createDb();
  try {
    const results = await Promise.allSettled([decide(db, "approve"), decide(db, "reject")]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(results.filter((result) => result.status === "rejected").length, 1);
    const rows = await db.query<{ property_status: string; review_status: string }>(
      `select p.status as property_status,r.status as review_status from properties p join property_publication_reviews r on r.property_id=p.id`,
    );
    assert.ok(rows.rows[0]?.review_status === "approved" || rows.rows[0]?.review_status === "rejected");
    assert.equal(rows.rows[0]?.property_status, rows.rows[0]?.review_status === "approved" ? "published" : "draft");
  } finally { await db.close(); }
});
