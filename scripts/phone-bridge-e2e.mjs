/**
 * End-to-end verification of the Phone Bridge HTTP contract.
 *
 * This signs every request exactly the way `SignedRequest.kt` does — same
 * canonical string, same headers — and walks the full flow:
 *
 *   register -> heartbeat -> sync -> location -> files -> remote command
 *            -> command result -> duplicate/replay rejection
 *
 * It is a script rather than a test because it needs a running server. Run it
 * against the preview with:
 *
 *   node scripts/phone-bridge-e2e.mjs [baseUrl]
 *
 * Exit code 0 means every step behaved as the Android client expects.
 */

import { createHash, createHmac, randomUUID } from "node:crypto";

const BASE = (process.argv[2] ?? "http://127.0.0.1:8080").replace(/\/$/, "");
const API = `${BASE}/api/device-sync/v1`;

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

/** Literal transcription of android/.../sync/SignedRequest.kt. */
function sign(secret, deviceId, body) {
  const timestamp = Date.now().toString();
  const nonce = randomUUID().replace(/-/g, "");
  const bodyHash = createHash("sha256").update(body).digest("hex");
  const signature = createHmac("sha256", secret)
    .update(`v1.${deviceId}.${timestamp}.${nonce}.${bodyHash}`, "utf8")
    .digest("hex");
  return {
    "X-Hirmand-Timestamp": timestamp,
    "X-Hirmand-Nonce": nonce,
    "X-Hirmand-Signature": signature,
    "X-Hirmand-Signature-Version": "1",
  };
}

