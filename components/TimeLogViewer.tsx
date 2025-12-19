
import React, { useState, useMemo } from 'react';
import { TimeLog, Employee, AttendanceRecord, AttendanceValue } from '../types';
import { Clock, Search, Download, CalendarDays, User, Edit2, Save, X, LogOut } from 'lucide-react';
import { format, differenceInMinutes } from 'date-fns';
import { formatDecimalHours } from '../utils/dateUtils';

interface TimeLogViewerProps {
  timeLogs: Record<string, Record<string, TimeLog>>; // empId -> date -> Log
  setTimeLogs: React.Dispatch<React.SetStateAction<Record<string, Record<string, TimeLog>>>>;
  employees: Employee[];
  attendanceData: Record<string, AttendanceRecord>;
  setAttendanceData: React.Dispatch<React.SetStateAction<Record<string, AttendanceRecord>>>;
}

export const TimeLogViewer: React.FC<TimeLogViewerProps> = ({ 
    timeLogs, setTimeLogs, employees, attendanceData, setAttendanceData 
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  
  // Editing State
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [manualTime, setManualTime] = useState('');

  // 1. Flatten logs into a workable array
  const allLogs = useMemo(() => {
      const logs: (TimeLog & { empName: string, empId: string, department: string, avatar?: string })[] = [];
      employees.forEach(emp => {
        const empLogs = timeLogs[emp.id];
        if (empLogs) {
          (Object.values(empLogs) as TimeLog[]).forEach(log => {
            logs.push({
              ...log,
              empName: emp.name,
              empId: emp.id,
              department: emp.department,
              avatar: emp.avatar
            });
          });
        }
      });
      // Sort by Time (Clock In) Descending initially to ensure within-day sort
      return logs.sort((a, b) => new Date(b.clockIn).getTime() - new Date(a.clockIn).getTime());
  }, [timeLogs, employees]);

  // 2. Filter
  const filteredLogs = allLogs.filter(log => 
    log.empName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.empId.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.date.includes(searchTerm) || 
    log.department.toLowerCase().includes(searchTerm.toLowerCase())
  );

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

  const saveManualOut = (log: any) => {
      if (!manualTime) return;

      const clockOutIso = `${log.date}T${manualTime}:00`;
      const start = new Date(log.clockIn);
      const end = new Date(clockOutIso);
      
      // Validation: End must be after Start
      if (end <= start) {
          alert("Clock Out time must be after Clock In time.");
          return;
      }

      const diffMinutes = differenceInMinutes(end, start);
      const durationHours = diffMinutes / 60;

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

      // 1. Update TimeLogs
      setTimeLogs(prev => ({
          ...prev,
          [log.empId]: {
              ...(prev[log.empId] || {}),
              [log.date]: {
                  ...log, // Keep ID, Date, In time
                  clockOut: clockOutIso,
                  durationHours: durationHours
              }
          }
      }));

      // 2. Update Attendance Sheet
      setAttendanceData(prev => ({
          ...prev,
          [log.empId]: {
              ...(prev[log.empId] || {}),
              [log.date]: attendanceVal
          }
      }));

      setEditingKey(null);
      setManualTime('');
  };

  return (
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
        <div className="flex gap-2">
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                type="text"
                placeholder="Search staff, ID, or dept..."
                className="pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>
            <button 
                onClick={handleExport}
                className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 px-5 py-3 rounded-xl flex items-center justify-center gap-2 font-bold shadow-sm"
            >
                <Download size={18} /> Export
            </button>
        </div>
      </div>

      <div className="space-y-8 pb-20">
        {sortedDates.length === 0 ? (
             <div className="p-12 text-center text-slate-400 bg-white rounded-3xl border border-slate-100">
                <Clock size={48} className="mx-auto mb-4 opacity-20"/>
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
                                        <span className="flex items-center gap-1"><User size={12}/> {stats.total} Present</span>
                                        {stats.running > 0 && <span className="flex items-center gap-1 text-green-600 animate-pulse"><Clock size={12}/> {stats.running} Active</span>}
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
                                                        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 font-bold text-xs border border-slate-200">
                                                            {log.avatar ? <img src={log.avatar} className="w-full h-full object-cover rounded-full"/> : log.empName.charAt(0)}
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
                                                            <button onClick={() => saveManualOut(log)} className="p-1 bg-green-100 text-green-700 rounded hover:bg-green-200"><Save size={14}/></button>
                                                            <button onClick={cancelEditing} className="p-1 bg-red-100 text-red-700 rounded hover:bg-red-200"><X size={14}/></button>
                                                        </div>
                                                    ) : (
                                                        log.clockOut ? (
                                                            <div className="group/edit relative inline-block">
                                                                <span className="font-mono text-xs font-bold text-red-700 bg-red-50 px-2 py-1 rounded border border-red-100">{formatTime(log.clockOut)}</span>
                                                                <button 
                                                                    onClick={() => startEditing(log)}
                                                                    className="absolute -right-6 top-1/2 -translate-y-1/2 text-slate-400 hover:text-blue-500 opacity-0 group-hover/edit:opacity-100 transition-opacity p-1"
                                                                    title="Edit Time"
                                                                >
                                                                    <Edit2 size={12}/>
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <button 
                                                                onClick={() => startEditing(log)}
                                                                className="text-xs font-bold text-red-500 bg-red-50 border border-red-200 px-3 py-1 rounded-full animate-pulse hover:bg-red-100 transition-colors flex items-center gap-1 mx-auto"
                                                            >
                                                                <LogOut size={12}/> Manual Out
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
  );
};
