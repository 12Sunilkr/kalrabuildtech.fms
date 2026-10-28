// Helper utilities for Checklist Holiday & Sunday frequency logic on server

export function parseLocalDate(dateStr) {
  const parts = String(dateStr).split('T')[0].split('-').map(Number);
  const year = parts[0] || 2026;
  const month = (parts[1] || 1) - 1;
  const day = parts[2] || 1;
  return new Date(year, month, day);
}

export function formatLocalDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function isSundayDate(date) {
  const d = typeof date === 'string' ? parseLocalDate(date) : date;
  return d.getDay() === 0;
}

export function isHolidayOrSundayDate(date, holidayDates = []) {
  const d = typeof date === 'string' ? parseLocalDate(date) : date;
  const dateKey = typeof date === 'string' ? date.split('T')[0] : formatLocalDate(d);
  const hDates = (holidayDates || []).map(h => typeof h === 'string' ? h : h?.date).filter(Boolean);
  return d.getDay() === 0 || hDates.includes(dateKey);
}

export function getNextWorkingDayServer(startDate, holidayDates = []) {
  let check = typeof startDate === 'string' ? parseLocalDate(startDate) : new Date(startDate);
  const initialKey = formatLocalDate(check);
  const hDates = (holidayDates || []).map(h => typeof h === 'string' ? h : h?.date).filter(Boolean);
  let shifted = false;
  let limit = 0;
  while ((check.getDay() === 0 || hDates.includes(formatLocalDate(check))) && limit < 365) {
    check.setDate(check.getDate() + 1);
    shifted = true;
    limit++;
  }
  const finalKey = formatLocalDate(check);
  return { date: finalKey, shifted: shifted || initialKey !== finalKey };
}

/**
 * Aligns checklist items in the database when a holiday is added or updated.
 * - Daily tasks on that holiday date: deleted/removed (just like Sunday)
 * - Non-daily tasks on that holiday date: shifted forward to the next business day (just like Sunday)
 */
export function alignChecklistsOnHolidayAdded(db, holidayDate) {
  if (!db || !holidayDate) return { dailyRemoved: 0, nonDailyShifted: 0 };

  try {
    // 1. Get all holiday dates
    const holStmt = db.prepare('SELECT date FROM holidays');
    const holidayDates = [];
    while (holStmt.step()) {
      const r = holStmt.getAsObject();
      if (r.date) holidayDates.push(r.date);
    }
    holStmt.free();
    if (!holidayDates.includes(holidayDate)) {
      holidayDates.push(holidayDate);
    }

    // 2. Load all checklist templates to know frequencies
    const tplStmt = db.prepare('SELECT id, data FROM checklist_templates');
    const tplMap = new Map();
    while (tplStmt.step()) {
      const row = tplStmt.getAsObject();
      try {
        tplMap.set(String(row.id), JSON.parse(row.data));
      } catch (e) {}
    }
    tplStmt.free();

    // 3. Find uncompleted checklist items
    const chkStmt = db.prepare("SELECT id, refId, refType, item, done FROM checklists WHERE done = 0");
    const toDelete = [];
    const toUpdate = [];

    while (chkStmt.step()) {
      const row = chkStmt.getAsObject();
      try {
        const item = JSON.parse(row.item);
        if (item.status === 'COMPLETED' || item.status === 'STOPPED') continue;

        const tpl = tplMap.get(String(row.refId || item.templateId));
        const freq = tpl?.config?.frequency || 'DAILY';
        const itemDate = item.date;

        if (freq === 'DAILY') {
          if (itemDate === holidayDate || isHolidayOrSundayDate(itemDate, holidayDates)) {
            toDelete.push(row.id);
          }
        } else if (freq === 'ALTERNATE') {
          // Alternate occurs without skipping holidays or Sundays
          continue;
        } else {
          // Non-daily frequency: shifts forward like Sunday
          if (itemDate === holidayDate || isHolidayOrSundayDate(itemDate, holidayDates)) {
            const baseDate = item.originalDate || itemDate;
            const { date: nextDate } = getNextWorkingDayServer(baseDate, holidayDates);
            item.originalDate = baseDate;
            item.date = nextDate;
            item.shiftedDueToHoliday = true;
            toUpdate.push({ id: row.id, item: JSON.stringify(item) });
          }
        }
      } catch (e) {}
    }
    chkStmt.free();

    // Execute deletes
    if (toDelete.length > 0) {
      const delStmt = db.prepare('DELETE FROM checklists WHERE id = ?');
      for (const id of toDelete) {
        delStmt.run([id]);
      }
      delStmt.free();
    }

    // Execute updates
    if (toUpdate.length > 0) {
      const updStmt = db.prepare('UPDATE checklists SET item = ? WHERE id = ?');
      for (const u of toUpdate) {
        updStmt.run([u.item, u.id]);
      }
      updStmt.free();
    }

    return { dailyRemoved: toDelete.length, nonDailyShifted: toUpdate.length };
  } catch (err) {
    console.warn('alignChecklistsOnHolidayAdded error:', err && (err.message || err));
    return { dailyRemoved: 0, nonDailyShifted: 0 };
  }
}

/**
 * Reverts shifted non-daily checklist items when a holiday is removed.
 */
export function alignChecklistsOnHolidayRemoved(db, removedHolidayDate) {
  if (!db || !removedHolidayDate) return { nonDailyRestored: 0 };

  try {
    // 1. Get remaining holiday dates
    const holStmt = db.prepare('SELECT date FROM holidays WHERE date != ?');
    holStmt.bind([removedHolidayDate]);
    const holidayDates = [];
    while (holStmt.step()) {
      const r = holStmt.getAsObject();
      if (r.date) holidayDates.push(r.date);
    }
    holStmt.free();

    // 2. Find uncompleted shifted checklist items
    const chkStmt = db.prepare("SELECT id, item FROM checklists WHERE done = 0");
    const toUpdate = [];

    while (chkStmt.step()) {
      const row = chkStmt.getAsObject();
      try {
        const item = JSON.parse(row.item);
        if (item.shiftedDueToHoliday && item.originalDate) {
          // Check if originalDate is now a working day (not Sunday and not in remaining holidays)
          if (!isHolidayOrSundayDate(item.originalDate, holidayDates)) {
            item.date = item.originalDate;
            item.shiftedDueToHoliday = false;
            delete item.originalDate;
            toUpdate.push({ id: row.id, item: JSON.stringify(item) });
          } else {
            // If originalDate is still off (e.g. Sunday or another holiday), re-evaluate next working day
            const { date: nextDate } = getNextWorkingDayServer(item.originalDate, holidayDates);
            if (nextDate !== item.date) {
              item.date = nextDate;
              toUpdate.push({ id: row.id, item: JSON.stringify(item) });
            }
          }
        }
      } catch (e) {}
    }
    chkStmt.free();

    if (toUpdate.length > 0) {
      const updStmt = db.prepare('UPDATE checklists SET item = ? WHERE id = ?');
      for (const u of toUpdate) {
        updStmt.run([u.item, u.id]);
      }
      updStmt.free();
    }

    return { nonDailyRestored: toUpdate.length };
  } catch (err) {
    console.warn('alignChecklistsOnHolidayRemoved error:', err && (err.message || err));
    return { nonDailyRestored: 0 };
  }
}
