(async ()=>{
  const { default: initSqlJs } = await import('sql.js');
  const fs = await import('fs');
  const SQL = await initSqlJs();
  const buff = await fs.promises.readFile('./server/users.sqlite');
  const db = new SQL.Database(new Uint8Array(buff));
  const s = db.prepare("SELECT id FROM employees WHERE REPLACE(id, '-', '') = REPLACE(?, '-', '')");
  s.bind(['E-001']);
  if (s.step()) console.log('match', s.getAsObject()); else console.log('no match');
  s.free();
})();
