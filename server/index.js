import express from 'express';
import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import compression from 'compression';
import { runMigrations } from './migrations.js';
import { success, failure } from './utils/respond.js';
import cron from 'node-cron';
import nodemailer from 'nodemailer';
import { startPeriodicSync, syncToGoogleSheets } from './googleSheetsSync.js';
import { createDebouncedPersist } from './utils/dbPersist.js';
import { cacheGet, cacheSet, cacheInvalidate, withCache } from './utils/apiCache.js';

const app = express();
app.use(compression());

// Global API Cache Invalidation Middleware for state-changing requests
app.use((req, res, next) => {
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    try {
      const url = req.originalUrl || req.url || '';
      if (url.includes('/api/users') || url.includes('/api/admin/cleanup-demo-users') || url.includes('/api/admin/archive-demo-users')) {
        cacheInvalidate('users');
      }
      if (url.includes('/api/employees') || url.includes('/api/employee/profile') || url.includes('/api/employee/documents')) {
        cacheInvalidate('employees');
      }
      if (url.includes('/api/attendance')) {
        cacheInvalidate('attendance');
      }
      if (url.includes('/api/timelogs')) {
        cacheInvalidate('timelogs');
      }
      if (url.includes('/api/tasks')) {
        cacheInvalidate('tasks');
      }
      if (url.includes('/api/finance')) {
        cacheInvalidate('finance');
      }
      if (url.includes('/api/checklist-templates') || url.includes('/api/checklists')) {
        cacheInvalidate('checklist-templates');
        cacheInvalidate('checklists:');
      }
      if (url.includes('/api/o2d')) {
        cacheInvalidate('o2d');
      }
      if (url.includes('/api/notepad')) {
        cacheInvalidate('notepad');
      }
      if (url.includes('/api/queries')) {
        cacheInvalidate('queries');
      }
      if (url.includes('/api/reminders')) {
        cacheInvalidate('reminders');
      }
      if (url.includes('/api/leave') || url.includes('/api/leaves')) {
        cacheInvalidate('leave');
      }
      if (url.includes('/api/holidays')) {
        cacheInvalidate('holidays');
      }
    } catch (e) {
      console.warn('Cache invalidation middleware warning:', e);
    }
  }
  next();
});

// Mount legacy/auxiliary PMS router if present (DISABLED to avoid conflict with new consolidated routes)
/*
try {
  // use require so it works in both ESM and CJS setups
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pmsRouter = require('./pmsRoutes');
  if (pmsRouter) app.use('/api/pms', pmsRouter);
} catch (e) {
  // ignore if router not present or fails to load
}
*/

// Backwards-compatibility middleware: some older frontend code calls `/server/...`.
// Map these requests to the new `/api/pms/...` handlers so older bundles still work.
app.use(['/server', '/pms'], (req, res, next) => {
  try {
    // If the request doesn't start with /api, we prefix it to help matching
    if (!req.url.startsWith('/api')) {
      // Ensure we don't double-prefix
      const cleanPath = req.url.startsWith('/pms') ? req.url : '/pms' + req.url;
      req.url = '/api' + (cleanPath.startsWith('/') ? '' : '/') + cleanPath;
    }
  } catch (e) { /* ignore */ }
  next();
});

// Debug helpers: capture any uncaught exceptions or unhandled promise rejections so we can see why the process may exit
process.on('uncaughtException', (err) => {
  console.error('UncaughtException:', err && (err.stack || err.message || err));
});
process.on('unhandledRejection', (reason) => {
  console.error('UnhandledRejection:', reason && (reason.stack || reason));
});
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// DB file name (configurable via DB_FILE). Use a persistent sqlite file by default.
// Server is only allowed to write this single DB file inside the server directory.
const DB_FILENAME = process.env.DB_FILE || 'database.sqlite';
const dbFile = path.resolve(__dirname, DB_FILENAME);
let isWritingRootDb = false;
// Prevent accidental writes outside the server directory (avoid path traversal or absolute paths elsewhere)
if (!dbFile.startsWith(__dirname + path.sep) && dbFile !== path.join(__dirname, DB_FILENAME)) {
  throw new Error(`DB file must be inside server directory: ${dbFile}`);
}

// --- Database Sync Logic: automatically synchronize root and server database files ---
try {
  const rootDbFile = path.resolve(__dirname, '..', 'database.sqlite');
  if (fs.existsSync(rootDbFile)) {
    const rootStats = fs.statSync(rootDbFile);
    let copyRoot = false;
    if (fs.existsSync(dbFile)) {
      const serverStats = fs.statSync(dbFile);
      // If root database has a different size or is newer, copy it over!
      if (rootStats.size !== serverStats.size || rootStats.mtimeMs > serverStats.mtimeMs) {
        copyRoot = true;
      }
    } else {
      copyRoot = true;
    }
    if (copyRoot && rootStats.size > 0) {
      console.log(`[Database Sync] Found different/newer root database.sqlite (${(rootStats.size / 1024 / 1024).toFixed(2)} MB). Syncing to ${dbFile}...`);
      fs.copyFileSync(rootDbFile, dbFile);
    }
  }
} catch (err) {
  console.warn('[Database Sync] Failed to sync root database.sqlite to server directory:', err);
}

const JWT_SECRET = process.env.JWT_SECRET || 'dev_jwt_secret_change_me';
// In production we must have a real JWT_SECRET configured
if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || !String(process.env.JWT_SECRET).trim())) {
  console.error('FATAL: NODE_ENV=production but JWT_SECRET is not set. Aborting startup.');
  throw new Error('Missing JWT_SECRET in production environment');
}

// Initialize sql.js (WASM-based SQLite)
let SQL;
let db;
let dbPersistCtl = null;
let ensureSchemaAndIndexes;
try {
  SQL = await initSqlJs();
  console.log('sql.js initialized');

  if (fs.existsSync(dbFile)) {
    const buff = fs.readFileSync(dbFile);
    db = new SQL.Database(new Uint8Array(buff));
    console.log('Loaded existing DB:', dbFile);
  } else {
    // If DB doesn't exist, create and seed it. In production we create the DB
    // to ensure persistence (set DB_FILE explicitly to control location).
    // Note: If you prefer to provide an existing DB in production, set DB_FILE
    // and ensure the file is uploaded before starting the server.
    // Creation here ensures the app still functions and persists data to disk.
    // Behavior: create and seed a new DB.
    db = new SQL.Database();
    db.run(`CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      email TEXT UNIQUE,
      password TEXT,
      role TEXT,
      employeeId TEXT
    )`);

    // Employees table (store employee records centrally)
    db.run(`CREATE TABLE employees (
      id TEXT PRIMARY KEY,
      name TEXT,
      department TEXT,
      joiningDate TEXT,
      createdAt TEXT,
      status TEXT,
      designation TEXT,
      email TEXT,
      phone TEXT,
      birthDate TEXT,
      address TEXT,
      documents TEXT,
      compOffBalance REAL
    )`);

    // Attendance table
    db.run(`CREATE TABLE attendance (
      id TEXT PRIMARY KEY,
      userId TEXT,
      date TEXT,
      clockIn TEXT,
      clockOut TEXT,
      value REAL,
      location TEXT,
      notes TEXT,
      createdAt TEXT
    )`);

    // Time logs table
    db.run(`CREATE TABLE timelogs (
      id TEXT PRIMARY KEY,
      userId TEXT,
      startTime TEXT,
      endTime TEXT,
      task TEXT,
      notes TEXT,
      createdAt TEXT
    )`);

    // Tasks table: store tasks centrally so they are accessible across devices
    db.run(`CREATE TABLE tasks (
      id TEXT PRIMARY KEY,
      title TEXT,
      description TEXT,
      assignedTo TEXT,
      assignedBy TEXT,
      createdDate TEXT,
      dueDate TEXT,
      status TEXT,
      priority TEXT,
      attachment TEXT,
      externalLink TEXT,
      statusNote TEXT,
      completionDate TEXT,
      completionProcess TEXT,
      completionAttachment TEXT,
      extensionRequest TEXT,
      extensionHistory TEXT
    )`);

    const insert = db.prepare('INSERT INTO users (name, email, password, role, employeeId) VALUES (?,?,?,?,?)');
    // Store seeded passwords as bcrypt hashes
    insert.run(['Admin User', 'admin@example.com', bcrypt.hashSync('admin123', 10), 'ADMIN', null]);
    // Also seed legacy client default admin (admin@fms.com / admin) for compatibility
    insert.run(['Administrator', 'admin@fms.com', bcrypt.hashSync('admin', 10), 'ADMIN', null]);
    insert.free && insert.free();

    // Persist
    persistDB();
    console.log('Created', dbFile, 'and seeded default admin user');
  }

  ensureSchemaAndIndexes = async function() {
    // Guarantee that core tables (users, employees, tasks) exist immediately before indexes or migrations run
    try {
      const tblUsers = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'");
      const hasUsers = tblUsers.step();
      tblUsers.free();
      if (!hasUsers) {
        db.run(`CREATE TABLE users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT,
          email TEXT UNIQUE,
          password TEXT,
          role TEXT,
          employeeId TEXT
        )`);
        const insert = db.prepare('INSERT INTO users (name, email, password, role, employeeId) VALUES (?,?,?,?,?)');
        insert.run(['Admin User', 'admin@example.com', bcrypt.hashSync('admin123', 10), 'ADMIN', null]);
        insert.run(['Administrator', 'admin@fms.com', bcrypt.hashSync('admin', 10), 'ADMIN', null]);
        insert.free && insert.free();
        persistDB();
        console.log('Ensure Users: created users table and seeded default admin users');
      }
    } catch (err) {
      console.warn('Users table check failed', err);
    }

    try {
      const tblEmps = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='employees'");
      const hasEmps = tblEmps.step();
      tblEmps.free();
      if (!hasEmps) {
        db.run(`CREATE TABLE employees (
          id TEXT PRIMARY KEY,
          name TEXT,
          department TEXT,
          joiningDate TEXT,
          createdAt TEXT,
          avatar TEXT,
          designation TEXT,
          panNumber TEXT,
          bankAccount TEXT,
          bankName TEXT,
          ifscCode TEXT,
          aadhaarNumber TEXT,
          uanNumber TEXT,
          esiNumber TEXT,
          hideAttendance INTEGER DEFAULT 0
        )`);
        persistDB();
        console.log('Ensure Employees: created employees table');
      }
    } catch (err) {
      console.warn('Employees table check failed', err);
    }

    try {
      const tblTasks = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='tasks'");
      const hasTasks = tblTasks.step();
      tblTasks.free();
      if (!hasTasks) {
        db.run(`CREATE TABLE tasks (
          id TEXT PRIMARY KEY,
          title TEXT,
          description TEXT,
          assignedTo TEXT,
          assignedBy TEXT,
          createdDate TEXT,
          dueDate TEXT,
          status TEXT,
          priority TEXT,
          attachment TEXT,
          externalLink TEXT,
          statusNote TEXT,
          completionDate TEXT,
          completionProcess TEXT,
          completionAttachment TEXT,
          extensionRequest TEXT,
          extensionHistory TEXT
        )`);
        persistDB();
        console.log('Ensure Tasks: created tasks table');
      }
    } catch (err) {
      console.warn('Tasks table check failed', err);
    }

    // Enable foreign keys for referential integrity where possible
    try {
      db.run('PRAGMA foreign_keys = ON');
    } catch (e) {
      console.warn('Could not enable foreign_keys PRAGMA', e && (e.message || e));
    }

    // Ensure additional feature tables exist (calendar, finance, notifications, projects, checklists, o2d, chat, queries, notepad, leave, holidays)
    try {
      // Calendar events
      const tblCal = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='calendar'");
      const hasCal = tblCal.step(); tblCal.free();
      if (!hasCal) {
        db.run(`CREATE TABLE calendar (
          id TEXT PRIMARY KEY,
          title TEXT,
          description TEXT,
          startTime TEXT,
          endTime TEXT,
          createdBy TEXT,
          createdAt TEXT
        )`);
      }

      // Finance
      const tblFin = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='finance'");
      const hasFin = tblFin.step(); tblFin.free();
      if (!hasFin) {
        db.run(`CREATE TABLE finance (
          id TEXT PRIMARY KEY,
          amount REAL,
          currency TEXT,
          type TEXT,
          description TEXT,
          date TEXT,
          createdBy TEXT,
          createdAt TEXT
        )`);
      }

      // Notifications
      const tblNot = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='notifications'");
      const hasNot = tblNot.step(); tblNot.free();
      if (!hasNot) {
        db.run(`CREATE TABLE notifications (
          id TEXT PRIMARY KEY,
          userId TEXT,
          message TEXT,
          meta TEXT,
          isRead INTEGER DEFAULT 0,
          createdAt TEXT
        )`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_notifications_userId ON notifications(userId)`);
      }

      // Projects
      const tblProj = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='projects'");
      const hasProj = tblProj.step(); tblProj.free();
      if (!hasProj) {
        db.run(`CREATE TABLE projects (
          id TEXT PRIMARY KEY,
          name TEXT,
          address TEXT,
          status TEXT,
          data TEXT,
          createdBy TEXT,
          createdAt TEXT
        )`);
      }

      // Site photos table (store metadata and server path)
      const tblSite = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='site_photos'");
      const hasSite = tblSite.step(); tblSite.free();
      if (!hasSite) {
        db.run(`CREATE TABLE site_photos (
          id TEXT PRIMARY KEY,
          projectId TEXT,
          uploadedBy TEXT,
          filename TEXT,
          filepath TEXT,
          imageUrl TEXT,
          gps TEXT,
          date TEXT,
          timestamp TEXT,
          createdAt TEXT
        )`);
      }

      // Employee profiles (optional table for storing extended profile info)
      const tblProf = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='employees_profile'");
      const hasProf = tblProf.step(); tblProf.free();
      if (!hasProf) {
        db.run(`CREATE TABLE employees_profile (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER UNIQUE,
          full_name TEXT,
          designation TEXT,
          phone TEXT,
          profile_image TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON employees_profile(user_id)`);
      }

      // Employee documents
      const tblDoc = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='employee_documents'");
      const hasDoc = tblDoc.step(); tblDoc.free();
      if (!hasDoc) {
        db.run(`CREATE TABLE employee_documents (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER,
          document_name TEXT,
          file_path TEXT,
          file_type TEXT,
          uploaded_at TEXT DEFAULT CURRENT_TIMESTAMP
        )`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_documents_user_id ON employee_documents(user_id)`);
      }

      // Checklists
      const tblChk = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='checklists'");
      const hasChk = tblChk.step(); tblChk.free();
      if (!hasChk) {
        db.run(`CREATE TABLE checklists (
          id TEXT PRIMARY KEY,
          refId TEXT,
          refType TEXT,
          item TEXT,
          done INTEGER DEFAULT 0,
          createdBy TEXT,
          createdAt TEXT
        )`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_checklists_ref ON checklists(refId)`);
      }

      // Checklist templates (metadata for templates)
      const tblChkTpl = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='checklist_templates'");
      const hasChkTpl = tblChkTpl.step(); tblChkTpl.free();
      if (!hasChkTpl) {
        db.run(`CREATE TABLE checklist_templates (
          id TEXT PRIMARY KEY,
          data TEXT,
          createdBy TEXT,
          createdAt TEXT
        )`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_checklist_templates_created ON checklist_templates(createdAt)`);
      }

      // O2D
      const tblO2d = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='o2d'");
      const hasO2d = tblO2d.step(); tblO2d.free();
      if (!hasO2d) {
        db.run(`CREATE TABLE o2d (
          id TEXT PRIMARY KEY,
          data TEXT,
          status TEXT,
          createdBy TEXT,
          createdAt TEXT
        )`);
      }

      // Chat
      const tblChat = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='chat'");
      const hasChat = tblChat.step(); tblChat.free();
      if (!hasChat) {
        db.run(`CREATE TABLE chat (
          id TEXT PRIMARY KEY,
          teamId TEXT,
          senderId TEXT,
          message TEXT,
          meta TEXT,
          createdAt TEXT
        )`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_chat_teamId ON chat(teamId)`);
      }

      // Ensure chat schema has optional columns for edits/pins/deletes/replies
      try {
        const cols = [];
        const pragma = db.prepare("PRAGMA table_info('chat')");
        while (pragma.step()) { cols.push(pragma.getAsObject().name); }
        pragma.free();
        const needToAdd = (col) => cols.indexOf(col) === -1;
        if (needToAdd('updatedAt')) db.run("ALTER TABLE chat ADD COLUMN updatedAt TEXT");
        if (needToAdd('is_deleted')) db.run("ALTER TABLE chat ADD COLUMN is_deleted INTEGER DEFAULT 0");
        if (needToAdd('is_pinned')) db.run("ALTER TABLE chat ADD COLUMN is_pinned INTEGER DEFAULT 0");
        if (needToAdd('edited')) db.run("ALTER TABLE chat ADD COLUMN edited INTEGER DEFAULT 0");
        if (needToAdd('replyTo')) db.run("ALTER TABLE chat ADD COLUMN replyTo TEXT");
      } catch (e) { console.warn('Chat schema migration warning', e && (e.message || e)); }

      // Ensure chat_reads table exists for read receipts
      try {
        const tblReads = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='chat_reads'");
        const hasReads = tblReads.step(); tblReads.free();
        if (!hasReads) {
          db.run(`CREATE TABLE chat_reads (
            teamId TEXT,
            userId TEXT,
            lastReadAt TEXT,
            PRIMARY KEY(teamId, userId)
          )`);
        }
      } catch (e) { console.warn('Chat reads migration warning', e && (e.message || e)); }

      // Queries
      const tblQuery = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='queries'");
      const hasQuery = tblQuery.step(); tblQuery.free();
      if (!hasQuery) {
        db.run(`CREATE TABLE queries (
          id TEXT PRIMARY KEY,
          userId TEXT,
          senderId TEXT,
          receiverId TEXT,
          subject TEXT,
          message TEXT,
          response TEXT,
          status TEXT,
          createdAt TEXT,
          updatedAt TEXT
        )`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_queries_userId ON queries(userId)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_queries_sender ON queries(senderId)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_queries_receiver ON queries(receiverId)`);
      }

      // Notepad
      const tblNote = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='notepad'");
      const hasNote = tblNote.step(); tblNote.free();
      if (!hasNote) {
        db.run(`CREATE TABLE notepad (
          id TEXT PRIMARY KEY,
          userId TEXT,
          content TEXT,
          createdAt TEXT,
          updatedAt TEXT
        )`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_notepad_userId ON notepad(userId)`);
      }

      // Leave
      const tblLeave = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='leaves'");
      const hasLeave = tblLeave.step(); tblLeave.free();
      if (!hasLeave) {
        db.run(`CREATE TABLE leaves (
          id TEXT PRIMARY KEY,
          userId TEXT,
          startDate TEXT,
          endDate TEXT,
          days REAL,
          status TEXT,
          reason TEXT,
          createdAt TEXT
        )`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_leaves_userId ON leaves(userId)`);
      }

      // Holidays
      const tblHol = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='holidays'");
      const hasHol = tblHol.step(); tblHol.free();
      if (!hasHol) {
        db.run(`CREATE TABLE holidays (
          id TEXT PRIMARY KEY,
          name TEXT,
          date TEXT,
          recurring INTEGER DEFAULT 0,
          createdAt TEXT
        )`);
      }

      // Reminders (personal reminders migrated from client localStorage)
      const tblRem = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='reminders'");
      const hasRem = tblRem.step(); tblRem.free();
      if (!hasRem) {
        db.run(`CREATE TABLE reminders (
          id TEXT PRIMARY KEY,
          userId TEXT,
          date TEXT,
          title TEXT,
          createdBy TEXT,
          createdAt TEXT
        )`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_reminders_userId ON reminders(userId)`);
      }

      // Run idempotent migrations that ensure standard columns/indexes for modules
      try {
        await runMigrations({ db, dbFile });
      } catch (e) {
        console.warn('runMigrations failed', e && (e.message || e));
      }

      // Helpful indexes for performance optimization
      const tryCreateIndex = (name, sql) => {
        try {
          db.run(sql);
        } catch (e) {
          console.warn(`Failed to create index ${name}:`, e && (e.message || e));
        }
      };
      tryCreateIndex('idx_tasks_assignedTo', `CREATE INDEX IF NOT EXISTS idx_tasks_assignedTo ON tasks(assignedTo)`);
      tryCreateIndex('idx_tasks_assignedBy', `CREATE INDEX IF NOT EXISTS idx_tasks_assignedBy ON tasks(assignedBy)`);
      tryCreateIndex('idx_tasks_status', `CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)`);
      tryCreateIndex('idx_tasks_createdAt', `CREATE INDEX IF NOT EXISTS idx_tasks_createdAt ON tasks(createdAt)`);
      tryCreateIndex('idx_attendance_userId', `CREATE INDEX IF NOT EXISTS idx_attendance_userId ON attendance(userId)`);
      tryCreateIndex('idx_attendance_date', `CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date)`);
      tryCreateIndex('idx_timelogs_userId', `CREATE INDEX IF NOT EXISTS idx_timelogs_userId ON timelogs(userId)`);
      tryCreateIndex('idx_timelogs_startTime', `CREATE INDEX IF NOT EXISTS idx_timelogs_startTime ON timelogs(startTime)`);
      tryCreateIndex('idx_calendar_createdBy', `CREATE INDEX IF NOT EXISTS idx_calendar_createdBy ON calendar(createdBy)`);
      tryCreateIndex('idx_calendar_startTime', `CREATE INDEX IF NOT EXISTS idx_calendar_startTime ON calendar(startTime)`);
      tryCreateIndex('idx_projects_status', `CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status)`);
      tryCreateIndex('idx_employees_status', `CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(status)`);
      tryCreateIndex('idx_employees_department', `CREATE INDEX IF NOT EXISTS idx_employees_department ON employees(department)`);
      tryCreateIndex('idx_checklists_ref_created', `CREATE INDEX IF NOT EXISTS idx_checklists_ref_created ON checklists(refId, createdAt)`);

      // Generic key/value table for client-side storage migration
      const tblKV = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='kv'");
      const hasKV = tblKV.step(); tblKV.free();
      if (!hasKV) {
        db.run(`CREATE TABLE kv (
          key TEXT PRIMARY KEY,
          value TEXT,
          updatedAt TEXT
        )`);
      }

      persistDB();
      console.log('Additional feature tables ensured');
    } catch (e) {
      console.warn('Failed to ensure additional tables', e && (e.message || e));
    }
  }

  // Run initialization
  await ensureSchemaAndIndexes();

  // Mark the app as ready for embedded hosts
  app.set('ready', true);
  console.log('Server initialization complete, DB ready');

  dbPersistCtl = createDebouncedPersist(
    () => Buffer.from(db.export()),
    (buff) => {
      isWritingRootDb = true;
      fs.writeFile(dbFile, buff, (err) => {
        if (err) {
          console.error('Failed to write database file asynchronously:', err);
          isWritingRootDb = false;
        } else {
          // If successful, also update the root database file to stay in sync
          try {
            const rootDbFile = path.resolve(__dirname, '..', 'database.sqlite');
            fs.writeFile(rootDbFile, buff, (rootErr) => {
              if (rootErr) console.warn('[Database Sync] Failed to update root database.sqlite:', rootErr);
              setTimeout(() => { isWritingRootDb = false; }, 500);
            });
          } catch (e) {
            isWritingRootDb = false;
          }
        }
      });
    }
  );

  // Start syncing to Google Sheets webhook (interval configurable via env)
  const sheetsInterval = Number(process.env.GOOGLE_SHEETS_SYNC_MS || 300000);
  startPeriodicSync(() => db, sheetsInterval);

  // Watch root database.sqlite for external changes (e.g. user overrides/pastes a live database.sqlite)
  try {
    const rootDbFile = path.resolve(__dirname, '..', 'database.sqlite');
    if (fs.existsSync(rootDbFile)) {
      console.log(`[Database Sync] Setting up filesystem watcher on root database.sqlite...`);
      let watchTimeout = null;
      fs.watch(rootDbFile, (eventType) => {
        if (eventType === 'change') {
          if (isWritingRootDb) return;
          
          // Debounce watcher triggering to let copy complete completely
          if (watchTimeout) clearTimeout(watchTimeout);
          watchTimeout = setTimeout(async () => {
            try {
              if (!fs.existsSync(rootDbFile)) return;
              const stats = fs.statSync(rootDbFile);
              if (stats.size === 0) return;
              
              const activeStats = fs.existsSync(dbFile) ? fs.statSync(dbFile) : null;
              if (activeStats && stats.size === activeStats.size && stats.mtimeMs <= activeStats.mtimeMs) {
                // If it is the same size or older than active DB, skip to avoid duplicate reloads
                return;
              }
              
              console.log(`[Database Sync] External modification detected on root database.sqlite (${(stats.size / 1024 / 1024).toFixed(2)} MB). Syncing and hot-reloading DB...`);
              fs.copyFileSync(rootDbFile, dbFile);
              const success = await reloadDatabaseFromDisk();
              if (success) {
                console.log(`[Database Sync] SQLite hot-reload completed successfully.`);
              }
            } catch (watchErr) {
              console.warn('[Database Sync] Failed to hot-reload database from watched file:', watchErr);
            }
          }, 300);
        }
      });
    }
  } catch (watcherErr) {
    console.warn('[Database Sync] Failed to initialize root database file watcher:', watcherErr);
  }

} catch (err) {
  console.error('Failed to initialize SQL.js or DB:', err && (err.stack || err.message || err));
  // When embedded into another process (e.g., Vite dev server) we should not terminate the host process.
  // Throw the error so the importer can decide how to handle it.
  throw err;
}

// Global helper to safely hot-reload active SQLite references and clear API caches
async function reloadDatabaseFromDisk() {
  try {
    if (!fs.existsSync(dbFile)) {
      console.warn('[Database Sync] Active database.sqlite file does not exist on disk during reload.');
      return false;
    }
    
    // Read the database bytes from the active disk file
    const buff = fs.readFileSync(dbFile);
    let testDb;
    try {
      testDb = new SQL.Database(new Uint8Array(buff));
      testDb.exec("SELECT name FROM sqlite_master WHERE type='table'");
    } catch (e) {
      if (testDb) { try { testDb.close(); } catch {} }
      console.error('[Database Sync] Failed to parse or verify reloaded database file structure:', e);
      return false;
    }
    
    // Close the old database reference
    try {
      if (db) db.close();
    } catch (e) {
      console.warn('[Database Sync] Error closing old database reference:', e);
    }
    
    db = testDb;
    await ensureSchemaAndIndexes();
    
    // Invalidate API caches
    try {
      cacheInvalidate('users');
      cacheInvalidate('employees');
      cacheInvalidate('attendance');
      cacheInvalidate('timelogs');
      cacheInvalidate('tasks');
      cacheInvalidate('finance');
      cacheInvalidate('checklist-templates');
      cacheInvalidate('o2d');
      cacheInvalidate('notepad');
      cacheInvalidate('queries');
      cacheInvalidate('reminders');
      cacheInvalidate('leave');
      cacheInvalidate('holidays');
      cacheInvalidate('checklists');
      cacheInvalidate('checklists:ref:');
    } catch (e) {
      console.warn('[Database Sync] Cache invalidation warning after DB reload:', e);
    }
    
    console.log('[Database Sync] Database successfully reloaded and memory/disk sync complete.');
    return true;
  } catch (err) {
    console.error('[Database Sync] Reload database from disk failed:', err);
    return false;
  }
}

// Helper to persist DB file (debounced to avoid blocking on burst writes)
function persistDB() {
  try {
    if (!db) return false;
    if (dbPersistCtl) {
      dbPersistCtl.schedule();
    } else {
      const buff = Buffer.from(db.export());
      isWritingRootDb = true;
      fs.writeFileSync(dbFile, buff);
      try {
        const rootDbFile = path.resolve(__dirname, '..', 'database.sqlite');
        fs.writeFileSync(rootDbFile, buff);
      } catch (e) { /* ignore */ }
      setTimeout(() => { isWritingRootDb = false; }, 500);
    }
    return true;
  } catch (e) {
    isWritingRootDb = false;
    console.error('Failed to persist DB file', e && (e.stack || e.message || e));
    return false;
  }
}

function persistDBNow() {
  try {
    if (!db) return false;
    if (dbPersistCtl) {
      dbPersistCtl.flushNow();
    } else {
      const buff = Buffer.from(db.export());
      isWritingRootDb = true;
      fs.writeFileSync(dbFile, buff);
      try {
        const rootDbFile = path.resolve(__dirname, '..', 'database.sqlite');
        fs.writeFileSync(rootDbFile, buff);
      } catch (e) { /* ignore */ }
      setTimeout(() => { isWritingRootDb = false; }, 500);
    }
    return true;
  } catch (e) {
    isWritingRootDb = false;
    console.error('Failed to persist DB file (immediate)', e && (e.stack || e.message || e));
    return false;
  }
}

process.on('SIGINT', () => { try { persistDBNow(); } catch { /* ignore */ } });
process.on('SIGTERM', () => { try { persistDBNow(); } catch { /* ignore */ } });

// Backwards-compatible alias used by some handlers
function saveToDB() {
  return persistDB();
}

// Core tables are ensured to exist early in database initialization

// --- Migration: Hash any existing plaintext passwords ---
try {
  const sel = db.prepare('SELECT id, password FROM users');
  const toUpdate = [];
  while (sel.step()) {
    const r = sel.getAsObject();
    if (r.password && !r.password.startsWith('$2') && typeof r.password === 'string') {
      const hashed = bcrypt.hashSync(r.password, 10);
      toUpdate.push({ id: r.id, hashed });
    }
  }
  sel.free();
  toUpdate.forEach(u => {
    const upd = db.prepare('UPDATE users SET password = ? WHERE id = ?');
    upd.run([u.hashed, u.id]);
    upd.free && upd.free();
  });
  if (toUpdate.length > 0) {
    persistDB();
    console.log('Migration: hashed existing plaintext passwords for', toUpdate.length, 'users');
  }
} catch (err) {
  console.warn('Password migration check failed', err);
}

// Ensure attendance & timelogs tables exist on older DBs
try {
  const tbl = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='attendance'");
  const hasAttendance = tbl.step();
  tbl.free();
  if (!hasAttendance) {
    db.run(`CREATE TABLE attendance (
      id TEXT PRIMARY KEY,
      userId TEXT,
      date TEXT,
      clockIn TEXT,
      clockOut TEXT,
      value REAL,
      location TEXT,
      notes TEXT,
      createdAt TEXT
    )`);
  }
} catch (err) {
  console.warn('Attendance table check failed', err);
}

try {
  const tbl2 = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='timelogs'");
  const hasTL = tbl2.step();
  tbl2.free();
  if (!hasTL) {
    db.run(`CREATE TABLE timelogs (
      id TEXT PRIMARY KEY,
      userId TEXT,
      startTime TEXT,
      endTime TEXT,
      task TEXT,
      notes TEXT,
      createdAt TEXT
    )`);
  }
} catch (err) {
  console.warn('Timelogs table check failed', err);
}

// Ensure tasks table exists and has required schema
try {
  const tblTasks = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='tasks'");
  const hasTasks = tblTasks.step();
  tblTasks.free();

  if (!hasTasks) {
    // Create tasks table with the required minimal schema
    db.run(`CREATE TABLE tasks (
      id TEXT PRIMARY KEY,
      title TEXT,
      description TEXT,
      assignedTo TEXT,
      priority TEXT,
      dueDate TEXT,
      createdAt TEXT
    )`);
    persistDB();
    console.log('Tasks table created with minimal schema');
  } else {
    // If table exists, ensure required columns exist; add them if missing
    const colsStmt = db.prepare("PRAGMA table_info('tasks')");
    const existingCols = new Set();
    while (colsStmt.step()) {
      const c = colsStmt.getAsObject();
      existingCols.add(String(c.name));
    }
    colsStmt.free();

    const required = ['id', 'title', 'description', 'assignedTo', 'assignedBy', 'assigned_by', 'priority', 'dueDate', 'createdAt'];
    let altered = false;
    for (const col of required) {
      if (!existingCols.has(col)) {
        try {
          db.run(`ALTER TABLE tasks ADD COLUMN ${col} TEXT`);
          altered = true;
          console.log('Added missing tasks column', col);
        } catch (e) {
          console.warn('Failed to add tasks column', col, e && (e.message || e));
        }
      }
    }

    // If createdAt missing but createdDate exists, copy values
    if (!existingCols.has('createdAt') && existingCols.has('createdDate')) {
      try {
        db.run("UPDATE tasks SET createdAt = createdDate WHERE createdAt IS NULL OR createdAt = ''");
        altered = true;
        console.log('Migrated createdDate -> createdAt for existing tasks');
      } catch (e) {
        console.warn('Failed to migrate createdDate -> createdAt', e && (e.message || e));
      }
    }

    if (altered) persistDB();
  }
} catch (err) {
  console.error('Tasks table check failed', err && (err.stack || err.message || err));
}

// Persist DB in case we created/altered tables
persistDB();

// Migrate old 'T-*' tasks to 'KBT-*' format to maintain UI consistency
try {
  const oldTasksStmt = db.prepare("SELECT id FROM tasks WHERE id LIKE 'T-%' ORDER BY created_at ASC, createdAt ASC");
  const oldIds = [];
  while (oldTasksStmt.step()) { oldIds.push(oldTasksStmt.getAsObject().id); }
  oldTasksStmt.free();

  if (oldIds.length > 0) {
    let nextNum = 1;
    try {
      const q = db.prepare("SELECT MAX(CAST(SUBSTR(id, 5) AS INTEGER)) as maxNum FROM tasks WHERE id LIKE 'KBT-%'");
      if (q.step()) { const data = q.getAsObject(); if (data.maxNum) nextNum = data.maxNum + 1; }
      q.free();
    } catch(e) {}

    let altered = false;
    for (const oldId of oldIds) {
      const newId = 'KBT-' + String(nextNum++).padStart(2, '0');
      try {
        db.run('UPDATE tasks SET id = ? WHERE id = ?', [newId, oldId]);
        altered = true;
      } catch (e) {
        console.warn('Failed to migrate task ID', oldId, e);
      }
    }
    if (altered) {
      persistDB();
      console.log(`Migrated ${oldIds.length} tasks from T-* to KBT-* format`);
    }
  }
} catch (e) {
  console.warn('Tasks ID migration check failed', e && (e.message || e));
}

// Migrate old 'CT-*' templates to 'KCT-*' format to maintain UI consistency
try {
  const oldCTsStmt = db.prepare("SELECT id FROM checklist_templates WHERE id LIKE 'CT-%' ORDER BY createdAt ASC");
  const oldCTIds = [];
  while (oldCTsStmt.step()) { oldCTIds.push(oldCTsStmt.getAsObject().id); }
  oldCTsStmt.free();

  if (oldCTIds.length > 0) {
    let nextNum = 1;
    try {
      const q = db.prepare("SELECT MAX(CAST(SUBSTR(id, 5) AS INTEGER)) as maxNum FROM checklist_templates WHERE id LIKE 'KCT-%'");
      if (q.step()) { const data = q.getAsObject(); if (data.maxNum) nextNum = data.maxNum + 1; }
      q.free();
    } catch(e) {}

    let altered = false;
    for (const oldId of oldCTIds) {
      const newId = 'KCT-' + String(nextNum++).padStart(2, '0');
      try {
        db.run('UPDATE checklist_templates SET id = ? WHERE id = ?', [newId, oldId]);
        // Update references in checklists table
        db.run('UPDATE checklists SET refId = ? WHERE refId = ?', [newId, oldId]);
        altered = true;
      } catch (e) {
        console.warn('Failed to migrate checklist template ID', oldId, e);
      }
    }
    if (altered) {
      persistDB();
      console.log(`Migrated ${oldCTIds.length} checklist templates from CT-* to KCT-* format`);
    }
  }
} catch (e) {
  console.warn('Checklist templates ID migration check failed', e && (e.message || e));
}

// Ensure queries table columns
try {
  const tblQueryInfo = db.prepare("PRAGMA table_info('queries')");
  const existingCols = new Set();
  while (tblQueryInfo.step()) {
    existingCols.add(String(tblQueryInfo.getAsObject().name));
  }
  tblQueryInfo.free();

  const queryCols = ['senderId', 'receiverId', 'subject', 'message', 'response', 'updatedAt'];
  let altered = false;
  for (const col of queryCols) {
    if (!existingCols.has(col)) {
      try {
        db.run(`ALTER TABLE queries ADD COLUMN ${col} TEXT`);
        altered = true;
      } catch (e) { console.warn('Failed to add query column', col, e); }
    }
  }
  if (altered) {
    // Data migration: If we have old 'userId' or 'question' style records, try to populate new columns
    try {
      db.run(`UPDATE queries SET senderId = userId WHERE (senderId IS NULL OR senderId = '') AND userId IS NOT NULL`);
      db.run(`UPDATE queries SET subject = question WHERE (subject IS NULL OR subject = '') AND question IS NOT NULL`);
      db.run(`UPDATE queries SET message = question WHERE (message IS NULL OR message = '') AND question IS NOT NULL`); // fallback
      console.log('Queries: data migration (columns -> columns) completed');
    } catch (e) { console.warn('Queries: data migration failed', e); }
    persistDB();
  }
} catch (e) { console.warn('Queries table check failed', e); }

// Ensure legacy client default admin exists (admin@fms.com / admin)
try {
  const chk = db.prepare('SELECT id FROM users WHERE lower(email) = ?');
  chk.bind(['admin@fms.com']);
  if (!chk.step()) {
    chk.free();
    const ins = db.prepare('INSERT INTO users (name, email, password, role, employeeId) VALUES (?,?,?,?,?)');
    ins.run(['Administrator', 'admin@fms.com', bcrypt.hashSync('admin', 10), 'ADMIN', null]);
    ins.free && ins.free();
    persistDB();
    console.log('Added legacy default admin user admin@fms.com');
  } else {
    chk.free();
  }
} catch (err) {
  console.warn('Legacy admin insertion failed', err);
}

// Ensure a case-insensitive unique index on users.email (helps avoid case-related duplicates)
try {
  db.run("CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users(email COLLATE NOCASE)");
  console.log('Ensured users.email unique index (case-insensitive)');
} catch (err) {
  console.warn('Could not create users.email unique index', err && (err.stack || err.message || err));
}

// Simple JSON parsing + cookie parsing
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ limit: '500mb', extended: true }));
app.use(cookieParser());

// Ensure upload directories exist and configure multer
const uploadsRoot = path.join(__dirname, 'uploads');
const profileDir = path.join(uploadsRoot, 'profile');
const documentsDir = path.join(uploadsRoot, 'documents');
const sitePhotosDir = path.join(uploadsRoot, 'site_photos');
try {
  if (!fs.existsSync(uploadsRoot)) fs.mkdirSync(uploadsRoot);
  if (!fs.existsSync(profileDir)) fs.mkdirSync(profileDir);
  if (!fs.existsSync(documentsDir)) fs.mkdirSync(documentsDir);
  if (!fs.existsSync(sitePhotosDir)) fs.mkdirSync(sitePhotosDir);
} catch (e) {
  console.warn('Failed to create uploads directories', e && (e.message || e));
}

// Multer setup
const allowedExt = ['.jpg', '.jpeg', '.png', '.pdf'];
const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedExt.includes(ext)) return cb(null, true);
  // Accept images by mimetype as fallback (some camera captures may lack extensions)
  if (file && file.mimetype && typeof file.mimetype === 'string' && file.mimetype.startsWith('image/')) return cb(null, true);
  console.warn('upload fileFilter rejected file', { originalname: file && file.originalname, mimetype: file && file.mimetype });
  return cb(null, false);
};

const storageProfile = multer.diskStorage({
  destination: (req, file, cb) => cb(null, profileDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`)
});
const storageDocuments = multer.diskStorage({
  destination: (req, file, cb) => cb(null, documentsDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`)
});

const uploadProfile = multer({ storage: storageProfile, fileFilter, limits: { fileSize: 10 * 1024 * 1024 } });
const uploadDocument = multer({ storage: storageDocuments, fileFilter, limits: { fileSize: 20 * 1024 * 1024 } });

// Site photos storage
const storageSitePhotos = multer.diskStorage({
  destination: (req, file, cb) => cb(null, sitePhotosDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`)
});
const uploadSitePhoto = multer({ storage: storageSitePhotos, fileFilter, limits: { fileSize: 10 * 1024 * 1024 } });

