Deployment checklist — production-ready build and server setup

1) Environment variables (example)
   - NODE_ENV=production
   - JWT_SECRET=<strong random secret>
   - FRONTEND_ORIGIN=https://kbt.kalrabuildtech.com
   - VITE_API_URL=https://kbt.kalrabuildtech.com/api
   - DB_FILE=users.sqlite

2) Build frontend (on your CI or deployment host)
   - Ensure VITE_API_URL is set when running the build (this value is baked into the compiled assets):
     - Linux/macOS: VITE_API_URL='https://kbt.kalrabuildtech.com/api' npm run build
     - Windows (PowerShell): $env:VITE_API_URL='https://kbt.kalrabuildtech.com/api'; npm run build

3) Serve frontend with a static host (nginx) and proxy /api to the backend
   - Example nginx server block snippet:
     server {
       listen 443 ssl;
       server_name kbt.kalrabuildtech.com;
       # ... TLS config ...

       root /var/www/kbt; # path to built assets (index.html)
       index index.html;

       # IMPORTANT: place /api/ proxy BEFORE the general / try_files block so API requests are not served the SPA index.html
       location /api/ {
         proxy_pass http://localhost:3000/;
         proxy_set_header Host $host;
         proxy_set_header X-Real-IP $remote_addr;
         proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
         proxy_set_header X-Forwarded-Proto $scheme;
         # IMPORTANT: forward Authorization header so Express can read Bearer tokens
         proxy_set_header Authorization $http_authorization;
       }

       location / {
         try_files $uri $uri/ /index.html;
       }
     }

4) Start/Restart backend (pm2 example)
   - pm2 start ecosystem.config.js --env production
   - Or use the packaged helper: VITE_API_URL='https://kbt.kalrabuildtech.com/api' npm run deploy:pm2

5) Verifications
   - Open https://kbt.kalrabuildtech.com and verify network calls go to https://kbt.kalrabuildtech.com/api
   - Login and verify cookie is set (HttpOnly) and `/api/auth/me` returns user info
   - Confirm `/api/users` and `/api/attendance` return 401 if unauthenticated and succeed when authenticated
- Note: `/api/users` now defaults to returning only active users; archived users are set via soft-delete and are available via `/api/users?archived=1` or `/api/users/archived` (admin only)
   - If you see requests for `/tasks` returning the site's `index.html`, that means the frontend is issuing same-origin requests (no VITE_API_URL) or nginx is not proxying `/api/` to the backend — ensure `VITE_API_URL` was set at build time and that nginx's `location /api/` block appears before the `location /` try_files block.

6) Notes and best practices
   - Use per-environment secrets (don't commit JWT_SECRET).
   - Set secure cookies only in production. The server already sets sameSite='none' and secure when NODE_ENV=production.
   - The frontend build reads VITE_API_URL at build-time; ensure CI sets it correctly.
   - Keep CORS strict — the server will allow only FRONTEND_ORIGIN and configured dev hosts.
