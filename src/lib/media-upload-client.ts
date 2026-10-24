import { isAllowedMediaRef } from "./media.ts";
import type { PropertyWatermarkPosition } from "@/lib/property-watermark";

/**
 * Browser side of the chunked upload protocol.
 *
 * Progress comes from slices the client actually pushed, never from a promise
 * that is still waiting on a third party, so the UI cannot lie about being at
 * 0% while nothing is happening.
 */

export type ChunkedUploadResult = {
  uploadId: string;
  totalChunks: number;
  totalBytes: number;
  response: Record<string, unknown>;
};

type BeginResponse = {
  uploadId?: string;
  chunkSize?: number;
  totalChunks?: number;
  totalBytes?: number;
  maxBytes?: number;
  statusMessage?: string;
  message?: string;
  completed?: boolean;
  assembled?: boolean;
  response?: Record<string, unknown>;
};

/**
 * Read a possible JSON body from a response, returning null when the response
 * is empty, unreadable, or not JSON.
 */
async function readJson(response: Response): Promise<unknown> {
  let body = "";
  try {
    body = await response.text();
  } catch {
    return null;
  }
  if (!body.trim()) return null;

  try {
    return JSON.parse(body) as unknown;
  } catch {
    // Liara or an upstream proxy may return HTML/plain text for a 5xx instead
    // of H3's JSON error envelope. Keep a short, sanitized summary for admins.
    const contentType =
      response.headers
        .get("content-type")
        ?.split(";")[0]
        ?.trim() ?? "";
    const html =
      /html/i.test(contentType) || /<!doctype html|<html[\s>]/i.test(body);
    const title = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
    const summarySource = html
      ? title ??
        body
          .replace(/<script[\s\S]*?<\/script>/gi, " ")
          .replace(/<style[\s\S]*?<\/style>/gi, " ")
          .replace(/<[^>]+>/g, " ")
      : body;
    const summary = summarySource
      .replace(/&nbsp;|&#160;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/&quot;/gi, '"')
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 180);
    const type = contentType ? `, ${contentType}` : "";
    return {
      message: `سرور پاسخ غیرقابل‌خواندن برگرداند (HTTP ${response.status}${type})${summary ? `: ${summary}` : ""}`,
    };
  }
}

function responseMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    const candidate =
      record.statusMessage ??
      record.message ??
      (typeof record.error === "string" ? record.error : null);
    if (typeof candidate === "string" && candidate.trim()) return candidate;
  }
  return fallback;
}

/**
 * User-facing message for a finalization failure at the given HTTP status.
 *
 * When the server is healthy, a non-5xx here usually means the file was rejected
 * for a business reason (for example an unsupported media type) and the operator
 * should check the request payload, not the server logs.
 */
export function formatUploadFailure(
  completeResponse: { status: number },
  serverHint: string,
): string {
  const base =
    completeResponse.status >= 500
      ? `ثبت فایل در سرور انجام نشد (HTTP ${completeResponse.status})${serverHint} اگر فایل ذخیره نشده است، گزارش سرور را بررسی کنید.`
      : `ثبت فایل در سرور انجام نشد (HTTP ${completeResponse.status}). اگر فایل ذخیره نشده است، گزارش سرور را بررسی کنید.`;

  return base;
}