// PMS photos storage
const pmsDir = path.join(uploadsRoot, 'pms');
if (!fs.existsSync(pmsDir)) {
  fs.mkdirSync(pmsDir, { recursive: true });
}
const storagePMS = multer.diskStorage({
  destination: (req, file, cb) => cb(null, pmsDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`)
});
const uploadPMS = multer({ storage: storagePMS, fileFilter, limits: { fileSize: 10 * 1024 * 1024 } });

// Serve uploaded files with cache-control
app.use('/uploads', express.static(uploadsRoot, {
  maxAge: '1y',
  immutable: true
}));

// Production-only API request logging (safe: do NOT print tokens)
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    try {
      if (req.path && req.path.startsWith('/api')) {
        console.log('API REQUEST:', { method: req.method, path: req.path, origin: req.headers.origin || null, authHeaderPresent: !!req.headers.authorization, ip: req.ip });
      }
    } catch (e) {
      /* ignore */
    }
    next();
  });
}

// Disable ETag generation and add conservative no-cache headers for API responses.
// This avoids unexpected 304 responses from the browser for `/api` endpoints.
app.set('etag', false);
app.use((req, res, next) => {
  if (req.path && req.path.startsWith('/api')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    // Also remove any existing ETag header to be safe
    res.removeHeader && res.removeHeader('ETag');
  }
  next();
});

// Trust proxy (so req.ip and related headers are correct when behind nginx)
app.set('trust proxy', true);

// Safe CORS: explicit whitelist and robust preflight handling
app.use((req, res, next) => {
  const origin = req.headers.origin || '';
  // default production frontend origin
  const defaultFrontend = 'https://kbt.kalrabuildtech.com';
  const configured = (process.env.FRONTEND_ORIGIN || defaultFrontend).replace(/\/$/, '');

  // Explicit whitelist required by policy
  const allowed = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    configured
  ];

  // Allow local LAN IP origins like http://192.168.x.x:3000 (useful for mobile on same Wi-Fi)
  const lanIpRegex = /^https?:\/\/192\.168\.\d{1,3}\.\d{1,3}(?::\d+)?$/i;
  // Allow dev tunnel domains such as https://*.devtunnels.ms
  const devTunnelRegex = /^https?:\/\/[a-z0-9\-]+\.(inc1\.)?devtunnels\.ms(?::\d+)?$/i;

  if (origin && (allowed.includes(origin) || lanIpRegex.test(origin) || devTunnelRegex.test(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (origin && req.path && req.path.startsWith('/api')) {
    // If an API request came from a non-whitelisted origin, help debugging in logs
    console.warn('CORS: blocked origin', origin, 'for', req.method, req.path);
  }

  // Allow credentials so cookies are sent cross-site
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  // Allow common headers required by this app (including Authorization for Bearer tokens)
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Vary', 'Origin');

  // Respond to preflight requests immediately
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Helpful startup log for production requirements
if (process.env.NODE_ENV === 'production') {
  console.log('Production mode: FRONTEND_ORIGIN =', (process.env.FRONTEND_ORIGIN || 'https://kbt.kalrabuildtech.com').replace(/\/$/, ''));
  console.log('Ensure nginx is configured to pass Authorization header: add `proxy_set_header Authorization $http_authorization;` to your server block.');
}

app.get('/api/health', (req, res) => {
  try {
    return success(res, { ok: true, time: new Date().toISOString() }, 'OK');
  } catch (e) {
    return failure(res, 'Internal server error');
  }
});

// Generic storage endpoints for migrated client data
app.get('/api/storage/:key', requireAuth, (req, res) => {
  try {
    const key = req.params.key;
    const stmt = db.prepare('SELECT value FROM kv WHERE key = ?');
    stmt.bind([key]);
    if (!stmt.step()) { stmt.free(); return success(res, null); }
    const row = stmt.getAsObject(); stmt.free();
    let val = null;
    try { val = row.value ? JSON.parse(row.value) : null; } catch (e) { val = row.value; }
    return success(res, val);
  } catch (err) { console.error('KV GET error', err && (err.stack || err.message || err)); return failure(res, 'Internal server error', 500); }
});

app.post('/api/storage/:key', requireAuth, (req, res) => {
  try {
    const key = req.params.key;
    const value = req.body !== undefined ? JSON.stringify(req.body) : null;
    const now = new Date().toISOString();
    const check = db.prepare('SELECT key FROM kv WHERE key = ?');
    check.bind([key]);
    if (check.step()) {
      check.free();
      const upd = db.prepare('UPDATE kv SET value = ?, updatedAt = ? WHERE key = ?');
      upd.run([value, now, key]); upd.free && upd.free();
    } else {
      check.free();
      const ins = db.prepare('INSERT INTO kv (key, value, updatedAt) VALUES (?,?,?)');
      ins.run([key, value, now]); ins.free && ins.free();
    }
    persistDB();
    return success(res, null, 'Stored', 201);
  } catch (err) { console.error('KV POST error', err && (err.stack || err.message || err)); return failure(res, 'Internal server error', 500); }
});

// One-time migration endpoint: accepts an object mapping localStorage keys to values
// Migration endpoint: allow unauthenticated calls for first-run client-side migrations
app.post('/api/migrate', (req, res) => {
  try {
    const payload = req.body || {};
    if (!req.user) console.log('MIGRATE called without auth; proceeding unauthenticated');
    if (!payload || typeof payload !== 'object' || Object.keys(payload).length === 0) return failure(res, 'No migration data provided', 400);

    db.run('BEGIN TRANSACTION');
    try {
      // If client stored feature arrays under conventional keys, try to insert into respective tables
      if (Array.isArray(payload.projects)) {
        payload.projects.forEach(p => {
          try {
            const id = p.id || genId('P-');
            const insert = db.prepare('INSERT OR IGNORE INTO projects (id, name, address, status, data, createdBy, createdAt) VALUES (?,?,?,?,?,?,?)');
            insert.run([id, p.name || null, p.address || null, p.status || 'ACTIVE', p.data ? JSON.stringify(p.data) : JSON.stringify(p), req.user && (req.user.employeeId || req.user.id) || null, p.createdAt || new Date().toISOString()]);
            insert.free && insert.free();
          } catch (e) { /* ignore individual insert errors */ }
        });
      }

      if (Array.isArray(payload.tasks)) {
        payload.tasks.forEach(t => {
          try {
            let id = t.id;
            if (!id) {
              let nextNum = 1;
              try {
                const q = db.prepare("SELECT MAX(CAST(SUBSTR(id, 5) AS INTEGER)) as maxNum FROM tasks WHERE id LIKE 'KBT-%'");
                if (q.step()) { const data = q.getAsObject(); if (data.maxNum) nextNum = data.maxNum + 1; }
                q.free();
              } catch(e) {}
              id = 'KBT-' + String(nextNum).padStart(2, '0');
            }
            const insert = db.prepare('INSERT OR IGNORE INTO tasks (id, title, description, assignedTo, priority, dueDate, createdAt) VALUES (?,?,?,?,?,?,?)');
            insert.run([id, t.title || null, t.description || null, t.assignedTo || null, t.priority || null, t.dueDate || null, t.createdAt || new Date().toISOString()]);
            insert.free && insert.free();
          } catch (e) { }
        });
      }

      if (Array.isArray(payload.calendar)) {
        payload.calendar.forEach(ev => {
          try {
            const id = ev.id || genId('C-');
            const insert = db.prepare('INSERT OR IGNORE INTO calendar (id, title, description, startTime, endTime, createdBy, createdAt) VALUES (?,?,?,?,?,?,?)');
            insert.run([id, ev.title || null, ev.description || null, ev.startTime || null, ev.endTime || null, req.user && (req.user.employeeId || req.user.id) || null, ev.createdAt || new Date().toISOString()]);
            insert.free && insert.free();
          } catch (e) { }
        });
      }

      if (Array.isArray(payload.orders) || Array.isArray(payload.o2d)) {
        const arr = Array.isArray(payload.orders) ? payload.orders : payload.o2d;
        arr.forEach(o => {
          try {
            const id = o.id || genId('O-');
            const insert = db.prepare('INSERT OR IGNORE INTO o2d (id, data, status, createdBy, createdAt) VALUES (?,?,?,?,?)');
            insert.run([id, JSON.stringify(o), o.status || 'NEW', req.user && (req.user.employeeId || req.user.id) || null, o.createdAt || new Date().toISOString()]);
            insert.free && insert.free();
          } catch (e) { }
        });
      }

      // For any other keys, store them in kv table
      Object.keys(payload).forEach(k => {
        if (['projects', 'tasks', 'calendar', 'orders', 'o2d'].includes(k)) return;
        try {
          const val = JSON.stringify(payload[k]);
          const now = new Date().toISOString();
          const check = db.prepare('SELECT key FROM kv WHERE key = ?');
          check.bind([k]);
          if (check.step()) { check.free(); const upd = db.prepare('UPDATE kv SET value = ?, updatedAt = ? WHERE key = ?'); upd.run([val, now, k]); upd.free && upd.free(); }
          else { check.free(); const ins = db.prepare('INSERT OR IGNORE INTO kv (key, value, updatedAt) VALUES (?,?,?)'); ins.run([k, val, now]); ins.free && ins.free(); }
        } catch (e) { }
      });

      console.log('Tasks POST: committing transaction');
      db.run('COMMIT');
      if (!persistDB()) console.warn('Tasks POST: commit succeeded but failed to persist DB file');
      else console.log('Tasks POST: task persisted to DB file');
      return success(res, { migrated: true }, 'Migration complete');
    } catch (e) {
      try { db.run('ROLLBACK'); } catch (er) { }
      throw e;
    }
  } catch (err) { console.error('MIGRATE error', err && (err.stack || err.message || err)); return failure(res, 'Internal server error', 500); }
});

// Lightweight debug endpoint to verify proxy/CORS/authorization presence (does not reveal token)
app.get('/api/debug', (req, res) => {
  try {
    return success(res, { ok: true, origin: req.headers.origin || null, authHeaderPresent: !!req.headers.authorization }, 'Debug');
  } catch (e) {
    return failure(res, 'Internal server error', 500);
  }
});

app.post('/api/auth/login', (req, res) => {
  try {
    const { email, password } = req.body || {};
    // Helpful debug log (email only; never log password or tokens)
    console.log('Login attempt for', email || 'no-email', 'from origin', req.headers.origin || 'no-origin', 'ip', req.ip);
    // Log headers and body summary for debugging (do not log raw password)
    try {
      console.log('Login headers:', { origin: req.headers.origin || null, referer: req.headers.referer || null, 'content-type': req.headers['content-type'] || null });
      console.log('Login body summary:', { email: email || null, hasPassword: !!password });
    } catch (e) { /* ignore logging errors */ }

    if (!email || !password) return failure(res, 'Missing email or password', 400);

    // Fetch stored hashed password and user record
    const stmt = db.prepare('SELECT id, name, email, role, employeeId, password FROM users WHERE lower(email)=? AND coalesce(is_archived, 0) = 0');
    stmt.bind([email.toLowerCase()]);
    if (!stmt.step()) { stmt.free(); console.log('Login failed: user not found', email); return failure(res, 'Invalid credentials', 401); }
    const row = stmt.getAsObject();
    stmt.free();

    const storedHash = row.password;
    try {
      console.log('Stored password hash length:', storedHash ? storedHash.length : 0);
      const match = storedHash && bcrypt.compareSync(password, storedHash);
      console.log('Password compare result for', email, ':', !!match);
      if (!storedHash || !match) {
        console.log('Login failed: bad password for', email);
        return failure(res, 'Invalid credentials', 401);
      }
    } catch (e) {
      console.error('Error during password compare', e && (e.stack || e.message || e));
      return failure(res, 'Invalid credentials', 401);
    }

    row.role = row.role || 'EMPLOYEE';
    delete row.password;

    // Sign a JWT and set as httpOnly cookie.
    // By default use SameSite='lax' for same-site flows, but when the login request originates from a secure cross-site origin
    // (for example a dev-tunnel like https://*.devtunnels.ms or other https tunnels) we must set SameSite='none' and Secure=true
    // so browsers allow the cookie to be set during POST requests (required for cross-site fetches).
    const token = jwt.sign({ id: row.id, role: row.role, name: row.name, employeeId: row.employeeId }, JWT_SECRET, { expiresIn: '7d' });

    const isProd = process.env.NODE_ENV === 'production';
    const origin = req.headers.origin || '';
    const devTunnelRegex = /^https?:\/\/[a-z0-9\-]+\.(inc1\.)?devtunnels\.ms(:\d+)?$/i;
    const lanIpRegex = /^https?:\/\/192\.168\.\d{1,3}\.\d{1,3}(?::\d+)?$/i;

    // Treat as cross-site login when origin differs from host OR matches known tunnel/LAN patterns.
    // For dev tunnels and LAN origins we MUST set SameSite=None and Secure so browsers accept cookies on cross-site POSTs.
    const hostOrigin = (req.headers['x-forwarded-proto'] ? String(req.headers['x-forwarded-proto']) : req.protocol) + '://' + (req.headers.host || req.hostname);
    const isCrossSiteOrigin = origin && String(origin).toLowerCase() !== String(hostOrigin).toLowerCase();
    const isDevTunnel = origin && devTunnelRegex.test(origin);
    const isLanOrigin = origin && lanIpRegex.test(origin);

    const cookieOpts = { httpOnly: true, path: '/', maxAge: 7 * 24 * 60 * 60 * 1000 };
    if (isCrossSiteOrigin && (isDevTunnel || isLanOrigin || isProd)) {
      // For dev tunnels and LAN-origin logins over HTTPS the cookie must be SameSite=None and Secure
      cookieOpts.sameSite = 'none';
      cookieOpts.secure = true;
    } else {
      // Default to safer SameSite=lax for same-site requests
      cookieOpts.sameSite = 'lax';
      cookieOpts.secure = isProd && (req.secure || String(req.headers['x-forwarded-proto'] || '').toLowerCase() === 'https');
    }

    res.cookie('token', token, cookieOpts);

    // Also include token in response so frontend can set Authorization header when needed (useful for non-cookie flows)
    return success(res, { user: row, token }, 'Logged in');
  } catch (err) {
    console.error('Auth login error', { path: req.path, err: err && (err.stack || err.message || err) });
    return failure(res, 'Internal server error', 500);
  }
});

// Auth helpers
app.get('/api/auth/me', (req, res) => {
  console.log('GET /api/auth/me from', req.ip, 'origin', req.headers.origin || 'no-origin');

  // Guard: Ensure DB/Server is initialized
  if (!app.get('ready') || !db) {
    console.warn('Auth/me: service not ready (DB missing)');
    res.setHeader('Content-Type', 'application/json');
    return failure(res, 'Service unavailable', 503);
  }

  try {
    // Read Bearer Authorization header first, fallback to cookie
    const authHeader = req.headers && req.headers.authorization;
    let token = authHeader && typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')
      ? authHeader.split(' ')[1]
      : req.cookies?.token;

    if (!token) {
      console.warn('Auth/me: missing token', { path: req.path, ip: req.ip, origin: req.headers.origin || null });
      return failure(res, 'No token provided', 401);
    }

    let payload;
    try {
      payload = jwt.verify(token, JWT_SECRET);
      console.log('Auth/me: token verified for id', payload && payload.id);
    } catch (err) {
      console.warn('Auth/me: token verification failed', { err: err && (err.message || err) });
      return failure(res, 'Invalid token', 401);
    }

    const id = payload.id;
    try {
      const stmt = db.prepare('SELECT id, name, email, role, employeeId FROM users WHERE id = ? AND coalesce(is_archived, 0) = 0');
      stmt.bind([Number(id)]);
      if (!stmt.step()) { stmt.free(); console.warn('Auth/me: user not found or archived for id', id); return failure(res, 'Unauthorized', 401); }
      const row = stmt.getAsObject();
      stmt.free();
      row.role = row.role || 'EMPLOYEE';
      return success(res, { authenticated: true, user: row }, 'Authenticated');
    } catch (err) {
      // Log full DB error stack and return a safe 500
      console.error('Auth/me: DB error', err && (err.stack || err.message || err));
      return failure(res, 'Internal server error', 500);
    }
  } catch (err) {
    // Log full error with stack for easier debugging in production logs (but do not leak to clients)
    console.error('Auth/me unexpected error', err && (err.stack || err.message || err));
    return failure(res, 'Internal server error', 500);
  }
});

app.post('/api/auth/logout', (req, res) => {
  // Clear the cookie for both possible parameter sets used during login to ensure the browser strictly removes it.
  res.clearCookie('token', { path: '/', httpOnly: true, secure: true, sameSite: 'none' });
  res.clearCookie('token', { path: '/', httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' });
  res.clearCookie('token', { path: '/' });
  return success(res, null, 'Logged out');
});

// Users CRUD API
app.get('/api/users', requireAuth, withCache('users', 15000), (req, res) => {
  try {
    console.log('GET /api/users from', req.headers.origin || 'no-origin');
    // Default: return only non-archived users unless explicitly requested
    const archived = req.query.archived === '1' || req.query.archived === 'true';
    const q = archived ? 'SELECT id, name, email, role, employeeId, is_archived, archived_at FROM users' : "SELECT id, name, email, role, employeeId FROM users WHERE coalesce(is_archived, 0) = 0";
    const stmt = db.prepare(q);
    const out = [];
    while (stmt.step()) {
      out.push(stmt.getAsObject());
    }
    stmt.free();
    return success(res, out || []);
  } catch (err) {
    console.error('Users GET error', { path: req.path, err: err && (err.stack || err.message || err) });
    return failure(res, 'Internal server error', 500);
  }
});

// Convenience: list archived users explicitly
app.get('/api/users/archived', requireAuth, (req, res) => {
  try {
    if (!req.user) return failure(res, 'Unauthorized', 401);
    if (req.user.role !== 'ADMIN') return failure(res, 'Forbidden', 403);
    const stmt = db.prepare('SELECT id, name, email, role, employeeId, archived_at FROM users WHERE coalesce(is_archived, 0) = 1');
    const out = [];
    while (stmt.step()) out.push(stmt.getAsObject());
    stmt.free();
    return success(res, out);
  } catch (err) {
    console.error('Users/archived GET error', { path: req.path, err: err && (err.stack || err.message || err) });
    return failure(res, 'Internal server error', 500);
  }
});

// Convenience: query user by email
app.get('/api/users/by-email', requireAuth, (req, res) => {
  try {
    const email = req.query.email;
    if (!email) return failure(res, 'Missing email', 400);
    const stmt = db.prepare('SELECT id, name, email, role, employeeId FROM users WHERE lower(email) = ?');
    stmt.bind([String(email).toLowerCase()]);
    if (!stmt.step()) { stmt.free(); return failure(res, 'Not found', 404); }
    const row = stmt.getAsObject();
    stmt.free();
    return success(res, row);
  } catch (err) {
    console.error('Users by-email error', { path: req.path, err: err && (err.stack || err.message || err) });
    return failure(res, 'Internal server error', 500);
  }
});

app.get('/api/users/:id', requireAuth, (req, res) => {
  try {
    const stmt = db.prepare('SELECT id, name, email, role, employeeId FROM users WHERE id = ?');
    const id = Number(req.params.id);
    stmt.bind([id]);
    if (!stmt.step()) { stmt.free(); return failure(res, 'Not found', 404); }
    const row = stmt.getAsObject();
    stmt.free();
    return success(res, row);
  } catch (err) {
    console.error('Users/:id GET error', { path: req.path, err: err && (err.stack || err.message || err) });
    return failure(res, 'Internal server error', 500);
  }
});

app.post('/api/users', requireAuth, (req, res) => {
  try {
    // Normalize email early (trim + lowercase)
    const { name, email: rawEmail, password, role, employeeId } = req.body || {};
    const email = rawEmail ? String(rawEmail).trim().toLowerCase() : '';
    if (!email || !password) return failure(res, 'Missing fields', 400);

    // Quick pre-check for existing email (case-insensitive)
    const check = db.prepare('SELECT id FROM users WHERE lower(email)=?');
    check.bind([email.toLowerCase()]);
    if (check.step()) { check.free(); console.warn('Users POST conflict (pre-check)', { email }); return failure(res, 'Email already exists', 409); }
    check.free();

    // Hash password and insert. Rely also on DB unique index to catch race conditions.
    const hashed = bcrypt.hashSync(password, 10);
    const insert = db.prepare('INSERT INTO users (name, email, password, role, employeeId) VALUES (?,?,?,?,?)');
    try {
      insert.run([name || null, email, hashed, role || 'EMPLOYEE', employeeId || null]);
    } catch (dbErr) {
      // Handle unique constraint race condition (insert may fail if another request added same email)
      const msg = dbErr && (dbErr.message || dbErr);
      if (msg && String(msg).toLowerCase().includes('unique')) {
        console.warn('Users POST conflict (insert)', { email, err: msg });
        insert.free && insert.free();
        return failure(res, 'Email already exists', 409);
      }
      throw dbErr;
    }
    insert.free && insert.free();

    persistDB();
    return success(res, null, 'Created', 201);
  } catch (err) {
    console.error('Users POST error', { path: req.path, err: err && (err.stack || err.message || err) });
    return failure(res, 'Internal server error', 500);
  }
});

app.put('/api/users/:id', requireAuth, (req, res) => {
  try {
    const id = Number(req.params.id);
    const { name, email, password, role, employeeId, is_archived } = req.body || {};
    const stmt = db.prepare('SELECT id FROM users WHERE id = ?');
    stmt.bind([id]);
    if (!stmt.step()) { stmt.free(); return failure(res, 'Not found', 404); }
    stmt.free();

    // Hash password if provided
    const hashed = password ? bcrypt.hashSync(password, 10) : null;
    const sanitizedEmail = email ? String(email).trim().toLowerCase() : null;

    // If setting is_archived to truthy, record archived_at timestamp
    const archivedAt = is_archived ? new Date().toISOString() : null;

    const update = db.prepare('UPDATE users SET name = coalesce(?, name), email = coalesce(?, email), password = coalesce(?, password), role = coalesce(?, role), employeeId = coalesce(?, employeeId), is_archived = coalesce(?, is_archived), archived_at = coalesce(?, archived_at) WHERE id = ?');
    update.run([name || null, sanitizedEmail, hashed || null, role || null, employeeId || null, is_archived == null ? null : (is_archived ? 1 : 0), archivedAt, id]);
    update.free && update.free();
    persistDB();
    return success(res, null, 'Updated');
  } catch (err) {
    console.error('Users PUT error', { path: req.path, err: err && (err.stack || err.message || err) });
    return failure(res, 'Internal server error', 500);
  }
});

app.delete('/api/users/:id', requireAuth, (req, res) => {
  try {
    if (!req.user) return failure(res, 'Unauthorized', 401);
    if (req.user.role !== 'ADMIN') return failure(res, 'Forbidden', 403);

    const id = Number(req.params.id);

    // Soft-delete: mark as archived and record timestamp
    const archivedAt = new Date().toISOString();
    const upd = db.prepare('UPDATE users SET is_archived = ?, archived_at = ? WHERE id = ?');
    upd.run([1, archivedAt, id]);
    upd.free();
    persistDB();
    return success(res, null, 'Archived');
  } catch (err) {
    console.error('Users DELETE (archive) error', { path: req.path, err: err && (err.stack || err.message || err) });
    return failure(res, 'Internal server error', 500);
  }
});

// Multer configuration for database file upload
const storageDb = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsRoot);
  },
  filename: function (req, file, cb) {
    cb(null, 'temp_db.sqlite');
  }
});
const uploadDb = multer({ 
  storage: storageDb,
  fileFilter: (req, file, cb) => {
    cb(null, true);
  }
});

// ADMIN: Reload the database from server/database.sqlite disk file
app.post('/api/admin/reload-db', requireAuth, async (req, res) => {
  try {
    if (!req.user) return failure(res, 'Unauthorized', 401);
    if (req.user.role !== 'ADMIN') return failure(res, 'Forbidden', 403);

    console.log('Admin triggered SQLite database reload from disk...');

    // Sync from root database.sqlite if it exists and is different/newer
    try {
      const rootDbFile = path.resolve(__dirname, '..', 'database.sqlite');
      if (fs.existsSync(rootDbFile)) {
        const rootStats = fs.statSync(rootDbFile);
        let copyRoot = false;
        if (fs.existsSync(dbFile)) {
          const serverStats = fs.statSync(dbFile);
          if (rootStats.size !== serverStats.size || rootStats.mtimeMs > serverStats.mtimeMs) {
            copyRoot = true;
          }
        } else {
          copyRoot = true;
        }
        if (copyRoot && rootStats.size > 0) {
          console.log(`[Database Sync] Reload-db found different/newer root database.sqlite (${(rootStats.size / 1024 / 1024).toFixed(2)} MB). Syncing to ${dbFile}...`);
          fs.copyFileSync(rootDbFile, dbFile);
        }
      }
    } catch (syncErr) {
      console.warn('[Database Sync] Reload-db failed to sync root database.sqlite:', syncErr);
    }

    if (!fs.existsSync(dbFile)) {
      return failure(res, 'Database file not found on disk', 404);
    }

    // Flush any pending write first
    if (dbPersistCtl) {
      dbPersistCtl.flushNow();
    }

    const successReload = await reloadDatabaseFromDisk();
    if (!successReload) {
      return failure(res, 'Invalid database file structure or corrupt file', 400);
    }

    console.log('Database successfully reloaded from disk and verified.');
    return success(res, null, 'Database reloaded and synchronized successfully');
  } catch (err) {
    console.error('Reload DB error', err && (err.stack || err.message || err));
    return failure(res, 'Internal server error during DB reload', 500);
  }
});

// ADMIN: Upload a new SQLite database file and swap it in
app.post('/api/admin/upload-db', requireAuth, uploadDb.single('dbFile'), async (req, res) => {
  try {
    if (!req.user) return failure(res, 'Unauthorized', 401);
    if (req.user.role !== 'ADMIN') return failure(res, 'Forbidden', 403);
    if (!req.file) return failure(res, 'No database file provided', 400);

    const tempFilePath = req.file.path;
    console.log('Admin uploaded new database file. Verifying...', tempFilePath);

    const buff = fs.readFileSync(tempFilePath);
    let testDb;
    try {
      testDb = new SQL.Database(new Uint8Array(buff));
      testDb.exec("SELECT name FROM sqlite_master WHERE type='table'");
    } catch (e) {
      if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
      if (testDb) { try { testDb.close(); } catch {} }
      return failure(res, 'Invalid SQLite database file format', 400);
    }

    // Flush old DB just in case
    if (dbPersistCtl) {
      dbPersistCtl.flushNow();
    }

    // Close old database
    try {
      if (db) db.close();
    } catch (e) {
      console.warn('Error closing old database:', e);
    }

    // Overwrite the primary database file with the uploaded one
    try {
      fs.copyFileSync(tempFilePath, dbFile);
      // Keep root database file in sync if it exists or in parent directory
      try {
        const rootDbFile = path.resolve(__dirname, '..', 'database.sqlite');
        fs.copyFileSync(tempFilePath, rootDbFile);
      } catch (rootErr) { /* ignore */ }
      fs.unlinkSync(tempFilePath);
    } catch (fsErr) {
      console.error('Failed to swap database files on disk', fsErr);
      return failure(res, 'Failed to replace database file on disk', 500);
    }

    db = testDb;
    await ensureSchemaAndIndexes();

    // Invalidate API caches
    try {
      cacheInvalidate('users');
      cacheInvalidate('employees');
      cacheInvalidate('attendance');
      cacheInvalidate('timelogs');
      cacheInvalidate('tasks');
      cacheInvalidate('finance');
      cacheInvalidate('checklist-templates');
      cacheInvalidate('o2d');
      cacheInvalidate('notepad');
      cacheInvalidate('queries');
      cacheInvalidate('reminders');
      cacheInvalidate('leave');
      cacheInvalidate('holidays');
    } catch (e) {
      console.warn('Cache invalidation warning after DB upload:', e);
    }

    console.log('Uploaded database successfully applied and schema verified.');
    return success(res, null, 'Database file uploaded and applied successfully');
  } catch (err) {
    console.error('Upload DB error', err && (err.stack || err.message || err));
    return failure(res, 'Internal server error during DB upload', 500);
  }
});

// ONE-TIME ADMIN CLEANUP: remove demo users (IDs 3 and 4) and related tasks
app.post('/api/admin/cleanup-demo-users', requireAuth, (req, res) => {
  try {
    if (!req.user) return failure(res, 'Unauthorized', 401);
    if (req.user.role !== 'ADMIN') return failure(res, 'Forbidden', 403);

    const demoIds = [3, 4];
    try {
      db.run('BEGIN TRANSACTION');

      // Collect employeeIds for these users (if any)
      const sel = db.prepare('SELECT id, employeeId FROM users WHERE id IN (?, ?)');
      sel.bind([demoIds[0], demoIds[1]]);
      const empIds = [];
      while (sel.step()) {
        const r = sel.getAsObject();
        if (r.employeeId) empIds.push(r.employeeId);
      }
      sel.free();

      // Delete tasks referencing these numeric user ids
      const del1 = db.prepare('DELETE FROM tasks WHERE assigned_to IN (?, ?)');
      del1.run([demoIds[0], demoIds[1]]); del1.free();

      const del2 = db.prepare('DELETE FROM tasks WHERE assigned_by IN (?, ?)');
      del2.run([demoIds[0], demoIds[1]]); del2.free();

      // Also delete tasks that referenced the employeeId strings (assignedTo)
      if (empIds.length) {
        for (const eid of empIds) {
          try {
            const d = db.prepare('DELETE FROM tasks WHERE assignedTo = ? OR REPLACE(assignedTo, "-", "") = REPLACE(?, "-", "")');
            d.run([eid, eid]); d.free();
          } catch (e) { /* ignore per-row errors */ }
        }
      }

      // Finally delete the demo users
      const delUsers = db.prepare('DELETE FROM users WHERE id IN (?, ?)');
      delUsers.run([demoIds[0], demoIds[1]]); delUsers.free();

      db.run('COMMIT');
      persistDB();

      // Log remaining users for validation
      const out = [];
      const stmt = db.prepare('SELECT id, name, email, role, employeeId FROM users ORDER BY id ASC');
      while (stmt.step()) out.push(stmt.getAsObject());
      stmt.free();
      console.log('Demo cleanup complete. Remaining users:', out);
      return success(res, { remainingUsers: out }, 'Cleanup complete');
    } catch (e) {
      try { db.run('ROLLBACK'); } catch (er) { /* ignore */ }
      console.error('Cleanup transactional error', e && (e.stack || e.message || e));
      return failure(res, 'Failed to cleanup demo users', 500);
    }
  } catch (err) {
    console.error('Cleanup endpoint error', err && (err.stack || err.message || err));
    return failure(res, 'Internal server error', 500);
  }
});

// ADMIN: archive demo users (soft-delete) - alternative to full cleanup
app.post('/api/admin/archive-demo-users', requireAuth, (req, res) => {
  try {
    if (!req.user) return failure(res, 'Unauthorized', 401);
    if (req.user.role !== 'ADMIN') return failure(res, 'Forbidden', 403);

    const demoIds = [3, 4];
    try {
      db.run('BEGIN TRANSACTION');
      const archivedAt = new Date().toISOString();
      const upd = db.prepare('UPDATE users SET is_archived = ?, archived_at = ? WHERE id IN (?, ?)');
      upd.run([1, archivedAt, demoIds[0], demoIds[1]]); upd.free();
      // Also archive any linked employees
      const sel = db.prepare('SELECT employeeId FROM users WHERE id IN (?, ?)'); sel.bind([demoIds[0], demoIds[1]]);
      const empIds = [];
      while (sel.step()) { const r = sel.getAsObject(); if (r.employeeId) empIds.push(r.employeeId); } sel.free();
      for (const eid of empIds) {
        try { const ue = db.prepare('UPDATE employees SET is_archived = ?, archived_at = ? WHERE id = ?'); ue.run([1, archivedAt, eid]); ue.free(); } catch (e) { /* ignore */ }
      }
      db.run('COMMIT');
      persistDB();
      return success(res, { archived: true }, 'Demo users archived');
    } catch (e) {
      try { db.run('ROLLBACK'); } catch (er) { /* ignore */ }
      console.error('Archive demo transactional error', e && (e.stack || e.message || e));
      return failure(res, 'Failed to archive demo users', 500);
    }
  } catch (err) {
    console.error('Archive endpoint error', err && (err.stack || err.message || err));
    return failure(res, 'Internal server error', 500);
  }
});

// Employees CRUD API
// Helper: ensure employees table exists (create if missing)
function ensureEmployeesTable() {
  try {
    const chk = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='employees'");
    const has = chk.step();
    chk.free();
    if (!has) {
      console.log('Employees table missing — creating table');
      db.run(`CREATE TABLE employees (
        id TEXT PRIMARY KEY,
        name TEXT,
        department TEXT,
        joiningDate TEXT,
        createdAt TEXT,
        status TEXT,
        designation TEXT,
        email TEXT,
        phone TEXT,
        birthDate TEXT,
        address TEXT,
        documents TEXT,
        hideAttendance INTEGER DEFAULT 0,
        compOffBalance REAL
      )`);
      persistDB();
      console.log('Employees table created');
    }
  } catch (err) {
    console.error('ensureEmployeesTable failed', { err: err && (err.stack || err.message || err) });
    // rethrow so caller can handle
    throw err;
  }
}

// Ensure employees table has hideAttendance column on older DBs
try {
  const tblInfo = db.prepare("PRAGMA table_info('employees')");
  const cols = new Set();
  while (tblInfo.step()) { cols.add(String(tblInfo.getAsObject().name)); }
  tblInfo.free();
  if (!cols.has('hideAttendance')) {
    try {
      db.run("ALTER TABLE employees ADD COLUMN hideAttendance INTEGER DEFAULT 0");
      persistDB();
      console.log('Migration: added employees.hideAttendance column');
    } catch (e) { console.warn('Failed to add employees.hideAttendance column', e && (e.message || e)); }
  }
} catch (e) { /* ignore */ }

app.get('/api/employees', requireAuth, withCache('employees', 15000), (req, res) => {
  try {
    ensureEmployeesTable();
    const archived = req.query.archived === '1' || req.query.archived === 'true';
    const isAdmin = req.user && req.user.role === 'ADMIN';

    // DEBUG: log who is requesting the employees list and query params
    try { console.log('GET /api/employees requested', { path: req.path, isAdmin, user: req.user && { id: req.user.id, role: req.user.role, employeeId: req.user.employeeId }, archived }); } catch (e) { }

    if (isAdmin) {
      console.log('GET /api/employees from', req.headers.origin || 'no-origin');
      const fullDocs = req.query.full === '1' || req.query.full === 'true';
      const q = archived
        ? (fullDocs
          ? 'SELECT id, name, department, joiningDate, createdAt, status, designation, email, phone, birthDate, address, documents, hideAttendance, compOffBalance, archived_at FROM employees WHERE coalesce(is_archived, 0) = 1'
          : "SELECT id, name, department, joiningDate, createdAt, status, designation, email, phone, birthDate, address, hideAttendance, compOffBalance, archived_at, json_extract(documents, '$.avatar') AS avatar FROM employees WHERE coalesce(is_archived, 0) = 1")
        : (fullDocs
          ? 'SELECT id, name, department, joiningDate, createdAt, status, designation, email, phone, birthDate, address, documents, hideAttendance, compOffBalance FROM employees WHERE coalesce(is_archived, 0) = 0'
          : "SELECT id, name, department, joiningDate, createdAt, status, designation, email, phone, birthDate, address, hideAttendance, compOffBalance, json_extract(documents, '$.avatar') AS avatar FROM employees WHERE coalesce(is_archived, 0) = 0");
      const stmt = db.prepare(q);
      const out = [];
      while (stmt.step()) {
        const row = stmt.getAsObject();
        if (fullDocs && row.documents) {
          try {
            const docs = JSON.parse(row.documents);
            if (docs && docs.avatar) row.avatar = docs.avatar;
            row.documents = docs;
          } catch (e) { console.warn('Failed to parse documents JSON for employee', row.id, e); }
        }
        out.push(row);
      }
      stmt.free();
      console.log('GET /api/employees -> returning', out.length, 'rows for admin');
      return success(res, out || []);
    } else if (req.user && req.user.employeeId) {
      // Allow non-admin authenticated users to fetch the list of active employees
      // so features like team chat can display colleagues.
      const q = "SELECT id, name, department, joiningDate, createdAt, status, designation, email, phone, birthDate, address, hideAttendance, compOffBalance, json_extract(documents, '$.avatar') AS avatar FROM employees WHERE coalesce(is_archived, 0) = 0";
      const stmt = db.prepare(q);
      const out = [];
      while (stmt.step()) {
        out.push(stmt.getAsObject());
      }
      stmt.free();
      console.log('GET /api/employees -> returning', out.length, 'rows for non-admin user', req.user && req.user.employeeId);
      return success(res, out || []);
    } else {
      console.log('GET /api/employees -> forbidden for unauthenticated user');
      return failure(res, 'Forbidden', 403);
    }
  } catch (err) {
    console.error('Employees GET error', { path: req.path, err: err && (err.stack || err.message || err) });
    return failure(res, 'Internal server error', 500);
  }
});

app.get('/api/employees/:id', requireAuth, (req, res) => {
  try {
    ensureEmployeesTable();
    const isAdmin = req.user && req.user.role === 'ADMIN';
    const id = req.params.id;
    if (!isAdmin && (!req.user || req.user.employeeId !== id)) return failure(res, 'Forbidden', 403);

    const stmt = db.prepare('SELECT id, name, department, joiningDate, createdAt, status, designation, email, phone, birthDate, address, documents, hideAttendance, compOffBalance FROM employees WHERE id = ?');
    stmt.bind([id]);
    if (!stmt.step()) { stmt.free(); return failure(res, 'Not found', 404); }
    const row = stmt.getAsObject();
    if (row.documents) {
      try {
        const docs = JSON.parse(row.documents);
        if (docs && docs.avatar) row.avatar = docs.avatar;
        row.documents = docs;
      } catch (e) { console.warn('Failed to parse documents JSON for employee', req.params.id, e); }
    }
    stmt.free();
    return success(res, row);
  } catch (err) {
    console.error('Employees/:id GET error', { path: req.path, err: err && (err.stack || err.message || err) });
    return failure(res, 'Internal server error', 500);
  }
});

app.post('/api/employees', requireAuth, (req, res) => {
  try {
    if (!req.user) return failure(res, 'Unauthorized', 401);
    if (req.user.role !== 'ADMIN') return failure(res, 'Forbidden', 403);
    ensureEmployeesTable();
    const { id, name, department, joiningDate, createdAt, status, designation, email, phone, birthDate, address, documents, hideAttendance, compOffBalance } = req.body || {};
    if (!id || !name) return failure(res, 'Missing fields', 400);
    const check = db.prepare('SELECT id FROM employees WHERE id = ?');
    check.bind([id]);
    if (check.step()) { check.free(); return failure(res, 'Employee ID already exists', 409); }
    check.free();

    const docs = documents ? JSON.stringify(documents) : null;
    const insert = db.prepare('INSERT INTO employees (id, name, department, joiningDate, createdAt, status, designation, email, phone, birthDate, address, documents, hideAttendance, compOffBalance) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
    insert.run([id, name, department || null, joiningDate || null, createdAt || new Date().toISOString(), status || 'Active', designation || null, email || null, phone || null, birthDate || null, address || null, docs, hideAttendance ? 1 : 0, compOffBalance || 0]);
    insert.free && insert.free();
    persistDB();
    return success(res, null, 'Created', 201);
  } catch (err) {
    console.error('Employees POST error', { path: req.path, err: err && (err.stack || err.message || err) });
    return failure(res, 'Internal server error', 500);
  }
});

app.put('/api/employees/:id', requireAuth, (req, res) => {
  try {
    if (!req.user) return failure(res, 'Unauthorized', 401);
    const id = req.params.id;
    if (req.user.role !== 'ADMIN' && req.user.employeeId !== id) return failure(res, 'Forbidden', 403);

    ensureEmployeesTable();
    const { name, department, joiningDate, createdAt, status, designation, email, phone, birthDate, address, documents, hideAttendance, compOffBalance, is_archived, avatar } = req.body || {};
    const stmt = db.prepare('SELECT id, documents FROM employees WHERE id = ?');
    stmt.bind([id]);
    if (!stmt.step()) { stmt.free(); return failure(res, 'Not found', 404); }
    const existing = stmt.getAsObject();
    stmt.free();

    // Merge avatar and documents together into the documents JSON column
    let existingDocs = {};
    if (existing.documents) {
      try { existingDocs = JSON.parse(existing.documents); } catch (e) { existingDocs = {}; }
    }
    // If documents object was sent, merge it; if avatar was sent separately, add it to documents
    let mergedDocs = existingDocs;
    if (documents && typeof documents === 'object') {
      mergedDocs = { ...existingDocs, ...documents };
    }
    if (avatar) {
      mergedDocs = { ...mergedDocs, avatar };
    }
    const docs = Object.keys(mergedDocs).length > 0 ? JSON.stringify(mergedDocs) : null;

    // If setting is_archived, record archived_at timestamp when archiving
    const archivedAt = is_archived ? new Date().toISOString() : null;

    const update = db.prepare('UPDATE employees SET name = coalesce(?, name), department = coalesce(?, department), joiningDate = coalesce(?, joiningDate), createdAt = coalesce(?, createdAt), status = coalesce(?, status), designation = coalesce(?, designation), email = coalesce(?, email), phone = coalesce(?, phone), birthDate = coalesce(?, birthDate), address = coalesce(?, address), documents = coalesce(?, documents), hideAttendance = coalesce(?, hideAttendance), compOffBalance = coalesce(?, compOffBalance), is_archived = coalesce(?, is_archived), archived_at = coalesce(?, archived_at) WHERE id = ?');
    update.run([name || null, department || null, joiningDate || null, createdAt || null, status || null, designation || null, email || null, phone || null, birthDate || null, address || null, docs || null, hideAttendance == null ? null : (hideAttendance ? 1 : 0), compOffBalance || null, is_archived == null ? null : (is_archived ? 1 : 0), archivedAt, id]);
    update.free && update.free();
    persistDB();
    return success(res, null, 'Updated');
  } catch (err) {
    console.error('Employees PUT error', { path: req.path, err: err && (err.stack || err.message || err) });
    return failure(res, 'Internal server error', 500);
  }
});

app.delete('/api/employees/:id', requireAuth, (req, res) => {
  try {
    if (!req.user) return failure(res, 'Unauthorized', 401);
    if (req.user.role !== 'ADMIN') return failure(res, 'Forbidden', 403);

    ensureEmployeesTable();
    const id = req.params.id;

    // Soft-delete: mark employee archived
    const archivedAt = new Date().toISOString();
    const upd = db.prepare('UPDATE employees SET is_archived = ?, archived_at = ? WHERE id = ?');
    upd.run([1, archivedAt, id]);
    upd.free();
    persistDB();
    return success(res, null, 'Archived');
  } catch (err) {
    console.error('Employees DELETE error', { path: req.path, err: err && (err.stack || err.message || err) });
    return failure(res, 'Internal server error', 500);
  }
});

// --- Permanent Delete Employee ---
// DELETE /api/employees/:id/permanent  (Admin only)
// Body: { replacementEmployeeId?: string }  — if provided, tasks are reassigned to this employee
app.delete('/api/employees/:id/permanent', requireAuth, (req, res) => {
  try {
    if (!req.user) return failure(res, 'Unauthorized', 401);
    if (req.user.role !== 'ADMIN') return failure(res, 'Forbidden', 403);

    ensureEmployeesTable();
    const id = req.params.id;
    const { replacementEmployeeId } = req.body || {};

    // 1. Reassign or clear tasks assigned to this employee
    try {
      if (replacementEmployeeId) {
        const upd = db.prepare("UPDATE tasks SET assignedTo = ? WHERE assignedTo = ?");
        upd.run([replacementEmployeeId, id]);
        upd.free();
      } else {
        // Unassign — set to empty string so admin can reassign later
        const upd = db.prepare("UPDATE tasks SET assignedTo = '' WHERE assignedTo = ?");
        upd.run([id]);
        upd.free();
      }
    } catch (e) { console.warn('Could not reassign tasks', e && (e.message || e)); }

    // 2. Delete checklist instances for templates assigned to this employee
    try {
      // Get template IDs for this doer
      const tplsStmt = db.prepare("SELECT id FROM checklist_templates WHERE json_extract(data, '$.doerId') = ?");
      tplsStmt.bind([id]);
      const tplIds = [];
      while (tplsStmt.step()) { tplIds.push(tplsStmt.getAsObject().id); }
      tplsStmt.free();

      for (const tplId of tplIds) {
        try {
          const delInst = db.prepare("DELETE FROM checklists WHERE refId = ?");
          delInst.run([tplId]);
          delInst.free();
          const delTpl = db.prepare("DELETE FROM checklist_templates WHERE id = ?");
          delTpl.run([tplId]);
          delTpl.free();
        } catch (e2) { console.warn('Could not delete checklist template', tplId, e2 && (e2.message || e2)); }
      }
    } catch (e) { console.warn('Could not delete checklist templates for employee', e && (e.message || e)); }

    // 3. Delete linked user account
    try {
      const delUser = db.prepare("DELETE FROM users WHERE employeeId = ?");
      delUser.run([id]);
      delUser.free();
    } catch (e) { console.warn('Could not delete linked user', e && (e.message || e)); }

    // 4. Hard-delete the employee record
    const del = db.prepare("DELETE FROM employees WHERE id = ?");
    del.run([id]);
    del.free();

    persistDB();
    return success(res, null, 'Employee permanently deleted');
  } catch (err) {
    console.error('Employees permanent DELETE error', { path: req.path, err: err && (err.stack || err.message || err) });
    return failure(res, 'Internal server error', 500);
  }
});

// --- Employee Profile & Documents APIs ---
// GET /api/employee/profile/:userId
app.get('/api/employee/profile/:userId', requireAuth, (req, res) => {
  try {
    const userId = Number(req.params.userId);
    if (!req.user) return failure(res, 'Unauthorized', 401);
    if (req.user.role !== 'ADMIN' && Number(req.user.id) !== userId) return failure(res, 'Forbidden', 403);

    // Validate that user exists
    const sUser = db.prepare('SELECT id, name, email, role, employeeId FROM users WHERE id = ?');
    sUser.bind([userId]);
    if (!sUser.step()) { sUser.free(); return failure(res, 'User not found', 404); }
    sUser.free();

    const stmt = db.prepare('SELECT id, user_id, full_name, designation, phone, profile_image, created_at FROM employees_profile WHERE user_id = ?');
    stmt.bind([userId]);
    if (!stmt.step()) { stmt.free(); return failure(res, 'Profile not found', 404); }
    const row = stmt.getAsObject(); stmt.free();
    return success(res, { profile: row }, 'Profile');
  } catch (err) {
    console.error('Employee profile GET error', { path: req.path, err: err && (err.stack || err.message || err) });
    return failure(res, 'Internal server error', 500);
  }
});

// POST /api/employee/profile - create profile (multipart/form-data allowed)
app.post('/api/employee/profile', requireAuth, uploadProfile.single('profile_image'), (req, res) => {
  try {
    if (!req.user) return failure(res, 'Unauthorized', 401);
    const { user_id, full_name, designation, phone } = req.body || {};
    if (!user_id || !full_name) return failure(res, 'Missing fields: user_id and full_name required', 400);

    const userId = Number(user_id);
    // Only admin or owner can create
    if (req.user.role !== 'ADMIN' && Number(req.user.id) !== userId) return failure(res, 'Forbidden', 403);

    // Validate user exists
    const sUser = db.prepare('SELECT id FROM users WHERE id = ?'); sUser.bind([userId]);
    if (!sUser.step()) { sUser.free(); return failure(res, 'Invalid user', 400); }
    sUser.free();

    // Ensure profile does not already exist
    const chk = db.prepare('SELECT id FROM employees_profile WHERE user_id = ?'); chk.bind([userId]);
    if (chk.step()) { chk.free(); return failure(res, 'Profile already exists', 409); }
    chk.free();

    try {
      db.run('BEGIN TRANSACTION');
      const profileImagePath = req.file ? path.join('uploads', 'profile', path.basename(req.file.path)) : null;
      const insert = db.prepare('INSERT INTO employees_profile (user_id, full_name, designation, phone, profile_image, created_at) VALUES (?,?,?,?,?,?)');
      insert.run([userId, full_name, designation || null, phone || null, profileImagePath, new Date().toISOString()]);
      insert.free();
      db.run('COMMIT');
      if (!persistDB()) console.warn('Tasks POST: commit succeeded but failed to persist DB file');
      else console.log('Tasks POST: task persisted to DB file');
      return success(res, null, 'Created', 201);
    } catch (e) {
      try { db.run('ROLLBACK'); } catch (er) { /* ignore */ }
      console.error('Employee profile POST transactional error', e && (e.stack || e.message || e));
      return failure(res, 'Internal server error while creating profile', 500);
    }
  } catch (err) {
    console.error('Employee profile POST error', { path: req.path, err: err && (err.stack || err.message || err) });
    return failure(res, 'Internal server error', 500);
  }
});

// PUT /api/employee/profile/:userId - update profile (multipart/form-data allowed)
app.put('/api/employee/profile/:userId', requireAuth, uploadProfile.single('profile_image'), (req, res) => {
  try {
    const userId = Number(req.params.userId);
    if (!req.user) return failure(res, 'Unauthorized', 401);
    if (req.user.role !== 'ADMIN' && Number(req.user.id) !== userId) return failure(res, 'Forbidden', 403);

    const { full_name, designation, phone } = req.body || {};
    // Validate profile exists
    const chk = db.prepare('SELECT id, profile_image FROM employees_profile WHERE user_id = ?'); chk.bind([userId]);
    if (!chk.step()) { chk.free(); return failure(res, 'Profile not found', 404); }
    const existing = chk.getAsObject(); chk.free();

    try {
      db.run('BEGIN TRANSACTION');
      let profileImagePath = existing.profile_image;
      if (req.file) {
        // remove old file if exists
        try { if (existing.profile_image) fs.unlinkSync(path.join(__dirname, '..', existing.profile_image)); } catch (e) { /* ignore */ }
        profileImagePath = path.join('uploads', 'profile', path.basename(req.file.path));
      }

      const update = db.prepare('UPDATE employees_profile SET full_name = coalesce(?, full_name), designation = coalesce(?, designation), phone = coalesce(?, phone), profile_image = coalesce(?, profile_image) WHERE user_id = ?');
      update.run([full_name || null, designation || null, phone || null, profileImagePath || null, userId]);
      update.free();
      db.run('COMMIT');
      persistDB();
      console.log('Tasks POST: created task', { id: row && row.id, assigned_to, assignedToEmp, assigned_by: Number(req.user.id) });
      return success(res, null, 'Updated');
    } catch (e) {
      try { db.run('ROLLBACK'); } catch (er) { /* ignore */ }
      console.error('Employee profile PUT transactional error', e && (e.stack || e.message || e));
      return failure(res, 'Internal server error while updating profile', 500);
    }
  } catch (err) {
    console.error('Employee profile PUT error', { path: req.path, err: err && (err.stack || err.message || err) });
    return failure(res, 'Internal server error', 500);
  }
});

// POST /api/employee/documents - upload a document for a user
app.post('/api/employee/documents', requireAuth, uploadDocument.single('file'), (req, res) => {
  try {
    if (!req.user) return failure(res, 'Unauthorized', 401);
    const { user_id, document_name } = req.body || {};
    if (!user_id || !req.file) return failure(res, 'Missing fields: user_id and file are required', 400);
    const userId = Number(user_id);
    // Only admin or owner can upload
    if (req.user.role !== 'ADMIN' && Number(req.user.id) !== userId) return failure(res, 'Forbidden', 403);

    // Validate user exists
    const sUser = db.prepare('SELECT id FROM users WHERE id = ?'); sUser.bind([userId]);
    if (!sUser.step()) { sUser.free(); return failure(res, 'Invalid user', 400); }
    sUser.free();

    try {
      db.run('BEGIN TRANSACTION');
      const filePath = path.join('uploads', 'documents', path.basename(req.file.path));
      const fileType = req.file.mimetype;
      const insert = db.prepare('INSERT INTO employee_documents (user_id, document_name, file_path, file_type, uploaded_at) VALUES (?,?,?,?,?)');
      insert.run([userId, document_name || req.file.originalname, filePath, fileType, new Date().toISOString()]);
      insert.free();
      db.run('COMMIT');
      persistDB();
      return success(res, null, 'Created', 201);
    } catch (e) {
      try { db.run('ROLLBACK'); } catch (er) { /* ignore */ }
      console.error('Employee documents POST transactional error', e && (e.stack || e.message || e));
      return failure(res, 'Internal server error while uploading document', 500);
    }
  } catch (err) {
    console.error('Employee documents POST error', { path: req.path, err: err && (err.stack || err.message || err) });
    return failure(res, 'Internal server error', 500);
  }
});

// GET /api/employee/documents/:userId
app.get('/api/employee/documents/:userId', requireAuth, (req, res) => {
  try {
    const userId = Number(req.params.userId);
    if (!req.user) return failure(res, 'Unauthorized', 401);
    if (req.user.role !== 'ADMIN' && Number(req.user.id) !== userId) return failure(res, 'Forbidden', 403);

    // Validate user exists
    const sUser = db.prepare('SELECT id FROM users WHERE id = ?'); sUser.bind([userId]);
    if (!sUser.step()) { sUser.free(); return failure(res, 'User not found', 404); }
    sUser.free();

    const stmt = db.prepare('SELECT id, user_id, document_name, file_path, file_type, uploaded_at FROM employee_documents WHERE user_id = ? ORDER BY uploaded_at DESC');
    stmt.bind([userId]);
    const out = [];
    while (stmt.step()) out.push(stmt.getAsObject());
    stmt.free();
    return success(res, { documents: out });
  } catch (err) {
    console.error('Employee documents GET error', { path: req.path, err: err && (err.stack || err.message || err) });
    return failure(res, 'Internal server error', 500);
  }
});

// DELETE /api/employee/documents/:id
app.delete('/api/employee/documents/:id', requireAuth, (req, res) => {
  try {
    if (!req.user) return failure(res, 'Unauthorized', 401);
    const id = Number(req.params.id);
    // Fetch document record
    const s = db.prepare('SELECT id, user_id, file_path FROM employee_documents WHERE id = ?'); s.bind([id]);
    if (!s.step()) { s.free(); return failure(res, 'Document not found', 404); }
    const doc = s.getAsObject(); s.free();

    // Only admin or owner can delete
    if (req.user.role !== 'ADMIN' && Number(req.user.id) !== Number(doc.user_id)) return failure(res, 'Forbidden', 403);

    try {
      db.run('BEGIN TRANSACTION');
      const del = db.prepare('DELETE FROM employee_documents WHERE id = ?'); del.run([id]); del.free();
      db.run('COMMIT');
      // Remove file from disk (best-effort)
      try { if (doc.file_path) fs.unlinkSync(path.join(__dirname, '..', doc.file_path)); } catch (e) { /* ignore */ }
      persistDB();
      return success(res, null, 'Deleted');
    } catch (e) {
      try { db.run('ROLLBACK'); } catch (er) { /* ignore */ }
      console.error('Employee documents DELETE transactional error', e && (e.stack || e.message || e));
      return failure(res, 'Internal server error while deleting document', 500);
    }
  } catch (err) {
    console.error('Employee documents DELETE error', { path: req.path, err: err && (err.stack || err.message || err) });
    return failure(res, 'Internal server error', 500);
  }
});

// --- Auth middleware ---
function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers && req.headers.authorization;
    let token = authHeader && typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')
      ? authHeader.split(' ')[1]
      : req.cookies?.token;

    if (!token) {
      console.warn('Auth: missing token', { path: req.path, ip: req.ip, origin: req.headers.origin || null, hasAuthHeader: !!authHeader });
      return failure(res, 'No token provided', 401);
    }

    try {
      const payload = jwt.verify(token, JWT_SECRET);

      // Normalize payload types to avoid string/number mismatches across code
      const normalizedUser = {
        id: payload && payload.id != null ? Number(payload.id) : undefined,
        role: payload && payload.role ? String(payload.role) : undefined,
        name: payload && payload.name ? String(payload.name) : undefined,
        employeeId: payload && payload.employeeId != null ? String(payload.employeeId) : undefined
      };

      // If employeeId wasn't included in older tokens, attempt to fetch from DB and augment
      try {
        if (!normalizedUser.employeeId && normalizedUser.id != null) {
          const s = db.prepare('SELECT employeeId FROM users WHERE id = ?');
          s.bind([Number(normalizedUser.id)]);
          if (s.step()) {
            const r = s.getAsObject();
            normalizedUser.employeeId = r.employeeId != null ? String(r.employeeId) : undefined;
          }
          s.free();
        }
      } catch (e) {
        console.warn('Auth middleware: failed to augment employeeId from DB', e && (e.message || e));
      }

      req.user = normalizedUser;
      // Debug: log authenticated user for API requests to help diagnose missing routes during development
      try {
        // Suppress noisy auth logs for frequent chat polling in normal dev runs; enable by setting DEBUG_AUTH=true
        if (!String(req.path).startsWith('/api/chat') || process.env.DEBUG_AUTH === 'true') {
          console.log('Auth: user', { id: req.user && req.user.id, role: req.user && req.user.role, path: req.path });
        }
      } catch (e) { }
      return next();
    } catch (err) {
      console.warn('Auth: token verification failed', { path: req.path, err: err && (err.message || err) });
      return failure(res, 'Invalid token', 401);
    }
  } catch (err) {
    console.error('Auth middleware unexpected error', err && (err.stack || err.message || err));
    return failure(res, 'Internal server error', 500);
  }
}

// Helper: UUID generator (fallback if crypto.randomUUID not available)
function genId(prefix = '') {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return prefix + crypto.randomUUID();
  } catch (e) {
    // ignore
  }
  return prefix + 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
}

// Attendance endpoints
// Use a more flexible route for the update endpoint to avoid 404s
app.put('/api/attendance*', requireAuth, (req, res) => {
  const fullPath = req.path;
  // Extract ID from path: /api/attendance/ID or /attendance/ID
  const id = fullPath.replace(/^\/api\/attendance\//, '').replace(/^\/attendance\//, '');
  console.log(`[ATTENDANCE] PUT catch-all hit for path=${fullPath}, extracted id=${id}`, req.body);

  if (!id || id === 'attendance') {
    console.warn('[ATTENDANCE] PUT skip: no ID provided');
    return failure(res, 'ID required', 400);
  }

  try {
    const { clockIn, clockOut, value, location, notes, userId, date } = req.body || {};

    // Check if record exists
    const checkStmt = db.prepare('SELECT id, createdAt FROM attendance WHERE id = ?');
    const exists = checkStmt.bind([id]) && checkStmt.step();
    let createdAt = new Date().toISOString();
    if (exists) {
      const row = checkStmt.getAsObject();
      createdAt = row.createdAt || createdAt;
    }
    checkStmt.free();

    // Use INSERT OR REPLACE for upsert behavior
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO attendance (id, userId, date, clockIn, clockOut, value, location, notes, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // If it exists, we might want to keep the old userId/date if not provided
    // But usually in this app they are provided or derivable from ID
    const finalUserId = userId || (id.split('-')[1]); // fallback to parsing ID A-E-002-date
    const finalDate = date || (id.split('-').slice(2).join('-'));

    stmt.run([
      id,
      finalUserId,
      finalDate,
      clockIn || null,
      clockOut || null,
      value == null ? null : value,
      location || null,
      notes || null,
      createdAt
    ]);
    stmt.free();

    persistDB();
    console.log(`[ATTENDANCE] PUT success: ${exists ? 'Updated' : 'Created'}`);
    return success(res, null, exists ? 'Updated' : 'Created');
  } catch (err) {
    console.error('[ATTENDANCE] PUT error', err);
    return failure(res, 'Internal server error', 500);
  }
});

app.get('/api/attendance', requireAuth, withCache('attendance', 15000), (req, res) => {
  try {
    // Optional query: ?userId= or ?date=
    const userId = req.query.userId;
    const date = req.query.date;
    let q = 'SELECT id, userId, date, clockIn, clockOut, value, location, notes, createdAt FROM attendance';
    const params = [];
    if (userId || date) {
      const clauses = [];
      if (userId) { clauses.push('userId = ?'); params.push(userId); }
      if (date) { clauses.push('date = ?'); params.push(date); }
      q += ' WHERE ' + clauses.join(' AND ');
    }
    const stmt = db.prepare(q);
    stmt.bind(params);
    const out = [];
    while (stmt.step()) out.push(stmt.getAsObject());
    stmt.free();
    return success(res, out);
  } catch (err) {
    console.error('Attendance GET error', { path: req.path, err: err && (err.stack || err.message || err) });
    return failure(res, 'Internal server error', 500);
  }
});

app.post('/api/attendance', requireAuth, (req, res) => {
  try {
    const { id, userId, date, clockIn, clockOut, value, location, notes } = req.body || {};
    if (!id || !userId || !date) return failure(res, 'Missing fields', 400);
    const check = db.prepare('SELECT id FROM attendance WHERE id = ?');
    check.bind([id]);
    if (check.step()) { check.free(); return failure(res, 'Attendance ID already exists', 409); }
    check.free();

    const insert = db.prepare('INSERT INTO attendance (id, userId, date, clockIn, clockOut, value, location, notes, createdAt) VALUES (?,?,?,?,?,?,?,?,?)');
    insert.run([id, userId, date, clockIn || null, clockOut || null, value == null ? null : value, location || null, notes || null, new Date().toISOString()]);
    insert.free && insert.free();
    persistDB();
    return success(res, null, 'Created', 201);
  } catch (err) {
    console.error('Attendance POST error', { path: req.path, err: err && (err.stack || err.message || err) });
    return failure(res, 'Internal server error', 500);
  }
});


app.delete('/api/attendance/:id', requireAuth, (req, res) => {
  try {
    const id = req.params.id;
    const del = db.prepare('DELETE FROM attendance WHERE id = ?');
    del.run([id]);
    del.free();
    persistDB();
    return success(res, null, 'Deleted');
  } catch (err) {
    console.error('Attendance DELETE error', { path: req.path, err: err && (err.stack || err.message || err) });
    return failure(res, 'Internal server error', 500);
  }
});

// Time logs endpoints
app.get('/api/timelogs', requireAuth, withCache('timelogs', 15000), (req, res) => {
  try {
    const userId = req.query.userId;
    let q = 'SELECT id, userId, startTime, endTime, task, notes, createdAt FROM timelogs';
    const params = [];
    if (userId) { q += ' WHERE userId = ?'; params.push(userId); }
    const stmt = db.prepare(q);
    stmt.bind(params);
    const out = [];
    while (stmt.step()) {
      const record = stmt.getAsObject();
      // Calculate durationHours if both startTime and endTime exist
      if (record.startTime && record.endTime) {
        const start = new Date(record.startTime);
        const end = new Date(record.endTime);
        const diffMs = end - start;
        const diffHours = diffMs / (1000 * 60 * 60);
        record.durationHours = Math.max(0, diffHours); // Ensure non-negative
      }
      out.push(record);
    }
    stmt.free();
    return success(res, out);
  } catch (err) {
    console.error('Timelogs GET error', { path: req.path, err: err && (err.stack || err.message || err) });
    return failure(res, 'Internal server error', 500);
  }
});

// --- Tasks endpoints ---
// Ensure optional snake_case compatibility columns exist for tasks (run-time migration)
// Ensure tasks table exists and if missing create the required schema (non-destructive)
try {
  const tbl = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='tasks'");
  const hasTasks = tbl.step(); tbl.free();
  if (!hasTasks) {
    console.log('Tasks table missing - creating required tasks schema');
    db.run(`CREATE TABLE tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        priority TEXT,
        due_date TEXT,
        assigned_to INTEGER,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);
    persistDB();
  }

  // Run migrations: add missing compatibility columns without altering existing primary key type
  const colsStmt2 = db.prepare("PRAGMA table_info('tasks')");
  const colsSet = new Set();
  while (colsStmt2.step()) colsSet.add(String(colsStmt2.getAsObject().name));
  colsStmt2.free();
  const addIfMissing = (name, sql) => {
    if (!colsSet.has(name)) {
      try { db.run(sql); console.log('Added tasks column (migration):', name); persistDB(); } catch (e) { console.warn('Failed to add tasks column', name, e && (e.message || e)); }
    }
  };
  addIfMissing('assigned_to', 'ALTER TABLE tasks ADD COLUMN assigned_to INTEGER');
  addIfMissing('due_date', 'ALTER TABLE tasks ADD COLUMN due_date TEXT');
  addIfMissing('created_at', 'ALTER TABLE tasks ADD COLUMN created_at TEXT');
  addIfMissing('assigned_by', 'ALTER TABLE tasks ADD COLUMN assigned_by INTEGER');
  // status may already exist (camelCase 'status'), but ensure snake_case as well
  addIfMissing('status', "ALTER TABLE tasks ADD COLUMN status TEXT");
} catch (e) { console.warn('Tasks runtime migration failed', e && (e.message || e)); }
// POST /api/tasks - create a new task (ADMIN only)
app.post('/api/tasks', requireAuth, (req, res) => {
  try {
    if (!req.user) return failure(res, 'Unauthorized', 401);
    if (req.user.role !== 'ADMIN') return failure(res, 'Forbidden', 403);

    const { title, description, assignedTo, assigned_to, assigned_by, dueDate, priority } = req.body || {};
    console.log('Tasks POST by', req.user && (req.user.id || req.user.name || req.user.role), 'payload', { title, assignedTo, assigned_to, dueDate });
    if (!title) return failure(res, 'Missing required field: title', 400);
    // Validate assignee presence to avoid accidental empty-string -> numeric 0 coercion
    if (assignedTo == null || String(assignedTo).trim() === '') {
      return failure(res, 'Missing required field: assignedTo', 400);
    }

    try {
      db.run('BEGIN TRANSACTION');

      // Validate assignee: accept either employee id (preferred) or numeric user id.
      // Support both `assignedTo` (employeeId) and `assigned_to` (numeric user id) from clients.
      let assigned_to = null; // numeric user id
      let assignedToEmp = null; // employee id string

      // If client explicitly supplied numeric user id in assigned_to, prefer and validate it
      if (assigned_to != null && String(assigned_to).trim() !== '') {
        // ensure numeric
        const maybeNum = Number(assigned_to);
        if (isNaN(maybeNum)) { db.run('ROLLBACK'); return failure(res, 'Invalid assignee id', 400); }
        const u = db.prepare('SELECT id, employeeId FROM users WHERE id = ? AND coalesce(is_archived, 0) = 0');
        u.bind([maybeNum]);
        if (!u.step()) { u.free(); db.run('ROLLBACK'); console.warn('Tasks POST: user id not found or archived', assigned_to); return failure(res, 'Invalid assignee: user not found', 400); }
        const ur = u.getAsObject(); u.free();
        assigned_to = Number(ur.id);
        assignedToEmp = ur.employeeId || null;
      } else if (assignedTo != null && String(assignedTo).trim() !== '') {
        // Prefer matching an employee record first (handles numeric employee IDs too)
        try {
          const e = db.prepare("SELECT id FROM employees WHERE REPLACE(id, '-', '') = REPLACE(?, '-', '') COLLATE NOCASE AND coalesce(is_archived, 0) = 0");
          e.bind([assignedTo]);
          if (e.step()) {
            const er = e.getAsObject();
            assignedToEmp = er.id;
            e.free();
            // Try to resolve to a user id if a user exists for this employee
            try {
              const u2 = db.prepare('SELECT id FROM users WHERE employeeId = ? AND coalesce(is_archived, 0) = 0');
              u2.bind([assignedToEmp]);
              if (u2.step()) { assigned_to = Number(u2.getAsObject().id); }
              u2.free();
            } catch (inner) { /* ignore */ }
          } else {
            e.free();
            // Fallback: if looks numeric, treat as user id
            if (!isNaN(Number(assignedTo))) {
              const u = db.prepare('SELECT id, employeeId FROM users WHERE id = ? AND coalesce(is_archived, 0) = 0');
              u.bind([Number(assignedTo)]);
              if (!u.step()) { u.free(); db.run('ROLLBACK'); console.warn('Tasks POST: user id not found or archived', assignedTo); return failure(res, 'Invalid assignee: user not found', 400); }
              const ur = u.getAsObject(); u.free();
              assigned_to = Number(ur.id);
              assignedToEmp = ur.employeeId || null;
            } else {
              // No matching employee or numeric user id
              db.run('ROLLBACK');
              console.warn('Tasks POST: assignee lookup failed for', assignedTo);
              return failure(res, 'Invalid assignee: employee not found', 400);
            }
          }
        } catch (e) {
          console.warn('Tasks POST: assignee resolution error', e && (e.message || e));
          db.run('ROLLBACK');
          return failure(res, 'Invalid assignee', 400);
        }
      }

      const createdAt = new Date().toISOString();
      const assignedBy = String(req.user.id);

      // Detect id column type so we insert correctly (some DBs may use INTEGER PKs, others legacy TEXT ids)
      const infoStmt = db.prepare("PRAGMA table_info('tasks')");
      const meta = {};
      while (infoStmt.step()) { const r = infoStmt.getAsObject(); meta[r.name] = r; }
      infoStmt.free();
      const idCol = meta['id'];
      const idIsText = idCol && String(idCol.type || '').toUpperCase().indexOf('INT') === -1;

      let row;
      if (idIsText) {
        let nextNum = 1;
        try {
          const q = db.prepare("SELECT MAX(CAST(SUBSTR(id, 5) AS INTEGER)) as maxNum FROM tasks WHERE id LIKE 'KBT-%'");
          if (q.step()) {
            const data = q.getAsObject();
            if (data.maxNum) nextNum = data.maxNum + 1;
          }
          q.free();
        } catch(e) { console.warn('Could not compute max KBT- id', e); }
        const id = 'KBT-' + String(nextNum).padStart(2, '0');
        // Insert and populate both camelCase and snake_case columns for compatibility
        const insert = db.prepare('INSERT INTO tasks (id, title, description, assignedTo, assignedBy, assigned_by, priority, dueDate, assigned_to, due_date, status, createdAt, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)');
        insert.run([id, title, description || '', assignedToEmp || null, assignedBy || null, Number(req.user.id) || null, priority || 'MEDIUM', dueDate, assigned_to, dueDate, 'pending', createdAt, createdAt]);
        insert.free();

        const getStmt = db.prepare('SELECT id, title, description, assignedTo, assignedBy, assigned_by, priority, dueDate, assigned_to, due_date, status, createdAt, created_at, extensionHistory, extensionRequest FROM tasks WHERE id = ?');
        getStmt.bind([id]);
        getStmt.step();
        row = getStmt.getAsObject();
        getStmt.free();
      } else {
        // INTEGER AUTOINCREMENT primary key: insert without supplying id
        const insert = db.prepare('INSERT INTO tasks (title, description, assignedTo, assignedBy, assigned_by, priority, dueDate, assigned_to, due_date, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
        insert.run([title, description || '', assignedToEmp || null, assignedBy || null, Number(req.user.id) || null, priority || 'MEDIUM', dueDate, assigned_to, dueDate, 'pending', createdAt]);
        insert.free();
        const get = db.prepare('SELECT id, title, description, assignedTo, assignedBy, assigned_by, priority, dueDate, assigned_to, due_date, status, created_at FROM tasks WHERE rowid = last_insert_rowid()');
        get.bind([]); get.step(); row = get.getAsObject(); get.free();
      }

      db.run('COMMIT');
      persistDB();

      row.extensionHistory = (() => { try { return JSON.parse(row.extensionHistory || '[]'); } catch (e) { return []; } })();
      row.extensionRequest = (() => { try { return row.extensionRequest ? JSON.parse(row.extensionRequest) : undefined; } catch (e) { return undefined; } })();

      return success(res, { task: row }, 'Created', 201);
    } catch (e) {
      try { db.run('ROLLBACK'); } catch (er) { console.error('Tasks POST: rollback failed', er && (er.stack || er.message || er)); }
      console.error('Tasks POST transactional error', e && (e.stack || e.message || e));
      return failure(res, 'Internal server error while creating task', 500);
    }
  } catch (err) {
    console.error('Tasks POST error', { path: req.path, err: err && (err.stack || err.message || err) });
    return failure(res, 'Internal server error', 500);
  }
});

// GET /api/tasks - get tasks for the logged-in user (admin returns all)
app.get('/api/tasks', requireAuth, withCache('tasks', 15000), (req, res) => {
  try {
    if (!req.user) return failure(res, 'Unauthorized', 401);

    const isAdmin = req.user.role === 'ADMIN';

    // Use LEFT JOIN to include assigner and assignee names directly
    const base = `
      SELECT t.id, t.title, t.description, t.priority, t.due_date, t.assigned_to, t.assignedTo as assignedToStr, t.status, t.created_at,
             ua.name AS assignedByName, ua.employeeId AS assignedByEmployeeId,
             ub.name AS assignedToName, ub.employeeId AS assignedToEmployeeId,
             t.extensionHistory, t.extensionRequest, t.completionDate, t.completionProcess, t.completionAttachment, t.statusNote
      FROM tasks t
      LEFT JOIN users ua ON ua.id = t.assigned_by
      LEFT JOIN users ub ON ub.id = t.assigned_to
    `;

    let query = base + ' ORDER BY t.created_at DESC';
    const params = [];
    if (!isAdmin) {
      // Restrict to tasks assigned to the current user (by numeric id or employeeId)
      const normalizedEmp = req.user.employeeId ? String(req.user.employeeId).replace(/[^a-zA-Z0-9]/g, '') : '';
      query = base + ' WHERE t.assigned_to = ? OR t.assignedTo = ? OR REPLACE(t.assignedTo, "-", "") = ? ORDER BY t.created_at DESC';
      params.push(Number(req.user.id), req.user.employeeId || '', normalizedEmp);
    }

    const stmt = db.prepare(query);
    if (params.length) stmt.bind(params);

    const out = [];
    while (stmt.step()) {
      const r = stmt.getAsObject();
      // Map DB columns to frontend shape
      r.assigned_to = r.assigned_to || null;
      r.assignedTo = r.assignedToStr || r.assignedToEmployeeId || r.assignedToEmployeeId || null;
      // Prefer joined names when available
      r.assignedBy = r.assignedByName || null;
      r.assignedToName = r.assignedToName || null;

      r.dueDate = r.due_date || null;
      r.createdDate = r.created_at || null;
      r.priority = r.priority || 'MEDIUM';
      r.status = (r.status || 'pending').toUpperCase();

      r.extensionHistory = (() => { try { return JSON.parse(r.extensionHistory || '[]'); } catch (e) { return []; } })();
      r.extensionRequest = (() => { try { return r.extensionRequest ? JSON.parse(r.extensionRequest) : undefined; } catch (e) { return undefined; } })();

      out.push(r);
    }
    stmt.free();
    return success(res, { tasks: out });
  } catch (err) {
    console.error('Tasks GET error', { path: req.path, err: err && (err.stack || err.message || err) });
    return failure(res, 'Internal server error', 500);
  }
});



// GET /api/tasks/:id - get a task by id
app.get('/api/tasks/:id', requireAuth, (req, res) => {
  try {
    const id = req.params.id;
    if (!req.user) return failure(res, 'Unauthorized', 401);

    const stmt = db.prepare('SELECT id, title, description, priority, dueDate, due_date, assignedTo, assigned_to, assigned_by, status, createdAt, created_at, extensionHistory, extensionRequest FROM tasks WHERE id = ?');
    stmt.bind([id]);
    if (!stmt.step()) { stmt.free(); return failure(res, 'Not found', 404); }
    let r = stmt.getAsObject();
    try { r.extensionHistory = JSON.parse(r.extensionHistory || '[]'); } catch (e) { r.extensionHistory = []; }
    try { r.extensionRequest = r.extensionRequest ? JSON.parse(r.extensionRequest) : undefined; } catch (e) { r.extensionRequest = undefined; }

    // Normalize and enrich for frontend compatibility
    r.assigned_to = r.assigned_to || (r.assignedTo && (isNaN(Number(r.assignedTo)) ? null : Number(r.assignedTo)));
    try {
      if (r.assigned_to != null) {
        const u = db.prepare('SELECT employeeId, name FROM users WHERE id = ?'); u.bind([Number(r.assigned_to)]);
        if (u.step()) { const uu = u.getAsObject(); r.assignedTo = uu.employeeId || null; /* do not overwrite assignedBy here */ }
        u.free();
      } else if (r.assignedTo) {
        r.assignedTo = r.assignedTo;
      } else { r.assignedTo = null; }

      // Resolve assigned_by numeric to an assigner name when present
      if (r.assigned_by != null) {
        const s = db.prepare('SELECT name FROM users WHERE id = ?'); s.bind([Number(r.assigned_by)]);
        if (s.step()) { const su = s.getAsObject(); r.assignedBy = su.name || null; }
        s.free();
      }
    } catch (e) { console.warn('Failed resolving assignedTo/assignedBy for task', r && r.id, e && (e.message || e)); r.assignedTo = r.assignedTo || null; }

    r.dueDate = r.due_date || r.dueDate || null;
    r.createdDate = r.created_at || r.createdAt || null;
    r.priority = r.priority || 'MEDIUM';
    r.status = (r.status || 'pending').toUpperCase();

    stmt.free();

    // Authorization: admin OR assigned_to numeric owner
    const isAdmin = req.user.role === 'ADMIN';
    const isAssignee = r.assigned_to && Number(r.assigned_to) === Number(req.user.id);
    if (!isAdmin && !isAssignee) return failure(res, 'Forbidden', 403);

    return success(res, { task: r });
  } catch (err) {
    console.error('Tasks GET /:id error', { path: req.path, err: err && (err.stack || err.message || err) });
    return failure(res, 'Internal server error', 500);
  }
});

// PUT /api/tasks/:id/uncomplete - Admin-only: revert a completed task back to pending/overdue
app.put('/api/tasks/:id/uncomplete', requireAuth, (req, res) => {
  try {
    if (!req.user) return failure(res, 'Unauthorized', 401);
    if (req.user.role !== 'ADMIN') return failure(res, 'Forbidden: Admin only', 403);

    const id = req.params.id;

    // Check the task exists
    const getStmt = db.prepare('SELECT id, dueDate, due_date FROM tasks WHERE id = ?');
    getStmt.bind([id]);
    if (!getStmt.step()) { getStmt.free(); return failure(res, 'Task not found', 404); }
    const existing = getStmt.getAsObject();
    getStmt.free();

    try {
      db.run('BEGIN TRANSACTION');

      // Directly NULL out all completion-related fields; set status to PENDING
      // This bypasses coalesce so the fields are truly cleared
      const stmt = db.prepare(
        'UPDATE tasks SET status = ?, completionDate = NULL, completionProcess = NULL, completionAttachment = NULL WHERE id = ?'
      );
      stmt.run(['PENDING', id]);
      stmt.free();

      db.run('COMMIT');
      if (!persistDB()) console.warn('Tasks uncomplete: commit succeeded but failed to persist DB file');
      else console.log('Tasks uncomplete: task reverted to pending', { id });

      // Return the updated task
      const outStmt = db.prepare('SELECT id, title, description, assignedTo, assigned_to, priority, dueDate, due_date, status, createdAt, created_at, assignedBy, completionDate, completionProcess, completionAttachment, statusNote, attachment, externalLink FROM tasks WHERE id = ?');
      outStmt.bind([id]);
      outStmt.step();
      const updated = outStmt.getAsObject();
      outStmt.free();
      return success(res, { task: updated }, 'Task reverted to pending');
    } catch (e) {
      try { db.run('ROLLBACK'); } catch (er) { }
      console.error('Tasks uncomplete transactional error', e && (e.stack || e.message || e));
      return failure(res, 'Internal server error while reverting task', 500);
    }
  } catch (err) {
    console.error('Tasks uncomplete error', err && (err.stack || err.message || err));
    return failure(res, 'Internal server error', 500);
  }
});

// PUT /api/tasks/:id - update a task (assignee or admin)
app.put('/api/tasks/:id', requireAuth, (req, res) => {
  try {
    if (!req.user) return failure(res, 'Unauthorized', 401);
    const id = req.params.id;
    const getStmt = db.prepare("SELECT id, title, description, assignedTo, priority, dueDate, assigned_to, createdAt, coalesce(assignedBy, '') as assignedBy FROM tasks WHERE id = ?");
    getStmt.bind([id]);
    if (!getStmt.step()) { getStmt.free(); return failure(res, 'Not found', 404); }
    const existing = getStmt.getAsObject();
    getStmt.free();

    // Only admin or assigned user may update
    const isAssignee = (existing.assignedTo && existing.assignedTo === req.user.employeeId) || (existing.assigned_to && Number(existing.assigned_to) === Number(req.user.id));
    const isAdmin = req.user.role === 'ADMIN';
    if (!isAdmin && !isAssignee) return failure(res, 'Forbidden', 403);

    const updates = req.body || {};

    try {
      db.run('BEGIN TRANSACTION');

      // If assignedTo is being changed, validate new assignee (prefer employee id lookup)
      let assigned_to_val = null;
      let assignedToEmp = null;
      if (updates.assignedTo && updates.assignedTo !== existing.assignedTo) {
        try {
          const e = db.prepare("SELECT id FROM employees WHERE REPLACE(id, '-', '') = REPLACE(?, '-', '') COLLATE NOCASE AND coalesce(is_archived, 0) = 0");
          e.bind([updates.assignedTo]);
          if (e.step()) {
            const er = e.getAsObject(); assignedToEmp = er.id; e.free();
            try {
              const u2 = db.prepare('SELECT id FROM users WHERE employeeId = ? AND coalesce(is_archived, 0) = 0');
              u2.bind([assignedToEmp]);
              if (u2.step()) { assigned_to_val = Number(u2.getAsObject().id); }
              u2.free();
            } catch (inner) { /* ignore */ }
          } else {
            e.free();
            // Fallback to numeric user id if provided
            if (!isNaN(Number(updates.assignedTo))) {
              const u = db.prepare('SELECT id, employeeId FROM users WHERE id = ? AND coalesce(is_archived, 0) = 0');
              u.bind([Number(updates.assignedTo)]);
              if (!u.step()) { u.free(); db.run('ROLLBACK'); return failure(res, 'Invalid assignee: user not found', 400); }
              const ur = u.getAsObject(); u.free();
              assigned_to_val = Number(ur.id); assignedToEmp = ur.employeeId || null;
            } else {
              db.run('ROLLBACK');
              return failure(res, 'Invalid assignee: employee not found', 400);
            }
          }
        } catch (e) {
          console.warn('Tasks PUT: assignee resolution error', e && (e.message || e)); db.run('ROLLBACK'); return failure(res, 'Invalid assignee', 400);
        }
      }

      // Build update SQL parts - preserve existing when not provided. Also set snake_case columns accordingly
      // Persist statusNote, extensionRequest and extensionHistory if provided
      const updateStmt = db.prepare('UPDATE tasks SET title = coalesce(?, title), description = coalesce(?, description), assignedTo = coalesce(?, assignedTo), assignedBy = coalesce(?, assignedBy), priority = coalesce(?, priority), dueDate = coalesce(?, dueDate), assigned_to = coalesce(?, assigned_to), assigned_by = coalesce(?, assigned_by), due_date = coalesce(?, due_date), status = coalesce(?, status), statusNote = coalesce(?, statusNote), extensionRequest = coalesce(?, extensionRequest), extensionHistory = coalesce(?, extensionHistory), completionDate = coalesce(?, completionDate), completionProcess = coalesce(?, completionProcess), completionAttachment = coalesce(?, completionAttachment), createdAt = coalesce(?, createdAt), created_at = coalesce(?, created_at), attachment = coalesce(?, attachment), externalLink = coalesce(?, externalLink) WHERE id = ?');

      // If assignment changed, set assignedBy/assigned_by to current user
      const assignerCamel = (updates.assignedTo && updates.assignedTo !== existing.assignedTo) ? String(req.user.id) : null;
      const assignerNumeric = (updates.assignedTo && updates.assignedTo !== existing.assignedTo) ? Number(req.user.id) : null;

      // Convert extension fields to JSON strings for storage (or null if not provided)
      const extReqStr = updates.extensionRequest ? (typeof updates.extensionRequest === 'string' ? updates.extensionRequest : JSON.stringify(updates.extensionRequest)) : (updates.extensionRequest === '' ? '' : null);
      const extHistStr = updates.extensionHistory ? (typeof updates.extensionHistory === 'string' ? updates.extensionHistory : JSON.stringify(updates.extensionHistory)) : (updates.extensionHistory === '' ? '' : null);

      // Idempotency: If the update would result in no change (e.g., extension already approved/rejected), skip write
      const incomingExtStatus = updates.extensionRequest && (updates.extensionRequest.status || ((typeof updates.extensionRequest === 'string') ? (() => { try { return JSON.parse(updates.extensionRequest).status; } catch (e) { return null; } })() : updates.extensionRequest.status));
      try {
        const existingExt = existing.extensionRequest ? (typeof existing.extensionRequest === 'string' ? JSON.parse(existing.extensionRequest) : existing.extensionRequest) : null;
        if (incomingExtStatus && existingExt && incomingExtStatus === existingExt.status && (updates.dueDate || updates.due_date) === (existing.dueDate || existing.due_date)) {
          console.log('Tasks PUT: no-op update detected (duplicate extension response), skipping DB write', { id, incomingExtStatus, existingStatus: existingExt.status });
          // Return the existing task to caller
          return success(res, { task: existing }, 'No changes', 200);
        }
      } catch (e) { /* ignore parse errors and proceed */ }

      updateStmt.run([
        updates.title !== undefined ? updates.title : null,
        updates.description !== undefined ? updates.description : null,
        assignedToEmp !== null ? assignedToEmp : (updates.assignedTo !== undefined ? updates.assignedTo : null),
        assignerCamel,
        updates.priority !== undefined ? updates.priority : null,
        updates.dueDate !== undefined ? updates.dueDate : (updates.due_date !== undefined ? updates.due_date : null),
        assigned_to_val !== null ? assigned_to_val : (updates.assigned_to !== undefined ? updates.assigned_to : null),
        assignerNumeric,
        updates.dueDate !== undefined ? updates.dueDate : (updates.due_date !== undefined ? updates.due_date : null),
        updates.status !== undefined ? updates.status : null,
        updates.statusNote !== undefined ? updates.statusNote : null,
        extReqStr,
        extHistStr,
        updates.completionDate !== undefined ? updates.completionDate : (updates.completion_date !== undefined ? updates.completion_date : null),
        updates.completionProcess !== undefined ? updates.completionProcess : null,
        updates.completionAttachment !== undefined ? updates.completionAttachment : null,
        updates.createdAt !== undefined ? updates.createdAt : null,
        updates.created_at !== undefined ? updates.created_at : null,
        updates.attachment !== undefined ? updates.attachment : null,
        updates.externalLink !== undefined ? updates.externalLink : null,
        id
      ]);
      updateStmt.free();

      db.run('COMMIT');
      if (!persistDB()) console.warn('Tasks PUT: commit succeeded but failed to persist DB file');
      else console.log('Tasks PUT: updated task persisted to DB file');
      console.log('Tasks PUT: updated task', { id, assigned_to_val, assignedToEmp, assignerNumeric: assignerNumeric });

      const outStmt = db.prepare('SELECT id, title, description, assignedTo, assigned_to, priority, dueDate, due_date, status, createdAt, created_at, assignedBy, completionDate, completionProcess, completionAttachment, statusNote, attachment, externalLink FROM tasks WHERE id = ?');
      outStmt.bind([id]);
      outStmt.step();
      const updated = outStmt.getAsObject();
      outStmt.free();
      return success(res, { task: updated }, 'Updated');
    } catch (e) {
      try { db.run('ROLLBACK'); } catch (er) { console.error('Tasks PUT: rollback failed', er && (er.stack || er.message || er)); }
      console.error('Tasks PUT transactional error', e && (e.stack || e.message || e));
      return failure(res, 'Internal server error while updating task', 500);
    }
  } catch (err) {
    console.error('Tasks PUT error', { path: req.path, err: err && (err.stack || err.message || err) });
    return failure(res, 'Internal server error', 500);
  }
});

// DELETE /api/tasks/:id - delete a task (admin or creator)
app.delete('/api/tasks/:id', requireAuth, (req, res) => {
  try {
    if (!req.user) return failure(res, 'Unauthorized', 401);
    const id = req.params.id;

    const getStmt = db.prepare('SELECT assignedBy, assigned_to FROM tasks WHERE id = ?');
    getStmt.bind([id]);
    if (!getStmt.step()) { getStmt.free(); return failure(res, 'Not found', 404); }
    const existing = getStmt.getAsObject();
    getStmt.free();

    const isAdmin = req.user.role === 'ADMIN';
    const isOwner = existing.assigned_to && Number(existing.assigned_to) === Number(req.user.id);
    if (!isAdmin && !isOwner) return failure(res, 'Forbidden', 403);

    try {
      db.run('BEGIN TRANSACTION');
      const del = db.prepare('DELETE FROM tasks WHERE id = ?');
      del.run([id]);
      del.free();
      db.run('COMMIT');
      if (!persistDB()) console.warn('Tasks DELETE: commit succeeded but failed to persist DB file');
      else console.log('Tasks DELETE: deleted task persisted to DB file');
      return success(res, null, 'Deleted');
    } catch (e) {
      try { db.run('ROLLBACK'); } catch (er) { console.error('Tasks DELETE: rollback failed', er && (er.stack || er.message || er)); }
      console.error('Tasks DELETE transactional error', e && (e.stack || e.message || e));
      return failure(res, 'Internal server error while deleting task', 500);
    }
  } catch (err) {
    console.error('Tasks DELETE error', { path: req.path, err: err && (err.stack || err.message || err) });
    return failure(res, 'Internal server error', 500);
  }
});

// GET tasks for a specific user (admin or owner)
app.get('/api/tasks/user/:userId', requireAuth, (req, res) => {
  try {
    const userId = req.params.userId;
    if (!req.user) return failure(res, 'Unauthorized', 401);
    // Allow admin or the owner (employee id or numeric id match)
    if (req.user.role !== 'ADMIN' && req.user.employeeId !== userId && String(req.user.id) !== String(userId)) return failure(res, 'Forbidden', 403);

    const out = [];
    // If userId is numeric, look up assigned_to; otherwise match assignedTo employee id (flexible)
    if (!isNaN(Number(userId))) {
      const stmt = db.prepare('SELECT id, title, description, priority, due_date, assigned_to, status, created_at FROM tasks WHERE assigned_to = ? ORDER BY created_at DESC');
      stmt.bind([Number(userId)]);
      while (stmt.step()) out.push(stmt.getAsObject());
      stmt.free();
    } else {
      const stmt = db.prepare('SELECT id, title, description, priority, due_date, assigned_to, status, created_at FROM tasks WHERE assignedTo = ? OR REPLACE(assignedTo, "-", "") = ? ORDER BY created_at DESC');
      const normalized = String(userId || '').replace(/[^a-zA-Z0-9]/g, '');
      stmt.bind([String(userId || ''), normalized]);
      while (stmt.step()) out.push(stmt.getAsObject());
      stmt.free();
    }

    return success(res, { tasks: out });
  } catch (err) {
    console.error('Tasks user GET error', { path: req.path, err: err && (err.stack || err.message || err) });
    return failure(res, 'Internal server error', 500);
  }
});

// Calendar events
app.post('/api/calendar', requireAuth, (req, res) => {
  try {
    const { title, description, startTime, endTime } = req.body || {};
    if (!title || !startTime) return failure(res, 'Missing fields', 400);
    try {
      db.run('BEGIN TRANSACTION');
      const id = genId('C-');
      const createdAt = new Date().toISOString();
      const insert = db.prepare('INSERT INTO calendar (id, title, description, startTime, endTime, createdBy, createdAt) VALUES (?,?,?,?,?,?,?)');
      insert.run([id, title, description || null, startTime, endTime || null, req.user && (req.user.employeeId || req.user.id) || null, createdAt]);
      insert.free();
      db.run('COMMIT');
      persistDB();
      return success(res, { id }, 'Created', 201);
    } catch (e) { try { db.run('ROLLBACK'); } catch (er) { } throw e; }
  } catch (err) {
    console.error('Calendar POST error', err && (err.stack || err.message || err));
    return failure(res, 'Internal server error', 500);
  }
});

app.get('/api/calendar', requireAuth, (req, res) => {
  try {
    const stmt = db.prepare('SELECT id, title, description, startTime, endTime, createdBy, createdAt FROM calendar ORDER BY startTime DESC');
    const out = [];
    while (stmt.step()) out.push(stmt.getAsObject());
    stmt.free();
    return success(res, out || []);
  } catch (err) { console.error('Calendar GET error', err && (err.stack || err.message || err)); return failure(res, 'Internal server error', 500); }
});

// Finance
app.post('/api/finance', requireAuth, (req, res) => {
  try {
    const { amount, currency, type, description, date } = req.body || {};
    if (typeof amount !== 'number') return failure(res, 'Invalid amount', 400);
    try {
      db.run('BEGIN TRANSACTION');
      const id = genId('F-');
      const createdAt = new Date().toISOString();
      const insert = db.prepare('INSERT INTO finance (id, amount, currency, type, description, date, createdBy, createdAt) VALUES (?,?,?,?,?,?,?,?)');
      insert.run([id, amount, currency || 'INR', type || 'PAYMENT', description || null, date || new Date().toISOString(), req.user && (req.user.employeeId || req.user.id) || null, createdAt]);
      insert.free();
      db.run('COMMIT');
      persistDB();
      return success(res, { id }, 'Created', 201);
    } catch (e) { try { db.run('ROLLBACK'); } catch (er) { } throw e; }
  } catch (err) { console.error('Finance POST error', err && (err.stack || err.message || err)); return failure(res, 'Internal server error', 500); }
});

app.get('/api/finance', requireAuth, withCache('finance', 15000), (req, res) => {
  try {
    const stmt = db.prepare('SELECT id, amount, currency, type, description, date, createdBy, createdAt FROM finance ORDER BY date DESC');
    const out = [];
    while (stmt.step()) out.push(stmt.getAsObject());
    stmt.free();
    return success(res, out || []);
  } catch (err) { console.error('Finance GET error', err && (err.stack || err.message || err)); return failure(res, 'Internal server error', 500); }
});

// DELETE client and associated history (admin-only)
app.delete('/api/finance/client', requireAuth, (req, res) => {
  try {
    // Log the incoming request and actor for debugging
    const id = (req.query && req.query.id) || (req.body && req.body.id);
    console.log('DELETE /api/finance/client requested', { id: id || null, user: req.user });

    if (!req.user || req.user.role !== 'ADMIN') {
      console.warn('Finance DELETE client: forbidden attempt', { user: req.user, id });
      return failure(res, 'Forbidden', 403);
    }
    if (!id) return failure(res, 'Missing client id', 400);

    try {
      // Read all finance rows and build helper maps so we support either
      // - id == composite client key (clientName::projectId)
      // - id == actual finance row id (numeric string)
      const stmt = db.prepare('SELECT id, type, description FROM finance');
      const rows = [];
      while (stmt.step()) {
        rows.push(stmt.getAsObject());
      }
      stmt.free();

      const toDeleteSet = new Set();
      const matchingClientKeys = new Set();

      // First pass: find client rows that match either by composite key or by row id
      for (const row of rows) {
        let desc = null;
        try { desc = typeof row.description === 'string' ? JSON.parse(row.description) : row.description; } catch (e) { desc = null; }
        if (row.type === 'CLIENT' && desc && desc.clientName && desc.projectId) {
          const key = `${desc.clientName}::${desc.projectId}`;
          if (key === id || String(row.id) === String(id)) {
            toDeleteSet.add(row.id);
            matchingClientKeys.add(key);
          }
        }
      }

      // Second pass: include any PAYMENT rows that reference the matching client keys or whose targetId equals the passed id
      for (const row of rows) {
        let desc = null;
        try { desc = typeof row.description === 'string' ? JSON.parse(row.description) : row.description; } catch (e) { desc = null; }
        if (row.type === 'PAYMENT' && desc && desc.for === 'CLIENT' && desc.targetId) {
          if (matchingClientKeys.has(desc.targetId) || String(desc.targetId) === String(id)) {
            toDeleteSet.add(row.id);
          }
        }
      }

      const toDelete = Array.from(toDeleteSet);

      if (toDelete.length === 0) {
        console.warn('Finance DELETE client: no matching records found', { id, rowsChecked: rows.length });
        return failure(res, 'No matching records found', 404);
      }

      // Perform deletion transactionally
      db.run('BEGIN TRANSACTION');
      const del = db.prepare('DELETE FROM finance WHERE id = ?');
      toDelete.forEach(tid => del.run([tid]));
      del.free();
      db.run('COMMIT');
      persistDB();

      // Try to fetch actor email for audit info
      let actorEmail = null;
      try {
        const s = db.prepare('SELECT email FROM users WHERE id = ?');
        s.bind([Number(req.user.id)]);
        if (s.step()) {
          const r = s.getAsObject();
          actorEmail = r.email || null;
        }
        s.free();
      } catch (e) {
        // ignore
      }

      // Append a simple audit entry to server/deletes.log for traceability
      try {
        const auditEntry = { ts: new Date().toISOString(), actorId: req.user.id, actorRole: req.user.role, actorEmail, target: id, deletedCount: toDelete.length, deletedIds: toDelete };
        const auditPath = path.join(__dirname || '.', 'deletes.log');
        try { fs.appendFileSync(auditPath, JSON.stringify(auditEntry) + '\n'); } catch (e) { console.warn('Failed to write audit log', e && e.message); }
      } catch (e) {
        console.warn('Audit logging failed', e && e.message);
      }

      return success(res, { deleted: toDelete.length, actor: { id: req.user.id, role: req.user.role, email: actorEmail }, deletedIds: toDelete }, 'Deleted');
    } catch (e) {
      try { db.run('ROLLBACK'); } catch (er) { }
      console.error('Finance DELETE client error', e && (e.stack || e.message || e));
      return failure(res, 'Internal server error', 500);
    }
  } catch (err) {
    console.error('Finance DELETE client unexpected error', err && (err.stack || err.message || err));
    return failure(res, 'Internal server error', 500);
  }
});

// Notifications
app.post('/api/notifications', requireAuth, (req, res) => {
  try {
    const { userId, message, meta } = req.body || {};
    if (!userId || !message) return failure(res, 'Missing fields', 400);
    try {
      db.run('BEGIN TRANSACTION');
      const id = genId('N-');
      const createdAt = new Date().toISOString();

      // Dedupe: avoid inserting duplicate notifications (same userId + message within 5 seconds)
      try {
        const lastStmt = db.prepare('SELECT id, createdAt FROM notifications WHERE userId = ? AND message = ? ORDER BY createdAt DESC LIMIT 1');
        lastStmt.bind([userId, message]);
        if (lastStmt.step()) {
          const last = lastStmt.getAsObject();
          lastStmt.free();
          if (last && last.createdAt) {
            const lastTime = new Date(last.createdAt).getTime();
            if ((new Date().getTime() - lastTime) < 5000) {
              console.log('Notifications POST: duplicate notification suppressed', { userId, message });
              try { db.run('ROLLBACK'); } catch (er) { }
              return success(res, { id: last.id }, 'Duplicate suppressed', 200);
            }
          }
        } else {
          lastStmt.free();
        }
      } catch (ie) {
        // If the check fails, proceed to insert as normal
        try { lastStmt && lastStmt.free && lastStmt.free(); } catch (_) { }
      }

      // Try full insert; fallback if schema lacks isRead/meta
      try {
        const insert = db.prepare('INSERT INTO notifications (id, userId, message, meta, isRead, createdAt) VALUES (?,?,?,?,?,?)');
        insert.run([id, userId, message, meta ? JSON.stringify(meta) : null, 0, createdAt]);
        insert.free();
      } catch (ie) {
        const insert = db.prepare('INSERT INTO notifications (id, userId, message, createdAt) VALUES (?,?,?,?)');
        insert.run([id, userId, message, createdAt]);
        insert.free();
      }
      db.run('COMMIT');
      if (!persistDB()) console.warn('Notifications POST: commit succeeded but failed to persist DB file');
      else console.log('Notifications POST: notification persisted to DB file');
      return success(res, { id }, 'Created', 201);
    } catch (e) { try { db.run('ROLLBACK'); } catch (er) { } throw e; }
  } catch (err) { console.error('Notifications POST error', err && (err.stack || err.message || err)); return failure(res, 'Internal server error', 500); }
});

app.get('/api/notifications/:userId', requireAuth, (req, res) => {
  try {
    const userId = req.params.userId;
    if (!req.user) return failure(res, 'Unauthorized', 401);
    if (req.user.role !== 'ADMIN' && req.user.employeeId !== userId) return failure(res, 'Forbidden', 403);

    // Attempt to select full row; fallback to simpler select if columns missing
    let stmt;
    try {
      // Return notifications for the requested user *and* global/admin broadcasts
      stmt = db.prepare("SELECT id, userId, message, meta, isRead, createdAt FROM notifications WHERE (userId = ? OR userId = 'ALL' OR userId = 'ADMIN') ORDER BY createdAt DESC");
      stmt.bind([userId]);
    } catch (e) {
      stmt = db.prepare("SELECT id, userId, message, createdAt FROM notifications WHERE (userId = ? OR userId = 'ALL' OR userId = 'ADMIN') ORDER BY createdAt DESC");
      stmt.bind([userId]);
    }

    const out = [];
    while (stmt.step()) {
      const r = stmt.getAsObject();
      try { r.meta = r.meta ? (typeof r.meta === 'string' ? JSON.parse(r.meta) : r.meta) : undefined; } catch (e) { r.meta = undefined; }
      // Normalize isRead presence
      if (r.isRead === undefined) r.isRead = 0;
      out.push(r);
    }
    stmt.free();
    return success(res, out || []);
  } catch (err) { console.error('Notifications GET error', err && (err.stack || err.message || err)); return failure(res, 'Internal server error', 500); }
});

// Mark a notification as read
app.put('/api/notifications/:id/read', requireAuth, (req, res) => {
  try {
    const id = req.params.id;
    try {
      db.run('BEGIN TRANSACTION');
      const upd = db.prepare('UPDATE notifications SET isRead = 1 WHERE id = ?');
      upd.run([id]); upd.free && upd.free();
      db.run('COMMIT');
      if (!persistDB()) console.warn('Notifications PUT read: commit succeeded but failed to persist DB file');
      else console.log('Notifications PUT read: marked read and persisted');
      return success(res, null, 'Marked read');
    } catch (e) {
      try { db.run('ROLLBACK'); } catch (er) { }
      console.error('Notifications PUT read transactional error', e && (e.stack || e.message || e));
      return failure(res, 'Internal server error', 500);
    }
  } catch (err) { console.error('Notifications mark-read error', err && (err.stack || err.message || err)); return failure(res, 'Internal server error', 500); }
});

// Delete a notification
app.delete('/api/notifications/:id', requireAuth, (req, res) => {
  try {
    const id = req.params.id;
    try {
      db.run('BEGIN TRANSACTION');
      const del = db.prepare('DELETE FROM notifications WHERE id = ?');
      del.run([id]); del.free && del.free();
      db.run('COMMIT');
      if (!persistDB()) console.warn('Notifications DELETE: commit succeeded but failed to persist DB file');
      else console.log('Notifications DELETE: deleted and persisted');
      return success(res, null, 'Deleted');
    } catch (e) {
      try { db.run('ROLLBACK'); } catch (er) { }
      console.error('Notifications DELETE transactional error', e && (e.stack || e.message || e));
      return failure(res, 'Internal server error while deleting notification', 500);
    }
  } catch (err) { console.error('Notifications DELETE error', { path: req.path, err: err && (err.stack || err.message || err) }); return failure(res, 'Internal server error', 500); }
});

// Mark all notifications as read for a user
app.put('/api/notifications/read-all/:userId', requireAuth, (req, res) => {
  try {
    const userId = req.params.userId;
    if (!req.user) return failure(res, 'Unauthorized', 401);
    if (req.user.role !== 'ADMIN' && req.user.employeeId !== userId) return failure(res, 'Forbidden', 403);

    try {
      db.run('BEGIN TRANSACTION');
      let upd;
      if (req.user.role === 'ADMIN') {
        // Admin marking their own notifications read
        upd = db.prepare("UPDATE notifications SET isRead = 1 WHERE isRead = 0 AND (userId = 'ADMIN' OR userId = 'ALL' OR userId = ?)");
        upd.run([userId]);
      } else {
        upd = db.prepare("UPDATE notifications SET isRead = 1 WHERE isRead = 0 AND (userId = ? OR userId = 'ALL')");
        upd.run([userId]);
      }
      upd.free && upd.free();
      db.run('COMMIT');
      if (!persistDB()) console.warn('Notifications PUT read-all: failed to persist DB file');
      else console.log('Notifications PUT read-all: marked all read and persisted');
      return success(res, null, 'All marked read');
    } catch (e) {
      try { db.run('ROLLBACK'); } catch (er) { }
      console.error('Notifications PUT read-all transactional error', e && (e.stack || e.message || e));
      return failure(res, 'Internal server error', 500);
    }
  } catch (err) { console.error('Notifications read-all error', err && (err.stack || err.message || err)); return failure(res, 'Internal server error', 500); }
});

// Projects
app.post('/api/projects', requireAuth, (req, res) => {
  try {
    const { name, address, status, data } = req.body || {};
    if (!name) return failure(res, 'Missing name', 400);
    try {
      db.run('BEGIN TRANSACTION');
      const id = genId('P-');
      const createdAt = new Date().toISOString();
      const insert = db.prepare('INSERT INTO projects (id, name, address, status, data, createdBy, createdAt) VALUES (?,?,?,?,?,?,?)');
      insert.run([id, name, address || null, status || 'ACTIVE', data ? JSON.stringify(data) : null, req.user && (req.user.employeeId || req.user.id) || null, createdAt]);
      insert.free();
      db.run('COMMIT');
      persistDB();
      return success(res, { id }, 'Created', 201);
    } catch (e) { try { db.run('ROLLBACK'); } catch (er) { } throw e; }
  } catch (err) { console.error('Projects POST error', err && (err.stack || err.message || err)); return failure(res, 'Internal server error', 500); }
});

app.get('/api/projects', requireAuth, (req, res) => {
  try {
    const stmt = db.prepare('SELECT id, name, address, status, data, createdBy, createdAt FROM projects ORDER BY createdAt DESC');
    const out = [];
    while (stmt.step()) {
      const r = stmt.getAsObject();
      try { r.data = r.data ? JSON.parse(r.data) : undefined; } catch (e) { r.data = undefined; }
      out.push(r);
    }
    stmt.free();
    return success(res, out || []);
  } catch (err) { console.error('Projects GET error', err && (err.stack || err.message || err)); return failure(res, 'Internal server error', 500); }
});

// Checklists
app.post('/api/checklists', requireAuth, (req, res) => {
  try {
    const { refId, refType, item } = req.body || {};
    if (!refId || !item) return failure(res, 'Missing fields', 400);
    try {
      db.run('BEGIN TRANSACTION');
      const id = genId('CK-');
      const createdAt = new Date().toISOString();
      const insert = db.prepare('INSERT INTO checklists (id, refId, refType, item, done, createdBy, createdAt) VALUES (?,?,?,?,?,?,?)');
      insert.run([id, refId, refType || null, item, 0, req.user && (req.user.employeeId || req.user.id) || null, createdAt]);
      insert.free();
      db.run('COMMIT');
      persistDB();
      cacheInvalidate('checklists');
      return success(res, { id }, 'Created', 201);
    } catch (e) { try { db.run('ROLLBACK'); } catch (er) { } throw e; }
  } catch (err) { console.error('Checklists POST error', err && (err.stack || err.message || err)); return failure(res, 'Internal server error', 500); }
});

app.post('/api/checklists/bulk', requireAuth, (req, res) => {
  try {
    const { items } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) return failure(res, 'Missing items array', 400);
    try {
      db.run('BEGIN TRANSACTION');
      const insert = db.prepare('INSERT INTO checklists (id, refId, refType, item, done, createdBy, createdAt) VALUES (?,?,?,?,?,?,?)');
      const createdBy = req.user && (req.user.employeeId || req.user.id) || null;
      const createdAt = new Date().toISOString();
      for (const it of items) {
        const id = genId('CK-');
        insert.run([id, it.refId, it.refType || null, it.item, 0, createdBy, createdAt]);
      }
      insert.free();
      db.run('COMMIT');
      persistDB();
      cacheInvalidate('checklists');
      return success(res, { count: items.length }, 'Bulk created', 201);
    } catch (e) { try { db.run('ROLLBACK'); } catch (er) { } throw e; }
  } catch (err) { console.error('Checklists bulk POST error', err && (err.stack || err.message || err)); return failure(res, 'Internal server error', 500); }
});

