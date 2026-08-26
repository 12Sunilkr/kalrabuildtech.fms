import fs from 'fs';
import path from 'path';
import { safeWriteFileSync } from './utils/dbPersist.js';

// Simple, idempotent migrations helper for the embedded sql.js DB
// Exports runMigrations({ db, dbFile }) which ensures tables and columns exist and writes the DB file when changes occur.

export async function runMigrations({ db, dbFile }) {
  if (!db || !dbFile) throw new Error('runMigrations requires {db, dbFile}');

  let changed = false;

  const ensureTable = (name, createSQL, indexes = []) => {
    try {
      const sel = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?");
      sel.bind([name]);
      const exists = sel.step(); sel.free();
      if (!exists) {
        db.run(createSQL);
        changed = true;
        console.log(`Migration: created table ${name}`);
        for (const idx of indexes) {
          try { db.run(idx); } catch (e) { console.warn('Failed to create index', idx, e && e.message); }
        }
      }
    } catch (e) {
      console.warn('Migration: ensureTable failed for', name, e && (e.message || e));
    }
  };

  const ensureColumns = (tableName, cols) => {
    try {
      const stmt = db.prepare("PRAGMA table_info('" + tableName + "')");
      const existing = new Set();
      while (stmt.step()) {
        const c = stmt.getAsObject(); existing.add(String(c.name));
      }
      stmt.free();

      for (const [colName, colDef] of Object.entries(cols)) {
        if (!existing.has(colName)) {
          try {
            db.run(`ALTER TABLE ${tableName} ADD COLUMN ${colName} ${colDef}`);
            changed = true;
            console.log(`Migration: added column ${colName} to ${tableName}`);
          } catch (e) {
            console.warn(`Migration: failed to add column ${colName} to ${tableName}`, e && (e.message || e));
          }
        }
      }
    } catch (e) {
      console.warn('Migration: ensureColumns failed for', tableName, e && (e.message || e));
    }
  };

  // Standard columns required by our modules
  const standardCols = {
    user_id: 'TEXT',
    created_at: "TEXT DEFAULT (datetime('now'))",
    updated_at: "TEXT"
  };

  // Ensure key module tables exist with baseline schema
  ensureTable('tasks', `CREATE TABLE tasks (
    id TEXT PRIMARY KEY,
    title TEXT,
    description TEXT,
    assignedTo TEXT,
    assignedBy TEXT,
    priority TEXT,
    dueDate TEXT,
    status TEXT,
    createdAt TEXT
  )`, [`CREATE INDEX IF NOT EXISTS idx_tasks_assignedTo ON tasks(assignedTo)`]);

  ensureColumns('tasks', {
    assignedBy: 'TEXT',
    assigned_by: 'INTEGER',
    assignedTo: 'TEXT',
    assigned_to: 'INTEGER',
    status: 'TEXT',
    dueDate: 'TEXT',
    due_date: 'TEXT',
    createdAt: 'TEXT',
    created_at: 'TEXT',
    priority: 'TEXT',
    description: 'TEXT',
    extensionHistory: 'TEXT',
    extensionRequest: 'TEXT',
    completionDate: 'TEXT',
    completionProcess: 'TEXT',
    completionAttachment: 'TEXT',
    statusNote: 'TEXT',
    attachment: 'TEXT',
    externalLink: 'TEXT'
  });

  ensureTable('calendar', `CREATE TABLE calendar (
    id TEXT PRIMARY KEY,
    title TEXT,
    description TEXT,
    startTime TEXT,
    endTime TEXT,
    createdBy TEXT,
    createdAt TEXT
  )`);

  ensureTable('finance', `CREATE TABLE finance (
    id TEXT PRIMARY KEY,
    amount REAL,
    currency TEXT,
    type TEXT,
    description TEXT,
    date TEXT,
    createdBy TEXT,
    createdAt TEXT
  )`);

  ensureTable('notifications', `CREATE TABLE notifications (
    id TEXT PRIMARY KEY,
    userId TEXT,
    message TEXT,
    meta TEXT,
    isRead INTEGER DEFAULT 0,
    createdAt TEXT
  )`, [`CREATE INDEX IF NOT EXISTS idx_notifications_userId ON notifications(userId)`]);

  ensureTable('projects', `CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    name TEXT,
    address TEXT,
    status TEXT,
    data TEXT,
    createdBy TEXT,
    createdAt TEXT
  )`);

  // Site photos table (store metadata and server path) - ensure via migrations so older DBs get the table
  ensureTable('site_photos', `CREATE TABLE site_photos (
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
  )`, [`CREATE INDEX IF NOT EXISTS idx_site_photos_projectId ON site_photos(projectId)`]);

  ensureTable('checklists', `CREATE TABLE checklists (
    id TEXT PRIMARY KEY,
    refId TEXT,
    refType TEXT,
    item TEXT,
    done INTEGER DEFAULT 0,
    createdBy TEXT,
    createdAt TEXT
  )`, [
    `CREATE INDEX IF NOT EXISTS idx_checklists_ref ON checklists(refId)`,
    `CREATE INDEX IF NOT EXISTS idx_checklists_ref_created ON checklists(refId, createdAt)`
  ]);

  ensureTable('notepad', `CREATE TABLE notepad (
    id TEXT PRIMARY KEY,
    userId TEXT,
    content TEXT,
    createdAt TEXT,
    updatedAt TEXT
  )`, [`CREATE INDEX IF NOT EXISTS idx_notepad_userId ON notepad(userId)`]);

  // Reminders table (migrate client-side reminders into DB)
  ensureTable('reminders', `CREATE TABLE reminders (
    id TEXT PRIMARY KEY,
    userId TEXT,
    date TEXT,
    title TEXT,
    createdBy TEXT,
    createdAt TEXT
  )`, [`CREATE INDEX IF NOT EXISTS idx_reminders_userId ON reminders(userId)`]);

  // PMS (Project Management System) Tables
  ensureTable('pms_projects', `CREATE TABLE pms_projects (
    id TEXT PRIMARY KEY,
    project_name TEXT,
    assigned_employee_id TEXT,
    start_date TEXT,
    end_date TEXT,
    location TEXT,
    total_cost REAL DEFAULT 0,
    actual_cost REAL DEFAULT 0,
    status TEXT,
    createdBy TEXT,
    createdAt TEXT
  )`, [`CREATE INDEX IF NOT EXISTS idx_pms_projects_employee ON pms_projects(assigned_employee_id)`]);

  // Ensure columns exist for older databases
  ensureColumns('pms_projects', {
    end_date: 'TEXT',
    location: 'TEXT',
    total_cost: 'REAL DEFAULT 0',
    actual_cost: 'REAL DEFAULT 0',
    google_sheet_link: 'TEXT'
  });

  ensureTable('pms_daily_work_logs', `CREATE TABLE pms_daily_work_logs (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    employee_id TEXT,
    work_date TEXT,
    session_number INTEGER,
    work_done TEXT,
    work_left TEXT,
    approved_work_left TEXT,
    status TEXT,
    createdAt TEXT,
    FOREIGN KEY (project_id) REFERENCES pms_projects(id)
  )`, [`CREATE INDEX IF NOT EXISTS idx_pms_work_logs_project ON pms_daily_work_logs(project_id)`,
    `CREATE INDEX IF NOT EXISTS idx_pms_work_logs_employee ON pms_daily_work_logs(employee_id)`,
    `CREATE INDEX IF NOT EXISTS idx_pms_work_logs_date ON pms_daily_work_logs(work_date)`]);

  ensureTable('pms_work_photos', `CREATE TABLE pms_work_photos (
    id TEXT PRIMARY KEY,
    work_log_id TEXT,
    file_path TEXT,
    uploaded_by TEXT,
    createdAt TEXT,
    FOREIGN KEY (work_log_id) REFERENCES pms_daily_work_logs(id)
  )`, [`CREATE INDEX IF NOT EXISTS idx_pms_photos_log ON pms_work_photos(work_log_id)`]);

  ensureTable('pms_project_progress', `CREATE TABLE pms_project_progress (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    progress_percent REAL,
    remarks TEXT,
    updated_by TEXT,
    createdAt TEXT,
    FOREIGN KEY (project_id) REFERENCES pms_projects(id)
  )`, [`CREATE INDEX IF NOT EXISTS idx_pms_progress_project ON pms_project_progress(project_id)`]);

  // Weekly tasks table for PMS (planner)
  ensureTable('pms_weekly_tasks', `CREATE TABLE pms_weekly_tasks (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    week_start_date TEXT,
    task_name TEXT,
    total_quantity REAL,
    target_quantity REAL,
    assigned_to TEXT,
    priority TEXT,
    notes TEXT,
    createdAt TEXT,
    FOREIGN KEY (project_id) REFERENCES pms_projects(id)
  )`, [`CREATE INDEX IF NOT EXISTS idx_pms_weekly_tasks_project ON pms_weekly_tasks(project_id)`]);

  // Add multi-variant columns for daily logs
  ensureColumns('pms_daily_work_logs', {
    weekly_task_id: 'TEXT',
    percent_done: 'REAL',
    details: 'TEXT',
    updatedAt: 'TEXT'
  });

  // Project Maps & Layout Management System Tables
  ensureTable('project_files', `CREATE TABLE project_files (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    filename TEXT,
    original_name TEXT,
    filepath TEXT,
    file_size INTEGER,
    file_type TEXT,
    category TEXT,
    revision TEXT,
    revision_number INTEGER,
    keywords TEXT,
    parent_file_id TEXT,
    is_latest INTEGER DEFAULT 1,
    created_by TEXT,
    created_at TEXT,
    FOREIGN KEY (project_id) REFERENCES pms_projects(id)
  )`, [
    `CREATE INDEX IF NOT EXISTS idx_project_files_project ON project_files(project_id)`,
    `CREATE INDEX IF NOT EXISTS idx_project_files_category ON project_files(category)`,
    `CREATE INDEX IF NOT EXISTS idx_project_files_parent ON project_files(parent_file_id)`
  ]);

  ensureTable('project_maps', `CREATE TABLE project_maps (
    id TEXT PRIMARY KEY,
    project_id TEXT UNIQUE,
    file_id TEXT,
    zones TEXT,
    created_at TEXT,
    FOREIGN KEY (project_id) REFERENCES pms_projects(id),
    FOREIGN KEY (file_id) REFERENCES project_files(id)
  )`, [
    `CREATE INDEX IF NOT EXISTS idx_project_maps_project ON project_maps(project_id)`
  ]);

  // Ensure standard columns exist on tables where appropriate
  const tablesToPatch = ['tasks', 'calendar', 'finance', 'notifications', 'projects', 'checklists', 'notepad', 'leaves', 'holidays', 'employee_documents', 'employees_profile'];
  for (const t of tablesToPatch) {
    ensureColumns(t, {
      user_id: 'TEXT',
      created_at: "TEXT DEFAULT (datetime('now'))",
      updated_at: "TEXT"
    });
  }

  // Add is_archived and archived_at columns to users and employees for soft-delete (archive) support
  ensureColumns('users', {
    is_archived: 'INTEGER DEFAULT 0',
    archived_at: 'TEXT'
  });

  ensureColumns('employees', {
    is_archived: 'INTEGER DEFAULT 0',
    archived_at: 'TEXT',
    status: 'TEXT',
    joiningDate: 'TEXT',
    createdAt: 'TEXT',
    designation: 'TEXT',
    email: 'TEXT',
    phone: 'TEXT',
    birthDate: 'TEXT',
    address: 'TEXT',
    documents: 'TEXT',
    hideAttendance: 'INTEGER DEFAULT 0',
    compOffBalance: 'REAL DEFAULT 0'
  });

  // Add leave-specific columns
  ensureColumns('leaves', {
    appliedBy: 'TEXT',
    appliedByName: 'TEXT',
    appliedToName: 'TEXT',
    department: 'TEXT',
    leaveType: 'TEXT DEFAULT "Casual Leave"',
    subject: 'TEXT',
    appliedTo: 'TEXT',
    appliedOn: 'TEXT',
    durationType: 'TEXT DEFAULT "Multiple Days"'
  });

  // KBT System Master Tables
  ensureTable('kbt_sheets', `CREATE TABLE kbt_sheets (
    id TEXT PRIMARY KEY,
    name TEXT,
    department TEXT,
    purpose TEXT,
    url TEXT,
    responsible_person TEXT,
    frequency TEXT,
    status TEXT,
    notes TEXT,
    assigned_users TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  ensureTable('kbt_activities', `CREATE TABLE kbt_activities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT,
    details TEXT,
    actor_name TEXT,
    actor_email TEXT,
    timestamp TEXT DEFAULT (datetime('now'))
  )`);



  // Performance Indexes for high-frequency queries
  const performanceIndexes = [
    `CREATE INDEX IF NOT EXISTS idx_tasks_assigned_created ON tasks(assigned_to, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_tasks_assignedTo_created ON tasks(assignedTo, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)`,
    `CREATE INDEX IF NOT EXISTS idx_attendance_user_date ON attendance(userId, date)`,
    `CREATE INDEX IF NOT EXISTS idx_timelogs_user_start ON timelogs(userId, startTime)`,
    `CREATE INDEX IF NOT EXISTS idx_employees_status_archived ON employees(status, is_archived)`
  ];
  for (const idxSQL of performanceIndexes) {
    try { db.run(idxSQL); } catch (e) { /* ignore */ }
  }

  // Add more specific migrations if needed (e.g., migrate createdDate -> createdAt for tasks)
  try {
    const colsStmt = db.prepare("PRAGMA table_info('tasks')");
    const cols = new Set();
    while (colsStmt.step()) { cols.add(colsStmt.getAsObject().name); }
    colsStmt.free();

    if (!cols.has('createdAt') && cols.has('createdDate')) {
      try {
        db.run("ALTER TABLE tasks ADD COLUMN createdAt TEXT");
        db.run("UPDATE tasks SET createdAt = createdDate WHERE createdAt IS NULL OR createdAt = ''");
        changed = true;
        console.log('Migration: migrated tasks.createdDate -> createdAt');
      } catch (e) { console.warn('Migration: failed to migrate tasks createdDate', e && e.message); }
    }
  } catch (e) { /* ignore */ }

  // Persist DB if we changed schema
  if (changed) {
    try {
      const buff = Buffer.from(db.export());
      safeWriteFileSync(dbFile, buff);
      console.log('Migration: DB file persisted with changes');
    } catch (e) {
      console.error('Migration: failed to persist DB file', e && (e.stack || e.message || e));
    }
  } else {
    console.log('Migration: no changes required');
  }
}

export default { runMigrations };
