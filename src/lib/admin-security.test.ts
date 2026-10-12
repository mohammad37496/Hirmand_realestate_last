/**
 * Regression tests for the admin hardening work.
 *
 * Two of the three new server modules are pure decision functions — the magic
 * byte sniffer and the origin matcher — so the security claims they make can
 * be asserted directly instead of inferred from a passing build. The rate
 * limiter is stateful but keyed, so each test uses its own key.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  clearAdminAttempts,
  consumeAdminAttempt,
  assertServerFnSameOrigin,
} from "./admin-rate-limit.server.ts";
import { contentMatchesDeclaredType, sniffMediaBytes } from "./file-signature.server.ts";
import { hasAdminPermission, normalizeAdminRole } from "./admin-roles.ts";

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

const ascii = (text: string, pad = 0) => {
  const bytes = new Uint8Array(Math.max(text.length, pad));
  for (let i = 0; i < text.length; i += 1) bytes[i] = text.charCodeAt(i);
  return bytes;
};

const jpeg = () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const png = () => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const riff = (form: string) => {
  const bytes = new Uint8Array(12);
  bytes.set(ascii("RIFF"), 0);
  bytes.set(ascii("WEBP"), 8);
  bytes.set(ascii(form), 8);
  return bytes;
};
const bmff = (brand: string) => {
  const bytes = new Uint8Array(12);
  bytes.set(ascii("ftyp"), 4);
  bytes.set(ascii(brand), 8);
  return bytes;
};

/** `null` when the bytes are not recognised, so a test reads as one assertion. */
const sniffMime = (bytes: Uint8Array): string | null => {
  const result = sniffMediaBytes(bytes);
  return result.ok ? result.mime : null;
};

/* ------------------------------------------------------------------ */
/* role normalization and least privilege                              */
/* ------------------------------------------------------------------ */

test("unknown or malformed admin roles fail closed as viewer", () => {
  assert.equal(normalizeAdminRole(null), "viewer");
  assert.equal(normalizeAdminRole(undefined), "viewer");
  assert.equal(normalizeAdminRole("unexpected-role"), "viewer");
  assert.equal(normalizeAdminRole("admin"), "owner");
});

test("viewer role cannot inherit mutation or sensitive-data permissions", () => {
  const role = normalizeAdminRole("viewer");
  assert.equal(hasAdminPermission(role, "reports.view"), true);
  assert.equal(hasAdminPermission(role, "property.manage"), false);
  assert.equal(hasAdminPermission(role, "lead.manage"), false);
  assert.equal(hasAdminPermission(role, "finance.manage"), false);
  assert.equal(hasAdminPermission(role, "content.manage"), false);
  assert.equal(hasAdminPermission(role, "security.manage"), false);
});

test("staff role is limited to new property intake, CRM review and Divar import", () => {
  const role = normalizeAdminRole("staff");
  assert.equal(role, "staff");
  assert.equal(hasAdminPermission(role, "property.create"), true);
  assert.equal(hasAdminPermission(role, "lead.manage"), true);
  assert.equal(hasAdminPermission(role, "divar.import"), true);
  assert.equal(hasAdminPermission(role, "property.manage"), false);
  assert.equal(hasAdminPermission(role, "property.publish"), false);
  assert.equal(hasAdminPermission(role, "finance.manage"), false);
  assert.equal(hasAdminPermission(role, "content.manage"), false);
  assert.equal(hasAdminPermission(role, "settings.manage"), false);
  assert.equal(hasAdminPermission(role, "backup.manage"), false);
  assert.equal(hasAdminPermission(role, "security.manage"), false);
  assert.equal(hasAdminPermission(role, "accounts.manage"), false);
  assert.equal(hasAdminPermission(role, "reports.view"), false);
});

/* ------------------------------------------------------------------ */
/* magic-byte sniffing                                                 */
/* ------------------------------------------------------------------ */

