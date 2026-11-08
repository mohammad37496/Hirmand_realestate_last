#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { isMainModule } from "./with-app-env.mjs";
import { liaraEnvironmentMap } from "./validate-liara-auth-env.mjs";

const SECRET_KEY = "BETTER_AUTH_SECRET";

/** Ensure the Liara secret exists without exposing environment values or CLI output. */
export function ensureLiaraBetterAuthSecret({
  eventName,
  enabled,
  env,
  runCli = runLiaraCli,
  makeRandomBytes = randomBytes,
  writeStdout = (value) => process.stdout.write(value),
}) {
  if (eventName !== "workflow_dispatch" || enabled !== true)
    return { status: "skipped" };

  const appName = env.LIARA_APP_NAME?.trim() || "hirmand";
  const apiToken = env.LIARA_API_TOKEN?.trim();
  const teamId = env.LIARA_TEAM_ID?.trim();
  if (!apiToken)
    throw new Error(
      "LIARA_API_TOKEN is unavailable; secret bootstrap stopped safely.",
    );

  const commonArgs = ["--app", appName, "--api-token", apiToken];
  if (teamId) commonArgs.push("--team-id", teamId);
  const readEnvironment = () => {
    const result = runCli(["env", "list", ...commonArgs, "--output=json"]);
    if (result.status !== 0)
      throw new Error(
        "Liara environment listing failed; no secret value was printed.",
      );
    try {
      return liaraEnvironmentMap(JSON.parse(result.stdout));
    } catch {
      throw new Error(
        "Liara environment listing was invalid; no secret value was printed.",
      );
    }
  };

  const current = readEnvironment().get(SECRET_KEY) ?? "";
  if (current.length >= 32) {
    writeStdout(
      "BETTER_AUTH_SECRET is already valid; no Liara environment changes were made.\n",
    );
    return { status: "unchanged" };
  }

  const secret = makeRandomBytes(64).toString("base64url");
  if (secret.length !== 86)
    throw new Error("Cryptographic secret generation failed its length check.");
  writeStdout(`::add-mask::${secret}\n`);
  const setResult = runCli([
    "env",
    "set",
    `${SECRET_KEY}=${secret}`,
    ...commonArgs,
    "--force",
  ]);
  if (setResult.status !== 0) {
    throw new Error(
      "Liara denied or failed the secret update; verify API token write access and retry manually.",
    );
  }

  const verified = readEnvironment().get(SECRET_KEY) ?? "";
  if (verified.length < 32)
    throw new Error(
      "Liara did not confirm a valid BETTER_AUTH_SECRET after the update.",
    );
  writeStdout(
    "BETTER_AUTH_SECRET was set and verified in Liara (value redacted).\n",
  );
  return { status: "updated", length: verified.length };
}

function runLiaraCli(args) {
  const result = spawnSync("liara", args, {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 4 * 1024 * 1024,
  });
  // Discard both streams: Liara may include variable values or the supplied secret.
  return { status: result.status ?? 1, stdout: result.stdout ?? "" };
}

function main() {
  try {
    ensureLiaraBetterAuthSecret({
      eventName: process.env.GITHUB_EVENT_NAME,
      enabled: process.env.ENSURE_BETTER_AUTH_SECRET === "true",
      env: process.env,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Secret bootstrap failed safely.";
    process.stderr.write(`::error::${message}\n`);
    process.exitCode = 1;
  }
}

if (isMainModule(import.meta.url)) main();
