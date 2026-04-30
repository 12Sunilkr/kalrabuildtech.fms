
import React, { useState } from 'react';
import { Employee, Task, AttendanceRecord, ChecklistInstance, ChecklistTemplate, TimeLog } from '../types';
import { BarChart, Printer, UserCircle, CalendarCheck, ClipboardList, AlertTriangle, Filter, X, Calendar, CheckCircle, AlertCircle, Pause, XOctagon, ListChecks, Clock, ArrowLeft, TrendingUp } from 'lucide-react';
import { format, isPast } from 'date-fns';
import { COMPANY_LOGO } from '../constants';

interface PerformanceReportProps {
    employees: Employee[];
    tasks: Task[];
    attendanceData: Record<string, AttendanceRecord>;
    checklistInstances?: ChecklistInstance[];
    checklistTemplates?: ChecklistTemplate[];
    timeLogs?: Record<string, Record<string, TimeLog[]>>;
}

// ── Exact mirror of TaskManager's getDisplayStatus ──────────────────────────
// Both helpers must stay in sync so KPI numbers match the Task Manager tabs.

const isSameDay = (d1: Date, d2: Date) =>
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate();

/**
 * Returns the display status for a task — identical logic to TaskManager.getDisplayStatus.
 * PENDING tasks whose due-date is strictly in the past (not today) become OVERDUE.
 */
const getDisplayStatus = (task: Task): string => {
    if (task.completionDate) return 'COMPLETED';

    const dueDateObj = task.dueDate ? new Date(task.dueDate) : null;
    const isValidDate = dueDateObj && !isNaN(dueDateObj.getTime());

    if (
        (task.status || '').toUpperCase() === 'PENDING' &&
        isValidDate &&
        isPast(dueDateObj!) &&
        !isSameDay(new Date(), dueDateObj!)
    ) {
        return 'OVERDUE';
    }

    return task.status || 'PENDING';
};

// Alias kept for the bulk-print task table (uses same logic)
const getActualTaskStatus = getDisplayStatus;