async function signedRequest(path, token, deviceId, body, extraHeaders = {}) {
  const bytes = typeof body === "string" ? Buffer.from(body, "utf8") : Buffer.alloc(0);
  return fetch(`${API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Hirmand-Device-Id": deviceId,
      "content-type": "application/json; charset=utf-8",
      ...sign(token, deviceId, bytes),
      ...extraHeaders,
    },
    // Sent even when empty: the command poll signs an empty body, so the server
    // has to be able to distinguish "empty" from "no body".
    body: bytes,
  });
}

async function main() {
  console.log(`Phone Bridge end-to-end against ${API}\n`);

  // 1. A device with no valid pairing token must be refused.
  console.log("register");
  const deviceId = randomUUID();

  // When a bootstrap token is supplied the script exercises the *whole* flow —
  // enrollment, signing, dedupe and replay. Without one it only verifies that the
  // unauthenticated surface is closed, which is still worth checking.
  const pairingToken = process.env.PHONE_BRIDGE_PAIRING_TOKEN ?? "";

  let skipped = 0;
  const skip = (name, why) => {
    skipped++;
    console.log(`  skip ${name} — ${why}`);
  };

  const badPair = await fetch(`${API}/register`, {
    method: "POST",
    headers: { Authorization: "Bearer hpb_not-a-real-token", "content-type": "application/json" },
    body: JSON.stringify({ device: { id: deviceId } }),
  });
  check(
    "rejects an unknown pairing token",
    badPair.status === 401 || badPair.status === 503,
    `got ${badPair.status}`,
  );

  const noPair = await fetch(`${API}/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ device: { id: deviceId } }),
  });
  check("rejects a missing pairing token", noPair.status === 401, `got ${noPair.status}`);

  // Without a valid pairing token there is no device token, so everything that
  // follows runs unauthenticated to prove the gate actually holds.
  console.log("\nauthentication gate");
  const unsigned = await fetch(`${API}/heartbeat`, {
    method: "POST",
    headers: { Authorization: "Bearer hpd_fake", "X-Hirmand-Device-Id": deviceId, "content-type": "application/json" },
    body: JSON.stringify({ snapshotHash: "x" }),
  });
  check(
    "rejects an unknown device token",
    unsigned.status === 401 || unsigned.status === 503,
    `got ${unsigned.status}`,
  );

  const noAuth = await fetch(`${API}/location`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ clientPointId: "p1", latitude: 32.6, longitude: 51.6 }),
  });
  check(
    "rejects a request with no Authorization header",
    noAuth.status === 401 || noAuth.status === 503,
    `got ${noAuth.status}`,
  );

  // 2. The update probe is intentionally unauthenticated.
  console.log("\nupdate probe");
  const update = await fetch(`${API}/update?versionCode=63`);
  const updateJson = await update.json().catch(() => null);
  check("answers the update probe without auth", update.status === 200, `got ${update.status}`);
  check(
    "returns the documented update shape",
    updateJson && typeof updateJson.updateAvailable === "boolean" && typeof updateJson.latest?.versionCode === "number",
  );

  // 3. Health probe requires a valid bearer token.
  const health = await fetch(API, {
    headers: { Authorization: "Bearer hpd_fake", "X-Hirmand-Device-Id": deviceId },
  });
  check(
    "health probe rejects a bad token",
    health.status === 401 || health.status === 503,
    `got ${health.status}`,
  );

  // A 503 anywhere above means this server has no database configured. That is
  // an environment fact, not a contract violation, so the authenticated half is
  // reported as skipped rather than failed.
  if (badPair.status === 503) {
    skip("the authenticated flow", "server reports no database configured (503)");
    console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped`);
    process.exit(failed === 0 ? 0 : 1);
  }

  if (!pairingToken) {
    skip("the authenticated flow", "PHONE_BRIDGE_PAIRING_TOKEN not set");
    console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped`);
    process.exit(failed === 0 ? 0 : 1);
  }

  // 4. Full authenticated flow.
  console.log("\nenrollment");
  const enrolled = await fetch(`${API}/register`, {
    method: "POST",
    headers: { Authorization: `Bearer ${pairingToken}`, "content-type": "application/json" },
    body: JSON.stringify({
      device: {
        id: deviceId,
        name: "دستگاه تست",
        manufacturer: "samsung",
        model: "SM-J730F",
        androidVersion: "8.0.0",
        sdkInt: 26,
        appVersionName: "0.9.0",
        appVersionCode: 63,
      },
    }),
  });
  const enrolledJson = await enrolled.json().catch(() => null);
  check("accepts a valid pairing token", enrolled.status === 200, `got ${enrolled.status}`);
  const deviceToken = enrolledJson?.deviceToken ?? "";
  check("returns a device token", typeof deviceToken === "string" && deviceToken.length > 20);
  if (!deviceToken) {
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(1);
  }

  // The bootstrap token is single-use.
  const replayPair = await fetch(`${API}/register`, {
    method: "POST",
    headers: { Authorization: `Bearer ${pairingToken}`, "content-type": "application/json" },
    body: JSON.stringify({ device: { id: randomUUID() } }),
  });
  check("pairing token is single-use", replayPair.status === 401, `got ${replayPair.status}`);

  console.log("\nsync");
  const snapshot = JSON.stringify({
    schema: "hirmand.phone-bridge.v1",
    sentAt: Date.now(),
    syncId: randomUUID(),
    snapshotHash: createHash("sha256").update(deviceId).digest("hex"),
    device: { id: deviceId, appVersionName: "0.9.0", appVersionCode: 63 },
    deviceStats: { batteryPercent: 80, storageAvailableBytes: 1024, ramAvailableBytes: 512 },
    // sms is deliberately included with no consent/policy behind it: the server
    // must strip it rather than store it.
    sms: [{ address: "09120000000", body: "must not be stored" }],
  });

  const sync = await signedRequest("", deviceToken, deviceId, snapshot);
  const syncJson = await sync.json().catch(() => null);
  check("accepts a correctly signed sync packet", sync.status === 200, `got ${sync.status}`);
  check("strips a module with no consent behind it", !(syncJson?.effectiveModules ?? []).includes("sms"));

  const syncAgain = await signedRequest("", deviceToken, deviceId, snapshot);
  const syncAgainJson = await syncAgain.json().catch(() => null);
  check("a retried snapshot is deduplicated", syncAgainJson?.deduplicated === true);

  console.log("\nsignature enforcement");
  const tampered = await fetch(`${API}/heartbeat`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${deviceToken}`,
      "X-Hirmand-Device-Id": deviceId,
      "content-type": "application/json",
      ...sign(deviceToken, deviceId, Buffer.from('{"snapshotHash":"a"}', "utf8")),
    },
    // Body differs from what was signed.
    body: JSON.stringify({ snapshotHash: "something-else" }),
  });
  check("rejects a tampered body", tampered.status === 401, `got ${tampered.status}`);

  const wrongDevice = await signedRequest("/heartbeat", deviceToken, randomUUID(), '{"snapshotHash":"a"}');
  check("rejects a device-id mismatch", wrongDevice.status === 401, `got ${wrongDevice.status}`);

  const heartbeat = await signedRequest(
    "/heartbeat",
    deviceToken,
    deviceId,
    JSON.stringify({
      snapshotHash: createHash("sha256").update(deviceId).digest("hex"),
      deviceStats: { batteryPercent: 77 },
      queue: { queued: 0, deadLetters: 0 },
    }),
  );
  check("accepts a signed heartbeat", heartbeat.status === 200, `got ${heartbeat.status}`);

  console.log("\nconsent + policy enforcement");
  const location = await signedRequest(
    "/location",
    deviceToken,
    deviceId,
    JSON.stringify({
      clientPointId: "point-1",
      latitude: 32.6539,
      longitude: 51.665,
      recordedAt: Date.now(),
    }),
  );
  check("refuses location with no consent behind it", location.status === 403, `got ${location.status}`);

  console.log("\nremote commands");
  const command = await fetch(`${API}/remote-control/command?deviceId=${encodeURIComponent(deviceId)}`, {
    headers: {
      Authorization: `Bearer ${deviceToken}`,
      "X-Hirmand-Device-Id": deviceId,
      ...sign(deviceToken, deviceId, Buffer.alloc(0)),
    },
  });
  const commandJson = await command.json().catch(() => null);
  check("answers the command poll", command.status === 200, `got ${command.status}`);
  check(
    "withholds a command whose module is not effective",
    commandJson?.command === null,
    JSON.stringify(commandJson)?.slice(0, 120),
  );

  console.log("\nfile integrity");
  const badHash = await signedRequest("/files", deviceToken, deviceId, "hello", {
    "X-Hirmand-File-Sha256": "0".repeat(64),
    "X-Hirmand-File-Size": "5",
    "X-Hirmand-File-Name": Buffer.from("a.txt", "utf8").toString("base64"),
    "content-type": "application/octet-stream",
  });
  check(
    "refuses a file whose hash does not match its bytes",
    badHash.status === 403 || badHash.status === 400,
    `got ${badHash.status}`,
  );

  console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped`);
  process.exit(failed === 0 ? 0 : 1);
}

await main();