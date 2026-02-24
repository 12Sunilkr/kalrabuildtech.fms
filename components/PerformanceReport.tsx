
import React, { useState } from 'react';
import { Employee, Task, AttendanceRecord } from '../types';
import { BarChart, Printer, UserCircle, Star, CheckCircle2, TrendingUp, ArrowLeft, Clock, XCircle, CalendarCheck, ClipboardList, AlertTriangle, Filter, X, Calendar, CheckCircle, AlertCircle, Pause, XOctagon } from 'lucide-react';
/* Fix: Removed unused imports isAfter, isBefore, parseISO to resolve module export errors */
import { format } from 'date-fns';
import { COMPANY_LOGO, LEAVE_QUOTA_YEARLY } from '../constants';

interface PerformanceReportProps {
    employees: Employee[];
    tasks: Task[];
    attendanceData: Record<string, AttendanceRecord>;
}

// Normalize a date string (ISO or with time) to YYYY-MM-DD, return empty string if invalid
const normalizeDate = (d?: string | null) => {
    if (!d) return '';
    try {
        const dt = new Date(d);
        if (isNaN(dt.getTime())) return '';
        return dt.toISOString().split('T')[0];
    } catch (e) { return ''; }
};

// Helper function to get status color and icon
const getStatusColor = (status: string) => {
    switch (status?.toUpperCase()) {
        case 'PENDING':
            return { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', icon: AlertCircle };
        case 'HOLD':
            return { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700', icon: Pause };
        case 'OVERDUE':
            return { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', icon: AlertTriangle };
        case 'TERMINATED':
            return { bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-700', icon: XOctagon };
        case 'EXTENSION_REQUESTED':
            return { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', icon: Clock };
        default: // 'COMPLETED' and others
            return { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', icon: CheckCircle };
    }
};

const getStatusBadgeColor = (status: string) => {
    switch (status?.toUpperCase()) {
        case 'PENDING':
            return 'bg-blue-100 text-blue-700';
        case 'HOLD':
            return 'bg-yellow-100 text-yellow-700';
        case 'OVERDUE':
            return 'bg-red-100 text-red-700';
        case 'TERMINATED':
            return 'bg-gray-100 text-gray-700';
        case 'EXTENSION_REQUESTED':
            return 'bg-purple-100 text-purple-700';
        default: // 'COMPLETED' and others
            return 'bg-green-100 text-green-700';
    }
};

// Helper function to get actual task status considering completion and due date
const getActualTaskStatus = (task: Task): string => {
    // If task has a completionDate, consider it COMPLETED regardless of other flags
    if (task.completionDate) return 'COMPLETED';

    // HOLD tasks should always stay as HOLD, never convert to OVERDUE
    if ((task.status || '').toUpperCase() === 'HOLD') {
        return 'HOLD';
    }

    // For PENDING and EXTENSION_REQUESTED, check if overdue
    const st = (task.status || '').toUpperCase();
    if (st === 'PENDING' || st === 'EXTENSION_REQUESTED') {
        const today = new Date().toISOString().split('T')[0];
        const due = normalizeDate(task.dueDate);
        if (due && due < today) {
            return 'OVERDUE';
        }
    }

    return task.status || 'PENDING';
};

export const PerformanceReport: React.FC<PerformanceReportProps> = ({ employees, tasks, attendanceData }) => {
    const [selectedEmpId, setSelectedEmpId] = useState<string | null>(null);
    const [printMode, setPrintMode] = useState(false);
    const [printTasksOnly, setPrintTasksOnly] = useState(false);

    // Date Filters
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');

    const getEmployeeStats = (empId: string) => {
        // Tasks may store assignee in different fields depending on source: assignedTo (employee id string), assignedToEmployeeId, or assigned_to (numeric user id)
        let empTasks = tasks.filter(t => {
            const tx: any = t as any;
            const assigneeCamel = tx.assignedTo || tx.assignedToEmployeeId || tx.assignedToName || '';
            const assigneeSnake = tx.assigned_to !== undefined && tx.assigned_to !== null ? String(tx.assigned_to) : '';
            return String(assigneeCamel) === String(empId) || String(assigneeSnake) === String(empId);
        });

        // Filter by Date Range if applied
        if (fromDate && toDate) {
            empTasks = empTasks.filter(t => {
                // Check if Due Date falls within range using normalized dates
                const due = normalizeDate(t.dueDate);
                return due && due >= fromDate && due <= toDate;
            });
        }

        const total = empTasks.length;
        const completed = empTasks.filter(t => t.completionDate || t.status === 'COMPLETED' || t.status?.toUpperCase() === 'COMPLETED').length;

        // Calculate overdue: check both status field and due date (but NOT for HOLD tasks)
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
        const overdueOpen = empTasks.filter(t => {
            if (t.completionDate) return false; // Completed tasks are not overdue
            if (t.status?.toUpperCase() === 'COMPLETED') return false;
            if ((t.status || '').toUpperCase() === 'HOLD') return false; // HOLD tasks are not overdue, they're on hold
            // Check if status is marked as OVERDUE or if due date has passed (normalize date)
            if ((t.status || '').toUpperCase() === 'OVERDUE') return true;
            const due = normalizeDate(t.dueDate);
            if (due && due < today) return true;
            return false;
        }).length;

        // Debug: if there are overdue counts, log the candidate tasks so we can trace false positives
        if (overdueOpen > 0) {
            try {
                const candidates = empTasks.filter(t => {
                    if (t.completionDate) return false;
                    if (t.status?.toUpperCase() === 'COMPLETED') return false;
                    if ((t.status || '').toUpperCase() === 'HOLD') return false;
                    if ((t.status || '').toUpperCase() === 'OVERDUE') return true;
                    const due = normalizeDate(t.dueDate);
                    return !!(due && due < today);
                }).map(t => ({ id: t.id, title: t.title, status: t.status, dueDate: normalizeDate(t.dueDate), completionDate: t.completionDate }));
                console.debug('PerformanceReport: overdue candidates for emp', empId, candidates);
            } catch (e) { /* ignore logging errors */ }
        }

        const pending = empTasks.filter(t => {
            if (t.completionDate) return false; // Completed tasks are not pending
            if (t.status?.toUpperCase() === 'COMPLETED') return false;
            if ((t.status || '').toUpperCase() === 'OVERDUE') return false;
            if ((t.status || '').toUpperCase() === 'HOLD') return false; // HOLD tasks are not pending
            const due = normalizeDate(t.dueDate);
            if (due && due < today) return false; // Don't count overdue tasks as pending
            const st = (t.status || '').toUpperCase();
            return st === 'PENDING' || st === 'EXTENSION_REQUESTED';
        }).length;

        // Scoring: only completed and overdue tasks affect score
        // - completed = +1 point
        // - overdue open task = -1 point
        // - score cannot be negative
        const rawScore = completed - overdueOpen;
        const finalScore = Math.max(0, rawScore);
        const completionRate = total > 0 ? Math.round((finalScore / total) * 100) : 0;

        return { total, completed, overdue: overdueOpen, pending, completionRate, empTasks };
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

    const handlePrint = () => {
        // allow a brief reflow so large task lists become printable
        setTimeout(() => window.print(), 150);
    };

    const handlePrintAll = () => {
        // Show printable reports for all employees, trigger print, then hide
        setPrintMode(true);
        // wait for render
        setTimeout(() => {
            window.print();
            // hide printable mode shortly after print dialog
            setTimeout(() => setPrintMode(false), 500);
        }, 300);
    };

    const handlePrintFull = () => {
        // Ensure the page is at top and DOM is stable before printing full history
        try { window.scrollTo(0, 0); } catch (e) { /* ignore */ }
        // Give more time for large DOMs to render/paint
        setTimeout(() => {
            window.print();
        }, 500);
    };

    const handlePrintTaskHistory = () => {
        // Print only the task history section
        setPrintTasksOnly(true);
        setTimeout(() => {
            window.print();
            // Reset after print dialog closes
            setTimeout(() => setPrintTasksOnly(false), 500);
        }, 150);
    };

    const clearFilters = () => {
        setFromDate('');
        setToDate('');
    };

    const selectedEmployee = employees.find(e => e.id === selectedEmpId);
    const selectedStats = selectedEmployee ? getEmployeeStats(selectedEmployee.id) : null;
    const attendanceStats = selectedEmployee ? getAttendanceStats(selectedEmployee.id) : null;

    // --- DETAIL REPORT VIEW ---
    if (selectedEmployee && selectedStats && attendanceStats) {
        return (
            <div className="p-4 md:p-8 bg-slate-50/50 h-full overflow-y-auto custom-scrollbar print:p-0 print:bg-white print:overflow-visible print:h-auto print:static">
                {/* Action Header - Hidden on Print */}
                <div className="flex justify-between items-center mb-6 print:hidden">
                    <button
                        onClick={() => setSelectedEmpId(null)}
                        className="flex items-center gap-2 text-slate-500 hover:text-slate-800 font-bold transition-colors"
                    >
                        <ArrowLeft size={20} /> Back to Team List
                    </button>
                    <div className="flex gap-2">
                        {/* Show active filter details */}
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
                        <button
                            onClick={handlePrintTaskHistory}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20 transition-all active:scale-95 font-bold"
                            title="Print only the Complete Task History"
                        >
                            <Printer size={18} />
                            Print Tasks
                        </button>
                    </div>
                </div>

                {/* Printable KPI Card */}
                <div className={`bg-white rounded-3xl shadow-xl border border-slate-200 p-6 md:p-8 max-w-5xl mx-auto print:shadow-none print:border-none print:p-0 print:w-full print:max-w-none ${printTasksOnly ? 'print:hidden' : ''}`}>

                    {/* Professional Header - Matching Screenshot */}
                    <div className="flex items-center justify-between border-b border-slate-200 pb-4 mb-6">
                        <div className="flex items-center gap-3">
                            <img
                                src={COMPANY_LOGO}
                                alt="Company Logo"
                                className="w-14 h-14 object-contain"
                            />
                            <div>
                                <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight leading-none">KALRA BUILDTECH</h1>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.15em] mt-1.5 font-sans">PERFORMANCE REPORT</p>
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Date</div>
                            <div className="text-lg font-black text-slate-800 leading-none">{format(new Date(), 'dd MMM yyyy')}</div>
                            {fromDate && toDate && (
                                <div className="mt-2 inline-block bg-slate-50 px-2 py-1 rounded text-[10px] font-bold text-slate-500 border border-slate-200">
                                    Period: {fromDate} to {toDate}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Employee Profile Section - Matching Screenshot */}
                    <div className="flex items-center justify-between gap-4 mb-6">
                        <div className="flex items-center gap-4 flex-1">
                            <div className="w-16 h-16 rounded-full bg-slate-50 border-2 border-slate-100 overflow-hidden shrink-0 flex items-center justify-center">
                                {selectedEmployee.avatar ? (
                                    <img src={selectedEmployee.avatar} className="w-full h-full object-cover" />
                                ) : (
                                    <UserCircle size={40} className="text-slate-300" />
                                )}
                            </div>
                            <div className="flex-1">
                                <h2 className="text-xl font-black text-slate-900 mb-1">{selectedEmployee.name}</h2>
                                <div className="flex flex-wrap gap-2 text-[10px] font-bold">
                                    <span className="bg-slate-50 text-slate-500 px-3 py-1 rounded-md border border-slate-100">ID: {selectedEmployee.id}</span>
                                    <span className="bg-slate-50 text-slate-500 px-3 py-1 rounded-md border border-slate-100">{selectedEmployee.designation}</span>
                                    <span className="bg-indigo-50 text-indigo-600 px-3 py-1 rounded-md border border-indigo-100">{selectedEmployee.department}</span>
                                </div>
                            </div>
                        </div>
                        <div className="bg-[#eff2ff] px-5 py-3 rounded-2xl border border-indigo-100 text-center min-w-[130px]">
                            <div className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest mb-1.5">PERFORMANCE</div>
                            <div className="text-4xl font-black text-indigo-700 leading-none">{selectedStats.completionRate}%</div>
                        </div>
                    </div>

                    {/* Attendance Overview Section - Matching Screenshot */}
                    <div className="mb-6">
                        <h3 className="text-sm font-black text-slate-800 mb-4 flex items-center gap-2 uppercase tracking-wide">
                            <CalendarCheck size={18} className="text-indigo-500" /> ATTENDANCE {fromDate ? '(SELECTED PERIOD)' : '(CURRENT YEAR)'}
                        </h3>
                        <div className="grid grid-cols-4 gap-4">
                            <div className="p-4 rounded-xl border border-green-100 bg-green-50/50 text-center">
                                <div className="text-2xl font-black text-slate-900 leading-none">{attendanceStats.present.toFixed(1)}</div>
                                <div className="text-[10px] font-bold text-green-600 uppercase mt-2">PRESENT</div>
                            </div>
                            <div className="p-4 rounded-xl border border-red-100 bg-red-50/50 text-center">
                                <div className="text-2xl font-black text-slate-900 leading-none">{attendanceStats.absent}</div>
                                <div className="text-[10px] font-bold text-red-600 uppercase mt-2">ABSENT</div>
                            </div>
                            <div className="p-4 rounded-xl border border-blue-100 bg-blue-50/50 text-center">
                                <div className="text-2xl font-black text-slate-900 leading-none">{attendanceStats.leaves.toFixed(1)}</div>
                                <div className="text-[10px] font-bold text-blue-600 uppercase mt-2">LEAVES</div>
                            </div>
                            <div className="p-4 rounded-xl border border-slate-200 bg-white text-center">
                                <div className="text-2xl font-black text-slate-900 leading-none">{(LEAVE_QUOTA_YEARLY - attendanceStats.leaves).toFixed(1)}</div>
                                <div className="text-[10px] font-bold text-slate-400 uppercase mt-2">REMAINING</div>
                            </div>
                        </div>
                    </div>

                    {/* Task Execution Section - Box layout matching Screenshot */}
                    <div className="mb-10">
                        <h3 className="text-sm font-black text-slate-800 mb-4 flex items-center gap-2 uppercase tracking-wide">
                            <ClipboardList size={18} className="text-indigo-500" /> TASK EXECUTION
                        </h3>
                        <div className="grid grid-cols-4 gap-4">
                            <div className="p-5 rounded-xl border border-slate-200 bg-white min-h-[100px] flex flex-col justify-between">
                                <div className="text-[10px] font-bold text-slate-400 uppercase">ASSIGNED</div>
                                <div className="text-4xl font-black text-slate-900 leading-none">{selectedStats.total}</div>
                            </div>
                            <div className="p-5 rounded-xl border border-green-100 bg-green-50/20 min-h-[100px] flex flex-col justify-between">
                                <div className="text-[10px] font-bold text-green-600 uppercase">COMPLETED</div>
                                <div className="text-4xl font-black text-green-700 leading-none">{selectedStats.completed}</div>
                            </div>
                            <div className="p-5 rounded-xl border border-blue-100 bg-blue-50/20 min-h-[100px] flex flex-col justify-between">
                                <div className="text-[10px] font-bold text-blue-600 uppercase">PENDING</div>
                                <div className="text-4xl font-black text-blue-700 leading-none">{selectedStats.pending}</div>
                            </div>
                            <div className="p-5 rounded-xl border border-red-100 bg-red-50/20 min-h-[100px] flex flex-col justify-between">
                                <div className="text-[10px] font-bold text-red-600 uppercase">OVERDUE</div>
                                <div className="text-4xl font-black text-red-800 leading-none">{selectedStats.overdue}</div>
                            </div>
                        </div>
                    </div>

                    {/* Complete Task History - Matching Screenshot title */}
                    <div className={printTasksOnly ? 'hidden' : ''}>
                        <h3 className="text-xl font-black text-slate-800 mb-6 mt-10">Complete Task History</h3>
                        {selectedStats.empTasks.length === 0 ? (
                            <div className="py-6 text-center text-slate-400 italic">No tasks found for this period.</div>
                        ) : (
                            // Browser automatically handles pagination - no manual slicing needed
                            <table className="print-table w-full text-left text-sm border-collapse">
                                <thead>
                                    <tr className="border-b-2 border-slate-200">
                                        <th className="py-3 px-2 text-[11px] font-black text-slate-500 uppercase tracking-wider">TASK TITLE</th>
                                        <th className="py-3 px-2 text-[11px] font-black text-slate-500 uppercase tracking-wider">ASSIGNED</th>
                                        <th className="py-3 px-2 text-[11px] font-black text-slate-500 uppercase tracking-wider">DUE DATE</th>
                                        <th className="py-3 px-2 text-[11px] font-black text-slate-500 uppercase tracking-wider">STATUS</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {selectedStats.empTasks.sort((a, b) => new Date(b.createdDate).getTime() - new Date(a.createdDate).getTime()).map(t => {
                                        const actualStatus = getActualTaskStatus(t);
                                        const statusInfo = getStatusColor(actualStatus);
                                        const StatusIcon = statusInfo.icon;
                                        return (
                                            <tr key={t.id} className="hover:bg-slate-50 print:hover:bg-transparent">
                                                <td className="py-3 px-2 font-medium text-slate-700 text-sm">{t.title}</td>
                                                <td className="py-3 px-2 text-slate-500 text-sm">{t.createdDate}</td>
                                                <td className="py-3 px-2 text-slate-500 text-sm">{t.dueDate}</td>
                                                <td className="py-3 px-2">
                                                    <div className={`flex items-center gap-2 w-fit px-3 py-1 rounded-lg font-bold text-xs uppercase ${getStatusBadgeColor(actualStatus)}`}>
                                                        <StatusIcon size={14} />
                                                        {actualStatus}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="mt-12 pt-6 border-t border-slate-200 flex justify-between items-end">
                        <div className="text-xs text-slate-400">
                            <p>Authorized Signature</p>
                            <div className="h-12 w-48 border-b border-slate-300 mt-2"></div>
                        </div>
                        <div className="text-[10px] text-slate-300 uppercase font-bold tracking-widest">
                            Generated by Kalra FMS
                        </div>
                    </div>

                </div>

                {/* Complete Task History - Outside KPI Card for independent printing */}
                <div className={`${printTasksOnly ? 'bg-white p-8 rounded-xl' : 'hidden'}`} style={printTasksOnly ? {} : { display: 'none' }}>

                    {/* Task Execution KPI Section for Print Tasks */}
                    <div className="mb-8">
                        <h3 className="text-lg font-bold text-slate-800 mb-4 border-b border-slate-100 pb-2 flex items-center gap-2">
                            <ClipboardList size={20} className="text-indigo-500" /> Task Execution
                        </h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-sm flex flex-col justify-between h-24">
                                <div className="text-xs font-bold text-slate-400 uppercase">Assigned</div>
                                <div className="text-3xl font-black text-slate-800">{selectedStats.total}</div>
                            </div>
                            <div className="p-4 rounded-xl border border-green-200 bg-green-50 shadow-sm flex flex-col justify-between h-24">
                                <div className="text-xs font-bold text-green-600 uppercase">Completed</div>
                                <div className="text-3xl font-black text-green-700">{selectedStats.completed}</div>
                            </div>
                            <div className="p-4 rounded-xl border border-blue-200 bg-blue-50 shadow-sm flex flex-col justify-between h-24">
                                <div className="text-xs font-bold text-blue-600 uppercase">Pending</div>
                                <div className="text-3xl font-black text-blue-700">{selectedStats.pending}</div>
                            </div>
                            <div className="p-4 rounded-xl border border-red-200 bg-red-50 shadow-sm flex flex-col justify-between h-24">
                                <div className="text-xs font-bold text-red-600 uppercase">Overdue</div>
                                <div className="text-3xl font-black text-red-700">{selectedStats.overdue}</div>
                            </div>
                        </div>
                    </div>

                    <h3 className="text-lg font-bold text-slate-800 mb-4 border-b border-slate-100 pb-2">Complete Task History</h3>
                    {selectedStats.empTasks.length === 0 ? (
                        <div className="py-6 text-center text-slate-400 italic">No tasks found for this period.</div>
                    ) : (
                        // Browser automatically handles pagination - render all tasks
                        <table className="print-table w-full text-left text-sm border-collapse">
                            <thead>
                                <tr className="border-b-2 border-slate-300">
                                    <th className="py-2 px-2 text-xs font-bold text-slate-600 uppercase">Task Title</th>
                                    <th className="py-2 px-2 text-xs font-bold text-slate-600 uppercase">Assigned</th>
                                    <th className="py-2 px-2 text-xs font-bold text-slate-600 uppercase">Due Date</th>
                                    <th className="py-2 px-2 text-xs font-bold text-slate-600 uppercase">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {selectedStats.empTasks.sort((a, b) => new Date(b.createdDate).getTime() - new Date(a.createdDate).getTime()).map(t => {
                                    const actualStatus = getActualTaskStatus(t);
                                    const statusInfo = getStatusColor(actualStatus);
                                    const StatusIcon = statusInfo.icon;
                                    return (
                                        <tr key={t.id} className="hover:bg-slate-50 print:hover:bg-transparent">
                                            <td className="py-3 px-2 font-medium text-slate-700 text-sm">{t.title}</td>
                                            <td className="py-3 px-2 text-slate-500 text-sm">{t.createdDate}</td>
                                            <td className="py-3 px-2 text-slate-500 text-sm">{t.dueDate}</td>
                                            <td className="py-3 px-2">
                                                <div className={`flex items-center gap-2 w-fit px-3 py-1 rounded-lg font-bold text-xs uppercase ${getStatusBadgeColor(actualStatus)}`}>
                                                    <StatusIcon size={14} />
                                                    {actualStatus}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}

                    {/* Footer for Task History Print */}
                    <div className="mt-8 pt-6 border-t border-slate-200 flex justify-between items-end">
                        <div className="text-xs text-slate-400">
                            <p>Authorized Signature</p>
                            <div className="h-12 w-48 border-b border-slate-300 mt-2"></div>
                        </div>
                        <div className="text-[10px] text-slate-300 uppercase font-bold tracking-widest">
                            Generated by Kalra FMS
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
                    {employees.map(emp => {
                        const stats = getEmployeeStats(emp.id);
                        const att = getAttendanceStats(emp.id);
                        const allTasks = stats.empTasks.sort((a, b) => new Date(b.createdDate).getTime() - new Date(a.createdDate).getTime());
                        return (
                            <div key={emp.id} className="print-container page-break-after p-8 bg-white text-slate-900 border-none shadow-none">
                                {/* Letterhead - Bulk Print */}
                                <div className="flex items-center justify-between border-b border-slate-200 pb-4 mb-6">
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
                                <div className="flex items-center justify-between gap-4 mb-6">
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
                                        <div className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest mb-1.5">PERFORMANCE</div>
                                        <div className="text-4xl font-black text-indigo-700">{stats.completionRate}%</div>
                                    </div>
                                </div>

                                {/* Stats Sections - Bulk Print */}
                                <div className="grid grid-cols-4 gap-4 mb-6">
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
                                <div className="mt-12 pt-6 border-t border-slate-200 flex justify-between items-end">
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
                    const score = stats.completionRate;

                    return (
                        <div key={emp.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 hover:shadow-xl hover:-translate-y-1 transition-all p-6 flex flex-col items-center text-center group cursor-pointer" onClick={() => setSelectedEmpId(emp.id)}>
                            <div className="w-20 h-20 rounded-full bg-slate-100 mb-4 overflow-hidden border-4 border-white shadow-md group-hover:border-purple-100 transition-colors">
                                {emp.avatar ? <img src={emp.avatar} className="w-full h-full object-cover" /> : <UserCircle size={40} className="w-full h-full p-4 text-slate-400" />}
                            </div>

                            <h3 className="font-bold text-lg text-slate-800 mb-1">{emp.name}</h3>
                            <p className="text-xs font-bold text-purple-600 bg-purple-50 px-2 py-1 rounded-md mb-4">{emp.designation || emp.department}</p>

                            <div className="w-full grid grid-cols-2 gap-2 mb-4">
                                <div className="bg-slate-50 rounded-lg p-2 border border-slate-100">
                                    <div className="text-xl font-black text-slate-800">{stats.total}</div>
                                    <div className="text-[10px] font-bold text-slate-400 uppercase">Tasks</div>
                                </div>
                                <div className="bg-slate-50 rounded-lg p-2 border border-slate-100">
                                    <div className={`text-xl font-black ${score >= 80 ? 'text-green-600' : score >= 50 ? 'text-orange-500' : 'text-red-500'}`}>{score}%</div>
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
