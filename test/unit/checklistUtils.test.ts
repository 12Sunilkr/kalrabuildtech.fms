import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { applyTransferToInstances, sanitizeTemplateOnReactivate } from '../../utils/checklistUtils.ts';

describe('checklistUtils Unit Tests', () => {
  describe('applyTransferToInstances', () => {
    test('preserves stopped status and old doer for tasks in between (date < transferEffectiveDate)', () => {
      const initialInstances = [
        {
          id: 'CI-1',
          templateId: 'CT-100',
          doerId: 'E-OLD',
          department: 'Sales',
          date: '2026-10-15',
          status: 'STOPPED',
          stoppedReason: 'Employee Archived: Alice',
          done: 0,
        },
        {
          id: 'CI-2',
          templateId: 'CT-100',
          doerId: 'E-OLD',
          department: 'Sales',
          date: '2026-10-18',
          status: 'STOPPED',
          stoppedReason: 'Employee Archived: Alice',
          done: 0,
        },
      ];

      const result = applyTransferToInstances({
        instances: initialInstances,
        templateId: 'CT-100',
        oldDoerId: 'E-OLD',
        newDoerId: 'E-NEW',
        newDepartment: 'Operations',
        transferEffectiveDate: '2026-10-24',
        reactivate: true,
      });

      // Both are before 2026-10-24, so they MUST remain STOPPED and assigned to E-OLD
      assert.equal(result[0].status, 'STOPPED');
      assert.equal(result[0].doerId, 'E-OLD');
      assert.equal(result[0].stoppedReason, 'Employee Archived: Alice');

      assert.equal(result[1].status, 'STOPPED');
      assert.equal(result[1].doerId, 'E-OLD');
      assert.equal(result[1].stoppedReason, 'Employee Archived: Alice');
    });

    test('marks in-between uncompleted pending tasks as dead (STOPPED) when routine is resumed', () => {
      const initialInstances = [
        {
          id: 'CI-IN-BETWEEN',
          templateId: 'CT-100',
          doerId: 'E-OLD',
          department: 'Sales',
          date: '2026-09-25',
          status: 'PENDING', // In-between task that was pending when stopped
          done: 0,
        },
      ];

      const result = applyTransferToInstances({
        instances: initialInstances,
        templateId: 'CT-100',
        oldDoerId: 'E-OLD',
        newDoerId: 'E-NEW',
        newDepartment: 'Operations',
        transferEffectiveDate: '2026-10-24',
        reactivate: true,
      });

      // Task in between stopped and continue period MUST BE DEAD (STOPPED), NOT PENDING!
      assert.equal(result[0].status, 'STOPPED');
      assert.equal(result[0].doerId, 'E-OLD');
      assert.match(result[0].stoppedReason, /stopped|hiatus|dead/i);
    });

    test('reassigns and un-stops tasks from transferEffectiveDate onwards when reactivated', () => {
      const initialInstances = [
        // Past stopped task
        {
          id: 'CI-1',
          templateId: 'CT-100',
          doerId: 'E-OLD',
          department: 'Sales',
          date: '2026-10-15',
          status: 'STOPPED',
          stoppedReason: 'Employee Archived: Alice',
          done: 0,
        },
        // Task on or after transferEffectiveDate
        {
          id: 'CI-2',
          templateId: 'CT-100',
          doerId: 'E-OLD',
          department: 'Sales',
          date: '2026-10-24',
          status: 'STOPPED',
          stoppedReason: 'Employee Archived: Alice',
          done: 0,
        },
        // Future task
        {
          id: 'CI-3',
          templateId: 'CT-100',
          doerId: 'E-OLD',
          department: 'Sales',
          date: '2026-10-25',
          status: 'STOPPED',
          stoppedReason: 'Employee Archived: Alice',
          done: 0,
        },
      ];

      const result = applyTransferToInstances({
        instances: initialInstances,
        templateId: 'CT-100',
        oldDoerId: 'E-OLD',
        newDoerId: 'E-NEW',
        newDepartment: 'Operations',
        transferEffectiveDate: '2026-10-24',
        reactivate: true,
      });

      // Task 1 remains stopped for old user
      assert.equal(result[0].status, 'STOPPED');
      assert.equal(result[0].doerId, 'E-OLD');

      // Task 2 is transferred, department updated, and unstopped to PENDING
      assert.equal(result[1].status, 'PENDING');
      assert.equal(result[1].doerId, 'E-NEW');
      assert.equal(result[1].department, 'Operations');
      assert.equal(result[1].stoppedReason, undefined);

      // Task 3 is transferred, department updated, and unstopped to PENDING
      assert.equal(result[2].status, 'PENDING');
      assert.equal(result[2].doerId, 'E-NEW');
      assert.equal(result[2].department, 'Operations');
      assert.equal(result[2].stoppedReason, undefined);
    });

    test('does not modify instances belonging to other templates', () => {
      const initialInstances = [
        {
          id: 'CI-OTHER',
          templateId: 'CT-999',
          doerId: 'E-OTHER',
          department: 'HR',
          date: '2026-10-24',
          status: 'STOPPED',
          done: 0,
        },
      ];

      const result = applyTransferToInstances({
        instances: initialInstances,
        templateId: 'CT-100',
        oldDoerId: 'E-OLD',
        newDoerId: 'E-NEW',
        newDepartment: 'Operations',
        transferEffectiveDate: '2026-10-24',
        reactivate: true,
      });

      assert.equal(result[0].doerId, 'E-OTHER');
      assert.equal(result[0].status, 'STOPPED');
    });

    test('does not modify already completed tasks even if date is >= transferEffectiveDate', () => {
      const initialInstances = [
        {
          id: 'CI-COMPLETED',
          templateId: 'CT-100',
          doerId: 'E-OLD',
          department: 'Sales',
          date: '2026-10-24',
          status: 'COMPLETED',
          done: 1,
        },
      ];

      const result = applyTransferToInstances({
        instances: initialInstances,
        templateId: 'CT-100',
        oldDoerId: 'E-OLD',
        newDoerId: 'E-NEW',
        newDepartment: 'Operations',
        transferEffectiveDate: '2026-10-24',
        reactivate: true,
      });

      assert.equal(result[0].status, 'COMPLETED');
      assert.equal(result[0].doerId, 'E-OLD');
    });
  });

  describe('sanitizeTemplateOnReactivate', () => {
    test('clears archive-related stop flags when template is reactivated', () => {
      const templateData = {
        taskName: 'Daily Report',
        doerId: 'E-OLD',
        active: false,
        stoppedDueToArchive: true,
        archivedAt: '2026-10-15T00:00:00.000Z',
        archivedMemberName: 'Alice',
      };

      const result = sanitizeTemplateOnReactivate(templateData, {
        newDoerId: 'E-NEW',
        newDepartment: 'Operations',
        newStartDate: '2026-10-24',
      });

      assert.equal(result.active, true);
      assert.equal(result.doerId, 'E-NEW');
      assert.equal(result.department, 'Operations');
      assert.equal(result.startDate, '2026-10-24');
      assert.equal(result.stoppedDueToArchive, undefined);
      assert.equal(result.archivedAt, undefined);
      assert.equal(result.archivedMemberName, undefined);
    });
  });
});
