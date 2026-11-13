import assert from "node:assert/strict";
import test from "node:test";
import { uploadInChunks } from "./media-upload-client.ts";

const originalFetch = globalThis.fetch;
const originalXhr = globalThis.XMLHttpRequest;
const originalCreateImageBitmap = globalThis.createImageBitmap;
const originalDocument = globalThis.document;
const stableId = "abf2b32a-9fd1-4ad4-86b0-3e4b10b01b20";

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function uploadFile() {
  const blob = new Blob([new Uint8Array([1, 2, 3, 4, 5, 6])], { type: "audio/mpeg" });
  return Object.assign(blob, { name: "demo.mp3", lastModified: 1 }) as File;
}

function options() {
  return {
    endpoint: "/api/music-upload",
    file: uploadFile(),
    contentType: "audio/mpeg",
    payload: { title: "Demo", artist: "Artist" },
    uploadId: stableId,
    retryChunks: true,
    retryCompletion: true,
    preserveSessionOnError: true,
  };
}

test("a restored completed upload returns its receipt without resending chunks", async () => {
  const calls: Array<{ action: string; uploadId?: string }> = [];
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { action?: string; uploadId?: string };
    calls.push({ action: body.action ?? "chunk", uploadId: body.uploadId });
    return jsonResponse({
      uploadId: stableId,
      completed: true,
      totalChunks: 1,
      totalBytes: 6,
      response: { track: { id: stableId } },
    });
  }) as typeof fetch;

  try {
    const result = await uploadInChunks(options());
    assert.deepEqual(calls, [{ action: "begin", uploadId: stableId }]);
    assert.equal(result.uploadId, stableId);
    assert.deepEqual(result.response, { track: { id: stableId } });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("an assembled session skips chunk upload and retries only finalization", async () => {
  const calls: string[] = [];
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    if (headers.get("content-type") === "application/octet-stream") {
      calls.push("chunk");
      return jsonResponse({ uploadId: stableId, receivedChunks: 1, bytesReceived: 6 });
    }
    const body = JSON.parse(String(init?.body ?? "{}")) as { action?: string; uploadId?: string };
    calls.push(body.action ?? "unknown");
    if (body.action === "begin") return jsonResponse({ uploadId: stableId, assembled: true, totalChunks: 1, totalBytes: 6 });
    if (body.action === "complete") return jsonResponse({ track: { id: stableId } });
    return jsonResponse({ ok: true });
  }) as typeof fetch;

  try {
    const result = await uploadInChunks(options());
    assert.deepEqual(calls, ["begin", "complete"]);
    assert.deepEqual(result.response, { track: { id: stableId } });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a lost completion response retries with the same ID and never aborts the session", async () => {
  let completions = 0;
  const ids: string[] = [];
  const actions: string[] = [];
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    if (headers.get("content-type") === "application/octet-stream") {
      actions.push("chunk");
      return jsonResponse({ uploadId: stableId, receivedChunks: 1, bytesReceived: 6 });
    }
    const body = JSON.parse(String(init?.body ?? "{}")) as { action?: string; uploadId?: string };
    if (body.uploadId) ids.push(body.uploadId);
    actions.push(body.action ?? "unknown");
    if (body.action === "begin") return jsonResponse({ uploadId: stableId, chunkSize: 6, totalChunks: 1, totalBytes: 6 });
    if (body.action === "complete") {
      completions += 1;
      if (completions === 1) throw new TypeError("connection reset after server commit");
      return jsonResponse({ track: { id: stableId } });
    }
    return jsonResponse({ ok: true });
  }) as typeof fetch;

  try {
    const result = await uploadInChunks(options());
    assert.equal(completions, 2);
    assert.ok(ids.every((id) => id === stableId));
    assert.equal(actions.includes("abort"), false);
    assert.deepEqual(result.response, { track: { id: stableId } });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a failed retryable chunk preserves the server session for the same file", async () => {
  const actions: string[] = [];
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    if (headers.get("content-type") === "application/octet-stream") {
      actions.push("chunk");
      return jsonResponse({ message: "temporary chunk failure" }, 503);
    }
    const body = JSON.parse(String(init?.body ?? "{}")) as { action?: string; uploadId?: string };
    actions.push(body.action ?? "unknown");
    if (body.action === "begin") return jsonResponse({ uploadId: stableId, chunkSize: 6, totalChunks: 1, totalBytes: 6 });
    return jsonResponse({ ok: true });
  }) as typeof fetch;

  try {
    await assert.rejects(uploadInChunks(options()), /temporary chunk failure/);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(actions, ["begin", "chunk", "chunk", "chunk"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a transient chunk failure retries the same index and continues without restarting the upload", async () => {
  let chunkAttempts = 0;
  const chunkIndexes: string[] = [];
  const actions: string[] = [];
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    if (headers.get("content-type") === "application/octet-stream") {
      chunkAttempts += 1;
      chunkIndexes.push(headers.get("x-upload-index") ?? "");
      actions.push("chunk");
      if (chunkAttempts === 1) return jsonResponse({ message: "temporary storage failure" }, 503);
      return jsonResponse({ uploadId: stableId, receivedChunks: 1, bytesReceived: 6 });
    }
    const body = JSON.parse(String(init?.body ?? "{}")) as { action?: string; uploadId?: string };
    actions.push(body.action ?? "unknown");
    if (body.action === "begin") return jsonResponse({ uploadId: stableId, chunkSize: 6, totalChunks: 1, totalBytes: 6 });
    if (body.action === "complete") return jsonResponse({ track: { id: stableId } });
    return jsonResponse({ ok: true });
  }) as typeof fetch;

  try {
    const result = await uploadInChunks(options());
    assert.equal(chunkAttempts, 2);
    assert.deepEqual(chunkIndexes, ["0", "0"]);
    assert.deepEqual(actions, ["begin", "chunk", "chunk", "complete"]);
    assert.deepEqual(result.response, { track: { id: stableId } });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a non-preserved upload still sends abort after a failed chunk", async () => {
  const actions: string[] = [];
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    if (headers.get("content-type") === "application/octet-stream") {
      actions.push("chunk");
      return jsonResponse({ message: "permanent chunk failure" }, 400);
    }
    const body = JSON.parse(String(init?.body ?? "{}")) as { action?: string };
    actions.push(body.action ?? "unknown");
    if (body.action === "begin") return jsonResponse({ uploadId: stableId, chunkSize: 6, totalChunks: 1, totalBytes: 6 });
    return jsonResponse({ ok: true });
  }) as typeof fetch;

  try {
    await assert.rejects(uploadInChunks({ ...options(), preserveSessionOnError: false }), /permanent chunk failure/);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(actions, ["begin", "chunk", "abort"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("the server cannot silently replace the stable retry ID", async () => {
  globalThis.fetch = (async () => jsonResponse({ uploadId: "c12d9a9c-7f39-47ac-9870-6bca0d811da0", chunkSize: 6, totalChunks: 1, totalBytes: 6 })) as typeof fetch;

  try {
    await assert.rejects(uploadInChunks(options()), /شناسهٔ پایدار تلاش مجدد را تأیید نکرد/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("direct Liara uploads stream the File with the signed Content-Type and finalize through the same receipt", async () => {
  const calls: string[] = [];
  const progress: number[] = [];
  let sentBody: unknown;
  const sentHeaders: Record<string, string> = {};

  class FakeXhr {
    upload = { onprogress: null as ((event: ProgressEvent) => void) | null };
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    ontimeout: (() => void) | null = null;
    onabort: (() => void) | null = null;
    status = 200;
    timeout = 0;
    open(method: string, url: string) { assert.equal(method, "PUT"); assert.equal(url, "https://storage.example.test/bucket/object?signature=short"); }
    setRequestHeader(name: string, value: string) { sentHeaders[name] = value; }
    send(body: unknown) {
      sentBody = body;
      this.upload.onprogress?.({ lengthComputable: true, loaded: 6, total: 6 } as ProgressEvent);
      this.onload?.();
    }
    abort() { this.onabort?.(); }
  }

  Object.defineProperty(globalThis, "XMLHttpRequest", { configurable: true, value: FakeXhr });
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { action?: string };
    calls.push(body.action ?? "unknown");
    if (body.action === "begin") {
      return jsonResponse({
        uploadId: stableId,
        totalChunks: 1,
        totalBytes: 6,
        directUpload: {
          url: "https://storage.example.test/bucket/object?signature=short",
          headers: { "content-type": "audio/mpeg" },
        },
      });
    }
    if (body.action === "complete") return jsonResponse({ track: { id: stableId } });
    return jsonResponse({ message: "unexpected request" }, 400);
  }) as typeof fetch;

  try {
    const result = await uploadInChunks({ ...options(), onProgress: (value) => progress.push(value) });
    assert.deepEqual(calls, ["begin", "complete"]);
    assert.equal(sentHeaders["content-type"], "audio/mpeg");
    assert.equal((sentBody as Blob).size, 6);
    assert.deepEqual(progress, [0, 99, 99, 100]);
    assert.deepEqual(result.response, { track: { id: stableId } });
  } finally {
    globalThis.fetch = originalFetch;
    Object.defineProperty(globalThis, "XMLHttpRequest", { configurable: true, value: originalXhr });
  }
});

test("large JPEGs are resized and recompressed only when the browser output is smaller", async () => {
  const originalFile = new File([new Uint8Array(2_000)], "large-photo.jpg", {
    type: "image/jpeg",
    lastModified: 10,
  });
  let beginSize = 0;
  let canvasWidth = 0;
  let canvasHeight = 0;
  let imageOrientation = "";
  Object.defineProperty(globalThis, "createImageBitmap", {
    configurable: true,
    value: async (_file: ImageBitmapSource, options?: ImageBitmapOptions) => {
      imageOrientation = options?.imageOrientation ?? "";
      return { width: 4000, height: 3000, close() {} };
    },
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      createElement: () => {
        const canvas = {
          width: 0,
          height: 0,
          getContext: () => ({ drawImage() {} }),
          toBlob(callback: (blob: Blob | null) => void, type: string) {
            callback(new Blob([new Uint8Array(500)], { type }));
          },
        };
        return new Proxy(canvas, {
          set(target, property, value) {
            if (property === "width") canvasWidth = Number(value);
            if (property === "height") canvasHeight = Number(value);
            return Reflect.set(target, property, value);
          },
        });
      },
    },
  });
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    if (headers.get("content-type") === "application/octet-stream") {
      const bytes = (init?.body as Blob).size;
      return jsonResponse({ uploadId: stableId, receivedChunks: 1, bytesReceived: bytes });
    }
    const body = JSON.parse(String(init?.body ?? "{}")) as { action?: string; sizeBytes?: number };
    if (body.action === "begin") {
      beginSize = Number(body.sizeBytes) || 0;
      return jsonResponse({ uploadId: stableId, chunkSize: 1024, totalChunks: 1, totalBytes: beginSize });
    }
    if (body.action === "complete") return jsonResponse({ url: "/api/media/test" });
    return jsonResponse({ ok: true });
  }) as typeof fetch;

  try {
    await uploadInChunks({ endpoint: "/api/upload", file: originalFile, contentType: "image/jpeg" });
    assert.equal(beginSize, 500);
    assert.equal(canvasWidth, 2560);
    assert.equal(canvasHeight, 1920);
    assert.equal(imageOrientation, "from-image");
  } finally {
    globalThis.fetch = originalFetch;
    Object.defineProperty(globalThis, "createImageBitmap", { configurable: true, value: originalCreateImageBitmap });
    Object.defineProperty(globalThis, "document", { configurable: true, value: originalDocument });
  }
});

test("PNG uploads keep their original bytes so animated PNG frames are not flattened", async () => {
  const originalFile = new File([new Uint8Array(2_000)], "animated.png", {
    type: "image/png",
  });
  let bitmapCalls = 0;
  let beginSize = 0;
  let chunkBytes = 0;
  Object.defineProperty(globalThis, "createImageBitmap", {
    configurable: true,
    value: async () => {
      bitmapCalls += 1;
      return { width: 4000, height: 3000, close() {} };
    },
  });
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    if (headers.get("content-type") === "application/octet-stream") {
      chunkBytes = (init?.body as Blob).size;
      return jsonResponse({ uploadId: stableId, receivedChunks: 1, bytesReceived: chunkBytes });
    }
    const body = JSON.parse(String(init?.body ?? "{}")) as { action?: string; sizeBytes?: number };
    if (body.action === "begin") {
      beginSize = Number(body.sizeBytes) || 0;
      return jsonResponse({ uploadId: stableId, chunkSize: 4096, totalChunks: 1, totalBytes: beginSize });
    }
    if (body.action === "complete") return jsonResponse({ url: "/api/media/test" });
    return jsonResponse({ ok: true });
  }) as typeof fetch;

  try {
    await uploadInChunks({ endpoint: "/api/upload", file: originalFile, contentType: "image/png" });
    assert.equal(bitmapCalls, 0);
    assert.equal(beginSize, originalFile.size);
    assert.equal(chunkBytes, originalFile.size);
  } finally {
    globalThis.fetch = originalFetch;
    Object.defineProperty(globalThis, "createImageBitmap", { configurable: true, value: originalCreateImageBitmap });
  }
});
