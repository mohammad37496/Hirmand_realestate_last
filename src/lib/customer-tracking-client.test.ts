import assert from "node:assert/strict";
import { test } from "node:test";
import { loadPublicTrackingResult } from "./customer-tracking-client.ts";

function response(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("preserves server retry guidance for rate-limited and unavailable tracking requests", async () => {
  const rateLimited = await loadPublicTrackingResult("HIR-26-" + "A".repeat(32), async () => response(429, { statusMessage: "لطفاً ۲۰ ثانیه دیگر تلاش کنید." }));
  assert.deepEqual(rateLimited, { ok: false, status: 429, message: "لطفاً ۲۰ ثانیه دیگر تلاش کنید." });

  const unavailable = await loadPublicTrackingResult("HIR-26-" + "B".repeat(32), async () => response(503, { statusMessage: "پایگاه داده موقتاً در دسترس نیست." }));
  assert.deepEqual(unavailable, { ok: false, status: 503, message: "پایگاه داده موقتاً در دسترس نیست." });
});

test("distinguishes a missing tracking code from service failure", async () => {
  const missing = await loadPublicTrackingResult("HIR-26-" + "C".repeat(32), async () => response(404, { statusMessage: "درخواستی با این کد رهگیری پیدا نشد." }));
  assert.deepEqual(missing, { ok: false, status: 404, message: "درخواستی با این کد رهگیری پیدا نشد." });
});

test("returns successful tracking data without changing the response", async () => {
  const data = {
    trackingCode: "HIR-26-" + "D".repeat(32), status: "new", statusLabel: "ثبت شد",
    visitStatus: "none", visitStatusLabel: "بدون بازدید", createdAt: null, updatedAt: null,
    consultant: "", deal: "", propertyType: "", neighborhood: "", offerAmount: "90071992547409931234", visitRequestedAt: null,
    visitPreferredAt: null, property: null, timeline: [],
  };
  const result = await loadPublicTrackingResult(data.trackingCode, async () => response(200, data));
  assert.deepEqual(result, { ok: true, data });
});

test("turns network failures into a retryable message while preserving the saved code", async () => {
  const result = await loadPublicTrackingResult("HIR-26-" + "E".repeat(32), async () => { throw new Error("network down"); });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, null);
    assert.match(result.message, /کد شما ذخیره مانده است/);
  }
});
