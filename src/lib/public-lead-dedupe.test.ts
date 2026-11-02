import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { buildPendingSubmissionDuplicateQuery } from "./customer-property-submission-dedupe.ts";
import { buildPublicDuplicateResponse, buildRecentPublicLeadDuplicateQuery } from "./public-lead-dedupe.ts";

test("recent public lead duplicate lookup returns only an internal id and leaves the bearer token and lead unchanged", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table leads (
        id text primary key,
        phone text not null,
        merged_into_lead_id text,
        created_at timestamptz not null default current_timestamp,
        public_tracking_token text not null,
        name text not null,
        note text not null
      );
      insert into leads(id,phone,public_tracking_token,name,note) values
        ('recent','09130000000','HIR-26-AAAAAAAAAAAA','Original owner','Original request');
      insert into leads(id,phone,merged_into_lead_id,created_at,public_tracking_token,name,note) values
        ('merged','09130000000','canonical',current_timestamp,'HIR-26-BBBBBBBBBBBB','Merged','Do not return'),
        ('old','09130000000',null,current_timestamp - interval '20 minutes','HIR-26-CCCCCCCCCCCC','Old','Old request');
    `);

    const query = buildRecentPublicLeadDuplicateQuery("09130000000");
    const rows = await db.query(query.sql, query.params);
    assert.deepEqual(rows.rows, [{ id: "recent" }]);

    const before = await db.query("select id,public_tracking_token,name,note from leads where id='recent'");
    const response = buildPublicDuplicateResponse("درخواست مشابهی اخیراً دریافت شده است.");
    assert.deepEqual(response, {
      success: true,
      duplicate: true,
      message: "درخواست مشابهی اخیراً دریافت شده است.",
    });
    assert.equal("trackingToken" in response, false);
    const after = await db.query("select id,public_tracking_token,name,note from leads where id='recent'");
    assert.deepEqual(after.rows, before.rows, "a duplicate request must not mutate the existing lead or rotate its token");

    const tokenLookup = await db.query("select id from leads where public_tracking_token=$1", ["HIR-26-AAAAAAAAAAAA"]);
    assert.deepEqual(tokenLookup.rows, [{ id: "recent" }], "the original token remains valid for its legitimate holder");
  } finally {
    await db.close();
  }
});

test("lead route returns a token-free duplicate response before any existing-lead mutation", async () => {
  const route = await readFile(new URL("../../server/routes/api/leads.post.ts", import.meta.url), "utf8");
  assert.match(route, /buildRecentPublicLeadDuplicateQuery\(parsed\.data\.phone\)/);
  assert.match(route, /sql\.query<\{ id: string \}>\(duplicateQuery\.sql, duplicateQuery\.params\)/);
  const start = route.indexOf("if (existing[0] &&");
  const end = route.indexOf("\n  if (parsed.data.callbackPreferredAt)", start);
  assert.ok(start >= 0 && end > start, "the public duplicate branch must remain identifiable");
  const duplicateBranch = route.slice(start, end);
  assert.match(duplicateBranch, /return buildPublicDuplicateResponse\(/);
  assert.doesNotMatch(duplicateBranch, /public_tracking_token|trackingToken|UPDATE_EXISTING_BUDGET_LEAD_SQL|update leads|autoMatchLead/);
});

test("pending customer-property duplicate lookup never selects or returns the previous bearer token", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table customer_property_submissions (
        id text primary key,
        owner_phone text not null,
        status text not null,
        created_at timestamptz not null default current_timestamp,
        public_tracking_token text not null,
        property_data jsonb not null
      );
      insert into customer_property_submissions(id,owner_phone,status,public_tracking_token,property_data)
      values ('existing','09130000000','pending','HIR-26-DDDDDDDDDDDD','{"title":"Apartment A","areaM2":100}');
    `);
    const query = buildPendingSubmissionDuplicateQuery("09130000000", { title: "Apartment A", areaM2: 100 });
    const rows = await db.query(query.sql, query.params);
    assert.deepEqual(rows.rows, [{ id: "existing" }]);
    assert.equal("public_tracking_token" in rows.rows[0]!, false);
    const before = await db.query("select id,public_tracking_token,property_data from customer_property_submissions where id='existing'");
    const response = buildPublicDuplicateResponse("درخواست مشابهی قبلاً دریافت شده است.");
    assert.equal("trackingToken" in response, false);
    const after = await db.query("select id,public_tracking_token,property_data from customer_property_submissions where id='existing'");
    assert.deepEqual(after.rows, before.rows, "a duplicate submission must not rotate or mutate the existing submission");

    const route = await readFile(new URL("../../server/routes/api/customer-property-submissions.post.ts", import.meta.url), "utf8");
    const start = route.indexOf("const duplicateQuery = buildPendingSubmissionDuplicateQuery");
    const end = route.indexOf("insert into leads (id,name,phone", start);
    assert.ok(start >= 0 && end > start, "the customer-property duplicate branch must remain identifiable");
    const duplicateBranch = route.slice(start, end);
    assert.match(duplicateBranch, /return buildPublicDuplicateResponse\(/);
    assert.doesNotMatch(duplicateBranch, /public_tracking_token|trackingToken/);
  } finally {
    await db.close();
  }
});

test("duplicate UI confirms receipt without presenting a previous tracking code as the caller's own", async () => {
  const [submitProperty, budgetMatcher, inquiryForm] = await Promise.all([
    readFile(new URL("../routes/submit-property.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/hirmand/budget-matcher.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/hirmand/inquiry-form.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(submitProperty, /setDoneDuplicate\(Boolean\(payload\.duplicate\)\)/);
  assert.match(submitProperty, /doneDuplicate \? "درخواست مشابه قبلاً دریافت شده است/);
  assert.match(submitProperty, /doneTrackingToken \? <div className="owner-tracking"/);
  assert.match(budgetMatcher, /setLeadDuplicate\(Boolean\(result\.duplicate\)\)/);
  assert.match(budgetMatcher, /leadDuplicate \? "درخواست مشابه قبلی شناسایی شد/);
  assert.match(inquiryForm, /result\.duplicate\s*\?/);
});
