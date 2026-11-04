const baseUrl = (process.env.LIARA_PUBLIC_URL || "https://hirmandrealestate.ir").replace(/\/+$/, "");
const expectedCommit = process.env.EXPECTED_DEPLOYMENT_SHA?.trim();
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

if (!expectedCommit || !/^[a-f0-9]{40}$/i.test(expectedCommit)) {
  throw new Error("EXPECTED_DEPLOYMENT_SHA must be the full Git commit SHA.");
}

async function fetchText(url) {
  const response = await fetch(url, {
    cache: "no-store",
    headers: { "cache-control": "no-cache", pragma: "no-cache" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error("GET " + url + " returned HTTP " + response.status);
  return { url: response.url, text: await response.text() };
}

async function inspectPublishedAssets(pageHtml, pageUrl) {
  const pageOrigin = new URL(pageUrl).origin;
  const pending = [];
  const seen = new Set();
  const scripts = [];
  const styles = [];
  const addAsset = (reference, parentUrl) => {
    try {
      const url = new URL(reference, parentUrl);
      if (url.origin !== pageOrigin) return;
      if (!/\.(?:js|css)$/.test(url.pathname) || seen.has(url.href)) return;
      seen.add(url.href);
      pending.push(url.href);
    } catch {
      // Ignore non-URL and external references in generated HTML and bundles.
    }
  };

  const htmlAssetPattern = /(?:href|src)=["']([^"']+\.(?:css|js)(?:\?[^"']*)?)["']/g;
  for (const match of pageHtml.matchAll(htmlAssetPattern)) addAsset(match[1], pageUrl);

  for (let index = 0; index < pending.length && index < 100; index += 1) {
    const assetUrl = pending[index];
    const asset = await fetchText(assetUrl);
    if (assetUrl.split("?")[0].endsWith(".css")) {
      styles.push(asset.text);
      continue;
    }
    scripts.push(asset.text);
    const nestedAssetPattern = /["']([^"'\s]+\.(?:css|js)(?:\?[^"'\s]*)?)["']/g;
    for (const match of asset.text.matchAll(nestedAssetPattern)) addAsset(match[1], assetUrl);
  }

  return {
    cardCode: pageHtml.includes("pcard-mobile-list") || scripts.some((script) => script.includes("pcard-mobile-list")),
    listControl: pageHtml.includes("نمایش فهرستی فایل‌ها") || scripts.some((script) => script.includes("نمایش فهرستی فایل‌ها")),
    cardStyles: styles.some((style) => style.includes(".pcard-mobile-list")) || pageHtml.includes(".pcard-mobile-list"),
  };
}

let lastError;
for (let attempt = 1; attempt <= 8; attempt += 1) {
  try {
    const releaseUrl = new URL("/deployment.json?revision=" + expectedCommit, baseUrl).href;
    const releaseResponse = await fetchText(releaseUrl);
    const release = JSON.parse(releaseResponse.text);
    if (release.commit !== expectedCommit) {
      throw new Error("Liara serves commit " + String(release.commit) + "; expected " + expectedCommit);
    }

    const propertiesUrl = new URL("/properties?deployment=" + expectedCommit, baseUrl).href;
    const pageResponse = await fetchText(propertiesUrl);
    const published = await inspectPublishedAssets(pageResponse.text, pageResponse.url);
    if (!published.cardCode) throw new Error("Published property route does not contain the shared mobile card code.");
    if (!published.cardStyles) throw new Error("Published assets do not contain the mobile property list styles.");
    if (!published.listControl) throw new Error("Published property route does not expose the Persian list view control.");

    process.stdout.write(
      "Live Liara release verified: " + release.commit +
      "; property route HTTP 200; mobile card code, CSS and list control are present.\n",
    );
    process.exit(0);
  } catch (error) {
    lastError = error;
    process.stderr.write("Live release check " + attempt + "/8: " + String(error?.message || error) + "\n");
    if (attempt < 8) await delay(10_000);
  }
}

throw new Error("Live Liara release verification failed: " + String(lastError?.message || lastError));
