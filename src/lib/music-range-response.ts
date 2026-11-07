/** Build a safe response for an unsatisfiable upstream byte-range request. */
export function liaraRangeNotSatisfiableHeaders(
  upstream: Pick<Response, "status" | "headers">,
): Record<string, string> | null {
  if (upstream.status !== 416) return null;

  const contentRange = upstream.headers.get("content-range");
  return {
    "accept-ranges": upstream.headers.get("accept-ranges") || "bytes",
    ...(contentRange ? { "content-range": contentRange } : {}),
    // A 416 is specific to the supplied Range header and must not poison a
    // shared cache for a later, valid range request to the same track URL.
    "cache-control": "no-store",
    "content-disposition": "inline",
  };
}
