import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { isValidPartnerTrackingCode, isValidPublicTrackingToken, TRACKING_TOKEN_MAX_LENGTH } from "./tracking-token.ts";
import { ensurePublicTrackingToken, generatePartnerTrackingCode, generatePublicTrackingToken } from "./tracking-token.server.ts";

test("public tracking accepts legacy 48-bit and current 128-bit tokens", () => {
  assert.equal(isValidPublicTrackingToken("HIR-26-ABCDEF123456"), true);
  assert.equal(isValidPublicTrackingToken("HIR-26-0123456789ABCDEF0123456789ABCDEF"), true);
  assert.equal(isValidPublicTrackingToken("HIR-AB-ABCDEF123456"), false);
  assert.equal(isValidPublicTrackingToken("HIR-26-ABCDEF12345"), false);
  assert.equal(isValidPublicTrackingToken("HIR-26-0123456789ABCDEF0123456789ABCDEG"), false);
});

test("partner tracking accepts legacy 32-bit and current 128-bit codes", () => {
  assert.equal(isValidPartnerTrackingCode("HIR-26-ABCDEF12"), true);
  assert.equal(isValidPartnerTrackingCode("HIR-26-0123456789ABCDEF0123456789ABCDEF"), true);
  assert.equal(isValidPartnerTrackingCode("HIR-26-ABCDEF123"), false);
  assert.equal(isValidPartnerTrackingCode("HIR-26-0123456789ABCDEF0123456789ABCDEG"), false);
});

test("new public and partner tracking tokens contain 128 random bits", () => {
  const date = new Date("2026-01-01T00:00:00Z");
  const publicTokens = new Set(Array.from({ length: 32 }, () => generatePublicTrackingToken(date)));
  const partnerTokens = new Set(Array.from({ length: 32 }, () => generatePartnerTrackingCode(date)));

  assert.equal(TRACKING_TOKEN_MAX_LENGTH, 39);
  assert.equal(publicTokens.size, 32);
  assert.equal(partnerTokens.size, 32);
  for (const token of publicTokens) assert.match(token, /^HIR-26-[A-F0-9]{32}$/);
  for (const token of partnerTokens) assert.match(token, /^HIR-26-[A-F0-9]{32}$/);
});

test("concurrent duplicate-lead requests return the single token atomically stored on the lead", async () => {
  const pg = new PGlite();
  try {
    await pg.exec("create table leads (id text primary key, public_tracking_token text); insert into leads(id) values ('lead-1')");
    const sql = {
      query: async <T = Record<string, unknown>>(text: string, parameters: unknown[] = []) =>
        (await pg.query<T>(text, parameters)).rows,
    };
    const tokens = await Promise.all(Array.from({ length: 24 }, () => ensurePublicTrackingToken(sql, "lead-1", null)));
    assert.equal(new Set(tokens).size, 1);
    assert.match(tokens[0] ?? "", /^HIR-\d{2}-[A-F0-9]{32}$/);
    const stored = await pg.query<{ public_tracking_token: string }>("select public_tracking_token from leads where id='lead-1'");
    assert.equal(stored.rows[0]?.public_tracking_token, tokens[0]);
  } finally {
    await pg.close();
  }
});

test("legacy duplicate-lead token assignment replaces malformed stored values", async () => {
  const pg = new PGlite();
  try {
    await pg.exec("create table leads (id text primary key, public_tracking_token text); insert into leads values ('lead-1','not-a-token')");
    const sql = {
      query: async <T = Record<string, unknown>>(text: string, parameters: unknown[] = []) =>
        (await pg.query<T>(text, parameters)).rows,
    };
    const token = await ensurePublicTrackingToken(sql, "lead-1", "not-a-token");
    assert.match(token, /^HIR-\d{2}-[A-F0-9]{32}$/);
    const stored = await pg.query<{ public_tracking_token: string }>("select public_tracking_token from leads where id='lead-1'");
    assert.equal(stored.rows[0]?.public_tracking_token, token);
  } finally {
    await pg.close();
  }
});
