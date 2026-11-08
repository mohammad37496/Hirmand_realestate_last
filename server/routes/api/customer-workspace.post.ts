import { createError, defineEventHandler, getRequestHeaders, readBody, setHeader } from "h3";
import { z } from "zod";
import { dbSource, getSql } from "@/lib/db";
import { requireUserIdFromHeaders } from "@/lib/auth/verify.server";
import { assertSameOrigin } from "@/lib/admin-rate-limit.server";
import { customerWorkspaceHttpError } from "@/lib/customer-workspace-response.server";
import { requireCustomerWorkspaceDatabase } from "@/lib/customer-workspace-database.server.mjs";

const schema = z.object({
  ownerId: z.string().min(1).max(128),
  favorites: z.array(z.string().trim().min(1).max(220)).max(200).default([]),
  favoriteMeta: z.record(z.string(), z.object({
    tag: z.string().max(40).optional(),
    note: z.string().max(500).optional(),
  })).refine((value) => Object.keys(value).length <= 200).default({}),
  savedSearches: z.array(z.object({
    id: z.string().max(80),
    name: z.string().max(120),
    params: z.string().max(1500),
    alerts: z.boolean().optional(),
    lastCheckedAt: z.string().max(80).optional(),
  })).max(10).default([]),
  recentProperties: z.array(z.string().trim().min(1).max(220)).max(20).default([]),
});

export default defineEventHandler(async (event) => {
  setHeader(event, "Cache-Control", "private, no-store, max-age=0");
  setHeader(event, "Vary", "Cookie, Authorization");
  try {
    assertSameOrigin(event);
    const userId = await requireUserIdFromHeaders(new Headers(getRequestHeaders(event)));
    const body = schema.safeParse(await readBody(event).catch(() => null));
    if (!body.success) {
      throw createError({ statusCode: 400, statusMessage: body.error.issues[0]?.message || "فضای شخصی نامعتبر است." });
    }
    if (body.data.ownerId !== userId) {
      throw createError({ statusCode: 409, statusMessage: "Workspace account changed" });
    }
    requireCustomerWorkspaceDatabase(dbSource);

    const sql = await getSql();
    await sql.query(
      "insert into customer_workspace(user_id,favorites,favorite_meta,saved_searches,recent_properties,updated_at) values($1,$2::jsonb,$3::jsonb,$4::jsonb,$5::jsonb,current_timestamp) on conflict(user_id) do update set favorites=excluded.favorites,favorite_meta=excluded.favorite_meta,saved_searches=excluded.saved_searches,recent_properties=excluded.recent_properties,updated_at=current_timestamp",
      [
        userId,
        JSON.stringify(body.data.favorites),
        JSON.stringify(body.data.favoriteMeta),
        JSON.stringify(body.data.savedSearches),
        JSON.stringify(body.data.recentProperties),
      ],
    );
    return { success: true, updatedAt: new Date().toISOString() };
  } catch (error) {
    return customerWorkspaceHttpError(event, error);
  }
});
