// Regression guard for the Divar admin panel's SQL.
//
// The panel's queries are written as raw template literals, so the TypeScript
// compiler cannot see them: renaming or forgetting a `divar_files` column
// compiles cleanly and then fails at runtime with `column ... does not exist`.
// (That is exactly how `manual_override` shipped without a migration.)
//
// This applies the real migrations to an in-memory PGlite, then EXPLAINs every
// SQL statement in the Divar modules that touches `divar_files` /
// `divar_sync_runs`. Postgres resolves columns and relations while planning, so
// a statement that references a missing column fails here.
//
//   node scripts/verify-divar-sql.mjs
import { PGlite, MemoryFS } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { pendingMigrations } from "./migration-plan.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const migrationsDir = join(root, "migrations");
const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();

const pg = new PGlite({ fs: new MemoryFS() });
await pg.waitReady;
for (const { name } of pendingMigrations(files, [])) {
  await pg.exec(readFileSync(join(migrationsDir, name), "utf8"));
}
console.log(`applied ${files.length} migrations`);

const cols = await pg.query(
  `select table_name, column_name from information_schema.columns
    where table_name in ('divar_files','divar_sync_runs')
    order by table_name, column_name`,
);
for (const table of ["divar_files", "divar_sync_runs"]) {
  const list = cols.rows.filter((r) => r.table_name === table).map((r) => r.column_name);
  console.log(`${table} (${list.length}): ${list.join(", ")}`);
}

/** Backtick-aware template-literal extractor. `${...}` becomes `null`. */
function extractTemplates(src) {
  const out = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    if (ch === "/" && src[i + 1] === "*") {
      const e = src.indexOf("*/", i + 2);
      i = e < 0 ? src.length : e + 2;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const q = ch;
      i++;
      while (i < src.length && src[i] !== q) {
        if (src[i] === "\\") i++;
        i++;
      }
      i++;
      continue;
    }
    if (ch !== "`") {
      i++;
      continue;
    }
    let depth = 0;
    let buf = "";
    let j = i + 1;
    let closed = false;
    while (j < src.length) {
      const c = src[j];
      if (c === "\\") {
        j += 2;
        continue;
      }
      if (depth === 0) {
        if (c === "`") {
          closed = true;
          j++;
          break;
        }
        if (c === "$" && src[j + 1] === "{") {
          depth = 1;
          buf += "null";
          j += 2;
          continue;
        }
        buf += c;
        j++;
        continue;
      }
      if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) {
          j++;
          continue;
        }
      } else if (c === "`") {
        let k = j + 1;
        let nd = 0;
        while (k < src.length) {
          const d = src[k];
          if (d === "\\") {
            k += 2;
            continue;
          }
          if (nd === 0 && d === "`") {
            k++;
            break;
          }
          if (d === "$" && src[k + 1] === "{") {
            nd++;
            k += 2;
            continue;
          }
          if (nd > 0 && d === "}") nd--;
          k++;
        }
        j = k;
        continue;
      }
      j++;
    }
    if (closed) out.push(buf);
    i = j;
  }
  return out;
}

let failures = 0;
let checked = 0;
for (const rel of ["src/lib/divar.ts", "src/lib/divar-review.ts"]) {
  const src = readFileSync(join(root, rel), "utf8");
  for (const tpl of extractTemplates(src)) {
    if (!/divar_files|divar_sync_runs/.test(tpl)) continue;
    checked++;
    const sql = tpl.trim();
    const label = sql.replace(/\s+/g, " ").slice(0, 88);
    try {
      // EXPLAIN plans without executing: Postgres still resolves every column
      // and relation, so a stale column name fails here.
      await pg.query(`explain ${sql.replace(/\$\d+/g, "null")}`);
      console.log(`PASS — ${rel} | ${label}`);
    } catch (error) {
      failures++;
      console.log(`FAIL — ${rel} | ${label}\n        ${String(error.message).split("\n")[0]}`);
    }
  }
}
console.log(`\nchecked ${checked} divar statements, ${failures} failing`);
await pg.close();
process.exit(failures ? 1 : 0);
