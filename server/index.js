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
const SQL = await initSqlJs();
let db;
if (fs.existsSync(dbFile)) {
  const buff = fs.readFileSync(dbFile);
  db = new SQL.Database(new Uint8Array(buff));
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

// Simple JSON parsing + allow CORS for dev
app.use(express.json());
app.use(cookieParser());
// CORS: allow the requesting origin and allow credentials (needed for cookies)
app.use((req, res, next) => {
  const origin = req.headers.origin || '*';
  // When credentials are used, Access-Control-Allow-Origin cannot be '*'
  if (origin && origin !== 'null') {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
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

  // Debug: log cross-origin requests (can be removed later)
  // console.log('CORS request', req.method, 'from', origin, req.path);

  next();
});

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ success: false, message: 'Missing email or password' });

  // Fetch stored hashed password and user record
  const stmt = db.prepare('SELECT id, name, email, role, employeeId, password FROM users WHERE lower(email)=?');
  stmt.bind([email.toLowerCase()]);
  if (!stmt.step()) { stmt.free(); return res.status(401).json({ success: false, message: 'Invalid credentials' }); }
  const row = stmt.getAsObject();
  stmt.free();

  const storedHash = row.password;
  if (!storedHash || !bcrypt.compareSync(password, storedHash)) {
    return res.status(401).json({ success: false, message: 'Invalid credentials' });
  }

  row.role = row.role || 'EMPLOYEE';
  delete row.password;

  // Sign a JWT and set as httpOnly cookie
  const token = jwt.sign({ id: row.id, role: row.role, name: row.name }, JWT_SECRET, { expiresIn: '7d' });
  res.cookie('token', token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 7 * 24 * 60 * 60 * 1000 });

  return res.json({ success: true, user: row });
});

// Auth helpers
app.get('/api/auth/me', (req, res) => {
  try {
    const token = req.cookies?.token;
    if (!token) return res.status(401).json({ authenticated: false });
    const payload = jwt.verify(token, JWT_SECRET);
    const id = payload.id;
    const stmt = db.prepare('SELECT id, name, email, role, employeeId FROM users WHERE id = ?');
    stmt.bind([Number(id)]);
    if (!stmt.step()) { stmt.free(); return res.status(401).json({ authenticated: false }); }
    const row = stmt.getAsObject();
    stmt.free();
    row.role = row.role || 'EMPLOYEE';
    return res.json({ authenticated: true, user: row });
  } catch (err) {
    return res.status(401).json({ authenticated: false });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true });
});

// Auth helpers
app.get('/api/auth/me', (req, res) => {
  try {
    const token = req.cookies?.token;
    if (!token) return res.status(401).json({ authenticated: false });
    const payload = jwt.verify(token, JWT_SECRET);
    const id = payload.id;
    const stmt = db.prepare('SELECT id, name, email, role, employeeId FROM users WHERE id = ?');
    stmt.bind([Number(id)]);
    if (!stmt.step()) { stmt.free(); return res.status(401).json({ authenticated: false }); }
    const row = stmt.getAsObject();
    stmt.free();
    row.role = row.role || 'EMPLOYEE';
    return res.json({ authenticated: true, user: row });
  } catch (err) {
    return res.status(401).json({ authenticated: false });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true });
});

// Users CRUD API
app.get('/api/users', (req, res) => {
  const stmt = db.prepare('SELECT id, name, email, role, employeeId FROM users');
  const out = [];
  while (stmt.step()) {
    out.push(stmt.getAsObject());
  }
  stmt.free();
  res.json(out);
});

app.get('/api/users/:id', (req, res) => {
  const stmt = db.prepare('SELECT id, name, email, role, employeeId FROM users WHERE id = ?');
  stmt.bind([Number(req.params.id)]);
  if (!stmt.step()) return res.status(404).json({ error: 'Not found' });
  const row = stmt.getAsObject();
  stmt.free();
  res.json(row);
});

app.post('/api/users', (req, res) => {
  const { name, email, password, role, employeeId } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Missing fields' });
  // Check uniqueness
  const check = db.prepare('SELECT id FROM users WHERE lower(email)=?');
  check.bind([email.toLowerCase()]);
  if (check.step()) { check.free(); return res.status(409).json({ error: 'Email already exists' }); }
  check.free();

  // Hash password before storing
  const hashed = bcrypt.hashSync(password, 10);
  const insert = db.prepare('INSERT INTO users (name, email, password, role, employeeId) VALUES (?,?,?,?,?)');
  insert.run([name || null, email.toLowerCase(), hashed, role || 'EMPLOYEE', employeeId || null]);
  insert.free && insert.free();
  fs.writeFileSync(dbFile, Buffer.from(db.export()));
  return res.status(201).json({ success: true });
});

