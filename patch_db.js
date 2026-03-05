
import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';

const dbFile = 'c:/Users/Sunil/Downloads/all fms test/working_project/server/database.sqlite';

async function patch(){
  try {
    const SQL = await initSqlJs();
    const buff = fs.readFileSync(dbFile);
    const db = new SQL.Database(new Uint8Array(buff));
    
    console.log('--- Patching Database ---');
    try {
      db.run("ALTER TABLE pms_daily_work_logs ADD COLUMN updatedAt TEXT");
      console.log('Added updatedAt');
    } catch(e) { console.log('updatedAt already exists or failed:', e.message); }

    try {
      db.run("ALTER TABLE pms_daily_work_logs ADD COLUMN percent_done REAL");
      console.log('Added percent_done');
    } catch(e) { console.log('percent_done already exists or failed:', e.message); }

    try {
      db.run("ALTER TABLE pms_daily_work_logs ADD COLUMN details TEXT");
      console.log('Added details');
    } catch(e) { console.log('details already exists or failed:', e.message); }

    const data = db.export();
    fs.writeFileSync(dbFile, Buffer.from(data));
    console.log('Database saved.');
  } catch(e) { console.error(e); }
}
patch();
