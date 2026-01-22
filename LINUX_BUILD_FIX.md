# Vite Build Fix: Missing CSS Import on Linux Server

## Problem Summary

**Error Message:**
```
Could not resolve "./styles/print.css" from "index.tsx"
```

**Why it happens:**
- ❌ Build fails **only on Linux server** (not locally)
- ❌ File exists locally but is **not committed to git**
- ❌ When code is pulled on Linux, the CSS file is missing
- ❌ Vite build fails because it can't find the import at build-time

**Why it works locally:**
- ✅ Physical file exists on your machine
- ✅ Vite dev server finds it during development
- ✅ But git repository is incomplete (missing the CSS)

---

## Root Cause Analysis

### What Was Happening

| Phase | Status | Details |
|-------|--------|---------|
| **Local Development** | ✅ Works | `styles/print.css` exists on your machine |
| **Git Tracking** | ❌ Missing | File NOT committed to git repository |
| **Linux Deployment** | ❌ Fails | `git pull` doesn't create untracked files |
| **Vite Build** | ❌ Fails | Cannot resolve missing import during build |

### The Build Process on Linux

```
1. git pull origin main
   └─ Downloads all tracked files
   └─ styles/print.css NOT in git → NOT downloaded ❌

2. npm run build
   └─ Vite reads index.tsx
   └─ Sees: import './styles/print.css'
   └─ Looks for file at: /path/to/styles/print.css
   └─ File doesn't exist → BUILD FAILS ❌
```

---

## Solution Applied

### The Fix: Commit CSS to Git

**Commit that fixed the issue:**
```
3650d45 (HEAD -> main) Add print.css stylesheet for browser-native pagination support
```

**What was done:**
```bash
git add styles/
git commit -m "Add print.css stylesheet for browser-native pagination support"
```

**Result:**
- ✅ `styles/print.css` is now tracked in git
- ✅ File deploys to Linux server when you `git pull`
- ✅ Vite build can resolve the import

---

## Current Setup (Production-Ready)

### File Structure
```
project/
├── index.tsx                           ← Entry point
├── styles/
│   └── print.css                       ← Global print stylesheet ✅ IN GIT
├── components/
│   ├── PerformanceReport.tsx           ← NO CSS imports in component
│   └── ... (other components)
├── vite.config.ts
└── package.json
```

### Import Configuration
```tsx
// index.tsx (CORRECT - global entry point)
import './styles/print.css';  ✅ Single import at root level
```

### CSS Content (262 lines)
```css
@media print {
  /* Browser-native pagination rules */
  .print-table thead { display: table-header-group; }
  .print-table tbody tr { page-break-inside: avoid; }
  /* ... 260 more lines of print styling */
}
```

---

## How This Works on Linux

### Linux Deployment Flow

```
1. Local Machine:
   git push origin main
   └─ Includes: styles/print.css ✅

2. Linux Server:
   git pull origin main
   └─ Downloads: styles/print.css ✅
   └─ File now exists on server ✅

3. Build on Linux:
   npm run build
   └─ Vite reads index.tsx
   └─ Finds import: './styles/print.css'
   └─ File exists at: ./styles/print.css ✅
   └─ Rollup processes CSS
   └─ CSS bundled into dist/assets/index-*.css ✅
   └─ BUILD SUCCEEDS ✅
```

### Why Linux Case-Sensitivity Doesn't Break This

- ✅ File is lowercase: `print.css`
- ✅ Import is lowercase: `'./styles/print.css'`
- ✅ Directory is lowercase: `styles/`
- ✅ All match exactly (no case mismatches)
- ✅ Works on Linux, macOS, and Windows

---

## Deployment Checklist

### Before Pushing to Linux

- ✅ `styles/print.css` exists locally: `ls styles/print.css`
- ✅ File is tracked in git: `git ls-files styles/print.css`
- ✅ File is committed: `git log --oneline | head -1`
- ✅ Build passes locally: `npm run build` (exit code 0)

### After Pulling on Linux Server

```bash
# Pull code
git pull origin main

# Verify file exists on server
ls -la styles/print.css
# Output: -rw-r--r-- ... styles/print.css ✅

# Build on server
npm run build

# Expected output (excerpt):
# ✓ 2599 modules transformed.
# dist/assets/index-*.css      2.86 kB │ gzip:   0.83 kB
# ✓ built in 4.27s
```

---

## Best Practices for Print Styles in Vite

### ✅ Recommended: Global CSS Import (What We're Using)

**Why this is best:**
1. **Single import point** - Import once in entry point, use everywhere
2. **Build-time resolution** - Vite/Rollup resolves at compile time (reliable)
3. **Linux safe** - File must exist; no case issues with this setup
4. **Performance** - CSS bundled into main bundle efficiently
5. **Maintainability** - All print styles in one place