export function uploadErrorMessage(
  error: unknown,
  fallback: string,
): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function uploadRequestSignal(signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(45_000);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

export async function uploadInChunks(options: {
  endpoint: string;
  file: File;
  contentType: string;
  /** Extra JSON fields sent with the `begin` message (title, artist, …). */
  payload?: Record<string, unknown>;
  onProgress?: (percentage: number) => void;
  /** Describe the current server-side phase while byte progress is capped at 99%. */
  onStatus?: (status: string) => void;
  signal?: AbortSignal;
  /** Shown when the server refuses the file's type or size. */
  rejectedMessage?: string;
  /** Replays finalization for routes whose finish step is idempotent. */
  retryCompletion?: boolean;
  /** Stable ID retained by the caller so a retry can recover an ambiguous finish. */
  uploadId?: string;
}): Promise<ChunkedUploadResult> {
  const {
    endpoint,
    file,
    contentType,
    payload,
    onProgress,
    onStatus,
    signal,
  } = options;
  const maxCompletionAttempts = options.retryCompletion ? 5 : 1;
  const rejected = options.rejectedMessage ?? "فایل انتخاب‌شده قابل آپلود نیست.";

  onProgress?.(0);
  onStatus?.("آماده‌سازی آپلود…");

  const beginResponse = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "begin",
      ...(options.uploadId ? { uploadId: options.uploadId } : {}),
      filename: file.name,
      contentType,
      sizeBytes: file.size,
      ...(payload ?? {}),
    }),
    signal: uploadRequestSignal(signal),
  });

  const begin = (await readJson(beginResponse)) as BeginResponse | null;

  if (!beginResponse.ok || !begin?.uploadId) {
    throw new Error(responseMessage(begin, rejected));
  }
  if (options.uploadId && begin.uploadId !== options.uploadId) {
    throw new Error("سرور شناسهٔ پایدار تلاش مجدد را تأیید نکرد؛ فایل از صف حذف نشد.");
  }

  const uploadId = begin.uploadId;
  if (begin.completed && begin.response && typeof begin.response === "object") {
    onProgress?.(100);
    onStatus?.("آپلود قبلی با موفقیت ثبت شده بود؛ نتیجه بازیابی شد.");
    return {
      uploadId,
      totalChunks: Number(begin.totalChunks) || 0,
      totalBytes: Number(begin.totalBytes) || file.size,
      response: begin.response,
    };
  }
  const chunkSize =
    Number(begin.chunkSize) || 2 * 1024 * 1024;
  const totalChunks = Math.max(
    1,
    Number(begin.totalChunks) || Math.ceil(file.size / chunkSize),
  );
  const totalBytes = file.size || Number(begin.totalBytes) || 0;

  try {
    let sent = 0;
    for (
      let index = begin.assembled ? totalChunks : 0;
      index < totalChunks;
      index += 1
    ) {
      const start = index * chunkSize;
      const slice = file.slice(
        start,
        Math.min(start + chunkSize, file.size),
      );

      const expectedBytesReceived = sent + slice.size;
      let acknowledged = false;
      let lastFailure: unknown;
      // The server treats a repeated chunk index as idempotent. Retry transient
      // network/5xx failures because the first request may have reached storage
      // even when its acknowledgement was lost.
      for (let attempt = 0; attempt < 3 && !acknowledged; attempt += 1) {
        try {
          const chunkResponse = await fetch(endpoint, {
            method: "POST",
            headers: {
              "content-type": "application/octet-stream",
              "x-upload-id": uploadId,
              "x-upload-index": String(index),
            },
            body: slice,
            signal: uploadRequestSignal(signal),
          });
          const chunkAcknowledgement =
            (await readJson(chunkResponse)) as Record<string, unknown> | null;
          if (!chunkResponse.ok) {
            const message = responseMessage(
              chunkAcknowledgement,
              `ارسال بخش ${index + 1} از ${totalChunks} انجام نشد.`,
            );
            if (chunkResponse.status < 500) {
              const permanentError = new Error(message);
              permanentError.name = "PermanentUploadError";
              throw permanentError;
            }
            if (attempt === 2) throw new Error(message);
            lastFailure = new Error(message);
          } else if (
            !chunkAcknowledgement ||
            chunkAcknowledgement.uploadId !== uploadId ||
            Number(chunkAcknowledgement.receivedChunks) < index + 1 ||
            Number(chunkAcknowledgement.bytesReceived) !== expectedBytesReceived
          ) {
            throw new Error(
              `سرور دریافت بخش ${index + 1} را با حجم کامل تأیید نکرد. اتصال یا ذخیره‌سازی فایل را بررسی و دوباره تلاش کنید.`,
            );
          } else {
            acknowledged = true;
          }
        } catch (error) {
          if (signal?.aborted) throw error;
          if (error instanceof Error && error.name === "PermanentUploadError") throw error;
          lastFailure = error;
          if (attempt === 2) throw error;
        }
        if (!acknowledged) {
          onStatus?.(`تلاش دوباره برای ارسال بخش ${index + 1} از ${totalChunks}…`);
          await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
        }
      }

      if (!acknowledged) throw lastFailure instanceof Error ? lastFailure : new Error("ارسال بخش فایل انجام نشد.");

      sent = expectedBytesReceived;
      if (totalBytes > 0) {
        onProgress?.(Math.min(99, Math.round((sent / totalBytes) * 100)));
      }
      onStatus?.("در حال ارسال فایل…");
    }

    // Finalization can succeed on the server while its response is lost.
    // Routes that opt in must make finish idempotent, so the same uploadId can
    // recover the same receipt without creating a second object or record.
    onStatus?.("فایل ارسال شد؛ در حال ثبت نهایی و اعمال واترمارک در صورت فعال بودن…");
    let completeResponse: Response | null = null;
    for (
      let attempt = 0;
      attempt < maxCompletionAttempts;
      attempt += 1
    ) {
      try {
        completeResponse = await fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "complete", uploadId }),
          signal: uploadRequestSignal(signal),
        });
      } catch (error) {
        if (signal?.aborted || attempt + 1 >= maxCompletionAttempts)
          throw error;
        await new Promise((resolve) =>
          setTimeout(resolve, 500 * (attempt + 1)),
        );
        continue;
      }

      // A 409 can mean an earlier request using this same ID is still
      // finalizing. A 5xx may also be transient after the server committed a
      // database fallback URL; replay only for routes that opted into idempotent
      // completion, using the same uploadId to recover that result.
      if (
        (completeResponse.status === 409 ||
          completeResponse.status >= 500) &&
        attempt + 1 < maxCompletionAttempts
      ) {
        onStatus?.("سرور هنوز در حال پردازش فایل است؛ در حال بررسی دوباره…");
        await new Promise((resolve) =>
          setTimeout(resolve, 500 * (attempt + 1)),
        );
        continue;
      }
      break;
    }

    if (!completeResponse) {
      throw new Error(
        "پاسخ نهایی آپلود دریافت نشد؛ همان فایل را دوباره تلاش کنید.",
      );
    }
    const complete = await readJson(completeResponse);

    if (!completeResponse.ok) {
      const message = responseMessage(complete, "");
      if (message) throw new Error(message);

      // Permanent watermarking is fail-closed: if FFmpeg, the font, the logo,
      // or media transformation is unavailable, the server rejects finalization
      // instead of publishing the original without the requested watermark.
      // Keep the actual HTTP status and server hint visible for diagnosis.
      const serverHint =
        completeResponse.status >= 500
          ? "؛ سرور یا درگاه آپلود خطای داخلی برگرداند."
          : "";
      throw new Error(
        formatUploadFailure(completeResponse, serverHint),
      );
    }

    onProgress?.(100);
    onStatus?.("آپلود کامل شد.");
    return {
      uploadId,
      totalChunks,
      totalBytes,
      response: (complete ?? {}) as Record<string, unknown>,
    };
  } catch (error) {
    // For retryable uploads, retain the session and its receipt/chunks under the
    // stable ID. The server prunes stale sessions; aborting here would destroy
    // the only way to recover a successful-but-unacknowledged finalization.
    if (!options.retryCompletion) {
      void fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "abort", uploadId }),
        keepalive: true,
      }).catch(() => undefined);
    }
    throw error;
  }
}

