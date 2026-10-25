import { detectRasterImageType, isAllowedDivarImageUrl, isDivarRemoteHost, isVideoUrl } from "./media.ts";
import { DIVAR_MAX_PUBLISHED_IMAGES } from "./divar-status.ts";

const DIVAR_WEB = "https://divar.ir";
const MAX_IMAGES = DIVAR_MAX_PUBLISHED_IMAGES;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_VIDEO_BYTES = 128 * 1024 * 1024;

export type DivarImageDownload = {
  images: string[];
  stored: number;
  failures: { source: string; reason: string }[];
  sourceImages: string[];
};

export type DivarMediaDependencies = {
  storeMedia(input: { pathname: string; data: Buffer | Uint8Array; contentType: string; allowLegacyBlob: false }): Promise<{ url: string; storage?: string; id?: string | null }>;
  mediaUrlForBrowser(value: string, contentType?: string): string;
  deleteStoredMedia(url: string, options?: { throwOnFailure?: boolean }): Promise<void>;
};

export async function downloadDivarMedia(token: string, urls: string[], dependencies: DivarMediaDependencies): Promise<DivarImageDownload> {
  const candidatesFor = (source: string): Array<{
    label: string;
    url: string;
    timeoutMs: number;
    direct: boolean;
    headers: Record<string, string>;
  }> => [
    {
      label: "direct",
      url: source,
      timeoutMs: isVideoUrl(source) ? 30_000 : 8_000,
      direct: true,
      headers: {
        accept: "image/avif,image/webp,image/apng,image/png,image/jpeg,image/*,video/mp4,video/webm,video/quicktime;q=0.8,*/*;q=0.5",
        "accept-language": "fa-IR,fa;q=0.9,en;q=0.8",
        referer: DIVAR_WEB + "/v/" + token,
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/153.0.0.0 Safari/537.36",
      },
    },
  ];

  const readBoundedResponse = async (response: Response, video: boolean): Promise<Buffer> => {
    const maxBytes = video ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
    const declaredLength = Number(response.headers.get("content-length") ?? 0);
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      throw new Error(video ? "حجم ویدئو بیش از ۱۲۸ مگابایت بود" : "حجم تصویر بیش از ۱۲ مگابایت بود");
    }
    if (!response.body) throw new Error("پاسخ رسانه بدون بدنه بود");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel();
          throw new Error(video ? "حجم ویدئو بیش از ۱۲۸ مگابایت بود" : "حجم تصویر بیش از ۱۲ مگابایت بود");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total);
  };

  const fetchCandidate = async (
    candidate: { url: string; headers: Record<string, string>; timeoutMs: number; direct: boolean },
  ): Promise<Response> => {
    const initial = new URL(candidate.url);
    const initialHost = initial.hostname.toLowerCase();
    const isAllowedRedirect = (next: URL) => {
      if (next.protocol !== "https:") return false;
      if (candidate.direct) return isAllowedDivarImageUrl(next.toString());
      const host = next.hostname.toLowerCase();
      return host === initialHost || isDivarRemoteHost(next.toString());
    };

    let lastError: unknown = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        let current = initial;
        let retryableResponse = false;
        for (let redirects = 0; redirects <= 3; redirects += 1) {
          const response = await fetch(current.toString(), {
            redirect: "manual",
            headers: candidate.headers,
            signal: AbortSignal.timeout(candidate.timeoutMs),
          });
          if (response.status < 300 || response.status >= 400) {
            const retryable = response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500;
            if (retryable && attempt < 2) {
              lastError = new Error(`Divar media request failed: HTTP ${response.status}`);
              await response.body?.cancel().catch(() => undefined);
              retryableResponse = true;
              break;
            }
            return response;
          }
          const location = response.headers.get("location");
          if (!location) throw new Error("ریدایرکت بدون مقصد");
          const next = new URL(location, current);
          if (!isAllowedRedirect(next)) throw new Error("ریدایرکت به میزبان غیرمجاز");
          current = next;
        }
        if (retryableResponse) {
          await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
          continue;
        }
        throw new Error("تعداد ریدایرکت بیش از حد مجاز");
      } catch (error) {
        lastError = error;
        if (attempt === 2) break;
        await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
      }
    }
    throw lastError instanceof Error ? lastError : new Error("دریافت تصویر ناموفق بود");
  };

  const downloadOne = async (source: string, index: number) => {
    let lastReason = "رسانه قابل دریافت نبود";
    const videoByUrl = isVideoUrl(source);

    for (const candidate of candidatesFor(source)) {
      let storedUrlForCleanup: string | null = null;
      try {
        const response = await fetchCandidate(candidate);

        if (!response.ok) {
          lastReason = candidate.label + ": HTTP " + response.status;
          continue;
        }

        const headerType = (response.headers.get("content-type") ?? "").split(";", 1)[0]!.trim().toLowerCase();
        const isVideo = videoByUrl || headerType.startsWith("video/");
        const bytes = await readBoundedResponse(response, isVideo);
        if (!bytes.length) {
          lastReason = candidate.label + ": فایل خالی بود";
          continue;
        }

        let type: string = detectRasterImageType(bytes);
        if (!type && isVideo) {
          // Validate video container signatures instead of trusting a remote
          // content-type header (which could otherwise store an HTML error page).
          if (bytes.length >= 12 && bytes.toString("ascii", 4, 8) === "ftyp") {
            type = bytes.toString("ascii", 8, 12).toLowerCase() === "qt  " ? "video/quicktime" : "video/mp4";
          } else if (bytes.length >= 4 && bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) {
            type = "video/webm";
          } else if (bytes.length >= 4 && bytes.toString("ascii", 0, 4) === "OggS") {
            type = "video/ogg";
          }
        }
        if (!type) {
          lastReason = candidate.label + ": محتوای دریافتی رسانه معتبر نبود";
          continue;
        }

        const extension = type === "video/quicktime" ? "mov"
          : type === "video/webm" ? "webm"
          : type === "video/ogg" ? "ogg"
          : type === "video/mp4" ? "mp4"
          : type === "image/png"
            ? "png"
            : type === "image/webp"
              ? "webp"
              : type === "image/avif"
                ? "avif"
                : type === "image/gif"
                  ? "gif"
                  : "jpg";

        const stored = await dependencies.storeMedia({
          pathname:
            "properties/divar/" +
            token +
            "/" +
            String(index + 1).padStart(2, "0") +
            "-" +
            crypto.randomUUID() +
            "." +
            extension,
          data: bytes,
          contentType: type,
          // Divar imports should use configured Liara storage or our database,
          // never silently offload to a foreign third-party Blob service.
          allowLegacyBlob: false,
        });
        storedUrlForCleanup = stored.url;
        const browserUrl = dependencies.mediaUrlForBrowser(stored.url, type);
        if (!browserUrl || (stored.url.startsWith("https://") && browserUrl === stored.url)) {
          throw new Error("نشانی امن نمایش رسانه از فضای ذخیره‌سازی ساخته نشد");
        }
        storedUrlForCleanup = null;
        return { index, url: browserUrl, failure: null as null | { source: string; reason: string } };
      } catch (error) {
        if (storedUrlForCleanup) {
          await dependencies.deleteStoredMedia(storedUrlForCleanup, { throwOnFailure: true }).catch((cleanupError) => {
            console.warn("[divar] could not clean up media after URL conversion failure", cleanupError instanceof Error ? cleanupError.message : "unknown error");
          });
        }
        lastReason =
          candidate.label +
          ": " +
          (error instanceof Error ? error.message : "خطای دریافت تصویر");
      }
    }

    return {
      index,
      url: null,
      failure: { source, reason: lastReason },
    };
  };

  const results: Array<{
    index: number;
    url: string | null;
    failure: { source: string; reason: string } | null;
  }> = [];

  if (urls.some((url) => !isAllowedDivarImageUrl(url))) {
    throw new Error("فهرست رسانه‌های آگهی شامل نشانی غیرمجاز است؛ برای جلوگیری از درخواست ناامن، دریافت متوقف شد.");
  }
  const safeUrls = Array.from(new Set(urls));
  if (safeUrls.length > MAX_IMAGES) {
    throw new Error(`این آگهی ${safeUrls.length} رسانهٔ یکتا دارد و از سقف فعلی ${MAX_IMAGES} رسانه بیشتر است؛ هیچ رسانه‌ای حذف نشد و برای جلوگیری از انتشار ناقص، عملیات متوقف شد.`);
  }
  const concurrency = 6;

  for (let startIndex = 0; startIndex < safeUrls.length; startIndex += concurrency) {
    const batch = safeUrls.slice(startIndex, startIndex + concurrency);
    const batchResults = await Promise.all(
      batch.map((source, offset) => downloadOne(source, startIndex + offset)),
    );
    results.push(...batchResults);
  }

  results.sort((a, b) => a.index - b.index);

  // Only keep media that was successfully copied to Hirmand storage.
  // Publishing a foreign Divar URL would make the public gallery dependent on
  // an international/external request path.
  const images: string[] = [];
  let stored = 0;
  const failures: { source: string; reason: string }[] = [];

  for (const result of results) {
    if (result.url) {
      images.push(result.url);
      stored += 1;
      continue;
    }
    if (result.failure) failures.push(result.failure);
  }

  // A failed import/repair must not leave the successfully downloaded subset
  // orphaned in durable storage. The caller will keep the existing gallery (if
  // any) untouched and can retry the complete operation later.
  if (failures.length > 0 && images.length > 0) {
    const cleanup = await Promise.allSettled(images.map((url) => dependencies.deleteStoredMedia(url, { throwOnFailure: true })));
    const cleanupFailures = cleanup.filter((result) => result.status === "rejected").length;
    if (cleanupFailures > 0) {
      console.warn("[divar] failed to clean up partial media import", { cleanupFailures });
    }
  }

  return { images, stored, failures, sourceImages: safeUrls };
}
