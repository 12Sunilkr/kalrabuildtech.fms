import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isAdminOrPc, isProcessCoordinator } from '../../utils/roleUtils.ts';

describe('roleUtils Unit Tests', () => {
  test('isAdminOrPc returns false for null/undefined/empty input', () => {
    assert.equal(isAdminOrPc(null), false);
    assert.equal(isAdminOrPc(undefined), false);
    assert.equal(isAdminOrPc(''), false);
    assert.equal(isAdminOrPc('   '), false);
  });

  test('isAdminOrPc detects admin / PC identifiers by string id', () => {
    assert.equal(isAdminOrPc('E-PC101'), true);
    assert.equal(isAdminOrPc('e-pc101'), true);
    assert.equal(isAdminOrPc('U-ADMIN-01'), true);
    assert.equal(isAdminOrPc('U-PC-99'), true);
    assert.equal(isAdminOrPc('E-001'), false);
  });

  test('isAdminOrPc detects admin role on employee/user object', () => {
    assert.equal(isAdminOrPc({ role: 'ADMIN' } as any), true);
    assert.equal(isAdminOrPc({ role: 'PC' } as any), true);
    assert.equal(isAdminOrPc({ role: 'SUPER_ADMIN' } as any), true);
    assert.equal(isAdminOrPc({ role: 'EMPLOYEE' } as any), false);
  });

  test('isAdminOrPc detects admin / PC designation on employee object when role is not EMPLOYEE', () => {
    assert.equal(isAdminOrPc({ designation: 'Process Coordinator' } as any), true);
    assert.equal(isAdminOrPc({ designation: 'Admin' } as any), true);
    assert.equal(isAdminOrPc({ designation: 'pc' } as any), true);
    assert.equal(isAdminOrPc({ designation: 'Software Engineer' } as any), false);
  });

  test('isAdminOrPc returns false for team member with role EMPLOYEE even if designation is PC (e.g. Raymanpreet Kaur)', () => {
    const raymanEmp = {
      id: 'E010',
      name: 'Raymanpreet Kaur',
      designation: 'PC',
      department: 'Strategy & Business Development',
      role: 'EMPLOYEE' as const
    };
    const users = [
      { id: 13, name: 'Raymanpreet Kaur', email: 'kalrabuildtech5@gmail.com', role: 'EMPLOYEE' as const, employeeId: 'E010' }
    ];
    // Object with direct role EMPLOYEE
    assert.equal(isAdminOrPc(raymanEmp, users as any), false);
    // Object with linked user in users list having EMPLOYEE role
    assert.equal(isAdminOrPc({ id: 'E010', name: 'Raymanpreet Kaur', designation: 'PC' } as any, users as any), false);
    // String id with users list
    assert.equal(isAdminOrPc('E010', users as any), false);
  });

  test('isProcessCoordinator returns false for employee with role EMPLOYEE even if designation is PC', () => {
    const raymanEmp = {
      id: 'E010',
      name: 'Raymanpreet Kaur',
      designation: 'PC',
      role: 'EMPLOYEE' as const
    };
    const users = [
      { id: 13, name: 'Raymanpreet Kaur', email: 'kalrabuildtech5@gmail.com', role: 'EMPLOYEE' as const, employeeId: 'E010' }
    ];
    assert.equal(isProcessCoordinator(raymanEmp, users as any), false);
    assert.equal(isProcessCoordinator({ id: 'E010', name: 'Raymanpreet Kaur', designation: 'PC' } as any, users as any), false);
  });
});