app.put('/api/users/:id', (req, res) => {
  const id = Number(req.params.id);
  const { name, email, password, role, employeeId } = req.body || {};
  const stmt = db.prepare('SELECT id FROM users WHERE id = ?');
  stmt.bind([id]);
  if (!stmt.step()) { stmt.free(); return res.status(404).json({ error: 'Not found' }); }
  stmt.free();

  // Hash password if provided
  const hashed = password ? bcrypt.hashSync(password, 10) : null;
  const update = db.prepare('UPDATE users SET name = coalesce(?, name), email = coalesce(?, email), password = coalesce(?, password), role = coalesce(?, role), employeeId = coalesce(?, employeeId) WHERE id = ?');
  update.run([name || null, email ? email.toLowerCase() : null, hashed || null, role || null, employeeId || null, id]);
  update.free && update.free();
  fs.writeFileSync(dbFile, Buffer.from(db.export()));
  res.json({ success: true });
});

app.delete('/api/users/:id', (req, res) => {
  const id = Number(req.params.id);
  const del = db.prepare('DELETE FROM users WHERE id = ?');
  del.run([id]);
  del.free();
  fs.writeFileSync(dbFile, Buffer.from(db.export()));
  res.json({ success: true });
});

// Employees CRUD API
app.get('/api/employees', (req, res) => {
  const stmt = db.prepare('SELECT id, name, department, joiningDate, createdAt, status, designation, email, phone, birthDate, address, documents, compOffBalance FROM employees');
  const out = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    // Parse documents JSON if present
    if (row.documents) {
      try { row.documents = JSON.parse(row.documents); } catch (e) { /* ignore */ }
    }
    out.push(row);
  }
  stmt.free();
  res.json(out);
});

app.get('/api/employees/:id', (req, res) => {
  const stmt = db.prepare('SELECT id, name, department, joiningDate, createdAt, status, designation, email, phone, birthDate, address, documents, compOffBalance FROM employees WHERE id = ?');
  stmt.bind([req.params.id]);
  if (!stmt.step()) return res.status(404).json({ error: 'Not found' });
  const row = stmt.getAsObject();
  if (row.documents) {
    try { row.documents = JSON.parse(row.documents); } catch (e) { /* ignore */ }
  }
  stmt.free();
  res.json(row);
});

app.post('/api/employees', (req, res) => {
  const { id, name, department, joiningDate, createdAt, status, designation, email, phone, birthDate, address, documents, compOffBalance } = req.body || {};
  if (!id || !name) return res.status(400).json({ error: 'Missing fields' });
  const check = db.prepare('SELECT id FROM employees WHERE id = ?');
  check.bind([id]);
  if (check.step()) { check.free(); return res.status(409).json({ error: 'Employee ID already exists' }); }
  check.free();

  const docs = documents ? JSON.stringify(documents) : null;
  const insert = db.prepare('INSERT INTO employees (id, name, department, joiningDate, createdAt, status, designation, email, phone, birthDate, address, documents, compOffBalance) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)');
  insert.run([id, name, department || null, joiningDate || null, createdAt || new Date().toISOString(), status || 'Active', designation || null, email || null, phone || null, birthDate || null, address || null, docs, compOffBalance || 0]);
  insert.free && insert.free();
  fs.writeFileSync(dbFile, Buffer.from(db.export()));
  res.status(201).json({ success: true });
});

app.put('/api/employees/:id', (req, res) => {
  const id = req.params.id;
  const { name, department, joiningDate, createdAt, status, designation, email, phone, birthDate, address, documents, compOffBalance } = req.body || {};
  const stmt = db.prepare('SELECT id FROM employees WHERE id = ?');
  stmt.bind([id]);
  if (!stmt.step()) { stmt.free(); return res.status(404).json({ error: 'Not found' }); }
  stmt.free();

  const docs = documents ? JSON.stringify(documents) : null;
  const update = db.prepare('UPDATE employees SET name = coalesce(?, name), department = coalesce(?, department), joiningDate = coalesce(?, joiningDate), createdAt = coalesce(?, createdAt), status = coalesce(?, status), designation = coalesce(?, designation), email = coalesce(?, email), phone = coalesce(?, phone), birthDate = coalesce(?, birthDate), address = coalesce(?, address), documents = coalesce(?, documents), compOffBalance = coalesce(?, compOffBalance) WHERE id = ?');
  update.run([name || null, department || null, joiningDate || null, createdAt || null, status || null, designation || null, email || null, phone || null, birthDate || null, address || null, docs || null, compOffBalance || null, id]);
  update.free && update.free();
  fs.writeFileSync(dbFile, Buffer.from(db.export()));
  res.json({ success: true });
});

