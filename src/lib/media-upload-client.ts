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
  completed?: boolean;
  assembled?: boolean;
  completing?: boolean;
  directUpload?: { url: string; headers: Record<string, string> };
  response?: Record<string, unknown>;
  statusMessage?: string;
  message?: string;
};

async function optimizeImageBeforeUpload(file: File): Promise<File> {
  // Canvas snapshots only one frame from animated PNGs. Keep PNG/GIF/WebP/AVIF
  // byte-for-byte and optimize JPEGs, which cannot contain animation.
  if (file.type.trim().toLowerCase() !== "image/jpeg" || typeof createImageBitmap !== "function") {
    return file;
  }
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    try {
      const maxDimension = 2560;
      const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
      const needsResize = scale < 1;
      const shouldCompressJpeg = file.type === "image/jpeg" && file.size > 1_500_000;
      if (!needsResize && !shouldCompressJpeg) return file;

      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) return file;
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const output = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(
          resolve,
          "image/jpeg",
          0.86,
        );
      });
      if (!output || output.size >= file.size * 0.95) return file;
      return new File([output], file.name, {
        type: file.type,
        lastModified: file.lastModified,
      });
    } finally {
      bitmap.close();
    }
  } catch {
    // Unsupported decoders or canvas encoders must not block a valid upload.
    return file;
  }
}

function putDirectFile(input: {
  url: string;
  headers: Record<string, string>;
  file: File;
  signal?: AbortSignal;
  onProgress?: (percentage: number) => void;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof XMLHttpRequest === "undefined") {
      reject(new Error("مرورگر از آپلود مستقیم پشتیبانی نمی‌کند؛ صفحه را به‌روزرسانی کنید."));
      return;
    }
    const xhr = new XMLHttpRequest();
    let settled = false;
    const cleanup = () => input.signal?.removeEventListener("abort", abort);
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve();
    };
    const abort = () => xhr.abort();

    if (input.signal?.aborted) {
      finish(new DOMException("Upload aborted", "AbortError"));
      return;
    }
    xhr.open("PUT", input.url, true);
    // Keep the browser transfer below the 15-minute presigned URL lifetime,
    // while allowing slow mobile connections to finish a 32 MB audio file.
    xhr.timeout = 14 * 60_000;
    for (const [name, value] of Object.entries(input.headers)) {
      xhr.setRequestHeader(name, value);
    }
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        input.onProgress?.(Math.min(99, Math.round((event.loaded / event.total) * 99)));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) finish();
      else finish(new Error(`ذخیره مستقیم در فضای ابری انجام نشد (HTTP ${xhr.status}).`));
    };
    xhr.onerror = () => finish(new Error("ارتباط مستقیم با فضای ابری برقرار نشد؛ تنظیم CORS یا اتصال شبکه را بررسی کنید."));
    xhr.ontimeout = () => finish(new Error("زمان آپلود مستقیم به پایان رسید؛ همان فایل را دوباره تلاش کنید."));
    xhr.onabort = () => finish(new DOMException("Upload aborted", "AbortError"));
    input.signal?.addEventListener("abort", abort, { once: true });
    if (input.signal?.aborted) {
      abort();
      return;
    }
    xhr.send(input.file);
  });
}

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

