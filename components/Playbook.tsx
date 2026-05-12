import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2, X, Save, BookOpen, ShieldCheck, Search, ChevronDown, ChevronRight, Loader2, User, Users } from 'lucide-react';
import { User as UserType, Employee } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PlaybookEntry {
  id: string;
  assignType: 'user' | 'designation';
  userId?: string;        // when assignType === 'user'
  userName?: string;      // display name for user
  designation?: string;   // when assignType === 'designation' (also used by OrgTree)
  responsibilities: string;   // free-form paragraph
  updatedAt: string;
}

interface PlaybookProps {
  currentUser: UserType;
  employees: Employee[];
}

// ─── API helpers ──────────────────────────────────────────────────────────────

const API_KEY = 'playbook_entries';

async function fetchPlaybook(): Promise<PlaybookEntry[]> {
  try {
    const res = await fetch(`/api/storage/${API_KEY}`, { credentials: 'include' });
    if (!res.ok) return [];
    const data = await res.json();
    const raw = Array.isArray(data?.data) ? data.data : [];
    // Migrate old entries: responsibilities was string[] → join to paragraph
    return raw.map((e: any) => ({
      ...e,
      assignType: e.assignType ?? 'designation',
      responsibilities: Array.isArray(e.responsibilities)
        ? e.responsibilities.join('\n\n')
        : (e.responsibilities ?? ''),
    })) as PlaybookEntry[];
  } catch { return []; }
}

