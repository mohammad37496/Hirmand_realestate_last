/**
 * Dev-only QA helper: decorate the villa browser-smoke fixture with
 * other_amenities/cooling/heating (amenities accordion) and a 3-image gallery
 * (multi-thumbnail path), then re-seed the standard fixture state afterwards
 * via --restore.
 *   node scripts/qa-seed-amenities.mjs           # decorate
 *   node scripts/qa-seed-amenities.mjs --restore # back to standard fixture
 */
import { PGlite } from "@electric-sql/pglite";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { pendingMigrations } from "./migration-plan.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dataDir = join(root, ".grok", "pglite.data");
mkdirSync(dirname(dataDir), { recursive: true });

const pg = new PGlite({ dataDir });
await pg.waitReady;
await pg.exec(
  "create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())",
);

const files = readdirSync(join(root, "migrations")).filter((f) => f.endsWith(".sql")).sort();
const doneRows = await pg.query("select name from _migrations");
const done = doneRows.rows.map((r) => r.name);
for (const { name } of pendingMigrations(files, done)) {
  await pg.exec(readFileSync(join(root, "migrations", name), "utf8"));
  await pg.query("insert into _migrations (name) values ($1)", [name]);
}

const VILLA = "browser-smoke-property-002";
if (process.argv.includes("--restore")) {
  await pg.query("update properties set other_amenities = '[]'::jsonb, cooling_system = null, heating_system = null, images = $2::jsonb where id = $1", [
    VILLA,
    JSON.stringify(["/images/type-villa.jpg"]),
  ]);
  console.log("[qa-seed] villa restored to standard fixture state");
} else {
  await pg.query(
    "update properties set other_amenities = $2::jsonb, cooling_system = $3, heating_system = $4, images = $5::jsonb where id = $1",
    [VILLA, JSON.stringify(["استخر سرپوشیده", "سونا", "جکوزی", "باربیکیو"]), "split", "packaged", JSON.stringify(["/images/type-villa.jpg", "/images/type-apartment.jpg", "/images/type-office.jpg"])],
  );
  console.log("[qa-seed] villa decorated with amenities + 3-image gallery");
}
await pg.close();
