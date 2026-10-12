type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

function cleanup(now: number) {
  if (buckets.size < 5000) return;
  for (const [key, value] of buckets) {
    if (value.resetAt <= now) buckets.delete(key);
  }
}

export function consumeStaffMobileRateLimit(
  scope: string,
  deviceId: string,
  options: { windowMs: number; maxHits: number },
) {
  const now = Date.now();
  cleanup(now);

  const key = scope + ":" + deviceId;
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + options.windowMs });
    return { allowed: true, remaining: Math.max(0, options.maxHits - 1) };
  }

  current.count += 1;
  if (current.count > options.maxHits) {
    return { allowed: false, remaining: 0, retryAfterSeconds: Math.ceil((current.resetAt - now) / 1000) };
  }

  return { allowed: true, remaining: Math.max(0, options.maxHits - current.count) };
}
