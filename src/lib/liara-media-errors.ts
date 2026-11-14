/** Map unavailable Liara reads to a retryable response without hiding missing objects. */
export function liaraMediaHttpStatus(response: Response | null): number {
  if (!response) return 503;
  if (response.status === 404) return 404;
  if (response.status === 408 || response.status === 429 || response.status >= 500) {
    return 503;
  }
  return 502;
}