// Batch fetch all checklist instances (avoids N+1 per-template requests from dashboard)
app.get('/api/checklists-instances/all', requireAuth, (req, res) => {
  try {
    const cacheKey = 'checklists:all';
    const hit = cacheGet(cacheKey);
    if (hit) return success(res, hit);

    const stmt = db.prepare('SELECT id, refId, refType, item, done, createdBy, createdAt FROM checklists ORDER BY refId, createdAt ASC');
    const grouped = {};
    while (stmt.step()) {
      const row = stmt.getAsObject();
      const ref = String(row.refId);
      if (!grouped[ref]) grouped[ref] = [];
      grouped[ref].push(row);
    }
    stmt.free();
    cacheSet(cacheKey, grouped, 15000);
    cacheInvalidate('checklists:ref:');
    return success(res, grouped);
  } catch (err) {
    console.error('Checklists all GET error', err && (err.stack || err.message || err));
    return failure(res, 'Internal server error', 500);
  }
});

app.get('/api/checklists/:refId', requireAuth, (req, res) => {
  try {
    const refId = req.params.refId;
    const cacheKey = `checklists:ref:${refId}`;
    const hit = cacheGet(cacheKey);
    if (hit) return success(res, hit);
    const stmt = db.prepare('SELECT id, refId, refType, item, done, createdBy, createdAt FROM checklists WHERE refId = ? ORDER BY createdAt ASC');
    stmt.bind([refId]);
    const out = [];
    while (stmt.step()) out.push(stmt.getAsObject());
    stmt.free();
    const outArr = out || [];
    cacheSet(cacheKey, outArr, 15000);
    return success(res, outArr);
  } catch (err) { console.error('Checklists GET error', err && (err.stack || err.message || err)); return failure(res, 'Internal server error', 500); }
});

