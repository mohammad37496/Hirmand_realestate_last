/**
 * Server-only redirect resolution.
 *
 * This lived as a plain exported helper inside `seo-redirects.ts`, which is a
 * server-function module. TanStack Start can only keep such a module out of
 * the browser bundle when *every* export is a server function, so this helper
 * dragged `@/lib/db` — and `node:fs` — into the client graph and broke every
 * route that imported a redirect server function. Only the nitro middleware
 * calls it, so it belongs in a `.server` module.
 */
import { dbSource, getSql } from "@/lib/db";

export async function resolvePublicRedirect(path: string) {
  if (dbSource === "unconfigured") return null;
  try {
    const sql = await getSql();
    const rows = await sql.query<Record<string, unknown>>(
      `select id,target_path,status_code
       from site_redirects
       where source_path=$1 and active=true
       limit 1`,
      [path.slice(0, 500)],
    );
    const row = rows[0];
    if (!row) return null;
    await sql
      .query(
        "update site_redirects set hit_count=hit_count+1,last_hit_at=current_timestamp where id=$1",
        [Number(row.id)],
      )
      .catch(() => {});
    return {
      targetPath: String(row.target_path),
      statusCode: Number(row.status_code) as 301 | 302 | 307 | 308,
    };
  } catch {
    return null;
  }
}
