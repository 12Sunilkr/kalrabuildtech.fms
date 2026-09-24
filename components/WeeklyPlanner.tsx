import React, { useEffect, useState } from 'react';
import { fetchJSON } from '../src/utils/pmsUtils';
import DailyLogForm from './DailyLogForm';
import { Calendar, BarChart3, ChevronRight, X, Plus, ClipboardList, Trash2, Clock, Search, Bell, Zap } from 'lucide-react';

export default function WeeklyPlanner({ projectId, onChange }: { projectId?: number, onChange?: () => void }) {
  const [project, setProject] = useState<any>(null);
  const [dailyLogs, setDailyLogs] = useState<any[]>([]);
  const [showNewDayForm, setShowNewDayForm] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchDate, setSearchDate] = useState('');

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

  useEffect(() => {
    loadDailyLogs().catch(() => { });
  }, [projectId]);

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
          <div className="relative flex-1 sm:flex-none flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                placeholder="Search tasks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 sm:pl-12 pr-4 sm:pr-6 py-2 sm:py-2.5 bg-slate-50 border-none rounded-2xl w-full sm:w-48 md:w-64 text-xs sm:text-sm font-medium focus:ring-2 focus:ring-indigo-100 transition-all font-bold"
              />
            </div>
            <input
              type="date"
              value={searchDate}
              onChange={(e) => setSearchDate(e.target.value)}
              className="px-3 py-2 sm:py-2.5 bg-slate-50 border-none rounded-2xl text-xs sm:text-sm font-bold text-slate-600 focus:ring-2 focus:ring-indigo-100 transition-all cursor-pointer"
            />
          </div>
          <button className="btn btn-ghost btn-icon-sm relative" title="Notifications">
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
            className="btn btn-secondary btn-icon flex-shrink-0"
            title="Back"
          >
            <ChevronRight size={20} className="rotate-180" />
          </button>
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-primary tracking-tight leading-none mb-1 sm:mb-2 truncate">
              {project?.project_name || 'Project'}
            </h1>
            <p className="text-muted font-medium text-xs sm:text-sm">
              Daily Work Records
            </p>
          </div>
        </div>

        {/* Main Content Area */}
        {!showNewDayForm ? (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 sm:mb-8 animate-fade-in">
              <h2 className="text-lg sm:text-2xl font-bold text-primary">Daily Records History</h2>
              <button
                onClick={() => { setSelectedDate(new Date().toISOString().split('T')[0]); setShowNewDayForm(true); }}
                className="btn btn-primary w-full sm:w-auto"
              >
                <Plus size={18} />
                New Day Log
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6 sm:gap-8">
              {/* Grouped daily logs by unique dates with progress calculation */}
              {(() => {
                const filteredLogs = dailyLogs.filter(log => {
                  const queryMatches = !searchQuery ||
                    (log.work_done && log.work_done.toLowerCase().includes(searchQuery.toLowerCase())) ||
                    (log.details && JSON.stringify(log.details).toLowerCase().includes(searchQuery.toLowerCase()));

                  const dateMatches = !searchDate || log.work_date === searchDate;

                  return queryMatches && dateMatches;
                });

                const grouped = filteredLogs.reduce((acc: any, log: any) => {
                  const date = log.work_date;
                  if (!acc[date]) {
                    acc[date] = { date, logs: [], count: 0 };
                  }
                  acc[date].logs.push(log);

                  acc[date].count += 1;
                  return acc;
                }, {});

                const groups = Object.values(grouped)
                  .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());

                if (groups.length === 0 && (searchQuery || searchDate)) {
                  return (
                    <div className="col-span-full py-10 text-center bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
                      <p className="text-slate-400 font-medium text-sm">No records match your filters</p>
                    </div>
                  );
                }

                return groups.map((group: any) => {
                  return (
                    <div
                      key={group.date}
                      className="p-4 sm:p-6 bg-white rounded-2xl sm:rounded-3xl shadow-sm border border-slate-100 group transition-all hover:shadow-xl hover:-translate-y-1 relative cursor-pointer flex flex-col justify-between"
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
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (window.confirm('Delete all records for this date?')) {
                                fetchJSON(`/api/pms/daily-work?project_id=${projectId}&work_date=${group.date}`, { method: 'DELETE' }).then(() => loadDailyLogs());
                              }
                            }}
                            className="btn btn-ghost btn-icon-sm text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                            title="Delete Daily Records"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      <div className="pt-3 sm:pt-4 border-t border-slate-50 flex items-center justify-between group-hover:px-1 transition-all mt-auto">
                        <span className="text-xs font-semibold text-slate-500">View daily logs</span>
                        <ChevronRight size={14} className="text-slate-300 group-hover:text-indigo-600 group-hover:translate-x-1 transition-all sm:w-4 sm:h-4" />
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
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
