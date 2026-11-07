// Lightweight in-memory IP rate limiter for auth endpoints.
//
// This is intentionally simple (single-process, resets on restart). It's a
// second layer on top of the per-account lockout stored in the DB (see
// User.failedLogins / lockedUntil), which is what actually protects against
// a determined attacker across restarts. This layer just makes it expensive
// to hammer the login endpoint from one IP regardless of which username is
// being tried.

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

// Periodically forget old buckets so this Map can't grow unbounded.
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt < now) buckets.delete(key);
  }
}, 5 * 60 * 1000).unref?.();

export function checkRateLimit(
  key: string,
  { max = 10, windowMs = 5 * 60 * 1000 }: { max?: number; windowMs?: number } = {}
): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (bucket.count >= max) {
    return { allowed: false, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) };
  }

  bucket.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

export function getClientIp(headers: Headers): string {
  // Behind Caddy/a reverse proxy, the real client IP is forwarded here. The
  // proxy appends the address it saw at the END of the list; everything before
  // it was sent by the client and can be forged to dodge the limit, so only
  // the last value is trusted.
  // Fall back to a constant key if nothing is present (e.g. direct local access).
  const forwarded = headers.get("x-forwarded-for");
  const last = forwarded?.split(",").at(-1)?.trim();
  return last || "local";
}
