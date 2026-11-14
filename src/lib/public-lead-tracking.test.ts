import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "./db.ts";
import { lockPublicLeadTrackingTarget, resolvePublicLeadTrackingTarget, sharePublicLeadTrackingTarget } from "./public-lead-tracking.ts";

test("legacy tracking tokens follow multi-level merge aliases and retain the original token", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table leads (
        id text primary key,
        status text not null,
        note text not null default '',
        public_tracking_token text unique,
        merged_into_lead_id text
      );
      insert into leads(id,status,note,public_tracking_token,merged_into_lead_id) values
        ('canonical-final','new','','HIR-26-AAAAAAAAAAAA',null),
        ('canonical-middle','closed','merged','HIR-26-BBBBBBBBBBBB','canonical-final'),
        ('duplicate','closed','merged','HIR-26-CCCCCCCCCCCC','canonical-middle'),
        ('unmerged','closed','ordinary close','HIR-26-DDDDDDDDDDDD',null),
        ('cycle-a','closed','cycle','HIR-26-EEEEEEEEEEEE','cycle-b'),
        ('cycle-b','closed','cycle','HIR-26-FFFFFFFFFFFF','cycle-a'),
        ('dangling','closed','orphan','HIR-26-111111111111','missing');
    `);
    const sql = {
      query: async <T = Record<string, unknown>>(query: string, params: unknown[] = []) =>
        (await db.query(query, params)).rows as T[],
    } as Pick<Sql, "query">;

    assert.deepEqual(await resolvePublicLeadTrackingTarget(sql, "HIR-26-CCCCCCCCCCCC"), {
      leadId: "canonical-final",
      trackingToken: "HIR-26-CCCCCCCCCCCC",
    });
    assert.deepEqual(await resolvePublicLeadTrackingTarget(sql, "hir-26-cccccccccccc"), {
      leadId: "canonical-final",
      trackingToken: "HIR-26-CCCCCCCCCCCC",
    });
    assert.deepEqual(await resolvePublicLeadTrackingTarget(sql, "HIR-26-BBBBBBBBBBBB"), {
      leadId: "canonical-final",
      trackingToken: "HIR-26-BBBBBBBBBBBB",
    });
    assert.deepEqual(await resolvePublicLeadTrackingTarget(sql, "HIR-26-DDDDDDDDDDDD"), {
      leadId: "unmerged",
      trackingToken: "HIR-26-DDDDDDDDDDDD",
    });
    assert.equal(await resolvePublicLeadTrackingTarget(sql, "HIR-26-EEEEEEEEEEEE"), null);
    assert.equal(await resolvePublicLeadTrackingTarget(sql, "HIR-26-111111111111"), null);
    assert.equal(await resolvePublicLeadTrackingTarget(sql, "HIR-26-999999999999"), null);
  } finally {
    await db.close();
  }
});

test("tracking alias migration backfills historical merge notes and permits feedback per original token", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table leads (
        id text primary key,
        status text not null,
        note text not null default '',
        public_tracking_token text unique
      );
      create table lead_visit_feedback (
        id bigserial primary key,
        lead_id text not null,
        tracking_token text not null,
        rating smallint not null,
        interest text not null,
        note text not null default ''
      );
      create unique index lead_visit_feedback_lead_idx on lead_visit_feedback(lead_id);
      insert into leads(id,status,note,public_tracking_token) values
        ('canonical-final','new','','HIR-26-AAAAAAAAAAAA'),
        ('canonical-middle','closed',E'یادداشت قبلی\\nاین لید در 2026-11-09 09:00 با لید canonical-final ادغام شد.','HIR-26-BBBBBBBBBBBB'),
        ('duplicate','closed','این لید در 2026-11-09 09:15 با لید canonical-middle ادغام شد.','HIR-26-CCCCCCCCCCCC'),
        ('unrelated-closed','closed','پرونده عادی بسته شد.','HIR-26-DDDDDDDDDDDD');
      insert into lead_visit_feedback(lead_id,tracking_token,rating,interest,note) values
        ('canonical-final','HIR-26-AAAAAAAAAAAA',4,'interested','بازخورد اصلی'),
        ('duplicate','HIR-26-CCCCCCCCCCCC',5,'interested','بازخورد لید ادغام‌شده');
    `);
    const migration = await readFile(new URL("../../migrations/0109_lead_merge_related_records.sql", import.meta.url), "utf8");
    await db.exec(migration);
    await db.exec(migration);

    const sql = {
      query: async <T = Record<string, unknown>>(query: string, params: unknown[] = []) =>
        (await db.query(query, params)).rows as T[],
      transaction: async <T>(callback: (transactionSql: Sql) => Promise<T>) =>
        db.transaction(async (tx) => callback({
          query: async <R = Record<string, unknown>>(query: string, params: unknown[] = []) =>
            (await tx.query(query, params)).rows as R[],
        } as Sql)),
    } as Sql;

    assert.deepEqual(await resolvePublicLeadTrackingTarget(sql, "HIR-26-CCCCCCCCCCCC"), {
      leadId: "canonical-final",
      trackingToken: "HIR-26-CCCCCCCCCCCC",
    });
    const unrelated = await sql.query<{ merged_into_lead_id: string | null }>(
      "select merged_into_lead_id from leads where id='unrelated-closed'",
    );
    assert.equal(unrelated[0]?.merged_into_lead_id, null);

    await sql.query("update lead_visit_feedback set lead_id='canonical-final' where lead_id='duplicate'");
    const feedback = await sql.query<{ lead_id: string; tracking_token: string }>(
      "select lead_id,tracking_token from lead_visit_feedback order by tracking_token",
    );
    assert.deepEqual(feedback, [
      { lead_id: "canonical-final", tracking_token: "HIR-26-AAAAAAAAAAAA" },
      { lead_id: "canonical-final", tracking_token: "HIR-26-CCCCCCCCCCCC" },
    ]);

    assert.deepEqual(await sql.transaction!(async (transactionSql) =>
      lockPublicLeadTrackingTarget(transactionSql, "HIR-26-CCCCCCCCCCCC")), {
      leadId: "canonical-final",
      trackingToken: "HIR-26-CCCCCCCCCCCC",
    });
    assert.deepEqual(await sql.transaction!(async (transactionSql) =>
      sharePublicLeadTrackingTarget(transactionSql, "HIR-26-CCCCCCCCCCCC")), {
      leadId: "canonical-final",
      trackingToken: "HIR-26-CCCCCCCCCCCC",
    });
  } finally {
    await db.close();
  }
});

