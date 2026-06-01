/**
 * Lightweight in-memory GET response cache for read-heavy, low-churn endpoints.
 */

const store = new Map();

export function cacheGet(key) {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.value;
}

export function cacheSet(key, value, ttlMs) {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function cacheInvalidate(prefix) {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

export function withCache(prefix, ttlMs, handler) {
  return (req, res, next) => {
    const key = `${prefix}:${req.originalUrl || req.url}`;
    const hit = cacheGet(key);
    if (hit) {
      res.setHeader('X-Cache', 'HIT');
      return res.json(hit);
    }
    const origJson = res.json.bind(res);
    res.json = (body) => {
      cacheSet(key, body, ttlMs);
      res.setHeader('X-Cache', 'MISS');
      return origJson(body);
    };
    if (handler) return handler(req, res, next);
    return next();
  };
}
