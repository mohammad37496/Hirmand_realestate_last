import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  ownerStatusEventNote,
  publicCustomerPropertyReviewNote,
} from "./customer-property-owner-status.ts";

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
