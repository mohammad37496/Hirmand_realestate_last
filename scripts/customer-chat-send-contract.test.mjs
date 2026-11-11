import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const route = await readFile(new URL("../server/routes/api/customer-chat.post.ts", import.meta.url), "utf8");
const helper = await readFile(new URL("../src/lib/customer-chat-send.ts", import.meta.url), "utf8");
const verify = await readFile(new URL("../.github/workflows/verify.yml", import.meta.url), "utf8");

test("customer chat route delegates send/cooldown handling to the atomic helper", () => {
  assert.match(route, /sendCustomerChatMessage\(sql/);
  assert.match(route, /result\.kind === "cooldown"/);
  assert.match(route, /result\.kind === "not_found"/);
  assert.match(route, /result\.kind === "unavailable"/);
  assert.doesNotMatch(route, /select created_at as "createdAt" from customer_messages/i);
});

test("customer chat cooldown is checked under a locked lead row in one transaction", () => {
  assert.match(helper, /sql\.transaction\(/);
  assert.match(helper, /for update/i);
  assert.match(helper, /created_at > current_timestamp - interval '12 seconds'/i);
  assert.ok(helper.indexOf("for update") < helper.indexOf("from customer_messages"));
  assert.ok(helper.indexOf("from customer_messages") < helper.indexOf("insert into customer_messages"));
});

test("Verify runs the independent PostgreSQL-session customer chat race test", () => {
  assert.match(verify, /Verify customer chat cooldown locking across PostgreSQL sessions/);
  assert.match(verify, /scripts\/customer-chat-send-postgres\.test\.mjs/);
  assert.match(verify, /TEST_DATABASE_URL: postgresql:\/\/postgres:postgres@127\.0\.0\.1:5432\/hirmand_verify/);
});
