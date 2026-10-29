import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { dbSource, getSql } from "@/lib/db";
import { requireAdminPermission } from "@/lib/admin-role.server";
import { ADMIN_MEDIA_ORPHAN_UPLOADS_SQL, ADMIN_MEDIA_REFERENCED_IDS_SQL, staleLegacySessionPredicate, stalePropertySessionPredicate } from "@/lib/admin-media-reference-sql";

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
    await requireAdminPermission("property.manage");
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
    const [objects, references, orphans, legacyStale, propertyStale, legacyChunks, propertyChunks] = await Promise.all([
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
    ]);

    const storedObjects = Number(objects[0]?.count) || 0;
    const referencedDatabaseObjects = Number(references[0]?.count) || 0;
    const orphanObjects = Number(orphans[0]?.count) || 0;
    const staleUploadSessions = (Number(legacyStale[0]?.count) || 0) + (Number(propertyStale[0]?.count) || 0);
    const staleUploadChunks = (Number(legacyChunks[0]?.count) || 0) + (Number(propertyChunks[0]?.count) || 0);

    return {
      storedObjects,
      storedBytes: Number(objects[0]?.bytes) || 0,
      referencedDatabaseObjects,
      orphanObjects,
      staleUploadSessions,
      staleUploadChunks,
      scannedAt: new Date().toISOString(),
    } satisfies MediaHealth;
  });

export const cleanupAdminMedia = createServerFn({ method: "POST" })
  .validator(z.object({ staleMinutes: z.number().int().min(30).max(1440).optional().default(120) }))
  .handler(async ({ data }) => {
    await requireAdminPermission("backup.manage");
    if (dbSource === "unconfigured") return { orphanDeleted: 0, staleSessionsDeleted: 0, staleChunksDeleted: 0 };

    const sql = await getSql();

    const orphanRows = await sql.query<{ id: string }>(
      `delete from media_objects m where m.id in (${ADMIN_MEDIA_ORPHAN_UPLOADS_SQL}) returning m.id`,
    );

    const legacyChunkRows = await sql.query<{ session_id: string }>(
      `delete from media_upload_chunks c using media_upload_sessions s where c.session_id=s.id and ${staleLegacySessionPredicate("s")} returning c.session_id`,
      [String(data.staleMinutes)],
    );
    const staleRows = await sql.query<{ id: string }>(
      `delete from media_upload_sessions where ${staleLegacySessionPredicate()} returning id`,
      [String(data.staleMinutes)],
    );
    const propertyChunkRows = await sql.query<{ upload_id: string }>(
      `delete from property_media_upload_chunks c using property_media_upload_sessions s where c.upload_id=s.id and ${stalePropertySessionPredicate("s")} returning c.upload_id`,
      [String(data.staleMinutes)],
    );
    const stalePropertyRows = await sql.query<{ id: string }>(
      `delete from property_media_upload_sessions where ${stalePropertySessionPredicate()} returning id`,
      [String(data.staleMinutes)],
    );

    return {
      orphanDeleted: orphanRows.length,
      staleSessionsDeleted: staleRows.length + stalePropertyRows.length,
      staleChunksDeleted: legacyChunkRows.length + propertyChunkRows.length,
    };
  });
