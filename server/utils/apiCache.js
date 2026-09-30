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
  if (store.size > 200) {
    const now = Date.now();
    for (const [k, v] of store.entries()) {
      if (now > v.expiresAt) store.delete(k);
    }
  }
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function cacheInvalidate(prefix) {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

function normalizeCacheUrl(urlStr) {
  if (!urlStr) return '';
  const qIdx = urlStr.indexOf('?');
  if (qIdx === -1) return urlStr;
  const path = urlStr.slice(0, qIdx);
  const query = urlStr.slice(qIdx + 1);
  const filtered = query
    .split('&')
    .filter(param => {
      const p = param.trim();
      return p && !p.startsWith('_ts=') && p !== '_ts' && !p.startsWith('_=');
    })
    .sort()
    .join('&');
  return filtered ? `${path}?${filtered}` : path;
}

export function withCache(prefix, ttlMs, handler) {
  return (req, res, next) => {
    if (req.method !== 'GET') {
      if (handler) return handler(req, res, next);
      return next();
    }
    const userPart = req.user ? `:${req.user.id}:${req.user.role}` : '';
    const key = `${prefix}:${normalizeCacheUrl(req.originalUrl || req.url)}${userPart}`;
    const hit = cacheGet(key);
    if (hit !== null && hit !== undefined) {
      res.setHeader('X-Cache', 'HIT');
      return res.json(hit);
    }
    const origJson = res.json.bind(res);
    res.json = (body) => {
      if (!res.statusCode || (res.statusCode >= 200 && res.statusCode < 300)) {
        cacheSet(key, body, ttlMs);
      }
      res.setHeader('X-Cache', 'MISS');
      return origJson(body);
    };
    if (handler) return handler(req, res, next);
    return next();
  };
}
