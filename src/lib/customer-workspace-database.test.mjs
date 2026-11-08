import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { requireCustomerWorkspaceDatabase } from "./customer-workspace-database.server.mjs";
import { saveCustomerWorkspaceWithRevision } from "./customer-workspace-cas.server.mjs";

test("an unconfigured workspace database fails closed with HTTP 503", () => {
  assert.throws(
    () => requireCustomerWorkspaceDatabase("unconfigured"),
    (error) => {
      if (!error || typeof error !== "object") return false;
      const candidate = /** @type {{ statusCode?: number; statusMessage?: string }} */ (error);
      return candidate.statusCode === 503 && candidate.statusMessage === "Workspace database is unavailable";
    },
  );
});

test("a configured workspace database is allowed to serve the workspace", () => {
  assert.equal(requireCustomerWorkspaceDatabase("postgres"), undefined);
});

test("workspace revision migration adds a monotonic bigint revision with default one", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create table customer_workspace (
      user_id text primary key,
      favorites jsonb not null default '[]'::jsonb,
      favorite_meta jsonb not null default '{}'::jsonb,
      saved_searches jsonb not null default '[]'::jsonb,
      recent_properties jsonb not null default '[]'::jsonb,
      updated_at timestamptz not null default current_timestamp
    )`);
    await db.exec(await readFile(new URL("../../migrations/0059_customer_workspace_revision.sql", import.meta.url), "utf8"));
    await db.query("insert into customer_workspace(user_id) values($1)", ["fixture-owner"]);
    const rows = await db.query("select revision::text as revision from customer_workspace where user_id=$1", ["fixture-owner"]);
    assert.equal(rows.rows[0]?.revision, "1");
  } finally {
    await db.close();
  }
});

test("two writes with the same expected revision cannot overwrite one another", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create table customer_workspace (
      user_id text primary key,
      favorites jsonb not null default '[]'::jsonb,
      favorite_meta jsonb not null default '{}'::jsonb,
      saved_searches jsonb not null default '[]'::jsonb,
      recent_properties jsonb not null default '[]'::jsonb,
      updated_at timestamptz not null default current_timestamp
    )`);
    await db.exec(await readFile(new URL("../../migrations/0059_customer_workspace_revision.sql", import.meta.url), "utf8"));
    /** @type {{ query: (statement: string, params?: unknown[]) => Promise<Array<Record<string, unknown>>> }} */
    const sql = {
      query: async (statement, params) => (await db.query(statement, params)).rows,
    };
    /** @param {string} favorite */
    const workspace = (favorite) => ({
      favorites: [favorite],
      favoriteMeta: {},
      savedSearches: [],
      recentProperties: [],
    });
    const initial = await saveCustomerWorkspaceWithRevision(sql, "same-owner", workspace("initial"), null);
    assert.deepEqual(initial, { success: true, revision: "1" });

    const [first, second] = await Promise.all([
      saveCustomerWorkspaceWithRevision(sql, "same-owner", workspace("device-a"), "1"),
      saveCustomerWorkspaceWithRevision(sql, "same-owner", workspace("device-b"), "1"),
    ]);
    assert.equal([first, second].filter((result) => result.success).length, 1);
    assert.equal([first, second].filter((result) => !result.success && result.conflict).length, 1);
    const persisted = await db.query("select favorites,revision::text as revision from customer_workspace where user_id=$1", ["same-owner"]);
    assert.equal(persisted.rows[0]?.revision, "2");
    assert.equal(persisted.rows[0]?.favorites?.[0], first.success ? "device-a" : "device-b");
  } finally {
    await db.close();
  }
});

test("concurrent first writes with null expected revision create only one workspace row", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create table customer_workspace (
      user_id text primary key,
      favorites jsonb not null default '[]'::jsonb,
      favorite_meta jsonb not null default '{}'::jsonb,
      saved_searches jsonb not null default '[]'::jsonb,
      recent_properties jsonb not null default '[]'::jsonb,
      updated_at timestamptz not null default current_timestamp
    )`);
    await db.exec(await readFile(new URL("../../migrations/0059_customer_workspace_revision.sql", import.meta.url), "utf8"));
    /** @type {{ query: (statement: string, params?: unknown[]) => Promise<Array<Record<string, unknown>>> }} */
    const sql = { query: async (statement, params) => (await db.query(statement, params)).rows };
    const workspace = { favorites: [], favoriteMeta: {}, savedSearches: [], recentProperties: [] };
    const results = await Promise.all([
      saveCustomerWorkspaceWithRevision(sql, "new-owner", workspace, null),
      saveCustomerWorkspaceWithRevision(sql, "new-owner", workspace, null),
    ]);
    assert.equal(results.filter((result) => result.success).length, 1);
    assert.equal(results.filter((result) => !result.success && result.conflict).length, 1);
  } finally {
    await db.close();
  }
});

test("cross-account workspace writes return 409 before validating the new revision field", async () => {
  const route = await readFile(new URL("../../server/routes/api/customer-workspace.post.ts", import.meta.url), "utf8");
  const ownerMismatch = route.indexOf("rawBodyObject.ownerId !== userId");
  const schemaValidation = route.indexOf("schema.safeParse(rawBody)");
  assert.ok(ownerMismatch >= 0 && schemaValidation > ownerMismatch);
  assert.match(route, /expectedRevision: z\.string\(\)\.regex/);
});
