# ⚙️ PM2 Deployment & Management Guide

## Quick PM2 Commands

### **Start Application**
```bash
# Start from ecosystem.config.js
pm2 start ecosystem.config.js --env production

# Start single app
pm2 start server/prod-server.js --name fms-prod

# Check status
pm2 status
pm2 list
```

### **Stop/Restart**
```bash
# Stop app
pm2 stop fms-prod

# Restart (graceful)
pm2 restart fms-prod

# Restart all apps
pm2 restart all

# Reload (zero-downtime)
pm2 reload fms-prod

# Stop all apps
pm2 stop all

# Delete app from PM2
pm2 delete fms-prod
```

### **Logging & Debugging**
```bash
# View recent logs
pm2 logs fms-prod

# View error logs
pm2 logs fms-prod --err

# Monitor in real-time
pm2 monit

# Show app info
pm2 info fms-prod

# Show all apps with uptime
pm2 list

# Save and restore apps on reboot
pm2 startup
pm2 save

# Disable startup on reboot
pm2 unstartup
```

### **Memory & Performance**
```bash
# Check memory usage
ps aux | grep node

# Monitor all processes
pm2 monit

# Show detailed stats
pm2 info fms-prod

# Check if app exceeded memory limit
pm2 logs fms-prod --err | grep "memory"
```

## Complete PM2 Setup on Fresh VPS

### **1. Install PM2 Globally**
```bash
npm install -g pm2@latest
pm2 update
```

### **2. Navigate to Project Directory**
```bash
cd /path/to/project

# Verify files
ls -la | grep ecosystem
```

### **3. Start Application**
```bash
# Copy .env settings to .env or load them
export JWT_SECRET="your-production-secret"
export NODE_ENV="production"

# Start app
pm2 start ecosystem.config.js --env production

# Verify it started
pm2 list
pm2 logs fms-prod
```

### **4. Enable Startup on Boot**
```bash
# Generate startup script
pm2 startup

# Run the command PM2 outputs (usually something like:)
# sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup ...

# Save PM2 state
pm2 save

# Verify
pm2 status
```

### **5. Configure Log Rotation (Optional)**
```bash
pm2 install pm2-logrotate

# Configure log retention
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 30
pm2 set pm2-logrotate:compress true
```

## Safe Deployment Workflow with PM2

### **Deploying Updated Code**

```bash
# 1. Stop the current app (with timeout)
pm2 stop fms-prod --kill-timeout 10000

# 2. Verify it's stopped
pm2 status

# 3. Download/update code (via FileZilla or git)
# Upload new files to /path/to/project

# 4. Clear old build artifacts
rm -rf dist node_modules/.vite

# 5. Install dependencies
npm install

# 6. Build (in background, with memory limit)
export NODE_OPTIONS="--max-old-space-size=512"
npm run build

# 7. Verify build succeeded
ls -lh dist/ | head -20

# 8. Start the app
pm2 start ecosystem.config.js --env production

# 9. Check if it started successfully
sleep 2
pm2 logs fms-prod --lines 20
```

## Troubleshooting PM2 Issues

### **App Won't Start**
```bash
# Check logs
pm2 logs fms-prod --err

# Check if port is already in use
lsof -i :3000  # or use your PORT

# Kill the process using the port
kill -9 <PID>

# Try starting again
pm2 start ecosystem.config.js --env production
```

### **App Crashes Immediately**
```bash
# View error logs
pm2 logs fms-prod --err --lines 50

# Check environment variables
pm2 info fms-prod

# Check if dependencies are installed
npm ls 2>&1 | head -20

# Try rebuilding
rm -rf dist node_modules
npm install
npm run build

# Try starting again
pm2 start ecosystem.config.js --env production
```

### **High Memory Usage / Out of Memory**
```bash
# Check memory limit in config
cat ecosystem.config.js | grep max_memory

# Monitor memory in real-time
pm2 monit

# Kill and restart (will use fresh memory)
pm2 kill
pm2 start ecosystem.config.js --env production

# If still crashing, reduce memory limit or increase VPS RAM
```

### **PM2 Daemon Won't Stop**
```bash
# Force kill PM2 daemon
pm2 kill

# Kill any stuck node processes
pkill -9 node

# Check nothing is running
ps aux | grep node

# Start fresh
pm2 start ecosystem.config.js --env production
```

## FileZilla Deployment with PM2

### **Recommended Workflow**

1. **Upload files to temporary directory**
   ```bash
   # Via FileZilla: Upload to /home/user/fms-new/
   ```

2. **Test the build first (on a test branch)**
   ```bash
   cd /home/user/fms-new
   npm install
   npm run build
   ```

3. **If build succeeds, swap to production**
   ```bash
   cd /home/user
   mv fms-prod fms-prod-backup-$(date +%s)
   mv fms-new fms-prod
   pm2 restart fms-prod
   ```

4. **Verify it works**
   ```bash
   pm2 logs fms-prod
   curl http://localhost:3000/api/health
   ```

5. **If something breaks, rollback**
   ```bash
   pm2 stop fms-prod
   mv fms-prod fms-prod-broken
   mv fms-prod-backup-TIMESTAMP fms-prod
   pm2 restart fms-prod
   ```

## Deployment Checklist

- [ ] Node.js version is 24.11.0+ (`node --version`)
- [ ] npm version is 11.7.0+ (`npm --version`)
- [ ] .env file exists with correct secrets
- [ ] JWT_SECRET is set in .env
- [ ] VITE_API_URL points to production domain
- [ ] npm install completes without errors
- [ ] npm run build completes and creates dist/
- [ ] dist/index.html exists
- [ ] pm2 start succeeds
- [ ] pm2 logs fms-prod shows no errors
- [ ] curl http://localhost:3000 returns HTML
- [ ] curl http://localhost:3000/api/health works
- [ ] PM2 startup is configured (`pm2 startup`)
- [ ] PM2 state is saved (`pm2 save`)

## Next Steps

1. ✅ Use PM2 commands to manage app
2. → See [SAFE_DEPLOYMENT.md](SAFE_DEPLOYMENT.md)
3. → See [PRODUCTION_TROUBLESHOOTING.md](PRODUCTION_TROUBLESHOOTING.md)
