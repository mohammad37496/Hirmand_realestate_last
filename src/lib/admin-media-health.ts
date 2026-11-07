import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import { dbSource, getSql } from "@/lib/db";
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from "@/lib/admin-session.server";
import { assertAdminServerFnOrigin } from "@/lib/admin-server-fn-guard.server";
import {
  adminMediaCleanupOrphanCountSql,
  adminMediaCleanupOrphanDeleteSql,
  adminMediaReferencedCountSql,
} from "@/lib/admin-media-cleanup-sql";

async function requireAdmin() {
  if (await verifyAdminSessionToken(getCookie(ADMIN_SESSION_COOKIE))) {
    assertAdminServerFnOrigin();
    return;
  }
  throw new Error("نشست مدیریت معتبر نیست.");
}

export type MediaHealth = {
  storedObjects: number;
  storedBytes: number;
  referencedDatabaseObjects: number;
  orphanObjects: number;
  staleUploadSessions: number;
  staleUploadChunks: number;
  scannedAt: string;
};

export const getAdminMediaHealth = createServerFn({ method: "POST" })
  .validator(z.object({ staleMinutes: z.number().int().min(30).max(1440).optional().default(120) }))
  .handler(async ({ data }) => {
    await requireAdmin();
    if (dbSource === "unconfigured") {
      return {
        storedObjects: 0,
        storedBytes: 0,
        referencedDatabaseObjects: 0,
        orphanObjects: 0,
        staleUploadSessions: 0,
        staleUploadChunks: 0,
        scannedAt: new Date().toISOString(),
      } satisfies MediaHealth;
    }

    const sql = await getSql();
    const [objects, references, orphanCandidates, stale, chunks] = await Promise.all([
      sql.query<{ count: number; bytes: number }>(
        "select count(*)::int as count, coalesce(sum(size_bytes),0)::bigint as bytes from media_objects",
      ),
      sql.query<{ count: number }>(adminMediaReferencedCountSql),
      sql.query<{ count: number }>(adminMediaCleanupOrphanCountSql, [String(data.staleMinutes)]),
      sql.query<{ count: number }>(
        "select count(*)::int as count from media_upload_sessions where created_at < current_timestamp - ($1::text || ' minutes')::interval",
        [String(data.staleMinutes)],
      ),
      sql.query<{ count: number }>(
        "select count(*)::int as count from media_upload_chunks c join media_upload_sessions s on s.id = c.session_id where s.created_at < current_timestamp - ($1::text || ' minutes')::interval",
        [String(data.staleMinutes)],
      ),
    ]);

    const storedObjects = Number(objects[0]?.count) || 0;
    const referencedDatabaseObjects = Number(references[0]?.count) || 0;
    const staleUploadSessions = Number(stale[0]?.count) || 0;
    const staleUploadChunks = Number(chunks[0]?.count) || 0;

    return {
      storedObjects,
      storedBytes: Number(objects[0]?.bytes) || 0,
      referencedDatabaseObjects,
      orphanObjects: Number(orphanCandidates[0]?.count) || 0,
      staleUploadSessions,
      staleUploadChunks,
      scannedAt: new Date().toISOString(),
    } satisfies MediaHealth;
  });

export const cleanupAdminMedia = createServerFn({ method: "POST" })
  .validator(z.object({ staleMinutes: z.number().int().min(30).max(1440).optional().default(120) }))
  .handler(async ({ data }) => {
    await requireAdmin();
    if (dbSource === "unconfigured") return { orphanDeleted: 0, staleSessionsDeleted: 0, staleChunksDeleted: 0 };

    const sql = await getSql();

    const orphanRows = await sql.query<{ id: string }>(
      adminMediaCleanupOrphanDeleteSql,
      [String(data.staleMinutes)],
    );

    const staleRows = await sql.query<{ id: string }>(
      "delete from media_upload_sessions where created_at < current_timestamp - ($1::text || ' minutes')::interval returning id",
      [String(data.staleMinutes)],
    );

    return {
      orphanDeleted: orphanRows.length,
      staleSessionsDeleted: staleRows.length,
      staleChunksDeleted: 0,
    };
  });
