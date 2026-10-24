import assert from "node:assert/strict";
import test from "node:test";
import { uploadInChunks } from "./media-upload-client.ts";

const originalFetch = globalThis.fetch;

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function uploadFile() {
  return new File([new Uint8Array([1, 2, 3, 4, 5, 6])], "001 - demo.mp3", { type: "audio/mpeg" });
}

function options(uploadId = "abf2b32a-9fd1-4ad4-86b0-3e4b10b01b20") {
  return {
    endpoint: "/api/music-upload",
    file: uploadFile(),
    contentType: "audio/mpeg",
    payload: { title: "Demo", artist: "Artist" },
    uploadId,
    retryCompletion: true,
  };
}

test("uploads chunks in order and returns only after the server confirms finalization", async () => {
  const calls: Array<{ action: string; index?: string }> = [];
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    if (headers.get("content-type") === "application/octet-stream") {
      const index = headers.get("x-upload-index") ?? "0";
      calls.push({ action: "chunk", index });
      return jsonResponse({ uploadId: headers.get("x-upload-id"), receivedChunks: Number(index) + 1, bytesReceived: (Number(index) + 1) * 3 });
    }
    const body = JSON.parse(String(init?.body ?? "{}")) as { action?: string; uploadId?: string };
    calls.push({ action: body.action ?? "unknown" });
    if (body.action === "begin") return jsonResponse({ uploadId: body.uploadId, chunkSize: 3, totalChunks: 2, totalBytes: 6 });
    if (body.action === "complete") return jsonResponse({ track: { id: "track-1" } });
    return jsonResponse({ ok: true });
  }) as typeof fetch;

  try {
    const result = await uploadInChunks(options());
    assert.deepEqual(calls, [
      { action: "begin" },
      { action: "chunk", index: "0" },
      { action: "chunk", index: "1" },
      { action: "complete" },
    ]);
    assert.equal(result.uploadId, options().uploadId);
    assert.deepEqual(result.response, { track: { id: "track-1" } });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a failed chunk keeps its stable ID and does not abort a retryable session", async () => {
  const calls: string[] = [];
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    if (headers.get("content-type") === "application/octet-stream") {
      calls.push("chunk");
      throw new TypeError("network disconnected");
    }
    const body = JSON.parse(String(init?.body ?? "{}")) as { action?: string; uploadId?: string };
    calls.push(body.action ?? "unknown");
    if (body.action === "begin") return jsonResponse({ uploadId: body.uploadId, chunkSize: 6, totalChunks: 1, totalBytes: 6 });
    return jsonResponse({ ok: true });
  }) as typeof fetch;

  try {
    await assert.rejects(uploadInChunks(options()), /network disconnected/);
    assert.equal(calls.filter((action) => action === "chunk").length, 3);
    assert.equal(calls.includes("abort"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a lost finalization response is retried with the same ID and recovers success", async () => {
  let completions = 0;
  const ids: string[] = [];
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    if (headers.get("content-type") === "application/octet-stream") {
      const index = Number(headers.get("x-upload-index") ?? 0);
      return jsonResponse({ uploadId: headers.get("x-upload-id"), receivedChunks: index + 1, bytesReceived: 6 });
    }
    const body = JSON.parse(String(init?.body ?? "{}")) as { action?: string; uploadId?: string };
    if (body.uploadId) ids.push(body.uploadId);
    if (body.action === "begin") return jsonResponse({ uploadId: body.uploadId, chunkSize: 6, totalChunks: 1, totalBytes: 6 });
    if (body.action === "complete") {
      completions += 1;
      if (completions === 1) throw new TypeError("connection reset after server commit");
      return jsonResponse({ track: { id: "stable-track" } });
    }
    return jsonResponse({ ok: true });
  }) as typeof fetch;

  try {
    const result = await uploadInChunks(options());
    assert.equal(completions, 2);
    assert.ok(ids.every((id) => id === options().uploadId));
    assert.deepEqual(result.response, { track: { id: "stable-track" } });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a retained completion receipt short-circuits chunk resend and avoids a duplicate upload", async () => {
  let calls = 0;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    calls += 1;
    const body = JSON.parse(String(init?.body ?? "{}")) as { action?: string; uploadId?: string };
    assert.equal(body.action, "begin");
    return jsonResponse({
      uploadId: body.uploadId,
      completed: true,
      totalChunks: 1,
      totalBytes: 6,
      response: { track: { id: "already-saved" } },
    });
  }) as typeof fetch;

  try {
    const result = await uploadInChunks(options());
    assert.equal(calls, 1);
    assert.deepEqual(result.response, { track: { id: "already-saved" } });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a malformed or proxy-generated begin response reports the real HTTP failure", async () => {
  globalThis.fetch = (async () => new Response("<!doctype html><title>Gateway timeout</title><p>upstream failed</p>", {
    status: 504,
    headers: { "content-type": "text/html" },
  })) as typeof fetch;

  try {
    await assert.rejects(uploadInChunks(options()), /HTTP 504.*Gateway timeout/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects a server that silently replaces the stable retry ID", async () => {
  globalThis.fetch = (async () => jsonResponse({ uploadId: "c12d9a9c-7f39-47ac-9870-6bca0d811da0", chunkSize: 6, totalChunks: 1, totalBytes: 6 })) as typeof fetch;

  try {
    await assert.rejects(uploadInChunks(options()), /شناسهٔ پایدار تلاش مجدد را تأیید نکرد/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("finalization retries transient server errors without creating a new upload ID", async () => {
  let completions = 0;
  const ids: string[] = [];
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    if (headers.get("content-type") === "application/octet-stream") {
      return jsonResponse({ uploadId: headers.get("x-upload-id"), receivedChunks: 1, bytesReceived: 6 });
    }
    const body = JSON.parse(String(init?.body ?? "{}")) as { action?: string; uploadId?: string };
    if (body.uploadId) ids.push(body.uploadId);
    if (body.action === "begin") return jsonResponse({ uploadId: body.uploadId, chunkSize: 6, totalChunks: 1, totalBytes: 6 });
    if (body.action === "complete") {
      completions += 1;
      return completions < 3 ? jsonResponse({ message: "temporary server failure" }, 500) : jsonResponse({ track: { id: "track-final" } });
    }
    return jsonResponse({ ok: true });
  }) as typeof fetch;

  try {
    const result = await uploadInChunks(options());
    assert.equal(completions, 3);
    assert.ok(ids.every((id) => id === options().uploadId));
    assert.deepEqual(result.response, { track: { id: "track-final" } });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
