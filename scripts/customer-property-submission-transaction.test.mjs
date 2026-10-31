import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const read = (path) => readFileSync(resolve(process.cwd(), path), "utf8");

test("customer property submissions commit every related write atomically", () => {
  const route = read("server/routes/api/customer-property-submissions.post.ts");
  assert.equal((route.match(/withSqlTransaction\(async \(tx\)/g) || []).length, 2);
  assert.match(route, /resubmitCustomerPropertySubmission\(tx,/);
  assert.equal((route.match(/pg_advisory_xact_lock\(hashtext\(\$1\)::bigint\)/g) || []).length, 2);
  assert.match(route, /phone:/);
  assert.match(route, /property:\$\{parsed\.data\.neighborhood\}/);
  assert.match(route, /const existing = await tx\.query/);
  assert.match(route, /insert into customer_property_submissions/);
  assert.match(route, /insert into lead_activities/);
  assert.match(route, /insert into customer_property_submission_events/);
  assert.doesNotMatch(route, /\.catch\(\(\)\s*=>\s*\{\}\)/);
  assert.doesNotMatch(route, /delete from leads where id=\$1/);
});

test("public customer chat and lead tracking reads and writes are rate limited", () => {
  const chatGet = read("server/routes/api/customer-chat.get.ts");
  const chatPost = read("server/routes/api/customer-chat.post.ts");
  const trackingGet = read("server/routes/api/public-lead-tracking.get.ts");
  assert.match(chatGet, /setResponseHeader\(event, "cache-control", "no-store"\)/);
  assert.match(chatGet, /consumeAdminAttempt\("customer-chat-read:" \+ clientFingerprint\(event\), 60\)/);
  assert.match(chatGet, /replace\(\/\\s\+\/g, ""\)/);
  assert.match(chatPost, /assertSameOrigin\(event\)/);
  assert.match(chatPost, /consumeAdminAttempt\("customer-chat-send:" \+ clientFingerprint\(event\), 8\)/);
  assert.match(trackingGet, /setResponseHeader\(event, "cache-control", "no-store"\)/);
  assert.match(trackingGet, /consumeAdminAttempt\("public-lead-tracking:" \+ clientFingerprint\(event\), 30\)/);
});