// PUT /api/checklists/:id - update a checklist item (mark done/undone, update item)
app.put('/api/checklists/:id', requireAuth, (req, res) => {
  try {
    const id = req.params.id;
    const { item, done } = req.body || {};

    // Check if checklist item exists
    const check = db.prepare('SELECT id FROM checklists WHERE id = ?');
    check.bind([id]);
    if (!check.step()) { check.free(); return failure(res, 'Checklist item not found', 404); }
    check.free();

    try {
      db.run('BEGIN TRANSACTION');
      const updates = [];
      const values = [];
      if (item) { updates.push('item = ?'); values.push(item); }
      if (done !== undefined && done !== null) { updates.push('done = ?'); values.push(done ? 1 : 0); }
      values.push(id);

      if (updates.length > 0) {
        const query = `UPDATE checklists SET ${updates.join(', ')} WHERE id = ?`;
        const stmt = db.prepare(query);
        stmt.run(values);
        stmt.free();
      }
      db.run('COMMIT');
      persistDB();
      cacheInvalidate('checklists');
      return success(res, { id, message: 'Checklist item updated' });
    } catch (e) {
      try { db.run('ROLLBACK'); } catch (er) { }
      throw e;
    }
  } catch (err) { console.error('Checklists PUT error', err && (err.stack || err.message || err)); return failure(res, 'Internal server error', 500); }
});

