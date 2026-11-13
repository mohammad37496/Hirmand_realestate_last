/**
 * Regression tests for the admin hardening work.
 *
 * Two of the three new server modules are pure decision functions — the magic
 * byte sniffer and the origin matcher — so the security claims they make can
 * be asserted directly instead of inferred from a passing build. The rate
 * limiter is stateful but keyed, so each test uses its own key.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  clearAdminAttempts,
  clientFingerprint,
  consumeAdminAttempt,
  assertServerFnSameOrigin,
} from "./admin-rate-limit.server.ts";
import { contentMatchesDeclaredType, sniffMediaBytes } from "./file-signature.server.ts";
import { canApproveCustomerPropertySubmission, canManageTeam, hasAdminPermission, normalizeAdminRole } from "./admin-roles.ts";
import { mergePublicConsultantDirectory } from "./consultant-directory.ts";

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
  assert.equal(hasAdminPermission(role, "deal.manage"), false);
  assert.equal(hasAdminPermission(role, "commission.manage"), false);
});

test("report-only roles cannot read deal or commission financial details", () => {
  for (const roleName of ["viewer", "content"] as const) {
    const role = normalizeAdminRole(roleName);
    assert.equal(hasAdminPermission(role, "reports.view"), true);
    assert.equal(hasAdminPermission(role, "deal.manage"), false);
    assert.equal(hasAdminPermission(role, "commission.manage"), false);
  }
  const sales = normalizeAdminRole("sales");
  assert.equal(hasAdminPermission(sales, "reports.view"), true);
  assert.equal(hasAdminPermission(sales, "deal.manage"), true);
  assert.equal(hasAdminPermission(sales, "commission.manage"), true);
});

test("customer-submission approval requires both property management and publish permissions", () => {
  assert.equal(canApproveCustomerPropertySubmission(normalizeAdminRole("owner")), true);
  assert.equal(canApproveCustomerPropertySubmission(normalizeAdminRole("manager")), true);
  assert.equal(hasAdminPermission(normalizeAdminRole("sales"), "property.manage"), true);
  assert.equal(hasAdminPermission(normalizeAdminRole("sales"), "property.publish"), false);
  assert.equal(canApproveCustomerPropertySubmission(normalizeAdminRole("sales")), false);
  assert.equal(canApproveCustomerPropertySubmission(normalizeAdminRole("content")), false);
  assert.equal(canApproveCustomerPropertySubmission(normalizeAdminRole("staff")), false);
  assert.equal(canApproveCustomerPropertySubmission(normalizeAdminRole("viewer")), false);
});

test("consultant management is restricted to owner and manager roles", () => {
  assert.equal(canManageTeam(normalizeAdminRole("owner")), true);
  assert.equal(canManageTeam(normalizeAdminRole("manager")), true);
  for (const role of ["sales", "content", "staff", "viewer"] as const) {
    assert.equal(canManageTeam(normalizeAdminRole(role)), false, `${role} must not manage consultant profiles`);
  }
  assert.equal(canManageTeam(normalizeAdminRole("admin")), true);
});

test("an explicitly inactive consultant is not restored by the bundled directory fallback", () => {
  const bundled = [
    { id: "sheikh", isActive: true, name: "مدیر اول" },
    { id: "moradi", isActive: true, name: "مدیر دوم" },
  ];
  const database = [
    { id: "sheikh", isActive: false, name: "مدیر اول غیرفعال" },
    { id: "other", isActive: true, name: "مشاور دیگر" },
  ];
  assert.deepEqual(mergePublicConsultantDirectory(database, bundled).map((item) => item.id), ["other", "moradi"]);
  assert.deepEqual(mergePublicConsultantDirectory(bundled.map((item) => ({ ...item, isActive: false })), bundled), []);
});

test("missing consultant rows receive a bundled fallback but inactive rows do not", () => {
  const bundled = [
    { id: "sheikh", isActive: true, name: "مدیر اول" },
    { id: "moradi", isActive: true, name: "مدیر دوم" },
  ];
  const database = [{ id: "SHEIKH", isActive: false, name: "مدیر اول سفارشی" }];
  assert.deepEqual(mergePublicConsultantDirectory(database, bundled).map((item) => item.id), ["moradi"]);
  assert.deepEqual(mergePublicConsultantDirectory([], bundled), bundled);
});

test("consultant server functions enforce team.manage and keep inactive rows for fallback decisions", () => {
  const source = readFileSync(new URL("./consultants.ts", import.meta.url), "utf8");
  const guardStart = source.indexOf("async function requireAdmin()");
  const guardEnd = source.indexOf("const selectColumns", guardStart);
  const guard = source.slice(guardStart, guardEnd);
  assert.match(guard, /getAdminSessionClaims\(session\)/);
  assert.match(guard, /assertAdminServerFnOrigin\(\)/);
  assert.match(guard, /hasAdminPermission\(claims\.role,\s*"team\.manage"\)/);
  for (const operation of ["listAdminConsultants", "saveConsultant", "deleteConsultant"]) {
    const start = source.indexOf(`export const ${operation}`);
    const next = source.indexOf("export const ", start + 1);
    assert.match(source.slice(start, next === -1 ? undefined : next), /await requireAdmin\(\)/);
  }
  const publicListStart = source.indexOf("export const listConsultants");
  const publicListEnd = source.indexOf("const consultantInput", publicListStart);
  const publicList = source.slice(publicListStart, publicListEnd);
  assert.match(publicList, /from consultants\s+order by sort_order asc, name asc/);
  assert.doesNotMatch(publicList, /where\s+is_active\s*=\s*true/i);
  assert.match(publicList, /mergePublicConsultantDirectory\(databaseConsultants, staticConsultants\(\)\)/);
});

test("core consultant deletion is blocked on the server, not only in the admin UI", () => {
  const source = readFileSync(new URL("./consultants.ts", import.meta.url), "utf8");
  const start = source.indexOf("export const deleteConsultant");
  assert.match(source.slice(start), /data\.id === "sheikh" \|\| data\.id === "moradi"/);
  const adminUi = readFileSync(new URL("../components/hirmand/_admin_impl.tsx", import.meta.url), "utf8");
  assert.match(adminUi, /if \(hasAdminPermission\(adminRole, "team\.manage"\)\) return permittedItems/);
  assert.match(adminUi, /item\.view !== "phoneBridge" \|\| hasAdminPermission\(adminRole, "security\.manage"\)/);
});

test("sensitive admin server functions enforce their matching permission on the server", () => {
  const protectedModules = [
    {
      file: "./seo-redirects.ts",
      permission: "team.manage",
      operations: [
        "listAdminRedirects",
        "upsertAdminRedirect",
        "deleteAdminRedirect",
        "listAdmin404Logs",
        "clearAdmin404Logs",
      ],
    },
    {
      file: "./admin-audit.ts",
      permission: "team.manage",
      operations: ["listAdminAuditLog", "clearAdminAuditLog"],
    },
    {
      file: "./attendance.ts",
      permission: "team.manage",
      operations: ["listAttendance", "saveAttendance", "deleteAttendance"],
    },
    {
      file: "./admin-media-health.ts",
      permission: "content.manage",
      operations: ["getAdminMediaHealth", "cleanupAdminMedia"],
    },
  ] as const;

  for (const { file, permission, operations } of protectedModules) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    const guard = source.match(/async function requireAdmin\(\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
    assert.match(guard, /getAdminSessionClaims\(/, `${file} must resolve the current role from the admin session`);
    assert.match(guard, /assertAdminServerFnOrigin\(\)/, `${file} must keep the same-origin guard`);
    assert.match(
      guard,
      new RegExp(`hasAdminPermission\\(claims\\.role,\\s*"${permission.replace(".", "\\.")}"\\)`),
      `${file} must require ${permission}`,
    );

    for (const operation of operations) {
      const start = source.indexOf(`export const ${operation}`);
      const next = source.indexOf("export const ", start + 1);
      assert.notEqual(start, -1, `${file} must export ${operation}`);
      assert.match(
        source.slice(start, next === -1 ? undefined : next),
        /await requireAdmin\(\)/,
        `${operation} must enforce its role guard before accessing data`,
      );
    }
  }

  assert.equal(hasAdminPermission(normalizeAdminRole("owner"), "team.manage"), true);
  assert.equal(hasAdminPermission(normalizeAdminRole("manager"), "team.manage"), true);
  for (const role of ["sales", "content", "staff", "viewer"] as const) {
    assert.equal(hasAdminPermission(normalizeAdminRole(role), "team.manage"), false, `${role} must be denied`);
  }
  for (const role of ["owner", "manager", "content"] as const) {
    assert.equal(hasAdminPermission(normalizeAdminRole(role), "content.manage"), true, `${role} may manage media`);
  }
  for (const role of ["sales", "staff", "viewer"] as const) {
    assert.equal(hasAdminPermission(normalizeAdminRole(role), "content.manage"), false, `${role} must be denied media access`);
  }
});

test("admin notification server functions require lead.manage before reading or changing CRM notifications", () => {
  const source = readFileSync(new URL("./admin-notifications.ts", import.meta.url), "utf8");
  const guard = source.match(/async function requireAdmin\(\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.equal([...guard.matchAll(/getAdminSessionClaims\(token\)/g)].length, 1, "session claims must be resolved exactly once");
  assert.doesNotMatch(guard, /verifyAdminSessionToken\(/, "do not verify the same session through a second claims lookup");
  assert.doesNotMatch(source, /verifyAdminSessionToken/);
  assert.match(guard, /if \(!claims\) throw new Error\("نشست مدیریت معتبر نیست\."\)/);
  assert.match(guard, /assertAdminServerFnOrigin\(\)/);
  assert.match(guard, /hasAdminPermission\(normalizeAdminRole\(claims\.role\),\s*"lead\.manage"\)/);
  assert.ok(guard.indexOf("getAdminSessionClaims(token)") < guard.indexOf("assertAdminServerFnOrigin()"));
  assert.ok(guard.indexOf("assertAdminServerFnOrigin()") < guard.indexOf('"lead.manage"'));

  for (const operation of ["listAdminNotifications", "markAdminNotificationRead", "markAllAdminNotificationsRead"]) {
    const start = source.indexOf(`export const ${operation}`);
    const next = source.indexOf("export const ", start + 1);
    assert.notEqual(start, -1, `${operation} must be exported`);
    const handler = source.slice(start, next === -1 ? undefined : next);
    const adminGuardIndex = handler.indexOf("await requireAdmin()");
    assert.notEqual(adminGuardIndex, -1, `${operation} must enforce CRM permission`);
    for (const protectedOperation of ["getSql()", "syncCandidates(sql)"]) {
      const protectedIndex = handler.indexOf(protectedOperation);
      if (protectedIndex !== -1) {
        assert.ok(
          adminGuardIndex < protectedIndex,
          `${operation} must enforce CRM permission before ${protectedOperation}`,
        );
      }
    }
    for (const update of handler.matchAll(/sql\.query\(\s*["'`]update\b/gi)) {
      assert.ok(
        adminGuardIndex < (update.index ?? Number.POSITIVE_INFINITY),
        `${operation} must enforce CRM permission before every UPDATE`,
      );
    }
    assert.ok(
      adminGuardIndex < handler.indexOf("getSql()"),
      `${operation} must enforce CRM permission before database access`,
    );
  }

  for (const role of ["content", "viewer"] as const) {
    assert.equal(hasAdminPermission(normalizeAdminRole(role), "lead.manage"), false, `${role} must be denied CRM notifications`);
  }
  for (const role of ["owner", "manager", "sales", "staff"] as const) {
    assert.equal(hasAdminPermission(normalizeAdminRole(role), "lead.manage"), true, `${role} may manage CRM notifications`);
  }
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

test("rate-limit identity uses Liara's rightmost trusted client IP, not spoofed XFF prefixes or user agents", async () => {
  const request = (userAgent: string, ip = "10.0.0.4", forwardedIp = "198.51.100.99, 203.0.113.10") => ({
    req: Object.assign(new Request("https://hirmandrealestate.ir/api/admin/session", {
      headers: { "x-forwarded-for": forwardedIp, "user-agent": userAgent },
    }), { context: { clientAddress: ip } }),
  }) as unknown as import("h3").H3Event;

  const firstKey = "user-agent-rotation:" + clientFingerprint(request("Browser A"));
  const rotatedKey = "user-agent-rotation:" + clientFingerprint(request("curl/9.0", "10.0.0.4", "192.0.2.44, 203.0.113.10"));
  assert.equal(firstKey, rotatedKey, "same trusted client IP must retain one bucket across caller-controlled prefix and user-agent changes");
  assert.notEqual(
    clientFingerprint(request("Browser A", "10.0.0.4", "198.51.100.99, 203.0.113.11")),
    clientFingerprint(request("Browser A", "10.0.0.4", "198.51.100.99, 203.0.113.10")),
    "different rightmost client IPs retain separate buckets",
  );

  for (let attempt = 0; attempt < 8; attempt += 1) {
    assert.equal((await consumeAdminAttempt(firstKey)).allowed, true);
  }
  assert.equal((await consumeAdminAttempt(rotatedKey)).allowed, false);
  await clearAdminAttempts(firstKey);
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
