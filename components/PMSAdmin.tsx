import React, { useState, useMemo, useCallback, useEffect } from 'react';
import api, { safeGet, safePost, extractPayload, ensureArray } from '../src/utils/api';
import { PMSProject, PMSDailyWorkLog, Employee, User, Notification } from '../types';
import { Plus, BarChart3, Users, FileText, Edit2, CheckCircle, Clock, AlertCircle, Search, Filter, Download, Eye, Trash2, Save, X, TrendingUp, Calendar, Briefcase, ChevronLeft, ChevronRight, Trash } from 'lucide-react';
import { format, addDays } from 'date-fns';

interface PMSAdminProps {
  currentUser: User;
  employees: Employee[];
  addNotification: (title: string, msg: string, type: Notification['type'], targetUser: string) => void;
}

interface DailyTask {
  id: string;
  project_id: string;
  task_date: string;
  task_description: string;
  priority: 'low' | 'medium' | 'high';
  completed: boolean;
  createdAt: string;
}

export const PMSAdmin: React.FC<PMSAdminProps> = ({ currentUser, employees, addNotification }) => {
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState<any | null>(null);
  const [workLogs, setWorkLogs] = useState<any[]>([]);
  const [dailyTasks, setDailyTasks] = useState<DailyTask[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDailyTaskModal, setShowDailyTaskModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'Active' | 'Completed' | 'On-Hold'>('Active');
  const [currentPage, setCurrentPage] = useState(1);
  const [workLogsPage, setWorkLogsPage] = useState(1);
  const itemsPerPage = 10;
  const workLogsPerPage = 5;

  const [newProject, setNewProject] = useState({
    project_name: '',
    assigned_employee_id: '',
    start_date: format(new Date(), 'yyyy-MM-dd')
  });

  const [progressUpdate, setProgressUpdate] = useState({
    progress_percent: 0,
    remarks: ''
  });

  const [newDailyTask, setNewDailyTask] = useState({
    task_date: format(new Date(), 'yyyy-MM-dd'),
    task_description: '',
    priority: 'medium' as const
  });

  // Load projects on mount
  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      setIsLoading(true);
      const r = await safeGet('pms/projects');
      const data = extractPayload(r) || [];
      setProjects(ensureArray(data));
      console.log('Projects loaded:', data);
    } catch (err) {
      console.error('Failed to load projects', err && (err.message || err));
      addNotification('Error', 'Failed to load projects', 'PMS', currentUser.id);
    } finally {
      setIsLoading(false);
    }
  };

  const loadProjectDetails = async (projectId: string) => {
    try {
      const r = await safeGet(`pms/projects/${projectId}`);
      const data = extractPayload(r);
      setSelectedProject(data.project);
      setWorkLogs(ensureArray(data.logs));
      setWorkLogsPage(1);
      
      // Load daily tasks for this project
      loadDailyTasks(projectId);
      
      if (data.progress) {
        setProgressUpdate({
          progress_percent: data.progress.progress_percent,
          remarks: data.progress.remarks
        });
      }
    } catch (err) {
      console.error('Failed to load project details', err);
      addNotification('Error', 'Failed to load project details', 'PMS', currentUser.id);
    }
  };

  const loadDailyTasks = async (projectId: string) => {
    try {
      const r = await safeGet(`pms/daily-tasks?projectId=${projectId}`);
      const tasks = ensureArray(extractPayload(r));
      setDailyTasks(tasks);
    } catch (err) {
      console.error('Failed to load daily tasks', err);
    }
  };

  const handleCreateProject = async () => {
    if (!newProject.project_name || !newProject.assigned_employee_id) {
      alert('Please fill all fields');
      return;
    }

    try {
      const r = await safePost('pms/projects', newProject);
      if (extractPayload(r)) {
        addNotification('Success', 'Project created successfully', 'PMS', currentUser.id);
        setNewProject({ project_name: '', assigned_employee_id: '', start_date: format(new Date(), 'yyyy-MM-dd') });
        setShowCreateModal(false);
        loadProjects();
      }
    } catch (err) {
      console.error('Failed to create project', err);
      addNotification('Error', 'Failed to create project', 'PMS', currentUser.id);
    }
  };

  const handleUpdateStatus = async (projectId: string, newStatus: string) => {
    try {
      await api.put(`pms/projects/${projectId}`, { status: newStatus });
      addNotification('Success', 'Project status updated', 'PMS', currentUser.id);
      loadProjects();
      if (selectedProject?.id === projectId) {
        setSelectedProject({ ...selectedProject, status: newStatus });
      }
    } catch (err) {
      console.error('Failed to update project status', err);
      addNotification('Error', 'Failed to update status', 'PMS', currentUser.id);
    }
  };

  const handleApproveWorkLeft = async (workLogId: string, workLeft: string) => {
    try {
      await api.put(`pms/daily-work/${workLogId}`, {
        approved_work_left: workLeft,
        status: 'APPROVED'
      });
      addNotification('Success', 'Work log approved', 'success', currentUser.id);
      if (selectedProject) {
        loadProjectDetails(selectedProject.id);
      }
    } catch (err) {
      console.error('Failed to approve work log', err);
      addNotification('Error', 'Failed to approve', 'PMS', currentUser.id);
    }
  };

  const handleUpdateProgress = async () => {
    if (!selectedProject) return;

    try {
      await api.put('pms/progress', {
        project_id: selectedProject.id,
        ...progressUpdate
      });
      addNotification('Success', 'Progress updated', 'PMS', currentUser.id);
      loadProjectDetails(selectedProject.id);
    } catch (err) {
      console.error('Failed to update progress', err);
      addNotification('Error', 'Failed to update progress', 'error', currentUser.id);
    }
  };

  const handleGenerateReport = async (projectId: string) => {
    try {
      const r = await safeGet(`pms/reports/project/${projectId}`);
      const report = extractPayload(r);
      
      // Create a simple text report
      const reportText = `
PROJECT REPORT: ${report.project.project_name}
Started: ${report.project.start_date}
Employee: ${employees.find(e => e.id === report.project.assigned_employee_id)?.name || report.project.assigned_employee_id}
Status: ${report.project.status}

Total Working Days: ${report.totalDays}
Completed Sessions: ${report.completedSessions} / ${report.totalSessions}
Progress: ${report.progressPercent}%
Remarks: ${report.remarks}

Day-wise Progress:
${report.dayWiseProgress.map(d => `
${d.date}:
  Session 1: ${d.session1?.status || 'N/A'} - ${d.session1?.work_done || ''}
  Session 2: ${d.session2?.status || 'N/A'} - ${d.session2?.work_done || ''}
`).join('\n')}
      `;

      // Download as text file
      const blob = new Blob([reportText], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pms_report_${projectId}_${format(new Date(), 'yyyy-MM-dd')}.txt`;
      a.click();
      URL.revokeObjectURL(url);
      addNotification('Success', 'Report downloaded', 'PMS', currentUser.id);
    } catch (err) {
      console.error('Failed to generate report', err);
      addNotification('Error', 'Failed to generate report', 'PMS', currentUser.id);
    }
  };

  const handleCreateDailyTask = async () => {
    if (!selectedProject || !newDailyTask.task_description) {
      alert('Please fill all fields');
      return;
    }

    try {
      const r = await safePost('pms/daily-tasks', {
        project_id: selectedProject.id,
        ...newDailyTask
      });
      if (extractPayload(r)) {
        addNotification('Success', 'Daily task created successfully', 'PMS', currentUser.id);
        setNewDailyTask({
          task_date: format(new Date(), 'yyyy-MM-dd'),
          task_description: '',
          priority: 'medium'
        });
        setShowDailyTaskModal(false);
        loadDailyTasks(selectedProject.id);
      }
    } catch (err) {
      console.error('Failed to create daily task', err);
      addNotification('Error', 'Failed to create daily task', 'PMS', currentUser.id);
    }
  };

  const handleDeleteDailyTask = async (taskId: string) => {
    if (!window.confirm('Are you sure you want to delete this task?')) return;
    
    try {
      await api.delete(`pms/daily-tasks/${taskId}`);
      addNotification('Success', 'Daily task deleted', 'PMS', currentUser.id);
      if (selectedProject) {
        loadDailyTasks(selectedProject.id);
      }
    } catch (err) {
      console.error('Failed to delete daily task', err);
      addNotification('Error', 'Failed to delete daily task', 'PMS', currentUser.id);
    }
  };

  const filteredProjects = useMemo(() => {
    return projects.filter(p => {
      const matchesSearch = p.project_name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'ALL' || p.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [projects, searchQuery, statusFilter]);

  const paginatedProjects = useMemo(() => {
    const startIdx = (currentPage - 1) * itemsPerPage;
    return filteredProjects.slice(startIdx, startIdx + itemsPerPage);
  }, [filteredProjects, currentPage]);

  const totalPages = Math.ceil(filteredProjects.length / itemsPerPage);

  const paginatedWorkLogs = useMemo(() => {
    const startIdx = (workLogsPage - 1) * workLogsPerPage;
    return workLogs.slice(startIdx, startIdx + workLogsPerPage);
  }, [workLogs, workLogsPage]);

  const workLogsPages = Math.ceil(workLogs.length / workLogsPerPage);

  const getEmployeeName = (empId: string) => {
    return employees.find(e => e.id === empId)?.name || empId;
  };

  const statCards = useMemo(() => {
    return [
      { label: 'Total Projects', value: projects.length, color: 'from-blue-600 to-blue-700', icon: '📊' },
      { label: 'Active', value: projects.filter(p => p.status === 'Active').length, color: 'from-green-600 to-green-700', icon: '✓' },
      { label: 'Completed', value: projects.filter(p => p.status === 'Completed').length, color: 'from-purple-600 to-purple-700', icon: '✔' },
      { label: 'On-Hold', value: projects.filter(p => p.status === 'On-Hold').length, color: 'from-orange-600 to-orange-700', icon: '⏸' },
    ];
  }, [projects]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-100 p-6 overflow-y-auto flex flex-col">
      <div className="max-w-7xl mx-auto w-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-shrink-0">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl">
              <BarChart3 size={32} className="text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">PMS Dashboard</h1>
              <p className="text-slate-400 text-xs mt-1">Project Management System</p>
            </div>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white px-5 py-2 rounded-lg hover:shadow-lg hover:shadow-blue-500/50 transition-all duration-200 font-semibold text-sm"
          >
            <Plus size={18} />
            New Project
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6 flex-shrink-0">
          {statCards.map((stat, idx) => (
            <div key={idx} className="bg-gradient-to-br from-slate-800 to-slate-700 rounded-lg p-3 border border-slate-700 hover:border-slate-600 transition-all">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-slate-400 text-xs font-medium">{stat.label}</p>
                  <p className="text-2xl font-bold text-white mt-1">{stat.value}</p>
                </div>
                <span className="text-xl">{stat.icon}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Main Content Grid - Scrollable */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* Projects List */}
          <div className="lg:col-span-1 flex flex-col">
            <div className="bg-gradient-to-b from-slate-800 to-slate-850 rounded-lg border border-slate-700 overflow-hidden shadow-lg hover:shadow-xl transition-shadow duration-300 flex flex-col">
              <div className="p-4 border-b-2 border-blue-500/30 bg-gradient-to-r from-slate-800 via-slate-750 to-slate-800 flex-shrink-0">
                <h2 className="font-bold text-lg text-white mb-3 flex items-center gap-2">
                  <span className="w-1 h-6 bg-gradient-to-b from-blue-500 to-blue-600 rounded"></span>
                  Projects List
                </h2>
                
                {/* Filters */}
                <input
                  type="text"
                  placeholder="Search projects..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none transition mb-2"
                />
                
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                  className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none transition"
                >
                  <option value="ALL">All Status</option>
                  <option value="Active">Active</option>
                  <option value="Completed">Completed</option>
                  <option value="On-Hold">On-Hold</option>
                </select>
              </div>

              <div className="divide-y divide-slate-700 max-h-[400px] overflow-y-auto">
                {isLoading ? (
                  <div className="p-4 text-center text-slate-400">Loading...</div>
                ) : paginatedProjects.length === 0 ? (
                  <div className="p-4 text-center text-slate-400">No projects found</div>
                ) : (
                  paginatedProjects.map(project => (
                    <div
                      key={project.id}
                      onClick={() => loadProjectDetails(project.id)}
                      className={`p-3 cursor-pointer hover:bg-slate-700 transition ${
                        selectedProject?.id === project.id ? 'bg-blue-900/30 border-l-2 border-l-blue-500' : ''
                      }`}
                    >
                      <p className="font-semibold text-sm text-white">{project.project_name}</p>
                      <p className="text-xs text-slate-400">{getEmployeeName(project.assigned_employee_id)}</p>
                      <div className="flex items-center gap-1 mt-2">
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                          project.status === 'Active' ? 'bg-green-900/30 text-green-300 border border-green-700' :
                          project.status === 'Completed' ? 'bg-purple-900/30 text-purple-300 border border-purple-700' :
                          'bg-orange-900/30 text-orange-300 border border-orange-700'
                        }`}>
                          {project.status}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="p-3 border-t-2 border-slate-700 flex items-center justify-between bg-slate-900/50 flex-shrink-0">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-2 hover:bg-blue-600/30 hover:border hover:border-blue-500/50 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition duration-200 text-slate-300 hover:text-blue-300"
                    title="Previous page"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <div className="text-center">
                    <span className="text-xs font-semibold text-blue-400 bg-blue-900/30 px-3 py-1 rounded-full border border-blue-700/50">
                      {currentPage} / {totalPages}
                    </span>
                  </div>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-2 hover:bg-blue-600/30 hover:border hover:border-blue-500/50 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition duration-200 text-slate-300 hover:text-blue-300"
                    title="Next page"
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Project Details */}
          {selectedProject && (
            <div className="lg:col-span-2 flex flex-col">
              <div className="bg-gradient-to-b from-slate-800 to-slate-850 rounded-lg border border-slate-700 shadow-lg overflow-hidden hover:shadow-xl transition-shadow duration-300 flex flex-col">
                <div className="p-6 border-b-2 border-blue-500/30 bg-gradient-to-r from-slate-800 via-slate-700 to-slate-800 flex-shrink-0">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h2 className="text-2xl font-bold text-white">{selectedProject.project_name}</h2>
                      <p className="text-slate-400 text-sm mt-1">👤 {getEmployeeName(selectedProject.assigned_employee_id)}</p>
                      <p className="text-slate-400 text-sm">📅 Started: {selectedProject.start_date}</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleGenerateReport(selectedProject.id)}
                        className="flex items-center gap-1 px-3 py-1.5 bg-gradient-to-r from-green-600 to-green-700 text-white rounded hover:shadow-lg hover:shadow-green-500/50 transition text-sm font-medium"
                      >
                        <Download size={16} />
                        Report
                      </button>
                      <select
                        value={selectedProject.status}
                        onChange={(e) => handleUpdateStatus(selectedProject.id, e.target.value)}
                        className="px-3 py-1.5 bg-slate-700 border border-slate-600 rounded text-sm text-white focus:border-blue-500 focus:outline-none transition"
                      >
                        <option value="Active">Active</option>
                        <option value="Completed">Completed</option>
                        <option value="On-Hold">On-Hold</option>
                      </select>
                    </div>
                  </div>

                  {/* Progress Update */}
                  <div className="bg-slate-700/50 p-4 rounded mt-4">
                    <h3 className="font-bold mb-3 text-white">Update Progress</h3>
                    <div className="space-y-2">
                      <div>
                        <label className="text-sm font-medium text-slate-300">Progress %</label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={progressUpdate.progress_percent}
                          onChange={(e) => setProgressUpdate({ ...progressUpdate, progress_percent: parseInt(e.target.value) })}
                          className="w-full bg-slate-600 border border-slate-500 rounded px-2 py-1 text-white focus:border-blue-500 focus:outline-none transition"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium text-slate-300">Remarks</label>
                        <textarea
                          value={progressUpdate.remarks}
                          onChange={(e) => setProgressUpdate({ ...progressUpdate, remarks: e.target.value })}
                          className="w-full bg-slate-600 border border-slate-500 rounded px-2 py-1 text-white text-sm focus:border-blue-500 focus:outline-none transition"
                          rows={2}
                        />
                      </div>
                      <button
                        onClick={handleUpdateProgress}
                        className="w-full bg-gradient-to-r from-blue-600 to-blue-700 text-white py-1.5 rounded hover:shadow-lg hover:shadow-blue-500/50 transition text-sm font-medium"
                      >
                        Save Progress
                      </button>
                    </div>
                  </div>
                </div>

                {/* Work Logs */}
                <div className="p-6 border-t-2 border-green-500/30 max-h-[500px] overflow-y-auto">
                  <h3 className="font-bold mb-4 text-white flex items-center gap-2 sticky top-0 bg-slate-800 py-2 -mx-6 px-6">
                    <span>⏱</span> Daily Work Sessions
                  </h3>
                  <div className="space-y-3">
                    {paginatedWorkLogs.length === 0 ? (
                      <p className="text-slate-400 text-sm">No work logs yet</p>
                    ) : (
                      paginatedWorkLogs.map(log => (
                        <div key={log.id} className="border border-slate-700 rounded-lg p-4 bg-slate-700/40 hover:bg-slate-700/60 transition">
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <p className="font-semibold text-white">{log.work_date} - Session {log.session_number}</p>
                            </div>
                            <span className={`text-xs px-2 py-1 rounded font-semibold ${
                              log.status === 'APPROVED' ? 'bg-green-900/40 text-green-300 border border-green-700' :
                              log.status === 'SUBMITTED' ? 'bg-blue-900/40 text-blue-300 border border-blue-700' :
                              'bg-slate-600/40 text-slate-300 border border-slate-600'
                            }`}>
                              {log.status}
                            </span>
                          </div>

                          <div className="text-sm mb-3 space-y-1">
                            <p className="text-slate-300"><strong className="text-white">Work Done:</strong> {log.work_done}</p>
                            <p className="text-slate-300"><strong className="text-white">Work Left:</strong> {log.work_left}</p>
                          </div>

                          {log.photo_paths && log.photo_paths.length > 0 && (
                            <div className="mb-3">
                              <p className="text-xs font-medium text-slate-300 mb-2">📸 Photos ({log.photo_paths.length})</p>
                              <div className="flex gap-2 flex-wrap">
                                {log.photo_paths.map((path, i) => (
                                  <img
                                    key={i}
                                    src={path}
                                    alt="work photo"
                                    className="w-16 h-16 rounded-lg object-cover cursor-pointer hover:opacity-75 border border-slate-600 transition"
                                    onClick={() => window.open(path, '_blank')}
                                  />
                                ))}
                              </div>
                            </div>
                          )}

                          {log.status === 'SUBMITTED' && (
                            <button
                              onClick={() => handleApproveWorkLeft(log.id, log.work_left)}
                              className="text-xs bg-gradient-to-r from-green-600 to-green-700 text-white px-3 py-1.5 rounded hover:shadow-lg hover:shadow-green-500/50 transition font-medium"
                            >
                              ✓ Approve & Carry Forward
                            </button>
                          )}
                        </div>
                      ))
                    )}
                  </div>

                  {/* Work Logs Pagination */}
                  {workLogsPages > 1 && (
                    <div className="mt-4 p-3 bg-slate-900/50 border-t border-slate-700 rounded-lg flex items-center justify-between">
                      <button
                        onClick={() => setWorkLogsPage(p => Math.max(1, p - 1))}
                        disabled={workLogsPage === 1}
                        className="p-2 hover:bg-green-600/30 hover:border hover:border-green-500/50 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition duration-200 text-slate-300 hover:text-green-300"
                        title="Previous work logs"
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <span className="text-xs font-semibold text-green-400 bg-green-900/30 px-3 py-1 rounded-full border border-green-700/50">
                        {workLogsPage} / {workLogsPages}
                      </span>
                      <button
                        onClick={() => setWorkLogsPage(p => Math.min(workLogsPages, p + 1))}
                        disabled={workLogsPage === workLogsPages}
                        className="p-2 hover:bg-green-600/30 hover:border hover:border-green-500/50 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition duration-200 text-slate-300 hover:text-green-300"
                        title="Next work logs"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Daily Tasks Section */}
                <div className="p-6 border-t-2 border-amber-500/30 bg-gradient-to-b from-slate-800/50 to-slate-850/50">
                  <div className="flex items-center justify-between mb-4 pb-4 border-b border-amber-500/20">
                    <h3 className="font-bold text-white flex items-center gap-2">
                      <span className="w-1 h-6 bg-gradient-to-b from-amber-500 to-amber-600 rounded"></span>
                      <Calendar size={20} /> Daily Tasks
                    </h3>
                    <button
                      onClick={() => setShowDailyTaskModal(true)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-gradient-to-r from-amber-600 to-amber-700 text-white rounded hover:shadow-lg hover:shadow-amber-500/50 transition text-sm font-medium"
                    >
                      <Plus size={16} />
                      Add Task
                    </button>
                  </div>

                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {dailyTasks.length === 0 ? (
                      <p className="text-slate-400 text-sm">No daily tasks assigned</p>
                    ) : (
                      dailyTasks.map(task => (
                        <div key={task.id} className="border border-slate-700 rounded-lg p-3 bg-slate-700/40 hover:bg-slate-700/60 transition">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <p className="font-semibold text-white text-sm">{task.task_description}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-xs text-slate-400">{task.task_date}</span>
                                <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                                  task.priority === 'high' ? 'bg-red-900/40 text-red-300 border border-red-700' :
                                  task.priority === 'medium' ? 'bg-yellow-900/40 text-yellow-300 border border-yellow-700' :
                                  'bg-green-900/40 text-green-300 border border-green-700'
                                }`}>
                                  {task.priority}
                                </span>
                              </div>
                            </div>
                            <button
                              onClick={() => handleDeleteDailyTask(task.id)}
                              className="p-1 hover:bg-red-900/30 rounded transition text-red-400 hover:text-red-300"
                            >
                              <Trash size={16} />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Create Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-slate-800 rounded-xl p-6 max-w-md w-full border border-slate-700 shadow-2xl">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-white">Create New Project</h2>
                <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-slate-200">✕</button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-300 mb-2">Project Name</label>
                  <input
                    type="text"
                    value={newProject.project_name}
                    onChange={(e) => setNewProject({ ...newProject, project_name: e.target.value })}
                    className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none transition"
                    placeholder="Enter project name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-300 mb-2">Assign to Employee</label>
                  <select
                    value={newProject.assigned_employee_id}
                    onChange={(e) => setNewProject({ ...newProject, assigned_employee_id: e.target.value })}
                    className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white focus:border-blue-500 focus:outline-none transition"
                  >
                    <option value="">Select Employee</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-300 mb-2">Start Date</label>
                  <input
                    type="date"
                    value={newProject.start_date}
                    onChange={(e) => setNewProject({ ...newProject, start_date: e.target.value })}
                    className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white focus:border-blue-500 focus:outline-none transition"
                  />
                </div>

                <div className="flex gap-2 justify-end pt-2">
                  <button
                    onClick={() => setShowCreateModal(false)}
                    className="px-4 py-2 border border-slate-600 rounded hover:bg-slate-700 transition text-slate-300 font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateProject}
                    className="px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded hover:shadow-lg hover:shadow-blue-500/50 transition font-medium"
                  >
                    Create
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        {showDailyTaskModal && selectedProject && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-slate-800 rounded-xl p-6 max-w-md w-full border border-slate-700 shadow-2xl">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-white">Assign Daily Task</h2>
                <button onClick={() => setShowDailyTaskModal(false)} className="text-slate-400 hover:text-slate-200">✕</button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-300 mb-2">Task Date</label>
                  <input
                    type="date"
                    value={newDailyTask.task_date}
                    onChange={(e) => setNewDailyTask({ ...newDailyTask, task_date: e.target.value })}
                    className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white focus:border-blue-500 focus:outline-none transition"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-300 mb-2">Task Description</label>
                  <textarea
                    value={newDailyTask.task_description}
                    onChange={(e) => setNewDailyTask({ ...newDailyTask, task_description: e.target.value })}
                    className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none transition text-sm"
                    placeholder="Enter task details..."
                    rows={4}
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-300 mb-2">Priority</label>
                  <select
                    value={newDailyTask.priority}
                    onChange={(e) => setNewDailyTask({ ...newDailyTask, priority: e.target.value as any })}
                    className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white focus:border-blue-500 focus:outline-none transition"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>

                <div className="flex gap-2 justify-end pt-2">
                  <button
                    onClick={() => setShowDailyTaskModal(false)}
                    className="px-4 py-2 border border-slate-600 rounded hover:bg-slate-700 transition text-slate-300 font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateDailyTask}
                    className="px-4 py-2 bg-gradient-to-r from-amber-600 to-amber-700 text-white rounded hover:shadow-lg hover:shadow-amber-500/50 transition font-medium"
                  >
                    Assign Task
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PMSAdmin;
