import type { Sql } from "./db.ts";
import { publicPropertyVisibilitySql } from "./public-property-visibility.ts";

/** Resolve shareable slugs with the same visibility rule for both creation and retrieval. */
export async function getPublicSharedShortlistSlugs(sql: Sql, slugs: string[]): Promise<string[]> {
  if (!slugs.length) return [];
  const rows = await sql.query<{ slug: string }>(
    `select slug from properties where ${publicPropertyVisibilitySql()} and slug=any($1::text[])`,
    [slugs],
  );
  return rows.map((row) => row.slug);
}