test("public tracking, actions and chat resolve aliases without replacing the original tracking token", async () => {
  const paths = [
    "../../server/routes/api/public-lead-tracking.get.ts",
    "../../server/routes/api/public-lead-actions.post.ts",
    "../../server/routes/api/customer-chat.get.ts",
    "../../server/routes/api/admin-customer-chat.post.ts",
  ];
  const sources = await Promise.all(paths.map((path) => readFile(new URL(path, import.meta.url), "utf8")));
  assert.ok(sources.every((source) => source.includes("PublicLeadTrackingTarget")));
  assert.match(sources[0]!, /sharePublicLeadTrackingTarget/);
  assert.match(sources[1]!, /lockPublicLeadTrackingTarget/);
  assert.match(sources[2]!, /sharePublicLeadTrackingTarget/);
  assert.match(sources[3]!, /lockPublicLeadTrackingTarget/);
  assert.match(sources[0]!, /f\.tracking_token=\$1/);
  assert.match(sources[0]!, /cps\.public_tracking_token=\$1/);
  assert.match(sources[1]!, /where tracking_token=\$1 limit 1/);
  assert.match(sources[2]!, /loadLatestCustomerChatMessages\(transactionSql, target\.leadId, target\.trackingToken\)/);
  assert.match(sources[3]!, /target\.leadId, target\.trackingToken/);
});

test("lead merge takes the exclusive alias-graph lock before reading or locking lead rows", async () => {
  const source = await readFile(new URL("./admin-lead-dedupe.ts", import.meta.url), "utf8");
  const lock = source.indexOf("await lockPublicLeadTrackingAliasGraphForMerge(transactionSql)");
  const firstLeadRead = source.indexOf('"select id,consultant_id from leads');
  assert.ok(lock >= 0, "lead merge must acquire the exclusive alias-graph lock");
  assert.ok(firstLeadRead > lock, "the exclusive alias-graph lock must precede every lead row lock/read");
});
