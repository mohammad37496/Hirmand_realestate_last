import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { bulkTrashActiveProperties } from "./admin-property-bulk-trash.ts";

test("bulk trash writes history only for active properties actually changed", async () => {
  const db = new PGlite();
  try {
    const q = String.fromCharCode(39);
    const setup = "create table properties (id text primary key, title text, status text, featured boolean, price numeric, deposit numeric, rent numeric, contact_name text, contact_phone text, deleted_at timestamptz, deleted_from_status text, featured_until timestamptz, updated_at timestamptz); create table property_change_history (id serial primary key, property_id text, action text, before_state jsonb, after_state jsonb); insert into properties (id,title,status,featured,price,contact_name,deleted_at) values (" + q + "active" + q + "," + q + "Active" + q + "," + q + "published" + q + ",true,250000," + q + "Consultant" + q + ",null),(" + q + "trashed" + q + "," + q + "Already trashed" + q + "," + q + "archived" + q + ",false,180000," + q + "Consultant" + q + "," + q + "2026-10-01T00:00:00Z" + q + ");";
    await db.exec(setup);
    const query = async (statement: string, params: unknown[]) => (await db.query<{ id: string }>(statement, params)).rows;
    const changed = await bulkTrashActiveProperties(query, ["active", "trashed"]);
    assert.deepEqual(changed.map((row) => row.id), ["active"]);
    const history = await db.query<{ property_id: string; before_state: { status: string; price: string } }>("select property_id, before_state from property_change_history order by id");
    assert.equal(history.rows.length, 1);
    assert.equal(history.rows[0]?.property_id, "active");
    assert.equal(history.rows[0]?.before_state.status, "published");
    assert.equal(history.rows[0]?.before_state.price, "250000");
    assert.deepEqual(await bulkTrashActiveProperties(query, ["trashed"]), []);
  } finally { await db.close(); }
});

test("bulk trash rolls back property updates if its history insert fails", async () => {
  const db = new PGlite();
  try {
    const q = String.fromCharCode(39);
    const setup = "create table properties (id text primary key, title text, status text, featured boolean, price numeric, deposit numeric, rent numeric, contact_name text, contact_phone text, deleted_at timestamptz, deleted_from_status text, featured_until timestamptz, updated_at timestamptz); create table property_change_history (id serial primary key, property_id text, action text check (action <> " + q + "deleted" + q + "), before_state jsonb, after_state jsonb); insert into properties (id,title,status,featured,deleted_at) values (" + q + "rollback" + q + "," + q + "Rollback" + q + "," + q + "published" + q + ",false,null);";
    await db.exec(setup);
    const query = async (statement: string, params: unknown[]) => (await db.query<{ id: string }>(statement, params)).rows;
    await assert.rejects(bulkTrashActiveProperties(query, ["rollback"]));
    const row = await db.query<{ deleted_at: string | null }>("select deleted_at from properties where id=" + q + "rollback" + q);
    assert.equal(row.rows[0]?.deleted_at, null);
  } finally { await db.close(); }
});

test("bulk-delete API and UI require a real changed-row result", () => {
  const route = readFileSync(new URL("./properties.ts", import.meta.url), "utf8");
  const ui = readFileSync(new URL("../components/hirmand/_admin_impl.tsx", import.meta.url), "utf8");
  const start = route.indexOf("export const bulkDeleteProperties");
  const end = route.indexOf("export const listAdminTrashProperties", start);
  const block = route.slice(start, end);
  assert.match(block, /bulkTrashActiveProperties/);
  assert.match(block, /if \(!rows\.length\) return \{ success: false, deleted: 0 \}/);
  assert.doesNotMatch(block, /existingRows|deletedPayload/);
  assert.match(ui, /result\.success !== true \|\| !Number\.isInteger\(result\.deleted\)/);
  assert.doesNotMatch(ui, /result\.deleted \|\| ids\.length/);
});