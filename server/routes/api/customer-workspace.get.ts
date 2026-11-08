import { defineEventHandler, getRequestHeaders, setHeader } from "h3";
import { dbSource, getSql } from "@/lib/db";
import { requireUserIdFromHeaders } from "@/lib/auth/verify.server";
import { customerWorkspaceHttpError } from "@/lib/customer-workspace-response.server";
import { requireCustomerWorkspaceDatabase } from "@/lib/customer-workspace-database.server.mjs";

export default defineEventHandler(async (event) => {
  setHeader(event, "Cache-Control", "private, no-store, max-age=0");
  setHeader(event, "Vary", "Cookie, Authorization");
  try {
    const userId = await requireUserIdFromHeaders(new Headers(getRequestHeaders(event)));
    requireCustomerWorkspaceDatabase(dbSource);

    const sql = await getSql();
    const rows = await sql.query<{
      favorites: unknown;
      favoriteMeta: unknown;
      savedSearches: unknown;
      recentProperties: unknown;
      updatedAt: string;
      revision: string;
    }>(
      `select favorites,favorite_meta as "favoriteMeta",saved_searches as "savedSearches",
        recent_properties as "recentProperties",updated_at as "updatedAt",revision::text as revision
       from customer_workspace where user_id=$1 limit 1`,
      [userId],
    );

    const row = rows[0];
    if (!row) {
      return {
        ownerId: userId,
        favorites: [],
        favoriteMeta: {},
        savedSearches: [],
        recentProperties: [],
        updatedAt: null,
        revision: null,
      };
    }
    return {
      ownerId: userId,
      favorites: Array.isArray(row.favorites) ? row.favorites : [],
      favoriteMeta: row.favoriteMeta && typeof row.favoriteMeta === "object" ? row.favoriteMeta : {},
      savedSearches: Array.isArray(row.savedSearches) ? row.savedSearches : [],
      recentProperties: Array.isArray(row.recentProperties) ? row.recentProperties : [],
      updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
      revision: String(row.revision),
    };
  } catch (error) {
    return customerWorkspaceHttpError(event, error);
  }
});
