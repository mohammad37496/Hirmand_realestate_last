/** Build a safe response for an unsatisfiable byte-range request. */
export function createRangeNotSatisfiableResponse(
  contentRange: string,
  acceptRanges = "bytes",
): Response {
  const headers: Record<string, string> = {
    "accept-ranges": acceptRanges,
    // A 416 is specific to the supplied Range header and must not poison a
    // shared cache for a later, valid range request to the same media URL.
    "cache-control": "no-store",
    "content-disposition": "inline",
  };
  if (contentRange) headers["content-range"] = contentRange;
  return new Response(null, { status: 416, headers });
}

/** Preserve Liara's byte-range metadata instead of converting 416 to 502. */
export function liaraRangeNotSatisfiableResponse(
  upstream: Pick<Response, "status" | "headers">,
): Response | null {
  if (upstream.status !== 416) return null;

  return createRangeNotSatisfiableResponse(
    upstream.headers.get("content-range") || "",
    upstream.headers.get("accept-ranges") || "bytes",
  );
}
