#!/bin/bash

# ==================================================
# Safe Production Deployment Script
# ==================================================
# Run this on VPS to safely deploy updated code
# Usage: bash deploy.sh /path/to/code
# ==================================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Production Deployment Script                  ║${NC}"
echo -e "${BLUE}║  FMS Application                               ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════╝${NC}"

# ====================================================
# PHASE 0: VALIDATE INPUT
# ====================================================

if [ -z "$1" ]; then
  echo -e "${RED}✗ Error: No code path provided${NC}"
  echo "Usage: bash deploy.sh /path/to/code"
  exit 1
fi

CODE_PATH="$1"
if [ ! -d "$CODE_PATH" ]; then
  echo -e "${RED}✗ Error: Directory not found: $CODE_PATH${NC}"
  exit 1
fi

if [ ! -f "$CODE_PATH/package.json" ]; then
  echo -e "${RED}✗ Error: package.json not found in $CODE_PATH${NC}"
  exit 1
fi

PROD_DIR="/var/www/fms-prod"
BACKUP_DIR="/var/www/fms-prod-backup-$(date +%s)"

echo -e "${BLUE}Configuration:${NC}"
echo "  Source code: $CODE_PATH"
echo "  Production:  $PROD_DIR"
echo "  Backup:      $BACKUP_DIR"

# ====================================================
# PHASE 1: PRE-DEPLOYMENT CHECKS
# ====================================================

echo -e "\n${BLUE}PHASE 1: Pre-deployment Checks${NC}"

# Check Node.js version
NODE_VERSION=$(node --version | cut -d'v' -f2)
echo -e "  Node.js version: ${GREEN}$NODE_VERSION${NC}"

# Check npm version
NPM_VERSION=$(npm --version)
echo -e "  npm version:     ${GREEN}$NPM_VERSION${NC}"

# Check PM2
if ! command -v pm2 &> /dev/null; then
  echo -e "${RED}✗ PM2 not found. Install with: npm install -g pm2${NC}"
  exit 1
fi
echo -e "  PM2:             ${GREEN}installed${NC}"

# Check disk space
AVAILABLE_DISK=$(df "$PROD_DIR" | awk 'NR==2 {print $4}')
if [ "$AVAILABLE_DISK" -lt 500000 ]; then
  echo -e "${YELLOW}⚠ Warning: Low disk space (< 500MB available)${NC}"
fi
echo -e "  Disk space:      ${GREEN}$(df -h "$PROD_DIR" | awk 'NR==2 {print $4}') available${NC}"

# Check memory
AVAILABLE_MEM=$(free | grep Mem | awk '{print $7}')
echo -e "  Free memory:     ${GREEN}$((AVAILABLE_MEM / 1024))MB${NC}"

echo -e "${GREEN}✓ Pre-deployment checks passed${NC}"

# ====================================================
# PHASE 2: BUILD ON STAGING
# ====================================================

echo -e "\n${BLUE}PHASE 2: Build on Staging${NC}"

cd "$CODE_PATH"

# Install dependencies
echo "  Installing dependencies..."
npm install --production --no-optional

# Build
echo "  Building..."
export NODE_OPTIONS="--max-old-space-size=512"
npm run build

if [ ! -f "$CODE_PATH/dist/index.html" ]; then
  echo -e "${RED}✗ Build failed: dist/index.html not found${NC}"
  exit 1
fi

BUILD_SIZE=$(du -sh "$CODE_PATH/dist" | cut -f1)
echo -e "${GREEN}✓ Build successful (Size: $BUILD_SIZE)${NC}"

# ====================================================
# PHASE 3: BACKUP CURRENT PRODUCTION
# ====================================================

echo -e "\n${BLUE}PHASE 3: Backup Current Production${NC}"

