// Integration test: optionally start the embedded server.
// To use an already-running server instead of starting one here, set USE_RUNNING_SERVER=1

const SERVER = 'http://127.0.0.1:3000';

async function waitForHealth(timeoutMs = 5000, interval = 500) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${SERVER}/api/health`);
      if (res.ok) return true;
    } catch (e) {
      // server not ready yet
    }
    await new Promise(r => setTimeout(r, interval));
  }
  return false;
}

(async () => {
  if (!process.env.USE_RUNNING_SERVER) {
    console.log('Starting embedded server for integration test...');
    await import('../server/index.js');
  } else {
    console.log('Using existing running server for integration test (set USE_RUNNING_SERVER=1 to enable)');
  }

  const ready = await waitForHealth(5000, 500);
  if (!ready) {
    console.error('Server not responding at', SERVER, '\nMake sure the server is running: `npm run server` and accessible at http://127.0.0.1:3000');
    process.exit(2);
  }

  try {
    let login;
    try {
      login = await fetch(`${SERVER}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@example.com', password: 'admin123' })
      });
    } catch (err) {
      console.error('Network error when calling /api/auth/login:', err && (err.stack || err.message || err));
      process.exit(2);
    }
    console.log('login status', login.status);
    const setCookie = login.headers.get('set-cookie') || login.headers.get('Set-Cookie');
    console.log('set-cookie:', setCookie);
    const cookie = setCookie ? setCookie.split(';')[0] : undefined;
    if (!cookie) { console.error('No auth cookie received'); process.exit(1); }

    // Create timelog + attendance for E-001
    const tId = `T-E-001-${Date.now()}`;
    const aId = `A-E-001-${Date.now()}`;

    const tlRes = await fetch('http://127.0.0.1:3000/api/timelogs', {
      method: 'POST', headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({ id: tId, userId: 'E-001', startTime: new Date().toISOString(), task: 'Integration Test' })
    });
    console.log('timelog status', tlRes.status, await tlRes.text());

    const atRes = await fetch('http://127.0.0.1:3000/api/attendance', {
      method: 'POST', headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({ id: aId, userId: 'E-001', date: new Date().toISOString().split('T')[0], clockIn: new Date().toISOString() })
    });
    console.log('attendance status', atRes.status, await atRes.text());

    const getTL = await fetch('http://127.0.0.1:3000/api/timelogs?userId=E-001', { headers: { cookie } });
    console.log('timelogs:', await getTL.json());

    const getAt = await fetch('http://127.0.0.1:3000/api/attendance?userId=E-001', { headers: { cookie } });
    console.log('attendance:', await getAt.json());

    // Now simulate clock-out update
    const endTime = new Date().toISOString();
    const putTL = await fetch(`http://127.0.0.1:3000/api/timelogs/${encodeURIComponent(tId)}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ endTime })
    });
    console.log('timelog put status', putTL.status, await putTL.text());

    const putAt = await fetch(`http://127.0.0.1:3000/api/attendance/${encodeURIComponent(aId)}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ clockOut: endTime, value: 1 })
    });
    console.log('attendance put status', putAt.status, await putAt.text());

    const getTL2 = await fetch('http://127.0.0.1:3000/api/timelogs?userId=E-001', { headers: { cookie } });
    console.log('timelogs after put:', await getTL2.json());

    const getAt2 = await fetch('http://127.0.0.1:3000/api/attendance?userId=E-001', { headers: { cookie } });
    console.log('attendance after put:', await getAt2.json());

    // Check DB for password hashes using sql.js
    const { default: initSqlJs } = await import('sql.js');
    const fs = await import('fs');
    const SQL = await initSqlJs();
    const buff = fs.readFileSync('./server/users.sqlite');
    const db = new SQL.Database(new Uint8Array(buff));
    const st = db.prepare('SELECT id, email, password FROM users');
    const users = [];
    while (st.step()) {
      users.push(st.getAsObject());
    }
    st.free();
    console.log('users from DB:');
    console.dir(users, { depth: null });

    console.log('\nIntegration test completed successfully.');
    process.exit(0);
  } catch (err) {
    console.error('Integration run failed', err);
    process.exit(2);
  }
})();
