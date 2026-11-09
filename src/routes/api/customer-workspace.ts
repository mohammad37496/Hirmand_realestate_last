import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { dbSource, getSql } from "@/lib/db";
import { requireUserIdFromHeaders } from "@/lib/auth/verify.server";
import { assertServerFnSameOrigin } from "@/lib/admin-rate-limit.server";
import {
  customerWorkspaceErrorResponse,
  customerWorkspacePrivateHeaders,
} from "@/lib/customer-workspace-response.server";
import { assertCustomerWorkspacePostOrigin } from "../../../server/utils/customer-workspace-origin";
import { requireCustomerWorkspaceDatabase } from "@/lib/customer-workspace-database.server.mjs";
import { saveCustomerWorkspaceWithRevision } from "@/lib/customer-workspace-cas.server.mjs";

const schema = z.object({
  ownerId: z.string().min(1).max(128),
  expectedRevision: z.string().regex(/^[1-9][0-9]{0,18}$/)
    .refine((value: string) => BigInt(value) <= 9223372036854775807n, "Invalid workspace revision")
    .nullable().default(null),
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

function forwardedRequestOrigin(request: Request) {
  const requestUrl = new URL(request.url);
  const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  if (!host) return requestUrl.origin;
  const protocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim()
    || requestUrl.protocol.slice(0, -1);
  return `${protocol}://${host}`;
}

async function getWorkspace(request: Request) {
  try {
    const userId = await requireUserIdFromHeaders(new Headers(request.headers));
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
    return Response.json(row ? {
      ownerId: userId,
      favorites: Array.isArray(row.favorites) ? row.favorites : [],
      favoriteMeta: row.favoriteMeta && typeof row.favoriteMeta === "object" ? row.favoriteMeta : {},
      savedSearches: Array.isArray(row.savedSearches) ? row.savedSearches : [],
      recentProperties: Array.isArray(row.recentProperties) ? row.recentProperties : [],
      updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
      revision: String(row.revision),
    } : {
      ownerId: userId,
      favorites: [],
      favoriteMeta: {},
      savedSearches: [],
      recentProperties: [],
      updatedAt: null,
      revision: null,
    }, { headers: customerWorkspacePrivateHeaders() });
  } catch (error) {
    return customerWorkspaceErrorResponse(error);
  }
}

async function saveWorkspace(request: Request) {
  try {
    assertCustomerWorkspacePostOrigin({
      origin: request.headers.get("origin"),
      host: request.headers.get("x-forwarded-host") ?? request.headers.get("host"),
      requestOrigin: forwardedRequestOrigin(request),
    });
    assertServerFnSameOrigin((name) => request.headers.get(name));

    const userId = await requireUserIdFromHeaders(new Headers(request.headers));
    const rawBody = await request.json().catch(() => null);
    const rawBodyObject: Record<string, unknown> | null = rawBody && typeof rawBody === "object" && !Array.isArray(rawBody)
      ? rawBody as Record<string, unknown>
      : null;
    // Preserve the explicit cross-account conflict response even for older or
    // malformed clients that do not yet send the optimistic revision field.
    if (rawBodyObject && typeof rawBodyObject.ownerId === "string" && rawBodyObject.ownerId !== userId) {
      throw Object.assign(new Error("Workspace account changed"), { statusCode: 409 });
    }
    const body = schema.safeParse(rawBody);
    if (!body.success) {
      throw Object.assign(new Error(body.error.issues[0]?.message || "فضای شخصی نامعتبر است."), { statusCode: 400 });
    }
    if (body.data.ownerId !== userId) {
      throw Object.assign(new Error("Workspace account changed"), { statusCode: 409 });
    }
    requireCustomerWorkspaceDatabase(dbSource);

    const sql = await getSql();
    const saved = await saveCustomerWorkspaceWithRevision(sql, userId, body.data, body.data.expectedRevision);
    if (!saved.success) {
      throw Object.assign(new Error("Workspace revision conflict"), { statusCode: 409 });
    }
    return Response.json({ success: true, revision: saved.revision, updatedAt: new Date().toISOString() }, {
      headers: customerWorkspacePrivateHeaders(),
    });
  } catch (error) {
    return customerWorkspaceErrorResponse(error);
  }
}

export const Route = createFileRoute("/api/customer-workspace")({
  server: {
    handlers: {
      GET: ({ request }) => getWorkspace(request),
      POST: ({ request }) => saveWorkspace(request),
    },
  },
});
