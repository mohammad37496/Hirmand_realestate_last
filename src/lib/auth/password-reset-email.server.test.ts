import assert from "node:assert/strict";
import test from "node:test";
import { sendPasswordResetEmail } from "./password-reset-email.server.ts";

const originalFetch = globalThis.fetch;
const originalEnv = {
  apiKey: process.env.RESEND_API_KEY,
  from: process.env.RESEND_FROM_EMAIL,
  apiUrl: process.env.RESEND_API_URL,
  ci: process.env.CI,
};

test("password reset email requires a configured Resend sender and API key", async () => {
  delete process.env.RESEND_API_KEY;
  delete process.env.RESEND_FROM_EMAIL;
  await assert.rejects(
    sendPasswordResetEmail({ email: "customer@example.com", name: "Customer", url: "https://hirmandrealestate.ir/login?token=x" }),
    /RESEND_API_KEY and RESEND_FROM_EMAIL are required/,
  );
});

test("password reset email sends a Persian one-hour recovery message through Resend", async () => {
  process.env.RESEND_API_KEY = "test-resend-key";
  process.env.RESEND_FROM_EMAIL = "Hirmand <accounts@example.com>";
  delete process.env.RESEND_API_URL;
  let requestUrl = "";
  let request: RequestInit | undefined;
  globalThis.fetch = async (input, init) => {
    requestUrl = String(input);
    request = init;
    return new Response(JSON.stringify({ id: "email-test-id" }), { status: 200 });
  };

  try {
    await sendPasswordResetEmail({
      email: "customer@example.com",
      name: "<Customer>",
      url: "https://hirmandrealestate.ir/login?token=one-time",
    });
    assert.equal(requestUrl, "https://api.resend.com/emails");
    assert.equal(request?.method, "POST");
    assert.equal(new Headers(request?.headers).get("authorization"), "Bearer test-resend-key");
    const body = JSON.parse(String(request?.body));
    assert.deepEqual(body.to, ["customer@example.com"]);
    assert.match(body.html, /&lt;Customer&gt;/);
    assert.match(body.html, /فقط یک‌بار و تا یک ساعت معتبر است/);
    assert.match(body.text, /https:\/\/hirmandrealestate\.ir\/login\?token=one-time/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Resend endpoint overrides are limited to loopback CI tests", async () => {
  process.env.RESEND_API_KEY = "test-resend-key";
  process.env.RESEND_FROM_EMAIL = "Hirmand <accounts@example.com>";
  process.env.RESEND_API_URL = "http://127.0.0.1:4321/emails";
  process.env.CI = "false";
  await assert.rejects(
    sendPasswordResetEmail({ email: "customer@example.com", name: "Customer", url: "https://example.com/reset" }),
    /permitted only for loopback CI tests/,
  );
  process.env.CI = "true";
  let requestUrl = "";
  globalThis.fetch = async (input) => {
    requestUrl = String(input);
    return new Response(JSON.stringify({ id: "email-test-id" }), { status: 200 });
  };
  try {
    await sendPasswordResetEmail({ email: "customer@example.com", name: "Customer", url: "https://example.com/reset" });
    assert.equal(requestUrl, "http://127.0.0.1:4321/emails");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("password reset email reports provider failures without exposing response details", async () => {
  process.env.RESEND_API_KEY = "test-resend-key";
  process.env.RESEND_FROM_EMAIL = "Hirmand <accounts@example.com>";
  delete process.env.RESEND_API_URL;
  globalThis.fetch = async () => new Response("private provider detail", { status: 503 });
  try {
    await assert.rejects(
      sendPasswordResetEmail({ email: "customer@example.com", name: "Customer", url: "https://example.com/reset" }),
      /Resend email API returned HTTP 503/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test.after(() => {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries({
    RESEND_API_KEY: originalEnv.apiKey,
    RESEND_FROM_EMAIL: originalEnv.from,
    RESEND_API_URL: originalEnv.apiUrl,
    CI: originalEnv.ci,
  })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});
