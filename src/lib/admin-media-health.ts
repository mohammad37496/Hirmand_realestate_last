import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { createError } from "h3";
import { z } from "zod";
import { dbSource, getSql } from "@/lib/db";
import { ADMIN_SESSION_COOKIE, getAdminSessionClaims } from "@/lib/admin-session.server";
import { assertAdminServerFnOrigin } from "@/lib/admin-server-fn-guard.server";
import { hasAdminPermission } from "@/lib/admin-roles";
import { liaraStorageConfigured, listLiaraObjectInventory, type LiaraObjectInventory } from "@/lib/liara-object-storage.server";
import { pruneStaleUploadSessions } from "@/lib/media-store.server";
import {
  adminMediaCleanupOrphanCountSql,
  adminMediaCleanupOrphanDeleteSql,
  adminMediaReferencedCountSql,
} from "@/lib/admin-media-cleanup-sql";

function staleSessionTimestamp(alias?: string): string {
  const column = (name: string) => alias ? `${alias}.${name}` : name;
  const createdAt = column("created_at");
  return `(case when ${column("upload_mode")} = 'direct'
    then greatest(${createdAt}, coalesce(${column("direct_upload_expires_at")}, ${createdAt}))
    else ${createdAt} end)`;
}

async function requireAdmin() {
  const claims = await getAdminSessionClaims(getCookie(ADMIN_SESSION_COOKIE));
  if (!claims) {
    throw new Error("نشست مدیریت معتبر نیست.");
  }
  assertAdminServerFnOrigin();
  if (!hasAdminPermission(claims.role, "content.manage")) {
    throw new Error("سطح دسترسی مدیریت رسانه برای این حساب فعال نیست.");
  }
}

export type MediaHealth = {
  storedObjects: number;
  storedBytes: number;
  liaraConfigured: boolean;
  liaraObjectCount: number | null;
  liaraBytes: number | null;
  liaraInventoryComplete: boolean | null;
  liaraInventoryPages: number | null;
  liaraInventoryError: string | null;
  postgresDatabaseBytes: number | null;
  postgresTableBytes: number | null;
  postgresSizeError: string | null;
  referencedDatabaseObjects: number;
  orphanObjects: number;
  staleUploadSessions: number;
  staleUploadChunks: number;
  scannedAt: string;
};

let liaraInventoryCache: {
  expiresAt: number;
  result: { inventory: LiaraObjectInventory | null; error: string | null };
} | null = null;
let liaraInventoryInFlight: Promise<{ inventory: LiaraObjectInventory | null; error: string | null }> | null = null;

async function readCachedLiaraInventory(forceRefresh = false) {
  if (!liaraStorageConfigured()) return { inventory: null, error: null };
  if (!forceRefresh && liaraInventoryCache && liaraInventoryCache.expiresAt > Date.now()) {
    return liaraInventoryCache.result;
  }
  liaraInventoryInFlight ??= (async () => {
    try {
      return { inventory: await listLiaraObjectInventory(10), error: null };
    } catch (error) {
      return {
        inventory: null,
        error: error instanceof Error ? error.message.slice(0, 180) : "اسکن فضای ابری ناموفق بود.",
      };
    }
  })();
  try {
    const result = await liaraInventoryInFlight;
    liaraInventoryCache = { expiresAt: Date.now() + 5 * 60_000, result };
    return result;
  } finally {
    liaraInventoryInFlight = null;
  }
}

