import { resolvePublicRedirect } from "@/lib/seo-redirects.server";

type RedirectEvent = {
  url: URL;
  req: { method: string };
};

export default async function seoRedirectMiddleware(
  event: RedirectEvent,
  next: () => unknown | Promise<unknown>,
): Promise<unknown> {
  const method = (event.req.method ?? "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") return next();

  const path = event.url.pathname;
  if (path.startsWith("/api/") || path.startsWith("/__grok/") || path === "/admin" || path.startsWith("/admin/")) return next();

  const match = await resolvePublicRedirect(path + event.url.search);
  if (!match) return next();

  const location = match.targetPath.startsWith("http://") || match.targetPath.startsWith("https://")
    ? match.targetPath
    : new URL(match.targetPath, event.url.origin).toString();

  return new Response(null, {
    status: match.statusCode,
    headers: {
      location,
      "cache-control": "public, max-age=300",
    },
  });
}
