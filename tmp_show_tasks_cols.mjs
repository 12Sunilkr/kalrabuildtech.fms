(async ()=>{
  const { default: initSqlJs } = await import('sql.js');
  const fs = await import('fs');
  const SQL = await initSqlJs();
  const buff = await fs.promises.readFile('./server/users.sqlite');
  const db = new SQL.Database(new Uint8Array(buff));
  const s = db.prepare("PRAGMA table_info('tasks')");
  const cols = [];
  while(s.step()) cols.push(s.getAsObject());
  s.free();
  console.log(cols);
})();