export type PropertyMediaKind = "gallery" | "floor-plan";

export type PropertyMediaUploadResult = {
  uploadId: string;
  url: string;
  mediaType: string;
  assetKind: PropertyMediaKind;
  sizeBytes: number;
  storage: string;
  watermarkApplied: boolean;
  watermarkPosition: PropertyWatermarkPosition | null;
};

/**
 * Typed entry point for the property-media pipeline. Only this wrapper knows
 * the endpoint and metadata contract, so gallery and floor-plan controls cannot
 * drift to different upload handlers or silently save unusable URLs.
 */
export async function uploadPropertyMedia(options: {
  file: File;
  contentType?: string;
  assetKind: PropertyMediaKind;
  onProgress?: (percentage: number) => void;
  onStatus?: (status: string) => void;
  signal?: AbortSignal;
  rejectedMessage?: string;
  /** Apply a permanent logo watermark to this upload, if enabled. */
  watermark?: {
    enabled: boolean;
    position: PropertyWatermarkPosition;
  };
}): Promise<PropertyMediaUploadResult> {
  const result = await uploadInChunks({
    endpoint: "/api/property-media",
    file: options.file,
    contentType: options.contentType ?? options.file.type,
    payload: {
      assetKind: options.assetKind,
      watermarkEnabled: options.assetKind === "gallery" && options.watermark?.enabled === true,
      watermarkPosition: options.watermark?.position ?? "bottom-right",
    },
    onProgress: options.onProgress,
    onStatus: options.onStatus,
    signal: options.signal,
    rejectedMessage: options.rejectedMessage ?? "آپلود رسانه پذیرفته نشد.",
    retryCompletion: true,
  });

  const receipt = result.response;
  const url = typeof receipt.url === "string" ? receipt.url.trim() : "";
  if (!url || !isAllowedMediaRef(url)) {
    throw new Error("سرور فایل را دریافت کرد، اما نشانی رسانهٔ قابل استفاده برنگرداند.");
  }

  const mediaType =
    typeof receipt.mediaType === "string" ? receipt.mediaType : options.contentType ?? options.file.type;
  const assetKind =
    receipt.assetKind === "floor-plan" ? "floor-plan" : "gallery";
  const storage = typeof receipt.storage === "string" ? receipt.storage : "unknown";
  const sizeBytes = Number(receipt.sizeBytes) || result.totalBytes;
  const watermarkApplied = receipt.watermarkApplied === true;
  const watermarkPosition =
    receipt.watermarkPosition === "top-left" ||
    receipt.watermarkPosition === "top-right" ||
    receipt.watermarkPosition === "bottom-left" ||
    receipt.watermarkPosition === "bottom-right"
      ? receipt.watermarkPosition
      : null;

  if (
    options.assetKind === "gallery" &&
    options.watermark?.enabled === true &&
    !watermarkApplied
  ) {
    throw new Error("واترمارک روی فایل اعمال نشد؛ رسانه به فایل ملک اضافه نشد. دوباره تلاش کنید.");
  }

  return {
    uploadId: result.uploadId,
    url,
    mediaType,
    assetKind,
    sizeBytes,
    storage,
    watermarkApplied,
    watermarkPosition,
  };
}
