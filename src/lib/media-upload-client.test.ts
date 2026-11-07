import assert from "node:assert/strict";
import test from "node:test";
import { uploadInChunks } from "./media-upload-client.ts";

const originalFetch = globalThis.fetch;
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
