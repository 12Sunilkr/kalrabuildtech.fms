import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2, X, Save, BookOpen, ShieldCheck, Search, ChevronDown, ChevronRight, Loader2, User, Users, Printer } from 'lucide-react';
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
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-100 text-indigo-600"><BookOpen size={18} /></div>
            <h2 className="text-base font-bold text-slate-800">{initial?.id ? 'Edit Playbook Entry' : 'New Playbook Entry'}</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors"><X size={17} /></button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto custom-scrollbar">

          {/* Assign type toggle */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Assign To *</label>
            <div className="flex gap-2">
              <button
                onClick={() => setAssignType('designation')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-colors ${assignType === 'designation' ? 'bg-indigo-600 border-indigo-500 text-white shadow-sm' : 'bg-white border-slate-300 text-slate-600 hover:border-slate-400'}`}
              >
                <Users size={15} /> Designation
              </button>
              <button
                onClick={() => setAssignType('user')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-colors ${assignType === 'user' ? 'bg-indigo-600 border-indigo-500 text-white shadow-sm' : 'bg-white border-slate-300 text-slate-600 hover:border-slate-400'}`}
              >
                <User size={15} /> Specific Employee
              </button>
            </div>
          </div>

          {/* Designation picker */}
          {assignType === 'designation' && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Designation *</label>
              <input
                list="desig-list"
                value={designation}
                onChange={e => setDesignation(e.target.value)}
                placeholder="e.g. Facilities Manager"
                className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 text-sm"
              />
              <datalist id="desig-list">
                {existingDesignations.map(d => <option key={d} value={d} />)}
              </datalist>
            </div>
          )}

          {/* Employee picker */}
          {assignType === 'user' && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Select Employee *</label>
              {selectedEmp && (
                <div className="flex items-center gap-3 mb-2 px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-xl">
                  <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                    {selectedEmp.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{selectedEmp.name}</p>
                    <p className="text-xs text-indigo-600">{selectedEmp.designation ?? selectedEmp.department}</p>
                  </div>
                  <button onClick={() => setUserId('')} className="ml-auto text-slate-400 hover:text-slate-700"><X size={14} /></button>
                </div>
              )}
              <div className="relative mb-2">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={empSearch}
                  onChange={e => setEmpSearch(e.target.value)}
                  placeholder="Search employee…"
                  className="w-full bg-white border border-slate-300 rounded-xl pl-9 pr-4 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
              <div className="max-h-40 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100">
                {filteredEmps.slice(0, 20).map(emp => (
                  <button
                    key={emp.id}
                    onClick={() => { setUserId(emp.id); setEmpSearch(''); }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50 transition-colors ${userId === emp.id ? 'bg-indigo-50' : ''}`}
                  >
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${userId === emp.id ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                      {emp.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm text-slate-800 font-medium">{emp.name}</p>
                      <p className="text-xs text-slate-500">{emp.designation ?? emp.department ?? '—'}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Responsibilities — paragraph */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Key Responsibilities *</label>
            <p className="text-xs text-slate-500 mb-2">Write as a paragraph or bullet points. Press Enter for new lines.</p>
            <textarea
              value={responsibilities}
              onChange={e => setResp(e.target.value)}
              placeholder="Describe the key responsibilities, duties, and expectations for this role..."
              rows={6}
              className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 text-sm leading-relaxed resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
          <button onClick={onClose} className="px-5 py-2 rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-100 text-sm font-medium transition-colors bg-white">Cancel</button>
          <button
            onClick={handleSave}
            disabled={!responsibilities.trim() || (assignType === 'user' ? !userId : !designation.trim())}
            className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold flex items-center gap-2 transition-colors shadow-sm"
          >
            <Save size={15} /> Save Playbook
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Playbook Card ────────────────────────────────────────────────────────────

const PALETTE = [
  { bg: 'bg-red-500' },
  { bg: 'bg-purple-500' },
  { bg: 'bg-blue-500' },
  { bg: 'bg-emerald-600' },
  { bg: 'bg-amber-500' },
  { bg: 'bg-rose-600' },
  { bg: 'bg-teal-500' },
  { bg: 'bg-indigo-500' },
];

function getAbbreviation(text: string) {
  if (!text) return '';
  const words = text.trim().split(/\s+/);
  if (words.length === 1) {
    return text.substring(0, 2).toUpperCase();
  }
  return words.map(w => w[0]).join('').substring(0, 3).toUpperCase();
}

const parseResponsibilities = (text: string) => {
  return text.split('\n')
    .map(s => s.trim())
    .map(s => s.replace(/^[-•*]\s*/, ''))
    .filter(Boolean);
};

const RolePlaybookCard: React.FC<{
  entry: PlaybookEntry;
  isAdmin: boolean;
  index: number;
  onEdit?: () => void;
  onDelete?: () => void;
  onPrint?: () => void;
}> = ({ entry, isAdmin, index, onEdit, onDelete, onPrint }) => {
  const isUser = entry.assignType === 'user';
  const label = isUser ? (entry.userName ?? 'Employee') : (entry.designation ?? 'Designation');
  const subtitle = entry.designation || (isUser ? 'Individual Assignment' : 'Standard Role');
  
  const abbrev = isUser ? (entry.userName ? entry.userName.charAt(0).toUpperCase() : 'U') : getAbbreviation(label);

  const color = PALETTE[index % PALETTE.length];
  const respList = parseResponsibilities(entry.responsibilities);

  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow-lg border border-slate-200 flex flex-col h-full hover:border-slate-300 hover:shadow-xl transition-all duration-200 group">
       {/* Header */}
       <div className={`${color.bg} px-5 py-4 flex items-center justify-between`}>
          <div className="flex items-center gap-3.5 min-w-0">
             <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-lg shrink-0 shadow-inner backdrop-blur-sm">
                {abbrev}
             </div>
             <div className="min-w-0">
                <h3 className="text-white font-bold text-lg leading-tight truncate flex items-center gap-2">
                  {label}
                  {isUser && <span className="px-2 py-0.5 rounded-full bg-white/20 text-[10px] font-bold uppercase tracking-wider">User</span>}
                </h3>
                <p className="text-white/90 text-xs font-medium truncate mt-0.5">{subtitle}</p>
             </div>
          </div>
          <div className="flex gap-2 shrink-0 ml-3 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={e => { e.stopPropagation(); (onPrint ?? (() => {}))(); }} className="w-8 h-8 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors backdrop-blur-sm" title="Print"><Printer size={14} /></button>
            {isAdmin && (
              <>
                <button onClick={e => { e.stopPropagation(); onEdit?.(); }} className="w-8 h-8 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors backdrop-blur-sm" title="Edit"><Pencil size={14}/></button>
                <button onClick={e => { e.stopPropagation(); onDelete?.(); }} className="w-8 h-8 rounded-xl bg-white/20 hover:bg-red-500/80 flex items-center justify-center text-white transition-colors backdrop-blur-sm" title="Delete"><Trash2 size={14}/></button>
              </>
            )}
          </div>
       </div>

       {/* Body */}
       <div className="p-4 flex flex-col gap-2.5 flex-1 bg-slate-50">
          {respList.length === 0 ? (
             <div className="text-slate-400 text-sm italic py-4 text-center">No specific responsibilities listed.</div>
          ) : (
            respList.map((resp, i) => (
              <div key={i} className="bg-white border border-slate-200 rounded-xl p-3.5 flex gap-3.5 items-start shadow-sm hover:border-slate-300 transition-colors group/item">
                 <div className={`w-2 h-2 rounded-full mt-2 shrink-0 shadow-sm ${color.bg}`} />
                 <p className="text-slate-700 text-sm leading-relaxed">{resp}</p>
              </div>
            ))
          )}
          <div className="mt-auto pt-4 flex justify-end">
            <p className="text-[10px] text-slate-400">
              Last updated: {new Date(entry.updatedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
            </p>
          </div>
       </div>
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

  const escapeHtml = (str: string) => {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  const handlePrint = (entry: PlaybookEntry) => {
    const title = entry.assignType === 'user' ? (entry.userName ?? 'Employee') : (entry.designation ?? 'Designation');
    const respList = parseResponsibilities(entry.responsibilities);
    const updated = new Date(entry.updatedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)} - Playbook</title><style>
      @page { size: A4; margin: 20mm }
      html,body{height:100%;margin:0;padding:0}
      body{font-family: Inter, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial; color:#111; padding:0; background:#fff}
      .wrap{box-sizing:border-box;padding:20mm}
      .card{width:100%;max-width:170mm;margin:0 auto;border:0;padding:0}
      h1{margin:0 0 6px 0;font-size:16pt}
      .muted{color:#6b7280;margin-bottom:12px;font-size:10pt}
      ul{margin:8px 0 0 18px;padding:0;font-size:11pt}
      li{margin-bottom:8px;line-height:1.35;word-break:break-word}
      p, li{orphans:3;widows:3}
      hr{border:none;border-top:1px solid #ececec;margin:12px 0}
      .small{font-size:9pt;color:#6b7280}
      </style></head><body><div class="wrap"><div class="card"><h1>${escapeHtml(title)}</h1><div class="muted">${escapeHtml(entry.assignType === 'user' ? 'Specific Employee' : 'Designation')}</div><hr/>` +
      (respList.length ? `<ul>${respList.map(r => `<li>${escapeHtml(r)}</li>`).join('')}</ul>` : `<p class="muted">No specific responsibilities listed.</p>`) +
      `<hr/><p class="small">Last updated: ${escapeHtml(updated)}</p></div></div></body></html>`;

    // Open window synchronously to avoid popup blockers
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    // Give the new window a short moment to render before printing
    setTimeout(() => { try { w.print(); } catch { /* ignore */ } }, 500);
  };

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
    <div className="min-h-screen p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2.5 rounded-xl bg-indigo-100 text-indigo-600"><BookOpen size={22} /></div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Playbook</h1>
          </div>
          <p className="text-sm text-slate-500 ml-12">
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
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by employee, designation or role…"
            className="w-full bg-white border border-slate-300 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 shadow-sm"
          />
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-24 text-slate-500 gap-3">
          <Loader2 size={22} className="animate-spin" /> Loading playbook…
        </div>
      ) : displayed.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm mb-4"><BookOpen size={36} className="text-slate-300" /></div>
          <p className="text-slate-800 font-semibold text-lg">
            {isAdmin ? 'No playbook entries yet.' : 'No playbook found for you.'}
          </p>
          <p className="text-slate-500 text-sm mt-1">
            {isAdmin ? 'Click "Add Entry" to create the first one.' : 'Ask your admin to assign one.'}
          </p>
        </div>
      ) : (
        <div className={`grid gap-6 ${(!isAdmin && displayed.length === 1) ? 'grid-cols-1 w-full' : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'}`}>
          {displayed.map((entry, idx) => (
            <RolePlaybookCard
              key={entry.id}
              entry={entry}
              isAdmin={isAdmin}
              index={idx}
              onEdit={() => setEditTarget(entry)}
              onDelete={() => handleDelete(entry.id)}
              onPrint={() => handlePrint(entry)}
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
        <div className="fixed bottom-6 right-6 bg-white border border-slate-200 rounded-xl px-5 py-3 text-sm text-slate-800 flex items-center gap-2 shadow-xl z-50">
          <Loader2 size={16} className="animate-spin text-indigo-500" /> Saving…
        </div>
      )}
    </div>
  );
};
