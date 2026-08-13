import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Employee, AttendanceRecord, AttendanceValue, SundayRequest, Holiday, User } from '../types';
import { getDaysInMonthArray, formatDateKey, isDateSunday, startOfDay } from '../utils/dateUtils';
import { STATUS_COLORS } from '../constants';
import { ChevronLeft, ChevronRight, Calendar, CheckCircle2, XCircle, X, Eye, EyeOff, Search, Copy, Clipboard, Check, MousePointer, Trash2 } from 'lucide-react';
import api from '../src/utils/api';
import { extractPayload, ensureArray } from '../src/utils/api';
import { format, isBefore } from 'date-fns';

interface AttendanceSheetProps {
  employees: Employee[];
  setEmployees: React.Dispatch<React.SetStateAction<Employee[]>>;
  attendanceData: Record<string, AttendanceRecord>;
  setAttendanceData: React.Dispatch<React.SetStateAction<Record<string, AttendanceRecord>>>;
  holidays: Holiday[];
  sundayRequests: SundayRequest[];
  setSundayRequests: React.Dispatch<React.SetStateAction<SundayRequest[]>>;
  currentUser: User;
  archivedEmployees?: Employee[];
}

interface CellCoord {
  empId: string;
  date: Date;
  dateKey: string;
  empIndex: number;
  dayIndex: number;
}

const SEQUENCE: AttendanceValue[] = [1, 0, 0.5, 0.25, 0.75, 'LEAVE', 'CS', 'CO', 'OFF', 'HOLIDAY'];

