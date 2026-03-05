
import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';

const dbFile = 'c:/Users/Sunil/Downloads/all fms test/working_project/server/database.sqlite';

async function check(){
  try {
    const SQL = await initSqlJs();
    const buff = fs.readFileSync(dbFile);
    const db = new SQL.Database(new Uint8Array(buff));
    
    console.log('--- Triggers ---');
    const stmt = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='trigger'");
    while(stmt.step()){
      console.log(JSON.stringify(stmt.getAsObject()));
    }
    stmt.free();

    console.log('--- Table Schema (Detailed) ---');
    const cols = db.prepare("PRAGMA table_info('pms_daily_work_logs')");
    while(cols.step()){
      console.log(JSON.stringify(cols.getAsObject()));
    }
    cols.free();
  } catch(e) { console.error(e); }
}
check();
