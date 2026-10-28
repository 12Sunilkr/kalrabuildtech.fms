// Integration test: Checklist Frequency works like Sunday on Holidays
// Tests that when a holiday is added to the holiday list:
// 1. Daily routine tasks on that holiday date are excluded/skipped (just like Sunday)
// 2. Weekly/Monthly routine tasks on that holiday date are shifted forward to the next business day (just like Sunday)
// 3. Deleting the holiday restores the shifted tasks back to their original scheduled dates

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
    console.log('Starting embedded server for holiday checklist integration test...');
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

    const testTimestamp = Date.now();
    const testHolidayDate = '2026-11-18'; // Wednesday

    // 2. Create a test Daily template and a Weekly template
    const dailyRes = await fetch(`${SERVER}/api/checklist-templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({
        taskName: 'Daily Cleaning Routine',
        doerId: 'E-001',
        department: 'Operations',
        startDate: '2026-11-16',
        config: { frequency: 'DAILY' },
        active: true,
      })
    });
    const dailyJson = await dailyRes.json();
    const dailyTplId = dailyJson.data?.id || `KCT-HOL-DAILY-${testTimestamp}`;

    const weeklyRes = await fetch(`${SERVER}/api/checklist-templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({
        taskName: 'Weekly Audit Routine',
        doerId: 'E-001',
        department: 'Operations',
        startDate: '2026-11-16',
        config: { frequency: 'WEEKLY' },
        active: true,
      })
    });
    const weeklyJson = await weeklyRes.json();
    const weeklyTplId = weeklyJson.data?.id || `KCT-HOL-WEEKLY-${testTimestamp}`;

    // 3. Bulk insert instances for both templates (prior to adding the holiday)
    // Daily instance on 2026-11-18
    // Weekly instance on 2026-11-18
    await fetch(`${SERVER}/api/checklists/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({
        items: [
          {
            refId: dailyTplId,
            refType: 'TEMPLATE_INSTANCE',
            item: JSON.stringify({
              id: `CI-${dailyTplId}-1`,
              templateId: dailyTplId,
              doerId: 'E-001',
              taskName: 'Daily Cleaning Routine',
              department: 'Operations',
              date: testHolidayDate,
              status: 'PENDING',
            })
          },
          {
            refId: weeklyTplId,
            refType: 'TEMPLATE_INSTANCE',
            item: JSON.stringify({
              id: `CI-${weeklyTplId}-1`,
              templateId: weeklyTplId,
              doerId: 'E-001',
              taskName: 'Weekly Audit Routine',
              department: 'Operations',
              date: testHolidayDate,
              status: 'PENDING',
            })
          }
        ]
      })
    });

    console.log('Inserted test checklist instances for date ' + testHolidayDate);

    // 4. Add holiday on testHolidayDate
    const holRes = await fetch(`${SERVER}/api/holidays`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({
        name: 'Special Company Off-Day',
        date: testHolidayDate,
      })
    });
    const holJson = await holRes.json();
    const holidayId = holJson.data?.id;
    console.log('Created holiday:', holidayId, 'on date', testHolidayDate);

    // 5. Fetch checklist instances from server
    const checkRes = await fetch(`${SERVER}/api/checklists-instances/all`, {
      headers: { cookie }
    });
    const checkJson = await checkRes.json();
    const grouped = checkJson.data || {};

    const dailyRows = (grouped[dailyTplId] || []).map(r => {
      try { return JSON.parse(r.item); } catch (e) { return r; }
    });
    const weeklyRows = (grouped[weeklyTplId] || []).map(r => {
      try { return JSON.parse(r.item); } catch (e) { return r; }
    });

    console.log('Daily instances after holiday added:', dailyRows);
    console.log('Weekly instances after holiday added:', weeklyRows);

    // DAILY: Must NOT have any pending task on testHolidayDate (works like Sunday)
    const dailyOnHoliday = dailyRows.find(i => i.date === testHolidayDate && i.status === 'PENDING');
    if (dailyOnHoliday) {
      console.error('FAILED: Daily pending task exists on holiday date', dailyOnHoliday);
      process.exit(1);
    }
    console.log('SUCCESS: Daily checklist instance correctly skipped on holiday date');

    // WEEKLY: Must have shifted forward to next working day (2026-11-19)
    const weeklyOnHoliday = weeklyRows.find(i => i.date === testHolidayDate && i.status === 'PENDING');
    if (weeklyOnHoliday) {
      console.error('FAILED: Weekly pending task was not shifted away from holiday date', weeklyOnHoliday);
      process.exit(1);
    }
    const weeklyShifted = weeklyRows.find(i => i.date === '2026-11-19');
    if (!weeklyShifted || !weeklyShifted.shiftedDueToHoliday) {
      console.error('FAILED: Weekly task did not shift to next business day with shiftedDueToHoliday flag', weeklyShifted);
      process.exit(1);
    }
    console.log('SUCCESS: Weekly checklist instance correctly shifted to next business day (2026-11-19)');

    // 6. Delete the holiday
    if (holidayId) {
      await fetch(`${SERVER}/api/holidays/${encodeURIComponent(holidayId)}`, {
        method: 'DELETE',
        headers: { cookie }
      });
      console.log('Deleted test holiday:', holidayId);

      // Verify that weekly task restores to original date
      const checkResAfter = await fetch(`${SERVER}/api/checklists-instances/all`, {
        headers: { cookie }
      });
      const checkJsonAfter = await checkResAfter.json();
      const groupedAfter = checkJsonAfter.data || {};
      const weeklyRowsAfter = (groupedAfter[weeklyTplId] || []).map(r => {
        try { return JSON.parse(r.item); } catch (e) { return r; }
      });
      const restoredWeekly = weeklyRowsAfter.find(i => i.date === testHolidayDate);
      if (!restoredWeekly) {
        console.error('FAILED: Weekly task was not restored after holiday removal', weeklyRowsAfter);
        process.exit(1);
      }
      console.log('SUCCESS: Weekly checklist instance restored to original date after holiday removal');
    }

    console.log('Holiday checklist integration test passed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Integration test failed with error:', err);
    process.exit(1);
  }
})();
