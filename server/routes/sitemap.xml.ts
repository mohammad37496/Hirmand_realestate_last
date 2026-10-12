/**
 * Dynamic sitemap at /sitemap.xml
 * Includes: home, all neighborhood area pages, and published properties.
 */
import { defineEventHandler, setResponseHeader } from "h3";
import { allAreas, areaPath } from "../../src/lib/areas";
import { TEAM } from "../../src/lib/site";
import { propertyPath } from "../../src/lib/property-path";
import { resolveDatabaseUrl } from "../../scripts/resolve-database-url.mjs";

const FINANCE_TOOL_PATHS = [
  "/tools/rahn-rent",
  "/tools/commission",
  "/tools/deposit",
  "/tools/loan",
] as const;

const SITE = (process.env.VITE_SITE_URL || "https://www.hirmandrealestate.ir").replace(/\/$/, "");

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function urlEntry(
  loc: string,
  changefreq: string,
  priority: string,
  lastmod?: string,
  images: string[] = [],
) {
  const lm = lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : "";
  const imageXml = images
    .filter((src) => /^https?:\/\//i.test(src))
    .slice(0, 10)
    .map((src) => `\n    <image:image><image:loc>${escapeXml(src)}</image:loc></image:image>`)
    .join("");
  return `  <url>\n    <loc>${escapeXml(loc)}</loc>${lm}${imageXml}\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
}

async function loadPropertyUrls(): Promise<{ loc: string; lastmod?: string; images: string[] }[]> {
  const databaseUrl = resolveDatabaseUrl().url;
  if (!databaseUrl) return [];

  try {
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: databaseUrl, max: 1, idleTimeoutMillis: 3000, connectionTimeoutMillis: 3000 });
    try {
      const res = await pool.query<{ id: string; slug: string; updated_at: Date | string | null; images: unknown }>(
        `select id, slug, updated_at, images from properties
         where deleted_at is null
           and status = 'published'
           and (unpublish_at is null or unpublish_at > current_timestamp)
         order by published_at desc nulls last, created_at desc
         limit 49000`,
      );
      return res.rows.map((row) => {
        const lastmod =
          row.updated_at != null
            ? new Date(row.updated_at).toISOString().slice(0, 10)
            : undefined;
        let images: string[] = [];
        if (Array.isArray(row.images)) {
          images = row.images.filter((src): src is string => typeof src === "string");
        } else if (typeof row.images === "string") {
          try {
            const parsed = JSON.parse(row.images);
            if (Array.isArray(parsed)) {
              images = parsed.filter((src): src is string => typeof src === "string");
            }
          } catch {
            images = [];
          }
        }

        return {
          loc: `${SITE}${propertyPath({ id: String(row.id), slug: String(row.slug) })}`,
          lastmod,
          images,
        };
      });
    } finally {
      await pool.end().catch(() => undefined);
    }
  } catch (err) {
    console.error("[sitemap] property query failed", err);
    return [];
  }
}

export default defineEventHandler(async (event) => {
  const today = new Date().toISOString().slice(0, 10);
  const entries: string[] = [];

  entries.push(urlEntry(`${SITE}/`, "daily", "1.0", today));
  entries.push(urlEntry(`${SITE}/properties`, "daily", "0.9", today));
  entries.push(urlEntry(`${SITE}/tools`, "monthly", "0.7", today));
  entries.push(urlEntry(`${SITE}/consultants`, "weekly", "0.7", today));
  entries.push(urlEntry(`${SITE}/budget-match`, "daily", "0.8", today));

  for (const path of FINANCE_TOOL_PATHS) {
    entries.push(urlEntry(`${SITE}${path}`, "monthly", "0.6", today));
  }

  for (const person of TEAM) {
    entries.push(urlEntry(`${SITE}/consultants/${encodeURIComponent(person.id)}`, "weekly", "0.6", today));
  }

  for (const area of allAreas()) {
    entries.push(urlEntry(`${SITE}${areaPath(area.slug)}`, "weekly", "0.7", today));
  }

  const properties = await loadPropertyUrls();
  for (const item of properties) {
    entries.push(urlEntry(item.loc, "weekly", "0.8", item.lastmod ?? today, item.images));
  }

  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${entries.join("\n")}\n</urlset>\n`;

  setResponseHeader(event, "content-type", "application/xml; charset=utf-8");
  setResponseHeader(event, "cache-control", "public, s-maxage=3600, stale-while-revalidate=86400");
  return body;
});