app.delete('/api/employees/:id', (req, res) => {
  const id = req.params.id;
  const del = db.prepare('DELETE FROM employees WHERE id = ?');
  del.run([id]);
  del.free();
  fs.writeFileSync(dbFile, Buffer.from(db.export()));
  res.json({ success: true });
});

// --- Auth middleware ---
function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.token;
    if (!token) return res.status(401).json({ error: 'Not authenticated' });
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Attendance endpoints
app.get('/api/attendance', requireAuth, (req, res) => {
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
  res.json(out);
});

app.post('/api/attendance', requireAuth, (req, res) => {
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
  res.status(201).json({ success: true });
});

app.put('/api/attendance/:id', requireAuth, (req, res) => {
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
  res.json({ success: true });
});

app.delete('/api/attendance/:id', requireAuth, (req, res) => {
  const id = req.params.id;
  const del = db.prepare('DELETE FROM attendance WHERE id = ?');
  del.run([id]);
  del.free();
  fs.writeFileSync(dbFile, Buffer.from(db.export()));
  res.json({ success: true });
});

// Time logs endpoints
app.get('/api/timelogs', requireAuth, (req, res) => {
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
});

app.post('/api/timelogs', requireAuth, (req, res) => {
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
  res.status(201).json({ success: true });
});

app.put('/api/timelogs/:id', requireAuth, (req, res) => {
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
  res.json({ success: true });
});

app.delete('/api/timelogs/:id', requireAuth, (req, res) => {
  const id = req.params.id;
  const del = db.prepare('DELETE FROM timelogs WHERE id = ?');
  del.run([id]);
  del.free();
  fs.writeFileSync(dbFile, Buffer.from(db.export()));
  res.json({ success: true });
});

app.get('/api/users/:id', (req, res) => {
  const stmt = db.prepare('SELECT id, name, email, role, employeeId FROM users WHERE id = ?');
  stmt.bind([Number(req.params.id)]);
  if (!stmt.step()) return res.status(404).json({ error: 'Not found' });
  const row = stmt.getAsObject();
  stmt.free();
  res.json(row);
});

app.post('/api/users', (req, res) => {
  const { name, email, password, role, employeeId } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Missing fields' });
  // Check uniqueness
  const check = db.prepare('SELECT id FROM users WHERE lower(email)=?');
  check.bind([email.toLowerCase()]);
  if (check.step()) { check.free(); return res.status(409).json({ error: 'Email already exists' }); }
  check.free();

  // Hash password before storing
  const hashed = bcrypt.hashSync(password, 10);
  const insert = db.prepare('INSERT INTO users (name, email, password, role, employeeId) VALUES (?,?,?,?,?)');
  insert.run([name || null, email.toLowerCase(), hashed, role || 'EMPLOYEE', employeeId || null]);
  insert.free && insert.free();
  fs.writeFileSync(dbFile, Buffer.from(db.export()));
  return res.status(201).json({ success: true });
});

app.put('/api/users/:id', (req, res) => {
  const id = Number(req.params.id);
  const { name, email, password, role, employeeId } = req.body || {};
  const stmt = db.prepare('SELECT id FROM users WHERE id = ?');
  stmt.bind([id]);
  if (!stmt.step()) { stmt.free(); return res.status(404).json({ error: 'Not found' }); }
  stmt.free();

  // Hash password if provided
  const hashed = password ? bcrypt.hashSync(password, 10) : null;
  const update = db.prepare('UPDATE users SET name = coalesce(?, name), email = coalesce(?, email), password = coalesce(?, password), role = coalesce(?, role), employeeId = coalesce(?, employeeId) WHERE id = ?');
  update.run([name || null, email ? email.toLowerCase() : null, hashed || null, role || null, employeeId || null, id]);
  update.free && update.free();
  fs.writeFileSync(dbFile, Buffer.from(db.export()));
  res.json({ success: true });
});

app.delete('/api/users/:id', (req, res) => {
  const id = Number(req.params.id);
  const del = db.prepare('DELETE FROM users WHERE id = ?');
  del.run([id]);
  del.free();
  fs.writeFileSync(dbFile, Buffer.from(db.export()));
  res.json({ success: true });
});

const port = process.env.PORT || 4001;
const server = app.listen(port, () => console.log(`Auth server listening on http://localhost:${port}`));
console.log('server object leaked (exists)?', !!server);
