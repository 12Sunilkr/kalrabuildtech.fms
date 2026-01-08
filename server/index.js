import express from 'express';
import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import { runMigrations } from './migrations.js';
import { success, failure } from './utils/respond.js';

const app = express();

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
// Prevent accidental writes outside the server directory (avoid path traversal or absolute paths elsewhere)
if (!dbFile.startsWith(__dirname + path.sep) && dbFile !== path.join(__dirname, DB_FILENAME)) {
  throw new Error(`DB file must be inside server directory: ${dbFile}`);
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
    fs.writeFileSync(dbFile, Buffer.from(db.export()));
    console.log('Created', dbFile, 'and seeded default admin user');
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

    // Queries
    const tblQ = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='queries'");
    const hasQ = tblQ.step(); tblQ.free();
    if (!hasQ) {
      db.run(`CREATE TABLE queries (
        id TEXT PRIMARY KEY,
        userId TEXT,
        question TEXT,
        answer TEXT,
        status TEXT,
        createdAt TEXT
      )`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_queries_userId ON queries(userId)`);
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

    // Helpful indexes
    db.run(`CREATE INDEX IF NOT EXISTS idx_tasks_assignedTo ON tasks(assignedTo)`);

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

    fs.writeFileSync(dbFile, Buffer.from(db.export()));
    console.log('Additional feature tables ensured');

    // Run idempotent migrations that ensure standard columns/indexes for modules
    try {
      await runMigrations({ db, dbFile });
    } catch (e) {
      console.warn('runMigrations failed', e && (e.message || e));
    }
  } catch (e) {
    console.warn('Failed to ensure additional tables', e && (e.message || e));
  }

  // Mark the app as ready for embedded hosts
  app.set('ready', true);
  console.log('Server initialization complete, DB ready');
} catch (err) {
  console.error('Failed to initialize SQL.js or DB:', err && (err.stack || err.message || err));
  // When embedded into another process (e.g., Vite dev server) we should not terminate the host process.
  // Throw the error so the importer can decide how to handle it.
  throw err;
}

// Helper to persist DB file and surface errors
function persistDB() {
  try {
    fs.writeFileSync(dbFile, Buffer.from(db.export()));
    return true;
  } catch (e) {
    console.error('Failed to persist DB file', e && (e.stack || e.message || e));
    return false;
  }
}

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
    fs.writeFileSync(dbFile, Buffer.from(db.export()));
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
    fs.writeFileSync(dbFile, Buffer.from(db.export()));
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

    const required = ['id', 'title', 'description', 'assignedTo', 'priority', 'dueDate', 'createdAt'];
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

    if (altered) fs.writeFileSync(dbFile, Buffer.from(db.export()));
  }
} catch (err) {
  console.error('Tasks table check failed', err && (err.stack || err.message || err));
}

// Persist DB in case we created/altered tables
fs.writeFileSync(dbFile, Buffer.from(db.export()));

// Ensure legacy client default admin exists (admin@fms.com / admin)
try {
  const chk = db.prepare('SELECT id FROM users WHERE lower(email) = ?');
  chk.bind(['admin@fms.com']);
  if (!chk.step()) {
    chk.free();
    const ins = db.prepare('INSERT INTO users (name, email, password, role, employeeId) VALUES (?,?,?,?,?)');
    ins.run(['Administrator', 'admin@fms.com', bcrypt.hashSync('admin', 10), 'ADMIN', null]);
    ins.free && ins.free();
    fs.writeFileSync(dbFile, Buffer.from(db.export()));
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
app.use(express.json());
app.use(cookieParser());

// Ensure upload directories exist and configure multer
const uploadsRoot = path.join(__dirname, 'uploads');
const profileDir = path.join(uploadsRoot, 'profile');
const documentsDir = path.join(uploadsRoot, 'documents');
try {
  if (!fs.existsSync(uploadsRoot)) fs.mkdirSync(uploadsRoot);
  if (!fs.existsSync(profileDir)) fs.mkdirSync(profileDir);
  if (!fs.existsSync(documentsDir)) fs.mkdirSync(documentsDir);
} catch (e) {
  console.warn('Failed to create uploads directories', e && (e.message || e));
}

// Multer setup
const allowedExt = ['.jpg', '.jpeg', '.png', '.pdf'];
const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!allowedExt.includes(ext)) return cb(null, false);
  return cb(null, true);
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
    fs.writeFileSync(dbFile, Buffer.from(db.export()));
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
            const id = t.id || genId('T-');
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
  res.clearCookie('token', { path: '/', httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'none' });
  return success(res, null, 'Logged out');
});

// Users CRUD API
app.get('/api/users', requireAuth, (req, res) => {
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

    fs.writeFileSync(dbFile, Buffer.from(db.export()));
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
    fs.writeFileSync(dbFile, Buffer.from(db.export()));
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
    fs.writeFileSync(dbFile, Buffer.from(db.export()));
    return success(res, null, 'Archived');
  } catch (err) {
    console.error('Users DELETE (archive) error', { path: req.path, err: err && (err.stack || err.message || err) });
    return failure(res, 'Internal server error', 500);
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
      fs.writeFileSync(dbFile, Buffer.from(db.export()));

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
      fs.writeFileSync(dbFile, Buffer.from(db.export()));
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
        compOffBalance REAL
      )`);
      fs.writeFileSync(dbFile, Buffer.from(db.export()));
      console.log('Employees table created');
    }
  } catch (err) {
    console.error('ensureEmployeesTable failed', { err: err && (err.stack || err.message || err) });
    // rethrow so caller can handle
    throw err;
  }
}

