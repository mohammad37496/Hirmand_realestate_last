const DEFAULT_SITE_URL = "https://hirmandrealestate.ir";
const CANONICAL_HOST = "hirmandrealestate.ir";

/** Keep first-party canonical URLs on the HTTPS, non-www host. */
/** @param {string | undefined | null} value */
export function canonicalSiteUrl(value) {
  let url;
  try {
    url = new URL(typeof value === "string" && value.trim() ? value.trim() : DEFAULT_SITE_URL);
  } catch {
    url = new URL(DEFAULT_SITE_URL);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    url = new URL(DEFAULT_SITE_URL);
  }

  if (url.hostname.toLowerCase() === CANONICAL_HOST ||
      url.hostname.toLowerCase() === `www.${CANONICAL_HOST}`) {
    url.protocol = "https:";
    url.hostname = CANONICAL_HOST;
    url.port = "";
  }

  return url.origin;
}
