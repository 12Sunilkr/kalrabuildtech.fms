import express from 'express';
import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const app = express();

// Debug helpers: capture any uncaught exceptions or unhandled promise rejections so we can see why the process may exit
process.on('uncaughtException', (err) => {
  console.error('UncaughtException:', err && (err.stack || err.message || err));
});
process.on('unhandledRejection', (reason) => {
  console.error('UnhandledRejection:', reason && (reason.stack || reason));
});
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbFile = path.join(__dirname, 'users.sqlite');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_jwt_secret_change_me';

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

    const insert = db.prepare('INSERT INTO users (name, email, password, role, employeeId) VALUES (?,?,?,?,?)');
    // Store seeded passwords as bcrypt hashes
    insert.run(['Admin User', 'admin@example.com', bcrypt.hashSync('admin123', 10), 'ADMIN', null]);
    // Also seed legacy client default admin (admin@fms.com / admin) for compatibility
    insert.run(['Administrator', 'admin@fms.com', bcrypt.hashSync('admin', 10), 'ADMIN', null]);
    insert.run(['Alice Employee', 'alice@example.com', bcrypt.hashSync('alice123', 10), 'EMPLOYEE', 'E-001']);
    insert.run(['Bob Employee', 'bob@example.com', bcrypt.hashSync('bob123', 10), 'EMPLOYEE', 'E-002']);
    insert.free && insert.free();

    // Seed basic employee records (matching seeded users)
    const empIns = db.prepare('INSERT INTO employees (id, name, department, joiningDate, createdAt, status, email) VALUES (?,?,?,?,?,?,?)');
    empIns.run(['E-001', 'Alice Employee', 'Engineering', new Date().toISOString().split('T')[0], new Date().toISOString(), 'Active', 'alice@example.com']);
    empIns.run(['E-002', 'Bob Employee', 'Operations', new Date().toISOString().split('T')[0], new Date().toISOString(), 'Active', 'bob@example.com']);
    empIns.free && empIns.free();

    // Persist
    fs.writeFileSync(dbFile, Buffer.from(db.export()));
    console.log('Created users.sqlite and seeded default users (passwords hashed) and employees');
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

// Persist in case we created tables
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

