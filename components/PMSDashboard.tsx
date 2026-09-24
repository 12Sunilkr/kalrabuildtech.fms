import React, { useEffect, useState, useMemo } from 'react';
import { fetchJSON } from '../src/utils/pmsUtils';
import ProjectForm from './ProjectForm';
import PMSChartsView from './PMSChartsView';
import { 
  BarChart3, Calendar, CheckCircle2, Zap, 
  Plus, RefreshCw, ChevronRight, Trash2, 
  Search, HardHat, TrendingUp, Activity, X,
  MapPin, User, FileSpreadsheet, ExternalLink, Edit3,
  Clock, Building2, FolderKanban, Sparkles,
  DollarSign, Check, Link as LinkIcon
} from 'lucide-react';

// Modern KPI Metric Card
const StatCard = ({ title, value, subtitle, icon: Icon, color, delay }: any) => {
  const colorMap: Record<string, { bg: string; text: string; iconBg: string; bar: string }> = {
    blue: { bg: 'from-blue-500/10 to-indigo-500/5', text: 'text-blue-600', iconBg: 'bg-blue-50 text-blue-600', bar: 'bg-blue-600' },
    emerald: { bg: 'from-emerald-500/10 to-teal-500/5', text: 'text-emerald-600', iconBg: 'bg-emerald-50 text-emerald-600', bar: 'bg-emerald-600' },
    indigo: { bg: 'from-indigo-500/10 to-purple-500/5', text: 'text-indigo-600', iconBg: 'bg-indigo-50 text-indigo-600', bar: 'bg-indigo-600' },
    amber: { bg: 'from-amber-500/10 to-orange-500/5', text: 'text-amber-600', iconBg: 'bg-amber-50 text-amber-600', bar: 'bg-amber-600' }
  };

  const scheme = colorMap[color] || colorMap.blue;

  return (
    <div 
      style={{ animationDelay: delay }}
      className="relative overflow-hidden bg-white p-6 sm:p-7 rounded-3xl shadow-sm hover:shadow-xl border border-slate-100 transition-all duration-300 group animate-in fade-in"
    >
      <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${scheme.bg} rounded-full blur-2xl group-hover:scale-125 transition-transform duration-500 pointer-events-none`}></div>
      <div className="flex items-start justify-between relative z-10">
        <div>
          <p className="text-slate-400 text-xs font-black uppercase tracking-wider mb-2">{title}</p>
          <div className="flex items-baseline gap-2">
            <p className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">{value}</p>
            {subtitle && <span className="text-xs font-bold text-slate-400">{subtitle}</span>}
          </div>
        </div>
        <div className={`w-12 h-12 rounded-2xl ${scheme.iconBg} flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform`}>
          <Icon size={22} strokeWidth={2.5} />
        </div>
      </div>
      <div className="mt-5 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full ${scheme.bar} rounded-full w-3/4 group-hover:w-full transition-all duration-700`}></div>
      </div>
    </div>
  );
};

