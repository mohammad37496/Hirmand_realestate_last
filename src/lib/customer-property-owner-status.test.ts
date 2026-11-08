import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  ownerStatusEventNote,
  publicCustomerPropertyReviewNote,
} from "./customer-property-owner-status.ts";
import { resubmitCustomerPropertySubmission } from "./customer-property-submission-resubmit.ts";

test("public owner timeline exposes only owner-facing event notes", async () => {
  assert.equal(ownerStatusEventNote("created", "پرونده ثبت شد"), "پرونده ثبت شد");
  assert.equal(ownerStatusEventNote("assign", "پرونده به مشاور اختصاص یافت"), "پرونده به مشاور اختصاص یافت");
  assert.equal(ownerStatusEventNote("reject", "لطفاً تصویر سند را اصلاح کنید"), "لطفاً تصویر سند را اصلاح کنید");
  assert.equal(ownerStatusEventNote("resubmit", "نسخه جدید دریافت شد"), "نسخه جدید دریافت شد");
  for (const action of ["approve", "priority", "edit", "restore", "unknown", null]) {
    assert.equal(ownerStatusEventNote(action, "یادداشت داخلی مدیر"), "");
  }

  const route = await readFile(
    new URL("../../server/routes/api/owner-property-status.post.ts", import.meta.url),
    "utf8",
  );
  assert.match(route, /note:ownerStatusEventNote\(row\.action,row\.note\)/);
});

test("public lead tracking returns review notes only after an explicit rejection", async () => {
  const internalNote = "یادداشت داخلی کارشناس";
  assert.equal(publicCustomerPropertyReviewNote("pending", internalNote), "");
  assert.equal(publicCustomerPropertyReviewNote("approved", internalNote), "");
  assert.equal(publicCustomerPropertyReviewNote("rejected", "لطفاً تصویر سند را اصلاح کنید"), "لطفاً تصویر سند را اصلاح کنید");
  assert.equal(publicCustomerPropertyReviewNote("unknown", internalNote), "");

  const route = await readFile(
    new URL("../../server/routes/api/public-lead-tracking.get.ts", import.meta.url),
    "utf8",
  );
  assert.match(route, /publicCustomerPropertyReviewNote\(\s*customerPropertySubmissionStatus\s*,\s*row\.customer_property_submission_review_note\s*,?\s*\)/);
});

test("customer resubmission only wins when the rejected status and timestamp still match", async () => {
  const input = {
    id: "submission-1",
    expectedUpdatedAt: "2026-11-08T12:00:00.000Z",
    ownerName: "مالک",
    ownerPhone: "09123456789",
    propertyData: "{}",
  };
  let queryText = "";
  let queryParams: unknown[] = [];
  const won = await resubmitCustomerPropertySubmission({
    query: async <T>(text: string, params: unknown[] = []): Promise<T[]> => {
      queryText = text;
      queryParams = params;
      return [{ id: "submission-1" }] as T[];
    },
  }, input);

  assert.equal(won, true);
  assert.match(queryText, /where id=\$1 and status='rejected' and updated_at=\$5\s+returning id/i);
  assert.deepEqual(queryParams, [input.id, input.ownerName, input.ownerPhone, input.propertyData, input.expectedUpdatedAt]);

  const stale = await resubmitCustomerPropertySubmission({
    query: async () => [],
  }, input);
  assert.equal(stale, false);
});
