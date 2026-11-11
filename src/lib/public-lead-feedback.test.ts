import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { test } from "node:test";
import { isDuplicatePublicLeadFeedbackError } from "./public-lead-feedback.ts";

test("concurrent public visit feedback inserts identify the losing unique conflict", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`
      create table lead_visit_feedback (
        id bigserial primary key,
        lead_id text not null,
        tracking_token text not null,
        rating smallint not null check (rating between 1 and 5),
        interest text not null check (interest in ('interested','unsure','not_interested')),
        note text not null default '',
        created_at timestamptz not null default current_timestamp
      );
      create unique index lead_visit_feedback_lead_idx on lead_visit_feedback(lead_id);
    `);

    const preflight = await Promise.all([1, 2].map(() =>
      pg.query("select id from lead_visit_feedback where lead_id=$1 limit 1", ["lead-1"]),
    ));
    assert.deepEqual(preflight.map((result) => result.rows.length), [0, 0]);

    const inserts = await Promise.allSettled([1, 2].map(() =>
      pg.query(
        "insert into lead_visit_feedback(lead_id,tracking_token,rating,interest,note) values($1,$2,$3,$4,$5)",
        ["lead-1", "HIR-26-AAAAAAAAAAAA", 5, "unsure", "same submission"],
      ),
    ));

    const rejected = inserts.find((result) => result.status === "rejected");
    assert.ok(rejected && rejected.status === "rejected");
    assert.equal(isDuplicatePublicLeadFeedbackError(rejected.reason), true);
    assert.equal(isDuplicatePublicLeadFeedbackError({
      code: "23505",
      constraint: "some_other_unique_constraint",
    }), false);
    assert.equal(isDuplicatePublicLeadFeedbackError({ code: "40001", constraint: "lead_visit_feedback_lead_idx" }), false);
    assert.equal((await pg.query("select id from lead_visit_feedback")).rows.length, 1);
  } finally {
    await pg.close();
  }
});

test("public feedback route maps only this unique conflict to the existing duplicate response", async () => {
  const route = await readFile(new URL("../../server/routes/api/public-lead-actions.post.ts", import.meta.url), "utf8");
  assert.match(route, /catch \(error\) \{\s*if \(isDuplicatePublicLeadFeedbackError\(error\)\) \{\s*throw createError\(\{ statusCode: 409, statusMessage: "بازخورد این بازدید قبلاً ثبت شده است\." \}\);\s*\}\s*throw error;/);
});
