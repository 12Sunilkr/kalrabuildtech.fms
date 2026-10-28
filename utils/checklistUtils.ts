export interface TransferOptions {
  instances: any[];
  templateId: string;
  oldDoerId?: string;
  newDoerId: string;
  newDepartment?: string;
  transferEffectiveDate: string;
  reactivate?: boolean;
}

/**
 * Applies a routine transfer / reactivation to a list of checklist instances.
 * - Tasks BEFORE transferEffectiveDate (< transferEffectiveDate):
 *   Retain their original state. Past stopped tasks remain STOPPED with the old assignee,
 *   preserving the history without penalizing the new assignee.
 * - Tasks ON OR AFTER transferEffectiveDate (>= transferEffectiveDate):
 *   Transferred to the new assignee (newDoerId and newDepartment).
 *   If reactivate is true, any STOPPED task is un-stopped to PENDING and stoppedReason is cleared.
 */
export function applyTransferToInstances(options: TransferOptions): any[] {
  const {
    instances,
    templateId,
    oldDoerId,
    newDoerId,
    newDepartment,
    transferEffectiveDate,
    reactivate = true,
  } = options;

  if (!Array.isArray(instances)) return [];

  return instances.map(inst => {
    // Only modify instances belonging to this template
    if (String(inst.templateId) !== String(templateId)) {
      return inst;
    }

    const itemDate = String(inst.date || '').trim();

    // Past / In-between tasks prior to transferEffectiveDate:
    if (itemDate < transferEffectiveDate) {
      // Must remain locked with the old assignee and stopped status
      // In-between uncompleted tasks during hiatus must be marked STOPPED (dead)
      const isCompleted = Boolean(inst.done || inst.status === 'COMPLETED');
      return {
        ...inst,
        doerId: inst.doerId || oldDoerId,
        status: isCompleted ? inst.status : 'STOPPED',
        stoppedReason: isCompleted ? inst.stoppedReason : (inst.stoppedReason || 'Routine stopped/hiatus before resumption'),
      };
    }

    // Tasks from transferEffectiveDate onwards:
    // If already completed, keep completed
    if (inst.done || inst.status === 'COMPLETED') {
      return {
        ...inst,
        doerId: inst.doerId || oldDoerId,
      };
    }

    const updated = {
      ...inst,
      doerId: newDoerId,
      department: newDepartment || inst.department,
    };

    if (reactivate) {
      updated.status = 'PENDING';
      delete updated.stoppedReason;
      delete updated.stoppedAt;
    }

    return updated;
  });
}

/**
 * Sanitizes template data when reactivating and transferring a routine.
 * Cleans up all archive-related stopping metadata.
 */
export function sanitizeTemplateOnReactivate(
  templateData: any,
  updates?: {
    newDoerId?: string;
    newDepartment?: string;
    newStartDate?: string;
  }
): any {
  const sanitized = {
    ...templateData,
    active: true,
  };

  if (updates?.newDoerId !== undefined) {
    sanitized.doerId = updates.newDoerId;
  }
  if (updates?.newDepartment !== undefined) {
    sanitized.department = updates.newDepartment;
  }
  if (updates?.newStartDate !== undefined) {
    sanitized.startDate = updates.newStartDate;
  }

  delete sanitized.stoppedDueToArchive;
  delete sanitized.archivedAt;
  delete sanitized.archivedMemberName;

  return sanitized;
}

import { format, addDays, isSunday } from 'date-fns';

/**
 * Parses a YYYY-MM-DD string into a local Date instance avoiding timezone offsets.
 */
export function parseLocalDate(dateStr: string): Date {
  const parts = String(dateStr).split('T')[0].split('-').map(Number);
  const year = parts[0] || 2026;
  const month = (parts[1] || 1) - 1;
  const day = parts[2] || 1;
  return new Date(year, month, day);
}

/**
 * Checks whether a given Date or YYYY-MM-DD string is a Sunday or in the holiday list.
 */
export function isHolidayOrSunday(
  date: Date | string,
  holidayList: (string | { date: string })[] = []
): boolean {
  const d = typeof date === 'string' ? parseLocalDate(date) : date;
  const dateKey = typeof date === 'string' ? date.split('T')[0] : format(date, 'yyyy-MM-dd');
  const hDates = (holidayList || []).map(h => typeof h === 'string' ? h : h?.date).filter(Boolean);
  return isSunday(d) || hDates.includes(dateKey);
}

