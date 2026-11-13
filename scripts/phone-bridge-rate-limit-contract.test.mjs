import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const read = (path) => readFileSync(resolve(process.cwd(), path), "utf8");
const rateLimit = read("src/lib/phone-bridge-rate-limit.server.ts");

const authenticatedRoutes = [
  ["server/routes/api/device-sync/v1.post.ts", "authenticateDevice(event, deviceId)"],
  ["server/routes/api/device-sync/v1.get.ts", "authenticateDevice(event, deviceId)"],
  ["server/routes/api/device-sync/v1/app-block-config.get.ts", "authenticateDevice(event, deviceId)"],
  ["server/routes/api/device-sync/v1/call-recordings.post.ts", "authenticateDevice(event, deviceId)"],
  ["server/routes/api/device-sync/v1/files.post.ts", "authenticateDevice(event, deviceId)"],
  ["server/routes/api/device-sync/v1/heartbeat.post.ts", "authenticateDevice(event, deviceId)"],
  ["server/routes/api/device-sync/v1/location-config.get.ts", "authenticateDevice(event, deviceId)"],
  ["server/routes/api/device-sync/v1/location.post.ts", "authenticateDevice(event, deviceId)"],
  ["server/routes/api/device-sync/v1/remote-control/audio.post.ts", "authenticateDevice(event,deviceId)"],
  ["server/routes/api/device-sync/v1/remote-control/command.get.ts", "authenticateDevice(event, deviceId)"],
  ["server/routes/api/device-sync/v1/remote-control/data.post.ts", "authenticateDevice(event, deviceId)"],
  ["server/routes/api/device-sync/v1/remote-control/files/index.post.ts", "authenticateDevice(event,deviceId)"],
  ["server/routes/api/device-sync/v1/remote-control/photo.post.ts", "authenticateDevice(event, deviceId)"],
  ["server/routes/api/device-sync/v1/remote-control/result.post.ts", "authenticateDevice(event, deviceId)"],
];

test("Phone Bridge rate-limit identities do not trust caller-controlled headers or pre-auth subjects", () => {
  assert.match(rateLimit, /getRequestIP\(event\)/);
  assert.doesNotMatch(rateLimit, /getHeader|x-forwarded-for|x-real-ip|user-agent|xForwardedFor/i);
  assert.doesNotMatch(rateLimit, /consumePhoneBridgeAttempt|return \{\s*allowed:\s*true/i);
  assert.match(rateLimit, /dbSource === "unconfigured"[\s\S]*?statusCode:\s*503/);
});

for (const [path, authCall] of authenticatedRoutes) {
  test(`${path} applies a coarse IP limit before auth and a device limit after auth`, () => {
    const source = read(path);
    const ipIndex = source.indexOf("await enforcePhoneBridgeIpRateLimit(event");
    const authIndex = source.indexOf(authCall);
    const deviceIndex = source.indexOf("await enforcePhoneBridgeRateLimit(event");
    assert.ok(ipIndex >= 0, "missing pre-auth IP bucket");
    assert.ok(authIndex > ipIndex, "authentication must follow the coarse IP bucket");
    assert.ok(deviceIndex > authIndex, "device bucket must use an authenticated identity");
    const signatureIndex = source.indexOf("requirePhoneBridgeSignedRequest(event");
    if (signatureIndex >= 0) {
      assert.ok(deviceIndex < signatureIndex, "authenticated quota must apply before signature verification");
    }
    const bodyReadIndex = source.indexOf("readRawBody(event)");
    if (bodyReadIndex >= 0) {
      assert.ok(ipIndex < bodyReadIndex, "coarse IP bucket must apply before reading a potentially large body");
    }
  });
}

test("registration limits bootstrap attempts by peer IP and applies bootstrap quota only after verification", () => {
  const source = read("server/routes/api/device-sync/v1/register.post.ts");
  const ipIndex = source.indexOf("await enforcePhoneBridgeIpRateLimit(event");
  const bootstrapIndex = source.indexOf("requireBootstrap(event)");
  const subjectIndex = source.indexOf('await enforcePhoneBridgeRateLimit(event, "register", "bootstrap"');
  assert.ok(ipIndex >= 0 && bootstrapIndex > ipIndex && subjectIndex > bootstrapIndex);
});

test("public update checks use only the coarse peer-IP bucket", () => {
  const source = read("server/routes/api/device-sync/v1/update.get.ts");
  assert.match(source, /enforcePhoneBridgeIpRateLimit/);
  assert.doesNotMatch(source, /enforcePhoneBridgeRateLimit\(/);
});

test("remote command polling reports database unavailability instead of a false empty success", () => {
  const source = read("server/routes/api/device-sync/v1/remote-control/command.get.ts");
  assert.match(source, /dbSource === "unconfigured"\) throw createError\(\{ statusCode: 503/);
  assert.doesNotMatch(source, /dbSource === "unconfigured"\) return \{ ok: true, command: null \}/);
});
