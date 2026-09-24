
import React, { useState, useMemo } from 'react';
import { TimeLog, Employee, AttendanceRecord, AttendanceValue, User } from '../types';
import { Clock, Search, Download, CalendarDays, User as UserIcon, Save, X, LogOut, BarChart3, AlertTriangle, TrendingUp, ChevronLeft, ChevronRight, Plus, CheckCircle2, Check, Info, ArrowRight, ShieldCheck, Timer, Sparkles } from 'lucide-react';
import { format, differenceInMinutes } from 'date-fns';
import { formatDecimalHours, formatDateKey } from '../utils/dateUtils';
import api, { safeGet, extractPayload, ensureArray, invalidateCache } from '../src/utils/api';

interface TimeLogViewerProps {
    timeLogs: Record<string, Record<string, TimeLog[]>>; // empId -> date -> Array of Logs
    setTimeLogs: React.Dispatch<React.SetStateAction<Record<string, Record<string, TimeLog[]>>>>;
    employees: Employee[];
    attendanceData: Record<string, AttendanceRecord>;
    setAttendanceData: React.Dispatch<React.SetStateAction<Record<string, AttendanceRecord>>>;
    currentUser?: User;
    users?: User[];
}

const TimeLogViewerComponent: React.FC<TimeLogViewerProps> = ({
    timeLogs, setTimeLogs, employees, attendanceData, setAttendanceData, currentUser, users
}) => {
    const [searchTermInput, setSearchTermInput] = useState('');
    const [searchTerm, setSearchTerm] = useState('');

    React.useEffect(() => {
        const handler = setTimeout(() => {
            setSearchTerm(searchTermInput);
        }, 250);
        return () => clearTimeout(handler);
    }, [searchTermInput]);
    const [focusedEmployeeId, setFocusedEmployeeId] = useState('');
    const [showAnalysis, setShowAnalysis] = useState(false);
    const [analysisFilters, setAnalysisFilters] = useState({ empId: '', start: '', end: '' });

    // Professional Shift Logout & Edit Modal State
    const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);
    const [modalLog, setModalLog] = useState<any | null>(null);
    const [isNewShiftMode, setIsNewShiftMode] = useState(false);
    const [modalEmpId, setModalEmpId] = useState('');
    const [modalDate, setModalDate] = useState('');
    const [modalClockIn, setModalClockIn] = useState('09:30');
    const [modalClockOut, setModalClockOut] = useState('18:30');
    const [modalNotes, setModalNotes] = useState('');
    const [isSavingShift, setIsSavingShift] = useState(false);
    const [modalError, setModalError] = useState<string | null>(null);
    const [statusToast, setStatusToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    // Auto-dismiss status toast
    React.useEffect(() => {
        if (statusToast) {
            const timer = setTimeout(() => setStatusToast(null), 4500);
            return () => clearTimeout(timer);
        }
    }, [statusToast]);

    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const datesPerPage = 10;

    // Reset page to 1 on filter/search changes
    React.useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, focusedEmployeeId]);

    // Auto-fetch fresh timelogs on mount to ensure shift logs are immediately visible
    React.useEffect(() => {
        let isMounted = true;
        const fetchFreshLogs = async () => {
            try {
                const isEmployee = currentUser?.role === 'EMPLOYEE';
                const userEmpId = currentUser?.employeeId || (currentUser?.id ? String(currentUser.id) : '');
                const url = isEmployee && userEmpId ? `/timelogs?userId=${encodeURIComponent(userEmpId)}` : '/timelogs';
                const res = await safeGet(url, { cacheBust: true });
                const arr = ensureArray(extractPayload(res));
                if (!isMounted || arr.length === 0) return;

                const tlMap: Record<string, Record<string, TimeLog[]>> = {};
                arr.forEach((t: any) => {
                    if (!t || !t.userId) return;
                    const dateKey = t.startTime ? t.startTime.split('T')[0] : (t.date || (t.createdAt ? t.createdAt.split('T')[0] : ''));
                    if (!dateKey) return;
                    const uId = String(t.userId);
                    if (!tlMap[uId]) tlMap[uId] = {};
                    if (!tlMap[uId][dateKey]) tlMap[uId][dateKey] = [];
                    
                    let duration = t.durationHours;
                    if (!duration && t.startTime && t.endTime) {
                        const start = new Date(t.startTime).getTime();
                        const end = new Date(t.endTime).getTime();
                        if (end > start) duration = (end - start) / 3600000;
                    }
                    
                    const exists = tlMap[uId][dateKey].some(ex => (t.id && ex.id === t.id) || (ex.clockIn === t.startTime && ex.clockOut === t.endTime));
                    if (!exists) {
                        tlMap[uId][dateKey].push({
                            id: t.id,
                            date: dateKey,
                            clockIn: t.startTime || t.clockIn,
                            clockOut: t.endTime || t.clockOut,
                            durationHours: duration
                        });
                    }
                });

                setTimeLogs(prev => {
                    const merged = { ...prev };
                    Object.entries(tlMap).forEach(([k, dMap]) => {
                        if (!merged[k]) merged[k] = {};
                        Object.entries(dMap).forEach(([dKey, logs]) => {
                            if (!merged[k][dKey]) {
                                merged[k][dKey] = logs;
                            } else {
                                const currentLogs = [...merged[k][dKey]];
                                logs.forEach(l => {
                                    const idx = currentLogs.findIndex(ex => (l.id && ex.id === l.id) || ex.clockIn === l.clockIn);
                                    if (idx >= 0) {
                                        currentLogs[idx] = { ...currentLogs[idx], ...l };
                                    } else {
                                        currentLogs.push(l);
                                    }
                                });
                                merged[k][dKey] = currentLogs;
                            }
                        });
                    });
                    return merged;
                });
            } catch (e) {
                console.warn('TimeLogViewer: initial fetch warning', e);
            }
        };
        fetchFreshLogs();
        return () => { isMounted = false; };
    }, [currentUser]);

    // 1. Flatten logs into a workable array with smart deduplication & instant resolution
    const allLogs = useMemo(() => {
        const rawLogs: (TimeLog & { empName: string, empId: string, department: string, avatar?: string })[] = [];

        // Collect all logs with normalized metadata
        Object.entries(timeLogs || {}).forEach(([uKey, dayMap]) => {
            if (!dayMap) return;
            const matchedUser = users?.find?.(u => String(u.id) === uKey || u.employeeId === uKey);
            const emp = employees.find(e => e.id === uKey || String(e.id) === uKey || (matchedUser && e.id === matchedUser.employeeId));
            const targetEmpId = emp?.id || matchedUser?.employeeId || uKey;
            const targetEmpName = emp?.name || matchedUser?.name || `Staff (${uKey})`;
            const targetDept = emp?.department || 'General';

            Object.values(dayMap).forEach(dayLogs => {
                ensureArray(dayLogs).forEach(log => {
                    if (!log) return;
                    rawLogs.push({
                        ...log,
                        empName: targetEmpName,
                        empId: targetEmpId,
                        department: targetDept,
                        avatar: emp?.avatar
                    });
                });
            });
        });

        // Also check employees list
        employees.forEach(emp => {
            if (!emp.id) return;
            const empLogsMap = timeLogs[emp.id];
            if (empLogsMap) {
                Object.values(empLogsMap).forEach(dayLogs => {
                    ensureArray(dayLogs).forEach(log => {
                        if (!log) return;
                        rawLogs.push({
                            ...log,
                            empName: emp.name,
                            empId: emp.id,
                            department: emp.department,
                            avatar: emp.avatar
                        });
                    });
                });
            }
        });

        // Smart deduplication: closed records (with clockOut) ALWAYS take precedence over open records
        const dedupedMap = new Map<string, TimeLog & { empName: string, empId: string, department: string, avatar?: string }>();

        rawLogs.forEach(log => {
            const dateKey = log.date || (log.clockIn ? log.clockIn.split('T')[0] : '');
            const clockInTime = log.clockIn ? new Date(log.clockIn).getTime() : 0;
            const timeSlot = clockInTime > 0 ? Math.round(clockInTime / (10 * 60 * 1000)) : 0;
            const groupKey = log.id ? `${log.empId}_id_${log.id}` : `${log.empId}_dt_${dateKey}_slot_${timeSlot}`;

            const existing = dedupedMap.get(groupKey);

            if (!existing) {
                // Check if another entry for this employee on this date exists within 15 mins
                let matchedKey: string | null = null;
                for (const [k, ex] of dedupedMap.entries()) {
                    if (ex.empId === log.empId) {
                        const exDate = ex.date || (ex.clockIn ? ex.clockIn.split('T')[0] : '');
                        if (exDate === dateKey) {
                            const exTime = ex.clockIn ? new Date(ex.clockIn).getTime() : 0;
                            if (clockInTime === 0 || exTime === 0 || Math.abs(exTime - clockInTime) < 15 * 60 * 1000) {
                                matchedKey = k;
                                break;
                            }
                        }
                    }
                }

                if (matchedKey) {
                    const ex = dedupedMap.get(matchedKey)!;
                    if (log.clockOut && !ex.clockOut) {
                        dedupedMap.set(matchedKey, { ...ex, ...log });
                    } else if (log.clockOut && ex.clockOut) {
                        const exOut = new Date(ex.clockOut).getTime();
                        const logOut = new Date(log.clockOut).getTime();
                        if (logOut >= exOut || (log.durationHours || 0) > (ex.durationHours || 0)) {
                            dedupedMap.set(matchedKey, { ...ex, ...log });
                        }
                    }
                } else {
                    dedupedMap.set(groupKey, log);
                }
            } else {
                if (log.clockOut && !existing.clockOut) {
                    dedupedMap.set(groupKey, { ...existing, ...log });
                } else if (log.clockOut && existing.clockOut) {
                    const exOut = new Date(existing.clockOut).getTime();
                    const logOut = new Date(log.clockOut).getTime();
                    if (logOut >= exOut || (log.durationHours || 0) > (existing.durationHours || 0)) {
                        dedupedMap.set(groupKey, { ...existing, ...log });
                    }
                }
            }
        });

        const logs = Array.from(dedupedMap.values());

        // Sort by Time (Clock In) Descending
        return logs.sort((a, b) => {
            const aTime = a.clockIn ? new Date(a.clockIn).getTime() : 0;
            const bTime = b.clockIn ? new Date(b.clockIn).getTime() : 0;
            return bTime - aTime;
        });
    }, [timeLogs, employees, users]);

    // 2. Filter
    const userEmpId = currentUser?.employeeId || (currentUser?.id ? String(currentUser.id) : '');
    const isEmployeeRole = currentUser?.role === 'EMPLOYEE';

    const filteredLogs = allLogs.filter(log => {
        const matchesSearch = log.empName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            log.empId.toLowerCase().includes(searchTerm.toLowerCase()) ||
            log.department.toLowerCase().includes(searchTerm.toLowerCase());

        const matchesEmployee = !focusedEmployeeId || log.empId === focusedEmployeeId;

        const matchesUser = !isEmployeeRole || (
            log.empId === userEmpId ||
            log.empId === currentUser?.employeeId ||
            log.empId === String(currentUser?.id)
        );

        return matchesSearch && matchesEmployee && matchesUser;
    });

    // 3. Analysis Logic for Professional Report
    const analysisReport = useMemo(() => {
        if (!analysisFilters.empId) return null;

        const today = format(new Date(), 'yyyy-MM-dd');

        if (analysisFilters.empId === 'ALL') {
            const teamItems = employees.map(emp => {
                const empLogs = allLogs.filter(l => l.empId === emp.id);

                // Calculate potential days in range
                let daysInRangeCount = 0;
                if (analysisFilters.start && analysisFilters.end) {
                    const startStr = analysisFilters.start;
                    const endStr = analysisFilters.end;
                    const startD = new Date(startStr);
                    const endD = new Date(endStr);
                    daysInRangeCount = Math.max(0, Math.ceil((endD.getTime() - startD.getTime()) / (1000 * 60 * 60 * 24)) + 1);
                }

                const inRange = empLogs.filter(l => {
                    let ok = true;
                    if (analysisFilters.start) ok = ok && l.date >= analysisFilters.start;
                    if (analysisFilters.end) ok = ok && l.date <= analysisFilters.end;
                    return ok;
                }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

                // Determine EARLIEST clockIn per day
                const firstClockInByDate: Record<string, Date> = {};
                empLogs.forEach(l => {
                    if (l.clockIn) {
                        const dt = new Date(l.clockIn);
                        if (!firstClockInByDate[l.date] || dt < firstClockInByDate[l.date]) {
                            firstClockInByDate[l.date] = dt;
                        }
                    }
                });

                const processed = inRange.map(l => {
                    const isMissed = !l.clockOut && l.date < today;
                    const firstCheckInTime = firstClockInByDate[l.date] || (l.clockIn ? new Date(l.clockIn) : null);
                    const checkOutTime = l.clockOut ? new Date(l.clockOut) : null;
                    const isLate = firstCheckInTime
                        ? (firstCheckInTime.getHours() > 10 || (firstCheckInTime.getHours() === 10 && firstCheckInTime.getMinutes() > 15))
                        : false;
                    const isEarlyOut = checkOutTime ? checkOutTime.getHours() < 17 : false;
                    const score = typeof attendanceData[emp.id]?.[l.date] === 'number' ? (attendanceData[emp.id][l.date] as number) : (l.clockIn ? 1 : 0);
                    return { ...l, isMissed, isLate, isEarlyOut, score };
                });

                const validLogs = processed.filter(l => !l.isMissed);
                const totalHours = validLogs.reduce((acc, curr) => acc + (curr.durationHours || 0), 0);
                const missedCount = processed.filter(l => l.isMissed).length;
                const lateDates = new Set(processed.filter(l => l.isLate).map(l => l.date));
                const lateCount = lateDates.size;
                const workingDays = new Set(validLogs.map(l => l.date)).size;

                const avgHours = workingDays > 0 ? totalHours / workingDays : 0;
                const totalScore = validLogs.reduce((acc, curr) => acc + (curr.score || 0), 0);
                const attendanceImpact = daysInRangeCount > 0 ? (totalScore / daysInRangeCount) * 100 : 0;

                let tier = "INSUFFICIENT DATA";
                let tierColor = "slate";
                if (workingDays > 0) {
                    if (avgHours >= 8 && attendanceImpact >= 85) { tier = "ELITE PERFORMER"; tierColor = "emerald"; }
                    else if (avgHours >= 7 && attendanceImpact >= 70) { tier = "CORE ASSET"; tierColor = "indigo"; }
                    else if (avgHours >= 4) { tier = "REGULAR"; tierColor = "blue"; }
                    else { tier = "UNDER REVIEW"; tierColor = "rose"; }
                }

                return {
                    emp,
                    totalHours,
                    missedCount,
                    lateCount,
                    workingDays,
                    avgHours,
                    attendanceImpact,
                    tier,
                    tierColor
                };
            });

            const teamTotalHours = teamItems.reduce((sum, item) => sum + item.totalHours, 0);
            const teamTotalDays = teamItems.reduce((sum, item) => sum + item.workingDays, 0);
            const teamTotalLate = teamItems.reduce((sum, item) => sum + item.lateCount, 0);
            const teamTotalMissed = teamItems.reduce((sum, item) => sum + item.missedCount, 0);

            return {
                isTeamSummary: true,
                items: teamItems,
                teamTotalHours,
                teamTotalDays,
                teamTotalLate,
                teamTotalMissed
            };
        }

        const emp = employees.find(e => e.id === analysisFilters.empId);
        const empLogs = allLogs.filter(l => l.empId === analysisFilters.empId);

        // Calculate potential days in range for attendance scoring logic
        let daysInRangeCount = 0;
        if (analysisFilters.start && analysisFilters.end) {
            const startStr = analysisFilters.start;
            const endStr = analysisFilters.end;
            const startD = new Date(startStr);
            const endD = new Date(endStr);
            daysInRangeCount = Math.max(0, Math.ceil((endD.getTime() - startD.getTime()) / (1000 * 60 * 60 * 24)) + 1);
        }

        const inRange = empLogs.filter(l => {
            let ok = true;
            if (analysisFilters.start) ok = ok && l.date >= analysisFilters.start;
            if (analysisFilters.end) ok = ok && l.date <= analysisFilters.end;
            return ok;
        }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        // Determine the EARLIEST clockIn for each date for this employee
        const firstClockInByDate: Record<string, Date> = {};
        empLogs.forEach(l => {
            if (l.clockIn) {
                const dt = new Date(l.clockIn);
                if (!firstClockInByDate[l.date] || dt < firstClockInByDate[l.date]) {
                    firstClockInByDate[l.date] = dt;
                }
            }
        });

        const processed = inRange.map(l => {
            const isMissed = !l.clockOut && l.date < today;

            // Logical markers for professional audit: late status is based on FIRST clock-in of that date
            const firstCheckInTime = firstClockInByDate[l.date] || (l.clockIn ? new Date(l.clockIn) : null);
            const checkOutTime = l.clockOut ? new Date(l.clockOut) : null;

            // Late: check if FIRST check-in of the day was after 10:15 AM
            const isLate = firstCheckInTime
                ? (firstCheckInTime.getHours() > 10 || (firstCheckInTime.getHours() === 10 && firstCheckInTime.getMinutes() > 15))
                : false;

            // Early Departure: check-out before 5:00 PM
            const isEarlyOut = checkOutTime ? checkOutTime.getHours() < 17 : false;

            // Map score from attendance data (1, 0.75, 0.5 etc)
            const score = typeof attendanceData[l.empId]?.[l.date] === 'number' ? (attendanceData[l.empId][l.date] as number) : (l.clockIn ? 1 : 0);

            return { ...l, isMissed, isLate, isEarlyOut, score };
        });

        const validLogs = processed.filter(l => !l.isMissed);
        const totalHours = validLogs.reduce((acc, curr) => acc + (curr.durationHours || 0), 0);
        const missedCount = processed.filter(l => l.isMissed).length;
        const lateDates = new Set(processed.filter(l => l.isLate).map(l => l.date));
        const lateCount = lateDates.size;
        const workingDays = new Set(validLogs.map(l => l.date)).size;

        // Logical insights
        const avgHours = workingDays > 0 ? totalHours / workingDays : 0;
        const totalScore = validLogs.reduce((acc, curr) => acc + (curr.score || 0), 0);
        const attendanceImpact = daysInRangeCount > 0 ? (totalScore / daysInRangeCount) * 100 : 0;

        // Determination of Performance Tier
        let tier = "INSUFFICIENT DATA";
        let tierColor = "slate";
        if (workingDays > 0) {
            if (avgHours >= 8 && attendanceImpact >= 85) { tier = "ELITE PERFORMER"; tierColor = "emerald"; }
            else if (avgHours >= 7 && attendanceImpact >= 70) { tier = "CORE ASSET"; tierColor = "indigo"; }
            else if (avgHours >= 4) { tier = "REGULAR"; tierColor = "blue"; }
            else { tier = "UNDER REVIEW"; tierColor = "rose"; }
        }

        return {
            isTeamSummary: false,
            emp,
            items: processed,
            totalHours,
            missedCount,
            lateCount,
            workingDays,
            avgHours,
            attendanceImpact,
            daysInRangeCount,
            tier,
            tierColor
        };
    }, [analysisFilters, allLogs, employees, attendanceData]);

    // Use simple selection stats for the main view
    const selectionStats = useMemo(() => {
        const totalHours = filteredLogs.reduce((acc, curr) => acc + (curr.durationHours || 0), 0);
        const uniqueDays = new Set(filteredLogs.map(l => l.date)).size;
        return { totalHours, uniqueDays };
    }, [filteredLogs]);

    // 3. Deduplicate filteredLogs before grouping (robust safety net by empId + date + clockIn minute window)
    const dedupedLogs = useMemo(() => {
        const result: typeof filteredLogs = [];
        const empDateMap = new Map<string, typeof filteredLogs>();

        filteredLogs.forEach(log => {
            const key = `${log.empId}_${log.date}`;
            if (!empDateMap.has(key)) {
                empDateMap.set(key, [log]);
                result.push(log);
            } else {
                const existingList = empDateMap.get(key)!;
                const logTime = log.clockIn ? new Date(log.clockIn).getTime() : 0;

                const dupIndex = existingList.findIndex(ex => {
                    if (log.id && ex.id && log.id === ex.id) return true;
                    const exTime = ex.clockIn ? new Date(ex.clockIn).getTime() : 0;
                    if (logTime && exTime && Math.abs(logTime - exTime) < 120000) return true;
                    if (!log.clockOut && !ex.clockOut) return true;
                    return false;
                });

                if (dupIndex >= 0) {
                    const ex = existingList[dupIndex];
                    if (!ex.clockOut && log.clockOut) {
                        const targetIdx = result.indexOf(ex);
                        if (targetIdx >= 0) {
                            result[targetIdx] = { ...ex, ...log };
                        }
                    }
                } else {
                    existingList.push(log);
                    result.push(log);
                }
            }
        });
        return result;
    }, [filteredLogs]);

    // 4. Group by Date
    const logsByDate = useMemo(() => {
        const groups: Record<string, typeof dedupedLogs> = {};
        dedupedLogs.forEach(log => {
            if (!groups[log.date]) {
                groups[log.date] = [];
            }
            groups[log.date].push(log);
        });
        return groups;
    }, [dedupedLogs]);

    // 5. Sort Dates Descending
    const sortedDates = Object.keys(logsByDate).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

    // Slice based on pagination
    const paginatedDates = useMemo(() => {
        const startIndex = (currentPage - 1) * datesPerPage;
        return sortedDates.slice(startIndex, startIndex + datesPerPage);
    }, [sortedDates, currentPage, datesPerPage]);

    const totalPages = Math.max(1, Math.ceil(sortedDates.length / datesPerPage));

    const formatTime = (isoString?: string) => {
        if (!isoString) return '-';
        return format(new Date(isoString), 'h:mm a');
    };

    const calculateDailyStats = (logs: typeof filteredLogs) => {
        const total = logs.length;
        const running = logs.filter(l => !l.clockOut).length;
        const totalHours = logs.reduce((acc, curr) => acc + (curr.durationHours || 0), 0);
        return { total, running, totalHours };
    };

    const handleExport = () => {
        const headers = ['Date', 'Employee ID', 'Name', 'Department', 'Clock In', 'Clock Out', 'Duration (Hrs)'];
        // Export maintains the sorted filtered list
        const rows = filteredLogs.map(log => [
            log.date,
            log.empId,
            `"${log.empName}"`,
            log.department,
            formatTime(log.clockIn),
            formatTime(log.clockOut),
            log.durationHours ? log.durationHours.toFixed(2) : 'Running'
        ].join(','));

        const csvContent = [headers.join(','), ...rows].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `Shift_Logs_Export_${format(new Date(), 'yyyy-MM-dd')}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // --- Professional Shift Log & Manual Out Logic ---

    const openManualOutModal = (log: any) => {
        setModalLog(log);
        setIsNewShiftMode(false);
        setModalEmpId(log.empId || '');
        setModalDate(log.date || format(new Date(), 'yyyy-MM-dd'));
        setModalClockIn(log.clockIn ? format(new Date(log.clockIn), 'HH:mm') : '09:30');
        if (log.clockOut) {
            setModalClockOut(format(new Date(log.clockOut), 'HH:mm'));
        } else {
            setModalClockOut(format(new Date(), 'HH:mm'));
        }
        setModalNotes(log.notes || '');
        setModalError(null);
        setIsShiftModalOpen(true);
    };

    const openNewShiftModal = () => {
        setModalLog(null);
        setIsNewShiftMode(true);
        setModalEmpId(employees[0]?.id || '');
        setModalDate(format(new Date(), 'yyyy-MM-dd'));
        setModalClockIn('09:30');
        setModalClockOut('18:30');
        setModalNotes('');
        setModalError(null);
        setIsShiftModalOpen(true);
    };

    const applyPreset = (preset: 'now' | 'standard' | '8hours' | 'fullday') => {
        if (preset === 'now') {
            setModalClockOut(format(new Date(), 'HH:mm'));
        } else if (preset === 'standard') {
            setModalClockOut('18:30');
        } else if (preset === '8hours') {
            const [inH, inM] = modalClockIn.split(':').map(Number);
            const outH = ((inH || 9) + 8) % 24;
            setModalClockOut(`${String(outH).padStart(2, '0')}:${String(inM || 0).padStart(2, '0')}`);
        } else if (preset === 'fullday') {
            setModalClockOut('19:00');
        }
    };

    const modalShiftStats = useMemo(() => {
        if (!modalClockIn || !modalClockOut || !modalDate) return null;
        try {
            const [inH, inM] = modalClockIn.split(':').map(Number);
            const [outH, outM] = modalClockOut.split(':').map(Number);
            const [y, m, d] = modalDate.split('-').map(Number);

            const start = new Date(y, m - 1, d, inH, inM, 0);
            const end = new Date(y, m - 1, d, outH, outM, 0);

            const diffMs = end.getTime() - start.getTime();
            if (diffMs <= 0) {
                return { isValid: false, durationHours: 0, formatted: '0h 0m', error: 'Clock Out time must be after Clock In time' };
            }

            const durationHours = diffMs / 3600000;
            const hours = Math.floor(durationHours);
            const mins = Math.round((durationHours - hours) * 60);

            let val: AttendanceValue = 0;
            let valLabel = 'Incomplete / Absent (0.0)';
            let valColor = 'rose';

            if (durationHours >= 7.5) {
                val = 1;
                valLabel = 'Full Day Present (1.0)';
                valColor = 'emerald';
            } else if (durationHours >= 6) {
                val = 0.75;
                valLabel = 'Short Leave (0.75)';
                valColor = 'blue';
            } else if (durationHours >= 4) {
                val = 0.5;
                valLabel = 'Half Day (0.5)';
                valColor = 'amber';
            } else if (durationHours >= 2) {
                val = 0.25;
                valLabel = 'Quarter Day (0.25)';
                valColor = 'orange';
            }

            return {
                isValid: true,
                durationHours,
                hours,
                mins,
                formatted: `${hours}h ${mins}m (${durationHours.toFixed(2)} hrs)`,
                attendanceVal: val,
                valLabel,
                valColor,
                startIso: start.toISOString(),
                endIso: end.toISOString()
            };
        } catch {
            return null;
        }
    }, [modalClockIn, modalClockOut, modalDate]);

    const saveShiftModal = async () => {
        if (!modalShiftStats || !modalShiftStats.isValid) {
            setModalError('Please ensure Clock Out is set after Clock In.');
            return;
        }
        if (!modalEmpId) {
            setModalError('Please select a valid employee.');
            return;
        }

        const targetEmp = employees.find(e => e.id === modalEmpId) || { name: modalEmpId, id: modalEmpId };
        const startIso = modalShiftStats.startIso;
        const clockOutIso = modalShiftStats.endIso;
        const durationHours = modalShiftStats.durationHours;
        const attendanceVal = modalShiftStats.attendanceVal;

        const tId = modalLog?.id || `TL-${modalEmpId}-${modalDate}-${Date.now()}`;
        const aId = `A-${modalEmpId}-${modalDate}`;

        // 1. Identify all target alias keys for this employee
        const targetKeys = new Set<string>([modalEmpId]);
        const matchedUser = users?.find(u => u.employeeId === modalEmpId || String(u.id) === modalEmpId);
        if (matchedUser?.employeeId) targetKeys.add(matchedUser.employeeId);
        if (matchedUser?.id) targetKeys.add(String(matchedUser.id));
        const matchedEmp = employees.find(e => e.id === modalEmpId || String(e.id) === modalEmpId);
        if (matchedEmp?.id) targetKeys.add(matchedEmp.id);

        const updatedLogItem: TimeLog = {
            id: tId,
            date: modalDate,
            clockIn: startIso,
            clockOut: clockOutIso,
            durationHours: durationHours,
            notes: modalNotes || (modalLog?.clockOut ? 'Shift updated via Admin' : 'Manual shift logout')
        };

        // 2. --- INSTANT OPTIMISTIC STATE UPDATE (Zero Latency) ---
        setTimeLogs(prev => {
            const next = { ...prev };
            targetKeys.forEach(k => {
                const uLogs = { ...(next[k] || {}) };
                const dLogs = [...(uLogs[modalDate] || [])];
                
                const matchIdx = dLogs.findIndex(l => 
                    (modalLog?.id && l.id === modalLog.id) ||
                    (l.id === tId) ||
                    (l.clockIn && modalLog?.clockIn && l.clockIn === modalLog.clockIn) ||
                    (!l.clockOut && !modalLog?.clockOut)
                );

                if (matchIdx >= 0) {
                    dLogs[matchIdx] = { ...dLogs[matchIdx], ...updatedLogItem };
                } else {
                    dLogs.unshift(updatedLogItem);
                }
                uLogs[modalDate] = dLogs;
                next[k] = uLogs;
            });
            return next;
        });

        // Update attendance instantly
        setAttendanceData(prev => {
            const next = { ...prev };
            targetKeys.forEach(k => {
                next[k] = { ...(next[k] || {}), [modalDate]: attendanceVal };
            });
            return next;
        });

        // Clear active local storage timer instantly
        try {
            targetKeys.forEach(k => localStorage.removeItem(`kbt_active_log_${k}`));
        } catch (e) { /* ignore */ }

        // Close modal and show success toast immediately!
        setIsShiftModalOpen(false);
        setStatusToast({
            message: `Shift logout updated instantly for ${targetEmp.name} (${modalShiftStats.formatted})`,
            type: 'success'
        });

        // 3. --- BACKGROUND SERVER PERSISTENCE ---
        setIsSavingShift(true);
        setModalError(null);

        try {
            await Promise.all([
                api.put(`/timelogs/${encodeURIComponent(tId)}`, {
                    id: tId,
                    userId: modalEmpId,
                    date: modalDate,
                    startTime: startIso,
                    endTime: clockOutIso,
                    notes: modalNotes || (modalLog?.clockOut ? 'Shift updated via Admin' : 'Manual shift logout'),
                    durationHours
                }, { withCredentials: true }),
                api.put(`/attendance/${encodeURIComponent(aId)}`, {
                    id: aId,
                    userId: modalEmpId,
                    date: modalDate,
                    clockIn: startIso,
                    clockOut: clockOutIso,
                    value: attendanceVal
                }, { withCredentials: true })
            ]);

            invalidateCache('/timelogs');
            invalidateCache('/attendance');

            // 4. Background re-fetch to sync canonical database records across all key aliases
            const isEmployee = currentUser?.role === 'EMPLOYEE';
            const userEmpId = currentUser?.employeeId || (currentUser?.id ? String(currentUser.id) : '');
            const url = isEmployee && userEmpId ? `/timelogs?userId=${encodeURIComponent(userEmpId)}` : '/timelogs';
            
            const [tlRes, aRes] = await Promise.all([
                safeGet(url, { cacheBust: true }),
                safeGet('/attendance', { cacheBust: true })
            ]);

            const tlArr = ensureArray(extractPayload(tlRes));
            const tlMap: Record<string, Record<string, TimeLog[]>> = {};
            tlArr.forEach((t: any) => {
                if (!t || !t.userId) return;
                const dateKey = t.startTime ? t.startTime.split('T')[0] : (t.date || (t.createdAt ? t.createdAt.split('T')[0] : ''));
                if (!dateKey) return;
                const uId = String(t.userId);

                let duration = t.durationHours;
                if (!duration && t.startTime && t.endTime) {
                    const sTime = new Date(t.startTime).getTime();
                    const eTime = new Date(t.endTime).getTime();
                    if (eTime > sTime) duration = (eTime - sTime) / 3600000;
                }

                const logItem = {
                    id: t.id,
                    date: dateKey,
                    clockIn: t.startTime || t.clockIn,
                    clockOut: t.endTime || t.clockOut,
                    durationHours: duration
                };

                const aliases = new Set<string>([uId]);
                const uMatch = users?.find(u => String(u.id) === uId || u.employeeId === uId);
                if (uMatch?.employeeId) aliases.add(uMatch.employeeId);
                if (uMatch?.id) aliases.add(String(uMatch.id));
                const eMatch = employees.find(e => e.id === uId || String(e.id) === uId);
                if (eMatch?.id) aliases.add(eMatch.id);

                aliases.forEach(aliasKey => {
                    if (!tlMap[aliasKey]) tlMap[aliasKey] = {};
                    if (!tlMap[aliasKey][dateKey]) tlMap[aliasKey][dateKey] = [];
                    const exists = tlMap[aliasKey][dateKey].some(ex => (t.id && ex.id === t.id) || (ex.clockIn === t.startTime && ex.clockOut === t.endTime));
                    if (!exists) {
                        tlMap[aliasKey][dateKey].push(logItem);
                    }
                });
            });
            setTimeLogs(prev => ({ ...prev, ...tlMap }));

            const aArr = ensureArray(extractPayload(aRes));
            const ag: Record<string, AttendanceRecord> = {};
            aArr.forEach((a: any) => {
                if (!a || !a.userId || !a.date) return;
                const uId = String(a.userId);
                const val = a.value == null ? (a.clockIn ? 1 : 0) : a.value;
                const aliases = new Set<string>([uId]);
                const uMatch = users?.find(u => String(u.id) === uId || u.employeeId === uId);
                if (uMatch?.employeeId) aliases.add(uMatch.employeeId);
                if (uMatch?.id) aliases.add(String(uMatch.id));
                const eMatch = employees.find(e => e.id === uId || String(e.id) === uId);
                if (eMatch?.id) aliases.add(eMatch.id);

                aliases.forEach(aliasKey => {
                    if (!ag[aliasKey]) ag[aliasKey] = {};
                    ag[aliasKey][a.date] = val;
                });
            });
            setAttendanceData(ag);

        } catch (err: any) {
            console.error('Failed to save manual shift log:', err);
        } finally {
            setIsSavingShift(false);
        }
    };

    return (
        <>
            <div className="p-4 md:p-8 bg-slate-50/50 h-full overflow-y-auto custom-scrollbar print:hidden">
                {/* Toast Notification */}
                {statusToast && (
                    <div className="fixed top-20 right-6 z-[150] animate-in slide-in-from-top-4 duration-300">
                        <div className={`p-4 rounded-2xl shadow-xl border backdrop-blur-md flex items-center gap-3 ${
                            statusToast.type === 'success' ? 'bg-emerald-50/95 border-emerald-200 text-emerald-900' : 'bg-rose-50/95 border-rose-200 text-rose-900'
                        }`}>
                            <div className={`p-2 rounded-xl ${statusToast.type === 'success' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
                                {statusToast.type === 'success' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
                            </div>
                            <span className="text-sm font-bold">{statusToast.message}</span>
                            <button onClick={() => setStatusToast(null)} className="p-1 text-slate-400 hover:text-slate-600 ml-2">
                                <X size={14} />
                            </button>
                        </div>
                    </div>
                )}

                <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4">
                    <div>
                        <h2 className="text-2xl md:text-3xl font-extrabold text-primary flex items-center gap-3">
                            <div className="w-10 h-10 bg-blue-600 text-white rounded-xl flex items-center justify-center shadow-lg shadow-blue-600/20 shrink-0">
                                <Clock size={20} />
                            </div>
                            Shift Logs
                        </h2>
                        <p className="text-secondary mt-2 text-sm sm:text-base font-normal md:ml-14">Detailed login & logout timings grouped by date with instant manual shift management.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button
                            onClick={() => setShowAnalysis(true)}
                            className="btn btn-secondary"
                        >
                            <BarChart3 size={18} /> Analysis Report
                        </button>
                        <button
                            onClick={handleExport}
                            className="btn btn-secondary"
                        >
                            <Download size={18} /> Export
                        </button>
                    </div>
                </div>

                <div className="flex flex-wrap gap-3 mb-8">
                    <div className="relative flex-1 md:max-w-xs">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={18} />
                        <input
                            type="text"
                            placeholder="Live search by name or ID..."
                            className="pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm text-sm sm:text-base w-full font-medium"
                            value={searchTermInput}
                            onChange={(e) => setSearchTermInput(e.target.value)}
                        />
                    </div>
                </div>

                {/* Selection Summary Section */}
                {(searchTerm || focusedEmployeeId) && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-6 rounded-3xl text-white shadow-xl shadow-blue-200">
                            <div className="text-xs font-semibold opacity-85 mb-1">Total hours worked</div>
                            <div className="text-3xl sm:text-4xl font-black">{formatDecimalHours(selectionStats.totalHours)}</div>
                            <div className="text-xs mt-2 font-medium opacity-75">Based on current selection</div>
                        </div>
                        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                            <div className="text-xs font-semibold text-muted mb-1">Days worked</div>
                            <div className="text-3xl sm:text-4xl font-black text-primary">{selectionStats.uniqueDays} <span className="text-sm text-muted font-semibold">days</span></div>
                            <div className="text-xs mt-2 font-medium text-muted">Unique working dates</div>
                        </div>
                        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                            <div className="text-xs font-semibold text-muted mb-1">Daily average</div>
                            <div className="text-3xl sm:text-4xl font-black text-primary">
                                {selectionStats.uniqueDays > 0 ? (selectionStats.totalHours / selectionStats.uniqueDays).toFixed(1) : '0'}
                                <span className="text-sm text-muted font-semibold ml-1">hrs/day</span>
                            </div>
                            <div className="text-xs mt-2 font-medium text-muted">Average intensity</div>
                        </div>
                    </div>
                )}

                <div className="space-y-8 pb-20">
                    {paginatedDates.length === 0 ? (
                        <div className="p-12 text-center text-muted bg-white rounded-3xl border border-slate-100">
                            <Clock size={48} className="mx-auto mb-4 opacity-20" />
                            <p className="text-base text-secondary font-medium">No time logs found matching your search.</p>
                        </div>
                    ) : (
                        paginatedDates.map(dateKey => {
                            const dayLogs = logsByDate[dateKey];
                            const stats = calculateDailyStats(dayLogs);
                            const dateObj = new Date(dateKey + 'T00:00:00');

                            return (
                                <div key={dateKey} className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                                    {/* Date Header */}
                                    <div className="flex items-end justify-between mb-3 px-1">
                                        <div className="flex items-center gap-3">
                                            <div className="w-12 h-12 bg-white rounded-xl border border-slate-200 flex flex-col items-center justify-center shadow-sm text-primary">
                                                <span className="text-xs font-bold uppercase text-muted">{format(dateObj, 'MMM')}</span>
                                                <span className="text-xl font-black leading-none">{format(dateObj, 'd')}</span>
                                            </div>
                                            <div>
                                                <h3 className="text-lg sm:text-xl font-bold text-primary">{format(dateObj, 'EEEE, MMMM d, yyyy')}</h3>
                                                <div className="flex flex-wrap gap-3 text-xs sm:text-sm font-medium text-secondary mt-0.5">
                                                    <span className="flex items-center gap-1.5"><UserIcon size={14} /> {stats.total} Present</span>
                                                    {stats.running > 0 && <span className="flex items-center gap-1.5 text-state-success font-semibold animate-pulse"><Clock size={14} /> {stats.running} Active</span>}
                                                    <span>Total Hours: <strong className="text-primary font-bold">{formatDecimalHours(stats.totalHours)}</strong></span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Logs Table */}
                                    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                                        <table className="w-full text-left">
                                            <thead className="bg-slate-50/80 border-b border-slate-200/80 text-xs sm:text-sm font-bold text-secondary">
                                                <tr>
                                                    <th className="p-4 w-16">#</th>
                                                    <th className="p-4">Employee Details</th>
                                                    <th className="p-4 hidden sm:table-cell">Department</th>
                                                    <th className="p-4 text-center">In</th>
                                                    <th className="p-4 text-center">Out</th>
                                                    <th className="p-4 text-right">Duration</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {dayLogs.map((log, index) => {
                                                    const logUniqueKey = log.id || `${log.empId}-${log.date}-${log.clockIn}`;
                                                    return (
                                                        <tr key={logUniqueKey} className="hover:bg-slate-50/50 transition-colors group">
                                                            <td className="p-4 text-xs sm:text-sm font-mono text-muted">{index + 1}</td>
                                                            <td className="p-4">
                                                                <div className="flex items-center gap-3">
                                                                    <div
                                                                        className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-muted font-bold text-sm border border-slate-200 cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all shrink-0"
                                                                        onClick={() => log.avatar && window.open(log.avatar, '_blank')}
                                                                    >
                                                                        {log.avatar ? <img src={log.avatar} className="w-full h-full object-cover rounded-full" /> : log.empName.charAt(0)}
                                                                    </div>
                                                                    <div>
                                                                        <div className="font-bold text-primary text-sm sm:text-base leading-snug">{log.empName}</div>
                                                                        <div className="text-xs text-muted font-mono font-medium">{log.empId}</div>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td className="p-4 hidden sm:table-cell text-xs sm:text-sm font-semibold text-secondary">
                                                                <span className="bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200 text-secondary">{log.department}</span>
                                                            </td>
                                                            <td className="p-4 text-center">
                                                                <span className="font-mono text-xs sm:text-sm font-bold text-green-700 bg-green-50 px-2.5 py-1 rounded-lg border border-green-200/70 shadow-xs">{formatTime(log.clockIn)}</span>
                                                            </td>
                                                            <td className="p-4 text-center">
                                                                {log.clockOut ? (
                                                                    <div className="inline-flex items-center gap-1.5 group/out">
                                                                        <span className="font-mono text-xs sm:text-sm font-bold text-rose-700 bg-rose-50/80 px-2.5 py-1 rounded-lg border border-rose-200/70 shadow-xs">{formatTime(log.clockOut)}</span>
                                                                        {(currentUser?.role === 'ADMIN' || currentUser?.role === 'PC') && (
                                                                            <button
                                                                                onClick={() => openManualOutModal(log)}
                                                                                className="opacity-0 group-hover/out:opacity-100 p-1 text-slate-400 hover:text-blue-600 transition-opacity"
                                                                                title="Edit Shift Record"
                                                                            >
                                                                                <Clock size={14} />
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                ) : (
                                                                    <button
                                                                        onClick={() => openManualOutModal(log)}
                                                                        className="text-xs sm:text-sm font-bold text-rose-700 bg-rose-50 border border-rose-200 px-3 py-1.5 rounded-xl hover:bg-rose-100 transition-all flex items-center gap-1.5 mx-auto shadow-xs active:scale-95 group"
                                                                    >
                                                                        <LogOut size={13} className="group-hover:translate-x-0.5 transition-transform" /> Manual Out
                                                                    </button>
                                                                )}
                                                            </td>
                                                            <td className="p-4 text-right">
                                                                {log.durationHours ? (
                                                                    <span className="font-bold text-primary text-sm sm:text-base">{formatDecimalHours(log.durationHours)}</span>
                                                                ) : (
                                                                    <span className="text-xs sm:text-sm font-bold text-blue-600 bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-lg animate-pulse">Active</span>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            );
                        })
                    )}

                    {/* Premium Pagination Controls */}
                    {sortedDates.length > 0 && (
                        <div className="flex flex-col sm:flex-row gap-4 items-center justify-between mt-8 bg-white/60 p-4 rounded-3xl border border-slate-100 backdrop-blur-sm shadow-sm animate-fade-in-up">
                            <span className="text-xs sm:text-sm font-medium text-secondary">
                                Showing dates <span className="text-primary font-bold">{Math.min(sortedDates.length, (currentPage - 1) * datesPerPage + 1)}</span> to{' '}
                                <span className="text-primary font-bold">{Math.min(sortedDates.length, currentPage * datesPerPage)}</span> of{' '}
                                <span className="text-primary font-bold">{sortedDates.length}</span> working days
                            </span>

                            {totalPages > 1 && (
                                <div className="flex items-center gap-1.5">
                                    {/* Previous Page */}
                                    <button
                                        onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                                        disabled={currentPage === 1}
                                        className="btn btn-secondary btn-icon-sm"
                                        title="Previous Page"
                                    >
                                        <ChevronLeft size={16} />
                                    </button>

                                    {/* Page Info */}
                                    <span className="text-xs sm:text-sm font-bold text-secondary bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3.5 py-1.5 rounded-xl shadow-xs font-mono">
                                        {currentPage} / {totalPages}
                                    </span>

                                    {/* Next Page */}
                                    <button
                                        onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                                        disabled={currentPage === totalPages}
                                        className="btn btn-secondary btn-icon-sm"
                                        title="Next Page"
                                    >
                                        <ChevronRight size={16} />
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Professional Shift Logout & Edit Modal */}
            {isShiftModalOpen && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200">
                    <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden border border-slate-100 animate-in zoom-in-95 duration-200 flex flex-col">
                        {/* Modal Header */}
                        <div className="p-6 bg-gradient-to-r from-blue-600 to-indigo-700 text-white flex justify-between items-center shrink-0">
                            <div className="flex items-center gap-3.5">
                                <div className="w-11 h-11 bg-white/15 backdrop-blur-sm rounded-2xl flex items-center justify-center border border-white/20 shadow-inner">
                                    <Clock size={22} className="text-white" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-black tracking-tight text-white leading-tight">
                                        {isNewShiftMode ? 'Create Shift Log' : (modalLog?.clockOut ? 'Edit Shift Record' : 'Record Manual Logout')}
                                    </h3>
                                    <p className="text-xs text-blue-100/90 font-medium mt-0.5">
                                        {isNewShiftMode ? 'Add a new shift entry for staff' : 'Set shift clock-out time and synchronize attendance'}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setIsShiftModalOpen(false)}
                                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/80 hover:text-white transition-colors"
                                title="Close"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="p-6 sm:p-7 space-y-5 overflow-y-auto max-h-[75vh] custom-scrollbar">
                            {/* Employee Selector (or card if editing) */}
                            {isNewShiftMode ? (
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Staff Member</label>
                                    <select
                                        value={modalEmpId}
                                        onChange={(e) => setModalEmpId(e.target.value)}
                                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-blue-500 focus:outline-none cursor-pointer"
                                    >
                                        {employees.map(emp => (
                                            <option key={emp.id} value={emp.id}>
                                                {emp.name} ({emp.id}) — {emp.department}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            ) : (
                                <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-sm border border-blue-200">
                                            {modalLog?.avatar ? (
                                                <img src={modalLog.avatar} className="w-full h-full object-cover rounded-full" />
                                            ) : (
                                                (modalLog?.empName || modalEmpId).charAt(0).toUpperCase()
                                            )}
                                        </div>
                                        <div>
                                            <div className="font-bold text-slate-800 text-sm">{modalLog?.empName || modalEmpId}</div>
                                            <div className="text-xs text-slate-400 font-mono font-medium">{modalEmpId} · {modalLog?.department || 'General'}</div>
                                        </div>
                                    </div>
                                    <span className="text-xs font-bold px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-slate-600 font-mono">
                                        {modalDate}
                                    </span>
                                </div>
                            )}

                            {/* Date & In / Out Timing Fields */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {isNewShiftMode && (
                                    <div className="sm:col-span-2 space-y-1.5">
                                        <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Shift Date</label>
                                        <input
                                            type="date"
                                            value={modalDate}
                                            onChange={(e) => setModalDate(e.target.value)}
                                            className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                        />
                                    </div>
                                )}

                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                                        <span className="w-2 h-2 rounded-full bg-green-500"></span> Clock In Time
                                    </label>
                                    <input
                                        type="time"
                                        value={modalClockIn}
                                        onChange={(e) => setModalClockIn(e.target.value)}
                                        disabled={!isNewShiftMode && currentUser?.role !== 'ADMIN' && currentUser?.role !== 'PC'}
                                        className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                                        <span className="w-2 h-2 rounded-full bg-rose-500"></span> Clock Out Time
                                    </label>
                                    <input
                                        type="time"
                                        value={modalClockOut}
                                        onChange={(e) => setModalClockOut(e.target.value)}
                                        className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                    />
                                </div>
                            </div>

                            {/* Quick Presets */}
                            <div className="space-y-2">
                                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Quick Presets</div>
                                <div className="flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        onClick={() => applyPreset('now')}
                                        className="px-2.5 py-1.5 bg-slate-100 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 border border-slate-200 rounded-xl text-xs font-semibold transition-all text-slate-700 flex items-center gap-1"
                                    >
                                        <Timer size={12} /> Now
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => applyPreset('standard')}
                                        className="px-2.5 py-1.5 bg-slate-100 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 border border-slate-200 rounded-xl text-xs font-semibold transition-all text-slate-700"
                                    >
                                        🏁 6:30 PM (End of Shift)
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => applyPreset('8hours')}
                                        className="px-2.5 py-1.5 bg-slate-100 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 border border-slate-200 rounded-xl text-xs font-semibold transition-all text-slate-700"
                                    >
                                        💼 8.0 Hours
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => applyPreset('fullday')}
                                        className="px-2.5 py-1.5 bg-slate-100 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 border border-slate-200 rounded-xl text-xs font-semibold transition-all text-slate-700"
                                    >
                                        🏢 7:00 PM
                                    </button>
                                </div>
                            </div>

                            {/* Live Duration & Attendance Impact Box */}
                            {modalShiftStats && (
                                <div className={`p-4 rounded-2xl border transition-all ${
                                    modalShiftStats.isValid ? 'bg-gradient-to-br from-slate-50 to-blue-50/30 border-blue-100' : 'bg-rose-50 border-rose-200 text-rose-700'
                                }`}>
                                    {modalShiftStats.isValid ? (
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                            <div>
                                                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Shift Duration</div>
                                                <div className="text-xl font-black text-slate-800 flex items-center gap-2 mt-0.5">
                                                    <Sparkles size={16} className="text-blue-600" /> {modalShiftStats.formatted}
                                                </div>
                                            </div>
                                            <div className="shrink-0">
                                                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border shadow-2xs ${
                                                    modalShiftStats.attendanceVal === 1 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                                    modalShiftStats.attendanceVal === 0.75 ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                                    modalShiftStats.attendanceVal === 0.5 ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                                    modalShiftStats.attendanceVal === 0.25 ? 'bg-orange-50 text-orange-700 border-orange-200' :
                                                    'bg-rose-50 text-rose-700 border-rose-200'
                                                }`}>
                                                    <CheckCircle2 size={12} /> {modalShiftStats.valLabel}
                                                </span>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2 text-xs font-bold">
                                            <AlertTriangle size={15} /> {modalShiftStats.error}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Reason / Notes */}
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Note / Reason (Optional)</label>
                                <input
                                    type="text"
                                    placeholder="e.g. Regular shift end, forgotten punch, overtime..."
                                    value={modalNotes}
                                    onChange={(e) => setModalNotes(e.target.value)}
                                    className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                />
                            </div>

                            {/* Modal Error */}
                            {modalError && (
                                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs font-bold text-rose-700 flex items-center gap-2">
                                    <AlertTriangle size={14} className="shrink-0" />
                                    {modalError}
                                </div>
                            )}
                        </div>

                        {/* Modal Footer */}
                        <div className="p-5 bg-slate-50 border-t border-slate-100 flex justify-end items-center gap-3 shrink-0">
                            <button
                                type="button"
                                onClick={() => setIsShiftModalOpen(false)}
                                disabled={isSavingShift}
                                className="btn btn-secondary px-5 py-2.5 text-sm"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={saveShiftModal}
                                disabled={isSavingShift || (modalShiftStats && !modalShiftStats.isValid)}
                                className="btn btn-primary px-6 py-2.5 text-sm flex items-center gap-2 shadow-lg shadow-blue-500/20"
                            >
                                {isSavingShift ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                        Saving...
                                    </>
                                ) : (
                                    <>
                                        <Save size={16} /> Save Shift Log
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Professional Analysis Modal */}
            {
                showAnalysis && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300 analysis-modal-parent">
                        <style>{`
                            @media print {
                                .analysis-modal-parent {
                                    position: absolute !important;
                                    left: 0 !important;
                                    top: 0 !important;
                                    width: 100% !important;
                                    height: auto !important;
                                    min-height: 100% !important;
                                    background: white !important;
                                    z-index: 99999 !important;
                                    padding: 0 !important;
                                    margin: 0 !important;
                                    display: block !important;
                                    overflow: visible !important;
                                }
                                .analysis-modal-card {
                                    position: relative !important;
                                    width: 100% !important;
                                    max-width: 100% !important;
                                    height: auto !important;
                                    max-height: none !important;
                                    background: white !important;
                                    border: none !important;
                                    border-radius: 0 !important;
                                    box-shadow: none !important;
                                    display: block !important;
                                    overflow: visible !important;
                                    margin: 0 !important;
                                    padding: 0 !important;
                                }
                                .analysis-modal-body {
                                    overflow: visible !important;
                                    height: auto !important;
                                    max-height: none !important;
                                    background: white !important;
                                    padding: 0 !important;
                                    margin: 0 !important;
                                    display: block !important;
                                }
                                .analysis-modal-controls,
                                .analysis-modal-close-btn,
                                .analysis-modal-footer-buttons {
                                    display: none !important;
                                }
                                .bg-white.p-6.rounded-\\[2rem\\] {
                                    page-break-inside: avoid !important;
                                    break-inside: avoid !important;
                                }
                                table {
                                    page-break-inside: auto !important;
                                    break-inside: auto !important;
                                }
                                tr {
                                    page-break-inside: avoid !important;
                                    break-inside: avoid !important;
                                }
                            }
                        `}</style>
                        <div className="bg-slate-50 w-full max-w-5xl h-full max-h-[90vh] rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden border border-white/50 animate-in slide-in-from-bottom-8 duration-500 analysis-modal-card">
                            {/* Modal Header */}
                            <div className="p-6 sm:p-8 bg-white border-b border-slate-200 flex justify-between items-center shrink-0">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center shadow-inner">
                                        <BarChart3 size={24} />
                                    </div>
                                    <div>
                                         <h3 className="text-xl font-bold text-slate-800 tracking-tight">Work Analysis Report</h3>
                                         <div className="flex flex-col sm:flex-row sm:items-center gap-2 mt-1">
                                             <p className="text-xs sm:text-sm font-medium text-slate-500">Employee performance & attendance audit</p>
                                             {analysisFilters.start && analysisFilters.end && (
                                                 <span className="hidden print:inline-block text-xs font-bold text-slate-700 bg-slate-100 px-2.5 py-1 rounded">
                                                     Period: {analysisFilters.start} to {analysisFilters.end}
                                                 </span>
                                             )}
                                         </div>
                                     </div>
                                 </div>
                                 <button onClick={() => setShowAnalysis(false)} className="btn btn-ghost btn-icon analysis-modal-close-btn" title="Close">
                                     <X size={20} />
                                 </button>
                            </div>

                            {/* Analysis Controls */}
                            <div className="p-6 sm:p-8 bg-white/50 border-b border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-6 shrink-0 analysis-modal-controls">
                                <div className="space-y-2">
                                    <label className="text-xs sm:text-sm font-semibold text-slate-600">Select staff member</label>
                                    <select
                                        value={analysisFilters.empId}
                                        onChange={e => setAnalysisFilters(prev => ({ ...prev, empId: e.target.value }))}
                                        className="w-full p-4 bg-white border border-slate-200 rounded-2xl text-sm sm:text-base font-bold shadow-sm focus:ring-2 focus:ring-indigo-500/20 focus:outline-none appearance-none cursor-pointer"
                                    >
                                        <option value="">Choose Employee...</option>
                                        <option value="ALL">All Team Members (Summary)</option>
                                        {employees.map(e => <option key={e.id} value={e.id}>{e.name} ({e.id})</option>)}
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs sm:text-sm font-semibold text-slate-600">From date</label>
                                    <input
                                        type="date"
                                        value={analysisFilters.start}
                                        onChange={e => setAnalysisFilters(prev => ({ ...prev, start: e.target.value }))}
                                        className="w-full p-4 bg-white border border-slate-200 rounded-2xl text-sm sm:text-base font-bold shadow-sm focus:ring-2 focus:ring-indigo-500/20 focus:outline-none"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs sm:text-sm font-semibold text-slate-600">To date</label>
                                    <input
                                        type="date"
                                        value={analysisFilters.end}
                                        onChange={e => setAnalysisFilters(prev => ({ ...prev, end: e.target.value }))}
                                        className="w-full p-4 bg-white border border-slate-200 rounded-2xl text-sm sm:text-base font-bold shadow-sm focus:ring-2 focus:ring-indigo-500/20 focus:outline-none"
                                    />
                                </div>
                            </div>

                            {/* Report Body */}
                            <div className="flex-1 overflow-y-auto p-6 sm:p-8 custom-scrollbar bg-slate-50/30 analysis-modal-body">
                                {analysisReport ? (
                                    <div className="space-y-8">
                                        {/* Metrics Rows */}
                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
                                            <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm relative overflow-hidden group">
                                                <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50/50 rounded-full -mr-12 -mt-12 transition-transform group-hover:scale-110"></div>
                                                <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center mb-4 relative z-10">
                                                    <Clock size={20} />
                                                </div>
                                                <div className="text-xs font-semibold text-slate-500 mb-1 relative z-10">Total hours working</div>
                                                <div className="text-3xl font-black text-slate-800 relative z-10">
                                                    {formatDecimalHours(analysisReport.isTeamSummary ? (analysisReport as any).teamTotalHours : analysisReport.totalHours)}
                                                </div>
                                                <p className="text-xs font-medium text-slate-400 mt-2 relative z-10">Sum of all verified logs</p>
                                            </div>
                                            <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm relative overflow-hidden group">
                                                <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-50/50 rounded-full -mr-12 -mt-12 transition-transform group-hover:scale-110"></div>
                                                <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center mb-4 relative z-10">
                                                    <CalendarDays size={20} />
                                                </div>
                                                <div className="text-xs font-semibold text-slate-500 mb-1 relative z-10">Total days worked</div>
                                                <div className="text-3xl font-black text-slate-800 relative z-10">
                                                    {analysisReport.isTeamSummary ? (analysisReport as any).teamTotalDays : analysisReport.workingDays} <span className="text-sm text-slate-400 font-semibold">days</span>
                                                </div>
                                                <p className="text-xs font-medium text-slate-400 mt-2 relative z-10">Based on logged presence</p>
                                            </div>
                                            <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm relative overflow-hidden group">
                                                <div className="absolute top-0 right-0 w-24 h-24 bg-amber-50/50 rounded-full -mr-12 -mt-12 transition-transform group-hover:scale-110"></div>
                                                <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center mb-4 relative z-10">
                                                    <Clock size={20} />
                                                </div>
                                                <div className="text-xs font-semibold text-slate-500 mb-1 relative z-10">Late logins</div>
                                                <div className="text-3xl font-black text-slate-800 relative z-10">
                                                    {analysisReport.isTeamSummary ? (analysisReport as any).teamTotalLate : analysisReport.lateCount} <span className="text-sm text-slate-400 font-semibold">days</span>
                                                </div>
                                                <p className="text-xs font-medium text-slate-400 mt-2 relative z-10">Logins after 10:15 AM</p>
                                            </div>
                                            <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm relative overflow-hidden group">
                                                <div className={`absolute top-0 right-0 w-32 h-32 bg-${analysisReport.isTeamSummary ? 'indigo' : analysisReport.tierColor}-50/50 rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-110`}></div>
                                                <div className={`w-10 h-10 bg-${analysisReport.isTeamSummary ? 'indigo' : analysisReport.tierColor}-50 text-${analysisReport.isTeamSummary ? 'indigo' : analysisReport.tierColor}-600 rounded-xl flex items-center justify-center mb-4 relative z-10`}>
                                                    <TrendingUp size={20} />
                                                </div>
                                                <div className="text-xs font-semibold text-slate-500 mb-1 relative z-10">
                                                    {analysisReport.isTeamSummary ? 'Team strength' : 'Performance tier'}
                                                </div>
                                                <div className={`text-xl font-black text-${analysisReport.isTeamSummary ? 'indigo' : analysisReport.tierColor}-600 relative z-10 truncate`}>
                                                    {analysisReport.isTeamSummary ? `${(analysisReport as any).items.length} Members` : analysisReport.tier}
                                                </div>
                                                <p className="text-xs font-medium text-slate-500 mt-1 relative z-10">
                                                    {analysisReport.isTeamSummary ? 'Active roster' : analysisReport.emp?.name}
                                                </p>
                                            </div>
                                            <div className={`p-6 rounded-[2rem] border shadow-sm transition-all relative overflow-hidden group ${
                                                (analysisReport.isTeamSummary ? (analysisReport as any).teamTotalMissed : analysisReport.missedCount) > 0 
                                                    ? 'bg-rose-50 border-rose-100' 
                                                    : 'bg-white border-slate-100'
                                            }`}>
                                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 relative z-10 ${
                                                    (analysisReport.isTeamSummary ? (analysisReport as any).teamTotalMissed : analysisReport.missedCount) > 0 
                                                        ? 'bg-rose-100 text-rose-600' 
                                                        : 'bg-slate-50 text-slate-300'
                                                }`}>
                                                    <AlertTriangle size={20} />
                                                </div>
                                                <div className={`text-xs font-bold mb-1 relative z-10 ${
                                                    (analysisReport.isTeamSummary ? (analysisReport as any).teamTotalMissed : analysisReport.missedCount) > 0 
                                                        ? 'text-rose-500' 
                                                        : 'text-slate-500'
                                                }`}>Audit red flags</div>
                                                <div className={`text-3xl font-black relative z-10 ${
                                                    (analysisReport.isTeamSummary ? (analysisReport as any).teamTotalMissed : analysisReport.missedCount) > 0 
                                                        ? 'text-rose-600' 
                                                        : 'text-slate-300'
                                                }`}>
                                                    {analysisReport.isTeamSummary ? (analysisReport as any).teamTotalMissed : analysisReport.missedCount}
                                                </div>
                                                <p className={`text-xs font-semibold mt-2 relative z-10 ${
                                                    (analysisReport.isTeamSummary ? (analysisReport as any).teamTotalMissed : analysisReport.missedCount) > 0 
                                                        ? 'text-rose-500' 
                                                        : 'text-slate-400'
                                                }`}>
                                                    {(analysisReport.isTeamSummary ? (analysisReport as any).teamTotalMissed : analysisReport.missedCount) > 0 
                                                        ? 'Action required: Missing logouts' 
                                                        : 'Data integrity: 100% secure'}
                                                </p>
                                            </div>
                                        </div>

                                        {/* Detailed Breakdown Table */}
                                        <div className="bg-white rounded-[2rem] border border-slate-200 overflow-hidden shadow-sm">
                                            <div className="p-6 border-b border-slate-50 flex justify-between items-center">
                                                <span className="text-xs sm:text-sm font-bold text-slate-800">
                                                    {analysisReport.isTeamSummary ? 'Team Performance Summary' : 'Entry Audit Trail'}
                                                </span>
                                                <span className="text-xs font-semibold text-slate-500">
                                                    {analysisReport.isTeamSummary 
                                                        ? `${(analysisReport as any).items.length} members analyzed`
                                                        : `${analysisReport.items.length} records found`}
                                                </span>
                                            </div>
                                            <div className="overflow-x-auto">
                                                {analysisReport.isTeamSummary ? (
                                                    <table className="w-full text-left print-table">
                                                        <thead className="bg-slate-50 text-xs font-semibold text-slate-600">
                                                            <tr>
                                                                <th className="px-6 py-4">Staff Member</th>
                                                                <th className="px-6 py-4 text-center">Days Worked</th>
                                                                <th className="px-6 py-4 text-center">Total Hours</th>
                                                                <th className="px-6 py-4 text-center">Late Logins</th>
                                                                <th className="px-6 py-4 text-center">Audit Flags</th>
                                                                <th className="px-6 py-4 text-right">Performance Tier</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-slate-50">
                                                            {(analysisReport as any).items.map((it: any, idx: number) => (
                                                                <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                                                                    <td className="px-6 py-5">
                                                                        <div className="flex items-center gap-3">
                                                                            <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 text-xs font-bold font-mono">
                                                                                {it.emp?.name ? it.emp.name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase() : 'EE'}
                                                                            </div>
                                                                            <div>
                                                                                <div className="font-bold text-slate-800 text-sm sm:text-base">{it.emp?.name}</div>
                                                                                <div className="text-xs text-slate-500 font-medium">{it.emp?.id} · {it.emp?.department}</div>
                                                                            </div>
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-6 py-5 text-center font-bold text-slate-600 text-sm">
                                                                        {it.workingDays}
                                                                    </td>
                                                                    <td className="px-6 py-5 text-center font-black text-slate-800 text-sm sm:text-base">
                                                                        {formatDecimalHours(it.totalHours)}
                                                                    </td>
                                                                    <td className="px-6 py-5 text-center font-bold text-slate-600 text-sm">
                                                                        {it.lateCount > 0 ? (
                                                                            <span className="text-amber-700 bg-amber-50 px-2.5 py-1 rounded text-xs font-bold">
                                                                                {it.lateCount} days
                                                                            </span>
                                                                        ) : (
                                                                            <span className="text-slate-400">0</span>
                                                                        )}
                                                                    </td>
                                                                    <td className="px-6 py-5 text-center font-bold text-slate-600 text-sm">
                                                                        {it.missedCount > 0 ? (
                                                                            <span className="text-rose-700 bg-rose-50 px-2.5 py-1 rounded text-xs font-bold">
                                                                                {it.missedCount} flags
                                                                            </span>
                                                                        ) : (
                                                                            <span className="text-slate-400">0</span>
                                                                        )}
                                                                    </td>
                                                                    <td className="px-6 py-5 text-right font-black">
                                                                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-${it.tierColor}-50 text-${it.tierColor}-600 border border-${it.tierColor}-100`}>
                                                                            {it.tier}
                                                                        </span>
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                ) : (
                                                    <table className="w-full text-left print-table">
                                                        <thead className="bg-slate-50 text-xs font-semibold text-slate-600">
                                                            <tr>
                                                                <th className="px-6 py-4">Date</th>
                                                                <th className="px-6 py-4">Status</th>
                                                                <th className="px-6 py-4 text-center">Clock In</th>
                                                                <th className="px-6 py-4 text-center">Clock Out</th>
                                                                <th className="px-6 py-4 text-right">Hours</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-slate-50">
                                                            {analysisReport.items.map((it, idx) => (
                                                                <tr key={idx} className={`hover:bg-slate-50/50 transition-colors ${it.isMissed ? 'bg-rose-50/20' : ''}`}>
                                                                    <td className="px-6 py-5">
                                                                        <div className="font-bold text-slate-700 text-sm sm:text-base">{format(new Date(it.date), 'EEE, MMM d, yyyy')}</div>
                                                                    </td>
                                                                    <td className="px-6 py-5">
                                                                        <div className="flex flex-col gap-1.5">
                                                                            {it.isMissed ? (
                                                                                <span className="px-3 py-1 bg-rose-100 text-rose-700 rounded-lg text-xs font-semibold border border-rose-200 flex items-center gap-1.5 w-fit">
                                                                                    <AlertTriangle size={12} /> Missed logout
                                                                                </span>
                                                                            ) : (
                                                                                <span className="px-3 py-1 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-semibold border border-emerald-100 flex items-center gap-1.5 w-fit">
                                                                                    Verified entry
                                                                                </span>
                                                                            )}
                                                                            <div className="flex gap-1.5 mt-0.5">
                                                                                {it.isLate && <span className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-100 rounded text-xs font-bold uppercase">Late In</span>}
                                                                                {it.isEarlyOut && <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded text-xs font-bold uppercase">Early Exit</span>}
                                                                            </div>
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-6 py-5 text-center">
                                                                        <span className="font-mono text-xs sm:text-sm font-bold text-slate-600">{formatTime(it.clockIn)}</span>
                                                                    </td>
                                                                    <td className="px-6 py-5 text-center">
                                                                        {it.isMissed ? (
                                                                            <span className="text-rose-400 font-bold italic text-xs">Incomplete</span>
                                                                        ) : (
                                                                            <span className="font-mono text-xs sm:text-sm font-bold text-slate-600">{formatTime(it.clockOut)}</span>
                                                                        )}
                                                                    </td>
                                                                    <td className="px-6 py-5 text-right font-black text-slate-700 text-sm sm:text-base">
                                                                        {it.isMissed ? (
                                                                            <span className="text-slate-400">0.00</span>
                                                                        ) : (
                                                                            formatDecimalHours(it.durationHours)
                                                                        )}
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="h-full flex flex-col items-center justify-center text-center p-12 bg-white rounded-[3rem] border-2 border-dashed border-slate-200">
                                        <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-6">
                                            <UserIcon size={40} className="text-slate-200" />
                                        </div>
                                        <h4 className="text-lg font-black text-slate-800 mb-2">Configure Analysis Parameters</h4>
                                        <p className="text-sm sm:text-base text-slate-500 max-w-sm font-medium">Please select a team member and define a date range to generate a professional performance audit report.</p>
                                    </div>
                                )}
                            </div>

                            <div className="p-8 bg-white border-t border-slate-200 flex justify-between items-center shrink-0">
                                <div className="text-xs font-medium text-slate-500 italic flex items-center gap-2">
                                    <AlertTriangle size={14} className="text-amber-500" /> This report contains internal audit data strictly for administrative use.
                                </div>
                                <div className="flex gap-3 analysis-modal-footer-buttons">
                                    <button
                                        onClick={() => window.print()}
                                        className="btn btn-primary"
                                    >
                                        <Download size={18} /> Download / Print
                                    </button>
                                    <button onClick={() => setShowAnalysis(false)} className="btn btn-secondary">Close</button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
        </>
    );
};

export const TimeLogViewer = React.memo(TimeLogViewerComponent);
