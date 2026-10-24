import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isAdminOrPc } from '../../utils/roleUtils.ts';

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

  test('isAdminOrPc detects admin / PC designation on employee object', () => {
    assert.equal(isAdminOrPc({ designation: 'Process Coordinator' } as any), true);
    assert.equal(isAdminOrPc({ designation: 'Admin' } as any), true);
    assert.equal(isAdminOrPc({ designation: 'pc' } as any), true);
    assert.equal(isAdminOrPc({ designation: 'Software Engineer' } as any), false);
  });
});
