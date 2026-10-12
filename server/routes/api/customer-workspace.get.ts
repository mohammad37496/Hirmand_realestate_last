import { createError, defineEventHandler } from "h3";
import { dbSource, getSql } from "@/lib/db";
import { requireUserId } from "@/lib/auth/verify.server";

export default defineEventHandler(async () => {
  const userId = await requireUserId();
  if (dbSource === "unconfigured") {
    return { favorites: [], favoriteMeta: {}, savedSearches: [], recentProperties: [], updatedAt: null };
  }

  const sql = await getSql();
  const rows = await sql.query<{
    favorites: unknown;
    favoriteMeta: unknown;
    savedSearches: unknown;
    recentProperties: unknown;
    updatedAt: string;
  }>("select favorites,\"favoriteMeta\",saved_searches as \"savedSearches\",recent_properties as \"recentProperties\",updated_at as \"updatedAt\" from customer_workspace where user_id=$1 limit 1",[userId]);

  const row = rows[0];
  if (!row) return { favorites: [], favoriteMeta: {}, savedSearches: [], recentProperties: [], updatedAt: null };
  return {
    favorites: Array.isArray(row.favorites) ? row.favorites : [],
    favoriteMeta: row.favoriteMeta && typeof row.favoriteMeta === "object" ? row.favoriteMeta : {},
    savedSearches: Array.isArray(row.savedSearches) ? row.savedSearches : [],
    recentProperties: Array.isArray(row.recentProperties) ? row.recentProperties : [],
    updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
  };
});
