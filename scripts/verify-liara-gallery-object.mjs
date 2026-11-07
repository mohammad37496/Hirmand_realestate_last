const publicBaseUrl = process.env.LIARA_PUBLIC_URL ?? "https://hirmandrealestate.ir";
const objectUrl = "https://storage.c2.liara.site/hirmand-realestate/properties/uploads/gallery/1792769572233-1d621215-3742-4f76-864c-7cbc8fc17fb1-photo_2026-10-19_12-57-33-watermarked.webp";

const proxyUrl = new URL("/api/media-proxy", publicBaseUrl);
proxyUrl.searchParams.set("url", objectUrl);

const response = await fetch(proxyUrl, {
  redirect: "follow",
  signal: AbortSignal.timeout(25_000),
});
const contentType = response.headers.get("content-type") ?? "";
const bytes = new Uint8Array(await response.arrayBuffer());
const ascii = (start, end) => Buffer.from(bytes.subarray(start, end)).toString("ascii");
const validWebp = bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
const result = {
  requestedUrl: proxyUrl.toString(),
  finalUrl: response.url,
  status: response.status,
  redirected: response.redirected,
  contentType,
  contentLengthHeader: response.headers.get("content-length"),
  responseBytes: bytes.length,
  validWebp,
};

console.log("[liara-gallery-verify] " + JSON.stringify(result, null, 2));
if (!response.ok || !contentType.toLowerCase().startsWith("image/") || !validWebp) {
  if (!validWebp) {
    result.responsePreview = Buffer.from(bytes.subarray(0, 400)).toString("utf8").replace(/\s+/g, " ").slice(0, 400);
  }
  console.error("[liara-gallery-verify] FAILED " + JSON.stringify(result, null, 2));
  process.exitCode = 1;
} else {
  console.log("[liara-gallery-verify] PASS: the reported Liara object is served as a valid image");
}
