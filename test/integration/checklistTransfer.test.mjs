// Integration test for Checklist Routine Transfer & Reactivation
// Tests that when a stopped/archived checklist routine is transferred and reactivated starting from an effective date:
// - In-between stopped tasks (before transferEffectiveDate) stay STOPPED with old assignee
// - Tasks from transferEffectiveDate onwards become PENDING for the new assignee
// - Template is reactivated (active=true) with archive flags cleared

const SERVER = process.env.SERVER || 'http://127.0.0.1:4001';

async function waitForHealth(timeoutMs = 5000, interval = 500) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${SERVER}/api/health`);
      if (res.ok) return true;
    } catch (e) {}
    await new Promise(r => setTimeout(r, interval));
  }
  return false;
}

(async () => {
  if (!process.env.USE_RUNNING_SERVER) {
    console.log('Starting embedded server for checklist transfer integration test...');
    await import('../../server/index.js');
  }

  const ready = await waitForHealth(5000, 500);
  if (!ready) {
    console.error('Server not responding at ' + SERVER);
    process.exit(2);
  }

  try {
    // 1. Admin login
    const login = await fetch(`${SERVER}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@example.com', password: 'admin123' })
    });
    const setCookie = login.headers.get('set-cookie') || login.headers.get('Set-Cookie');
    const cookie = setCookie ? setCookie.split(';')[0] : undefined;
    if (!cookie) {
      console.error('No auth cookie received');
      process.exit(1);
    }

    // 2. Create a test checklist template
    const tplId = `KCT-TEST-${Date.now()}`;
    const tplRes = await fetch(`${SERVER}/api/checklist-templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({
        taskName: 'Integration Transfer Routine',
        doerId: 'E-001',
        department: 'Operations',
        startDate: '2026-10-01',
        config: { frequency: 'DAILY' },
        active: false, // Initially stopped
      })
    });
    const tplBody = await tplRes.json();
    const createdTplId = (tplBody.data && tplBody.data.id) || tplId;
    console.log('Created template:', createdTplId);

    // 3. Create bulk instances:
    // - Item 1: 2026-10-10 (Before transfer date, STOPPED)
    // - Item InBetween: 2026-10-15 (In-between hiatus period before resumption, was PENDING)
    // - Item 2: 2026-10-24 (On transfer date, currently STOPPED)
    // - Item 3: 2026-10-25 (After transfer date, currently STOPPED)
    const item1 = { id: `CI-${createdTplId}-1`, templateId: createdTplId, doerId: 'E-001', date: '2026-10-10', status: 'STOPPED', stoppedReason: 'Employee Archived: Alice' };
    const itemInbetween = { id: `CI-${createdTplId}-inbetween`, templateId: createdTplId, doerId: 'E-001', date: '2026-10-15', status: 'PENDING' };
    const item2 = { id: `CI-${createdTplId}-2`, templateId: createdTplId, doerId: 'E-001', date: '2026-10-24', status: 'STOPPED', stoppedReason: 'Employee Archived: Alice' };
    const item3 = { id: `CI-${createdTplId}-3`, templateId: createdTplId, doerId: 'E-001', date: '2026-10-25', status: 'STOPPED', stoppedReason: 'Employee Archived: Alice' };

    const bulkRes = await fetch(`${SERVER}/api/checklists/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({
        replace: false,
        items: [
          { refId: createdTplId, refType: 'TEMPLATE_INSTANCE', item: JSON.stringify(item1) },
          { refId: createdTplId, refType: 'TEMPLATE_INSTANCE', item: JSON.stringify(itemInbetween) },
          { refId: createdTplId, refType: 'TEMPLATE_INSTANCE', item: JSON.stringify(item2) },
          { refId: createdTplId, refType: 'TEMPLATE_INSTANCE', item: JSON.stringify(item3) },
        ]
      })
    });
    console.log('Bulk insert status:', bulkRes.status);

    // 4. PUT /api/checklist-templates/:id with new doer (e.g. '3'), transferEffectiveDate '2026-10-24', active: true
    const putRes = await fetch(`${SERVER}/api/checklist-templates/${encodeURIComponent(createdTplId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({
        taskName: 'Integration Transfer Routine',
        doerId: '3',
        department: 'Operations',
        startDate: '2026-10-24',
        config: { frequency: 'DAILY' },
        active: true,
        transferEffectiveDate: '2026-10-24',
      })
    });
    const putBody = await putRes.json();
    console.log('PUT template response:', putRes.status, putBody);

    if (putRes.status !== 200 || !putBody.success) {
      console.error('Failed to update template', putBody);
      process.exit(1);
    }

    // 5. Query checklist instances for this template
    const getInstRes = await fetch(`${SERVER}/api/checklists/${encodeURIComponent(createdTplId)}`, {
      headers: { cookie }
    });
    const instBody = await getInstRes.json();
    const rows = instBody.data || [];
    console.log('Fetched instances count:', rows.length);

    let foundPast = null;
    let foundInbetween = null;
    let foundCurrent = null;
    let foundFuture = null;

    for (const r of rows) {
      const p = typeof r.item === 'string' ? JSON.parse(r.item) : r.item;
      if (p.date === '2026-10-10') foundPast = p;
      if (p.date === '2026-10-15') foundInbetween = p;
      if (p.date === '2026-10-24') foundCurrent = p;
      if (p.date === '2026-10-25') foundFuture = p;
    }

    console.log('Past instance (2026-10-10):', foundPast);
    console.log('In-between instance (2026-10-15):', foundInbetween);
    console.log('Current instance (2026-10-24):', foundCurrent);
    console.log('Future instance (2026-10-25):', foundFuture);

    // Verification 1: Past stopped task must remain STOPPED and assigned to E-001
    if (!foundPast || foundPast.status !== 'STOPPED' || foundPast.doerId !== 'E-001') {
      console.error('FAIL: Past instance was not preserved as STOPPED for E-001', foundPast);
      process.exit(1);
    }

    // Verification 1b: In-between hiatus task (2026-10-15) must be dead (STOPPED), NOT PENDING!
    if (!foundInbetween || foundInbetween.status !== 'STOPPED') {
      console.error('FAIL: In-between instance was not marked dead (STOPPED)', foundInbetween);
      process.exit(1);
    }

    // Verification 2: Current instance (2026-10-24) must be un-stopped to PENDING and assigned to '3'
    if (!foundCurrent || foundCurrent.status !== 'PENDING' || foundCurrent.doerId !== '3') {
      console.error('FAIL: Current instance was not un-stopped to PENDING for new doer 3', foundCurrent);
      process.exit(1);
    }

    // Verification 3: Future instance (2026-10-25) must be un-stopped to PENDING and assigned to '3'
    if (!foundFuture || foundFuture.status !== 'PENDING' || foundFuture.doerId !== '3') {
      console.error('FAIL: Future instance was not un-stopped to PENDING for new doer 3', foundFuture);
      process.exit(1);
    }

    console.log('\nChecklist transfer integration test passed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Integration test error:', err);
    process.exit(2);
  }
})();
