import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(
  new URL("../server/routes/api/admin-customer-property-submissions.post.ts", import.meta.url),
  "utf8",
);

test("customer submission approval is denied before database access without publish permission", () => {
  const guard = route.indexOf('if (action === "approve" && !canApproveCustomerPropertySubmission(role))');
  const database = route.indexOf("const sql = await getSql()");

  assert.ok(guard >= 0, "approve must have an action-specific publish permission guard");
  assert.ok(database > guard, "the permission guard must run before opening the database connection");
  assert.match(route.slice(guard, database), /statusCode:\s*403/);
});

