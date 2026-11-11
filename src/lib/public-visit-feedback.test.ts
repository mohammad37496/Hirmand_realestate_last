import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  DUPLICATE_PUBLIC_VISIT_FEEDBACK_MESSAGE,
  isDuplicatePublicVisitFeedbackConflict,
} from "./public-visit-feedback.ts";

test("only the duplicate-feedback 409 is treated as an already-recorded response", () => {
  assert.equal(isDuplicatePublicVisitFeedbackConflict(409, DUPLICATE_PUBLIC_VISIT_FEEDBACK_MESSAGE), true);
  assert.equal(isDuplicatePublicVisitFeedbackConflict(409, "بازدید هنوز تکمیل نشده است."), false);
  assert.equal(isDuplicatePublicVisitFeedbackConflict(503, DUPLICATE_PUBLIC_VISIT_FEEDBACK_MESSAGE), false);
  assert.equal(isDuplicatePublicVisitFeedbackConflict(500, DUPLICATE_PUBLIC_VISIT_FEEDBACK_MESSAGE), false);
});

test("tracking lookup hydrates feedback state and reconciles duplicate retries", async () => {
  const route = await readFile(new URL("../routes/request-tracking.tsx", import.meta.url), "utf8");
  const endpoint = await readFile(new URL("../../server/routes/api/public-lead-tracking.get.ts", import.meta.url), "utf8");

  assert.match(endpoint, /exists\s*\(select 1 from lead_visit_feedback f where f\.lead_id=l\.id\)\s+as feedback_submitted/i);
  assert.match(endpoint, /feedbackSubmitted:\s*row\.feedback_submitted === true/);
  assert.match(route, /setFeedbackSubmitted\(data\.feedbackSubmitted === true\)/);
  assert.match(route, /throw new TrackingActionError\(response\.status,/);
  assert.match(route, /isDuplicatePublicVisitFeedbackConflict\(error\.status, error\.message\)/);
  assert.match(route, /برای این بازدید بازخورد ثبت شده است/);
  assert.match(route, /setFeedbackSubmitted\(false\)/);
});
