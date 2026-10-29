import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { ADMIN_PROPERTY_PHONE_SEARCH_SQL, normalizeAdminPhoneSearch } from "./admin-property-search.ts";

test("admin phone search normalizes Persian and Arabic digits and formatting", () => {
  assert.equal(normalizeAdminPhoneSearch("۰۹۱۳-۱۰۵ ۶۰۲۹"), "09131056029");
  assert.equal(normalizeAdminPhoneSearch("٠٩١٣١٠٥٦٠٢٩"), "09131056029");
  assert.equal(normalizeAdminPhoneSearch("مشاور"), null);
});

test("admin property search matches normalized phone digits in contact and owner fields", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table properties (id text primary key, contact_phone text, owner_phone text);
      insert into properties (id,contact_phone,owner_phone) values
        ('contact-phone','09131056029',''),
        ('owner-phone','','٠٩١٣١٠٥٦٠٢٩'),
        ('other-phone','09139999999','');
    `);

    for (const search of ["۰۹۱۳۱۰۵۶۰۲۹", "٠٩١٣١٠٥٦٠٢٩"]) {
      const params = Array.from({ length: 13 }, () => null as string | null);
      params[12] = normalizeAdminPhoneSearch(search);
      const typedUnusedParams = Array.from({ length: 12 }, (_, index) => `$${index + 1}::text is null`).join(" and ");
      const result = await db.query<{ id: string }>(
        `select id from properties where false ${ADMIN_PROPERTY_PHONE_SEARCH_SQL} and ${typedUnusedParams} order by id`,
        params,
      );
      assert.deepEqual(result.rows.map((row) => row.id), ["contact-phone", "owner-phone"]);
    }
  } finally {
    await db.close();
  }
});