const getStatusColor = (status: string) => {
    switch (status?.toUpperCase()) {
        case 'PENDING':          return { bg: 'bg-blue-50',   border: 'border-blue-200',   text: 'text-blue-700',   icon: AlertCircle };
        case 'HOLD':             return { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700', icon: Pause };
        case 'OVERDUE':          return { bg: 'bg-red-50',    border: 'border-red-200',    text: 'text-red-700',    icon: AlertTriangle };
        case 'TERMINATED':       return { bg: 'bg-gray-50',   border: 'border-gray-200',   text: 'text-gray-700',   icon: XOctagon };
        case 'EXTENSION_REQUESTED': return { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', icon: Clock };
        default:                 return { bg: 'bg-green-50',  border: 'border-green-200',  text: 'text-green-700',  icon: CheckCircle };
    }
};

const getStatusBadgeColor = (status: string) => {
    switch (status?.toUpperCase()) {
        case 'PENDING':          return 'bg-blue-100 text-blue-700';
        case 'HOLD':             return 'bg-yellow-100 text-yellow-700';
        case 'OVERDUE':          return 'bg-red-100 text-red-700';
        case 'TERMINATED':       return 'bg-gray-100 text-gray-700';
        case 'EXTENSION_REQUESTED': return 'bg-purple-100 text-purple-700';
        default:                 return 'bg-green-100 text-green-700';
    }
};

export const PerformanceReport: React.FC<PerformanceReportProps> = ({ employees, tasks, attendanceData, checklistInstances = [], checklistTemplates = [], timeLogs = {} }) => {
    const [selectedEmpId, setSelectedEmpId] = useState<string | null>(null);
    const [printMode, setPrintMode] = useState(false);

    // Date Filters
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');

    const getEmployeeStats = (empId: string) => {
        // Collect tasks assigned to this employee (handle camelCase and snake_case field names)
        let empTasks = tasks.filter(t => {
            const tx: any = t as any;
            const assigneeCamel = String(tx.assignedTo || tx.assignedToEmployeeId || tx.assignedToName || '');
            const assigneeSnake = tx.assigned_to != null ? String(tx.assigned_to) : '';
            return assigneeCamel === String(empId) || assigneeSnake === String(empId);
        });

        // Optional date-range filter — for completed/overdue tasks match against completionDate,
        // for all others match against dueDate. This ensures a date search for e.g. "April"
        // returns tasks actually completed in April, not just tasks that were due in April.
        if (fromDate && toDate) {
            empTasks = empTasks.filter(t => {
                const ds = getDisplayStatus(t);
                const isFinished = ds === 'COMPLETED' || ds === 'OVERDUE' || ds === 'TERMINATED';
                const normalizeDate = (dStr?: string | null) => {
                    if (!dStr) return '';
                    try { const d = new Date(dStr); return isNaN(d.getTime()) ? '' : d.toISOString().split('T')[0]; } catch { return ''; }
                };
                const due = normalizeDate(t.dueDate);
                const completion = isFinished ? normalizeDate(t.completionDate) : '';
                // Match if dueDate OR completionDate falls in range
                return (due && due >= fromDate && due <= toDate) ||
                       (completion && completion >= fromDate && completion <= toDate);
            });
        }

        // ── Use the SAME getDisplayStatus as Task Manager for every task ──
        // This is the single source of truth — all counts derive from here.
        const withStatus = empTasks.map(t => ({ task: t, ds: getDisplayStatus(t) }));

        // Assigned = everything except TERMINATED (mirrors Task Manager "All" tab minus Terminate)
        const assignedTasks = withStatus.filter(({ ds }) => ds !== 'TERMINATED');
        const total = assignedTasks.length;

        // Done
        const completed = assignedTasks.filter(({ ds }) => ds === 'COMPLETED').length;

        // Overdue — exact same predicate as Task Manager OVERDUE tab
        const overdue = assignedTasks.filter(({ ds }) => ds === 'OVERDUE').length;

        // Pending — exact same predicate as Task Manager PENDING tab
        const pending = assignedTasks.filter(({ ds }) => ds === 'PENDING').length;

        // Objections — exact same predicate as Task Manager OBJECTIONS tab
        const objections = assignedTasks.filter(({ task, ds }) => {
            const t = task as any;
            return Boolean(
                t.extensionRequest &&
                t.extensionRequest.status === 'PENDING' &&
                task.status === 'EXTENSION_REQUESTED' &&
                ds !== 'TERMINATED' && ds !== 'COMPLETED' && ds !== 'OVERDUE' && ds !== 'PENDING'
            );
        }).length;

        // Task Score % — incomplete / total (same formula used before)
        const incompleteTasks = total - completed;
        const completionRate = total > 0 ? Math.round((incompleteTasks / total) * 100) : 0;

        return { total, completed, overdue, pending, objections, completionRate, empTasks };
    };

    const getAttendanceStats = (empId: string) => {
        const record = attendanceData[empId] || {};
        let present = 0;
        let absent = 0;
        let leaves = 0;
        const currentYear = new Date().getFullYear().toString();

        Object.entries(record).forEach(([dateKey, val]) => {
            let includeRecord = false;

            if (fromDate && toDate) {
                // Filter by selected range
                if (dateKey >= fromDate && dateKey <= toDate) {
                    includeRecord = true;
                }
            } else {
                // Default: Filter by current year
                if (dateKey.startsWith(currentYear)) {
                    includeRecord = true;
                }
            }

            if (includeRecord) {
                if (val === 1) present++;
                else if (val === 0) absent++;
                else if (typeof val === 'number') {
                    // partial days count towards leaves
                    leaves += (1 - val);
                    // Also counts as partially present
                    present += val;
                }
            }
        });

        return { present, absent, leaves };
    };

    const getChecklistStats = (empId: string) => {
        // Resolve the set of template IDs where this employee is doer or buddy
        const myTemplateIds = new Set(
            checklistTemplates
                .filter(t => String(t.doerId || '').trim() === String(empId).trim() ||
                    String(t.buddyId || '').trim() === String(empId).trim())
                .map(t => t.id)
        );

        // Get only instances belonging to those templates
        const empInstances = checklistInstances.filter(inst => myTemplateIds.has(inst.templateId));

        const today = new Date().toISOString().split('T')[0];
        
        // Filter by date range. If no explicit filter, default to current year.
        // crucially: only include tasks UP TO TODAY so future schedule does not break the KPI score.
        let filtered = (fromDate && toDate)
            ? empInstances.filter(i => i.date >= fromDate && i.date <= toDate)
            : empInstances.filter(i => i.date.startsWith(new Date().getFullYear().toString()));
            
        // Cap to today
        filtered = filtered.filter(i => i.date <= today);

        const total = filtered.length;
        const completed = filtered.filter(i => i.status === 'COMPLETED').length;
        const pending = filtered.filter(i => i.status === 'PENDING' && i.date === today).length;
        const overdue = filtered.filter(i => i.status === 'PENDING' && i.date < today).length;
        // Logic: 0% = all done, 100% = nothing done
        const pct = total > 0 ? Math.round(((total - completed) / total) * 100) : 0;
        return { total, completed, pending, overdue, pct, instances: filtered.sort((a, b) => b.date.localeCompare(a.date)) };
    };

    const getWorkAnalysis = (empId: string) => {
        const defaultStats = { totalHours: 0, workingDays: 0, lateCount: 0, missedCount: 0, tier: "INSUFFICIENT DATA", tierColor: "slate" };
        if (!timeLogs || !timeLogs[empId]) return defaultStats;

        const empLogsDict = timeLogs[empId];
        let inRange: TimeLog[] = [];

        Object.keys(empLogsDict).forEach(dateStr => {
            if (fromDate && dateStr < fromDate) return;
            if (toDate && dateStr > toDate) return;
            if (!fromDate && !toDate && !dateStr.startsWith(new Date().getFullYear().toString())) return;
            inRange.push(...empLogsDict[dateStr]);
        });

        inRange.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const today = new Date().toISOString().split('T')[0];

        let daysInRangeCount = 0;
        if (fromDate && toDate) {
            const startD = new Date(fromDate);
            const endD = new Date(toDate);
            daysInRangeCount = Math.max(0, Math.ceil((endD.getTime() - startD.getTime()) / (1000 * 60 * 60 * 24)) + 1);
        }

        const processed = inRange.map(l => {
            const isMissed = !l.clockOut && l.date < today;
            const checkInTime = l.clockIn ? new Date(l.clockIn) : null;
            const isLate = checkInTime ? (checkInTime.getHours() > 10 || (checkInTime.getHours() === 10 && checkInTime.getMinutes() > 0)) : false;
            const score = typeof attendanceData[empId]?.[l.date] === 'number' ? (attendanceData[empId][l.date] as number) : (l.clockIn ? 1 : 0);
            return { ...l, isMissed, isLate, score };
        });

        const validLogs = processed.filter(l => !l.isMissed);
        const totalHours = validLogs.reduce((acc, curr) => acc + (curr.durationHours || 0), 0);
        const missedCount = processed.filter(l => l.isMissed).length;
        const lateCount = processed.filter(l => l.isLate).length;
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

        if (totalHours === 0 && workingDays === 0) return defaultStats;

        return {
            totalHours,
            workingDays,
            lateCount,
            missedCount,
            tier,
            tierColor
        };
    };

    const formatDecimalHours = (hours: number) => {
        const h = Math.floor(hours);
        const m = Math.round((hours - h) * 60);
        return `${h}h ${m}m`;
    };

    // Format large numbers neatly
    const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);

    const handlePrint = () => {
        setTimeout(() => window.print(), 150);
    };

    const handlePrintAll = () => {
        setPrintMode(true);
        setTimeout(() => {
            window.print();
            setTimeout(() => setPrintMode(false), 500);
        }, 300);
    };

    const clearFilters = () => {
        setFromDate('');
        setToDate('');
    };

    const selectedEmployee = employees.find(e => e.id === selectedEmpId);
    const selectedStats = selectedEmployee ? getEmployeeStats(selectedEmployee.id) : null;
    const attendanceStats = selectedEmployee ? getAttendanceStats(selectedEmployee.id) : null;
    const checklistStats = selectedEmployee ? getChecklistStats(selectedEmployee.id) : null;

    let combinedScore = 0;
    if (selectedStats && checklistStats) {
        const totalCombined = selectedStats.total + checklistStats.total;
        const pendingCombined = selectedStats.pending + (checklistStats.total - checklistStats.completed);
        combinedScore = totalCombined > 0 ? Math.round((pendingCombined / totalCombined) * 100) : 0;
    }

    // --- DETAIL REPORT VIEW ---
    if (selectedEmployee && selectedStats && attendanceStats && checklistStats) {
        return (
            <div className="p-4 md:p-8 bg-slate-50/50 h-full overflow-y-auto custom-scrollbar print:p-0 print:bg-white print:overflow-visible print:h-auto print:static">
                <style>{`
                    @media print {
                        @page {
                            size: A4 portrait;
                            margin: 10mm;
                        }
                    }
                `}</style>
                {/* Action Header - Hidden on Print */}
                <div className="flex justify-between items-center mb-6 print:hidden">
                    <button
                        onClick={() => setSelectedEmpId(null)}
                        className="flex items-center gap-2 text-slate-500 hover:text-slate-800 font-bold transition-colors"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></svg> Back to Team List
                    </button>
                    <div className="flex gap-2">
                        {fromDate && toDate && (
                            <div className="bg-blue-50 text-blue-700 px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 border border-blue-100">
                                <Calendar size={14} /> {fromDate} to {toDate}
                            </div>
                        )}
                        <button
                            onClick={handlePrint}
                            className="bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-slate-900/20 transition-all active:scale-95 font-bold"
                        >
                            <Printer size={18} />
                            Print Report
                        </button>
                    </div>
                </div>

                {/* ═══ PRINTABLE KPI REPORT ═══ */}
                <div className="bg-white rounded-3xl shadow-xl border border-slate-200 p-8 max-w-4xl mx-auto print:shadow-none print:border-none print:rounded-none print:p-0 print:m-0 print:max-w-none print:w-full">

                    {/* ── REPORT HEADER ── */}
                    <div className="flex items-center justify-between border-b-2 border-slate-800 pb-4 mb-5 print:pb-2.5 print:mb-3">
                        <div className="flex items-center gap-3">
                            <img src={COMPANY_LOGO} alt="Company Logo" className="w-12 h-12 object-contain print:w-9 print:h-9" />
                            <div>
                                <h1 className="text-[22px] font-black text-slate-900 uppercase tracking-tight leading-none print:text-lg">KALRA BUILDTECH</h1>
                                <p className="text-[9px] font-extrabold text-slate-400 uppercase tracking-[0.2em] mt-1 print:text-[7px]">KPI PERFORMANCE REPORT</p>
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest print:text-[7px]">Report Date</div>
                            <div className="text-xl font-black text-slate-800 print:text-base">{format(new Date(), 'dd MMM yyyy')}</div>
                            {fromDate && toDate && (
                                <div className="mt-1 text-[9px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded print:text-[7px]">
                                    Period: {fromDate} → {toDate}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ── EMPLOYEE PROFILE ── */}
                    <div className="flex items-center gap-4 mb-5 p-4 bg-slate-50 rounded-2xl border border-slate-100 print:mb-3 print:p-3 print:rounded-xl">
                        <div className="w-14 h-14 rounded-full bg-white border-2 border-slate-200 overflow-hidden shrink-0 flex items-center justify-center print:w-11 print:h-11">
                            {selectedEmployee.avatar
                                ? <img src={selectedEmployee.avatar} className="w-full h-full object-cover" />
                                : <UserCircle size={36} className="text-slate-300" />}
                        </div>
                        <div className="flex-1 min-w-0">
                            <h2 className="text-xl font-black text-slate-900 leading-tight print:text-base">{selectedEmployee.name}</h2>
                            <div className="flex flex-wrap gap-1.5 mt-1.5 print:mt-1">
                                <span className="text-[10px] font-bold text-slate-500 bg-white px-2.5 py-0.5 rounded border border-slate-200 print:text-[8px]">ID: {selectedEmployee.id}</span>
                                <span className="text-[10px] font-bold text-slate-500 bg-white px-2.5 py-0.5 rounded border border-slate-200 print:text-[8px]">{selectedEmployee.designation}</span>
                                <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded border border-indigo-100 print:text-[8px]">{selectedEmployee.department}</span>
                            </div>
                        </div>
                        <div className="shrink-0 bg-indigo-600 px-5 py-3 rounded-xl text-center print:px-4 print:py-2.5 print:rounded-lg">
                            <div className="text-[9px] font-extrabold text-indigo-200 uppercase tracking-widest print:text-[7px]">TASK SCORE</div>
                            <div className="text-4xl font-black text-white leading-none print:text-3xl">{combinedScore}%</div>
                        </div>
                    </div>

                    {/* ── TIME ANALYSIS ── */}
                    <div className="mb-4 print:mb-3">
                        <div className="flex items-center gap-2 mb-2.5 print:mb-2">
                            <div className="w-1 h-4 bg-blue-500 rounded-full"></div>
                            <h3 className="text-[11px] font-black text-slate-700 uppercase tracking-[0.12em] print:text-[9px]">Time Analysis</h3>
                        </div>
                        {(() => {
                            const analysis = getWorkAnalysis(selectedEmployee.id);
                            return (
                                <div className="grid grid-cols-5 gap-3 print:gap-2">
                                    <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 print:p-2">
                                        <div className="flex items-center gap-1.5 mb-2 print:mb-1">
                                            <div className="w-5 h-5 bg-blue-500 rounded-md flex items-center justify-center"><Clock size={11} className="text-white" /></div>
                                            <span className="text-[8px] font-black text-blue-600 uppercase tracking-wide print:text-[7px]">Total Hours</span>
                                        </div>
                                        <div className="text-xl font-black text-blue-800 leading-none print:text-base">{formatDecimalHours(analysis.totalHours)}</div>
                                    </div>
                                    <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 print:p-2">
                                        <div className="flex items-center gap-1.5 mb-2 print:mb-1">
                                            <div className="w-5 h-5 bg-emerald-500 rounded-md flex items-center justify-center"><CalendarCheck size={11} className="text-white" /></div>
                                            <span className="text-[8px] font-black text-emerald-600 uppercase tracking-wide print:text-[7px]">Days Worked</span>
                                        </div>
                                        <div className="text-xl font-black text-emerald-800 leading-none print:text-base">{analysis.workingDays}<span className="text-[9px] font-bold text-emerald-500 ml-1">d</span></div>
                                    </div>
                                    <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 print:p-2">
                                        <div className="flex items-center gap-1.5 mb-2 print:mb-1">
                                            <div className="w-5 h-5 bg-amber-500 rounded-md flex items-center justify-center"><Clock size={11} className="text-white" /></div>
                                            <span className="text-[8px] font-black text-amber-600 uppercase tracking-wide print:text-[7px]">Late Logins</span>
                                        </div>
                                        <div className="text-xl font-black text-amber-800 leading-none print:text-base">{analysis.lateCount}<span className="text-[9px] font-bold text-amber-500 ml-1">d</span></div>
                                    </div>
                                    <div className={`bg-${analysis.tierColor}-50 border border-${analysis.tierColor}-100 rounded-xl p-3 print:p-2`}>
                                        <div className="flex items-center gap-1.5 mb-2 print:mb-1">
                                            <div className={`w-5 h-5 bg-${analysis.tierColor}-500 rounded-md flex items-center justify-center`}><TrendingUp size={11} className="text-white" /></div>
                                            <span className={`text-[8px] font-black text-${analysis.tierColor}-600 uppercase tracking-wide print:text-[7px]`}>Perf. Tier</span>
                                        </div>
                                        <div className={`text-sm font-black text-${analysis.tierColor}-800 leading-tight print:text-xs`}>{analysis.tier}</div>
                                    </div>
                                    <div className={`rounded-xl p-3 print:p-2 border ${analysis.missedCount > 0 ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-100'}`}>
                                        <div className="flex items-center gap-1.5 mb-2 print:mb-1">
                                            <div className={`w-5 h-5 rounded-md flex items-center justify-center ${analysis.missedCount > 0 ? 'bg-rose-500' : 'bg-slate-300'}`}><AlertTriangle size={11} className="text-white" /></div>
                                            <span className={`text-[8px] font-black uppercase tracking-wide print:text-[7px] ${analysis.missedCount > 0 ? 'text-rose-600' : 'text-slate-400'}`}>Audit Flags</span>
                                        </div>
                                        <div className={`text-xl font-black leading-none print:text-base ${analysis.missedCount > 0 ? 'text-rose-700' : 'text-slate-300'}`}>{analysis.missedCount}</div>
                                        {analysis.missedCount > 0 && <div className="text-[7px] font-bold text-rose-400 uppercase mt-0.5">Missing logouts</div>}
                                    </div>
                                </div>
                            );
                        })()}
                    </div>

                    {/* ── ATTENDANCE ── */}
                    <div className="mb-4 print:mb-3">
                        <div className="flex items-center gap-2 mb-2.5 print:mb-2">
                            <div className="w-1 h-4 bg-indigo-500 rounded-full"></div>
                            <h3 className="text-[11px] font-black text-slate-700 uppercase tracking-[0.12em] print:text-[9px]">
                                Attendance
                                <span className="ml-1 font-bold text-slate-400 normal-case tracking-normal">{fromDate ? '(period)' : '(year)'}</span>
                            </h3>
                        </div>
                        <div className="grid grid-cols-2 gap-2 print:gap-1.5">
                            {[
                                { label: 'Present', value: attendanceStats.present.toFixed(1), bg: 'bg-emerald-50', border: 'border-emerald-100', num: 'text-emerald-700', lbl: 'text-emerald-500' },
                                { label: 'Absent', value: String(attendanceStats.absent), bg: 'bg-red-50', border: 'border-red-100', num: 'text-red-700', lbl: 'text-red-500' },
                            ].map(({ label, value, bg, border, num, lbl }) => (
                                <div key={label} className={`${bg} border ${border} rounded-xl p-3 print:p-2 print:rounded-lg text-center`}>
                                    <div className={`text-2xl font-black ${num} leading-none print:text-lg`}>{value}</div>
                                    <div className={`text-[8px] font-extrabold ${lbl} uppercase mt-1.5 print:mt-1 tracking-wider print:text-[7px]`}>{label}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* ── TASK EXECUTION ── */}
                    <div className="mb-4 print:mb-3">
                        <div className="flex items-center gap-2 mb-2.5 print:mb-2">
                            <div className="w-1 h-4 bg-violet-500 rounded-full"></div>
                            <h3 className="text-[11px] font-black text-slate-700 uppercase tracking-[0.12em] print:text-[9px]">Task Execution</h3>
                        </div>
                        <div className="grid grid-cols-5 gap-2 print:gap-1.5">
                            {[
                                { label: 'Assigned', value: String(selectedStats.total), bg: 'bg-slate-50', border: 'border-slate-200', num: 'text-slate-800', lbl: 'text-slate-400' },
                                { label: 'Done', value: String(selectedStats.completed), bg: 'bg-green-50', border: 'border-green-100', num: 'text-green-700', lbl: 'text-green-500' },
                                { label: 'Pending', value: String(selectedStats.pending), bg: 'bg-blue-50', border: 'border-blue-100', num: 'text-blue-700', lbl: 'text-blue-500' },
                                { label: 'Overdue', value: String(selectedStats.overdue), bg: selectedStats.overdue > 0 ? 'bg-red-50' : 'bg-slate-50', border: selectedStats.overdue > 0 ? 'border-red-100' : 'border-slate-200', num: selectedStats.overdue > 0 ? 'text-red-700' : 'text-slate-300', lbl: selectedStats.overdue > 0 ? 'text-red-500' : 'text-slate-300' },
                                { label: 'Objections', value: String(selectedStats.objections), bg: selectedStats.objections > 0 ? 'bg-purple-50' : 'bg-slate-50', border: selectedStats.objections > 0 ? 'border-purple-100' : 'border-slate-200', num: selectedStats.objections > 0 ? 'text-purple-700' : 'text-slate-300', lbl: selectedStats.objections > 0 ? 'text-purple-500' : 'text-slate-300' },
                            ].map(({ label, value, bg, border, num, lbl }) => (
                                <div key={label} className={`${bg} border ${border} rounded-xl p-3 print:p-2 print:rounded-lg text-center`}>
                                    <div className={`text-2xl font-black ${num} leading-none print:text-lg`}>{value}</div>
                                    <div className={`text-[8px] font-extrabold ${lbl} uppercase mt-1.5 print:mt-1 tracking-wider print:text-[7px]`}>{label}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* ── ROUTINE CHECKLIST ── */}
                    <div className="mb-4 print:mb-3">
                        <div className="flex items-center gap-2 mb-2.5 print:mb-2">
                            <div className="w-1 h-4 bg-teal-500 rounded-full"></div>
                            <h3 className="text-[11px] font-black text-slate-700 uppercase tracking-[0.12em] print:text-[9px]">Routine Checklist</h3>
                            <span className="ml-auto text-[8px] font-bold text-slate-400 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-full print:text-[7px]">
                                {fromDate && toDate ? `${fromDate} – ${toDate}` : `Jan – Dec ${new Date().getFullYear()}`}
                            </span>
                        </div>
                        <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 print:p-2.5 print:rounded-lg">
                            <div className="grid grid-cols-4 gap-2 print:gap-1.5 mb-3 print:mb-2">
                                {[
                                    { label: 'Total', value: checklistStats.total, bg: 'bg-slate-100', border: 'border-slate-200', num: 'text-slate-800', lbl: 'text-slate-500' },
                                    { label: 'Completed', value: checklistStats.completed, bg: 'bg-emerald-50', border: 'border-emerald-100', num: 'text-emerald-700', lbl: 'text-emerald-500' },
                                    { label: 'Pending', value: checklistStats.pending, bg: 'bg-blue-50', border: 'border-blue-100', num: 'text-blue-700', lbl: 'text-blue-500' },
                                    { label: 'Overdue', value: checklistStats.overdue, bg: checklistStats.overdue > 0 ? 'bg-red-50' : 'bg-slate-50', border: checklistStats.overdue > 0 ? 'border-red-100' : 'border-slate-200', num: checklistStats.overdue > 0 ? 'text-red-700' : 'text-slate-300', lbl: checklistStats.overdue > 0 ? 'text-red-500' : 'text-slate-300' },
                                ].map(({ label, value, bg, border, num, lbl }) => (
                                    <div key={label} className={`${bg} border ${border} rounded-lg p-2 print:p-1.5 text-center`}>
                                        <div className={`text-lg font-black leading-none ${num} print:text-sm`}>{fmt(value)}</div>
                                        <div className={`text-[8px] font-bold ${lbl} uppercase mt-1 tracking-wider print:text-[7px]`}>{label}</div>
                                    </div>
                                ))}
                            </div>
                            <div>
                                <div className="flex justify-between items-center mb-1 print:mb-0.5">
                                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider print:text-[7px]">Pending Workload</span>
                                    <span className={`text-xs font-black print:text-[10px] ${checklistStats.pct <= 20 ? 'text-emerald-600' : checklistStats.pct <= 60 ? 'text-amber-600' : 'text-red-500'}`}>{checklistStats.pct}%</span>
                                </div>
                                <div className="h-2 bg-slate-200 rounded-full overflow-hidden print:h-1.5">
                                    <div
                                        className={`h-full rounded-full transition-all ${checklistStats.pct <= 20 ? 'bg-emerald-500' : checklistStats.pct <= 60 ? 'bg-amber-400' : 'bg-red-400'}`}
                                        style={{ width: `${Math.max(checklistStats.pct, checklistStats.pct > 0 ? 2 : 0)}%` }}
                                    />
                                </div>
                                <div className="flex justify-between mt-1 text-[8px] text-slate-400 font-semibold print:text-[7px]">
                                    <span>{fmt(checklistStats.completed)} done</span>
                                    <span>{fmt(checklistStats.total - checklistStats.completed)} remaining</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ── FOOTER ── */}
                    <div className="pt-4 mt-3 border-t border-slate-200 flex justify-between items-end print:pt-3 print:mt-2">
                        <div>
                            <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-3 print:text-[7px] print:mb-2">Authorized Signature</div>
                            <div className="h-8 w-44 border-b border-slate-300 print:h-6 print:w-32"></div>
                        </div>
                        <div className="text-right">
                            <div className="text-[9px] text-slate-300 uppercase font-bold tracking-widest print:text-[7px]">Generated by Kalra FMS</div>
                            <div className="text-[8px] text-slate-300 font-medium mt-0.5 print:text-[6px]">{format(new Date(), 'dd/MM/yyyy HH:mm')}</div>
                        </div>
                    </div>

                </div>

            </div>
        );
    }

    // --- MAIN LIST VIEW ---
    return (
        <div className="p-4 md:p-8 bg-slate-50/50 h-full overflow-y-auto custom-scrollbar">
            <div className="mb-8">
                <h2 className="text-2xl md:text-3xl font-extrabold text-slate-800 flex items-center gap-3">
                    <div className="w-10 h-10 bg-purple-600 text-white rounded-xl flex items-center justify-center shadow-lg shadow-purple-600/20 shrink-0">
                        <BarChart size={20} />
                    </div>
                    KPI & Performance Reports
                </h2>
                <p className="text-slate-500 mt-2 font-medium md:ml-14">
                    Select a team member to view and print their detailed performance card.
                </p>

            </div>

            {/* Printable all reports view (temporarily shown during print) */}
            {printMode && (
                <div className="hidden print:block" aria-hidden={!printMode}>
                    <style>{`
                        @media print {
                            @page {
                                size: A4 portrait;
                                margin: 10mm;
                            }
                        }
                    `}</style>
                    {employees.map(emp => {
                        const stats = getEmployeeStats(emp.id);
                        const att = getAttendanceStats(emp.id);
                        const checkStats = getChecklistStats(emp.id);
                        const allTasks = stats.empTasks.sort((a, b) => new Date(b.createdDate).getTime() - new Date(a.createdDate).getTime());
                        
                        const totalCombined = stats.total + checkStats.total;
                        const pendingCombined = stats.pending + (checkStats.total - checkStats.completed);
                        const bulkCombinedScore = totalCombined > 0 ? Math.round((pendingCombined / totalCombined) * 100) : 0;

                        return (
                            <div key={emp.id} className="print-container page-break-after p-8 bg-white text-slate-900 border-none shadow-none">
                                {/* Letterhead - Bulk Print */}
                                <div className="flex items-center justify-between border-b border-slate-200 pb-4 mb-6 print:mb-4">
                                    <div className="flex items-center gap-3">
                                        <img src={COMPANY_LOGO} alt="Logo" className="w-14 h-14 object-contain" />
                                        <div>
                                            <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight leading-none">KALRA BUILDTECH</h1>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.15em] mt-1.5">PERFORMANCE REPORT</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">DATE</div>
                                        <div className="text-lg font-black text-slate-800 leading-none">{format(new Date(), 'dd MMM yyyy')}</div>
                                    </div>
                                </div>

                                {/* Employee Profile - Bulk Print */}
                                <div className="flex items-center justify-between gap-4 mb-6 print:mb-4">
                                    <div className="flex items-center gap-4 flex-1">
                                        <div className="w-16 h-16 rounded-full bg-slate-50 border-2 border-slate-100 overflow-hidden shrink-0 flex items-center justify-center">
                                            {emp.avatar ? <img src={emp.avatar} className="w-full h-full object-cover" /> : <UserCircle size={40} className="text-slate-300" />}
                                        </div>
                                        <div className="flex-1">
                                            <h2 className="text-xl font-black text-slate-900 mb-1">{emp.name}</h2>
                                            <div className="flex flex-wrap gap-2 text-[10px] font-bold text-slate-500">
                                                <span className="bg-slate-50 px-3 py-1 rounded-md border border-slate-100 uppercase">ID: {emp.id}</span>
                                                <span className="bg-slate-50 px-3 py-1 rounded-md border border-slate-100 uppercase">{emp.designation || emp.department}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="bg-[#eff2ff] px-5 py-3 rounded-2xl border border-indigo-100 text-center min-w-[130px]">
                                        <div className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest mb-1.5">TASK SCORE</div>
                                        <div className="text-4xl font-black text-indigo-700 leading-none">{bulkCombinedScore}%</div>
                                    </div>
                                </div>

                                {/* Stats Sections - Bulk Print */}
                                <div className="grid grid-cols-4 gap-4 print:gap-2 mb-6 print:mb-4">
                                    <div className="p-4 rounded-xl border border-green-100 bg-green-50/50 text-center">
                                        <div className="text-2xl font-black text-slate-900 leading-none">{att.present.toFixed(1)}</div>
                                        <div className="text-[10px] font-bold text-green-600 uppercase mt-2 font-sans">PRESENT</div>
                                    </div>
                                    <div className="p-4 rounded-xl border border-red-100 bg-red-50/50 text-center">
                                        <div className="text-2xl font-black text-slate-900 leading-none">{att.absent}</div>
                                        <div className="text-[10px] font-bold text-red-600 uppercase mt-2 font-sans">ABSENT</div>
                                    </div>
                                    <div className="p-5 rounded-xl border border-slate-200 bg-white min-h-[90px] flex flex-col justify-between">
                                        <div className="text-[10px] font-bold text-slate-400 uppercase">ASSIGNED</div>
                                        <div className="text-3xl font-black text-slate-900 leading-none">{stats.total}</div>
                                    </div>
                                    <div className="p-5 rounded-xl border border-green-100 bg-green-50/20 min-h-[90px] flex flex-col justify-between">
                                        <div className="text-[10px] font-bold text-green-600 uppercase font-sans">COMPLETED</div>
                                        <div className="text-3xl font-black text-green-700 leading-none">{stats.completed}</div>
                                    </div>
                                </div>

                                {/* Time Analysis Section - Bulk Print */}
                                {(() => {
                                    const analysis = getWorkAnalysis(emp.id);
                                    return (
                                        <div className="grid grid-cols-5 gap-3 print:gap-2 mb-6 print:mb-4">
                                            <div className="p-4 rounded-2xl border border-slate-200 bg-white shadow-sm flex flex-col justify-between">
                                                <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Total Hours</div>
                                                <div className="text-xl font-black text-slate-800">{formatDecimalHours(analysis.totalHours)}</div>
                                            </div>
                                            <div className="p-4 rounded-2xl border border-slate-200 bg-white shadow-sm flex flex-col justify-between">
                                                <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Days Worked</div>
                                                <div className="text-xl font-black text-slate-800">{analysis.workingDays} <span className="text-[10px] font-bold uppercase text-slate-400">Days</span></div>
                                            </div>
                                            <div className="p-4 rounded-2xl border border-slate-200 bg-white shadow-sm flex flex-col justify-between">
                                                <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Late Logins</div>
                                                <div className="text-xl font-black text-slate-800">{analysis.lateCount} <span className="text-[10px] font-bold uppercase text-slate-400">Days</span></div>
                                            </div>
                                            <div className={`p-4 rounded-2xl border border-${analysis.tierColor}-200 bg-${analysis.tierColor}-50 shadow-sm flex flex-col justify-between`}>
                                                <div className={`text-[9px] font-black text-${analysis.tierColor}-400 uppercase tracking-widest mb-2`}>Performance</div>
                                                <div className={`text-sm font-black text-${analysis.tierColor}-700 truncate`}>{analysis.tier}</div>
                                            </div>
                                            <div className={`p-4 rounded-2xl border shadow-sm flex flex-col justify-between ${analysis.missedCount > 0 ? 'bg-rose-50 border-rose-200' : 'bg-white border-slate-200'}`}>
                                                <div className={`text-[9px] font-black uppercase tracking-widest mb-2 ${analysis.missedCount > 0 ? 'text-rose-400' : 'text-slate-400'}`}>Audits</div>
                                                <div className={`text-xl font-black ${analysis.missedCount > 0 ? 'text-rose-600' : 'text-slate-300'}`}>{analysis.missedCount}</div>
                                            </div>
                                        </div>
                                    );
                                })()}

                                {/* Table - Bulk Print */}
                                <h3 className="text-lg font-black text-slate-800 mb-4 mt-8 uppercase tracking-tight">Complete Task History</h3>
                                <table className="print-table w-full text-left text-sm border-collapse">
                                    <thead>
                                        <tr className="border-b-2 border-slate-200">
                                            <th className="py-3 px-2 text-[11px] font-black text-slate-500 uppercase tracking-wider">TASK TITLE</th>
                                            <th className="py-3 px-2 text-[11px] font-black text-slate-500 uppercase tracking-wider">ASSIGNED</th>
                                            <th className="py-3 px-2 text-[11px] font-black text-slate-500 uppercase tracking-wider">STATUS</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {allTasks.map(t => {
                                            const actualStatus = getActualTaskStatus(t);
                                            return (
                                                <tr key={t.id}>
                                                    <td className="py-2.5 px-2 font-medium text-slate-700 text-xs">{t.title}</td>
                                                    <td className="py-2.5 px-2 text-slate-500 text-xs">{t.createdDate}</td>
                                                    <td className="py-2.5 px-2">
                                                        <span className={`text-[10px] font-bold uppercase tracking-tight px-2 py-0.5 rounded ${getStatusBadgeColor(actualStatus)}`}>
                                                            {actualStatus}
                                                        </span>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>

                                {/* Footer - Bulk Print */}
                                <div className="mt-12 print:mt-6 pt-6 print:pt-4 border-t border-slate-200 flex justify-between items-end">
                                    <div className="text-xs text-slate-400">
                                        <p className="font-bold">Authorized Signature</p>
                                        <div className="h-12 w-48 border-b border-slate-300 mt-2"></div>
                                    </div>
                                    <div className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">
                                        GENERATED BY KALRA FMS
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Date Filter Bar */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 mb-8 flex flex-col md:flex-row gap-4 items-center">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
                    <Filter size={18} className="text-slate-400" />
                    <span>Report Period:</span>
                </div>
                <div className="flex flex-1 gap-2 w-full md:w-auto">
                    <div className="relative flex-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 uppercase">From</span>
                        <input
                            type="date"
                            value={fromDate}
                            onChange={(e) => setFromDate(e.target.value)}
                            className="w-full pl-12 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                    </div>
                    <div className="relative flex-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 uppercase">To</span>
                        <input
                            type="date"
                            value={toDate}
                            onChange={(e) => setToDate(e.target.value)}
                            className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                    </div>
                </div>
                <button
                    onClick={clearFilters}
                    className="px-4 py-2 text-slate-500 font-bold text-xs hover:bg-slate-50 rounded-xl transition-colors flex items-center gap-1"
                    disabled={!fromDate && !toDate}
                >
                    <X size={14} /> Clear / All
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {employees.map(emp => {
                    const stats = getEmployeeStats(emp.id);
                    const checkStats = getChecklistStats(emp.id);
                    
                    const totalCombined = stats.total + checkStats.total;
                    const pendingCombined = stats.pending + (checkStats.total - checkStats.completed);
                    const score = totalCombined > 0 ? Math.round((pendingCombined / totalCombined) * 100) : 0;

                    return (
                        <div key={emp.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 hover:shadow-xl hover:-translate-y-1 transition-all p-6 flex flex-col items-center text-center group cursor-pointer" onClick={() => setSelectedEmpId(emp.id)}>
                            <div className="w-20 h-20 rounded-full bg-slate-100 mb-4 overflow-hidden border-4 border-white shadow-md group-hover:border-purple-100 transition-colors">
                                {emp.avatar ? <img src={emp.avatar} className="w-full h-full object-cover" /> : <UserCircle size={40} className="w-full h-full p-4 text-slate-400" />}
                            </div>

                            <h3 className="font-bold text-lg text-slate-800 mb-1">{emp.name}</h3>
                            <p className="text-xs font-bold text-purple-600 bg-purple-50 px-2 py-1 rounded-md mb-4">{emp.designation || emp.department}</p>

                            <div className="w-full grid grid-cols-2 gap-2 mb-4">
                                <div className="bg-slate-50 rounded-lg p-2 border border-slate-100">
                                    <div className="text-xl font-black text-slate-800">{totalCombined}</div>
                                    <div className="text-[10px] font-bold text-slate-400 uppercase">Tasks</div>
                                </div>
                                <div className="bg-slate-50 rounded-lg p-2 border border-slate-100">
                                    <div className={`text-xl font-black ${score <= 20 ? 'text-green-600' : score <= 50 ? 'text-orange-500' : 'text-red-500'}`}>{score}%</div>
                                    <div className="text-[10px] font-bold text-slate-400 uppercase">Score</div>
                                </div>
                            </div>

                            <button className="w-full py-2 bg-slate-900 text-white rounded-lg font-bold text-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                View Report <ArrowLeft size={12} className="rotate-180" />
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