export async function uploadInChunks(options: {
  endpoint: string;
  file: File;
  contentType: string;
  /** Extra JSON fields sent with the `begin` message (title, artist, …). */
  payload?: Record<string, unknown>;
  onProgress?: (percentage: number) => void;
  signal?: AbortSignal;
  /** Shown when the server refuses the file's type or size. */
  rejectedMessage?: string;
  /** Replays finalization for routes whose finish step is idempotent. */
  retryCompletion?: boolean;
  /** Stable ID retained by the caller so a retry can recover the same session. */
  uploadId?: string;
  /** Retry transient chunk transport/storage failures with the same chunk index. */
  retryChunks?: boolean;
  /** Keep the server session and chunks when an opted-in upload fails. */
  preserveSessionOnError?: boolean;
}): Promise<ChunkedUploadResult> {
  const {
    endpoint,
    file,
    contentType,
    payload,
    onProgress,
    signal,
  } = options;
  const uploadFile = await optimizeImageBeforeUpload(file);
  const uploadContentType = uploadFile.type || contentType;
  const maxCompletionAttempts = options.retryCompletion ? 3 : 1;
  const rejected = options.rejectedMessage ?? "فایل انتخاب‌شده قابل آپلود نیست.";

  onProgress?.(0);

  const beginResponse = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "begin",
      ...(options.uploadId ? { uploadId: options.uploadId } : {}),
      filename: uploadFile.name,
      contentType: uploadContentType,
      sizeBytes: uploadFile.size,
      ...(payload ?? {}),
    }),
    signal,
  });

  const begin = (await readJson(beginResponse)) as BeginResponse | null;

  if (!beginResponse.ok || !begin?.uploadId) {
    throw new Error(responseMessage(begin, rejected));
  }
  if (options.uploadId && begin.uploadId !== options.uploadId) {
    throw new Error("سرور شناسهٔ پایدار تلاش مجدد را تأیید نکرد؛ فایل از صف حذف نشد.");
  }

  const uploadId = begin.uploadId;
  if (begin.completed) {
    if (!begin.response || typeof begin.response !== "object") {
      throw new Error("سرور آپلود قبلی را کامل اعلام کرد، اما رسید ثبت آهنگ را برنگرداند.");
    }
    onProgress?.(100);
    return {
      uploadId,
      totalChunks: Number(begin.totalChunks) || 0,
      totalBytes: Number(begin.totalBytes) || uploadFile.size,
      response: begin.response,
    };
  }
  const chunkSize =
    Number(begin.chunkSize) || 2 * 1024 * 1024;
  const totalChunks = Math.max(
    1,
    Number(begin.totalChunks) || Math.ceil(uploadFile.size / chunkSize),
  );
  const totalBytes = uploadFile.size || Number(begin.totalBytes) || 0;

  try {
    let sent = 0;
    if (begin.directUpload && !begin.assembled && !begin.completing) {
      await putDirectFile({
        url: begin.directUpload.url,
        headers: begin.directUpload.headers,
        file: uploadFile,
        signal,
        onProgress,
      });
      onProgress?.(99);
    }
    for (
      let index = begin.directUpload || begin.assembled || begin.completing ? totalChunks : 0;
      index < totalChunks;
      index += 1
    ) {
      const start = index * chunkSize;
      const slice = uploadFile.slice(
        start,
        Math.min(start + chunkSize, uploadFile.size),
      );

      const maxChunkAttempts = options.retryChunks ? 3 : 1;
      let chunkResponse: Response | null = null;
      let chunkAcknowledgement: Record<string, unknown> | null = null;
      for (let attempt = 0; attempt < maxChunkAttempts; attempt += 1) {
        try {
          chunkResponse = await fetch(endpoint, {
            method: "POST",
            headers: {
              "content-type": "application/octet-stream",
              "x-upload-id": uploadId,
              "x-upload-index": String(index),
            },
            body: slice,
            signal,
          });
        } catch (error) {
          if (signal?.aborted || attempt + 1 >= maxChunkAttempts) throw error;
          await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
          continue;
        }

        chunkAcknowledgement = (await readJson(chunkResponse)) as Record<string, unknown> | null;
        if (chunkResponse.ok) break;
        if (chunkResponse.status < 500 || attempt + 1 >= maxChunkAttempts) {
          throw new Error(
            responseMessage(
              chunkAcknowledgement,
              `ارسال بخش ${index + 1} از ${totalChunks} انجام نشد.`,
            ),
          );
        }
        await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
      }

      if (!chunkResponse?.ok) {
        throw new Error(`ارسال بخش ${index + 1} از ${totalChunks} انجام نشد.`);
      }

      const expectedBytesReceived = sent + slice.size;
      if (
        !chunkAcknowledgement ||
        chunkAcknowledgement.uploadId !== uploadId ||
        Number(chunkAcknowledgement.receivedChunks) < index + 1 ||
        Number(chunkAcknowledgement.bytesReceived) !==
          expectedBytesReceived
      ) {
        throw new Error(
          `سرور دریافت بخش ${index + 1} را با حجم کامل تأیید نکرد. اتصال یا ذخیره‌سازی فایل را بررسی و دوباره تلاش کنید.`,
        );
      }

      sent = expectedBytesReceived;
      if (totalBytes > 0) {
        onProgress?.(Math.min(99, Math.round((sent / totalBytes) * 100)));
      }
    }

    // Finalization can succeed on the server while its response is lost.
    // Routes that opt in must make finish idempotent, so the same uploadId can
    // recover the same receipt without creating a second object or record.
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
          signal,
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

      // Distinguish a generic server/internal error from the known watermark-skip
      // path. When watermarking fails because FFmpeg, a font, or the logo is missing
      // at runtime, the server stores the original media without a watermark and logs
      // a warning instead of returning 500 — so this branch is mainly for genuine
      // storage/transform/persistence failures that need operator investigation.
      const serverHint =
        completeResponse.status >= 500
          ? "؛ سرور یا درگاه آپلود خطای داخلی برگرداند."
          : "";
      throw new Error(
        formatUploadFailure(completeResponse, serverHint),
      );
    }

    onProgress?.(100);
    return {
      uploadId,
      totalChunks,
      totalBytes,
      response: (complete ?? {}) as Record<string, unknown>,
    };
  } catch (error) {
    // Retryable uploads keep their stable session and receipt. Aborting after
    // an ambiguous response could erase the only proof that the server already
    // committed the music track.
    if (!options.preserveSessionOnError) {
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
