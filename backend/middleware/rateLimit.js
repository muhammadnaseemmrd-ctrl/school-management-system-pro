// Tiny dependency-free in-memory rate limiter (per IP). Good enough for a
// single free-tier instance; swap for Redis-backed limiter when scaling out.
const buckets = new Map();

const makeLimiter = ({ windowMs, max, message }) => (req, res, next) => {
  const key = `${req.ip}:${req.baseUrl}${req.path}`;
  const now = Date.now();
  const b = buckets.get(key) || { count: 0, reset: now + windowMs };
  if (now > b.reset) { b.count = 0; b.reset = now + windowMs; }
  b.count += 1;
  buckets.set(key, b);
  if (b.count > max) {
    res.set('Retry-After', Math.ceil((b.reset - now) / 1000));
    return res.status(429).json({ message });
  }
  next();
};

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets) if (now > v.reset) buckets.delete(k);
}, 10 * 60 * 1000).unref();

module.exports = {
  resetForTests: () => buckets.clear(),
  loginLimiter: makeLimiter({ windowMs: 15 * 60 * 1000, max: 20, message: 'Too many login attempts. Please try again in a few minutes.' }),
  lookupLimiter: makeLimiter({ windowMs: 15 * 60 * 1000, max: 60, message: 'Too many lookups. Please try again in a few minutes.' }),
  driverLimiter: makeLimiter({ windowMs: 60 * 1000, max: 200, message: 'Too many requests from this phone. Wait a moment and try again.' }),
  signupLimiter: makeLimiter({ windowMs: 60 * 60 * 1000, max: 10, message: 'Too many sign-ups from this address. Please try again later.' }),
};
