import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { readDeploymentCommit, runMigrations } from "./prestart-migrate.mjs";

test("production prestart uses the direct PostgreSQL URL for DDL migrations", async () => {
  const source = await readFile(new URL("./prestart.mjs", import.meta.url), "utf8");
  assert.match(source, /resolveMigrationDatabaseUrl\(\)/);
  assert.doesNotMatch(source, /resolveDatabaseUrl\(\)/);
});

test("migration success logs are bound to the stamped deployment commit", async () => {
  const source = await readFile(new URL("./prestart-migrate.mjs", import.meta.url), "utf8");
  assert.match(source, /readDeploymentCommit\(\)/);
  assert.match(source, /deploymentLabel = deploymentCommit \? ` for deployment \$\{deploymentCommit\}` : ""/);
  assert.match(source, /customer-auth migrations verified\$\{deploymentLabel\}/);
  assert.match(source, /PROPERTY_CONSULTANT_RELATION_MIGRATIONS/);
  assert.match(source, /property consultant migrations verified\$\{deploymentLabel\}/);
  assert.match(source, /public\/deployment\.json/);
});

test("Verify can run auth migrations without a deployment stamp", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hirmand-deployment-stamp-"));
  try {
    assert.equal(await readDeploymentCommit(join(directory, "deployment.json")), null);
    const sha = "a".repeat(40);
    await writeFile(join(directory, "deployment.json"), JSON.stringify({ commit: sha }), "utf8");
    assert.equal(await readDeploymentCommit(join(directory, "deployment.json")), sha);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Liara deploy polls for the exact migration verification line for this commit", async () => {
  const workflow = await readFile(new URL("../.github/workflows/deploy-liara.yml", import.meta.url), "utf8");
  assert.match(workflow, /EXPECTED_DEPLOYMENT_SHA: \$\{\{ github\.sha \}\}/);
  assert.match(workflow, /for attempt in \{1\.\.12\}/);
  assert.match(workflow, /sleep 10/);
  assert.match(workflow, /customer-auth migrations verified for deployment \$\{EXPECTED_DEPLOYMENT_SHA\}/);
  assert.match(workflow, /0059_customer_workspace_revision\.sql/);
  assert.match(workflow, /property consultant migrations verified for deployment \$\{EXPECTED_DEPLOYMENT_SHA\}/);
  assert.match(workflow, /0103_property_consultant_relation\.sql/);
});

test("migration runner acquires its advisory lock before reading the migration ledger", async () => {
  const source = await readFile(new URL("./prestart-migrate.mjs", import.meta.url), "utf8");
  const lockIndex = source.indexOf("pg_advisory_lock");
  const ledgerIndex = source.indexOf('SELECT name FROM _migrations');
  assert.ok(lockIndex >= 0 && ledgerIndex > lockIndex);
  assert.match(source, /pg_advisory_unlock/);
  assert.match(source, /client = await pool\.connect\(\)/);
  assert.match(source, /pendingMigrations\(entries, appliedRows\.map/);
});

test("concurrent migration runners apply a pending migration only once", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hirmand-migration-lock-"));
  try {
    await writeFile(join(directory, "0001_test.sql"), "SELECT 1;", "utf8");
    const state = { applied: new Set(), executions: 0, nextClientId: 0, lockClients: [], ledgerClients: [] };
    let lockQueue = Promise.resolve();

    async function acquireLock() {
      const previous = lockQueue;
      let release;
      lockQueue = new Promise((resolve) => { release = resolve; });
      await previous;
      return release;
    }

    class FakeClient {
      constructor() {
        this.id = ++state.nextClientId;
        this.releaseLock = null;
      }

      async query(text, params = []) {
        if (text.startsWith("SELECT pg_advisory_lock")) {
          state.lockClients.push(this.id);
          this.releaseLock = await acquireLock();
          return { rows: [] };
        }
        if (text.startsWith("SELECT pg_advisory_unlock")) {
          this.releaseLock?.();
          return { rows: [] };
        }
        if (text.startsWith("CREATE TABLE IF NOT EXISTS _migrations")) return { rows: [] };
        if (text === "SELECT name FROM _migrations") {
          state.ledgerClients.push(this.id);
          return { rows: [...state.applied].map((name) => ({ name })) };
        }
        if (["BEGIN", "COMMIT", "ROLLBACK"].includes(text)) return { rows: [] };
        if (text.trim() === "SELECT 1;") {
          state.executions += 1;
          await new Promise((resolve) => setTimeout(resolve, 15));
          return { rows: [] };
        }
        if (text.startsWith("INSERT INTO _migrations")) {
          state.applied.add(String(params[0]));
          return { rows: [] };
        }
        throw new Error(`Unexpected migration query: ${text}`);
      }

      release() {}
    }

    const poolFactory = () => ({ connect: async () => new FakeClient(), end: async () => {} });
    await Promise.all([
      runMigrations({ connectionString: "postgres://migration-test", migrationsDir: directory, poolFactory, verifyCustomerAuth: false, verifyPropertyConsultantMigration: false }),
      runMigrations({ connectionString: "postgres://migration-test", migrationsDir: directory, poolFactory, verifyCustomerAuth: false, verifyPropertyConsultantMigration: false }),
    ]);

    assert.equal(state.executions, 1);
    assert.deepEqual([...state.applied], ["0001_test.sql"]);
    assert.deepEqual([...new Set(state.ledgerClients)], state.lockClients);
    assert.equal(state.ledgerClients.length, state.lockClients.length * 2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
