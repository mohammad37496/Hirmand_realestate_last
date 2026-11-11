import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const getRoute = await readFile(new URL("../server/routes/api/customer-chat.get.ts", import.meta.url), "utf8");
const postRoute = await readFile(new URL("../server/routes/api/customer-chat/read.post.ts", import.meta.url), "utf8");
const component = await readFile(new URL("../src/components/hirmand/customer-conversation.tsx", import.meta.url), "utf8");
const messagesHelper = await readFile(new URL("../src/lib/customer-chat-messages.ts", import.meta.url), "utf8");

test("customer chat GET is read-only and returns the unread count", () => {
  assert.match(getRoute, /setResponseHeader\(event,\s*["']cache-control["'],\s*["']no-store["']\)/);
  assert.doesNotMatch(getRoute, /update customer_messages set read_by_customer_at/i);
  assert.match(getRoute, /unreadCustomer:\s*conversation\.unreadCount/);
});

test("customer chat returns the latest 100 messages chronologically and counts unread only in that window", () => {
  assert.match(messagesHelper, /order by created_at desc,id desc\s+limit 100\s+\) as latest\s+order by created_at asc,id asc/i);
  assert.match(messagesHelper, /row\.senderType === "admin" && !row\.readByCustomerAt/);
});

test("read receipts use a same-origin, no-store, rate-limited POST endpoint", () => {
  assert.match(postRoute, /setResponseHeader\(event,\s*["']cache-control["'],\s*["']no-store["']\)/);
  assert.match(postRoute, /assertSameOrigin\(event\)/);
  assert.match(postRoute, /consumeAdminAttempt\(/);
  assert.match(postRoute, /messageIds:\s*z\.array\(/);
  assert.match(postRoute, /markCustomerChatMessagesRead\(/);
  assert.ok(postRoute.indexOf("assertSameOrigin(event)") < postRoute.indexOf("readBody(event)"));
  assert.ok(postRoute.indexOf("consumeAdminAttempt(") < postRoute.indexOf("readBody(event)"));
});

test("the customer conversation marks only the admin messages it actually fetched", () => {
  assert.match(component, /filter\(\(item\) => item\.senderType === "admin"\)\.map\(\(item\) => item\.id\)/);
  assert.match(component, /fetch\("\/api\/customer-chat\/read",\s*\{\s*method:\s*"POST"/s);
  assert.match(component, /messageIds:\s*visibleAdminMessageIds/);
});
