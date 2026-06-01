import axios from 'axios';
import { dedupedGet, swrGet, invalidateCache, setCached, getCachedEntry } from './requestCache';

// Single shared axios instance for all frontend API calls.
// Use a relative base so all requests go to the frontend service at `/api`.
const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
    // NOTE: Do NOT set Cache-Control: no-store globally — it prevents all
    // browser-level caching and forces every request to hit the network.
    // Cache-control headers are set per-request only when needed.
  }
});

// Keep request interceptor minimal
api.interceptors.request.use((cfg) => cfg);

// Automatically clear the entire client-side request cache on any data-modifying action (POST, PUT, DELETE)
api.interceptors.response.use(
  (response) => {
    const method = response.config.method?.toUpperCase();
    if (method && method !== 'GET') {
      invalidateCache();
    }
    return response;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export function apiUrl(path: string) {
  const p = path.startsWith('/') ? path : '/' + path;
  // Always return a path under /api
  return '/api' + p.replace(/^\/api/, '');
}

// Normalize axios/fetch responses. Handles shapes like:
// - axios response: { data: { success, data } }
// - axios response: { data: [...] }
// - fetch json result: { success, data }
export function extractPayload(resp: any) {
  if (!resp) return null;
  // axios response wrapper
  const wrapper = resp.data !== undefined ? resp.data : resp;
  if (!wrapper) return null;
  if (typeof wrapper === 'object' && 'success' in wrapper && 'data' in wrapper) return wrapper.data;
  return wrapper;
}

export function ensureArray(v: any) {
  if (Array.isArray(v)) return v;
  if (v && typeof v === 'object') {
    if (Array.isArray(v.tasks)) return v.tasks;
    if (Array.isArray(v.data)) return v.data;
    if (Array.isArray(v.items)) return v.items;
  }
  return [];
}

// Internal fetcher that wraps axios.get
function makeFetcher(path: string, cfg: any) {
  return async () => {
    try {
      return await api.get(path, cfg);
    } catch (err: any) {
      if (err?.response?.status === 304) return err.response;
      throw err;
    }
  };
}

// Safe GET with optional cache-busting. Returns axios response object.
export async function safeGet(path: string, opts?: { cacheBust?: boolean, headers?: Record<string,string>, params?: any, dedupe?: boolean, cacheTtlMs?: number }) {
  const cfg: any = { headers: { ...(opts?.headers || {}) }, params: { ...(opts?.params || {}) } };
  if (opts?.cacheBust) {
    cfg.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
    cfg.headers['Pragma'] = 'no-cache';
    cfg.headers['Expires'] = '0';
    cfg.params['_ts'] = Date.now();
  }

  const fetchOnce = makeFetcher(path, cfg);

  const useDedupe = opts?.dedupe !== false && !opts?.cacheBust;
  if (!useDedupe) return fetchOnce();

  const key = `${path}|${JSON.stringify(cfg.params || {})}`;
  return dedupedGet(key, fetchOnce, opts?.cacheTtlMs ?? 15000) as ReturnType<typeof fetchOnce>;
}

/**
 * safeGetSwr — stale-while-revalidate GET.
 *
 * Returns cached data IMMEDIATELY (instant UI), then silently refreshes in background.
 * On first load (no cache), awaits the network normally.
 *
 * @param path       API path (e.g. '/tasks')
 * @param onFresh    Called with fresh data when background refresh completes
 * @param params     Query params object
 * @param ttlMs      How long data is considered "fresh" (no network) — default 15s
 * @param staleTtlMs How long stale data can be served while refreshing — default 120s
 */
export async function safeGetSwr(
  path: string,
  onFresh: (data: any) => void,
  params?: Record<string, any>,
  ttlMs = 15_000,
  staleTtlMs = 120_000
) {
  const cfg: any = { headers: {}, params: params || {} };
  const fetchOnce = makeFetcher(path, cfg);
  const key = `${path}|${JSON.stringify(params || {})}`;
  return swrGet(key, fetchOnce, onFresh, ttlMs, staleTtlMs);
}

export { invalidateCache, setCached, getCachedEntry };

// Safe write helpers: post/put/delete that return extracted payload when available.
export async function safePost(path: string, body?: any, opts?: any) {
  const cfg: any = opts ? { ...opts } : {};
  cfg.headers = { ...(cfg.headers || {}) };
  try {
    if (typeof FormData !== 'undefined' && body instanceof FormData) {
      cfg.headers['Content-Type'] = undefined;
      cfg.headers['content-type'] = undefined;
    }
  } catch (e) {
    // ignore
  }

  try {
    const res = await api.post(path, body, cfg);
    return res;
  } catch (err: any) {
    try {
      console.error('safePost failed', { path, status: err?.response?.status, data: err?.response?.data });
    } catch (e) { /* ignore */ }
    throw err;
  }
}

export async function safePut(path: string, body?: any, opts?: any) {
  const res = await api.put(path, body, opts);
  return res;
}

export async function safeDelete(path: string, opts?: any) {
  const res = await api.delete(path, opts);
  return res;
}

export default api;
