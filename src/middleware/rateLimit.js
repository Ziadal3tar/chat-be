const buckets = new Map();

const toNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const cleanupExpired = (now) => {
  for (const [key, timestamps] of buckets) {
    const valid = timestamps.filter((timestamp) => timestamp > now);
    if (valid.length) buckets.set(key, valid);
    else buckets.delete(key);
  }
};

setInterval(() => cleanupExpired(Date.now()), 60_000).unref?.();

export const createRateLimiter = ({
  windowMs = 60_000,
  max = 60,
  keyGenerator,
  message = "Too many requests. Please try again later.",
} = {}) => {
  const normalizedWindow = toNumber(windowMs, 60_000);
  const normalizedMax = Math.max(1, Math.floor(toNumber(max, 60)));

  return (req, res, next) => {
    const now = Date.now();
    const key = keyGenerator?.(req) || req.ip || req.socket?.remoteAddress || "unknown";
    const timestamps = buckets.get(key) || [];
    const threshold = now - normalizedWindow;
    const recent = timestamps.filter((timestamp) => timestamp > threshold);

    if (recent.length >= normalizedMax) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((recent[0] + normalizedWindow - now) / 1000)
      );

      res.set("Retry-After", String(retryAfterSeconds));
      return res.status(429).json({
        success: false,
        message,
        retryAfterSeconds,
      });
    }

    recent.push(now);
    buckets.set(key, recent);

    res.set("X-RateLimit-Limit", String(normalizedMax));
    res.set(
      "X-RateLimit-Remaining",
      String(Math.max(0, normalizedMax - recent.length))
    );

    return next();
  };
};

export const clientKey = (req) =>
  req.userId
    ? `user:${req.userId}`
    : `ip:${req.ip || req.socket?.remoteAddress || "unknown"}`;
