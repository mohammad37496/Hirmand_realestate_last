import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { getVisitFeedbackDisplayState } from "./admin-visit-feedback-state.ts";

const available = { available: true, total: 0, average: 0, interested: 0, recent: [] };

test("visit feedback shows loading, error and unavailable states separately from a real empty result", () => {
  assert.equal(getVisitFeedbackDisplayState(true, null), "loading");
  assert.equal(getVisitFeedbackDisplayState(false, null), "error");
  assert.equal(getVisitFeedbackDisplayState(false, { ...available, available: false }), "unavailable");
  assert.equal(getVisitFeedbackDisplayState(false, available), "empty");
  assert.equal(getVisitFeedbackDisplayState(false, { ...available, recent: [{ id: "feedback-1" }] }), "content");
});

test("the visit feedback API and panel distinguish an unconfigured database from an empty result", () => {
  const route = readFileSync(new URL("../../server/routes/api/admin-visit-feedback.post.ts", import.meta.url), "utf8");
  const ui = readFileSync(new URL("../components/hirmand/admin-visit-feedback.tsx", import.meta.url), "utf8");
  assert.match(route, /dbSource === "unconfigured"\) return \{ available: false/);
  assert.match(route, /available: true/);
  assert.match(ui, /setLoadError\(message\)/);
  assert.match(ui, /displayState === "error"/);
  assert.match(ui, /displayState === "unavailable"/);
});
