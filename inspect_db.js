
import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';

const dbFile = 'c:/Users/Sunil/Downloads/all fms test/working_project/server/database.sqlite';

async function check() {
    try {
        const SQL = await initSqlJs();
        const buff = fs.readFileSync(dbFile);
        const db = new SQL.Database(new Uint8Array(buff));

        console.log('--- Table Schema ---');
        const stmt = db.prepare("SELECT sql FROM sqlite_master WHERE name='pms_daily_work_logs'");
        if (stmt.step()) {
            console.log(stmt.getAsObject().sql);
        }
        stmt.free();

        console.log('--- Last 5 entries ---');
        const logs = db.prepare("SELECT * FROM pms_daily_work_logs ORDER BY createdAt DESC LIMIT 5");
        while (logs.step()) {
            console.log(JSON.stringify(logs.getAsObject()));
        }
        logs.free();
    } catch (e) { console.error(e); }
}
check();
