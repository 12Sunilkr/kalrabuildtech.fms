
import React, { useState } from 'react';
import { Employee, AttendanceRecord, LeaveRequest, User, Notification, LeaveType, LeaveDurationType, AttendanceValue } from '../types';
import { LEAVE_QUOTA_YEARLY, LEAVE_SUBJECT_TEMPLATES, LEAVE_TYPES_LIST } from '../constants';
import { AlertCircle, CheckCircle, FileBarChart, Plus, X, Send, Clock, CalendarDays, CheckCircle2, XCircle, ArrowRight, User as UserIcon } from 'lucide-react';
import { isSunday, eachDayOfInterval } from 'date-fns';
import { AITextEnhancer } from './AITextEnhancer';
import { formatDateKey } from '../utils/dateUtils';

interface LeaveManagementProps {
  employees: Employee[];
  attendanceData: Record<string, AttendanceRecord>;
  setAttendanceData: React.Dispatch<React.SetStateAction<Record<string, AttendanceRecord>>>;
  leaveRequests: LeaveRequest[];
  setLeaveRequests: React.Dispatch<React.SetStateAction<LeaveRequest[]>>;
  currentUser: User;
  addNotification: (title: string, msg: string, type: Notification['type'], targetUser: string) => void;
}

export const LeaveManagement: React.FC<LeaveManagementProps> = ({ 
    employees, 
    attendanceData,
    setAttendanceData,
    leaveRequests,
    setLeaveRequests,
    currentUser,
    addNotification
}) => {
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'MY_APPLICATIONS' | 'APPROVALS'>('OVERVIEW');
  const [showApplyModal, setShowApplyModal] = useState(false);
  
  // Application Form State
  const [newLeave, setNewLeave] = useState<Partial<LeaveRequest>>({ 
      leaveType: 'Casual Leave', 
      subject: '',
      durationType: 'Multiple Days', // Default
      appliedTo: ''
  });
  const [isCustomSubject, setIsCustomSubject] = useState(false);
  
  // Single date state (used when duration is NOT Multiple Days)
  const [singleDate, setSingleDate] = useState('');

  const currentYear = new Date().getFullYear().toString();
  const isAdmin = currentUser?.role === 'ADMIN';
  const myEmpId = currentUser?.employeeId || 'ADMIN';

  // --- Helpers ---

  const calculateYearlyLeaves = (empId: string) => {
    const record = attendanceData[empId] || {};
    let totalLeaves = 0;

    Object.entries(record).forEach(([dateKey, val]) => {
      if (dateKey.startsWith(currentYear)) {
          // Count partial leaves
          if (val !== 'OFF' && val !== 'HOLIDAY' && val !== 'CO' && typeof val === 'number') {
             totalLeaves += (1 - val);
          }
      }
    });

    return totalLeaves;
  };

  const handleApplyLeave = () => {
      // Logic for Date Mapping
      let start = newLeave.startDate;
      let end = newLeave.endDate;

      if (newLeave.durationType !== 'Multiple Days') {
          if (!singleDate) {
              alert("Please select a date.");
              return;
          }
          start = singleDate;
          end = singleDate;
      } else {
          if (!start || !end) {
              alert("Please select Start and End dates.");
              return;
          }
      }

      if (newLeave.reason && newLeave.appliedTo) {
          const finalSubject = isCustomSubject ? newLeave.subject : (newLeave.subject || LEAVE_SUBJECT_TEMPLATES[0]);
          
          const request: LeaveRequest = {
              id: `LR-${Date.now()}`,
              employeeId: myEmpId,
              leaveType: (newLeave.leaveType || 'Casual Leave') as LeaveType,
              durationType: (newLeave.durationType || 'Multiple Days') as LeaveDurationType,
              startDate: start!,
              endDate: end!,
              subject: finalSubject || 'Leave Application',
              reason: newLeave.reason!,
              appliedTo: newLeave.appliedTo!,
              status: 'PENDING',
              appliedOn: new Date().toISOString().split('T')[0]
          };

          setLeaveRequests(prev => [request, ...prev]);
          setShowApplyModal(false);
          
          // Reset form
          setNewLeave({ leaveType: 'Casual Leave', subject: '', durationType: 'Multiple Days', appliedTo: '' });
          setSingleDate('');
          setIsCustomSubject(false);

          addNotification('Leave Request', `New leave application from ${currentUser.name}`, 'LEAVE', request.appliedTo);
      } else {
          alert("Please fill all required fields (Reason & Approver).");
      }
  };

  const handleApproval = (req: LeaveRequest, approved: boolean) => {
      // 1. Update Request Status
      setLeaveRequests(prev => prev.map(r => r.id === req.id ? { ...r, status: approved ? 'APPROVED' : 'REJECTED' } : r));

      // 2. If Approved, Update Attendance Grid
      if (approved) {
          const start = new Date(req.startDate);
          const end = new Date(req.endDate);
          const dates = eachDayOfInterval({ start, end });
          
          let attValue: AttendanceValue = 0; // Default Absent (Full Day)
          
          // Determine Attendance Value based on Duration Type (Matching defined constants)
          switch (req.durationType) {
              case 'Short Leave':
                  attValue = 0.75; // Per user request: Short Leave is 0.75 (Present for 3/4 day)
                  break;
              case 'Half Day':
                  attValue = 0.5; // Half Day
                  break;
              case 'Full Day':
              case 'Multiple Days':
                  attValue = 0; // Full Leave means 0 attendance
                  break;
              default:
                  attValue = 0;
          }

          const updatedRecord = { ...attendanceData };
          if (!updatedRecord[req.employeeId]) updatedRecord[req.employeeId] = {};

          dates.forEach(date => {
              if (!isSunday(date)) {
                  const key = formatDateKey(date);
                  // Only overwrite if not already defined or override existing
                  updatedRecord[req.employeeId][key] = attValue;
              }
          });
          setAttendanceData(updatedRecord);
          addNotification('Leave Approved', `Your leave request was approved.`, 'LEAVE', req.employeeId);
      } else {
          addNotification('Leave Rejected', `Your leave request was rejected.`, 'LEAVE', req.employeeId);
      }
  };

  // --- Render Tabs ---

  return (
    <div className="p-4 md:p-8 bg-slate-50/50 h-full overflow-y-auto custom-scrollbar">
       <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-8">
        <div>
           <h2 className="text-2xl md:text-3xl font-extrabold text-slate-800 flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-500 text-white rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20 shrink-0">
              <FileBarChart size={20} />
            </div>
            Leave Management
          </h2>
          <p className="text-slate-500 mt-2 font-medium md:ml-14">
            Track quotas, apply for leaves, and manage approvals.
          </p>
        </div>
        
        <button 
          onClick={() => setShowApplyModal(true)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-3 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20 transition-all active:scale-95 font-bold"
        >
          <Plus size={18} />
          Apply for Leave
        </button>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-6 border-b border-slate-200 pb-2">
           <button onClick={() => setActiveTab('OVERVIEW')} className={`px-4 py-2 rounded-lg text-sm font-bold ${activeTab === 'OVERVIEW' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-500 hover:bg-white'}`}>Overview & Quota</button>
           <button onClick={() => setActiveTab('MY_APPLICATIONS')} className={`px-4 py-2 rounded-lg text-sm font-bold ${activeTab === 'MY_APPLICATIONS' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-500 hover:bg-white'}`}>My Applications</button>
           <button onClick={() => setActiveTab('APPROVALS')} className={`px-4 py-2 rounded-lg text-sm font-bold ${activeTab === 'APPROVALS' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-500 hover:bg-white'}`}>
               {isAdmin ? 'All Requests (Admin)' : 'Approvals (Inbox)'}
           </button>
      </div>

      {/* --- OVERVIEW TAB --- */}
      {activeTab === 'OVERVIEW' && (
          <div className="space-y-6">
              {isAdmin ? (
                  // ADMIN VIEW: See All Employees
                  <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                      <div className="p-6 border-b border-slate-100 bg-slate-50">
                          <h3 className="font-bold text-slate-800">Team Leave Balances</h3>
                      </div>
                      <table className="w-full text-left text-sm">
                          <thead className="bg-white text-xs font-bold text-slate-500 uppercase">
                              <tr>
                                  <th className="p-4">Team Member</th>
                                  <th className="p-4 text-center">Quota</th>
                                  <th className="p-4 text-center">Taken</th>
                                  <th className="p-4 text-center">Balance</th>
                                  <th className="p-4 text-center">Status</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                              {employees.map(emp => {
                                  const taken = calculateYearlyLeaves(emp.id);
                                  const balance = LEAVE_QUOTA_YEARLY - taken;
                                  return (
                                      <tr key={emp.id} className="hover:bg-slate-50">
                                          <td className="p-4 font-bold text-slate-700">{emp.name} <span className="text-slate-400 font-normal">({emp.department})</span></td>
                                          <td className="p-4 text-center font-mono">{LEAVE_QUOTA_YEARLY}</td>
                                          <td className="p-4 text-center font-bold text-orange-600">{taken.toFixed(1)}</td>
                                          <td className="p-4 text-center font-bold text-green-600">{balance.toFixed(1)}</td>
                                          <td className="p-4 text-center">
                                              {balance < 0 ? 
                                                <span className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded font-bold">Exceeded</span> : 
                                                <span className="text-xs bg-green-100 text-green-600 px-2 py-1 rounded font-bold">OK</span>
                                              }
                                          </td>
                                      </tr>
                                  );
                              })}
                          </tbody>
                      </table>
                  </div>
              ) : (
                  // EMPLOYEE VIEW: See Only My Quota
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                       {/* My Balance Card */}
                       <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                           <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><UserIcon size={20}/> My Leave Balance</h3>
                           <div className="flex items-center justify-between mb-2">
                               <span className="text-slate-500">Yearly Quota</span>
                               <span className="font-bold text-slate-800">{LEAVE_QUOTA_YEARLY} Days</span>
                           </div>
                           <div className="flex items-center justify-between mb-4">
                               <span className="text-slate-500">Leaves Taken</span>
                               <span className="font-bold text-orange-600">{calculateYearlyLeaves(myEmpId).toFixed(1)} Days</span>
                           </div>
                           <div className="border-t border-slate-100 pt-4 flex items-center justify-between">
                               <span className="font-bold text-lg text-slate-800">Remaining</span>
                               <span className={`font-black text-2xl ${(LEAVE_QUOTA_YEARLY - calculateYearlyLeaves(myEmpId)) < 0 ? 'text-red-500' : 'text-green-600'}`}>
                                   {(LEAVE_QUOTA_YEARLY - calculateYearlyLeaves(myEmpId)).toFixed(1)}
                               </span>
                           </div>
                       </div>
                  </div>
              )}
          </div>
      )}

      {/* --- MY APPLICATIONS TAB --- */}
      {activeTab === 'MY_APPLICATIONS' && (
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
               {leaveRequests.filter(r => r.employeeId === myEmpId).length === 0 ? (
                   <div className="col-span-full text-center py-12 text-slate-400 italic bg-white rounded-3xl border border-slate-100">
                       No leave applications history.
                   </div>
               ) : (
                   leaveRequests
                    .filter(r => r.employeeId === myEmpId)
                    .sort((a,b) => new Date(b.appliedOn).getTime() - new Date(a.appliedOn).getTime())
                    .map(req => {
                        const approver = employees.find(e => e.id === req.appliedTo);
                        return (
                            <div key={req.id} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 relative overflow-hidden group">
                                <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${req.status === 'APPROVED' ? 'bg-green-500' : req.status === 'REJECTED' ? 'bg-red-500' : 'bg-yellow-500'}`}></div>
                                <div className="flex justify-between items-start mb-2 pl-2">
                                    <span className="px-2 py-1 bg-slate-50 text-slate-500 text-xs font-bold rounded uppercase">{req.leaveType}</span>
                                    <span className={`px-2 py-1 text-xs font-bold rounded uppercase ${req.status === 'APPROVED' ? 'bg-green-100 text-green-700' : req.status === 'REJECTED' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                        {req.status}
                                    </span>
                                </div>
                                <h3 className="font-bold text-slate-800 text-lg mb-1 pl-2">{req.subject}</h3>
                                <p className="text-sm text-slate-500 mb-4 pl-2 line-clamp-2">"{req.reason}"</p>
                                <div className="pl-2 space-y-1 text-xs font-medium text-slate-500">
                                    <div className="flex items-center gap-2"><Clock size={14}/> {req.durationType}</div>
                                    <div className="flex items-center gap-2"><CalendarDays size={14}/> {req.startDate} {req.endDate !== req.startDate && `to ${req.endDate}`}</div>
                                    <div className="flex items-center gap-2"><ArrowRight size={14}/> Sent To: {approver?.name || req.appliedTo}</div>
                                </div>
                            </div>
                        );
                    })
               )}
           </div>
      )}

      {/* --- APPROVALS TAB --- */}
      {activeTab === 'APPROVALS' && (
          <div className="space-y-4">
              {/* For Admins: Show ALL requests. For Users: Show requests sent TO them */}
              {(() => {
                  const relevantRequests = isAdmin 
                    ? leaveRequests // Admin sees all
                    : leaveRequests.filter(r => r.appliedTo === myEmpId); // User sees incoming
                  
                  if (relevantRequests.length === 0) {
                      return <div className="text-center py-12 text-slate-400 italic bg-white rounded-3xl border border-slate-100">No requests found.</div>;
                  }

                  return relevantRequests.map(req => {
                      const requester = employees.find(e => e.id === req.employeeId);
                      const approver = employees.find(e => e.id === req.appliedTo); // To show "To: X" in Admin view

                      return (
                        <div key={req.id} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col md:flex-row gap-6">
                             <div className="flex-1">
                                 <div className="flex items-center gap-2 mb-2">
                                     <div className="font-bold text-slate-800 text-lg">{requester?.name || req.employeeId}</div>
                                     <span className="text-xs text-slate-400">({requester?.department})</span>
                                     {isAdmin && (
                                         <div className="flex items-center gap-1 text-xs text-slate-400 bg-slate-50 px-2 py-0.5 rounded ml-2">
                                             <span>To:</span> <span className="font-bold text-slate-600">{approver?.name || req.appliedTo}</span>
                                         </div>
                                     )}
                                 </div>
                                 <div className="flex flex-wrap gap-2 mb-3">
                                     <span className="px-2 py-1 bg-indigo-50 text-indigo-700 text-xs font-bold rounded uppercase border border-indigo-100">{req.leaveType}</span>
                                     <span className="px-2 py-1 bg-slate-50 text-slate-600 text-xs font-bold rounded uppercase border border-slate-200">{req.durationType}</span>
                                     <span className={`px-2 py-1 text-xs font-bold rounded uppercase border ${req.status === 'APPROVED' ? 'bg-green-50 text-green-700 border-green-100' : req.status === 'REJECTED' ? 'bg-red-50 text-red-700 border-red-100' : 'bg-yellow-50 text-yellow-700 border-yellow-100'}`}>
                                        {req.status}
                                    </span>
                                 </div>
                                 
                                 <h4 className="font-bold text-slate-700 text-sm mb-1">{req.subject}</h4>
                                 <p className="text-slate-600 text-sm italic bg-slate-50 p-3 rounded-lg border border-slate-100 mb-3">"{req.reason}"</p>
                                 
                                 <div className="flex items-center gap-4 text-xs font-medium text-slate-500">
                                     <span className="flex items-center gap-1"><CalendarDays size={14}/> {req.startDate} {req.endDate !== req.startDate && `to ${req.endDate}`}</span>
                                     <span className="flex items-center gap-1"><Clock size={14}/> Applied: {req.appliedOn}</span>
                                 </div>
                             </div>

                             {req.status === 'PENDING' && (
                                 <div className="flex flex-col justify-center gap-2 min-w-[140px]">
                                     <button 
                                        onClick={() => handleApproval(req, true)}
                                        className="py-2 px-4 bg-green-600 text-white rounded-xl font-bold text-sm hover:bg-green-700 shadow-sm flex items-center justify-center gap-2"
                                     >
                                         <CheckCircle2 size={16}/> Approve
                                     </button>
                                     <button 
                                        onClick={() => handleApproval(req, false)}
                                        className="py-2 px-4 bg-white border border-red-200 text-red-600 rounded-xl font-bold text-sm hover:bg-red-50 flex items-center justify-center gap-2"
                                     >
                                         <XCircle size={16}/> Reject
                                     </button>
                                 </div>
                             )}
                        </div>
                      );
                  });
              })()}
          </div>
      )}

      {/* APPLY MODAL */}
      {showApplyModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-100 bg-indigo-50/50 flex justify-between items-center shrink-0">
               <h3 className="text-xl font-extrabold text-indigo-900">Apply for Leave</h3>
               <button onClick={() => setShowApplyModal(false)} className="p-2 hover:bg-indigo-100 rounded-full text-indigo-800"><X size={20}/></button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto">
               <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Leave Type</label>
                  <select 
                      className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                      value={newLeave.leaveType || ''}
                      onChange={e => setNewLeave(prev => ({...prev, leaveType: e.target.value as LeaveType}))}
                  >
                      {LEAVE_TYPES_LIST.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
               </div>

               <div>
                   <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Duration</label>
                   <select 
                      className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-indigo-500 outline-none bg-white font-bold"
                      value={newLeave.durationType}
                      onChange={e => setNewLeave(prev => ({...prev, durationType: e.target.value as LeaveDurationType}))}
                   >
                       <option value="Multiple Days">Multiple Days</option>
                       <option value="Full Day">Full Day (One Day)</option>
                       <option value="Half Day">Half Day</option>
                       <option value="Short Leave">Short Leave</option>
                   </select>
               </div>

               {/* Dynamic Date Selection */}
               {newLeave.durationType === 'Multiple Days' ? (
                   <div className="grid grid-cols-2 gap-4">
                      <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Start Date</label>
                          <input 
                              type="date" 
                              className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-indigo-500 outline-none"
                              value={newLeave.startDate || ''}
                              onChange={e => setNewLeave(prev => ({...prev, startDate: e.target.value}))}
                          />
                      </div>
                      <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-2">End Date</label>
                          <input 
                              type="date" 
                              className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-indigo-500 outline-none"
                              value={newLeave.endDate || ''}
                              onChange={e => setNewLeave(prev => ({...prev, endDate: e.target.value}))}
                          />
                      </div>
                   </div>
               ) : (
                   <div>
                       <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Date</label>
                       <input 
                          type="date" 
                          className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-indigo-500 outline-none"
                          value={singleDate}
                          onChange={e => setSingleDate(e.target.value)}
                       />
                   </div>
               )}

               <div>
                   <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Approver (Send Application To)</label>
                   <select 
                      className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                      value={newLeave.appliedTo || ''}
                      onChange={e => setNewLeave(prev => ({...prev, appliedTo: e.target.value}))}
                   >
                       <option value="">Select Manager / Admin</option>
                       <option value="ADMIN">Administrator</option>
                       {employees.filter(e => e.id !== myEmpId).map(e => (
                           <option key={e.id} value={e.id}>{e.name} ({e.designation})</option>
                       ))}
                   </select>
               </div>

               <div>
                   <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Subject</label>
                   <div className="flex gap-2 mb-2">
                       <button onClick={() => setIsCustomSubject(false)} className={`flex-1 py-2 rounded-lg text-xs font-bold border ${!isCustomSubject ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-500 border-slate-200'}`}>Template</button>
                       <button onClick={() => setIsCustomSubject(true)} className={`flex-1 py-2 rounded-lg text-xs font-bold border ${isCustomSubject ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-500 border-slate-200'}`}>Custom</button>
                   </div>
                   {isCustomSubject ? (
                       <input 
                          type="text" 
                          className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-indigo-500 outline-none"
                          value={newLeave.subject || ''}
                          onChange={e => setNewLeave(prev => ({...prev, subject: e.target.value}))}
                          placeholder="Enter subject..."
                       />
                   ) : (
                       <select 
                          className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                          value={newLeave.subject || ''}
                          onChange={e => setNewLeave(prev => ({...prev, subject: e.target.value}))}
                       >
                           <option value="">Select Topic...</option>
                           {LEAVE_SUBJECT_TEMPLATES.map(t => <option key={t} value={t}>{t}</option>)}
                       </select>
                   )}
               </div>

               <div>
                   <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Reason</label>
                   <textarea 
                      className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-indigo-500 outline-none h-24 resize-none"
                      value={newLeave.reason || ''}
                      onChange={e => setNewLeave(prev => ({...prev, reason: e.target.value}))}
                      placeholder="Detailed reason..."
                   />
                   <AITextEnhancer 
                      text={newLeave.reason || ''} 
                      onUpdate={(text) => setNewLeave(prev => ({...prev, reason: text}))} 
                   />
               </div>
            </div>
            <div className="p-6 bg-slate-50/50 flex justify-end gap-3 border-t border-slate-100 shrink-0">
               <button onClick={() => setShowApplyModal(false)} className="px-5 py-2.5 text-slate-600 font-bold hover:bg-slate-100 rounded-xl">Cancel</button>
               <button onClick={handleApplyLeave} className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-600/20 flex items-center gap-2">
                 <Send size={18} /> Submit Application
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