test("recognises the image formats the admin accepts", () => {
  for (const [bytes, mime] of [
    [jpeg(), "image/jpeg"],
    [png(), "image/png"],
    [ascii("GIF89a", 6), "image/gif"],
    [riff("WEBP"), "image/webp"],
    [bmff("avif"), "image/avif"],
  ] as const) {
    const result = sniffMediaBytes(bytes);
    assert.equal(result.ok, true, `${mime} should be recognised`);
    assert.equal(result.ok && result.mime, mime);
  }
});

test("recognises the audio and video formats the admin accepts", () => {
  assert.equal(sniffMime(ascii("ID3mp3")), "audio/mpeg");
  assert.equal(sniffMime(ascii("OggS")), "audio/ogg");
  assert.equal(sniffMime(riff("WAVE")), "audio/wav");
  assert.equal(sniffMime(bmff("M4A ")), "audio/mp4");
  assert.equal(sniffMime(bmff("isom")), "video/mp4");
  assert.equal(sniffMime(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3])), "video/webm");
  assert.equal(sniffMime(bmff("qt  ")), "video/quicktime");
});

test("rejects an empty upload instead of guessing", () => {
  const result = sniffMediaBytes(new Uint8Array(0));
  assert.equal(result.ok, false);
});

test("rejects a header that is too short to be conclusive", () => {
  // Two JPEG bytes: a real .jpg always carries the third SOI marker byte.
  assert.equal(sniffMediaBytes(new Uint8Array([0xff, 0xd8])).ok, false);
});

test("rejects script and markup payloads wearing an image extension", () => {
  const html = ascii("<!DOCTYPE html><script>alert(1)</script>");
  const svg = ascii(`<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)">`);
  const php = ascii("<?php system($_GET['c']); ?>");

  for (const payload of [html, svg, php]) {
    assert.equal(sniffMediaBytes(payload).ok, false);
    assert.equal(contentMatchesDeclaredType(payload, "image/jpeg"), false);
  }
});

test("accepts real bytes under the aliases browsers actually send", () => {
  assert.equal(contentMatchesDeclaredType(jpeg(), "image/jpeg"), true);
  assert.equal(contentMatchesDeclaredType(jpeg(), "IMAGE/JPEG"), true);
  assert.equal(contentMatchesDeclaredType(ascii("ID3mp3"), "audio/mp3"), true);
  assert.equal(contentMatchesDeclaredType(riff("WAVE"), "audio/x-wav"), true);
  assert.equal(contentMatchesDeclaredType(bmff("M4A "), "audio/x-m4a"), true);
});

test("a real file under the wrong declared type is still refused", () => {
  // A real .webp offered as audio, and Ogg offered as an image: both would
  // render as a broken asset, and neither belongs in the declared slot.
  assert.equal(contentMatchesDeclaredType(riff("WEBP"), "audio/mpeg"), false);
  assert.equal(contentMatchesDeclaredType(ascii("OggS"), "image/jpeg"), false);
  // An mp4 container is not raw AAC, and an image is not raw AAC either.
  assert.equal(contentMatchesDeclaredType(bmff("isom"), "audio/aac"), false);
  assert.equal(contentMatchesDeclaredType(jpeg(), "video/mp4"), false);
});

test("every ISO-BMFF flavour passes every other ISO-BMFF flavour", () => {
  // The `ftyp` brand does not reliably say audio vs video, so once the
  // container matches, the declared type decides. Rejecting here used to
  // block legitimate H.264 video whose brand is `mp42`/`avc1`/`dash`.
  for (const bytes of [bmff("mp42"), bmff("isom"), bmff("M4A "), bmff("qt  ")]) {
    for (const declared of ["audio/mp4", "video/mp4", "video/quicktime"]) {
      assert.equal(
        contentMatchesDeclaredType(bytes, declared),
        true,
        `${declared} should accept an ISO-BMFF container`,
      );
    }
  }
});

