const BASE_URL = new URL(process.argv[2] || process.env.BASE_URL || "https://hirmandrealestate.ir");
BASE_URL.pathname = "/";
BASE_URL.search = "";
BASE_URL.hash = "";
if (BASE_URL.protocol !== "https:") throw new Error("Live smoke requires HTTPS.");

const TIMEOUT_MS = 30000;
const checks = [];
async function request(url, label) {
  const response = await fetch(url, {
    redirect: "follow",
    headers: { "user-agent": "Hirmand-Live-Smoke/1.0" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    const body = (await response.text()).slice(0, 240).replace(/\\s+/g, " ");
    throw new Error(label + " returned HTTP " + response.status + ": " + body);
  }
  return response;
}
function record(name, detail) {
  checks.push(name);
  console.log("[live-smoke] PASS " + name + (detail ? " · " + detail : ""));
}
function requireCondition(value, message) {
  if (!value) throw new Error(message);
}
function sameOriginAssets(html, pageUrl) {
  const values = [...html.matchAll(/(?:src|href)=["']([^"'#]+)["']/gi)].map((match) => match[1]);
  return values
    .map((value) => {
      try { return new URL(value, pageUrl); } catch { return null; }
    })
    .filter((url) => url && url.origin === BASE_URL.origin && /\\.(?:css|js)(?:$|\\?)/i.test(url.pathname + url.search));
}
function propertyDetailUrl(html, pageUrl) {
  const links = [...html.matchAll(/href=["']([^"'#]+)["']/gi)].map((match) => match[1]);
  for (const link of links) {
    try {
      const url = new URL(link, pageUrl);
      if (url.origin === BASE_URL.origin && /^\\/properties\\/[^/]+\\/?$/.test(decodeURIComponent(url.pathname))) return url;
    } catch { /* Ignore malformed links in the document. */ }
  }
  return null;
}
function firstImageUrl(html, pageUrl) {
  const tags = [...html.matchAll(/<img\\b[^>]*>/gi)].map((match) => match[0]);
  for (const tag of tags) {
    const src = tag.match(/(?:src|data-src)=["']([^"']+)["']/i)?.[1];
    if (!src || src.startsWith("data:")) continue;
    try {
      const url = new URL(src, pageUrl);
      if (url.protocol === "https:" || url.origin === BASE_URL.origin) return url;
    } catch { /* Ignore malformed image references. */ }
  }
  return null;
}

async function main() {
  const homeResponse = await request(BASE_URL, "homepage");
  const homeHtml = await homeResponse.text();
  requireCondition(/<html[\\s>]/i.test(homeHtml), "Homepage did not return an HTML document.");
  requireCondition(!new URL(homeResponse.url).hostname.startsWith("www."), "Homepage did not settle on the no-www canonical host.");
  record("homepage", homeResponse.status + " · " + homeResponse.url);

  const wwwUrl = new URL(BASE_URL);
  wwwUrl.hostname = "www." + wwwUrl.hostname;
  const wwwResponse = await request(wwwUrl, "www canonical redirect");
  await wwwResponse.body?.cancel();
  requireCondition(new URL(wwwResponse.url).hostname === BASE_URL.hostname, "www host did not redirect to the no-www canonical host.");
  record("www → no-www canonical redirect", wwwResponse.url);

  const propertiesResponse = await request(new URL("/properties", BASE_URL), "/properties");
  const propertiesHtml = await propertiesResponse.text();
  requireCondition(/<html[\\s>]/i.test(propertiesHtml), "/properties did not return an HTML document.");
  record("/properties", propertiesResponse.status);

  const healthResponse = await request(new URL("/api/health", BASE_URL), "/api/health");
  const health = await healthResponse.json();
  requireCondition(health.status === "ok" && health.service === "hirmand-real-estate", "Health API returned an unexpected payload.");
  record("/api/health", health.status);

  const musicResponse = await request(new URL("/api/music", BASE_URL), "/api/music");
  const music = await musicResponse.json();
  requireCondition(Array.isArray(music.tracks), "Music API did not return a tracks array.");
  record("/api/music", music.tracks.length + " track(s)");

  const assets = sameOriginAssets(homeHtml, homeResponse.url);
  const css = assets.find((url) => url.pathname.endsWith(".css"));
  const js = assets.find((url) => url.pathname.endsWith(".js"));
  requireCondition(css && js, "Homepage did not expose same-origin CSS and JavaScript assets.");
  const [cssResponse, jsResponse] = await Promise.all([
    request(css, "homepage CSS asset"),
    request(js, "homepage JavaScript asset"),
  ]);
  await Promise.all([cssResponse.body?.cancel(), jsResponse.body?.cancel()]);
  record("homepage CSS/JS assets", css.pathname + " · " + js.pathname);

  let detailUrl = propertyDetailUrl(propertiesHtml, propertiesResponse.url);
  if (!detailUrl) {
    const sitemapResponse = await request(new URL("/sitemap.xml", BASE_URL), "sitemap");
    const sitemap = await sitemapResponse.text();
    const match = sitemap.match(/<loc>\\s*(https?:[^<]+\\/properties\\/[^<]+)<\\/loc>/i);
    if (match) detailUrl = new URL(match[1]);
  }
  requireCondition(detailUrl, "No published property detail URL was discoverable from /properties or sitemap.xml.");
  const detailResponse = await request(detailUrl, "property detail");
  const detailHtml = await detailResponse.text();
  requireCondition(/<h1[\\s>]/i.test(detailHtml) || /property-detail-title-block/i.test(detailHtml), "Property detail page has no visible title marker.");
  record("property detail", detailUrl.pathname);

  const imageUrl = firstImageUrl(detailHtml, detailResponse.url);
  requireCondition(imageUrl, "Property detail page did not expose an image/media URL.");
  const imageResponse = await request(imageUrl, "property media");
  const contentType = imageResponse.headers.get("content-type") || "";
  requireCondition(/^(image|video)\\//i.test(contentType), "Property media returned unexpected content-type: " + contentType);
  await imageResponse.body?.cancel();
  record("property media", contentType + " · " + imageUrl.pathname);

  console.log("[live-smoke] " + checks.length + " checks passed.");
}

main().catch((error) => {
  console.error("[live-smoke] FAIL " + (error instanceof Error ? error.stack || error.message : String(error)));
  process.exitCode = 1;
});
