import React, { useState, useMemo, useCallback, useEffect } from 'react';
import api, { safeGet, safePost, extractPayload, ensureArray } from '../src/utils/api';
import { ChecklistTemplate, ChecklistInstance, Employee, User, FrequencyType, Notification, Holiday, ChecklistConfig } from '../types';
import {
    ListChecks, Plus, Calendar, CheckCircle2, Clock, Trash2, X, RefreshCw,
    AlertCircle, Loader2, Info, ShieldCheck, Sun, ArrowRight, Target,
    Filter, Search, ChevronLeft, ChevronRight, CheckCheck, Circle,
    BarChart3, TrendingUp, Users, AlertTriangle, Zap, Pencil, Save,
    BookOpen, ThumbsUp, ThumbsDown, MessageSquare, CalendarClock, ArrowRightLeft
} from 'lucide-react';
import { format, addDays, addMonths, addYears, addWeeks, isSunday, isBefore, getDay } from 'date-fns';

interface ChecklistSystemProps {
    templates: ChecklistTemplate[];
    setTemplates: React.Dispatch<React.SetStateAction<ChecklistTemplate[]>>;
    instances: ChecklistInstance[];
    setInstances: React.Dispatch<React.SetStateAction<ChecklistInstance[]>>;
    currentUser: User;
    employees: Employee[];
    holidays: Holiday[];
    addNotification: (title: string, msg: string, type: Notification['type'], targetUser: string) => void;
}

// ─── tiny helpers ────────────────────────────────────────────────────────────

const cx = (...cls: (string | false | undefined)[]) => cls.filter(Boolean).join(' ');