// DELETE /api/checklists/:id - delete a checklist item
app.delete('/api/checklists/:id', requireAuth, (req, res) => {
  try {
    const id = req.params.id;

    try {
      db.run('BEGIN TRANSACTION');
      const del = db.prepare('DELETE FROM checklists WHERE id = ?');
      del.run([id]);
      del.free();
      db.run('COMMIT');
      persistDB();
      cacheInvalidate('checklists');
      return success(res, { message: 'Checklist item deleted' });
    } catch (e) {
      try { db.run('ROLLBACK'); } catch (er) { }
      throw e;
    }
  } catch (err) { console.error('Checklists DELETE error', err && (err.stack || err.message || err)); return failure(res, 'Internal server error', 500); }
});
console.log('Registered API routes: /api/checklists (POST/GET/PUT/DELETE)');

// Checklist templates endpoints
app.post('/api/checklist-templates', requireAuth, (req, res) => {
  try {
    const { id, taskName, doerId, department, startDate, config, active } = req.body || {};
    if (!taskName || !doerId || !startDate) return failure(res, 'Missing fields', 400);
    try {
      db.run('BEGIN TRANSACTION');
      let tplId = id;
      if (!tplId) {
        let nextNum = 1;
        try {
          const q = db.prepare("SELECT MAX(CAST(SUBSTR(id, 5) AS INTEGER)) as maxNum FROM checklist_templates WHERE id LIKE 'KCT-%'");
          if (q.step()) { const d = q.getAsObject(); if (d.maxNum) nextNum = d.maxNum + 1; }
          q.free();
        } catch(e) {}
        tplId = 'KCT-' + String(nextNum).padStart(2, '0');
      }
      const createdAt = new Date().toISOString();
      const data = JSON.stringify({ taskName, doerId, department, startDate, config, active });
      const insert = db.prepare('INSERT INTO checklist_templates (id, data, createdBy, createdAt) VALUES (?,?,?,?)');
      insert.run([tplId, data, req.user && (req.user.employeeId || req.user.id) || null, createdAt]);
      insert.free();
      db.run('COMMIT');
      persistDB();
      return success(res, { id: tplId }, 'Created', 201);
    } catch (e) { try { db.run('ROLLBACK'); } catch (er) { } throw e; }
  } catch (err) { console.error('Checklist templates POST error', err && (err.stack || err.message || err)); return failure(res, 'Internal server error', 500); }
});

app.get('/api/checklist-templates', requireAuth, withCache('checklist-templates', 15000), (req, res) => {
  try {
    const stmt = db.prepare('SELECT id, data, createdBy, createdAt FROM checklist_templates ORDER BY createdAt DESC');
    const out = [];
    while (stmt.step()) { const r = stmt.getAsObject(); try { r.data = JSON.parse(r.data); } catch (e) { r.data = undefined; } out.push(r); }
    stmt.free();
    return success(res, out || []);
  } catch (err) { console.error('Checklist templates GET error', err && (err.stack || err.message || err)); return failure(res, 'Internal server error', 500); }
});

// PUT /api/checklist-templates/:id - update a checklist template
app.put('/api/checklist-templates/:id', requireAuth, (req, res) => {
  try {
    const id = req.params.id;
    const { taskName, doerId, department, startDate, config, active, transferEffectiveDate } = req.body || {};

    // Check if template exists
    const check = db.prepare('SELECT id, data FROM checklist_templates WHERE id = ?');
    check.bind([id]);
    if (!check.step()) { check.free(); return failure(res, 'Template not found', 404); }
    const oldTpl = check.getAsObject();
    check.free();

    let oldData = {};
    try { oldData = JSON.parse(oldTpl.data); } catch (e) {}
    const oldDoerId = oldData.doerId;

    try {
      db.run('BEGIN TRANSACTION');
      const data = JSON.stringify({ taskName, doerId, department, startDate, config, active });
      const update = db.prepare('UPDATE checklist_templates SET data = ? WHERE id = ?');
      update.run([data, id]);
      update.free();

      // If doerId changed and transferEffectiveDate is provided, update future pending instances
      if (doerId && oldDoerId && doerId !== oldDoerId && transferEffectiveDate) {
        // Find all checklists items referencing this template (refId = id)
        const getItems = db.prepare('SELECT id, item, done FROM checklists WHERE refId = ?');
        getItems.bind([id]);
        const itemsToUpdate = [];
        while (getItems.step()) {
          const row = getItems.getAsObject();
          try {
            const parsed = JSON.parse(row.item);
            // Update if it is PENDING and date is >= transferEffectiveDate
            if (!row.done && parsed.status === 'PENDING' && parsed.date >= transferEffectiveDate) {
              parsed.doerId = doerId;
              parsed.department = department || parsed.department;
              itemsToUpdate.push({ id: row.id, item: JSON.stringify(parsed) });
            } else {
              // Ensure older or completed/stopped instances lock in their original doerId explicitly in JSON
              if (!parsed.doerId) {
                parsed.doerId = oldDoerId;
                parsed.department = oldData.department || parsed.department;
                itemsToUpdate.push({ id: row.id, item: JSON.stringify(parsed) });
              }
            }
          } catch (e) {}
        }
        getItems.free();

        // Perform the updates
        const updItem = db.prepare('UPDATE checklists SET item = ? WHERE id = ?');
        for (const item of itemsToUpdate) {
          updItem.run([item.item, item.id]);
        }
        updItem.free();
        console.log(`[Transfer Task] Updated ${itemsToUpdate.length} checklist items to new doer ${doerId} from date ${transferEffectiveDate}`);
      }

      db.run('COMMIT');
      persistDB();
      cacheInvalidate('checklists');
      return success(res, { id, message: 'Template updated' });
    } catch (e) {
      try { db.run('ROLLBACK'); } catch (er) { }
      throw e;
    }
  } catch (err) { console.error('Checklist templates PUT error', err && (err.stack || err.message || err)); return failure(res, 'Internal server error', 500); }
});

// DELETE /api/checklist-templates/:id - delete a checklist template and all its instances
app.delete('/api/checklist-templates/:id', requireAuth, (req, res) => {
  try {
    console.log('DELETE checklist-template endpoint called', { id: req.params.id });
    const id = req.params.id;

    // Delete all checklist items that reference this template first
    const delItems = db.prepare('DELETE FROM checklists WHERE refId = ?');
    delItems.run([id]);
    delItems.free();

    // Delete the template itself
    const delTemplate = db.prepare('DELETE FROM checklist_templates WHERE id = ?');
    delTemplate.run([id]);
    delTemplate.free();

    // Persist to DB file
    try { persistDB(); } catch (e) { console.warn('DB persist failed', e); }

    console.log('DELETE checklist-template succeeded', { id });
    return success(res, { message: 'Template deleted successfully', id });
  } catch (err) {
    console.error('DELETE checklist-template failed', { id: req.params.id, err: err && (err.stack || err.message || err) });
    return failure(res, 'Failed to delete template: ' + (err && err.message || err), 500);
  }
});
console.log('Registered API routes: /api/checklist-templates (POST/GET/PUT/DELETE)');

// O2D
app.post('/api/o2d', requireAuth, (req, res) => {
  try {
    const { data, status } = req.body || {};
    if (!data) return failure(res, 'Missing data', 400);
    try {
      db.run('BEGIN TRANSACTION');
      const id = genId('O2D-');
      const createdAt = new Date().toISOString();
      const insert = db.prepare('INSERT INTO o2d (id, data, status, createdBy, createdAt) VALUES (?,?,?,?,?)');
      insert.run([id, JSON.stringify(data), status || 'NEW', req.user && (req.user.employeeId || req.user.id) || null, createdAt]);
      insert.free();
      db.run('COMMIT');
      persistDB();
      return success(res, { id }, 'Created', 201);
    } catch (e) { try { db.run('ROLLBACK'); } catch (er) { } throw e; }
  } catch (err) { console.error('O2D POST error', err && (err.stack || err.message || err)); return failure(res, 'Internal server error', 500); }
});

app.get('/api/o2d', requireAuth, withCache('o2d', 15000), (req, res) => {
  try {
    const stmt = db.prepare('SELECT id, data, status, createdBy, createdAt FROM o2d ORDER BY createdAt DESC');
    const out = [];
    while (stmt.step()) { const r = stmt.getAsObject(); try { r.data = JSON.parse(r.data); } catch (e) { r.data = undefined; } out.push(r); }
    stmt.free();
    return success(res, out || []);
  } catch (err) { console.error('O2D GET error', err && (err.stack || err.message || err)); return failure(res, 'Internal server error', 500); }
});

// DELETE /api/o2d/:id - delete an order (admin or owner can delete; owners cannot delete COMPLETED orders)
function handleDeleteO2d(req, res) {
  try {
    console.log('API: DELETE O2D handler invoked', { path: req.path, url: req.originalUrl, user: req.user && req.user.id });
    if (!req.user) { console.warn('O2D DELETE: no user', { path: req.path }); return failure(res, 'Unauthorized', 401); }
    let id = req.params.id;
    try { id = decodeURIComponent(id); } catch (e) { /* ignore */ }

    console.log('O2D DELETE: requested id', { id });

    let s = db.prepare('SELECT id, status, createdBy FROM o2d WHERE id = ?');
    s.bind([id]);
    if (!s.step()) {
      s.free();
      console.warn('O2D DELETE: id not found, attempting to match by nested data.id', { id });
      // Try find by nested data.id (some entries store the order id inside data JSON)
      try {
        const p = db.prepare('SELECT id, data, status, createdBy FROM o2d');
        let matched = null;
        while (p.step()) {
          const row = p.getAsObject();
          try {
            const d = JSON.parse(row.data || '{}');
            if (d && (d.id === id || String(d.id) === String(id))) { matched = row; break; }
            // Also try matching on legacy fields like orderId or refId
            if (d && (d.orderId === id || d.refId === id)) { matched = row; break; }
          } catch (e) { /* ignore parse errors */ }
        }
        p.free();
        if (matched) {
          console.log('O2D DELETE: matched by nested data.id', { matchedId: matched.id, originalRequested: id });
          id = matched.id; // replace id with actual DB id and continue
        } else {
          console.warn('O2D DELETE: not found even after nested match', { id });
          return failure(res, 'Not found', 404);
        }
      } catch (e) {
        console.error('O2D DELETE: nested match failed', e && (e.stack || e.message || e));
        return failure(res, 'Not found', 404);
      }
    } else {
      const r = s.getAsObject(); s.free();
      // keep going with found record
    }

    // Now fetch record by resolved id to check permissions
    const s2 = db.prepare('SELECT id, status, createdBy FROM o2d WHERE id = ?');
    s2.bind([id]);
    if (!s2.step()) { s2.free(); console.warn('O2D DELETE: resolved id not found', { id }); return failure(res, 'Not found', 404); }
    const rec = s2.getAsObject(); s2.free();
    const creator = rec.createdBy;
    const status = rec.status;
    const isAdmin = req.user.role === 'ADMIN';
    const isOwner = (req.user.employeeId && req.user.employeeId === creator) || String(req.user.id) === String(creator);
    console.log('O2D DELETE check', { id, creator, status, isAdmin, isOwner, reqUser: req.user });
    if (!isAdmin && !isOwner) { console.warn('O2D DELETE: forbidden', { id, creator, reqUser: req.user }); return failure(res, 'Forbidden', 403); }
    if (!isAdmin && status === 'COMPLETED') { console.warn('O2D DELETE: completed protected', { id, status, reqUser: req.user }); return failure(res, 'Cannot delete completed order', 403); }

    try {
      db.run('BEGIN TRANSACTION');
      const del = db.prepare('DELETE FROM o2d WHERE id = ?');
      del.run([id]); del.free();
      db.run('COMMIT');
      console.log('O2D DELETE success', { id, deletedBy: req.user && (req.user.employeeId || req.user.id) });
      try { persistDB(); } catch (e) { console.warn('Warning: failed to persist DB after o2d delete', e && (e.message || e)); }
      return success(res, null, 'Deleted');
    } catch (e) {
      try { db.run('ROLLBACK'); } catch (er) { }
      console.error('O2D DELETE failed', e && (e.stack || e.message || e));
      return failure(res, 'Failed to delete', 500);
    }
  } catch (err) { console.error('O2D DELETE error', err && (err.stack || err.message || err)); return failure(res, 'Internal server error', 500); }
}

// Register both variants to support hosting mounts that strip or keep the /api prefix
app.delete('/api/o2d/:id', requireAuth, handleDeleteO2d);
app.delete('/o2d/:id', requireAuth, handleDeleteO2d);

// POST /api/sitephotos - upload a site photo (JSON with base64 or multipart/form-data)
app.post('/api/sitephotos', requireAuth, (req, res) => {
  try {
    console.log('API: POST /api/sitephotos', { path: req.path, user: req.user && req.user.id, hasImageData: !!req.body?.imageData });
    if (!req.user) return failure(res, 'Unauthorized', 401);

    const projectId = req.body?.projectId || null; // Make projectId optional
    const imageData = req.body?.imageData || null; // Base64 image data from JSON

    if (!imageData) return failure(res, 'Missing imageData', 400);

    // Check project exists and not closed if projectId provided
    if (projectId) {
      try {
        const stmt = db.prepare('SELECT id, status FROM projects WHERE id = ?');
        stmt.bind([projectId]);
        if (!stmt.step()) { stmt.free(); return failure(res, 'Project not found', 404); }
        const proj = stmt.getAsObject(); stmt.free();
        if (proj.status && String(proj.status).toUpperCase() === 'CLOSED') return failure(res, 'Project is closed', 403);
      } catch (e) { console.error('Project lookup failed', e && (e.stack || e.message || e)); }
    }

    const id = genId('IMG-');
    const uploadedBy = req.user.employeeId || String(req.user.id || 'UNKNOWN');
    const gps = req.body?.gps || null;
    const date = new Date().toISOString().split('T')[0];
    const timestamp = new Date().toISOString();

    // Store base64 directly as imageUrl
    const imageUrl = imageData;
    const filename = 'base64-' + id;
    const filepath = 'base64';

    try {
      db.run('BEGIN TRANSACTION');
      const insert = db.prepare('INSERT INTO site_photos (id, projectId, uploadedBy, filename, filepath, imageUrl, gps, date, timestamp, createdAt) VALUES (?,?,?,?,?,?,?,?,?,?)');
      insert.run([id, projectId, uploadedBy, filename, filepath, imageUrl, gps ? JSON.stringify(gps) : null, date, timestamp, timestamp]);
      insert.free();
      db.run('COMMIT');
      try { persistDB(); } catch (e) { console.warn('Warning: failed to persist DB after site photo insert', e && (e.message || e)); }
      return success(res, { id, projectId, imageUrl, filename, uploadedBy, date, timestamp });
    } catch (e) {
      try { db.run('ROLLBACK'); } catch (er) { }
      console.error('Site photo insert failed', e && (e.stack || e.message || e));
      return failure(res, 'Failed to persist site photo', 500);
    }
  } catch (err) { console.error('Sitephotos POST error', err && (err.stack || err.message || err)); return failure(res, 'Internal server error', 500); }
});

// GET /api/sitephotos - list site photos (optional projectId filter)
app.get('/api/sitephotos', requireAuth, (req, res) => {
  try {
    const projectId = req.query.projectId;
    let stmt;
    if (projectId) {
      stmt = db.prepare('SELECT id, projectId, uploadedBy, filename, filepath, imageUrl, gps, date, timestamp FROM site_photos WHERE projectId = ? ORDER BY createdAt DESC');
      stmt.bind([projectId]);
    } else {
      stmt = db.prepare('SELECT id, projectId, uploadedBy, filename, filepath, imageUrl, gps, date, timestamp FROM site_photos ORDER BY createdAt DESC');
    }
    const out = [];
    while (stmt.step()) {
      const r = stmt.getAsObject();
      try { r.gps = r.gps ? (typeof r.gps === 'string' ? JSON.parse(r.gps) : r.gps) : undefined; } catch (e) { r.gps = undefined; }
      out.push(r);
    }
    stmt.free();
    return success(res, out);
  } catch (err) { console.error('Sitephotos GET error', err && (err.stack || err.message || err)); return failure(res, 'Internal server error', 500); }
});
console.log('Registered API routes: /api/sitephotos (POST/GET)');

