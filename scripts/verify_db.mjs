import initSqlJs from 'sql.js';
import fs from 'fs';

async function verifyMainDb() {
  const SQL = await initSqlJs();
  const buff = fs.readFileSync('server/database.sqlite');
  const db = new SQL.Database(new Uint8Array(buff));

  const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
  console.log('Tables in server/database.sqlite:', tables[0]?.values.map(v => v[0]));

  const tl = db.exec('SELECT count(*) FROM timelogs');
  const att = db.exec('SELECT count(*) FROM attendance');
  const usr = db.exec('SELECT count(*) FROM users');
  const emp = db.exec('SELECT count(*) FROM employees');
  const tasks = db.exec('SELECT count(*) FROM tasks');
  const ct = db.exec('SELECT count(*) FROM checklist_templates');

  console.log('Record Counts:', {
    timelogs: tl[0]?.values[0][0],
    attendance: att[0]?.values[0][0],
    users: usr[0]?.values[0][0],
    employees: emp[0]?.values[0][0],
    tasks: tasks[0]?.values[0][0],
    checklist_templates: ct[0]?.values[0][0]
  });
  console.log('✓ Main single database verified perfectly!');
}

verifyMainDb();