async function savePlaybook(entries: PlaybookEntry[]): Promise<void> {
  await fetch(`/api/storage/${API_KEY}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entries),
  });
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────

const EditModal: React.FC<{
  initial: Partial<PlaybookEntry> | null;
  employees: Employee[];
  existingDesignations: string[];
  onSave: (e: PlaybookEntry) => void;
  onClose: () => void;
}> = ({ initial, employees, existingDesignations, onSave, onClose }) => {
  const [assignType, setAssignType]         = useState<'user'|'designation'>(initial?.assignType ?? 'designation');
  const [userId,     setUserId]             = useState(initial?.userId ?? '');
  const [designation, setDesignation]       = useState(initial?.designation ?? '');
  const [responsibilities, setResp]         = useState(initial?.responsibilities ?? '');
  const [empSearch,  setEmpSearch]          = useState('');

  const activeEmps = employees.filter(e => e.status !== 'Inactive').sort((a, b) => a.name.localeCompare(b.name));
  const filteredEmps = empSearch.trim()
    ? activeEmps.filter(e => e.name.toLowerCase().includes(empSearch.toLowerCase()) || (e.designation ?? '').toLowerCase().includes(empSearch.toLowerCase()))
    : activeEmps;

  const selectedEmp = activeEmps.find(e => e.id === userId);

  const handleSave = () => {
    if (!responsibilities.trim()) return;
    if (assignType === 'user' && !userId) return;
    if (assignType === 'designation' && !designation.trim()) return;

    const emp = assignType === 'user' ? activeEmps.find(e => e.id === userId) : undefined;
    onSave({
      id: initial?.id ?? `pb-${Date.now()}`,
      assignType,
      userId:      assignType === 'user' ? userId : undefined,
      userName:    assignType === 'user' ? emp?.name : undefined,
      designation: assignType === 'designation' ? designation.trim() : emp?.designation,
      responsibilities: responsibilities.trim(),
      updatedAt: new Date().toISOString(),
    });
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center bg-gradient-to-r from-slate-800/60 to-indigo-900/30">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400"><BookOpen size={18} /></div>
            <h2 className="text-base font-bold text-white">{initial?.id ? 'Edit Playbook Entry' : 'New Playbook Entry'}</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"><X size={17} /></button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto custom-scrollbar">

          {/* Assign type toggle */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Assign To *</label>
            <div className="flex gap-2">
              <button
                onClick={() => setAssignType('designation')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-colors ${assignType === 'designation' ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500'}`}
              >
                <Users size={15} /> Designation
              </button>
              <button
                onClick={() => setAssignType('user')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-colors ${assignType === 'user' ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500'}`}
              >
                <User size={15} /> Specific Employee
              </button>
            </div>
          </div>

          {/* Designation picker */}
          {assignType === 'designation' && (
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Designation *</label>
              <input
                list="desig-list"
                value={designation}
                onChange={e => setDesignation(e.target.value)}
                placeholder="e.g. Facilities Manager"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-sm"
              />
              <datalist id="desig-list">
                {existingDesignations.map(d => <option key={d} value={d} />)}
              </datalist>
            </div>
          )}

          {/* Employee picker */}
          {assignType === 'user' && (
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Select Employee *</label>
              {selectedEmp && (
                <div className="flex items-center gap-3 mb-2 px-3 py-2 bg-indigo-500/10 border border-indigo-500/30 rounded-xl">
                  <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                    {selectedEmp.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{selectedEmp.name}</p>
                    <p className="text-xs text-indigo-300">{selectedEmp.designation ?? selectedEmp.department}</p>
                  </div>
                  <button onClick={() => setUserId('')} className="ml-auto text-slate-400 hover:text-white"><X size={14} /></button>
                </div>
              )}
              <div className="relative mb-2">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  value={empSearch}
                  onChange={e => setEmpSearch(e.target.value)}
                  placeholder="Search employee…"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div className="max-h-40 overflow-y-auto rounded-xl border border-slate-700 divide-y divide-slate-700/50">
                {filteredEmps.slice(0, 20).map(emp => (
                  <button
                    key={emp.id}
                    onClick={() => { setUserId(emp.id); setEmpSearch(''); }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-700/50 transition-colors ${userId === emp.id ? 'bg-indigo-500/10' : ''}`}
                  >
                    <div className="w-7 h-7 rounded-full bg-slate-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                      {emp.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm text-white font-medium">{emp.name}</p>
                      <p className="text-xs text-slate-400">{emp.designation ?? emp.department ?? '—'}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Responsibilities — paragraph */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Key Responsibilities *</label>
            <p className="text-xs text-slate-500 mb-2">Write as a paragraph or bullet points. Press Enter for new lines.</p>
            <textarea
              value={responsibilities}
              onChange={e => setResp(e.target.value)}
              placeholder="Describe the key responsibilities, duties, and expectations for this role..."
              rows={6}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-sm leading-relaxed resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-900/60 flex justify-end gap-3">
          <button onClick={onClose} className="px-5 py-2 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 text-sm font-medium transition-colors">Cancel</button>
          <button
            onClick={handleSave}
            disabled={!responsibilities.trim() || (assignType === 'user' ? !userId : !designation.trim())}
            className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold flex items-center gap-2 transition-colors"
          >
            <Save size={15} /> Save Playbook
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Playbook Card ────────────────────────────────────────────────────────────

const PlaybookCard: React.FC<{
  entry: PlaybookEntry;
  isAdmin: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}> = ({ entry, isAdmin, onEdit, onDelete }) => {
  const [open, setOpen] = useState(false);

  const label = entry.assignType === 'user'
    ? (entry.userName ?? 'Employee')
    : (entry.designation ?? 'Designation');

  const badge = entry.assignType === 'user'
    ? { icon: <User size={11} />, text: 'Individual', cls: 'bg-amber-500/15 text-amber-400 border-amber-500/20' }
    : { icon: <Users size={11} />, text: 'Designation', cls: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/20' };

  return (
    <div className="bg-slate-800/60 border border-slate-700 rounded-2xl overflow-hidden hover:border-indigo-500/40 transition-colors shadow-sm">
      <div className="flex items-center justify-between p-5 cursor-pointer" onClick={() => setOpen(v => !v)}>
        <div className="flex items-center gap-4 min-w-0">
          <div className="p-2.5 rounded-xl bg-indigo-500/15 text-indigo-400 shrink-0">
            {entry.assignType === 'user' ? <User size={18} /> : <Users size={18} />}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold text-white text-base truncate">{label}</h3>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${badge.cls}`}>
                {badge.icon}{badge.text}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0 ml-2">
          {isAdmin && (
            <>
              <button onClick={e => { e.stopPropagation(); onEdit?.(); }} className="p-2 rounded-lg text-slate-400 hover:text-indigo-300 hover:bg-indigo-500/10 transition-colors" title="Edit"><Pencil size={14} /></button>
              <button onClick={e => { e.stopPropagation(); onDelete?.(); }} className="p-2 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors" title="Delete"><Trash2 size={14} /></button>
            </>
          )}
          {open ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
        </div>
      </div>

      {open && (
        <div className="border-t border-slate-700/60 px-5 pb-5 pt-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            <ShieldCheck size={13} className="text-emerald-400" /> Key Responsibilities
          </p>
          <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-line">
            {entry.responsibilities}
          </p>
          <p className="mt-4 text-[10px] text-slate-600">
            Last updated: {new Date(entry.updatedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
          </p>
        </div>
      )}
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

export const Playbook: React.FC<PlaybookProps> = ({ currentUser, employees }) => {
  const isAdmin = currentUser.role === 'ADMIN' || currentUser.role === 'SUPER_ADMIN';

  const [entries,    setEntries]    = useState<PlaybookEntry[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [search,     setSearch]     = useState('');
  const [editTarget, setEditTarget] = useState<Partial<PlaybookEntry> | null | 'new'>(null);

  const allDesignations = Array.from(
    new Set(employees.filter(e => e.status !== 'Inactive' && e.designation).map(e => e.designation!))
  ).sort();

  const load = useCallback(async () => {
    setLoading(true);
    setEntries(await fetchPlaybook());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (entry: PlaybookEntry) => {
    setSaving(true);
    const updated = editTarget && (editTarget as PlaybookEntry).id
      ? entries.map(e => (e.id === entry.id ? entry : e))
      : [...entries, entry];
    await savePlaybook(updated);
    setEntries(updated);
    setEditTarget(null);
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this playbook entry?')) return;
    const updated = entries.filter(e => e.id !== id);
    await savePlaybook(updated);
    setEntries(updated);
  };

  // Determine what this employee should see
  const myEmp = isAdmin ? null : employees.find(e => e.id === currentUser.employeeId);

  const displayed = entries.filter(entry => {
    if (!isAdmin) {
      // Show entries assigned directly to this user OR to their designation
      const byUser  = entry.assignType === 'user'        && entry.userId      === currentUser.employeeId;
      const byDesig = entry.assignType === 'designation' && entry.designation === (myEmp?.designation ?? myEmp?.department);
      return byUser || byDesig;
    }
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (entry.designation ?? '').toLowerCase().includes(q) ||
      (entry.userName    ?? '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="min-h-screen bg-[#0f1117] p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-400"><BookOpen size={22} /></div>
            <h1 className="text-2xl font-black text-white tracking-tight">Playbook</h1>
          </div>
          <p className="text-sm text-slate-400 ml-12">
            {isAdmin
              ? 'Assign role guides to specific employees or designations.'
              : `Your role guide — responsibilities assigned to you or your designation.`}
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setEditTarget('new')}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm transition-colors shadow-lg shadow-indigo-500/20"
          >
            <Plus size={17} /> Add Entry
          </button>
        )}
      </div>

      {/* Search */}
      {isAdmin && (
        <div className="relative mb-6 max-w-sm">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by employee, designation or role…"
            className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-24 text-slate-400 gap-3">
          <Loader2 size={22} className="animate-spin" /> Loading playbook…
        </div>
      ) : displayed.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="p-5 rounded-2xl bg-slate-800/40 border border-slate-700 mb-4"><BookOpen size={36} className="text-slate-600" /></div>
          <p className="text-slate-400 font-semibold text-lg">
            {isAdmin ? 'No playbook entries yet.' : 'No playbook found for you.'}
          </p>
          <p className="text-slate-600 text-sm mt-1">
            {isAdmin ? 'Click "Add Entry" to create the first one.' : 'Ask your admin to assign one.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {displayed.map(entry => (
            <PlaybookCard
              key={entry.id}
              entry={entry}
              isAdmin={isAdmin}
              onEdit={() => setEditTarget(entry)}
              onDelete={() => handleDelete(entry.id)}
            />
          ))}
        </div>
      )}

      {/* Modal */}
      {editTarget !== null && (
        <EditModal
          initial={editTarget === 'new' ? {} : editTarget}
          employees={employees}
          existingDesignations={allDesignations}
          onSave={handleSave}
          onClose={() => setEditTarget(null)}
        />
      )}

      {saving && (
        <div className="fixed bottom-6 right-6 bg-slate-800 border border-slate-700 rounded-xl px-5 py-3 text-sm text-white flex items-center gap-2 shadow-xl z-50">
          <Loader2 size={16} className="animate-spin text-indigo-400" /> Saving…
        </div>
      )}
    </div>
  );
};
