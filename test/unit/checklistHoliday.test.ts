import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  isHolidayOrSunday,
  getNextWorkingDay,
  reconcileInstancesForHolidays,
} from '../../utils/checklistUtils.ts';

describe('Checklist Holiday & Sunday Frequency Logic (Unit Tests)', () => {
  describe('isHolidayOrSunday', () => {
    test('identifies Sundays correctly as off-days', () => {
      // 2026-11-01 was a Sunday
      assert.equal(isHolidayOrSunday('2026-11-01', []), true);
      // 2026-11-02 was a Monday
      assert.equal(isHolidayOrSunday('2026-11-02', []), false);
    });

    test('identifies dates in holiday list as off-days (working like Sunday)', () => {
      // 2026-11-04 is a Wednesday
      assert.equal(isHolidayOrSunday('2026-11-04', []), false);
      // When added to holiday list:
      assert.equal(isHolidayOrSunday('2026-11-04', ['2026-11-04']), true);
      assert.equal(isHolidayOrSunday('2026-11-04', [{ date: '2026-11-04' }] as any), true);
    });
  });

  describe('getNextWorkingDay', () => {
    test('shifts Sunday to Monday when Monday is working', () => {
      // 2026-11-01 is Sunday -> shifts to Monday 2026-11-02
      const result = getNextWorkingDay('2026-11-01', []);
      assert.equal(result.date, '2026-11-02');
      assert.equal(result.shifted, true);
    });

    test('shifts Holiday to next working day just like Sunday', () => {
      // 2026-11-04 is Wednesday, but on holiday list -> shifts to Thursday 2026-11-05
      const result = getNextWorkingDay('2026-11-04', ['2026-11-04']);
      assert.equal(result.date, '2026-11-05');
      assert.equal(result.shifted, true);
    });

    test('shifts through consecutive holidays and Sundays until next open working day', () => {
      // Suppose Friday 2026-10-30 is a holiday, Sat is holiday/off, Sunday 2026-11-01 is Sunday, Mon 2026-11-02 is a holiday
      const holidays = ['2026-10-30', '2026-10-31', '2026-11-02'];
      // Starting on Friday 2026-10-30:
      // Friday (Hol) -> Sat (Hol) -> Sun (Sunday) -> Mon (Hol) -> Tuesday 2026-11-03
      const result = getNextWorkingDay('2026-10-30', holidays);
      assert.equal(result.date, '2026-11-03');
      assert.equal(result.shifted, true);
    });

    test('leaves regular working day unshifted', () => {
      // 2026-11-03 is Tuesday and not a holiday
      const result = getNextWorkingDay('2026-11-03', ['2026-11-04']);
      assert.equal(result.date, '2026-11-03');
      assert.equal(result.shifted, false);
    });
  });

  describe('reconcileInstancesForHolidays', () => {
    const templates = [
      { id: 'T-DAILY', config: { frequency: 'DAILY' }, active: true },
      { id: 'T-ALTERNATE', config: { frequency: 'ALTERNATE' }, active: true },
      { id: 'T-WEEKLY', config: { frequency: 'WEEKLY' }, active: true },
      { id: 'T-MONTHLY', config: { frequency: 'MONTHLY' }, active: true },
    ];

    test('DAILY checklist frequency: skips holiday dates entirely just like Sunday', () => {
      const instances = [
        // Daily on Monday (working day)
        { id: 'D-1', templateId: 'T-DAILY', date: '2026-11-02', status: 'PENDING' },
        // Daily on Tuesday (working day)
        { id: 'D-2', templateId: 'T-DAILY', date: '2026-11-03', status: 'PENDING' },
        // Daily on Wednesday (added to holiday list)
        { id: 'D-3', templateId: 'T-DAILY', date: '2026-11-04', status: 'PENDING' },
        // Daily on Sunday
        { id: 'D-SUN', templateId: 'T-DAILY', date: '2026-11-01', status: 'PENDING' },
      ];

      const holidays = ['2026-11-04'];
      const result = reconcileInstancesForHolidays({ instances, templates, holidayDates: holidays });

      // Only Monday and Tuesday should remain; Wednesday (holiday) and Sunday must be excluded!
      const remainingIds = result.map(i => i.id);
      assert.deepEqual(remainingIds, ['D-1', 'D-2']);
    });

    test('ALTERNATE checklist frequency: occurs on holidays without skipping, just like Sunday', () => {
      const instances = [
        // Alternate on Wednesday (holiday)
        { id: 'ALT-1', templateId: 'T-ALTERNATE', date: '2026-11-04', status: 'PENDING' },
        // Alternate on Sunday
        { id: 'ALT-2', templateId: 'T-ALTERNATE', date: '2026-11-01', status: 'PENDING' },
      ];

      const holidays = ['2026-11-04'];
      const result = reconcileInstancesForHolidays({ instances, templates, holidayDates: holidays });

      // Alternate tasks are kept on their dates without skipping or shifting
      assert.equal(result.length, 2);
      assert.equal(result[0].date, '2026-11-04');
      assert.equal(result[1].date, '2026-11-01');
    });

    test('WEEKLY / MONTHLY checklist frequencies: shift to next working day on holidays, just like Sunday', () => {
      const instances = [
        // Weekly on Wednesday 2026-11-04 (which is added to holiday list)
        { id: 'W-1', templateId: 'T-WEEKLY', date: '2026-11-04', status: 'PENDING' },
        // Monthly on Sunday 2026-11-01
        { id: 'M-1', templateId: 'T-MONTHLY', date: '2026-11-01', status: 'PENDING' },
      ];

      const holidays = ['2026-11-04'];
      const result = reconcileInstancesForHolidays({ instances, templates, holidayDates: holidays });

      assert.equal(result.length, 2);

      // W-1 shifts to Thursday 2026-11-05
      const w1 = result.find(i => i.id === 'W-1');
      assert.equal(w1.date, '2026-11-05');
      assert.equal(w1.shiftedDueToHoliday, true);
      assert.equal(w1.originalDate, '2026-11-04');

      // M-1 shifts to Monday 2026-11-02
      const m1 = result.find(i => i.id === 'M-1');
      assert.equal(m1.date, '2026-11-02');
      assert.equal(m1.shiftedDueToHoliday, true);
      assert.equal(m1.originalDate, '2026-11-01');
    });

    test('WEEKLY / MONTHLY shift cascades if next day is also a holiday or Sunday', () => {
      // Wednesday 2026-11-04 is Holiday, Thursday 2026-11-05 is also Holiday
      const instances = [
        { id: 'W-1', templateId: 'T-WEEKLY', date: '2026-11-04', status: 'PENDING' },
      ];

      const holidays = ['2026-11-04', '2026-11-05'];
      const result = reconcileInstancesForHolidays({ instances, templates, holidayDates: holidays });

      const w1 = result.find(i => i.id === 'W-1');
      // Must shift past both holidays to Friday 2026-11-06
      assert.equal(w1.date, '2026-11-06');
      assert.equal(w1.shiftedDueToHoliday, true);
      assert.equal(w1.originalDate, '2026-11-04');
    });

    test('reverts shifted non-daily tasks back to original date when holiday is removed', () => {
      // Instance was previously shifted from 2026-11-04 to 2026-11-05
      const instances = [
        {
          id: 'W-1',
          templateId: 'T-WEEKLY',
          date: '2026-11-05',
          originalDate: '2026-11-04',
          shiftedDueToHoliday: true,
          status: 'PENDING',
        },
      ];

      // Holiday list is now empty (holiday removed)
      const holidays: string[] = [];
      const result = reconcileInstancesForHolidays({ instances, templates, holidayDates: holidays });

      const w1 = result.find(i => i.id === 'W-1');
      // Since 2026-11-04 is no longer a holiday or Sunday, it should restore to original date
      assert.equal(w1.date, '2026-11-04');
      assert.equal(w1.shiftedDueToHoliday, false);
    });

    test('never modifies or removes already COMPLETED tasks', () => {
      const instances = [
        // Daily completed on a holiday date
        { id: 'D-DONE', templateId: 'T-DAILY', date: '2026-11-04', status: 'COMPLETED', done: 1 },
        // Weekly completed on a holiday date
        { id: 'W-DONE', templateId: 'T-WEEKLY', date: '2026-11-04', status: 'COMPLETED', done: 1 },
      ];

      const holidays = ['2026-11-04'];
      const result = reconcileInstancesForHolidays({ instances, templates, holidayDates: holidays });

      assert.equal(result.length, 2);
      assert.equal(result[0].date, '2026-11-04');
      assert.equal(result[0].status, 'COMPLETED');
      assert.equal(result[1].date, '2026-11-04');
      assert.equal(result[1].status, 'COMPLETED');
    });

    test('gracefully handles empty inputs and missing templates', () => {
      assert.deepEqual(reconcileInstancesForHolidays({ instances: [], templates: [], holidayDates: [] }), []);
      // If template is unknown, default to DAILY behavior (skips holiday)
      const orphan = [{ id: 'ORPHAN', templateId: 'UNKNOWN', date: '2026-11-04', status: 'PENDING' }];
      const res = reconcileInstancesForHolidays({ instances: orphan, templates: [], holidayDates: ['2026-11-04'] });
      assert.equal(res.length, 0);
    });
  });
});
