import React, { useState, useEffect, useRef } from 'react';
import { User, AttendanceRecord, Employee, TimeLog, Task, SundayRequest, Notification } from '../types';
import { formatDateKey, isDateSunday } from '../utils/dateUtils';
import { format, differenceInSeconds, differenceInYears, getDate, getMonth } from 'date-fns';
import { 
  CheckCircle, Clock, Calendar, ShieldCheck, LogOut, 
  PlayCircle, MapPin, Mail, Briefcase, User as UserIcon, 
  Cake, Camera, BarChart, FileText, Upload, CheckCircle2, 
  X, AlertTriangle, TrendingUp, Award, Zap, ChevronRight, FileBarChart, RefreshCw, ImagePlus
} from 'lucide-react';

import { ImageCropModal } from './ImageCropModal';
import { convertFileToBase64 } from '../utils/fileHelper';

interface EmployeeDashboardProps {
  user: User;
  attendanceData: Record<string, AttendanceRecord>;
  timeLogs: Record<string, Record<string, TimeLog[]>>; // empId -> date -> Array of Logs
  onClockIn: () => void;
  onClockOut: () => void;
  employees: Employee[];
  tasks: Task[];
  onUpdateProfile?: (empId: string, data: Partial<Employee>) => void;
  sundayRequests: SundayRequest[];
  setSundayRequests: React.Dispatch<React.SetStateAction<SundayRequest[]>>;
  addNotification: (title: string, msg: string, type: Notification['type'], targetUser: string) => void;
}

