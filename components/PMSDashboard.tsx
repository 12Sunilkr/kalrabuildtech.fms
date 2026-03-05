import React, { useEffect, useState } from 'react';
import { getProjectSummary, fetchJSON } from '../src/utils/pmsUtils';
import ProjectForm from './ProjectForm';
import WeeklyPlanner from './WeeklyPlanner';
import DailyLogForm from './DailyLogForm';
import PMSChartsView from './PMSChartsView';
import { BarChart3, BarChart2, Calendar, CheckCircle, Zap, ClipboardList, Plus, RefreshCw, ChevronRight, Trash2 } from 'lucide-react';

// dashboard statistic card with premium styling
const StatCard = ({ title, value, icon: Icon, gradient, delay }: any) => (
  <div
    style={{ animationDelay: delay }}
    className="bg-white/80 backdrop-blur-xl p-6 rounded-3xl shadow-[0_10px_30px_-10px_rgba(0,0,0,0.1)] border border-white/50 flex items-center justify-between group hover:-translate-y-2 hover:shadow-[0_20px_40px_-10px_rgba(0,0,0,0.15)] transition-all duration-300 animate-scale-in"
  >
    <div>
      <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-2">{title}</p>
      <p className="text-4xl font-extrabold text-slate-800 tracking-tight">{value}</p>
    </div>
    <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${gradient} text-white flex items-center justify-center shadow-lg transform rotate-3 group-hover:rotate-12 group-hover:scale-110 transition-transform duration-500`}>
      <Icon size={32} />
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
      className="bg-white/80 backdrop-blur-xl rounded-3xl p-6 border border-white/50 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 animate-scale-in group"
    >
      <div className="flex justify-between items-start mb-4">
        <div className="space-y-1">
          <h3 className="font-black text-xl text-slate-800">{project.project_name}</h3>
          <div className="flex items-center gap-2 text-xs text-slate-400 font-bold uppercase tracking-wider">
            <Calendar size={14} />
            <span>Started: {project.start_date || '—'}</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${project.status === 'Completed' ? 'bg-emerald-100 text-emerald-700' :
            project.status === 'On Hold' ? 'bg-amber-100 text-amber-700' :
              'bg-blue-100 text-blue-700'
            }`}>
            {project.status || 'Active'}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (window.confirm('Are you sure you want to delete this project? All daily logs and tasks will be permanently removed.')) {
                fetchJSON(`/api/pms/projects/${project.id}`, { method: 'DELETE' }).then(() => onDelete());
              }
            }}
            className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-xs font-bold text-slate-500 uppercase tracking-widest">
          <span>Progress</span>
          <span>{progress}%</span>
        </div>
        <div className="h-3 bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200/50">
          <div
            className="h-full bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full transition-all duration-1000"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <button
        onClick={onClick}
        className="w-full mt-6 py-3 px-4 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-between text-sm font-bold text-slate-600 group-hover:bg-slate-900 group-hover:text-white group-hover:border-slate-800 transition-all duration-300"
      >
        <span>OPEN PLANNER</span>
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
  const [selectedWeeklyTaskId, setSelectedWeeklyTaskId] = useState<number | null>(null);
  const [showChartsView, setShowChartsView] = useState(false);

  useEffect(() => {
    loadProjects();
  }, []);

  async function loadProjects() {
    try {
      const data = await fetchJSON('/api/pms/projects');
      const rows = Array.isArray(data) ? data : (data && data.data) ? data.data : data;
      setProjects(rows || []);
    } catch (e) { console.warn('Failed loading projects', e); setProjects([]); }
  }

  useEffect(() => {
    if (projects.length) {
      // Calculate overall summary across all projects
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
      <div className="h-full bg-white relative animate-fade-in-up">
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
    <div className="h-full min-h-0 overflow-auto p-4 md:p-8 space-y-8 custom-scrollbar">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 animate-fade-in-up">
        <div>
          <h1 className="text-4xl font-black text-slate-800 tracking-tight">PMS Dashboard</h1>
          <p className="text-slate-500 mt-2 font-medium">Welcome back! Here's your project status overview.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowChartsView(true)}
            className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-3 rounded-2xl shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 active:scale-95 transition-all font-bold"
          >
            <BarChart3 className="w-5 h-5" />
            <span>Visual Analysis</span>
          </button>
          <button
            onClick={() => { setShowProjectForm(!showProjectForm); setActiveProjectId(null); }}
            className="flex items-center gap-2 bg-slate-900 text-white px-6 py-3 rounded-2xl shadow-lg shadow-slate-900/20 hover:bg-slate-800 active:scale-95 transition-all font-bold"
          >
            <Plus className="w-5 h-5" />
            <span>New Project</span>
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Projects"
          value={total}
          icon={ClipboardList}
          gradient="from-blue-600 to-indigo-600"
          delay="0ms"
        />
        <StatCard
          title="Active Projects"
          value={active}
          icon={Zap}
          gradient="from-emerald-500 to-teal-600"
          delay="100ms"
        />
        <StatCard
          title="Completed"
          value={completed}
          icon={CheckCircle}
          gradient="from-purple-500 to-indigo-600"
          delay="200ms"
        />
        <StatCard
          title="Progress"
          value={`${summary.overallProgress}%`}
          icon={BarChart2}
          gradient="from-orange-500 to-rose-600"
          delay="300ms"
        />
      </div>

      {/* Projects Grid */}
      <div className="space-y-6 animate-fade-in-up animation-delay-400">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-slate-800">Project List</h2>
          <button
            onClick={() => { loadProjects(); }}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-white rounded-xl transition-all"
            title="Refresh Data"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>

        {showProjectForm && (
          <div className="animate-scale-in">
            <div className="bg-white/80 backdrop-blur-xl rounded-3xl p-6 border border-white/50 shadow-xl">
              <ProjectForm onDone={() => { setShowProjectForm(false); loadProjects(); }} />
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {projects.length ? projects.map((p: any, idx: number) => (
            <ProjectCard
              key={p.id}
              project={p}
              idx={idx}
              onDelete={() => loadProjects()}
              onClick={() => { setActiveProjectId(p.id); setShowPlanner(true); setShowDailyLog(false); }}
            />
          )) : (
            <div className="col-span-full py-20 text-center animate-scale-in">
              <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-400">
                <ClipboardList size={40} />
              </div>
              <p className="text-slate-500 font-bold">No projects found. Create one to get started!</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
