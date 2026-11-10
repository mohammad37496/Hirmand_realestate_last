import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("lead consultant migration backfills only unique normalized names and preserves snapshots", async () => {
  const migration = await readFile(
    new URL("../../migrations/0104_lead_consultant_relation.sql", import.meta.url),
    "utf8",
  );
  const pg = new PGlite();
  try {
    await pg.exec(`
      create table consultants (id text primary key, name text not null, phone text not null, is_active boolean not null default true);
      create table leads (
        id text primary key, name text not null default '', phone text not null default '',
        consultant text not null default '', status text not null default 'new',
        created_at timestamptz not null default current_timestamp
      );
      create table admin_consultant_targets (
        id text primary key, consultant text not null, target_month date not null,
        lead_target integer not null default 0, contract_target integer not null default 0,
        volume_target numeric not null default 0, commission_target numeric not null default 0,
        note text not null default '', created_by text not null default '',
        created_at timestamptz not null default current_timestamp,
        updated_at timestamptz not null default current_timestamp,
        unique (consultant, target_month)
      );
      insert into consultants(id,name,phone,is_active) values
        ('inactive','مشاور غیرفعال','09120000000',false),
        ('same-a','مشاور مشترک','09121111111',true),
        ('same-b','مشاور مشترک','09122222222',true),
        ('arabic','مشاور يکتا','09123333333',true);
      insert into leads(id,name,phone,consultant) values
        ('unique','مشتری','09120000000','  مشاور   غیرفعال  '),
        ('unique-update','مشتری','09120000001','مشاور غیرفعال'),
        ('ambiguous','مشتری','09121111111','مشاور مشترک'),
        ('unmatched','مشتری','09122222222','نام ناشناخته'),
        ('blank','مشتری','09123333333',''),
        ('arabic-y','مشتری','09124444444','مشاور یکتا');
      insert into admin_consultant_targets(id,consultant,target_month) values
        ('target-unique','مشاور غیرفعال','2026-11-01'),
        ('target-ambiguous','مشاور مشترک','2026-11-01');
    `);

    await pg.exec(migration);
    await pg.exec(migration);

    const leads = await pg.query<{ id: string; consultant_id: string | null; consultant_link_state: string; consultant: string }>(
      "select id, consultant_id, consultant_link_state, consultant from leads order by id",
    );
    assert.deepEqual(leads.rows, [
      { id: "ambiguous", consultant_id: null, consultant_link_state: "legacy_unresolved", consultant: "مشاور مشترک" },
      { id: "arabic-y", consultant_id: "arabic", consultant_link_state: "linked", consultant: "مشاور یکتا" },
      { id: "blank", consultant_id: null, consultant_link_state: "unassigned", consultant: "" },
      { id: "unique", consultant_id: "inactive", consultant_link_state: "linked", consultant: "  مشاور   غیرفعال  " },
      { id: "unique-update", consultant_id: "inactive", consultant_link_state: "linked", consultant: "مشاور غیرفعال" },
      { id: "unmatched", consultant_id: null, consultant_link_state: "legacy_unresolved", consultant: "نام ناشناخته" },
    ]);

    const targets = await pg.query<{ id: string; consultant_id: string | null }>(
      "select id, consultant_id from admin_consultant_targets order by id",
    );
    assert.deepEqual(targets.rows, [
      { id: "target-ambiguous", consultant_id: null },
      { id: "target-unique", consultant_id: "inactive" },
    ]);
    await pg.query(
      "insert into admin_consultant_targets(id,consultant_id,consultant,target_month) values('same-target-a','same-a','مشاور مشترک','2026-12-01'),('same-target-b','same-b','مشاور مشترک','2026-12-01')",
    );
    assert.equal((await pg.query("select id from admin_consultant_targets where target_month='2026-12-01'")).rows.length, 2,
      "two same-name consultants can own distinct targets in the same month");
    await pg.query(
      "insert into admin_consultant_targets(id,consultant_id,consultant,target_month,note) values('replacement-target','same-a','مشاور مشترک','2026-12-01','updated') on conflict(consultant_id,target_month) where consultant_id is not null do update set note=excluded.note",
    );
    assert.deepEqual((await pg.query<{ id: string; note: string }>("select id,note from admin_consultant_targets where consultant_id='same-a' and target_month='2026-12-01'")).rows[0], {
      id: "same-target-a", note: "updated",
    });

    // Legacy app writes remain snapshot-only and are explicitly unresolved.
    await pg.query("insert into leads(id,consultant) values('legacy-write','مشاور غیرفعال')");
    const legacy = await pg.query<{ consultant_id: string | null; consultant_link_state: string }>(
      "select consultant_id, consultant_link_state from leads where id='legacy-write'",
    );
    assert.deepEqual(legacy.rows[0], { consultant_id: null, consultant_link_state: "legacy_unresolved" });

    // An explicit unassigned row edited by an older snapshot-only writer must
    // become unresolved, never be silently attributed by its text.
    await pg.query("update leads set consultant='مشاور غیرفعال' where id='blank'");
    const snapshotOnly = await pg.query<{ consultant_id: string | null; consultant_link_state: string }>(
      "select consultant_id, consultant_link_state from leads where id='blank'",
    );
    assert.deepEqual(snapshotOnly.rows[0], { consultant_id: null, consultant_link_state: "legacy_unresolved" });

    // An old app updating only the snapshot of an already-linked lead must
    // drop the stale identity rather than leave an incorrect consultant link.
    await pg.query("update leads set consultant='نام تازه از نسخه قدیمی' where id='unique-update'");
    const oldAppUpdate = await pg.query<{ consultant_id: string | null; consultant_link_state: string; consultant: string }>(
      "select consultant_id, consultant_link_state, consultant from leads where id='unique-update'",
    );
    assert.deepEqual(oldAppUpdate.rows[0], {
      consultant_id: null,
      consultant_link_state: "legacy_unresolved",
      consultant: "نام تازه از نسخه قدیمی",
    });

    await pg.exec(migration);
    const noReattachAfterRerun = await pg.query<{ consultant_id: string | null; consultant_link_state: string }>(
      "select consultant_id,consultant_link_state from leads where id='blank'",
    );
    assert.deepEqual(noReattachAfterRerun.rows[0], { consultant_id: null, consultant_link_state: "legacy_unresolved" });

    await pg.query("delete from consultants where id='inactive'");
    const deleted = await pg.query<{ consultant_id: string | null; consultant_link_state: string; consultant: string }>(
      "select consultant_id, consultant_link_state, consultant from leads where id='unique'",
    );
    assert.deepEqual(deleted.rows[0], {
      consultant_id: null,
      consultant_link_state: "legacy_unresolved",
      consultant: "  مشاور   غیرفعال  ",
    });
    await pg.query("insert into consultants(id,name,phone) values('replacement','مشاور غیرفعال','09129999999')");
    const noReattach = await pg.query<{ consultant_id: string | null }>(
      "select consultant_id from leads where id='unique'",
    );
    assert.equal(noReattach.rows[0]?.consultant_id, null);

    await assert.rejects(
      pg.query("insert into leads(id,consultant,consultant_id) values('bad-fk','مشاور','missing')"),
      /foreign key/i,
    );
    await assert.rejects(
      pg.query("insert into leads(id,consultant,consultant_link_state) values('bad-state','مشاور','linked')"),
      /check constraint/i,
    );
  } finally {
    await pg.close();
  }
});
