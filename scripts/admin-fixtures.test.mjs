import assert from "node:assert/strict";
import test from "node:test";
import { servesNitroApi } from "./admin-fixtures.mjs";

test("admin browser fixtures detect missing Nitro routes instead of treating Vite 404 as available", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response("not found", { status: 404 });
    assert.equal(await servesNitroApi("http://127.0.0.1:8080"), false);
    globalThis.fetch = async () => new Response("unauthorized", { status: 401 });
    assert.equal(await servesNitroApi("http://127.0.0.1:8081"), true);
    globalThis.fetch = async () => new Response("ok", { status: 200 });
    assert.equal(await servesNitroApi("http://127.0.0.1:8082"), true);
    globalThis.fetch = async () => new Response("internal error", { status: 500 });
    assert.equal(await servesNitroApi("http://127.0.0.1:8083"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
