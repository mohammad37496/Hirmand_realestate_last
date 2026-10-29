import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  EXACT_PROPERTY_DUPLICATE_SQL,
  propertyDuplicateKeyChanged,
  publicationCriticalFieldsChanged,
  resolvePropertySaveStatus,
} from "./property-save-guards.ts";

const existing = {
  id: "existing",
  status: "published",
  title: "آپارتمان ۱۲۰ متری",
  transaction_type: "sell",
  property_type: "apartment",
  neighborhood: "چهارباغ",
  area_m2: 120,
  price: "3800000000",
  deposit: null,
  rent: null,
  description: "توضیحات کامل و قابل قبول برای فایل منتشرشده",
  contact_name: "مشاور هیرمند",
  contact_phone: "09130000000",
};

const next = {
  status: "published",
  title: "آپارتمان ۱۲۰ متری",
  transactionType: "sell",
  propertyType: "apartment",
  neighborhood: "چهارباغ",
  areaM2: 120,
  price: "3800000000",
  deposit: null,
  rent: null,
  description: "توضیحات کامل و قابل قبول برای فایل منتشرشده",
  contactName: "مشاور هیرمند",
  contactPhone: "09130000000",
};

test("save guards detect duplicate-key and publication-critical edits", () => {
  assert.equal(resolvePropertySaveStatus(undefined, null), "draft");
  assert.equal(resolvePropertySaveStatus(undefined, "published"), "published");
  assert.equal(resolvePropertySaveStatus(undefined, "archived"), "archived");
  assert.equal(resolvePropertySaveStatus("draft", "published"), "draft");
  assert.equal(propertyDuplicateKeyChanged(existing, next), false);
  assert.equal(propertyDuplicateKeyChanged(existing, { ...next, status: "draft" }), true);
  assert.equal(propertyDuplicateKeyChanged(existing, { ...next, areaM2: 121 }), true);
  assert.equal(publicationCriticalFieldsChanged(existing, next), false);
  assert.equal(publicationCriticalFieldsChanged(existing, { ...next, price: "0" }), true);
  assert.equal(publicationCriticalFieldsChanged(existing, { ...next, description: "short" }), true);
  assert.equal(publicationCriticalFieldsChanged({ ...existing, status: "draft" }, next), true);
});

test("duplicate query matches only active draft/published exact listing keys", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table properties (
        id text primary key,
        title text not null,
        transaction_type text not null,
        property_type text not null,
        neighborhood text not null,
        area_m2 integer,
        price numeric,
        deposit numeric,
        rent numeric,
        status text not null,
        deleted_at timestamptz,
        updated_at timestamptz not null default current_timestamp
      );
      insert into properties (id,title,transaction_type,property_type,neighborhood,area_m2,price,deposit,rent,status) values
        ('active','آپارتمان ۱۲۰ متری','sell','apartment','چهارباغ',120,3800000000,null,null,'published'),
        ('archived','آپارتمان ۱۲۰ متری','sell','apartment','چهارباغ',120,3800000000,null,null,'archived'),
        ('trashed','آپارتمان ۱۲۰ متری','sell','apartment','چهارباغ',120,3800000000,null,null,'published');
      update properties set deleted_at=current_timestamp where id='trashed';
    `);

    const params = ["new", "آپارتمان ۱۲۰ متری", "sell", "apartment", "چهارباغ", 120, "3800000000", null, null];
    const duplicate = await db.query<{ id: string }>(EXACT_PROPERTY_DUPLICATE_SQL, params);
    assert.deepEqual(duplicate.rows.map((row) => row.id), ["active"]);

    const differentPrice = await db.query<{ id: string }>(EXACT_PROPERTY_DUPLICATE_SQL, [
      "new", "آپارتمان ۱۲۰ متری", "sell", "apartment", "چهارباغ", 120, "3900000000", null, null,
    ]);
    assert.deepEqual(differentPrice.rows, []);
  } finally {
    await db.close();
  }
});
