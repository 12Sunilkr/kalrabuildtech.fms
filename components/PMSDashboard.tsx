import React, { useEffect, useState } from 'react';
import { getProjectSummary, fetchJSON } from '../src/utils/pmsUtils';
import ProjectForm from './ProjectForm';
import WeeklyPlanner from './WeeklyPlanner';
import DailyLogForm from './DailyLogForm';
import PMSChartsView from './PMSChartsView';
import { 
  BarChart3, BarChart2, Calendar, CheckCircle, Zap, 
  ClipboardList, Plus, RefreshCw, ChevronRight, Trash2, 
  Search, HardHat, TrendingUp, Target, Activity, X
} from 'lucide-react';

// Modernized Dashboard Statistic Card
const StatCard = ({ title, value, icon: Icon, color, delay }: any) => (
  <div 
    style={{ animationDelay: delay }}
    className="relative overflow-hidden bg-white p-7 rounded-[2rem] shadow-[0_20px_50px_-15px_rgba(0,0,0,0.05)] border border-slate-100 group hover:border-slate-300 transition-all duration-500 animate-scale-in"
  >
    <div className={`absolute -right-4 -top-4 w-24 h-24 bg-${color}-500/5 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700`}></div>
    <div className="flex items-start justify-between relative z-10">
      <div>
        <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em] mb-3">{title}</p>
        <p className="text-4xl font-black text-slate-800 tracking-tighter">{value}</p>
      </div>
      <div className={`w-14 h-14 rounded-2xl bg-slate-50 text-${color}-600 flex items-center justify-center group-hover:bg-${color}-600 group-hover:text-white transition-all duration-500`}>
        <Icon size={24} strokeWidth={2.5} />
      </div>
    </div>
    <div className="mt-4 flex items-center gap-2 relative z-10">
      <div className="h-1 flex-1 bg-slate-100 rounded-full overflow-hidden">
          <div className={`h-full bg-${color}-500 rounded-full w-2/3 group-hover:w-full transition-all duration-1000 opacity-20 group-hover:opacity-100`}></div>
      </div>
    </div>
  </div>
);