export const EmployeeDashboard: React.FC<EmployeeDashboardProps> = ({
  user,
  attendanceData,
  timeLogs,
  onClockIn,
  onClockOut,
  employees,
  tasks,
  onUpdateProfile,
  sundayRequests,
  setSundayRequests,
  addNotification
}) => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
        window.location.reload();
    }, 600);
  };
  const today = new Date();
  const dateKey = formatDateKey(today);
  const isSunday = isDateSunday(today);
  const currentYear = today.getFullYear().toString();

  const empId = user.employeeId || '';
  const empAttendance = attendanceData[empId] || {};
  const todayAttVal = empAttendance[dateKey];
  const dayLogs = timeLogs[empId]?.[dateKey] || [];
  const activeLog = dayLogs.find(l => !l.clockOut);
  const isClockedIn = !!activeLog;
  const isShiftComplete = dayLogs.length > 0 && !isClockedIn; 

  // Total hours for today from all sessions
  const todayDuration = dayLogs.reduce((sum, l) => sum + (l.durationHours || 0), 0);
  const isAnyLogToday = dayLogs.length > 0;

  // Retrieve Full Employee Details
  const employeeDetails = employees.find(e => e.id === empId);

  // Check for Birthday
  const isBirthday = (() => {
    if (!employeeDetails?.birthDate) return false;
    const dob = new Date(employeeDetails.birthDate);
    return today.getDate() === dob.getDate() && today.getMonth() === dob.getMonth();
  })();

  // Performance Report State
  const [showPerformanceReport, setShowPerformanceReport] = useState(false);

  // Sunday Request Logic
  const [showSundayReqModal, setShowSundayReqModal] = useState(false);
  const [sundayReason, setSundayReason] = useState('');
  const existingSundayReq = sundayRequests.find(r => r.employeeId === empId && r.date === dateKey);

  const handleSundayRequest = () => {
    if (!sundayReason) return;
    const newReq: SundayRequest = {
      id: `SR-${Date.now()}`,
      employeeId: empId,
      date: dateKey,
      reason: sundayReason,
      status: 'PENDING'
    };
    setSundayRequests(prev => [...prev, newReq]);
    setShowSundayReqModal(false);
    setSundayReason('');
    addNotification('Sunday Request', 'Your request for Sunday work has been submitted for approval.', 'SYSTEM', 'ADMIN');
  };

  // Calculate Age and Tenure
  const age = employeeDetails?.birthDate
    ? differenceInYears(today, new Date(employeeDetails.birthDate))
    : 'N/A';

  const tenure = employeeDetails?.joiningDate
    ? differenceInYears(today, new Date(employeeDetails.joiningDate))
    : 0;

  useEffect(() => {
    let interval: any;
    if (isClockedIn && activeLog?.clockIn) {
      interval = setInterval(() => {
        const start = new Date(activeLog.clockIn);
        const now = new Date();
        const activeElapsed = differenceInSeconds(now, start);
        const prevElapsed = dayLogs.filter(l => l.id !== activeLog.id).reduce((sum, l) => sum + (l.durationHours || 0) * 3600, 0);
        setElapsed(prevElapsed + activeElapsed);
      }, 1000);
    } else if (isAnyLogToday) {
      setElapsed(todayDuration * 3600);
    } else {
      setElapsed(0);
    }
    return () => clearInterval(interval);
  }, [isClockedIn, activeLog, dayLogs, todayDuration, isAnyLogToday]);

  const formatTime = (totalSeconds: number) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      // Reset input so same file can be re-selected after cancel
      e.target.value = '';
      try {
        const base64 = await convertFileToBase64(file);
        // Open crop modal instead of saving directly
        setCropSrc(base64);
      } catch (err) {
        console.error('Failed to read file', err);
      }
    }
  };

  const handleCropComplete = (croppedBase64: string) => {
    setCropSrc(null);
    if (onUpdateProfile && empId) {
      onUpdateProfile(empId, { avatar: croppedBase64 });
    }
  };

  const handleDocUpload = async (field: 'aadharFront' | 'aadharBack' | 'panFront' | 'panBack', file: File) => {
    if (onUpdateProfile && file) {
      try {
        const base64 = await convertFileToBase64(file);
        const currentDocs = employeeDetails?.documents || {};
        onUpdateProfile(empId, {
          documents: {
            ...currentDocs,
            [field]: base64
          }
        });
      } catch (err) {
        console.error(err);
        addNotification('System Error', 'Failed to upload document. Please ensure it is an image or PDF and try again.', 'SYSTEM', String(empId));
      }
    }
  };

  let takenLeaves = 0;
  Object.entries(empAttendance).forEach(([key, val]) => {
    if (key.startsWith(currentYear)) {
      if (typeof val === 'number') {
        takenLeaves += (1 - val);
      }
    }
  });


  const hoursWorked = elapsed / 3600;
  const overtime = Math.max(0, hoursWorked - 8);

  // Filter out HOLD and TERMINATED tasks from performance calculation
  const myTasks = tasks.filter(t => {
      if (t.assignedTo !== empId) return false;
      const st = (t.status || '').toUpperCase();
      if (st === 'HOLD' || st === 'TERMINATED') return false;
      return true;
  });
  
  const totalTasks = myTasks.length;
  const completedTasks = myTasks.filter(t => t.completionDate || t.status === 'COMPLETED' || t.status?.toUpperCase() === 'COMPLETED').length;

  const todayStr = new Date().toISOString().split('T')[0];
  const normalizeDate = (d?: string | null) => {
    if (!d) return '';
    try { const dt = new Date(d); if (isNaN(dt.getTime())) return ''; return dt.toISOString().split('T')[0]; } catch (e) { return ''; }
  };
  const overdueTasks = myTasks.filter(t => {
    if (t.completionDate) return false;
    if (t.status?.toUpperCase() === 'COMPLETED') return false;
    if ((t.status || '').toUpperCase() === 'HOLD') return false;
    if ((t.status || '').toUpperCase() === 'OVERDUE') return true;
    const due = normalizeDate(t.dueDate);
    if (due && due < todayStr) return true;
    return false;
  }).length;

  const timelyCompleted = myTasks.filter(t => {
    if (!t.completionDate || !t.dueDate) return false;
    try {
      return new Date(t.completionDate).getTime() <= new Date(t.dueDate).getTime();
    } catch (e) { return false; }
  }).length;
  const pendingTasks = totalTasks - completedTasks;
  const performanceScore = totalTasks > 0 ? Math.round((pendingTasks / totalTasks) * 100) : 0;

  const DocUploadButton = ({ label, field, existing }: { label: string, field: 'aadharFront' | 'aadharBack' | 'panFront' | 'panBack', existing?: string }) => (
    <div className="relative group">
      <label className={`block w-full border-2 border-dashed rounded-2xl p-4 text-center cursor-pointer transition-all duration-300 ${existing ? 'border-emerald-200 bg-emerald-50/30' : 'border-slate-200 hover:border-blue-400 hover:bg-slate-50'}`}>
        <input type="file" className="hidden" accept="image/*,application/pdf" onChange={(e) => e.target.files?.[0] && handleDocUpload(field, e.target.files[0])} />
        {existing ? (
          <div className="text-emerald-600">
            <CheckCircle2 size={24} className="mx-auto mb-1 animate-scale-in" />
            <span className="text-[10px] font-black uppercase tracking-widest">Available</span>
          </div>
        ) : (
          <div className="text-slate-400 group-hover:text-blue-500">
            <Upload size={24} className="mx-auto mb-1" />
            <span className="text-[10px] font-black uppercase tracking-widest">Missing</span>
          </div>
        )}
      </label>
      <p className="text-[10px] text-center font-black text-slate-500 uppercase mt-3 tracking-widest">{label}</p>
    </div>
  );

  return (
    <>
    <div className="p-4 md:p-8 h-full overflow-auto bg-[#f8fafc] custom-scrollbar">
      <div className="max-w-7xl mx-auto space-y-10 animate-fade-in-up">

        {/* Dynamic Greeting & Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div className="flex items-center gap-6">
                <div className="relative group">
                    <div className="w-20 h-20 bg-white rounded-3xl shadow-xl border border-slate-100 flex items-center justify-center p-1 overflow-hidden">
                        {employeeDetails?.avatar ? (
                            <img src={employeeDetails.avatar} className="w-full h-full object-cover rounded-[1.25rem]" alt="Profile" />
                        ) : (
                            <UserIcon size={40} className="text-slate-300" />
                        )}
                    </div>
                    {/* Camera overlay — always clickable */}
                    <button
                        onClick={() => avatarInputRef.current?.click()}
                        className="absolute inset-0 bg-slate-900/50 rounded-3xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 cursor-pointer backdrop-blur-sm"
                        title={employeeDetails?.avatar ? 'Replace Photo' : 'Upload Photo'}
                    >
                        <Camera size={20} className="text-white" />
                    </button>
                    {/* Hidden file input */}
                    <input ref={avatarInputRef} type="file" className="hidden" accept="image/*" onChange={handleAvatarChange} />
                </div>
                <div>
                   <p className="text-slate-500 font-bold text-sm">Welcome back,</p>
                   <h1 className="text-4xl font-black text-slate-900 tracking-tight">{user.name} <span className="text-blue-600">.</span></h1>
                   <div className="flex items-center gap-3 mt-1.5">
                        <span className="px-3 py-1 bg-white border border-slate-100 rounded-full text-[10px] font-black text-slate-500 uppercase tracking-widest shadow-sm">
                            {employeeDetails?.designation || 'Staff'}
                        </span>
                        <p className="text-slate-400 font-bold text-xs">{format(today, 'EEEE, MMMM do, yyyy')}</p>
                   </div>
                   {/* Change/Upload photo link */}
                   <button
                     onClick={() => avatarInputRef.current?.click()}
                     className="mt-2 flex items-center gap-1.5 text-[10px] font-black text-indigo-500 hover:text-indigo-700 uppercase tracking-widest transition-colors"
                   >
                     <Camera size={11} />
                     {employeeDetails?.avatar ? 'Replace Photo' : 'Upload Photo'}
                   </button>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 w-full md:w-auto">
                {/* 🌟 UNIQUE REFRESH BUTTON 🌟 */}
                <button
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                    className={`group relative flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-sm transition-all duration-300 active:scale-95 overflow-hidden border shadow-sm ${
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

                <div className="px-6 py-4 bg-white rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-6">
                    <div className="flex gap-4">
                        <div className="text-center">
                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Total</p>
                            <p className="text-sm font-black text-slate-800">{totalTasks}</p>
                        </div>
                        <div className="text-center border-l border-slate-100 pl-4">
                            <p className="text-[8px] font-black text-emerald-500 uppercase tracking-widest mb-1">Done</p>
                            <p className="text-sm font-black text-emerald-600">{completedTasks}</p>
                        </div>
                        <div className="text-center border-l border-slate-100 pl-4">
                            <p className="text-[8px] font-black text-amber-500 uppercase tracking-widest mb-1">Stay</p>
                            <p className="text-sm font-black text-amber-600">{pendingTasks}</p>
                        </div>
                    </div>
                    <div className="h-8 w-px bg-slate-100 hidden sm:block"></div>
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center">
                            <Award size={20} />
                        </div>
                        <div>
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Score</p>
                            <p className="text-xl font-black text-slate-800 leading-none">{performanceScore}%</p>
                        </div>
                        <button 
                          onClick={() => setShowPerformanceReport(true)}
                          className="ml-4 p-2.5 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-all active:scale-95 shadow-lg shadow-slate-200"
                        >
                          <FileBarChart size={18} />
                        </button>
                    </div>
                </div>
            </div>
        </div>

        {isBirthday && (
          <div className="p-8 rounded-[3rem] border border-pink-100 bg-white shadow-xl shadow-pink-500/5 flex items-center gap-8 animate-scale-in relative overflow-hidden group">
              <div className="absolute -right-20 -top-20 text-pink-500/5 transform group-hover:scale-110 transition-transform duration-700">
                  <Cake size={300} />
              </div>
              <div className="w-20 h-20 bg-gradient-to-tr from-pink-500 to-rose-600 rounded-3xl flex items-center justify-center text-white shadow-lg shadow-pink-200 shrink-0 transform group-hover:rotate-6 transition-transform">
                  <Cake size={36} />
              </div>
              <div className="relative z-10 flex-1">
                  <p className="text-pink-600 font-black text-[10px] uppercase tracking-[0.3em] mb-2 leading-none">Special Occasion</p>
                  <h3 className="font-extrabold text-2xl text-slate-800 mb-2 tracking-tight">Happy Birthday, {user.name}! 🎂</h3>
                  <p className="text-slate-500 font-medium">Wishing you a spectacular year ahead from all of us at Kalra Buildtech.</p>
              </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          
          {/* Main Column: Shift Control & Tasks */}
          <div className="lg:col-span-8 space-y-10">
            
            {/* Professional Shift Tracker */}
            <div className="bg-slate-900 border border-slate-800 rounded-[3.5rem] p-10 md:p-14 shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-10 opacity-5 pointer-events-none group-hover:scale-110 transition-transform duration-700">
                    <Clock size={250} className="text-white" />
                </div>
                
                <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-12">
                    <div className="text-center md:text-left space-y-6 flex-1">
                        <div>
                            <div className="inline-flex items-center gap-2 mb-4 bg-white/10 px-4 py-1.5 rounded-full border border-white/10">
                                <span className={`w-2 h-2 rounded-full ${isClockedIn ? 'bg-emerald-400 animate-pulse' : 'bg-slate-400'}`}></span>
                                <span className="text-[10px] font-black text-white/70 uppercase tracking-[0.2em]">{isClockedIn ? 'Session Live' : 'Not Clocked In'}</span>
                            </div>
                            <div className="font-mono text-7xl md:text-8xl font-black text-white tracking-tighter drop-shadow-2xl">
                                {formatTime(elapsed)}
                            </div>
                        </div>

                        <div className="flex flex-wrap justify-center md:justify-start gap-4">
                            <div className="px-5 py-3 bg-white/5 rounded-2xl border border-white/5 flex items-center gap-3">
                                <Zap size={18} className="text-yellow-400" />
                                <div>
                                    <p className="text-[9px] font-black text-white/40 uppercase tracking-widest leading-none mb-1">Target Hours</p>
                                    <p className="text-sm font-black text-white leading-none">08:00:00</p>
                                </div>
                            </div>
                            <div className="px-5 py-3 bg-white/5 rounded-2xl border border-white/5 flex items-center gap-3">
                                <TrendingUp size={18} className="text-emerald-400" />
                                <div>
                                    <p className="text-[9px] font-black text-white/40 uppercase tracking-widest leading-none mb-1">Overtime</p>
                                    <p className="text-sm font-black text-white leading-none">{overtime.toFixed(2)}h</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="w-full md:w-auto shrink-0 flex flex-col gap-4">
                        {isSunday && !isClockedIn && !isShiftComplete && existingSundayReq?.status !== 'APPROVED' ? (
                            <div className="bg-orange-500/10 border border-orange-500/20 p-8 rounded-[2.5rem] backdrop-blur-md text-center max-w-sm">
                                <AlertTriangle size={32} className="text-orange-500 mx-auto mb-4" />
                                <h3 className="text-white font-black text-lg mb-2 leading-tight">Sunday Protocol Active</h3>
                                {existingSundayReq ? (
                                    <div className="text-xs font-black text-orange-400 uppercase tracking-widest mt-4">
                                        Status: {existingSundayReq.status}
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => setShowSundayReqModal(true)}
                                        className="w-full bg-orange-600 hover:bg-orange-700 text-white font-black py-4 rounded-2xl transition-all shadow-xl shadow-orange-600/30 mt-4 active:scale-95 translate-y-0 hover:-translate-y-1"
                                    >
                                        Unlock Work Access
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-4 min-w-[240px]">
                                {isShiftComplete ? (
                                    <div className="bg-emerald-500/10 border border-emerald-500/20 p-8 rounded-[2.5rem] text-center">
                                        <CheckCircle size={36} className="text-emerald-500 mx-auto mb-3" />
                                        <p className="text-white font-black text-lg">Shift Completed</p>
                                        <p className="text-emerald-400/70 text-[10px] font-black uppercase tracking-widest mt-1">Total: {todayDuration.toFixed(2)} Hrs</p>
                                    </div>
                                ) : isClockedIn ? (
                                    <button
                                        onClick={onClockOut}
                                        className="w-full bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 text-white font-black py-6 rounded-3xl shadow-2xl shadow-red-900/40 active:scale-95 transition-all text-xl flex items-center justify-center gap-4 group/btn"
                                    >
                                        <LogOut size={24} className="group-hover:rotate-12 transition-transform" />
                                        End Session
                                    </button>
                                ) : (
                                    <button
                                        onClick={onClockIn}
                                        className="w-full bg-white text-slate-900 font-black py-6 rounded-3xl shadow-2xl shadow-white/10 active:scale-95 transition-all text-xl flex items-center justify-center gap-4 hover:bg-blue-50 transition-colors"
                                    >
                                        <PlayCircle size={24} className="text-blue-600" />
                                        Begin Shift
                                    </button>
                                )}
                                {isClockedIn && activeLog?.clockIn && (
                                    <p className="text-center text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">Started at {format(new Date(activeLog.clockIn), 'HH:mm:ss')}</p>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Profile Insights Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-[0_20px_50px_-15px_rgba(0,0,0,0.03)] group hover:border-slate-300 transition-all duration-500 relative overflow-hidden">
                    <div className="absolute -right-4 -top-4 w-24 h-24 bg-blue-500/5 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700"></div>
                    <h3 className="text-lg font-black text-slate-900 mb-6 flex items-center justify-between">
                        Personnel Bio 
                        <UserIcon size={20} className="text-blue-500" />
                    </h3>
                    <div className="space-y-5">
                       <div className="flex items-center justify-between py-3 border-b border-slate-50">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Full Legal Name</span>
                          <span className="text-sm font-black text-slate-800">{user.name}</span>
                       </div>
                       <div className="flex items-center justify-between py-3 border-b border-slate-50">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Active Tenure</span>
                          <span className="text-sm font-black text-slate-800">{tenure < 1 ? 'Probation' : `${tenure} Years`}</span>
                       </div>
                       <div className="flex items-center justify-between py-3 border-b border-slate-50">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Date of Birth</span>
                          <span className="text-sm font-black text-slate-800">{employeeDetails?.birthDate || 'Not Set'}</span>
                       </div>
                       <div className="flex items-center justify-between py-3 border-b border-slate-50">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Current Age</span>
                          <span className="text-sm font-black text-slate-800">{age} Years Old</span>
                       </div>
                       <div className="flex items-center justify-between py-3">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Work Location</span>
                          <span className="text-sm font-black text-slate-800 truncate max-w-[150px]">{employeeDetails?.address || 'Primary HQ'}</span>
                       </div>
                    </div>
                </div>

                <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-[0_20px_50px_-15px_rgba(0,0,0,0.03)] group hover:border-slate-300 transition-all duration-500 relative overflow-hidden">
                    <div className="absolute -right-4 -top-4 w-24 h-24 bg-indigo-500/5 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700"></div>
                    <h3 className="text-lg font-black text-slate-900 mb-6 flex items-center justify-between">
                        Productivity Stats
                        <BarChart size={20} className="text-indigo-500" />
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100">
                           <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-2">Done Tasks</p>
                           <p className="text-2xl font-black text-emerald-600 leading-none">{completedTasks}</p>
                        </div>
                        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100">
                           <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-2">Stay Tasks</p>
                           <p className="text-2xl font-black text-amber-500 leading-none">{pendingTasks}</p>
                        </div>
                        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100">
                           <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-2">Overdue</p>
                           <p className="text-2xl font-black text-red-500 leading-none">{overdueTasks}</p>
                        </div>
                        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100">
                           <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-2">Load Score</p>
                           <p className="text-2xl font-black text-indigo-600 leading-none">{performanceScore}%</p>
                        </div>
                    </div>
                </div>
            </div>

          </div>

          {/* Right Column: Quotas & Compliance */}
          <div className="lg:col-span-4 space-y-10">
            
            {/* Leave Analysis Card */}
            <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.05)] relative overflow-hidden group hover:border-blue-200 transition-all duration-500">
                <div className="absolute top-0 right-0 p-6 text-blue-500/5 group-hover:scale-110 transition-transform">
                   <Calendar size={120} />
                </div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mb-4">Leave Analysis</p>
                <h3 className="text-2xl font-black text-slate-900 mb-8 leading-tight">Total Leaves <br/>Taken <span className="text-blue-600">{currentYear}</span></h3>
                
                <div className="space-y-8 flex flex-col justify-center items-center py-4">
                    <div className="flex flex-col items-center justify-center bg-blue-50/50 p-8 rounded-3xl border border-dashed border-blue-200 w-full">
                        <span className="text-blue-400 text-[10px] font-black uppercase tracking-widest mb-2">Total</span>
                        <div className="flex items-baseline gap-2">
                            <span className="text-6xl font-black text-blue-600 tracking-tighter">{takenLeaves.toFixed(1)}</span>
                            <span className="text-xl font-bold text-blue-400">Days</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Compliance Card */}
            <div className="bg-slate-900 p-10 rounded-[3rem] shadow-2xl relative overflow-hidden group">
                <div className="absolute bottom-0 right-0 p-4 text-white/5 transform rotate-12 translate-x-4 translate-y-4">
                    <ShieldCheck size={160} />
                </div>
                <div className="flex items-center justify-between mb-8 relative z-10">
                    <h3 className="text-xl font-black text-white flex items-center gap-3">
                        <ShieldCheck className="text-emerald-400" size={24} />
                        Compliance
                    </h3>
                    <span className="text-[8px] font-black bg-red-500 text-white px-2 py-1 rounded tracking-tighter uppercase">Mandatory</span>
                </div>
                
                <div className="grid grid-cols-2 gap-4 relative z-10">
                    <DocUploadButton label="Aadhar Front" field="aadharFront" existing={employeeDetails?.documents?.aadharFront} />
                    <DocUploadButton label="Aadhar Back" field="aadharBack" existing={employeeDetails?.documents?.aadharBack} />
                    <DocUploadButton label="PAN Front" field="panFront" existing={employeeDetails?.documents?.panFront} />
                    <DocUploadButton label="PAN Back" field="panBack" existing={employeeDetails?.documents?.panBack} />
                </div>

                <div className="mt-8 p-5 bg-white/5 backdrop-blur-md rounded-2xl border border-white/5 relative z-10">
                    <div className="flex items-center gap-4">
                        <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center text-white">
                            <FileText size={16} />
                        </div>
                        <div>
                            <p className="text-xs font-black text-white leading-none mb-1">Verify Credentials</p>
                            <p className="text-[9px] text-white/40 uppercase tracking-widest truncate">Secure SQLite Storage Active</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Quick Actions Panel */}
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-4">
                <button className="w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 rounded-2xl transition-all group">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-white shadow-sm rounded-xl flex items-center justify-center text-slate-800 group-hover:bg-slate-800 group-hover:text-white transition-all">
                            <Clock size={18} />
                        </div>
                        <span className="text-sm font-black text-slate-800 tracking-tight">Time Logs History</span>
                    </div>
                    <ChevronRight size={18} className="text-slate-300 group-hover:translate-x-1 transition-transform" />
                </button>
                <button className="w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 rounded-2xl transition-all group">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-white shadow-sm rounded-xl flex items-center justify-center text-slate-800 group-hover:bg-slate-800 group-hover:text-white transition-all">
                            <ShieldCheck size={18} />
                        </div>
                        <span className="text-sm font-black text-slate-800 tracking-tight">Access Permissions</span>
                    </div>
                    <ChevronRight size={18} className="text-slate-300 group-hover:translate-x-1 transition-transform" />
                </button>
            </div>

          </div>
        </div>

        {/* Global UI Components (Modals, etc.) */}
        {showSundayReqModal && (
          <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center z-[100] p-4 animate-fade-in">
            <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-md overflow-hidden p-10 animate-scale-in border border-white/20">
              <div className="flex justify-between items-center mb-8">
                <div className="w-14 h-14 bg-orange-50 text-orange-600 rounded-2xl flex items-center justify-center">
                    <AlertTriangle size={28} />
                </div>
                <button 
                    onClick={() => setShowSundayReqModal(false)}
                    className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                >
                    <X size={24} className="text-slate-400" />
                </button>
              </div>
              <h3 className="text-3xl font-black text-slate-900 mb-3 tracking-tight">Sunday Protocol</h3>
              <p className="text-slate-500 font-bold mb-8 leading-relaxed">Please provide a valid reason for working on a scheduled off-day. Requests are reviewed by the administration for approval.</p>
              
              <textarea
                className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-6 focus:ring-4 focus:ring-orange-500/10 focus:border-orange-500 outline-none h-40 resize-none mb-8 text-slate-800 font-bold text-sm"
                placeholder="Specify your reason (e.g. Urgent site inspection, emergency repairs...)"
                value={sundayReason}
                onChange={e => setSundayReason(e.target.value)}
              />
              
              <button
                onClick={handleSundayRequest}
                disabled={!sundayReason.trim()}
                className="w-full bg-slate-900 hover:bg-slate-800 text-white font-black py-5 rounded-[2rem] shadow-2xl shadow-slate-900/20 active:scale-95 transition-all text-lg disabled:opacity-50 disabled:pointer-events-none"
              >
                Submit Request
              </button>
            </div>
          </div>
        )}

        {/* PERFORMANCE REPORT MODAL */}
        {showPerformanceReport && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xl flex items-center justify-center z-[150] p-4 md:p-10 animate-fade-in">
            <div className="bg-white rounded-[4rem] shadow-2xl w-full max-w-5xl overflow-hidden relative animate-scale-in">
              {/* Report Header */}
              <div className="p-10 md:p-14 flex justify-between items-start border-b border-slate-50">
                <div className="flex items-center gap-6">
                  <div className="w-16 h-16 bg-slate-900 text-white rounded-3xl flex items-center justify-center shadow-2xl rotate-12 group-hover:rotate-0 transition-transform">
                    <Zap size={32} />
                  </div>
                  <div>
                    <h2 className="text-3xl font-black text-slate-900 tracking-tighter uppercase leading-none">Kalra Buildtech</h2>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em] mt-3">Personnel Performance Report</p>
                  </div>
                </div>
                <div className="text-right">
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Generated Date</p>
                   <p className="text-xl font-black text-slate-900">{format(today, 'dd MMM yyyy')}</p>
                </div>
              </div>

              {/* Report Content */}
              <div className="p-12 md:p-16">
                <div className="flex flex-col md:flex-row justify-between items-center gap-12 mb-16">
                   <div className="flex items-center gap-8">
                      <div className="w-24 h-24 bg-slate-50 rounded-[2.5rem] border border-slate-100 flex items-center justify-center p-1 relative">
                        {employeeDetails?.avatar ? (
                          <img src={employeeDetails.avatar} className="w-full h-full object-cover rounded-[2rem]" alt="" />
                        ) : (
                          <UserIcon size={40} className="text-slate-300" />
                        )}
                        <div className="absolute -bottom-2 -right-2 w-10 h-10 bg-emerald-500 text-white rounded-2xl flex items-center justify-center border-4 border-white">
                          <CheckCircle size={18} />
                        </div>
                      </div>
                      <div>
                        <h3 className="text-4xl font-black text-slate-900 tracking-tight mb-3">{user.name}</h3>
                        <div className="flex flex-wrap gap-2">
                           <span className="px-4 py-1.5 bg-slate-100 rounded-lg text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none">ID: {employeeDetails?.id || 'STAFF'}</span>
                           <span className="px-4 py-1.5 bg-slate-100 rounded-lg text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none">{employeeDetails?.designation || 'Staff'}</span>
                           <span className="px-4 py-1.5 bg-blue-100/50 border border-blue-100 rounded-lg text-[10px] font-black text-indigo-600 uppercase tracking-widest leading-none">{employeeDetails?.department || 'Information Technology'}</span>
                        </div>
                      </div>
                   </div>

                   <div className="bg-[#f0f4ff] rounded-[2.5rem] p-10 min-w-[260px] text-center shadow-xl shadow-blue-500/5 transition-transform hover:scale-105">
                      <p className="text-indigo-400 font-black text-[10px] uppercase tracking-[0.3em] mb-3">Performance</p>
                      <div className="text-7xl font-black text-[#3b35b1] tracking-tighter leading-none mb-1">
                        {performanceScore}%
                      </div>
                   </div>
                </div>

                {/* Attendance Summary Strip */}
                <div>
                   <div className="flex items-center gap-4 mb-8">
                     <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center shadow-sm">
                       <ShieldCheck size={20} />
                     </div>
                     <h4 className="text-xl font-black text-slate-900 tracking-tight uppercase">Attendance Summary <span className="text-slate-300 font-bold">/ {currentYear}</span></h4>
                   </div>
                   
                   <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                      {[
                        { label: 'Total Logs', value: Object.keys(empAttendance).length, color: 'slate' },
                        { label: 'Leaves Taken', value: takenLeaves.toFixed(1), color: 'rose' },
                        { label: 'Days Present', value: Object.values(empAttendance).filter(v => v === 1 || (typeof v === 'number' && v > 0 && v < 1)).length.toString(), color: 'indigo' },
                        { label: 'Overtime Hrs', value: overtime.toFixed(1), color: 'emerald' }
                      ].map((item, i) => (
                        <div key={i} className={`p-8 bg-${item.color}-50/50 border border-${item.color}-100 rounded-[2.5rem] transition-all hover:shadow-lg hover:shadow-${item.color}-500/5 group`}>
                          <p className={`text-[10px] font-black text-${item.color}-400 uppercase tracking-[0.2em] mb-4 group-hover:translate-x-1 transition-transform`}>{item.label}</p>
                          <p className="text-4xl font-black text-slate-900 tracking-tighter">{item.value}</p>
                        </div>
                      ))}
                   </div>
                </div>
              </div>

              {/* Close Button Overlay */}
              <button 
                onClick={() => setShowPerformanceReport(false)}
                className="absolute top-10 right-10 w-12 h-12 bg-slate-50 hover:bg-rose-50 hover:text-rose-600 text-slate-400 rounded-2xl flex items-center justify-center transition-all shadow-sm active:scale-95"
              >
                <X size={24} />
              </button>
            </div>
          </div>
        )}

      </div>
    </div>

    {/* Image Crop Modal */}
    {cropSrc && (
      <ImageCropModal
        imageSrc={cropSrc}
        onCropComplete={handleCropComplete}
        onClose={() => setCropSrc(null)}
      />
    )}
  </>
  );
};