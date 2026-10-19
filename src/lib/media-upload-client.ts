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
};

function responseMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    const candidate = record.statusMessage ?? record.message;
    if (typeof candidate === "string" && candidate.trim()) return candidate;
  }
  return fallback;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function uploadErrorMessage(error: unknown, fallback: string): string {
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
}): Promise<ChunkedUploadResult> {
  const { endpoint, file, contentType, payload, onProgress, signal } = options;
  const maxCompletionAttempts = options.retryCompletion ? 3 : 1;
  const rejected = options.rejectedMessage ?? "فایل انتخاب‌شده قابل آپلود نیست.";

  onProgress?.(0);

  const beginResponse = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "begin",
      filename: file.name,
      contentType,
      sizeBytes: file.size,
      ...(payload ?? {}),
    }),
    signal,
  });

  const begin = (await readJson(beginResponse)) as BeginResponse | null;

  if (!beginResponse.ok || !begin?.uploadId) {
    throw new Error(responseMessage(begin, rejected));
  }

  const uploadId = begin.uploadId;
  const chunkSize = Number(begin.chunkSize) || 2 * 1024 * 1024;
  const totalChunks = Math.max(1, Number(begin.totalChunks) || Math.ceil(file.size / chunkSize));
  const totalBytes = file.size || Number(begin.totalBytes) || 0;

  try {
    let sent = 0;
    for (let index = 0; index < totalChunks; index += 1) {
      const start = index * chunkSize;
      const slice = file.slice(start, Math.min(start + chunkSize, file.size));

      const chunkResponse = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/octet-stream",
          "x-upload-id": uploadId,
          "x-upload-index": String(index),
        },
        body: slice,
        signal,
      });

      const chunkAcknowledgement = await readJson(chunkResponse) as Record<string, unknown> | null;
      if (!chunkResponse.ok) {
        throw new Error(
          responseMessage(chunkAcknowledgement, `ارسال بخش ${index + 1} از ${totalChunks} انجام نشد.`),
        );
      }

      const expectedBytesReceived = sent + slice.size;
      if (
        !chunkAcknowledgement ||
        chunkAcknowledgement.uploadId !== uploadId ||
        Number(chunkAcknowledgement.receivedChunks) < index + 1 ||
        Number(chunkAcknowledgement.bytesReceived) !== expectedBytesReceived
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
    for (let attempt = 0; attempt < maxCompletionAttempts; attempt += 1) {
      try {
        completeResponse = await fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "complete", uploadId }),
          signal,
        });
      } catch (error) {
        if (signal?.aborted || attempt + 1 >= maxCompletionAttempts) throw error;
        await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
        continue;
      }

      // A 409 can mean an earlier request using this same ID is still
      // finalizing. Give it a moment to publish its receipt, then replay once.
      if (completeResponse.status === 409 && attempt + 1 < maxCompletionAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
        continue;
      }
      break;
    }

    if (!completeResponse) {
      throw new Error("پاسخ نهایی آپلود دریافت نشد؛ همان فایل را دوباره تلاش کنید.");
    }
    const complete = await readJson(completeResponse);

    if (!completeResponse.ok) {
      throw new Error(responseMessage(complete, "ثبت فایل در سرور انجام نشد."));
    }

    onProgress?.(100);
    return {
      uploadId,
      totalChunks,
      totalBytes,
      response: (complete ?? {}) as Record<string, unknown>,
    };
  } catch (error) {
    // Never leave a half-filled session behind.
    void fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "abort", uploadId }),
      keepalive: true,
    }).catch(() => undefined);
    throw error;
  }
}
