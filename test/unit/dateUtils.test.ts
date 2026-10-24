import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { formatDateKey, isDateSunday, startOfDay, formatDecimalHours } from '../../utils/dateUtils.ts';

describe('dateUtils Unit Tests', () => {
  test('formatDateKey formats date to yyyy-MM-dd correctly', () => {
    const d = new Date(2026, 0, 15);
    const result = formatDateKey(d);
    assert.equal(result, '2026-01-15');
  });

  test('isDateSunday correctly identifies Sundays', () => {
    // 2026-01-04 was a Sunday
    const sunday = new Date(2026, 0, 4);
    assert.equal(isDateSunday(sunday), true);

    // 2026-01-05 was a Monday
    const monday = new Date(2026, 0, 5);
    assert.equal(isDateSunday(monday), false);
  });

  test('startOfDay sets hours, minutes, seconds and ms to zero', () => {
    const d = new Date('2026-05-10T14:35:22.500Z');
    const sod = startOfDay(d);
    assert.equal(sod.getHours(), 0);
    assert.equal(sod.getMinutes(), 0);
    assert.equal(sod.getSeconds(), 0);
    assert.equal(sod.getMilliseconds(), 0);
  });

  test('formatDecimalHours formats hours and minutes properly', () => {
    assert.equal(formatDecimalHours(undefined), '-');
    assert.equal(formatDecimalHours(0), '0m');
    assert.equal(formatDecimalHours(2.5), '2h 30m');
    assert.equal(formatDecimalHours(3), '3h');
    assert.equal(formatDecimalHours(0.75), '45m');
  });
});
