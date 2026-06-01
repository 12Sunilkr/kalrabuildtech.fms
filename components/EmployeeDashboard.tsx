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

const EmployeeDashboardComponent: React.FC<EmployeeDashboardProps> = ({
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
      <label className={`block w-full border border-dashed rounded-xl p-3 text-center cursor-pointer transition-all duration-300 ${existing ? 'border-emerald-300 bg-emerald-50 hover:bg-emerald-100' : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50'}`}>
        <input type="file" className="hidden" accept="image/*,application/pdf" onChange={(e) => e.target.files?.[0] && handleDocUpload(field, e.target.files[0])} />
        {existing ? (
          <div className="text-emerald-600">
            <CheckCircle2 size={20} className="mx-auto mb-1" />
            <span className="text-[9px] font-bold uppercase tracking-wider">Uploaded</span>
          </div>
        ) : (
          <div className="text-slate-400 group-hover:text-blue-500">
            <Upload size={20} className="mx-auto mb-1" />
            <span className="text-[9px] font-bold uppercase tracking-wider">Upload</span>
          </div>
        )}
      </label>
      <p className="text-[10px] text-center font-semibold text-slate-600 mt-2">{label}</p>
    </div>
  );

  return (
    <>
    <div className="p-4 md:p-6 lg:p-8 h-full overflow-auto bg-slate-50 custom-scrollbar">
      <div className="max-w-6xl mx-auto space-y-6 animate-fade-in-up">

        {/* 1. ERP Header Bar & Profile Summary */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-6 md:p-8 flex flex-col md:flex-row items-center md:items-start gap-6">
                {/* Avatar */}
                <div className="relative group shrink-0">
                    <div className="w-24 h-24 bg-slate-100 rounded-full border-4 border-white shadow-md flex items-center justify-center overflow-hidden">
                        {employeeDetails?.avatar ? (
                            <img src={employeeDetails.avatar} className="w-full h-full object-cover" alt="Profile" />
                        ) : (
                            <UserIcon size={40} className="text-slate-300" />
                        )}
                    </div>
                    {/* Camera Button Overlapping */}
                    <button
                        onClick={() => avatarInputRef.current?.click()}
                        className="absolute bottom-0 right-0 p-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-lg border-2 border-white transition-all cursor-pointer"
                        title="Change Photo"
                    >
                        <Camera size={14} />
                    </button>
                    <input ref={avatarInputRef} type="file" className="hidden" accept="image/*" onChange={handleAvatarChange} />
                </div>
                
                {/* Info Block */}
                <div className="flex-1 text-center md:text-left flex flex-col justify-center min-h-[6rem]">
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{user.name}</h1>
                    <div className="mt-2 flex flex-wrap items-center justify-center md:justify-start gap-3 text-sm text-slate-500">
                        <span className="flex items-center gap-1.5"><Briefcase size={14} /> {employeeDetails?.designation || 'Staff'}</span>
                        <span className="hidden sm:inline text-slate-300">•</span>
                        <span className="flex items-center gap-1.5"><MapPin size={14} /> {employeeDetails?.department || 'Operations'}</span>
                        <span className="hidden sm:inline text-slate-300">•</span>
                        <span className="flex items-center gap-1.5"><Mail size={14} /> {user.email || 'N/A'}</span>
                    </div>
                </div>

                {/* Actions / Sync */}
                <div className="shrink-0 flex items-center">
                    <button
                        onClick={handleRefresh}
                        disabled={isRefreshing}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-sm transition-all shadow-sm border ${
                            isRefreshing ? 'bg-slate-50 text-slate-400 border-slate-200 cursor-wait' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                        }`}
                    >
                        <RefreshCw size={14} className={isRefreshing ? 'animate-spin text-slate-400' : ''} />
                        {isRefreshing ? 'Syncing...' : 'Sync Data'}
                    </button>
                </div>
            </div>
        </div>

        {/* 2. Birthday Notification */}
        {isBirthday && (
           <div className="bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-100 rounded-xl p-4 flex items-center gap-4 text-indigo-900 shadow-sm">
               <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg"><Cake size={20} /></div>
               <div>
                   <p className="font-semibold text-sm">Happy Birthday, {user.name}! 🎉</p>
                   <p className="text-xs opacity-80 mt-0.5">Wishing you a great day from Kalra Buildtech.</p>
               </div>
           </div>
        )}

        {/* 3. Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Left Column: Shift & Quick Stats */}
            <div className="lg:col-span-4 space-y-6">
                
                {/* Structured Shift Tracker */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                    <div className="border-b border-slate-100 bg-slate-50/50 px-5 py-4 flex items-center justify-between">
                        <h3 className="font-semibold text-slate-800 flex items-center gap-2 text-sm"><Clock size={16} className="text-indigo-500" /> Time & Attendance</h3>
                        <div className="flex items-center gap-2">
                           <span className={`w-2 h-2 rounded-full ${isClockedIn ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`}></span>
                           <span className="text-xs font-medium text-slate-500">{isClockedIn ? 'Active' : 'Offline'}</span>
                        </div>
                    </div>
                    
                    <div className="p-6 text-center flex-1 flex flex-col justify-center">
                        <div className="font-mono text-4xl sm:text-5xl font-semibold text-slate-800 tracking-tight mb-6">
                            {formatTime(elapsed)}
                        </div>
                        
                        <div className="grid grid-cols-2 gap-3 mb-6">
                            <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                                <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Target</p>
                                <p className="font-semibold text-slate-700 text-sm">08:00h</p>
                            </div>
                            <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                                <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Overtime</p>
                                <p className="font-semibold text-emerald-600 text-sm">{overtime.toFixed(2)}h</p>
                            </div>
                        </div>

                        {/* Shift Controls */}
                        {isSunday && !isClockedIn && !isShiftComplete && existingSundayReq?.status !== 'APPROVED' ? (
                            <div className="bg-orange-50 border border-orange-200 p-4 rounded-xl text-center">
                                <AlertTriangle size={24} className="text-orange-500 mx-auto mb-2" />
                                <h3 className="text-orange-900 font-bold text-sm mb-1">Sunday Protocol</h3>
                                {existingSundayReq ? (
                                    <div className="text-[10px] font-bold text-orange-600 uppercase tracking-wider mt-2">
                                        Status: {existingSundayReq.status}
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => setShowSundayReqModal(true)}
                                        className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold py-2.5 rounded-lg transition-all text-sm mt-3"
                                    >
                                        Request Access
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {isShiftComplete ? (
                                    <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-xl text-center">
                                        <CheckCircle size={24} className="text-emerald-500 mx-auto mb-2" />
                                        <p className="text-emerald-900 font-bold text-sm">Shift Completed</p>
                                        <p className="text-emerald-700 text-xs mt-1">Total: {todayDuration.toFixed(2)} Hrs</p>
                                    </div>
                                ) : isClockedIn ? (
                                    <button
                                        onClick={onClockOut}
                                        className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-3 rounded-xl shadow-sm transition-all text-sm flex items-center justify-center gap-2"
                                    >
                                        <LogOut size={18} /> End Session
                                    </button>
                                ) : (
                                    <button
                                        onClick={onClockIn}
                                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-xl shadow-sm transition-all text-sm flex items-center justify-center gap-2"
                                    >
                                        <PlayCircle size={18} /> Begin Shift
                                    </button>
                                )}
                                {isClockedIn && activeLog?.clockIn && (
                                    <p className="text-[10px] font-medium text-slate-400">Started at {format(new Date(activeLog.clockIn), 'HH:mm:ss')}</p>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Profile Details Card */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="border-b border-slate-100 bg-slate-50/50 px-5 py-4">
                        <h3 className="font-semibold text-slate-800 flex items-center gap-2 text-sm"><UserIcon size={16} className="text-blue-500" /> Personnel Details</h3>
                    </div>
                    <div className="p-5 space-y-3 text-sm">
                       <div className="flex justify-between border-b border-slate-50 pb-3">
                           <span className="text-slate-500">Employee ID</span>
                           <span className="font-semibold text-slate-800">{employeeDetails?.id || 'N/A'}</span>
                       </div>
                       <div className="flex justify-between border-b border-slate-50 pb-3">
                           <span className="text-slate-500">Tenure</span>
                           <span className="font-semibold text-slate-800">{employeeDetails?.employmentType || 'Full Time'}</span>
                       </div>
                       <div className="flex justify-between border-b border-slate-50 pb-3">
                           <span className="text-slate-500">Date of Birth</span>
                           <span className="font-semibold text-slate-800">{employeeDetails?.birthDate || 'Not Set'}</span>
                       </div>
                       <div className="flex justify-between border-b border-slate-50 pb-3">
                           <span className="text-slate-500">Age</span>
                           <span className="font-semibold text-slate-800">{age}</span>
                       </div>
                       <div className="flex justify-between pb-1">
                           <span className="text-slate-500">Location</span>
                           <span className="font-semibold text-slate-800 truncate max-w-[120px]" title={employeeDetails?.address}>{employeeDetails?.address || 'Primary HQ'}</span>
                       </div>
                    </div>
                </div>

            </div>

            {/* Right Column: Performance & Compliance */}
            <div className="lg:col-span-8 space-y-6">
                
                {/* Performance KPI Row */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                     <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between hover:border-slate-300 transition-colors">
                         <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3">Total Tasks</p>
                         <p className="text-3xl font-bold text-slate-800">{totalTasks}</p>
                     </div>
                     <div className="bg-white p-5 rounded-xl border border-emerald-100 shadow-sm flex flex-col justify-between hover:border-emerald-200 transition-colors">
                         <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider mb-3">Completed</p>
                         <p className="text-3xl font-bold text-emerald-700">{completedTasks}</p>
                     </div>
                     <div className="bg-white p-5 rounded-xl border border-amber-100 shadow-sm flex flex-col justify-between hover:border-amber-200 transition-colors">
                         <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-3">Pending</p>
                         <p className="text-3xl font-bold text-amber-700">{pendingTasks}</p>
                     </div>
                     <div className="bg-white p-5 rounded-xl border border-indigo-100 shadow-sm flex flex-col justify-between cursor-pointer hover:bg-indigo-50 hover:border-indigo-300 transition-all group" onClick={() => setShowPerformanceReport(true)}>
                         <div className="flex justify-between items-start mb-3">
                            <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">Score</p>
                            <FileBarChart size={16} className="text-indigo-400 group-hover:text-indigo-600 transition-colors" />
                         </div>
                         <p className="text-3xl font-bold text-indigo-700">{performanceScore}%</p>
                     </div>
                </div>

                {/* Leaves & Compliance Side-by-Side */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Leave Analysis */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                        <div className="border-b border-slate-100 bg-slate-50/50 px-5 py-4 flex items-center justify-between">
                            <h3 className="font-semibold text-slate-800 flex items-center gap-2 text-sm"><Calendar size={16} className="text-blue-500" /> Leave Balance</h3>
                        </div>
                        <div className="p-6 text-center flex-1 flex flex-col justify-center items-center">
                            <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-blue-50 border-4 border-blue-100 mb-4">
                                <span className="text-3xl font-bold text-blue-600">{takenLeaves.toFixed(1)}</span>
                            </div>
                            <p className="text-sm font-semibold text-slate-800">Days Taken in {currentYear}</p>
                            <p className="text-xs text-slate-500 mt-2 max-w-[200px] mx-auto">Leave applications are subject to HR approval and policy guidelines.</p>
                        </div>
                    </div>

                    {/* Compliance */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                        <div className="border-b border-slate-100 bg-slate-50/50 px-5 py-4 flex items-center justify-between">
                            <h3 className="font-semibold text-slate-800 flex items-center gap-2 text-sm"><ShieldCheck size={16} className="text-emerald-500" /> Documents</h3>
                            <span className="text-[9px] font-bold bg-red-50 text-red-600 border border-red-100 px-2 py-0.5 rounded uppercase">Required</span>
                        </div>
                        <div className="p-5 flex-1 flex flex-col justify-center">
                            <div className="grid grid-cols-2 gap-3">
                                <DocUploadButton label="Aadhar Front" field="aadharFront" existing={employeeDetails?.documents?.aadharFront} />
                                <DocUploadButton label="Aadhar Back" field="aadharBack" existing={employeeDetails?.documents?.aadharBack} />
                                <DocUploadButton label="PAN Front" field="panFront" existing={employeeDetails?.documents?.panFront} />
                                <DocUploadButton label="PAN Back" field="panBack" existing={employeeDetails?.documents?.panBack} />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Quick Links */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="border-b border-slate-100 bg-slate-50/50 px-5 py-4">
                        <h3 className="font-semibold text-slate-800 text-sm">Quick Navigation</h3>
                    </div>
                    <div className="divide-y divide-slate-100">
                        <button className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors group">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-slate-100 rounded-lg text-slate-600 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                                    <Clock size={16} />
                                </div>
                                <span className="text-sm font-semibold text-slate-700">Time Logs History</span>
                            </div>
                            <ChevronRight size={16} className="text-slate-400 group-hover:text-slate-600 group-hover:translate-x-0.5 transition-transform" />
                        </button>
                        <button className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors group">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-slate-100 rounded-lg text-slate-600 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                                    <ShieldCheck size={16} />
                                </div>
                                <span className="text-sm font-semibold text-slate-700">Access Permissions</span>
                            </div>
                            <ChevronRight size={16} className="text-slate-400 group-hover:text-slate-600 group-hover:translate-x-0.5 transition-transform" />
                        </button>
                    </div>
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

export const EmployeeDashboard = React.memo(EmployeeDashboardComponent);