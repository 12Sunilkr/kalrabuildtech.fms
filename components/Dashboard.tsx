
import React from 'react';
import { Employee, AttendanceRecord, ViewMode, User } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, AreaChart, Area, Legend } from 'recharts';
import { Users, AlertTriangle, CheckCircle2, Clock, ChevronRight, Download, RefreshCw, UserCog, Cake, TrendingUp, Activity, Target, Zap } from 'lucide-react';
import { formatDateKey, isDateSunday } from '../utils/dateUtils';
import { format, getDate, getMonth } from 'date-fns';


interface DashboardProps {
  employees: Employee[];
  attendanceData: Record<string, AttendanceRecord>;
  onNavigate: (view: ViewMode) => void;
  currentUser?: User | null;
}

const DashboardComponent: React.FC<DashboardProps> = ({ employees, attendanceData, onNavigate, currentUser }) => {
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const currentDate = new Date();
  const dateKey = formatDateKey(currentDate);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
        window.location.reload();
    }, 600);
  };
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

  // Productivity Score (Mock logic based on attendance)
  const attendanceRate = employees.length > 0 ? Math.round((presentToday / employees.length) * 100) : 0;

  // Calculate Yearly Leaves and Absents for Chart
  const chartData = employees.map(emp => {
    const record = attendanceData[emp.id] || {};
    let leaves = 0;
    let absents = 0;
    
    Object.entries(record).forEach(([key, val]) => {
        if (key.startsWith(currentYear)) {
             if (val === 'LEAVE') {
                 leaves += 1;
             } else if (val === 0) {
                 absents += 1;
             } else if (val !== 'OFF' && val !== 'HOLIDAY' && val !== 'CO' && typeof val === 'number') {
                 if (val > 0 && val < 1) {
                     leaves += (1 - val);
                 }
             }
        }
    });

    return { name: emp.name.split(' ')[0], leaves, absents };
  });

  const handleGenerateReport = () => {
     // Generate CSV content
     const headers = ['Employee ID', 'Name', 'Department', 'Present Days', 'Absent Days', 'Leaves Taken'];
     
     const rows = employees.map(emp => {
         const record = attendanceData[emp.id] || {};
         let present = 0, absent = 0, leaves = 0;
         
         Object.entries(record).forEach(([key, val]) => {
             if (key.startsWith(currentYear)) {
             if (val === 'LEAVE') {
                 leaves += 1;
             } else if (val === 0) {
                 absent += 1;
             } else if (val === 1) {
                 present += 1;
             } else if (val !== 'OFF' && val !== 'HOLIDAY' && val !== 'CO' && typeof val === 'number') {
                 if (val > 0 && val < 1) {
                     leaves += (1 - val);
                     present += val;
                 }
             }
             }
         });
         
         return [
             emp.id,
             `"${emp.name}"`,
             emp.department,
             present.toFixed(1),
             absent,
             leaves.toFixed(1)
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

  const StatCard = ({ title, value, icon: Icon, color, delay, subtext }: any) => (
    <div 
      style={{ animationDelay: delay }}
      className="relative overflow-hidden bg-white p-7 rounded-[2rem] shadow-[0_20px_50px_-15px_rgba(0,0,0,0.05)] border border-slate-100 group hover:border-slate-300 transition-all duration-500 animate-scale-in"
    >
      <div className={`absolute -right-4 -top-4 w-24 h-24 bg-blue-500/5 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700`}></div>
      <div className="flex items-start justify-between relative z-10">
        <div>
          <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em] mb-3">{title}</p>
          <div className="flex items-baseline gap-2">
            <p className="text-4xl font-black text-slate-800 tracking-tighter">{isSundayToday ? '--' : value}</p>
            {subtext && <span className="text-xs font-bold text-slate-400">{subtext}</span>}
          </div>
        </div>
        <div className={`w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center transition-all duration-500 group-hover:shadow-lg transition-transform`}>
          <Icon size={24} strokeWidth={2.5} className={`text-${color}-500 group-hover:scale-110 transition-transform`} />
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2 relative z-10">
        <div className="h-1 flex-1 bg-slate-100 rounded-full overflow-hidden">
            <div className={`h-full bg-${color}-500 rounded-full w-2/3 group-hover:w-full transition-all duration-1000 delay-300 opacity-20 group-hover:opacity-100`}></div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="p-4 md:p-8 h-full overflow-auto custom-scrollbar bg-[#f8fafc]">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-12 animate-fade-in-up">
        <div className="flex items-center gap-6">
            <div className="w-16 h-16 bg-white rounded-2xl shadow-xl flex items-center justify-center border border-slate-100 transform -rotate-3 hover:rotate-0 transition-transform duration-500">
                <TrendingUp size={32} className="text-blue-600" />
            </div>
            <div>
                <h2 className="text-3xl font-black text-slate-900 tracking-tight">Executive Dashboard</h2>
                <div className="flex items-center gap-3 mt-1.5">
                    <span className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-600 text-[10px] font-black uppercase tracking-wider rounded-full border border-emerald-100 shadow-sm">
                        <Activity size={12} /> System Live
                    </span>
                    <p className="text-slate-500 font-bold text-xs">{format(currentDate, 'EEEE, MMMM do, yyyy')}</p>
                </div>
            </div>
        </div>
        
        <div className="flex items-center gap-4 w-full md:w-auto">
            {/* 🌟 UNIQUE REFRESH BUTTON 🌟 */}
            <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className={`group relative flex items-center gap-2 px-4 py-3 rounded-2xl font-bold text-sm transition-all duration-300 active:scale-95 overflow-hidden border ${
                    isRefreshing 
                        ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-wait'
                        : 'bg-white text-slate-800 border-slate-100 hover:border-indigo-300 hover:shadow-indigo-100 hover:shadow-lg hover:-translate-y-0.5'
                }`}
                title="Refresh Dashboard"
            >
                <div className="absolute inset-0 bg-gradient-to-r from-indigo-50/80 via-white to-purple-50/80 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                
                <div className={`relative z-10 flex items-center justify-center p-1 rounded-lg transition-all ${
                    isRefreshing ? "bg-transparent" : "bg-indigo-50 text-indigo-600 group-hover:bg-white group-hover:shadow-sm"
                }`}>
                    <Zap size={16} className={`absolute transition-opacity duration-300 ${isRefreshing ? 'opacity-0' : 'opacity-100 group-hover:opacity-0'}`} />
                    <RefreshCw size={16} className={`transition-all duration-700 ease-in-out ${isRefreshing ? 'animate-spin text-indigo-400 opacity-100' : 'opacity-0 group-hover:opacity-100 group-hover:rotate-180'}`} />
                </div>
                
                <span className="relative z-10 hidden sm:inline-block pr-1 group-hover:text-indigo-900 transition-colors">
                    {isRefreshing ? 'Syncing...' : 'Sync Now'}
                </span>
            </button>

            <div className="px-5 py-3 bg-white rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4 flex-1 md:flex-none">
                <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
                <div>
                   <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Attendance Rate</p>
                   <p className="text-lg font-black text-slate-800 leading-none">{attendanceRate}%</p>
                </div>
            </div>
        </div>
      </div>

      {isSundayToday && (
        <div className="bg-white border border-emerald-100 p-8 rounded-[2.5rem] shadow-xl shadow-emerald-500/5 mb-10 flex items-center gap-6 animate-scale-in group">
          <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center group-hover:bg-emerald-600 group-hover:text-white transition-all duration-500">
            <CheckCircle2 size={32} />
          </div>
          <div>
            <h3 className="text-xl font-black text-slate-800 mb-1 leading-tight">It's a Sunday!</h3>
            <p className="text-slate-500 font-bold">The team is recharging. No attendance tracking is active today.</p>
          </div>
        </div>
      )}

      {birthdaysToday.length > 0 && (
          <div className="mb-10 p-8 rounded-[2.5rem] border border-pink-100 bg-white shadow-xl shadow-pink-500/5 flex items-center gap-8 animate-scale-in relative overflow-hidden group">
              <div className="absolute -right-20 -top-20 text-pink-500/5 transform group-hover:scale-110 transition-transform duration-700">
                  <Cake size={300} />
              </div>
              <div className="w-20 h-20 bg-gradient-to-tr from-pink-500 to-rose-600 rounded-3xl flex items-center justify-center text-white shadow-lg shadow-pink-200 shrink-0 transform group-hover:rotate-6 transition-transform">
                  <Cake size={36} />
              </div>
              <div className="relative z-10 flex-1">
                  <p className="text-pink-600 font-black text-[10px] uppercase tracking-[0.3em] mb-2 leading-none">Celebration Alert</p>
                  <h3 className="font-extrabold text-2xl text-slate-800 mb-3 tracking-tight">Happy Birthday to our Team! 🎂</h3>
                  <div className="flex flex-wrap gap-2">
                      {birthdaysToday.map(emp => (
                          <span key={emp.id} className="text-sm font-black bg-pink-50 text-pink-700 px-4 py-1.5 rounded-xl border border-pink-100 shadow-sm">
                              {emp.name}
                          </span>
                      ))}
                  </div>
              </div>
          </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
        <StatCard title="Team Strength" value={employees.length} icon={Users} color="blue" delay="0ms" subtext="Employees" />
        <StatCard title="Active Today" value={presentToday} icon={CheckCircle2} color="emerald" delay="100ms" subtext="Staff" />
        <StatCard title="Absent Logs" value={absentToday} icon={AlertTriangle} color="red" delay="200ms" subtext="Today" />
        <StatCard title="Leave Tracking" value={leaveToday} icon={Clock} color="orange" delay="300ms" subtext="Active" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-10">
        <div className="xl:col-span-2 bg-white p-8 md:p-10 rounded-[3rem] shadow-[0_30px_60px_-15px_rgba(0,0,0,0.03)] border border-slate-100 animate-fade-in-up transition-all hover:border-slate-200" style={{ animationDelay: '400ms' }}>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-10">
            <div>
                <h3 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-3">
                    <Target className="text-blue-500" size={24} />
                    Attendance & Leave Analysis
                </h3>
                <p className="text-slate-400 text-xs font-bold mt-1">Personnel leaves and absents for {currentYear}</p>
            </div>
          </div>
          
          <div className="h-80 w-full min-w-0 min-h-[320px]">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <BarChart data={chartData} margin={{top: 10, right: 10, left: -20, bottom: 0}}>
                <defs>
                    <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3b82f6" stopOpacity={1} />
                        <stop offset="100%" stopColor="#2563eb" stopOpacity={0.8} />
                    </linearGradient>
                    <linearGradient id="warningGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#ef4444" stopOpacity={1} />
                        <stop offset="100%" stopColor="#dc2626" stopOpacity={0.8} />
                    </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 800}} 
                    dy={15} 
                />
                <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 600}} 
                />
                <Tooltip 
                  cursor={{fill: '#f8fafc'}}
                  contentStyle={{borderRadius: '20px', border: 'none', boxShadow: '0 20px 40px -10px rgba(0,0,0,0.1)', background: '#fff', padding: '15px'}}
                  itemStyle={{fontSize: '11px', fontWeight: '900', textTransform: 'uppercase'}}
                  labelStyle={{fontSize: '12px', fontWeight: '900', color: '#1e293b', marginBottom: '5px'}}
                />
                <Legend iconType="circle" wrapperStyle={{fontSize: '11px', fontWeight: '800', textTransform: 'uppercase'}} />
                <Bar dataKey="leaves" name="Leaves Taken" fill="url(#barGradient)" radius={[10, 10, 0, 0]} barSize={20} />
                <Bar dataKey="absents" name="Absent Days" fill="url(#warningGradient)" radius={[10, 10, 0, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="space-y-6 animate-fade-in-up" style={{ animationDelay: '500ms' }}>
          <div className="bg-slate-900 p-8 rounded-[3rem] shadow-2xl shadow-slate-900/20 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-8 text-white/5 transform group-hover:scale-110 transition-transform">
                <Target size={120} />
            </div>
            <h3 className="text-xl font-black text-white mb-8 relative z-10 flex items-center gap-3">
               Quick Utilities
            </h3>
            <div className="space-y-4 relative z-10">
                <button 
                  onClick={handleGenerateReport}
                  className="w-full flex items-center justify-between p-5 bg-white/10 backdrop-blur-md rounded-2xl border border-white/10 text-white hover:bg-white/20 transition-all group/item"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-500/20 transition-transform duration-300 group-hover/item:scale-110">
                      <Download size={20} />
                    </div>
                    <div className="text-left">
                      <span className="block text-sm font-black tracking-tight leading-none mb-1">Export Data</span>
                      <span className="text-[10px] font-bold text-white/50 uppercase tracking-widest">Attendance CSV</span>
                    </div>
                  </div>
                  <ChevronRight size={18} className="text-white/30 transform group-hover/item:translate-x-1 transition-transform" />
                </button>

                <button 
                  onClick={() => onNavigate(ViewMode.LEAVES)}
                  className="w-full flex items-center justify-between p-5 bg-white/10 backdrop-blur-md rounded-2xl border border-white/10 text-white hover:bg-white/20 transition-all group/item"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-orange-500 rounded-xl flex items-center justify-center text-white shadow-lg shadow-orange-500/20 transition-transform duration-300 group-hover/item:scale-110">
                      <RefreshCw size={20} />
                    </div>
                    <div className="text-left">
                      <span className="block text-sm font-black tracking-tight leading-none mb-1">Leaves Portal</span>
                      <span className="text-[10px] font-bold text-white/50 uppercase tracking-widest">Leave Management</span>
                    </div>
                  </div>
                  <ChevronRight size={18} className="text-white/30 transform group-hover/item:translate-x-1 transition-transform" />
                </button>

                {currentUser?.role !== 'PC' && (
                  <button 
                    onClick={() => onNavigate(ViewMode.EMPLOYEES)}
                    className="w-full flex items-center justify-between p-5 bg-white/10 backdrop-blur-md rounded-2xl border border-white/10 text-white hover:bg-white/20 transition-all group/item"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center text-white shadow-lg shadow-emerald-500/20 transition-transform duration-300 group-hover/item:scale-110">
                        <UserCog size={20} />
                      </div>
                      <div className="text-left">
                        <span className="block text-sm font-black tracking-tight leading-none mb-1">Team Control</span>
                        <span className="text-[10px] font-bold text-white/50 uppercase tracking-widest">Employee Master</span>
                      </div>
                    </div>
                    <ChevronRight size={18} className="text-white/30 transform group-hover/item:translate-x-1 transition-transform" />
                  </button>
                )}
            </div>
          </div>
          
          <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-8 rounded-[3rem] text-white shadow-xl shadow-blue-500/20 relative overflow-hidden group">
            <div className="absolute bottom-0 right-0 p-4 text-white/10 transform rotate-12 translate-x-4 translate-y-4">
                <Target size={160} />
            </div>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/60 mb-3">System Insights</p>
            <h4 className="text-xl font-black mb-4 tracking-tight leading-tight">Your team's efficiency is peaking today.</h4>
            <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-white w-3/4 rounded-full shadow-[0_0_10px_rgba(255,255,255,0.5)]"></div>
            </div>
            <p className="mt-4 text-[10px] font-bold text-white/50 italic">75% of scheduled tasks are in progress.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export const Dashboard = React.memo(DashboardComponent);
