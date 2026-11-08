import { createError, defineEventHandler, getHeader, getRequestHeaders, getRequestURL, readBody, setHeader } from "h3";
import { z } from "zod";
import { dbSource, getSql } from "@/lib/db";
import { requireUserIdFromHeaders } from "@/lib/auth/verify.server";
import { assertSameOrigin } from "@/lib/admin-rate-limit.server";
import { customerWorkspaceHttpError } from "@/lib/customer-workspace-response.server";
import { assertCustomerWorkspacePostOrigin } from "../../utils/customer-workspace-origin";
import { requireCustomerWorkspaceDatabase } from "@/lib/customer-workspace-database.server.mjs";
import { saveCustomerWorkspaceWithRevision } from "@/lib/customer-workspace-cas.server.mjs";

const schema = z.object({
  ownerId: z.string().min(1).max(128),
  expectedRevision: z.string().regex(/^[1-9][0-9]{0,18}$/)
    .refine((value) => BigInt(value) <= 9223372036854775807n, "Invalid workspace revision")
    .nullable(),
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
    assertCustomerWorkspacePostOrigin({
      origin: getHeader(event, "origin"),
      host: getHeader(event, "x-forwarded-host") ?? getHeader(event, "host"),
      requestOrigin: getRequestURL(event, { xForwardedHost: true, xForwardedProto: true }).origin,
    });
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
    const saved = await saveCustomerWorkspaceWithRevision(sql, userId, body.data, body.data.expectedRevision);
    if (!saved.success) {
      throw createError({ statusCode: 409, statusMessage: "Workspace revision conflict" });
    }
    return { success: true, revision: saved.revision, updatedAt: new Date().toISOString() };
  } catch (error) {
    return customerWorkspaceHttpError(event, error);
  }
});