// --- Leaves API (CRUD) ---
// GET /api/leaves - list all leaves for user or admin view
app.get('/api/leaves', requireAuth, (req, res) => {
  try {
    const loggedInUserId = req.user.id;
    const type = req.query.type; // 'my' for employee, 'approvals' for manager/approver, undefined for admin

    console.log('DEBUG: GET /api/leaves', { loggedInUserId, userRole: req.user.role, type, query: req.query });

    // Enhanced JOIN strategy to resolve names and canonical IDs from multiple sources
    // Provides resolvedEmployeeId which is the string ID used for lookups in the frontend employees list
    const columns = `
      l.id, l.userId, l.appliedBy, l.appliedTo, 
      coalesce(e1.name, e2.name, u1.name, l.appliedByName, 'Employee ' || l.appliedBy) as appliedByName, 
      coalesce(e3.name, e4.name, u2.name, l.appliedToName) as appliedToName, 
      coalesce(e1.department, e2.department, l.department, 'Staff') as department,
      coalesce(u1.employeeId, e1.id, l.appliedBy) as resolvedEmployeeId,
      l.startDate, l.endDate, l.days, l.status, l.reason, 
      l.leaveType, l.subject, l.appliedOn, l.durationType, l.createdAt
    `;
    const baseQuery = `
      SELECT ${columns}
      FROM leaves l
      -- Resolve applicant info
      LEFT JOIN employees e1 ON CAST(e1.id AS TEXT) = CAST(l.appliedBy AS TEXT)
      LEFT JOIN users u1 ON CAST(u1.id AS TEXT) = CAST(l.appliedBy AS TEXT)
      LEFT JOIN employees e2 ON CAST(e2.id AS TEXT) = CAST(u1.employeeId AS TEXT)
      
      -- Resolve approver info
      LEFT JOIN employees e3 ON CAST(e3.id AS TEXT) = CAST(l.appliedTo AS TEXT)
      LEFT JOIN users u2 ON CAST(u2.id AS TEXT) = CAST(l.appliedTo AS TEXT)
      LEFT JOIN employees e4 ON CAST(e4.id AS TEXT) = CAST(u2.employeeId AS TEXT)
    `;

    // Role-based filtering
    if (req.user.role === 'ADMIN') {
      console.log('DEBUG: Admin view - fetching all leaves');
      stmt = db.prepare(`${baseQuery} ORDER BY l.appliedOn DESC LIMIT 500`);
    } else if (type === 'my') {
      const usersEmpId = req.user.employeeId || 'NON_EXISTENT_EMP_ID';
      console.log('DEBUG: Employee view - fetching own leaves where appliedBy =', loggedInUserId, 'or empId =', usersEmpId);
      stmt = db.prepare(`${baseQuery} WHERE l.appliedBy = ? OR l.userId = ? OR l.appliedBy = ? ORDER BY l.appliedOn DESC LIMIT 500`);
      params = [loggedInUserId, loggedInUserId, usersEmpId];
    } else if (type === 'approvals') {
      const usersEmpId = req.user.employeeId || 'NON_EXISTENT_EMP_ID';
      console.log('DEBUG: Manager view - fetching leaves where appliedTo =', loggedInUserId, 'or', usersEmpId);
      stmt = db.prepare(`${baseQuery} WHERE l.appliedTo = ? OR l.appliedTo = ? ORDER BY l.appliedOn DESC LIMIT 500`);
      params = [loggedInUserId, usersEmpId];
    } else {
      console.log('DEBUG: Default view - fetching own leaves where appliedBy =', loggedInUserId);
      stmt = db.prepare(`${baseQuery} WHERE l.appliedBy = ? OR l.userId = ? ORDER BY l.appliedOn DESC LIMIT 500`);
      params = [loggedInUserId, loggedInUserId];
    }

    if (params.length > 0) stmt.bind(params);

    const out = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      // Ensure frontend compatibility
      row.employeeId = row.resolvedEmployeeId || row.appliedBy || row.userId;
      out.push(row);
    }
    stmt.free();

    console.log('DEBUG: Returning leaves count:', out.length);
    return success(res, out);
  } catch (err) {
    console.error('Leaves GET error', err && (err.stack || err.message || err));
    return failure(res, 'Internal server error', 500);
  }
});

