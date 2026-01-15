import axios, { AxiosHeaders } from 'axios';

// Single shared axios instance for all frontend API calls.
// Use a relative base so all requests go to the frontend service at `/api`.
const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store'
  }
});

// Attach Authorization header automatically from localStorage if present
// Do NOT rely on localStorage for auth token in production builds.
// The server sets an httpOnly cookie on login; axios is configured with
// `withCredentials: true` so cookies will be sent automatically.
// Keep request interceptor minimal to avoid accessing localStorage in SSR.
api.interceptors.request.use((cfg) => cfg);

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

// Safe GET with optional cache-busting. Returns axios response object.
export async function safeGet(path: string, opts?: { cacheBust?: boolean, headers?: Record<string,string>, params?: any }) {
  const cfg: any = { headers: { ...(opts && opts.headers ? opts.headers : {}) }, params: { ...(opts && opts.params ? opts.params : {}) } };
  if (opts?.cacheBust) {
    // Set headers to prevent upstream caching and add a timestamp param
    cfg.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
    cfg.headers['Pragma'] = 'no-cache';
    cfg.headers['Expires'] = '0';
    cfg.params['_ts'] = Date.now();
  }
  try {
    const res = await api.get(path, cfg);
    return res;
  } catch (err: any) {
    // If server returned 304, axios may throw; if so, try to build a minimal response object
    if (err && err.response && err.response.status === 304) {
      return err.response;
    }
    throw err;
  }
}

// Safe write helpers: post/put/delete that return extracted payload when available.
export async function safePost(path: string, body?: any, opts?: any) {
  // Clone opts to avoid mutating caller provided object
  const cfg: any = opts ? { ...opts } : {};
  cfg.headers = { ...(cfg.headers || {}) };
  // If body is FormData, ensure Content-Type header is unset so the browser/axios sets it with boundary
  try {
    if (typeof FormData !== 'undefined' && body instanceof FormData) {
      // Explicitly unset Content-Type to override axios default 'application/json'
      cfg.headers['Content-Type'] = undefined;
      cfg.headers['content-type'] = undefined;
    }
  } catch (e) {
    // ignore environment where FormData is not available
  }

  try {
    const res = await api.post(path, body, cfg);
    return res;
  } catch (err: any) {
    // Add richer error logging for debugging upload failures
    try {
      console.error('safePost failed', { path, status: err && err.response && err.response.status, data: err && err.response && err.response.data });
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
