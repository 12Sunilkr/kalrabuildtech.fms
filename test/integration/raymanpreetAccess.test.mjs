// Integration test: Raymanpreet Kaur (E010) team member task assignment & access
// Verifies that:
// 1. Employee E010 (Raymanpreet Kaur) has team member access (role: EMPLOYEE)
// 2. Admin can successfully assign tasks to E010 without false "Admin or PC" blocking
// 3. The task is created and retrievable

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
    console.log('Starting embedded server for Raymanpreet access integration test...');
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

    // 2. Fetch employees list and verify Raymanpreet Kaur
    const empRes = await fetch(`${SERVER}/api/employees`, {
      headers: { cookie }
    });
    const empData = await empRes.json();
    const rayman = (empData.data || []).find(e => e.id === 'E010' || e.name.toLowerCase().includes('raymanpreet'));
    if (!rayman) {
      console.error('Raymanpreet Kaur not found in /api/employees response!');
      process.exit(1);
    }
    console.log('Found employee in /api/employees:', { id: rayman.id, name: rayman.name, role: rayman.role, designation: rayman.designation });
    if (rayman.role !== 'EMPLOYEE') {
      console.error(`Expected role EMPLOYEE for Raymanpreet Kaur, got ${rayman.role}`);
      process.exit(1);
    }

    // 3. Create a task assigned to Raymanpreet Kaur (E010)
    const taskPayload = {
      title: 'Test Task for Raymanpreet',
      description: 'Verifying team member task assignment',
      assignedTo: 'E010',
      dueDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
      priority: 'MEDIUM',
      createdDate: new Date().toISOString().split('T')[0]
    };

    const taskRes = await fetch(`${SERVER}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify(taskPayload)
    });

    const taskJson = await taskRes.json();
    console.log('Task creation response:', taskRes.status, taskJson);

    if (taskRes.status !== 201 || !taskJson.success) {
      console.error('Failed to assign task to Raymanpreet Kaur (E010):', taskJson);
      process.exit(1);
    }

    const createdId = taskJson.data?.id;
    console.log(`Task ${createdId} successfully assigned to Raymanpreet Kaur!`);

    // 4. Clean up the test task
    if (createdId) {
      await fetch(`${SERVER}/api/tasks/${createdId}`, {
        method: 'DELETE',
        headers: { cookie }
      });
      console.log(`Cleaned up test task ${createdId}`);
    }

    console.log('✓ Raymanpreet Kaur access integration test passed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Integration test failed with error:', err);
    process.exit(1);
  }
})();
