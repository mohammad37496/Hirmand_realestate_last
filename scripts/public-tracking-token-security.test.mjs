import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [publicTracking, ownerStatus, partnerLookup, customerChatGet, customerChatPost, submissions, publicActions, adminCustomerChat, mediaProxy, mediaById, mediaAccess, leadsRoute, partnerSession, partnerSessionRoute, rateLimit, tokenServer] = await Promise.all([
  read("server/routes/api/public-lead-tracking.get.ts"),
  read("server/routes/api/owner-property-status.post.ts"),
  read("server/routes/api/partner/lookup.post.ts"),
  read("server/routes/api/customer-chat.get.ts"),
  read("server/routes/api/customer-chat.post.ts"),
  read("server/routes/api/customer-property-submissions.post.ts"),
  read("server/routes/api/public-lead-actions.post.ts"),
  read("server/routes/api/admin-customer-chat.post.ts"),
  read("server/routes/api/media-proxy.get.ts"),
  read("server/routes/api/media/[id].get.ts"),
  read("src/lib/liara-media-access.server.ts"),
  read("server/routes/api/leads.post.ts"),
  read("src/lib/partner-session.server.ts"),
  read("server/routes/api/partner/session.post.ts"),
  read("src/lib/admin-rate-limit.server.ts"),
  read("src/lib/tracking-token.server.ts"),
]);
const customerChatSend = await read("src/lib/customer-chat-send.ts");
const publicLeadTracking = await read("src/lib/public-lead-tracking.ts");

function assertThrottleBefore(route, validationOrLookup) {
  const throttle = route.indexOf("consumeAdminAttempt(");
  const next = route.indexOf(validationOrLookup);
  assert.ok(throttle >= 0, "route must consume a rate-limit attempt");
  assert.ok(next > throttle, "rate limit must run before code validation or lookup");
}

function assertPublicationBeforeThrottle(route) {
  const publication = route.indexOf("isPublishedPropertyMedia(");
  const throttle = route.indexOf("consumeAdminAttempt(");
  assert.ok(publication >= 0, "media route must check for a published property reference");
  assert.ok(throttle > publication, "published media must be confirmed before private-media rate limiting");
}

test("public lead tracking lookup is rate limited before validating the token", () => {
  assertThrottleBefore(publicTracking, "isValidPublicTrackingToken(code)");
});