/* ------------------------------------------------------------------ */
/* login throttle                                                      */
/* ------------------------------------------------------------------ */

test("allows the budget, then blocks and keeps blocking", async () => {
  const key = "throttle-budget";
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    const result = await consumeAdminAttempt(key);
    assert.equal(result.allowed, true, `attempt ${attempt} should pass`);
    assert.equal(result.remaining, 8 - attempt);
  }

  const blocked = await consumeAdminAttempt(key);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterSeconds, 900);

  // Every later attempt stays blocked and must not extend the lockout.
  const again = await consumeAdminAttempt(key);
  assert.equal(again.allowed, false);
  assert.equal(again.retryAfterSeconds, 900);
});

test("a successful login clears the counter instead of punishing the admin", async () => {
  const key = "throttle-reset";
  for (let attempt = 0; attempt < 6; attempt += 1) await consumeAdminAttempt(key);
  await clearAdminAttempts(key);

  const result = await consumeAdminAttempt(key);
  assert.equal(result.allowed, true);
  assert.equal(result.remaining, 7);
});

test("throttles are tracked per key, not globally", async () => {
  const noisy = "throttle-noisy";
  const quiet = "throttle-quiet";
  for (let attempt = 0; attempt < 9; attempt += 1) await consumeAdminAttempt(noisy);

  assert.equal((await consumeAdminAttempt(noisy)).allowed, false);
  assert.equal((await consumeAdminAttempt(quiet)).allowed, true);
});

test("throttling still works on the in-process store (dev, single-process host)", async () => {
  // The store is resolved once at import time. With no UPSTASH_* env vars that
  // is the in-memory Map, which is what `npm run dev` and a single-process
  // self-host depend on; the shared Redis path is the multi-instance one.
  const result = await consumeAdminAttempt("throttle-fallback");
  assert.equal(result.allowed, true);
  assert.ok(result.remaining >= 0 && result.remaining < 8);
  await clearAdminAttempts("throttle-fallback");
});

/* ------------------------------------------------------------------ */
/* cross-origin writes                                                 */
/* ------------------------------------------------------------------ */

const headers = (map: Record<string, string>) => (name: string) => map[name.toLowerCase()] ?? null;

test("allows a same-origin write", () => {
  assert.doesNotThrow(() =>
    assertServerFnSameOrigin(headers({ origin: "https://hirmandrealestate.ir", host: "hirmandrealestate.ir" })),
  );
});

test("honours the forwarded host a reverse proxy sets", () => {
  assert.doesNotThrow(() =>
    assertServerFnSameOrigin(
      headers({
        origin: "https://www.hirmandrealestate.ir",
        "x-forwarded-host": "www.hirmandrealestate.ir",
        host: "internal.upstream.local",
      }),
    ),
  );
});

test("refuses a cross-origin write", () => {
  assert.throws(
    () => assertServerFnSameOrigin(headers({ origin: "https://evil.example", host: "hirmandrealestate.ir" })),
    /مبدأ دیگری/,
  );
});

test("refuses a sibling subdomain, which the cookie would still ride along on", () => {
  assert.throws(
    () => assertServerFnSameOrigin(headers({ origin: "https://staging.hirmandrealestate.ir", host: "www.hirmandrealestate.ir" })),
    /مبدأ دیگری/,
  );
});

test("refuses an unparseable origin instead of passing it through", () => {
  assert.throws(
    () => assertServerFnSameOrigin(headers({ origin: "not-a-url", host: "hirmandrealestate.ir" })),
    /مبدأ درخواست معتبر نیست/,
  );
});

test("a request without an Origin header is left to the session cookie", () => {
  // Non-browser clients (curl, server-to-server) never send Origin; rejecting
  // them would break legitimate admin automation. The cookie check still applies.
  assert.doesNotThrow(() => assertServerFnSameOrigin(headers({ host: "hirmandrealestate.ir" })));
});
