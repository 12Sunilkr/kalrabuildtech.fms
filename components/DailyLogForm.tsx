import React, { useState, useEffect } from 'react';
import { fetchJSON } from '../src/utils/pmsUtils';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';

type Row = { what_to_do?: string; planned?: string; actual?: string; percent?: number };

export default function DailyLogForm({ projectId, weeklyTaskId, userId, onDone, initialDate }: { projectId?: number, weeklyTaskId?: number, userId?: number, onDone?: (workId?: string) => void, initialDate?: string }) {
  const [date, setDate] = useState(initialDate || new Date().toISOString().split('T')[0]);
  const [submitting, setSubmitting] = useState(false);

  const [rows, setRows] = useState<{ first: Row; second: Row }>({
    first: { what_to_do: '', planned: '', actual: '', percent: 0 },
    second: { what_to_do: '', planned: '', actual: '', percent: 0 },
  });

  const sessions = [
    { key: 'first', label: '9:30 - 1:30', number: 1 },
    { key: 'second', label: '1:30 - 6:00', number: 2 }
  ];

  useEffect(() => {
    async function loadExisting() {
      if (!projectId || !date) return;
      try {
        const r = await fetchJSON(`/api/pms/daily-work?project_id=${projectId}&work_date=${date}`);
        const data = Array.isArray(r) ? r : (r && r.data) ? r.data : [];

        const newRows = {
          first: { what_to_do: '', planned: '', actual: '', percent: 0 },
          second: { what_to_do: '', planned: '', actual: '', percent: 0 },
        };

        data.forEach((log: any) => {
          const detail = log.details ? JSON.parse(log.details) : {
            what_to_do: log.work_done,
            percent: log.percent_done
          };
          if (log.session_number === 1) newRows.first = { ...newRows.first, ...detail };
          if (log.session_number === 2) newRows.second = { ...newRows.second, ...detail };
        });

        setRows(newRows);
      } catch (e) { console.warn('Failed to load existing logs', e); }
    }
    loadExisting();
  }, [projectId, date]);

  const updateCell = (sessionKey: 'first' | 'second', field: keyof Row, value: any) => {
    setRows(prev => ({
      ...prev,
      [sessionKey]: { ...prev[sessionKey], [field]: value }
    }));
  };

  const calculateTotal = () => {
    return Math.round(((rows.first.percent || 0) + (rows.second.percent || 0)) / 2);
  };

  const submit = async () => {
    if (!date) { alert('Please select a date'); return; }
    setSubmitting(true);
    try {
      const createdIds: string[] = [];
      for (const s of sessions) {
        const r = rows[s.key as 'first' | 'second'];
        if (!r.what_to_do && !r.planned && !r.actual) continue;

        const payload: any = {
          project_id: projectId,
          weekly_task_id: weeklyTaskId || null,
          work_date: date,
          session_number: s.number,
          work_done: r.actual || r.planned || r.what_to_do,
          work_left: '',
          percent_done: r.percent || 0,
          details: JSON.stringify(r)
        };

        // If you had an ID for existing records, you could do a PUT here. 
        // For simplicity with this current API, we'll POST (which might create duplicates if not handled by server, but usually it's Upsert)
        const res = await fetchJSON('/api/pms/daily-work', { method: 'POST', body: JSON.stringify(payload) });
        const id = res && (res.id || (res.data && res.data.id));
        if (id) createdIds.push(id);
      }
      if (onDone) onDone(createdIds.length ? createdIds[createdIds.length - 1] : undefined);
    } catch (err) {
      console.error(err);
      alert('Submit failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden animate-fade-in">
      {/* Header Toolbar */}
      <div className="p-8 border-b border-slate-50 flex flex-wrap items-center justify-between gap-6">
        <div className="flex items-center gap-10">
          <button onClick={() => onDone && onDone()} className="p-2.5 hover:bg-slate-50 rounded-xl transition-all text-slate-400 hover:text-slate-800">
            <ChevronLeft size={24} />
          </button>

          <div className="space-y-1">
            <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em]">DATE</p>
            <div className="flex items-center gap-3">
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="text-xl font-black text-slate-800 focus:outline-none bg-transparent cursor-pointer"
              />
              <Calendar size={20} className="text-slate-400" />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-8">
          <div className="text-right">
            <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em]">DAILY PROGRESS</p>
            <p className="text-3xl font-black text-indigo-600 leading-none mt-1">{calculateTotal()}%</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onDone && onDone()}
              className="px-6 py-3 bg-slate-50 text-slate-600 rounded-2xl font-bold text-sm hover:bg-slate-100 transition-all"
            >
              Back to History
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={submitting}
              className="px-8 py-3 bg-indigo-600 text-white rounded-2xl font-black text-sm shadow-xl shadow-indigo-600/30 hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50 uppercase tracking-wider"
            >
              {submitting ? 'Saving...' : 'Save & Close'}
            </button>
          </div>
        </div>
      </div>

      {/* Table Content */}
      <div className="overflow-x-auto custom-scrollbar">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50/50 border-b border-slate-100">
              <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest bg-white">TIME SLOT</th>
              <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest bg-white text-center">WHAT TO DO</th>
              <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest bg-white text-center text-slate-300">PLANNED WORK</th>
              <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest bg-white text-center text-slate-300">ACTUAL WORK DONE</th>
              <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest bg-white text-center">WORK %</th>
              <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest bg-white text-right">ACTION</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s, idx) => {
              const r = rows[s.key as 'first' | 'second'];
              return (
                <tr key={s.key} className="border-b border-slate-50 hover:bg-slate-50/30 transition-colors group">
                  <td className="px-8 py-10">
                    <span className="text-lg font-black text-indigo-600 tracking-tight">{s.label}</span>
                  </td>
                  <td className="px-8 py-10 text-center">
                    <input
                      value={r.what_to_do}
                      onChange={e => updateCell(s.key as any, 'what_to_do', e.target.value)}
                      placeholder="Add task details"
                      className="bg-transparent text-slate-600 font-bold focus:outline-none w-full text-center placeholder:text-slate-200"
                    />
                  </td>
                  <td className="px-8 py-10 text-center">
                    <input
                      value={r.planned}
                      onChange={e => updateCell(s.key as any, 'planned', e.target.value)}
                      placeholder="No entry"
                      className="bg-transparent text-slate-400 italic font-medium focus:outline-none w-full text-center placeholder:text-slate-200"
                    />
                  </td>
                  <td className="px-8 py-10 text-center">
                    <input
                      value={r.actual}
                      onChange={e => updateCell(s.key as any, 'actual', e.target.value)}
                      placeholder="No entry"
                      className="bg-transparent text-slate-400 italic font-medium focus:outline-none w-full text-center placeholder:text-slate-200"
                    />
                  </td>
                  <td className="px-8 py-10 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <input
                        type="number"
                        value={r.percent}
                        onChange={e => updateCell(s.key as any, 'percent', parseInt(e.target.value) || 0)}
                        className="w-16 bg-transparent text-2xl font-black text-indigo-600 text-center focus:outline-none"
                      />
                      <span className="text-xl font-black text-indigo-600">%</span>
                    </div>
                  </td>
                  <td className="px-8 py-10 text-right">
                    <button className="px-6 py-2 bg-white border border-slate-200 rounded-xl text-xs font-black text-slate-800 shadow-sm hover:shadow-md transition-all active:scale-95 uppercase tracking-widest">
                      EDIT
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer Summary */}
      <div className="p-8 bg-slate-50/50 flex items-center justify-center gap-10">
        <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">TOTAL DAILY PERCENTAGE WORK DONE</p>
        <p className="text-4xl font-black text-indigo-600 tracking-tighter">{calculateTotal()}%</p>
      </div>
    </div>
  );
}
