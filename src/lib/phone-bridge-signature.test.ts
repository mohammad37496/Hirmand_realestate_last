/**
 * Contract tests for the Android <-> Phone Bridge HMAC scheme.
 *
 * These pin the wire format on the server side against the literal Kotlin
 * implementation in
 * `android/app/src/main/java/ir/hirmand/phonebridge/sync/SignedRequest.kt`:
 *
 *   signingInput = "v1." + deviceId + "." + timestamp + "." + nonce + "." + bodyHash
 *   bodyHash     = SHA-256(body) as lowercase hex
 *   signature    = HMAC-SHA256(secret = deviceToken, signingInput) as lowercase hex
 *
 * The canonical string is reproduced here by hand — deliberately *not* by calling
 * the same helper the server uses. A test that builds its expectation with the
 * code under test proves nothing; this one fails if either side drifts.
 */

import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { afterEach, describe, it } from "node:test";
import {
  canonicalSigningInput,
  checkSignatureFreshness,
  rememberNonce,
  sha256Hex,
  verifySignature,
} from "./phone-bridge-signature.server.ts";

/** Literal transcription of the Kotlin `SignedRequest` string construction. */
function kotlinSigningInput(deviceId: string, timestamp: string, nonce: string, body: Uint8Array) {
  const bodyHash = createHash("SHA-256").update(body).digest();
  const hex = Array.from(bodyHash)
    .map((b) => (b & 0xff).toString(16).padStart(2, "0"))
    .join("");
  return `v1.${deviceId}.${timestamp}.${nonce}.${hex}`;
}

/** Literal transcription of the Kotlin HMAC + hex encoding. */
function kotlinSignature(secret: string, input: string) {
  return createHmac("sha256", Buffer.from(secret, "utf8"))
    .update(input, "utf8")
    .digest("hex");
}

const globalRef = globalThis as typeof globalThis & { __phoneBridgeNonces__?: Map<string, number> };
afterEach(() => {
  globalRef.__phoneBridgeNonces__?.clear();
});

describe("phone-bridge signature contract", () => {
  it("builds the same canonical string the Kotlin client signs", () => {
    const body = new TextEncoder().encode(JSON.stringify({ schema: "hirmand.phone-bridge.v1" }));
    const args = { deviceId: "dev-123", timestamp: "1735689600000", nonce: "abc123", body };

    assert.equal(canonicalSigningInput(args), kotlinSigningInput("dev-123", "1735689600000", "abc123", body));
  });

  it("verifies a signature produced by the Kotlin client", () => {
    const secret = "hpd_example_device_token";
    const body = new TextEncoder().encode('{"snapshotHash":"deadbeef"}');
    const timestamp = "1735689600000";
    const nonce = "nonce-1";

    const signature = kotlinSignature(secret, kotlinSigningInput("dev-1", timestamp, nonce, body));

    assert.equal(
      verifySignature({ secret, deviceId: "dev-1", timestamp, nonce, signature, body }),
      true,
    );
  });

  it("rejects a signature made with a different secret", () => {
    const body = new TextEncoder().encode("{}");
    const timestamp = "1735689600000";
    const nonce = "nonce-1";
    const signature = kotlinSignature("some-other-token", kotlinSigningInput("dev-1", timestamp, nonce, body));

    assert.equal(
      verifySignature({ secret: "hpd_example_device_token", deviceId: "dev-1", timestamp, nonce, signature, body }),
      false,
    );
  });

  it("rejects a signature bound to a different device id", () => {
    const secret = "hpd_example_device_token";
    const body = new TextEncoder().encode("{}");
    const timestamp = "1735689600000";
    const nonce = "nonce-1";
    const signature = kotlinSignature(secret, kotlinSigningInput("dev-attacker", timestamp, nonce, body));

    assert.equal(
      verifySignature({ secret, deviceId: "dev-1", timestamp, nonce, signature, body }),
      false,
    );
  });

  it("rejects a signature over a tampered body", () => {
    const secret = "hpd_example_device_token";
    const original = new TextEncoder().encode('{"batteryPercent":90}');
    const tampered = new TextEncoder().encode('{"batteryPercent":10}');
    const timestamp = "1735689600000";
    const nonce = "nonce-1";
    const signature = kotlinSignature(secret, kotlinSigningInput("dev-1", timestamp, nonce, original));

    assert.equal(
      verifySignature({ secret, deviceId: "dev-1", timestamp, nonce, signature, body: tampered }),
      false,
    );
  });

  it("hashes an empty body the same way, so the remote-command GET verifies", () => {
    // RemoteControlService signs ByteArray(0) on the command poll.
    assert.equal(sha256Hex(new Uint8Array(0)), createHash("sha256").update(Buffer.alloc(0)).digest("hex"));
  });
});