function ProjectCard({ project, idx, employees, onDelete, onEdit, onOpenSheet }: any) {
  const assignedEmp = employees?.find((e: any) => e.id === project.assigned_employee_id || String(e.id) === project.assigned_employee_id);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Completed':
        return { bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500', label: 'Completed' };
      case 'On Hold':
        return { bg: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500', label: 'On Hold' };
      case 'Planning':
        return { bg: 'bg-purple-50 text-purple-700 border-purple-200', dot: 'bg-purple-500', label: 'Planning' };
      default:
        return { bg: 'bg-blue-50 text-blue-700 border-blue-200', dot: 'bg-blue-500', label: 'Active Site' };
    }
  };

  const statusConfig = getStatusBadge(project.status || 'Active');
  const hasSheet = Boolean(project.google_sheet_link && project.google_sheet_link.trim());

  return (
    <div
      style={{ animationDelay: `${idx * 40}ms` }}
      onClick={() => {
        if (hasSheet) {
          onOpenSheet(project.google_sheet_link);
        } else {
          onEdit(project);
        }
      }}
      className="bg-white border border-slate-200/80 hover:border-emerald-400 rounded-3xl p-6 sm:p-7 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group relative flex flex-col justify-between cursor-pointer"
    >
      <div>
        {/* Top Header Row */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold border ${statusConfig.bg}`}>
              <span className={`w-2 h-2 rounded-full ${statusConfig.dot} animate-pulse`}></span>
              {statusConfig.label}
            </span>
          </div>

          <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => onEdit(project)}
              className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors"
              title="Edit Project & Link"
            >
              <Edit3 size={16} />
            </button>
            <button
              onClick={() => {
                if (window.confirm(`Permanently delete project "${project.project_name}"?`)) {
                  fetchJSON(`/api/pms/projects/${project.id}`, { method: 'DELETE' }).then(() => onDelete());
                }
              }}
              className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
              title="Delete Project"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>

        {/* Project Name & Location */}
        <h3 className="font-extrabold text-xl text-slate-900 tracking-tight leading-snug group-hover:text-emerald-700 transition-colors mb-2">
          {project.project_name}
        </h3>

        {project.location ? (
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 mb-4">
            <MapPin size={14} className="text-emerald-600 shrink-0" />
            <span className="truncate">{project.location}</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 mb-4">
            <MapPin size={14} className="text-slate-300 shrink-0" />
            <span>Site location not specified</span>
          </div>
        )}

        {/* Lead Engineer & Started Date */}
        <div className="p-3 bg-slate-50/80 rounded-2xl border border-slate-100 mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-emerald-600 to-teal-600 text-white font-bold flex items-center justify-center text-xs shrink-0 shadow-xs">
              {assignedEmp?.name ? assignedEmp.name.charAt(0).toUpperCase() : <User size={14} />}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-slate-800 truncate">
                {assignedEmp?.name || (project.assigned_employee_id ? `Staff (${project.assigned_employee_id})` : 'Unassigned Lead')}
              </div>
              <div className="text-[10px] font-mono text-slate-400 font-semibold truncate">
                {assignedEmp?.department || 'Operations'}
              </div>
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[10px] uppercase font-extrabold text-slate-400 tracking-wider">Commenced</div>
            <div className="text-xs font-bold text-slate-700 font-mono">{project.start_date || '—'}</div>
          </div>
        </div>
      </div>

      {/* Primary Action Button: Open Live Sheet */}
      <div className="pt-3 border-t border-slate-100" onClick={e => e.stopPropagation()}>
        {hasSheet ? (
          <button
            onClick={() => onOpenSheet(project.google_sheet_link)}
            className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-extrabold flex items-center justify-center gap-2.5 transition-all shadow-md shadow-emerald-600/20 hover:shadow-emerald-600/30 active:scale-98 group/btn"
          >
            <FileSpreadsheet size={18} className="group-hover/btn:scale-110 transition-transform" />
            <span>Open Live Sheet</span>
            <ExternalLink size={14} className="opacity-70 group-hover/btn:opacity-100 transition-opacity" />
          </button>
        ) : (
          <button
            onClick={() => onEdit(project)}
            className="w-full py-3.5 px-4 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 hover:border-blue-200 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 transition-all"
          >
            <LinkIcon size={16} />
            <span>+ Attach Google Sheet</span>
          </button>
        )}
      </div>
    </div>
  );
}

export default function PMSDashboard() {
  const [projects, setProjects] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [editingProject, setEditingProject] = useState<any | null>(null);
  const [showChartsView, setShowChartsView] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusToast, setStatusToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    loadProjects();
    loadEmployees();
  }, []);

  useEffect(() => {
    if (statusToast) {
      const timer = setTimeout(() => setStatusToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [statusToast]);

  async function loadEmployees() {
    try {
      const res = await fetchJSON('/api/employees');
      const list = Array.isArray(res) ? res : (res?.data || []);
      setEmployees(list);
    } catch (e) {
      console.warn('Failed to load employees for PMS', e);
    }
  }

  async function loadProjects() {
    try {
      const data = await fetchJSON('/api/pms/projects');
      const rows = Array.isArray(data) ? data : (data && data.data) ? data.data : data;
      setProjects(rows || []);
    } catch (e) {
      console.warn('Failed loading projects', e);
      setProjects([]);
    }
  }

  const handleOpenSheet = (url: string) => {
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const total = projects.length;
  const active = projects.filter(p => p.status === 'Active' || !p.status).length;
  const onHold = projects.filter(p => p.status === 'On Hold').length;
  const completed = projects.filter(p => p.status === 'Completed').length;
  const sheetLinkedCount = projects.filter(p => p.google_sheet_link && p.google_sheet_link.trim()).length;

  const filteredProjects = useMemo(() => {
    return projects.filter(p => {
      const matchesStatus = filterStatus === 'ALL' || 
        (filterStatus === 'ACTIVE' && (p.status === 'Active' || !p.status)) ||
        (filterStatus === 'ON_HOLD' && p.status === 'On Hold') ||
        (filterStatus === 'COMPLETED' && p.status === 'Completed');

      const matchesSearch = !searchTerm || 
        (p.project_name && p.project_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (p.location && p.location.toLowerCase().includes(searchTerm.toLowerCase()));

      return matchesStatus && matchesSearch;
    });
  }, [projects, filterStatus, searchTerm]);

  if (showChartsView) {
    return <PMSChartsView onClose={() => setShowChartsView(false)} />;
  }

  return (
    <div className="h-full min-h-0 overflow-auto p-4 sm:p-6 lg:p-8 space-y-8 custom-scrollbar bg-slate-50/60 relative">
      {/* Toast Notification */}
      {statusToast && (
        <div className="fixed top-20 right-6 z-[150] animate-in slide-in-from-top-4 duration-300">
          <div className={`p-4 rounded-2xl shadow-xl border backdrop-blur-md flex items-center gap-3 ${
            statusToast.type === 'success' ? 'bg-emerald-50/95 border-emerald-200 text-emerald-900' : 'bg-rose-50/95 border-rose-200 text-rose-900'
          }`}>
            <CheckCircle2 size={20} className={statusToast.type === 'success' ? 'text-emerald-600' : 'text-rose-600'} />
            <span className="text-sm font-bold">{statusToast.message}</span>
          </div>
        </div>
      )}

      {/* Executive Header Section */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 bg-white p-6 sm:p-8 rounded-3xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-5">
          <div className="w-14 h-14 bg-gradient-to-tr from-emerald-600 to-teal-700 text-white rounded-2xl shadow-lg shadow-emerald-600/20 flex items-center justify-center shrink-0">
            <FileSpreadsheet size={28} />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">PMS Site Sheets</h1>
              <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
                Direct Live Sheets
              </span>
            </div>
            <p className="text-slate-500 text-xs sm:text-sm font-medium mt-1">
              Live Google Sheets, construction trackers & site project management.
            </p>
          </div>
        </div>

        {/* Top Actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => setShowChartsView(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-2xl text-xs font-bold shadow-xs transition-all"
          >
            <BarChart3 size={16} className="text-emerald-600" />
            <span>Visual Analytics</span>
          </button>

          <button
            onClick={() => {
              setEditingProject(null);
              setShowProjectForm(true);
            }}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-2xl text-xs font-extrabold shadow-md shadow-emerald-500/20 active:scale-95 transition-all"
          >
            <Plus size={16} />
            <span>Initiate Project</span>
          </button>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <StatCard title="Total Sites" value={total} subtitle="Portfolio" icon={FolderKanban} color="blue" delay="0ms" />
        <StatCard title="Active Sites" value={active} subtitle="Under Work" icon={Zap} color="emerald" delay="50ms" />
        <StatCard title="Live Sheets Connected" value={sheetLinkedCount} subtitle="Direct Access" icon={FileSpreadsheet} color="indigo" delay="100ms" />
        <StatCard title="Completed" value={completed} subtitle="Handed Over" icon={CheckCircle2} color="amber" delay="150ms" />
      </div>

      {/* Main Portfolio Grid Section */}
      <div className="space-y-6">
        {/* Filter Bar & Live Search */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          {/* Status Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-1 sm:pb-0">
            {[
              { id: 'ALL', label: 'All Sites', count: total },
              { id: 'ACTIVE', label: 'Active', count: active },
              { id: 'ON_HOLD', label: 'On Hold', count: onHold },
              { id: 'COMPLETED', label: 'Completed', count: completed }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setFilterStatus(tab.id)}
                className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all shrink-0 flex items-center gap-1.5 ${
                  filterStatus === tab.id
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-600'
                }`}
              >
                <span>{tab.label}</span>
                <span className={`px-1.5 py-0.2 rounded-md text-[10px] font-mono ${
                  filterStatus === tab.id ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
                }`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* In-view Search */}
          <div className="relative sm:w-72">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="Search site name or location..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none transition-all placeholder:text-slate-400"
            />
          </div>
        </div>

        {/* Project Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredProjects.length > 0 ? (
            filteredProjects.map((p: any, idx: number) => (
              <ProjectCard
                key={p.id}
                project={p}
                idx={idx}
                employees={employees}
                onOpenSheet={handleOpenSheet}
                onDelete={() => {
                  loadProjects();
                  setStatusToast({ message: 'Project removed successfully', type: 'success' });
                }}
                onEdit={(proj: any) => {
                  setEditingProject(proj);
                  setShowProjectForm(true);
                }}
              />
            ))
          ) : (
            <div className="col-span-full py-16 text-center bg-white border border-slate-200 rounded-3xl shadow-xs">
              <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-4 text-emerald-600">
                <FileSpreadsheet size={32} />
              </div>
              <h4 className="text-slate-900 font-extrabold text-lg mb-1">No Site Sheets Found</h4>
              <p className="text-slate-500 text-xs max-w-sm mx-auto mb-6">
                {searchTerm || filterStatus !== 'ALL'
                  ? 'No projects match your active search or filter parameters.'
                  : 'Start monitoring site operations by adding your first project and Google Sheet link.'}
              </p>
              <button
                onClick={() => {
                  setEditingProject(null);
                  setShowProjectForm(true);
                }}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-bold inline-flex items-center gap-2 shadow-sm transition-all"
              >
                <Plus size={16} /> Initiate Project
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Project Modal Form (Create / Edit) */}
      {showProjectForm && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-2xl w-full max-w-2xl relative border border-slate-100 max-h-[90vh] overflow-hidden flex flex-col">
            <button
              onClick={() => {
                setShowProjectForm(false);
                setEditingProject(null);
              }}
              className="absolute top-6 right-6 p-2.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors z-10"
            >
              <X size={20} />
            </button>
            <ProjectForm
              initialProject={editingProject}
              onCancel={() => {
                setShowProjectForm(false);
                setEditingProject(null);
              }}
              onDone={() => {
                setShowProjectForm(false);
                setEditingProject(null);
                loadProjects();
                setStatusToast({
                  message: editingProject ? 'Project specifications updated successfully' : 'Project initiated successfully',
                  type: 'success'
                });
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