app.get('/api/employees', requireAuth, (req, res) => {
  try {
    ensureEmployeesTable();
    const archived = req.query.archived === '1' || req.query.archived === 'true';
    const isAdmin = req.user && req.user.role === 'ADMIN';
    if (isAdmin) {
      console.log('GET /api/employees from', req.headers.origin || 'no-origin');
      const q = archived ? 'SELECT id, name, department, joiningDate, createdAt, status, designation, email, phone, birthDate, address, documents, compOffBalance, archived_at FROM employees WHERE coalesce(is_archived, 0) = 1' : 'SELECT id, name, department, joiningDate, createdAt, status, designation, email, phone, birthDate, address, documents, compOffBalance FROM employees WHERE coalesce(is_archived, 0) = 0';
      const stmt = db.prepare(q);
      const out = [];
      while (stmt.step()) {
        const row = stmt.getAsObject();
        if (row.documents) {
          try { row.documents = JSON.parse(row.documents); } catch (e) { console.warn('Failed to parse documents JSON for employee', row.id, e); }
        }
        out.push(row);
      }
      stmt.free();
      return success(res, out || []);
    } else if (req.user && req.user.employeeId) {
      const stmt = db.prepare('SELECT id, name, department, joiningDate, createdAt, status, designation, email, phone, birthDate, address, documents, compOffBalance FROM employees WHERE id = ? AND coalesce(is_archived, 0) = 0');
      stmt.bind([req.user.employeeId]);
      if (!stmt.step()) { stmt.free(); return failure(res, 'Not found', 404); }
      const row = stmt.getAsObject();
      if (row.documents) {
        try { row.documents = JSON.parse(row.documents); } catch (e) { console.warn('Failed to parse documents JSON for employee', row.id, e); }
      }
      stmt.free();
      return success(res, [row]);
    } else {
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

    const stmt = db.prepare('SELECT id, name, department, joiningDate, createdAt, status, designation, email, phone, birthDate, address, documents, compOffBalance FROM employees WHERE id = ?');
    stmt.bind([id]);
    if (!stmt.step()) { stmt.free(); return failure(res, 'Not found', 404); }
    const row = stmt.getAsObject();
    if (row.documents) {
      try { row.documents = JSON.parse(row.documents); } catch (e) { console.warn('Failed to parse documents JSON for employee', req.params.id, e); }
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
    const { id, name, department, joiningDate, createdAt, status, designation, email, phone, birthDate, address, documents, compOffBalance } = req.body || {};
    if (!id || !name) return failure(res, 'Missing fields', 400);
    const check = db.prepare('SELECT id FROM employees WHERE id = ?');
    check.bind([id]);
    if (check.step()) { check.free(); return failure(res, 'Employee ID already exists', 409); }
    check.free();

    const docs = documents ? JSON.stringify(documents) : null;
    const insert = db.prepare('INSERT INTO employees (id, name, department, joiningDate, createdAt, status, designation, email, phone, birthDate, address, documents, compOffBalance) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)');
    insert.run([id, name, department || null, joiningDate || null, createdAt || new Date().toISOString(), status || 'Active', designation || null, email || null, phone || null, birthDate || null, address || null, docs, compOffBalance || 0]);
    insert.free && insert.free();
    fs.writeFileSync(dbFile, Buffer.from(db.export()));
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
    const { name, department, joiningDate, createdAt, status, designation, email, phone, birthDate, address, documents, compOffBalance, is_archived } = req.body || {};
    const stmt = db.prepare('SELECT id FROM employees WHERE id = ?');
    stmt.bind([id]);
    if (!stmt.step()) { stmt.free(); return failure(res, 'Not found', 404); }
    stmt.free();

    const docs = documents ? JSON.stringify(documents) : null;
    // If setting is_archived, record archived_at timestamp when archiving
    const archivedAt = is_archived ? new Date().toISOString() : null;

    const update = db.prepare('UPDATE employees SET name = coalesce(?, name), department = coalesce(?, department), joiningDate = coalesce(?, joiningDate), createdAt = coalesce(?, createdAt), status = coalesce(?, status), designation = coalesce(?, designation), email = coalesce(?, email), phone = coalesce(?, phone), birthDate = coalesce(?, birthDate), address = coalesce(?, address), documents = coalesce(?, documents), compOffBalance = coalesce(?, compOffBalance), is_archived = coalesce(?, is_archived), archived_at = coalesce(?, archived_at) WHERE id = ?');
    update.run([name || null, department || null, joiningDate || null, createdAt || null, status || null, designation || null, email || null, phone || null, birthDate || null, address || null, docs || null, compOffBalance || null, is_archived == null ? null : (is_archived ? 1 : 0), archivedAt, id]);
    update.free && update.free();
    fs.writeFileSync(dbFile, Buffer.from(db.export()));
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
    fs.writeFileSync(dbFile, Buffer.from(db.export()));
    return success(res, null, 'Archived');
  } catch (err) {
    console.error('Employees DELETE error', { path: req.path, err: err && (err.stack || err.message || err) });
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
      fs.writeFileSync(dbFile, Buffer.from(db.export()));
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
      fs.writeFileSync(dbFile, Buffer.from(db.export()));
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
      fs.writeFileSync(dbFile, Buffer.from(db.export()));
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
app.get('/api/attendance', requireAuth, (req, res) => {
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
    fs.writeFileSync(dbFile, Buffer.from(db.export()));
    return success(res, null, 'Created', 201);
  } catch (err) {
    console.error('Attendance POST error', { path: req.path, err: err && (err.stack || err.message || err) });
    return failure(res, 'Internal server error', 500);
  }
});

app.put('/api/attendance/:id', requireAuth, (req, res) => {
  try {
    const id = req.params.id;
    const { clockIn, clockOut, value, location, notes } = req.body || {};
    const stmt = db.prepare('SELECT id FROM attendance WHERE id = ?');
    stmt.bind([id]);
    if (!stmt.step()) { stmt.free(); return failure(res, 'Not found', 404); }
    stmt.free();
    const update = db.prepare('UPDATE attendance SET clockIn = coalesce(?, clockIn), clockOut = coalesce(?, clockOut), value = coalesce(?, value), location = coalesce(?, location), notes = coalesce(?, notes) WHERE id = ?');
    update.run([clockIn || null, clockOut || null, value == null ? null : value, location || null, notes || null, id]);
    update.free && update.free();
    fs.writeFileSync(dbFile, Buffer.from(db.export()));
    return success(res, null, 'Updated');
  } catch (err) {
    console.error('Attendance PUT error', { path: req.path, err: err && (err.stack || err.message || err) });
    return failure(res, 'Internal server error', 500);
  }
});

app.delete('/api/attendance/:id', requireAuth, (req, res) => {
  try {
    const id = req.params.id;
    const del = db.prepare('DELETE FROM attendance WHERE id = ?');
    del.run([id]);
    del.free();
    fs.writeFileSync(dbFile, Buffer.from(db.export()));
    return success(res, null, 'Deleted');
  } catch (err) {
    console.error('Attendance DELETE error', { path: req.path, err: err && (err.stack || err.message || err) });
    return failure(res, 'Internal server error', 500);
  }
});

// Time logs endpoints
app.get('/api/timelogs', requireAuth, (req, res) => {
  try {
    const userId = req.query.userId;
    let q = 'SELECT id, userId, startTime, endTime, task, notes, createdAt FROM timelogs';
    const params = [];
    if (userId) { q += ' WHERE userId = ?'; params.push(userId); }
    const stmt = db.prepare(q);
    stmt.bind(params);
    const out = [];
    while (stmt.step()) out.push(stmt.getAsObject());
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
    fs.writeFileSync(dbFile, Buffer.from(db.export()));
  }

  // Run migrations: add missing compatibility columns without altering existing primary key type
  const colsStmt2 = db.prepare("PRAGMA table_info('tasks')");
  const colsSet = new Set();
  while (colsStmt2.step()) colsSet.add(String(colsStmt2.getAsObject().name));
  colsStmt2.free();
  const addIfMissing = (name, sql) => {
    if (!colsSet.has(name)) {
      try { db.run(sql); console.log('Added tasks column (migration):', name); fs.writeFileSync(dbFile, Buffer.from(db.export())); } catch (e) { console.warn('Failed to add tasks column', name, e && (e.message || e)); }
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
        const id = genId('T-');
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
      fs.writeFileSync(dbFile, Buffer.from(db.export()));

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
app.get('/api/tasks', requireAuth, (req, res) => {
  try {
    if (!req.user) return failure(res, 'Unauthorized', 401);

    const isAdmin = req.user.role === 'ADMIN';

    // Use LEFT JOIN to include assigner and assignee names directly
    const base = `
      SELECT t.id, t.title, t.description, t.priority, t.due_date, t.assigned_to, t.assignedTo as assignedToStr, t.status, t.created_at,
             ua.name AS assignedByName, ua.employeeId AS assignedByEmployeeId,
             ub.name AS assignedToName, ub.employeeId AS assignedToEmployeeId,
             t.extensionHistory, t.extensionRequest
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
      const updateStmt = db.prepare('UPDATE tasks SET title = coalesce(?, title), description = coalesce(?, description), assignedTo = coalesce(?, assignedTo), assignedBy = coalesce(?, assignedBy), priority = coalesce(?, priority), dueDate = coalesce(?, dueDate), assigned_to = coalesce(?, assigned_to), assigned_by = coalesce(?, assigned_by), due_date = coalesce(?, due_date), status = coalesce(?, status), statusNote = coalesce(?, statusNote), extensionRequest = coalesce(?, extensionRequest), extensionHistory = coalesce(?, extensionHistory), createdAt = coalesce(?, createdAt), created_at = coalesce(?, created_at) WHERE id = ?');

      // If assignment changed, set assignedBy/assigned_by to current user
      const assignerCamel = (updates.assignedTo && updates.assignedTo !== existing.assignedTo) ? String(req.user.id) : null;
      const assignerNumeric = (updates.assignedTo && updates.assignedTo !== existing.assignedTo) ? Number(req.user.id) : null;

      // Convert extension fields to JSON strings for storage (or null if not provided)
      const extReqStr = updates.extensionRequest ? (typeof updates.extensionRequest === 'string' ? updates.extensionRequest : JSON.stringify(updates.extensionRequest)) : null;
      const extHistStr = updates.extensionHistory ? (typeof updates.extensionHistory === 'string' ? updates.extensionHistory : JSON.stringify(updates.extensionHistory)) : null;

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
        updates.title || null,
        updates.description || null,
        assignedToEmp || updates.assignedTo || null,
        assignerCamel,
        updates.priority || null,
        updates.dueDate || updates.due_date || null,
        assigned_to_val || updates.assigned_to || null,
        assignerNumeric,
        updates.dueDate || updates.due_date || null,
        (updates.status || null),
        (updates.statusNote || null),
        extReqStr,
        extHistStr,
        updates.createdAt || null,
        updates.created_at || null,
        id
      ]);
      updateStmt.free();

      db.run('COMMIT');
      if (!persistDB()) console.warn('Tasks PUT: commit succeeded but failed to persist DB file');
      else console.log('Tasks PUT: updated task persisted to DB file');
      console.log('Tasks PUT: updated task', { id, assigned_to_val, assignedToEmp, assignerNumeric: assignerNumeric });

      const outStmt = db.prepare('SELECT id, title, description, assignedTo, assigned_to, priority, dueDate, due_date, status, createdAt, created_at, assignedBy FROM tasks WHERE id = ?');
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
      fs.writeFileSync(dbFile, Buffer.from(db.export()));
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
      fs.writeFileSync(dbFile, Buffer.from(db.export()));
      return success(res, { id }, 'Created', 201);
    } catch (e) { try { db.run('ROLLBACK'); } catch (er) { } throw e; }
  } catch (err) { console.error('Finance POST error', err && (err.stack || err.message || err)); return failure(res, 'Internal server error', 500); }
});

app.get('/api/finance', requireAuth, (req, res) => {
  try {
    const stmt = db.prepare('SELECT id, amount, currency, type, description, date, createdBy, createdAt FROM finance ORDER BY date DESC');
    const out = [];
    while (stmt.step()) out.push(stmt.getAsObject());
    stmt.free();
    return success(res, out || []);
  } catch (err) { console.error('Finance GET error', err && (err.stack || err.message || err)); return failure(res, 'Internal server error', 500); }
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
              try { db.run('ROLLBACK'); } catch (er) {}
              return success(res, { id: last.id }, 'Duplicate suppressed', 200);
            }
          }
        } else {
          lastStmt.free();
        }
      } catch (ie) {
        // If the check fails, proceed to insert as normal
        try { lastStmt && lastStmt.free && lastStmt.free(); } catch (_) {}
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
      stmt = db.prepare('SELECT id, userId, message, meta, isRead, createdAt FROM notifications WHERE userId = ? ORDER BY createdAt DESC');
      stmt.bind([userId]);
    } catch (e) {
      stmt = db.prepare('SELECT id, userId, message, createdAt FROM notifications WHERE userId = ? ORDER BY createdAt DESC');
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
      fs.writeFileSync(dbFile, Buffer.from(db.export()));
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
      fs.writeFileSync(dbFile, Buffer.from(db.export()));
      return success(res, { id }, 'Created', 201);
    } catch (e) { try { db.run('ROLLBACK'); } catch (er) { } throw e; }
  } catch (err) { console.error('Checklists POST error', err && (err.stack || err.message || err)); return failure(res, 'Internal server error', 500); }
});

app.get('/api/checklists/:refId', requireAuth, (req, res) => {
  try {
    const refId = req.params.refId;
    const stmt = db.prepare('SELECT id, refId, refType, item, done, createdBy, createdAt FROM checklists WHERE refId = ? ORDER BY createdAt ASC');
    stmt.bind([refId]);
    const out = [];
    while (stmt.step()) out.push(stmt.getAsObject());
    stmt.free();
    return success(res, out || []);
  } catch (err) { console.error('Checklists GET error', err && (err.stack || err.message || err)); return failure(res, 'Internal server error', 500); }
});

// Checklist templates endpoints
app.post('/api/checklist-templates', requireAuth, (req, res) => {
  try {
    const { id, taskName, doerId, department, startDate, config, active } = req.body || {};
    if (!taskName || !doerId || !startDate) return failure(res, 'Missing fields', 400);
    try {
      db.run('BEGIN TRANSACTION');
      const tplId = id || genId('CT-');
      const createdAt = new Date().toISOString();
      const data = JSON.stringify({ taskName, doerId, department, startDate, config, active });
      const insert = db.prepare('INSERT INTO checklist_templates (id, data, createdBy, createdAt) VALUES (?,?,?,?)');
      insert.run([tplId, data, req.user && (req.user.employeeId || req.user.id) || null, createdAt]);
      insert.free();
      db.run('COMMIT');
      fs.writeFileSync(dbFile, Buffer.from(db.export()));
      return success(res, { id: tplId }, 'Created', 201);
    } catch (e) { try { db.run('ROLLBACK'); } catch (er) { } throw e; }
  } catch (err) { console.error('Checklist templates POST error', err && (err.stack || err.message || err)); return failure(res, 'Internal server error', 500); }
});

app.get('/api/checklist-templates', requireAuth, (req, res) => {
  try {
    const stmt = db.prepare('SELECT id, data, createdBy, createdAt FROM checklist_templates ORDER BY createdAt DESC');
    const out = [];
    while (stmt.step()) { const r = stmt.getAsObject(); try { r.data = JSON.parse(r.data); } catch (e) { r.data = undefined; } out.push(r); }
    stmt.free();
    return success(res, out || []);
  } catch (err) { console.error('Checklist templates GET error', err && (err.stack || err.message || err)); return failure(res, 'Internal server error', 500); }
});

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
      fs.writeFileSync(dbFile, Buffer.from(db.export()));
      return success(res, { id }, 'Created', 201);
    } catch (e) { try { db.run('ROLLBACK'); } catch (er) { } throw e; }
  } catch (err) { console.error('O2D POST error', err && (err.stack || err.message || err)); return failure(res, 'Internal server error', 500); }
});

app.get('/api/o2d', requireAuth, (req, res) => {
  try {
    const stmt = db.prepare('SELECT id, data, status, createdBy, createdAt FROM o2d ORDER BY createdAt DESC');
    const out = [];
    while (stmt.step()) { const r = stmt.getAsObject(); try { r.data = JSON.parse(r.data); } catch (e) { r.data = undefined; } out.push(r); }
    stmt.free();
    return success(res, out || []);
  } catch (err) { console.error('O2D GET error', err && (err.stack || err.message || err)); return failure(res, 'Internal server error', 500); }
});

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
      try { fs.writeFileSync(dbFile, Buffer.from(db.export())); } catch (e) { console.warn('Warning: failed to persist DB after o2d update', e && (e.stack || e.message || e)); }
      return success(res, { id }, 'Updated');
    } catch (e) { try { db.run('ROLLBACK'); } catch (er) { } throw e; }
  } catch (err) { console.error('O2D PUT error', err && (err.stack || err.message || err)); return failure(res, 'Internal server error', 500); }
});

// Chat
app.post('/api/chat', requireAuth, (req, res) => {
  try {
    const { teamId, message, meta } = req.body || {};
    if (!teamId || !message) return failure(res, 'Missing fields', 400);
    try {
      db.run('BEGIN TRANSACTION');
      const id = genId('CH-');
      const createdAt = new Date().toISOString();
      const insert = db.prepare('INSERT INTO chat (id, teamId, senderId, message, meta, createdAt) VALUES (?,?,?,?,?,?)');
      insert.run([id, teamId, req.user && (req.user.employeeId || req.user.id) || null, message, meta ? JSON.stringify(meta) : null, createdAt]);
      insert.free();
      db.run('COMMIT');
      fs.writeFileSync(dbFile, Buffer.from(db.export()));
      return success(res, { id }, 'Created', 201);
    } catch (e) { try { db.run('ROLLBACK'); } catch (er) { } throw e; }
  } catch (err) { console.error('Chat POST error', err && (err.stack || err.message || err)); return failure(res, 'Internal server error', 500); }
});

app.get('/api/chat/:teamId', requireAuth, (req, res) => {
  try {
    const teamId = req.params.teamId;
    const limit = parseInt(req.query.limit) || 200;
    const stmt = db.prepare('SELECT id, teamId, senderId, message, meta, createdAt FROM chat WHERE teamId = ? ORDER BY createdAt DESC LIMIT ?');
    stmt.bind([teamId, limit]);
    const out = [];
    while (stmt.step()) { const r = stmt.getAsObject(); try { r.meta = r.meta ? JSON.parse(r.meta) : undefined; } catch (e) { r.meta = undefined; } out.push(r); }
    stmt.free();
    return success(res, out.reverse());
  } catch (err) { console.error('Chat GET error', err && (err.stack || err.message || err)); return failure(res, 'Internal server error', 500); }
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
    const { question } = req.body || {};
    if (!question) return failure(res, 'Missing question', 400);
    try {
      db.run('BEGIN TRANSACTION');
      const id = genId('Q-');
      const createdAt = new Date().toISOString();
      const insert = db.prepare('INSERT INTO queries (id, userId, question, answer, status, createdAt) VALUES (?,?,?,?,?,?)');
      insert.run([id, req.user && (req.user.employeeId || req.user.id) || null, question, null, 'OPEN', createdAt]);
      insert.free();
      db.run('COMMIT');
      fs.writeFileSync(dbFile, Buffer.from(db.export()));
      return success(res, { id }, 'Created', 201);
    } catch (e) { try { db.run('ROLLBACK'); } catch (er) { } throw e; }
  } catch (err) { console.error('Queries POST error', err && (err.stack || err.message || err)); return failure(res, 'Internal server error', 500); }
});

app.get('/api/queries', requireAuth, (req, res) => {
  try {
    const stmt = db.prepare('SELECT id, userId, question, answer, status, createdAt FROM queries ORDER BY createdAt DESC');
    const out = [];
    while (stmt.step()) out.push(stmt.getAsObject());
    stmt.free();
    return success(res, out || []);
  } catch (err) { console.error('Queries GET error', err && (err.stack || err.message || err)); return failure(res, 'Internal server error', 500); }
});

// Notepad - Replaced with comprehensive CRUD supporting structured notes
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
app.get('/api/reminders', requireAuth, (req, res) => {
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
      fs.writeFileSync(dbFile, Buffer.from(db.export()));
      return success(res, { id }, 'Created', 201);
    } catch (e) { try { db.run('ROLLBACK'); } catch (er) { } throw e; }
  } catch (err) { console.error('Leave POST error', err && (err.stack || err.message || err)); return failure(res, 'Internal server error', 500); }
});

app.get('/api/leave', requireAuth, (req, res) => {
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
      fs.writeFileSync(dbFile, Buffer.from(db.export()));
      return success(res, { id }, 'Created', 201);
    } catch (e) { try { db.run('ROLLBACK'); } catch (er) { } throw e; }
  } catch (err) { console.error('Holidays POST error', err && (err.stack || err.message || err)); return failure(res, 'Internal server error', 500); }
});

app.get('/api/holidays', requireAuth, (req, res) => {
  try {
    const stmt = db.prepare('SELECT id, name, date, recurring, createdAt FROM holidays ORDER BY date ASC');
    const out = [];
    while (stmt.step()) out.push(stmt.getAsObject());
    stmt.free();
    return success(res, out || []);
  } catch (err) { console.error('Holidays GET error', err && (err.stack || err.message || err)); return failure(res, 'Internal server error', 500); }
});

// Delete holiday
app.delete('/api/holidays/:id', requireAuth, (req, res) => {
  try {
    const id = req.params.id;
    const del = db.prepare('DELETE FROM holidays WHERE id = ?');
    del.run([id]); del.free && del.free();
    fs.writeFileSync(dbFile, Buffer.from(db.export()));
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
    fs.writeFileSync(dbFile, Buffer.from(db.export()));
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
    fs.writeFileSync(dbFile, Buffer.from(db.export()));
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
    fs.writeFileSync(dbFile, Buffer.from(db.export()));
    return success(res, null, 'Deleted');
  } catch (err) {
    console.error('Timelogs DELETE error', { path: req.path, err: err && (err.stack || err.message || err) });
    return failure(res, 'Internal server error', 500);
  }
});

// Duplicate users endpoints removed; handlers defined above with safer error handling

// Catch-all for any unmatched API routes — return JSON 404 instead of falling through to static host/index.html
app.use('/api', (req, res) => {
  return failure(res, 'Not found', 404);
});

// Developer-friendly request logging (only in non-production)
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    console.log('[API]', req.method, req.path, req.headers.origin || 'no-origin');
    next();
  });
}

// Central error handler (catches errors passed with next(err))
app.use((err, req, res, next) => {
  console.error('Unhandled API error', { path: req && req.path, method: req && req.method, err: err && (err.stack || err.message || err) });
  try { failure(res, 'Internal server error', 500); } catch (e) { /* ignore */ }
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
