import { hasMediaUrlReferences, mediaReferenceNeedles, removeOrphanedVideoRenditionManifest } from "./media-reference-guard.server.ts";

export type MediaCleanupTransactionSql = {
  query<T = Record<string, unknown>>(statement: string, params?: unknown[]): Promise<T[]>;
};

export type MediaCleanupJob = {
  id: number;
  media_url: string;
  liara_key: string | null;
  status: string;
};

export type PreparedMediaCleanup =
  | { status: "completed" | "retained" | "missing" }
  | { status: "deleting"; job: MediaCleanupJob };

export function assertMediaCleanupDatabaseConfigured(source: string): void {
  if (source === "unconfigured") {
    throw new Error("Cannot verify media references while the database is unavailable.");
  }
}

export async function lockMediaReferenceWrites(sql: MediaCleanupTransactionSql): Promise<void> {
  await sql.query("select pg_advisory_xact_lock(74120261101::bigint)");
}

/** Per-object lock for storage writers; it composes with the global owner-table lock. */
export async function lockMediaObjectIdentity(sql: MediaCleanupTransactionSql, identity: string): Promise<void> {
  await sql.query("select pg_advisory_xact_lock(hashtextextended($1::text, 74120261101::bigint))", [identity]);
}

/** Refuse to recreate an object while any durable cleanup job owns its identity. */
export async function assertMediaObjectWritable(
  sql: MediaCleanupTransactionSql,
  mediaUrl: string,
  liaraKey: string | null = null,
): Promise<void> {
  const tokens = mediaReferenceNeedles(mediaUrl, liaraKey);
  const [blocked] = await sql.query<{ id: number; status: string }>(
    "select id,status from media_cleanup_jobs where reference_tokens && $1::text[] limit 1",
    [tokens],
  );
  if (blocked) {
    throw new Error(`Media object is protected by cleanup job ${blocked.id} (${blocked.status}) and cannot be recreated.`);
  }
}

export async function upsertMediaCleanupJob(
  sql: MediaCleanupTransactionSql,
  input: { mediaUrl: string; liaraKey: string | null; referenceTokens: string[] },
): Promise<Array<{ id: number }>> {
  const inserted = await sql.query<{ id: number }>(
    "insert into media_cleanup_jobs (media_url,liara_key,reference_tokens,status,attempts,last_error,next_attempt_at) values ($1,$2,$3,'pending',0,null,current_timestamp) on conflict (media_url) do update set liara_key=coalesce(excluded.liara_key,media_cleanup_jobs.liara_key),reference_tokens=array(select distinct refs.token from unnest(media_cleanup_jobs.reference_tokens || excluded.reference_tokens) as refs(token)),status=case when media_cleanup_jobs.status in ('deleting','completed') then media_cleanup_jobs.status else 'pending' end,attempts=case when media_cleanup_jobs.status in ('deleting','completed') then media_cleanup_jobs.attempts else 0 end,last_error=case when media_cleanup_jobs.status in ('deleting','completed') then media_cleanup_jobs.last_error else null end,next_attempt_at=case when media_cleanup_jobs.status in ('deleting','completed') then media_cleanup_jobs.next_attempt_at else current_timestamp end,updated_at=current_timestamp returning id",
    [input.mediaUrl, input.liaraKey, input.referenceTokens],
  );
  if (inserted.length) return inserted;
  // Keep the durable tombstone identity when a duplicate cleanup is queued.
  return sql.query<{ id: number }>("select id from media_cleanup_jobs where media_url=$1", [input.mediaUrl]);
}

/** Commit a durable tombstone before any non-transactional object-store deletion. */
export async function prepareMediaCleanupJobInTransaction(
  sql: MediaCleanupTransactionSql,
  jobId: number,
  enqueueRendition?: (url: string) => Promise<void>,
): Promise<PreparedMediaCleanup> {
  await lockMediaReferenceWrites(sql);
  const [job] = await sql.query<MediaCleanupJob>(
    "select id,media_url,liara_key,status from media_cleanup_jobs where id=$1 for update",
    [jobId],
  );
  if (!job) return { status: "missing" };
  if (job.status === "completed") return { status: "completed" };
  if (job.status === "deleting") return { status: "deleting", job };
  if (job.status !== "pending" && job.status !== "retained") return { status: "missing" };
  await lockMediaObjectIdentity(sql, job.media_url);
  if (enqueueRendition) {
    const manifest = await removeOrphanedVideoRenditionManifest(sql, job.media_url, job.liara_key);
    if (manifest.removed) {
      for (const renditionUrl of new Set(manifest.renditionUrls)) await enqueueRendition(renditionUrl);
    }
  }
  if (await hasMediaUrlReferences(sql, job.media_url, job.liara_key)) {
    await sql.query(
      "update media_cleanup_jobs set status='retained',last_error=null,next_attempt_at=current_timestamp + interval '1 hour',updated_at=current_timestamp where id=$1",
      [jobId],
    );
    return { status: "retained" };
  }
  if (job.liara_key || !job.media_url.startsWith("/api/media/")) {
    await sql.query("update media_cleanup_jobs set status='deleting',updated_at=current_timestamp where id=$1", [jobId]);
    return { status: "deleting", job: { ...job, status: "deleting" } };
  }
  const databaseId = job.media_url.slice("/api/media/".length).split(/[?#]/, 1)[0];
  if (databaseId) await sql.query("delete from media_objects where id=$1", [decodeURIComponent(databaseId)]);
  await sql.query("update media_cleanup_jobs set status='completed',last_error=null,updated_at=current_timestamp where id=$1", [jobId]);
  return { status: "completed" };
}

/** Serialize external deletion attempts on the job row after its tombstone committed. */
export async function deletePreparedMediaCleanupJobInTransaction(
  sql: MediaCleanupTransactionSql,
  jobId: number,
  deleteExternalObject: (job: MediaCleanupJob) => Promise<void>,
): Promise<"completed" | "missing"> {
  const [job] = await sql.query<MediaCleanupJob>(
    "select id,media_url,liara_key,status from media_cleanup_jobs where id=$1 for update",
    [jobId],
  );
  if (!job || job.status === "completed") return job ? "completed" : "missing";
  if (job.status !== "deleting") return "missing";
  await lockMediaObjectIdentity(sql, job.liara_key ? `liara://${job.liara_key}` : job.media_url);
  await deleteExternalObject(job);
  await sql.query(
    "update media_cleanup_jobs set status='completed',last_error=null,updated_at=current_timestamp where id=$1 and status='deleting'",
    [jobId],
  );
  return "completed";
}
