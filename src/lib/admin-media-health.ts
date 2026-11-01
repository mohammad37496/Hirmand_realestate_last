import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { dbSource, getSql, withSqlTransaction } from "@/lib/db";
import { lockMediaReferenceWrites } from "@/lib/media-cleanup-transaction.server";
import { requireAdminPermission } from "@/lib/admin-role.server";
import { ADMIN_MEDIA_ORPHAN_UPLOADS_SQL, ADMIN_MEDIA_REFERENCED_IDS_SQL, staleLegacySessionPredicate, stalePropertySessionPredicate } from "@/lib/admin-media-reference-sql";
import { enqueueMediaCleanupJob, processMediaCleanupJobs, pruneOrphanedVideoRenditionManifests, retryPendingMediaCleanupJobs } from "@/lib/media-store.server";

export type MediaHealth = {
  available: boolean;
  statusMessage?: string;
  storedObjects: number;
  storedBytes: number;
  referencedDatabaseObjects: number;
  orphanObjects: number;
  staleUploadSessions: number;
  staleUploadChunks: number;
  pendingMediaCleanupJobs: number;
  scannedAt: string;
};

export const getAdminMediaHealth = createServerFn({ method: "POST" })
  .validator(z.object({ staleMinutes: z.number().int().min(30).max(1440).optional().default(120) }))
  .handler(async ({ data }) => {
    await requireAdminPermission("property.manage");
    if (dbSource === "unconfigured") {
      return {
        available: false,
        statusMessage: "پایگاه داده در دسترس نیست؛ سلامت رسانه‌ها قابل بررسی نیست.",
        storedObjects: 0,
        storedBytes: 0,
        referencedDatabaseObjects: 0,
        orphanObjects: 0,
        staleUploadSessions: 0,
        staleUploadChunks: 0,
        pendingMediaCleanupJobs: 0,
        scannedAt: new Date().toISOString(),
      } satisfies MediaHealth;
    }

    const sql = await getSql();
    const [objects, references, orphans, legacyStale, propertyStale, legacyChunks, propertyChunks, cleanupJobs] = await Promise.all([
      sql.query<{ count: number; bytes: number }>(
        "select count(*)::int as count, coalesce(sum(size_bytes),0)::bigint as bytes from media_objects",
      ),
      sql.query<{ count: number }>(
        `select count(distinct m.id)::int as count from media_objects m join (${ADMIN_MEDIA_REFERENCED_IDS_SQL}) refs on refs.id = m.id where m.pathname like 'properties/uploads/%'`,
      ),
      sql.query<{ count: number }>(
        `select count(*)::int as count from (${ADMIN_MEDIA_ORPHAN_UPLOADS_SQL}) orphan_uploads`,
      ),
      sql.query<{ count: number }>(
        `select count(*)::int as count from media_upload_sessions where ${staleLegacySessionPredicate()}`,
        [String(data.staleMinutes)],
      ),
      sql.query<{ count: number }>(
        `select count(*)::int as count from property_media_upload_sessions where ${stalePropertySessionPredicate()}`,
        [String(data.staleMinutes)],
      ),
      sql.query<{ count: number }>(
        `select count(*)::int as count from media_upload_chunks c join media_upload_sessions s on s.id = c.session_id where ${staleLegacySessionPredicate("s")}`,
        [String(data.staleMinutes)],
      ),
      sql.query<{ count: number }>(
        `select count(*)::int as count from property_media_upload_chunks c join property_media_upload_sessions s on s.id = c.upload_id where ${stalePropertySessionPredicate("s")}`,
        [String(data.staleMinutes)],
      ),
      sql.query<{ count: number }>("select count(*)::int as count from media_cleanup_jobs where status in ('pending','deleting','retained')"),
    ]);

    const storedObjects = Number(objects[0]?.count) || 0;
    const referencedDatabaseObjects = Number(references[0]?.count) || 0;
    const orphanObjects = Number(orphans[0]?.count) || 0;
    const staleUploadSessions = (Number(legacyStale[0]?.count) || 0) + (Number(propertyStale[0]?.count) || 0);
    const staleUploadChunks = (Number(legacyChunks[0]?.count) || 0) + (Number(propertyChunks[0]?.count) || 0);

    return {
      available: true,
      statusMessage: undefined,
      storedObjects,
      storedBytes: Number(objects[0]?.bytes) || 0,
      referencedDatabaseObjects,
      orphanObjects,
      staleUploadSessions,
      staleUploadChunks,
      pendingMediaCleanupJobs: Number(cleanupJobs[0]?.count) || 0,
      scannedAt: new Date().toISOString(),
    } satisfies MediaHealth;
  });