test("owner status lookup preserves same-origin and pre-validation rate limiting", () => {
  assert.match(ownerStatus, /assertSameOrigin\(event\)/);
  assertThrottleBefore(ownerStatus, "schema.safeParse(body)");
  assert.match(ownerStatus, /dbSource==="unconfigured"\)throw createError\(\{statusCode:503/);
  assert.doesNotMatch(ownerStatus, /return \{success:false,statusMessage:/);
});

test("partner lookup checks same-origin and rate limits before reading and validating a code", () => {
  assert.match(partnerLookup, /assertSameOrigin\(event\)/);
  assertThrottleBefore(partnerLookup, "readBody(event)");
  assert.match(partnerLookup, /tooManyAttemptsError\(attempt.retryAfterSeconds\)/);
  assert.match(partnerLookup, /code\.length > TRACKING_TOKEN_MAX_LENGTH/);
  assert.match(partnerLookup, /dbSource === "unconfigured"[\s\S]*?statusCode:\s*503/);
  assert.ok(partnerLookup.indexOf('dbSource === "unconfigured"') < partnerLookup.indexOf("lookupPartnerContract(code)"));
});

test("customer chat lookups and sends are rate limited before token validation", () => {
  assertThrottleBefore(customerChatGet, "codeSchema.safeParse(rawCode)");
  assert.match(customerChatGet, /sharePublicLeadTrackingTarget/);
  assert.match(publicLeadTracking, /where public_tracking_token = upper\(\$1\)/);
  assert.match(customerChatPost, /assertSameOrigin\(event\)/);
  assert.match(customerChatPost, /setResponseHeader\(event,\s*["']cache-control["'],\s*["']no-store["']\)/);
  assertThrottleBefore(customerChatPost, "schema.safeParse(");
  assert.match(customerChatSend, /lockPublicLeadTrackingTarget/);
});

test("other public token operations retain their existing pre-validation throttles", () => {
  assertThrottleBefore(submissions, "readBody(event)");
  assert.match(submissions, /assertSameOrigin\(event\)/);
  assertThrottleBefore(publicActions, "dbSource === \"unconfigured\"");
  assert.match(publicActions, /assertSameOrigin\(event\)/);
});

test("published media is confirmed before throttling while private media capabilities remain rate limited", () => {
  assertPublicationBeforeThrottle(mediaProxy);
  assertPublicationBeforeThrottle(mediaById);
  assertThrottleBefore(mediaProxy, "hasRejectedCustomerSubmissionMedia(");
  assertThrottleBefore(mediaProxy, "hasCompletedCustomerUploadMedia(");
  assertThrottleBefore(mediaById, "hasRejectedCustomerSubmissionMedia(");
  assertThrottleBefore(mediaById, "hasCompletedCustomerUploadMedia(");
  assert.match(mediaProxy, /shouldRateLimitPrivateMediaRequest\(/);
  assert.match(mediaById, /shouldRateLimitPrivateMediaRequest\(/);
  assert.match(mediaProxy, /databaseMediaVisibility\(liaraKey\)/);
  assert.match(mediaById, /databaseMediaVisibility\(meta\.pathname\)/);
  assert.match(mediaProxy, /customerSubmissionMedia \|\| propertyUploadMedia/);
  assert.match(mediaById, /visibility === "customer-submission" \|\| visibility === "property-upload"/);
  assert.match(mediaProxy, /consumeAdminAttempt\("private-property-media:"[^\n]*, 120\)/);
  assert.match(mediaById, /consumeAdminAttempt\("private-property-media:"[^\n]*, 120\)/);
});

test("all public-token consumers share the legacy-compatible validator and 128-bit generators", () => {
  for (const route of [publicTracking, ownerStatus, customerChatGet, customerChatPost, submissions, publicActions, adminCustomerChat]) {
    assert.match(route, /isValidPublicTrackingToken/);
  }
  assert.match(adminCustomerChat, /lockPublicLeadTrackingTarget/);
  assert.match(mediaAccess, /isValidPublicTrackingToken/);
  assert.match(leadsRoute, /generatePublicTrackingToken\(\)/);
  assert.match(submissions, /generatePublicTrackingToken\(\)/);
  assert.match(partnerSession, /generatePartnerTrackingCode\(\)/);
});

test("partner PIN login is same-origin and rate limited before credential verification", () => {
  assert.match(partnerSessionRoute, /assertSameOrigin\(event\)/);
  assertThrottleBefore(partnerSessionRoute, "authenticatePartner(");
  assert.match(partnerSessionRoute, /clientFingerprint\(event\)/);
  assert.match(partnerSessionRoute, /tooManyAttemptsError\(attempt.retryAfterSeconds\)/);
  assert.match(partnerSessionRoute, /clearAdminAttempts\(loginRateKey\)/);
});

test("rate limiting uses atomic PostgreSQL row locks and development-only in-memory buckets", () => {
  assert.match(rateLimit, /consume_admin_rate_limit/);
  assert.match(rateLimit, /sql\.query/);
  assert.match(rateLimit, /dbSource !== "postgres"/);
  assert.match(rateLimit, /dbSource === "unconfigured" && process\.env\.NODE_ENV !== "production"/);
  assert.match(rateLimit, /memory\.set\(key, next\.bucket\)/);
  assert.doesNotMatch(rateLimit, /UPSTASH_REDIS_REST_URL|UPSTASH_REDIS_REST_TOKEN|redisCommand|REDIS_CONSUME_SCRIPT/);
  assert.match(rateLimit, /resolveClientIp\(getRequestIP\(event\), getHeader\(event, "x-forwarded-for"\)\)/);
  assert.match(rateLimit, /forwardedEntries\.at\(-1\)/);
  assert.match(rateLimit, /isIP\(trustedClientIp\)/);
  assert.doesNotMatch(rateLimit, /xForwardedFor\s*:\s*true/i);
  assert.doesNotMatch(rateLimit, /getHeader\\(event,\\s*" x-real-ip\\)/i);
  assert.match(rateLimit, /createHash\("sha256"\)/);
  assert.doesNotMatch(rateLimit, /x-real-ip/i);
  assert.match(rateLimit, /process\.env\.NODE_ENV === "production" && dbSource !== "postgres"/);
  assert.match(rateLimit, /statusCode:\s*503/);
});

test("legacy duplicate leads receive the actual atomically stored public tracking token", () => {
  assert.match(tokenServer, /public_tracking_token=case when public_tracking_token ~\* '\^HIR-/);
  assert.match(tokenServer, /returning public_tracking_token as/);
  assert.equal((leadsRoute.match(/ensurePublicTrackingToken\(sql/g) ?? []).length, 7);
  assert.doesNotMatch(leadsRoute, /update leads set public_tracking_token=\$2 where id=\$1/);
});
