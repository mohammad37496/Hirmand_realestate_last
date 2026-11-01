import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const route = await readFile(new URL("../server/routes/api/admin-lead-dedupe.post.ts", import.meta.url), "utf8");
const mergeSql = await readFile(new URL("../src/lib/admin-lead-dedupe-sql.ts", import.meta.url), "utf8");

test("lead dedupe preview exposes callback and offer fields that merge preserves", () => {
  const previewStart = route.indexOf('if (action === "preview")');
  const previewEnd = route.indexOf('if (action !== "merge")', previewStart);
  const preview = route.slice(previewStart, previewEnd);
  for (const field of ["callback_preferred_at", "offer_amount", "offer_conditions"]) assert.ok(preview.includes(field), "preview must expose " + field);
  assert.match(mergeSql, /callback_preferred_at = coalesce\(l\.callback_preferred_at, d\.callback_preferred_at\)/);
  assert.match(mergeSql, /offer_amount = coalesce\(l\.offer_amount, d\.offer_amount\)/);
  assert.ok(mergeSql.includes("offer_conditions = case when trim(coalesce(l.offer_conditions,'')) = '' then d.offer_conditions else l.offer_conditions end"));
});

test("merging a duplicate lead preserves missing callback and offer data without overwriting canonical values", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table leads (id text primary key, callback_preferred_at timestamptz, offer_amount numeric, offer_conditions text not null default '');
      insert into leads values
        ('canonical', null, null, ''),
        ('duplicate', '2026-11-02T10:00:00Z', 250000000, 'cash and transfer'),
        ('canonical-keeps', '2026-11-03T10:00:00Z', 300000000, 'existing terms'),
        ('duplicate-2', '2026-11-04T10:00:00Z', 400000000, 'new terms');
    `);
    const merge = async (canonicalId, duplicateId) => db.query(`
      update leads l set
        callback_preferred_at = coalesce(l.callback_preferred_at, d.callback_preferred_at),
        offer_amount = coalesce(l.offer_amount, d.offer_amount),
        offer_conditions = case when trim(coalesce(l.offer_conditions,'')) = '' then d.offer_conditions else l.offer_conditions end
      from leads d where l.id=$1 and d.id=$2
    `, [canonicalId, duplicateId]);
    await merge("canonical", "duplicate");
    const filled = await db.query("select callback_preferred_at, offer_amount, offer_conditions from leads where id='canonical'");
    assert.equal(new Date(filled.rows[0].callback_preferred_at).toISOString(), "2026-11-02T10:00:00.000Z");
    assert.equal(Number(filled.rows[0].offer_amount), 250000000);
    assert.equal(filled.rows[0].offer_conditions, "cash and transfer");
    await merge("canonical-keeps", "duplicate-2");
    const kept = await db.query("select callback_preferred_at, offer_amount, offer_conditions from leads where id='canonical-keeps'");
    assert.equal(new Date(kept.rows[0].callback_preferred_at).toISOString(), "2026-11-03T10:00:00.000Z");
    assert.equal(Number(kept.rows[0].offer_amount), 300000000);
    assert.equal(kept.rows[0].offer_conditions, "existing terms");
  } finally { await db.close(); }
});
