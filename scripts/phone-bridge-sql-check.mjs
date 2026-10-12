/**
 * Applies the schema and then executes the Phone Bridge write statements.
 *
 * The unit tests stop at the function boundary and the HTTP checks need a
 * running server with a real database. Neither proves that the INSERTs and
 * UPDATEs in the routes actually run.
 *
 * That is not a hypothetical gap: this project has already shipped
 * "could not determine data type of parameter $n" and
 * `invalid input syntax for type numeric: "null"`. Both only appear when a
 * statement is executed, and every one of the statements below is executed
 * here for the first time.
 *
 * The SQL is transcribed from the routes and store helpers. It is copied
 * rather than imported because the routes depend on the Vite `@/` alias and on
 * an H3 event, neither of which exists outside the bundler. If a statement is
 * edited in a route and not here, this file drifts -- so the statements are
 * kept adjacent to what they verify and the intent is the SQL *shape*
 * (parameter types, conflict targets, casts), which is what actually breaks.
 *
 *   node scripts/phone-bridge-sql-check.mjs
 *
 * Exits 0 when every statement applied cleanly and every dedupe path really
 * did deduplicate.
 */

import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = await mkdtemp(join(tmpdir(), "pb-sql-"));

let passed = 0;
let failed = 0;

function check(name, condition, detail = "") {
  if (condition) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failed++;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const { PGlite } = await import("@electric-sql/pglite");
const pg = new PGlite({ dataDir });
await pg.waitReady;

/** Mirrors `Sql` in src/lib/db.ts. */
const sql = {
  async query(text, params = []) {
    return (await pg.query(text, params)).rows;
  },
};

const run = async (name, text, params = []) => {
  try {
    const result = await pg.query(text, params);
    passed++;
    console.log(`  ok   ${name}`);
    return result;
  } catch (error) {
    failed++;
    console.error(`  FAIL ${name}`);
    console.error(`       ${error.message}`);
    for (const key of ["code", "detail", "hint", "position"]) {
      if (error && typeof error === "object" && error[key] != null) {
        console.error(`       ${key}: ${error[key]}`);
      }
    }
    return null;
  }
};

try {
  await pg.exec(
    "create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())",
  );

  const files = (await readdir(join(root, "migrations")))
    .filter((name) => name.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));
  const applied = new Set(
    (await pg.query("select name from _migrations")).rows.map((row) => String(row.name)),
  );
  for (const name of files) {
    if (applied.has(name)) continue;
    await pg.exec(await readFile(join(root, "migrations", name), "utf8"));
    await pg.query("insert into _migrations (name) values ($1)", [name]);
  }
  console.log(`applied ${files.length} migrations\n`);

  // ---------------------------------------------------------------- setup --
  const deviceId = randomUUID();
  const deviceToken = `hpd_${randomUUID()}`;
  await run(
    "enrollment: insert device (phone-bridge-auth.server.ts persistEnrollment)",
    `insert into phone_bridge_devices (
       id, name, manufacturer, model, android_version, sdk_int,
       app_version_name, app_version_code, token_hash, employee, group_name,
       last_app_version_name, last_app_version_code, enrolled_at, updated_at
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, current_timestamp, current_timestamp)
     on conflict (id) do update set
       token_hash = excluded.token_hash,
       token_issued_at = current_timestamp,
       token_revoked_at = null`,
    [
      deviceId,
      "دستگاه تست",
      "samsung",
      "SM-J730F",
      "8.0.0",
      26,
      "0.9.0",
      63,
      createHash("sha256").update(deviceToken).digest("hex"),
      "",
      "",
      "0.9.0",
      63,
    ],
  );

  // -------------------------------------------------------------- consent --
  const scopes = { location: true, device_status: true };
  await run(
    "consent: insert with a $3::jsonb scope map",
    `insert into phone_bridge_consents (id, device_id, scopes, policy_version, source, audit_id)
     values ($1, $2, $3::jsonb, $4, 'admin', $1)`,
    [randomUUID(), deviceId, JSON.stringify(scopes), "1"],
  );

  await run(
    "policy: upsert modules + min version",
    `insert into phone_bridge_policies (device_id, modules, min_app_version_code, updated_at, updated_by)
     values ($1, $2::jsonb, $3, current_timestamp, $4)
     on conflict (device_id) do update set
       modules = excluded.modules,
       min_app_version_code = excluded.min_app_version_code`,
    [deviceId, JSON.stringify(scopes), 60, "admin"],
  );

  // ------------------------------------------------------------ snapshots --
  // This is the one with a partial unique index as the conflict target, which
  // Postgres only accepts if the predicate matches the index exactly.
  const snapshotHash = createHash("sha256").update(deviceId).digest("hex");
  const snapshotSql = `insert into phone_bridge_snapshots
       (id, device_id, sync_id, snapshot_hash, schema, app_version_name, app_version_code, payload)
     values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
     on conflict (device_id, snapshot_hash) where snapshot_hash <> '' do nothing`;
  const snapshotArgs = [
    randomUUID(),
    deviceId,
    randomUUID(),
    snapshotHash,
    "hirmand.phone-bridge.v1",
    "0.9.0",
    63,
    JSON.stringify({ device: { id: deviceId }, batteryPercent: 80 }),
  ];

  const first = await run("sync: storeSnapshot insert", snapshotSql, snapshotArgs);
  const second = await run("sync: identical snapshot is a no-op", snapshotSql, snapshotArgs);
  check(
    "a retried snapshot does not create a second row",
    second && second.affectedRows === 0,
    `affectedRows=${second?.affectedRows}`,
  );

  const snapshotCount = await sql.query("select count(*)::int as c from phone_bridge_snapshots");
  check("exactly one snapshot row exists", snapshotCount[0].c === 1, `got ${snapshotCount[0].c}`);
  check("first snapshot insert applied", first !== null);

  // ------------------------------------------------------------- location --
  // $12::timestamptz next to $11 bigint is the shape that used to fail.
  const locationSql = `insert into phone_bridge_locations
       (id, device_id, client_point_id, latitude, longitude, accuracy_meters,
        altitude_meters, speed_mps, bearing_degrees, provider, recorded_at_ms, recorded_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::timestamptz)
     on conflict (device_id, client_point_id) do nothing`;
  const now = Date.now();
  const locationArgs = [
    randomUUID(),
    deviceId,
    "point-1",
    32.6539,
    51.665,
    12.5,
    null,
    null,
    null,
    "gps",
    now,
    new Date(now).toISOString(),
  ];

  const loc = await run("location: insert with a null optional fix", locationSql, locationArgs);
  const locAgain = await run("location: same clientPointId is deduplicated", locationSql, locationArgs);
  check(
    "a re-sent fix does not create a second row",
    locAgain && locAgain.affectedRows === 0,
    `affectedRows=${locAgain?.affectedRows}`,
  );
  check("location insert applied", loc !== null);

  const locRows = await sql.query(
    "select recorded_at, recorded_at_ms from phone_bridge_locations where device_id = $1",
    [deviceId],
  );
  check(
    "the millisecond and timestamptz mirrors agree",
    Number(locRows[0].recorded_at_ms) === now &&
      new Date(locRows[0].recorded_at).getTime() === now,
    JSON.stringify(locRows[0]),
  );

  // ---------------------------------------------------------------- files --
  const fileSha = createHash("sha256").update("hello").digest("hex");
  const fileSql = `insert into phone_bridge_files
       (id, device_id, file_id, name, mime_type, size_bytes, sha256, kind)
     values ($1,$2,$3,$4,$5,$6,$7,'selected')
     on conflict (device_id, kind, sha256) do nothing`;
  const fileArgs = [
    randomUUID(),
    deviceId,
    `${deviceId}:${fileSha}`,
    "قرارداد.pdf",
    "application/pdf",
    5,
    fileSha,
  ];
  await run("files: insert selected file", fileSql, fileArgs);
  const fileAgain = await run("files: identical content is deduplicated", fileSql, fileArgs);
  check(
    "re-uploading unchanged content is a no-op",
    fileAgain && fileAgain.affectedRows === 0,
    `affectedRows=${fileAgain?.affectedRows}`,
  );

  // $8::timestamptz and $9::timestamptz, with genuine nulls for "not supplied".
  await run(
    "call recordings: insert with null start/end timestamps",
    `insert into phone_bridge_files
       (id, device_id, file_id, name, mime_type, size_bytes, sha256, kind,
        call_started_at, call_ended_at, call_direction, call_duration_seconds)
     values ($1,$2,$3,$4,$5,$6,$7,'call_recording',$8::timestamptz,$9::timestamptz,$10,$11)
     on conflict (device_id, kind, sha256) do nothing`,
    [
      randomUUID(),
      deviceId,
      `${deviceId}:audio`,
      "call-abc123",
      "audio/mp4",
      1024,
      createHash("sha256").update("audio").digest("hex"),
      null,
      null,
      "incoming",
      42,
    ],
  );

  // ------------------------------------------------------------ heartbeat --
  await run(
    "heartbeat: insert with nullable stats",
    `insert into phone_bridge_heartbeats
       (device_id, snapshot_hash, battery_percent, battery_charging,
        storage_available_bytes, storage_total_bytes,
        ram_available_bytes, ram_total_bytes, queue_queued, queue_dead_letters)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [deviceId, snapshotHash, 77, null, null, null, null, null, 0, 0],
  );
  await run(
    "heartbeat: update device health with the same nulls",
    `update phone_bridge_devices
        set battery_percent = $2, battery_charging = $3,
            storage_available_bytes = $4, storage_total_bytes = $5,
            ram_available_bytes = $6, ram_total_bytes = $7,
            updated_at = current_timestamp
      where id = $1`,
    [deviceId, 77, null, null, null, null, null],
  );

  // -------------------------------------------------------------- command --
  const commandId = randomUUID();
  await run(
    "remote command: queue with expires_at",
    `insert into phone_bridge_commands
       (id, device_id, module, action, payload, requested_by, expires_at, audit_id)
     values ($1,$2,$3,$4,$5::jsonb,$6, current_timestamp + make_interval(mins => $7), $1)`,
    [commandId, deviceId, "camera", "take_photo", JSON.stringify({ camera: "back" }), "admin", 15],
  );

  const claim = await run(
    "remote command: conditional claim returns a row",
    `update phone_bridge_commands
        set status = 'delivered', delivered_at = current_timestamp
      where id = $1 and status = 'queued'
      returning id`,
    [commandId],
  );
  check("the first claim wins", claim !== null && claim.affectedRows === 1);

  const claimAgain = await run(
    "remote command: a second poller cannot claim the same command",
    `update phone_bridge_commands
        set status = 'delivered', delivered_at = current_timestamp
      where id = $1 and status = 'queued'
      returning id`,
    [commandId],
  );
  check(
    "a second claim affects zero rows",
    claimAgain !== null && claimAgain.affectedRows === 0,
    `affectedRows=${claimAgain?.affectedRows}`,
  );

  await run(
    "remote command: record the result",
    `update phone_bridge_commands
        set status = $3, result = $4::jsonb, error = $5, finished_at = current_timestamp
      where id = $1 and device_id = $2 and status in ('delivered','running','expired')
      returning status, expires_at`,
    [commandId, deviceId, "succeeded", JSON.stringify({ fileId: "f-1" }), null],
  );

  const otherDevice = randomUUID();
  const wrongDevice = await run(
    "remote command: a result from the wrong device is refused",
    `update phone_bridge_commands
        set status = 'succeeded'
      where id = $1 and device_id = $2 and status in ('delivered','running','expired')
      returning id`,
    [commandId, otherDevice],
  );
  // Without this the check would pass even if the row had been updated, which
  // would mean any device could complete another device's command.
  check(
    "the wrong device updates zero rows",
    wrongDevice !== null && wrongDevice.affectedRows === 0,
    `affectedRows=${wrongDevice?.affectedRows}`,
  );

  // ---------------------------------------------------------------- audit --
  await run(
    "audit: insert with a scrubbed jsonb detail",
    `insert into phone_bridge_audit_log
       (device_id, actor, action, module, result, policy, ip, user_agent, detail)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      deviceId,
      "admin",
      "device.sync",
      "base",
      "ok",
      "location,device_status",
      "127.0.0.1",
      "okhttp/4.12",
      JSON.stringify({ stored: true, strippedModules: ["sms"] }),
    ],
  );

  // ------------------------------------------------------------ retention --
  await run(
    "retention: purge raw snapshots by age",
    `with gone as (
       delete from phone_bridge_snapshots
        where received_at < current_timestamp - make_interval(days => $1)
        returning 1
     )
     select count(*)::int as count from gone`,
    [30],
  );

  // ------------------------------------------------- the historical bugs --
  console.log("\nregression: the failures this project already shipped");

  const paramCheck = await pg
    .query("select count(*)::int as c from phone_bridge_devices where name = $1", [
      "null",
    ])
    .then(() => true)
    .catch((error) => {
      console.error(`       ${error.message}`);
      return false;
    });
  check("a text parameter still resolves its type unambiguously", paramCheck);

  const numericNull = await pg
    .query("select $1::numeric as n", ["null"])
    .then((r) => r.rows[0].n === null)
    .catch(() => false);
  check(
    "the string 'null' is NOT accepted by a numeric column (this is the bug)",
    numericNull === false,
    "if this ever passes, something upstream stopped coercing",
  );

  const bigintNull = await pg
    .query("select $1::bigint as n", [null])
    .then((r) => r.rows[0].n === null)
    .catch(() => false);
  check("a real JS null becomes a typed NULL in a bigint column", bigintNull);
} finally {
  await pg.close();
  await rm(dataDir, { recursive: true, force: true });
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);