// POST /api/leaves - create a new leave application
app.post('/api/leaves', requireAuth, (req, res) => {
  try {
    const appliedBy = req.user.id; // The logged-in user (employee)
    const { startDate, endDate, reason, leaveType, subject, appliedTo, durationType } = req.body;

    console.log('DEBUG: POST /leaves payload', { appliedBy, appliedTo, startDate, endDate, leaveType, subject, durationType });

    if (!startDate || !endDate || !reason || !appliedTo) {
      return failure(res, 'Missing required fields (startDate, endDate, reason, appliedTo)', 400);
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (end < start) return failure(res, 'End date must be after start date', 400);

    // Calculate days (inclusive)
    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    // Get applied by user details (lookup using employeeId string if available)
    const empIdToLookup = req.user.employeeId || req.user.id;
    const appliedByStmt = db.prepare('SELECT id, name, department FROM employees WHERE id = ?');
    appliedByStmt.bind([String(empIdToLookup)]);
    let appliedByName = '', appliedByDept = '';
    if (appliedByStmt.step()) {
      const empData = appliedByStmt.getAsObject();
      appliedByName = empData.name || '';
      appliedByDept = empData.department || '';
    }
    appliedByStmt.free();

    // Get applied to user name
    let appliedToName = '';
    if (appliedTo !== 'ADMIN') {
      const appliedToStmt = db.prepare('SELECT name FROM employees WHERE id = ?');
      appliedToStmt.bind([appliedTo]);
      if (appliedToStmt.step()) {
        const empData = appliedToStmt.getAsObject();
        appliedToName = empData.name || '';
      }
      appliedToStmt.free();
    } else {
      appliedToName = 'Administrator';
    }

    const id = genId('LEAVE-');
    const timestamp = new Date().toISOString();

    console.log('DEBUG: Saving leave', { id, appliedBy, appliedTo, appliedByName, appliedToName, appliedByDept });

    try {
      db.run('BEGIN TRANSACTION');
      const appliedByIdentifier = req.user.employeeId || req.user.id;
      const insert = db.prepare('INSERT INTO leaves (id, userId, appliedBy, appliedTo, appliedByName, appliedToName, department, startDate, endDate, days, status, reason, leaveType, subject, appliedOn, durationType, createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
      insert.run([
        id,
        appliedBy,  // userId = appliedBy (keep numeric for legacy/reference)
        String(appliedByIdentifier),  // appliedBy = string identifier for easier lookup
        appliedTo,
        appliedByName,
        appliedToName,
        appliedByDept,
        startDate,
        endDate,
        diffDays,
        'PENDING',
        reason,
        leaveType || 'Casual Leave',
        subject || '',
        timestamp,
        durationType || 'Multiple Days',
        timestamp
      ]);
      insert.free();
      db.run('COMMIT');
      try { persistDB(); } catch (e) { console.warn('Warning: failed to persist DB after leave insert', e && (e.message || e)); }

      const responseData = {
        id,
        userId: appliedBy,
        appliedBy,
        appliedTo,
        appliedByName,
        appliedToName,
        department: appliedByDept,
        startDate,
        endDate,
        days: diffDays,
        status: 'PENDING',
        reason,
        leaveType: leaveType || 'Casual Leave',
        subject: subject || '',
        appliedOn: timestamp,
        durationType: durationType || 'Multiple Days',
        createdAt: timestamp
      };

      console.log('DEBUG: Leave saved successfully', responseData);
      return success(res, responseData);
    } catch (e) {
      try { db.run('ROLLBACK'); } catch (er) { }
      console.error('Leave insert failed', e && (e.stack || e.message || e));
      return failure(res, 'Failed to create leave application', 500);
    }
  } catch (err) {
    console.error('Leaves POST error', err && (err.stack || err.message || err));
    return failure(res, 'Internal server error', 500);
  }
});

// PUT /api/leaves/:id - update leave status or details
app.put('/api/leaves/:id', requireAuth, (req, res) => {
  try {
    const id = req.params.id;
    const { status, reason, startDate, endDate } = req.body;
    console.log('DEBUG: PUT /api/leaves/:id', { id, status, userId: req.user.id, role: req.user.role });

    // Check if leave exists and get details for authorization
    const check = db.prepare('SELECT id, appliedTo, appliedBy FROM leaves WHERE id = ?');
    check.bind([id]);
    if (!check.step()) { check.free(); return failure(res, 'Leave not found', 404); }
    const leave = check.getAsObject();
    check.free();

    // Authorization: Only admin, the approver (appliedTo), or the applicant (appliedBy) can update
    const isAdmin = req.user.role === 'ADMIN';
    const isApprover = String(leave.appliedTo) === String(req.user.id) || (req.user.employeeId && String(leave.appliedTo) === String(req.user.employeeId)) || (leave.appliedTo === 'ADMIN' && isAdmin);
    const isApplicant = String(leave.appliedBy) === String(req.user.id) || (req.user.employeeId && String(leave.appliedBy) === String(req.user.employeeId));

    // For status changes, only admin or approver can approve/reject
    if (status && status !== 'PENDING') {
      if (!isAdmin && !isApprover) {
        return failure(res, 'Forbidden: Only approver or admin can approve/reject', 403);
      }
    }

    // For other updates, allow applicant, approver, or admin
    if (!isAdmin && !isApprover && !isApplicant) {
      return failure(res, 'Forbidden: Insufficient permissions', 403);
    }

    try {
      db.run('BEGIN TRANSACTION');
      const updates = [];
      const values = [];
      if (status) { updates.push('status = ?'); values.push(status); }
      if (reason) { updates.push('reason = ?'); values.push(reason); }
      if (startDate && endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        const diffTime = Math.abs(end - start);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
        updates.push('startDate = ?');
        updates.push('endDate = ?');
        updates.push('days = ?');
        values.push(startDate);
        values.push(endDate);
        values.push(diffDays);
      }
      values.push(id);

      if (updates.length > 0) {
        const query = `UPDATE leaves SET ${updates.join(', ')} WHERE id = ?`;
        const stmt = db.prepare(query);
        stmt.run(values);
        stmt.free();
      }
      db.run('COMMIT');
      try { persistDB(); } catch (e) { console.warn('Warning: failed to persist DB after leave update', e && (e.message || e)); }
      console.log('DEBUG: Leave updated successfully:', { id, status });
      return success(res, { id, message: 'Leave updated successfully' });
    } catch (e) {
      try { db.run('ROLLBACK'); } catch (er) { }
      console.error('Leave update failed', e && (e.stack || e.message || e));
      return failure(res, 'Failed to update leave', 500);
    }
  } catch (err) { console.error('Leaves PUT error', err && (err.stack || err.message || err)); return failure(res, 'Internal server error', 500); }
});

// DELETE /api/leaves/:id - delete a leave application
app.delete('/api/leaves/:id', requireAuth, (req, res) => {
  try {
    const id = req.params.id;
    console.log('DEBUG: DELETE /api/leaves/:id', { id, userId: req.user.id, role: req.user.role });

    // Check if leave exists and get details for authorization
    const check = db.prepare('SELECT id, appliedBy, status FROM leaves WHERE id = ?');
    check.bind([id]);
    if (!check.step()) { check.free(); return failure(res, 'Leave not found', 404); }
    const leave = check.getAsObject();
    check.free();

    // Authorization: Only admin can delete any leave, or applicant can delete their own PENDING leave
    const isAdmin = req.user.role === 'ADMIN';
    const isApplicant = leave.appliedBy === req.user.id || leave.appliedBy === req.user.employeeId;
    const isPending = leave.status === 'PENDING';

    if (!isAdmin && !(isApplicant && isPending)) {
      return failure(res, 'Forbidden: Only admin can delete any leave, or applicant can delete pending leave', 403);
    }

    try {
      db.run('BEGIN TRANSACTION');
      const del = db.prepare('DELETE FROM leaves WHERE id = ?');
      del.run([id]);
      del.free();
      db.run('COMMIT');
      try { persistDB(); } catch (e) { console.warn('Warning: failed to persist DB after leave delete', e && (e.message || e)); }
      console.log('DEBUG: Leave deleted successfully:', id);
      return success(res, { message: 'Leave deleted successfully' });
    } catch (e) {
      try { db.run('ROLLBACK'); } catch (er) { }
      console.error('Leave delete failed', e && (e.stack || e.message || e));
      return failure(res, 'Failed to delete leave', 500);
    }
  } catch (err) { console.error('Leaves DELETE error', err && (err.stack || err.message || err)); return failure(res, 'Internal server error', 500); }
});
console.log('Registered API routes: /api/leaves (GET/POST/PUT/DELETE)');

// Upload O2D attachment (for delivery proof) - accepts multipart/form-data 'file' field
app.post('/api/o2d/upload', requireAuth, uploadDocument.single('file'), (req, res) => {
  try {
    console.log('O2D upload request', { path: req.path, user: req.user && req.user.id, contentType: req.headers && req.headers['content-type'] });
    if (!req.user) return failure(res, 'Unauthorized', 401);
    if (!req.file) {
      console.warn('O2D upload: missing file', { contentType: req.headers && req.headers['content-type'], bodyPresent: !!req.body });
      return failure(res, 'Missing file or incorrect Content-Type (expected multipart/form-data with field "file")', 400);
    }
    const filename = path.basename(req.file.path);
    const filepath = path.join('uploads', 'documents', filename);
    const imageUrl = `/uploads/documents/${filename}`;
    console.log('O2D upload saved', { filename, filepath, uploadedBy: req.user && (req.user.employeeId || req.user.id) });
    try { return success(res, { imageUrl, filename }, 'Uploaded', 201); } catch (e) { return success(res, { imageUrl, filename }, 'Uploaded', 201); }
  } catch (err) { console.error('O2D Upload error', err && (err.stack || err.message || err)); return failure(res, 'Internal server error', 500); }
});

// Also support the non-/api path for clients that POST to /o2d/upload
app.post('/o2d/upload', requireAuth, uploadDocument.single('file'), (req, res) => {
  try {
    console.log('O2D upload request (non-api)', { path: req.path, user: req.user && req.user.id, contentType: req.headers && req.headers['content-type'] });
    if (!req.user) return failure(res, 'Unauthorized', 401);
    if (!req.file) {
      console.warn('O2D upload (non-api): missing file', { contentType: req.headers && req.headers['content-type'], bodyPresent: !!req.body });
      return failure(res, 'Missing file or incorrect Content-Type (expected multipart/form-data with field "file")', 400);
    }
    const filename = path.basename(req.file.path);
    const filepath = path.join('uploads', 'documents', filename);
    const imageUrl = `/uploads/documents/${filename}`;
    console.log('O2D upload saved (non-api)', { filename, filepath, uploadedBy: req.user && (req.user.employeeId || req.user.id) });
    return success(res, { imageUrl, filename }, 'Uploaded', 201);
  } catch (err) {
    console.error('O2D Upload error (non-api path)', err && (err.stack || err.message || err));
    return failure(res, 'Internal server error', 500);
  }
});


// Admin-only: close a project (set status = 'CLOSED')
app.put('/api/projects/:id/close', requireAuth, (req, res) => {
  try {
    console.log('API: PUT /api/projects/:id/close', { path: req.path, user: req.user && req.user.id, role: req.user && req.user.role });
    if (!req.user) return failure(res, 'Unauthorized', 401);
    if (req.user.role !== 'ADMIN') return failure(res, 'Forbidden', 403);
    const id = req.params.id;
    try {
      const stmt = db.prepare('SELECT id FROM projects WHERE id = ?');
      stmt.bind([id]);
      if (!stmt.step()) { stmt.free(); return failure(res, 'Project not found', 404); }
      stmt.free();

      db.run('BEGIN TRANSACTION');
      const upd = db.prepare("UPDATE projects SET status = ? WHERE id = ?");
      upd.run(['CLOSED', id]); upd.free && upd.free();
      db.run('COMMIT');
      try { persistDB(); } catch (e) { console.warn('Warning: failed to persist DB after project close', e && (e.message || e)); }
      return success(res, null, 'Project closed');
    } catch (e) {
      try { db.run('ROLLBACK'); } catch (er) { }
      console.error('Project close failed', e && (e.stack || e.message || e));
      return failure(res, 'Failed to close project', 500);
    }
  } catch (err) { console.error('Project close unexpected error', err && (err.stack || err.message || err)); return failure(res, 'Internal server error', 500); }
});
console.log('Registered API route: /api/projects/:id/close (PUT)');

// Update O2D entry
app.put('/api/o2d/:id', requireAuth, (req, res) => {
  try {
    const id = req.params.id;
    const { data, status } = req.body || {};
    if (!data) return failure(res, 'Missing data', 400);
    try {
      db.run('BEGIN TRANSACTION');
      const upd = db.prepare('UPDATE o2d SET data = ?, status = ? WHERE id = ?');
      upd.run([JSON.stringify(data), status || null, id]);
      upd.free();
      db.run('COMMIT');
      try { persistDB(); } catch (e) { console.warn('Warning: failed to persist DB after o2d update', e && (e.stack || e.message || e)); }

      // If this update indicates a delivery proof was uploaded and is awaiting admin review,
      // create a notification for admins so they can review the proof promptly.
      try {
        if (status === 'DELIVERED_AWAITING_ADMIN') {
          const nid = genId('NT-');
          const message = `Delivery proof uploaded for order ${id}`;
          const meta = JSON.stringify({ orderId: id });
          const createdAt = new Date().toISOString();
          const ins = db.prepare('INSERT INTO notifications (id, userId, message, meta, isRead, createdAt) VALUES (?,?,?,?,?,?)');
          ins.run([nid, 'ADMIN', message, meta, 0, createdAt]);
          ins.free && ins.free();
          try { persistDB(); } catch (e) { console.warn('Warning: failed to persist DB after notification insert', e && (e.stack || e.message || e)); }
          console.log('O2D PUT: notification created for admin', { id, nid });
        }
      } catch (e) {
        console.warn('O2D PUT: failed to create admin notification', e && (e.stack || e.message || e));
      }

      return success(res, { id }, 'Updated');
    } catch (e) { try { db.run('ROLLBACK'); } catch (er) { } throw e; }
  } catch (err) { console.error('O2D PUT error', err && (err.stack || err.message || err)); return failure(res, 'Internal server error', 500); }
});

// Chat
// Debug middleware for chat routes to aid diagnosing missing endpoints / 404s
app.use('/api/chat', (req, res, next) => {
  try { console.log('CHAT: incoming', req.method, req.path); } catch (e) { }
  return next();
});

app.post('/api/chat', requireAuth, (req, res) => {
  try {
    const { teamId, message, meta } = req.body || {};
    if (!teamId || !message) return failure(res, 'Missing fields', 400);
    try {
      // Normalize DM team ids: if teamId is a raw employee id (not starting with DM- or G-),
      // convert to canonical DM-<a>-<b> using sorted participant ids so both sides share same team id.
      let savedTeamId = teamId;
      try {
        const isDM = String(teamId).startsWith('DM-');
        const isGroup = String(teamId).startsWith('G-');
        if (!isDM && !isGroup) {
          const a = req.user && (req.user.employeeId || String(req.user.id));
          const b = String(teamId);
          if (a && b) savedTeamId = 'DM-' + [a, b].sort().join('-');
        }
      } catch (e) { /* ignore normalizing errors */ }

      db.run('BEGIN TRANSACTION');
      const id = genId('CH-');
      const createdAt = new Date().toISOString();
      const insert = db.prepare('INSERT INTO chat (id, teamId, senderId, message, meta, createdAt) VALUES (?,?,?,?,?,?)');
      // Ensure message is stored as a string (avoid storing Date objects or other types that may stringify to 'Invalid Date')
      insert.run([id, savedTeamId, req.user && (req.user.employeeId || req.user.id) || null, message != null ? String(message) : null, meta ? JSON.stringify(meta) : null, createdAt]);
      insert.free();
      db.run('COMMIT');
      persistDB();
      console.log('Chat POST: saved message', { id, teamId: savedTeamId, sender: req.user && req.user.employeeId });
      return success(res, { id }, 'Created', 201);
    } catch (e) { try { db.run('ROLLBACK'); } catch (er) { } throw e; }
  } catch (err) { console.error('Chat POST error', err && (err.stack || err.message || err)); return failure(res, 'Internal server error', 500); }
});

app.get('/api/chat/unread_count_fast', requireAuth, (req, res) => {
  try {
    const userId = req.user && (req.user.employeeId || String(req.user.id));
    if (!userId) return success(res, 0);

    // Simple unread count across all chats this user participates in
    let totalUnread = 0;
    try {
      const stmt = db.prepare(`
        SELECT c.teamId, count(*) as unread
        FROM chat c
        LEFT JOIN chat_reads cr ON c.teamId = cr.teamId AND cr.userId = ?
        WHERE (c.teamId LIKE ? OR c.teamId = ?)
          AND c.senderId != ?
          AND (cr.lastReadAt IS NULL OR c.createdAt > cr.lastReadAt)
        GROUP BY c.teamId
      `);
      stmt.bind([userId, '%-' + userId + '-%', userId, userId]);
      while (stmt.step()) {
        const row = stmt.getAsObject();
        totalUnread += row.unread || 0;
      }
      stmt.free();
    } catch (e) {
      console.warn('Chat fast unread count error', e && (e.message || e));
    }
    return success(res, totalUnread);
  } catch (err) {
    return success(res, 0);
  }
});

app.get('/api/chat/unread_summary', requireAuth, (req, res) => {
  try {
    const userId = req.user && (req.user.employeeId || String(req.user.id));
    if (!userId) return success(res, {});

    const counts = {};
    try {
      const stmt = db.prepare(`
        SELECT c.teamId, count(*) as unread
        FROM chat c
        LEFT JOIN chat_reads cr ON c.teamId = cr.teamId AND cr.userId = ?
        WHERE (c.teamId LIKE ? OR c.teamId = ?)
          AND c.senderId != ?
          AND (cr.lastReadAt IS NULL OR c.createdAt > cr.lastReadAt)
        GROUP BY c.teamId
      `);
      stmt.bind([userId, '%-' + userId + '-%', userId, userId]);
      while (stmt.step()) {
        const row = stmt.getAsObject();
        if (row.teamId) {
          counts[row.teamId] = row.unread || 0;
        }
      }
      stmt.free();
    } catch (e) {
      console.warn('Chat fast unread summary error', e && (e.message || e));
    }
    return success(res, counts);
  } catch (err) {
    return success(res, {});
  }
});

app.get('/api/chat/:teamId', requireAuth, (req, res) => {
  // Also support GET /api/chat/employee/:employeeId to fetch all messages where an employee participates
  app.get('/api/chat/employee/:employeeId', requireAuth, (req, res) => {
    try {
      const emp = String(req.params.employeeId);
      const limit = parseInt(req.query.limit) || 500;
      const stmt = db.prepare('SELECT id, teamId, senderId, message, meta, createdAt, updatedAt, is_deleted, is_pinned, edited, replyTo FROM chat WHERE senderId = ? OR receiverId = ? OR teamId LIKE ? OR teamId = ? ORDER BY createdAt DESC LIMIT ?');
      stmt.bind([emp, emp, '%-' + emp + '-%', emp, limit]);
      const out = [];
      while (stmt.step()) {
        const r = stmt.getAsObject();
        try { r.meta = r.meta ? JSON.parse(r.meta) : undefined; } catch (e) { r.meta = undefined; }
        out.push({
          id: r.id,
          teamId: r.teamId,
          senderId: r.senderId,
          content: (r.message && String(r.message) !== 'Invalid Date') ? String(r.message) : '',
          timestamp: r.createdAt,
          updatedAt: r.updatedAt || undefined,
          isDeleted: r.is_deleted ? true : false,
          isPinned: r.is_pinned ? true : false,
          edited: r.edited ? true : false,
          replyTo: r.replyTo || undefined,
          attachment: r.meta && r.meta.attachment ? r.meta.attachment : undefined
        });
      }
      stmt.free();
      const enriched = out.reverse();
      console.log('Chat EMP GET: returning', enriched.length, 'messages for employee', emp);
      return success(res, enriched);
    } catch (err) { console.error('Chat EMP GET error', err && (err.stack || err.message || err)); return failure(res, 'Internal server error', 500); }
  });
  try {
    const teamId = req.params.teamId;
    const limit = parseInt(req.query.limit) || 200;

    // Determine canonical DM participant ids when applicable
    let a, b;
    if (String(teamId).startsWith('DM-')) {
      const parts = String(teamId).split('-').slice(1);
      a = parts[0];
      b = parts[1];
    }

    // If canonical DM id is provided (DM-a-b), also include legacy messages stored under either participant id.
    let stmt;
    if (a && b) {
      // Query messages where teamId is canonical DM id OR equal to either participant id (legacy)
      stmt = db.prepare('SELECT id, teamId, senderId, message, meta, createdAt, updatedAt, is_deleted, is_pinned, edited, replyTo FROM chat WHERE teamId IN (?,?,?) ORDER BY createdAt DESC LIMIT ?');
      stmt.bind([teamId, a, b, limit]);
    } else {
      stmt = db.prepare('SELECT id, teamId, senderId, message, meta, createdAt, updatedAt, is_deleted, is_pinned, edited, replyTo FROM chat WHERE teamId = ? ORDER BY createdAt DESC LIMIT ?');
      stmt.bind([teamId, limit]);
    }

    const out = [];
    while (stmt.step()) {
      const r = stmt.getAsObject();
      try { r.meta = r.meta ? JSON.parse(r.meta) : undefined; } catch (e) { r.meta = undefined; }
      // Normalize to frontend shape: content, timestamp, attachment, plus flags
      out.push({
        id: r.id,
        teamId: r.teamId,
        senderId: r.senderId,
        content: (r.message && String(r.message) !== 'Invalid Date') ? String(r.message) : '',
        timestamp: r.createdAt,
        updatedAt: r.updatedAt || undefined,
        isDeleted: r.is_deleted ? true : false,
        isPinned: r.is_pinned ? true : false,
        edited: r.edited ? true : false,
        replyTo: r.replyTo || undefined,
        attachment: r.meta && r.meta.attachment ? r.meta.attachment : undefined
      });
    }
    stmt.free();

    // Read receipts: compute seenAt/isSeen for DM conversations
    let lastReads = {};
    try {
      const readStmt = db.prepare('SELECT userId, lastReadAt FROM chat_reads WHERE teamId = ?');
      // Use canonical teamId if DM, else use teamId
      const canonical = (a && b) ? teamId : teamId;
      readStmt.bind([canonical]);
      while (readStmt.step()) {
        const rr = readStmt.getAsObject(); lastReads[rr.userId] = rr.lastReadAt;
      }
      readStmt.free();
    } catch (e) { /* ignore */ }

    const enriched = out.reverse().map(msg => {
      let isSeen = false;
      let seenAt = undefined;
      try {
        // For DM, check other participant's lastReadAt
        if (a && b) {
          const me = req.user && (req.user.employeeId || String(req.user.id));
          const other = a === me ? b : (b === me ? a : null);
          if (other && lastReads[other]) {
            const lr = Date.parse(lastReads[other]);
            const mtime = Date.parse(msg.timestamp);
            if (!isNaN(lr) && !isNaN(mtime) && lr >= mtime) { isSeen = true; seenAt = lastReads[other]; }
          }
        }
      } catch (e) { }
      return { ...msg, isSeen, seenAt };
    });

    console.log('Chat GET: returning', enriched.length, 'messages for', teamId);
    return success(res, enriched);
  } catch (err) { console.error('Chat GET error', err && (err.stack || err.message || err)); return failure(res, 'Internal server error', 500); }
});

// Mark messages in a team as read for the current user
app.post('/api/chat/:teamId/read', requireAuth, (req, res) => {
  try {
    let teamId = req.params.teamId;
    // Normalize DM canonical id if needed
    try {
      if (!String(teamId).startsWith('DM-') && req.user && req.user.employeeId) {
        // If teamId is a raw employee id, convert to DM canonical
        const a = String(teamId);
        const b = req.user.employeeId || String(req.user.id);
        teamId = 'DM-' + [a, b].sort().join('-');
      }
    } catch (e) { }

    const userId = req.user && (req.user.employeeId || String(req.user.id));
    if (!userId) return failure(res, 'Unauthorized', 401);
    const lastReadAt = new Date().toISOString();

    // Upsert lastReadAt
    const up = db.prepare('INSERT OR REPLACE INTO chat_reads (teamId, userId, lastReadAt) VALUES (?,?,?)');
    up.run([teamId, userId, lastReadAt]);
    up.free();
    try { persistDB(); } catch (e) { console.warn('Warning: failed to persist DB after chat read', e && (e.message || e)); }

    // For debugging: fetch last message in this team and print content so we can confirm which message was marked read
    try {
      const s = db.prepare('SELECT id, message, createdAt FROM chat WHERE teamId = ? ORDER BY createdAt DESC LIMIT 1');
      s.bind([teamId]);
      if (s.step()) {
        const last = s.getAsObject();
        console.log('Chat READ: user', userId, 'read chat', teamId, 'at', lastReadAt, 'lastMessage:', { id: last.id, message: last.message, createdAt: last.createdAt });
      } else {
        console.log('Chat READ: user', userId, 'read chat', teamId, 'at', lastReadAt, 'no messages found');
      }
      s.free();
    } catch (e) { console.warn('Chat READ debug fetch failed', e && (e.message || e)); }

    return success(res, { teamId, userId, lastReadAt }, 'Marked read');
  } catch (err) { console.error('Chat READ error', err && (err.stack || err.message || err)); return failure(res, 'Internal server error', 500); }
});

// Edit a chat message (sender or admin)
app.put('/api/chat/:id', requireAuth, (req, res) => {
  try {
    const id = req.params.id;
    const { message, meta, isPinned } = req.body || {};
    const stmt = db.prepare('SELECT id, teamId, senderId FROM chat WHERE id = ?');
    stmt.bind([id]);
    if (!stmt.step()) { stmt.free(); return failure(res, 'Not found', 404); }
    const row = stmt.getAsObject();
    stmt.free();

    const isAdmin = req.user && req.user.role === 'ADMIN';
    const isOwner = req.user && (req.user.employeeId || String(req.user.id)) === row.senderId;
    if (!isAdmin && !isOwner) return failure(res, 'Forbidden', 403);

    const updatedAt = new Date().toISOString();
    const upd = db.prepare('UPDATE chat SET message = coalesce(?, message), meta = coalesce(?, meta), edited = 1, updatedAt = ?, is_pinned = coalesce(?, is_pinned) WHERE id = ?');
    upd.run([message || null, meta ? JSON.stringify(meta) : null, updatedAt, isPinned == null ? null : (isPinned ? 1 : 0), id]);
    upd.free();
    try { persistDB(); } catch (e) { console.warn('Warning: failed to persist DB after chat edit', e && (e.message || e)); }
    console.log('Chat PUT: edited', id, 'by', req.user && req.user.employeeId);
    return success(res, { id }, 'Updated');
  } catch (err) { console.error('Chat PUT error', err && (err.stack || err.message || err)); return failure(res, 'Internal server error', 500); }
});

// Delete (soft) a chat message (sender or admin)
app.delete('/api/chat/:id', requireAuth, (req, res) => {
  try {
    const id = req.params.id;
    const stmt = db.prepare('SELECT id, senderId FROM chat WHERE id = ?');
    stmt.bind([id]);
    if (!stmt.step()) { stmt.free(); return failure(res, 'Not found', 404); }
    const row = stmt.getAsObject();
    stmt.free();

    const isAdmin = req.user && req.user.role === 'ADMIN';
    const isOwner = req.user && (req.user.employeeId || String(req.user.id)) === row.senderId;
    if (!isAdmin && !isOwner) return failure(res, 'Forbidden', 403);

    const deletedAt = new Date().toISOString();
    const upd = db.prepare('UPDATE chat SET is_deleted = 1, meta = coalesce(meta, json(?)) WHERE id = ?');
    // Keep existing meta but add deletedAt under a simple wrapper if meta missing
    let deletedMeta = JSON.stringify({ deletedAt });
    upd.run([deletedMeta, id]);
    upd.free();
    try { persistDB(); } catch (e) { console.warn('Warning: failed to persist DB after chat delete', e && (e.message || e)); }
    console.log('Chat DELETE: soft-deleted', id, 'by', req.user && req.user.employeeId);
    return success(res, { id }, 'Deleted');
  } catch (err) { console.error('Chat DELETE error', err && (err.stack || err.message || err)); return failure(res, 'Internal server error', 500); }
});

// --- Notepad CRUD Endpoints ---
// Personal notes scoped to each user
app.get('/api/notepad/:userId', requireAuth, (req, res) => {
  try {
    const userId = req.params.userId;
    if (!req.user) return failure(res, 'Unauthorized', 401);

    // Authorization: admin or owner only
    const isAdmin = req.user.role === 'ADMIN';
    const isOwner = req.user.employeeId === userId || String(req.user.id) === String(userId);
    if (!isAdmin && !isOwner) return failure(res, 'Forbidden', 403);

    // Fetch notes for this user (support both numeric ID and employeeId)
    const stmt = db.prepare('SELECT id, userId, content, createdAt, updatedAt FROM notepad WHERE userId = ? OR userId = ? ORDER BY updatedAt DESC');
    stmt.bind([String(userId), String(req.user.id)]);
    const out = [];
    while (stmt.step()) {
      const r = stmt.getAsObject();
      // Parse content as JSON if it contains structured note data
      try {
        const parsed = JSON.parse(r.content);
        out.push({ ...r, ...parsed });
      } catch (e) {
        // If content is not JSON, return as-is
        out.push(r);
      }
    }
    stmt.free();
    return success(res, out || []);
  } catch (err) {
    console.error('Notepad GET error', { path: req.path, err: err && (err.stack || err.message || err) });
    return failure(res, 'Internal server error', 500);
  }
});

app.post('/api/notepad', requireAuth, (req, res) => {
  try {
    if (!req.user) return failure(res, 'Unauthorized', 401);
    const { content, title, category, color } = req.body || {};
    if (!content) return failure(res, 'Missing content', 400);

    try {
      db.run('BEGIN TRANSACTION');
      const id = genId('N-');
      const now = new Date().toISOString();
      const userId = req.user.employeeId || String(req.user.id);

      // Store as structured JSON to support title, category, color
      const noteData = { title: title || 'Untitled', content, category: category || 'Work', color: color || 'yellow' };
      const contentStr = JSON.stringify(noteData);

      const insert = db.prepare('INSERT INTO notepad (id, userId, content, createdAt, updatedAt) VALUES (?,?,?,?,?)');
      insert.run([id, userId, contentStr, now, now]);
      insert.free();

      db.run('COMMIT');
      if (!persistDB()) console.warn('Notepad POST: commit succeeded but failed to persist DB file');
      else console.log('Notepad POST: note persisted to DB file');

      return success(res, { id, userId, ...noteData, createdAt: now, updatedAt: now }, 'Created', 201);
    } catch (e) {
      try { db.run('ROLLBACK'); } catch (er) { console.error('Notepad POST: rollback failed', er && (er.stack || er.message || er)); }
      console.error('Notepad POST transactional error', e && (e.stack || e.message || e));
      return failure(res, 'Internal server error while creating note', 500);
    }
  } catch (err) {
    console.error('Notepad POST error', { path: req.path, err: err && (err.stack || err.message || err) });
    return failure(res, 'Internal server error', 500);
  }
});

app.put('/api/notepad/:id', requireAuth, (req, res) => {
  try {
    if (!req.user) return failure(res, 'Unauthorized', 401);
    const id = req.params.id;
    const { content, title, category, color } = req.body || {};

    // Check note exists and get owner
    const getStmt = db.prepare('SELECT userId FROM notepad WHERE id = ?');
    getStmt.bind([id]);
    if (!getStmt.step()) { getStmt.free(); return failure(res, 'Not found', 404); }
    const existing = getStmt.getAsObject();
    getStmt.free();

    // Authorization: admin or owner only
    const isAdmin = req.user.role === 'ADMIN';
    const isOwner = existing.userId === req.user.employeeId || existing.userId === String(req.user.id);
    if (!isAdmin && !isOwner) return failure(res, 'Forbidden', 403);

    try {
      db.run('BEGIN TRANSACTION');
      const now = new Date().toISOString();

      // Update with structured data
      const noteData = { title, content, category, color };
      const contentStr = JSON.stringify(noteData);

      const update = db.prepare('UPDATE notepad SET content = ?, updatedAt = ? WHERE id = ?');
      update.run([contentStr, now, id]);
      update.free();

      db.run('COMMIT');
      if (!persistDB()) console.warn('Notepad PUT: commit succeeded but failed to persist DB file');
      else console.log('Notepad PUT: note updated in DB file');

      return success(res, { id, ...noteData, updatedAt: now }, 'Updated');
    } catch (e) {
      try { db.run('ROLLBACK'); } catch (er) { }
      console.error('Notepad PUT transactional error', e && (e.stack || e.message || e));
      return failure(res, 'Internal server error while updating note', 500);
    }
  } catch (err) {
    console.error('Notepad PUT error', { path: req.path, err: err && (err.stack || err.message || err) });
    return failure(res, 'Internal server error', 500);
  }
});

app.delete('/api/notepad/:id', requireAuth, (req, res) => {
  try {
    if (!req.user) return failure(res, 'Unauthorized', 401);
    const id = req.params.id;

    // Check note exists and get owner
    const getStmt = db.prepare('SELECT userId FROM notepad WHERE id = ?');
    getStmt.bind([id]);
    if (!getStmt.step()) { getStmt.free(); return failure(res, 'Not found', 404); }
    const existing = getStmt.getAsObject();
    getStmt.free();

    // Authorization: admin or owner only
    const isAdmin = req.user.role === 'ADMIN';
    const isOwner = existing.userId === req.user.employeeId || existing.userId === String(req.user.id);
    if (!isAdmin && !isOwner) return failure(res, 'Forbidden', 403);

    try {
      db.run('BEGIN TRANSACTION');
      const del = db.prepare('DELETE FROM notepad WHERE id = ?');
      del.run([id]);
      del.free();
      db.run('COMMIT');
      if (!persistDB()) console.warn('Notepad DELETE: commit succeeded but failed to persist DB file');
      else console.log('Notepad DELETE: note deleted from DB file');
      return success(res, null, 'Deleted');
    } catch (e) {
      try { db.run('ROLLBACK'); } catch (er) { }
      console.error('Notepad DELETE transactional error', e && (e.stack || e.message || e));
      return failure(res, 'Internal server error while deleting note', 500);
    }
  } catch (err) {
    console.error('Notepad DELETE error', { path: req.path, err: err && (err.stack || err.message || err) });
    return failure(res, 'Internal server error', 500);
  }
});

// Queries
app.post('/api/queries', requireAuth, (req, res) => {
  try {
    const { subject, message, question, to } = req.body || {};
    const finalSubject = subject || question;
    const finalMessage = message || question;

    // Log incoming request briefly for debugging
    console.log('[API] POST /api/queries body:', { subject: finalSubject, to, user: req.user && { id: req.user.id, employeeId: req.user.employeeId } });

    if (!finalSubject || !finalMessage || !to) return failure(res, 'Missing subject, message or recipient', 400);

    try {
      db.run('BEGIN TRANSACTION');
      const id = genId('Q-');
      const now = new Date().toISOString();
      const senderId = req.user.employeeId || 'ADMIN-' + req.user.id;

      const insert = db.prepare('INSERT INTO queries (id, userId, senderId, receiverId, subject, message, status, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,?)');
      // Cast receiver id to string to avoid sqlite type coercion issues
      const receiverId = to != null ? String(to) : null;
      insert.run([id, String(req.user.id), senderId, receiverId, finalSubject, finalMessage, 'OPEN', now, now]);
      insert.free();

      db.run('COMMIT');
      persistDB();
      return success(res, { id, status: 'OPEN', createdAt: now }, 'Query submitted successfully', 201);
    } catch (e) {
      try { db.run('ROLLBACK'); } catch (er) { }
      console.error('Queries POST transactional error', e);
      return failure(res, 'Internal server error while creating query', 500);
    }
  } catch (err) {
    console.error('Queries POST error', err && (err.stack || err.message || err));
    return failure(res, 'Internal server error', 500);
  }
});

app.get('/api/queries', requireAuth, withCache('queries', 15000), (req, res) => {
  // Provide additional logging when debugging query listing issues
  console.log('[API] GET /api/queries requested by', req.user && { id: req.user.id, employeeId: req.user.employeeId });

  const joinedSql = `
    SELECT 
      q.id, q.userId, q.senderId as "from", q.receiverId as "to", q.subject, q.message, q.response, q.status, q.createdAt, q.updatedAt,
      COALESCE(e1.name, u1.name) as senderName,
      COALESCE(e2.name, u2.name) as receiverName
    FROM queries q
    LEFT JOIN employees e1 ON q.senderId = e1.id
    LEFT JOIN users u1 ON q.userId = u1.id
    LEFT JOIN employees e2 ON q.receiverId = e2.id
    LEFT JOIN users u2 ON q.receiverId = u2.id
    ORDER BY q.createdAt DESC
  `;

  try {
    // First attempt: run the richer joined query (may fail on older DBs)
    const stmt = db.prepare(joinedSql);
    const out = [];
    while (stmt.step()) out.push(stmt.getAsObject());
    stmt.free();
    return success(res, out || []);
  } catch (err) {
    // Log the detailed SQL error for debugging and fall back to a safe simple select
    console.error('Queries GET: joined SQL prepare/step failed, falling back to simple select', err && (err.stack || err.message || err));
    try {
      const fallback = db.prepare('SELECT id, userId, senderId, receiverId, subject, message, response, status, createdAt, updatedAt FROM queries ORDER BY createdAt DESC');
      const out = [];
      while (fallback.step()) out.push(fallback.getAsObject());
      fallback.free();
      return success(res, out || []);
    } catch (err2) {
      console.error('Queries GET fallback failed', err2 && (err2.stack || err2.message || err2));
      return failure(res, 'Internal server error', 500);
    }
  }
});

app.put('/api/queries/:id', requireAuth, (req, res) => {
  try {
    const id = req.params.id;
    const { status, response } = req.body || {};
    const now = new Date().toISOString();

    const stmt = db.prepare('UPDATE queries SET status = coalesce(?, status), response = coalesce(?, response), updatedAt = ? WHERE id = ?');
    stmt.run([status || null, response || null, now, id]);
    stmt.free();

    persistDB();
    return success(res, null, 'Query updated');
  } catch (err) {
    console.error('Queries PUT error', err);
    return failure(res, 'Internal server error', 500);
  }
});

app.delete('/api/queries/:id', requireAuth, (req, res) => {
  try {
    if (!req.user) return failure(res, 'Unauthorized', 401);
    if (req.user.role !== 'ADMIN') return failure(res, 'Forbidden: Only admin can delete queries', 403);

    const id = req.params.id;
    const del = db.prepare('DELETE FROM queries WHERE id = ?');
    del.run([id]);
    del.free();
    persistDB();
    return success(res, null, 'Deleted');
  } catch (err) {
    console.error('Queries DELETE error', err && (err.stack || err.message || err));
    return failure(res, 'Internal server error', 500);
  }
});
console.log('Registered API routes: /api/notepad (GET/POST/PUT/DELETE)');

// Calendar Events CRUD
app.get('/api/calendar', requireAuth, (req, res) => {
  try {
    if (!req.user) return failure(res, 'Unauthorized', 401);

    const isAdmin = req.user.role === 'ADMIN';
    const stmt = db.prepare('SELECT id, title, description, startTime, endTime, createdBy, createdAt FROM calendar ORDER BY startTime ASC');
    const out = [];
    while (stmt.step()) {
      const r = stmt.getAsObject();
      // Admin sees all, employees see only their own events
      if (isAdmin || r.createdBy === req.user.employeeId || r.createdBy === String(req.user.id)) {
        out.push(r);
      }
    }
    stmt.free();
    return success(res, out || []);
  } catch (err) {
    console.error('Calendar GET error', { path: req.path, err: err && (err.stack || err.message || err) });
    return failure(res, 'Internal server error', 500);
  }
});

app.post('/api/calendar', requireAuth, (req, res) => {
  try {
    if (!req.user) return failure(res, 'Unauthorized', 401);
    const { title, description, startTime, endTime } = req.body || {};
    if (!title || !startTime) return failure(res, 'Missing required fields: title and startTime', 400);

    try {
      db.run('BEGIN TRANSACTION');
      const id = genId('CAL-');
      const createdAt = new Date().toISOString();
      const createdBy = req.user.employeeId || String(req.user.id);

      const insert = db.prepare('INSERT INTO calendar (id, title, description, startTime, endTime, createdBy, createdAt) VALUES (?,?,?,?,?,?,?)');
      insert.run([id, title, description || null, startTime, endTime || null, createdBy, createdAt]);
      insert.free();

      db.run('COMMIT');
      if (!persistDB()) console.warn('Calendar POST: commit succeeded but failed to persist DB file');
      else console.log('Calendar POST: event persisted to DB file');

      return success(res, { id, title, description, startTime, endTime, createdBy, createdAt }, 'Created', 201);
    } catch (e) {
      try { db.run('ROLLBACK'); } catch (er) { console.error('Calendar POST: rollback failed', er && (er.stack || er.message || er)); }
      console.error('Calendar POST transactional error', e && (e.stack || e.message || e));
      return failure(res, 'Internal server error while creating calendar event', 500);
    }
  } catch (err) {
    console.error('Calendar POST error', { path: req.path, err: err && (err.stack || err.message || err) });
    return failure(res, 'Internal server error', 500);
  }
});

app.put('/api/calendar/:id', requireAuth, (req, res) => {
  try {
    if (!req.user) return failure(res, 'Unauthorized', 401);
    const id = req.params.id;
    const { title, description, startTime, endTime } = req.body || {};

    // Check event exists and get creator
    const getStmt = db.prepare('SELECT createdBy FROM calendar WHERE id = ?');
    getStmt.bind([id]);
    if (!getStmt.step()) { getStmt.free(); return failure(res, 'Not found', 404); }
    const existing = getStmt.getAsObject();
    getStmt.free();

    // Authorization: admin or creator only
    const isAdmin = req.user.role === 'ADMIN';
    const isCreator = existing.createdBy === req.user.employeeId || existing.createdBy === String(req.user.id);
    if (!isAdmin && !isCreator) return failure(res, 'Forbidden', 403);

    try {
      db.run('BEGIN TRANSACTION');
      const update = db.prepare('UPDATE calendar SET title = coalesce(?, title), description = coalesce(?, description), startTime = coalesce(?, startTime), endTime = coalesce(?, endTime) WHERE id = ?');
      update.run([title || null, description || null, startTime || null, endTime || null, id]);
      update.free();

      db.run('COMMIT');
      if (!persistDB()) console.warn('Calendar PUT: commit succeeded but failed to persist DB file');
      else console.log('Calendar PUT: event updated in DB file');

      return success(res, { id, title, description, startTime, endTime }, 'Updated');
    } catch (e) {
      try { db.run('ROLLBACK'); } catch (er) { }
      console.error('Calendar PUT transactional error', e && (e.stack || e.message || e));
      return failure(res, 'Internal server error while updating calendar event', 500);
    }
  } catch (err) {
    console.error('Calendar PUT error', { path: req.path, err: err && (err.stack || err.message || err) });
    return failure(res, 'Internal server error', 500);
  }
});

app.delete('/api/calendar/:id', requireAuth, (req, res) => {
  try {
    if (!req.user) return failure(res, 'Unauthorized', 401);
    const id = req.params.id;

    // Check event exists and get creator
    const getStmt = db.prepare('SELECT createdBy FROM calendar WHERE id = ?');
    getStmt.bind([id]);
    if (!getStmt.step()) { getStmt.free(); return failure(res, 'Not found', 404); }
    const existing = getStmt.getAsObject();
    getStmt.free();

    // Authorization: admin or creator only
    const isAdmin = req.user.role === 'ADMIN';
    const isCreator = existing.createdBy === req.user.employeeId || existing.createdBy === String(req.user.id);
    if (!isAdmin && !isCreator) return failure(res, 'Forbidden', 403);

    try {
      db.run('BEGIN TRANSACTION');
      const del = db.prepare('DELETE FROM calendar WHERE id = ?');
      del.run([id]);
      del.free();
      db.run('COMMIT');
      if (!persistDB()) console.warn('Calendar DELETE: commit succeeded but failed to persist DB file');
      else console.log('Calendar DELETE: event deleted from DB file');
      return success(res, null, 'Deleted');
    } catch (e) {
      try { db.run('ROLLBACK'); } catch (er) { }
      console.error('Calendar DELETE transactional error', e && (e.stack || e.message || e));
      return failure(res, 'Internal server error while deleting calendar event', 500);
    }
  } catch (err) {
    console.error('Calendar DELETE error', { path: req.path, err: err && (err.stack || err.message || err) });
    return failure(res, 'Internal server error', 500);
  }
});

// Reminders (personal reminders CRUD)
app.get('/api/reminders', requireAuth, withCache('reminders', 30000), (req, res) => {
  try {
    if (!req.user) return failure(res, 'Unauthorized', 401);
    const isAdmin = req.user.role === 'ADMIN';
    // Ensure optional column `createdBy` exists on older DBs; ignore error if already present
    try { db.run("ALTER TABLE reminders ADD COLUMN createdBy TEXT"); } catch (e) { /* ignore -- column likely exists or table missing */ }

    let stmt;
    const out = [];
    try {
      stmt = db.prepare('SELECT id, userId, date, title, createdBy, createdAt FROM reminders ORDER BY date DESC');
    } catch (e) {
      // Fallback for older DBs missing `createdBy` column
      stmt = db.prepare('SELECT id, userId, date, title, createdAt FROM reminders ORDER BY date DESC');
    }
    while (stmt.step()) {
      const r = stmt.getAsObject();
      if (isAdmin || r.userId === req.user.employeeId || r.userId === String(req.user.id)) out.push(r);
    }
    stmt.free();
    return success(res, out || []);
  } catch (err) {
    console.error('Reminders GET error', { path: req.path, err: err && (err.stack || err.message || err) });
    return failure(res, 'Internal server error', 500);
  }
});

app.post('/api/reminders', requireAuth, (req, res) => {
  try {
    if (!req.user) return failure(res, 'Unauthorized', 401);
    const { userId, date, title } = req.body || {};
    if (!date || !title) return failure(res, 'Missing fields', 400);
    try {
      db.run('BEGIN TRANSACTION');
      const id = genId('REM-');
      const createdAt = new Date().toISOString();
      const owner = userId || req.user.employeeId || String(req.user.id);
      // Try to insert including createdBy; if the column doesn't exist on older DBs, fallback to a simpler insert
      try {
        const insert = db.prepare('INSERT INTO reminders (id, userId, date, title, createdBy, createdAt) VALUES (?,?,?,?,?,?)');
        insert.run([id, owner, date, title, req.user.employeeId || String(req.user.id), createdAt]);
        insert.free();
      } catch (ie) {
        const insert = db.prepare('INSERT INTO reminders (id, userId, date, title, createdAt) VALUES (?,?,?,?,?)');
        insert.run([id, owner, date, title, createdAt]);
        insert.free();
      }
      db.run('COMMIT');
      if (!persistDB()) console.warn('Reminders POST: commit succeeded but failed to persist DB file');
      else console.log('Reminders POST: reminder persisted to DB file');
      return success(res, { id, userId: owner, date, title, createdAt }, 'Created', 201);
    } catch (e) {
      try { db.run('ROLLBACK'); } catch (er) { console.error('Reminders POST: rollback failed', er && (er.stack || er.message || er)); }
      console.error('Reminders POST transactional error', e && (e.stack || e.message || e));
      return failure(res, 'Internal server error while creating reminder', 500);
    }
  } catch (err) {
    console.error('Reminders POST error', { path: req.path, err: err && (err.stack || err.message || err) });
    return failure(res, 'Internal server error', 500);
  }
});

app.delete('/api/reminders/:id', requireAuth, (req, res) => {
  try {
    if (!req.user) return failure(res, 'Unauthorized', 401);
    const id = req.params.id;
    const getStmt = db.prepare('SELECT userId FROM reminders WHERE id = ?');
    getStmt.bind([id]);
    if (!getStmt.step()) { getStmt.free(); return failure(res, 'Not found', 404); }
    const existing = getStmt.getAsObject();
    getStmt.free();
    const isAdmin = req.user.role === 'ADMIN';
    const isOwner = existing.userId === req.user.employeeId || existing.userId === String(req.user.id);
    if (!isAdmin && !isOwner) return failure(res, 'Forbidden', 403);
    try {
      db.run('BEGIN TRANSACTION');
      const del = db.prepare('DELETE FROM reminders WHERE id = ?');
      del.run([id]);
      del.free();
      db.run('COMMIT');
      if (!persistDB()) console.warn('Reminders DELETE: commit succeeded but failed to persist DB file');
      else console.log('Reminders DELETE: reminder deleted from DB file');
      return success(res, null, 'Deleted');
    } catch (e) {
      try { db.run('ROLLBACK'); } catch (er) { }
      console.error('Reminders DELETE transactional error', e && (e.stack || e.message || e));
      return failure(res, 'Internal server error while deleting reminder', 500);
    }
  } catch (err) {
    console.error('Reminders DELETE error', { path: req.path, err: err && (err.stack || err.message || err) });
    return failure(res, 'Internal server error', 500);
  }
});

// Leave management
app.post('/api/leave', requireAuth, (req, res) => {
  try {
    const { userId, startDate, endDate, days, reason } = req.body || {};
    if (!userId || !startDate || !endDate || typeof days !== 'number') return failure(res, 'Missing fields', 400);
    try {
      db.run('BEGIN TRANSACTION');
      const id = genId('L-');
      const createdAt = new Date().toISOString();
      const insert = db.prepare('INSERT INTO leaves (id, userId, startDate, endDate, days, status, reason, createdAt) VALUES (?,?,?,?,?,?,?,?)');
      insert.run([id, userId, startDate, endDate, days, 'PENDING', reason || null, createdAt]);
      insert.free();
      db.run('COMMIT');
      persistDB();
      return success(res, { id }, 'Created', 201);
    } catch (e) { try { db.run('ROLLBACK'); } catch (er) { } throw e; }
  } catch (err) { console.error('Leave POST error', err && (err.stack || err.message || err)); return failure(res, 'Internal server error', 500); }
});

app.get('/api/leave', requireAuth, withCache('leave', 15000), (req, res) => {
  try {
    const userId = req.query.userId;
    let q = 'SELECT id, userId, startDate, endDate, days, status, reason, createdAt FROM leaves';
    const params = [];
    if (userId) { q += ' WHERE userId = ?'; params.push(userId); }
    const stmt = db.prepare(q);
    stmt.bind(params);
    const out = [];
    while (stmt.step()) out.push(stmt.getAsObject());
    stmt.free();
    return success(res, out || []);
  } catch (err) { console.error('Leave GET error', err && (err.stack || err.message || err)); return failure(res, 'Internal server error', 500); }
});

// Holidays
app.post('/api/holidays', requireAuth, (req, res) => {
  try {
    const { name, date, recurring } = req.body || {};
    if (!name || !date) return failure(res, 'Missing fields', 400);
    try {
      db.run('BEGIN TRANSACTION');
      const id = genId('H-');
      const createdAt = new Date().toISOString();
      const insert = db.prepare('INSERT INTO holidays (id, name, date, recurring, createdAt) VALUES (?,?,?,?,?)');
      insert.run([id, name, date, recurring ? 1 : 0, createdAt]);
      insert.free();
      db.run('COMMIT');
      persistDB();
      return success(res, { id }, 'Created', 201);
    } catch (e) { try { db.run('ROLLBACK'); } catch (er) { } throw e; }
  } catch (err) { console.error('Holidays POST error', err && (err.stack || err.message || err)); return failure(res, 'Internal server error', 500); }
});

app.get('/api/holidays', requireAuth, withCache('holidays', 30000), (req, res) => {
  try {
    const cacheKey = 'holidays:all';
    const hit = cacheGet(cacheKey);
    if (hit) return success(res, hit);
    const stmt = db.prepare('SELECT id, name, date, recurring, createdAt FROM holidays ORDER BY date ASC');
    const out = [];
    while (stmt.step()) out.push(stmt.getAsObject());
    stmt.free();
    const data = out || [];
    cacheSet(cacheKey, data, 120000);
    return success(res, data);
  } catch (err) { console.error('Holidays GET error', err && (err.stack || err.message || err)); return failure(res, 'Internal server error', 500); }
});

// Delete holiday
app.delete('/api/holidays/:id', requireAuth, (req, res) => {
  try {
    const id = req.params.id;
    const del = db.prepare('DELETE FROM holidays WHERE id = ?');
    del.run([id]); del.free && del.free();
    persistDB();
    return success(res, null, 'Deleted');
  } catch (err) { console.error('Holidays DELETE error', err && (err.stack || err.message || err)); return failure(res, 'Internal server error', 500); }
});

// Time logs endpoints
app.post('/api/timelogs', requireAuth, (req, res) => {
  try {
    const { id, userId, startTime, endTime, task, notes } = req.body || {};
    if (!id || !userId || !startTime) return failure(res, 'Missing fields', 400);
    const check = db.prepare('SELECT id FROM timelogs WHERE id = ?');
    check.bind([id]);
    if (check.step()) { check.free(); return failure(res, 'TimeLog ID already exists', 409); }
    check.free();

    const insert = db.prepare('INSERT INTO timelogs (id, userId, startTime, endTime, task, notes, createdAt) VALUES (?,?,?,?,?,?,?)');
    insert.run([id, userId, startTime, endTime || null, task || null, notes || null, new Date().toISOString()]);
    insert.free && insert.free();
    persistDB();
    return success(res, null, 'Created', 201);
  } catch (err) {
    console.error('Timelogs POST error', { path: req.path, err: err && (err.stack || err.message || err) });
    return failure(res, 'Internal server error', 500);
  }
});

app.put('/api/timelogs/:id', requireAuth, (req, res) => {
  try {
    const id = req.params.id;
    const { startTime, endTime, task, notes } = req.body || {};
    const stmt = db.prepare('SELECT id FROM timelogs WHERE id = ?');
    stmt.bind([id]);
    if (!stmt.step()) { stmt.free(); return failure(res, 'Not found', 404); }
    stmt.free();
    const update = db.prepare('UPDATE timelogs SET startTime = coalesce(?, startTime), endTime = coalesce(?, endTime), task = coalesce(?, task), notes = coalesce(?, notes) WHERE id = ?');
    update.run([startTime || null, endTime || null, task || null, notes || null, id]);
    update.free && update.free();
    persistDB();
    return success(res, null, 'Updated');
  } catch (err) {
    console.error('Timelogs PUT error', { path: req.path, err: err && (err.stack || err.message || err) });
    return failure(res, 'Internal server error', 500);
  }
});

app.delete('/api/timelogs/:id', requireAuth, (req, res) => {
  try {
    const id = req.params.id;
    const del = db.prepare('DELETE FROM timelogs WHERE id = ?');
    del.run([id]);
    del.free();
    persistDB();
    return success(res, null, 'Deleted');
  } catch (err) {
    console.error('Timelogs DELETE error', { path: req.path, err: err && (err.stack || err.message || err) });
    return failure(res, 'Internal server error', 500);
  }
});

// Duplicate users endpoints removed; handlers defined above with safer error handling

// Developer-friendly request logging (only in non-production)
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    console.log('[API]', req.method, req.path, req.headers.origin || 'no-origin');
    next();
  });

  // Dev-only route: enumerate registered routes to help debug missing endpoints
  app.get('/api/_routes', (req, res) => {
    try {
      const routes = [];
      const stack = app._router && app._router.stack ? app._router.stack : [];
      stack.forEach((layer) => {
        try {
          if (layer && layer.route && layer.route.path) {
            const methods = Object.keys(layer.route.methods || {}).join(',');
            routes.push({ path: layer.route.path, methods });
          }
        } catch (e) { /* ignore */ }
      });
      return success(res, routes);
    } catch (e) {
      console.error('Failed to enumerate routes', e && (e.stack || e.message || e));
      return failure(res, 'Failed to enumerate routes', 500);
    }
  });

  // Dev-only DB info: verify site_photos table exists and count rows
  app.get('/api/_dbinfo', (req, res) => {
    try {
      const tbl = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='site_photos'");
      const exists = tbl.step(); tbl.free();
      let count = 0;
      if (exists) {
        try {
          const s = db.prepare('SELECT COUNT(*) as c FROM site_photos');
          if (s.step()) { const r = s.getAsObject(); count = r.c || 0; }
          s.free();
        } catch (e) { console.warn('Failed to count site_photos', e && (e.message || e)); }
      }
      return success(res, { hasSitePhotosTable: !!exists, sitePhotosCount: count });
    } catch (e) {
      console.error('DBInfo error', e && (e.stack || e.message || e));
      return failure(res, 'Internal server error', 500);
    }
  });

  // Dev-only: seed a sample O2D order to help visual verification
  app.post('/api/_seed_o2d', requireAuth, (req, res) => {
    try {
      if (process.env.NODE_ENV === 'production') return failure(res, 'Not allowed', 403);
      const id = 'ORD-7898';
      const now = new Date().toISOString().split('T')[0];
      const sample = {
        itemName: 'Bricks',
        quantity: '48',
        siteLocation: 'Jass to abhi',
        description: 'Concrete construction - bricks',
        priority: 'High',
        isMonsoon: false,
        tatValue: 48,
        tatUnit: 'Hours',
        expectedDeliveryDate: null,
        orderedBy: req.user && req.user.employeeId ? req.user.employeeId : 'ADMIN',
        assignedApprover: req.user && req.user.employeeId ? req.user.employeeId : 'ADMIN',
        createdDate: now,
        status: 'PENDING_APPROVAL'
      };
      try {
        const insert = db.prepare('INSERT OR IGNORE INTO o2d (id, data, status, createdBy, createdAt) VALUES (?,?,?,?,?)');
        insert.run([id, JSON.stringify(sample), sample.status, req.user && (req.user.employeeId || req.user.id) || null, new Date().toISOString()]);
        insert.free();
        persistDB();
      } catch (e) { console.error('Seed o2d insert failed', e && (e.stack || e.message || e)); return failure(res, 'Seed failed', 500); }
      return success(res, { seededId: id }, 'Seeded');
    } catch (err) { console.error('Seed o2d error', err && (err.stack || err.message || err)); return failure(res, 'Internal server error', 500); }
  });

  // Dev-only debug: list o2d rows (id, nested data.id, status, createdBy)
  app.get('/api/_o2d_list', requireAuth, (req, res) => {
    try {
      const out = [];
      const s = db.prepare('SELECT id, data, status, createdBy, createdAt FROM o2d ORDER BY createdAt DESC');
      while (s.step()) {
        const r = s.getAsObject();
        let nestedId = null;
        try { const d = JSON.parse(r.data || '{}'); nestedId = d && (d.id || d.orderId || d.refId) ? String(d.id || d.orderId || d.refId) : null; } catch (e) { }
        out.push({ id: r.id, nestedId, status: r.status, createdBy: r.createdBy, createdAt: r.createdAt });
      }
      s.free();
      return success(res, out);
    } catch (e) { console.error('O2D list debug failed', e && (e.stack || e.message || e)); return failure(res, 'Internal server error', 500); }
  });

  // Dev convenience: delete an o2d row by id (in body) or nested id; useful when clients send nested IDs
  app.post('/api/_o2d_delete', requireAuth, (req, res) => {
    try {
      const id = req.body && req.body.id;
      if (!id) return failure(res, 'Missing id', 400);
      // Reuse existing delete logic by setting req.params.id and calling handler
      req.params = req.params || {};
      req.params.id = id;
      return handleDeleteO2d(req, res);
    } catch (err) {
      console.error('Dev delete by id failed', err && (err.stack || err.message || err));
      return failure(res, 'Internal server error', 500);
    }
  });

  console.log('Registered dev o2d helpers: /api/_o2d_list, /api/_o2d_delete');
}

// ===========================
// PMS (Project Management System) Endpoints - MUST BE BEFORE CATCH-ALL
// ===========================
console.log('LOADING PMS ROUTES - This message confirms PMS code is executing');

