
import React, { useState, useMemo } from 'react';
import { Task, MaterialOrder, LeaveRequest, Holiday, AttendanceRecord, User, Employee, Reminder } from '../types';
import { getDaysInMonthArray, formatDateKey, isDateSunday } from '../utils/dateUtils';
import { ChevronLeft, ChevronRight, Calendar, X, ClipboardList, Package, FileBarChart, CalendarDays, Bell, Plus, Trash2, Cake } from 'lucide-react';
import { format, isSameDay, getDate, getMonth } from 'date-fns';

interface CalendarViewProps {
  tasks: Task[];
  orders: MaterialOrder[];
  leaves: LeaveRequest[];
  holidays: Holiday[];
  reminders: Reminder[];
  setReminders: React.Dispatch<React.SetStateAction<Reminder[]>>;
  attendanceData: Record<string, AttendanceRecord>;
  currentUser: User;
  employees: Employee[];
}

export const CalendarView: React.FC<CalendarViewProps> = ({ 
  tasks, orders, leaves, holidays, reminders, setReminders, attendanceData, currentUser, employees 
}) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  
  // Reminder Input State
  const [newReminderTitle, setNewReminderTitle] = useState('');

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const days = useMemo(() => getDaysInMonthArray(year, month), [year, month]);

  const handleMonthChange = (delta: number) => {
    setCurrentDate(new Date(year, month + delta, 1));
  };

  const handleAddReminder = () => {
      if (newReminderTitle && selectedDate) {
          const newReminder: Reminder = {
              id: `REM-${Date.now()}`,
              userId: currentUser.employeeId || 'ADMIN',
              date: formatDateKey(selectedDate),
              title: newReminderTitle
          };
          setReminders([...reminders, newReminder]);
          setNewReminderTitle('');
      }
  };

  const handleDeleteReminder = (id: string) => {
      setReminders(reminders.filter(r => r.id !== id));
  };

  // --- Aggregate Events ---
  const getEventsForDate = (date: Date) => {
      const dateKey = formatDateKey(date);
      const events: any[] = [];

      // 1. Holidays
      const holiday = holidays.find(h => h.date === dateKey);
      if (holiday) events.push({ type: 'HOLIDAY', data: holiday });

      // 2. Birthdays (Recurring)
      const currentDay = getDate(date);
      const currentMonth = getMonth(date);
      
      employees.forEach(emp => {
          if (emp.birthDate) {
              const dob = new Date(emp.birthDate);
              if (getDate(dob) === currentDay && getMonth(dob) === currentMonth) {
                  events.push({ type: 'BIRTHDAY', data: emp });
              }
          }
      });

      // 3. Tasks (Due Date)
      const daysTasks = tasks.filter(t => t.dueDate === dateKey && t.status !== 'COMPLETED' && t.status !== 'TERMINATED');
      // For Admin: All. For Employee: Assigned To Me.
      const visibleTasks = currentUser.role === 'ADMIN' ? daysTasks : daysTasks.filter(t => t.assignedTo === currentUser.employeeId);
      visibleTasks.forEach(t => events.push({ type: 'TASK', data: t }));

      // 4. Orders (Expected Delivery)
      const daysOrders = orders.filter(o => o.expectedDeliveryDate === dateKey && o.status !== 'COMPLETED' && o.status !== 'REJECTED');
      // For Admin: All. For Employee: Ordered By Me or Assigned To Me
      const visibleOrders = currentUser.role === 'ADMIN' ? daysOrders : daysOrders.filter(o => o.orderedBy === currentUser.employeeId || o.assignedApprover === currentUser.employeeId);
      visibleOrders.forEach(o => events.push({ type: 'ORDER', data: o }));

      // 5. Leaves (On this day) - Admin sees all, Employee sees own
      const activeLeaves = leaves.filter(l => l.status === 'APPROVED').filter(l => {
          const start = new Date(l.startDate);
          const end = new Date(l.endDate);
          return date >= start && date <= end;
      });
      const visibleLeaves = currentUser.role === 'ADMIN' ? activeLeaves : activeLeaves.filter(l => l.employeeId === currentUser.employeeId);
      visibleLeaves.forEach(l => events.push({ type: 'LEAVE', data: l }));

      // 6. Reminders (Personal)
      const myReminders = reminders.filter(r => r.date === dateKey && r.userId === (currentUser.employeeId || 'ADMIN'));
      myReminders.forEach(r => events.push({ type: 'REMINDER', data: r }));

      return events;
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 relative">
      <div className="p-4 md:p-6 border-b border-slate-200 bg-white shadow-sm flex flex-col md:flex-row justify-between items-center z-30 relative gap-4">
        <h2 className="text-xl md:text-2xl font-extrabold text-slate-800 flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 text-white rounded-xl flex items-center justify-center shrink-0 shadow-lg shadow-indigo-600/20">
            <Calendar size={20} />
          </div>
          Company Calendar
        </h2>
        <div className="flex items-center justify-between w-full md:w-auto gap-2 bg-slate-100 p-1.5 rounded-xl border border-slate-200">
          <button onClick={() => handleMonthChange(-1)} className="p-2 hover:bg-white hover:shadow-md hover:text-indigo-600 rounded-lg transition-all text-slate-500">
            <ChevronLeft size={20} />
          </button>
          <span className="w-32 md:w-48 text-center font-bold text-slate-800 select-none text-base md:text-lg">
            {format(currentDate, 'MMMM yyyy')}
          </span>
          <button onClick={() => handleMonthChange(1)} className="p-2 hover:bg-white hover:shadow-md hover:text-indigo-600 rounded-lg transition-all text-slate-500">
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 md:p-6 custom-scrollbar">
          <div className="grid grid-cols-7 gap-2 md:gap-4 mb-4 text-center">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                  <div key={d} className="text-xs font-bold text-slate-400 uppercase tracking-wider">{d}</div>
              ))}
          </div>
          <div className="grid grid-cols-7 gap-2 md:gap-4 auto-rows-fr">
              {/* Padding for start of month */}
              {Array.from({ length: days[0].getDay() }).map((_, i) => <div key={`pad-${i}`} className="min-h-[100px] md:min-h-[140px]"></div>)}
              
              {days.map(d => {
                  const events = getEventsForDate(d);
                  const isToday = isSameDay(d, new Date());
                  const isSun = isDateSunday(d);
                  const hasHoliday = events.find(e => e.type === 'HOLIDAY');
                  const hasBirthday = events.find(e => e.type === 'BIRTHDAY');

                  return (
                      <div 
                        key={d.toISOString()} 
                        onClick={() => setSelectedDate(d)}
                        className={`min-h-[100px] md:min-h-[140px] bg-white rounded-2xl border p-2 flex flex-col gap-1 transition-all cursor-pointer hover:shadow-md group ${isToday ? 'border-indigo-500 ring-2 ring-indigo-500/20' : (hasHoliday || isSun ? 'bg-slate-50/50 border-slate-100' : 'border-slate-200 hover:border-indigo-300')} ${hasBirthday ? 'bg-gradient-to-br from-white to-pink-50' : ''}`}
                      >
                          <div className="flex justify-between items-start">
                              <span className={`text-sm font-bold w-7 h-7 flex items-center justify-center rounded-full ${isToday ? 'bg-indigo-600 text-white shadow-md' : (hasHoliday || isSun ? 'text-red-500' : 'text-slate-700')}`}>
                                  {format(d, 'd')}
                              </span>
                              {hasHoliday && <div className="w-2 h-2 bg-red-500 rounded-full" />}
                              {hasBirthday && <Cake size={14} className="text-pink-500" />}
                          </div>

                          <div className="flex-1 flex flex-col gap-1 overflow-hidden mt-1">
                              {events.slice(0, 3).map((e, idx) => {
                                  let bg = 'bg-slate-100 text-slate-600';
                                  let label = '';

                                  switch(e.type) {
                                      case 'HOLIDAY': 
                                        bg = 'bg-red-100 text-red-700 border border-red-200'; 
                                        label = e.data.name;
                                        break;
                                      case 'BIRTHDAY':
                                        bg = 'bg-pink-100 text-pink-700 border border-pink-200';
                                        const bName = e.data.name.split(' ')[0];
                                        label = `HBD: ${bName}`;
                                        break;
                                      case 'TASK':
                                        bg = 'bg-blue-50 text-blue-700 border border-blue-100';
                                        label = e.data.title;
                                        break;
                                      case 'ORDER':
                                        bg = 'bg-orange-50 text-orange-700 border border-orange-100';
                                        label = e.data.itemName;
                                        break;
                                      case 'LEAVE':
                                        bg = 'bg-purple-50 text-purple-700 border border-purple-100';
                                        const empName = employees.find(emp => emp.id === e.data.employeeId)?.name.split(' ')[0] || e.data.employeeId;
                                        label = `Leave: ${empName}`;
                                        break;
                                      case 'REMINDER':
                                        bg = 'bg-yellow-100 text-yellow-700 border border-yellow-200';
                                        label = `Note: ${e.data.title}`;
                                        break;
                                  }

                                  return (
                                      <div key={idx} className={`text-[10px] font-bold px-1.5 py-1 rounded truncate flex items-center gap-1 ${bg}`}>
                                         {label}
                                      </div>
                                  );
                              })}
                              {events.length > 3 && (
                                  <div className="text-[10px] font-bold text-slate-400 pl-1">+{events.length - 3} more</div>
                              )}
                          </div>
                      </div>
                  );
              })}
          </div>
      </div>

      {/* Detail Modal */}
      {selectedDate && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[80vh]">
                  <div className="p-6 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
                      <div>
                        <h3 className="text-xl font-extrabold text-slate-800">{format(selectedDate, 'EEEE, MMM do')}</h3>
                        <p className="text-sm text-slate-500 font-bold">{getEventsForDate(selectedDate).length} Events</p>
                      </div>
                      <button onClick={() => setSelectedDate(null)} className="p-2 hover:bg-slate-200 rounded-full text-slate-500"><X size={20}/></button>
                  </div>
                  
                  {/* Add Reminder Input */}
                  <div className="p-4 bg-yellow-50/50 border-b border-yellow-100 flex gap-2">
                      <input 
                        type="text" 
                        className="flex-1 border border-yellow-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 bg-white"
                        placeholder="Add personal reminder..."
                        value={newReminderTitle}
                        onChange={(e) => setNewReminderTitle(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddReminder()}
                      />
                      <button 
                        onClick={handleAddReminder}
                        className="bg-yellow-400 hover:bg-yellow-500 text-yellow-900 px-3 py-2 rounded-xl shadow-sm transition-colors"
                      >
                          <Plus size={18} />
                      </button>
                  </div>

                  <div className="p-6 overflow-y-auto space-y-4">
                      {getEventsForDate(selectedDate).length === 0 ? (
                          <div className="text-center text-slate-400 py-8">
                              <CalendarDays size={48} className="mx-auto mb-2 opacity-20"/>
                              No events scheduled for this day.
                          </div>
                      ) : (
                          getEventsForDate(selectedDate).map((e, idx) => {
                                switch(e.type) {
                                    case 'HOLIDAY': 
                                        return (
                                            <div key={idx} className="bg-red-50 p-4 rounded-xl border border-red-100 flex gap-3 items-center">
                                                <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-red-500 font-bold shrink-0 shadow-sm"><CalendarDays size={18}/></div>
                                                <div>
                                                    <div className="text-xs font-bold text-red-400 uppercase">Holiday</div>
                                                    <div className="font-bold text-red-900">{e.data.name}</div>
                                                </div>
                                            </div>
                                        );
                                    case 'BIRTHDAY':
                                        const emp = e.data as Employee;
                                        return (
                                            <div key={idx} className="bg-pink-50 p-4 rounded-xl border border-pink-100 flex gap-3 items-center animate-in fade-in slide-in-from-left-4">
                                                <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-pink-500 font-bold shrink-0 shadow-sm"><Cake size={18}/></div>
                                                <div>
                                                    <div className="text-xs font-bold text-pink-400 uppercase">Happy Birthday!</div>
                                                    <div className="font-bold text-pink-900">{emp.name}</div>
                                                    <div className="text-xs text-pink-600/80">{emp.designation || emp.department}</div>
                                                </div>
                                            </div>
                                        );
                                    case 'TASK':
                                        const t = e.data as Task;
                                        return (
                                            <div key={idx} className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex gap-3 items-center">
                                                <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-blue-500 font-bold shrink-0 shadow-sm"><ClipboardList size={18}/></div>
                                                <div>
                                                    <div className="text-xs font-bold text-blue-400 uppercase">Task Due</div>
                                                    <div className="font-bold text-blue-900">{t.title}</div>
                                                    <div className="text-xs text-blue-600/80">Assigned to: {employees.find(emp => emp.id === t.assignedTo)?.name}</div>
                                                </div>
                                            </div>
                                        );
                                    case 'ORDER':
                                        const o = e.data as MaterialOrder;
                                        return (
                                            <div key={idx} className="bg-orange-50 p-4 rounded-xl border border-orange-100 flex gap-3 items-center">
                                                <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-orange-500 font-bold shrink-0 shadow-sm"><Package size={18}/></div>
                                                <div>
                                                    <div className="text-xs font-bold text-orange-400 uppercase">Expected Delivery</div>
                                                    <div className="font-bold text-orange-900">{o.itemName}</div>
                                                    <div className="text-xs text-orange-600/80">{o.quantity} • {o.siteLocation}</div>
                                                </div>
                                            </div>
                                        );
                                    case 'LEAVE':
                                        const l = e.data as LeaveRequest;
                                        const empName = employees.find(emp => emp.id === l.employeeId)?.name;
                                        return (
                                            <div key={idx} className="bg-purple-50 p-4 rounded-xl border border-purple-100 flex gap-3 items-center">
                                                <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-purple-500 font-bold shrink-0 shadow-sm"><FileBarChart size={18}/></div>
                                                <div>
                                                    <div className="text-xs font-bold text-purple-400 uppercase">On Leave</div>
                                                    <div className="font-bold text-purple-900">{empName}</div>
                                                    <div className="text-xs text-purple-600/80">{l.leaveType} ({l.durationType})</div>
                                                </div>
                                            </div>
                                        );
                                    case 'REMINDER':
                                        const r = e.data as Reminder;
                                        return (
                                            <div key={idx} className="bg-yellow-50 p-4 rounded-xl border border-yellow-100 flex gap-3 items-center group">
                                                <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-yellow-600 font-bold shrink-0 shadow-sm"><Bell size={18}/></div>
                                                <div className="flex-1">
                                                    <div className="text-xs font-bold text-yellow-600 uppercase">Reminder</div>
                                                    <div className="font-bold text-yellow-900">{r.title}</div>
                                                </div>
                                                <button onClick={() => handleDeleteReminder(r.id)} className="p-2 text-yellow-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        );
                                    default: return null;
                                }
                          })
                      )}
                  </div>
              </div>
          </div>
      )}

    </div>
  );
};
