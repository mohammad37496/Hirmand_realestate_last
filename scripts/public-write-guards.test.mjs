import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const leadsRoute = await readFile(
  new URL("../server/routes/api/leads.post.ts", import.meta.url),
  "utf8",
);
const reportsRoute = await readFile(
  new URL("../server/routes/api/property-reports.post.ts", import.meta.url),
  "utf8",
);
const shortlistRoute = await readFile(
  new URL("../server/routes/api/shared-shortlist.post.ts", import.meta.url),
  "utf8",
);
const publicLeadActionsRoute = await readFile(
  new URL("../server/routes/api/public-lead-actions.post.ts", import.meta.url),
  "utf8",
);
const customerPropertySubmissionsRoute = await readFile(
  new URL("../server/routes/api/customer-property-submissions.post.ts", import.meta.url),
  "utf8",
);
const dbModule = await readFile(new URL("../src/lib/db.ts", import.meta.url), "utf8");

test("public lead intake checks origin and applies a rate limit before parsing or writing", () => {
  assert.match(leadsRoute, /assertSameOrigin\(event\)/);
  assert.match(leadsRoute, /consumeAdminAttempt\(["']public-lead:["']\s*\+\s*clientFingerprint\(event\)\)/);

  const throttleIndex = leadsRoute.indexOf('consumeAdminAttempt("public-lead:"');
  const bodyParseIndex = leadsRoute.indexOf("schema.safeParse(await readBody(event))");
  assert.ok(throttleIndex >= 0 && bodyParseIndex > throttleIndex);
});

test("public property reports check origin and apply a rate limit before database writes", () => {
  const originIndex = reportsRoute.indexOf("assertSameOrigin(event);");
  const bodyReadIndex = reportsRoute.indexOf("readBody(event)");
  const publicBranchIndex = reportsRoute.indexOf("if (!wantsAdmin)");
  const throttleIndex = reportsRoute.indexOf('consumeAdminAttempt("property-report:"');
  const payloadParseIndex = reportsRoute.indexOf("publicSchema.safeParse(body)");
  assert.ok(originIndex >= 0 && bodyReadIndex > originIndex);
  assert.ok(publicBranchIndex > bodyReadIndex && throttleIndex > publicBranchIndex);
  assert.ok(payloadParseIndex > throttleIndex);
});

test("shared-shortlist creation checks origin and rate-limits writes before database access", () => {
  assert.ok(shortlistRoute.includes("assertSameOrigin(event)"));
  assert.ok(shortlistRoute.includes('consumeAdminAttempt("shared-shortlist:" + clientFingerprint(event))'));
  const throttleIndex = shortlistRoute.indexOf('consumeAdminAttempt("shared-shortlist:"');
  const parseIndex = shortlistRoute.indexOf("schema.safeParse(await readBody(event))");
  assert.ok(throttleIndex >= 0 && parseIndex > throttleIndex);
});

test("public lead actions check origin and rate-limit capability-token operations", () => {
  assert.ok(publicLeadActionsRoute.includes("assertSameOrigin(event)"));
  assert.ok(publicLeadActionsRoute.includes('consumeAdminAttempt("public-lead-action:" + clientFingerprint(event))'));
  const throttleIndex = publicLeadActionsRoute.indexOf('consumeAdminAttempt("public-lead-action:"');
  const databaseCheckIndex = publicLeadActionsRoute.indexOf('dbSource === "unconfigured"');
  assert.ok(throttleIndex >= 0 && databaseCheckIndex > throttleIndex);
});

test("customer property resubmission uses a rejected-state and updated-at compare-and-swap", () => {
  assert.match(customerPropertySubmissionsRoute, /resubmitCustomerPropertySubmission\(sql,/);
  assert.match(customerPropertySubmissionsRoute, /updated_at from customer_property_submissions/);
  assert.match(customerPropertySubmissionsRoute, /if \(!resubmitted\)[\s\S]*?statusCode:\s*409/);
  assert.doesNotMatch(customerPropertySubmissionsRoute, /update customer_property_submissions[^\n]*where id=\$1"/);
});

test("property visit availability check and lead insert share a row-locked database transaction", () => {
  assert.match(leadsRoute, /createPropertyVisitRequest\(sql,/);
  assert.doesNotMatch(leadsRoute, /select id from leads where property_id::text=\$1 and visit_status/);
  assert.match(dbModule, /const transaction: NonNullable<Sql\["transaction"\]> = async/);
  assert.match(dbModule, /await client\.query\("BEGIN"\)/);
  assert.match(dbModule, /await client\.query\("COMMIT"\)/);
  assert.match(dbModule, /await client\.query\("ROLLBACK"\)/);
  assert.match(dbModule, /pg\.transaction\(async \(tx\)/);
});
