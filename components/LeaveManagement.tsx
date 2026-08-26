
import React, { useState } from 'react';
import { Employee, AttendanceRecord, LeaveRequest, User, Notification, LeaveType, LeaveDurationType, AttendanceValue } from '../types';
import { LEAVE_SUBJECT_TEMPLATES, LEAVE_TYPES_LIST } from '../constants';
import { AlertCircle, CheckCircle, FileBarChart, Plus, X, Send, Clock, CalendarDays, CheckCircle2, XCircle, ArrowRight, User as UserIcon } from 'lucide-react';
import { isSunday, eachDayOfInterval } from 'date-fns';

import api, { safePost, safeGet, extractPayload, ensureArray } from '../src/utils/api';
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
    const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'MY_APPLICATIONS' | 'APPROVALS' | 'ALL_REQUESTS'>('OVERVIEW');
    const [showApplyModal, setShowApplyModal] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string>('');
    const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('ALL');

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
    const isAdmin = currentUser?.role === 'ADMIN' || currentUser?.role === 'SUPER_ADMIN' || currentUser?.role === 'PC';
    // Use employeeId if present, otherwise fallback to User ID or 'ADMIN'
    const myEmpId = currentUser?.employeeId || currentUser?.id || 'ADMIN';

    // Fetch leaves based on active tab
    React.useEffect(() => {
        const fetchLeaves = async () => {
            try {
                let url = '/leaves';
                if (activeTab === 'MY_APPLICATIONS' && !isAdmin) {
                    url = '/leaves?type=my';

                } else if (activeTab === 'APPROVALS' && !isAdmin) {
                    url = '/leaves?type=approvals';

                } else if (isAdmin) {
                    url = '/leaves';

                }

                const listRes = await safeGet(url);
                const leaves = ensureArray(extractPayload(listRes));

                setLeaveRequests(leaves);
            } catch (err) {
                console.error('Failed to fetch leaves', err);
            }
        };

        if (activeTab === 'OVERVIEW' || activeTab === 'MY_APPLICATIONS' || activeTab === 'APPROVALS' || activeTab === 'ALL_REQUESTS') {
            fetchLeaves();
        }
    }, [activeTab, isAdmin]);

    // --- Helpers ---

    const calculateYearlyLeaves = (empId: string | number) => {
        const record = attendanceData[String(empId)] || {};
        let totalLeaves = 0;

        Object.entries(record).forEach(([dateKey, val]) => {
            if (dateKey.startsWith(currentYear)) {
                // Count partial leaves
                if (val !== 'OFF' && val !== 'HOLIDAY' && val !== 'CO') {
                    if (typeof val === 'number') {
                        totalLeaves += (1 - val);
                    } else if (val === 'LEAVE') {
                        totalLeaves += 1;
                    }
                }
            }
        });

        return totalLeaves;
    };

    const handleApplyLeave = async () => {
        setErrorMessage('');

        // Logic for Date Mapping
        let start = newLeave.startDate;
        let end = newLeave.endDate;

        if (newLeave.durationType !== 'Multiple Days') {
            if (!singleDate) {
                setErrorMessage("Please select a date.");
                return;
            }
            start = singleDate;
            end = singleDate;
        } else {
            if (!start || !end) {
                setErrorMessage("Please select Start and End dates.");
                return;
            }
        }

        // Validate dates
        const startDate = new Date(start);
        const endDate = new Date(end);

        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
            setErrorMessage("Invalid date format. Please select valid dates.");
            return;
        }

        if (endDate < startDate) {
            setErrorMessage("End date must be greater than or equal to start date.");
            return;
        }

        if (!newLeave.reason) {
            setErrorMessage("Please provide a reason for your leave.");
            return;
        }

        if (!newLeave.appliedTo) {
            setErrorMessage("Please select an approver.");
            return;
        }

        if (!newLeave.subject) {
            setErrorMessage("Please select or enter a subject.");
            return;
        }

        setIsSubmitting(true);
        const days = 1; // approximate days; frontend keeps lightweight value, server authoritative
        try {
            const body = {
                startDate: start,
                endDate: end,
                days,
                reason: newLeave.reason,
                leaveType: newLeave.leaveType,
                subject: newLeave.subject,
                appliedTo: newLeave.appliedTo,
                durationType: newLeave.durationType
            };



            await safePost('/leaves', body, { withCredentials: true });

            // Refresh list from server - use ?type=my for employees
            const url = isAdmin ? '/leaves' : '/leaves?type=my';

            const listRes = await safeGet(url);
            const fetchedLeaves = ensureArray(extractPayload(listRes));

            setLeaveRequests(fetchedLeaves);

            setShowApplyModal(false);
            if (!isAdmin) setActiveTab('MY_APPLICATIONS'); // Switch to applications tab to show new entry
            setNewLeave({ leaveType: 'Casual Leave', subject: '', durationType: 'Multiple Days', appliedTo: '' });
            setSingleDate('');
            setIsCustomSubject(false);
            setErrorMessage('');

            addNotification('Leave Request', `Your leave application has been submitted to ${employees.find(e => e.id === newLeave.appliedTo)?.name || newLeave.appliedTo}`, 'LEAVE', String(newLeave.appliedTo));
        } catch (err: any) {
            const errMsg = err?.response?.data?.message || err?.message || 'Failed to submit leave request';
            setErrorMessage(errMsg);
            console.error('Failed to submit leave to server', err && (err.stack || err.message || err));
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleApproval = async (req: LeaveRequest, approved: boolean) => {
        try {


            // Optimistic update: update local state immediately
            const newStatus = approved ? 'APPROVED' : 'REJECTED';
            const updatedRequests = leaveRequests.map(r =>
                r.id === req.id ? { ...r, status: newStatus as 'APPROVED' | 'REJECTED' } : r
            );
            setLeaveRequests(updatedRequests);

            // Update status on server
            await api.put(`/leaves/${encodeURIComponent(req.id)}`, { status: approved ? 'APPROVED' : 'REJECTED' }, { withCredentials: true });

            // Final refresh to ensure UI is in sync with server
            const refreshUrl = isAdmin ? '/leaves' : (activeTab === 'APPROVALS' ? '/leaves?type=approvals' : '/leaves?type=my');
            const refreshRes = await safeGet(refreshUrl);
            setLeaveRequests(ensureArray(extractPayload(refreshRes)));

            // If approved, update attendance on server for each date (best-effort)
            if (approved) {
                const start = new Date(req.startDate);
                const end = new Date(req.endDate);
                const dates = eachDayOfInterval({ start, end });
                const attValue = req.durationType === 'Half Day' ? 0.5 : (req.durationType === 'Short Leave' ? 0.75 : 0);
                // Batch update attendance entries (PUT /attendance/:id) for each date
                for (const d of dates) {
                    if (isSunday(d)) continue;
                    const key = formatDateKey(d);
                    const aId = `A-${req.employeeId}-${key}`;
                    try {
                        await api.put(`/attendance/${encodeURIComponent(aId)}`, { userId: req.employeeId, date: key, value: attValue }, { withCredentials: true });
                    } catch (e) {
                        // best-effort; continue
                        console.warn('Failed to update attendance for', key, e && (e.stack || e.message || e));
                    }
                }
                // Refresh attendance grid client-side
                try {
                    const sat = await safeGet('/attendance');
                    const arr = ensureArray(extractPayload(sat));
                    const ag: Record<string, AttendanceRecord> = {};
                    arr.forEach((a: any) => {
                        if (!ag[a.userId]) ag[a.userId] = {};
                        ag[a.userId][a.date] = a.value == null ? (a.clockIn ? 1 : 0) : a.value;
                    });
                    setAttendanceData(ag);
                } catch (e) {
                    console.warn('Failed to refresh attendance after approval', e && (e.stack || e.message || e));
                }
            }

            addNotification('Leave ' + (approved ? 'Approved' : 'Rejected'), `${req.subject || 'Leave'} request was ${approved ? 'approved' : 'rejected'}.`, 'LEAVE', String(req.employeeId));
        } catch (err: any) {
            // Revert optimistic update on error
            const url = isAdmin ? '/leaves' : '/leaves?type=approvals';

            const listRes = await safeGet(url);
            setLeaveRequests(ensureArray(extractPayload(listRes)));

            const errMsg = err?.response?.data?.message || 'Failed to update leave status';
            setErrorMessage(errMsg);
            console.error('Failed to update leave on server', err && (err.stack || err.message || err));
        }
    };

    const handleDeleteLeave = async (req: LeaveRequest) => {
        const isOwner = String(req.employeeId) === String(currentUser.id) || (currentUser.employeeId && String(req.employeeId) === String(currentUser.employeeId));

        if (!isAdmin && (!isOwner || req.status !== 'PENDING')) {
            setErrorMessage('Only admins can delete processed requests, or you can withdraw your own pending applications.');
            return;
        }

        const personName = employees.find(e => String(e.id) === String(req.employeeId))?.name || req.employeeId;
        if (!confirm(`Are you sure you want to ${isOwner && !isAdmin ? 'withdraw' : 'delete'} the leave request from ${personName}?`)) {
            return;
        }

        try {
            // Optimistic update
            setLeaveRequests(prev => prev.filter(r => r.id !== req.id));

            // Delete on server
            await api.delete(`/leaves/${encodeURIComponent(req.id)}`, { withCredentials: true });

            addNotification('Leave Deleted', `Leave request from ${employees.find(e => e.id === req.employeeId)?.name || req.employeeId} has been deleted.`, 'LEAVE', String(req.employeeId));
        } catch (err: any) {
            // Revert optimistic update on error
            const url = '/leaves';
            const listRes = await safeGet(url);
            setLeaveRequests(ensureArray(extractPayload(listRes)));

            const errMsg = err?.response?.data?.message || 'Failed to delete leave request';
            setErrorMessage(errMsg);
            console.error('Failed to delete leave on server', err && (err.stack || err.message || err));
        }
    };

    // --- Render Tabs ---

    return (
        <div className="p-6 md:p-8 bg-gradient-to-br from-slate-50 via-white to-slate-50 h-full overflow-y-auto custom-scrollbar">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10 animate-fade-in-up">
                <div className="flex items-center gap-5">
                    <div className="w-16 h-16 bg-gradient-to-tr from-indigo-600 to-violet-600 text-white rounded-2xl flex items-center justify-center shadow-2xl shadow-indigo-200 rotate-3 hover:rotate-0 transition-transform duration-300 shrink-0">
                        <FileBarChart size={32} />
                    </div>
                    <div>
                        <h2 className="text-3xl md:text-4xl font-black text-slate-800 tracking-tight">
                            Leave Management
                        </h2>
                        <p className="text-slate-500 font-semibold tracking-wide flex items-center gap-2">
                            <Clock size={16} className="text-indigo-500" />
                            Track, apply, and manage employee leaves
                        </p>
                    </div>
                </div>

                <button
                    onClick={() => setShowApplyModal(true)}
                    className="bg-gradient-to-r from-indigo-600 to-violet-700 hover:from-indigo-700 hover:to-violet-800 text-white px-8 py-3.5 rounded-2xl flex items-center justify-center gap-3 shadow-xl shadow-indigo-200 transition-all active:scale-95 font-bold text-lg"
                >
                    <Plus size={24} className="animate-pulse" />
                    Apply For Leave
                </button>
            </div>

            {/* Tabs */}
            <div className="flex flex-wrap gap-3 mb-10 bg-white/50 p-2 rounded-2xl border border-slate-100 backdrop-blur-sm self-start animate-fade-in-up" style={{ animationDelay: '100ms' }}>
                <button onClick={() => setActiveTab('OVERVIEW')} className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === 'OVERVIEW' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'text-slate-500 hover:bg-white hover:text-indigo-600'}`}>Overview</button>
                {!isAdmin && (
                    <button onClick={() => setActiveTab('MY_APPLICATIONS')} className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === 'MY_APPLICATIONS' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'text-slate-500 hover:bg-white hover:text-indigo-600'}`}>My Applications</button>
                )}
                <button onClick={() => setActiveTab('APPROVALS')} className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === 'APPROVALS' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'text-slate-500 hover:bg-white hover:text-indigo-600'}`}>
                    Approvals {leaveRequests.filter(r => (isAdmin || String(r.appliedTo) === String(currentUser.id) || (currentUser.employeeId && String(r.appliedTo) === String(currentUser.employeeId))) && r.status === 'PENDING').length > 0 && <span className="ml-2 px-2 py-0.5 bg-red-500 text-white text-[10px] rounded-full animate-bounce">{leaveRequests.filter(r => (isAdmin || String(r.appliedTo) === String(currentUser.id) || (currentUser.employeeId && String(r.appliedTo) === String(currentUser.employeeId))) && r.status === 'PENDING').length}</span>}
                </button>
                {isAdmin && (
                    <button onClick={() => setActiveTab('ALL_REQUESTS')} className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === 'ALL_REQUESTS' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'text-slate-500 hover:bg-white hover:text-indigo-600'}`}>All Team Requests</button>
                )}
            </div>

            {/* Tab Content */}
            <div className="flex-1 animate-fade-in-up" style={{ animationDelay: '200ms' }}>
                {activeTab === 'OVERVIEW' ? (
                    <div className="space-y-6">
                        {!isAdmin && leaveRequests.some(r => (String(r.appliedTo) === String(currentUser.id) || (currentUser.employeeId && String(r.appliedTo) === String(currentUser.employeeId))) && r.status === 'PENDING') && (
                            <div className="bg-indigo-600 rounded-[2.5rem] p-8 text-white shadow-2xl shadow-indigo-200 mb-8 flex flex-col md:flex-row items-center justify-between gap-6 animate-pulse">
                                <div className="flex items-center gap-5">
                                    <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-md">
                                        <AlertCircle size={32} />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-black uppercase tracking-tight">Pending My Action</h3>
                                        <p className="text-indigo-100/80 text-sm font-bold">You have {leaveRequests.filter(r => (String(r.appliedTo) === String(currentUser.id) || (currentUser.employeeId && String(r.appliedTo) === String(currentUser.employeeId))) && r.status === 'PENDING').length} leave requests waiting for your review.</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setActiveTab('APPROVALS')}
                                    className="px-8 py-3 bg-white text-indigo-600 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-indigo-50 transition-all shadow-lg"
                                >
                                    Review Requests Now
                                </button>
                            </div>
                        )}

                        {isAdmin && (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                                <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 p-6 rounded-3xl text-white shadow-xl shadow-indigo-100">
                                    <p className="text-indigo-100 font-bold text-xs uppercase tracking-widest mb-1">Total Requests</p>
                                    <div className="flex justify-between items-end">
                                        <h3 className="text-4xl font-black">{leaveRequests.length}</h3>
                                        <FileBarChart size={24} className="opacity-40" />
                                    </div>
                                </div>
                                <div className="bg-gradient-to-br from-amber-500 to-amber-600 p-6 rounded-3xl text-white shadow-xl shadow-amber-100">
                                    <p className="text-amber-100 font-bold text-xs uppercase tracking-widest mb-1">Pending Approvals</p>
                                    <div className="flex justify-between items-end">
                                        <h3 className="text-4xl font-black">{leaveRequests.filter(r => r.status === 'PENDING').length}</h3>
                                        <Clock size={24} className="opacity-40" />
                                    </div>
                                </div>
                                <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 p-6 rounded-3xl text-white shadow-xl shadow-emerald-100">
                                    <p className="text-emerald-100 font-bold text-xs uppercase tracking-widest mb-1">Approved This Year</p>
                                    <div className="flex justify-between items-end">
                                        <h3 className="text-4xl font-black">{leaveRequests.filter(r => r.status === 'APPROVED').length}</h3>
                                        <CheckCircle size={24} className="opacity-40" />
                                    </div>
                                </div>
                                <div className="bg-gradient-to-br from-rose-500 to-rose-600 p-6 rounded-3xl text-white shadow-xl shadow-rose-100">
                                    <p className="text-rose-100 font-bold text-xs uppercase tracking-widest mb-1">Rejected</p>
                                    <div className="flex justify-between items-end">
                                        <h3 className="text-4xl font-black">{leaveRequests.filter(r => r.status === 'REJECTED').length}</h3>
                                        <XCircle size={24} className="opacity-40" />
                                    </div>
                                </div>
                            </div>
                        )}

                        {isAdmin ? (
                            // ADMIN VIEW: See All Employees
                            <div className="bg-white rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
                                <div className="p-8 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                                    <h3 className="font-black text-slate-800 uppercase tracking-tight text-lg">Team Leave Analysis - {currentYear}</h3>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-sm">
                                        <thead className="bg-slate-50/30 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                                            <tr>
                                                <th className="p-6">Team Member</th>
                                                <th className="p-6 text-center">Total Leaves Taken</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50">
                                            {employees.map(emp => {
                                                const taken = calculateYearlyLeaves(emp.id);
                                                return (
                                                    <tr key={emp.id} className="group hover:bg-slate-50/80 transition-colors">
                                                        <td className="p-6">
                                                            <div className="flex items-center gap-4">
                                                                <div className="w-12 h-12 bg-indigo-50 rounded-[1rem] flex items-center justify-center font-black text-indigo-600 border border-indigo-100 shadow-sm group-hover:bg-indigo-600 group-hover:text-white transition-all">
                                                                    {emp.name.charAt(0)}
                                                                </div>
                                                                <div>
                                                                    <div className="font-black text-slate-800 text-base">{emp.name}</div>
                                                                    <div className="text-[10px] text-slate-400 uppercase font-black tracking-widest mt-0.5">{emp.designation}</div>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="p-6 text-center">
                                                            <div className="inline-flex items-center justify-center px-4 py-2 bg-rose-50 text-rose-600 rounded-xl font-black text-lg border border-rose-100 shadow-sm">
                                                                {taken.toFixed(1)} <span className="text-xs ml-1 text-rose-400">Days</span>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ) : (
                            // EMPLOYEE VIEW: See Only My Leaves
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                                {/* My Leave Analysis Card */}
                                <div className="bg-white rounded-[2.5rem] p-10 shadow-2xl shadow-slate-200 border border-slate-100 relative overflow-hidden group">
                                    <div className="absolute -right-10 -top-10 w-40 h-40 bg-indigo-500/5 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-700"></div>
                                    <h3 className="font-black text-slate-800 mb-8 flex items-center gap-3 text-xl tracking-tight">
                                        <div className="p-2 bg-indigo-600 text-white rounded-xl"><UserIcon size={20} /></div>
                                        My Leaves Analysis
                                    </h3>

                                    <div className="space-y-6 flex flex-col justify-center items-center py-4">
                                        <div className="flex flex-col items-center justify-center bg-rose-50/50 p-8 rounded-3xl border border-dashed border-rose-200 w-full">
                                            <span className="text-rose-400 text-[10px] font-black uppercase tracking-widest mb-2">Total Leaves Taken</span>
                                            <div className="flex items-baseline gap-2">
                                                <span className="text-6xl font-black text-rose-600 tracking-tighter">{calculateYearlyLeaves(myEmpId).toFixed(1)}</span>
                                                <span className="text-xl font-bold text-rose-400">Days</span>
                                            </div>
                                            <div className="mt-4 px-4 py-1.5 bg-rose-100 text-rose-600 rounded-full text-[10px] font-black uppercase tracking-widest">
                                                Year {currentYear}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="md:col-span-2 bg-white rounded-[2.5rem] p-10 shadow-xl shadow-slate-200/50 border border-slate-100">
                                    <h3 className="font-black text-slate-800 mb-6 text-xl tracking-tight flex items-center gap-3">
                                        <div className="p-2 bg-emerald-500 text-white rounded-xl"><CheckCircle size={20} /></div>
                                        Quick Leave Summary
                                    </h3>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="p-5 bg-indigo-50/50 rounded-2xl border border-indigo-100">
                                            <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">Last Applied</p>
                                            <p className="text-sm font-bold text-slate-700 truncate">{leaveRequests.filter(r => String(r.employeeId) === String(currentUser.id) || (currentUser.employeeId && String(r.employeeId) === String(currentUser.employeeId))).sort((a, b) => new Date(b.appliedOn || '').getTime() - new Date(a.appliedOn || '').getTime())[0]?.startDate || 'None'}</p>
                                        </div>
                                        <div className="p-5 bg-emerald-50/50 rounded-2xl border border-emerald-100">
                                            <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-1">Approved This Year</p>
                                            <p className="text-sm font-bold text-slate-700">{leaveRequests.filter(r => (String(r.employeeId) === String(currentUser.id) || (currentUser.employeeId && String(r.employeeId) === String(currentUser.employeeId))) && r.status === 'APPROVED').length}</p>
                                        </div>
                                        <div className="p-5 bg-amber-50/50 rounded-2xl border border-amber-100">
                                            <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest mb-1">Currently Pending</p>
                                            <p className="text-sm font-bold text-slate-700">{leaveRequests.filter(r => (String(r.employeeId) === String(currentUser.id) || (currentUser.employeeId && String(r.employeeId) === String(currentUser.employeeId))) && r.status === 'PENDING').length}</p>
                                        </div>
                                        <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Company Holiday Left</p>
                                            <p className="text-sm font-bold text-slate-700">See Calendar</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                ) : activeTab === 'ALL_REQUESTS' && isAdmin ? (
                    <div className="animate-fade-in">
                        {/* Status Filters */}
                        <div className="flex flex-wrap gap-3 mb-10">
                            {(['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const).map(status => {
                                const count = status === 'ALL'
                                    ? leaveRequests.length
                                    : leaveRequests.filter(r => r.status === status).length;
                                return (
                                    <button
                                        key={status}
                                        onClick={() => setStatusFilter(status)}
                                        className={`px-6 py-2.5 rounded-xl text-xs font-black tracking-widest uppercase transition-all flex items-center gap-3 ${statusFilter === status
                                            ? 'bg-indigo-600 text-white shadow-xl scale-105'
                                            : 'bg-white text-slate-500 border border-slate-100 hover:border-slate-300 hover:bg-slate-50'
                                            }`}
                                    >
                                        {status}
                                        <span className={`px-2 py-0.5 rounded text-[10px] ${statusFilter === status ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}`}>
                                            {count}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>

                        <div className="grid grid-cols-1 gap-6">
                            {leaveRequests
                                .filter(r => statusFilter === 'ALL' || r.status === statusFilter)
                                .sort((a, b) => new Date(b.appliedOn || '').getTime() - new Date(a.appliedOn || '').getTime())
                                .length === 0 ? (
                                <div className="text-center py-20 bg-white rounded-[3rem] border-2 border-dashed border-slate-100 flex flex-col items-center gap-4">
                                    <div className="p-6 bg-slate-50 rounded-full text-slate-300"><Clock size={48} /></div>
                                    <p className="text-slate-400 font-bold italic">No requests log found.</p>
                                </div>
                            ) : (
                                leaveRequests
                                    .filter(r => statusFilter === 'ALL' || r.status === statusFilter)
                                    .sort((a, b) => new Date(b.appliedOn || '').getTime() - new Date(a.appliedOn || '').getTime())
                                    .map(req => {
                                        const requesterName = req.appliedByName || 'Member ' + req.employeeId;
                                        return (
                                            <div key={req.id} className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-6 hover:shadow-md transition-shadow">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center font-black text-indigo-600 border border-slate-200">
                                                        {requesterName.charAt(0) || '?'}
                                                    </div>
                                                    <div>
                                                        <h4 className="font-black text-slate-800 uppercase tracking-tight">{requesterName}</h4>
                                                        <div className="flex items-center gap-2">
                                                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{req.leaveType} • {req.startDate} to {req.endDate}</p>
                                                            {req.department && <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-black uppercase tracking-tighter">{req.department}</span>}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-4">
                                                    <span className={`px-4 py-1.5 text-[10px] font-black rounded-full uppercase tracking-widest border ${req.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                                                        req.status === 'REJECTED' ? 'bg-rose-50 text-rose-600 border-rose-100' :
                                                            'bg-amber-50 text-amber-600 border-amber-100'
                                                        }`}>
                                                        {req.status}
                                                    </span>
                                                    <button
                                                        onClick={() => setActiveTab('APPROVALS')}
                                                        className="p-2 text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
                                                        title="View Details"
                                                    >
                                                        <ArrowRight size={20} />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })
                            )}
                        </div>
                    </div>
                ) : activeTab === 'MY_APPLICATIONS' ? (
                    <div className="animate-fade-in">
                        {/* Status Filters */}
                        <div className="flex flex-wrap gap-3 mb-10">
                            {(['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const).map(status => {
                                const count = status === 'ALL'
                                    ? leaveRequests.filter(r => String(r.employeeId) === String(currentUser.id) || (currentUser.employeeId && String(r.employeeId) === String(currentUser.employeeId))).length
                                    : leaveRequests.filter(r => (String(r.employeeId) === String(currentUser.id) || (currentUser.employeeId && String(r.employeeId) === String(currentUser.employeeId))) && r.status === status).length;
                                return (
                                    <button
                                        key={status}
                                        onClick={() => setStatusFilter(status)}
                                        className={`px-6 py-2.5 rounded-xl text-xs font-black tracking-widest uppercase transition-all flex items-center gap-3 ${statusFilter === status
                                            ? 'bg-slate-800 text-white shadow-xl scale-105'
                                            : 'bg-white text-slate-500 border border-slate-100 hover:border-slate-300 hover:bg-slate-50'
                                            }`}
                                    >
                                        {status}
                                        <span className={`px-2 py-0.5 rounded text-[10px] ${statusFilter === status ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}`}>
                                            {count}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Leave Cards Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-10">
                            {leaveRequests
                                .filter(r => (String(r.employeeId) === String(currentUser.id) || (currentUser.employeeId && String(r.employeeId) === String(currentUser.employeeId))))
                                .sort((a, b) => new Date(b.appliedOn || '').getTime() - new Date(a.appliedOn || '').getTime())
                                .length === 0 ? (
                                <div className="col-span-full text-center py-20 bg-white rounded-[3rem] border-2 border-dashed border-slate-100 flex flex-col items-center gap-4">
                                    <div className="p-6 bg-slate-50 rounded-full text-slate-300"><Clock size={48} /></div>
                                    <p className="text-slate-400 font-bold italic">No leave applications found in this category.</p>
                                </div>
                            ) : (
                                leaveRequests
                                    .filter(r => (String(r.employeeId) === String(currentUser.id) || (currentUser.employeeId && String(r.employeeId) === String(currentUser.employeeId))))
                                    .sort((a, b) => new Date(b.appliedOn || '').getTime() - new Date(a.appliedOn || '').getTime())
                                    .map(req => {
                                        const requesterName = req.appliedByName || currentUser.name || 'Member ' + req.employeeId;
                                        const approverName = req.appliedToName || 'Reviewer ' + req.appliedTo;

                                        return (
                                            <div key={req.id} className="group bg-white rounded-[3rem] shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden relative flex flex-col transition-all hover:-translate-y-2 hover:shadow-2xl">
                                                <div className={`h-3 ${req.status === 'APPROVED' ? 'bg-emerald-500' : req.status === 'REJECTED' ? 'bg-rose-500' : 'bg-amber-500'}`}></div>

                                                <div className="p-10 flex-1">
                                                    <div className="flex items-center gap-5 mb-8">
                                                        <div className="w-20 h-20 bg-gradient-to-br from-indigo-50 to-white text-indigo-600 rounded-[2rem] flex items-center justify-center font-black text-3xl border border-indigo-100 shadow-sm">
                                                            {requesterName.charAt(0)}
                                                        </div>
                                                        <div className="flex-1">
                                                            <div className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">My Application</div>
                                                            <div className="font-black text-slate-800 text-2xl leading-none uppercase tracking-tight">{requesterName}</div>
                                                            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Ref ID: #{req.id?.slice(-6).toUpperCase()}</div>
                                                        </div>
                                                        <div className="bg-slate-50 px-4 py-2 rounded-2xl border border-slate-100 text-center">
                                                            <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Forwarded To</div>
                                                            <div className="text-[10px] font-black text-indigo-600 uppercase">{approverName}</div>
                                                        </div>
                                                    </div>

                                                    <div className="flex flex-wrap gap-2 mb-8">
                                                        <span className="px-4 py-1.5 bg-indigo-50 text-indigo-700 text-[10px] font-black rounded-full uppercase tracking-widest border border-indigo-100">{req.leaveType}</span>
                                                        <span className={`px-4 py-1.5 text-[10px] font-black rounded-full uppercase tracking-widest shadow-sm ${req.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : req.status === 'REJECTED' ? 'bg-rose-50 text-rose-600 border border-rose-100' : 'bg-amber-50 text-amber-700 border border-amber-100'}`}>
                                                            {req.status}
                                                        </span>
                                                    </div>

                                                    <h3 className="font-black text-slate-800 text-sm mb-3 uppercase tracking-tight">{req.subject}</h3>
                                                    <p className="text-slate-500 italic bg-slate-50/50 p-6 rounded-[2rem] border border-slate-100 mb-8 leading-relaxed line-clamp-2">"{req.reason}"</p>

                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div className="flex items-center gap-4 p-4 bg-slate-50/50 rounded-2xl border border-slate-100">
                                                            <div className="w-10 h-10 bg-white shadow-sm text-indigo-500 rounded-xl flex items-center justify-center border border-indigo-50"><CalendarDays size={18} /></div>
                                                            <div className="flex flex-col">
                                                                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Duration</span>
                                                                <span className="text-[10px] font-black text-slate-700">{req.startDate} → {req.endDate}</span>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-4 p-4 bg-slate-50/50 rounded-2xl border border-slate-100">
                                                            <div className="w-10 h-10 bg-white shadow-sm text-slate-400 rounded-xl flex items-center justify-center border border-slate-100"><Clock size={18} /></div>
                                                            <div className="flex flex-col">
                                                                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Pattern</span>
                                                                <span className="text-[10px] font-black text-slate-700 uppercase">{req.durationType}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="bg-slate-50/80 p-8 flex justify-between items-center mt-auto border-t border-slate-100">
                                                    <div className="flex flex-col">
                                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Submission Date</span>
                                                        <span className="text-xs font-black text-slate-600">{req.appliedOn?.split('T')[0] || 'N/A'}</span>
                                                    </div>
                                                    {req.status === 'PENDING' && (
                                                        <button
                                                            onClick={() => handleDeleteLeave(req)}
                                                            className="px-6 py-3 bg-white border border-rose-100 text-rose-500 hover:bg-rose-500 hover:text-white rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all shadow-sm flex items-center gap-2 group/btn"
                                                            title="Withdraw Application"
                                                        >
                                                            <X size={16} className="group-hover/btn:rotate-90 transition-transform" />
                                                            Withdraw Application
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })
                            )}
                        </div>
                    </div>
                ) : activeTab === 'APPROVALS' ? (
                    <div className="animate-fade-in">
                        {/* Status Filters */}
                        <div className="flex flex-wrap gap-3 mb-10">
                            {(['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const).map(status => {
                                const relevantReqs = isAdmin ? leaveRequests : leaveRequests.filter(r => String(r.appliedTo) === String(currentUser.id) || (currentUser.employeeId && String(r.appliedTo) === String(currentUser.employeeId)));
                                const count = status === 'ALL'
                                    ? relevantReqs.length
                                    : relevantReqs.filter(r => r.status === status).length;
                                return (
                                    <button
                                        key={status}
                                        onClick={() => setStatusFilter(status)}
                                        className={`px-6 py-2.5 rounded-xl text-xs font-black tracking-widest uppercase transition-all flex items-center gap-3 ${statusFilter === status
                                            ? 'bg-slate-800 text-white shadow-xl scale-105'
                                            : 'bg-white text-slate-500 border border-slate-100 hover:border-slate-300 hover:bg-slate-50'
                                            }`}
                                    >
                                        {status}
                                        <span className={`px-2 py-0.5 rounded text-[10px] ${statusFilter === status ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}`}>
                                            {count}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Requests List */}
                        <div className="grid grid-cols-1 gap-8">
                            {(() => {
                                const relevantRequests = isAdmin
                                    ? leaveRequests
                                    : leaveRequests.filter(r => String(r.appliedTo) === String(currentUser.id) || (currentUser.employeeId && String(r.appliedTo) === String(currentUser.employeeId)));

                                const filteredRequests = statusFilter === 'ALL'
                                    ? relevantRequests
                                    : relevantRequests.filter(r => r.status === statusFilter);

                                const sortedRequests = filteredRequests.sort((a, b) =>
                                    new Date(b.appliedOn || '').getTime() - new Date(a.appliedOn || '').getTime()
                                );

                                if (sortedRequests.length === 0) {
                                    return <div className="text-center py-20 bg-white rounded-[3rem] border-2 border-dashed border-slate-100 flex flex-col items-center gap-4">
                                        <div className="p-6 bg-slate-50 rounded-full text-slate-300"><Clock size={48} /></div>
                                        <p className="text-slate-400 font-bold italic">No requests found.</p>
                                    </div>;
                                }

                                return sortedRequests.map(req => {
                                    const requesterName = req.appliedByName || 'Member ' + req.employeeId;
                                    const approverName = req.appliedToName || 'Reviewer ' + req.appliedTo;
                                    // Still try to find detailed requester info for designation/dept display
                                    const requester = employees.find(e => String(e.id) === String(req.employeeId));

                                    return (
                                        <div key={req.id} className="bg-white rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden flex flex-col md:flex-row min-h-[14rem] hover:ring-2 hover:ring-indigo-100/50 transition-all">
                                            <div className={`md:w-3 ${req.status === 'APPROVED' ? 'bg-emerald-500' : req.status === 'REJECTED' ? 'bg-rose-500' : 'bg-amber-500'}`}></div>
                                            <div className="flex-1 p-8 flex flex-col md:flex-row gap-8">
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-4 mb-6">
                                                        <div className="w-14 h-14 bg-gradient-to-br from-indigo-50 to-white text-indigo-600 rounded-2xl flex items-center justify-center font-black text-xl border border-indigo-100 shadow-sm shadow-indigo-50">
                                                            {requesterName.charAt(0)}
                                                        </div>
                                                        <div>
                                                            <div className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">Requested By</div>
                                                            <div className="font-black text-slate-800 text-lg leading-none uppercase tracking-tight">{requesterName}</div>
                                                            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">{requester?.designation || (req.department !== 'Staff' ? 'Staff' : '')} {requester?.department || req.department}</div>
                                                        </div>
                                                        {isAdmin && (
                                                            <div className="ml-auto flex items-center gap-2 text-[10px] text-slate-400 bg-slate-50 px-3 py-1.5 rounded-full border border-slate-100 font-black tracking-widest uppercase">
                                                                To: <span className="text-indigo-600">{approverName}</span>
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className="flex flex-wrap gap-2 mb-6">
                                                        <span className="px-3 py-1 bg-indigo-50 text-indigo-700 text-[10px] font-black rounded-full uppercase tracking-tighter border border-indigo-100">{req.leaveType}</span>
                                                        <span className="px-3 py-1 bg-slate-50 text-slate-600 text-[10px] font-black rounded-full uppercase tracking-tighter border border-slate-100">{req.durationType}</span>
                                                        <span className="px-3 py-1 bg-white text-slate-400 text-[10px] font-black rounded-full uppercase tracking-tighter border border-slate-100">REF: #{req.id?.slice(-6).toUpperCase()}</span>
                                                    </div>

                                                    <h4 className="font-black text-slate-800 text-sm mb-2 uppercase tracking-tight">{req.subject}</h4>
                                                    <p className="text-slate-500 text-sm italic bg-slate-50/50 p-6 rounded-3xl border border-slate-100 mb-6 leading-relaxed">"{req.reason}"</p>

                                                    <div className="flex flex-wrap gap-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                                        <span className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 rounded-lg"><CalendarDays size={14} className="text-indigo-400" /> {req.startDate} <span className="text-indigo-200">→</span> {req.endDate}</span>
                                                        <span className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 rounded-lg"><Clock size={14} className="text-indigo-400" /> APPLIED: {req.appliedOn?.split('T')[0] || 'N/A'}</span>
                                                    </div>
                                                </div>

                                                <div className="flex flex-col justify-center gap-3 min-w-[200px] bg-slate-50/50 p-6 rounded-[2rem] border border-slate-100 md:border-none md:bg-transparent">
                                                    {req.status === 'PENDING' && (
                                                        <>
                                                            <button
                                                                onClick={() => handleApproval(req, true)}
                                                                className="w-full py-4 px-6 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:shadow-xl hover:shadow-emerald-100 transition-all flex items-center justify-center gap-3"
                                                            >
                                                                <CheckCircle2 size={18} /> Approve
                                                            </button>
                                                            <button
                                                                onClick={() => handleApproval(req, false)}
                                                                className="w-full py-4 px-6 bg-white border border-rose-200 text-rose-600 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-rose-50 transition-all flex items-center justify-center gap-3 shadow-sm"
                                                            >
                                                                <XCircle size={18} /> Reject
                                                            </button>
                                                        </>
                                                    )}
                                                    {req.status !== 'PENDING' && (
                                                        <div className={`p-6 rounded-3xl text-center flex flex-col items-center gap-2 border-2 border-dotted ${req.status === 'APPROVED' ? 'border-emerald-100 text-emerald-600 bg-emerald-50/20' : 'border-rose-100 text-rose-600 bg-rose-50/20'}`}>
                                                            {req.status === 'APPROVED' ? <CheckCircle2 size={32} /> : <XCircle size={32} />}
                                                            <span className="text-xs font-black uppercase tracking-widest">Decision Processed</span>
                                                            <span className="text-[10px] opacity-70 font-bold">{req.status} APPLICATION</span>
                                                        </div>
                                                    )}
                                                    {isAdmin && (
                                                        <button
                                                            onClick={() => handleDeleteLeave(req)}
                                                            className="w-full py-2.5 px-4 bg-transparent text-slate-300 rounded-xl font-bold text-[10px] uppercase tracking-widest hover:text-rose-500 transition-all flex items-center justify-center gap-2 mt-auto"
                                                        >
                                                            <X size={14} /> Delete Log
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                });
                            })()}
                        </div>
                    </div>
                ) : null}
            </div>


            {/* APPLY MODAL */}
            {showApplyModal && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in duration-300">
                    <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] border border-white/20 animate-in zoom-in-95 duration-300">
                        <div className="p-8 border-b border-slate-100 bg-gradient-to-r from-indigo-50/50 to-violet-50/50 flex justify-between items-center shrink-0">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-indigo-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-100"><Send size={24} /></div>
                                <div>
                                    <h3 className="text-2xl font-black text-slate-800 tracking-tight uppercase">Apply for Leave</h3>
                                    <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest leading-none">Complete the form below to submit your request</p>
                                </div>
                            </div>
                            <button onClick={() => setShowApplyModal(false)} className="p-3 hover:bg-white hover:shadow-md rounded-2xl text-slate-400 transition-all"><X size={24} /></button>
                        </div>
                        <div className="p-8 space-y-8 overflow-y-auto custom-scrollbar">
                            {errorMessage && (
                                <div className="bg-rose-50 border border-rose-100 rounded-[1.5rem] p-6 flex gap-4 animate-pulse">
                                    <AlertCircle size={24} className="text-rose-500 shrink-0" />
                                    <div>
                                        <p className="text-xs font-black text-rose-700 uppercase tracking-widest mb-1">Attention Required</p>
                                        <p className="text-sm text-rose-600 font-bold">{errorMessage}</p>
                                    </div>
                                </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-2">
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Type of Leave</label>
                                    <div className="relative group">
                                        <select
                                            className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 focus:ring-4 focus:ring-indigo-100 focus:bg-white outline-none transition-all font-bold text-slate-700 appearance-none cursor-pointer"
                                            value={newLeave.leaveType || ''}
                                            onChange={e => setNewLeave(prev => ({ ...prev, leaveType: e.target.value as LeaveType }))}
                                        >
                                            {LEAVE_TYPES_LIST.map(t => <option key={t} value={t}>{t}</option>)}
                                        </select>
                                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 group-hover:text-indigo-500 transition-colors"><Clock size={18} /></div>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Duration Pattern</label>
                                    <div className="relative group">
                                        <select
                                            className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 focus:ring-4 focus:ring-indigo-100 focus:bg-white outline-none transition-all font-bold text-slate-700 appearance-none cursor-pointer"
                                            value={newLeave.durationType}
                                            onChange={e => setNewLeave(prev => ({ ...prev, durationType: e.target.value as LeaveDurationType }))}
                                        >
                                            <option value="Multiple Days">Multiple Days</option>
                                            <option value="Full Day">Full Day (One Day)</option>
                                            <option value="Half Day">Half Day (50%)</option>
                                            <option value="Short Leave">Short Leave (2 Hours)</option>
                                        </select>
                                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 group-hover:text-indigo-500 transition-colors"><CalendarDays size={18} /></div>
                                    </div>
                                </div>
                            </div>

                            {/* Dynamic Date Selection */}
                            <div className="p-8 bg-slate-50/50 rounded-[2rem] border border-slate-100 border-dashed">
                                {newLeave.durationType === 'Multiple Days' ? (
                                    <div className="grid grid-cols-2 gap-8">
                                        <div className="space-y-2">
                                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Start Date</label>
                                            <input
                                                type="date"
                                                className="w-full bg-white border border-slate-200 rounded-2xl p-4 focus:ring-4 focus:ring-indigo-100 outline-none transition-all font-bold text-slate-700"
                                                value={newLeave.startDate || ''}
                                                onChange={e => setNewLeave(prev => ({ ...prev, startDate: e.target.value }))}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">End Date</label>
                                            <input
                                                type="date"
                                                className="w-full bg-white border border-slate-200 rounded-2xl p-4 focus:ring-4 focus:ring-indigo-100 outline-none transition-all font-bold text-slate-700"
                                                value={newLeave.endDate || ''}
                                                onChange={e => setNewLeave(prev => ({ ...prev, endDate: e.target.value }))}
                                            />
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-2 max-w-sm mx-auto">
                                        <label className="block text-[10px] font-black text-center text-slate-400 uppercase tracking-widest mb-2">Select Date</label>
                                        <input
                                            type="date"
                                            className="w-full bg-white border border-slate-200 rounded-2xl p-4 focus:ring-4 focus:ring-indigo-100 outline-none transition-all font-bold text-slate-700 text-center"
                                            value={singleDate}
                                            onChange={e => setSingleDate(e.target.value)}
                                        />
                                    </div>
                                )}
                            </div>

                            <div className="space-y-2">
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Forward Application To</label>
                                <div className="relative group">
                                    <select
                                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 focus:ring-4 focus:ring-indigo-100 focus:bg-white outline-none transition-all font-bold text-slate-700 appearance-none cursor-pointer"
                                        value={newLeave.appliedTo || ''}
                                        onChange={e => setNewLeave(prev => ({ ...prev, appliedTo: e.target.value }))}
                                    >
                                        <option value="">Select Reporting Manager</option>
                                        <option value="ADMIN">System Administrator</option>
                                        {employees.filter(e => e.id !== myEmpId).map(e => (
                                            <option key={e.id} value={e.id}>{e.name} • {e.designation}</option>
                                        ))}
                                    </select>
                                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 group-hover:text-indigo-500 transition-colors"><UserIcon size={18} /></div>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="flex justify-between items-end">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Application Subject</label>
                                    <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
                                        <button onClick={() => setIsCustomSubject(false)} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-tight transition-all ${!isCustomSubject ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>Standard</button>
                                        <button onClick={() => setIsCustomSubject(true)} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-tight transition-all ${isCustomSubject ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>Custom</button>
                                    </div>
                                </div>
                                {isCustomSubject ? (
                                    <input
                                        type="text"
                                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 focus:ring-4 focus:ring-indigo-100 focus:bg-white outline-none transition-all font-bold text-slate-700 uppercase tracking-tight"
                                        value={newLeave.subject || ''}
                                        onChange={e => setNewLeave(prev => ({ ...prev, subject: e.target.value }))}
                                        placeholder="ENTER CUSTOM SUBJECT..."
                                    />
                                ) : (
                                    <div className="relative group">
                                        <select
                                            className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 focus:ring-4 focus:ring-indigo-100 focus:bg-white outline-none transition-all font-bold text-slate-700 appearance-none cursor-pointer"
                                            value={newLeave.subject || ''}
                                            onChange={e => setNewLeave(prev => ({ ...prev, subject: e.target.value }))}
                                        >
                                            <option value="">Choose Template Subject...</option>
                                            {LEAVE_SUBJECT_TEMPLATES.map(t => <option key={t} value={t}>{t}</option>)}
                                        </select>
                                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 group-hover:text-indigo-500 transition-colors"><AlertCircle size={18} /></div>
                                    </div>
                                )}
                            </div>

                            <div className="space-y-2">
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Reason (Detailed Description)</label>
                                <div className="relative">
                                    <textarea
                                        className="w-full bg-slate-50 border border-slate-100 rounded-[2rem] p-6 focus:ring-4 focus:ring-indigo-100 focus:bg-white outline-none transition-all font-medium text-slate-600 h-40 resize-none leading-relaxed italic"
                                        value={newLeave.reason || ''}
                                        onChange={e => setNewLeave(prev => ({ ...prev, reason: e.target.value }))}
                                        placeholder="Please provide the specific reason for your leave request..."
                                    />

                                </div>
                            </div>
                        </div>
                        <div className="p-8 bg-slate-50/80 flex justify-end gap-4 border-t border-slate-100 shrink-0 backdrop-blur-sm">
                            <button onClick={() => setShowApplyModal(false)} className="px-8 py-4 text-slate-400 font-black text-xs uppercase tracking-widest hover:text-slate-600 transition-colors" disabled={isSubmitting}>Cancel</button>
                            <button
                                onClick={handleApplyLeave}
                                disabled={isSubmitting}
                                className="px-10 py-4 bg-gradient-to-r from-indigo-600 to-violet-700 text-white rounded-[1.5rem] font-black text-xs uppercase tracking-widest shadow-xl shadow-indigo-200 hover:shadow-2xl hover:shadow-indigo-300 transition-all flex items-center gap-3 disabled:opacity-50 disabled:grayscale active:scale-95"
                            >
                                {isSubmitting ? <Clock size={16} className="animate-spin" /> : <Send size={16} />}
                                {isSubmitting ? 'Processing...' : 'Submit Application'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};
