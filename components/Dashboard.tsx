
import React from 'react';
import { Employee, AttendanceRecord, ViewMode } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Users, AlertTriangle, CheckCircle2, Clock, ChevronRight, Download, RefreshCw, UserCog, Cake } from 'lucide-react';
import { formatDateKey, isDateSunday } from '../utils/dateUtils';
import { format, getDate, getMonth } from 'date-fns';
import { LEAVE_QUOTA_YEARLY } from '../constants';

interface DashboardProps {
  employees: Employee[];
  attendanceData: Record<string, AttendanceRecord>;
  onNavigate: (view: ViewMode) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ employees, attendanceData, onNavigate }) => {
  const currentDate = new Date();
  const dateKey = formatDateKey(currentDate);
  const isSundayToday = isDateSunday(currentDate);
  const currentYear = currentDate.getFullYear().toString();

  // Birthday Logic
  const birthdaysToday = employees.filter(emp => {
      if (!emp.birthDate) return false;
      const dob = new Date(emp.birthDate);
      return getDate(dob) === getDate(currentDate) && getMonth(dob) === getMonth(currentDate);
  });

  let presentToday = 0;
  let absentToday = 0;
  let leaveToday = 0;

  employees.forEach(emp => {
    const val = attendanceData[emp.id]?.[dateKey];
    if (val === 1) presentToday++;
    else if (val === 0) absentToday++;
    else if (typeof val === 'number' && val > 0 && val < 1) leaveToday++;
  });

  // Calculate Yearly Leaves for Chart
  const chartData = employees.map(emp => {
    const record = attendanceData[emp.id] || {};
    let leaves = 0;
    
    Object.entries(record).forEach(([key, val]) => {
        if (key.startsWith(currentYear)) {
             if (val !== 'OFF' && val !== 'HOLIDAY' && typeof val === 'number') {
                 leaves += (1 - val);
             }
        }
    });

    return { name: emp.name.split(' ')[0], leaves };
  });

  const handleGenerateReport = () => {
     // Generate CSV content
     const headers = ['Employee ID', 'Name', 'Department', 'Present Days', 'Absent Days', 'Leaves Taken', 'Leaves Remaining'];
     
     const rows = employees.map(emp => {
         const record = attendanceData[emp.id] || {};
         let present = 0, absent = 0, leaves = 0;
         
         Object.entries(record).forEach(([key, val]) => {
             if (key.startsWith(currentYear)) {
                 if (val === 1) present++;
                 else if (val === 0) absent++;
                 else if (typeof val === 'number') {
                     leaves += (1 - val);
                     present += val;
                 }
             }
         });
         
         return [
             emp.id,
             `"${emp.name}"`,
             emp.department,
             present.toFixed(1),
             absent,
             leaves.toFixed(1),
             (LEAVE_QUOTA_YEARLY - leaves).toFixed(1)
         ].join(',');
     });

     const csvContent = [headers.join(','), ...rows].join('\n');
     const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
     const link = document.createElement('a');
     link.href = URL.createObjectURL(blob);
     link.download = `Attendance_Report_${currentYear}_${format(new Date(), 'yyyy-MM-dd')}.csv`;
     document.body.appendChild(link);
     link.click();
     document.body.removeChild(link);
  };

  const StatCard = ({ title, value, icon: Icon, gradient, delay }: any) => (
    <div 
      style={{ animationDelay: delay }}
      className="bg-white/80 backdrop-blur-xl p-6 rounded-3xl shadow-[0_10px_30px_-10px_rgba(0,0,0,0.1)] border border-white/50 flex items-center justify-between group hover:-translate-y-2 hover:shadow-[0_20px_40px_-10px_rgba(0,0,0,0.15)] transition-all duration-300 animate-scale-in"
    >
      <div>
        <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-2">{title}</p>
        <p className="text-4xl font-extrabold text-slate-800 tracking-tight">{isSundayToday ? '-' : value}</p>
      </div>
      <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${gradient} text-white flex items-center justify-center shadow-lg transform rotate-3 group-hover:rotate-12 group-hover:scale-110 transition-transform duration-500`}>
        <Icon size={32} />
      </div>
    </div>
  );

  return (
    <div className="p-4 md:p-8 h-full overflow-auto">
      <div className="mb-8 md:mb-10 animate-fade-in-up">
        <h2 className="text-2xl md:text-3xl font-extrabold text-slate-800 tracking-tight">Admin Dashboard</h2>
        <p className="text-slate-500 font-medium mt-1">Overview for {format(currentDate, 'MMMM do, yyyy')}</p>
      </div>

      {isSundayToday && (
        <div className="bg-gradient-to-r from-green-500 to-emerald-600 text-white p-6 rounded-3xl shadow-lg shadow-green-500/20 mb-8 flex items-center gap-4 animate-scale-in">
          <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm shrink-0">
            <CheckCircle2 size={24} />
          </div>
          <span className="font-bold text-lg">Today is Sunday. No attendance tracking required.</span>
        </div>
      )}

      {/* Birthday Banner for Admin */}
      {birthdaysToday.length > 0 && (
          <div className="mb-8 p-6 rounded-3xl bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-lg shadow-pink-500/30 flex items-center gap-6 animate-scale-in relative overflow-hidden">
              <div className="absolute -right-10 -top-10 text-white/20">
                  <Cake size={150} />
              </div>
              <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-md shadow-inner shrink-0">
                  <Cake size={32} />
              </div>
              <div className="relative z-10">
                  <h3 className="font-bold text-lg uppercase tracking-wider mb-1">Birthdays Today 🎂</h3>
                  <div className="flex flex-wrap gap-2">
                      {birthdaysToday.map(emp => (
                          <span key={emp.id} className="font-black text-xl bg-white/20 px-3 py-1 rounded-lg backdrop-blur-sm">
                              {emp.name}
                          </span>
                      ))}
                  </div>
              </div>
          </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-8 md:mb-10">
        <StatCard title="Total Team" value={employees.length} icon={Users} gradient="from-blue-500 to-blue-600" delay="0ms" />
        <StatCard title="Present Today" value={presentToday} icon={CheckCircle2} gradient="from-emerald-400 to-emerald-600" delay="100ms" />
        <StatCard title="Absent Today" value={absentToday} icon={AlertTriangle} gradient="from-red-400 to-red-600" delay="200ms" />
        <StatCard title="On Leave/Half" value={leaveToday} icon={Clock} gradient="from-orange-400 to-orange-600" delay="300ms" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white/70 backdrop-blur-xl p-6 md:p-8 rounded-3xl shadow-sm border border-white/60 animate-fade-in-up" style={{ animationDelay: '400ms' }}>
          <h3 className="text-lg font-bold text-slate-800 mb-8 flex items-center gap-2">
            <span className="w-1.5 h-6 bg-blue-500 rounded-full"></span>
            Yearly Leave Analysis (Current Year)
          </h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12, fontWeight: 600}} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                <Tooltip 
                  cursor={{fill: '#f1f5f9'}}
                  contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 30px -5px rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.9)'}}
                />
                <Bar dataKey="leaves" radius={[8, 8, 0, 0]} barSize={40}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.leaves > LEAVE_QUOTA_YEARLY ? '#ef4444' : '#3b82f6'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white/70 backdrop-blur-xl p-6 md:p-8 rounded-3xl shadow-sm border border-white/60 animate-fade-in-up" style={{ animationDelay: '500ms' }}>
          <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
             <span className="w-1.5 h-6 bg-slate-800 rounded-full"></span>
             Quick Actions
          </h3>
          <div className="space-y-4">
            <button 
              onClick={handleGenerateReport}
              className="w-full text-left p-5 rounded-2xl border border-white/50 bg-white/50 hover:bg-white hover:shadow-lg hover:shadow-blue-500/10 hover:-translate-y-1 transition-all flex items-center justify-between group"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600 shadow-sm group-hover:bg-blue-600 group-hover:text-white transition-colors duration-300">
                  <Download size={22} />
                </div>
                <div>
                  <span className="block font-bold text-slate-800">Generate Report</span>
                  <span className="text-xs text-slate-500 mt-1 font-medium">Export attendance to CSV</span>
                </div>
              </div>
              <ChevronRight size={18} className="text-slate-300 group-hover:text-blue-600 transition-colors" />
            </button>
            
            <button 
              onClick={() => onNavigate(ViewMode.LEAVES)}
              className="w-full text-left p-5 rounded-2xl border border-white/50 bg-white/50 hover:bg-white hover:shadow-lg hover:shadow-orange-500/10 hover:-translate-y-1 transition-all flex items-center justify-between group"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-orange-50 rounded-xl flex items-center justify-center text-orange-600 shadow-sm group-hover:bg-orange-600 group-hover:text-white transition-colors duration-300">
                  <RefreshCw size={22} />
                </div>
                <div>
                  <span className="block font-bold text-slate-800">Leaves Overview</span>
                  <span className="text-xs text-slate-500 mt-1 font-medium">Check yearly quotas</span>
                </div>
              </div>
              <ChevronRight size={18} className="text-slate-300 group-hover:text-orange-600 transition-colors" />
            </button>

             <button 
              onClick={() => onNavigate(ViewMode.EMPLOYEES)}
              className="w-full text-left p-5 rounded-2xl border border-white/50 bg-white/50 hover:bg-white hover:shadow-lg hover:shadow-slate-500/10 hover:-translate-y-1 transition-all flex items-center justify-between group"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center text-slate-600 shadow-sm group-hover:bg-slate-800 group-hover:text-white transition-colors duration-300">
                  <UserCog size={22} />
                </div>
                <div>
                  <span className="block font-bold text-slate-800">Manage Team</span>
                  <span className="text-xs text-slate-500 mt-1 font-medium">Add or edit team members</span>
                </div>
              </div>
              <ChevronRight size={18} className="text-slate-300 group-hover:text-slate-800 transition-colors" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