const FrequencyBadge: React.FC<{ freq: string }> = ({ freq }) => {
    const map: Record<string, { label: string; color: string }> = {
        'DAILY': { label: 'Daily', color: 'bg-blue-50 text-blue-700 border-blue-200' },
        'ALTERNATE': { label: 'Alt Day', color: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
        'WEEKLY': { label: 'Weekly', color: 'bg-violet-50 text-violet-700 border-violet-200' },
        'FORTNIGHTLY': { label: 'Fortnightly', color: 'bg-purple-50 text-purple-700 border-purple-200' },
        'ALTERNATE-WEEK': { label: 'Alt Week', color: 'bg-purple-50 text-purple-700 border-purple-200' },
        'MONTHLY': { label: 'Monthly', color: 'bg-amber-50 text-amber-700 border-amber-200' },
        'QUARTERLY': { label: 'Quarterly', color: 'bg-orange-50 text-orange-700 border-orange-200' },
        'HALF-YEARLY': { label: 'Half-Yearly', color: 'bg-rose-50 text-rose-700 border-rose-200' },
        'YEARLY': { label: 'Yearly', color: 'bg-red-50 text-red-700 border-red-200' },
        'ONE-TIME': { label: 'One-Time', color: 'bg-slate-100 text-slate-600 border-slate-200' },
        'EVENT-BASED': { label: 'Event', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
        'PARTICULAR-DATE': { label: 'Fixed Date', color: 'bg-teal-50 text-teal-700 border-teal-200' },
    };
    const cfg = map[freq] || { label: freq, color: 'bg-slate-100 text-slate-500 border-slate-200' };
    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${cfg.color}`}>
            {cfg.label}
        </span>
    );
};

const StatusPill: React.FC<{ status: string }> = ({ status }) => (
    status === 'COMPLETED'
        ? <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCheck size={10} /> Done
        </span>
        : status === 'STOPPED'
        ? <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-red-50 text-red-700 border border-red-200">
            <AlertCircle size={10} /> Stopped
        </span>
        : status === 'MISSED'
        ? <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-orange-50 text-orange-700 border border-orange-200">
            <X size={10} /> Missed
        </span>
        : status === 'EXCUSE_REQUESTED'
        ? <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
            <BookOpen size={10} /> Excuse Pending
        </span>
        : status === 'MISSED_EXCUSED'
        ? <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-teal-50 text-teal-700 border border-teal-200">
            <ShieldCheck size={10} /> Excused
        </span>
        : <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
            <Circle size={10} /> Pending
        </span>
);


const getInitials = (name: string) => {
    if (!name) return '??';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return parts[0].slice(0, 2).toUpperCase();
};

const getAvatarColor = (name: string) => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = Math.abs(hash % 360);
    return `hsl(${h}, 65%, 42%)`;
};

const Avatar: React.FC<{ name: string; size?: number; className?: string }> = ({ name, size = 32, className = '' }) => {
    const initials = getInitials(name);
    const bgColor = getAvatarColor(name);
    return (
        <div 
            className={`flex items-center justify-center rounded-full text-white font-extrabold tracking-wider border-2 border-white shadow-sm shrink-0 select-none ${className}`}
            style={{ width: size, height: size, backgroundColor: bgColor, fontSize: size * 0.38 }}
            title={name}
        >
            {initials}
        </div>
    );
};

// ─── main component ───────────────────────────────────────────────────────────

const ChecklistSystemComponent: React.FC<ChecklistSystemProps> = ({
    templates, setTemplates, instances, setInstances, currentUser, employees, holidays, addNotification
}) => {
    const getEmployeeName = useCallback((id: string | number | undefined) => {
        if (!id) return '';
        const emp = employees.find(e => String(e.id) === String(id));
        return emp ? emp.name : String(id);
    }, [employees]);

    const [activeTab, setActiveTab] = useState<'AGENDA' | 'COMPLETED' | 'MONITOR' | 'MISSED' | 'MASTER'>(
        currentUser.role === 'ADMIN' ? 'MONITOR' : 'AGENDA'
    );
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [markingIds, setMarkingIds] = useState<Set<string>>(new Set());
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    // Transfer Request & Excuse modal state (supports single & multi-date selection)
    const [excuseModal, setExcuseModal] = useState<{
        open: boolean;
        itemId: string;
        dbId: string;
        targetDoerId: string;
        targetDate: string;
        selectedDates: string[];
        customDateInput: string;
        reason: string;
    }>({ open: false, itemId: '', dbId: '', targetDoerId: '', targetDate: '', selectedDates: [], customDateInput: '', reason: '' });
    const [isSubmittingExcuse, setIsSubmittingExcuse] = useState(false);
    const [approvingExcuseIds, setApprovingExcuseIds] = useState<Set<string>>(new Set());

    // Transfer modal state (supports selecting target user and single/multiple dates)
    const [transferModal, setTransferModal] = useState<{
        open: boolean;
        itemId: string;
        dbId: string;
        currentDate: string;
        selectedDates: string[];
        targetDoerId: string;
        customDateInput: string;
        note: string;
    }>({
        open: false,
        itemId: '',
        dbId: '',
        currentDate: '',
        selectedDates: [],
        targetDoerId: '',
        customDateInput: '',
        note: ''
    });
    const [isTransferring, setIsTransferring] = useState(false);

    // Edit Frequency state
    const [editingTemplate, setEditingTemplate] = useState<ChecklistTemplate | null>(null);
    const [editConfig, setEditConfig] = useState<{ frequency: FrequencyType; particularDateType?: 'EVERY-MONTH' | 'EVERY-YEAR'; startDate: string }>({ frequency: 'DAILY', startDate: '' });
    const [isSavingFreq, setIsSavingFreq] = useState(false);
    const [editDoerId, setEditDoerId] = useState<string>('');
    const [transferEffectiveDate, setTransferEffectiveDate] = useState<string>('');

    // Monitor filters
    const [monitorLeadId, setMonitorLeadId] = useState<string>(
        currentUser.role === 'ADMIN' ? 'ALL' : (currentUser.employeeId || String(currentUser.id) || 'ALL')
    );
    const [monitorStatus, setMonitorStatus] = useState<'ALL' | 'PENDING' | 'COMPLETED' | 'STOPPED' | 'MISSED' | 'EXCUSE_REQUESTED' | 'MISSED_EXCUSED'>('ALL');
    const [monitorSearchInput, setMonitorSearchInput] = useState('');
    const [monitorSearch, setMonitorSearch] = useState('');
    const [agendaSearchInput, setAgendaSearchInput] = useState('');
    const [agendaSearch, setAgendaSearch] = useState('');
    const [completedSearchInput, setCompletedSearchInput] = useState('');
    const [completedSearch, setCompletedSearch] = useState('');
    const [agendaDateFilter, setAgendaDateFilter] = useState<'TODAY' | 'UPCOMING_WEEK' | 'ALL'>('TODAY');

    useEffect(() => {
        const handler = setTimeout(() => {
            setMonitorSearch(monitorSearchInput);
        }, 250);
        return () => clearTimeout(handler);
    }, [monitorSearchInput]);

    useEffect(() => {
        const handler = setTimeout(() => {
            setAgendaSearch(agendaSearchInput);
        }, 250);
        return () => clearTimeout(handler);
    }, [agendaSearchInput]);

    useEffect(() => {
        const handler = setTimeout(() => {
            setCompletedSearch(completedSearchInput);
        }, 250);
        return () => clearTimeout(handler);
    }, [completedSearchInput]);

    const [currentPage, setCurrentPage] = useState(1);
    const [pendingPage, setPendingPage] = useState(1);
    const [completedPage, setCompletedPage] = useState(1);
    const [myCompletedPage, setMyCompletedPage] = useState(1);
    const itemsPerPage = 50;

    const [newTemplate, setNewTemplate] = useState<Partial<ChecklistTemplate>>({
        active: true,
        startDate: format(new Date(), 'yyyy-MM-dd'),
        config: { frequency: 'DAILY', particularDateType: 'EVERY-MONTH' }
    });

    const isAdmin = currentUser.role === 'ADMIN';
    const todayStr = format(new Date(), 'yyyy-MM-dd');

    useEffect(() => { setCurrentPage(1); setPendingPage(1); setCompletedPage(1); }, [monitorLeadId, monitorStatus, monitorSearch, activeTab]);

    // ── doer matching: checks all possible ID formats ────────────────────────
    // Template doerId stores Employee.id (e.g. "EMP001").
    // currentUser.employeeId is the link to an Employee record.
    // We must match any of: employeeId, id (numeric), or name.
    const doesDoerMatch = useCallback((doerId: string | number | undefined, user: User): boolean => {
        if (doerId === undefined || doerId === null || doerId === '') return false;
        const s = String(doerId).trim();
        if (!s) return false;
        const checks = [
            user.employeeId !== undefined && user.employeeId !== null && s === String(user.employeeId).trim(),
            user.id !== undefined && user.id !== null && s === String(user.id).trim(),
            user.name !== undefined && user.name !== null && s.toLowerCase() === user.name.toLowerCase(),
        ];
        return checks.some(Boolean);
    }, []);

    // Derive the current user's own employee ID (the key used in templates)
    const myEmployeeId = currentUser.employeeId || String(currentUser.id || '');

    // ── load data ─────────────────────────────────────────────────────────────
    useEffect(() => {
        let mounted = true;
        const load = async () => {
            setIsLoading(true);
            try {
                const r = await safeGet('/checklist-templates');
                const mapped = ensureArray(extractPayload(r) || []).map((x: any) => ({
                    id: x.id,
                    taskName: x.data.taskName,
                    doerId: x.data.doerId,
                    buddyId: x.data.buddyId,
                    department: x.data.department,
                    startDate: x.data.startDate,
                    config: x.data.config,
                    active: x.data.active
                }));
                if (!mounted) return;
                setTemplates(mapped);

                const insts: any[] = [];

                // Single batch request for all checklist instances (replaces N+1 sequential requests)
                const batchRes = await safeGet('/checklists-instances/all');
                const grouped = (extractPayload(batchRes) || {}) as Record<string, any[]>;

                for (const tpl of mapped) {
                    try {
                        const rows = ensureArray(grouped[String(tpl.id)]);

                        if (rows.length > 0) {
                            // Instances exist in DB — parse and add them
                            rows.forEach((it: any) => {
                                try {
                                    const p = JSON.parse(it.item);
                                    const status = it.done ? 'COMPLETED' : (p.status ?? 'PENDING');
                                    if (tpl.active === false && status === 'PENDING') return;

                                    insts.push({
                                        ...p,
                                        dbId: it.id,
                                        // Trust instance doerId if available, fall back to template doerId
                                        doerId: p.doerId || tpl.doerId,
                                        department: p.department ?? tpl.department,
                                        taskName: p.taskName ?? tpl.taskName,
                                        templateId: String(tpl.id),
                                        status: status,
                                        completedDate: p.completedDate,
                                    });
                                } catch {
                                    const status = it.done ? 'COMPLETED' : 'PENDING';
                                    if (tpl.active === false && status === 'PENDING') return;

                                    insts.push({
                                        id: it.id, templateId: String(tpl.id), date: it.item,
                                        status: status,
                                        dbId: it.id, doerId: tpl.doerId,
                                        department: tpl.department, taskName: tpl.taskName,
                                    });
                                }
                            });
                        }
                    } catch (err) { /* ignore per-template fetch/parse errors */ }
                }

                if (mounted) setInstances(insts);
            } catch (e) {
                console.warn('Load failed', e);
            } finally {
                if (mounted) setIsLoading(false);
            }
        };
        load();
        return () => { mounted = false; };
    }, [refreshTrigger]);


    // ── scheduling ─────────────────────────────────────────────────────────────
    const getNextWorkingDay = useCallback((d: Date) => {
        let check = new Date(d);
        const hDates = holidays.map(h => h.date);
        let shifted = false, limit = 0;
        while ((isSunday(check) || hDates.includes(format(check, 'yyyy-MM-dd'))) && limit < 365) {
            check = addDays(check, 1); shifted = true; limit++;
        }
        return { date: check, shifted };
    }, [holidays]);

    const generateInstances = (template: ChecklistTemplate): ChecklistInstance[] => {
        if (template.active === false) return [];
        const items: ChecklistInstance[] = [];
        const config = template.config;
        const [sy, sm, sd] = template.startDate.split('-');
        const start = new Date(Number(sy), Number(sm) - 1, Number(sd));
        const horizon = addYears(new Date(), 5);
        let cursor = new Date(start), count = 0;
        const MAX = 2500;

        const push = (d: Date, idx: number) => {
            if (config.frequency === 'DAILY' && isSunday(d)) return;
            const { date: wd, shifted } = config.frequency === 'DAILY' ? { date: d, shifted: false } : getNextWorkingDay(d);
            items.push({ id: `CI-${template.id}-${idx}`, templateId: template.id, doerId: template.doerId, taskName: template.taskName, department: template.department, date: format(wd, 'yyyy-MM-dd'), status: 'PENDING', shiftedDueToHoliday: shifted });
        };

        if (config.frequency === 'ONE-TIME' || config.frequency === 'EVENT-BASED') { push(start, 0); }
        else if (config.frequency === 'DAILY' || config.frequency === 'ALTERNATE') {
            const step = config.frequency === 'ALTERNATE' ? 2 : 1;
            while (isBefore(cursor, horizon) && count < MAX) { push(cursor, count++); cursor = addDays(cursor, step); }
        } else if (config.frequency === 'WEEKLY' || config.frequency === 'FORTNIGHTLY' || config.frequency === 'ALTERNATE-WEEK') {
            const step = (config.frequency === 'FORTNIGHTLY' || config.frequency === 'ALTERNATE-WEEK') ? 2 : 1;
            while (isBefore(cursor, horizon) && count < MAX) { push(cursor, count++); cursor = addWeeks(cursor, step); }
        } else {
            let ms = 1;
            if (config.frequency === 'QUARTERLY') ms = 3;
            if (config.frequency === 'HALF-YEARLY') ms = 6;
            if (config.frequency === 'YEARLY') ms = 12;
            if (config.frequency === 'PARTICULAR-DATE') ms = config.particularDateType === 'EVERY-YEAR' ? 12 : 1;
            while (isBefore(cursor, horizon) && count < MAX) { push(new Date(cursor), count++); cursor = addMonths(cursor, ms); }
        }
        return items;
    };

    // ── create template ────────────────────────────────────────────────────────
    const handleCreateTemplate = () => {
        if (!newTemplate.taskName || !newTemplate.doerId || !newTemplate.startDate) {
            alert('Task Name, Assignee, and Start Date are required.');
            return;
        }
        setIsProcessing(true);
        setTimeout(() => {
            try {
                const template: ChecklistTemplate = {
                    id: `CT-${Date.now()}`,
                    taskName: newTemplate.taskName!,
                    doerId: newTemplate.doerId!,
                    buddyId: newTemplate.buddyId,
                    department: employees.find(e => String(e.id) === String(newTemplate.doerId))?.department || 'General',
                    startDate: newTemplate.startDate!,
                    config: (newTemplate.config as ChecklistConfig) || { frequency: 'DAILY' },
                    active: true
                };
                const generated = generateInstances(template);

                (async () => {
                    try {
                        const tplRes = await safePost('/checklist-templates', { taskName: template.taskName, doerId: template.doerId, buddyId: template.buddyId, department: template.department, startDate: template.startDate, config: template.config, active: template.active });
                        const tplId = (extractPayload(tplRes) || {}).id || template.id;
                        try {
                            await safePost('/checklists/bulk', { items: generated.map(inst => ({ refId: tplId, refType: 'TEMPLATE_INSTANCE', item: JSON.stringify({ ...inst, templateId: tplId }) })) });
                        } catch (e) { console.warn('Bulk insert failed', e); }

                        try {
                            const tr = await safeGet('/checklist-templates');
                            const mapped = ensureArray(extractPayload(tr)).map((x: any) => ({ id: x.id, taskName: x.data.taskName, doerId: x.data.doerId, buddyId: x.data.buddyId, department: x.data.department, startDate: x.data.startDate, config: x.data.config, active: x.data.active }));
                            setTemplates(mapped);
                            const ir = await safeGet(`/checklists/${encodeURIComponent(tplId)}`);
                            const newInsts: any[] = ensureArray(extractPayload(ir)).map((it: any) => {
                                try { const p = JSON.parse(it.item); return { ...p, dbId: it.id, doerId: p.doerId ?? template.doerId, department: p.department ?? template.department, taskName: p.taskName ?? template.taskName, templateId: String(tplId) }; }
                                catch { return { id: it.id, templateId: String(tplId), date: it.item, status: it.done ? 'COMPLETED' : 'PENDING', dbId: it.id, doerId: template.doerId, department: template.department, taskName: template.taskName }; }
                            });
                            setInstances(prev => [...prev, ...newInsts]);
                        } catch (e) { console.warn('Refresh failed', e); }
                    } catch (e) { console.error('Server create failed', e); }
                })();

                setShowCreateModal(false);
                setNewTemplate({ active: true, startDate: format(new Date(), 'yyyy-MM-dd'), config: { frequency: 'DAILY', particularDateType: 'EVERY-MONTH' } });
                addNotification('Checklist Ready', `5-year schedule generated for "${template.taskName}".`, 'CHECKLIST', String(template.doerId));
            } finally { setIsProcessing(false); }
        }, 800);
    };

    // ── mark done — BLOCKS re-click once completed ────────────────────────────
    const handleMarkDone = async (id: string, dbId?: string) => {
        const instance = instances.find(i => i.id === id);
        // Guard: already done or currently marking → do nothing
        if (!instance || instance.status === 'COMPLETED' || markingIds.has(id)) return;

        if (!dbId) {
            console.warn('No dbId for', id);
            alert('Hold on! The system is still syncing this task with the server. Please wait a moment and refresh before trying again.');
            return;
        }

        setMarkingIds(prev => new Set(prev).add(id));
        setInstances(prev => prev.map(i => i.id === id ? { ...i, status: 'COMPLETED', completedDate: todayStr } : i));

        try {
            const updated = { ...instance, status: 'COMPLETED', completedDate: todayStr };
            await api.put(`/checklists/${dbId}`, { done: true, item: JSON.stringify(updated) }, { withCredentials: true });
        } catch (err) {
            console.error('Mark done failed', err);
            setInstances(prev => prev.map(i => i.id === id ? { ...i, status: instance.status, completedDate: instance.completedDate } : i));
            alert('Failed to mark task as done. Please try again.');
        } finally {
            setMarkingIds(prev => { const s = new Set(prev); s.delete(id); return s; });
        }
    };

    const handleStopTask = async (id: string, dbId?: string) => {
        const instance = instances.find(i => i.id === id);
        if (!instance || instance.status !== 'PENDING' || markingIds.has(id)) return;

        if (!dbId) {
            console.warn('No dbId for', id);
            alert('Hold on! The system is still syncing this task with the server. Please wait a moment and refresh before trying again.');
            return;
        }

        setMarkingIds(prev => new Set(prev).add(id));
        setInstances(prev => prev.map(i => i.id === id ? { ...i, status: 'STOPPED' } : i));

        try {
            const updated = { ...instance, status: 'STOPPED' };
            await api.put(`/checklists/${dbId}`, { done: false, item: JSON.stringify(updated) }, { withCredentials: true });
        } catch (err) {
            console.error('Stop task failed', err);
            setInstances(prev => prev.map(i => i.id === id ? { ...i, status: 'PENDING' } : i));
            alert('Failed to stop task. Please try again.');
        } finally {
            setMarkingIds(prev => { const s = new Set(prev); s.delete(id); return s; });
        }
    };

    const handleMissTask = async (id: string, dbId?: string) => {
        const instance = instances.find(i => i.id === id);
        if (!instance || instance.status !== 'PENDING' || markingIds.has(id)) return;

        if (!dbId) {
            console.warn('No dbId for', id);
            alert('Hold on! The system is still syncing this task with the server. Please wait a moment and refresh before trying again.');
            return;
        }

        setMarkingIds(prev => new Set(prev).add(id));
        setInstances(prev => prev.map(i => i.id === id ? { ...i, status: 'MISSED' } : i));

        try {
            const updated = { ...instance, status: 'MISSED' };
            await api.put(`/checklists/${dbId}`, { done: false, item: JSON.stringify(updated) }, { withCredentials: true });
        } catch (err) {
            console.error('Miss task failed', err);
            setInstances(prev => prev.map(i => i.id === id ? { ...i, status: 'PENDING' } : i));
            alert('Failed to mark task as missed. Please try again.');
        } finally {
            setMarkingIds(prev => { const s = new Set(prev); s.delete(id); return s; });
        }
    };

    const handleMarkIncomplete = async (id: string, dbId?: string) => {
        const instance = instances.find(i => i.id === id);
        if (!instance || instance.status !== 'COMPLETED' || markingIds.has(id)) return;

        if (!dbId) {
            console.warn('No dbId for', id);
            alert('Hold on! The system is still syncing this task with the server. Please wait a moment and refresh before trying again.');
            return;
        }

        setMarkingIds(prev => new Set(prev).add(id));
        // Optimistically revert to PENDING
        setInstances(prev => prev.map(i => i.id === id ? { ...i, status: 'PENDING', completedDate: undefined } : i));

        try {
            const updated = { ...instance, status: 'PENDING' };
            delete updated.completedDate;
            await api.put(`/checklists/${dbId}`, { done: false, item: JSON.stringify(updated) }, { withCredentials: true });

            // Switch monitor filter to ALL so the reverted PENDING task is visible
            setMonitorStatus('ALL');
        } catch (err) {
            console.error('Mark incomplete failed', err);
            // Rollback on failure
            setInstances(prev => prev.map(i => i.id === id ? { ...i, status: 'COMPLETED', completedDate: instance.completedDate } : i));
            alert('Failed to mark task as incomplete. Please try again.');
        } finally {
            setMarkingIds(prev => { const s = new Set(prev); s.delete(id); return s; });
        }
    };

    // ── Task Transfer Request & Excuse Handlers ──────────────────────────────────────────────

    // Employee submits a task transfer request (with target employee, multi-day dates, and reason)
    const handleRequestExcuse = async (
        id: string,
        dbId: string,
        targetDoerId: string,
        selectedDates: string[],
        reason: string
    ) => {
        if (!reason.trim()) { alert('Please enter a reason before submitting.'); return; }
        const instance = instances.find(i => i.id === id);
        if (!instance || instance.status !== 'PENDING') return;

        setIsSubmittingExcuse(true);
        const dates = selectedDates && selectedDates.length > 0 ? [...selectedDates].sort() : [instance.date];
        const excuseData: ChecklistInstance = {
            ...instance,
            status: 'EXCUSE_REQUESTED',
            requestedTransferTo: targetDoerId || undefined,
            requestedTransferDate: dates[0],
            requestedTransferDates: dates,
            excuseReason: reason.trim(),
            excuseRequestedAt: new Date().toISOString(),
        };

        setInstances(prev => prev.map(i => i.id === id ? { ...i, ...excuseData } : i));
        setExcuseModal({ open: false, itemId: '', dbId: '', targetDoerId: '', targetDate: '', selectedDates: [], customDateInput: '', reason: '' });

        const targetEmp = employees.find(e => String(e.id) === String(targetDoerId));

        try {
            if (dbId) {
                await api.put(`/checklists/${dbId}`, { done: false, item: JSON.stringify(excuseData) }, { withCredentials: true });
            }
            addNotification(
                'Task Transfer Request Submitted',
                `${currentUser.name} requested to transfer task "${instance.taskName || 'Routine'}" ${targetEmp ? `to ${targetEmp.name}` : ''} (Date(s): ${dates.join(', ')}) — Reason: ${reason.trim()}`,
                'CHECKLIST',
                'ADMIN'
            );
        } catch (err) {
            console.error('Task transfer request failed', err);
            setInstances(prev => prev.map(i => i.id === id ? { ...i, status: 'PENDING' } : i));
            alert('Failed to submit transfer request. Please try again.');
        } finally {
            setIsSubmittingExcuse(false);
        }
    };

    // Admin approves task transfer request -> reassigns to transferee & date(s) (or marks excused)
    const handleApproveExcuse = async (id: string, dbId: string) => {
        const instance = instances.find(i => i.id === id);
        if (!instance || instance.status !== 'EXCUSE_REQUESTED') return;
        if (!dbId) { alert('Task sync in progress. Please wait.'); return; }

        setApprovingExcuseIds(prev => new Set(prev).add(id));

        const originalDate = instance.date;
        const originalDoer = instance.doerId;
        const targetDoer = instance.requestedTransferTo || instance.doerId;
        const requestedDates = (instance.requestedTransferDates && instance.requestedTransferDates.length > 0)
            ? [...instance.requestedTransferDates].sort()
            : [instance.requestedTransferDate || instance.date];

        const firstDate = requestedDates[0];
        const tpl = templates.find(t => String(t.id) === String(instance.templateId));
        const isTransfer = Boolean(instance.requestedTransferTo && String(instance.requestedTransferTo) !== String(originalDoer)) || firstDate !== originalDate || requestedDates.length > 1;

        const firstUpdated: ChecklistInstance = {
            ...instance,
            date: firstDate,
            doerId: targetDoer,
            status: isTransfer ? 'PENDING' : 'MISSED_EXCUSED', // Re-activates as PENDING for transferee if transferred
            transferredFrom: isTransfer ? originalDate : instance.transferredFrom,
            transferredTo: isTransfer ? targetDoer : instance.transferredTo,
            transferNote: instance.excuseReason || 'Approved transfer request',
            transferredBy: currentUser.name,
            transferredAt: new Date().toISOString(),
            excuseApprovedBy: currentUser.name,
        };
        delete firstUpdated.requestedTransferTo;
        delete firstUpdated.requestedTransferDate;
        delete firstUpdated.requestedTransferDates;
        delete firstUpdated.excuseReason;
        delete firstUpdated.excuseRequestedAt;

        const newInstances: ChecklistInstance[] = [firstUpdated];

        // Additional requested dates create new task instances assigned to target user
        for (let idx = 1; idx < requestedDates.length; idx++) {
            const extraDate = requestedDates[idx];
            const extraInst: ChecklistInstance = {
                id: `CI-TR-${instance.templateId}-${Date.now()}-${idx}`,
                templateId: instance.templateId,
                date: extraDate,
                status: 'PENDING',
                doerId: targetDoer,
                taskName: instance.taskName || tpl?.taskName || 'Routine Task',
                department: instance.department || tpl?.department || 'General',
                transferredFrom: originalDate,
                transferredTo: targetDoer,
                transferNote: instance.excuseReason || 'Approved transfer request',
                transferredBy: currentUser.name,
                transferredAt: new Date().toISOString(),
            };
            newInstances.push(extraInst);
        }

        // Optimistic update
        setInstances(prev => {
            const filtered = prev.filter(x => x.id !== id);
            return [...filtered, ...newInstances];
        });

        try {
            await api.put(`/checklists/${dbId}`, { done: false, item: JSON.stringify(firstUpdated) }, { withCredentials: true });

            if (newInstances.length > 1) {
                const extraItems = newInstances.slice(1);
                try {
                    await safePost('/checklists/bulk', {
                        items: extraItems.map(inst => ({
                            refId: instance.templateId,
                            refType: 'TEMPLATE_INSTANCE',
                            item: JSON.stringify(inst)
                        }))
                    });
                } catch (err) {
                    console.warn('Bulk insert extra requested transferred instances failed', err);
                }
            }

            // Notify Requester
            addNotification(
                'Transfer Request Approved ✓',
                `Your request to transfer "${instance.taskName || 'routine task'}" (${requestedDates.join(', ')}) was approved by ${currentUser.name}.`,
                'CHECKLIST',
                String(originalDoer || '')
            );

            // If transferred to another user, notify Transferee
            if (instance.requestedTransferTo && String(instance.requestedTransferTo) !== String(originalDoer)) {
                addNotification(
                    'Task Transferred to You',
                    `Task "${instance.taskName || 'routine task'}" (${requestedDates.join(', ')}) has been assigned to you via approved transfer request. Completing this will count toward your score.`,
                    'CHECKLIST',
                    String(instance.requestedTransferTo)
                );
            }
        } catch (err) {
            console.error('Approve transfer failed', err);
            setInstances(prev => prev.map(i => i.id === id ? { ...i, status: 'EXCUSE_REQUESTED' } : i));
            alert('Failed to approve transfer request. Please try again.');
        } finally {
            setApprovingExcuseIds(prev => { const s = new Set(prev); s.delete(id); return s; });
        }
    };

    // Admin rejects task transfer request -> reverts to PENDING for original doer
    const handleRejectExcuse = async (id: string, dbId: string) => {
        const instance = instances.find(i => i.id === id);
        if (!instance || instance.status !== 'EXCUSE_REQUESTED') return;
        if (!dbId) { alert('Task sync in progress. Please wait.'); return; }

        setApprovingExcuseIds(prev => new Set(prev).add(id));
        const revertedData: ChecklistInstance = {
            ...instance,
            status: 'PENDING' as const,
            excuseRejectedAt: new Date().toISOString(),
        };
        delete revertedData.requestedTransferTo;
        delete revertedData.requestedTransferDate;
        delete revertedData.requestedTransferDates;
        delete revertedData.excuseReason;
        delete revertedData.excuseRequestedAt;
        setInstances(prev => prev.map(i => i.id === id ? { ...i, ...revertedData } : i));

        try {
            await api.put(`/checklists/${dbId}`, { done: false, item: JSON.stringify(revertedData) }, { withCredentials: true });
            addNotification(
                'Transfer Request Rejected',
                `Your transfer request for "${instance.taskName || 'routine task'}" on ${instance.date} was rejected by admin. Please complete the task as scheduled.`,
                'CHECKLIST',
                String(instance.doerId || '')
            );
        } catch (err) {
            console.error('Reject transfer request failed', err);
            setInstances(prev => prev.map(i => i.id === id ? { ...i, status: 'EXCUSE_REQUESTED' } : i));
            alert('Failed to reject transfer request. Please try again.');
        } finally {
            setApprovingExcuseIds(prev => { const s = new Set(prev); s.delete(id); return s; });
        }
    };

    // ── Instance Transfer Handler ─────────────────────────────────────────────
    // Reassigns task instance to a target user and/or reschedules across single/multiple dates.
    // Completed tasks by the transferred user count toward their performance report & score.
    const handleTransferInstance = async (
        id: string,
        dbId: string,
        selectedDates: string[],
        targetDoerId: string,
        note: string
    ) => {
        if (!selectedDates || selectedDates.length === 0) {
            alert('Please select at least one date for transfer.');
            return;
        }
        if (!targetDoerId) {
            alert('Please select an employee to transfer the task to.');
            return;
        }

        const instance = instances.find(i => i.id === id);
        if (!instance) return;

        setIsTransferring(true);
        const originalDate = instance.date;
        const originalDoer = instance.doerId;
        const tpl = templates.find(t => String(t.id) === String(instance.templateId));
        const targetEmp = employees.find(e => String(e.id) === String(targetDoerId));
        const targetName = targetEmp ? targetEmp.name : targetDoerId;

        const sortedDates = [...selectedDates].sort();
        const newInstances: ChecklistInstance[] = [];

        // First date updates the existing instance
        const firstDate = sortedDates[0];
        const firstUpdated: ChecklistInstance = {
            ...instance,
            date: firstDate,
            doerId: targetDoerId,
            transferredFrom: originalDate,
            transferredTo: targetDoerId,
            transferNote: note.trim() || undefined,
            transferredBy: currentUser.name,
            transferredAt: new Date().toISOString(),
            status: 'PENDING' // Re-activates as pending for the target doer
        };
        newInstances.push(firstUpdated);

        // Additional dates create new task instances assigned to target user
        for (let idx = 1; idx < sortedDates.length; idx++) {
            const extraDate = sortedDates[idx];
            const extraInst: ChecklistInstance = {
                id: `CI-TR-${instance.templateId}-${Date.now()}-${idx}`,
                templateId: instance.templateId,
                date: extraDate,
                status: 'PENDING',
                doerId: targetDoerId,
                taskName: instance.taskName || tpl?.taskName || 'Routine Task',
                department: instance.department || tpl?.department || 'General',
                transferredFrom: originalDate,
                transferredTo: targetDoerId,
                transferNote: note.trim() || undefined,
                transferredBy: currentUser.name,
                transferredAt: new Date().toISOString(),
            };
            newInstances.push(extraInst);
        }

        // Optimistic update: replace old instance with firstUpdated and append remaining
        setInstances(prev => {
            const filtered = prev.filter(x => x.id !== id);
            return [...filtered, ...newInstances];
        });
        setTransferModal({
            open: false, itemId: '', dbId: '', currentDate: '', selectedDates: [], targetDoerId: '', customDateInput: '', note: ''
        });

        try {
            // Persist updated first instance to server
            if (dbId) {
                await api.put(`/checklists/${dbId}`, { done: false, item: JSON.stringify(firstUpdated) }, { withCredentials: true });
            }
            // Persist extra instances if multi-date transfer
            if (newInstances.length > 1) {
                const extraItems = newInstances.slice(1);
                try {
                    await safePost('/checklists/bulk', {
                        items: extraItems.map(inst => ({
                            refId: instance.templateId,
                            refType: 'TEMPLATE_INSTANCE',
                            item: JSON.stringify(inst)
                        }))
                    });
                } catch (err) {
                    console.warn('Bulk insert extra transferred instances failed', err);
                }
            }

            // Notify target employee
            addNotification(
                'Task Transferred to You',
                `"${instance.taskName || 'Routine task'}" (${sortedDates.join(', ')}) has been assigned to you by ${currentUser.name}${note.trim() ? ` — Note: ${note.trim()}` : ''}. Completing this will count toward your score.`,
                'CHECKLIST',
                String(targetDoerId)
            );
        } catch (err) {
            console.error('Transfer failed', err);
            alert('Failed to update server. Local view updated.');
        } finally {
            setIsTransferring(false);
        }
    };

    const handleDeleteTemplate = async (id: string) => {
        if (!confirm('Delete this routine? All pending tasks will be removed.')) return;
        try {
            await api.delete(`/checklist-templates/${encodeURIComponent(id)}`, { withCredentials: true });
            setTemplates(prev => prev.filter(t => t.id !== id));
            setInstances(prev => prev.filter(i => !(i.templateId === id && i.status === 'PENDING')));
        } catch (err) {
            console.error('Delete failed', err);
            alert('Failed to delete template.');
        }
    };

    const handleToggleActive = async (tpl: ChecklistTemplate) => {
        const newActive = tpl.active === false ? true : false;
        if (!newActive && !confirm('Stop this routine? All future pending tasks will be hidden, but past completed/stopped tasks will remain.')) return;
        if (newActive && !confirm('Reactivate this routine? The routine will resume generating tasks. You may need to refresh the page to see new tasks.')) return;

        try {
            const updated = { ...tpl, active: newActive };
            await api.put(`/checklist-templates/${encodeURIComponent(tpl.id)}`, updated, { withCredentials: true });
            setTemplates(prev => prev.map(t => t.id === tpl.id ? updated : t));

            if (!newActive) {
                setInstances(prev => prev.filter(i => !(String(i.templateId) === String(tpl.id) && i.status === 'PENDING')));
            } else {
                const newInsts = generateInstances(updated);
                setInstances(prev => [...prev, ...newInsts]);
                if (newInsts.length > 0) {
                    api.post('/checklists/bulk', { items: newInsts.map(i => ({ id: i.id, item: JSON.stringify(i), done: false })) }, { withCredentials: true }).catch(console.error);
                }
            }
        } catch (err) {
            console.error('Toggle active failed', err);
            alert('Failed to update routine status.');
        }
    };

    const handleOpenEditFreq = (tpl: ChecklistTemplate) => {
        setEditingTemplate(tpl);
        setEditConfig({
            frequency: tpl.config.frequency,
            particularDateType: tpl.config.particularDateType ?? 'EVERY-MONTH',
            startDate: tpl.startDate,
        });
        setEditDoerId(tpl.doerId);
        setTransferEffectiveDate(format(new Date(), 'yyyy-MM-dd'));
    };

    const handleSaveFrequency = async () => {
        if (!editingTemplate) return;
        if (!editConfig.startDate) { alert('Please select a start date.'); return; }
        setIsSavingFreq(true);
        try {
            const updatedConfig = {
                ...editingTemplate.config,
                frequency: editConfig.frequency,
                particularDateType: editConfig.frequency === 'PARTICULAR-DATE' ? editConfig.particularDateType : undefined,
            };
            const newDept = employees.find(e => String(e.id) === String(editDoerId))?.department || editingTemplate.department;
            // Patch the template on the server
            await api.put(
                `/checklist-templates/${encodeURIComponent(editingTemplate.id)}`,
                {
                    taskName: editingTemplate.taskName,
                    doerId: editDoerId,
                    buddyId: editingTemplate.buddyId,
                    department: newDept,
                    startDate: editConfig.startDate,
                    config: updatedConfig,
                    active: editingTemplate.active,
                    transferEffectiveDate: editDoerId !== editingTemplate.doerId ? transferEffectiveDate : undefined,
                },
                { withCredentials: true }
            );

            // Update local template list
            const updatedTpl: ChecklistTemplate = { 
                ...editingTemplate, 
                config: updatedConfig, 
                startDate: editConfig.startDate,
                doerId: editDoerId,
                department: newDept
            };
            setTemplates(prev => prev.map(t => t.id === updatedTpl.id ? updatedTpl : t));

            const freqOrStartChanged = editConfig.frequency !== editingTemplate.config.frequency || editConfig.startDate !== editingTemplate.startDate;

            if (freqOrStartChanged) {
                // Remove all PENDING instances for this template, regenerate with new frequency + date
                setInstances(prev => prev.filter(i => !(String(i.templateId) === String(updatedTpl.id) && i.status === 'PENDING')));
                const newInsts = generateInstances(updatedTpl);

                // Bulk-save new instances to DB (fire and forget)
                safePost('/checklists/bulk', {
                    items: newInsts.map(inst => ({
                        refId: updatedTpl.id,
                        refType: 'TEMPLATE_INSTANCE',
                        item: JSON.stringify({ ...inst, templateId: updatedTpl.id }),
                    }))
                }).then(() => setRefreshTrigger(prev => prev + 1))
                  .catch(e => console.warn('[Checklist] Regen bulk save failed:', e));
            } else if (editDoerId !== editingTemplate.doerId) {
                // Assignee transferred, update future pending instances locally
                setInstances(prev => prev.map(i => {
                    if (String(i.templateId) === String(updatedTpl.id) && i.status === 'PENDING' && i.date >= transferEffectiveDate) {
                        return { ...i, doerId: editDoerId, department: newDept };
                    }
                    return i;
                }));
                setRefreshTrigger(prev => prev + 1);
            }

            setEditingTemplate(null);
            addNotification('Routine Updated', `"${updatedTpl.taskName}" updated — ${editConfig.frequency} from ${editConfig.startDate}.`, 'CHECKLIST', String(updatedTpl.doerId));
        } catch (err) {
            console.error('Update routine failed', err);
            alert('Failed to update routine. Please try again.');
        } finally {
            setIsSavingFreq(false);
        }
    };

    // ── derived data ───────────────────────────────────────────────────────────
    const myAgenda = useMemo(() => instances.filter(i => {
        const tpl = templates.find(t => String(t.id) === String(i.templateId));
        const match = doesDoerMatch(i.doerId, currentUser) || doesDoerMatch(tpl?.doerId, currentUser) || (tpl?.buddyId && doesDoerMatch(tpl.buddyId, currentUser));
        if (!match) return false;

        // Agenda shows pending and excuse requested (pending admin review) tasks for the current user
        if (i.status !== 'PENDING' && i.status !== 'EXCUSE_REQUESTED') return false;

        if (agendaSearch) {
            const tName = (i.taskName || tpl?.taskName || '').toLowerCase();
            if (!tName.includes(agendaSearch.toLowerCase())) return false;
        }

        if (agendaDateFilter === 'ALL') {
            return true;
        } else if (agendaDateFilter === 'TODAY') {
            return i.date <= todayStr;
        } else {
            const nextWeek = format(addDays(new Date(), 7), 'yyyy-MM-dd');
            return i.date <= nextWeek;
        }
    }).sort((a, b) => a.date.localeCompare(b.date)), [instances, templates, currentUser, doesDoerMatch, agendaSearch, agendaDateFilter, todayStr]);

    const myCompleted = useMemo(() => instances.filter(i => {
        const tpl = templates.find(t => String(t.id) === String(i.templateId));
        const match = doesDoerMatch(i.doerId, currentUser) || doesDoerMatch(tpl?.doerId, currentUser) || (tpl?.buddyId && doesDoerMatch(tpl.buddyId, currentUser));
        if (!match) return false;

        if (i.status !== 'COMPLETED') return false;

        if (completedSearch) {
            const tName = (i.taskName || tpl?.taskName || '').toLowerCase();
            if (!tName.includes(completedSearch.toLowerCase())) return false;
        }
        return true;
    }).sort((a, b) => b.date.localeCompare(a.date)), [instances, templates, currentUser, doesDoerMatch, completedSearch]);

    const totalMyCompletedPages = Math.max(1, Math.ceil(myCompleted.length / itemsPerPage));
    const paginatedMyCompleted = useMemo(() => {
        const start = (myCompletedPage - 1) * itemsPerPage;
        return myCompleted.slice(start, start + itemsPerPage);
    }, [myCompleted, myCompletedPage, itemsPerPage]);

    const stats = useMemo(() => {
        const myInstances = instances.filter(i => {
            const t = templates.find(temp => String(temp.id) === String(i.templateId));
            const match = doesDoerMatch(i.doerId, currentUser) || doesDoerMatch(t?.doerId, currentUser) || (t?.buddyId && doesDoerMatch(t.buddyId, currentUser));
            return match;
        });
        const myToday = myInstances.filter(i => i.date === todayStr);
        const done = myToday.filter(i => i.status === 'COMPLETED').length;
        const pct = myToday.length > 0 ? Math.round((done / myToday.length) * 100) : 0;
        const overdueCount = myInstances.filter(i => (i.status === 'PENDING' || i.status === 'EXCUSE_REQUESTED') && i.date < todayStr).length;
        return { total: myToday.length, done, pct, overdueCount };
    }, [instances, templates, currentUser, todayStr, doesDoerMatch]);

    // Admin overview stats
    const adminStats = useMemo(() => {
        const todayAll = instances.filter(i => i.date === todayStr);
        const totalToday = todayAll.length;
        const doneToday = todayAll.filter(i => i.status === 'COMPLETED').length;
        const overdueCount = instances.filter(i => (i.status === 'PENDING' || i.status === 'EXCUSE_REQUESTED') && i.date < todayStr).length;
        return { totalToday, doneToday, overdueCount, pctToday: totalToday > 0 ? Math.round((doneToday / totalToday) * 100) : 0 };
    }, [instances, todayStr]);

    const monitorData = useMemo(() => {
        return instances.filter(i => {
            const t = templates.find(temp => String(temp.id) === String(i.templateId));
            // Resolve doerId from instance first, fall back to template
            const instanceDoerId = String(i.doerId ?? t?.doerId ?? '').trim();
            const instanceBuddyId = String(t?.buddyId ?? '').trim();

            const matchStatus = monitorStatus === 'ALL' || i.status === monitorStatus;
            const name = (i.taskName || t?.taskName || '').toLowerCase();
            const matchSearch = !monitorSearch || name.includes(monitorSearch.toLowerCase());

            if (!isAdmin) {
                // Non-admin: show only tasks where they are the doer or buddy
                const isMe = doesDoerMatch(instanceDoerId, currentUser) || doesDoerMatch(instanceBuddyId, currentUser);
                return isMe && matchStatus && matchSearch;
            }

            // Admin: apply lead filter
            const matchLead = monitorLeadId === 'ALL' ||
                String(monitorLeadId).trim() === instanceDoerId ||
                String(monitorLeadId).trim() === instanceBuddyId;
            return matchLead && matchStatus && matchSearch;
        }).sort((a, b) => a.date.localeCompare(b.date));
    }, [instances, templates, monitorLeadId, monitorStatus, monitorSearch, isAdmin, currentUser, doesDoerMatch]);

    // Split for admin: pending vs completed sections
    const monitorPending = useMemo(() => monitorData.filter(i => i.status === 'PENDING' || i.status === 'EXCUSE_REQUESTED'), [monitorData]);
    const monitorCompleted = useMemo(() => monitorData.filter(i => i.status === 'COMPLETED' || i.status === 'STOPPED' || i.status === 'MISSED'), [monitorData]);

    const totalPendingPages = Math.max(1, Math.ceil(monitorPending.length / itemsPerPage));
    const totalCompletedPages = Math.max(1, Math.ceil(monitorCompleted.length / itemsPerPage));

    const paginatedPending = useMemo(() => {
        const start = (pendingPage - 1) * itemsPerPage;
        return monitorPending.slice(start, start + itemsPerPage);
    }, [monitorPending, pendingPage]);

    const paginatedCompleted = useMemo(() => {
        const start = (completedPage - 1) * itemsPerPage;
        return monitorCompleted.slice(start, start + itemsPerPage);
    }, [monitorCompleted, completedPage]);
    const monitorStats = useMemo(() => {
        const total = monitorData.length;
        const done = monitorData.filter(i => i.status === 'COMPLETED').length;
        const pending = total - done;
        const pct = total > 0 ? Math.round((done / total) * 100) : 0;
        return { total, done, pending, pct };
    }, [monitorData]);

    const parseDateSafe = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };

    const frequencies: { id: FrequencyType; label: string }[] = [
        { id: 'ONE-TIME', label: 'One-time' }, { id: 'DAILY', label: 'Daily' }, { id: 'ALTERNATE', label: 'Alternate' },
        { id: 'WEEKLY', label: 'Weekly' }, { id: 'FORTNIGHTLY', label: 'Fortnightly' }, { id: 'ALTERNATE-WEEK', label: 'Alternative Week' }, { id: 'MONTHLY', label: 'Monthly' },
        { id: 'QUARTERLY', label: 'Quarterly' }, { id: 'HALF-YEARLY', label: 'Half-yearly' }, { id: 'YEARLY', label: 'Yearly' },
        { id: 'PARTICULAR-DATE', label: 'Particular Date' }, { id: 'EVENT-BASED', label: 'Event-based' },
    ];

    const renderTaskCard = (item: ChecklistInstance, idx: number, borderAccent: string) => {
        const tpl = templates.find(t => String(t.id) === String(item.templateId));
        const taskName = item.taskName || tpl?.taskName || 'Unnamed Routine';
        const freq = tpl?.config?.frequency || (item as any)?.frequency || 'ONE-TIME';
        const isOverdue = item.date < todayStr && item.status === 'PENDING';
        const isMarking = markingIds.has(item.id);
        const isDone = item.status === 'COMPLETED';
        const isStopped = item.status === 'STOPPED';
        const isMissed = item.status === 'MISSED';
        const isExcuseRequested = item.status === 'EXCUSE_REQUESTED';
        const isMissedExcused = item.status === 'MISSED_EXCUSED';
        const isActionable = !isDone && !isStopped && !isMissed && !isExcuseRequested && !isMissedExcused;

        const doerName = getEmployeeName(item.doerId);
        const buddyName = tpl?.buddyId ? getEmployeeName(tpl.buddyId) : '';
        const statusColor = isDone ? 'bg-emerald-500' : isOverdue ? 'bg-rose-500' : isStopped ? 'bg-slate-400' : isMissed ? 'bg-orange-500' : isExcuseRequested ? 'bg-blue-400' : isMissedExcused ? 'bg-teal-500' : 'bg-indigo-500';

        return (
            <div
                key={item.id}
                className={cx(
                    'bg-white rounded-3xl border border-slate-150 p-5 pl-6 transition-all shadow-sm hover:shadow-md relative overflow-hidden group flex flex-col gap-3.5',
                    isDone && 'opacity-70 bg-slate-50/20',
                    isExcuseRequested && 'bg-blue-50/30 border-blue-100',
                    isMissedExcused && 'bg-teal-50/30 border-teal-100'
                )}
            >
                {/* Left-side absolute status color bar */}
                <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${statusColor}`}></div>

                {/* Top badges row */}
                <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[10px] font-bold text-slate-400 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                        {tpl?.id || 'CK-' + item.id.toString().slice(-4).toUpperCase()}
                    </span>
                    <span className={cx(
                        'px-2 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-wider border',
                        isDone
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : isOverdue
                            ? 'bg-rose-50 text-rose-700 border-rose-200 animate-pulse'
                            : isStopped
                            ? 'bg-slate-50 text-slate-500 border-slate-200'
                            : isMissed
                            ? 'bg-orange-50 text-orange-700 border-orange-200'
                            : isExcuseRequested
                            ? 'bg-blue-50 text-blue-700 border-blue-200 animate-pulse'
                            : isMissedExcused
                            ? 'bg-teal-50 text-teal-700 border-teal-200'
                            : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                    )}>
                        {isDone ? 'Completed' : isOverdue ? 'Overdue' : isStopped ? 'Stopped' : isMissed ? 'Missed' : isExcuseRequested ? '⏳ Excuse Pending' : isMissedExcused ? '✓ Excused' : 'Pending'}
                    </span>
                    <FrequencyBadge freq={freq} />
                    {item.shiftedDueToHoliday && (
                        <span className="text-[9px] bg-amber-50 text-amber-600 border border-amber-200 px-2 py-0.5 rounded font-extrabold flex items-center gap-1">
                            <RefreshCw size={9} /> Shifted
                        </span>
                    )}
                    {item.transferredFrom && (
                        <span className="text-[9px] bg-violet-50 text-violet-600 border border-violet-200 px-2 py-0.5 rounded font-extrabold flex items-center gap-1">
                            <CalendarClock size={9} /> Transferred
                        </span>
                    )}
                </div>

                {/* Title & Description block */}
                <div>
                    <h3 className={cx("text-base font-extrabold leading-snug break-words", isDone ? "line-through text-slate-400 font-medium" : "text-slate-800")}>
                        {taskName}
                    </h3>
                    {tpl?.department && (
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mt-1">
                            {tpl.department} Dept
                        </span>
                    )}
                </div>

                {/* Excuse reason display */}
                {(isExcuseRequested || isMissedExcused) && item.excuseReason && (
                    <div className={cx(
                        'flex items-start gap-2 px-3 py-2 rounded-xl text-xs border',
                        isExcuseRequested ? 'bg-blue-50 border-blue-100 text-blue-800' : 'bg-teal-50 border-teal-100 text-teal-800'
                    )}>
                        <MessageSquare size={12} className="mt-0.5 shrink-0" />
                        <div>
                            <span className="font-extrabold block text-[10px] uppercase tracking-wider mb-0.5">
                                {isExcuseRequested ? 'Excuse Reason (Pending Admin Review)' : `Excuse Reason — Approved by ${item.excuseApprovedBy || 'Admin'}`}
                            </span>
                            <span className="font-medium leading-relaxed">{item.excuseReason}</span>
                        </div>
                    </div>
                )}

                {/* Transfer info strip */}
                {item.transferredFrom && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs border bg-violet-50 border-violet-100 text-violet-800">
                        <ArrowRightLeft size={12} className="shrink-0" />
                        <span className="font-medium">
                            <strong>Rescheduled:</strong> Originally due <span className="font-mono font-bold">{item.transferredFrom}</span> → moved to <span className="font-mono font-bold">{item.date}</span>
                            {item.transferNote && <span className="text-violet-600"> · {item.transferNote}</span>}
                            {item.transferredBy && <span className="text-violet-500"> (by {item.transferredBy})</span>}
                        </span>
                    </div>
                )}

                {/* Bottom row: assignees & calendar metadata & actions */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-3 border-t border-slate-100/80">
                    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
                        <div className="flex items-center gap-1.5">
                            <span className="text-slate-400 font-semibold">Lead:</span>
                            {doerName ? (
                                <div className="flex items-center gap-1 bg-slate-50 border border-slate-100 rounded-full py-0.5 pl-0.5 pr-2">
                                    <Avatar name={doerName} size={20} className="border-0 shadow-none" />
                                    <span className="font-bold text-slate-700 text-[11px]">{doerName}</span>
                                </div>
                            ) : (
                                <span className="text-slate-400 italic text-[11px]">Unassigned</span>
                            )}
                        </div>
                        {buddyName && (
                            <div className="flex items-center gap-1.5">
                                <span className="text-slate-400 font-semibold">Buddy:</span>
                                <div className="flex items-center gap-1 bg-slate-50 border border-slate-100 rounded-full py-0.5 pl-0.5 pr-2">
                                    <Avatar name={buddyName} size={20} className="border-0 shadow-none" />
                                    <span className="font-bold text-slate-700 text-[11px]">{buddyName}</span>
                                </div>
                            </div>
                        )}
                        <div className="flex items-center gap-1 text-slate-400 font-medium">
                            <Calendar size={13} />
                            <span>Due: <strong className="font-mono-jb text-[10px] font-bold text-slate-600">{item.date}</strong></span>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto flex-wrap">
                        {/* Admin-only: Transfer Date & Assignee button */}
                        {isActionable && isAdmin && (
                            <button
                                onClick={() => {
                                    const curDoer = item.doerId || tpl?.doerId || '';
                                    setTransferModal({
                                        open: true,
                                        itemId: item.id,
                                        dbId: item.dbId || '',
                                        currentDate: item.date,
                                        selectedDates: [item.date],
                                        targetDoerId: curDoer,
                                        customDateInput: '',
                                        note: ''
                                    });
                                }}
                                disabled={isMarking}
                                className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-violet-600 hover:bg-violet-50 border border-slate-200 hover:border-violet-200 transition-all active:scale-95 shadow-sm"
                                title="Transfer task to user / reschedule date(s)"
                            >
                                <CalendarClock size={15} />
                            </button>
                        )}

                        {/* Admin-only: Mark Missed & Stop buttons (only on truly pending tasks) */}
                        {isActionable && isAdmin && (
                            <button
                                onClick={() => !isMarking && handleMissTask(item.id, item.dbId)}
                                disabled={isMarking}
                                className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-amber-600 hover:bg-amber-50 border border-slate-200 hover:border-amber-200 transition-all active:scale-95 shadow-sm"
                                title="Mark as Missed (affects score)"
                            >
                                <AlertTriangle size={15} />
                            </button>
                        )}
                        {isActionable && isAdmin && (
                            <button
                                onClick={() => !isMarking && handleStopTask(item.id, item.dbId)}
                                disabled={isMarking}
                                className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-rose-500 hover:bg-rose-50 border border-slate-200 hover:border-rose-100 transition-all active:scale-95 shadow-sm"
                                title="Stop Routine"
                            >
                                <X size={15} />
                            </button>
                        )}

                        {/* Employee-only: Request Task Transfer button (only on pending tasks) */}
                        {isActionable && !isAdmin && (
                            <button
                                onClick={() => {
                                    const curDoer = item.doerId || tpl?.doerId || '';
                                    setExcuseModal({
                                        open: true,
                                        itemId: item.id,
                                        dbId: item.dbId || '',
                                        targetDoerId: curDoer,
                                        targetDate: item.date,
                                        selectedDates: [item.date],
                                        customDateInput: '',
                                        reason: ''
                                    });
                                }}
                                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-extrabold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition-all active:scale-95 shadow-sm"
                                title="Request task transfer / reschedule for admin approval"
                            >
                                <ArrowRightLeft size={13} />
                                Request Transfer
                            </button>
                        )}

                        {/* Excuse / Transfer pending notice for employee */}
                        {isExcuseRequested && !isAdmin && (
                            <span className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200 shadow-xs">
                                <Loader2 size={12} className="spin text-amber-600" />
                                Transfer Pending Admin Review
                            </span>
                        )}

                        {/* Excused notice */}
                        {isMissedExcused && (
                            <span className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-teal-50 text-teal-700 border border-teal-200">
                                <ShieldCheck size={12} />
                                Excused — No Score Impact
                            </span>
                        )}
                        
                        {/* Mark Done / Undo (for pending/completed tasks) */}
                        <button
                            onClick={() => {
                                if (isDone) {
                                    handleMarkIncomplete(item.id, item.dbId);
                                } else {
                                    handleMarkDone(item.id, item.dbId);
                                }
                            }}
                            disabled={isMarking || isStopped || isMissed || isExcuseRequested || isMissedExcused}
                            className={cx(
                                "flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95",
                                isDone
                                    ? "bg-slate-50 hover:bg-slate-100/80 text-slate-600 border border-slate-200"
                                    : (isStopped || isMissed || isExcuseRequested || isMissedExcused)
                                    ? "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed"
                                    : "bg-slate-900 hover:bg-indigo-600 text-white border border-slate-900"
                            )}
                        >
                            {isMarking ? (
                                <Loader2 size={12} className="spin text-slate-400" />
                            ) : isDone ? (
                                <><CheckCheck size={12} strokeWidth={3} /> Completed (Undo)</>
                            ) : (
                                <><CheckCheck size={12} strokeWidth={3} /> Mark Done</>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="checklist-root h-full overflow-y-auto bg-slate-50/50 font-sans text-slate-800">
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');
                .checklist-root { font-family: 'Plus Jakarta Sans', sans-serif; }
                .font-mono-jb { font-family: 'JetBrains Mono', monospace; }
                .ring-custom:focus { outline: 2px solid #6366f1; outline-offset: 2px; }
                @keyframes fadeUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:none; } }
                .fade-up { animation: fadeUp 0.35s cubic-bezier(0.16, 1, 0.3, 1) both; }
                @keyframes spin { to { transform: rotate(360deg); } }
                .spin { animation: spin 0.8s linear infinite; }
                .progress-ring { transition: stroke-dashoffset 0.8s cubic-bezier(0.4, 0, 0.2, 1); }
                .checklist-root::-webkit-scrollbar { width: 6px; height: 6px; }
                .checklist-root::-webkit-scrollbar-track { background: transparent; }
                .checklist-root::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 99px; }
                .checklist-root::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
            `}</style>

            {/* ── Task Transfer Request Modal (Employee Edition - Multi-Day Supported) ────────────────── */}
            {excuseModal.open && (() => {
                const instance = instances.find(i => i.id === excuseModal.itemId);
                const tpl = templates.find(t => String(t.id) === String(instance?.templateId));
                const taskTitle = instance?.taskName || tpl?.taskName || 'Routine Task';
                const department = instance?.department || tpl?.department || 'General';

                const curDateStr = instance?.date || format(new Date(), 'yyyy-MM-dd');
                const curDateObj = new Date(curDateStr.replace(/-/g, '/'));

                const quickDays = [
                    { label: 'Tomorrow (+1d)', days: 1 },
                    { label: '+2 Days', days: 2 },
                    { label: '+3 Days', days: 3 },
                    { label: '+1 Week', days: 7 },
                ];

                const quickReasons = [
                    '🏖️ On Leave',
                    '⚡ Workload Rebalance',
                    '🚗 Field / Site Visit',
                    '🔄 Shift Coverage',
                    '📋 Special Request'
                ];

                const toggleExcuseDate = (d: string) => {
                    setExcuseModal(m => {
                        const exists = m.selectedDates.includes(d);
                        if (exists) {
                            if (m.selectedDates.length <= 1) return m;
                            return { ...m, selectedDates: m.selectedDates.filter(x => x !== d) };
                        } else {
                            return { ...m, selectedDates: [...m.selectedDates, d].sort() };
                        }
                    });
                };

                const addExcuseCustomDate = () => {
                    if (!excuseModal.customDateInput) return;
                    toggleExcuseDate(excuseModal.customDateInput);
                    setExcuseModal(m => ({ ...m, customDateInput: '' }));
                };

                const handleReasonClick = (r: string) => {
                    const clean = r.replace(/^[\p{Emoji}\s]+/u, '').trim();
                    setExcuseModal(m => ({
                        ...m,
                        reason: m.reason ? `${m.reason} (${clean})` : clean
                    }));
                };

                return (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-md transition-all">
                        <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 w-full max-w-lg fade-up overflow-hidden max-h-[90vh] flex flex-col">
                            {/* Modal Header */}
                            <div className="bg-gradient-to-r from-indigo-900 via-indigo-950 to-slate-900 px-6 py-5 text-white relative overflow-hidden shrink-0">
                                <div className="absolute -right-8 -top-8 w-28 h-28 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />
                                <div className="flex items-start justify-between relative z-10">
                                    <div className="flex items-center gap-3">
                                        <div className="w-11 h-11 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-inner shrink-0">
                                            <ArrowRightLeft size={22} className="text-indigo-300" />
                                        </div>
                                        <div>
                                            <h3 className="text-base font-black tracking-tight text-white">Request Task Transfer</h3>
                                            <p className="text-xs text-indigo-200/90 font-medium mt-0.5">Submit task transfer or multi-date reschedule request for Admin review</p>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setExcuseModal({ open: false, itemId: '', dbId: '', targetDoerId: '', targetDate: '', selectedDates: [], customDateInput: '', reason: '' })}
                                        className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center transition-all border border-white/10"
                                    >
                                        <X size={16} />
                                    </button>
                                </div>

                                {/* Task Context Ribbon */}
                                <div className="mt-3.5 p-3 bg-white/10 backdrop-blur-md rounded-2xl border border-white/15 flex items-center justify-between gap-3 text-xs">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
                                        <span className="font-bold text-white truncate">{taskTitle}</span>
                                    </div>
                                    <span className="px-2 py-0.5 bg-indigo-500/40 text-indigo-100 rounded-lg text-[10px] font-mono font-bold shrink-0">
                                        Due {instance?.date}
                                    </span>
                                </div>
                            </div>

                            {/* Modal Body */}
                            <div className="p-6 space-y-4 overflow-y-auto custom-scrollbar flex-1">
                                {/* 1. Select Target Employee to Transfer To */}
                                <div>
                                    <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                                        Transfer To (Select Employee) <span className="text-slate-400 font-normal normal-case">(optional)</span>
                                    </label>
                                    <div className="relative">
                                        <Users className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                        <select
                                            value={excuseModal.targetDoerId}
                                            onChange={e => setExcuseModal(m => ({ ...m, targetDoerId: e.target.value }))}
                                            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-800 focus:outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-xs"
                                        >
                                            <option value="">Keep Assigned / Just Request Excuse/Reschedule</option>
                                            {employees.filter(emp => String(emp.id) !== String(instance?.doerId)).map(emp => (
                                                <option key={emp.id} value={emp.id}>
                                                    {emp.name} {emp.department ? `(${emp.department})` : ''} {emp.designation ? `• ${emp.designation}` : ''}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                {/* 2. Requested Target Dates (Multi-day support) */}
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                            <Calendar size={13} className="text-indigo-600" /> Requested Reschedule Date(s)
                                        </label>
                                        <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                                            {excuseModal.selectedDates.length} {excuseModal.selectedDates.length === 1 ? 'Date Selected' : 'Dates Selected (Multi-day)'}
                                        </span>
                                    </div>

                                    {/* Date Chips */}
                                    <div className="flex flex-wrap gap-2 p-3 bg-slate-50/80 border border-slate-200 rounded-2xl min-h-[54px] items-center">
                                        {excuseModal.selectedDates.length === 0 ? (
                                            <span className="text-xs text-slate-400 italic">No target dates selected. Defaults to current date.</span>
                                        ) : (
                                            excuseModal.selectedDates.map(d => {
                                                const dObj = new Date(d.replace(/-/g, '/'));
                                                const dayName = !isNaN(dObj.getTime()) ? format(dObj, 'EEE, MMM d') : d;
                                                return (
                                                    <span
                                                        key={d}
                                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl text-xs font-bold shadow-xs hover:shadow-md transition-all"
                                                    >
                                                        <Calendar size={12} className="text-indigo-200" />
                                                        <span>{dayName}</span>
                                                        <span className="font-mono text-[10px] text-indigo-200 font-normal">({d})</span>
                                                        {excuseModal.selectedDates.length > 1 && (
                                                            <button
                                                                type="button"
                                                                onClick={() => toggleExcuseDate(d)}
                                                                className="hover:text-rose-200 transition-colors ml-1 p-0.5 rounded-md hover:bg-white/20"
                                                                title="Remove date"
                                                            >
                                                                <X size={12} />
                                                            </button>
                                                        )}
                                                    </span>
                                                );
                                            })
                                        )}
                                    </div>

                                    {/* Quick Date Presets */}
                                    <div className="mt-3">
                                        <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-1.5">Quick Select / Toggle Dates</p>
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                            {quickDays.map(({ label, days }) => {
                                                const d = format(addDays(curDateObj, days), 'yyyy-MM-dd');
                                                const isSelected = excuseModal.selectedDates.includes(d);
                                                return (
                                                    <button
                                                        key={days}
                                                        type="button"
                                                        onClick={() => toggleExcuseDate(d)}
                                                        className={cx(
                                                            'py-2 px-2 rounded-xl text-xs font-extrabold transition-all active:scale-95 border flex items-center justify-center gap-1',
                                                            isSelected
                                                                ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-500/20'
                                                                : 'bg-white text-slate-600 border-slate-200 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-300'
                                                        )}
                                                    >
                                                        {label}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Custom Date Input */}
                                    <div className="mt-3 flex gap-2">
                                        <input
                                            type="date"
                                            value={excuseModal.customDateInput}
                                            onChange={e => setExcuseModal(m => ({ ...m, customDateInput: e.target.value }))}
                                            className="flex-1 px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                                        />
                                        <button
                                            type="button"
                                            onClick={addExcuseCustomDate}
                                            disabled={!excuseModal.customDateInput}
                                            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl text-xs font-extrabold transition-all active:scale-95 shadow-sm"
                                        >
                                            + Add Date
                                        </button>
                                    </div>
                                </div>

                                {/* 3. Reason for Transfer / Excuse */}
                                <div>
                                    <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                                        Reason for Transfer / Excuse <span className="text-rose-500">*</span>
                                    </label>
                                    
                                    {/* Quick chips */}
                                    <div className="flex flex-wrap gap-1.5 mb-2">
                                        {quickReasons.map(r => (
                                            <button
                                                key={r}
                                                type="button"
                                                onClick={() => handleReasonClick(r)}
                                                className="px-2.5 py-1 bg-slate-100 hover:bg-indigo-100 text-slate-600 hover:text-indigo-800 rounded-lg text-[11px] font-bold transition-all border border-slate-200/60"
                                            >
                                                {r}
                                            </button>
                                        ))}
                                    </div>

                                    <textarea
                                        autoFocus
                                        rows={3}
                                        placeholder="Explain why this task needs to be transferred or rescheduled..."
                                        value={excuseModal.reason}
                                        onChange={e => setExcuseModal(m => ({ ...m, reason: e.target.value }))}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm text-slate-800 focus:outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all resize-none placeholder-slate-400"
                                    />
                                    {excuseModal.reason.trim().length === 0 && (
                                        <p className="text-[10px] font-bold mt-1 text-rose-400">
                                            Please enter a reason before submitting.
                                        </p>
                                    )}
                                </div>

                                {/* Info Card */}
                                <div className="p-3 bg-indigo-50/70 border border-indigo-100 rounded-2xl flex items-start gap-2.5 text-[11px] text-indigo-900 leading-relaxed font-medium">
                                    <Info size={15} className="text-indigo-600 shrink-0 mt-0.5" />
                                    <span>
                                        Your request will be sent to the Admin. Once <strong>approved</strong> by Admin, task ownership and target date(s) will be updated automatically with zero score penalty.
                                    </span>
                                </div>
                            </div>

                            {/* Modal Footer */}
                            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center gap-3 shrink-0">
                                <button
                                    type="button"
                                    onClick={() => setExcuseModal({ open: false, itemId: '', dbId: '', targetDoerId: '', targetDate: '', selectedDates: [], customDateInput: '', reason: '' })}
                                    className="flex-1 py-2.5 px-4 bg-white hover:bg-slate-100 border border-slate-200 rounded-2xl text-xs font-bold text-slate-600 transition-all active:scale-95"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (!excuseModal.reason.trim()) {
                                            alert('Please enter a reason before submitting.');
                                            return;
                                        }
                                        handleRequestExcuse(
                                            excuseModal.itemId,
                                            excuseModal.dbId,
                                            excuseModal.targetDoerId,
                                            excuseModal.selectedDates,
                                            excuseModal.reason
                                        );
                                    }}
                                    disabled={isSubmittingExcuse || !excuseModal.reason.trim()}
                                    className={cx(
                                        'flex-1 py-2.5 px-4 rounded-2xl text-xs font-extrabold text-white transition-all active:scale-95 flex items-center justify-center gap-2 shadow-lg',
                                        (isSubmittingExcuse || !excuseModal.reason.trim())
                                            ? 'bg-slate-300 cursor-not-allowed shadow-none'
                                            : 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 shadow-indigo-500/25'
                                    )}
                                >
                                    {isSubmittingExcuse ? (
                                        <><Loader2 size={14} className="spin" /> Submitting Request...</>
                                    ) : (
                                        <><ArrowRightLeft size={14} /> Submit Transfer Request ({excuseModal.selectedDates.length})</>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* ── Transfer Date & User Modal (Enterprise Edition) ───────────────────────────────── */}
            {transferModal.open && (() => {
                const cur = transferModal.currentDate;
                const curDateObj = new Date(cur.replace(/-/g, '/'));
                const instance = instances.find(i => i.id === transferModal.itemId);
                const tpl = templates.find(t => String(t.id) === String(instance?.templateId));
                const taskTitle = instance?.taskName || tpl?.taskName || 'Routine Task';
                const department = instance?.department || tpl?.department || 'General';
                
                const currentDoerId = instance?.doerId || tpl?.doerId || '';
                const currentDoer = employees.find(e => String(e.id) === String(currentDoerId));
                const selectedTargetEmp = employees.find(e => String(e.id) === String(transferModal.targetDoerId));

                const quickDays = [
                    { label: 'Tomorrow (+1d)', days: 1 },
                    { label: '+2 Days', days: 2 },
                    { label: '+3 Days', days: 3 },
                    { label: '+1 Week', days: 7 },
                ];

                const quickReasons = [
                    '🏖️ On Leave',
                    '⚡ Workload Rebalance',
                    '🚗 Field / Site Visit',
                    '🔄 Urgent Shift Cover',
                    '📋 Special Request'
                ];

                const toggleDate = (d: string) => {
                    setTransferModal(m => {
                        const exists = m.selectedDates.includes(d);
                        if (exists) {
                            if (m.selectedDates.length <= 1) return m;
                            return { ...m, selectedDates: m.selectedDates.filter(x => x !== d) };
                        } else {
                            return { ...m, selectedDates: [...m.selectedDates, d].sort() };
                        }
                    });
                };

                const addCustomDate = () => {
                    if (!transferModal.customDateInput) return;
                    toggleDate(transferModal.customDateInput);
                    setTransferModal(m => ({ ...m, customDateInput: '' }));
                };

                const handleReasonClick = (reasonText: string) => {
                    const clean = reasonText.replace(/^[\p{Emoji}\s]+/u, '').trim();
                    setTransferModal(m => ({
                        ...m,
                        note: m.note ? `${m.note} (${clean})` : clean
                    }));
                };

                return (
                    <div 
                        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-md transition-all duration-200"
                        onClick={(e) => {
                            if (e.target === e.currentTarget && !isTransferring) {
                                setTransferModal({ open: false, itemId: '', dbId: '', currentDate: '', selectedDates: [], targetDoerId: '', customDateInput: '', note: '' });
                            }
                        }}
                    >
                        <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 w-full max-w-xl fade-up overflow-hidden max-h-[90vh] flex flex-col">
                            {/* Header */}
                            <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-purple-950 px-6 py-5 text-white shrink-0 relative overflow-hidden">
                                <div className="absolute -right-8 -top-8 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />
                                <div className="flex items-start justify-between relative z-10">
                                    <div className="flex items-center gap-3">
                                        <div className="w-11 h-11 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-inner shrink-0">
                                            <ArrowRightLeft size={22} className="text-indigo-300" />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h3 className="text-lg font-black tracking-tight text-white">Transfer Task & Date</h3>
                                                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-500/30 text-indigo-200 border border-indigo-400/30">
                                                    Enterprise
                                                </span>
                                            </div>
                                            <p className="text-xs text-indigo-200/90 font-medium mt-0.5">
                                                Reassign task ownership & dates for workflow continuity
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setTransferModal({ open: false, itemId: '', dbId: '', currentDate: '', selectedDates: [], targetDoerId: '', customDateInput: '', note: '' })}
                                        disabled={isTransferring}
                                        className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center transition-all active:scale-95 border border-white/10"
                                    >
                                        <X size={16} />
                                    </button>
                                </div>

                                {/* Task Context Pill */}
                                <div className="mt-4 p-3 bg-white/10 backdrop-blur-md rounded-2xl border border-white/15 flex items-center justify-between gap-3 text-xs">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                                        <span className="font-bold text-white truncate">{taskTitle}</span>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <span className="px-2 py-0.5 bg-white/15 rounded-lg text-[10px] font-extrabold uppercase tracking-wider text-slate-200">
                                            {department}
                                        </span>
                                        <span className="px-2 py-0.5 bg-indigo-500/40 text-indigo-100 rounded-lg text-[10px] font-mono font-bold">
                                            Due {cur}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Body Scrollable */}
                            <div className="p-6 space-y-5 overflow-y-auto custom-scrollbar flex-1">
                                {/* 1. Visual Transfer Flow */}
                                <div>
                                    <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2.5">
                                        Assignee Reassignment <span className="text-rose-500">*</span>
                                    </label>
                                    
                                    {/* Visual current -> target indicator */}
                                    <div className="grid grid-cols-[1fr,auto,1fr] gap-2 items-center mb-3 p-3 bg-slate-50 border border-slate-200/80 rounded-2xl">
                                        {/* Current Doer */}
                                        <div className="flex items-center gap-2 min-w-0">
                                            <div className="w-8 h-8 rounded-xl bg-slate-200 text-slate-700 font-extrabold text-xs flex items-center justify-center shrink-0">
                                                {currentDoer?.name ? currentDoer.name.substring(0, 2).toUpperCase() : 'CU'}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-[10px] font-extrabold uppercase text-slate-400">From (Current)</p>
                                                <p className="text-xs font-bold text-slate-800 truncate">{currentDoer?.name || 'Unassigned'}</p>
                                            </div>
                                        </div>

                                        <div className="w-7 h-7 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center shrink-0">
                                            <ArrowRight size={14} />
                                        </div>

                                        {/* Target Doer */}
                                        <div className="flex items-center gap-2 min-w-0">
                                            <div className={cx(
                                                'w-8 h-8 rounded-xl font-extrabold text-xs flex items-center justify-center shrink-0 transition-colors',
                                                selectedTargetEmp ? 'bg-violet-600 text-white' : 'bg-slate-200 text-slate-400'
                                            )}>
                                                {selectedTargetEmp?.name ? selectedTargetEmp.name.substring(0, 2).toUpperCase() : '?'}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-[10px] font-extrabold uppercase text-slate-400">To (Transferee)</p>
                                                <p className={cx('text-xs font-bold truncate', selectedTargetEmp ? 'text-violet-700 font-black' : 'text-slate-400 italic')}>
                                                    {selectedTargetEmp?.name || 'Select below'}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Select Dropdown with modern styling */}
                                    <div className="relative">
                                        <Users className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                        <select
                                            value={transferModal.targetDoerId}
                                            onChange={e => setTransferModal(m => ({ ...m, targetDoerId: e.target.value }))}
                                            className="w-full pl-10 pr-10 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-800 focus:outline-none focus:bg-white focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all shadow-xs"
                                        >
                                            <option value="" disabled>Select Target Employee...</option>
                                            {employees.map(emp => (
                                                <option key={emp.id} value={emp.id}>
                                                    {emp.name} {emp.department ? `(${emp.department})` : ''} {emp.designation ? `• ${emp.designation}` : ''}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                {/* 2. Date Selection & Rescheduling */}
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                            <Calendar size={13} className="text-violet-600" /> Target Date(s)
                                        </label>
                                        <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-violet-100 text-violet-700">
                                            {transferModal.selectedDates.length} {transferModal.selectedDates.length === 1 ? 'Date Selected' : 'Dates (Batch Mode)'}
                                        </span>
                                    </div>

                                    {/* Date Chips */}
                                    <div className="flex flex-wrap gap-2 p-3 bg-slate-50/80 border border-slate-200 rounded-2xl min-h-[54px] items-center">
                                        {transferModal.selectedDates.length === 0 ? (
                                            <span className="text-xs text-slate-400 italic">No dates selected yet.</span>
                                        ) : (
                                            transferModal.selectedDates.map(d => {
                                                const dObj = new Date(d.replace(/-/g, '/'));
                                                const dayName = !isNaN(dObj.getTime()) ? format(dObj, 'EEE, MMM d') : d;
                                                return (
                                                    <span
                                                        key={d}
                                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-xl text-xs font-bold shadow-xs hover:shadow-md transition-all"
                                                    >
                                                        <Calendar size={12} className="text-violet-200" />
                                                        <span>{dayName}</span>
                                                        <span className="font-mono text-[10px] text-violet-200 font-normal">({d})</span>
                                                        {transferModal.selectedDates.length > 1 && (
                                                            <button
                                                                type="button"
                                                                onClick={() => toggleDate(d)}
                                                                className="hover:text-rose-200 transition-colors ml-1 p-0.5 rounded-md hover:bg-white/20"
                                                                title="Remove date"
                                                            >
                                                                <X size={12} />
                                                            </button>
                                                        )}
                                                    </span>
                                                );
                                            })
                                        )}
                                    </div>

                                    {/* Quick Date Presets */}
                                    <div className="mt-3">
                                        <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-1.5">Quick Reschedule Presets</p>
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                            {quickDays.map(({ label, days }) => {
                                                const d = format(addDays(curDateObj, days), 'yyyy-MM-dd');
                                                const isSelected = transferModal.selectedDates.includes(d);
                                                return (
                                                    <button
                                                        key={days}
                                                        type="button"
                                                        onClick={() => toggleDate(d)}
                                                        className={cx(
                                                            'py-2 px-2 rounded-xl text-xs font-extrabold transition-all active:scale-95 border flex items-center justify-center gap-1',
                                                            isSelected
                                                                ? 'bg-violet-600 text-white border-violet-600 shadow-md shadow-violet-500/20'
                                                                : 'bg-white text-slate-600 border-slate-200 hover:bg-violet-50 hover:text-violet-700 hover:border-violet-300'
                                                        )}
                                                    >
                                                        {label}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Custom Date Input */}
                                    <div className="mt-3 flex gap-2">
                                        <input
                                            type="date"
                                            value={transferModal.customDateInput}
                                            onChange={e => setTransferModal(m => ({ ...m, customDateInput: e.target.value }))}
                                            className="flex-1 px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-400"
                                        />
                                        <button
                                            type="button"
                                            onClick={addCustomDate}
                                            disabled={!transferModal.customDateInput}
                                            className="px-4 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white rounded-xl text-xs font-extrabold transition-all active:scale-95 shadow-sm"
                                        >
                                            + Add Date
                                        </button>
                                    </div>
                                </div>

                                {/* 3. Reason Note & Quick Chips */}
                                <div>
                                    <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                                        Transfer Reason / Note <span className="text-slate-400 font-normal normal-case tracking-normal">(optional)</span>
                                    </label>
                                    
                                    {/* Quick Reasons Chips */}
                                    <div className="flex flex-wrap gap-1.5 mb-2">
                                        {quickReasons.map(r => (
                                            <button
                                                key={r}
                                                type="button"
                                                onClick={() => handleReasonClick(r)}
                                                className="px-2.5 py-1 bg-slate-100 hover:bg-violet-100 text-slate-600 hover:text-violet-800 rounded-lg text-[11px] font-bold transition-all border border-slate-200/60"
                                            >
                                                {r}
                                            </button>
                                        ))}
                                    </div>

                                    <input
                                        type="text"
                                        placeholder="Add details e.g. Covering site audit while employee is away..."
                                        value={transferModal.note}
                                        onChange={e => setTransferModal(m => ({ ...m, note: e.target.value }))}
                                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm text-slate-800 focus:outline-none focus:bg-white focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all placeholder-slate-400"
                                    />
                                </div>

                                {/* 4. Enterprise Impact Summary */}
                                <div className="p-3.5 bg-gradient-to-r from-violet-50 via-indigo-50/50 to-slate-50 border border-violet-100 rounded-2xl flex items-start gap-3">
                                    <ShieldCheck size={18} className="text-violet-600 shrink-0 mt-0.5" />
                                    <div className="text-[11px] text-slate-600 leading-relaxed font-medium">
                                        <strong className="text-slate-800 font-extrabold block mb-0.5">Audit & Performance Score Rule:</strong>
                                        Once transferred, completing this task will award performance points to <strong className="text-violet-700 font-bold">{selectedTargetEmp ? selectedTargetEmp.name : 'the transferee'}</strong>. Historic logs remain unaffected.
                                    </div>
                                </div>
                            </div>

                            {/* Footer */}
                            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-3 shrink-0">
                                <button
                                    type="button"
                                    onClick={() => setTransferModal({ open: false, itemId: '', dbId: '', currentDate: '', selectedDates: [], targetDoerId: '', customDateInput: '', note: '' })}
                                    className="py-2.5 px-4 bg-white hover:bg-slate-100 border border-slate-200 rounded-2xl text-xs font-bold text-slate-600 transition-all active:scale-95"
                                >
                                    Cancel
                                </button>

                                <button
                                    type="button"
                                    onClick={() => handleTransferInstance(
                                        transferModal.itemId,
                                        transferModal.dbId,
                                        transferModal.selectedDates,
                                        transferModal.targetDoerId,
                                        transferModal.note
                                    )}
                                    disabled={isTransferring || transferModal.selectedDates.length === 0 || !transferModal.targetDoerId}
                                    className={cx(
                                        'py-2.5 px-6 rounded-2xl text-xs font-extrabold text-white transition-all active:scale-95 flex items-center justify-center gap-2 shadow-lg',
                                        (isTransferring || transferModal.selectedDates.length === 0 || !transferModal.targetDoerId)
                                            ? 'bg-slate-300 cursor-not-allowed shadow-none'
                                            : 'bg-gradient-to-r from-violet-600 via-indigo-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 shadow-violet-500/25'
                                    )}
                                >
                                    {isTransferring ? (
                                        <><Loader2 size={14} className="spin" /> Processing Transfer...</>
                                    ) : (
                                        <><ArrowRightLeft size={14} /> Confirm Transfer ({transferModal.selectedDates.length})</>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}

            <div className="max-w-7xl mx-auto px-4 md:px-8 py-8 space-y-8">

                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 bg-white border border-slate-100 rounded-3xl p-6 shadow-sm shadow-slate-100/50 backdrop-blur fade-up">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-600/20 shrink-0">
                            <ListChecks size={24} className="text-white" />
                        </div>
                        <div>
                            <div className="flex flex-wrap items-center gap-2.5">
                                <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Compliance Checklist</h1>
                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-indigo-50 text-indigo-600 border border-indigo-100">
                                    Enterprise FMS
                                </span>
                            </div>
                            <p className="text-sm text-slate-400 mt-1 font-medium flex items-center gap-2">
                                <Calendar size={13} /> {format(new Date(), 'EEEE, MMMM d, yyyy')} &nbsp;·&nbsp; Automations Active
                            </p>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-3 w-full sm:w-auto shrink-0">
                        <button
                            onClick={() => setRefreshTrigger(prev => prev + 1)}
                            disabled={isLoading}
                            className={cx(
                                'group relative flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs transition-all duration-300 border shadow-sm w-full sm:w-auto justify-center',
                                isLoading
                                    ? 'bg-slate-50 text-slate-400 border-slate-200 cursor-wait'
                                    : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-50/50 active:scale-95'
                            )}
                            title="Sync Data"
                        >
                            <RefreshCw size={14} className={cx('transition-all duration-700 ease-in-out', isLoading ? 'animate-spin text-slate-400' : 'group-hover:rotate-180')} />
                            <span>{isLoading ? 'Syncing...' : 'Sync Data'}</span>
                        </button>

                        {isAdmin && (
                            <button
                                onClick={() => setShowCreateModal(true)}
                                className="flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 rounded-xl font-bold text-xs transition-all shadow-md hover:-translate-y-0.5 active:scale-95 w-full sm:w-auto text-center"
                            >
                                <Plus size={16} /> New Routine
                            </button>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 fade-up" style={{ animationDelay: '50ms' }}>
                    {isAdmin ? (
                        <>
                            {[
                                { label: "Today's Assignments", value: adminStats.totalToday, icon: <Calendar size={18} />, color: 'text-indigo-600 bg-indigo-50 border-indigo-100/50' },
                                { label: 'Completed Today', value: adminStats.doneToday, icon: <CheckCheck size={18} />, color: 'text-emerald-600 bg-emerald-50 border-emerald-100/50' },
                                { label: 'Overall Completion Rate', value: `${adminStats.pctToday}%`, icon: <TrendingUp size={18} />, color: 'text-blue-600 bg-blue-50 border-blue-100/50' },
                                { label: 'Overdue System Tasks', value: adminStats.overdueCount, icon: <AlertTriangle size={18} />, color: adminStats.overdueCount > 0 ? 'text-rose-600 bg-rose-50 border-rose-100/50' : 'text-slate-400 bg-slate-100 border-slate-200' },
                            ].map((k, i) => (
                                <div key={i} className="bg-white rounded-2xl border border-slate-100 px-5 py-4 flex items-center gap-4 shadow-sm shadow-slate-100/30">
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center border shrink-0 ${k.color}`}>{k.icon}</div>
                                    <div>
                                        <div className="text-2xl font-black text-slate-800 leading-none">{k.value}</div>
                                        <div className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider mt-1">{k.label}</div>
                                    </div>
                                </div>
                            ))}
                        </>
                    ) : (
                        <>
                            {[
                                { label: "My Tasks Today", value: stats.total, icon: <Calendar size={18} />, color: 'text-indigo-600 bg-indigo-50 border-indigo-100/50' },
                                { label: 'My Completions', value: stats.done, icon: <CheckCheck size={18} />, color: 'text-emerald-600 bg-emerald-50 border-emerald-100/50' },
                                { label: 'My Execution Score', value: `${stats.pct}%`, icon: <TrendingUp size={18} />, color: 'text-blue-600 bg-blue-50 border-blue-100/50' },
                                { label: 'My Overdue Tasks', value: stats.overdueCount, icon: <AlertTriangle size={18} />, color: stats.overdueCount > 0 ? 'text-rose-600 bg-rose-50 border-rose-100/50' : 'text-slate-400 bg-slate-100 border-slate-200' },
                            ].map((k, i) => (
                                <div key={i} className="bg-white rounded-2xl border border-slate-100 px-5 py-4 flex items-center gap-4 shadow-sm shadow-slate-100/30">
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center border shrink-0 ${k.color}`}>{k.icon}</div>
                                    <div>
                                        <div className="text-2xl font-black text-slate-800 leading-none">{k.value}</div>
                                        <div className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider mt-1">{k.label}</div>
                                    </div>
                                </div>
                            ))}
                        </>
                    )}
                </div>

                <div className="border-b border-slate-200/60 pb-px">
                    <div className="flex gap-6 overflow-x-auto flex-nowrap scrollbar-none">
                        {(isAdmin 
                            ? (['MONITOR', 'COMPLETED', 'MISSED', 'MASTER'] as const)
                            : (['AGENDA', 'COMPLETED', 'MONITOR', 'MISSED'] as const)
                        ).map(tab => {
                            const active = activeTab === tab;
                            return (
                                <button
                                    key={tab}
                                    onClick={() => setActiveTab(tab as any)}
                                    className={cx(
                                        'pb-3 text-sm font-bold border-b-2 transition-all whitespace-nowrap px-1 relative',
                                        active
                                            ? 'border-indigo-600 text-indigo-600'
                                            : 'border-transparent text-slate-400 hover:text-slate-600'
                                    )}
                                >
                                    <span className="flex items-center gap-2">
                                        {tab === 'AGENDA' && <ListChecks size={15} />}
                                        {tab === 'COMPLETED' && <CheckCheck size={15} />}
                                        {tab === 'MONITOR' && <Target size={15} />}
                                        {tab === 'MISSED' && <AlertTriangle size={15} />}
                                        {tab === 'MASTER' && <Zap size={15} />}
                                        
                                        {tab === 'AGENDA' ? 'My Agenda' : tab === 'COMPLETED' ? 'Completed Tasks' : tab === 'MONITOR' ? (isAdmin ? 'Team Status' : 'Status Monitor') : tab === 'MISSED' ? 'Missed Tasks' : 'Routine Master'}
                                        
                                        {tab === 'AGENDA' && myAgenda.length > 0 && (
                                            <span className="bg-indigo-50 text-indigo-600 border border-indigo-100 text-[9px] font-extrabold px-1.5 py-0.5 rounded-md">
                                                {myAgenda.length}
                                            </span>
                                        )}
                                        {tab === 'COMPLETED' && myCompleted.length > 0 && (
                                            <span className="bg-emerald-50 text-emerald-600 border border-emerald-100 text-[9px] font-extrabold px-1.5 py-0.5 rounded-md">
                                                {myCompleted.length}
                                            </span>
                                        )}
                                        {/* Excuse requests badge on MONITOR tab for admins */}
                                        {tab === 'MONITOR' && isAdmin && instances.filter(i => i.status === 'EXCUSE_REQUESTED').length > 0 && (
                                            <span className="bg-amber-50 text-amber-700 border border-amber-200 text-[9px] font-extrabold px-1.5 py-0.5 rounded-md animate-pulse">
                                                {instances.filter(i => i.status === 'EXCUSE_REQUESTED').length} excuse{instances.filter(i => i.status === 'EXCUSE_REQUESTED').length > 1 ? 's' : ''}
                                            </span>
                                        )}
                                        {tab === 'MISSED' && instances.filter(i => {
                                            const tpl = templates.find(t => String(t.id) === String(i.templateId));
                                            const isMe = doesDoerMatch(i.doerId ?? tpl?.doerId, currentUser) || doesDoerMatch(tpl?.buddyId, currentUser);
                                            return (i.status === 'MISSED' || i.status === 'MISSED_EXCUSED') && (isAdmin || isMe);
                                        }).length > 0 && (
                                            <span className="bg-rose-50 text-rose-600 border border-rose-100 text-[9px] font-extrabold px-1.5 py-0.5 rounded-md">
                                                {instances.filter(i => {
                                                    const tpl = templates.find(t => String(t.id) === String(i.templateId));
                                                    const isMe = doesDoerMatch(i.doerId ?? tpl?.doerId, currentUser) || doesDoerMatch(tpl?.buddyId, currentUser);
                                                    return (i.status === 'MISSED' || i.status === 'MISSED_EXCUSED') && (isAdmin || isMe);
                                                }).length}
                                            </span>
                                        )}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-32 space-y-4 bg-white border border-slate-100 rounded-3xl shadow-sm">
                        <Loader2 size={36} className="spin text-indigo-600" />
                        <p className="text-sm font-semibold text-slate-400">Loading FMS schedule records…</p>
                    </div>
                ) : (
                    <div className="space-y-6">

                        {activeTab === 'AGENDA' && (
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start fade-up">
                                
                                <div className="lg:col-span-2 space-y-6">
                                    
                                    <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm flex flex-col sm:flex-row gap-3">
                                        <div className="relative flex-1">
                                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                                            <input
                                                type="text"
                                                placeholder="Search my tasks..."
                                                className="w-full pl-10 pr-4 py-2 bg-slate-50 hover:bg-slate-100/50 border border-slate-200/80 rounded-xl text-xs font-semibold focus:outline-none focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all text-slate-700 placeholder-slate-400"
                                                value={agendaSearchInput}
                                                onChange={e => setAgendaSearchInput(e.target.value)}
                                            />
                                        </div>
                                        <div className="flex gap-2 shrink-0">
                                            <select
                                                className="pl-3 pr-8 py-2 bg-slate-50 hover:bg-slate-100/50 border border-slate-200/80 rounded-xl text-[11px] font-bold text-slate-600 outline-none focus:bg-white focus:border-indigo-500 transition-all"
                                                value={agendaDateFilter}
                                                onChange={e => setAgendaDateFilter(e.target.value as any)}
                                            >
                                                <option value="TODAY">Today's Tasks</option>
                                                <option value="UPCOMING_WEEK">Next 7 Days</option>
                                                <option value="ALL">All Schedules</option>
                                            </select>
                                        </div>
                                    </div>

                                    {(() => {
                                        const overdueItems = myAgenda.filter(i => (i.status === 'PENDING' || i.status === 'EXCUSE_REQUESTED') && i.date < todayStr);
                                        const todayItems = myAgenda.filter(i => i.date === todayStr && (i.status === 'PENDING' || i.status === 'EXCUSE_REQUESTED'));
                                        const upcomingItems = myAgenda.filter(i => i.date > todayStr && (i.status === 'PENDING' || i.status === 'EXCUSE_REQUESTED'));

                                        const hasAnyTasks = myAgenda.length > 0;

                                        if (!hasAnyTasks) {
                                            return (
                                                <div className="bg-white rounded-3xl border border-slate-100 p-20 text-center flex flex-col items-center gap-4 shadow-sm shadow-slate-100/20">
                                                    <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center">
                                                        <CheckCircle2 size={32} className="text-slate-300" />
                                                    </div>
                                                    <div>
                                                        <h3 className="font-extrabold text-slate-800 text-sm">All clear!</h3>
                                                        <p className="text-xs text-slate-400 mt-1">No checklist tasks fit the current filter criteria.</p>
                                                    </div>
                                                </div>
                                            );
                                        }

                                        return (
                                            <div className="space-y-6">
                                                {/* Overdue Section */}
                                                {overdueItems.length > 0 && (
                                                    <div className="space-y-3">
                                                        <h3 className="text-xs font-extrabold text-rose-500 tracking-wider uppercase flex items-center gap-2">
                                                            <AlertCircle size={14} /> Overdue Tasks
                                                            <span className="bg-rose-50 text-rose-600 border border-rose-100 text-[10px] font-black px-1.5 py-0.5 rounded-full">{overdueItems.length}</span>
                                                        </h3>
                                                        <div className="space-y-3">
                                                            {overdueItems.map((item, idx) => renderTaskCard(item, idx, ''))}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Today Section */}
                                                {todayItems.length > 0 && (
                                                    <div className="space-y-3">
                                                        <h3 className="text-xs font-extrabold text-indigo-600 tracking-wider uppercase flex items-center gap-2">
                                                            <Clock size={14} /> Scheduled Today
                                                            <span className="bg-indigo-50 text-indigo-600 border border-indigo-100 text-[10px] font-black px-1.5 py-0.5 rounded-full">{todayItems.length}</span>
                                                        </h3>
                                                        <div className="space-y-3">
                                                            {todayItems.map((item, idx) => renderTaskCard(item, idx, ''))}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Upcoming Section */}
                                                {upcomingItems.length > 0 && (
                                                    <div className="space-y-3">
                                                        <h3 className="text-xs font-extrabold text-slate-500 tracking-wider uppercase flex items-center gap-2">
                                                            <Calendar size={14} /> Upcoming Tasks
                                                            <span className="bg-slate-100 text-slate-600 border border-slate-200 text-[10px] font-black px-1.5 py-0.5 rounded-full">{upcomingItems.length}</span>
                                                        </h3>
                                                        <div className="space-y-3">
                                                            {upcomingItems.map((item, idx) => renderTaskCard(item, idx, ''))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })()}

                                </div>

                                <div className="space-y-6">
                                    
                                    <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm flex flex-col items-center text-center">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Today's Progress Score</p>
                                        
                                        <div className="relative inline-flex items-center justify-center mb-4">
                                            <svg className="w-28 h-28 -rotate-90">
                                                <circle cx="56" cy="56" r="46" strokeWidth="8" fill="none" className="text-slate-100" stroke="currentColor" />
                                                <circle cx="56" cy="56" r="46" strokeWidth="8" fill="none" strokeLinecap="round"
                                                    strokeDasharray={2 * Math.PI * 46}
                                                    strokeDashoffset={2 * Math.PI * 46 * (1 - stats.pct / 100)}
                                                    className={`progress-ring ${stats.pct === 100 ? 'text-emerald-500' : 'text-indigo-600'}`}
                                                    stroke="currentColor"
                                                />
                                            </svg>
                                            <span className="absolute text-2xl font-black text-slate-800">{stats.pct}%</span>
                                        </div>

                                        <h4 className="text-sm font-extrabold text-slate-800">{stats.done} of {stats.total} Tasks Secured</h4>
                                        {stats.pct === 100 && stats.total > 0 ? (
                                            <p className="text-xs text-emerald-600 font-extrabold mt-2 flex items-center gap-1 justify-center animate-bounce">
                                                🎉 All routines secured today!
                                            </p>
                                        ) : (
                                            <p className="text-xs text-slate-400 mt-1 font-medium">Keep moving to hit 100% compliance.</p>
                                        )}
                                    </div>

                                    <div className="bg-slate-900 rounded-3xl p-6 text-white space-y-4 shadow-xl shadow-slate-900/10">
                                        <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">FMS Automation Rules</h4>
                                        <div className="space-y-4">
                                            <div className="flex gap-3.5 items-start">
                                                <div className="w-7 h-7 rounded-lg bg-indigo-500/15 flex items-center justify-center shrink-0 text-indigo-400 mt-0.5">
                                                    <RefreshCw size={14} />
                                                </div>
                                                <div>
                                                    <p className="text-xs font-bold text-white">NWD Auto-Shifting</p>
                                                    <p className="text-[10px] text-slate-400 leading-normal mt-0.5">Schedules falling on public holidays or sundays automatically shift forward to the next business day.</p>
                                                </div>
                                            </div>
                                            <div className="flex gap-3.5 items-start">
                                                <div className="w-7 h-7 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0 text-amber-400 mt-0.5">
                                                    <Sun size={14} />
                                                </div>
                                                <div>
                                                    <p className="text-xs font-bold text-white">Sunday Exclusions</p>
                                                    <p className="text-[10px] text-slate-400 leading-normal mt-0.5">Daily routines skip Sundays automatically to allow for team recovery and off-hours lockouts.</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                </div>
                            </div>
                        )}

                        {activeTab === 'COMPLETED' && (
                            <div className="space-y-6 fade-up">
                                {/* Search and Filter Header */}
                                <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm flex flex-col sm:flex-row gap-3 items-center">
                                    <div className="relative flex-1 w-full">
                                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                                        <input
                                            type="text"
                                            placeholder="Search completed tasks..."
                                            className="w-full pl-10 pr-4 py-2 bg-slate-50 hover:bg-slate-100/50 border border-slate-200/80 rounded-xl text-xs font-semibold focus:outline-none focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all text-slate-700 placeholder-slate-400"
                                            value={completedSearchInput}
                                            onChange={e => setCompletedSearchInput(e.target.value)}
                                        />
                                    </div>
                                    <div className="text-xs font-extrabold text-slate-400 uppercase tracking-widest shrink-0">
                                        {myCompleted.length} Completed Task{myCompleted.length !== 1 && 's'}
                                    </div>
                                </div>

                                {/* Completed Tasks List */}
                                {paginatedMyCompleted.length === 0 ? (
                                    <div className="bg-white rounded-3xl border border-slate-100 p-20 text-center flex flex-col items-center gap-4 shadow-sm shadow-slate-100/20">
                                        <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center">
                                            <CheckCircle2 size={32} className="text-slate-300" />
                                        </div>
                                        <div>
                                            <h3 className="font-extrabold text-slate-800 text-sm">No completed tasks</h3>
                                            <p className="text-xs text-slate-400 mt-1">No completed tasks match your search criteria.</p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        {paginatedMyCompleted.map((item, idx) => renderTaskCard(item, idx, ''))}
                                    </div>
                                )}

                                {/* Pagination Controls */}
                                {totalMyCompletedPages > 1 && (
                                    <div className="flex items-center justify-between px-6 py-3 bg-white border border-slate-100 rounded-2xl shadow-sm">
                                        <span className="text-[11px] text-slate-400 font-bold">
                                            Showing {(myCompletedPage - 1) * itemsPerPage + 1}–{Math.min(myCompletedPage * itemsPerPage, myCompleted.length)} of {myCompleted.length} entries
                                        </span>
                                        <div className="flex items-center gap-2">
                                            <button onClick={() => setMyCompletedPage(p => Math.max(1, p - 1))} disabled={myCompletedPage === 1}
                                                className="p-1.5 bg-slate-50 border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-100 transition-all">
                                                <ChevronLeft size={14} />
                                            </button>
                                            <span className="text-xs font-bold text-slate-600 min-w-12 text-center">{myCompletedPage} / {totalMyCompletedPages}</span>
                                            <button onClick={() => setMyCompletedPage(p => Math.min(totalMyCompletedPages, p + 1))} disabled={myCompletedPage === totalMyCompletedPages}
                                                className="p-1.5 bg-slate-50 border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-100 transition-all">
                                                <ChevronRight size={14} />
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === 'MONITOR' && (
                            <div className="space-y-6 fade-up">
                                
                                {/* Status counters */}
                                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                    {[
                                        { label: 'Total Assigned', value: monitorStats.total, color: 'text-indigo-600 bg-indigo-50 border-indigo-100/50', icon: <Target size={18} /> },
                                        { label: 'Pending Items', value: monitorStats.pending, color: 'text-amber-600 bg-amber-50 border-amber-100/50', icon: <Clock size={18} /> },
                                        { label: 'Completed Items', value: monitorStats.done, color: 'text-emerald-600 bg-emerald-50 border-emerald-100/50', icon: <CheckCheck size={18} /> },
                                        { label: 'Team Compliance', value: `${monitorStats.pct}%`, color: 'text-blue-600 bg-blue-50 border-blue-100/50', icon: <TrendingUp size={18} /> },
                                    ].map((c, i) => (
                                        <div key={i} className="bg-white rounded-2xl border border-slate-100 px-4 py-3.5 flex items-center gap-3.5 shadow-sm shadow-slate-100/20">
                                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center border shrink-0 ${c.color}`}>{c.icon}</div>
                                            <div>
                                                <div className="text-xl font-black text-slate-800 leading-none">{c.value}</div>
                                                <div className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider mt-1">{c.label}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* Filters Bar */}
                                <div className="bg-white rounded-2xl border border-slate-100 p-4 flex flex-col md:flex-row gap-3 items-center shadow-sm">
                                    <div className="relative flex-1 w-full">
                                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                                        <input
                                            type="text"
                                            placeholder="Search tasks..."
                                            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200/80 rounded-xl text-xs font-semibold focus:outline-none focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all text-slate-700 placeholder-slate-400"
                                            value={monitorSearch}
                                            onChange={e => setMonitorSearch(e.target.value)}
                                        />
                                    </div>
                                    {isAdmin && (
                                        <div className="w-full md:w-auto shrink-0">
                                            <select
                                                className="w-full md:w-48 pl-3 pr-8 py-2 bg-slate-50 border border-slate-200/80 rounded-xl text-xs font-bold text-slate-600 outline-none focus:bg-white focus:border-indigo-500 transition-all"
                                                value={monitorLeadId}
                                                onChange={e => setMonitorLeadId(e.target.value)}
                                            >
                                                <option value="ALL">All Members</option>
                                                {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                                            </select>
                                        </div>
                                    )}
                                </div>

                                {/* ── Task Transfer & Excuse Requests Panel (admin only) ─────────────────────────── */}
                                {isAdmin && (() => {
                                    const excuseRequests = instances.filter(i => i.status === 'EXCUSE_REQUESTED');
                                    if (excuseRequests.length === 0) return null;
                                    return (
                                        <div className="space-y-4">
                                            <div className="flex items-center gap-2">
                                                <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 block animate-pulse" />
                                                <h3 className="text-xs font-black text-slate-500 tracking-wider uppercase">Task Transfer & Reschedule Requests Awaiting Review</h3>
                                                <span className="bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-extrabold px-2 py-0.5 rounded-full ml-1 animate-pulse">
                                                    {excuseRequests.length} Pending
                                                </span>
                                            </div>

                                            <div className="bg-white border border-indigo-100 rounded-3xl overflow-hidden shadow-sm">
                                                <div className="bg-gradient-to-r from-indigo-50 via-violet-50 to-slate-50 border-b border-indigo-100 px-5 py-3 flex items-center gap-2">
                                                    <ArrowRightLeft size={15} className="text-indigo-600 shrink-0" />
                                                    <span className="text-xs font-extrabold text-indigo-900">
                                                        These employees submitted task transfer or reschedule requests. Approving will reassign ownership & date seamlessly.
                                                    </span>
                                                </div>
                                                <div className="divide-y divide-slate-100">
                                                    {excuseRequests.map(item => {
                                                        const tpl = templates.find(t => String(t.id) === String(item.templateId));
                                                        const name = item.taskName || tpl?.taskName || 'Unnamed Task';
                                                        const doerId = item.doerId || tpl?.doerId;
                                                        const lead = employees.find(e => String(e.id) === String(doerId));
                                                        const requestedTargetEmp = employees.find(e => String(e.id) === String(item.requestedTransferTo));
                                                        const isActioning = approvingExcuseIds.has(item.id);
                                                        const freq = tpl?.config?.frequency || 'ONE-TIME';

                                                        return (
                                                            <div key={item.id} className="px-5 py-4 flex flex-col lg:flex-row lg:items-center gap-4 hover:bg-indigo-50/20 transition-colors">
                                                                {/* Task & Requester Info */}
                                                                <div className="flex items-start gap-3 flex-1 min-w-0">
                                                                    <Avatar name={lead?.name || String(doerId)} size={38} />
                                                                    <div className="min-w-0">
                                                                        <p className="font-black text-slate-800 text-sm truncate">{name}</p>
                                                                        <div className="flex flex-wrap items-center gap-2 mt-1">
                                                                            <span className="text-[11px] font-bold text-slate-600">Requester: {lead?.name || 'Unknown'}</span>
                                                                            <span className="text-[10px] text-slate-300">·</span>
                                                                            <span className="font-mono text-[10px] font-bold text-slate-500">Scheduled: {item.date}</span>
                                                                            <FrequencyBadge freq={freq} />
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                {/* Requested Reassignment Badge */}
                                                                <div className="p-2.5 bg-slate-50 border border-slate-200/80 rounded-2xl flex flex-col gap-1 min-w-[200px]">
                                                                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Requested Transfer</span>
                                                                    <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold text-indigo-700">
                                                                        <span>To: {requestedTargetEmp ? requestedTargetEmp.name : 'Same Employee'}</span>
                                                                        {(() => {
                                                                            const reqDates = (item.requestedTransferDates && item.requestedTransferDates.length > 0)
                                                                                ? item.requestedTransferDates
                                                                                : (item.requestedTransferDate ? [item.requestedTransferDate] : []);
                                                                            if (reqDates.length === 0 || (reqDates.length === 1 && reqDates[0] === item.date)) return null;
                                                                            return (
                                                                                <span className="font-mono text-[10px] bg-indigo-100 text-indigo-800 px-1.5 py-0.5 rounded font-bold">
                                                                                    ➔ {reqDates.length > 1 ? `${reqDates.length} Dates (${reqDates.join(', ')})` : reqDates[0]}
                                                                                </span>
                                                                            );
                                                                        })()}
                                                                    </div>
                                                                </div>

                                                                {/* Reason */}
                                                                {item.excuseReason && (
                                                                    <div className="flex items-start gap-2 bg-amber-50/80 border border-amber-100 rounded-2xl px-3 py-2 text-xs text-amber-900 max-w-sm">
                                                                        <MessageSquare size={12} className="mt-0.5 shrink-0 text-amber-600" />
                                                                        <span className="font-medium leading-relaxed line-clamp-2">{item.excuseReason}</span>
                                                                    </div>
                                                                )}

                                                                {/* Action buttons */}
                                                                <div className="flex items-center gap-2 shrink-0">
                                                                    <button
                                                                        onClick={() => handleApproveExcuse(item.id, item.dbId || '')}
                                                                        disabled={isActioning}
                                                                        className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold transition-all active:scale-95 shadow-sm disabled:opacity-60"
                                                                    >
                                                                        {isActioning ? <Loader2 size={12} className="spin" /> : <ThumbsUp size={12} />}
                                                                        Approve Transfer
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleRejectExcuse(item.id, item.dbId || '')}
                                                                        disabled={isActioning}
                                                                        className="flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-extrabold transition-all active:scale-95 shadow-sm disabled:opacity-60"
                                                                    >
                                                                        {isActioning ? <Loader2 size={12} className="spin" /> : <ThumbsDown size={12} />}
                                                                        Reject
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })()}

                                {/* Pending Executions Section */}
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2">
                                        <span className="w-2.5 h-2.5 rounded-full bg-amber-400 block" />
                                        <h3 className="text-xs font-extrabold text-slate-400 tracking-wider uppercase">Pending Executions</h3>
                                        <span className="bg-amber-50 text-amber-600 border border-amber-100 text-[10px] font-extrabold px-1.5 py-0.5 rounded-full ml-1">
                                            {monitorPending.length}
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        {paginatedPending.length === 0 ? (
                                            <div className="col-span-full bg-white rounded-3xl border border-slate-100 p-20 text-center text-slate-400 font-semibold shadow-sm">
                                                No pending tasks found for the selected filter.
                                            </div>
                                        ) : (
                                            paginatedPending.map((item, idx) => renderTaskCard(item, idx, ''))
                                        )}
                                    </div>

                                    {totalPendingPages > 1 && (
                                        <div className="flex items-center justify-between px-6 py-3 bg-white border border-slate-100 rounded-2xl shadow-sm">
                                            <span className="text-[11px] text-slate-400 font-bold">
                                                Showing {(pendingPage - 1) * itemsPerPage + 1}–{Math.min(pendingPage * itemsPerPage, monitorPending.length)} of {monitorPending.length} entries
                                            </span>
                                            <div className="flex items-center gap-2">
                                                <button onClick={() => setPendingPage(p => Math.max(1, p - 1))} disabled={pendingPage === 1}
                                                    className="p-1.5 bg-slate-50 border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-100 transition-all">
                                                    <ChevronLeft size={14} />
                                                </button>
                                                <span className="text-xs font-bold text-slate-600 min-w-12 text-center">{pendingPage} / {totalPendingPages}</span>
                                                <button onClick={() => setPendingPage(p => Math.min(totalPendingPages, p + 1))} disabled={pendingPage === totalPendingPages}
                                                    className="p-1.5 bg-slate-50 border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-100 transition-all">
                                                    <ChevronRight size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {activeTab === 'MISSED' && (
                            <div className="space-y-4 fade-up">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500 block animate-pulse" />
                                    <h3 className="text-xs font-extrabold text-slate-400 tracking-wider uppercase">Missed & Excused Task Log</h3>
                                </div>

                                <div className="bg-white rounded-3xl border border-slate-100 overflow-hidden shadow-sm">
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left text-xs min-w-[800px]">
                                            <thead className="bg-slate-50 border-b border-slate-100">
                                                <tr>
                                                    {['Target Date', 'Lead Assigned', 'Checklist Routine Task', 'Frequency Type', 'Status / Reason', isAdmin ? 'Action' : ''].filter(Boolean).map((h, i) => (
                                                        <th key={i} className={cx("px-5 py-3.5 font-extrabold text-slate-400 uppercase tracking-wider text-[10px]", h === 'Action' && "text-right")}>{h}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {(() => {
                                                    const missedTasks = instances.filter(i => {
                                                        const tpl = templates.find(t => String(t.id) === String(i.templateId));
                                                        const isMe = doesDoerMatch(i.doerId ?? tpl?.doerId, currentUser) || doesDoerMatch(tpl?.buddyId, currentUser);
                                                        return (i.status === 'MISSED' || i.status === 'MISSED_EXCUSED') && (isAdmin || isMe);
                                                    });

                                                    if (missedTasks.length === 0) {
                                                        return (
                                                            <tr>
                                                                <td colSpan={isAdmin ? 6 : 5} className="px-5 py-16 text-center text-slate-400 bg-white">
                                                                    <div className="flex flex-col items-center gap-2">
                                                                        <CheckCircle2 size={28} className="text-emerald-500" />
                                                                        <p className="font-bold text-sm text-slate-700">Perfect compliance history</p>
                                                                        <p className="text-slate-400 text-xs mt-0.5">No missed schedules flagged in the system.</p>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        );
                                                    }

                                                    return missedTasks.sort((a, b) => b.date.localeCompare(a.date)).map(item => {
                                                        const tpl = templates.find(t => String(t.id) === String(item.templateId));
                                                        const name = item.taskName || tpl?.taskName || 'Unnamed';
                                                        const freq = tpl?.config?.frequency || (item as any)?.frequency || 'ONE-TIME';
                                                        const doerId = item.doerId || tpl?.doerId;
                                                        const lead = employees.find(e => String(e.id) === String(doerId));
                                                        const isMarking = markingIds.has(item.id);
                                                        const isExcused = item.status === 'MISSED_EXCUSED';

                                                        return (
                                                            <tr key={item.id} className={cx("hover:bg-slate-50/40 transition-colors", isExcused && "bg-teal-50/20")}>
                                                                <td className={cx("px-5 py-3.5 font-bold font-mono-jb", isExcused ? "text-teal-600" : "text-rose-600")}>{item.date}</td>
                                                                <td className="px-5 py-3.5">
                                                                    <div className="flex items-center gap-2">
                                                                        <Avatar name={lead?.name || String(doerId)} size={24} />
                                                                        <span className="font-bold text-slate-700">{lead?.name || 'Unknown'}</span>
                                                                    </div>
                                                                </td>
                                                                <td className="px-5 py-3.5 font-semibold text-slate-700 max-w-sm truncate" title={name}>{name}</td>
                                                                <td className="px-5 py-3.5"><FrequencyBadge freq={freq} /></td>
                                                                <td className="px-5 py-3.5">
                                                                    {isExcused ? (
                                                                        <div className="space-y-1">
                                                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-teal-50 text-teal-700 border border-teal-200">
                                                                                <ShieldCheck size={10} /> Excused — No Score Impact
                                                                            </span>
                                                                            {item.excuseReason && (
                                                                                <p className="text-[10px] text-slate-500 font-medium max-w-xs line-clamp-2" title={item.excuseReason}>
                                                                                    <span className="font-bold text-slate-600">Reason: </span>{item.excuseReason}
                                                                                </p>
                                                                            )}
                                                                            {item.excuseApprovedBy && (
                                                                                <p className="text-[9px] text-teal-600 font-bold">Approved by: {item.excuseApprovedBy}</p>
                                                                            )}
                                                                        </div>
                                                                    ) : (
                                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-orange-50 text-orange-700 border border-orange-200">
                                                                            <AlertTriangle size={10} /> Missed — Affects Score
                                                                        </span>
                                                                    )}
                                                                </td>
                                                                {isAdmin && (
                                                                    <td className="px-5 py-3.5 text-right">
                                                                        {!isExcused && (
                                                                            <button
                                                                                onClick={() => !isMarking && handleMarkDone(item.id, (item as any).dbId)}
                                                                                disabled={isMarking}
                                                                                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-extrabold transition-all active:scale-95 shadow-sm shadow-emerald-600/10 uppercase tracking-wider"
                                                                            >
                                                                                {isMarking ? 'Securing…' : 'Force Complete'}
                                                                            </button>
                                                                        )}
                                                                    </td>
                                                                )}
                                                            </tr>
                                                        );
                                                    });
                                                })()}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        )}


                        {activeTab === 'MASTER' && isAdmin && (
                            <div className="space-y-4 fade-up">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-xs font-extrabold text-slate-400 tracking-wider uppercase">{templates.length} Compliance Rules Registered</h3>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {templates.length === 0 ? (
                                        <div className="col-span-full bg-white rounded-3xl border border-slate-100 p-16 text-center text-slate-400 font-semibold shadow-sm">
                                            No routine master rules registered.
                                        </div>
                                    ) : templates.map(t => {
                                        const lead = employees.find(e => String(e.id) === String(t.doerId));
                                        const buddy = t.buddyId ? employees.find(e => String(e.id) === String(t.buddyId)) : null;
                                        const freqLabel = t.config.frequency === 'PARTICULAR-DATE'
                                            ? `Fixed · ${t.config.particularDateType === 'EVERY-YEAR' ? 'Yearly' : 'Monthly'}`
                                            : t.config.frequency;

                                        return (
                                            <div key={t.id} className={cx(
                                                "bg-white rounded-3xl border p-5 flex flex-col justify-between gap-5 relative overflow-hidden transition-all hover:shadow-md",
                                                t.active === false ? "border-slate-200 bg-slate-50/40 opacity-80" : "border-slate-100 shadow-sm"
                                            )}>
                                                <div className="space-y-3">
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="space-y-1">
                                                            <div className="flex items-center gap-2">
                                                                <h4 className={cx("font-extrabold text-sm", t.active === false ? "text-slate-400 line-through" : "text-slate-800")}>
                                                                    {t.taskName}
                                                                </h4>
                                                            </div>
                                                            <span className="font-mono-jb text-[9px] font-bold text-slate-400 block">{t.id}</span>
                                                        </div>
                                                        
                                                        <button
                                                            onClick={() => handleToggleActive(t)}
                                                            className={cx(
                                                                "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2",
                                                                t.active !== false ? "bg-indigo-600" : "bg-slate-200"
                                                            )}
                                                            title={t.active !== false ? "Stop Routine" : "Reactivate Routine"}
                                                        >
                                                            <span
                                                                className={cx(
                                                                    "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                                                                    t.active !== false ? "translate-x-5" : "translate-x-0"
                                                                )}
                                                            />
                                                        </button>
                                                    </div>

                                                    <div className="flex flex-wrap items-center gap-1.5">
                                                        <FrequencyBadge freq={freqLabel} />
                                                        <span className="text-[10px] font-bold bg-slate-50 text-slate-500 border border-slate-200 px-2 py-0.5 rounded-md font-mono-jb">
                                                            Start: {t.startDate}
                                                        </span>
                                                        {t.department && (
                                                            <span className="text-[10px] font-bold bg-slate-50 text-slate-500 border border-slate-200 px-2 py-0.5 rounded-md">
                                                                {t.department}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="flex items-center justify-between border-t border-slate-100/80 pt-3">
                                                    <div className="flex items-center gap-2">
                                                        <div className="flex items-center -space-x-2">
                                                            {lead && <Avatar name={lead.name} size={26} className="ring-2 ring-white" />}
                                                            {buddy && <Avatar name={buddy.name} size={26} className="ring-2 ring-white opacity-90" />}
                                                        </div>
                                                        <div className="text-[10px] text-slate-400 font-semibold leading-tight">
                                                            <p className="text-slate-600 font-bold">{lead?.name || 'Unknown'}</p>
                                                            {buddy && <p className="text-[9px]">Buddy: {buddy.name}</p>}
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-1.5">
                                                        <button
                                                            onClick={() => handleOpenEditFreq(t)}
                                                            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 border border-transparent hover:border-indigo-100 transition-all active:scale-95 shrink-0"
                                                            title="Edit Recurrence Rules / Reassign"
                                                        >
                                                            <Pencil size={13} />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteTemplate(t.id)}
                                                            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-500 hover:bg-rose-50 border border-transparent hover:border-rose-100 transition-all active:scale-95 shrink-0"
                                                            title="Permanently Delete Automation"
                                                        >
                                                            <Trash2 size={13} />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {editingTemplate && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-end md:items-center justify-center p-0 md:p-4">
                    <div className="bg-white w-full md:max-w-lg rounded-t-3xl md:rounded-3xl shadow-2xl flex flex-col max-h-[85vh] border border-slate-100">
                        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 shrink-0">
                            <div>
                                <h2 className="font-extrabold text-slate-800 text-lg flex items-center gap-2">
                                    <Pencil size={18} className="text-indigo-600" /> Edit Automation Rule
                                </h2>
                                <p className="text-xs text-slate-400 font-semibold mt-1 truncate max-w-xs">{editingTemplate.taskName}</p>
                            </div>
                            <button onClick={() => setEditingTemplate(null)} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-50 text-slate-400 transition-all">
                                <X size={18} />
                            </button>
                        </div>

                        <div className="p-6 space-y-5 overflow-y-auto">
                            <div className="flex items-center gap-3 bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3 text-xs font-semibold">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Active Rule</span>
                                <FrequencyBadge freq={editingTemplate.config.frequency} />
                                <span className="ml-auto text-slate-500 font-mono-jb">{editingTemplate.startDate}</span>
                            </div>

                            <div className="space-y-1.5">
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                    <span className="flex items-center gap-1.5"><Users size={11} /> Transfer / Reassign Assignee</span>
                                </label>
                                <select
                                    className="w-full border border-slate-200 bg-slate-50/50 px-4 py-3 rounded-xl text-sm font-bold text-slate-800 focus:outline-none focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all"
                                    value={editDoerId}
                                    onChange={e => setEditDoerId(e.target.value)}
                                >
                                    {employees.map(emp => (
                                        <option key={emp.id} value={emp.id}>{emp.name} ({emp.designation || emp.department})</option>
                                    ))}
                                </select>
                            </div>

                            {editDoerId !== editingTemplate.doerId && (
                                <div className="bg-gradient-to-r from-violet-50 via-indigo-50 to-purple-50 border border-indigo-200/80 rounded-2xl p-4 space-y-3 shadow-xs">
                                    <div className="flex items-center justify-between">
                                        <label className="block text-[11px] font-black text-indigo-700 uppercase tracking-wider flex items-center gap-1.5">
                                            <CalendarClock size={14} className="text-indigo-600" /> Transfer Effective Date *
                                        </label>
                                        <span className="text-[10px] bg-indigo-600 text-white font-extrabold px-2.5 py-0.5 rounded-full shadow-xs">
                                            Reassignment Mode
                                        </span>
                                    </div>

                                    <div className="relative">
                                        <input
                                            type="date"
                                            className="w-full border border-indigo-200 bg-white px-4 py-2.5 rounded-xl text-sm font-bold text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all shadow-xs"
                                            value={transferEffectiveDate}
                                            onChange={e => setTransferEffectiveDate(e.target.value)}
                                        />
                                    </div>

                                    <div className="flex items-start gap-2 text-[11px] text-indigo-800/90 font-medium leading-relaxed bg-white/80 p-2.5 rounded-xl border border-indigo-100/80">
                                        <Info size={14} className="text-indigo-600 shrink-0 mt-0.5" />
                                        <span>All pending routine instances from <strong className="font-mono text-indigo-900">{transferEffectiveDate || 'selected date'}</strong> onwards will be transferred to the new assignee. Past completed logs remain unchanged.</span>
                                    </div>
                                </div>
                            )}

                            <div className="space-y-1.5">
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                    <span className="flex items-center gap-1.5"><Calendar size={11} /> Start Date / Recurrence Anchor *</span>
                                </label>
                                <input
                                    type="date"
                                    className="w-full border border-slate-200 bg-slate-50/50 px-4 py-3 rounded-xl text-sm font-bold text-slate-800 focus:outline-none focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all"
                                    value={editConfig.startDate}
                                    onChange={e => setEditConfig(prev => ({ ...prev, startDate: e.target.value }))}
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">New Recurrence Rule</label>
                                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                                    {frequencies.map(f => (
                                        <button
                                            key={f.id}
                                            type="button"
                                            onClick={() => setEditConfig(prev => ({ ...prev, frequency: f.id }))}
                                            className={cx(
                                                'py-2 px-1 rounded-xl text-[10px] font-bold tracking-wide uppercase transition-all border text-center',
                                                editConfig.frequency === f.id
                                                    ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                                                    : 'bg-white text-slate-500 border-slate-200 hover:border-slate-350 hover:text-slate-800'
                                            )}
                                        >
                                            {f.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {editConfig.frequency === 'PARTICULAR-DATE' && (
                                <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 space-y-3">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><Target size={12} /> Cycle Range</p>
                                    <div className="flex gap-2">
                                        {[
                                            { type: 'EVERY-MONTH' as const, label: `Monthly on ${editConfig.startDate ? format(parseDateSafe(editConfig.startDate), 'do') : 'day'}` },
                                            { type: 'EVERY-YEAR' as const, label: `Yearly on ${editConfig.startDate ? format(parseDateSafe(editConfig.startDate), 'MMM do') : 'date'}` },
                                        ].map(opt => (
                                            <button
                                                key={opt.type}
                                                type="button"
                                                onClick={() => setEditConfig(prev => ({ ...prev, particularDateType: opt.type }))}
                                                className={cx(
                                                    'flex-1 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wide transition-all border',
                                                    editConfig.particularDateType === opt.type
                                                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                                                        : 'bg-white text-slate-500 border-slate-200'
                                                )}
                                            >
                                                {opt.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="flex gap-3 bg-amber-50 border border-amber-200/60 rounded-2xl p-4">
                                <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
                                <p className="text-[11px] text-amber-700 leading-normal font-semibold">
                                    Modifying the rule triggers compliance schedule regeneration. Future pending tasks will be deleted and recreated. Completed logs are locked.
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50 shrink-0">
                            <button
                                onClick={() => setEditingTemplate(null)}
                                className="px-5 py-2.5 text-xs font-bold text-slate-500 hover:bg-slate-200/40 rounded-xl transition-all uppercase tracking-widest"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveFrequency}
                                disabled={isSavingFreq || (!editConfig.startDate || (editConfig.frequency === editingTemplate.config.frequency && editConfig.startDate === editingTemplate.startDate && editDoerId === editingTemplate.doerId))}
                                className="flex items-center gap-2 px-6 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 uppercase tracking-widest"
                            >
                                {isSavingFreq ? <Loader2 size={12} className="spin" /> : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showCreateModal && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-end md:items-center justify-center p-0 md:p-4">
                    <div className="bg-white w-full md:max-w-xl rounded-t-3xl md:rounded-3xl shadow-2xl flex flex-col max-h-[92vh] border border-slate-100">
                        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 shrink-0">
                            <div>
                                <h2 className="font-extrabold text-slate-800 text-lg">Create Checklist Automation</h2>
                                <p className="text-xs text-slate-400 font-semibold mt-1">Generates active routine compliance schedules for the next 5 years.</p>
                            </div>
                            <button onClick={() => setShowCreateModal(false)} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-50 text-slate-400 transition-all">
                                <X size={18} />
                            </button>
                        </div>

                        <div className="p-6 space-y-5 overflow-y-auto">
                            <div className="space-y-1.5">
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Task Description *</label>
                                <input
                                    type="text"
                                    className="w-full border border-slate-200 bg-slate-50/50 px-4 py-3 rounded-xl text-sm font-bold text-slate-800 placeholder-slate-300 focus:outline-none focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all"
                                    placeholder="e.g. Weekly Generator Fuel Level Check"
                                    value={newTemplate.taskName || ''}
                                    onChange={e => setNewTemplate({ ...newTemplate, taskName: e.target.value })}
                                />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <div className="space-y-1.5">
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Lead *</label>
                                    <select
                                        className="w-full border border-slate-200 bg-slate-50/50 px-3 py-3 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:bg-white focus:border-indigo-500 transition-all"
                                        value={newTemplate.doerId || ''}
                                        onChange={e => setNewTemplate({ ...newTemplate, doerId: e.target.value })}
                                    >
                                        <option value="">— Select Lead —</option>
                                        {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Buddy (Optional)</label>
                                    <select
                                        className="w-full border border-slate-200 bg-slate-50/50 px-3 py-3 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:bg-white focus:border-indigo-500 transition-all"
                                        value={newTemplate.buddyId || ''}
                                        onChange={e => setNewTemplate({ ...newTemplate, buddyId: e.target.value })}
                                    >
                                        <option value="">— Select Buddy —</option>
                                        {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Anchor Date *</label>
                                    <input
                                        type="date"
                                        className="w-full border border-slate-200 bg-slate-50/50 px-3 py-3 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:bg-white focus:border-indigo-500 transition-all"
                                        value={newTemplate.startDate || ''}
                                        onChange={e => setNewTemplate({ ...newTemplate, startDate: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Recurrence Interval</label>
                                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                                    {frequencies.map(f => (
                                        <button
                                            key={f.id}
                                            type="button"
                                            onClick={() => setNewTemplate({ ...newTemplate, config: { ...newTemplate.config!, frequency: f.id } })}
                                            className={cx(
                                                'py-2 px-1 rounded-xl text-[10px] font-bold tracking-wide uppercase transition-all border text-center',
                                                newTemplate.config?.frequency === f.id
                                                    ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                                                    : 'bg-white text-slate-500 border-slate-200 hover:border-slate-350 hover:text-slate-800'
                                            )}
                                        >
                                            {f.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {newTemplate.config?.frequency === 'PARTICULAR-DATE' && (
                                <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 space-y-3">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><Target size={12} /> Cycle Offset</p>
                                    <div className="flex gap-2">
                                        {[
                                            { type: 'EVERY-MONTH' as const, label: `Monthly on ${newTemplate.startDate ? format(parseDateSafe(newTemplate.startDate), 'do') : 'day'}` },
                                            { type: 'EVERY-YEAR' as const, label: `Yearly on ${newTemplate.startDate ? format(parseDateSafe(newTemplate.startDate), 'MMM do') : 'date'}` },
                                        ].map(opt => (
                                            <button
                                                key={opt.type}
                                                type="button"
                                                onClick={() => setNewTemplate({ ...newTemplate, config: { ...newTemplate.config!, particularDateType: opt.type } })}
                                                className={cx(
                                                    'flex-1 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wide transition-all border',
                                                    newTemplate.config?.particularDateType === opt.type
                                                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                                                        : 'bg-white text-slate-500 border-slate-200'
                                                )}
                                            >
                                                {opt.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="flex gap-3 bg-slate-900 border border-slate-800 rounded-2xl p-4 text-white">
                                <ShieldCheck size={16} className="text-indigo-400 shrink-0 mt-0.5" />
                                <p className="text-[11px] text-slate-400 leading-normal font-medium">
                                    Our automation framework auto-populates 5 years forward compliance tables. Sunday Lockouts and Holiday offsets are pre-configured automatically.
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50 shrink-0">
                            <button
                                onClick={() => setShowCreateModal(false)}
                                className="px-5 py-2.5 text-xs font-bold text-slate-500 hover:bg-slate-200/40 rounded-xl transition-all uppercase tracking-widest"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleCreateTemplate}
                                disabled={isProcessing}
                                className="flex items-center gap-2 px-6 py-2.5 bg-[#1a1a2e] hover:bg-[#6366f1] text-white rounded-xl text-xs font-bold transition-all shadow-lg active:scale-95 disabled:opacity-50 uppercase tracking-widest"
                            >
                                {isProcessing ? <><Loader2 size={14} className="spin" /> Processing…</> : <><ShieldCheck size={14} /> Create 5Y Plan</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export const ChecklistSystem = React.memo(ChecklistSystemComponent);
