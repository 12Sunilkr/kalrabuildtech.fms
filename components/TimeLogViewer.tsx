
import React, { useState, useMemo } from 'react';
import { TimeLog, Employee, AttendanceRecord, AttendanceValue } from '../types';
import { Clock, Search, Download, CalendarDays, User, Save, X, LogOut, BarChart3, AlertTriangle, TrendingUp } from 'lucide-react';
import { format, differenceInMinutes } from 'date-fns';
import { formatDecimalHours } from '../utils/dateUtils';
import api, { safeGet, extractPayload, ensureArray } from '../src/utils/api';

interface TimeLogViewerProps {
    timeLogs: Record<string, Record<string, TimeLog[]>>; // empId -> date -> Array of Logs
    setTimeLogs: React.Dispatch<React.SetStateAction<Record<string, Record<string, TimeLog[]>>>>;
    employees: Employee[];
    attendanceData: Record<string, AttendanceRecord>;
    setAttendanceData: React.Dispatch<React.SetStateAction<Record<string, AttendanceRecord>>>;
}

export const TimeLogViewer: React.FC<TimeLogViewerProps> = ({
    timeLogs, setTimeLogs, employees, attendanceData, setAttendanceData
}) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [focusedEmployeeId, setFocusedEmployeeId] = useState('');
    const [showAnalysis, setShowAnalysis] = useState(false);
    const [analysisFilters, setAnalysisFilters] = useState({ empId: '', start: '', end: '' });

    // Editing State
    const [editingKey, setEditingKey] = useState<string | null>(null);
    const [manualTime, setManualTime] = useState('');

    // 1. Flatten logs into a workable array
    const allLogs = useMemo(() => {
        const logs: (TimeLog & { empName: string, empId: string, department: string, avatar?: string })[] = [];
        employees.forEach(emp => {
            const empLogsMap = timeLogs[emp.id];
            if (empLogsMap) {
                Object.values(empLogsMap).forEach(dayLogs => {
                    ensureArray(dayLogs).forEach(log => {
                        logs.push({
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
        // Sort by Time (Clock In) Descending initially to ensure within-day sort
        return logs.sort((a, b) => new Date(b.clockIn).getTime() - new Date(a.clockIn).getTime());
    }, [timeLogs, employees]);

    // 2. Filter
    const filteredLogs = allLogs.filter(log => {
        const matchesSearch = log.empName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            log.empId.toLowerCase().includes(searchTerm.toLowerCase()) ||
            log.department.toLowerCase().includes(searchTerm.toLowerCase());

        const matchesEmployee = !focusedEmployeeId || log.empId === focusedEmployeeId;

        return matchesSearch && matchesEmployee;
    });

    // 3. Analysis Logic for Professional Report
    const analysisReport = useMemo(() => {
        if (!analysisFilters.empId) return null;

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

        const today = format(new Date(), 'yyyy-MM-dd');

        const processed = inRange.map(l => {
            const isMissed = !l.clockOut && l.date < today;

            // Logical markers for professional audit
            const checkInTime = l.clockIn ? new Date(l.clockIn) : null;
            const checkOutTime = l.clockOut ? new Date(l.clockOut) : null;

            // Late: check-in after 10:00 AM (customizable threshold)
            const isLate = checkInTime ? (checkInTime.getHours() > 10 || (checkInTime.getHours() === 10 && checkInTime.getMinutes() > 0)) : false;

            // Early Departure: check-out before 5:00 PM
            const isEarlyOut = checkOutTime ? checkOutTime.getHours() < 17 : false;

            // Map score from attendance data (1, 0.75, 0.5 etc)
            const score = typeof attendanceData[l.empId]?.[l.date] === 'number' ? (attendanceData[l.empId][l.date] as number) : (l.clockIn ? 1 : 0);

            return { ...l, isMissed, isLate, isEarlyOut, score };
        });

        const validLogs = processed.filter(l => !l.isMissed);
        const totalHours = validLogs.reduce((acc, curr) => acc + (curr.durationHours || 0), 0);
        const missedCount = processed.filter(l => l.isMissed).length;
        const lateCount = processed.filter(l => l.isLate).length;
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

    // 3. Group by Date
    const logsByDate = useMemo(() => {
        const groups: Record<string, typeof filteredLogs> = {};
        filteredLogs.forEach(log => {
            if (!groups[log.date]) {
                groups[log.date] = [];
            }
            groups[log.date].push(log);
        });
        return groups;
    }, [filteredLogs]);

    // 4. Sort Dates Descending
    const sortedDates = Object.keys(logsByDate).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

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

    // --- Manual Out Logic ---

    const startEditing = (log: any) => {
        setEditingKey(`${log.empId}-${log.date}`);
        if (log.clockOut) {
            setManualTime(format(new Date(log.clockOut), 'HH:mm'));
        } else {
            // Default to current time if fixing "now", otherwise empty
            setManualTime(format(new Date(), 'HH:mm'));
        }
    };

    const cancelEditing = () => {
        setEditingKey(null);
        setManualTime('');
    };

    const saveManualOut = async (log: any) => {
        if (!manualTime || !manualTime.trim()) return;

        const start = new Date(log.clockIn);
        // Preserve seconds from clock-in time for accurate duration calculation
        const seconds = start.getSeconds().toString().padStart(2, '0');

        // Ensure manualTime is in HH:mm format from the time input
        const timeValue = manualTime.trim();

        const clockOutIso = `${log.date}T${timeValue}:${seconds}`;
        const end = new Date(clockOutIso);

        // Debug logging to identify the issue
        console.log('[Manual Out Debug]', {
            date: log.date,
            clockIn: log.clockIn,
            manualTime: timeValue,
            clockOut: clockOutIso,
            start: start.toISOString(),
            end: end.toISOString(),
            diffMs: end.getTime() - start.getTime()
        });

        // Validation: End must be after Start
        if (end <= start) {
            alert("Clock Out time must be after Clock In time.");
            return;
        }

        // Calculate duration in milliseconds, then convert to hours
        const diffMs = end.getTime() - start.getTime();
        const durationHours = Math.max(0, diffMs / (1000 * 60 * 60));

        console.log('[Manual Out Result]', { durationHours, formatted: `${Math.floor(durationHours)}h ${Math.round((durationHours - Math.floor(durationHours)) * 60)}m` });

        // Calculate Attendance Value based on Hours (Matching App.tsx logic)
        let attendanceVal: AttendanceValue = 0;

        if (durationHours >= 7.5) {
            attendanceVal = 1;
        } else if (durationHours >= 6) {
            attendanceVal = 0.75; // Short Leave
        } else if (durationHours >= 4) {
            attendanceVal = 0.5; // Half Day
        } else if (durationHours >= 2) {
            attendanceVal = 0.25; // Quarter Day
        } else {
            attendanceVal = 0; // Absent
        }

        const tId = log.id;
        const aId = `A-${log.empId}-${log.date}`;
        try {
            await api.put(`/timelogs/${encodeURIComponent(tId)}`, { endTime: clockOutIso }, { withCredentials: true });
            await api.put(`/attendance/${encodeURIComponent(aId)}`, { clockOut: clockOutIso, value: attendanceVal }, { withCredentials: true });

            // Refresh timelogs and attendance from server (Task pattern: write then re-fetch authoritative data)
            try {
                const tlRes = await safeGet('/timelogs');
                const tlPayload = extractPayload(tlRes);
                const tlArr = ensureArray(tlPayload);
                const tlMap: Record<string, Record<string, TimeLog[]>> = {};
                tlArr.forEach((t: any) => {
                    if (!t) return;
                    const dateKey = t.startTime ? t.startTime.split('T')[0] : (t.createdAt ? t.createdAt.split('T')[0] : '');
                    if (!tlMap[t.userId]) tlMap[t.userId] = {};
                    if (!tlMap[t.userId][dateKey]) tlMap[t.userId][dateKey] = [];

                    // Calculate duration if not provided by server
                    let duration = t.durationHours;
                    if (!duration && t.startTime && t.endTime) {
                        const start = new Date(t.startTime).getTime();
                        const end = new Date(t.endTime).getTime();
                        const diffMs = end - start;
                        duration = Math.max(0, diffMs / (1000 * 60 * 60));
                    }

                    tlMap[t.userId][dateKey].push({ id: t.id, date: dateKey, clockIn: t.startTime, clockOut: t.endTime, durationHours: duration } as TimeLog);
                });
                setTimeLogs(tlMap);
            } catch (e) { console.warn('Failed to refresh timelogs after manual out', e && (e.stack || e.message || e)); }

            try {
                const aRes = await safeGet('/attendance');
                const aPayload = extractPayload(aRes);
                const aArr = ensureArray(aPayload);
                const ag: Record<string, AttendanceRecord> = {};
                aArr.forEach((a: any) => {
                    if (!a) return;
                    if (!ag[a.userId]) ag[a.userId] = {};
                    ag[a.userId][a.date] = a.value == null ? (a.clockIn ? 1 : 0) : a.value;
                });
                setAttendanceData(ag);
            } catch (e) { console.warn('Failed to refresh attendance after manual out', e && (e.stack || e.message || e)); }

        } catch (err) {
            console.warn('Manual out update failed, falling back to local update', err);
            // Fallback behavior: map over the array rather than overwriting it with an object
            setTimeLogs(prev => {
                const userLogs = prev[log.empId] || {};
                const dLogs = userLogs[log.date] || [];
                const updatedLogs = dLogs.map(l => l.id === log.id ? { ...l, clockOut: clockOutIso, durationHours: durationHours } : l);
                return {
                    ...prev,
                    [log.empId]: {
                        ...userLogs,
                        [log.date]: updatedLogs
                    }
                };
            });
            setAttendanceData(prev => ({
                ...prev,
                [log.empId]: {
                    ...(prev[log.empId] || {}),
                    [log.date]: attendanceVal
                }
            }));
        }

        setEditingKey(null);
        setManualTime('');
    };

    return (
        <>
            <div className="p-4 md:p-8 bg-slate-50/50 h-full overflow-y-auto custom-scrollbar">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4">
                    <div>
                        <h2 className="text-2xl md:text-3xl font-extrabold text-slate-800 flex items-center gap-3">
                            <div className="w-10 h-10 bg-blue-600 text-white rounded-xl flex items-center justify-center shadow-lg shadow-blue-600/20 shrink-0">
                                <Clock size={20} />
                            </div>
                            Shift Logs
                        </h2>
                        <p className="text-slate-500 mt-2 font-medium md:ml-14">Detailed login & logout timings grouped by date.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button
                            onClick={() => setShowAnalysis(true)}
                            className="bg-indigo-600 text-white hover:bg-indigo-700 px-6 py-3 rounded-xl flex items-center justify-center gap-2 font-black shadow-lg shadow-indigo-600/20 active:scale-95 transition-all text-sm uppercase tracking-widest whitespace-nowrap"
                        >
                            <BarChart3 size={18} /> Analysis Report
                        </button>
                        <button
                            onClick={handleExport}
                            className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 px-5 py-3 rounded-xl flex items-center justify-center gap-2 font-black shadow-sm text-sm uppercase tracking-widest"
                        >
                            <Download size={18} /> Export
                        </button>
                    </div>
                </div>

                <div className="flex flex-wrap gap-3 mb-8">

                    <div className="relative flex-1 md:max-w-xs">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input
                            type="text"
                            placeholder="Live search by name or ID..."
                            className="pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm text-sm w-full font-bold"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                {/* Selection Summary Section */}
                {(searchTerm || focusedEmployeeId) && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-6 rounded-3xl text-white shadow-xl shadow-blue-200">
                            <div className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80 mb-1">Total Hours Worked</div>
                            <div className="text-4xl font-black">{formatDecimalHours(selectionStats.totalHours)}</div>
                            <div className="text-[10px] mt-2 font-bold opacity-60">BASED ON CURRENT SELECTION</div>
                        </div>
                        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                            <div className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Days Worked</div>
                            <div className="text-4xl font-black text-slate-800">{selectionStats.uniqueDays} <span className="text-sm text-slate-400 font-bold uppercase">Days</span></div>
                            <div className="text-[10px] mt-2 font-bold text-slate-300 tracking-widest uppercase">UNIQUE WORKING DATES</div>
                        </div>
                        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                            <div className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Daily Average</div>
                            <div className="text-4xl font-black text-slate-800">
                                {selectionStats.uniqueDays > 0 ? (selectionStats.totalHours / selectionStats.uniqueDays).toFixed(1) : '0'}
                                <span className="text-sm text-slate-400 font-bold uppercase ml-1">Hrs/D</span>
                            </div>
                            <div className="text-[10px] mt-2 font-bold text-slate-300 tracking-widest uppercase">AVG INTENSITY</div>
                        </div>
                    </div>
                )}

                <div className="space-y-8 pb-20">
                    {sortedDates.length === 0 ? (
                        <div className="p-12 text-center text-slate-400 bg-white rounded-3xl border border-slate-100">
                            <Clock size={48} className="mx-auto mb-4 opacity-20" />
                            <p>No time logs found matching your search.</p>
                        </div>
                    ) : (
                        sortedDates.map(dateKey => {
                            const dayLogs = logsByDate[dateKey];
                            const stats = calculateDailyStats(dayLogs);
                            const dateObj = new Date(dateKey);

                            return (
                                <div key={dateKey} className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                                    {/* Date Header */}
                                    <div className="flex items-end justify-between mb-3 px-1">
                                        <div className="flex items-center gap-3">
                                            <div className="w-12 h-12 bg-white rounded-xl border border-slate-200 flex flex-col items-center justify-center shadow-sm text-slate-700">
                                                <span className="text-xs font-bold uppercase text-slate-400">{format(dateObj, 'MMM')}</span>
                                                <span className="text-xl font-black leading-none">{format(dateObj, 'd')}</span>
                                            </div>
                                            <div>
                                                <h3 className="text-lg font-bold text-slate-800">{format(dateObj, 'EEEE, yyyy')}</h3>
                                                <div className="flex gap-3 text-xs font-medium text-slate-500">
                                                    <span className="flex items-center gap-1"><User size={12} /> {stats.total} Present</span>
                                                    {stats.running > 0 && <span className="flex items-center gap-1 text-green-600 animate-pulse"><Clock size={12} /> {stats.running} Active</span>}
                                                    <span>Total Hours: {formatDecimalHours(stats.totalHours)}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Logs Table */}
                                    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                                        <table className="w-full text-left">
                                            <thead className="bg-slate-50/50 border-b border-slate-100 text-xs font-bold uppercase text-slate-400">
                                                <tr>
                                                    <th className="p-4 w-16">#</th>
                                                    <th className="p-4">Employee Details</th>
                                                    <th className="p-4 hidden sm:table-cell">Department</th>
                                                    <th className="p-4 text-center">In</th>
                                                    <th className="p-4 text-center">Out</th>
                                                    <th className="p-4 text-right">Duration</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-50">
                                                {dayLogs.map((log, index) => {
                                                    const isEditing = editingKey === `${log.empId}-${log.date}`;
                                                    return (
                                                        <tr key={`${log.empId}-${log.clockIn}`} className="hover:bg-slate-50/50 transition-colors group">
                                                            <td className="p-4 text-xs font-mono text-slate-400">{index + 1}</td>
                                                            <td className="p-4">
                                                                <div className="flex items-center gap-3">
                                                                    <div
                                                                        className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 font-bold text-xs border border-slate-200 cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all"
                                                                        onClick={() => log.avatar && window.open(log.avatar, '_blank')}
                                                                    >
                                                                        {log.avatar ? <img src={log.avatar} className="w-full h-full object-cover rounded-full" /> : log.empName.charAt(0)}
                                                                    </div>
                                                                    <div>
                                                                        <div className="font-bold text-slate-700 text-sm">{log.empName}</div>
                                                                        <div className="text-[10px] text-slate-400 font-mono">{log.empId}</div>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td className="p-4 hidden sm:table-cell text-xs font-bold text-slate-500">
                                                                <span className="bg-slate-50 px-2 py-1 rounded border border-slate-100">{log.department}</span>
                                                            </td>
                                                            <td className="p-4 text-center">
                                                                <span className="font-mono text-xs font-bold text-green-700 bg-green-50 px-2 py-1 rounded border border-green-100">{formatTime(log.clockIn)}</span>
                                                            </td>
                                                            <td className="p-4 text-center">
                                                                {isEditing ? (
                                                                    <div className="flex items-center justify-center gap-1">
                                                                        <input
                                                                            type="time"
                                                                            className="border border-slate-300 rounded px-1 py-0.5 text-xs font-bold w-24 focus:outline-none focus:border-blue-500"
                                                                            value={manualTime}
                                                                            onChange={(e) => setManualTime(e.target.value)}
                                                                        />
                                                                        <button onClick={() => saveManualOut(log)} className="p-1 bg-green-100 text-green-700 rounded hover:bg-green-200"><Save size={14} /></button>
                                                                        <button onClick={cancelEditing} className="p-1 bg-red-100 text-red-700 rounded hover:bg-red-200"><X size={14} /></button>
                                                                    </div>
                                                                ) : (
                                                                    log.clockOut ? (
                                                                        <div className="inline-block px-1">
                                                                            <span className="font-mono text-xs font-bold text-red-700 bg-red-50 px-2 py-1 rounded border border-red-100">{formatTime(log.clockOut)}</span>
                                                                        </div>
                                                                    ) : (
                                                                        <button
                                                                            onClick={() => startEditing(log)}
                                                                            className="text-xs font-bold text-red-500 bg-red-50 border border-red-200 px-3 py-1 rounded-full animate-pulse hover:bg-red-100 transition-colors flex items-center gap-1 mx-auto"
                                                                        >
                                                                            <LogOut size={12} /> Manual Out
                                                                        </button>
                                                                    )
                                                                )}
                                                            </td>
                                                            <td className="p-4 text-right">
                                                                {log.durationHours ? (
                                                                    <span className="font-bold text-slate-700 text-sm">{formatDecimalHours(log.durationHours)}</span>
                                                                ) : (
                                                                    <span className="text-xs font-bold text-blue-500 bg-blue-50 px-2 py-1 rounded">Active</span>
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
                </div>
            </div>

            {/* Professional Analysis Modal */}
            {
                showAnalysis && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
                        <div className="bg-slate-50 w-full max-w-5xl h-full max-h-[90vh] rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden border border-white/50 animate-in slide-in-from-bottom-8 duration-500">
                            {/* Modal Header */}
                            <div className="p-6 sm:p-8 bg-white border-b border-slate-200 flex justify-between items-center shrink-0">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center shadow-inner">
                                        <BarChart3 size={24} />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Work Analysis Report</h3>
                                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Employee Performance & Attendance Audit</p>
                                    </div>
                                </div>
                                <button onClick={() => setShowAnalysis(false)} className="w-10 h-10 rounded-xl hover:bg-slate-100 flex items-center justify-center text-slate-400 transition-colors">
                                    <X size={20} />
                                </button>
                            </div>

                            {/* Analysis Controls */}
                            <div className="p-6 sm:p-8 bg-white/50 border-b border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-6 shrink-0">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Select Staff Member</label>
                                    <select
                                        value={analysisFilters.empId}
                                        onChange={e => setAnalysisFilters(prev => ({ ...prev, empId: e.target.value }))}
                                        className="w-full p-4 bg-white border border-slate-200 rounded-2xl text-sm font-bold shadow-sm focus:ring-2 focus:ring-indigo-500/20 focus:outline-none appearance-none cursor-pointer"
                                    >
                                        <option value="">Choose Employee...</option>
                                        {employees.map(e => <option key={e.id} value={e.id}>{e.name} ({e.id})</option>)}
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">From Date</label>
                                    <input
                                        type="date"
                                        value={analysisFilters.start}
                                        onChange={e => setAnalysisFilters(prev => ({ ...prev, start: e.target.value }))}
                                        className="w-full p-4 bg-white border border-slate-200 rounded-2xl text-sm font-bold shadow-sm focus:ring-2 focus:ring-indigo-500/20 focus:outline-none"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">To Date</label>
                                    <input
                                        type="date"
                                        value={analysisFilters.end}
                                        onChange={e => setAnalysisFilters(prev => ({ ...prev, end: e.target.value }))}
                                        className="w-full p-4 bg-white border border-slate-200 rounded-2xl text-sm font-bold shadow-sm focus:ring-2 focus:ring-indigo-500/20 focus:outline-none"
                                    />
                                </div>
                            </div>

                            {/* Report Body */}
                            <div className="flex-1 overflow-y-auto p-6 sm:p-8 custom-scrollbar bg-slate-50/30">
                                {analysisReport ? (
                                    <div className="space-y-8">
                                        {/* Metrics Rows */}
                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
                                            <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm relative overflow-hidden group">
                                                <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50/50 rounded-full -mr-12 -mt-12 transition-transform group-hover:scale-110"></div>
                                                <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center mb-4 relative z-10">
                                                    <Clock size={20} />
                                                </div>
                                                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 relative z-10">Total Hours Working</div>
                                                <div className="text-3xl font-black text-slate-800 relative z-10">{formatDecimalHours(analysisReport.totalHours)}</div>
                                                <p className="text-[9px] font-bold text-slate-300 mt-2 relative z-10">SUM OF ALL VERIFIED LOGS</p>
                                            </div>
                                            <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm relative overflow-hidden group">
                                                <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-50/50 rounded-full -mr-12 -mt-12 transition-transform group-hover:scale-110"></div>
                                                <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center mb-4 relative z-10">
                                                    <CalendarDays size={20} />
                                                </div>
                                                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 relative z-10">Total Days Worked</div>
                                                <div className="text-3xl font-black text-slate-800 relative z-10">{analysisReport.workingDays} <span className="text-sm text-slate-300 font-bold uppercase">Days</span></div>
                                                <p className="text-[9px] font-bold text-slate-300 mt-2 relative z-10">BASED ON LOGGED PRESENCE</p>
                                            </div>
                                            <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm relative overflow-hidden group">
                                                <div className="absolute top-0 right-0 w-24 h-24 bg-amber-50/50 rounded-full -mr-12 -mt-12 transition-transform group-hover:scale-110"></div>
                                                <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center mb-4 relative z-10">
                                                    <Clock size={20} />
                                                </div>
                                                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 relative z-10">Late Logins</div>
                                                <div className="text-3xl font-black text-slate-800 relative z-10">{analysisReport.lateCount} <span className="text-sm text-slate-300 font-bold uppercase">Days</span></div>
                                                <p className="text-[9px] font-bold text-slate-300 mt-2 relative z-10">LOGINS AFTER 10:00 AM</p>
                                            </div>
                                            <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm relative overflow-hidden group">
                                                <div className={`absolute top-0 right-0 w-32 h-32 bg-${analysisReport.tierColor}-50/50 rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-110`}></div>
                                                <div className={`w-10 h-10 bg-${analysisReport.tierColor}-50 text-${analysisReport.tierColor}-600 rounded-xl flex items-center justify-center mb-4 relative z-10`}>
                                                    <TrendingUp size={20} />
                                                </div>
                                                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 relative z-10">Performance Tier</div>
                                                <div className={`text-xl font-black text-${analysisReport.tierColor}-600 relative z-10 truncate`}>{analysisReport.tier}</div>
                                                <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase tracking-tighter relative z-10">{analysisReport.emp?.name}</p>
                                            </div>
                                            <div className={`p-6 rounded-[2rem] border shadow-sm transition-all relative overflow-hidden group ${analysisReport.missedCount > 0 ? 'bg-rose-50 border-rose-100' : 'bg-white border-slate-100'}`}>
                                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 relative z-10 ${analysisReport.missedCount > 0 ? 'bg-rose-100 text-rose-600' : 'bg-slate-50 text-slate-300'}`}>
                                                    <AlertTriangle size={20} />
                                                </div>
                                                <div className={`text-[10px] font-black uppercase tracking-widest mb-1 relative z-10 ${analysisReport.missedCount > 0 ? 'text-rose-400' : 'text-slate-400'}`}>Audit Red Flags</div>
                                                <div className={`text-3xl font-black relative z-10 ${analysisReport.missedCount > 0 ? 'text-rose-600' : 'text-slate-200'}`}>{analysisReport.missedCount}</div>
                                                <p className={`text-[9px] font-bold mt-2 relative z-10 ${analysisReport.missedCount > 0 ? 'text-rose-400' : 'text-slate-300'}`}>
                                                    {analysisReport.missedCount > 0 ? 'ACTION REQUIRED: MISSING LOGOUTS' : 'DATA INTEGRITY: 100% SECURE'}
                                                </p>
                                            </div>
                                        </div>

                                        {/* Detailed Breakdown Table */}
                                        <div className="bg-white rounded-[2rem] border border-slate-200 overflow-hidden shadow-sm">
                                            <div className="p-6 border-b border-slate-50 flex justify-between items-center">
                                                <span className="text-xs font-black text-slate-800 uppercase tracking-widest">Entry Audit Trail</span>
                                                <span className="text-[10px] font-bold text-slate-400 uppercase">{analysisReport.items.length} records found</span>
                                            </div>
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-left">
                                                    <thead className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-[0.1em]">
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
                                                                    <div className="font-bold text-slate-700 text-sm">{format(new Date(it.date), 'EEE, MMM d, yyyy')}</div>
                                                                </td>
                                                                <td className="px-6 py-5">
                                                                    <div className="flex flex-col gap-1.5">
                                                                        {it.isMissed ? (
                                                                            <span className="px-3 py-1 bg-rose-100 text-rose-600 rounded-lg text-[9px] font-black uppercase tracking-widest border border-rose-200 flex items-center gap-1 w-fit">
                                                                                <AlertTriangle size={10} /> Missed Logout
                                                                            </span>
                                                                        ) : (
                                                                            <span className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-lg text-[9px] font-black uppercase tracking-widest border border-emerald-100 flex items-center gap-1 w-fit">
                                                                                Verified Entry
                                                                            </span>
                                                                        )}
                                                                        <div className="flex gap-1">
                                                                            {it.isLate && <span className="px-1.5 py-0.5 bg-amber-50 text-amber-600 border border-amber-100 rounded text-[8px] font-bold uppercase">Late In</span>}
                                                                            {it.isEarlyOut && <span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-600 border border-indigo-100 rounded text-[8px] font-bold uppercase">Early Exit</span>}
                                                                        </div>
                                                                    </div>
                                                                </td>
                                                                <td className="px-6 py-5 text-center">
                                                                    <span className="font-mono text-xs font-bold text-slate-500">{formatTime(it.clockIn)}</span>
                                                                </td>
                                                                <td className="px-6 py-5 text-center">
                                                                    {it.isMissed ? (
                                                                        <span className="text-rose-300 font-black italic text-[10px]">INCOMPLETE</span>
                                                                    ) : (
                                                                        <span className="font-mono text-xs font-bold text-slate-500">{formatTime(it.clockOut)}</span>
                                                                    )}
                                                                </td>
                                                                <td className="px-6 py-5 text-right font-black text-slate-700">
                                                                    {it.isMissed ? (
                                                                        <span className="text-slate-300">0.00</span>
                                                                    ) : (
                                                                        formatDecimalHours(it.durationHours)
                                                                    )}
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="h-full flex flex-col items-center justify-center text-center p-12 bg-white rounded-[3rem] border-2 border-dashed border-slate-200">
                                        <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-6">
                                            <User size={40} className="text-slate-200" />
                                        </div>
                                        <h4 className="text-lg font-black text-slate-800 mb-2">Configure Analysis Parameters</h4>
                                        <p className="text-sm text-slate-400 max-w-sm font-medium">Please select a team member and define a date range to generate a professional performance audit report.</p>
                                    </div>
                                )}
                            </div>

                            <div className="p-8 bg-white border-t border-slate-200 flex justify-between items-center shrink-0">
                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest italic flex items-center gap-2">
                                    <AlertTriangle size={14} className="text-amber-500" /> This report contains internal audit data strictly for administrative use.
                                </div>
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => window.print()}
                                        className="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black text-sm uppercase tracking-widest transition-all active:scale-95 shadow-lg shadow-indigo-200 flex items-center gap-2"
                                    >
                                        <Download size={18} /> Download / Print
                                    </button>
                                    <button onClick={() => setShowAnalysis(false)} className="px-8 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl font-black text-sm uppercase tracking-widest transition-all active:scale-95">Close</button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
        </>
    );
};
