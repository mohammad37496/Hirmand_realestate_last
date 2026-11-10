import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { normalizedIranianPhoneSql } from "./phone-normalization.ts";

test("consultant relation migration backfills only unique normalized name and phone matches", async () => {
  const migration = await readFile(
    new URL("../../migrations/0103_property_consultant_relation.sql", import.meta.url),
    "utf8",
  );
  const pg = new PGlite();
  try {
    await pg.exec(`
      create table consultants (id text primary key, name text not null, phone text not null);
      create table properties (
        id text primary key,
        contact_name text not null,
        contact_phone text not null,
        consultant_id text
      );
      create table customer_property_submissions (
        id text primary key,
        assigned_consultant_name text,
        assigned_consultant_phone text,
        assigned_consultant_id text
      );
      insert into consultants (id, name, phone) values
        ('c1', 'مشاور اول', '+989131056029'),
        ('c2', 'مشاور مشترک', '09120000000'),
        ('c3', 'مشاور مشترک', '09120000000');
      insert into properties (id, contact_name, contact_phone) values
        ('unique', 'مشاور اول', '۰۹۱۳ ۱۰۵ ۶۰۲۹'),
        ('ambiguous', 'مشاور مشترک', '09120000000'),
        ('unmatched', 'مشاور دیگر', '09130000000');
      insert into customer_property_submissions (id, assigned_consultant_name, assigned_consultant_phone) values
        ('submission-unique', 'مشاور اول', '00989131056029'),
        ('submission-ambiguous', 'مشاور مشترک', '09120000000');
    `);

    await pg.exec(migration);
    await pg.exec(migration);

    const properties = await pg.query<{ id: string; consultant_id: string | null; contact_name: string; contact_phone: string }>(
      "select id, consultant_id, contact_name, contact_phone from properties order by id",
    );
    assert.deepEqual(properties.rows, [
      { id: "ambiguous", consultant_id: null, contact_name: "مشاور مشترک", contact_phone: "09120000000" },
      { id: "unique", consultant_id: "c1", contact_name: "مشاور اول", contact_phone: "۰۹۱۳ ۱۰۵ ۶۰۲۹" },
      { id: "unmatched", consultant_id: null, contact_name: "مشاور دیگر", contact_phone: "09130000000" },
    ]);

    const submissions = await pg.query<{ id: string; assigned_consultant_id: string | null }>(
      "select id, assigned_consultant_id from customer_property_submissions order by id",
    );
    assert.deepEqual(submissions.rows, [
      { id: "submission-ambiguous", assigned_consultant_id: null },
      { id: "submission-unique", assigned_consultant_id: "c1" },
    ]);

    await pg.query("update consultants set phone='09139999999' where id='c1'");
    await pg.query("insert into properties (id, contact_name, contact_phone) values ('legacy-unique','مشاور اول','+989139999999')");
    const legacyMatch = await pg.query<{ id: string }>(
      `select id from properties p
       where p.consultant_id = $1
          or (
            p.consultant_id is null and $2 <> ''
            and lower(regexp_replace(translate(trim(p.contact_name), 'كي', 'کی'), '[[:space:]]+', ' ', 'g')) = lower(regexp_replace(translate(trim($3), 'كي', 'کی'), '[[:space:]]+', ' ', 'g'))
            and ${normalizedIranianPhoneSql("p.contact_phone")} = $2
            and (select count(*) from consultants c where lower(regexp_replace(translate(trim(c.name), 'كي', 'کی'), '[[:space:]]+', ' ', 'g')) = lower(regexp_replace(translate(trim($3), 'كي', 'کی'), '[[:space:]]+', ' ', 'g')) and ${normalizedIranianPhoneSql("c.phone")} = $2) = 1
          )
       order by id`,
      ["c1", "09139999999", "مشاور اول"],
    );
    assert.deepEqual(legacyMatch.rows.map((row) => row.id), ["legacy-unique", "unique"]);
    const ambiguousFallback = await pg.query<{ id: string }>(
      `select id from properties p
       where p.consultant_id = $1
          or (
            p.consultant_id is null and $2 <> ''
            and lower(regexp_replace(translate(trim(p.contact_name), 'كي', 'کی'), '[[:space:]]+', ' ', 'g')) = lower(regexp_replace(translate(trim($3), 'كي', 'کی'), '[[:space:]]+', ' ', 'g'))
            and ${normalizedIranianPhoneSql("p.contact_phone")} = $2
            and (select count(*) from consultants c where lower(regexp_replace(translate(trim(c.name), 'كي', 'کی'), '[[:space:]]+', ' ', 'g')) = lower(regexp_replace(translate(trim($3), 'كي', 'کی'), '[[:space:]]+', ' ', 'g')) and ${normalizedIranianPhoneSql("c.phone")} = $2) = 1
          )`,
      ["c2", "09120000000", "مشاور مشترک"],
    );
    assert.deepEqual(ambiguousFallback.rows, [], "ambiguous legacy snapshots are not attributed to multiple profiles");
    const afterPhoneChange = await pg.query<{ consultant_id: string | null }>(
      "select consultant_id from properties where id='unique'",
    );
    assert.equal(afterPhoneChange.rows[0]?.consultant_id, "c1", "relationship survives consultant phone changes");

    await pg.query("delete from consultants where id='c1'");
    const afterDelete = await pg.query<{ consultant_id: string | null; contact_name: string; contact_phone: string }>(
      "select consultant_id, contact_name, contact_phone from properties where id='unique'",
    );
    assert.deepEqual(afterDelete.rows[0], {
      consultant_id: null,
      contact_name: "مشاور اول",
      contact_phone: "۰۹۱۳ ۱۰۵ ۶۰۲۹",
    }, "deleting a consultant nulls the FK but preserves per-property contact snapshots");
    await assert.rejects(
      pg.query("insert into properties (id, contact_name, contact_phone, consultant_id) values ('invalid-fk','x','09123456789','missing')"),
      /foreign key/i,
    );
  } finally {
    await pg.close();
  }
});

