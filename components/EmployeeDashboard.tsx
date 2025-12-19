import React, { useState, useEffect } from 'react';
import { User, AttendanceRecord, Employee, TimeLog, Task, SundayRequest } from '../types';
import { formatDateKey, isDateSunday } from '../utils/dateUtils';
import { format, differenceInSeconds, differenceInYears, getDate, getMonth } from 'date-fns';
import { CheckCircle, Clock, Calendar, ShieldCheck, LogOut, PlayCircle, MapPin, Mail, Briefcase, User as UserIcon, Cake, Camera, BarChart, FileText, Upload, CheckCircle2, X, AlertTriangle } from 'lucide-react';
import { LEAVE_QUOTA_YEARLY } from '../constants';
import { convertFileToBase64 } from '../utils/fileHelper';

interface EmployeeDashboardProps {
  user: User;
  attendanceData: Record<string, AttendanceRecord>;
  timeLogs: Record<string, Record<string, TimeLog>>; // empId -> date -> Log
  onClockIn: () => void;
  onClockOut: () => void;
  employees: Employee[];
  tasks: Task[];
  onUpdateProfile?: (empId: string, data: Partial<Employee>) => void;
  sundayRequests: SundayRequest[];
  setSundayRequests: React.Dispatch<React.SetStateAction<SundayRequest[]>>;
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
  setSundayRequests
}) => {
  const [elapsed, setElapsed] = useState(0);
  const today = new Date();
  const dateKey = formatDateKey(today);
  const isSunday = isDateSunday(today);
  const currentYear = today.getFullYear().toString();
  
  const empId = user.employeeId || '';
  const empAttendance = attendanceData[empId] || {};
  const todayAttVal = empAttendance[dateKey];
  const todayLog = timeLogs[empId]?.[dateKey];

  const isClockedIn = !!(todayLog?.clockIn && !todayLog?.clockOut);
  const isShiftComplete = !!todayLog?.clockOut;

  // Retrieve Full Employee Details
  const employeeDetails = employees.find(e => e.id === empId);

  // Check for Birthday
  const isBirthday = (() => {
      if (!employeeDetails?.birthDate) return false;
      const dob = new Date(employeeDetails.birthDate);
      return today.getDate() === dob.getDate() && today.getMonth() === dob.getMonth();
  })();

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
    if (isClockedIn && todayLog?.clockIn) {
      interval = setInterval(() => {
        const start = new Date(todayLog.clockIn);
        const now = new Date();
        setElapsed(differenceInSeconds(now, start));
      }, 1000);
    } else if (isShiftComplete && todayLog?.durationHours) {
      setElapsed(todayLog.durationHours * 3600);
    } else {
      setElapsed(0);
    }
    return () => clearInterval(interval);
  }, [isClockedIn, todayLog, isShiftComplete]);

  const formatTime = (totalSeconds: number) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0] && onUpdateProfile) {
        try {
            const base64 = await convertFileToBase64(e.target.files[0]);
            onUpdateProfile(empId, { avatar: base64 });
        } catch (err) {
            console.error(err);
        }
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
          } catch(err) {
              console.error(err);
              alert("Failed to upload document");
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

  const remainingQuota = LEAVE_QUOTA_YEARLY - takenLeaves;
  const hoursWorked = elapsed / 3600;
  const overtime = Math.max(0, hoursWorked - 8);

  // Performance Stats
  const myTasks = tasks.filter(t => t.assignedTo === empId);
  const totalTasks = myTasks.length;
  const completedTasks = myTasks.filter(t => t.status === 'COMPLETED').length;
  const overdueTasks = myTasks.filter(t => t.status === 'OVERDUE').length;
  const performanceScore = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const DocUploadButton = ({ label, field, existing }: { label: string, field: 'aadharFront' | 'aadharBack' | 'panFront' | 'panBack', existing?: string }) => (
      <div className="relative group">
          <label className={`block w-full border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${existing ? 'border-green-500 bg-green-50/50' : 'border-slate-200 hover:border-blue-400 hover:bg-slate-50'}`}>
              <input type="file" className="hidden" accept="image/*,application/pdf" onChange={(e) => e.target.files?.[0] && handleDocUpload(field, e.target.files[0])} />
              {existing ? (
                  <div className="text-green-700">
                      <CheckCircle2 size={24} className="mx-auto mb-1"/>
                      <span className="text-xs font-bold">Uploaded</span>
                  </div>
              ) : (
                  <div className="text-slate-400 group-hover:text-blue-500">
                      <Upload size={24} className="mx-auto mb-1"/>
                      <span className="text-xs font-bold">Upload</span>
                  </div>
              )}
          </label>
          <p className="text-[10px] text-center font-bold text-slate-500 uppercase mt-2">{label}</p>
      </div>
  );

  return (
    <div className="p-4 md:p-8 h-full overflow-auto">
      <div className="max-w-6xl mx-auto space-y-8 animate-fade-in-up">
        
        {isBirthday && (
            <div className="bg-gradient-to-r from-pink-500 via-red-500 to-yellow-500 p-[2px] rounded-3xl animate-scale-in">
                <div className="bg-white rounded-[22px] p-6 flex flex-col md:flex-row items-center gap-6 justify-between overflow-hidden relative">
                    <div className="absolute top-0 left-0 w-full h-full bg-pink-50 opacity-50"></div>
                    <div className="absolute -right-10 -top-10 text-pink-100 opacity-50">
                        <Cake size={200} />
                    </div>
                    <div className="relative z-10 flex items-center gap-4">
                        <div className="w-16 h-16 bg-pink-100 rounded-full flex items-center justify-center text-pink-600 shadow-inner">
                            <Cake size={32} />
                        </div>
                        <div>
                            <h2 className="text-2xl font-black text-pink-600">Happy Birthday, {user.name.split(' ')[0]}! 🎉</h2>
                            <p className="text-slate-600 font-medium">Wishing you a fantastic year ahead from the entire team at Kalra Buildtech!</p>
                        </div>
                    </div>
                </div>
            </div>
        )}

        <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-[0_20px_40px_-15px_rgba(0,0,0,0.1)] border border-white/60 overflow-hidden relative card-3d">
          <div className="h-24 md:h-32 bg-gradient-to-r from-slate-900 via-blue-900 to-slate-900 w-full relative">
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
            <div className="absolute top-4 right-6 text-white/10 hidden md:block animate-pulse">
               <ShieldCheck size={120} className="transform rotate-12 translate-y-4" />
            </div>
          </div>
          
          <div className="px-4 md:px-8 pb-8 flex flex-col md:flex-row gap-6 relative">
            <div className="-mt-12 flex-shrink-0 flex justify-center md:justify-start group relative z-10">
              <div className="w-36 h-36 rounded-3xl bg-white p-2 shadow-2xl relative transform group-hover:scale-105 transition-transform duration-300">
                {employeeDetails?.avatar ? (
                  <img 
                    src={employeeDetails.avatar} 
                    alt={user.name} 
                    className="w-full h-full object-cover rounded-2xl border border-slate-100"
                  />
                ) : (
                  <div className="w-full h-full bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400">
                    <UserIcon size={48} />
                  </div>
                )}
                <label className="absolute inset-0 bg-black/60 rounded-2xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer backdrop-blur-sm">
                    <input type="file" className="hidden" accept="image/*" onChange={handleAvatarChange}/>
                    <div className="text-white text-xs font-bold flex flex-col items-center">
                        <Camera size={24} className="mb-1"/>
                        <span>Change</span>
                    </div>
                </label>
              </div>
            </div>

            <div className="flex-1 pt-2 md:pt-2 text-center md:text-left">
              <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-6">
                <div>
                  <h1 className="text-3xl md:text-4xl font-black text-slate-800 tracking-tight">{user.name}</h1>
                  <p className="text-slate-500 font-medium text-base md:text-lg flex flex-wrap justify-center md:justify-start items-center gap-2 mt-1">
                    {employeeDetails?.designation || 'Employee'} 
                    <span className="hidden md:inline w-1.5 h-1.5 rounded-full bg-slate-300"></span>
                    <span className="text-blue-600 font-bold text-xs md:text-sm bg-blue-50 px-3 py-1 rounded-full border border-blue-100 shadow-sm">{employeeDetails?.department || 'General'}</span>
                  </p>
                </div>
                <div className="flex gap-2">
                   <div className="text-center md:text-right">
                     <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Employee ID</div>
                     <div className="font-mono font-bold text-slate-700 bg-slate-100 px-3 py-1 rounded-lg border border-slate-200">{empId}</div>
                   </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-5 bg-slate-50/50 rounded-2xl border border-slate-200/60 text-left">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-indigo-500 shadow-sm border border-slate-100 shrink-0">
                    <Cake size={18} />
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Age</div>
                    <div className="text-sm font-bold text-slate-700">{age} Years</div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-indigo-500 shadow-sm border border-slate-100 shrink-0">
                    <Briefcase size={18} />
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Experience</div>
                    <div className="text-sm font-bold text-slate-700">{tenure < 1 ? '< 1 Year' : `${tenure} Years`}</div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-indigo-500 shadow-sm border border-slate-100 shrink-0">
                    <Mail size={18} />
                  </div>
                  <div className="overflow-hidden">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Email</div>
                    <div className="text-sm font-bold text-slate-700 truncate" title={employeeDetails?.email}>{employeeDetails?.email || user.email}</div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-indigo-500 shadow-sm border border-slate-100 shrink-0">
                    <MapPin size={18} />
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Location</div>
                    <div className="text-sm font-bold text-slate-700 truncate">{employeeDetails?.address || 'Headquarters'}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-gradient-to-br from-white to-slate-50 rounded-3xl shadow-[0_20px_40px_-12px_rgba(0,0,0,0.1)] border border-white/60 overflow-hidden relative h-full card-3d">
            <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
              <Clock size={150} />
            </div>
            
            <div className="p-8 relative z-10 flex flex-col h-full justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-3 mb-1">
                  <span className={`relative flex h-3 w-3`}>
                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isClockedIn ? 'bg-green-400' : 'bg-slate-300'}`}></span>
                    <span className={`relative inline-flex rounded-full h-3 w-3 ${isClockedIn ? 'bg-green-500' : 'bg-slate-400'}`}></span>
                  </span>
                  Shift Status
                </h2>
                <div className="text-sm text-slate-500 font-medium pl-6">
                  {isClockedIn ? 'Currently Active' : 'Not Started / Completed'}
                </div>
              </div>

              <div className="py-10 text-center">
                <div className="relative inline-block">
                    <div className="font-mono text-6xl md:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-br from-slate-800 to-slate-500 tracking-tighter drop-shadow-sm">
                    {formatTime(elapsed)}
                    </div>
                </div>
                
                <div className="mt-4 inline-flex items-center gap-2 px-6 py-2 rounded-full bg-slate-100/50 border border-slate-200/50 backdrop-blur-sm text-sm font-bold text-slate-600 shadow-inner">
                  {overtime > 0 ? (
                    <span className="text-green-600">Overtime: +{overtime.toFixed(2)}h</span>
                  ) : (
                    <span>Target: 8h</span>
                  )}
                </div>
              </div>

              <div className="mt-auto">
                {isSunday && !isClockedIn && !isShiftComplete && existingSundayReq?.status !== 'APPROVED' ? (
                     <div className="bg-orange-50/50 border border-orange-100 rounded-2xl p-6 text-center space-y-3">
                         <div className="w-12 h-12 bg-orange-100 text-orange-600 rounded-xl flex items-center justify-center mx-auto">
                             <AlertTriangle size={24}/>
                         </div>
                         <h3 className="text-lg font-bold text-orange-800">Sunday Work Requires Approval</h3>
                         {existingSundayReq ? (
                             <div className="text-sm font-bold text-orange-600 bg-white border border-orange-200 py-2 rounded-lg">
                                 Request Status: {existingSundayReq.status}
                             </div>
                         ) : (
                             <button 
                                onClick={() => setShowSundayReqModal(true)}
                                className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-orange-600/20"
                             >
                                 Request Sunday Access
                             </button>
                         )}
                     </div>
                ) : (
                    <>
                        {isSunday || todayAttVal === 'HOLIDAY' ? (
                            <div className="bg-green-50/50 border border-green-100 rounded-2xl p-6 text-center">
                                <h3 className="text-xl font-bold text-green-700">Relax, It's an Off Day</h3>
                                <p className="text-green-600/80 text-sm mt-1">No attendance required today.</p>
                                {existingSundayReq?.status === 'APPROVED' && <p className="text-xs font-bold text-green-800 mt-2">Work Approved ✅</p>}
                            </div>
                        ) : isShiftComplete ? (
                            <div className="bg-blue-50/50 border border-blue-100 rounded-2xl p-6 flex items-center gap-4">
                                <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center shrink-0">
                                <CheckCircle size={28} />
                                </div>
                                <div>
                                <h3 className="font-bold text-blue-900">Shift Completed</h3>
                                <p className="text-blue-700/80 text-sm">Recorded: {todayLog.durationHours?.toFixed(2)} hrs</p>
                                </div>
                            </div>
                        ) : isClockedIn ? (
                        <div className="space-y-3">
                            <button 
                            onClick={onClockOut}
                            className="w-full bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white text-lg font-bold py-4 rounded-2xl shadow-[0_10px_20px_-5px_rgba(239,68,68,0.4)] active:scale-95 transition-all flex items-center justify-center gap-3 relative overflow-hidden group"
                            >
                                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                                <LogOut size={22} className="relative z-10" />
                                <span className="relative z-10">End Shift</span>
                            </button>
                            <p className="text-center text-xs text-slate-400 font-medium">Started at {format(new Date(todayLog!.clockIn), 'h:mm a')}</p>
                        </div>
                        ) : (
                        <div className="space-y-3">
                            <button 
                            onClick={onClockIn}
                            className="w-full bg-gradient-to-r from-slate-800 to-slate-900 hover:from-slate-700 hover:to-slate-800 text-white text-lg font-bold py-4 rounded-2xl shadow-[0_10px_20px_-5px_rgba(15,23,42,0.4)] active:scale-95 transition-all flex items-center justify-center gap-3 relative overflow-hidden group"
                            >
                                <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                                <PlayCircle size={22} className="relative z-10" />
                                <span className="relative z-10">Start Shift</span>
                            </button>
                            <p className="text-center text-sm text-slate-400 font-medium">Ready to work? Start your timer now.</p>
                        </div>
                        )}
                    </>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white/80 backdrop-blur-xl p-6 md:p-8 rounded-3xl shadow-[0_15px_30px_-10px_rgba(0,0,0,0.05)] border border-white/60 card-3d">
               <div className="flex items-center justify-between mb-6">
                 <h3 className="font-bold text-slate-800 flex items-center gap-2">
                   <Calendar size={20} className="text-blue-500" />
                   Yearly Paid Leaves ({currentYear})
                 </h3>
                 <span className="text-xs font-bold bg-blue-50 text-blue-600 px-3 py-1 rounded-full uppercase tracking-wider">
                   Quota: {LEAVE_QUOTA_YEARLY}
                 </span>
               </div>
               
               <div className="flex items-end gap-2 mb-2">
                 <span className="text-4xl font-extrabold text-slate-800">{takenLeaves.toFixed(2)}</span>
                 <span className="text-slate-400 font-medium mb-1.5">/ {LEAVE_QUOTA_YEARLY} taken</span>
               </div>
               
               <div className="w-full bg-slate-100 rounded-full h-3 mb-6 shadow-inner overflow-hidden">
                 <div 
                    className={`h-3 rounded-full shadow-lg transition-all duration-1000 ${takenLeaves > LEAVE_QUOTA_YEARLY ? 'bg-gradient-to-r from-red-500 to-rose-500' : 'bg-gradient-to-r from-blue-400 to-cyan-400'}`} 
                    style={{ width: `${Math.min((takenLeaves / LEAVE_QUOTA_YEARLY) * 100, 100)}%` }}
                  ></div>
               </div>

               <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-100 flex items-center justify-between">
                  <span className="text-slate-600 font-medium text-sm">Remaining Balance</span>
                  <span className={`text-lg font-extrabold ${remainingQuota < 0 ? 'text-red-500' : 'text-green-600'}`}>
                    {remainingQuota.toFixed(2)}
                  </span>
               </div>
            </div>
            
            <div className="bg-white/80 backdrop-blur-xl p-6 md:p-8 rounded-3xl shadow-[0_15px_30px_-10px_rgba(0,0,0,0.05)] border border-white/60 card-3d">
               <div className="flex items-center justify-between mb-6">
                 <h3 className="font-bold text-slate-800 flex items-center gap-2">
                   <BarChart size={20} className="text-indigo-500" />
                   My Performance
                 </h3>
               </div>
               <div className="grid grid-cols-3 gap-4 text-center">
                    <div className="bg-indigo-50/80 rounded-2xl p-4 border border-indigo-100">
                        <div className="text-2xl font-black text-indigo-700">{performanceScore}%</div>
                        <div className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider mt-1">Score</div>
                    </div>
                     <div className="bg-green-50/80 rounded-2xl p-4 border border-green-100">
                        <div className="text-2xl font-black text-green-700">{completedTasks}</div>
                        <div className="text-[10px] font-bold text-green-400 uppercase tracking-wider mt-1">Done</div>
                    </div>
                     <div className="bg-red-50/80 rounded-2xl p-4 border border-red-100">
                        <div className="text-2xl font-black text-red-700">{overdueTasks}</div>
                        <div className="text-[10px] font-bold text-green-400 uppercase tracking-wider mt-1">Overdue</div>
                    </div>
               </div>
            </div>

            <div className="bg-white/80 backdrop-blur-xl p-6 md:p-8 rounded-3xl shadow-[0_15px_30px_-10px_rgba(0,0,0,0.05)] border border-white/60 card-3d">
                <div className="flex items-center justify-between mb-6">
                 <h3 className="font-bold text-slate-800 flex items-center gap-2">
                   <FileText size={20} className="text-teal-500" />
                   Compliance & Documents
                 </h3>
                 <span className="text-xs bg-red-50 text-red-500 font-bold px-2 py-1 rounded shadow-sm border border-red-100">Mandatory</span>
               </div>
               <div className="grid grid-cols-2 gap-4">
                  <DocUploadButton label="Aadhar Front" field="aadharFront" existing={employeeDetails?.documents?.aadharFront} />
                  <DocUploadButton label="Aadhar Back" field="aadharBack" existing={employeeDetails?.documents?.aadharBack} />
                  <DocUploadButton label="PAN Front" field="panFront" existing={employeeDetails?.documents?.panFront} />
                  <DocUploadButton label="PAN Back" field="panBack" existing={employeeDetails?.documents?.panBack} />
               </div>
            </div>
          </div>
        </div>

        {showSundayReqModal && (
            <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden p-6 animate-scale-in">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-xl font-extrabold text-slate-800">Request Sunday Work</h3>
                        <button onClick={() => setShowSundayReqModal(false)}><X size={20} className="text-slate-400"/></button>
                    </div>
                    <p className="text-sm text-slate-500 mb-4">Working on Sunday is typically reserved for urgent tasks. Please specify your reason.</p>
                    <textarea 
                        className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-orange-500 outline-none h-24 resize-none mb-4"
                        placeholder="Reason for working on Sunday..."
                        value={sundayReason}
                        onChange={e => setSundayReason(e.target.value)}
                    />
                    <button 
                        onClick={handleSundayRequest}
                        className="w-full bg-orange-600 text-white font-bold py-3 rounded-xl hover:bg-orange-700 shadow-lg shadow-orange-600/20"
                    >
                        Submit Request
                    </button>
                </div>
            </div>
        )}

      </div>
    </div>
  );
};