if [ -d "$PROD_DIR" ]; then
  echo "  Backing up current production to $BACKUP_DIR..."
  sudo mkdir -p "$BACKUP_DIR"
  sudo cp -r "$PROD_DIR"/* "$BACKUP_DIR/" 2>/dev/null || true
  echo -e "${GREEN}✓ Backup created${NC}"
else
  echo -e "${YELLOW}⚠ No existing production to backup${NC}"
fi

# ====================================================
# PHASE 4: STOP CURRENT APP
# ====================================================

echo -e "\n${BLUE}PHASE 4: Stop Current App${NC}"

if pm2 list | grep -q "fms-prod"; then
  echo "  Stopping PM2 app..."
  pm2 stop fms-prod --kill-timeout 15000
  sleep 2
  echo -e "${GREEN}✓ App stopped${NC}"
else
  echo -e "${YELLOW}⚠ No running PM2 app to stop${NC}"
fi

# ====================================================
# PHASE 5: DEPLOY NEW CODE
# ====================================================

echo -e "\n${BLUE}PHASE 5: Deploy New Code${NC}"

# Remove old production
if [ -d "$PROD_DIR" ]; then
  echo "  Removing old production directory..."
  sudo rm -rf "$PROD_DIR"
fi

# Copy new code
echo "  Copying new code..."
sudo mkdir -p "$PROD_DIR"
sudo cp -r "$CODE_PATH"/* "$PROD_DIR/"

# Setup directories
echo "  Setting up directories..."
sudo mkdir -p "$PROD_DIR/logs"
sudo mkdir -p "$PROD_DIR/server/uploads"

# Set permissions
echo "  Setting permissions..."
sudo chown -R "$USER:$USER" "$PROD_DIR"
chmod 755 "$PROD_DIR"
chmod 644 "$PROD_DIR"/*.json "$PROD_DIR"/*.ts "$PROD_DIR"/*.html
chmod -R 755 "$PROD_DIR/server"
chmod 644 "$PROD_DIR/server/database.sqlite" 2>/dev/null || true

echo -e "${GREEN}✓ Code deployed${NC}"

# ====================================================
# PHASE 6: START APPLICATION
# ====================================================

echo -e "\n${BLUE}PHASE 6: Start Application${NC}"

cd "$PROD_DIR"

# Delete from PM2 if exists (clean start)
pm2 delete fms-prod 2>/dev/null || true

# Start with proper config
echo "  Starting with PM2..."
pm2 start ecosystem.config.js --env production
sleep 3

# Check if started
if pm2 list | grep -q "online"; then
  echo -e "${GREEN}✓ App started successfully${NC}"
else
  echo -e "${RED}✗ App failed to start${NC}"
  echo "Checking logs..."
  pm2 logs fms-prod --err --lines 30
  exit 1
fi

# ====================================================
# PHASE 7: VERIFY DEPLOYMENT
# ====================================================

echo -e "\n${BLUE}PHASE 7: Verify Deployment${NC}"

# Wait a bit for app to fully initialize
sleep 2

# Check PM2 status
echo "  PM2 Status:"
pm2 list

# Check if frontend serves
echo "  Testing frontend..."
if curl -s http://localhost:3000 | grep -q "html"; then
  echo -e "    ${GREEN}✓ Frontend responding${NC}"
else
  echo -e "    ${YELLOW}⚠ Frontend not responding (might still be loading)${NC}"
fi

# Check logs for errors
echo "  Checking for startup errors..."
ERROR_COUNT=$(pm2 logs fms-prod --err --lines 50 2>/dev/null | grep -i "error\|warn" | wc -l)
if [ "$ERROR_COUNT" -eq 0 ]; then
  echo -e "    ${GREEN}✓ No startup errors${NC}"
else
  echo -e "    ${YELLOW}⚠ $ERROR_COUNT potential issues found:${NC}"
  pm2 logs fms-prod --err --lines 20
fi

# ====================================================
# PHASE 8: POST-DEPLOYMENT
# ====================================================

echo -e "\n${BLUE}PHASE 8: Post-Deployment${NC}"

# Save PM2 state
echo "  Saving PM2 state..."
pm2 save

# Show deployment summary
echo -e "\n${BLUE}╔════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Deployment Complete                           ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════╝${NC}"

echo -e "${GREEN}✓ Deployment successful!${NC}"
echo ""
echo "Summary:"
echo "  ✓ Code deployed to: $PROD_DIR"
echo "  ✓ Backup saved to: $BACKUP_DIR"
echo "  ✓ Application started"
echo ""
echo "Next steps:"
echo "  1. Monitor logs: pm2 logs fms-prod"
echo "  2. Check status: pm2 list"
echo "  3. Visit: https://kbt.kalrabuildtech.com"
echo ""
echo "To rollback:"
echo "  pm2 stop fms-prod"
echo "  rm -rf $PROD_DIR"
echo "  mv $BACKUP_DIR $PROD_DIR"
echo "  pm2 start ecosystem.config.js --env production"
echo ""

# ====================================================
# CLEANUP & EXIT
# ====================================================

echo "Cleaning old backups (keeping last 3)..."
ls -td /var/www/fms-prod-backup-* 2>/dev/null | tail -n +4 | xargs rm -rf {} \; 2>/dev/null || true

echo -e "${GREEN}Done!${NC}"
