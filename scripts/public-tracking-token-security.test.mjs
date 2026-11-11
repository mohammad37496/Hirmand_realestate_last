import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [publicTracking, ownerStatus, partnerLookup, customerChatGet, customerChatPost, submissions, publicActions, adminCustomerChat, mediaProxy, mediaById, mediaAccess, leadsRoute, partnerSession, rateLimit, tokenServer] = await Promise.all([
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
  read("src/lib/admin-rate-limit.server.ts"),
  read("src/lib/tracking-token.server.ts"),
]);
const customerChatSend = await read("src/lib/customer-chat-send.ts");

function assertThrottleBefore(route, validationOrLookup) {
  const throttle = route.indexOf("consumeAdminAttempt(");
  const next = route.indexOf(validationOrLookup);
  assert.ok(throttle >= 0, "route must consume a rate-limit attempt");
  assert.ok(next > throttle, "rate limit must run before code validation or lookup");
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
  assert.match(customerChatGet, /public_tracking_token/);
  assert.match(customerChatPost, /assertSameOrigin\(event\)/);
  assert.match(customerChatPost, /setResponseHeader\(event,\s*["']cache-control["'],\s*["']no-store["']\)/);
  assertThrottleBefore(customerChatPost, "schema.safeParse(");
  assert.match(customerChatSend, /public_tracking_token/);
});

test("other public token operations retain their existing pre-validation throttles", () => {
  assertThrottleBefore(submissions, "readBody(event)");
  assert.match(submissions, /assertSameOrigin\(event\)/);
  assertThrottleBefore(publicActions, "dbSource === \"unconfigured\"");
  assert.match(publicActions, /assertSameOrigin\(event\)/);
});

test("private customer-submission and property-upload media checks are rate limited before token validation", () => {
  assertThrottleBefore(mediaProxy, "isPublishedPropertyMedia(");
  assertThrottleBefore(mediaById, "isPublishedPropertyMedia(");
  assert.match(mediaProxy, /customerSubmissionMedia \|\| propertyUploadMedia/);
  assert.match(mediaById, /visibility === "customer-submission" \|\| visibility === "property-upload"/);
  assert.match(mediaProxy, /consumeAdminAttempt\("private-property-media:"[^\n]*, 120\)/);
  assert.match(mediaById, /consumeAdminAttempt\("private-property-media:"[^\n]*, 120\)/);
});

test("all public-token consumers share the legacy-compatible validator and 128-bit generators", () => {
  for (const route of [publicTracking, ownerStatus, customerChatGet, customerChatPost, submissions, publicActions, adminCustomerChat]) {
    assert.match(route, /isValidPublicTrackingToken/);
  }
  assert.match(adminCustomerChat, /public_tracking_token/);
  assert.match(mediaAccess, /isValidPublicTrackingToken/);
  assert.match(leadsRoute, /generatePublicTrackingToken\(\)/);
  assert.match(submissions, /generatePublicTrackingToken\(\)/);
  assert.match(partnerSession, /generatePartnerTrackingCode\(\)/);
});

test("rate limiting uses atomic Redis EVAL and synchronous in-memory bucket consumption", () => {
  assert.match(rateLimit, /redisCommand<Array<number \| string>>\(\s*"EVAL"/);
  assert.match(rateLimit, /redis\.call\('SET'/);
  assert.match(rateLimit, /consume\(key, input\)/);
  assert.match(rateLimit, /read\/modify\/write happens synchronously/);
  assert.match(rateLimit, /forwarded\?\.at\(-1\)/);
  assert.match(rateLimit, /createHash\("sha256"\)/);
  assert.doesNotMatch(rateLimit, /x-real-ip/i);
  assert.match(rateLimit, /resolveClientIp\(getHeader\(event, "x-forwarded-for"\), getRequestIP\(event\)\)/);
  assert.match(rateLimit, /process\.env\.NODE_ENV === "production"[\s\S]*?statusCode:\s*503/);
});

test("legacy duplicate leads receive the actual atomically stored public tracking token", () => {
  assert.match(tokenServer, /public_tracking_token=case when public_tracking_token ~\* '\^HIR-/);
  assert.match(tokenServer, /returning public_tracking_token as/);
  assert.equal((leadsRoute.match(/ensurePublicTrackingToken\(sql/g) ?? []).length, 2);
  assert.doesNotMatch(leadsRoute, /update leads set public_tracking_token=\$2 where id=\$1/);
});