export const getAdminMediaHealth = createServerFn({ method: "POST" })
  .validator(z.object({
    staleMinutes: z.number().int().min(30).max(1440).optional().default(120),
    refreshLiara: z.boolean().optional().default(false),
  }))
  .handler(async ({ data }) => {
    await requireAdmin();
    if (dbSource === "unconfigured") {
      throw createError({ statusCode: 503, statusMessage: "سلامت رسانه‌ها موقتاً در دسترس نیست." });
    }

    const sql = await getSql();
    const postgresSizePromise = dbSource === "postgres"
      ? sql.query<{ database_bytes: number; table_bytes: number }>(
          `select pg_database_size(current_database())::bigint as database_bytes,
                  coalesce((
                    select sum(pg_total_relation_size(c.oid))
                    from pg_class c join pg_namespace n on n.oid = c.relnamespace
                    where n.nspname = 'public' and c.relkind in ('r', 'm')
                  ), 0)::bigint as table_bytes`,
        ).then((rows) => ({ rows, error: null as string | null }))
        .catch((error) => ({
          rows: [] as Array<{ database_bytes: number; table_bytes: number }>,
          error: error instanceof Error ? error.message.slice(0, 180) : "اندازه پایگاه داده قابل دریافت نیست.",
        }))
      : Promise.resolve({ rows: [] as Array<{ database_bytes: number; table_bytes: number }>, error: null as string | null });

    const [objects, references, orphanCandidates, stale, chunks, postgresSize, liaraInventory] = await Promise.all([
      sql.query<{ count: number; bytes: number }>(
        "select count(*)::int as count, coalesce(sum(size_bytes),0)::bigint as bytes from media_objects",
      ),
      sql.query<{ count: number }>(adminMediaReferencedCountSql, [String(data.staleMinutes)]),
      sql.query<{ count: number }>(adminMediaCleanupOrphanCountSql, [String(data.staleMinutes)]),
      sql.query<{ count: number }>(
        `select count(*)::int as count from media_upload_sessions
         where ${staleSessionTimestamp()} < current_timestamp - ($1::text || ' minutes')::interval`,
        [String(data.staleMinutes)],
      ),
      sql.query<{ count: number }>(
        `select count(*)::int as count from media_upload_chunks c
         join media_upload_sessions s on s.id = c.session_id
         where ${staleSessionTimestamp("s")} < current_timestamp - ($1::text || ' minutes')::interval`,
        [String(data.staleMinutes)],
      ),
      postgresSizePromise,
      readCachedLiaraInventory(data.refreshLiara),
    ]);

    const storedObjects = Number(objects[0]?.count) || 0;
    const referencedDatabaseObjects = Number(references[0]?.count) || 0;
    const staleUploadSessions = Number(stale[0]?.count) || 0;
    const staleUploadChunks = Number(chunks[0]?.count) || 0;

    return {
      storedObjects,
      storedBytes: Number(objects[0]?.bytes) || 0,
      liaraConfigured: liaraStorageConfigured(),
      liaraObjectCount: liaraInventory.inventory?.objectCount ?? null,
      liaraBytes: liaraInventory.inventory?.totalBytes ?? null,
      liaraInventoryComplete: liaraInventory.inventory?.complete ?? null,
      liaraInventoryPages: liaraInventory.inventory?.pagesScanned ?? null,
      liaraInventoryError: liaraInventory.error,
      postgresDatabaseBytes: postgresSize.rows[0] ? Number(postgresSize.rows[0].database_bytes) || 0 : null,
      postgresTableBytes: postgresSize.rows[0] ? Number(postgresSize.rows[0].table_bytes) || 0 : null,
      postgresSizeError: postgresSize.error,
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
    if (dbSource === "unconfigured") {
      throw createError({ statusCode: 503, statusMessage: "پاک‌سازی رسانه‌ها موقتاً در دسترس نیست." });
    }

    const sql = await getSql();

    const orphanRows = await sql.query<{ id: string }>(
      adminMediaCleanupOrphanDeleteSql,
      [String(data.staleMinutes)],
    );

    const staleBefore = await sql.query<{ count: number }>(
      `select count(*)::int as count from media_upload_sessions
       where ${staleSessionTimestamp()} < current_timestamp - ($1::text || ' minutes')::interval`,
      [String(data.staleMinutes)],
    );
    const staleChunksBefore = await sql.query<{ count: number }>(
      `select count(*)::int as count from media_upload_chunks c
       join media_upload_sessions s on s.id = c.session_id
       where ${staleSessionTimestamp("s")} < current_timestamp - ($1::text || ' minutes')::interval`,
      [String(data.staleMinutes)],
    );
    await pruneStaleUploadSessions(data.staleMinutes, true);
    liaraInventoryCache = null;
    const staleAfter = await sql.query<{ count: number }>(
      `select count(*)::int as count from media_upload_sessions
       where ${staleSessionTimestamp()} < current_timestamp - ($1::text || ' minutes')::interval`,
      [String(data.staleMinutes)],
    );
    const staleChunksAfter = await sql.query<{ count: number }>(
      `select count(*)::int as count from media_upload_chunks c
       join media_upload_sessions s on s.id = c.session_id
       where ${staleSessionTimestamp("s")} < current_timestamp - ($1::text || ' minutes')::interval`,
      [String(data.staleMinutes)],
    );

    return {
      orphanDeleted: orphanRows.length,
      staleSessionsDeleted: Math.max(0, (Number(staleBefore[0]?.count) || 0) - (Number(staleAfter[0]?.count) || 0)),
      staleChunksDeleted: Math.max(0, (Number(staleChunksBefore[0]?.count) || 0) - (Number(staleChunksAfter[0]?.count) || 0)),
    };
  });
