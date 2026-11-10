import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  PROPERTY_VERIFICATION_FACT_COLUMNS,
  divarPropertyFactsChangedSql,
  propertyContactChangedSql,
  propertyVerificationChangedSql,
} from "./property-verification-sql.ts";

const types: Record<string, string> = {
  area_m2: "integer",
  bedrooms: "smallint",
  bathrooms: "smallint",
  floor: "smallint",
  total_floors: "smallint",
  built_year: "smallint",
  parking: "boolean",
  elevator: "boolean",
  storage: "boolean",
  painted: "boolean",
  wallpaper: "boolean",
  convertible: "boolean",
  other_amenities: "jsonb",
  price: "numeric",
  deposit: "numeric",
  rent: "numeric",
  latitude: "double precision",
  longitude: "double precision",
  features: "jsonb",
  images: "jsonb",
};

const schema = `
  set time zone 'UTC';
  create table properties (
    id text primary key,
    consultant_id text,
    status text,
    featured boolean,
    published_at timestamptz,
    updated_at timestamptz,
    deleted_at timestamptz,
    last_verified_at timestamptz,
    last_verified_by text,
    ${PROPERTY_VERIFICATION_FACT_COLUMNS.map((column) => `${column} ${types[column] ?? "text"}`).join(",\n    ")}
  );
  create table incoming (like properties including defaults);
`;

async function createDatabase() {
  const pg = new PGlite();
  await pg.exec(schema);
  await pg.query(
    `insert into properties (id, status, featured, title, contact_name, contact_phone)
     values ('p1', 'published', false, 'عنوان اولیه', 'مشاور', '09123456789')`,
  );
  return pg;
}

async function stamp(pg: PGlite) {
  await pg.query(
    "update properties set last_verified_at='2026-11-10 10:00:00+00', last_verified_by='manager' where id='p1'",
  );
}

async function readStamp(pg: PGlite) {
  const result = await pg.query<{ last_verified_at: string | null; last_verified_by: string | null }>(
    "select last_verified_at::text as last_verified_at, last_verified_by from properties where id='p1'",
  );
  return result.rows[0];
}

test("saveProperty public-fact comparison is null-safe, preserves no-ops and excludes lifecycle-only fields", async () => {
  const pg = await createDatabase();
  try {
    const changed = propertyVerificationChangedSql("p", "i");
    await stamp(pg);
    await pg.query("truncate incoming");
    await pg.query("insert into incoming select * from properties where id='p1'");
    await pg.query(
      `update properties p
       set last_verified_at=case when ${changed} then null else p.last_verified_at end,
           last_verified_by=case when ${changed} then null else p.last_verified_by end
       from incoming i where p.id=i.id`,
    );
    assert.deepEqual(await readStamp(pg), {
      last_verified_at: "2026-11-10 10:00:00+00",
      last_verified_by: "manager",
    });

    const valueForColumn = (column: string) => {
      switch (types[column]) {
        case "jsonb": return "'[\"changed\"]'::jsonb";
        case "boolean": return "true";
        case "numeric": return "5000000000::numeric";
        case "integer": return "100::integer";
        case "smallint": return "3::smallint";
        case "double precision": return "32.6::double precision";
        default: return `'changed-${column}'`;
      }
    };
    const changedValues = PROPERTY_VERIFICATION_FACT_COLUMNS.map((column) => [
      column,
      valueForColumn(column),
    ] as [string, string]);

    for (const [column, value] of changedValues) {
      await stamp(pg);
      await pg.query("truncate incoming");
      await pg.query("insert into incoming select * from properties where id='p1'");
      await pg.query(`update incoming set ${column}=${value} where id='p1'`);
      await pg.query(
        `update properties p
         set last_verified_at=case when ${changed} then null else p.last_verified_at end,
             last_verified_by=case when ${changed} then null else p.last_verified_by end
         from incoming i where p.id=i.id`,
      );
      assert.deepEqual(await readStamp(pg), { last_verified_at: null, last_verified_by: null }, `${column} change`);
    }

    await stamp(pg);
    await pg.query("truncate incoming");
    await pg.query("insert into incoming select * from properties where id='p1'");
    await pg.query("update incoming set title=null where id='p1'");
    await pg.query(
      `update properties p
       set last_verified_at=case when ${changed} then null else p.last_verified_at end,
           last_verified_by=case when ${changed} then null else p.last_verified_by end
       from incoming i where p.id=i.id`,
    );
    assert.deepEqual(await readStamp(pg), { last_verified_at: null, last_verified_by: null }, "value-to-null change");

    await stamp(pg);
    await pg.query("update properties set status='archived', featured=true where id='p1'");
    await pg.query("truncate incoming");
    await pg.query("insert into incoming select * from properties where id='p1'");
    const lifecycle = await pg.query<{ changed: boolean }>(
      `select ${changed} as changed from properties p join incoming i using (id)`,
    );
    assert.equal(lifecycle.rows[0]?.changed, false);
    assert.deepEqual(await readStamp(pg), {
      last_verified_at: "2026-11-10 10:00:00+00",
      last_verified_by: "manager",
    });
  } finally {
    await pg.close();
  }
});