**Implementation:**
```tsx
// index.tsx (entry point)
import './styles/print.css';

// All components can use classes:
<table className="print-table">  {/* Styled by print.css */}
```

### Alternative: Tailwind Print Utilities (Not Used Here)

**Would require:**
```tsx
<table className="print:text-xs print:border print:border-gray-400">
```

**Drawbacks:**
- Class bloat in JSX
- Repeated print styles everywhere
- Harder to maintain
- Not used in your project

---

## How Rollup Resolves the Import

### Resolution Process

```
1. Parser reads index.tsx
2. Finds: import './styles/print.css'
3. Resolves relative path from /index.tsx → /styles/print.css
4. Checks if file exists:
   ✅ File found at ./styles/print.css
5. CSS processor:
   - Reads file content (262 lines)
   - Extracts @media print rules
   - Bundles into production CSS
6. Output:
   dist/assets/index-<hash>.css (includes print styles)
```

### Why Git Matters

```
WITH git tracking (CURRENT - ✅):
─────────────────────────────
Local Dev → git push → Linux pull → File exists → Build succeeds

WITHOUT git tracking (BEFORE - ❌):
──────────────────────────────────
Local Dev → git push → Linux pull → File missing → Build fails
```

---

## Testing the Fix

### Verify Locally
```bash
# Full clean build
rm -rf dist
npm run build

# Expected: ✓ built in 4.27s (or similar)
# Exit code: 0
```

### Verify Print Functionality
```bash
# Start dev server
npm run dev

# Navigate to Performance Reports
# Select an employee
# Click "Print Report" button
# Browser print preview should show formatted output
```

### Verify on Linux Server
```bash
# SSH to server
ssh user@your-linux-server

# Navigate to project
cd /path/to/project

# Pull latest code
git pull origin main

# Verify file exists
ls -la styles/print.css
# Output: -rw-r--r-- ... styles/print.css ✅

# Build
npm run build
# Expected: ✓ built in 4.27s
# Exit code: 0
```

---

## Git Status Verification

### Current State

```bash
git log --oneline -1
# Output: 3650d45 Add print.css stylesheet for browser-native pagination support ✅

git ls-files styles/
# Output: styles/print.css ✅

git status
# Output: On branch main (clean) ✅
```

### What This Means
- ✅ File is committed to git
- ✅ File will deploy when you push
- ✅ No "untracked files" warnings
- ✅ Linux server can pull it

---

## Preventing Future Issues

### 1. Always Commit CSS Files
```bash
# When you create a new CSS file:
git add styles/new-file.css
git commit -m "Add new stylesheet"
```

### 2. Check Before Pushing
```bash
# Make sure new files are tracked:
git status
# Should NOT show "styles/" as untracked

git ls-files | grep styles/
# Should show all CSS files you created
```

### 3. Test Build Before Deployment
```bash
# Local build must pass:
npm run build
# Exit code must be 0

# Then push:
git push origin main
```

### 4. Verify on Server After Deployment
```bash
# SSH to server and check:
git pull origin main
npm run build
# Must complete successfully
```

---

## Summary

| Item | Status | Details |
|------|--------|---------|
| **Root Cause** | ✅ Fixed | File was not committed to git |
| **Current Fix** | ✅ Applied | `styles/print.css` now in git repo |
| **Build Status** | ✅ Passing | `npm run build` succeeds locally |
| **Linux Ready** | ✅ Yes | File will deploy to server |
| **Print Functionality** | ✅ Works | Browser-native pagination configured |
| **Case Sensitivity** | ✅ Safe | All lowercase filenames match imports |

---

## Next Steps

### Deploy to Live Server

```bash
# 1. Push code (includes print.css)
git push origin main

# 2. On Linux server:
git pull origin main
npm run build

# 3. Restart application
pm2 restart app-name  # or your deployment process
```

### Verify Deployment

- ✅ Build completes without errors
- ✅ No "Could not resolve" messages
- ✅ Print functionality works in browser
- ✅ No console errors in browser dev tools

---

## Questions & Troubleshooting

### Q: Why doesn't the build work on Linux but works locally?
**A:** Vite build is strict about file existence at build-time. Local dev server might be more forgiving. If a file isn't in git, it won't be on the server.

### Q: Will this affect performance?
**A:** No. CSS is bundled once into the production bundle. No impact on page load or runtime performance.

### Q: Can I use Tailwind print utilities instead?
**A:** Not necessary. Your current setup is optimal. Tailwind utilities would add class bloat without benefit here.

### Q: What if the build still fails on Linux?
**A:** Run on server:
```bash
git ls-files | grep styles
# Should output: styles/print.css
# If missing, run locally: git add styles/ && git push
```

---

**File:** styles/print.css
**Status:** ✅ Committed to git (commit 3650d45)
**Build Status:** ✅ Passing
**Linux Ready:** ✅ Yes
**Last Updated:** January 22, 2026