/**
 * Calculates the next working business day for a date, shifting forward past Sundays and holidays.
 */
export function getNextWorkingDay(
  startDate: Date | string,
  holidayList: (string | { date: string })[] = []
): { date: string; shifted: boolean } {
  let check = typeof startDate === 'string' ? parseLocalDate(startDate) : new Date(startDate);
  const initialKey = format(check, 'yyyy-MM-dd');
  const hDates = (holidayList || []).map(h => typeof h === 'string' ? h : h?.date).filter(Boolean);
  let shifted = false;
  let limit = 0;

  while ((isSunday(check) || hDates.includes(format(check, 'yyyy-MM-dd'))) && limit < 365) {
    check = addDays(check, 1);
    shifted = true;
    limit++;
  }

  const finalKey = format(check, 'yyyy-MM-dd');
  return { date: finalKey, shifted: shifted || initialKey !== finalKey };
}

export interface ReconcileHolidaysOptions {
  instances: any[];
  templates: any[];
  holidayDates: (string | { date: string })[];
}

/**
 * Reconciles checklist instances against the active holiday list:
 * - On any holiday added to the holiday list, checklist frequency operates like Sunday:
 *   1. 'DAILY' frequency: skips holidays entirely (just like Sunday).
 *   2. 'ALTERNATE' frequency: occurs every alternate day without skipping holidays (just like Sunday).
 *   3. All other frequencies (WEEKLY, MONTHLY, etc.): automatically shift forward to the next business day (just like Sunday).
 * - When a holiday is removed, shifted non-daily tasks revert back to their original scheduled date.
 * - Completed tasks are strictly preserved and never shifted or removed.
 */
export function reconcileInstancesForHolidays(options: ReconcileHolidaysOptions): any[] {
  const { instances, templates, holidayDates } = options;
  if (!Array.isArray(instances)) return [];

  const tplMap = new Map<string, any>();
  if (Array.isArray(templates)) {
    templates.forEach(t => {
      if (t && t.id) tplMap.set(String(t.id), t);
    });
  }

  const hDates = (holidayDates || [])
    .map(h => typeof h === 'string' ? h : h?.date)
    .filter(Boolean) as string[];

  const results: any[] = [];

  for (const inst of instances) {
    if (!inst) continue;

    // Completed tasks must never be modified or removed
    if (inst.done || inst.status === 'COMPLETED') {
      results.push(inst);
      continue;
    }

    // Stopped tasks remain preserved
    if (inst.status === 'STOPPED') {
      results.push(inst);
      continue;
    }

    const tpl = tplMap.get(String(inst.templateId));
    const frequency = tpl?.config?.frequency || 'DAILY';

    // 1. DAILY Frequency: skips holidays and Sundays entirely
    if (frequency === 'DAILY') {
      if (isHolidayOrSunday(inst.date, hDates)) {
        // Excluded just like Sunday
        continue;
      }
      results.push(inst);
      continue;
    }

    // 2. ALTERNATE Frequency: occurs every alternate day without skipping holidays or Sundays
    if (frequency === 'ALTERNATE') {
      results.push(inst);
      continue;
    }

    // 3. Other Frequencies (WEEKLY, MONTHLY, QUARTERLY, etc.): shift forward like Sunday
    const baseDate = inst.originalDate || inst.date;
    const isBaseOff = isHolidayOrSunday(baseDate, hDates);

    if (isBaseOff) {
      // Must shift forward to the next open working business day
      const nextWd = getNextWorkingDay(baseDate, hDates);
      results.push({
        ...inst,
        date: nextWd.date,
        originalDate: baseDate,
        shiftedDueToHoliday: true,
      });
    } else {
      // Base date is not off (e.g., holiday was removed, or date is normal working day)
      if (inst.shiftedDueToHoliday && inst.originalDate) {
        // Restore to original date
        const restored = { ...inst, date: inst.originalDate, shiftedDueToHoliday: false };
        delete restored.originalDate;
        results.push(restored);
      } else if (isHolidayOrSunday(inst.date, hDates)) {
        // Current date is off, shift forward
        const nextWd = getNextWorkingDay(inst.date, hDates);
        results.push({
          ...inst,
          date: nextWd.date,
          originalDate: inst.date,
          shiftedDueToHoliday: true,
        });
      } else {
        results.push(inst);
      }
    }
  }

  return results;
}

