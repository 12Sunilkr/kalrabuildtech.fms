import React, { useState, useMemo, useCallback, useEffect } from 'react';
import api, { safeGet, safePost, extractPayload, ensureArray } from '../src/utils/api';
import { ChecklistTemplate, ChecklistInstance, Employee, User, FrequencyType, Notification, Holiday, ChecklistConfig } from '../types';
import {
    ListChecks, Plus, Calendar, CheckCircle2, Clock, Trash2, X, RefreshCw,
    AlertCircle, Loader2, Info, ShieldCheck, Sun, ArrowRight, Target,
    Filter, Search, ChevronLeft, ChevronRight, CheckCheck, Circle,
    BarChart3, TrendingUp, Users, AlertTriangle, Zap, Pencil, Save
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
        : <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
            <Circle size={10} /> Pending
        </span>
);

// ─── main component ───────────────────────────────────────────────────────────

export const ChecklistSystem: React.FC<ChecklistSystemProps> = ({
    templates, setTemplates, instances, setInstances, currentUser, employees, holidays, addNotification
}) => {
    const [activeTab, setActiveTab] = useState<'AGENDA' | 'MONITOR' | 'MISSED' | 'MASTER'>('AGENDA');
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [markingIds, setMarkingIds] = useState<Set<string>>(new Set());
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    // Edit Frequency state
    const [editingTemplate, setEditingTemplate] = useState<ChecklistTemplate | null>(null);
    const [editConfig, setEditConfig] = useState<{ frequency: FrequencyType; particularDateType?: 'EVERY-MONTH' | 'EVERY-YEAR'; startDate: string }>({ frequency: 'DAILY', startDate: '' });
    const [isSavingFreq, setIsSavingFreq] = useState(false);

    // Monitor filters
    const [monitorLeadId, setMonitorLeadId] = useState<string>(
        currentUser.role === 'ADMIN' ? 'ALL' : (currentUser.employeeId || String(currentUser.id) || 'ALL')
    );
    const [monitorStatus, setMonitorStatus] = useState<'ALL' | 'PENDING' | 'COMPLETED' | 'STOPPED' | 'MISSED'>('ALL');
    const [monitorSearch, setMonitorSearch] = useState('');
    const [agendaSearch, setAgendaSearch] = useState('');
    const [agendaDateFilter, setAgendaDateFilter] = useState<'TODAY' | 'UPCOMING_WEEK' | 'ALL'>('TODAY');
    const [agendaStatusFilter, setAgendaStatusFilter] = useState<'ALL' | 'PENDING' | 'COMPLETED'>('PENDING');
    const [currentPage, setCurrentPage] = useState(1);
    const [pendingPage, setPendingPage] = useState(1);
    const [completedPage, setCompletedPage] = useState(1);
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
                // Track templates whose instances need to be saved to DB
                const templatesNeedingBulkSave: { tpl: any; generated: any[] }[] = [];

                for (const tpl of mapped) {
                    try {
                        const ir = await safeGet(`/checklists/${encodeURIComponent(tpl.id)}`);
                        const rows = ensureArray(extractPayload(ir));

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
                                        // Always trust template doerId as ground truth
                                        doerId: tpl.doerId,
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
                        } else {
                            // NO instances found in DB — this template was created without
                            // instances being saved (e.g. bulk insert failed on creation).
                            // Generate them locally from the template definition.
                            console.info(`[Checklist] No instances found for template ${tpl.id} (${tpl.taskName}), generating locally.`);
                            if (tpl.startDate && tpl.config) {
                                // We'll use generateInstances but it's defined below this effect.
                                // We build it inline here to avoid the circular reference problem.
                                const hDates = holidays.map((h: any) => h.date);
                                const getWD = (d: Date) => {
                                    let c = new Date(d), lim = 0, sh = false;
                                    while ((c.getDay() === 0 || hDates.includes(format(c, 'yyyy-MM-dd'))) && lim < 365) {
                                        c = addDays(c, 1); sh = true; lim++;
                                    }
                                    return { date: c, shifted: sh };
                                };
                                const [sy, sm, sd] = (tpl.startDate as string).split('-');
                                const start = new Date(Number(sy), Number(sm) - 1, Number(sd));
                                const horizon = addYears(new Date(), 5);
                                const cfg = tpl.config;
                                let cursor = new Date(start), idx = 0;
                                const MAX = 2500;
                                const localInsts: any[] = [];
                                const pushInst = (d: Date) => {
                                    if (cfg.frequency === 'DAILY' && d.getDay() === 0) return;
                                    const { date: wd, shifted } = cfg.frequency === 'DAILY' ? { date: d, shifted: false } : getWD(d);
                                    localInsts.push({
                                        id: `CI-${tpl.id}-${idx}`,
                                        templateId: tpl.id,
                                        doerId: tpl.doerId,
                                        taskName: tpl.taskName,
                                        department: tpl.department,
                                        date: format(wd, 'yyyy-MM-dd'),
                                        status: 'PENDING',
                                        shiftedDueToHoliday: shifted,
                                        dbId: undefined,
                                    });
                                    idx++;
                                };
                                const { addDays: aD, addWeeks: aW, addMonths: aM, addYears: aY, isBefore: iB } = { addDays, addWeeks, addMonths, addYears, isBefore };
                                if (cfg.frequency === 'ONE-TIME' || cfg.frequency === 'EVENT-BASED') {
                                    pushInst(start);
                                } else if (cfg.frequency === 'DAILY' || cfg.frequency === 'ALTERNATE') {
                                    const step = cfg.frequency === 'ALTERNATE' ? 2 : 1;
                                    while (iB(cursor, horizon) && idx < MAX) { pushInst(cursor); cursor = aD(cursor, step); }
                                } else if (cfg.frequency === 'WEEKLY' || cfg.frequency === 'FORTNIGHTLY' || cfg.frequency === 'ALTERNATE-WEEK') {
                                    const step = (cfg.frequency === 'FORTNIGHTLY' || cfg.frequency === 'ALTERNATE-WEEK') ? 2 : 1;
                                    while (iB(cursor, horizon) && idx < MAX) { pushInst(cursor); cursor = aW(cursor, step); }
                                } else {
                                    let ms = 1;
                                    if (cfg.frequency === 'QUARTERLY') ms = 3;
                                    if (cfg.frequency === 'HALF-YEARLY') ms = 6;
                                    if (cfg.frequency === 'YEARLY') ms = 12;
                                    if (cfg.frequency === 'PARTICULAR-DATE') ms = cfg.particularDateType === 'EVERY-YEAR' ? 12 : 1;
                                    while (iB(cursor, horizon) && idx < MAX) { pushInst(new Date(cursor)); cursor = aM(cursor, ms); }
                                }
                                localInsts.forEach(i => insts.push(i));
                                if (localInsts.length > 0) {
                                    templatesNeedingBulkSave.push({ tpl, generated: localInsts });
                                }
                            }
                        }
                    } catch { /* ignore per-template fetch errors */ }
                }

                if (mounted) setInstances(insts);

                // Re-save missing instances to DB in background (fire-and-forget)
                if (templatesNeedingBulkSave.length > 0) {
                    Promise.all(templatesNeedingBulkSave.map(({ tpl, generated }) =>
                        safePost('/checklists/bulk', {
                            items: generated.map(inst => ({
                                refId: tpl.id,
                                refType: 'TEMPLATE_INSTANCE',
                                item: JSON.stringify({ ...inst, templateId: tpl.id })
                            }))
                        }).then(() => {
                            console.info(`[Checklist] Re-saved ${generated.length} instances for template ${tpl.id}`);
                        }).catch(e => console.warn('[Checklist] Background bulk save failed:', e))
                    )).then(() => {
                        if (mounted) setRefreshTrigger(prev => prev + 1);
                    });
                }
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
            // Patch the template on the server
            await api.put(
                `/checklist-templates/${encodeURIComponent(editingTemplate.id)}`,
                {
                    taskName: editingTemplate.taskName,
                    doerId: editingTemplate.doerId,
                    buddyId: editingTemplate.buddyId,
                    department: editingTemplate.department,
                    startDate: editConfig.startDate,
                    config: updatedConfig,
                    active: editingTemplate.active,
                },
                { withCredentials: true }
            );

            // Update local template list
            const updatedTpl: ChecklistTemplate = { ...editingTemplate, config: updatedConfig, startDate: editConfig.startDate };
            setTemplates(prev => prev.map(t => t.id === updatedTpl.id ? updatedTpl : t));

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

        if (agendaStatusFilter !== 'ALL' && i.status !== agendaStatusFilter) return false;

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
    }).sort((a, b) => a.date.localeCompare(b.date)), [instances, templates, currentUser, doesDoerMatch, agendaSearch, agendaStatusFilter, agendaDateFilter, todayStr]);

    const stats = useMemo(() => {
        const myInstances = instances.filter(i => {
            const t = templates.find(temp => String(temp.id) === String(i.templateId));
            const match = doesDoerMatch(i.doerId, currentUser) || doesDoerMatch(t?.doerId, currentUser) || (t?.buddyId && doesDoerMatch(t.buddyId, currentUser));
            return match;
        });
        const myToday = myInstances.filter(i => i.date === todayStr);
        const done = myToday.filter(i => i.status === 'COMPLETED').length;
        const pct = myToday.length > 0 ? Math.round((done / myToday.length) * 100) : 0;
        const overdueCount = myInstances.filter(i => i.status === 'PENDING' && i.date < todayStr).length;
        return { total: myToday.length, done, pct, overdueCount };
    }, [instances, templates, currentUser, todayStr, doesDoerMatch]);

    // Admin overview stats
    const adminStats = useMemo(() => {
        const todayAll = instances.filter(i => i.date === todayStr);
        const totalToday = todayAll.length;
        const doneToday = todayAll.filter(i => i.status === 'COMPLETED').length;
        const overdueCount = instances.filter(i => i.status === 'PENDING' && i.date < todayStr).length;
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
    const monitorPending = useMemo(() => monitorData.filter(i => i.status === 'PENDING'), [monitorData]);
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

    // ─── render ────────────────────────────────────────────────────────────────
    return (
        <div className="checklist-root h-full overflow-y-auto bg-[#f4f3f0] font-sans">
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap');
                .checklist-root { font-family: 'DM Sans', sans-serif; }
                .font-mono-dm { font-family: 'DM Mono', monospace; }
                .tab-active { background: #1a1a2e; color: #fff; }
                .tab-inactive { background: transparent; color: #6b7280; }
                .tab-inactive:hover { background: #e5e4e0; color: #1a1a2e; }
                .ring-custom:focus { outline: 2px solid #6366f1; outline-offset: 2px; }
                @keyframes fadeUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:none; } }
                .fade-up { animation: fadeUp 0.25s ease both; }
                @keyframes spin { to { transform: rotate(360deg); } }
                .spin { animation: spin 0.8s linear infinite; }
                .progress-ring { transition: stroke-dashoffset 1s ease; }
                .done-row { opacity: 0.65; }
                .checklist-root::-webkit-scrollbar { width: 6px; }
                .checklist-root::-webkit-scrollbar-track { background: transparent; }
                .checklist-root::-webkit-scrollbar-thumb { background: #d1cfc9; border-radius: 99px; }
                .checklist-root::-webkit-scrollbar-thumb:hover { background: #a8a49e; }
            `}</style>

            <div className="max-w-7xl mx-auto px-4 md:px-8 py-8">

                {/* ── Header ── */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <div className="w-9 h-9 rounded-xl bg-[#1a1a2e] flex items-center justify-center">
                                <ListChecks size={18} className="text-white" />
                            </div>
                            <h1 className="text-2xl font-extrabold text-[#1a1a2e] tracking-tight">Routine Checklists</h1>
                        </div>
                        <p className="text-sm text-[#9ca3af] ml-12 font-medium">
                            {format(new Date(), 'EEEE, MMMM d, yyyy')} &nbsp;·&nbsp; Compliance Dashboard
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setRefreshTrigger(prev => prev + 1)}
                            disabled={isLoading}
                            className={cx(
                                'group relative flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all duration-300 active:scale-95 overflow-hidden',
                                isLoading
                                    ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-wait'
                                    : 'bg-white text-[#1a1a2e] border border-[#e8e6e0] hover:border-indigo-300 hover:shadow-indigo-100 hover:shadow-lg hover:-translate-y-0.5'
                            )}
                            title="Refresh Data"
                        >
                            <div className="absolute inset-0 bg-gradient-to-r from-indigo-50/80 via-white to-purple-50/80 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                            <div className={cx(
                                "relative z-10 flex items-center justify-center p-1 rounded-lg transition-all",
                                isLoading ? "bg-transparent" : "bg-indigo-50 text-indigo-600 group-hover:bg-white group-hover:shadow-sm"
                            )}>
                                <Zap size={14} className={cx('absolute transition-opacity duration-300', isLoading ? 'opacity-0' : 'opacity-100 group-hover:opacity-0')} />
                                <RefreshCw size={14} className={cx('transition-all duration-700 ease-in-out', isLoading ? 'animate-spin text-indigo-400 opacity-100' : 'opacity-0 group-hover:opacity-100 group-hover:rotate-180')} />
                            </div>

                            <span className="relative z-10 hidden sm:inline-block pr-1 group-hover:text-indigo-900 transition-colors">
                                {isLoading ? 'Syncing...' : 'Sync Now'}
                            </span>
                        </button>

                        {isAdmin && (
                            <button
                                onClick={() => setShowCreateModal(true)}
                                className="flex items-center gap-2 bg-[#1a1a2e] hover:bg-[#2d2d4e] text-white px-5 py-2.5 rounded-xl font-bold text-sm transition-all shadow-lg active:scale-95 hover:-translate-y-0.5"
                            >
                                <Plus size={16} /> New Routine
                            </button>
                        )}
                    </div>
                </div>

                {/* ── Admin KPI bar ── */}
                {isAdmin && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                        {[
                            { label: "Today's Tasks", value: adminStats.totalToday, icon: <Calendar size={16} />, color: 'text-[#6366f1] bg-indigo-50' },
                            { label: 'Completed Today', value: adminStats.doneToday, icon: <CheckCheck size={16} />, color: 'text-emerald-600 bg-emerald-50' },
                            { label: 'Team Progress', value: `${adminStats.pctToday}%`, icon: <TrendingUp size={16} />, color: 'text-blue-600 bg-blue-50' },
                            { label: 'Overdue', value: adminStats.overdueCount, icon: <AlertTriangle size={16} />, color: adminStats.overdueCount > 0 ? 'text-red-600 bg-red-50' : 'text-slate-400 bg-slate-100' },
                        ].map((k, i) => (
                            <div key={i} className="bg-white rounded-2xl border border-[#e8e6e0] px-4 py-3 flex items-center gap-3">
                                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${k.color}`}>{k.icon}</div>
                                <div>
                                    <div className="text-xl font-extrabold text-[#1a1a2e] leading-none">{k.value}</div>
                                    <div className="text-[10px] text-[#9ca3af] font-semibold uppercase tracking-wider mt-0.5">{k.label}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* ── Employee KPI bar ── */}
                {!isAdmin && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                        {[
                            { label: "My Tasks Today", value: stats.total, icon: <Calendar size={16} />, color: 'text-[#6366f1] bg-indigo-50' },
                            { label: 'Completed Today', value: stats.done, icon: <CheckCheck size={16} />, color: 'text-emerald-600 bg-emerald-50' },
                            { label: 'My Progress', value: `${stats.pct}%`, icon: <TrendingUp size={16} />, color: 'text-blue-600 bg-blue-50' },
                            { label: 'My Overdue', value: stats.overdueCount, icon: <AlertTriangle size={16} />, color: stats.overdueCount > 0 ? 'text-red-600 bg-red-50' : 'text-slate-400 bg-slate-100' },
                        ].map((k, i) => (
                            <div key={i} className="bg-white rounded-2xl border border-[#e8e6e0] px-4 py-3 flex items-center gap-3">
                                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${k.color}`}>{k.icon}</div>
                                <div>
                                    <div className="text-xl font-extrabold text-[#1a1a2e] leading-none">{k.value}</div>
                                    <div className="text-[10px] text-[#9ca3af] font-semibold uppercase tracking-wider mt-0.5">{k.label}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* ── Tabs ── */}
                <div className="flex gap-1 mb-6 bg-[#e8e6e0] p-1 rounded-xl w-full md:w-fit overflow-x-auto flex-nowrap">
                    {(['AGENDA', 'MONITOR', 'MISSED', ...(isAdmin ? ['MASTER'] : [])] as const).map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab as any)}
                            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${activeTab === tab ? 'tab-active shadow-sm' : 'tab-inactive'}`}
                        >
                            {tab === 'AGENDA' ? 'My Agenda' : tab === 'MONITOR' ? (isAdmin ? 'Team Status' : 'Status') : tab === 'MISSED' ? 'Missed Tasks' : 'Master Rules'}
                        </button>
                    ))}
                </div>

                {/* ── Loading ── */}
                {isLoading ? (
                    <div className="flex items-center justify-center py-40">
                        <div className="flex flex-col items-center gap-3 text-[#9ca3af]">
                            <Loader2 size={28} className="spin text-[#6366f1]" />
                            <p className="text-sm font-semibold">Loading schedule…</p>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* ════════════ AGENDA TAB ════════════ */}
                        {activeTab === 'AGENDA' && (
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 fade-up">
                                {/* Left – task list */}
                                <div className="lg:col-span-2 space-y-3">
                                    <div className="flex items-center justify-between mb-1">
                                        <h2 className="text-[11px] font-bold text-[#9ca3af] uppercase tracking-widest flex items-center gap-1.5">
                                            <Clock size={13} /> Actionable Items
                                        </h2>
                                        {myAgenda.length > 0 && (
                                            <span className={cx('border px-2.5 py-0.5 rounded-full text-[10px] font-bold',
                                                agendaStatusFilter === 'COMPLETED' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-red-50 text-red-600 border-red-100'
                                            )}>
                                                {myAgenda.length} {agendaStatusFilter === 'COMPLETED' ? 'done' : agendaStatusFilter === 'ALL' ? 'tasks' : 'pending'}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex flex-col sm:flex-row gap-2 mb-3">
                                        <div className="relative flex-1">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9ca3af]" size={14} />
                                            <input
                                                type="text"
                                                placeholder="Search tasks…"
                                                className="w-full pl-9 pr-4 py-2 bg-white border border-[#e8e6e0] rounded-xl text-xs font-bold focus:outline-none ring-custom"
                                                value={agendaSearch}
                                                onChange={e => setAgendaSearch(e.target.value)}
                                            />
                                        </div>
                                        <div className="flex gap-2 shrink-0">
                                            <select
                                                className="pl-3 pr-2 py-2 bg-white border border-[#e8e6e0] rounded-xl text-[11px] font-bold outline-none ring-custom text-[#374151]"
                                                value={agendaDateFilter}
                                                onChange={e => setAgendaDateFilter(e.target.value as any)}
                                            >
                                                <option value="TODAY">Today's Tasks</option>
                                                <option value="UPCOMING_WEEK">Upcoming Week</option>
                                                <option value="ALL">All Time</option>
                                            </select>
                                            <select
                                                className="pl-3 pr-2 py-2 bg-white border border-[#e8e6e0] rounded-xl text-[11px] font-bold outline-none ring-custom text-[#374151]"
                                                value={agendaStatusFilter}
                                                onChange={e => setAgendaStatusFilter(e.target.value as any)}
                                            >
                                                <option value="ALL">All Status</option>
                                                <option value="PENDING">Pending Only</option>
                                                <option value="COMPLETED">Completed Only</option>
                                            </select>
                                        </div>
                                    </div>

                                    {myAgenda.length === 0 ? (
                                        <div className="bg-white rounded-2xl border border-[#e8e6e0] p-16 text-center flex flex-col items-center gap-3 text-[#9ca3af]">
                                            <CheckCircle2 size={40} className="opacity-15" />
                                            <p className="font-semibold text-sm">All clear — nothing pending.</p>
                                        </div>
                                    ) : myAgenda.map((item, idx) => {
                                        const tpl = templates.find(t => String(t.id) === String(item.templateId));
                                        const taskName = item.taskName || tpl?.taskName || 'Unnamed Task';
                                        const freq = tpl?.config?.frequency || (item as any)?.frequency || (tpl as any)?.frequency || 'ONE-TIME';
                                        const isOverdue = item.date < todayStr;
                                        const isMarking = markingIds.has(item.id);
                                        // Already done — never show in agenda (agenda only shows PENDING)
                                        // but guard anyway
                                        const isDone = item.status === 'COMPLETED';
                                        const isStopped = item.status === 'STOPPED';
                                        const isMissed = item.status === 'MISSED';

                                        return (
                                            <div
                                                key={item.id}
                                                className={cx(
                                                    'bg-white rounded-2xl border transition-all flex items-start gap-4 p-4',
                                                    isOverdue ? 'border-red-200 bg-red-50/30' : 'border-[#e8e6e0]',
                                                    'fade-up'
                                                )}
                                                style={{ animationDelay: `${idx * 35}ms` }}
                                            >
                                                {/* Icon */}
                                                <div className={cx(
                                                    'w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-white',
                                                    isOverdue ? 'bg-red-500' : item.shiftedDueToHoliday ? 'bg-amber-500' : 'bg-[#1a1a2e]'
                                                )}>
                                                    {isOverdue ? <AlertCircle size={18} /> : item.shiftedDueToHoliday ? <RefreshCw size={16} /> : <Calendar size={18} />}
                                                </div>

                                                {/* Content */}
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-bold text-[#1a1a2e] text-sm leading-tight break-words whitespace-normal">{taskName}</p>
                                                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                                                        <span className={cx(
                                                            'text-[10px] font-bold px-2 py-0.5 rounded border font-mono-dm',
                                                            isOverdue ? 'bg-red-50 text-red-600 border-red-200' : 'bg-slate-50 text-slate-500 border-slate-200'
                                                        )}>
                                                            {isOverdue ? `OVERDUE · ${item.date}` : item.date}
                                                        </span>
                                                        {freq && <FrequencyBadge freq={freq} />}
                                                        {item.shiftedDueToHoliday && (
                                                            <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded font-bold">Holiday Shift</span>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Action buttons */}
                                                <div className="flex gap-2 shrink-0 items-center">
                                                    {!isDone && !isStopped && !isMissed && (
                                                        <button
                                                            onClick={() => !isMarking && handleStopTask(item.id, (item as any).dbId)}
                                                            disabled={isMarking}
                                                            className={cx(
                                                                'flex items-center justify-center p-2 rounded-xl text-[#9ca3af] transition-all hover:bg-red-50 hover:text-red-500',
                                                                isMarking ? 'opacity-50 cursor-wait' : 'cursor-pointer'
                                                            )}
                                                            title="Stop Task"
                                                        >
                                                            <X size={16} />
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => !isDone && !isStopped && !isMissed && !isMarking && handleMarkDone(item.id, (item as any).dbId)}
                                                        disabled={isDone || isStopped || isMissed || isMarking}
                                                        className={cx(
                                                            'flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all',
                                                            isDone
                                                                ? 'bg-emerald-50 text-emerald-600 border border-emerald-200 cursor-not-allowed'
                                                                : isStopped
                                                                ? 'bg-red-50 text-red-600 border border-red-200 cursor-not-allowed'
                                                                : isMissed
                                                                ? 'bg-orange-50 text-orange-600 border border-orange-200 cursor-not-allowed'
                                                                : isMarking
                                                                    ? 'bg-slate-100 text-slate-400 cursor-wait'
                                                                    : 'bg-[#1a1a2e] text-white hover:bg-[#6366f1] active:scale-95 cursor-pointer shadow-sm'
                                                        )}
                                                    >
                                                        {isDone
                                                            ? <><CheckCheck size={13} /> Done</>
                                                            : isStopped
                                                                ? <><AlertCircle size={13} /> Stopped</>
                                                                : isMissed
                                                                ? <><X size={13} /> Missed</>
                                                                : isMarking
                                                                    ? <><Loader2 size={13} className="spin" /> Saving…</>
                                                                    : <><ArrowRight size={13} /> Mark Done</>
                                                        }
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Right sidebar */}
                                <div className="space-y-4">
                                    {/* Progress ring */}
                                    <div className="bg-white rounded-2xl border border-[#e8e6e0] p-6 text-center">
                                        <p className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-widest mb-4">Today's Progress</p>
                                        <div className="relative inline-flex items-center justify-center mb-3">
                                            <svg className="w-24 h-24 -rotate-90">
                                                <circle cx="48" cy="48" r="40" strokeWidth="7" fill="none" className="text-[#f0efe9]" stroke="currentColor" />
                                                <circle cx="48" cy="48" r="40" strokeWidth="7" fill="none" strokeLinecap="round"
                                                    strokeDasharray={2 * Math.PI * 40}
                                                    strokeDashoffset={2 * Math.PI * 40 * (1 - stats.pct / 100)}
                                                    className={`progress-ring ${stats.pct === 100 ? 'text-emerald-500' : 'text-[#6366f1]'}`}
                                                    stroke="currentColor"
                                                />
                                            </svg>
                                            <span className="absolute text-2xl font-extrabold text-[#1a1a2e]">{stats.pct}%</span>
                                        </div>
                                        <p className="text-sm font-bold text-[#1a1a2e]">{stats.done} of {stats.total} secured</p>
                                        {stats.pct === 100 && stats.total > 0 && (
                                            <p className="text-xs text-emerald-600 font-bold mt-1">🎉 All done for today!</p>
                                        )}
                                    </div>

                                    {/* Policy card */}
                                    <div className="bg-[#1a1a2e] rounded-2xl p-5 text-white space-y-4">
                                        <p className="text-[10px] font-bold text-[#6b7280] uppercase tracking-widest">Automation Policy</p>
                                        <div className="space-y-3">
                                            <div className="flex gap-3 items-start">
                                                <RefreshCw size={14} className="text-[#6366f1] shrink-0 mt-0.5" />
                                                <div>
                                                    <p className="text-xs font-bold text-white">NWD Auto-Shift</p>
                                                    <p className="text-[10px] text-[#6b7280] leading-relaxed">Tasks on holidays or Sundays move to the next working day.</p>
                                                </div>
                                            </div>
                                            <div className="flex gap-3 items-start">
                                                <Sun size={14} className="text-amber-400 shrink-0 mt-0.5" />
                                                <div>
                                                    <p className="text-xs font-bold text-white">Sunday Skip</p>
                                                    <p className="text-[10px] text-[#6b7280] leading-relaxed">Daily tasks skip Sundays entirely for team recovery.</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ════════════ MONITOR TAB ════════════ */}
                        {activeTab === 'MONITOR' && (
                            <div className="space-y-5 fade-up">
                                {/* Monitor Stats Strip */}
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    <div className="bg-white rounded-2xl border border-[#e8e6e0] px-4 py-3 flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-[#6366f1] bg-indigo-50"><Target size={16} /></div>
                                        <div>
                                            <div className="text-xl font-extrabold text-[#1a1a2e] leading-none">{monitorStats.total}</div>
                                            <div className="text-[10px] text-[#9ca3af] font-semibold uppercase tracking-wider mt-0.5">Assigned</div>
                                        </div>
                                    </div>
                                    <div className="bg-white rounded-2xl border border-[#e8e6e0] px-4 py-3 flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-amber-600 bg-amber-50"><Clock size={16} /></div>
                                        <div>
                                            <div className="text-xl font-extrabold text-[#1a1a2e] leading-none">{monitorStats.pending}</div>
                                            <div className="text-[10px] text-[#9ca3af] font-semibold uppercase tracking-wider mt-0.5">Pending</div>
                                        </div>
                                    </div>
                                    <div className="bg-white rounded-2xl border border-[#e8e6e0] px-4 py-3 flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-emerald-600 bg-emerald-50"><CheckCheck size={16} /></div>
                                        <div>
                                            <div className="text-xl font-extrabold text-[#1a1a2e] leading-none">{monitorStats.done}</div>
                                            <div className="text-[10px] text-[#9ca3af] font-semibold uppercase tracking-wider mt-0.5">Completed</div>
                                        </div>
                                    </div>
                                    <div className="bg-white rounded-2xl border border-[#e8e6e0] px-4 py-3 flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-blue-600 bg-blue-50"><TrendingUp size={16} /></div>
                                        <div>
                                            <div className="text-xl font-extrabold text-[#1a1a2e] leading-none">{monitorStats.pct}%</div>
                                            <div className="text-[10px] text-[#9ca3af] font-semibold uppercase tracking-wider mt-0.5">Progress</div>
                                        </div>
                                    </div>
                                </div>
                                {/* Filters */}
                                <div className="bg-white rounded-2xl border border-[#e8e6e0] p-4 flex flex-col lg:flex-row gap-3 items-center">
                                    <div className="relative flex-1 w-full">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9ca3af]" size={14} />
                                        <input
                                            type="text"
                                            placeholder="Search task name…"
                                            className="w-full pl-9 pr-4 py-2 bg-[#f4f3f0] border border-[#e8e6e0] rounded-xl text-sm focus:outline-none ring-custom"
                                            value={monitorSearch}
                                            onChange={e => setMonitorSearch(e.target.value)}
                                        />
                                    </div>
                                    <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto shrink-0">
                                        {isAdmin && (
                                            <select
                                                className="flex-1 lg:w-44 pl-3 pr-2 py-2 bg-[#f4f3f0] border border-[#e8e6e0] rounded-xl text-xs font-bold outline-none ring-custom text-[#374151]"
                                                value={monitorLeadId}
                                                onChange={e => setMonitorLeadId(e.target.value)}
                                            >
                                                <option value="ALL">All Members</option>
                                                {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                                            </select>
                                        )}
                                        <select
                                            className="flex-1 lg:w-36 pl-3 pr-2 py-2 bg-[#f4f3f0] border border-[#e8e6e0] rounded-xl text-xs font-bold outline-none ring-custom text-[#374151]"
                                            value={monitorStatus}
                                            onChange={e => setMonitorStatus(e.target.value as any)}
                                        >
                                            <option value="ALL">All Status</option>
                                            <option value="PENDING">Pending Only</option>
                                            <option value="COMPLETED">Completed Only</option>
                                            <option value="STOPPED">Stopped Only</option>
                                            <option value="MISSED">Missed Only</option>
                                        </select>
                                    </div>
                                </div>

                                {/* Summary strip */}
                                <div className="flex gap-3 text-[11px] font-bold">
                                    <span className="flex items-center gap-1.5 text-[#9ca3af]">
                                        <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
                                        {monitorPending.length} Pending
                                    </span>
                                    <span className="flex items-center gap-1.5 text-[#9ca3af]">
                                        <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
                                        {monitorCompleted.length} Completed
                                    </span>
                                </div>

                                {/* ── PENDING SECTION ── */}
                                {(monitorStatus === 'ALL' || monitorStatus === 'PENDING') && (
                                    <div>
                                        <div className="flex items-center gap-2 mb-3">
                                            <div className="w-2 h-2 rounded-full bg-amber-400" />
                                            <h3 className="text-[11px] font-bold text-[#9ca3af] uppercase tracking-widest">Pending Tasks</h3>
                                            <span className="ml-auto text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                                                {monitorPending.length}
                                            </span>
                                        </div>
                                        <div className="bg-white rounded-2xl border border-[#e8e6e0] overflow-hidden">
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-sm min-w-[700px]">
                                                    <thead className="bg-[#f4f3f0] border-b border-[#e8e6e0]">
                                                        <tr>
                                                            <th className="px-4 py-3 text-left text-[10px] font-bold text-[#9ca3af] uppercase tracking-widest">Date</th>
                                                            <th className="px-4 py-3 text-left text-[10px] font-bold text-[#9ca3af] uppercase tracking-widest">Member</th>
                                                            <th className="px-4 py-3 text-left text-[10px] font-bold text-[#9ca3af] uppercase tracking-widest">Task</th>
                                                            <th className="px-4 py-3 text-left text-[10px] font-bold text-[#9ca3af] uppercase tracking-widest">Frequency</th>
                                                            <th className="px-4 py-3 text-right text-[10px] font-bold text-[#9ca3af] uppercase tracking-widest">Action</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-[#f4f3f0]">
                                                        {paginatedPending.length === 0 ? (
                                                            <tr><td colSpan={5} className="px-4 py-10 text-center text-[#9ca3af] text-sm">No pending tasks.</td></tr>
                                                        ) : paginatedPending.map(item => {
                                                            const tpl = templates.find(t => String(t.id) === String(item.templateId));
                                                            const name = item.taskName || tpl?.taskName || 'Unnamed';
                                                            const freq = tpl?.config?.frequency || (item as any)?.frequency || (tpl as any)?.frequency || 'ONE-TIME';
                                                            const doerId = item.doerId || tpl?.doerId;
                                                            const lead = employees.find(e => String(e.id) === String(doerId));
                                                            const overdue = item.date < todayStr;
                                                            const isMarking = markingIds.has(item.id);

                                                            return (
                                                                <tr key={item.id} className={cx('hover:bg-[#fafaf8] transition-colors', overdue && 'bg-red-50/40')}>
                                                                    <td className="px-4 py-3">
                                                                        <span className={cx('font-mono-dm text-xs font-bold', overdue ? 'text-red-600' : 'text-[#6b7280]')}>
                                                                            {overdue && '⚠ '}{item.date}
                                                                        </span>
                                                                    </td>
                                                                    <td className="px-4 py-3 font-semibold text-[#1a1a2e] text-sm">{lead?.name || 'Unknown'}</td>
                                                                    <td className="px-4 py-3 text-[#374151] text-sm break-words whitespace-normal min-w-[200px] max-w-[300px] md:max-w-none">{name}</td>
                                                                    <td className="px-4 py-3">{freq && <FrequencyBadge freq={freq} />}</td>
                                                                    <td className="px-4 py-3 text-right">
                                                                        <div className="flex items-center justify-end gap-2">
                                                                            <button
                                                                                onClick={() => !isMarking && handleStopTask(item.id, item.dbId)}
                                                                                disabled={isMarking}
                                                                                className={cx(
                                                                                    'inline-flex items-center justify-center p-1.5 rounded-lg transition-all text-[#9ca3af]',
                                                                                    isMarking
                                                                                        ? 'opacity-50 cursor-wait'
                                                                                        : 'hover:bg-red-50 hover:text-red-500 cursor-pointer'
                                                                                )}
                                                                                title="Stop Task"
                                                                            >
                                                                                <X size={14} />
                                                                            </button>
                                                                            {isAdmin && (
                                                                                <button
                                                                                    onClick={() => !isMarking && handleMissTask(item.id, item.dbId)}
                                                                                    disabled={isMarking}
                                                                                    className={cx(
                                                                                        'inline-flex items-center justify-center px-2 py-1.5 rounded-lg transition-all text-xs font-bold border',
                                                                                        isMarking
                                                                                            ? 'opacity-50 cursor-wait bg-slate-50 text-slate-400 border-slate-200'
                                                                                            : 'bg-white text-orange-600 border-orange-200 hover:bg-orange-50 cursor-pointer shadow-sm'
                                                                                    )}
                                                                                    title="Mark as Missed"
                                                                                >
                                                                                    Mark Missed
                                                                                </button>
                                                                            )}
                                                                            <button
                                                                                onClick={() => !isMarking && handleMarkDone(item.id, item.dbId)}
                                                                                disabled={isMarking}
                                                                                className={cx(
                                                                                    'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all',
                                                                                    isMarking
                                                                                        ? 'bg-slate-100 text-slate-400 cursor-wait'
                                                                                        : 'bg-[#1a1a2e] text-white hover:bg-[#6366f1] active:scale-95 cursor-pointer'
                                                                                )}
                                                                            >
                                                                                {isMarking ? <><Loader2 size={11} className="spin" /> Saving</> : <><CheckCheck size={11} /> Mark Done</>}
                                                                            </button>
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                        {/* Pending section pagination */}
                                        {totalPendingPages > 1 && (
                                            <div className="bg-white border border-[#e8e6e0] rounded-b-2xl px-4 py-3 flex items-center justify-between border-t-0">
                                                <span className="text-xs text-[#9ca3af] font-semibold">
                                                    {(pendingPage - 1) * itemsPerPage + 1}–{Math.min(pendingPage * itemsPerPage, monitorPending.length)} of {monitorPending.length} pending
                                                </span>
                                                <div className="flex items-center gap-1">
                                                    <button onClick={() => setPendingPage(p => Math.max(1, p - 1))} disabled={pendingPage === 1}
                                                        className="p-1.5 bg-[#f4f3f0] border border-[#e8e6e0] rounded-lg disabled:opacity-30 hover:bg-[#e8e6e0] transition-all">
                                                        <ChevronLeft size={14} />
                                                    </button>
                                                    <span className="text-xs font-bold text-[#374151] px-3">{pendingPage} / {totalPendingPages}</span>
                                                    <button onClick={() => setPendingPage(p => Math.min(totalPendingPages, p + 1))} disabled={pendingPage === totalPendingPages}
                                                        className="p-1.5 bg-[#f4f3f0] border border-[#e8e6e0] rounded-lg disabled:opacity-30 hover:bg-[#e8e6e0] transition-all">
                                                        <ChevronRight size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* ── COMPLETED SECTION — clearly separated ── */}
                                {(monitorStatus === 'ALL' || monitorStatus === 'COMPLETED' || monitorStatus === 'STOPPED') && monitorCompleted.length > 0 && (
                                    <div className="mt-2">
                                        <div className="flex items-center gap-2 mb-3">
                                            <div className="w-2 h-2 rounded-full bg-emerald-400" />
                                            <h3 className="text-[11px] font-bold text-[#9ca3af] uppercase tracking-widest">Task History</h3>
                                            <span className="ml-auto text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                                                {monitorCompleted.length}
                                            </span>
                                        </div>
                                        <div className="bg-white rounded-2xl border border-emerald-100 overflow-hidden">
                                            <div className="bg-emerald-50 border-b border-emerald-100 px-4 py-2 flex items-center gap-2">
                                                <CheckCheck size={14} className="text-emerald-600" />
                                                <p className="text-[11px] font-bold text-emerald-700">Verified Complete — these tasks cannot be modified</p>
                                            </div>
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-sm min-w-[700px]">
                                                    <thead className="bg-[#f4f3f0] border-b border-[#e8e6e0]">
                                                        <tr>
                                                            <th className="px-4 py-3 text-left text-[10px] font-bold text-[#9ca3af] uppercase tracking-widest">Due Date</th>
                                                            <th className="px-4 py-3 text-left text-[10px] font-bold text-[#9ca3af] uppercase tracking-widest">Member</th>
                                                            <th className="px-4 py-3 text-left text-[10px] font-bold text-[#9ca3af] uppercase tracking-widest">Task</th>
                                                            <th className="px-4 py-3 text-left text-[10px] font-bold text-[#9ca3af] uppercase tracking-widest">Frequency</th>
                                                            <th className="px-4 py-3 text-right text-[10px] font-bold text-[#9ca3af] uppercase tracking-widest">Completed On</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-[#f4f3f0]">
                                                        {paginatedCompleted.map(item => {
                                                            const tpl = templates.find(t => String(t.id) === String(item.templateId));
                                                            const name = item.taskName || tpl?.taskName || 'Unnamed';
                                                            const freq = tpl?.config?.frequency || (item as any)?.frequency || (tpl as any)?.frequency || 'ONE-TIME';
                                                            const doerId = item.doerId || tpl?.doerId;
                                                            const lead = employees.find(e => String(e.id) === String(doerId));

                                                            return (
                                                                <tr key={item.id} className="done-row hover:opacity-100 transition-opacity">
                                                                    <td className="px-4 py-3 font-mono-dm text-xs text-[#6b7280] font-bold">{item.date}</td>
                                                                    <td className="px-4 py-3 font-semibold text-[#1a1a2e] text-sm">{lead?.name || 'Unknown'}</td>
                                                                    <td className="px-4 py-3 text-[#374151] text-sm break-words whitespace-normal min-w-[200px] max-w-[300px] md:max-w-none">{name}</td>
                                                                    <td className="px-4 py-3">{freq && <FrequencyBadge freq={freq} />}</td>
                                                                    <td className="px-4 py-3 text-right">
                                                                        {item.status === 'STOPPED' ? (
                                                                            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-red-600">
                                                                                <AlertCircle size={12} /> Stopped
                                                                            </span>
                                                                        ) : (
                                                                            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-700">
                                                                                <CheckCheck size={12} />
                                                                                {item.completedDate || '—'}
                                                                            </span>
                                                                        )}
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                        {/* Completed section pagination */}
                                        {totalCompletedPages > 1 && (
                                            <div className="bg-white border border-emerald-100 rounded-b-2xl px-4 py-3 flex items-center justify-between border-t-0">
                                                <span className="text-xs text-[#9ca3af] font-semibold">
                                                    {(completedPage - 1) * itemsPerPage + 1}–{Math.min(completedPage * itemsPerPage, monitorCompleted.length)} of {monitorCompleted.length} completed
                                                </span>
                                                <div className="flex items-center gap-1">
                                                    <button onClick={() => setCompletedPage(p => Math.max(1, p - 1))} disabled={completedPage === 1}
                                                        className="p-1.5 bg-[#f4f3f0] border border-[#e8e6e0] rounded-lg disabled:opacity-30 hover:bg-[#e8e6e0] transition-all">
                                                        <ChevronLeft size={14} />
                                                    </button>
                                                    <span className="text-xs font-bold text-[#374151] px-3">{completedPage} / {totalCompletedPages}</span>
                                                    <button onClick={() => setCompletedPage(p => Math.min(totalCompletedPages, p + 1))} disabled={completedPage === totalCompletedPages}
                                                        className="p-1.5 bg-[#f4f3f0] border border-[#e8e6e0] rounded-lg disabled:opacity-30 hover:bg-[#e8e6e0] transition-all">
                                                        <ChevronRight size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ════════════ MISSED TAB ════════════ */}
                        {activeTab === 'MISSED' && (
                            <div className="space-y-5 fade-up">
                                <div className="bg-white rounded-2xl border border-orange-100 overflow-hidden shadow-sm">
                                    <div className="bg-orange-50 border-b border-orange-100 px-4 py-3 flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <X size={16} className="text-orange-600" />
                                            <p className="text-xs font-bold text-orange-700 uppercase tracking-widest">Missed Tasks Review</p>
                                        </div>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm min-w-[700px]">
                                            <thead className="bg-[#f4f3f0] border-b border-[#e8e6e0]">
                                                <tr>
                                                    <th className="px-4 py-3 text-left text-[10px] font-bold text-[#9ca3af] uppercase tracking-widest">Date</th>
                                                    <th className="px-4 py-3 text-left text-[10px] font-bold text-[#9ca3af] uppercase tracking-widest">Member</th>
                                                    <th className="px-4 py-3 text-left text-[10px] font-bold text-[#9ca3af] uppercase tracking-widest">Task</th>
                                                    <th className="px-4 py-3 text-left text-[10px] font-bold text-[#9ca3af] uppercase tracking-widest">Frequency</th>
                                                    {isAdmin && <th className="px-4 py-3 text-right text-[10px] font-bold text-[#9ca3af] uppercase tracking-widest">Action</th>}
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-[#f4f3f0]">
                                                {instances.filter(i => {
                                                    const tpl = templates.find(t => String(t.id) === String(i.templateId));
                                                    const isMe = doesDoerMatch(i.doerId ?? tpl?.doerId, currentUser) || doesDoerMatch(tpl?.buddyId, currentUser);
                                                    return i.status === 'MISSED' && (isAdmin || isMe);
                                                }).length === 0 ? (
                                                    <tr><td colSpan={isAdmin ? 5 : 4} className="px-4 py-12 text-center text-[#9ca3af] text-sm">No missed tasks found.</td></tr>
                                                ) : instances.filter(i => {
                                                    const tpl = templates.find(t => String(t.id) === String(i.templateId));
                                                    const isMe = doesDoerMatch(i.doerId ?? tpl?.doerId, currentUser) || doesDoerMatch(tpl?.buddyId, currentUser);
                                                    return i.status === 'MISSED' && (isAdmin || isMe);
                                                }).sort((a, b) => b.date.localeCompare(a.date)).map(item => {
                                                    const tpl = templates.find(t => String(t.id) === String(item.templateId));
                                                    const name = item.taskName || tpl?.taskName || 'Unnamed';
                                                    const freq = tpl?.config?.frequency || (item as any)?.frequency || (tpl as any)?.frequency || 'ONE-TIME';
                                                    const doerId = item.doerId || tpl?.doerId;
                                                    const lead = employees.find(e => String(e.id) === String(doerId));
                                                    const isMarking = markingIds.has(item.id);

                                                    return (
                                                        <tr key={item.id} className="hover:bg-[#fafaf8] transition-colors">
                                                            <td className="px-4 py-3 font-mono-dm text-xs text-orange-600 font-bold">{item.date}</td>
                                                            <td className="px-4 py-3 font-semibold text-[#1a1a2e] text-sm">{lead?.name || 'Unknown'}</td>
                                                            <td className="px-4 py-3 text-[#374151] text-sm break-words whitespace-normal min-w-[200px] max-w-[300px] md:max-w-none">{name}</td>
                                                            <td className="px-4 py-3">{freq && <FrequencyBadge freq={freq} />}</td>
                                                            {isAdmin && (
                                                                <td className="px-4 py-3 text-right">
                                                                    <button
                                                                        onClick={() => !isMarking && handleMarkDone(item.id, (item as any).dbId)}
                                                                        disabled={isMarking}
                                                                        className={cx(
                                                                            'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all',
                                                                            isMarking
                                                                                ? 'bg-slate-100 text-slate-400 cursor-wait'
                                                                                : 'bg-[#1a1a2e] text-white hover:bg-emerald-600 active:scale-95 shadow-sm'
                                                                        )}
                                                                    >
                                                                        {isMarking ? 'Saving…' : <><CheckCheck size={12} /> Force Complete</>}
                                                                    </button>
                                                                </td>
                                                            )}
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ════════════ MASTER TAB ════════════ */}
                        {activeTab === 'MASTER' && isAdmin && (
                            <div className="fade-up">
                                <div className="bg-white rounded-2xl border border-[#e8e6e0] overflow-hidden">
                                    <div className="px-5 py-4 border-b border-[#e8e6e0] flex items-center justify-between">
                                        <p className="text-xs font-bold text-[#9ca3af] uppercase tracking-widest">{templates.length} Active Rules</p>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm min-w-[700px]">
                                            <thead className="bg-[#f4f3f0] border-b border-[#e8e6e0]">
                                                <tr>
                                                    {['Task', 'Lead', 'Department', 'Frequency', 'Anchor Date', ''].map((h, i) => (
                                                        <th key={i} className={`px-4 py-3 text-[10px] font-bold text-[#9ca3af] uppercase tracking-widest ${i === 5 ? 'text-right' : 'text-left'}`}>{h}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-[#f4f3f0]">
                                                {templates.length === 0 ? (
                                                    <tr><td colSpan={6} className="px-4 py-12 text-center text-[#9ca3af]">No master rules configured yet.</td></tr>
                                                ) : templates.map(t => {
                                                    const lead = employees.find(e => String(e.id) === String(t.doerId));
                                                    const freqLabel = t.config.frequency === 'PARTICULAR-DATE'
                                                        ? `Fixed · ${t.config.particularDateType === 'EVERY-YEAR' ? 'Yearly' : 'Monthly'}`
                                                        : t.config.frequency;

                                                    return (
                                                        <tr key={t.id} className="hover:bg-[#fafaf8] transition-colors group">
                                                            <td className="px-4 py-3 break-words whitespace-normal min-w-[200px] max-w-[300px] md:max-w-none">
                                                                <div className="flex items-center gap-2">
                                                                    <p className={cx("font-bold text-sm", t.active === false ? "text-[#9ca3af] line-through" : "text-[#1a1a2e]")}>{t.taskName}</p>
                                                                    {t.active === false && <span className="text-[9px] font-bold bg-red-50 text-red-600 border border-red-200 px-1.5 py-0.5 rounded uppercase">Stopped</span>}
                                                                </div>
                                                                <p className="font-mono-dm text-[9px] text-[#9ca3af] mt-0.5">{t.id}</p>
                                                            </td>
                                                            <td className="px-4 py-3 font-semibold text-[#374151]">{lead?.name || 'Unknown'}</td>
                                                            <td className="px-4 py-3 text-[#6b7280] text-xs">{t.department}</td>
                                                            <td className="px-4 py-3">
                                                                <div className="flex items-center gap-2">
                                                                    <FrequencyBadge freq={freqLabel} />
                                                                    <button
                                                                        onClick={() => handleOpenEditFreq(t)}
                                                                        className="opacity-0 group-hover:opacity-100 p-1 text-[#9ca3af] hover:text-[#6366f1] hover:bg-indigo-50 rounded-md transition-all"
                                                                        title="Change Frequency"
                                                                    >
                                                                        <Pencil size={12} />
                                                                    </button>
                                                                </div>
                                                            </td>
                                                            <td className="px-4 py-3 font-mono-dm text-xs text-[#6b7280] font-bold">{t.startDate}</td>
                                                            <td className="px-4 py-3 text-right">
                                                                <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                    <button
                                                                        onClick={() => handleToggleActive(t)}
                                                                        className={cx(
                                                                            'px-2.5 py-1 text-[10px] font-bold rounded-md transition-all border',
                                                                            t.active !== false
                                                                                ? 'text-amber-600 bg-amber-50 hover:bg-amber-100 border-amber-200'
                                                                                : 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100 border-emerald-200'
                                                                        )}
                                                                        title={t.active !== false ? "Stop Routine" : "Reactivate Routine"}
                                                                    >
                                                                        {t.active !== false ? 'Stop' : 'Reactivate'}
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleDeleteTemplate(t.id)}
                                                                        className="p-1.5 text-[#d1d5db] hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                                                        title="Delete Routine"
                                                                    >
                                                                        <Trash2 size={14} />
                                                                    </button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* ════════════ EDIT FREQUENCY MODAL ════════════ */}
            {editingTemplate && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end md:items-center justify-center p-0 md:p-4">
                    <div className="bg-white w-full md:max-w-lg rounded-t-3xl md:rounded-3xl shadow-2xl flex flex-col max-h-[85vh] fade-up">
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-5 border-b border-[#e8e6e0] shrink-0">
                            <div>
                                <h2 className="font-extrabold text-[#1a1a2e] text-lg flex items-center gap-2">
                                    <Pencil size={16} className="text-[#6366f1]" /> Edit Routine
                                </h2>
                                <p className="text-xs text-[#9ca3af] font-medium mt-0.5 truncate max-w-xs">{editingTemplate.taskName}</p>
                            </div>
                            <button onClick={() => setEditingTemplate(null)} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-[#f4f3f0] text-[#9ca3af] transition-all">
                                <X size={18} />
                            </button>
                        </div>

                        {/* Body */}
                        <div className="p-6 space-y-5 overflow-y-auto">
                            {/* Current info strip */}
                            <div className="flex items-center gap-3 bg-[#f4f3f0] rounded-2xl px-4 py-3">
                                <span className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-widest">Current</span>
                                <FrequencyBadge freq={editingTemplate.config.frequency} />
                                <span className="ml-auto text-[10px] text-[#9ca3af] font-mono-dm">{editingTemplate.startDate}</span>
                            </div>

                            {/* Start Date */}
                            <div>
                                <label className="block text-[10px] font-bold text-[#9ca3af] uppercase tracking-widest mb-1.5">
                                    <span className="flex items-center gap-1.5"><Calendar size={11} /> New Start / Anchor Date *</span>
                                </label>
                                <input
                                    type="date"
                                    className="w-full border border-[#e8e6e0] bg-[#fafaf8] px-4 py-3 rounded-xl text-sm font-bold text-[#1a1a2e] focus:outline-none focus:border-[#6366f1] focus:ring-2 focus:ring-[#6366f1]/20 transition-all"
                                    value={editConfig.startDate}
                                    onChange={e => setEditConfig(prev => ({ ...prev, startDate: e.target.value }))}
                                />
                                <p className="text-[10px] text-[#9ca3af] mt-1.5 font-medium">
                                    This is the anchor date from which the new schedule is generated.
                                </p>
                            </div>

                            {/* Frequency picker */}
                            <div>
                                <label className="block text-[10px] font-bold text-[#9ca3af] uppercase tracking-widest mb-2">New Recurrence Rule</label>
                                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                                    {frequencies.map(f => (
                                        <button
                                            key={f.id}
                                            type="button"
                                            onClick={() => setEditConfig(prev => ({ ...prev, frequency: f.id }))}
                                            className={cx(
                                                'py-2 px-2 rounded-xl text-[10px] font-bold tracking-wide uppercase transition-all border',
                                                editConfig.frequency === f.id
                                                    ? 'bg-[#6366f1] text-white border-[#6366f1] shadow-sm'
                                                    : 'bg-white text-[#6b7280] border-[#e8e6e0] hover:border-[#6366f1] hover:text-[#6366f1]'
                                            )}
                                        >
                                            {f.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Particular-date sub-options */}
                            {editConfig.frequency === 'PARTICULAR-DATE' && (
                                <div className="bg-[#f4f3f0] rounded-2xl p-4 space-y-3">
                                    <p className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-widest flex items-center gap-1.5"><Target size={12} /> Cycle</p>
                                    <div className="flex gap-2">
                                        {([
                                            { type: 'EVERY-MONTH' as const, label: `Monthly on ${editConfig.startDate ? format(parseDateSafe(editConfig.startDate), 'do') : 'day'}` },
                                            { type: 'EVERY-YEAR' as const, label: `Yearly on ${editConfig.startDate ? format(parseDateSafe(editConfig.startDate), 'MMM do') : 'date'}` },
                                        ]).map(opt => (
                                            <button
                                                key={opt.type}
                                                type="button"
                                                onClick={() => setEditConfig(prev => ({ ...prev, particularDateType: opt.type }))}
                                                className={cx(
                                                    'flex-1 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wide transition-all border',
                                                    editConfig.particularDateType === opt.type
                                                        ? 'bg-[#6366f1] text-white border-[#6366f1]'
                                                        : 'bg-white text-[#6b7280] border-[#e8e6e0]'
                                                )}
                                            >
                                                {opt.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Warning note */}
                            <div className="flex gap-3 bg-amber-50 border border-amber-200 rounded-2xl p-4">
                                <AlertTriangle size={15} className="text-amber-500 shrink-0 mt-0.5" />
                                <p className="text-[11px] text-amber-700 leading-relaxed">
                                    Changing the frequency will <strong>delete all pending future tasks</strong> for this routine and regenerate them using the new schedule. Completed tasks are preserved.
                                </p>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#e8e6e0] bg-[#fafaf8] shrink-0">
                            <button
                                onClick={() => setEditingTemplate(null)}
                                className="px-5 py-2.5 text-xs font-bold text-[#6b7280] hover:bg-[#e8e6e0] rounded-xl transition-all uppercase tracking-widest"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveFrequency}
                                disabled={isSavingFreq || (!editConfig.startDate || (editConfig.frequency === editingTemplate.config.frequency && editConfig.startDate === editingTemplate.startDate))}
                                className="flex items-center gap-2 px-6 py-2.5 bg-[#6366f1] hover:bg-[#4f46e5] disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-lg active:scale-95 uppercase tracking-widest"
                            >
                                {isSavingFreq
                                    ? <><Loader2 size={14} className="spin" /> Saving…</>
                                    : <><Save size={14} /> Save Frequency</>
                                }
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ════════════ CREATE MODAL ════════════ */}
            {showCreateModal && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end md:items-center justify-center p-0 md:p-4">
                    <div className="bg-white w-full md:max-w-xl rounded-t-3xl md:rounded-3xl shadow-2xl flex flex-col max-h-[92vh] fade-up">
                        {/* Modal header */}
                        <div className="flex items-center justify-between px-6 py-5 border-b border-[#e8e6e0] shrink-0">
                            <div>
                                <h2 className="font-extrabold text-[#1a1a2e] text-lg">New Routine</h2>
                                <p className="text-xs text-[#9ca3af] font-medium mt-0.5">Generates a 5-year compliance schedule automatically.</p>
                            </div>
                            <button onClick={() => setShowCreateModal(false)} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-[#f4f3f0] text-[#9ca3af] transition-all">
                                <X size={18} />
                            </button>
                        </div>

                        {/* Modal body */}
                        <div className="p-6 space-y-5 overflow-y-auto">
                            {/* Task name */}
                            <div>
                                <label className="block text-[10px] font-bold text-[#9ca3af] uppercase tracking-widest mb-1.5">Task Description *</label>
                                <input
                                    type="text"
                                    className="w-full border border-[#e8e6e0] bg-[#fafaf8] px-4 py-3 rounded-xl text-sm font-bold text-[#1a1a2e] placeholder-[#d1d5db] focus:outline-none focus:border-[#6366f1] focus:ring-2 focus:ring-[#6366f1]/20 transition-all"
                                    placeholder="e.g. Weekly Site Safety Audit"
                                    value={newTemplate.taskName || ''}
                                    onChange={e => setNewTemplate({ ...newTemplate, taskName: e.target.value })}
                                />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-[10px] font-bold text-[#9ca3af] uppercase tracking-widest mb-1.5">Lead *</label>
                                    <select
                                        className="w-full border border-[#e8e6e0] bg-[#fafaf8] px-3 py-3 rounded-xl text-sm font-bold text-[#1a1a2e] focus:outline-none focus:border-[#6366f1] transition-all"
                                        value={newTemplate.doerId || ''}
                                        onChange={e => setNewTemplate({ ...newTemplate, doerId: e.target.value })}
                                    >
                                        <option value="">— Select Member —</option>
                                        {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-[#9ca3af] uppercase tracking-widest mb-1.5">Buddy (Optional)</label>
                                    <select
                                        className="w-full border border-[#e8e6e0] bg-[#fafaf8] px-3 py-3 rounded-xl text-sm font-bold text-[#1a1a2e] focus:outline-none focus:border-[#6366f1] transition-all"
                                        value={newTemplate.buddyId || ''}
                                        onChange={e => setNewTemplate({ ...newTemplate, buddyId: e.target.value })}
                                    >
                                        <option value="">— Select Buddy —</option>
                                        {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-[#9ca3af] uppercase tracking-widest mb-1.5">Start Date *</label>
                                    <input
                                        type="date"
                                        className="w-full border border-[#e8e6e0] bg-[#fafaf8] px-3 py-3 rounded-xl text-sm font-bold text-[#1a1a2e] focus:outline-none focus:border-[#6366f1] transition-all"
                                        value={newTemplate.startDate || ''}
                                        onChange={e => setNewTemplate({ ...newTemplate, startDate: e.target.value })}
                                    />
                                </div>
                            </div>

                            {/* Frequency grid */}
                            <div>
                                <label className="block text-[10px] font-bold text-[#9ca3af] uppercase tracking-widest mb-2">Recurrence Rule</label>
                                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                                    {frequencies.map(f => (
                                        <button
                                            key={f.id}
                                            type="button"
                                            onClick={() => setNewTemplate({ ...newTemplate, config: { ...newTemplate.config!, frequency: f.id } })}
                                            className={cx(
                                                'py-2 px-2 rounded-xl text-[10px] font-bold tracking-wide uppercase transition-all border',
                                                newTemplate.config?.frequency === f.id
                                                    ? 'bg-[#1a1a2e] text-white border-[#1a1a2e] shadow-sm'
                                                    : 'bg-white text-[#6b7280] border-[#e8e6e0] hover:border-[#6366f1] hover:text-[#6366f1]'
                                            )}
                                        >
                                            {f.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Particular date sub-options */}
                            {newTemplate.config?.frequency === 'PARTICULAR-DATE' && (
                                <div className="bg-[#f4f3f0] rounded-2xl p-4 space-y-3">
                                    <p className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-widest flex items-center gap-1.5"><Target size={12} /> Cycle</p>
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
                                                        ? 'bg-[#6366f1] text-white border-[#6366f1]'
                                                        : 'bg-white text-[#6b7280] border-[#e8e6e0]'
                                                )}
                                            >
                                                {opt.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Automation note */}
                            <div className="flex gap-3 bg-[#1a1a2e] rounded-2xl p-4">
                                <ShieldCheck size={16} className="text-[#6366f1] shrink-0 mt-0.5" />
                                <p className="text-[11px] text-[#9ca3af] leading-relaxed">
                                    Schedule auto-generates 5 years forward. Holidays & Sundays shift tasks to the next working day.
                                </p>
                            </div>
                        </div>

                        {/* Modal footer */}
                        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#e8e6e0] bg-[#fafaf8] shrink-0">
                            <button
                                onClick={() => setShowCreateModal(false)}
                                className="px-5 py-2.5 text-xs font-bold text-[#6b7280] hover:bg-[#e8e6e0] rounded-xl transition-all uppercase tracking-widest"
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
