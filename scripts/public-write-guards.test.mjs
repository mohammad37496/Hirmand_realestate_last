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
const propertyWatchTargetRoute = await readFile(new URL("../server/routes/api/property-watch-target.post.ts", import.meta.url), "utf8");
const propertyWatchRoute = await readFile(new URL("../server/routes/api/property-watch.post.ts", import.meta.url), "utf8");
const propertyOpenHouseRoute = await readFile(new URL("../server/routes/api/property-open-house.post.ts", import.meta.url), "utf8");
const propertyOpenHouseRsvp = await readFile(new URL("../src/lib/property-open-house-rsvp.ts", import.meta.url), "utf8");
const propertyOpenHouseCreate = await readFile(new URL("../src/lib/property-open-house-create.ts", import.meta.url), "utf8");
const propertyVisitRequest = await readFile(new URL("../src/lib/property-visit-request.ts", import.meta.url), "utf8");
const propertyQuestionsRoute = await readFile(new URL("../server/routes/api/property-questions.post.ts", import.meta.url), "utf8");
const notificationsRoute = await readFile(new URL("../src/routes/notifications.tsx", import.meta.url), "utf8");

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

test("every public lead branch uses the canonical property visibility predicate", () => {
  assert.match(leadsRoute, /import \{ publicPropertyVisibilitySql \} from "@\/lib\/public-property-visibility"/);
  assert.equal((leadsRoute.match(/\$\{publicPropertyVisibilitySql\(\)\}/g) ?? []).length, 5);
  assert.doesNotMatch(leadsRoute, /from properties where id::text=\$1 and status='published'/);
  assert.match(propertyVisitRequest, /\$\{publicPropertyVisibilitySql\(\)\}/);
  assert.doesNotMatch(propertyVisitRequest, /where id::text=\$1 and status='published'/);
});

test("public visit rescheduling checks conflicts and updates under the same property row lock", () => {
  assert.match(publicLeadActionsRoute, /reschedulePropertyVisitRequest\(sql,/);
  assert.doesNotMatch(publicLeadActionsRoute, /select id from leads where property_id is not null[\s\S]*?update leads set visit_preferred_at/);
  assert.match(publicLeadActionsRoute, /rescheduleResult\.kind === "conflict"/);
});

test("public property interactions share the canonical publication and unpublish visibility predicate", () => {
  assert.match(propertyWatchTargetRoute, /publicPropertyVisibilitySql\(\)/);
  assert.match(propertyWatchTargetRoute, /parsed\.data\.action === "set"/);
  assert.match(propertyWatchRoute, /publicPropertyVisibilitySql\("p"\)/);
  assert.equal((propertyOpenHouseRoute.match(/publicPropertyVisibilitySql\(\)/g) ?? []).length, 1);
  assert.match(propertyOpenHouseRsvp, /publicPropertyVisibilitySql\(\)/);
  assert.match(propertyQuestionsRoute, /publicPropertyVisibilitySql\(\)/);
  assert.match(reportsRoute, /publicPropertyVisibilitySql\(\)/);
});

test("open-house RSVP and cancellation use one event-row-locked transaction helper", () => {
  assert.match(propertyOpenHouseRoute, /createPropertyOpenHouseRsvp\(sql,/);
  assert.match(propertyOpenHouseRoute, /cancelPropertyOpenHouse\(sql,/);
  assert.doesNotMatch(propertyOpenHouseRoute, /select id,property_id,capacity,starts_at,status from property_open_houses where id=\$1 limit 1/);
  assert.doesNotMatch(propertyOpenHouseRoute, /update property_open_houses set status='cancelled'/);
  assert.match(propertyOpenHouseRoute, /createPropertyOpenHouseRsvp\(sql,[\s\S]*?result\.kind === "capacity"/);
});

test("admin open-house creation checks visibility, overlap and insertion under one property-row lock", () => {
  assert.match(propertyOpenHouseRoute, /createPropertyOpenHouseEvent\(sql,/);
  assert.doesNotMatch(propertyOpenHouseRoute, /select id from property_open_houses where property_id=\$1 and status='scheduled'/);
  assert.match(propertyOpenHouseCreate, /sql\.transaction\(async \(transactionSql\)/);
  assert.match(propertyOpenHouseCreate, /from properties where id=\$1 and \$\{publicPropertyVisibilitySql\(\)\} limit 1 for update/);
  assert.match(propertyOpenHouseCreate, /select id from property_open_houses where property_id=\$1 and status='scheduled'/);
  assert.match(propertyOpenHouseCreate, /insert into property_open_houses/);
});

test("hidden property watch subscriptions remain removable without exposing hidden property details", () => {
  assert.match(propertyWatchRoute, /if \(parsed\.data\.action === "unsubscribe"\)[\s\S]*?where visitor_id=\$1 and property_slug=\$2/);
  assert.match(propertyWatchRoute, /if \(parsed\.data\.action === "subscribe"\)[\s\S]*?publicPropertyVisibilitySql\(\)/);
  assert.match(propertyWatchRoute, /hiddenSubscriptions/);
  assert.match(propertyWatchRoute, /isPublic:\s*false/);
  assert.match(notificationsRoute, /subscription\.isPublic \? subscription\.title/);
  assert.match(notificationsRoute, /action:\s*"unsubscribe"/);
});