export const cleanupAdminMedia = createServerFn({ method: "POST" })
  .validator(z.object({ staleMinutes: z.number().int().min(30).max(1440).optional().default(120) }))
  .handler(async ({ data }) => {
    await requireAdminPermission("backup.manage");
    if (dbSource === "unconfigured") {
      throw new Error("پایگاه داده در دسترس نیست؛ پاک‌سازی رسانه‌ها انجام نشد.");
    }

    const sql = await getSql();
    const queued = await withSqlTransaction(async (tx) => {
      await lockMediaReferenceWrites(tx);
      const orphanCandidates = await tx.query<{ id: string }>(
        `select m.id from media_objects m where m.id in (${ADMIN_MEDIA_ORPHAN_UPLOADS_SQL})`,
      );
      const orphanJobIds: number[] = [];
      for (const row of orphanCandidates) {
        const [job] = await enqueueMediaCleanupJob(tx, `/api/media/${encodeURIComponent(row.id)}`);
        if (job) orphanJobIds.push(job.id);
      }

      const legacyChunkRows = await tx.query<{ session_id: string }>(
        `delete from media_upload_chunks c using media_upload_sessions s where c.session_id=s.id and ${staleLegacySessionPredicate("s")} returning c.session_id`,
        [String(data.staleMinutes)],
      );
      const staleRows = await tx.query<{ id: string; stored_url: string | null; stored_media_id: string | null }>(
        `delete from media_upload_sessions where ${staleLegacySessionPredicate()} returning id,stored_url,stored_media_id`,
        [String(data.staleMinutes)],
      );
      const legacyJobIds: number[] = [];
      for (const row of staleRows) {
        const url = row.stored_url || (row.stored_media_id ? `/api/media/${encodeURIComponent(row.stored_media_id)}` : null);
        if (!url) continue;
        const [job] = await enqueueMediaCleanupJob(tx, url);
        if (job) legacyJobIds.push(job.id);
      }

      const propertyChunkRows = await tx.query<{ upload_id: string }>(
        `delete from property_media_upload_chunks c using property_media_upload_sessions s where c.upload_id=s.id and ${stalePropertySessionPredicate("s")} returning c.upload_id`,
        [String(data.staleMinutes)],
      );
      const stalePropertyRows = await tx.query<{ id: string; stored_url: string | null; stored_media_id: string | null }>(
        `delete from property_media_upload_sessions where ${stalePropertySessionPredicate()} returning id,stored_url,stored_media_id`,
        [String(data.staleMinutes)],
      );
      const propertyJobIds: number[] = [];
      for (const row of stalePropertyRows) {
        const url = row.stored_url || (row.stored_media_id ? `/api/media/${encodeURIComponent(row.stored_media_id)}` : null);
        if (!url) continue;
        const [job] = await enqueueMediaCleanupJob(tx, url);
        if (job) propertyJobIds.push(job.id);
      }

      return {
        orphanJobIds,
        staleJobIds: [...legacyJobIds, ...propertyJobIds],
        staleSessionsDeleted: staleRows.length + stalePropertyRows.length,
        staleChunksDeleted: legacyChunkRows.length + propertyChunkRows.length,
      };
    });
    const orphanCleanup = await processMediaCleanupJobs(queued.orphanJobIds, sql);
    const staleCleanup = await processMediaCleanupJobs(queued.staleJobIds, sql);
    await pruneOrphanedVideoRenditionManifests(100);
    await retryPendingMediaCleanupJobs(100, true);
    const pending = await sql.query<{ count: number }>("select count(*)::int as count from media_cleanup_jobs where status in ('pending','deleting','retained')");

    return {
      orphanDeleted: orphanCleanup.completed,
      orphanRetained: orphanCleanup.retained,
      staleSessionsDeleted: queued.staleSessionsDeleted,
      staleChunksDeleted: queued.staleChunksDeleted,
      staleMediaRetained: staleCleanup.retained,
      cleanupPending: Number(pending[0]?.count) || 0,
    };
  });
