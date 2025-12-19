
import React, { useState } from 'react';
import { Employee, Task, AttendanceRecord } from '../types';
import { BarChart, Printer, UserCircle, Star, CheckCircle2, TrendingUp, ArrowLeft, Clock, XCircle, CalendarCheck, ClipboardList, AlertTriangle, Filter, X, Calendar } from 'lucide-react';
/* Fix: Removed unused imports isAfter, isBefore, parseISO to resolve module export errors */
import { format } from 'date-fns';
import { COMPANY_LOGO, LEAVE_QUOTA_YEARLY } from '../constants';

interface PerformanceReportProps {
  employees: Employee[];
  tasks: Task[];
  attendanceData: Record<string, AttendanceRecord>;
}

export const PerformanceReport: React.FC<PerformanceReportProps> = ({ employees, tasks, attendanceData }) => {
  const [selectedEmpId, setSelectedEmpId] = useState<string | null>(null);
  
  // Date Filters
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const getEmployeeStats = (empId: string) => {
    let empTasks = tasks.filter(t => t.assignedTo === empId);

    // Filter by Date Range if applied
    if (fromDate && toDate) {
        empTasks = empTasks.filter(t => {
            // Check if Due Date falls within range
            return t.dueDate >= fromDate && t.dueDate <= toDate;
        });
    }

    const total = empTasks.length;
    const completed = empTasks.filter(t => t.status === 'COMPLETED').length;
    const overdue = empTasks.filter(t => t.status === 'OVERDUE').length;
    const pending = empTasks.filter(t => t.status === 'PENDING' || t.status === 'EXTENSION_REQUESTED' || t.status === 'HOLD').length;
    
    // Completion Rate: (Completed / Total) * 100
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    
    return { total, completed, overdue, pending, completionRate, empTasks };
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
    window.print();
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
                            <Calendar size={14}/> {fromDate} to {toDate}
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

            {/* Printable KPI Card */}
            <div className="bg-white rounded-3xl shadow-xl border border-slate-200 p-8 md:p-12 max-w-5xl mx-auto print:shadow-none print:border-none print:p-0 print:w-full print:max-w-none">
                
                {/* Letterhead */}
                <div className="flex items-start justify-between border-b-2 border-slate-800 pb-6 mb-8">
                    <div className="flex items-center gap-4">
                        <img 
                          src={COMPANY_LOGO} 
                          alt="Company Logo"
                          className="w-20 h-20 object-contain" 
                        />
                        <div>
                            <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tighter leading-none">KALRA BUILDTECH</h1>
                            <p className="text-sm font-bold text-slate-500 uppercase tracking-widest mt-1">Official Performance Report</p>
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Generated On</div>
                        <div className="text-xl font-bold text-slate-800">{format(new Date(), 'dd MMM yyyy')}</div>
                        {fromDate && toDate && (
                            <div className="mt-2 inline-block bg-slate-100 px-2 py-1 rounded text-xs font-bold text-slate-600 border border-slate-200">
                                Period: {fromDate} to {toDate}
                            </div>
                        )}
                    </div>
                </div>

                {/* Employee Header */}
                <div className="flex flex-col md:flex-row gap-8 mb-10 items-center md:items-start bg-slate-50 p-6 rounded-2xl border border-slate-100 print:bg-transparent print:border-slate-200">
                    <div className="w-24 h-24 rounded-full bg-white border-4 border-white shadow-lg overflow-hidden shrink-0 print:border-slate-300">
                        {selectedEmployee.avatar ? (
                            <img src={selectedEmployee.avatar} className="w-full h-full object-cover"/>
                        ) : (
                            <div className="w-full h-full flex items-center justify-center bg-slate-200 text-slate-400">
                                <UserCircle size={48}/>
                            </div>
                        )}
                    </div>
                    <div className="text-center md:text-left flex-1">
                        <h2 className="text-3xl font-black text-slate-800 mb-2">{selectedEmployee.name}</h2>
                        <div className="flex flex-wrap justify-center md:justify-start gap-3 text-sm font-medium text-slate-600 mb-2">
                            <span className="bg-white px-3 py-1 rounded-md shadow-sm border border-slate-200">ID: {selectedEmployee.id}</span>
                            <span className="bg-white px-3 py-1 rounded-md shadow-sm border border-slate-200">{selectedEmployee.designation}</span>
                            <span className="bg-white px-3 py-1 rounded-md shadow-sm border border-slate-200 text-indigo-600 font-bold">{selectedEmployee.department}</span>
                        </div>
                        <p className="text-slate-500 text-xs mt-2 italic">
                            Comprehensive evaluation of task execution, punctuality, and compliance.
                        </p>
                    </div>
                     <div className="text-center bg-white p-4 rounded-xl shadow-sm border border-slate-100 print:border-slate-300 min-w-[140px]">
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Performance</div>
                        <div className="text-4xl font-black text-indigo-600">{selectedStats.completionRate}%</div>
                        <div className="flex justify-center mt-2 gap-1">
                             {[1,2,3,4,5].map(star => (
                                 <Star key={star} size={14} className={star <= Math.round(selectedStats.completionRate / 20) ? "text-yellow-400 fill-yellow-400" : "text-slate-200 fill-slate-200"} />
                             ))}
                        </div>
                    </div>
                </div>

                {/* Attendance Section */}
                <div className="mb-8">
                    <h3 className="text-lg font-bold text-slate-800 mb-4 border-b border-slate-100 pb-2 flex items-center gap-2">
                         <CalendarCheck size={20} className="text-indigo-500"/> Attendance Overview {fromDate ? '(Selected Period)' : '(Current Year)'}
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                         <div className="p-4 rounded-xl border border-green-100 bg-green-50 shadow-sm text-center print:bg-transparent print:border-slate-200">
                            <Clock className="mx-auto text-green-500 mb-2" size={24} />
                            <div className="text-2xl font-black text-slate-800">{attendanceStats.present.toFixed(1)}</div>
                            <div className="text-xs font-bold text-green-700 uppercase">Days Present</div>
                        </div>
                        <div className="p-4 rounded-xl border border-red-100 bg-red-50 shadow-sm text-center print:bg-transparent print:border-slate-200">
                            <XCircle className="mx-auto text-red-500 mb-2" size={24} />
                            <div className="text-2xl font-black text-slate-800">{attendanceStats.absent}</div>
                            <div className="text-xs font-bold text-red-700 uppercase">Days Absent</div>
                        </div>
                        <div className="p-4 rounded-xl border border-blue-100 bg-blue-50 shadow-sm text-center print:bg-transparent print:border-slate-200">
                            <TrendingUp className="mx-auto text-blue-500 mb-2" size={24} />
                            <div className="text-2xl font-black text-slate-800">{attendanceStats.leaves.toFixed(1)}</div>
                            <div className="text-xs font-bold text-blue-700 uppercase">Leaves Taken</div>
                        </div>
                        <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-sm text-center print:border-slate-200">
                            <div className="text-2xl font-black text-slate-400 mb-2">{LEAVE_QUOTA_YEARLY}</div>
                            <div className="text-2xl font-black text-slate-800">{(LEAVE_QUOTA_YEARLY - attendanceStats.leaves).toFixed(1)}</div>
                            <div className="text-xs font-bold text-slate-500 uppercase">Leaves Remaining</div>
                        </div>
                    </div>
                </div>

                {/* Task Stats Section */}
                <div className="mb-8">
                    <h3 className="text-lg font-bold text-slate-800 mb-4 border-b border-slate-100 pb-2 flex items-center gap-2">
                         <ClipboardList size={20} className="text-indigo-500"/> Task Execution
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                         <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-sm flex flex-col justify-between h-24">
                            <div className="text-xs font-bold text-slate-400 uppercase">Assigned</div>
                            <div className="text-3xl font-black text-slate-800">{selectedStats.total}</div>
                        </div>
                        <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-sm flex flex-col justify-between h-24 border-b-4 border-b-green-500">
                            <div className="text-xs font-bold text-green-600 uppercase">Completed</div>
                            <div className="text-3xl font-black text-slate-800">{selectedStats.completed}</div>
                        </div>
                        <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-sm flex flex-col justify-between h-24 border-b-4 border-b-orange-500">
                            <div className="text-xs font-bold text-orange-600 uppercase">Pending</div>
                            <div className="text-3xl font-black text-slate-800">{selectedStats.pending}</div>
                        </div>
                        <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-sm flex flex-col justify-between h-24 border-b-4 border-b-red-500">
                            <div className="text-xs font-bold text-red-600 uppercase">Overdue</div>
                            <div className="text-3xl font-black text-slate-800">{selectedStats.overdue}</div>
                        </div>
                    </div>
                </div>

                {/* Recent Task Table */}
                <div>
                    <h3 className="text-lg font-bold text-slate-800 mb-4 border-b border-slate-100 pb-2">Recent Task History</h3>
                    <table className="w-full text-left text-sm border-collapse">
                        <thead>
                            <tr className="border-b-2 border-slate-100">
                                <th className="py-2 text-xs font-bold text-slate-500 uppercase">Task Title</th>
                                <th className="py-2 text-xs font-bold text-slate-500 uppercase">Assigned</th>
                                <th className="py-2 text-xs font-bold text-slate-500 uppercase">Due Date</th>
                                <th className="py-2 text-xs font-bold text-slate-500 uppercase">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {selectedStats.empTasks.sort((a,b) => new Date(b.createdDate).getTime() - new Date(a.createdDate).getTime()).slice(0, 10).map(task => (
                                <tr key={task.id}>
                                    <td className="py-3 font-medium text-slate-700">{task.title}</td>
                                    <td className="py-3 text-slate-500">{task.createdDate}</td>
                                    <td className="py-3 text-slate-500">{task.dueDate}</td>
                                    <td className="py-3">
                                        <span className={`text-xs font-bold uppercase ${
                                            task.status === 'COMPLETED' ? 'text-green-600' :
                                            task.status === 'OVERDUE' ? 'text-red-600' :
                                            'text-orange-600'
                                        }`}>
                                            {task.status}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                            {selectedStats.empTasks.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="py-6 text-center text-slate-400 italic">No tasks found for this period.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
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

        {/* Date Filter Bar */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 mb-8 flex flex-col md:flex-row gap-4 items-center">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
                <Filter size={18} className="text-slate-400"/>
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
                <X size={14}/> Clear / All
            </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {employees.map(emp => {
                const stats = getEmployeeStats(emp.id);
                const score = stats.completionRate;
                
                return (
                    <div key={emp.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 hover:shadow-xl hover:-translate-y-1 transition-all p-6 flex flex-col items-center text-center group cursor-pointer" onClick={() => setSelectedEmpId(emp.id)}>
                        <div className="w-20 h-20 rounded-full bg-slate-100 mb-4 overflow-hidden border-4 border-white shadow-md group-hover:border-purple-100 transition-colors">
                            {emp.avatar ? <img src={emp.avatar} className="w-full h-full object-cover"/> : <UserCircle size={40} className="w-full h-full p-4 text-slate-400"/>}
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
                            View Report <ArrowLeft size={12} className="rotate-180"/>
                        </button>
                    </div>
                );
            })}
        </div>
    </div>
  );
};
