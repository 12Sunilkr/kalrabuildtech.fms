// Integration test: optionally start the embedded server.
// To use an already-running server instead of starting one here, set USE_RUNNING_SERVER=1

const SERVER = process.env.SERVER || 'http://127.0.0.1:3000';

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

function checkEnvelope(obj, expectedSuccess = true) {
  if (!obj || typeof obj !== 'object' || typeof obj.success !== 'boolean') {
    console.error('Response envelope missing or invalid', obj);
    process.exit(1);
  }
  if (expectedSuccess && obj.success !== true) {
    console.error('Expected success=true but response indicates failure', obj);
    process.exit(1);
  }
  if (!expectedSuccess && obj.success !== false) {
    console.error('Expected success=false but response indicates success', obj);
    process.exit(1);
  }
  if (!('data' in obj)) {
    console.error('Response envelope missing `data`', obj);
    process.exit(1);
  }
  if (typeof obj.message !== 'string') {
    console.error('Response envelope missing `message` string', obj);
    process.exit(1);
  }
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
    console.error('Server not responding at ' + SERVER + '\nMake sure the server is running: `npm run server` and accessible at ' + SERVER);
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

    const tlRes = await fetch(`${SERVER}/api/timelogs`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({ id: tId, userId: 'E-001', startTime: new Date().toISOString(), task: 'Integration Test' })
    });
    const tlBody = await tlRes.json().catch(() => null);
    console.log('timelog status', tlRes.status, tlBody);
    checkEnvelope(tlBody, true);

    const atRes = await fetch(`${SERVER}/api/attendance`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({ id: aId, userId: 'E-001', date: new Date().toISOString().split('T')[0], clockIn: new Date().toISOString() })
    });
    const atBody = await atRes.json().catch(() => null);
    console.log('attendance status', atRes.status, atBody);
    checkEnvelope(atBody, true);

    // --- Tasks API smoke tests ---
    const taskId = `T-IT-${Date.now()}`;
    const taskRes = await fetch(`${SERVER}/api/tasks`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({ title: 'Integration Task', description: 'Created by integration test', assignedTo: 'E-001', dueDate: new Date().toISOString().split('T')[0] })
    });
    const taskBody = await taskRes.json().catch(() => null);
    console.log('task create status', taskRes.status, taskBody);
    checkEnvelope(taskBody, true);

    const getTasks = await fetch(`${SERVER}/api/tasks`, { headers: { cookie } });
    const getTasksBody = await getTasks.json().catch(() => null);
    console.log('tasks (admin):', getTasksBody);
    checkEnvelope(getTasksBody, true);

    // Login as a normal employee to verify GET /api/tasks returns their tasks
    const empLogin = await fetch(`${SERVER}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'alice@example.com', password: 'alice123' })
    });
    const empBody = await empLogin.json().catch(() => null);
    const empSetCookie = empLogin.headers.get('set-cookie') || empLogin.headers.get('Set-Cookie');
    const empCookie = empSetCookie ? empSetCookie.split(';')[0] : undefined;
    checkEnvelope(empBody, true);
    console.log('employee login status', empLogin.status, 'cookie', !!empCookie);

    const getTasksEmp = await fetch(`${SERVER}/api/tasks`, { headers: { cookie: empCookie } });
    const getTasksEmpBody = await getTasksEmp.json().catch(() => null);
    console.log('tasks (employee):', getTasksEmpBody);
    checkEnvelope(getTasksEmpBody, true);

    const getTL = await fetch(`${SERVER}/api/timelogs?userId=E-001`, { headers: { cookie } });
    const getTLBody = await getTL.json().catch(() => null);
    console.log('timelogs:', getTLBody);
    checkEnvelope(getTLBody, true);

    const getAt = await fetch(`${SERVER}/api/attendance?userId=E-001`, { headers: { cookie } });
    const getAtBody = await getAt.json().catch(() => null);
    console.log('attendance:', getAtBody);
    checkEnvelope(getAtBody, true);

    // Now simulate clock-out update
    const endTime = new Date().toISOString();
    const putTL = await fetch(`${SERVER}/api/timelogs/${encodeURIComponent(tId)}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ endTime })
    });
    const putTLBody = await putTL.json().catch(() => null);
    console.log('timelog put status', putTL.status, putTLBody);
    checkEnvelope(putTLBody, true);

    const putAt = await fetch(`${SERVER}/api/attendance/${encodeURIComponent(aId)}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ clockOut: endTime, value: 1 })
    });
    const putAtBody = await putAt.json().catch(() => null);
    console.log('attendance put status', putAt.status, putAtBody);
    checkEnvelope(putAtBody, true);

    const getTL2 = await fetch(`${SERVER}/api/timelogs?userId=E-001`, { headers: { cookie } });
    const getTL2Body = await getTL2.json().catch(() => null);
    console.log('timelogs after put:', getTL2Body);
    checkEnvelope(getTL2Body, true);

    const getAt2 = await fetch(`${SERVER}/api/attendance?userId=E-001`, { headers: { cookie } });
    const getAt2Body = await getAt2.json().catch(() => null);
    console.log('attendance after put:', getAt2Body);
    checkEnvelope(getAt2Body, true);

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
