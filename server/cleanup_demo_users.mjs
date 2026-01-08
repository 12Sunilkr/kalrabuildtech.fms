#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import initSqlJs from 'sql.js';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbFile = path.resolve(__dirname, 'database.sqlite');

const args = process.argv.slice(2);
const apply = args.includes('--apply') || args.includes('--yes') || args.includes('--force');

console.log('Demo cleanup script — dry-run by default. Use --apply to perform changes.');

if (!fs.existsSync(dbFile)) {
  console.error('Database file not found:', dbFile);
  process.exit(1);
}

try {
  const SQL = await initSqlJs();
  const buff = fs.readFileSync(dbFile);
  const db = new SQL.Database(new Uint8Array(buff));

  const demoEmpIds = ['E-001', 'E-002'];
  const demoNames = ['Alice Employee', 'Bob Employee'];
  const demoUserIds = [3, 4];

  function getTableCols(table) {
    const cols = new Set();
    try {
      const stmt = db.prepare(`PRAGMA table_info('${table}')`);
      while (stmt.step()) {
        const r = stmt.getAsObject();
        cols.add(String(r.name));
      }
      stmt.free();
    } catch (e) { }
    return cols;
  }

  const taskCols = getTableCols('tasks');
  const userCols = getTableCols('users');
  const empCols = getTableCols('employees');

  const taskConds = [];
  if (taskCols.has('assignedTo')) taskConds.push(`assignedTo IN ('${demoEmpIds.join("','")}')`);
  if (taskCols.has('assigned_to')) taskConds.push(`assigned_to IN (${demoUserIds.join(',')})`);
  if (taskCols.has('assignedBy')) taskConds.push(`assignedBy IN ('${demoEmpIds.join("','")}')`);
  if (taskCols.has('assigned_by')) taskConds.push(`assigned_by IN (${demoUserIds.join(',')})`);

  const userConds = [];
  if (userCols.has('name')) userConds.push(`name IN ('${demoNames.join("','")}')`);
  if (userCols.has('id')) userConds.push(`id IN (${demoUserIds.join(',')})`);
  if (userCols.has('employeeId')) userConds.push(`employeeId IN ('${demoEmpIds.join("','")}')`);

  const empConds = [];
  if (empCols.has('id')) empConds.push(`id IN ('${demoEmpIds.join("','")}')`);

  function countTableWhere(table, whereClause) {
    if (!whereClause) return 0;
    try {
      const stmt = db.prepare(`SELECT COUNT(1) AS c FROM ${table} WHERE ${whereClause}`);
      stmt.bind([]);
      let c = 0;
      if (stmt.step()) {
        const r = stmt.getAsObject();
        c = Number(Object.values(r)[0] || 0);
      }
      stmt.free();
      return c;
    } catch (e) { return 0; }
  }

  const taskWhere = taskConds.length ? taskConds.join(' OR ') : null;
  const userWhere = userConds.length ? userConds.join(' OR ') : null;
  const empWhere = empConds.length ? empConds.join(' OR ') : null;

  const tasksCount = countTableWhere('tasks', taskWhere);
  const usersCount = countTableWhere('users', userWhere);
  const empsCount = countTableWhere('employees', empWhere);

  console.log('Dry-run: would delete:');
  console.log(' - employees matching:', empsCount);
  console.log(' - users matching:', usersCount);
  console.log(' - tasks matching:', tasksCount);

  if (!apply) {
    console.log('\nNo changes made (dry-run). To perform deletion run:');
    console.log(`  node ${path.relative(process.cwd(), path.join(__dirname, 'cleanup_demo_users.mjs'))} --apply`);
    try { db.close && db.close(); } catch (e) { /* ignore */ }
    setTimeout(() => process.exit(0), 200);
  }

  try {
    // Backup DB before making destructive changes
    try {
      const backupFile = dbFile + '.bak-' + Date.now();
      fs.copyFileSync(dbFile, backupFile);
      console.log('Backup created at', backupFile);
    } catch (e) { console.warn('Could not create DB backup, proceeding anyway', e && (e.message || e)); }

    db.run('BEGIN TRANSACTION');

    if (taskWhere) {
      const delTasksSql = `DELETE FROM tasks WHERE ${taskWhere}`;
      db.run(delTasksSql);
      console.log('Deleted tasks matching conditions');
    }

    if (empWhere) {
      const delEmpsSql = `DELETE FROM employees WHERE ${empWhere}`;
      db.run(delEmpsSql);
      console.log('Deleted employees matching conditions');
    }

    if (userWhere) {
      const delUsersSql = `DELETE FROM users WHERE ${userWhere}`;
      db.run(delUsersSql);
      console.log('Deleted users matching conditions');
    }

    db.run('COMMIT');
    fs.writeFileSync(dbFile, Buffer.from(db.export()));
    console.log('Changes committed and database persisted to', dbFile);

    const tasksLeft = countTableWhere('tasks', taskWhere);
    const usersLeft = countTableWhere('users', userWhere);
    const empsLeft = countTableWhere('employees', empWhere);
    console.log('After apply: remaining matches -> employees:', empsLeft, 'users:', usersLeft, 'tasks:', tasksLeft);
    try { db.close && db.close(); } catch (e) { /* ignore */ }
    setTimeout(() => process.exit(0), 200);
  } catch (e) {
    try { db.run('ROLLBACK'); } catch (er) { }
    console.error('Failed to apply cleanup:', e && (e.stack || e.message || e));
    try { db.close && db.close(); } catch (ee) { }
    process.exit(2);
  }
} catch (err) {
  console.error('Unexpected error running cleanup script', err && (err.stack || err.message || err));
  process.exit(2);
}
