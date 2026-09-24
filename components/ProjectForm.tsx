import React, { useEffect, useState } from 'react';
import { fetchJSON } from '../src/utils/pmsUtils';
import { 
  Building2, MapPin, User, Calendar, DollarSign, 
  FileSpreadsheet, ShieldCheck, Check, X, AlertCircle, 
  Sparkles, Save, ChevronDown, HardHat
} from 'lucide-react';

interface ProjectFormProps {
  initialProject?: any;
  onDone?: () => void;
  onCancel?: () => void;
}

export default function ProjectForm({ initialProject, onDone, onCancel }: ProjectFormProps) {
  const [form, setForm] = useState({
    project_name: initialProject?.project_name || '',
    location: initialProject?.location || '',
    assigned_employee_id: initialProject?.assigned_employee_id || '',
    start_date: initialProject?.start_date || new Date().toISOString().split('T')[0],
    end_date: initialProject?.end_date || '',
    total_cost: initialProject?.total_cost ? String(initialProject.total_cost) : '',
    google_sheet_link: initialProject?.google_sheet_link || '',
    status: initialProject?.status || 'Active'
  });

  const [employees, setEmployees] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetchJSON('/api/employees');
        const list = Array.isArray(res) ? res : (res && res.data) ? res.data : [];
        if (mounted) setEmployees(list);
      } catch (e) {
        console.warn('Failed to load employees', e);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.project_name.trim()) {
      setError('Please provide a project name.');
      return;
    }
    if (!form.start_date) {
      setError('Please select a start date.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const payload = {
        project_name: form.project_name.trim(),
        assigned_employee_id: form.assigned_employee_id || null,
        location: form.location.trim() || null,
        start_date: form.start_date,
        end_date: form.end_date || null,
        total_cost: form.total_cost ? parseFloat(form.total_cost) : 0,
        google_sheet_link: form.google_sheet_link.trim() || null,
        status: form.status
      };

      if (initialProject?.id) {
        await fetchJSON(`/api/pms/projects/${initialProject.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
      } else {
        await fetchJSON('/api/pms/projects', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
      }

      onDone && onDone();
    } catch (err: any) {
      console.error('Failed to save project:', err);
      setError(err?.message || 'Failed to save project. Please verify inputs and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedEmp = employees.find(e => e.id === form.assigned_employee_id || String(e.id) === form.assigned_employee_id);

  return (
    <form onSubmit={submit} className="space-y-6">
      {/* Header Banner inside modal */}
      <div className="flex items-center gap-4 pb-4 border-b border-slate-100">
        <div className="w-12 h-12 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-500/20 shrink-0">
          <HardHat size={22} />
        </div>
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
            {initialProject ? 'Edit Project Specifications' : 'Initiate New Site Project'}
          </h2>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Configure site parameters, supervisor assignment, timeline & budgets
          </p>
        </div>
      </div>

      {error && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl flex items-center gap-3 text-rose-700 text-xs font-semibold animate-in fade-in duration-200">
          <AlertCircle size={18} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Form Fields Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto px-1 custom-scrollbar">
        {/* Project Name */}
        <div className="sm:col-span-2 space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-2">
            <Building2 size={14} className="text-blue-600" /> Project / Site Title <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            required
            placeholder="e.g. Sector 54 Luxury Villa Phase-2, Tower A"
            className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all placeholder:text-slate-400"
            value={form.project_name}
            onChange={e => setForm({ ...form, project_name: e.target.value })}
          />
        </div>

        {/* Site Location */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-2">
            <MapPin size={14} className="text-emerald-600" /> Site Location
          </label>
          <input
            type="text"
            placeholder="e.g. Golf Course Road, Gurugram"
            className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-semibold text-slate-800 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all placeholder:text-slate-400"
            value={form.location}
            onChange={e => setForm({ ...form, location: e.target.value })}
          />
        </div>

        {/* Status */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-2">
            <ShieldCheck size={14} className="text-indigo-600" /> Project Status
          </label>
          <select
            value={form.status}
            onChange={e => setForm({ ...form, status: e.target.value })}
            className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all cursor-pointer"
          >
            <option value="Active">🚀 Active / In Progress</option>
            <option value="On Hold">⏸️ On Hold</option>
            <option value="Completed">✅ Completed / Handed Over</option>
            <option value="Planning">📐 Planning Phase</option>
          </select>
        </div>

        {/* Assign Team Member */}
        <div className="sm:col-span-2 space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-2">
            <User size={14} className="text-violet-600" /> Lead Site Engineer / Supervisor
          </label>
          <div className="relative">
            <select
              value={form.assigned_employee_id}
              onChange={e => setForm({ ...form, assigned_employee_id: e.target.value })}
              className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all cursor-pointer"
            >
              <option value="">-- Unassigned / Central Team --</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>
                  {emp.name} ({emp.id}) — {emp.designation || emp.department || 'Staff'}
                </option>
              ))}
            </select>
          </div>
          {selectedEmp && (
            <div className="mt-2 p-2.5 bg-blue-50/70 border border-blue-100 rounded-xl flex items-center gap-3">
              <div className="w-7 h-7 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">
                {selectedEmp.name.charAt(0)}
              </div>
              <div className="text-xs">
                <span className="font-bold text-blue-900">{selectedEmp.name}</span>
                <span className="text-blue-600 ml-2 font-mono">({selectedEmp.id})</span>
                <span className="text-slate-500 ml-2">· {selectedEmp.department || 'Operations'}</span>
              </div>
            </div>
          )}
        </div>

        {/* Start Date */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-2">
            <Calendar size={14} className="text-blue-600" /> Commencement Date <span className="text-rose-500">*</span>
          </label>
          <input
            type="date"
            required
            value={form.start_date}
            onChange={e => setForm({ ...form, start_date: e.target.value })}
            className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all cursor-pointer"
          />
        </div>

        {/* Expected End Date */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-2">
            <Calendar size={14} className="text-amber-600" /> Target Completion Date
          </label>
          <input
            type="date"
            value={form.end_date}
            onChange={e => setForm({ ...form, end_date: e.target.value })}
            className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all cursor-pointer"
          />
        </div>

        {/* Estimated Budget / Cost */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-2">
            <DollarSign size={14} className="text-emerald-600" /> Estimated Budget (₹)
          </label>
          <input
            type="number"
            placeholder="e.g. 2500000"
            value={form.total_cost}
            onChange={e => setForm({ ...form, total_cost: e.target.value })}
            className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all placeholder:text-slate-400"
          />
        </div>

        {/* Google Sheet / Drive Link */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-2">
            <FileSpreadsheet size={14} className="text-teal-600" /> Live Spreadsheet / Drive URL
          </label>
          <input
            type="url"
            placeholder="https://docs.google.com/spreadsheets/..."
            value={form.google_sheet_link}
            onChange={e => setForm({ ...form, google_sheet_link: e.target.value })}
            className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium text-slate-800 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all placeholder:text-slate-400"
          />
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="px-5 py-3 rounded-2xl text-sm font-bold text-slate-600 hover:bg-slate-100 transition-colors"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="px-7 py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-2xl text-sm font-extrabold flex items-center gap-2 shadow-lg shadow-blue-500/25 active:scale-95 transition-all disabled:opacity-60"
        >
          {submitting ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              <span>Processing...</span>
            </>
          ) : (
            <>
              <Save size={16} />
              <span>{initialProject ? 'Save Specifications' : 'Launch Project'}</span>
            </>
          )}
        </button>
      </div>
    </form>
  );
}