test("property profile and CRM assignment paths prefer stable consultant IDs with legacy-only fallback", async () => {
  const [properties, profile, detailView, adminUi, submissionUi, submissions, dashboard, sales, divar] = await Promise.all([
    readFile(new URL("./properties.ts", import.meta.url), "utf8"),
    readFile(new URL("../routes/consultants.$id.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/hirmand/property-detail-view.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/hirmand/_admin_impl.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/hirmand/admin-customer-property-submissions.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../server/routes/api/admin-customer-property-submissions.post.ts", import.meta.url), "utf8"),
    readFile(new URL("../../server/routes/api/admin-dashboard.post.ts", import.meta.url), "utf8"),
    readFile(new URL("../../server/routes/api/admin-sales-control-center.post.ts", import.meta.url), "utf8"),
    readFile(new URL("./divar.ts", import.meta.url), "utf8"),
  ]);
  assert.match(properties, /consultant_id = \$1[\s\S]*?consultant_id is null[\s\S]*?legacy_consultant/);
  assert.match(properties, /select count\(\*\)[\s\S]*?from consultants legacy_consultant/);
  assert.match(profile, /consultantId: person\.id, consultantName: person\.name, phone: person\.phone/);
  assert.match(detailView, /consultants\.find\(\(item\) => item\.id === property\.consultantId\)/);
  assert.match(detailView, /legacyMatches\.length === 1/);
  assert.match(properties, /then excluded\.consultant_id else properties\.consultant_id end/);
  assert.match(properties, /set consultant_id = \$1/);
  assert.match(adminUi, /consultantId: form\.consultantId/);
  assert.match(adminUi, /consultantId: member\.id/);
  assert.match(submissionUi, /assignedConsultantId/);
  assert.match(submissions, /assigned_consultant_id=\$2/);
  assert.match(submissions, /consultantId: consultant\.id/);
  assert.match(dashboard, /c\.id = p\.consultant_id/);
  assert.match(sales, /c\.id = p\.consultant_id/);
  assert.match(divar, /consultant_id/);
});