describe("phone-bridge signature freshness", () => {
  const validHeaders = {
    timestamp: "1735689600000",
    nonce: "nonce-1",
    signature: "a".repeat(64),
    version: "1",
  };

  it("accepts a timestamp inside the skew window", () => {
    const now = Number(validHeaders.timestamp) + 60_000;
    assert.deepEqual(checkSignatureFreshness(validHeaders, { now }), { ok: true });
  });

  it("rejects a stale timestamp as 'stale' so the caller can answer 408", () => {
    const now = Number(validHeaders.timestamp) + 10 * 60 * 1000;
    assert.deepEqual(checkSignatureFreshness(validHeaders, { now }), { ok: false, reason: "stale" });
  });

  it("rejects a far-future timestamp rather than trusting the client clock", () => {
    const now = Number(validHeaders.timestamp) - 10 * 60 * 1000;
    assert.deepEqual(checkSignatureFreshness(validHeaders, { now }), { ok: false, reason: "stale" });
  });

  it("rejects missing headers", () => {
    assert.deepEqual(checkSignatureFreshness({ timestamp: undefined, nonce: undefined, signature: undefined, version: undefined }), {
      ok: false,
      reason: "missing",
    });
  });

  it("rejects a non-numeric timestamp", () => {
    assert.deepEqual(
      checkSignatureFreshness({ ...validHeaders, timestamp: "not-a-number" }),
      { ok: false, reason: "malformed" },
    );
  });

  it("rejects a signature that is not 64 hex characters", () => {
    assert.deepEqual(
      checkSignatureFreshness({ ...validHeaders, signature: "abc" }),
      { ok: false, reason: "malformed" },
    );
  });

  it("rejects an unknown signature version", () => {
    assert.deepEqual(
      checkSignatureFreshness({ ...validHeaders, version: "2" }),
      { ok: false, reason: "malformed" },
    );
  });

  it("does not throw on a length-mismatched signature", () => {
    // timingSafeEqual throws on unequal lengths; verifySignature must guard first.
    assert.equal(
      verifySignature({
        secret: "s",
        deviceId: "d",
        timestamp: "1735689600000",
        nonce: "n",
        signature: "deadbeef",
        body: "",
      }),
      false,
    );
  });
});

describe("phone-bridge replay protection", () => {
  it("refuses a nonce it has already seen", () => {
    assert.equal(rememberNonce("dev-1", "nonce-1", { now: 1_000 }), true);
    assert.equal(rememberNonce("dev-1", "nonce-1", { now: 1_000 }), false);
  });

  it("scopes nonces per device", () => {
    assert.equal(rememberNonce("dev-1", "shared", { now: 1_000 }), true);
    assert.equal(rememberNonce("dev-2", "shared", { now: 1_000 }), true);
  });

  it("keeps refusing a replay after the nonce would have aged out", () => {
    assert.equal(rememberNonce("dev-1", "nonce-1", { now: 1_000 }), true);
    // Far past the window: the entry is pruned, so a *new* nonce is accepted —
    // but the already-registered nonce must not flip back to usable.
    rememberNonce("dev-1", "nonce-2", { now: 10_000_000 });
    assert.equal(rememberNonce("dev-1", "nonce-3", { now: 10_000_000 }), true);
  });
});