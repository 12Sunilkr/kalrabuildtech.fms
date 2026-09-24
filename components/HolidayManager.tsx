
import React, { useState } from 'react';
import { Calendar as CalendarIcon, Trash2, Plus, CalendarDays } from 'lucide-react';
import { format } from 'date-fns';
import { Holiday } from '../types';
import api, { safeGet, extractPayload, ensureArray, invalidateCache } from '../src/utils/api';

interface HolidayManagerProps {
  holidays: Holiday[];
  setHolidays: React.Dispatch<React.SetStateAction<Holiday[]>>;
}

export const HolidayManager: React.FC<HolidayManagerProps> = ({ holidays, setHolidays }) => {
  const [newDate, setNewDate] = useState('');
  const [newHolidayName, setNewHolidayName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAdd = async () => {
    if (!newDate || !newHolidayName) { 
      alert('Please enter both date and holiday name.'); 
      return; 
    }
    setIsSubmitting(true);
    try {
      // Optimistic update
      const tempId = `temp-${Date.now()}`;
      const newHol: Holiday = { id: tempId, name: newHolidayName.trim(), date: newDate };
      setHolidays(prev => [...prev.filter(h => h.date !== newDate), newHol].sort((a, b) => a.date.localeCompare(b.date)));

      // Persist to server
      await api.post('/holidays', { name: newHolidayName.trim(), date: newDate });
      invalidateCache('/holidays');

      // Refresh latest from server
      const listRes = await safeGet('/holidays', { cacheBust: true });
      const data = extractPayload(listRes);
      setHolidays(ensureArray(data));
      setNewDate(''); 
      setNewHolidayName('');
    } catch (e: any) {
      console.error('Failed to add holiday', e && (e.message || e));
      alert('Failed to add holiday on server');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemove = async (idToRemove: string) => {
    try {
      // Optimistic removal
      setHolidays(prev => prev.filter(h => h.id !== idToRemove));
      await api.delete(`/holidays/${encodeURIComponent(idToRemove)}`);
      invalidateCache('/holidays');

      const listRes = await safeGet('/holidays', { cacheBust: true });
      const data = extractPayload(listRes);
      setHolidays(ensureArray(data));
    } catch (e: any) {
      console.error('Failed to remove holiday', e && (e.message || e));
    }
  };

  const parseDate = (dateStr: string) => {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
  };

  return (
    <div className="p-4 md:p-8 bg-slate-50/50 h-full overflow-y-auto custom-scrollbar">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8 md:mb-10 text-center">
           <div className="w-16 h-16 bg-green-100 text-green-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-green-500/20 transform rotate-3">
            <CalendarDays size={32} />
          </div>
          <h2 className="text-2xl md:text-3xl font-extrabold text-primary">Holiday Calendar</h2>
          <p className="text-secondary mt-2 font-medium">Manage company holidays and off-days.</p>
        </div>

        <div className="bg-white rounded-3xl shadow-[0_20px_40px_-15px_rgba(0,0,0,0.08)] border border-slate-100 p-6 md:p-8 mb-8">
          <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-3">Add New Holiday</label>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
                <input 
                type="date" 
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 focus:ring-2 focus:ring-green-500 focus:bg-white outline-none transition-all"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                />
            </div>
            <div className="flex-[2]">
                <input 
                type="text" 
                placeholder="Holiday Name (e.g. Diwali, Christmas)"
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 focus:ring-2 focus:ring-green-500 focus:bg-white outline-none transition-all font-bold text-primary"
                value={newHolidayName}
                onChange={(e) => setNewHolidayName(e.target.value)}
                />
            </div>
            <button 
              onClick={handleAdd}
              className="btn btn-primary px-8"
            >
              <Plus size={18} />
              Add Holiday
            </button>
          </div>
        </div>

        <div className="bg-white rounded-3xl shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)] border border-slate-100 overflow-hidden mb-8">
          <div className="p-6 bg-slate-50/50 border-b border-slate-100 font-bold text-primary uppercase text-xs tracking-wider">
            Upcoming Holidays ({holidays.length})
          </div>
          {holidays.length === 0 ? (
            <div className="p-12 text-center text-muted">
              No holidays added yet.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {holidays.map(h => {
                const dateObj = parseDate(h.date);
                return (
                  <div key={h.id} className="p-5 flex items-center justify-between hover:bg-slate-50 transition-colors group">
                    <div className="flex items-center gap-4 md:gap-5">
                      <div className="w-14 h-14 rounded-2xl bg-green-50 text-green-600 border border-green-100 flex flex-col items-center justify-center shadow-sm shrink-0">
                        <span className="text-xl font-black leading-none">{format(dateObj, 'd')}</span>
                        <span className="text-[10px] font-bold uppercase">{format(dateObj, 'MMM')}</span>
                      </div>
                      <div>
                        <div className="font-bold text-primary text-lg">{h.name}</div>
                        <div className="text-xs text-secondary font-medium">{format(dateObj, 'EEEE')} • {format(dateObj, 'yyyy')}</div>
                      </div>
                    </div>
                    <button 
                      onClick={() => handleRemove(h.id)}
                      className="btn btn-secondary btn-icon-sm text-muted hover:text-state-danger hover:border-rose-200 md:opacity-0 group-hover:opacity-100"
                      title="Delete Holiday"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