test("bulk consultant assignment invalidates only changed contact values and skips no-op updates", async () => {
  const pg = await createDatabase();
  try {
    const changed = propertyContactChangedSql("p", "$2::text", "$3::text");
    await stamp(pg);
    const noop = await pg.query(
      `update properties as p
       set consultant_id=$1, contact_name=$2, contact_phone=$3,
           last_verified_at=case when ${changed} then null else p.last_verified_at end,
           last_verified_by=case when ${changed} then null else p.last_verified_by end,
           updated_at=current_timestamp
       where p.id=$4 and p.deleted_at is null
         and (p.consultant_id is distinct from $1 or ${changed})
       returning id`,
      [null, "مشاور", "09123456789", "p1"],
    );
    assert.equal(noop.rows.length, 0);
    assert.deepEqual(await readStamp(pg), {
      last_verified_at: "2026-11-10 10:00:00+00",
      last_verified_by: "manager",
    });

    const changedName = await pg.query(
      `update properties as p
       set consultant_id=$1, contact_name=$2, contact_phone=$3,
           last_verified_at=case when ${changed} then null else p.last_verified_at end,
           last_verified_by=case when ${changed} then null else p.last_verified_by end
       where p.id=$4 and p.deleted_at is null
         and (p.consultant_id is distinct from $1 or ${changed})
       returning id`,
      ["c1", "مشاور جدید", "09123456789", "p1"],
    );
    assert.equal(changedName.rows.length, 1);
    assert.deepEqual(await readStamp(pg), { last_verified_at: null, last_verified_by: null });

    await stamp(pg);
    await pg.query(
      `update properties as p
       set consultant_id=$1, contact_name=$2, contact_phone=$3,
           last_verified_at=case when ${changed} then null else p.last_verified_at end,
           last_verified_by=case when ${changed} then null else p.last_verified_by end
       where p.id=$4 and p.deleted_at is null
         and (p.consultant_id is distinct from $1 or ${changed})`,
      ["c1", "مشاور جدید", "09111111111", "p1"],
    );
    assert.deepEqual(await readStamp(pg), { last_verified_at: null, last_verified_by: null }, "phone-only change");
  } finally {
    await pg.close();
  }
});

test("Divar refresh invalidates changed imported facts but still publishes unchanged facts", async () => {
  const pg = await createDatabase();
  try {
    const changed = divarPropertyFactsChangedSql("p");
    await stamp(pg);
    await pg.query(
      `update properties as p
       set status='published', published_at=coalesce(p.published_at, current_timestamp),
           images=$2::jsonb, latitude=$3::double precision, longitude=$4::double precision,
           floor=$5::smallint, floor_label=$6::text, orientation=$7::text,
           last_verified_at=case when ${changed} then null else p.last_verified_at end,
           last_verified_by=case when ${changed} then null else p.last_verified_by end
       where p.id=$1`,
      ["p1", null, null, null, null, null, null],
    );
    const published = await pg.query<{ status: string; published_at: string | null }>(
      "select status, published_at::text as published_at from properties where id='p1'",
    );
    assert.equal(published.rows[0]?.status, "published");
    assert.ok(published.rows[0]?.published_at);
    assert.deepEqual(await readStamp(pg), {
      last_verified_at: "2026-11-10 10:00:00+00",
      last_verified_by: "manager",
    });

    await stamp(pg);
    await pg.query(
      `update properties as p
       set status='published', published_at=coalesce(p.published_at, current_timestamp),
           images=$2::jsonb, latitude=$3::double precision, longitude=$4::double precision,
           floor=$5::smallint, floor_label=$6::text, orientation=$7::text,
           last_verified_at=case when ${changed} then null else p.last_verified_at end,
           last_verified_by=case when ${changed} then null else p.last_verified_by end
       where p.id=$1`,
      ["p1", '["/media/new.jpg"]', 32.6, 51.6, 3, "suite", "north"],
    );
    assert.deepEqual(await readStamp(pg), { last_verified_at: null, last_verified_by: null });
  } finally {
    await pg.close();
  }
});

test("all property mutation paths wire the shared verification predicates into their SQL", async () => {
  const [properties, divar] = await Promise.all([
    readFile(new URL("./properties.ts", import.meta.url), "utf8"),
    readFile(new URL("./divar.ts", import.meta.url), "utf8"),
  ]);
  assert.match(properties, /propertyVerificationChangedSql\("properties", "excluded"\)/);
  assert.match(properties, /last_verified_at = case when \$\{verificationChanged\} then null else properties\.last_verified_at end/);
  assert.match(properties, /last_verified_by = case when \$\{verificationChanged\} then null else properties\.last_verified_by end/);
  assert.match(properties, /const contactChanged = propertyContactChangedSql\("properties", "\$2::text", "\$3::text"\)/);
  assert.match(properties, /last_verified_at = case when \$\{contactChanged\} then null else properties\.last_verified_at end/);
  assert.match(properties, /and \(consultant_id is distinct from \$1 or contact_name is distinct from \$2 or contact_phone is distinct from \$3\)\s+returning id, consultant_id, contact_name, contact_phone/);
  assert.match(divar, /divarPropertyFactsChangedSql\("properties"\)/);
  assert.match(divar, /last_verified_at = case when \$\{divarPropertyFactsChangedSql\("properties"\)\} then null/);
  assert.match(divar, /last_verified_by = case when \$\{divarPropertyFactsChangedSql\("properties"\)\} then null/);
});