function ProjectCard({ project, idx, onDelete, onClick }: any) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    getProjectSummary(project.id).then(s => setProgress(s.overallProgress || 0)).catch(() => { });
  }, [project.id]);

  return (
    <div
      style={{ animationDelay: `${idx * 50}ms` }}
      className="bg-white border border-slate-100 rounded-[2.5rem] p-8 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.03)] hover:shadow-2xl hover:shadow-slate-200 transition-all duration-500 group animate-scale-in relative overflow-hidden"
    >
      <div className="absolute top-0 right-0 p-8 text-slate-50 opacity-0 group-hover:opacity-100 transition-opacity">
          <HardHat size={120} />
      </div>

      <div className="flex justify-between items-start mb-8 relative z-10">
        <div className="space-y-2">
           <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${
            project.status === 'Completed' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
            project.status === 'On Hold' ? 'bg-amber-50 text-amber-600 border-amber-100' :
            'bg-blue-50 text-blue-600 border-blue-100'
          }`}>
            {project.status || 'Active'}
          </span>
          <h3 className="font-black text-2xl text-slate-900 tracking-tight leading-tight">{project.project_name}</h3>
          <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
            <Calendar size={12} className="text-slate-300" />
            <span>Started: {project.start_date || '—'}</span>
          </div>
        </div>
        
        <button
            onClick={(e) => {
              e.stopPropagation();
              if (window.confirm('Are you sure you want to delete this project? All daily logs and tasks will be permanently removed.')) {
                fetchJSON(`/api/pms/projects/${project.id}`, { method: 'DELETE' }).then(() => onDelete());
              }
            }}
            className="p-3 bg-slate-50 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all"
        >
            <Trash2 size={18} />
        </button>
      </div>



      <button
        onClick={(e) => {
          if (project.google_sheet_link) {
            e.stopPropagation();
            window.open(project.google_sheet_link, '_blank');
          } else {
            onClick(e);
          }
        }}
        className="w-full mt-10 py-5 px-6 bg-slate-900 rounded-[1.5rem] flex items-center justify-between text-xs font-black text-white hover:bg-blue-600 transition-all duration-300 shadow-xl shadow-slate-900/10 hover:shadow-blue-500/20 active:scale-95 translate-y-0 hover:-translate-y-1"
      >
        <span className="tracking-[0.2em] uppercase">
          {project.google_sheet_link ? 'OPEN SHEET' : 'OPEN PLANNER'}
        </span>
        <ChevronRight size={18} className="transform group-hover:translate-x-1 transition-transform" />
      </button>
    </div>
  );
}

export default function PMSDashboard() {
  const [projects, setProjects] = useState<any[]>([]);
  const [summary, setSummary] = useState({ overallProgress: 0 });
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [activeProjectId, setActiveProjectId] = useState<number | null>(null);
  const [showPlanner, setShowPlanner] = useState(false);
  const [showDailyLog, setShowDailyLog] = useState(false);
  const [showChartsView, setShowChartsView] = useState(false);
  const [showSearchView, setShowSearchView] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');
  const [globalDate, setGlobalDate] = useState('');
  const [searchResults, setSearchResults] = useState<{ daily: any[], weekly: any[] }>({ daily: [], weekly: [] });
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    if (showSearchView) {
      performGlobalSearch();
    }
  }, [globalSearch, globalDate, showSearchView]);

  async function performGlobalSearch() {
    setIsSearching(true);
    try {
      const dailyUrl = `/api/pms/daily-work?search=${encodeURIComponent(globalSearch)}${globalDate ? `&work_date=${globalDate}` : ''}`;
      const weeklyUrl = `/api/pms/weekly-tasks?search=${encodeURIComponent(globalSearch)}`;

      const [daily, weekly] = await Promise.all([
        fetchJSON(dailyUrl),
        fetchJSON(weeklyUrl)
      ]);

      setSearchResults({
        daily: Array.isArray(daily) ? daily : (daily?.data || []),
        weekly: Array.isArray(weekly) ? weekly : (weekly?.data || [])
      });
    } catch (e) {
      console.warn('Global search failed', e);
    } finally {
      setIsSearching(false);
    }
  }

  async function loadProjects() {
    try {
      const data = await fetchJSON('/api/pms/projects');
      const rows = Array.isArray(data) ? data : (data && data.data) ? data.data : data;
      setProjects(rows || []);
    } catch (e) { console.warn('Failed loading projects', e); setProjects([]); }
  }

  useEffect(() => {
    if (projects.length) {
      Promise.all(projects.map(p => getProjectSummary(p.id))).then(summaries => {
        const totalProgress = summaries.reduce((acc, s) => acc + (s.overallProgress || 0), 0);
        const avgProgress = projects.length > 0 ? Math.round(totalProgress / projects.length) : 0;
        setSummary({ overallProgress: avgProgress });
      }).catch(e => console.warn('Summary calc failed', e));
    } else {
      setSummary({ overallProgress: 0 });
    }
  }, [projects]);

  const total = projects.length;
  const active = projects.filter(p => p.status !== 'Completed').length;
  const completed = projects.filter(p => p.status === 'Completed').length;

  if (showChartsView) {
    return <PMSChartsView onClose={() => setShowChartsView(false)} />;
  }

  if (showPlanner && activeProjectId) {
    return (
      <div className="h-full bg-[#f8fafc] relative animate-fade-in-up">
        <WeeklyPlanner
          projectId={activeProjectId}
          onChange={async () => {
            setShowPlanner(false);
            await loadProjects();
          }}
        />
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 overflow-auto p-4 md:p-10 space-y-10 custom-scrollbar bg-[#f8fafc] relative">
      
      {/* Header Section */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-8 animate-fade-in-up">
        <div className="flex items-center gap-6">
            <div className="w-16 h-16 bg-white rounded-2xl shadow-xl flex items-center justify-center border border-slate-100 transform -rotate-3">
                <TrendingUp size={32} className="text-blue-600" />
            </div>
            <div>
                <h1 className="text-3xl font-black text-slate-900 tracking-tight">PMS Executive Dashboard</h1>
                <div className="flex items-center gap-3 mt-1.5">
                    <span className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-600 text-[10px] font-black uppercase tracking-wider rounded-full border border-emerald-100">
                        <Activity size={12} /> Real-time Performance
                    </span>
                    <p className="text-slate-500 font-bold text-xs">Monitoring {total} Active Sites</p>
                </div>
            </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <button
            onClick={() => setShowSearchView(!showSearchView)}
            className={`flex items-center gap-3 px-6 py-4 rounded-2xl transition-all font-black text-[10px] tracking-widest uppercase border ${showSearchView ? 'bg-indigo-50 border-indigo-200 text-indigo-600 shadow-lg shadow-indigo-500/5' : 'bg-white text-slate-600 border-slate-100 shadow-sm hover:border-slate-300'}`}
          >
            <Search size={18} />
            Search Matrix
          </button>
          <button
            onClick={() => setShowChartsView(true)}
            className="flex items-center gap-3 bg-white text-slate-900 border border-slate-100 px-6 py-4 rounded-2xl shadow-sm hover:shadow-xl hover:border-slate-300 active:scale-95 transition-all font-black text-[10px] tracking-widest uppercase"
          >
            <BarChart3 size={18} className="text-blue-600" />
            Visual Analysis
          </button>
          <button
            onClick={() => { setShowProjectForm(!showProjectForm); setActiveProjectId(null); }}
            className="flex items-center gap-3 bg-slate-900 text-white px-8 py-4 rounded-3xl shadow-2xl shadow-slate-900/20 hover:bg-blue-600 active:scale-95 transition-all font-black text-[10px] tracking-widest uppercase"
          >
            <Plus size={18} />
            Initiate Project
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      {!showSearchView && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 animate-fade-in-up">
          <StatCard title="Total Sites" value={total} icon={ClipboardList} color="blue" delay="0ms" />
          <StatCard title="Under Construction" value={active} icon={Zap} color="emerald" delay="100ms" />
          <StatCard title="Handed Over" value={completed} icon={CheckCircle} color="indigo" delay="200ms" />
        </div>
      )}

      {/* Search Interface */}
      {showSearchView && (
        <div className="space-y-8 animate-in slide-in-from-top-4 duration-500">
          <div className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-2xl shadow-slate-200/50 flex flex-col md:flex-row gap-6 items-center">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300" size={24} />
              <input
                type="text"
                placeholder="Query any task, description or project parameters..."
                value={globalSearch}
                onChange={e => setGlobalSearch(e.target.value)}
                className="w-full pl-16 pr-6 py-6 bg-slate-50 border-none rounded-[2rem] font-black text-slate-800 focus:ring-4 focus:ring-blue-500/10 placeholder:text-slate-300 transition-all outline-none"
              />
            </div>
            <div className="flex items-center gap-4 w-full md:w-auto">
              <input
                type="date"
                value={globalDate}
                onChange={e => setGlobalDate(e.target.value)}
                className="flex-1 md:w-56 px-6 py-6 bg-slate-50 border-none rounded-[2rem] font-black text-slate-600 focus:ring-4 focus:ring-blue-500/10 transition-all outline-none cursor-pointer"
              />
              <button
                onClick={() => { setGlobalSearch(''); setGlobalDate(''); }}
                className="p-6 bg-white text-slate-300 hover:text-slate-900 border border-slate-100 rounded-[2rem] hover:bg-slate-50 transition-all shadow-sm"
              >
                <RefreshCw size={24} className={isSearching ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-12">
            <div className="space-y-6">
              <h3 className="text-xl font-black text-slate-800 flex items-center gap-3 tracking-tight">
                <span className="w-1.5 h-6 bg-emerald-500 rounded-full"></span>
                Daily Work Logs
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {searchResults.daily.length > 0 ? searchResults.daily.map((log: any) => (
                  <div key={log.id} className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all cursor-pointer group"
                    onClick={() => { setActiveProjectId(log.project_id); setShowPlanner(true); }}
                  >
                    <div className="flex justify-between items-start mb-4">
                      <span className="text-[9px] font-black text-blue-600 bg-blue-50 px-3 py-1 rounded-full uppercase tracking-widest">{log.project_name || 'Project'}</span>
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{log.work_date}</span>
                    </div>
                    <p className="text-sm font-bold text-slate-700 mb-6 leading-relaxed whitespace-pre-wrap">{log.work_done}</p>
                    <div className="flex items-center justify-between pt-4 border-t border-slate-50">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Session {log.session_number}</span>
                      </div>
                    </div>
                  </div>
                )) : (globalSearch || globalDate) && !isSearching ? (
                  <div className="p-10 border-2 border-dashed border-slate-100 rounded-[2.5rem] text-center">
                      <p className="text-slate-400 font-bold italic">No log entries meet your search criteria.</p>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="space-y-6">
               <h3 className="text-xl font-black text-slate-800 flex items-center gap-3 tracking-tight">
                <span className="w-1.5 h-6 bg-blue-500 rounded-full"></span>
                Strategic Tasks
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {searchResults.weekly.length > 0 ? searchResults.weekly.map((task: any) => (
                  <div key={task.id} className="bg-slate-900 p-6 rounded-[2rem] shadow-xl hover:-translate-y-1 transition-all cursor-pointer group"
                    onClick={() => { setActiveProjectId(task.project_id); setShowPlanner(true); }}
                  >
                    <div className="flex justify-between items-start mb-4">
                      <span className="text-[9px] font-black text-white bg-white/10 px-3 py-1 rounded-full uppercase tracking-widest">{task.project_name || 'Site'}</span>
                      <span className="text-[9px] font-black text-white/40 uppercase tracking-widest">{task.week_start_date}</span>
                    </div>
                    <h4 className="text-lg font-black text-white mb-2 tracking-tight">{task.task_name}</h4>
                    <p className="text-xs text-white/50 mb-6 line-clamp-2 italic">{task.notes}</p>
                    <div className="flex items-center justify-between pt-4 border-t border-white/5">
                      <span className={`text-[8px] font-black px-2 py-1 rounded-sm uppercase tracking-tighter ${task.priority === 'High' ? 'bg-red-500 text-white' : 'bg-amber-500 text-slate-900'}`}>
                        {task.priority || 'Medium'} Priority
                      </span>
                      <span className="text-xs font-black text-white/60">{task.target_quantity} Units Planned</span>
                    </div>
                  </div>
                )) : (globalSearch || globalDate) && !isSearching ? (
                    <div className="p-10 border-2 border-dashed border-slate-100 rounded-[2.5rem] text-center">
                        <p className="text-slate-400 font-bold italic">Zero tasks found in the matrix.</p>
                    </div>
                ) : null}
              </div>
            </div>

            {!globalSearch && !globalDate && !isSearching && (
              <div className="py-20 text-center animate-scale-in">
                <div className="w-24 h-24 bg-white shadow-xl rounded-[2rem] border border-slate-100 flex items-center justify-center mx-auto mb-6 text-slate-200">
                  <Target size={48} />
                </div>
                <h4 className="text-slate-800 font-black text-xl mb-2 tracking-tight">Global Matrix Search</h4>
                <p className="text-slate-400 font-bold text-sm max-w-sm mx-auto">Input a keyword or date to scan across all projects, logs, and site activities.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Projects Grid */}
      {!showSearchView && (
        <div className="space-y-8 animate-fade-in-up">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                <HardHat className="text-slate-900" size={24} />
                Strategic Project Portfolio
            </h2>
            <button
              onClick={() => { loadProjects(); }}
              className="px-4 py-2 bg-white text-slate-400 hover:text-blue-600 border border-slate-100 hover:border-blue-100 rounded-xl transition-all font-bold text-xs uppercase tracking-widest shadow-sm"
            >
              Sync Matrix
            </button>
          </div>

          {showProjectForm && (
            <div className="animate-scale-in fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
                <div className="bg-white rounded-[3rem] p-10 shadow-2xl w-full max-w-2xl relative overflow-hidden">
                    <button 
                        onClick={() => setShowProjectForm(false)}
                        className="absolute top-8 right-8 p-3 hover:bg-slate-50 rounded-full transition-colors"
                    >
                        <X size={24} className="text-slate-400" />
                    </button>
                    <ProjectForm onDone={() => { setShowProjectForm(false); loadProjects(); }} />
                </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
            {projects.length ? projects.map((p: any, idx: number) => (
              <ProjectCard
                key={p.id}
                project={p}
                idx={idx}
                onDelete={() => loadProjects()}
                onClick={() => { setActiveProjectId(p.id); setShowPlanner(true); setShowDailyLog(false); }}
              />
            )) : (
              <div className="col-span-full py-20 text-center bg-white border border-slate-100 rounded-[3rem] shadow-sm animate-scale-in">
                <div className="w-24 h-24 bg-slate-50 rounded-[2rem] flex items-center justify-center mx-auto mb-6 text-slate-200">
                  <ClipboardList size={48} />
                </div>
                <h4 className="text-slate-800 font-black text-xl mb-2 tracking-tight">Portfolio Empty</h4>
                <p className="text-slate-400 font-bold text-sm">Initiate your first project to begin monitoring site development.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
