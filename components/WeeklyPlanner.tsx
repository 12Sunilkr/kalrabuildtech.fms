import React, { useEffect, useState } from 'react';
import { fetchJSON } from '../src/utils/pmsUtils';
import DailyLogForm from './DailyLogForm';
import { Calendar, BarChart3, ChevronRight, X, Plus, ClipboardList, Trash2, Clock, Search, Bell } from 'lucide-react';

export default function WeeklyPlanner({ projectId, onChange }: { projectId?: number, onChange?: () => void }) {
  const [project, setProject] = useState<any>(null);
  const [dailyLogs, setDailyLogs] = useState<any[]>([]);
  const [showNewDayForm, setShowNewDayForm] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useEffect(() => {
    async function loadProject() {
      if (!projectId) return;
      try {
        const r = await fetchJSON(`/api/pms/projects/${projectId}`);
        const row = (r && r.data) ? r.data : r;
        setProject(row);
      } catch (e) { setProject(null); }
    }
    loadProject();
  }, [projectId]);

  const loadDailyLogs = async () => {
    if (!projectId) return setDailyLogs([]);
    try {
      const r = await fetchJSON(`/api/pms/daily-work?project_id=${projectId}`);
      const rows = Array.isArray(r) ? r : (r && r.data) ? r.data : [];
      setDailyLogs(rows);
    } catch (e) { setDailyLogs([]); }
  };

  useEffect(() => { loadDailyLogs().catch(() => { }); }, [projectId]);

  return (
    <div className="h-full overflow-y-auto bg-white text-slate-900 font-sans custom-scrollbar">
      {/* Top Navigation Bar - Matching Screenshot */}
      <div className="flex flex-col sm:flex-row items-center justify-between px-4 sm:px-6 lg:px-8 py-3 sm:py-4 border-b border-slate-100 bg-white sticky top-0 z-50 gap-3 sm:gap-4">
        <div className="flex items-center gap-2 sm:gap-4">
          <div className="w-9 h-9 sm:w-10 sm:h-10 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-black text-lg sm:text-xl shadow-lg -rotate-3">
            K
          </div>
          <span className="font-black text-xl sm:text-2xl tracking-tight text-slate-800 hidden sm:block">KBT PMS</span>
        </div>

        <div className="flex items-center gap-3 sm:gap-6 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-none">
            <Search className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Search..."
              className="pl-10 sm:pl-12 pr-4 sm:pr-6 py-2 sm:py-2.5 bg-slate-50 border-none rounded-2xl w-full sm:w-60 md:w-80 text-xs sm:text-sm font-medium focus:ring-2 focus:ring-indigo-100 transition-all"
            />
          </div>
          <button className="p-2 sm:p-2.5 rounded-2xl hover:bg-slate-50 relative text-slate-500 transition-colors flex-shrink-0">
            <Bell size={20} />
            <span className="absolute top-1 right-1 w-2 h-2 bg-rose-500 rounded-full border-2 border-white"></span>
          </button>
          <div className="w-9 h-9 sm:w-12 sm:h-12 bg-gradient-to-tr from-indigo-500 to-violet-600 rounded-2xl shadow-lg shadow-indigo-100 flex items-center justify-center text-white font-black text-xs sm:text-sm flex-shrink-0">
            SC
          </div>
        </div>
      </div>

      <div className="w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* Project Header - Refined Style */}
        <div className="flex items-center gap-4 sm:gap-8 mb-12 sm:mb-16 animate-fade-in">
          <button
            onClick={() => { if (onChange) onChange(); }}
            className="p-2.5 sm:p-3 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all active:scale-95 shadow-sm flex-shrink-0"
          >
            <ChevronRight size={20} className="rotate-180 text-slate-600 sm:w-6 sm:h-6" />
          </button>
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-slate-800 tracking-tight uppercase leading-none mb-1 sm:mb-2 truncate">
              {project?.project_name || 'PROJECT'}
            </h1>
            <p className="text-slate-400 font-bold tracking-wide text-xs sm:text-sm uppercase">
              Planner & Daily Log
            </p>
          </div>
        </div>

        {/* Section Heading with Action Button */}
        {/* Main Content Area */}
        {!showNewDayForm ? (
          <>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 sm:mb-8 animate-fade-in">
              <h2 className="text-lg sm:text-2xl font-bold text-slate-800">Daily Records History</h2>
              <button
                onClick={() => { setSelectedDate(new Date().toISOString().split('T')[0]); setShowNewDayForm(true); }}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 sm:px-6 py-2.5 sm:py-3 rounded-2xl shadow-lg shadow-indigo-600/20 active:scale-95 transition-all font-bold flex items-center justify-center gap-2 text-sm w-full sm:w-auto"
              >
                <Plus size={18} />
                New Day Log
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 animate-fade-in-up">
              <div
                onClick={() => { setSelectedDate(new Date().toISOString().split('T')[0]); setShowNewDayForm(true); }}
                className="group h-40 sm:h-56 bg-white border-2 border-dashed border-slate-200 rounded-2xl sm:rounded-3xl flex flex-col items-center justify-center text-center cursor-pointer transition-all hover:border-indigo-300 hover:bg-indigo-50/20 active:scale-95 shadow-sm p-4"
              >
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full border border-slate-200 flex items-center justify-center mb-2 sm:mb-3 group-hover:bg-white group-hover:shadow-md transition-all">
                  <Plus size={24} className="sm:w-7 sm:h-7 text-slate-300 group-hover:text-indigo-600 transition-colors" />
                </div>
                <div className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest group-hover:text-indigo-600 transition-colors">ADD NEW RECORD</div>
              </div>

              {/* Grouped daily logs by unique dates with progress calculation */}
              {(() => {
                const grouped = dailyLogs.reduce((acc: any, log: any) => {
                  const date = log.work_date;
                  if (!acc[date]) {
                    acc[date] = { date, logs: [], totalProgress: 0, count: 0 };
                  }
                  acc[date].logs.push(log);

                  // Extract percentage - try percent_done first, then fallback to details
                  let p = log.percent_done;
                  if (p == null && log.details) {
                    try {
                      let d = typeof log.details === 'string' ? JSON.parse(log.details) : log.details;
                      // Handle potential triple-stringification from old buggy logs
                      if (typeof d === 'string') d = JSON.parse(d);
                      if (typeof d === 'string') d = JSON.parse(d);
                      if (d && d.percent != null) p = d.percent;
                    } catch (e) { }
                  }

                  acc[date].totalProgress += Number(p || 0);
                  acc[date].count += 1;
                  return acc;
                }, {});

                return Object.values(grouped)
                  .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
                  .map((group: any) => {
                    // Average the progress across recorded sessions (capped at 100%)
                    const progress = Math.min(100, Math.round(group.totalProgress / Math.max(1, group.count)));
                    return (
                      <div
                        key={group.date}
                        className="p-4 sm:p-6 bg-white rounded-2xl sm:rounded-3xl shadow-sm border border-slate-100 group transition-all hover:shadow-xl hover:-translate-y-1 relative cursor-pointer"
                        onClick={() => { setSelectedDate(group.date); setShowNewDayForm(true); }}
                      >
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 mb-4 sm:mb-6">
                          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                            <div className="w-9 h-9 sm:w-10 sm:h-10 bg-indigo-50 rounded-lg sm:rounded-xl flex items-center justify-center text-indigo-600 flex-shrink-0">
                              <Calendar size={16} className="sm:w-5 sm:h-5" />
                            </div>
                            <span className="text-sm sm:text-lg font-bold text-slate-800 truncate">
                              {new Date(group.date).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })}
                            </span>
                          </div>
                          <div className="flex flex-row sm:flex-col items-center sm:items-end gap-2 sm:gap-2">
                            <span className="px-2.5 sm:px-3 py-1 rounded-full bg-indigo-50 text-indigo-600 text-[9px] sm:text-[10px] font-black tracking-widest border border-indigo-100 uppercase whitespace-nowrap">
                              {progress || 0}%
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (window.confirm('Delete all records for this date?')) {
                                  fetchJSON(`/api/pms/daily-work?project_id=${projectId}&work_date=${group.date}`, { method: 'DELETE' }).then(() => loadDailyLogs());
                                }
                              }}
                              className="p-1 sm:p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>

                        <div className="space-y-2 mb-4 sm:mb-6">
                          <div className="flex flex-col sm:flex-row justify-between text-[9px] sm:text-[11px] font-bold text-slate-500 uppercase tracking-wider gap-1">
                            <span>TOTAL DAILY PERCENTAGE WORK DONE</span>
                            <span>{progress || 0}%</span>
                          </div>
                          <div className="h-2.5 sm:h-3 bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200/50">
                            <div
                              className="h-full bg-gradient-to-r from-indigo-500 to-violet-600 rounded-full transition-all duration-1000"
                              style={{ width: `${progress || 0}%` }}
                            />
                          </div>
                        </div>

                        <div className="pt-3 sm:pt-4 border-t border-slate-50 flex items-center justify-between group-hover:px-1 transition-all">
                          <span className="text-[9px] sm:text-[10px] font-black text-slate-500 uppercase tracking-widest">OPEN EXCEL FORM</span>
                          <ChevronRight size={14} className="text-slate-300 group-hover:text-indigo-600 group-hover:translate-x-1 transition-all sm:w-4 sm:h-4" />
                        </div>
                      </div>
                    );
                  });
              })()}
            </div>
          </>
        ) : (
          <div className="animate-fade-in-up">
            <DailyLogForm
              projectId={projectId}
              initialDate={selectedDate || undefined}
              onDone={async () => {
                setShowNewDayForm(false);
                setSelectedDate(null);
                await loadDailyLogs();
              }}
              userId={null as any}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// Modal rendering moved outside main return to avoid nesting complexity
