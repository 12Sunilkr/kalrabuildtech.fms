import React, { useState, useEffect } from 'react';
import { fetchJSON } from '../src/utils/pmsUtils';
import { Calendar, ChevronLeft, ChevronRight, Image as ImageIcon, Camera, CheckCircle, AlertCircle, Info, X, AlertTriangle } from 'lucide-react';

type Row = { what_to_do?: string; planned?: string; actual?: string; percent?: number };

export default function DailyLogForm({ projectId, weeklyTaskId, userId, onDone, initialDate }: { projectId?: number, weeklyTaskId?: number, userId?: number, onDone?: (workId?: string) => void, initialDate?: string }) {
  const [date, setDate] = useState(initialDate || new Date().toISOString().split('T')[0]);
  const [submitting, setSubmitting] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' | 'info' | 'warning' } | null>(null);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const showNotify = (message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info') => {
    setNotification({ message, type });
  };

  const [rows, setRows] = useState<{ first: Row; second: Row }>({
    first: { what_to_do: '', planned: '', actual: '', percent: 0 },
    second: { what_to_do: '', planned: '', actual: '', percent: 0 },
  });
  const [photos, setPhotos] = useState<{ first: File | null; second: File | null }>({ first: null, second: null });
  const [photoUrls, setPhotoUrls] = useState<{ first: string | null; second: string | null }>({ first: null, second: null });

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
        const newPhotoUrls = { first: null as string | null, second: null as string | null };

        data.forEach((log: any) => {
          const detail = log.details ? (typeof log.details === 'string' ? JSON.parse(log.details) : log.details) : {
            planned: log.work_done,
            actual: ''
          };
          if (detail.what_to_do && !detail.planned) detail.planned = detail.what_to_do;

          if (log.session_number === 1) {
            newRows.first = { ...newRows.first, ...detail };
            if (log.photo_path) newPhotoUrls.first = log.photo_path;
          }
          if (log.session_number === 2) {
            newRows.second = { ...newRows.second, ...detail };
            if (log.photo_path) newPhotoUrls.second = log.photo_path;
          }
        });

        setRows(newRows);
        setPhotoUrls(newPhotoUrls);
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

  const handleAutoListKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>, field: keyof Row, sessionKey: 'first' | 'second', currentValue: string = '') => {
    if (e.key === 'Enter') {
      e.preventDefault();
      
      const target = e.target as HTMLTextAreaElement;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      
      const textBefore = currentValue.substring(0, start);
      const textAfter = currentValue.substring(end);
      
      const linesBefore = textBefore.split('\n');
      if (linesBefore.length >= 50) {
         updateCell(sessionKey, field, textBefore + '\n' + textAfter);
         setTimeout(() => { target.selectionStart = target.selectionEnd = start + 1; }, 0);
         return;
      }
      
      const lastLineBefore = linesBefore[linesBefore.length - 1] || '';
      const emptyItemMatch = lastLineBefore.match(/^(\d+)\.\s*$/);
      if (emptyItemMatch) {
        const withoutEmpty = linesBefore.slice(0, -1).join('\n') + (linesBefore.length > 1 ? '\n' : '');
        updateCell(sessionKey, field, withoutEmpty + textAfter);
        setTimeout(() => { target.selectionStart = target.selectionEnd = withoutEmpty.length; }, 0);
        return;
      }
      
      const match = lastLineBefore.match(/^(\d+)\./);
      let nextNum = linesBefore.length + 1;
      if (match) {
        nextNum = parseInt(match[1]) + 1;
      }
      
      const insertion = `\n${nextNum}. `;
      updateCell(sessionKey, field, textBefore + insertion + textAfter);
      
      setTimeout(() => {
        target.selectionStart = target.selectionEnd = start + insertion.length;
      }, 0);
    }
  };

  const handleAutoListChange = (e: React.ChangeEvent<HTMLTextAreaElement>, field: keyof Row, sessionKey: 'first' | 'second', currentValue: string = '') => {
    let val = e.target.value;
    if ((currentValue || '') === '' && val.length === 1) {
      if (val === '1') {
        val = '1. ';
      } else {
        val = `1. ${val}`;
      }
    }
    updateCell(sessionKey, field, val);
  };

  const handlePhotoChange = (sessionKey: 'first' | 'second', file: File | null) => {
    setPhotos(prev => ({ ...prev, [sessionKey]: file }));
  };

  const uploadPhoto = async (logId: string, file: File) => {
    const formData = new FormData();
    formData.append('photo', file);
    formData.append('work_log_id', logId);

    try {
      await fetch('/api/pms/upload-photo', {
        method: 'POST',
        body: formData,
        // Authentication token is usually in cookies, but if it needs headers, add them here
      });
    } catch (e) { console.error('Photo upload failed', e); }
  };

  const submit = async () => {
    if (!date) {
      showNotify('Please select a valid date for your work log.', 'warning');
      return;
    }
    
    // Check if at least one session has some data
    const hasAnyData = sessions.some(s => {
      const r = rows[s.key as 'first' | 'second'];
      const photo = photos[s.key as 'first' | 'second'];
      return r.what_to_do || r.planned || r.actual || r.percent > 0 || photo;
    });

    if (!hasAnyData) {
      showNotify('Please enter some work details or upload a photo before saving.', 'info');
      return;
    }

    setSubmitting(true);
    try {
      const createdIds: string[] = [];
      for (const s of sessions) {
        const r = rows[s.key as 'first' | 'second'];
        const photo = photos[s.key as 'first' | 'second'];
        
        // Skip sessions with no data
        if (!r.what_to_do && !r.planned && !r.actual && !r.percent && !photo) continue;

        const payload: any = {
          project_id: projectId,
          weekly_task_id: weeklyTaskId || null,
          work_date: date,
          session_number: s.number,
          work_done: r.actual || r.planned || r.what_to_do || 'Work log entry',
          percent_done: r.percent || 0,
          details: r
        };

        const res = await fetchJSON('/api/pms/daily-work', { method: 'POST', body: JSON.stringify(payload) });
        const id = res && (res.id || (res.data && res.data.id));
        if (id) {
          createdIds.push(id);
          if (photo) await uploadPhoto(id, photo);
        }
      }

      if (createdIds.length > 0) {
        showNotify('Success! Your daily work logs have been updated.', 'success');
        // Give time for notification to be seen before closing
        setTimeout(() => {
          if (onDone) onDone(createdIds[createdIds.length - 1]);
        }, 1500);
      } else {
        showNotify('No changes were saved. Please ensure you have filled in the work details.', 'warning');
      }
    } catch (err) {
      console.error(err);
      showNotify('Failed to save logs. Please check your connection and try again.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const notebookWrapperBase = "w-full border rounded-xl pt-2 pb-2 px-3 focus-within:shadow-md transition-all shadow-sm";
  const notebookStyle: React.CSSProperties = {
    lineHeight: '1.75rem',
    backgroundImage: 'repeating-linear-gradient(to bottom, transparent, transparent calc(1.75rem - 1px), #e2e8f0 calc(1.75rem - 1px), #e2e8f0 1.75rem)',
    backgroundAttachment: 'local',
    backgroundOrigin: 'content-box',
    minHeight: '10.5rem',
    padding: '0',
  };

  return (
    <div className="bg-white rounded-xl sm:rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden animate-fade-in">
      {/* Header Toolbar */}
      <div className="p-4 sm:p-8 border-b border-slate-50 flex flex-col sm:flex-row gap-4 sm:gap-6">
        <div className="flex items-center gap-3 sm:gap-10">
          <button onClick={() => onDone && onDone()} className="p-2 sm:p-2.5 hover:bg-slate-50 rounded-xl transition-all text-slate-400 hover:text-slate-800 flex-shrink-0">
            <ChevronLeft size={20} className="sm:w-6 sm:h-6" />
          </button>

          <div className="space-y-0.5 sm:space-y-1 min-w-0">
            <p className="text-[9px] sm:text-[10px] font-black text-slate-300 uppercase tracking-widest sm:tracking-[0.2em]">DATE</p>
            <div className="flex items-center gap-2 sm:gap-3">
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="text-lg sm:text-xl font-black text-slate-800 focus:outline-none bg-transparent cursor-pointer"
              />
              <Calendar size={18} className="text-slate-400 flex-shrink-0 sm:w-5 sm:h-5" />
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-end sm:items-center justify-end sm:gap-8 gap-4 flex-1">
          <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => onDone && onDone()}
              className="flex-1 sm:flex-none px-3 sm:px-6 py-2.5 sm:py-3 bg-slate-50 text-slate-600 rounded-lg sm:rounded-2xl font-bold text-xs sm:text-sm hover:bg-slate-100 transition-all"
            >
              Back
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={submitting}
              className="flex-1 sm:flex-none px-4 sm:px-8 py-2.5 sm:py-3 bg-indigo-600 text-white rounded-lg sm:rounded-2xl font-black text-xs sm:text-sm shadow-lg shadow-indigo-600/30 hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50 uppercase tracking-wider"
            >
              {submitting ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>

      {/* Session Cards */}
      <div className="divide-y divide-slate-100">
        {sessions.map((s) => {
          const r = rows[s.key as 'first' | 'second'];
          const hasPhoto = photos[s.key as 'first' | 'second'];
          const hasPhotoUrl = photoUrls[s.key as 'first' | 'second'];
          return (
            <div key={s.key} className="p-4 sm:p-6">
              {/* Session header with time + photo button */}
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-black text-indigo-600 tracking-tight">{s.label}</span>
                <label
                  onClick={() => {
                    if (hasPhotoUrl) window.open(hasPhotoUrl.startsWith('http') ? hasPhotoUrl : `/uploads/${hasPhotoUrl}`, '_blank');
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border cursor-pointer transition-all text-[10px] font-black uppercase tracking-wide ${hasPhoto || hasPhotoUrl ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-slate-50 border-slate-200 text-slate-400 hover:text-indigo-600 hover:border-indigo-200'}`}
                >
                  <input type="file" className="hidden" accept="image/*" onChange={(e) => handlePhotoChange(s.key as any, e.target.files?.[0] || null)} />
                  {hasPhoto ? <Camera size={13} /> : <ImageIcon size={13} />}
                  {hasPhoto ? 'Photo Added' : hasPhotoUrl ? 'View Photo' : 'Add Photo'}
                </label>
              </div>
              {/* Two-column layout */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest mb-1.5">Planned Work</p>
                  <div className={`${notebookWrapperBase} border-blue-100 bg-blue-50/30 focus-within:border-blue-300 focus-within:bg-white`}>
                    <textarea
                      ref={el => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }}
                      onInput={e => { const t = e.target as HTMLTextAreaElement; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }}
                      value={r.planned}
                      style={notebookStyle}
                      onChange={e => handleAutoListChange(e, 'planned', s.key as 'first' | 'second', r.planned)}
                      onKeyDown={e => handleAutoListKeyDown(e, 'planned', s.key as 'first' | 'second', r.planned)}
                      placeholder="Write planned work..."
                      rows={6}
                      className="bg-transparent text-slate-700 font-semibold focus:outline-none w-full placeholder:text-blue-200 text-sm overflow-hidden resize-none"
                    />
                  </div>
                </div>
                <div>
                  <p className="text-[9px] font-black text-emerald-500 uppercase tracking-widest mb-1.5">Actual Work</p>
                  <div className={`${notebookWrapperBase} border-emerald-100 bg-emerald-50/30 focus-within:border-emerald-300 focus-within:bg-white`}>
                    <textarea
                      ref={el => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }}
                      onInput={e => { const t = e.target as HTMLTextAreaElement; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }}
                      value={r.actual}
                      style={notebookStyle}
                      onChange={e => handleAutoListChange(e, 'actual', s.key as 'first' | 'second', r.actual)}
                      onKeyDown={e => handleAutoListKeyDown(e, 'actual', s.key as 'first' | 'second', r.actual)}
                      placeholder="Write actual output..."
                      rows={6}
                      className="bg-transparent text-slate-700 font-semibold focus:outline-none w-full placeholder:text-emerald-200 text-sm overflow-hidden resize-none"
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modern Notification Toast */}
      {notification && (
        <div className="fixed bottom-6 right-6 left-6 sm:left-auto sm:w-96 z-[100] animate-fade-in-up">
          <div className={`p-4 rounded-2xl shadow-2xl border backdrop-blur-md flex items-start gap-3 ${
            notification.type === 'success' ? 'bg-emerald-50/90 border-emerald-100 text-emerald-900 shadow-emerald-100/50' :
            notification.type === 'error' ? 'bg-rose-50/90 border-rose-100 text-rose-900 shadow-rose-100/50' :
            notification.type === 'warning' ? 'bg-amber-50/90 border-amber-100 text-amber-900 shadow-amber-100/50' :
            'bg-indigo-50/90 border-indigo-100 text-indigo-900 shadow-indigo-100/50'
          }`}>
            <div className={`p-2 rounded-xl shrink-0 ${
              notification.type === 'success' ? 'bg-emerald-100 text-emerald-600' :
              notification.type === 'error' ? 'bg-rose-100 text-rose-600' :
              notification.type === 'warning' ? 'bg-amber-100 text-amber-600' :
              'bg-indigo-100 text-indigo-600'
            }`}>
              {notification.type === 'success' && <CheckCircle size={18} />}
              {notification.type === 'error' && <AlertCircle size={18} />}
              {notification.type === 'warning' && <AlertTriangle size={18} />}
              {notification.type === 'info' && <Info size={18} />}
            </div>
            <div className="flex-1 pt-1">
              <p className="text-sm font-bold leading-tight">{notification.message}</p>
            </div>
            <button 
              onClick={() => setNotification(null)}
              className="p-1 hover:bg-black/5 rounded-lg transition-colors shrink-0"
            >
              <X size={16} className="opacity-40" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