try {

  // Middleware to check if user is ADMIN for PMS
  const isPMSAdmin = (req, res, next) => {
    if (!req.user || req.user.role !== 'ADMIN') {
      return failure(res, 'Access denied: PMS Admin only', 403);
    }
    next();
  };

  // POST /api/pms/projects - Create new project (ADMIN only)
  app.post('/api/pms/projects', requireAuth, isPMSAdmin, (req, res) => {
    console.log('DEBUG: POST /api/pms/projects called');
    try {
      const { project_name, assigned_employee_id, start_date, google_sheet_link, location } = req.body;
      if (!project_name || !assigned_employee_id || !start_date) {
        return failure(res, 'Missing required fields', 400);
      }

      const id = 'pms_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      const now = new Date().toISOString();

      db.run(
        `INSERT INTO pms_projects (id, project_name, assigned_employee_id, start_date, status, createdBy, createdAt, location, google_sheet_link)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, project_name, assigned_employee_id, start_date, 'Active', req.user.id, now, location || null, google_sheet_link || null]
      );

      saveToDB();
      success(res, { id, project_name, assigned_employee_id, start_date, location, google_sheet_link, status: 'Active', createdAt: now });
    } catch (err) {
      console.error('POST /api/pms/projects error:', err);
      failure(res, 'Failed to create project', 500);
    }
  });

  // GET /api/pms/projects - Get all projects (ADMIN) or assigned project (EMPLOYEE)
  app.get('/api/pms/projects', requireAuth, (req, res) => {
    console.log('DEBUG: GET /api/pms/projects called');
    try {
      let query = 'SELECT * FROM pms_projects WHERE 1=1';
      let params = [];

      // If employee, show only assigned projects
      if (req.user.role === 'EMPLOYEE') {
        query += ' AND assigned_employee_id = ?';
        params.push(req.user.employeeId || String(req.user.id));
      }

      query += ' ORDER BY createdAt DESC';

      const stmt = db.prepare(query);
      stmt.bind(params);
      const projects = [];
      while (stmt.step()) {
        projects.push(stmt.getAsObject());
      }
      stmt.free();

      success(res, projects);
    } catch (err) {
      console.error('GET /api/pms/projects error:', err);
      failure(res, 'Failed to fetch projects', 500);
    }
  });

  // GET /api/pms/projects/:id - Get single project with daily work logs
  app.get('/api/pms/projects/:id', requireAuth, (req, res) => {
    try {
      const projectId = req.params.id;

      // Get project
      const pStmt = db.prepare('SELECT * FROM pms_projects WHERE id = ?');
      pStmt.bind([projectId]);
      if (!pStmt.step()) {
        pStmt.free();
        return failure(res, 'Project not found', 404);
      }
      const project = pStmt.getAsObject();
      pStmt.free();

      // Check access
      if (req.user.role === 'EMPLOYEE' && project.assigned_employee_id !== (req.user.employeeId || String(req.user.id))) {
        return failure(res, 'Access denied', 403);
      }

      // Get daily work logs
      const wStmt = db.prepare(
        `SELECT dwl.*, GROUP_CONCAT(wp.file_path, ',') as photo_paths
       FROM pms_daily_work_logs dwl
       LEFT JOIN pms_work_photos wp ON wp.work_log_id = dwl.id
       WHERE dwl.project_id = ?
       GROUP BY dwl.id
       ORDER BY dwl.work_date DESC, dwl.session_number ASC`
      );
      wStmt.bind([projectId]);
      const logs = [];
      while (wStmt.step()) {
        const log = wStmt.getAsObject();
        log.photo_paths = log.photo_paths ? log.photo_paths.split(',') : [];
        logs.push(log);
      }
      wStmt.free();

      // Get project progress
      // Also calculate aggregate progress from all daily work logs
      const logStmt = db.prepare('SELECT percent_done, details FROM pms_daily_work_logs WHERE project_id = ?');
      logStmt.bind([projectId]); // Corrected from `id` to `projectId`
      let totalLogP = 0;
      let logCount = 0;
      while (logStmt.step()) {
        const l = logStmt.getAsObject();
        let p = l.percent_done;
        if (p == null && l.details) {
          try {
            let d = JSON.parse(l.details);
            if (typeof d === 'string') d = JSON.parse(d);
            if (typeof d === 'string') d = JSON.parse(d);
            if (d && d.percent != null) p = d.percent;
          } catch (e) { }
        }
        totalLogP += Number(p || 0);
        logCount++;
      }
      logStmt.free();

      // Get existing project progress (if any)
      const prStmt = db.prepare(
        'SELECT * FROM pms_project_progress WHERE project_id = ? ORDER BY createdAt DESC LIMIT 1'
      );
      prStmt.bind([projectId]);
      let existingProgress = null; // Renamed from `progress` to `existingProgress`
      if (prStmt.step()) {
        existingProgress = prStmt.getAsObject();
      }
      prStmt.free();

      // We'll use the daily logs average as our live progress if there are logs
      // but we cap it at what is specifically recorded. 
      // For a true "Project Progress", we might average the average-per-day.
      // For now, let's just use the average of all sessions.
      const calculatedProgress = logCount > 0 ? Math.round(totalLogP / logCount) : (existingProgress ? existingProgress.progress_percent : 0); // Used existingProgress

      success(res, {
        project: project, // Corrected from `row` to `project`
        logs: logs, // Kept original logs array
        progress: { progress_percent: calculatedProgress },
        calculatedProgress
      });
    } catch (err) {
      console.error('GET /api/pms/projects/:id error:', err);
      failure(res, 'Failed to fetch project details', 500);
    }
  });

  // PUT /api/pms/projects/:id - Update project status (ADMIN only)
  app.put('/api/pms/projects/:id', requireAuth, isPMSAdmin, (req, res) => {
    try {
      const { status } = req.body;
      if (!status) {
        return failure(res, 'Missing status field', 400);
      }

      db.run(
        'UPDATE pms_projects SET status = ? WHERE id = ?',
        [status, req.params.id]
      );
      saveToDB();
      success(res, { message: 'Project updated' });
    } catch (err) {
      console.error('PUT /api/pms/projects/:id error:', err);
      failure(res, 'Failed to update project', 500);
    }
  });

  // DELETE /api/pms/projects/:id - Delete a project and related PMS data (ADMIN only)
  app.delete('/api/pms/projects/:id', requireAuth, isPMSAdmin, (req, res) => {
    try {
      const projectId = req.params.id;
      if (!projectId) return failure(res, 'Missing project id', 400);

      // Delete related weekly tasks, daily logs, photos, progress entries first
      try {
        db.run('DELETE FROM pms_weekly_tasks WHERE project_id = ?', [projectId]);
      } catch (e) { /* ignore */ }
      try {
        // delete photos linked to logs
        const stmt = db.prepare('SELECT id FROM pms_daily_work_logs WHERE project_id = ?');
        stmt.bind([projectId]);
        const logIds = [];
        while (stmt.step()) { logIds.push(stmt.getAsObject().id); }
        stmt.free();
        for (const lid of logIds) {
          try { db.run('DELETE FROM pms_work_photos WHERE work_log_id = ?', [lid]); } catch (e) { }
        }
      } catch (e) { /* ignore */ }
      try { db.run('DELETE FROM pms_daily_work_logs WHERE project_id = ?', [projectId]); } catch (e) { }
      try { db.run('DELETE FROM pms_project_progress WHERE project_id = ?', [projectId]); } catch (e) { }

      // Finally remove the project
      db.run('DELETE FROM pms_projects WHERE id = ?', [projectId]);
      saveToDB();

      success(res, { id: projectId, deleted: true });
    } catch (err) {
      console.error('DELETE /api/pms/projects/:id error:', err);
      failure(res, 'Failed to delete project', 500);
    }
  });

  // GET /api/pms/weekly-tasks?project_id= - List weekly tasks for a project

  // Consolidated WEEKLY-TASKS Route Handler
  app.all(['/api/pms/weekly-tasks', '/pms/weekly-tasks'], requireAuth, (req, res) => {
    try {
      if (req.method === 'GET') {
        const pId = req.query.projectId || req.query.project_id || req.query.id;
        const searchQuery = req.query.search || req.query.q;

        let query = 'SELECT wt.*, p.project_name FROM pms_weekly_tasks wt LEFT JOIN pms_projects p ON p.id = wt.project_id WHERE 1=1';
        const params = [];

        if (pId) {
          query += ' AND wt.project_id = ?';
          params.push(pId);
        }

        if (searchQuery) {
          query += ' AND (wt.task_name LIKE ? OR wt.notes LIKE ?)';
          params.push(`%${searchQuery}%`, `%${searchQuery}%`);
        }

        query += ' ORDER BY wt.week_start_date DESC, wt.createdAt DESC';

        const stmt = db.prepare(query);
        stmt.bind(params);
        const rows = [];
        while (stmt.step()) {
          rows.push(stmt.getAsObject());
        }
        stmt.free();
        return success(res, rows);
      }

      if (req.method === 'POST') {
        const { project_id, week_start_date, task_name, total_quantity, target_quantity, assigned_to, priority, notes } = req.body;
        if (!project_id || !task_name) return failure(res, 'Missing required fields', 400);

        const id = 'wt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        const now = new Date().toISOString();

        db.run(
          `INSERT INTO pms_weekly_tasks (id, project_id, week_start_date, task_name, total_quantity, target_quantity, assigned_to, priority, notes, createdAt)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, project_id, week_start_date || '', task_name, total_quantity || 0, target_quantity || 0, assigned_to || '', priority || 'Medium', notes || '', now]
        );

        saveToDB();
        return success(res, { id, project_id, week_start_date, task_name, total_quantity, target_quantity, assigned_to, priority, notes, createdAt: now });
      }

      failure(res, 'Method not allowed', 405);
    } catch (err) {
      console.error('Weekly tasks handler error:', err);
      failure(res, 'Internal server error', 500);
    }
  });

  // DELETE /api/pms/weekly-tasks/:id - Delete a weekly task (ADMIN only)
  app.delete(['/api/pms/weekly-tasks/:id', '/pms/weekly-tasks/:id'], requireAuth, isPMSAdmin, (req, res) => {
    try {
      const id = req.params.id;
      if (!id) return failure(res, 'Missing id', 400);

      db.run('DELETE FROM pms_weekly_tasks WHERE id = ?', [id]);
      saveToDB();
      success(res, { id, deleted: true });
    } catch (err) {
      console.error('DELETE weekly-task error:', err);
      failure(res, 'Failed to delete weekly task', 500);
    }
  });



  // DELETE /api/pms/projects/:id - Delete project (ADMIN only)
  app.delete(['/api/pms/projects/:id', '/pms/projects/:id'], requireAuth, isPMSAdmin, (req, res) => {
    try {
      const projectId = req.params.id;
      if (!projectId) return failure(res, 'Missing project id', 400);
      try { db.run('DELETE FROM pms_weekly_tasks WHERE project_id = ?', [projectId]); } catch (e) { }
      try {
        const stmt = db.prepare('SELECT id FROM pms_daily_work_logs WHERE project_id = ?');
        stmt.bind([projectId]);
        const logIds = [];
        while (stmt.step()) { logIds.push(stmt.getAsObject().id); }
        stmt.free();
        for (const lid of logIds) { try { db.run('DELETE FROM pms_work_photos WHERE work_log_id = ?', [lid]); } catch (e) { } }
      } catch (e) { }
      try { db.run('DELETE FROM pms_daily_work_logs WHERE project_id = ?', [projectId]); } catch (e) { }
      try { db.run('DELETE FROM pms_project_progress WHERE project_id = ?', [projectId]); } catch (e) { }
      db.run('DELETE FROM pms_projects WHERE id = ?', [projectId]);
      saveToDB();
      success(res, { id: projectId, deleted: true });
    } catch (err) {
      console.error('DELETE project error:', err);
      failure(res, 'Failed to delete project', 500);
    }
  });

  // Consolidated DAILY-WORK Route Handler
  app.all(['/api/pms/daily-work', '/pms/daily-work'], requireAuth, (req, res) => {
    console.log(`DEBUG: [${req.method}] daily-work hit`, { query: req.query, body: req.body });

    try {
      if (req.method === 'GET') {
        const pId = req.query.projectId || req.query.project_id || req.query.id;
        const wDate = req.query.workDate || req.query.work_date || req.query.date;
        const searchQuery = req.query.search || req.query.q;

        let query = `SELECT dw.*, p.project_name, (SELECT file_path FROM pms_work_photos WHERE work_log_id = dw.id LIMIT 1) as photo_path FROM pms_daily_work_logs dw LEFT JOIN pms_projects p ON p.id = dw.project_id WHERE 1=1`;
        const params = [];

        if (pId) {
          query += ' AND dw.project_id = ?';
          params.push(pId);
        }

        if (wDate) {
          query += ' AND dw.work_date = ?';
          params.push(wDate);
        }

        if (searchQuery) {
          query += ' AND (dw.work_done LIKE ? OR dw.details LIKE ?)';
          params.push(`%${searchQuery}%`, `%${searchQuery}%`);
        }

        query += ' ORDER BY dw.work_date DESC, dw.session_number ASC';

        const stmt = db.prepare(query);
        stmt.bind(params);
        const logs = [];
        while (stmt.step()) {
          const log = stmt.getAsObject();
          try { if (log.details) log.details = JSON.parse(log.details); } catch (e) { }
          logs.push(log);
        }
        stmt.free();
        return success(res, logs);
      }

      if (req.method === 'POST') {
        const {
          project_id, projectId,
          work_date, workDate,
          session_number, sessionNumber,
          work_done, workDone,
          percent_done, percentDone,
          details
        } = req.body || {};
        const pId = project_id || projectId;
        const wDate = work_date || workDate;
        const sNum = session_number != null ? session_number : (sessionNumber != null ? sessionNumber : 1);
        if (!pId || !wDate) return failure(res, 'project_id and work_date are required', 400);

        const empId = req.user.employeeId || String(req.user.id);
        const pDone = percent_done != null ? percent_done : (percentDone != null ? percentDone : 0);

        // Handle details: ensure it's a string, but only stringify it ONCE
        let detailsStr = typeof details === 'string' ? details : JSON.stringify(details || {});
        // If it's still double-stringified from frontend, try to fix it
        try { if (detailsStr.startsWith('"')) detailsStr = JSON.parse(detailsStr); } catch (e) { }
        if (typeof detailsStr !== 'string') detailsStr = JSON.stringify(detailsStr);

        // UPSERT LOGIC: Check if entry already exists for same project/date/session
        const existing = db.prepare('SELECT id FROM pms_daily_work_logs WHERE project_id = ? AND work_date = ? AND session_number = ?');
        existing.bind([pId, wDate, sNum]);
        let existingId = null;
        if (existing.step()) {
          existingId = existing.getAsObject().id;
        }
        existing.free();

        if (existingId) {
          db.run(
            `UPDATE pms_daily_work_logs
             SET work_done = ?, percent_done = ?, details = ?, employee_id = ?
             WHERE id = ?`,
            [work_done || workDone || '', pDone, detailsStr, empId, existingId]
          );
        } else {
          const id = 'work_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
          db.run(
            `INSERT INTO pms_daily_work_logs (id, project_id, employee_id, work_date, session_number, work_done, percent_done, details, status, createdAt)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, pId, empId, wDate, sNum, work_done || workDone || '', pDone, detailsStr, 'SUBMITTED', new Date().toISOString()]
          );
        }
        saveToDB();
        return success(res, { status: 'SUBMITTED' });
      }

      if (req.method === 'DELETE') {
        const pId = req.query.projectId || req.query.project_id;
        const wDate = req.query.workDate || req.query.work_date || req.query.date;
        if (!pId || !wDate) return failure(res, 'projectId and work_date are required', 400);

        db.run('DELETE FROM pms_daily_work_logs WHERE project_id = ? AND work_date = ?', [pId, wDate]);
        saveToDB();
        return success(res, { deleted: true });
      }

      return failure(res, 'Method not allowed', 405);
    } catch (err) {
      console.error(`ERROR in [${req.method}] daily-work:`, err);
      return failure(res, 'Internal server error', 500);
    }
  });

  // POST /api/pms/upload-photo - Upload photo for work log
  app.post('/api/pms/upload-photo', requireAuth, uploadPMS.single('photo'), (req, res) => {
    try {
      if (!req.file || !req.body.work_log_id) {
        return failure(res, 'Missing file or work_log_id', 400);
      }

      const id = 'photo_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      const now = new Date().toISOString();
      const filePath = `/uploads/pms/${req.file.filename}`;

      db.run(
        `INSERT INTO pms_work_photos (id, work_log_id, file_path, uploaded_by, createdAt)
       VALUES (?, ?, ?, ?, ?)`,
        [id, req.body.work_log_id, filePath, req.user.id, now]
      );

      saveToDB();
      success(res, { id, work_log_id: req.body.work_log_id, file_path: filePath, createdAt: now });
    } catch (err) {
      console.error('POST /api/pms/upload-photo error:', err);
      failure(res, 'Failed to upload photo', 500);
    }
  });

  // PUT /api/pms/daily-work/:id - Update work log with admin's approved work_left
  app.put('/api/pms/daily-work/:id', requireAuth, isPMSAdmin, (req, res) => {
    try {
      const { approved_work_left, status } = req.body;

      let updateSQL = 'UPDATE pms_daily_work_logs SET ';
      let updates = [];
      let params = [];

      if (approved_work_left !== undefined) {
        updates.push('approved_work_left = ?');
        params.push(approved_work_left);
      }
      if (status) {
        updates.push('status = ?');
        params.push(status);
      }

      if (updates.length === 0) {
        return failure(res, 'No updates provided', 400);
      }

      updateSQL += updates.join(', ') + ' WHERE id = ?';
      params.push(req.params.id);

      db.run(updateSQL, params);
      saveToDB();
      success(res, { message: 'Work log updated' });
    } catch (err) {
      console.error('PUT /api/pms/daily-work/:id error:', err);
      failure(res, 'Failed to update work log', 500);
    }
  });

  // PUT /api/pms/progress - Update project progress (ADMIN only)
  app.put('/api/pms/progress', requireAuth, isPMSAdmin, (req, res) => {
    try {
      const { project_id, progress_percent, remarks } = req.body;
      if (!project_id || progress_percent === undefined) {
        return failure(res, 'Missing required fields', 400);
      }

      const id = 'prog_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      const now = new Date().toISOString();

      db.run(
        `INSERT INTO pms_project_progress (id, project_id, progress_percent, remarks, updated_by, createdAt)
       VALUES (?, ?, ?, ?, ?, ?)`,
        [id, project_id, progress_percent, remarks || '', req.user.id, now]
      );

      saveToDB();
      success(res, { id, project_id, progress_percent, remarks, createdAt: now });
    } catch (err) {
      console.error('PUT /api/pms/progress error:', err);
      failure(res, 'Failed to update progress', 500);
    }
  });

  // GET /api/pms/reports/project/:id - Project report (ADMIN only)
  app.get('/api/pms/reports/project/:id', requireAuth, isPMSAdmin, (req, res) => {
    try {
      const projectId = req.params.id;

      // Get project
      const pStmt = db.prepare('SELECT * FROM pms_projects WHERE id = ?');
      pStmt.bind([projectId]);
      if (!pStmt.step()) {
        pStmt.free();
        return failure(res, 'Project not found', 404);
      }
      const project = pStmt.getAsObject();
      pStmt.free();

      // Get work logs
      const wStmt = db.prepare(
        'SELECT * FROM pms_daily_work_logs WHERE project_id = ? ORDER BY work_date ASC, session_number ASC'
      );
      wStmt.bind([projectId]);
      const logs = [];
      while (wStmt.step()) {
        logs.push(wStmt.getAsObject());
      }
      wStmt.free();

      // Group by date
      const dayWiseProgress = {};
      logs.forEach(log => {
        if (!dayWiseProgress[log.work_date]) {
          dayWiseProgress[log.work_date] = { session1: null, session2: null };
        }
        dayWiseProgress[log.work_date][`session${log.session_number}`] = {
          work_done: log.work_done,
          work_left: log.work_left,
          status: log.status
        };
      });

      const uniqueDates = new Set(logs.map(l => l.work_date));
      const totalDays = uniqueDates.size;
      const completedSessions = logs.filter(l => l.status === 'APPROVED').length;
      const totalSessions = logs.length;

      // Get latest progress
      const prStmt = db.prepare(
        'SELECT * FROM pms_project_progress WHERE project_id = ? ORDER BY createdAt DESC LIMIT 1'
      );
      prStmt.bind([projectId]);
      let progressPercent = 0;
      let remarks = '';
      if (prStmt.step()) {
        const prog = prStmt.getAsObject();
        progressPercent = prog.progress_percent;
        remarks = prog.remarks;
      }
      prStmt.free();

      success(res, {
        project,
        totalDays,
        completedSessions,
        totalSessions,
        dayWiseProgress: Object.entries(dayWiseProgress).map(([date, sessions]) => ({ date, ...sessions })),
        progressPercent,
        remarks
      });
    } catch (err) {
      console.error('GET /api/pms/reports/project/:id error:', err);
      failure(res, 'Failed to generate project report', 500);
    }
  });

  // GET /api/pms/reports/employee/:id - Employee report (ADMIN only)
  app.get('/api/pms/reports/employee/:id', requireAuth, isPMSAdmin, (req, res) => {
    try {
      const employeeId = req.params.id;

      // Get employee
      const eStmt = db.prepare('SELECT * FROM employees WHERE id = ?');
      eStmt.bind([employeeId]);
      if (!eStmt.step()) {
        eStmt.free();
        return failure(res, 'Employee not found', 404);
      }
      const employee = eStmt.getAsObject();
      eStmt.free();

      // Get assigned projects
      const pStmt = db.prepare('SELECT * FROM pms_projects WHERE assigned_employee_id = ?');
      pStmt.bind([employeeId]);
      let projectCount = 0;
      while (pStmt.step()) projectCount++;
      pStmt.free();

      // Get work logs
      const wStmt = db.prepare(
        'SELECT * FROM pms_daily_work_logs WHERE employee_id = ?'
      );
      wStmt.bind([employeeId]);
      const logs = [];
      while (wStmt.step()) {
        logs.push(wStmt.getAsObject());
      }
      wStmt.free();

      const totalWorkingDays = new Set(logs.map(l => l.work_date)).size;
      const totalSessionsCompleted = logs.filter(l => l.status === 'APPROVED').length;
      const pendingLogs = logs.filter(l => l.status === 'PENDING' || l.status === 'SUBMITTED');
      const pendingWork = pendingLogs.length > 0 ? `${pendingLogs.length} sessions pending` : 'None';

      success(res, {
        employee,
        totalWorkingDays,
        totalSessionsCompleted,
        pendingWork,
        projectsAssigned: projectCount
      });
    } catch (err) {
      console.error('GET /api/pms/reports/employee/:id error:', err);
      failure(res, 'Failed to generate employee report', 500);
    }
  });

  console.log('PMS ROUTES SUCCESSFULLY REGISTERED');
} catch (pmsError) {
  console.error('CRITICAL: PMS routes registration failed', pmsError);
}

// --- CRM Leads Module ---

function ensureCrmLeadsTable() {
  try {
    const chk = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='crm_leads'");
    const has = chk.step();
    chk.free();
    if (!has) {
      console.log('crm_leads table missing — creating table');
      db.run(`CREATE TABLE crm_leads (
        id TEXT PRIMARY KEY,
        s_no INTEGER,
        date TEXT,
        name TEXT,
        mobile TEXT,
        source TEXT,
        site_visit INTEGER DEFAULT 0,
        status TEXT,
        priority TEXT,
        next_followup_date TEXT,
        deal_value REAL,
        remarks TEXT,
        assigned_to TEXT,
        created_at TEXT,
        updated_at TEXT
      )`);
      persistDB();
      console.log('crm_leads table created');
    }
  } catch (err) {
    console.error('ensureCrmLeadsTable failed', err);
    throw err;
  }
}

app.get('/api/crm/leads', requireAuth, (req, res) => {
  try {
    ensureCrmLeadsTable();
    const stmt = db.prepare('SELECT * FROM crm_leads ORDER BY s_no DESC');
    const out = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      row.site_visit = !!row.site_visit;
      out.push(row);
    }
    stmt.free();
    return success(res, out);
  } catch (err) {
    console.error('GET /api/crm/leads error:', err);
    return failure(res, 'Internal server error', 500);
  }
});

app.post('/api/crm/leads', requireAuth, (req, res) => {
  try {
    ensureCrmLeadsTable();
    const { name, mobile, source, site_visit, status, priority, next_followup_date, deal_value, remarks, assigned_to } = req.body || {};
    if (!name || !mobile) return failure(res, 'Name and Mobile are required', 400);

    const id = `CRM-${Date.now()}`;
    
    // Auto increment s_no
    let s_no = 1;
    try {
      const q = db.prepare("SELECT MAX(s_no) as maxNum FROM crm_leads");
      if (q.step()) {
        const data = q.getAsObject();
        if (data.maxNum) s_no = data.maxNum + 1;
      }
      q.free();
    } catch(e) {}

    const now = new Date().toISOString();
    const date = now.split('T')[0];

    const insert = db.prepare('INSERT INTO crm_leads (id, s_no, date, name, mobile, source, site_visit, status, priority, next_followup_date, deal_value, remarks, assigned_to, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
    insert.run([id, s_no, date, name, mobile, source || 'Call', site_visit ? 1 : 0, status || 'New', priority || 'Warm', next_followup_date || null, deal_value || 0, remarks || null, assigned_to || null, now, now]);
    insert.free && insert.free();
    persistDB();
    return success(res, { id, s_no }, 'Lead created', 201);
  } catch (err) {
    console.error('POST /api/crm/leads error:', err);
    return failure(res, 'Internal server error', 500);
  }
});

app.put('/api/crm/leads/:id', requireAuth, (req, res) => {
  try {
    ensureCrmLeadsTable();
    const id = req.params.id;
    const { name, mobile, source, site_visit, status, priority, next_followup_date, deal_value, remarks, assigned_to } = req.body || {};

    const chk = db.prepare('SELECT id FROM crm_leads WHERE id = ?');
    chk.bind([id]);
    if (!chk.step()) { chk.free(); return failure(res, 'Not found', 404); }
    chk.free();

    const now = new Date().toISOString();
    const update = db.prepare('UPDATE crm_leads SET name = coalesce(?, name), mobile = coalesce(?, mobile), source = coalesce(?, source), site_visit = coalesce(?, site_visit), status = coalesce(?, status), priority = coalesce(?, priority), next_followup_date = coalesce(?, next_followup_date), deal_value = coalesce(?, deal_value), remarks = coalesce(?, remarks), assigned_to = coalesce(?, assigned_to), updated_at = ? WHERE id = ?');
    
    update.run([name || null, mobile || null, source || null, site_visit == null ? null : (site_visit ? 1 : 0), status || null, priority || null, next_followup_date !== undefined ? next_followup_date : null, deal_value !== undefined ? deal_value : null, remarks !== undefined ? remarks : null, assigned_to !== undefined ? assigned_to : null, now, id]);
    update.free && update.free();
    persistDB();
    return success(res, null, 'Lead updated');
  } catch (err) {
    console.error('PUT /api/crm/leads/:id error:', err);
    return failure(res, 'Internal server error', 500);
  }
});

app.delete('/api/crm/leads/:id', requireAuth, (req, res) => {
  try {
    // Only admins can delete CRM leads
    if (!req.user || !['ADMIN', 'SUPER_ADMIN'].includes(req.user.role)) {
      return failure(res, 'Forbidden', 403);
    }
    ensureCrmLeadsTable();
    const id = req.params.id;

    const chk = db.prepare('SELECT id FROM crm_leads WHERE id = ?');
    chk.bind([id]);
    if (!chk.step()) { chk.free(); return failure(res, 'Lead not found', 404); }
    chk.free();

    const del = db.prepare('DELETE FROM crm_leads WHERE id = ?');
    del.run([id]);
    del.free && del.free();
    persistDB();
    return success(res, null, 'Lead deleted');
  } catch (err) {
    console.error('DELETE /api/crm/leads/:id error:', err);
    return failure(res, 'Internal server error', 500);
  }
});

// Catch-all for any unmatched API routes — return JSON 404 instead of falling through to static host/index.html
app.use('/api', (req, res) => {
  console.warn('Unmatched API request', { method: req.method, path: req.path, origin: req.headers.origin || null, cookies: req.headers.cookie || null });
  return failure(res, 'Not found', 404);
});

// Central error handler (catches errors passed with next(err))
app.use((err, req, res, next) => {
  console.error('Unhandled API error', { path: req && req.path, method: req && req.method, err: err && (err.stack || err.message || err) });
  try { failure(res, 'Internal server error', 500); } catch (e) { /* ignore */ }
});

/* ───────── CHECKLIST EMAIL REMINDERS CRON ───────── */
// Default transporter setup (update credentials via env vars)
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false, // true for 465, false for other ports
  tls: { rejectUnauthorized: false }, // Avoids strict SSL breaking on local transparent proxies/antivirus
  auth: {
    user: process.env.SMTP_USER || 'your-email@gmail.com',
    pass: process.env.SMTP_PASS || 'your-app-password'
  }
});

function getCutoffDays(freq) {
  if (freq === 'WEEKLY') return 2;
  if (['MONTHLY', 'QUARTERLY', 'HALF-YEARLY', 'YEARLY', 'PARTICULAR-DATE', 'EVENT-BASED', 'FORTNIGHTLY', 'ONE-TIME'].includes(freq)) return 4;
  return 0; // DAILY or ALTERNATE
}

// Run every morning at 09:00 AM
cron.schedule('0 9 * * *', () => {
  console.log('Running daily checklist reminder cron at 9:00 AM');
  try {
    const today = new Date();
    today.setHours(0,0,0,0);

    // Get all pending checklist instances
    const stmt = db.prepare("SELECT c.id as dbId, c.item, c.refId as templateId FROM checklists c WHERE c.done = 0 AND c.refType = 'TEMPLATE_INSTANCE'");
    
    // Get templates for matching
    const tplStmt = db.prepare("SELECT id, data FROM checklist_templates");
    const templates = {};
    while (tplStmt.step()) {
       const row = tplStmt.getAsObject();
       try { templates[row.id] = JSON.parse(row.data); } catch(e){}
    }
    tplStmt.free();

    // Get users map for email lookups
    const userStmt = db.prepare("SELECT id, employeeId, email, name FROM users");
    const users = {};
    while(userStmt.step()) {
      const row = userStmt.getAsObject();
      if(row.employeeId && String(row.employeeId).trim() !== '') users[String(row.employeeId)] = row;
      users[String(row.id)] = row;
    }
    userStmt.free();

    // Employee map for fallback email lookups
    const empStmt = db.prepare("SELECT id, email, name FROM employees");
    while(empStmt.step()) {
      const row = empStmt.getAsObject();
      if(row.id && !users[String(row.id)]) users[String(row.id)] = row;
    }
    empStmt.free();

    const emailsToSend = {}; // Map mapped by email to array of task names

    while (stmt.step()) {
      const row = stmt.getAsObject();
      let item;
      try { item = JSON.parse(row.item); } catch(e) { continue; }
      const template = templates[row.templateId];
      if (!template) continue;

      const doerId = String(item.doerId || template.doerId);
      const user = users[doerId];
      if (!user || !user.email) continue;

      const freq = template.config ? template.config.frequency : '';
      const cutoffDays = getCutoffDays(freq);

      const targetDateStr = item.date;
      const [yyyy, mm, dd] = targetDateStr.split('-');
      const targetDate = new Date(yyyy, mm - 1, dd);
      targetDate.setHours(0,0,0,0);
      
      const diffTime = targetDate.getTime() - today.getTime();
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

      // Condition: Target date should be coming up soon (within cutoff days) or overdue (diffDays <= 0)
      if (diffDays <= cutoffDays) {
         if (!emailsToSend[user.email]) emailsToSend[user.email] = { name: user.name, tasks: [] };
         const isOverdue = diffDays < 0;
         const isToday = diffDays === 0;
         const remainingText = isOverdue ? 'Overdue by ' + Math.abs(diffDays) + ' days' : (isToday ? 'DUE TODAY' : 'Due in ' + diffDays + ' days');
         emailsToSend[user.email].tasks.push(`- ${item.taskName || template.taskName || 'Routine Task'} (${remainingText}: ${targetDateStr})`);
      }
    }
    stmt.free();

    for (const email in emailsToSend) {
       const userTasks = emailsToSend[email];
       const taskList = userTasks.tasks.join('\\n');
       const mailOptions = {
         from: '"FMS Checklists" <' + (process.env.SMTP_USER || 'noreply@fms.local') + '>',
         to: email,
         subject: 'Checklist Reminder: You have pending tasks',
         text: `Hello ${userTasks.name},\\n\\nThis is a reminder that you have the following tasks pending in your checklist:\\n\\n${taskList}\\n\\nPlease log in to the FMS portal to complete them.\\n\\nRegards,\\nFMS Admin`
       };
       transporter.sendMail(mailOptions).catch(err => console.warn('Cron email error to', email, err.message));
       console.log('Cron dispatched email to', email, 'with', userTasks.tasks.length, 'tasks');
    }

  } catch (err) {
    console.error('Checklist cron job failed', err);
    try { if (stmt) stmt.free(); } catch(e){}
  }
});

// CRM Daily Report Cron (runs at 8:00 PM)
cron.schedule('0 20 * * *', () => {
  console.log('Running daily CRM report cron at 8:00 PM');
  try {
    ensureCrmLeadsTable();
    const todayStr = new Date().toISOString().split('T')[0];
    
    const stmt = db.prepare('SELECT * FROM crm_leads');
    const leads = [];
    while (stmt.step()) {
      leads.push(stmt.getAsObject());
    }
    stmt.free();

    const todayLeads = leads.filter(l => l.date === todayStr || (l.created_at && l.created_at.startsWith(todayStr)));
    const totalToday = todayLeads.length;
    const siteVisitsToday = todayLeads.filter(l => l.site_visit).length;
    
    // Overall Stats
    const totalLeads = leads.length;
    const siteVisits = leads.filter(l => l.site_visit).length;
    const closed = leads.filter(l => l.status === 'Closed').length;
    const conversion = totalLeads > 0 ? Math.round((closed / totalLeads) * 100) : 0;

    const mailOptions = {
      from: '"CRM System" <' + (process.env.SMTP_USER || 'noreply@fms.local') + '>',
      to: process.env.SMTP_USER || 'admin@example.com',
      subject: `Daily CRM Report: ${todayStr}`,
      text: `Hello,\\n\\nHere is the CRM report for today (${todayStr}):\\n\\nNew Leads Today: ${totalToday}\\nSite Visits Today: ${siteVisitsToday}\\n\\nOverall Metrics:\\nTotal Leads: ${totalLeads}\\nTotal Site Visits: ${siteVisits}\\nConversion Rate: ${conversion}%\\nClosed Deals: ${closed}\\n\\nRegards,\\nCRM Automation`
    };
    transporter.sendMail(mailOptions).catch(err => console.warn('CRM Cron email error:', err.message));
    console.log('CRM daily report dispatched');
  } catch (err) {
    console.error('CRM cron job failed', err);
  }
});

const port = process.env.PORT || 4001;
// Explicitly bind to 0.0.0.0 to avoid IPv6/IPv4 loopback inconsistencies on some Windows setups
// Export the express app so it can be embedded into other servers (like Vite dev server)
export default app;

// Only start listening when NOT embedded by a host (embedding tool should set VITE_EMBEDDED=1)
if (process.env.VITE_EMBEDDED !== '1') {
  const server = app.listen(port, '0.0.0.0', () => console.log(`Auth server listening on http://0.0.0.0:${port}`));
  server.on('error', (err) => {
    console.error('Server error', err);
    if (err && err.code === 'EADDRINUSE') {
      console.error(`EADDRINUSE: Port ${port} already in use. On Windows run: netstat -ano | findstr :${port} and then taskkill /PID <pid> /F to free it.`);
    }
  });

  server.on('close', () => console.log('Server closed'));

  process.on('exit', (code) => console.log('Process exit code', code));
  process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down');
    server.close(() => {
      console.log('Server closed due to SIGINT');
      process.exit(0);
    });
    // Fallback to force exit if close hangs
    setTimeout(() => {
      console.error('SIGINT shutdown did not complete, forcing exit');
      process.exit(1);
    }, 5000);
  });
  process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down');
    server.close(() => {
      console.log('Server closed due to SIGTERM');
      process.exit(0);
    });
    setTimeout(() => {
      console.error('SIGTERM shutdown did not complete, forcing exit');
      process.exit(1);
    }, 5000);
  });
  console.log('server object leaked (exists)?', true);
} else {
  console.log('Server loaded for embedding (VITE_EMBEDDED=1), not listening on TCP port.');
}
