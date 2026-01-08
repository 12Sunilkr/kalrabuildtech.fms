
import React, { useState } from 'react';
import { Calendar as CalendarIcon, Trash2, Plus, CalendarDays } from 'lucide-react';
import { format } from 'date-fns';
import { Holiday } from '../types';

interface HolidayManagerProps {
  holidays: Holiday[];
  setHolidays: React.Dispatch<React.SetStateAction<Holiday[]>>;
}

export const HolidayManager: React.FC<HolidayManagerProps> = ({ holidays, setHolidays }) => {
  const [newDate, setNewDate] = useState('');
  const [newHolidayName, setNewHolidayName] = useState('');

  const handleAdd = () => {
    (async () => {
      if (!newDate || !newHolidayName) { alert('Please enter both date and holiday name.'); return; }
      try {
        // Persist to server
        const res = await fetch('/api/holidays', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newHolidayName, date: newDate }) });
        if (!res.ok) throw new Error('Server rejected holiday creation');
        // Refresh from server
        const listRes = await fetch('/api/holidays', { credentials: 'include' });
        const wrapper = await listRes.json();
        const data = wrapper && wrapper.data !== undefined ? wrapper.data : wrapper;
        setHolidays(Array.isArray(data) ? data : []);
        setNewDate(''); setNewHolidayName('');
      } catch (e) {
        console.error('Failed to add holiday', e && (e.message || e));
        alert('Failed to add holiday on server');
      }
    })();
  };

  const handleRemove = (idToRemove: string) => {
    (async () => {
      try {
        await fetch(`/api/holidays/${encodeURIComponent(idToRemove)}`, { method: 'DELETE', credentials: 'include' });
      } catch (e) {
        console.error('Failed to remove holiday', e && (e.message || e));
      }
      try {
        const listRes = await fetch('/api/holidays', { credentials: 'include' });
        const wrapper = await listRes.json();
        const data = wrapper && wrapper.data !== undefined ? wrapper.data : wrapper;
        setHolidays(Array.isArray(data) ? data : []);
      } catch (e) { console.error('Failed to refresh holidays', e && (e.message || e)); }
    })();
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
          <h2 className="text-2xl md:text-3xl font-extrabold text-slate-800">Holiday Calendar</h2>
          <p className="text-slate-500 mt-2 font-medium">Manage company holidays and off-days.</p>
        </div>

        <div className="bg-white rounded-3xl shadow-[0_20px_40px_-15px_rgba(0,0,0,0.08)] border border-slate-100 p-6 md:p-8 mb-8">
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Add New Holiday</label>
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
                className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-3 focus:ring-2 focus:ring-green-500 focus:bg-white outline-none transition-all font-bold text-slate-700"
                value={newHolidayName}
                onChange={(e) => setNewHolidayName(e.target.value)}
                />
            </div>
            <button 
              onClick={handleAdd}
              className="bg-green-600 hover:bg-green-700 text-white px-8 py-3 rounded-xl flex items-center justify-center gap-2 font-bold shadow-lg shadow-green-600/30 transition-all active:scale-95"
            >
              <Plus size={20} />
              Add
            </button>
          </div>
        </div>

        <div className="bg-white rounded-3xl shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)] border border-slate-100 overflow-hidden mb-8">
          <div className="p-6 bg-slate-50/50 border-b border-slate-100 font-bold text-slate-700 uppercase text-xs tracking-wider">
            Upcoming Holidays ({holidays.length})
          </div>
          {holidays.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
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
                        <div className="font-bold text-slate-800 text-lg">{h.name}</div>
                        <div className="text-xs text-slate-500 font-medium">{format(dateObj, 'EEEE')} • {format(dateObj, 'yyyy')}</div>
                      </div>
                    </div>
                    <button 
                      onClick={() => handleRemove(h.id)}
                      className="w-10 h-10 rounded-xl bg-white border border-slate-200 text-slate-400 hover:text-red-500 hover:border-red-200 hover:bg-red-50 flex items-center justify-center transition-all md:opacity-0 group-hover:opacity-100 shadow-sm"
                    >
                      <Trash2 size={18} />
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
