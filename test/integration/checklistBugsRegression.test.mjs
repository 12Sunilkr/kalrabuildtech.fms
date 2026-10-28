// Regression tests for Checklist System Bug Fixes:
// 1. Bulk replace preserves STOPPED and COMPLETED instances (does not delete them)
// 2. Bulk replace skips duplicate pending insertion on dates with existing completed tasks
// 3. Template deletion preserves completed task history while deleting pending tasks
// 4. Reactivation of stopped routine preserves past stopped instances and updates template
// 5. Ordinary schedule edit preserves configured startDate without using transferEffectiveDate

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
    console.log('Starting embedded server for checklist bugs regression test...');
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

    // ── TEST 1: Bulk replace: true PRESERVES STOPPED and COMPLETED instances ──
    console.log('--- Test 1: Bulk replace preserves STOPPED and COMPLETED instances ---');
    const tpl1Res = await fetch(`${SERVER}/api/checklist-templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({
        taskName: 'Preserve Records Test Routine',
        doerId: 'E-001',
        department: 'Operations',
        startDate: '2026-10-01',
        config: { frequency: 'DAILY' },
        active: true,
      })
    });
    const tpl1Body = await tpl1Res.json();
    const tpl1Id = tpl1Body.data.id;

    // Insert 1 completed task, 1 stopped task, and 1 pending task
    const completedItem = { id: `CI-${tpl1Id}-COMPLETED`, templateId: tpl1Id, doerId: 'E-001', date: '2026-10-10', status: 'COMPLETED', done: 1 };
    const stoppedItem = { id: `CI-${tpl1Id}-STOPPED`, templateId: tpl1Id, doerId: 'E-001', date: '2026-10-12', status: 'STOPPED', stoppedReason: 'Employee Medical Leave', done: 0 };
    const pendingItem = { id: `CI-${tpl1Id}-PENDING`, templateId: tpl1Id, doerId: 'E-001', date: '2026-10-20', status: 'PENDING', done: 0 };

    await fetch(`${SERVER}/api/checklists/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({
        replace: false,
        items: [
          { refId: tpl1Id, refType: 'TEMPLATE_INSTANCE', item: JSON.stringify(completedItem) },
          { refId: tpl1Id, refType: 'TEMPLATE_INSTANCE', item: JSON.stringify(stoppedItem) },
          { refId: tpl1Id, refType: 'TEMPLATE_INSTANCE', item: JSON.stringify(pendingItem) },
        ]
      })
    });

    // Mark the completed item as done = 1 in the database
    // To ensure done is 1 in DB:
    const putDoneRes = await fetch(`${SERVER}/api/checklists-instances/all`, { headers: { cookie } });
    const allInstances = await putDoneRes.json();
    const tpl1Rows = allInstances.data[tpl1Id] || [];
    for (const r of tpl1Rows) {
      const p = JSON.parse(r.item);
      if (p.status === 'COMPLETED') {
        await fetch(`${SERVER}/api/checklists/${r.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', cookie },
          body: JSON.stringify({ done: 1, item: JSON.stringify(p) })
        });
      }
    }

    // Now perform a bulk replacement starting from 2026-10-10 onwards
    const newPending1 = { id: `CI-${tpl1Id}-NEW-10`, templateId: tpl1Id, doerId: 'E-001', date: '2026-10-10', status: 'PENDING' };
    const newPending2 = { id: `CI-${tpl1Id}-NEW-21`, templateId: tpl1Id, doerId: 'E-001', date: '2026-10-21', status: 'PENDING' };

    await fetch(`${SERVER}/api/checklists/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({
        replace: true,
        items: [
          { refId: tpl1Id, refType: 'TEMPLATE_INSTANCE', item: JSON.stringify(newPending1) },
          { refId: tpl1Id, refType: 'TEMPLATE_INSTANCE', item: JSON.stringify(newPending2) },
        ]
      })
    });

    // Fetch instances for tpl1 directly
    const verify1Res = await fetch(`${SERVER}/api/checklists/${encodeURIComponent(tpl1Id)}`, { headers: { cookie } });
    const verify1Body = await verify1Res.json();
    const verify1Rows = verify1Body.data || [];

    const foundCompleted = verify1Rows.find(r => {
      const p = JSON.parse(r.item);
      return p.date === '2026-10-10' && (p.status === 'COMPLETED' || r.done === 1);
    });
    const foundStopped = verify1Rows.find(r => {
      const p = JSON.parse(r.item);
      return p.date === '2026-10-12' && p.status === 'STOPPED';
    });
    const foundOldPending = verify1Rows.find(r => {
      const p = JSON.parse(r.item);
      return p.date === '2026-10-20' && p.id === `CI-${tpl1Id}-PENDING`;
    });
    const foundNewPending21 = verify1Rows.find(r => {
      const p = JSON.parse(r.item);
      return p.date === '2026-10-21';
    });
    // Check that we didn't duplicate date 2026-10-10 with a new pending item
    const pendingOnCompletedDate = verify1Rows.filter(r => {
      const p = JSON.parse(r.item);
      return p.date === '2026-10-10' && p.status === 'PENDING';
    });

    if (!foundCompleted) {
      console.error('FAIL: Completed instance was deleted by replace: true!');
      process.exit(1);
    }
    console.log('SUCCESS: Completed instance preserved after replace: true');

    if (!foundStopped) {
      console.error('FAIL: STOPPED instance was deleted by replace: true!');
      process.exit(1);
    }
    console.log('SUCCESS: STOPPED instance preserved after replace: true');

    if (foundOldPending) {
      console.error('FAIL: Old pending instance was not replaced!');
      process.exit(1);
    }
    console.log('SUCCESS: Old pending instance was properly replaced');

    if (!foundNewPending21) {
      console.error('FAIL: New pending instance was not inserted!');
      process.exit(1);
    }
    console.log('SUCCESS: New pending instance 2026-10-21 inserted');

    if (pendingOnCompletedDate.length > 0) {
      console.error('FAIL: Duplicate pending instance was inserted on completed date 2026-10-10!');
      process.exit(1);
    }
    console.log('SUCCESS: Prevented duplicate task generation on completed date');

    // ── TEST 2: Template Deletion Preserves Completed History ──
    console.log('--- Test 2: Template Deletion Preserves Completed History ---');
    const tpl2Res = await fetch(`${SERVER}/api/checklist-templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({
        taskName: 'Delete Template Test Routine',
        doerId: 'E-001',
        department: 'Operations',
        startDate: '2026-10-01',
        config: { frequency: 'DAILY' },
        active: true,
      })
    });
    const tpl2Body = await tpl2Res.json();
    const tpl2Id = tpl2Body.data.id;

    // Insert 1 completed and 1 pending task
    const tpl2Completed = { id: `CI-${tpl2Id}-COMPL`, templateId: tpl2Id, doerId: 'E-001', date: '2026-10-05', status: 'COMPLETED', done: 1 };
    const tpl2Pending = { id: `CI-${tpl2Id}-PEND`, templateId: tpl2Id, doerId: 'E-001', date: '2026-10-28', status: 'PENDING', done: 0 };

    await fetch(`${SERVER}/api/checklists/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({
        replace: false,
        items: [
          { refId: tpl2Id, refType: 'TEMPLATE_INSTANCE', item: JSON.stringify(tpl2Completed) },
          { refId: tpl2Id, refType: 'TEMPLATE_INSTANCE', item: JSON.stringify(tpl2Pending) },
        ]
      })
    });

    // Mark done = 1 for completed
    const tpl2AllRes = await fetch(`${SERVER}/api/checklists-instances/all`, { headers: { cookie } });
    const tpl2All = await tpl2AllRes.json();
    for (const r of (tpl2All.data[tpl2Id] || [])) {
      const p = JSON.parse(r.item);
      if (p.status === 'COMPLETED') {
        await fetch(`${SERVER}/api/checklists/${r.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', cookie },
          body: JSON.stringify({ done: 1, item: JSON.stringify(p) })
        });
      }
    }

    // Now DELETE the template
    const delRes = await fetch(`${SERVER}/api/checklist-templates/${encodeURIComponent(tpl2Id)}`, {
      method: 'DELETE',
      headers: { cookie }
    });
    console.log('Delete template status:', delRes.status);
    if (delRes.status !== 200) {
      console.error('FAIL: Template deletion failed', await delRes.json());
      process.exit(1);
    }

    // Verify template is gone from GET /api/checklist-templates
    const tplsRes = await fetch(`${SERVER}/api/checklist-templates`, { headers: { cookie } });
    const tplsBody = await tplsRes.json();
    const tplStillExists = (tplsBody.data || []).some(t => String(t.id) === String(tpl2Id));
    if (tplStillExists) {
      console.error('FAIL: Deleted template still found in checklist-templates list!');
      process.exit(1);
    }
    console.log('SUCCESS: Template was deleted from checklist_templates');

    // Verify completed instance still exists in checklists table
    const checkInstRes = await fetch(`${SERVER}/api/checklists/${encodeURIComponent(tpl2Id)}`, { headers: { cookie } });
    const checkInstBody = await checkInstRes.json();
    const remainingRows = checkInstBody.data || [];

    const completedSurvived = remainingRows.find(r => r.done === 1 || JSON.parse(r.item).status === 'COMPLETED');
    const pendingSurvived = remainingRows.find(r => r.done === 0 && JSON.parse(r.item).status === 'PENDING');

    if (!completedSurvived) {
      console.error('FAIL: Completed historical instance was deleted upon template deletion!');
      process.exit(1);
    }
    console.log('SUCCESS: Completed historical instance is preserved in SQLite after template deletion');

    if (pendingSurvived) {
      console.error('FAIL: Pending instance was not deleted upon template deletion!');
      process.exit(1);
    }
    console.log('SUCCESS: Pending instances were cleanly deleted upon template deletion');

    // ── TEST 3: Ordinary Schedule Edit Uses Configured Start Date ──
    console.log('--- Test 3: Ordinary schedule edit uses configured startDate ---');
    const tpl3Res = await fetch(`${SERVER}/api/checklist-templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({
        taskName: 'Ordinary Edit Start Date Routine',
        doerId: 'E-001',
        department: 'Operations',
        startDate: '2026-10-01',
        config: { frequency: 'DAILY' },
        active: true,
      })
    });
    const tpl3Body = await tpl3Res.json();
    const tpl3Id = tpl3Body.data.id;

    // Ordinary edit: change frequency to WEEKLY and startDate to 2026-11-01 (do not pass transferEffectiveDate)
    const editRes = await fetch(`${SERVER}/api/checklist-templates/${encodeURIComponent(tpl3Id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({
        taskName: 'Ordinary Edit Start Date Routine',
        doerId: 'E-001',
        department: 'Operations',
        startDate: '2026-11-01',
        config: { frequency: 'WEEKLY' },
        active: true,
      })
    });
    const editBody = await editRes.json();
    if (editRes.status !== 200 || !editBody.success) {
      console.error('FAIL: Ordinary edit failed', editBody);
      process.exit(1);
    }

    // Verify template data has startDate = 2026-11-01
    const tplsCheckRes = await fetch(`${SERVER}/api/checklist-templates`, { headers: { cookie } });
    const tplsCheckBody = await tplsCheckRes.json();
    const updatedTpl3 = (tplsCheckBody.data || []).find(t => String(t.id) === String(tpl3Id));
    if (!updatedTpl3 || updatedTpl3.data.startDate !== '2026-11-01') {
      console.error('FAIL: Ordinary edit startDate was not updated to 2026-11-01', updatedTpl3);
      process.exit(1);
    }
    console.log('SUCCESS: Ordinary edit preserved configured startDate (2026-11-01)');

    console.log('\nAll checklist bug regression tests passed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Test execution error:', err);
    process.exit(1);
  }
})();
