import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { DELETE_ADMIN_DEAL_WITH_DOCUMENTS_SQL } from "./admin-deal-delete-sql.ts";

test("deal deletion returns document media only when the deal and documents are deleted", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table admin_deals (id text primary key);
      create table admin_commission_settlements (id text primary key, deal_id text not null references admin_deals(id));
      create table admin_deal_documents (id text primary key, deal_id text not null references admin_deals(id), file_url text);
      insert into admin_deals(id) values ('deletable'),('settled');
      insert into admin_deal_documents(id,deal_id,file_url) values
        ('doc-1','deletable','https://media.example/deal.pdf'),
        ('doc-2','deletable','https://media.example/deal.pdf'),
        ('doc-3','deletable',''),
        ('doc-4','settled','https://media.example/settled.pdf');
      insert into admin_commission_settlements(id,deal_id) values ('settlement-1','settled');
    `);

    const deleted = await db.query<{ id: string | null; file_urls: string[] }>(
      DELETE_ADMIN_DEAL_WITH_DOCUMENTS_SQL,
      ["deletable"],
    );
    assert.equal(deleted.rows[0]?.id, "deletable");
    assert.deepEqual(deleted.rows[0]?.file_urls, ["https://media.example/deal.pdf"]);
    assert.equal((await db.query("select id from admin_deals where id='deletable'")).rows.length, 0);
    assert.equal((await db.query("select id from admin_deal_documents where deal_id='deletable'")).rows.length, 0);

    const blocked = await db.query<{ id: string | null; file_urls: string[] }>(
      DELETE_ADMIN_DEAL_WITH_DOCUMENTS_SQL,
      ["settled"],
    );
    assert.equal(blocked.rows[0]?.id, null);
    assert.deepEqual(blocked.rows[0]?.file_urls, []);
    assert.equal((await db.query("select id from admin_deals where id='settled'")).rows.length, 1);
    assert.equal((await db.query("select id from admin_deal_documents where deal_id='settled'")).rows.length, 1);
  } finally {
    await db.close();
  }
});

test("deal deletion route removes returned files after the database delete succeeds", () => {
  const route = readFileSync(new URL("../../server/routes/api/admin-deals.post.ts", import.meta.url), "utf8");
  assert.match(route, /DELETE_ADMIN_DEAL_WITH_DOCUMENTS_SQL/);
  assert.match(route, /if\(!deleted\[0\]\?\.id\)/);
  assert.match(route, /deleteStoredMedia\(fileUrl\)/);
});
