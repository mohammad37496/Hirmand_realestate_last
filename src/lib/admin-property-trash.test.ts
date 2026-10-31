import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { deleteTrashedProperty, type TrashedPropertyRow } from "./admin-property-trash.ts";

test("permanent deletion returns only the row still in trash, preserving media after a concurrent restore", async () => {
  const db = new PGlite();
  try {
    await db.exec("create table properties (id text primary key, title text, images jsonb, floor_plan_url text, virtual_tour_url text, deleted_at timestamptz, status text); insert into properties values ('restored', 'Restored property', '[\"https://media.test/restored.jpg\"]', 'https://media.test/plan.jpg', null, '2026-10-01T00:00:00Z', 'archived'), ('trashed', 'Trashed property', '[\"https://media.test/trashed.jpg\"]', null, 'https://media.test/tour.mp4', '2026-10-01T00:00:00Z', 'archived');");
    const query = async (statement: string, params: unknown[]) => (await db.query<TrashedPropertyRow>(statement, params)).rows;
    await db.query("update properties set deleted_at=null, status='draft' where id='restored'");
    assert.equal(await deleteTrashedProperty(query, "restored"), null);
    const restored = await db.query<{ images: string[]; deleted_at: string | null }>("select images, deleted_at from properties where id='restored'");
    assert.equal(restored.rows.length, 1);
    assert.equal(restored.rows[0]?.deleted_at, null);
    assert.deepEqual(restored.rows[0]?.images, ["https://media.test/restored.jpg"]);
    const deleted = await deleteTrashedProperty(query, "trashed");
    assert.equal(deleted?.id, "trashed");
    assert.deepEqual(deleted?.images, ["https://media.test/trashed.jpg"]);
    assert.equal(deleted?.virtual_tour_url, "https://media.test/tour.mp4");
    assert.equal(await deleteTrashedProperty(query, "trashed"), null);
  } finally { await db.close(); }
});

test("trash APIs and UI distinguish unavailable data and unsuccessful restore/delete results", () => {
  const properties = readFileSync(new URL("./properties.ts", import.meta.url), "utf8");
  const ui = readFileSync(new URL("../components/hirmand/admin-trash-manager.tsx", import.meta.url), "utf8");
  const permanentStart = properties.indexOf("export const permanentlyDeleteProperty");
  const permanentEnd = properties.indexOf("export const listAdminPropertySchedules", permanentStart);
  const permanent = properties.slice(permanentStart, permanentEnd);
  const trashStart = properties.indexOf("export const listAdminTrashProperties");
  const restoreStart = properties.indexOf("export const restoreDeletedProperty", trashStart);
  const trashList = properties.slice(trashStart, restoreStart);
  assert.match(trashList, /dbSource === "unconfigured"\) throw new Error/);
  assert.match(permanent, /deleteTrashedProperty/);
  assert.match(permanent, /if \(!existing\) return \{ success: false, deleted: 0 \}/);
  assert.ok(permanent.indexOf("if (!existing)") < permanent.indexOf("deleteStoredMedia"));
  assert.match(permanent, /existing\.virtual_tour_url/);
  assert.doesNotMatch(permanent, /select images, floor_plan_url, title from properties/);
  assert.match(ui, /result\.success !== true \|\| result\.restored !== 1/);
  assert.match(ui, /result\.success !== true \|\| result\.deleted !== 1/);
  assert.match(ui, /setLoadError\(message\)/);
  assert.match(ui, /<AdminErrorBanner/);
});
