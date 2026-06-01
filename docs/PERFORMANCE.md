# Performance Optimization Guide

## Bottlenecks Identified

| Area | Issue | Impact |
|------|--------|--------|
| Frontend | N+1 checklist API calls (1 per template) on dashboard load | 3–15s load, many round trips |
| Frontend | Dashboard fetched attendance + timelogs + tasks + all checklists | Large payloads on every navigation |
| Frontend | Chat unread polled every 15s even when tab hidden | Unnecessary API load |
| Backend | Full `documents` JSON (avatars/base64) on every `/api/employees` list | Multi‑MB responses |
| Backend | `db.export()` + disk write on every mutation (69+ paths) | Blocks event loop 50–200ms per write |
| Google Sheets | Full DB sync every 60s, all tables, `SELECT *` | CPU + network spikes |
| Build | Single 700KB vendor chunk | Slow first paint |

## Optimizations Applied

### Frontend
- **Lazy loading**: Already used for route modules; Vite chunks split by react/charts/icons.
- **Request deduplication**: `src/utils/requestCache.ts` + `safeGet` 8s TTL cache.
- **Parallel fetches**: `Promise.all` for attendance/timelogs/tasks.
- **View-scoped data**: Dashboard loads tasks only; checklists only on CHECKLIST/PERFORMANCE.
- **Employee home**: Scoped `/attendance?userId=` and `/timelogs?userId=`.
- **Chat polling**: 45s interval + pause when tab hidden.

### Backend
- **Debounced DB persist** (`server/utils/dbPersist.js`, 400ms): batches writes.
- **Lite employees list**: Avatar via `json_extract`, full profile on `/api/employees/:id`.
- **Batch checklists**: `GET /api/checklists-instances/all` replaces N+1 calls.
- **Response cache**: Holidays + checklist reads (15–120s TTL).
- **Google Sheets**: 5min default interval, skip unchanged payload, row limits, skip heavy tables.

### Production
- Vite: `esbuild` minify, smaller chunks, `drop: ['console']` in production.
- `prod-server.js`: HTTP keep-alive tuned.

## Environment Variables

```env
DB_PERSIST_DELAY_MS=400
GOOGLE_SHEETS_SYNC_MS=300000
GOOGLE_SHEETS_SYNC=0          # disable sheets sync entirely
GOOGLE_SHEETS_SKIP_TABLES=kv,site_photos
GOOGLE_SHEETS_MAX_ROWS=5000
```

## Expected Improvements

| Metric | Before (est.) | After (est.) |
|--------|----------------|--------------|
| Admin dashboard API calls | 25–40 | 2–4 |
| Dashboard load time | 3–8s | 0.5–1.5s |
| Employees list payload | 2–10MB | 50–200KB |
| DB write overhead per action | 50–200ms sync | <5ms scheduled |
| Google Sheets CPU | Spike every 60s | Every 5min, skip if unchanged |

## Further Recommendations

1. Move from sql.js to native `better-sqlite3` for 5–10x query/persist speed.
2. Add pagination to `/api/tasks`, `/api/attendance` for large datasets.
3. Serve uploads from CDN with long `Cache-Control`.
4. Add Redis for session + API cache in multi-instance deploys.
5. Run Lighthouse after `npm run build && npm run preview`.
