
import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';

const dbFile = 'c:/Users/Sunil/Downloads/all fms test/working_project/server/database.sqlite';

async function restoreProgress(){
  try {
    const SQL = await initSqlJs();
    const buff = fs.readFileSync(dbFile);
    const db = new SQL.Database(new Uint8Array(buff));
    
    console.log('--- Restoring percent_done from details ---');
    const stmt = db.prepare('SELECT id, percent_done, details FROM pms_daily_work_logs');
    const updates = [];
    while(stmt.step()){
      const r = stmt.getAsObject();
      if(r.details){
        try {
          let d = typeof r.details === 'string' ? JSON.parse(r.details) : r.details;
          if(typeof d === 'string') d = JSON.parse(d);
          if(typeof d === 'string') d = JSON.parse(d);
          if(d && d.percent != null && (r.percent_done == null || r.percent_done === 0)){
             updates.push({ id: r.id, p: d.percent });
          }
        } catch(e) {}
      }
    }
    stmt.free();

    for(const u of updates){
      db.run('UPDATE pms_daily_work_logs SET percent_done = ? WHERE id = ?', [u.p, u.id]);
    }
    
    const data = db.export();
    fs.writeFileSync(dbFile, Buffer.from(data));
    console.log(`Updated ${updates.length} records.`);
  } catch(e) { console.error(e); }
}
restoreProgress();
