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
}): Promise<ChunkedUploadResult> {
  const { endpoint, file, contentType, payload, onProgress, signal } = options;
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

      if (!chunkResponse.ok) {
        const detail = await readJson(chunkResponse);
        throw new Error(
          responseMessage(detail, `ارسال بخش ${index + 1} از ${totalChunks} انجام نشد.`),
        );
      }

      sent += slice.size;
      if (totalBytes > 0) {
        onProgress?.(Math.min(99, Math.round((sent / totalBytes) * 100)));
      }
    }

    const completeResponse = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "complete", uploadId }),
      signal,
    });
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