export const AttendanceSheetComponent: React.FC<AttendanceSheetProps> = ({
  employees,
  setEmployees,
  attendanceData,
  setAttendanceData,
  holidays,
  sundayRequests,
  setSundayRequests,
  currentUser,
  archivedEmployees = []
}) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [, startCalTransition] = React.useTransition();
  const [showRequestsModal, setShowRequestsModal] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; empId: string; date: Date; dateKey: string } | null>(null);

  // Selection States
  const [focusedCell, setFocusedCell] = useState<CellCoord | null>(null);
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [selectionAnchor, setSelectionAnchor] = useState<{ empIndex: number; dayIndex: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Clipboard State
  const [copiedValue, setCopiedValue] = useState<AttendanceValue | null>(null);
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'info' } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const days = useMemo(() => getDaysInMonthArray(year, month), [year, month]);
  const todayStart = useMemo(() => startOfDay(new Date()), []);

  // Filter and sort display employees
  const displayEmployees = useMemo(() => {
    const active = employees || [];
    const archived = archivedEmployees || [];

    const filteredArchived = archived.filter(emp => {
      if (!emp.archived_at) return false;
      const archiveDate = new Date(emp.archived_at);
      const archiveYear = archiveDate.getFullYear();
      const archiveMonth = archiveDate.getMonth();
      return year < archiveYear || (year === archiveYear && month <= archiveMonth);
    });

    const combined = [...active, ...filteredArchived].sort((a, b) => a.id.localeCompare(b.id));

    return combined.filter(emp => {
      // 1. Hide attendance filter for non-admin or hidden employees
      if (!showHidden && emp.hideAttendance && !(currentUser && currentUser.role === 'ADMIN' && currentUser.employeeId === emp.id)) {
        return false;
      }
      // 2. Joining date filter
      const trackDate = emp.joiningDate ? startOfDay(new Date(emp.joiningDate)) : (emp.createdAt ? startOfDay(new Date(emp.createdAt)) : new Date(0));
      const joinYear = trackDate.getFullYear();
      const joinMonth = trackDate.getMonth();
      if (year < joinYear || (year === joinYear && month < joinMonth)) {
        return false;
      }
      // 3. Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = emp.name ? emp.name.toLowerCase().includes(q) : false;
        const matchId = emp.id ? emp.id.toLowerCase().includes(q) : false;
        return matchName || matchId;
      }
      return true;
    });
  }, [employees, archivedEmployees, year, month, showHidden, currentUser, searchQuery]);

  const pendingRequests = useMemo(() => sundayRequests.filter(r => r.status === 'PENDING'), [sundayRequests]);

  // Toast notification helper
  const showToast = useCallback((text: string, type: 'success' | 'info' = 'success') => {
    setToast({ text, type });
    setTimeout(() => {
      setToast(prev => (prev?.text === text ? null : prev));
    }, 2500);
  }, []);

  // Reset selections on month change
  const handleMonthChange = (delta: number) => {
    startCalTransition(() => {
      setCurrentDate(new Date(year, month + delta, 1));
      setSelectedCells(new Set());
      setFocusedCell(null);
      setSelectionAnchor(null);
    });
  };

  // Fast Batch Optimistic Attendance Update
  const updateAttendanceBatch = useCallback(async (targets: Array<{ empId: string; date: Date; newVal: AttendanceValue }>) => {
    if (targets.length === 0) return;

    // 1. Instant local update
    setAttendanceData(prev => {
      const next = { ...prev };
      targets.forEach(({ empId, date, newVal }) => {
        const dateKey = formatDateKey(date);
        if (!next[empId]) next[empId] = {};
        next[empId] = { ...next[empId], [dateKey]: newVal };
      });
      return next;
    });

    // 2. Parallel background API calls
    const promises = targets.map(async ({ empId, date, newVal }) => {
      const dateKey = formatDateKey(date);
      const aId = `A-${empId}-${dateKey}`;
      try {
        await api.put(`/attendance/${encodeURIComponent(aId)}`, {
          id: aId,
          userId: empId,
          date: dateKey,
          value: newVal
        }, { withCredentials: true });
      } catch (err) {
        console.warn(`Failed background attendance update for ${empId} on ${dateKey}`, err);
      }
    });

    await Promise.allSettled(promises);
  }, [setAttendanceData]);

  // Fast Batch Attendance Clearing / Deleting (makes cell empty)
  const clearAttendanceBatch = useCallback(async (targets: Array<{ empId: string; date: Date }>) => {
    if (targets.length === 0) return;

    // 1. Instant local update: remove dateKey from attendanceData
    setAttendanceData(prev => {
      const next = { ...prev };
      targets.forEach(({ empId, date }) => {
        const dateKey = formatDateKey(date);
        if (next[empId]) {
          const empRec = { ...next[empId] };
          delete empRec[dateKey];
          next[empId] = empRec;
        }
      });
      return next;
    });

    // 2. Parallel background API calls (deletes record from server DB)
    const promises = targets.map(async ({ empId, date }) => {
      const dateKey = formatDateKey(date);
      const aId = `A-${empId}-${dateKey}`;
      try {
        await api.delete(`/attendance/${encodeURIComponent(aId)}`, { withCredentials: true });
      } catch (err) {
        console.warn(`Failed background attendance delete for ${empId} on ${dateKey}`, err);
      }
    });

    await Promise.allSettled(promises);
  }, [setAttendanceData]);

  // Helper for single cell update
  const updateAttendance = useCallback((empId: string, date: Date, newVal: AttendanceValue) => {
    updateAttendanceBatch([{ empId, date, newVal }]);
  }, [updateAttendanceBatch]);

  // Helper: get the Sunday dateKey for the week containing a given date
  const getSundayOfWeek = useCallback((d: Date): string => {
    const day = d.getDay(); // 0=Sun
    const diff = d.getDate() - day; // go back to Sunday
    const sun = new Date(d.getFullYear(), d.getMonth(), diff);
    return formatDateKey(sun);
  }, []);

  // Helper: did this employee work on Sunday of the week containing `d`?
  const workedSundayOfWeek = useCallback((empId: string, d: Date): boolean => {
    const sundayKey = getSundayOfWeek(d);
    const record = attendanceData[empId] || {};
    const sunVal = record[sundayKey];
    return typeof sunVal === 'number' && sunVal > 0;
  }, [attendanceData, getSundayOfWeek]);

  // Resolve actual effective cell value for display & copy logic
  const resolveCellValue = useCallback((emp: Employee, d: Date): AttendanceValue | null => {
    const currentDay = startOfDay(d);
    const dateKey = formatDateKey(d);
    const trackingStartDate = emp.joiningDate
      ? startOfDay(new Date(emp.joiningDate))
      : (emp.createdAt ? startOfDay(new Date(emp.createdAt)) : new Date(0));
    const archiveDate = emp.archived_at ? startOfDay(new Date(emp.archived_at)) : null;
    const isArchivedDay = archiveDate && !isBefore(currentDay, archiveDate);
    const isBeforeTracking = isBefore(currentDay, trackingStartDate);

    if (isArchivedDay || isBeforeTracking) return null;

    const record = attendanceData[emp.id]?.[dateKey];
    if (record !== undefined) return record;

    const isSun = isDateSunday(d);
    const holiday = holidays.find(h => h.date === dateKey);

    if (isSun) return 'OFF';
    if (holiday) return 'HOLIDAY';

    if (isBefore(currentDay, todayStart)) {
      if (workedSundayOfWeek(emp.id, d)) return 'OFF';
      return 0;
    }

    return null;
  }, [attendanceData, holidays, todayStart, workedSundayOfWeek]);

  // Parse clipboard text string to AttendanceValue
  const parseClipboardText = (text: string): AttendanceValue => {
    const trimmed = text.trim().toUpperCase();
    if (trimmed === '1' || trimmed === 'P' || trimmed === 'PRESENT') return 1;
    if (trimmed === '0' || trimmed === 'A' || trimmed === 'ABSENT') return 0;
    if (trimmed === '0.5' || trimmed === 'HALF' || trimmed === 'HALF DAY') return 0.5;
    if (trimmed === '0.25' || trimmed === 'QUARTER') return 0.25;
    if (trimmed === '0.75' || trimmed === 'SHORT' || trimmed === 'SHORT LEAVE') return 0.75;
    if (trimmed === 'L' || trimmed === 'LEAVE') return 'LEAVE';
    if (trimmed === 'CS' || trimmed === 'COMPENSATE') return 'CS';
    if (trimmed === 'CO' || trimmed === 'C' || trimmed === 'COMP OFF') return 'CO';
    if (trimmed === 'OFF' || trimmed === '—' || trimmed === '-') return 'OFF';
    if (trimmed === 'HOLIDAY' || trimmed === 'H') return 'HOLIDAY';

    const num = parseFloat(trimmed);
    if (!isNaN(num)) {
      if (num === 1) return 1;
      if (num === 0) return 0;
      if (num === 0.5) return 0.5;
      if (num === 0.25) return 0.25;
      if (num === 0.75) return 0.75;
    }

    return 1;
  };

  // Execute copy of selected cell(s)
  const handleCopy = useCallback(async () => {
    if (!focusedCell && selectedCells.size === 0) return;

    let targetEmpId = focusedCell?.empId;
    let targetDate = focusedCell?.date;

    if (!targetEmpId || !targetDate) {
      const firstKey = Array.from(selectedCells)[0];
      if (firstKey) {
        const [empId, dateKey] = firstKey.split('|');
        const d = days.find(day => formatDateKey(day) === dateKey);
        if (d) {
          targetEmpId = empId;
          targetDate = d;
        }
      }
    }

    if (!targetEmpId || !targetDate) return;

    const emp = displayEmployees.find(e => e.id === targetEmpId);
    if (!emp) return;

    const resolved = resolveCellValue(emp, targetDate);
    const valToCopy = resolved !== null ? resolved : 1;

    setCopiedValue(valToCopy);

    try {
      await navigator.clipboard.writeText(String(valToCopy));
    } catch (err) {
      // System clipboard fallback
    }

    const label = valToCopy === 1 ? 'Present (1)' : (valToCopy === 0 ? 'Absent (0)' : String(valToCopy));
    showToast(`Copied status: ${label}`, 'info');
  }, [focusedCell, selectedCells, displayEmployees, days, resolveCellValue, showToast]);

  // Execute paste to selected cell(s)
  const handlePaste = useCallback(async () => {
    let valueToPaste: AttendanceValue | null = copiedValue;

    try {
      const clipText = await navigator.clipboard.readText();
      if (clipText && clipText.trim()) {
        valueToPaste = parseClipboardText(clipText);
      }
    } catch (err) {
      // System clipboard fallback
    }

    if (valueToPaste === null) {
      showToast('Nothing to paste. Copy a status first.', 'info');
      return;
    }

    const targets: Array<{ empId: string; date: Date; newVal: AttendanceValue }> = [];

    if (selectedCells.size > 0) {
      selectedCells.forEach(cellKey => {
        const [empId, dateKey] = cellKey.split('|');
        const emp = displayEmployees.find(e => e.id === empId);
        const d = days.find(day => formatDateKey(day) === dateKey);

        if (emp && d) {
          const currentDay = startOfDay(d);
          const trackingStartDate = emp.joiningDate
            ? startOfDay(new Date(emp.joiningDate))
            : (emp.createdAt ? startOfDay(new Date(emp.createdAt)) : new Date(0));
          const archiveDate = emp.archived_at ? startOfDay(new Date(emp.archived_at)) : null;
          const isArchivedDay = archiveDate && !isBefore(currentDay, archiveDate);
          const isBeforeTracking = isBefore(currentDay, trackingStartDate);

          if (!isArchivedDay && !isBeforeTracking) {
            targets.push({ empId, date: d, newVal: valueToPaste! });
          }
        }
      });
    } else if (focusedCell) {
      const emp = displayEmployees.find(e => e.id === focusedCell.empId);
      if (emp) {
        targets.push({ empId: focusedCell.empId, date: focusedCell.date, newVal: valueToPaste });
      }
    }

    if (targets.length > 0) {
      updateAttendanceBatch(targets);
      showToast(`Pasted status to ${targets.length} cell(s)`, 'success');
    }
  }, [copiedValue, selectedCells, focusedCell, displayEmployees, days, updateAttendanceBatch, showToast]);

  // Explicit cycle status function (Triggered on Double-click or Enter/Space key)
  const toggleAttendance = useCallback((empId: string, date: Date) => {
    const dateKey = formatDateKey(date);
    const currentVal = attendanceData[empId]?.[dateKey];

    let nextVal: AttendanceValue = 1;
    if (currentVal === undefined || currentVal === null) {
      nextVal = 1;
    } else {
      const idx = SEQUENCE.indexOf(currentVal);
      if (idx !== -1) {
        nextVal = SEQUENCE[(idx + 1) % SEQUENCE.length];
      } else {
        nextVal = 1;
      }
    }

    const cellKey = `${empId}|${dateKey}`;
    if (selectedCells.has(cellKey) && selectedCells.size > 1) {
      const targets: Array<{ empId: string; date: Date; newVal: AttendanceValue }> = [];
      selectedCells.forEach(key => {
        const [eId, dKey] = key.split('|');
        const d = days.find(day => formatDateKey(day) === dKey);
        if (d) targets.push({ empId: eId, date: d, newVal: nextVal });
      });
      updateAttendanceBatch(targets);
    } else {
      updateAttendance(empId, date, nextVal);
    }
  }, [attendanceData, selectedCells, days, updateAttendanceBatch, updateAttendance]);

  // Selection range builder
  const selectRange = useCallback((startEmpIdx: number, startDayIdx: number, endEmpIdx: number, endDayIdx: number) => {
    const minEmp = Math.min(startEmpIdx, endEmpIdx);
    const maxEmp = Math.max(startEmpIdx, endEmpIdx);
    const minDay = Math.min(startDayIdx, endDayIdx);
    const maxDay = Math.max(startDayIdx, endDayIdx);

    const newSet = new Set<string>();
    for (let r = minEmp; r <= maxEmp; r++) {
      const emp = displayEmployees[r];
      if (!emp) continue;
      for (let c = minDay; c <= maxDay; c++) {
        const d = days[c];
        if (!d) continue;
        const dateKey = formatDateKey(d);
        newSet.add(`${emp.id}|${dateKey}`);
      }
    }
    setSelectedCells(newSet);
  }, [displayEmployees, days]);

  // Mouse handlers for cell selection & drag-to-select
  const handleCellMouseDown = (e: React.MouseEvent, empIndex: number, dayIndex: number) => {
    if (e.button !== 0) return;

    const emp = displayEmployees[empIndex];
    const d = days[dayIndex];
    if (!emp || !d) return;

    const dateKey = formatDateKey(d);
    const coord: CellCoord = { empId: emp.id, date: d, dateKey, empIndex, dayIndex };

    if (e.shiftKey && selectionAnchor) {
      selectRange(selectionAnchor.empIndex, selectionAnchor.dayIndex, empIndex, dayIndex);
    } else {
      setSelectionAnchor({ empIndex, dayIndex });
      setSelectedCells(new Set([`${emp.id}|${dateKey}`]));
      setIsDragging(true);
    }

    setFocusedCell(coord);
  };

  const handleCellMouseEnter = (empIndex: number, dayIndex: number) => {
    if (isDragging && selectionAnchor) {
      selectRange(selectionAnchor.empIndex, selectionAnchor.dayIndex, empIndex, dayIndex);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleCellDoubleClick = (empId: string, date: Date) => {
    toggleAttendance(empId, date);
  };

  useEffect(() => {
    const handleGlobalClick = () => setContextMenu(null);
    const handleGlobalMouseUp = () => setIsDragging(false);

    window.addEventListener('click', handleGlobalClick);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('click', handleGlobalClick);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, []);

  // Keyboard Navigation & Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      const isCopy = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c';
      const isPaste = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v';

      if (isCopy) {
        e.preventDefault();
        handleCopy();
        return;
      }

      if (isPaste) {
        e.preventDefault();
        handlePaste();
        return;
      }

      if (!focusedCell) return;

      const { empIndex, dayIndex } = focusedCell;

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (empIndex > 0) {
          const nextEmp = displayEmployees[empIndex - 1];
          const d = days[dayIndex];
          if (nextEmp && d) {
            const dateKey = formatDateKey(d);
            setFocusedCell({ empId: nextEmp.id, date: d, dateKey, empIndex: empIndex - 1, dayIndex });
            if (e.shiftKey && selectionAnchor) {
              selectRange(selectionAnchor.empIndex, selectionAnchor.dayIndex, empIndex - 1, dayIndex);
            } else {
              setSelectionAnchor({ empIndex: empIndex - 1, dayIndex });
              setSelectedCells(new Set([`${nextEmp.id}|${dateKey}`]));
            }
          }
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (empIndex < displayEmployees.length - 1) {
          const nextEmp = displayEmployees[empIndex + 1];
          const d = days[dayIndex];
          if (nextEmp && d) {
            const dateKey = formatDateKey(d);
            setFocusedCell({ empId: nextEmp.id, date: d, dateKey, empIndex: empIndex + 1, dayIndex });
            if (e.shiftKey && selectionAnchor) {
              selectRange(selectionAnchor.empIndex, selectionAnchor.dayIndex, empIndex + 1, dayIndex);
            } else {
              setSelectionAnchor({ empIndex: empIndex + 1, dayIndex });
              setSelectedCells(new Set([`${nextEmp.id}|${dateKey}`]));
            }
          }
        }
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (dayIndex > 0) {
          const emp = displayEmployees[empIndex];
          const nextDay = days[dayIndex - 1];
          if (emp && nextDay) {
            const dateKey = formatDateKey(nextDay);
            setFocusedCell({ empId: emp.id, date: nextDay, dateKey, empIndex, dayIndex: dayIndex - 1 });
            if (e.shiftKey && selectionAnchor) {
              selectRange(selectionAnchor.empIndex, selectionAnchor.dayIndex, empIndex, dayIndex - 1);
            } else {
              setSelectionAnchor({ empIndex, dayIndex: dayIndex - 1 });
              setSelectedCells(new Set([`${emp.id}|${dateKey}`]));
            }
          }
        }
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (dayIndex < days.length - 1) {
          const emp = displayEmployees[empIndex];
          const nextDay = days[dayIndex + 1];
          if (emp && nextDay) {
            const dateKey = formatDateKey(nextDay);
            setFocusedCell({ empId: emp.id, date: nextDay, dateKey, empIndex, dayIndex: dayIndex + 1 });
            if (e.shiftKey && selectionAnchor) {
              selectRange(selectionAnchor.empIndex, selectionAnchor.dayIndex, empIndex, dayIndex + 1);
            } else {
              setSelectionAnchor({ empIndex, dayIndex: dayIndex + 1 });
              setSelectedCells(new Set([`${emp.id}|${dateKey}`]));
            }
          }
        }
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (focusedCell) {
          toggleAttendance(focusedCell.empId, focusedCell.date);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setSelectedCells(new Set());
        setFocusedCell(null);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        const targets: Array<{ empId: string; date: Date }> = [];
        if (selectedCells.size > 0) {
          selectedCells.forEach(cellKey => {
            const [eId, dKey] = cellKey.split('|');
            const d = days.find(day => formatDateKey(day) === dKey);
            if (d) targets.push({ empId: eId, date: d });
          });
        } else if (focusedCell) {
          targets.push({ empId: focusedCell.empId, date: focusedCell.date });
        }

        if (targets.length > 0) {
          clearAttendanceBatch(targets);
          showToast(`Cleared ${targets.length} cell(s)`, 'info');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focusedCell, displayEmployees, days, selectionAnchor, selectRange, handleCopy, handlePaste, toggleAttendance, clearAttendanceBatch, showToast]);

  const handleContextMenu = (e: React.MouseEvent, empId: string, date: Date, empIndex: number, dayIndex: number) => {
    e.preventDefault();
    const dateKey = formatDateKey(date);
    const cellKey = `${empId}|${dateKey}`;

    if (!selectedCells.has(cellKey)) {
      setSelectedCells(new Set([cellKey]));
      setFocusedCell({ empId, date, dateKey, empIndex, dayIndex });
      setSelectionAnchor({ empIndex, dayIndex });
    }

    const menuWidth = 210;
    const menuHeight = 420;
    let x = e.clientX;
    let y = e.clientY;

    if (x + menuWidth > window.innerWidth) x = window.innerWidth - menuWidth - 10;
    if (y + menuHeight > window.innerHeight) y = window.innerHeight - menuHeight - 10;

    x = Math.max(10, x);
    y = Math.max(10, y);

    setContextMenu({ x, y, empId, date, dateKey });
  };

  const handleMenuSelect = (val: AttendanceValue) => {
    if (!contextMenu) return;

    if (selectedCells.size > 0) {
      const targets: Array<{ empId: string; date: Date; newVal: AttendanceValue }> = [];
      selectedCells.forEach(cellKey => {
        const [empId, dKey] = cellKey.split('|');
        const d = days.find(day => formatDateKey(day) === dKey);
        if (d) targets.push({ empId, date: d, newVal: val });
      });
      updateAttendanceBatch(targets);
    } else {
      updateAttendance(contextMenu.empId, contextMenu.date, val);
    }

    setContextMenu(null);
  };

  const handleRequestAction = (id: string, status: 'APPROVED' | 'REJECTED') => {
    setSundayRequests(prev => prev.map(r => r.id === id ? { ...r, status } : r));
  };

  const toggleHideStatus = async (empId: string, currentStatus: boolean) => {
    const newStatus = !currentStatus;
    setEmployees(prev => prev.map(e => e.id === empId ? { ...e, hideAttendance: newStatus } : e));

    try {
      await api.put(`/employees/${empId}`, { hideAttendance: newStatus }, { withCredentials: true });
      const refreshed = await api.get('/employees', { withCredentials: true });
      setEmployees(ensureArray(extractPayload(refreshed)));
    } catch (err) {
      console.error('Failed to update hide status', err);
      setEmployees(prev => prev.map(e => e.id === empId ? { ...e, hideAttendance: currentStatus } : e));
    }
  };

  const getStats = (emp: Employee) => {
    const empId = emp.id;
    const trackingStartDate = emp.joiningDate
      ? startOfDay(new Date(emp.joiningDate))
      : (emp.createdAt ? startOfDay(new Date(emp.createdAt)) : new Date(0));
    const archiveDate = emp.archived_at ? startOfDay(new Date(emp.archived_at)) : null;
    const record = attendanceData[empId] || {};

    let worked = 0;
    let fullLeaves = 0;
    let totalLeaves = 0;
    let shortLeaves = 0;

    days.forEach(d => {
      const currentDay = startOfDay(d);
      const k = formatDateKey(d);
      const val = record[k];
      const isExplicit = val !== undefined;

      if (isBefore(currentDay, trackingStartDate) && !isExplicit) return;
      if (archiveDate && !isBefore(currentDay, archiveDate)) return;
      if (!isExplicit && !isBefore(currentDay, todayStart)) return;

      let effectiveVal: AttendanceValue = 1;
      if (isExplicit) {
        effectiveVal = val;
      } else {
        if (isDateSunday(d)) effectiveVal = 'OFF';
        else if (holidays.some(h => h.date === k)) effectiveVal = 'HOLIDAY';
        else if (workedSundayOfWeek(empId, d)) effectiveVal = 'OFF';
        else effectiveVal = 0;
      }

      if (effectiveVal === 'OFF' || effectiveVal === 'HOLIDAY' || effectiveVal === 'CO') return;

      if (effectiveVal === 'LEAVE' || effectiveVal === 'CS') {
        totalLeaves += 1;
        fullLeaves++;
        return;
      }

      const numVal = effectiveVal as number;
      worked += numVal;
      const leaveAmount = 1 - numVal;
      if (leaveAmount > 0) totalLeaves += leaveAmount;
      if (numVal === 0) fullLeaves++;
      if (numVal === 0.25 || numVal === 0.75 || numVal === 0.5) shortLeaves++;
    });

    return { worked, fullLeaves, totalLeaves, shortLeaves };
  };

  return (
    <div ref={containerRef} className="flex flex-col h-full min-h-0 bg-slate-50 relative select-none overflow-hidden" onMouseUp={handleMouseUp}>
      {/* Toast Alert */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-xl shadow-lg border text-xs font-bold flex items-center gap-2 transition-all animate-in fade-in slide-in-from-top-2 ${toast.type === 'success' ? 'bg-emerald-800 text-emerald-100 border-emerald-700' : 'bg-slate-800 text-slate-100 border-slate-700'}`}>
          <Check size={14} className="text-emerald-400 shrink-0" />
          {toast.text}
        </div>
      )}

      {/* Header Bar */}
      <div className="shrink-0 p-4 md:p-5 border-b border-slate-200 bg-white shadow-sm flex flex-col md:flex-row justify-between items-center z-30 relative gap-4">
        <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-start">
          <h2 className="text-xl md:text-2xl font-extrabold text-slate-800 flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center shrink-0 shadow-sm">
              <Calendar size={20} />
            </div>
            <span>Attendance Sheet</span>
            {pendingRequests.length > 0 && (
              <button
                onClick={() => setShowRequestsModal(true)}
                className="ml-2 text-xs bg-red-500 text-white px-3 py-1 rounded-full font-bold animate-pulse shadow-red-500/50 shadow-sm"
              >
                {pendingRequests.length} Sunday Req
              </button>
            )}
          </h2>

          {/* Quick Search */}
          <div className="relative max-w-xs hidden sm:block">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={14} />
            <input
              type="text"
              placeholder="Search staff..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 bg-slate-100 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 w-36 focus:w-48 transition-all"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-2 top-2 text-slate-400 hover:text-slate-600">
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between w-full md:w-auto gap-3">
          {currentUser?.role === 'ADMIN' && (
            <button
              onClick={() => {
                startCalTransition(() => {
                  setShowHidden(!showHidden);
                });
              }}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border transition-all font-bold text-xs ${showHidden ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/30' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
              title={showHidden ? "Hide team members marked as hidden" : "Show team members marked as hidden"}
            >
              {showHidden ? <Eye size={16} /> : <EyeOff size={16} />}
              <span className="hidden sm:inline">{showHidden ? 'Showing Hidden' : 'Show Hidden'}</span>
            </button>
          )}

          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              onClick={() => handleMonthChange(-1)}
              className="p-1.5 hover:bg-white hover:shadow-md hover:text-blue-600 rounded-lg transition-all text-slate-500"
              title="Previous Month"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="w-32 md:w-40 text-center font-extrabold text-slate-800 select-none text-sm md:text-base">
              {format(currentDate, 'MMMM yyyy')}
            </span>
            <button
              onClick={() => handleMonthChange(1)}
              className="p-1.5 hover:bg-white hover:shadow-md hover:text-blue-600 rounded-lg transition-all text-slate-500"
              title="Next Month"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Main Grid Table */}
      <div className="flex-1 min-h-0 overflow-auto relative custom-scrollbar bg-white">
        <table className="border-collapse w-full">
          <thead className="bg-slate-50 sticky top-0 z-20 shadow-sm">
            <tr>
              <th className="sticky left-0 bg-slate-50 z-30 p-3 min-w-[70px] text-left text-xs font-black uppercase tracking-wider text-slate-500 border-b border-slate-200 border-r">ID</th>
              <th className="sticky left-[70px] bg-slate-50 z-30 p-3 min-w-[160px] text-left text-xs font-black uppercase tracking-wider text-slate-500 border-b border-slate-200 border-r shadow-[4px_0_8px_-4px_rgba(0,0,0,0.05)]">Name</th>
              <th className="p-2 w-14 text-center text-[10px] uppercase font-black text-blue-600 bg-blue-50/50 border-b border-blue-100 border-r border-slate-200" title="Days Worked">Work</th>
              <th className="p-2 w-14 text-center text-[10px] uppercase font-black text-rose-600 bg-rose-50/50 border-b border-rose-100 border-r border-slate-200" title="Full Leaves">Full</th>
              <th className="p-2 w-14 text-center text-[10px] uppercase font-black text-amber-600 bg-amber-50/50 border-b border-amber-100 border-r border-slate-200" title="Total Leaves">Total</th>

              {days.map(d => {
                const isSun = isDateSunday(d);
                const holiday = holidays.find(h => h.date === formatDateKey(d));
                return (
                  <th
                    key={d.toString()}
                    className={`p-2 min-w-[42px] text-center border-b border-slate-200 border-r border-slate-100 transition-colors ${isSun || holiday ? 'bg-emerald-50/80' : 'bg-slate-50'}`}
                    title={holiday?.name || (isSun ? 'Sunday' : undefined)}
                  >
                    <div className={`text-sm font-black ${isSun || holiday ? 'text-emerald-700' : 'text-slate-700'}`}>{format(d, 'd')}</div>
                    <div className={`text-[9px] font-bold uppercase tracking-wider ${isSun || holiday ? 'text-emerald-600' : 'text-slate-400'}`}>{format(d, 'EEE')}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {displayEmployees.map((emp, empIndex) => {
              const stats = getStats(emp);
              const trackingStartDate = emp.joiningDate
                ? startOfDay(new Date(emp.joiningDate))
                : (emp.createdAt ? startOfDay(new Date(emp.createdAt)) : new Date(0));

              return (
                <tr key={emp.id} className="hover:bg-blue-50/30 transition-colors group">
                  <td className="sticky left-0 bg-white group-hover:bg-blue-50/30 p-2.5 font-mono text-xs font-bold text-slate-500 border-r border-slate-200 z-10 transition-colors uppercase">{emp.id}</td>
                  <td className="sticky left-[70px] bg-white group-hover:bg-blue-50/30 p-2 text-sm font-bold border-r border-slate-200 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.05)] z-10 whitespace-nowrap overflow-hidden max-w-[160px] transition-colors">
                    <div className="flex items-center justify-between gap-1 overflow-hidden w-full">
                      <span className={`truncate flex-1 ${emp.hideAttendance ? 'text-slate-400 italic' : 'text-slate-700'}`}>{emp.name}</span>
                      {currentUser?.role === 'ADMIN' && (
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleHideStatus(emp.id, !!emp.hideAttendance); }}
                          className={`p-1 rounded-lg transition-colors shrink-0 ${emp.hideAttendance ? 'text-blue-600 bg-blue-50 hover:bg-blue-100' : 'text-slate-300 hover:text-blue-600 hover:bg-blue-50'}`}
                          title={emp.hideAttendance ? "Unhide from Attendance Sheet" : "Hide from Attendance Sheet"}
                        >
                          {emp.hideAttendance ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                      )}
                    </div>
                  </td>

                  <td className="p-2 text-center text-xs font-black text-slate-800 bg-blue-50/20 border-r border-slate-100">{(stats?.worked || 0).toFixed(2)}</td>
                  <td className="p-2 text-center text-xs font-black text-slate-500 bg-rose-50/20 border-r border-slate-100">{stats?.fullLeaves || 0}</td>
                  <td className="p-2 text-center text-xs font-black text-slate-800 bg-amber-50/20 border-r border-slate-100">{(stats?.totalLeaves || 0).toFixed(2)}</td>

                  {days.map((d, dayIndex) => {
                    const currentDay = startOfDay(d);
                    const isBeforeTracking = isBefore(currentDay, trackingStartDate);
                    const archiveDate = emp.archived_at ? startOfDay(new Date(emp.archived_at)) : null;
                    const isArchivedDay = archiveDate && !isBefore(currentDay, archiveDate);

                    const isSun = isDateSunday(d);
                    const dateKey = formatDateKey(d);
                    const holiday = holidays.find(h => h.date === dateKey);

                    const record = attendanceData[emp.id]?.[dateKey];
                    const isExplicitRecord = record !== undefined;
                    let val: AttendanceValue | null = null;

                    if (isArchivedDay) {
                      val = null;
                    } else if (isExplicitRecord) {
                      // Respect explicit user setting 100% (including explicit 0 Absent, 1 Present, Leave, etc.)
                      val = record;
                    } else {
                      // Only apply automatic Sunday compensation / defaults for unmarked (undefined) days
                      if (isBeforeTracking) {
                        val = null;
                      } else {
                        if (isSun) {
                          val = 'OFF';
                        } else if (holiday) {
                          val = 'HOLIDAY';
                        } else {
                          if (isBefore(currentDay, todayStart)) {
                            // If employee worked Sunday of this week, auto-compensate un-entered weekday as OFF
                            if (workedSundayOfWeek(emp.id, d)) {
                              val = 'OFF';
                            } else {
                              val = 0;
                            }
                          } else {
                            val = null;
                          }
                        }
                      }
                    }

                    // Auto-convert display to CS ONLY if user explicitly entered 'LEAVE' on a weekday where Sunday was worked
                    if (!isSun && !isArchivedDay && val === 'LEAVE' && workedSundayOfWeek(emp.id, d)) {
                      val = 'CS';
                    }

                    let displayText = val === 1 ? '1' : (val === null ? '' : (val === 'OFF' || val === 'HOLIDAY' ? '—' : (val === 'LEAVE' ? 'L' : (val === 'CO' ? 'C' : (val === 'CS' ? 'CS' : val)))));
                    if (isSun && val === 1) displayText = '1☀';
                    if (isArchivedDay || (val === null && isBeforeTracking)) displayText = '-';

                    const colorClass = isArchivedDay
                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                      : (val === null ? 'bg-white' : (STATUS_COLORS[val.toString()] || 'bg-white'));

                    const cellKey = `${emp.id}|${dateKey}`;
                    const isSelected = selectedCells.has(cellKey);
                    const isFocused = focusedCell?.empId === emp.id && focusedCell?.dateKey === dateKey;

                    let selectionStyle = '';
                    if (isFocused) {
                      selectionStyle = 'ring-2 ring-blue-600 ring-inset bg-blue-100/70 z-10 shadow-md font-bold scale-[1.03]';
                    } else if (isSelected) {
                      selectionStyle = 'ring-1 ring-blue-400 ring-inset bg-blue-50/80 z-10 font-bold';
                    }

                    return (
                      <td
                        key={dateKey}
                        onMouseDown={(e) => {
                          if (isArchivedDay) return;
                          handleCellMouseDown(e, empIndex, dayIndex);
                        }}
                        onMouseEnter={() => handleCellMouseEnter(empIndex, dayIndex)}
                        onDoubleClick={() => {
                          if (isArchivedDay) return;
                          handleCellDoubleClick(emp.id, d);
                        }}
                        onContextMenu={(e) => {
                          if (isArchivedDay) {
                            e.preventDefault();
                            return;
                          }
                          handleContextMenu(e, emp.id, d, empIndex, dayIndex);
                        }}
                        className={`p-1 border-r border-slate-100 cursor-pointer text-center relative transition-all ${selectionStyle}`}
                        title={val === 'CS' ? 'Compensate: Leave used against Sunday work' : (holiday ? `${holiday.name}` : (isSun && val === 1 ? 'Present on Sunday' : 'Double-click to edit, Press Delete to clear'))}
                      >
                        <div className={`w-8 h-8 mx-auto rounded-xl flex items-center justify-center text-[10px] font-black shadow-sm transition-all hover:scale-105 hover:shadow-md ${colorClass} ${val === 1 && !isArchivedDay ? 'border border-slate-200 bg-white hover:bg-slate-50 text-slate-800' : ''}`}>
                          {displayText}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Fixed Sticky Footer Bar */}
      <div className="shrink-0 sticky bottom-0 z-30 bg-white border-t border-slate-200 px-4 py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] flex flex-wrap items-center justify-between gap-3 text-xs font-bold text-slate-600">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-1.5"><div className="w-4 h-4 rounded bg-white border border-slate-300 shadow-sm flex items-center justify-center text-[9px] font-black">1</div> Present</span>
          <span className="flex items-center gap-1.5"><div className="w-4 h-4 rounded bg-red-500 shadow-sm flex items-center justify-center text-[9px] font-black text-white">0</div> Absent</span>
          <span className="flex items-center gap-1.5"><div className="w-4 h-4 rounded bg-pink-500 shadow-sm flex items-center justify-center text-[9px] font-black text-white">L</div> Leave</span>
          <span className="flex items-center gap-1.5"><div className="w-4 h-4 rounded bg-yellow-300 shadow-sm"></div> Half (0.5)</span>
          <span className="flex items-center gap-1.5"><div className="w-4 h-4 rounded bg-blue-200 shadow-sm"></div> Quarter (0.25)</span>
          <span className="flex items-center gap-1.5"><div className="w-4 h-4 rounded bg-orange-300 shadow-sm"></div> Short (0.75)</span>
          <span className="flex items-center gap-1.5"><div className="w-4 h-4 rounded bg-teal-500 shadow-sm flex items-center justify-center text-[8px] font-black text-white">CS</div> Comp Sun</span>
          <span className="flex items-center gap-1.5"><div className="w-4 h-4 rounded bg-purple-200 shadow-sm flex items-center justify-center text-[9px] font-black text-purple-900">C</div> Comp Off</span>
          <span className="flex items-center gap-1.5"><div className="w-4 h-4 rounded bg-[#00b050] shadow-sm"></div> Off/Holiday</span>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-slate-500 font-semibold text-[11px]">
          <span className="bg-blue-50 text-blue-700 px-2.5 py-1 rounded-lg border border-blue-100 flex items-center gap-1.5">
            <MousePointer size={12} /> Select cell • Double-click to edit • Delete key to empty cell
          </span>
          <span className="bg-slate-100 text-slate-600 px-2.5 py-1 rounded-lg border border-slate-200 flex items-center gap-1.5">
            📋 Ctrl+C / Ctrl+V Copy & Paste
          </span>
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          style={{ top: contextMenu.y, left: contextMenu.x }}
          className="fixed z-50 bg-white rounded-2xl shadow-2xl border border-slate-200 w-52 py-1.5 animate-in fade-in zoom-in-95 duration-100 overflow-hidden text-slate-700"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3.5 py-1.5 text-[10px] font-black text-slate-400 uppercase tracking-wider border-b border-slate-100">
            Clipboard Actions {selectedCells.size > 1 ? `(${selectedCells.size} selected)` : ''}
          </div>

          <button
            onClick={() => {
              handleCopy();
              setContextMenu(null);
            }}
            className="w-full text-left px-3.5 py-2 text-xs font-bold hover:bg-blue-50 hover:text-blue-600 flex items-center gap-2.5 transition-colors"
          >
            <Copy size={14} className="text-slate-400" /> Copy Status
          </button>

          <button
            onClick={() => {
              handlePaste();
              setContextMenu(null);
            }}
            className="w-full text-left px-3.5 py-2 text-xs font-bold hover:bg-blue-50 hover:text-blue-600 flex items-center gap-2.5 transition-colors"
          >
            <Clipboard size={14} className="text-slate-400" /> Paste Status
          </button>

          <button
            onClick={() => {
              const targets: Array<{ empId: string; date: Date }> = [];
              if (selectedCells.size > 0) {
                selectedCells.forEach(cellKey => {
                  const [eId, dKey] = cellKey.split('|');
                  const d = days.find(day => formatDateKey(day) === dKey);
                  if (d) targets.push({ empId: eId, date: d });
                });
              } else if (contextMenu) {
                targets.push({ empId: contextMenu.empId, date: contextMenu.date });
              }

              if (targets.length > 0) {
                clearAttendanceBatch(targets);
                showToast(`Cleared ${targets.length} cell(s)`, 'info');
              }
              setContextMenu(null);
            }}
            className="w-full text-left px-3.5 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 flex items-center gap-2.5 transition-colors"
          >
            <Trash2 size={14} className="text-rose-500" /> Clear / Empty Cell(s)
          </button>

          <div className="my-1 border-t border-slate-100"></div>
          <div className="px-3.5 py-1.5 text-[10px] font-black text-slate-400 uppercase tracking-wider">Set Status</div>

          <button onClick={() => handleMenuSelect(1)} className="w-full text-left px-3.5 py-1.5 text-xs font-bold hover:bg-slate-100 flex items-center gap-2.5">
            <div className="w-4 h-4 rounded bg-white border border-slate-300 flex items-center justify-center text-[8px] font-black">1</div> Present (1.0)
          </button>
          <button onClick={() => handleMenuSelect(0)} className="w-full text-left px-3.5 py-1.5 text-xs font-bold hover:bg-slate-100 flex items-center gap-2.5">
            <div className="w-4 h-4 rounded bg-red-500 text-white flex items-center justify-center text-[8px] font-black">0</div> Absent (0)
          </button>
          <button onClick={() => handleMenuSelect('LEAVE')} className="w-full text-left px-3.5 py-1.5 text-xs font-bold hover:bg-slate-100 flex items-center gap-2.5">
            <div className="w-4 h-4 rounded bg-pink-500 text-white flex items-center justify-center text-[8px] font-black">L</div> Leave
          </button>
          <button onClick={() => handleMenuSelect(0.5)} className="w-full text-left px-3.5 py-1.5 text-xs font-bold hover:bg-slate-100 flex items-center gap-2.5">
            <div className="w-4 h-4 rounded bg-yellow-300"></div> Half Day (0.5)
          </button>
          <button onClick={() => handleMenuSelect(0.25)} className="w-full text-left px-3.5 py-1.5 text-xs font-bold hover:bg-slate-100 flex items-center gap-2.5">
            <div className="w-4 h-4 rounded bg-blue-200"></div> Quarter Day (0.25)
          </button>
          <button onClick={() => handleMenuSelect(0.75)} className="w-full text-left px-3.5 py-1.5 text-xs font-bold hover:bg-slate-100 flex items-center gap-2.5">
            <div className="w-4 h-4 rounded bg-orange-300"></div> Short Leave (0.75)
          </button>
          <button onClick={() => handleMenuSelect('CO')} className="w-full text-left px-3.5 py-1.5 text-xs font-bold hover:bg-slate-100 flex items-center gap-2.5">
            <div className="w-4 h-4 rounded bg-purple-200 text-purple-900 flex items-center justify-center text-[8px] font-black">C</div> Comp Off
          </button>
          <button onClick={() => handleMenuSelect('CS')} className="w-full text-left px-3.5 py-1.5 text-xs font-bold hover:bg-slate-100 flex items-center gap-2.5">
            <div className="w-4 h-4 rounded bg-teal-500 text-white flex items-center justify-center text-[8px] font-black">CS</div> Compensate Sunday
          </button>

          <div className="my-1 border-t border-slate-100"></div>
          <button onClick={() => handleMenuSelect('OFF')} className="w-full text-left px-3.5 py-1.5 text-xs font-bold hover:bg-slate-100 flex items-center gap-2.5">
            <div className="w-4 h-4 rounded bg-[#00b050]"></div> Off Day
          </button>
          <button onClick={() => handleMenuSelect('HOLIDAY')} className="w-full text-left px-3.5 py-1.5 text-xs font-bold hover:bg-slate-100 flex items-center gap-2.5">
            <div className="w-4 h-4 rounded bg-[#00b050]"></div> Holiday
          </button>
        </div>
      )}

      {/* Sunday Requests Modal */}
      {showRequestsModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-slate-100 bg-red-50/50 flex justify-between items-center shrink-0">
              <h3 className="text-lg font-extrabold text-red-900">Sunday Work Requests</h3>
              <button onClick={() => setShowRequestsModal(false)} className="p-1.5 hover:bg-red-100 rounded-full text-red-800 transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-3 overflow-y-auto">
              {pendingRequests.length === 0 ? (
                <div className="text-center text-slate-400 py-8 text-sm font-medium">No pending Sunday requests</div>
              ) : (
                pendingRequests.map(req => {
                  const emp = employees.find(e => e.id === req.employeeId);
                  return (
                    <div key={req.id} className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
                      <div className="flex justify-between items-start mb-1.5">
                        <div>
                          <p className="font-bold text-slate-800 text-sm">{emp?.name || req.employeeId}</p>
                          <p className="text-xs text-slate-500 font-medium">{req.date}</p>
                        </div>
                        <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{req.id}</span>
                      </div>
                      <p className="text-xs text-slate-600 bg-slate-50 p-2 rounded-xl mb-3 italic">"{req.reason}"</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleRequestAction(req.id, 'APPROVED')}
                          className="flex-1 py-1.5 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition-colors flex items-center justify-center gap-1"
                        >
                          <CheckCircle2 size={14} /> Approve
                        </button>
                        <button
                          onClick={() => handleRequestAction(req.id, 'REJECTED')}
                          className="flex-1 py-1.5 bg-white border border-red-200 text-red-600 rounded-xl text-xs font-bold hover:bg-red-50 transition-colors flex items-center justify-center gap-1"
                        >
                          <XCircle size={14} /> Reject
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const AttendanceSheet = React.memo(AttendanceSheetComponent);
export default AttendanceSheet;