// Simple JSON parsing + allow CORS for dev
app.use(express.json());
app.use(cookieParser());
// CORS: allow the requesting origin and allow credentials (needed for cookies)
app.use((req, res, next) => {
  const origin = req.headers.origin || '';
  const allowedOrigins = [ 'http://localhost:3000', 'http://127.0.0.1:3000' ];

  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    // Deny or set to 'null' for requests from unknown origins
    res.setHeader('Access-Control-Allow-Origin', 'null');
  }

  // Allow common headers + Authorization for future use
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  // Expose cookie related headers if needed
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  // Handle OPTIONS preflight quickly
  if (req.method === 'OPTIONS') {
    console.log('CORS preflight from', origin);
    return res.sendStatus(204);
  }

  next();
});

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.post('/api/auth/login', (req, res) => {
  try {
    const { email, password } = req.body || {};
    console.log('Login attempt for', email, 'from origin', req.headers.origin || 'no-origin', 'ip', req.ip);
    if (!email || !password) return res.status(400).json({ success: false, message: 'Missing email or password' });

    // Fetch stored hashed password and user record
    const stmt = db.prepare('SELECT id, name, email, role, employeeId, password FROM users WHERE lower(email)=?');
    stmt.bind([email.toLowerCase()]);
    if (!stmt.step()) { stmt.free(); console.log('Login failed: user not found', email); return res.status(401).json({ success: false, message: 'Invalid credentials' }); }
    const row = stmt.getAsObject();
    stmt.free();

    const storedHash = row.password;
    if (!storedHash || !bcrypt.compareSync(password, storedHash)) {
      console.log('Login failed: bad password for', email);
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    row.role = row.role || 'EMPLOYEE';
    delete row.password;

    // Sign a JWT and set as httpOnly cookie
    const token = jwt.sign({ id: row.id, role: row.role, name: row.name }, JWT_SECRET, { expiresIn: '7d' });
    res.cookie('token', token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 7 * 24 * 60 * 60 * 1000 });

    // Also include token in response so frontend can set Authorization header when needed
    return res.json({ success: true, user: row, token });
  } catch (err) {
    console.error('Auth login error', { path: req.path, err: err && (err.stack || err.message || err) });
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Auth helpers
app.get('/api/auth/me', (req, res) => {
  console.log('GET /api/auth/me from', req.ip, 'origin', req.headers.origin || 'no-origin');

  // Guard: Ensure DB/Server is initialized
  if (!app.get('ready') || !db) {
    console.warn('Auth/me: service not ready (DB missing)');
    res.setHeader('Content-Type', 'application/json');
    return res.status(503).json({ message: 'Service unavailable' });
  }

  try {
    // Accept token via cookie OR Authorization header (Bearer)
    let token = req.cookies?.token;
    if (!token) {
      const auth = req.headers && req.headers.authorization;
      if (auth && typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) {
        token = auth.slice(7).trim();
        console.log('Auth/me: using Bearer token from Authorization header');
      }
    }

    if (!token) {
      console.warn('Auth/me: missing token', { path: req.path, ip: req.ip, origin: req.headers.origin || null });
      return res.status(401).json({ message: 'Unauthorized' });
    }

    let payload;
    try {
      payload = jwt.verify(token, JWT_SECRET);
      console.log('Auth/me: token verified for id', payload && payload.id);
    } catch (err) {
      console.warn('Auth/me: token verification failed', { err: err && (err.message || err) });
      if (err && err.name === 'TokenExpiredError') {
        return res.status(401).json({ message: 'Invalid token' });
      }
      return res.status(401).json({ message: 'Invalid token' });
    }

    const id = payload.id;
    try {
      const stmt = db.prepare('SELECT id, name, email, role, employeeId FROM users WHERE id = ?');
      stmt.bind([Number(id)]);
      if (!stmt.step()) { stmt.free(); console.warn('Auth/me: user not found for id', id); return res.status(401).json({ message: 'Unauthorized' }); }
      const row = stmt.getAsObject();
      stmt.free();
      row.role = row.role || 'EMPLOYEE';
      return res.json({ authenticated: true, user: row });
    } catch (err) {
      console.error('Auth/me: DB error', err && (err.stack || err.message || err));
      return res.status(500).json({ message: 'Internal server error' });
    }
  } catch (err) {
    console.error('Auth/me unexpected error', err && (err.stack || err.message || err));
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token', { path: '/' });
  res.json({ success: true });
});

// Users CRUD API
app.get('/api/users', (req, res) => {
  try {
    console.log('GET /api/users from', req.headers.origin || 'no-origin');
    const stmt = db.prepare('SELECT id, name, email, role, employeeId FROM users');
    const out = [];
    while (stmt.step()) {
      out.push(stmt.getAsObject());
    }
    stmt.free();
    res.json(out);
  } catch (err) {
    console.error('Users GET error', { path: req.path, err: err && (err.stack || err.message || err) });
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// Convenience: query user by email
app.get('/api/users/by-email', (req, res) => {
  try {
    const email = req.query.email;
    if (!email) return res.status(400).json({ error: 'Missing email' });
    const stmt = db.prepare('SELECT id, name, email, role, employeeId FROM users WHERE lower(email) = ?');
    stmt.bind([String(email).toLowerCase()]);
    if (!stmt.step()) { stmt.free(); return res.status(404).json({ error: 'Not found' }); }
    const row = stmt.getAsObject();
    stmt.free();
    res.json(row);
  } catch (err) {
    console.error('Users by-email error', { path: req.path, err: err && (err.stack || err.message || err) });
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/api/users/:id', (req, res) => {
  try {
    const stmt = db.prepare('SELECT id, name, email, role, employeeId FROM users WHERE id = ?');
    const id = Number(req.params.id);
    stmt.bind([id]);
    if (!stmt.step()) { stmt.free(); return res.status(404).json({ error: 'Not found' }); }
    const row = stmt.getAsObject();
    stmt.free();
    return res.json(row);
  } catch (err) {
    console.error('Users/:id GET error', { path: req.path, err: err && (err.stack || err.message || err) });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/users', (req, res) => {
  try {
    // Normalize email early (trim + lowercase)
    const { name, email: rawEmail, password, role, employeeId } = req.body || {};
    const email = rawEmail ? String(rawEmail).trim().toLowerCase() : '';
    if (!email || !password) return res.status(400).json({ message: 'Missing fields' });

    // Quick pre-check for existing email (case-insensitive)
    const check = db.prepare('SELECT id FROM users WHERE lower(email)=?');
    check.bind([email.toLowerCase()]);
    if (check.step()) { check.free(); console.warn('Users POST conflict (pre-check)', { email }); return res.status(409).json({ message: 'Email already exists' }); }
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
        return res.status(409).json({ message: 'Email already exists' });
      }
      throw dbErr;
    }
    insert.free && insert.free();

    fs.writeFileSync(dbFile, Buffer.from(db.export()));
    return res.status(201).json({ success: true });
  } catch (err) {
    console.error('Users POST error', { path: req.path, err: err && (err.stack || err.message || err) });
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.put('/api/users/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    const { name, email, password, role, employeeId } = req.body || {};
    const stmt = db.prepare('SELECT id FROM users WHERE id = ?');
    stmt.bind([id]);
    if (!stmt.step()) { stmt.free(); return res.status(404).json({ error: 'Not found' }); }
    stmt.free();

    // Hash password if provided
    const hashed = password ? bcrypt.hashSync(password, 10) : null;
    const sanitizedEmail = email ? String(email).trim().toLowerCase() : null;
    const update = db.prepare('UPDATE users SET name = coalesce(?, name), email = coalesce(?, email), password = coalesce(?, password), role = coalesce(?, role), employeeId = coalesce(?, employeeId) WHERE id = ?');
    update.run([name || null, sanitizedEmail, hashed || null, role || null, employeeId || null, id]);
    update.free && update.free();
    fs.writeFileSync(dbFile, Buffer.from(db.export()));
    return res.json({ success: true });
  } catch (err) {
    console.error('Users PUT error', { path: req.path, err: err && (err.stack || err.message || err) });
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.delete('/api/users/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    const del = db.prepare('DELETE FROM users WHERE id = ?');
    del.run([id]);
    del.free();
    fs.writeFileSync(dbFile, Buffer.from(db.export()));
    return res.json({ success: true });
  } catch (err) {
    console.error('Users DELETE error', { path: req.path, err: err && (err.stack || err.message || err) });
    return res.status(500).json({ message: 'Internal server error' });
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

app.get('/api/employees', (req, res) => {
  try {
    ensureEmployeesTable();
    console.log('GET /api/employees from', req.headers.origin || 'no-origin');
    const stmt = db.prepare('SELECT id, name, department, joiningDate, createdAt, status, designation, email, phone, birthDate, address, documents, compOffBalance FROM employees');
    const out = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      // Parse documents JSON if present
      if (row.documents) {
        try { row.documents = JSON.parse(row.documents); } catch (e) { console.warn('Failed to parse documents JSON for employee', row.id, e); }
      }
      out.push(row);
    }
    stmt.free();
    // Always return an array (may be empty)
    return res.json(out || []);
  } catch (err) {
    console.error('Employees GET error', { path: req.path, err: err && (err.stack || err.message || err) });
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/api/employees/:id', (req, res) => {
  try {
    ensureEmployeesTable();
    const stmt = db.prepare('SELECT id, name, department, joiningDate, createdAt, status, designation, email, phone, birthDate, address, documents, compOffBalance FROM employees WHERE id = ?');
    stmt.bind([req.params.id]);
    if (!stmt.step()) { stmt.free(); return res.status(404).json({ message: 'Not found' }); }
    const row = stmt.getAsObject();
    if (row.documents) {
      try { row.documents = JSON.parse(row.documents); } catch (e) { console.warn('Failed to parse documents JSON for employee', req.params.id, e); }
    }
    stmt.free();
    return res.json(row);
  } catch (err) {
    console.error('Employees/:id GET error', { path: req.path, err: err && (err.stack || err.message || err) });
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/employees', (req, res) => {
  try {
    ensureEmployeesTable();
    const { id, name, department, joiningDate, createdAt, status, designation, email, phone, birthDate, address, documents, compOffBalance } = req.body || {};
    if (!id || !name) return res.status(400).json({ message: 'Missing fields' });
    const check = db.prepare('SELECT id FROM employees WHERE id = ?');
    check.bind([id]);
    if (check.step()) { check.free(); return res.status(409).json({ message: 'Employee ID already exists' }); }
    check.free();

    const docs = documents ? JSON.stringify(documents) : null;
    const insert = db.prepare('INSERT INTO employees (id, name, department, joiningDate, createdAt, status, designation, email, phone, birthDate, address, documents, compOffBalance) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)');
    insert.run([id, name, department || null, joiningDate || null, createdAt || new Date().toISOString(), status || 'Active', designation || null, email || null, phone || null, birthDate || null, address || null, docs, compOffBalance || 0]);
    insert.free && insert.free();
    fs.writeFileSync(dbFile, Buffer.from(db.export()));
    return res.status(201).json({ success: true });
  } catch (err) {
    console.error('Employees POST error', { path: req.path, err: err && (err.stack || err.message || err) });
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.put('/api/employees/:id', (req, res) => {
  try {
    ensureEmployeesTable();
    const id = req.params.id;
    const { name, department, joiningDate, createdAt, status, designation, email, phone, birthDate, address, documents, compOffBalance } = req.body || {};
    const stmt = db.prepare('SELECT id FROM employees WHERE id = ?');
    stmt.bind([id]);
    if (!stmt.step()) { stmt.free(); return res.status(404).json({ message: 'Not found' }); }
    stmt.free();

    const docs = documents ? JSON.stringify(documents) : null;
    const update = db.prepare('UPDATE employees SET name = coalesce(?, name), department = coalesce(?, department), joiningDate = coalesce(?, joiningDate), createdAt = coalesce(?, createdAt), status = coalesce(?, status), designation = coalesce(?, designation), email = coalesce(?, email), phone = coalesce(?, phone), birthDate = coalesce(?, birthDate), address = coalesce(?, address), documents = coalesce(?, documents), compOffBalance = coalesce(?, compOffBalance) WHERE id = ?');
    update.run([name || null, department || null, joiningDate || null, createdAt || null, status || null, designation || null, email || null, phone || null, birthDate || null, address || null, docs || null, compOffBalance || null, id]);
    update.free && update.free();
    fs.writeFileSync(dbFile, Buffer.from(db.export()));
    return res.json({ success: true });
  } catch (err) {
    console.error('Employees PUT error', { path: req.path, err: err && (err.stack || err.message || err) });
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.delete('/api/employees/:id', (req, res) => {
  try {
    ensureEmployeesTable();
    const id = req.params.id;
    const del = db.prepare('DELETE FROM employees WHERE id = ?');
    del.run([id]);
    del.free();
    fs.writeFileSync(dbFile, Buffer.from(db.export()));
    return res.json({ success: true });
  } catch (err) {
    console.error('Employees DELETE error', { path: req.path, err: err && (err.stack || err.message || err) });
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// --- Auth middleware ---
function requireAuth(req, res, next) {
  try {
    // Accept token via cookie OR Authorization header (Bearer)
    let token = req.cookies?.token;
    if (!token) {
      const auth = req.headers && req.headers.authorization;
      if (auth && typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) {
        token = auth.slice(7).trim();
        console.log('Auth: using Bearer token from Authorization header for', req.path);
      }
    }

    if (!token) {
      console.warn('Auth: missing token', { path: req.path, ip: req.ip, origin: req.headers.origin || null });
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    return next();
  } catch (err) {
    console.warn('Auth: token verification failed', { path: req.path, err: err && (err.message || err) });
    return res.status(401).json({ message: 'Unauthorized' });
  }
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
    return res.json(out);
  } catch (err) {
    console.error('Attendance GET error', { path: req.path, err: err && (err.stack || err.message || err) });
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/attendance', requireAuth, (req, res) => {
  try {
    const { id, userId, date, clockIn, clockOut, value, location, notes } = req.body || {};
    if (!id || !userId || !date) return res.status(400).json({ error: 'Missing fields' });
    const check = db.prepare('SELECT id FROM attendance WHERE id = ?');
    check.bind([id]);
    if (check.step()) { check.free(); return res.status(409).json({ error: 'Attendance ID already exists' }); }
    check.free();

    const insert = db.prepare('INSERT INTO attendance (id, userId, date, clockIn, clockOut, value, location, notes, createdAt) VALUES (?,?,?,?,?,?,?,?,?)');
    insert.run([id, userId, date, clockIn || null, clockOut || null, value == null ? null : value, location || null, notes || null, new Date().toISOString()]);
    insert.free && insert.free();
    fs.writeFileSync(dbFile, Buffer.from(db.export()));
    return res.status(201).json({ success: true });
  } catch (err) {
    console.error('Attendance POST error', { path: req.path, err: err && (err.stack || err.message || err) });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/attendance/:id', requireAuth, (req, res) => {
  try {
    const id = req.params.id;
    const { clockIn, clockOut, value, location, notes } = req.body || {};
    const stmt = db.prepare('SELECT id FROM attendance WHERE id = ?');
    stmt.bind([id]);
    if (!stmt.step()) { stmt.free(); return res.status(404).json({ error: 'Not found' }); }
    stmt.free();
    const update = db.prepare('UPDATE attendance SET clockIn = coalesce(?, clockIn), clockOut = coalesce(?, clockOut), value = coalesce(?, value), location = coalesce(?, location), notes = coalesce(?, notes) WHERE id = ?');
    update.run([clockIn || null, clockOut || null, value == null ? null : value, location || null, notes || null, id]);
    update.free && update.free();
    fs.writeFileSync(dbFile, Buffer.from(db.export()));
    return res.json({ success: true });
  } catch (err) {
    console.error('Attendance PUT error', { path: req.path, err: err && (err.stack || err.message || err) });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/attendance/:id', requireAuth, (req, res) => {
  try {
    const id = req.params.id;
    const del = db.prepare('DELETE FROM attendance WHERE id = ?');
    del.run([id]);
    del.free();
    fs.writeFileSync(dbFile, Buffer.from(db.export()));
    return res.json({ success: true });
  } catch (err) {
    console.error('Attendance DELETE error', { path: req.path, err: err && (err.stack || err.message || err) });
    return res.status(500).json({ error: 'Internal server error' });
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
    res.json(out);
  } catch (err) {
    console.error('Timelogs GET error', { path: req.path, err: err && (err.stack || err.message || err) });
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/timelogs', requireAuth, (req, res) => {
  try {
    const { id, userId, startTime, endTime, task, notes } = req.body || {};
    if (!id || !userId || !startTime) return res.status(400).json({ error: 'Missing fields' });
    const check = db.prepare('SELECT id FROM timelogs WHERE id = ?');
    check.bind([id]);
    if (check.step()) { check.free(); return res.status(409).json({ error: 'TimeLog ID already exists' }); }
    check.free();

    const insert = db.prepare('INSERT INTO timelogs (id, userId, startTime, endTime, task, notes, createdAt) VALUES (?,?,?,?,?,?,?)');
    insert.run([id, userId, startTime, endTime || null, task || null, notes || null, new Date().toISOString()]);
    insert.free && insert.free();
    fs.writeFileSync(dbFile, Buffer.from(db.export()));
    return res.status(201).json({ success: true });
  } catch (err) {
    console.error('Timelogs POST error', { path: req.path, err: err && (err.stack || err.message || err) });
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.put('/api/timelogs/:id', requireAuth, (req, res) => {
  try {
    const id = req.params.id;
    const { startTime, endTime, task, notes } = req.body || {};
    const stmt = db.prepare('SELECT id FROM timelogs WHERE id = ?');
    stmt.bind([id]);
    if (!stmt.step()) { stmt.free(); return res.status(404).json({ error: 'Not found' }); }
    stmt.free();
    const update = db.prepare('UPDATE timelogs SET startTime = coalesce(?, startTime), endTime = coalesce(?, endTime), task = coalesce(?, task), notes = coalesce(?, notes) WHERE id = ?');
    update.run([startTime || null, endTime || null, task || null, notes || null, id]);
    update.free && update.free();
    fs.writeFileSync(dbFile, Buffer.from(db.export()));
    return res.json({ success: true });
  } catch (err) {
    console.error('Timelogs PUT error', { path: req.path, err: err && (err.stack || err.message || err) });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/timelogs/:id', requireAuth, (req, res) => {
  try {
    const id = req.params.id;
    const del = db.prepare('DELETE FROM timelogs WHERE id = ?');
    del.run([id]);
    del.free();
    fs.writeFileSync(dbFile, Buffer.from(db.export()));
    return res.json({ success: true });
  } catch (err) {
    console.error('Timelogs DELETE error', { path: req.path, err: err && (err.stack || err.message || err) });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Duplicate users endpoints removed; handlers defined above with safer error handling

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
  try { res.status(500).json({ message: 'Internal server error' }); } catch (e) { /* ignore */ }
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
