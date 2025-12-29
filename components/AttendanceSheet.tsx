
import React, { useState, useMemo, useEffect } from 'react';
import { Employee, AttendanceRecord, AttendanceValue, SundayRequest, Holiday } from '../types';
import { getDaysInMonthArray, formatDateKey, isDateSunday, startOfDay } from '../utils/dateUtils';
import { STATUS_COLORS, STATUS_LABELS } from '../constants';
import { ChevronLeft, ChevronRight, Calendar, AlertCircle, CheckCircle2, XCircle, X } from 'lucide-react';
import { format, isBefore } from 'date-fns';

interface AttendanceSheetProps {
  employees: Employee[];
  attendanceData: Record<string, AttendanceRecord>;
  setAttendanceData: React.Dispatch<React.SetStateAction<Record<string, AttendanceRecord>>>;
  holidays: Holiday[];
  sundayRequests: SundayRequest[];
  setSundayRequests: React.Dispatch<React.SetStateAction<SundayRequest[]>>;
}

export const AttendanceSheet: React.FC<AttendanceSheetProps> = ({ 
  employees, 
  attendanceData, 
  setAttendanceData,
  holidays,
  sundayRequests,
  setSundayRequests
}) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showRequestsModal, setShowRequestsModal] = useState(false);
  
  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, empId: string, date: Date } | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const days = useMemo(() => getDaysInMonthArray(year, month), [year, month]);
  const todayStart = startOfDay(new Date()); // Optimization: Calculate once

  const pendingRequests = sundayRequests.filter(r => r.status === 'PENDING');

  // Close context menu on global click
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  const handleMonthChange = (delta: number) => {
    setCurrentDate(new Date(year, month + delta, 1));
  };

  const updateAttendance = async (empId: string, date: Date, newVal: AttendanceValue) => {
    const dateKey = formatDateKey(date);
    const aId = `A-${empId}-${dateKey}`;
    try {
      // Try to create or update attendance record on server
      const existing = attendanceData[empId]?.[dateKey];
      if (existing === undefined) {
        await fetch('/api/attendance', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: aId, userId: empId, date: dateKey, value: newVal }) });
      } else {
        await fetch(`/api/attendance/${encodeURIComponent(aId)}`, { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: newVal }) });
      }
      setAttendanceData(prev => ({ ...prev, [empId]: { ...(prev[empId] || {}), [dateKey]: newVal } }));
    } catch (err) {
      console.warn('Attendance update failed, falling back to local update', err);
      setAttendanceData(prev => ({ ...prev, [empId]: { ...(prev[empId] || {}), [dateKey]: newVal } }));
    }
  };

  const toggleAttendance = (empId: string, date: Date) => {
    const dateKey = formatDateKey(date);
    const currentVal = attendanceData[empId]?.[dateKey];
    
    let nextVal: AttendanceValue = 1;

    if (currentVal === undefined) {
        nextVal = 1;
    } else {
        if (currentVal === 1) nextVal = 0;
        else if (currentVal === 0) nextVal = 1;
        else nextVal = 1; 
    }

    updateAttendance(empId, date, nextVal);
  };

  const handleContextMenu = (e: React.MouseEvent, empId: string, date: Date) => {
      e.preventDefault();
      setContextMenu({ x: e.clientX, y: e.clientY, empId, date });
  };

  const handleMenuSelect = (val: AttendanceValue) => {
      if (contextMenu) {
          updateAttendance(contextMenu.empId, contextMenu.date, val);
          setContextMenu(null);
      }
  };

  const handleRequestAction = (id: string, status: 'APPROVED' | 'REJECTED') => {
      setSundayRequests(prev => prev.map(r => r.id === id ? { ...r, status } : r));
  };

  const getStats = (empId: string) => {
    const emp = employees.find(e => e.id === empId);
    
    // Determine the start date for tracking stats:
    // If 'createdAt' exists (System Entry Date), use that.
    // Otherwise, fallback to 'joiningDate' (Legacy behavior).
    const trackingStartDate = emp 
        ? (emp.createdAt ? startOfDay(new Date(emp.createdAt)) : startOfDay(new Date(emp.joiningDate))) 
        : new Date(0);

    const record = attendanceData[empId] || {};
    let worked = 0;
    let fullLeaves = 0;
    let totalLeaves = 0;
    let shortLeaves = 0;

    days.forEach(d => {
      const currentDay = startOfDay(d);
      const k = formatDateKey(d);
      const val = record[k];

      // 1. Check Tracking Start Date
      if (isBefore(currentDay, trackingStartDate) && val === undefined) return;

      // 2. Check if Today or Future (and undefined) -> Skip from stats
      // We only auto-count Absent for STRICTLY PAST days
      if (val === undefined && !isBefore(currentDay, todayStart)) return;

      let effectiveVal: AttendanceValue = 1;
      
      if (val !== undefined) {
          effectiveVal = val;
      } else {
          if (isDateSunday(d)) effectiveVal = 'OFF';
          else if (holidays.some(h => h.date === k)) effectiveVal = 'HOLIDAY';
          else effectiveVal = 0; // It is strictly past and undefined, so Absent
      }

      if (effectiveVal === 'OFF' || effectiveVal === 'HOLIDAY') return;

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
    <div className="flex flex-col h-full bg-slate-50 relative">
      <div className="p-4 md:p-6 border-b border-slate-200 bg-white shadow-sm flex flex-col md:flex-row justify-between items-center z-30 relative gap-4">
        <h2 className="text-xl md:text-2xl font-extrabold text-slate-800 flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center shrink-0">
            <Calendar size={20} />
          </div>
          Attendance Sheet
          {pendingRequests.length > 0 && (
              <button 
                onClick={() => setShowRequestsModal(true)}
                className="ml-4 text-xs bg-red-500 text-white px-3 py-1 rounded-full font-bold animate-pulse shadow-red-500/50 shadow-sm"
              >
                  {pendingRequests.length} Sunday Req
              </button>
          )}
        </h2>
        <div className="flex items-center justify-between w-full md:w-auto gap-2 bg-slate-100 p-1.5 rounded-xl border border-slate-200">
          <button 
            onClick={() => handleMonthChange(-1)}
            className="p-2 hover:bg-white hover:shadow-md hover:text-blue-600 rounded-lg transition-all text-slate-500"
          >
            <ChevronLeft size={20} />
          </button>
          <span className="w-32 md:w-48 text-center font-bold text-slate-800 select-none text-base md:text-lg">
            {format(currentDate, 'MMMM yyyy')}
          </span>
          <button 
            onClick={() => handleMonthChange(1)}
            className="p-2 hover:bg-white hover:shadow-md hover:text-blue-600 rounded-lg transition-all text-slate-500"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto relative custom-scrollbar">
        <table className="border-collapse w-full">
          <thead className="bg-slate-50 sticky top-0 z-20 shadow-sm">
            <tr>
              <th className="sticky left-0 bg-slate-50 z-30 p-4 min-w-[80px] text-left text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200 border-r">ID</th>
              <th className="sticky left-[80px] bg-slate-50 z-30 p-4 min-w-[140px] text-left text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200 border-r shadow-[4px_0_8px_-4px_rgba(0,0,0,0.05)]">Name</th>
              <th className="p-2 w-14 text-center text-[10px] uppercase font-bold text-blue-600 bg-blue-50/50 border-b border-blue-100 border-r border-slate-200">Work</th>
              <th className="p-2 w-14 text-center text-[10px] uppercase font-bold text-red-600 bg-red-50/50 border-b border-red-100 border-r border-slate-200">Full</th>
              <th className="p-2 w-14 text-center text-[10px] uppercase font-bold text-orange-600 bg-orange-50/50 border-b border-orange-100 border-r border-slate-200">Total</th>
              
              {days.map(d => {
                const isSun = isDateSunday(d);
                const holiday = holidays.find(h => h.date === formatDateKey(d));
                return (
                  <th 
                    key={d.toString()} 
                    className={`p-2 min-w-[44px] text-center border-b border-slate-200 border-r border-slate-100 group transition-colors ${isSun || holiday ? 'bg-green-50' : 'bg-slate-50'}`}
                    title={holiday?.name}
                  >
                    <div className={`text-sm font-bold ${isSun || holiday ? 'text-green-700' : 'text-slate-700'}`}>{format(d, 'd')}</div>
                    <div className={`text-[9px] font-bold uppercase tracking-wider ${isSun || holiday ? 'text-green-600/70' : 'text-slate-400'}`}>{format(d, 'EEE')}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {employees.map(emp => {
              const stats = getStats(emp.id);
              
              // Determine start date for rendering logic
              const trackingStartDate = emp.createdAt 
                  ? startOfDay(new Date(emp.createdAt)) 
                  : startOfDay(new Date(emp.joiningDate));

              return (
                <tr key={emp.id} className="hover:bg-blue-50/30 transition-colors group">
                  <td className="sticky left-0 bg-white group-hover:bg-blue-50/30 p-3 font-mono text-xs font-bold text-slate-500 border-r border-slate-200 z-10 transition-colors">{emp.id}</td>
                  <td className="sticky left-[80px] bg-white group-hover:bg-blue-50/30 p-3 text-sm font-bold text-slate-700 border-r border-slate-200 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.05)] z-10 whitespace-nowrap overflow-hidden text-ellipsis max-w-[140px] transition-colors">{emp.name}</td>
                  
                  <td className="p-2 text-center text-sm font-bold text-slate-800 bg-blue-50/20 border-r border-slate-100">{stats?.worked.toFixed(2) || 0}</td>
                  <td className="p-2 text-center text-sm font-bold text-slate-500 bg-red-50/20 border-r border-slate-100">{stats?.fullLeaves || 0}</td>
                  <td className="p-2 text-center text-sm font-bold text-slate-800 bg-orange-50/20 border-r border-slate-100">{stats?.totalLeaves.toFixed(2) || 0}</td>

                  {days.map(d => {
                    const currentDay = startOfDay(d);
                    const isBeforeTracking = isBefore(currentDay, trackingStartDate);
                    
                    const isSun = isDateSunday(d);
                    const dateKey = formatDateKey(d);
                    const holiday = holidays.find(h => h.date === dateKey);
                    
                    const record = attendanceData[emp.id]?.[dateKey];
                    let val: AttendanceValue | null = null; 

                    if (record !== undefined) {
                        val = record;
                    } else {
                        // If it is before tracking start date, do not auto-populate status (Empty)
                        if (isBeforeTracking) {
                            val = null;
                        } else {
                            if (isSun) {
                                val = 'OFF';
                            } else if (holiday) {
                                val = 'HOLIDAY';
                            } else {
                                // Only mark 0 (Absent) if STRICTLY in the past.
                                // Today (if incomplete) or Future remains null (Empty)
                                if (isBefore(currentDay, todayStart)) {
                                    val = 0; 
                                } else {
                                    val = null; 
                                }
                            }
                        }
                    }

                    const colorClass = val === null ? 'bg-white' : (STATUS_COLORS[val.toString()] || 'bg-white');
                    const displayText = val === 1 ? '1' : (val === null ? '' : (val === 'OFF' || val === 'HOLIDAY' ? '—' : val));
                    
                    // Style hint for pre-tracking empty cells (optional, kept subtle)
                    const cellStyle = (isBeforeTracking && val === null) ? '' : ''; 

                    return (
                      <td 
                        key={dateKey}
                        onClick={() => toggleAttendance(emp.id, d)}
                        onContextMenu={(e) => handleContextMenu(e, emp.id, d)}
                        className={`p-1 border-r border-slate-100 cursor-pointer text-center relative ${cellStyle}`}
                        title={holiday ? `${holiday.name}` : undefined}
                      >
                        <div className={`w-8 h-8 mx-auto rounded-lg flex items-center justify-center text-[10px] font-bold shadow-sm transition-all hover:scale-110 hover:shadow-md ${colorClass} ${val === 1 ? 'border border-slate-100' : ''}`}>
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
      <div className="p-4 bg-white border-t border-slate-200 text-xs flex flex-wrap gap-4 md:gap-6 text-slate-600 font-medium shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-30">
        <span className="flex items-center gap-2"><div className="w-4 h-4 rounded-md bg-white border border-slate-300 shadow-sm flex items-center justify-center text-[8px] font-bold">1</div> Present (1)</span>
        <span className="flex items-center gap-2"><div className="w-4 h-4 rounded-md bg-red-500 shadow-sm shadow-red-500/30"></div> Absent (0)</span>
        <span className="flex items-center gap-2"><div className="w-4 h-4 rounded-md bg-yellow-300 shadow-sm shadow-yellow-300/30"></div> Half Day (0.5)</span>
        <span className="flex items-center gap-2"><div className="w-4 h-4 rounded-md bg-blue-200 shadow-sm shadow-blue-200/30"></div> Quarter Day (0.25)</span>
        <span className="flex items-center gap-2"><div className="w-4 h-4 rounded-md bg-orange-300 shadow-sm shadow-orange-300/30"></div> Short Leave (0.75)</span>
        <span className="flex items-center gap-2"><div className="w-4 h-4 rounded-md bg-[#00b050] shadow-sm shadow-green-500/30"></div> Off/Holiday</span>
        <span className="ml-auto text-slate-400 italic">Right-click any cell to manually set specific status</span>
      </div>

      {/* Context Menu */}
      {contextMenu && (
          <div 
            style={{ top: contextMenu.y, left: contextMenu.x }} 
            className="fixed z-50 bg-white rounded-xl shadow-xl border border-slate-100 w-48 py-1.5 animate-in fade-in zoom-in-95 duration-100 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
              <div className="px-4 py-2 text-xs font-bold text-slate-400 uppercase border-b border-slate-50 mb-1">Set Status</div>
              <button onClick={() => handleMenuSelect(1)} className="w-full text-left px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-white border border-slate-300"></div> Present (1.0)
              </button>
              <button onClick={() => handleMenuSelect(0)} className="w-full text-left px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500"></div> Absent (0)
              </button>
               <button onClick={() => handleMenuSelect(0.5)} className="w-full text-left px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-yellow-300"></div> Half Day (0.5)
              </button>
              <button onClick={() => handleMenuSelect(0.25)} className="w-full text-left px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-200"></div> Quarter Day (0.25)
              </button>
               <button onClick={() => handleMenuSelect(0.75)} className="w-full text-left px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-orange-300"></div> Short Leave (0.75)
              </button>
              <div className="my-1 border-t border-slate-50"></div>
              <button onClick={() => handleMenuSelect('OFF')} className="w-full text-left px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#00b050]"></div> Off Day
              </button>
               <button onClick={() => handleMenuSelect('HOLIDAY')} className="w-full text-left px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#00b050]"></div> Holiday
              </button>
          </div>
      )}

      {/* Requests Modal */}
      {showRequestsModal && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
                  <div className="p-6 border-b border-slate-100 bg-red-50/50 flex justify-between items-center shrink-0">
                      <h3 className="text-xl font-extrabold text-red-900">Sunday Work Requests</h3>
                      <button onClick={() => setShowRequestsModal(false)} className="p-2 hover:bg-red-100 rounded-full text-red-800"><X size={20}/></button>
                  </div>
                  <div className="p-6 space-y-4 overflow-y-auto">
                      {pendingRequests.length === 0 ? (
                          <div className="text-center text-slate-400 py-8">No pending requests</div>
                      ) : (
                          pendingRequests.map(req => {
                              const emp = employees.find(e => e.id === req.employeeId);
                              return (
                                  <div key={req.id} className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                                      <div className="flex justify-between items-start mb-2">
                                          <div>
                                              <p className="font-bold text-slate-800">{emp?.name}</p>
                                              <p className="text-xs text-slate-500">{req.date}</p>
                                          </div>
                                          <span className="text-xs font-mono text-slate-400">{req.id}</span>
                                      </div>
                                      <p className="text-sm text-slate-600 bg-slate-50 p-2 rounded mb-3 italic">"{req.reason}"</p>
                                      <div className="flex gap-2">
                                          <button 
                                              onClick={() => handleRequestAction(req.id, 'APPROVED')}
                                              className="flex-1 py-1.5 bg-green-600 text-white rounded-lg text-xs font-bold hover:bg-green-700 flex items-center justify-center gap-1"
                                          >
                                              <CheckCircle2 size={14}/> Approve
                                          </button>
                                          <button 
                                              onClick={() => handleRequestAction(req.id, 'REJECTED')}
                                              className="flex-1 py-1.5 bg-white border border-red-200 text-red-600 rounded-lg text-xs font-bold hover:bg-red-50 flex items-center justify-center gap-1"
                                          >
                                              <XCircle size={14}/> Reject
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
