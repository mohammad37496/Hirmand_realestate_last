import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { ensureLiaraBetterAuthSecret } from "./ensure-liara-better-auth-secret.mjs";

const base = {
  eventName: "workflow_dispatch",
  enabled: true,
  env: {
    LIARA_API_TOKEN: "test-token",
    LIARA_TEAM_ID: "team",
    LIARA_APP_NAME: "hirmand",
  },
};

test("deploy workflow exposes a false-by-default manual-only bootstrap and skips deploy when selected", () => {
  const workflow = readFileSync(
    resolve(".github/workflows/deploy-liara.yml"),
    "utf8",
  );
  assert.match(
    workflow,
    /workflow_dispatch:\s+inputs:\s+ensure_better_auth_secret:[\s\S]*?type: boolean[\s\S]*?default: false/,
  );
  assert.match(
    workflow,
    /ensure-better-auth-secret:\s+if: \$\{\{ github\.event_name == 'workflow_dispatch' && inputs\.ensure_better_auth_secret == true \}\}/,
  );
  assert.match(
    workflow,
    /deploy:\s+if: \$\{\{ \(github\.event_name != 'workflow_dispatch' \|\| inputs\.ensure_better_auth_secret != true\)/,
  );
  assert.match(workflow, /'liara-secret-bootstrap' \|\| 'liara-deploy-main'/);
  assert.match(
    workflow,
    /LIARA_API_TOKEN: \$\{\{ secrets\.LIARA_API_TOKEN \}\}/,
  );
  assert.match(workflow, /LIARA_TEAM_ID: \$\{\{ secrets\.LIARA_TEAM_ID \}\}/);
  assert.match(workflow, /LIARA_APP_NAME: \$\{\{ vars\.LIARA_APP_NAME \}\}/);
});

test("secret bootstrap is strictly manual and opt-in", () => {
  for (const input of [
    { eventName: "push", enabled: true },
    { eventName: "pull_request", enabled: true },
    { eventName: "workflow_dispatch", enabled: false },
  ]) {
    let calls = 0;
    const result = ensureLiaraBetterAuthSecret({
      ...base,
      ...input,
      runCli: () => {
        calls += 1;
      },
    });
    assert.deepEqual(result, { status: "skipped" });
    assert.equal(calls, 0);
  }
});

test("an existing secret of at least 32 characters is a no-op", () => {
  const calls = [];
  const output = [];
  const result = ensureLiaraBetterAuthSecret({
    ...base,
    runCli: (args) => {
      calls.push(args);
      return {
        status: 0,
        stdout: JSON.stringify([
          { key: "BETTER_AUTH_SECRET", value: "v".repeat(32) },
        ]),
      };
    },
    writeStdout: (value) => output.push(value),
  });
  assert.deepEqual(result, { status: "unchanged" });
  assert.equal(calls.length, 1);
  assert.match(output.join(""), /already valid/);
  assert.doesNotMatch(output.join(""), /v{32}/);
});

test("missing and short secrets are replaced with 64-byte base64url secrets and verified", () => {
  for (const existing of [undefined, "short-value"]) {
    const calls = [];
    const output = [];
    let stored = existing ?? "";
    const result = ensureLiaraBetterAuthSecret({
      ...base,
      runCli: (args) => {
        calls.push(args);
        if (args[1] === "list")
          return {
            status: 0,
            stdout: JSON.stringify(
              stored ? [{ key: "BETTER_AUTH_SECRET", value: stored }] : [],
            ),
          };
        stored = args[2].slice("BETTER_AUTH_SECRET=".length);
        return {
          status: 0,
          stdout: `sensitive cli output ${stored}`,
          stderr: `sensitive stderr ${stored}`,
        };
      },
      makeRandomBytes: (size) => {
        assert.equal(size, 64);
        return Buffer.alloc(size, 7);
      },
      writeStdout: (value) => output.push(value),
    });
    assert.deepEqual(result, { status: "updated", length: 86 });
    assert.equal(calls.length, 3);
    const generated = calls[1][2].slice("BETTER_AUTH_SECRET=".length);
    assert.equal(generated.length, 86);
    assert.match(generated, /^[A-Za-z0-9_-]{86}$/);
    assert.deepEqual(calls[1].slice(-1), ["--force"]);
    assert.equal(output[0], `::add-mask::${generated}\n`);
    assert.doesNotMatch(
      output.join("").replace(`::add-mask::${generated}\n`, ""),
      new RegExp(generated),
    );
    assert.doesNotMatch(
      output.join(""),
      /sensitive cli output|sensitive stderr/,
    );
  }
});

test("failed writes surface a sanitized error", () => {
  const output = [];
  assert.throws(
    () =>
      ensureLiaraBetterAuthSecret({
        ...base,
        runCli: (args) =>
          args[1] === "list"
            ? { status: 0, stdout: "[]" }
            : {
                status: 1,
                stdout: "secret leaked by cli",
                stderr: "secret leaked by cli",
              },
        writeStdout: (value) => output.push(value),
      }),
    /denied or failed/,
  );
  assert.doesNotMatch(output.join(""), /secret leaked by cli/);
});

test("missing API token fails before any Liara command", () => {
  let calls = 0;
  assert.throws(
    () =>
      ensureLiaraBetterAuthSecret({
        ...base,
        env: {},
        runCli: () => {
          calls += 1;
        },
      }),
    /LIARA_API_TOKEN is unavailable/,
  );
  assert.equal(calls, 0);
});
