import React, { useState, useMemo, useEffect } from 'react';
import api, { safeGet, safePost, extractPayload, ensureArray } from '../src/utils/api';
import { PMSProject, PMSDailyWorkLog, User, Notification } from '../types';
import { Briefcase, Plus, Upload, CheckCircle, Clock, AlertCircle, RefreshCw, Camera, ChevronLeft, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';

interface PMSEmployeeProps {
  currentUser: User;
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

export const PMSEmployee: React.FC<PMSEmployeeProps> = ({ currentUser, addNotification }) => {
  const [assignedProject, setAssignedProject] = useState<any | null>(null);
  const [workLogs, setWorkLogs] = useState<any[]>([]);
  const [dailyTasks, setDailyTasks] = useState<DailyTask[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'TODAY' | 'HISTORY' | 'TASKS'>('TODAY');
  const [currentTaskPage, setCurrentTaskPage] = useState(1);
  const [currentHistoryPage, setCurrentHistoryPage] = useState(1);
  const tasksPerPage = 5;
  const historyPerPage = 5;

  // Form state
  const [session1Work, setSession1Work] = useState({ work_done: '', work_left: '' });
  const [session2Work, setSession2Work] = useState({ work_done: '', work_left: '' });
  const [session1Photos, setSession1Photos] = useState<File[]>([]);
  const [session2Photos, setSession2Photos] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const today = format(new Date(), 'yyyy-MM-dd');
  const employeeId = currentUser.employeeId || String(currentUser.id);

  // Load assigned project
  useEffect(() => {
    loadAssignedProject();
  }, []);

  const loadAssignedProject = async () => {
    try {
      setIsLoading(true);
      const r = await safeGet('pms/projects');
      const projects = ensureArray(extractPayload(r));
      
      // Get first assigned project
      if (projects.length > 0) {
        setAssignedProject(projects[0]);
        loadWorkLogs(projects[0].id);
        loadDailyTasks(projects[0].id);
      }
    } catch (err) {
      console.error('Failed to load project', err);
      addNotification('Error', 'Failed to load assigned project', 'error', currentUser.id);
    } finally {
      setIsLoading(false);
    }
  };

  const loadWorkLogs = async (projectId: string) => {
    try {
      const r = await safeGet(`pms/daily-work?projectId=${projectId}`);
      const logs = ensureArray(extractPayload(r));
      setWorkLogs(logs);

      // Check if today's sessions are already submitted
      const todayLogs = logs.filter(l => l.work_date === today);
      if (todayLogs.length > 0) {
        const session1 = todayLogs.find(l => l.session_number === 1);
        const session2 = todayLogs.find(l => l.session_number === 2);
        
        if (session1) {
          setSession1Work({ work_done: session1.work_done, work_left: session1.work_left });
        }
        if (session2) {
          setSession2Work({ work_done: session2.work_done, work_left: session2.work_left });
        }
      }
    } catch (err) {
      console.error('Failed to load work logs', err);
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

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>, session: 1 | 2) => {
    const files = Array.from(e.target.files || []);
    if (session === 1) {
      setSession1Photos([...session1Photos, ...files]);
    } else {
      setSession2Photos([...session2Photos, ...files]);
    }
  };

  const removePhoto = (session: 1 | 2, index: number) => {
    if (session === 1) {
      setSession1Photos(session1Photos.filter((_, i) => i !== index));
    } else {
      setSession2Photos(session2Photos.filter((_, i) => i !== index));
    }
  };

  const handleSubmitSession = async (sessionNumber: 1 | 2) => {
    if (!assignedProject) return;

    const workData = sessionNumber === 1 ? session1Work : session2Work;
    const photos = sessionNumber === 1 ? session1Photos : session2Photos;

    if (!workData.work_done) {
      alert(`Please enter work done for Session ${sessionNumber}`);
      return;
    }

    try {
      setIsSubmitting(true);

      // 1. Submit work log
      const workR = await safePost('pms/daily-work', {
        project_id: assignedProject.id,
        work_date: today,
        session_number: sessionNumber,
        work_done: workData.work_done,
        work_left: workData.work_left
      });

      const workLog = extractPayload(workR);
      if (!workLog || !workLog.id) {
        throw new Error('Failed to create work log');
      }

      // 2. Upload photos
      for (const photo of photos) {
        const formData = new FormData();
        formData.append('photo', photo);
        formData.append('work_log_id', workLog.id);

        try {
          await api.post('pms/upload-photo', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
          });
        } catch (photoErr) {
          console.warn('Failed to upload photo', photoErr);
        }
      }

      addNotification(
        'Success',
        `Session ${sessionNumber} submitted successfully`,
        'PMS',
        currentUser.id
      );

      // Clear form
      if (sessionNumber === 1) {
        setSession1Work({ work_done: '', work_left: '' });
        setSession1Photos([]);
      } else {
        setSession2Work({ work_done: '', work_left: '' });
        setSession2Photos([]);
      }

      // Reload logs
      loadWorkLogs(assignedProject.id);
    } catch (err) {
      console.error('Failed to submit session', err);
      addNotification('Error', `Failed to submit Session ${sessionNumber}`, 'PMS', currentUser.id);
    } finally {
      setIsSubmitting(false);
    }
  };

  const todayLogs = useMemo(() => {
    return workLogs.filter(l => l.work_date === today);
  }, [workLogs, today]);

  const historyLogs = useMemo(() => {
    return workLogs.filter(l => l.work_date !== today).sort((a, b) => b.work_date.localeCompare(a.work_date));
  }, [workLogs, today]);

  const paginatedHistoryLogs = useMemo(() => {
    const startIdx = (currentHistoryPage - 1) * historyPerPage;
    return historyLogs.slice(startIdx, startIdx + historyPerPage);
  }, [historyLogs, currentHistoryPage]);

  const historyPages = Math.ceil(historyLogs.length / historyPerPage);

  const paginatedTasks = useMemo(() => {
    const startIdx = (currentTaskPage - 1) * tasksPerPage;
    return dailyTasks.slice(startIdx, startIdx + tasksPerPage);
  }, [dailyTasks, currentTaskPage]);

  const tasksPages = Math.ceil(dailyTasks.length / tasksPerPage);

  const todayTasks = useMemo(() => {
    return dailyTasks.filter(t => t.task_date === today);
  }, [dailyTasks, today]);

  if (!assignedProject) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Briefcase size={48} className="text-gray-400 mx-auto mb-4" />
          <p className="text-lg text-gray-600">No project assigned yet</p>
          <p className="text-sm text-gray-500">Contact your admin to assign a project</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-100 p-6 overflow-y-auto flex flex-col">
      <div className="max-w-4xl mx-auto w-full flex flex-col flex-1 overflow-hidden">
        {/* Header */}
        <div className="mb-4 flex-shrink-0">
          <div className="flex items-center gap-4 mb-3">
            <div className="p-3 bg-gradient-to-br from-cyan-600 to-blue-700 rounded-xl">
              <Briefcase size={32} className="text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">My Work</h1>
              <p className="text-slate-400 text-xs mt-1">Project Management System</p>
            </div>
          </div>
          <div className="bg-slate-800 rounded-xl p-3 border border-slate-700">
            <h2 className="text-lg font-bold text-white">{assignedProject?.project_name}</h2>
            <div className="flex gap-4 mt-2 text-xs text-slate-300">
              <span>📅 Started: {assignedProject?.start_date}</span>
              <span className={`px-2 py-1 rounded font-medium ${
                assignedProject?.status === 'Active' ? 'bg-green-900/30 text-green-300 border border-green-700' :
                'bg-slate-700 text-slate-200 border border-slate-600'
              }`}>
                {assignedProject?.status}
              </span>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-4 mb-4 border-b-2 border-slate-700 pb-2 flex-shrink-0 overflow-x-auto">
          <button
            onClick={() => setActiveTab('TODAY')}
            className={`px-4 py-2 font-semibold border-b-2 transition relative ${
              activeTab === 'TODAY'
                ? 'border-blue-500 text-blue-400 shadow-lg shadow-blue-500/20'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <div className="flex items-center gap-2">
              <Clock size={18} />
              Today's Work
            </div>
            {activeTab === 'TODAY' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-blue-600 rounded-t"></div>}
          </button>
          <button
            onClick={() => setActiveTab('HISTORY')}
            className={`px-4 py-2 font-semibold border-b-2 transition relative ${
              activeTab === 'HISTORY'
                ? 'border-green-500 text-green-400 shadow-lg shadow-green-500/20'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <div className="flex items-center gap-2">
              <RefreshCw size={18} />
              History
            </div>
            {activeTab === 'HISTORY' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-green-500 to-green-600 rounded-t"></div>}
          </button>
          <button
            onClick={() => {
              setActiveTab('TASKS');
              setCurrentTaskPage(1);
            }}
            className={`px-4 py-2 font-semibold border-b-2 transition relative ${
              activeTab === 'TASKS'
                ? 'border-amber-500 text-amber-400 shadow-lg shadow-amber-500/20'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <div className="flex items-center gap-2">
              <CheckCircle size={18} />
              Daily Tasks
            </div>
            {activeTab === 'TASKS' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 to-amber-600 rounded-t"></div>}
          </button>
        </div>

        {/* Today's Work */}
        {activeTab === 'TODAY' && (
          <div className="space-y-4 overflow-y-auto flex-1 min-h-0 pr-2">
            {/* Session 1: 10:00 - 02:00 */}
            <div className="bg-slate-800 rounded-lg border border-slate-700 shadow-lg overflow-hidden">
              <div className="p-6 bg-gradient-to-r from-slate-800 to-slate-750 border-b border-slate-700">
                <div className="flex items-center gap-2">
                  <Clock className="text-blue-400" size={24} />
                  <h3 className="text-xl font-bold text-white">Session 1 (10:00 AM - 2:00 PM)</h3>
                </div>
              </div>

              <div className="p-6">
                {todayLogs.find(l => l.session_number === 1) ? (
                  <div className="bg-green-900/20 border border-green-700 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle size={20} className="text-green-400" />
                      <p className="font-semibold text-green-300">Submitted</p>
                    </div>
                    <p className="text-slate-300">
                      <strong className="text-white">Work Done:</strong> {session1Work.work_done}
                    </p>
                    <p className="text-slate-300 mt-1">
                      <strong className="text-white">Work Left:</strong> {session1Work.work_left}
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-semibold text-slate-300 mb-2">Work Completed Today</label>
                        <textarea
                          value={session1Work.work_done}
                          onChange={(e) => setSession1Work({ ...session1Work, work_done: e.target.value })}
                          placeholder="Describe the work completed in this session..."
                          className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none transition text-sm"
                          rows={3}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-slate-300 mb-2">Work Left for Next Day</label>
                        <textarea
                          value={session1Work.work_left}
                          onChange={(e) => setSession1Work({ ...session1Work, work_left: e.target.value })}
                          placeholder="What work is pending and should be carried forward..."
                          className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none transition text-sm"
                          rows={3}
                        />
                      </div>

                      {/* Photo Upload */}
                      <div>
                        <label className="block text-sm font-semibold text-slate-300 mb-3">Upload Photos</label>
                        <div className="border-2 border-dashed border-slate-600 rounded-lg p-4 hover:border-slate-500 transition bg-slate-700/30">
                          <input
                            type="file"
                            multiple
                            accept="image/*"
                            onChange={(e) => handlePhotoSelect(e, 1)}
                            className="hidden"
                            id="session1-photos"
                          />
                          <label
                            htmlFor="session1-photos"
                            className="cursor-pointer flex items-center justify-center gap-2 text-slate-400 hover:text-blue-400 transition"
                          >
                            <Camera size={20} />
                            <span>Click to upload photos</span>
                          </label>
                        </div>

                        {session1Photos.length > 0 && (
                          <div className="mt-3">
                            <p className="text-sm font-medium text-slate-300 mb-2">Selected Photos: {session1Photos.length}</p>
                            <div className="flex flex-wrap gap-2">
                              {session1Photos.map((file, i) => (
                                <div key={i} className="relative">
                                  <img
                                    src={URL.createObjectURL(file)}
                                    alt="preview"
                                    className="w-16 h-16 rounded-lg object-cover border border-slate-600"
                                  />
                                  <button
                                    onClick={() => removePhoto(1, i)}
                                    className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-700 transition"
                                  >
                                    ✕
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      <button
                        onClick={() => handleSubmitSession(1)}
                        disabled={isSubmitting}
                        className="w-full bg-gradient-to-r from-blue-600 to-blue-700 text-white py-2.5 rounded-lg hover:shadow-lg hover:shadow-blue-500/50 disabled:opacity-50 disabled:cursor-not-allowed font-semibold flex items-center justify-center gap-2 transition"
                      >
                        <Upload size={18} />
                        {isSubmitting ? 'Submitting...' : 'Submit Session 1'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Session 2: 02:00 - 06:00 */}
            <div className="bg-slate-800 rounded-lg border border-slate-700 shadow-lg overflow-hidden">
              <div className="p-6 bg-gradient-to-r from-slate-800 to-slate-750 border-b border-slate-700">
                <div className="flex items-center gap-2">
                  <Clock className="text-orange-400" size={24} />
                  <h3 className="text-xl font-bold text-white">Session 2 (2:00 PM - 6:00 PM)</h3>
                </div>
              </div>

              <div className="p-6">
                {todayLogs.find(l => l.session_number === 2) ? (
                  <div className="bg-green-900/20 border border-green-700 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle size={20} className="text-green-400" />
                      <p className="font-semibold text-green-300">Submitted</p>
                    </div>
                    <p className="text-slate-300">
                      <strong className="text-white">Work Done:</strong> {session2Work.work_done}
                    </p>
                    <p className="text-slate-300 mt-1">
                      <strong className="text-white">Work Left:</strong> {session2Work.work_left}
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-semibold text-slate-300 mb-2">Work Completed Today</label>
                        <textarea
                          value={session2Work.work_done}
                          onChange={(e) => setSession2Work({ ...session2Work, work_done: e.target.value })}
                          placeholder="Describe the work completed in this session..."
                          className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none transition text-sm"
                          rows={3}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-slate-300 mb-2">Work Left for Next Day</label>
                        <textarea
                          value={session2Work.work_left}
                          onChange={(e) => setSession2Work({ ...session2Work, work_left: e.target.value })}
                          placeholder="What work is pending and should be carried forward..."
                          className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none transition text-sm"
                          rows={3}
                        />
                      </div>

                      {/* Photo Upload */}
                      <div>
                        <label className="block text-sm font-semibold text-slate-300 mb-3">Upload Photos</label>
                        <div className="border-2 border-dashed border-slate-600 rounded-lg p-4 hover:border-slate-500 transition bg-slate-700/30">
                          <input
                            type="file"
                            multiple
                            accept="image/*"
                            onChange={(e) => handlePhotoSelect(e, 2)}
                            className="hidden"
                            id="session2-photos"
                          />
                          <label
                            htmlFor="session2-photos"
                            className="cursor-pointer flex items-center justify-center gap-2 text-slate-400 hover:text-orange-400 transition"
                          >
                            <Camera size={20} />
                            <span>Click to upload photos</span>
                          </label>
                        </div>

                        {session2Photos.length > 0 && (
                          <div className="mt-3">
                            <p className="text-sm font-medium text-slate-300 mb-2">Selected Photos: {session2Photos.length}</p>
                            <div className="flex flex-wrap gap-2">
                              {session2Photos.map((file, i) => (
                                <div key={i} className="relative">
                                  <img
                                    src={URL.createObjectURL(file)}
                                    alt="preview"
                                    className="w-16 h-16 rounded-lg object-cover border border-slate-600"
                                  />
                                  <button
                                    onClick={() => removePhoto(2, i)}
                                    className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-700 transition"
                                  >
                                    ✕
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      <button
                        onClick={() => handleSubmitSession(2)}
                        disabled={isSubmitting}
                        className="w-full bg-gradient-to-r from-orange-600 to-orange-700 text-white py-2.5 rounded-lg hover:shadow-lg hover:shadow-orange-500/50 disabled:opacity-50 disabled:cursor-not-allowed font-semibold flex items-center justify-center gap-2 transition"
                      >
                        <Upload size={18} />
                        {isSubmitting ? 'Submitting...' : 'Submit Session 2'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* History */}
        {activeTab === 'HISTORY' && (
          <div className="space-y-3 overflow-y-auto flex-1 min-h-0 pr-2">
            {paginatedHistoryLogs.length === 0 ? (
              <div className="bg-slate-800 rounded-lg border border-slate-700 p-6 text-center text-slate-400">
                No work history yet
              </div>
            ) : (
              <div className="space-y-4">
                {paginatedHistoryLogs.map(log => (
                  <div key={log.id} className="bg-slate-800 rounded-lg border border-slate-700 p-4 hover:border-slate-600 transition">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="font-semibold text-white">{log.work_date} - Session {log.session_number}</p>
                        <p className="text-xs text-slate-400 mt-1">{log.createdAt}</p>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded font-semibold ${
                        log.status === 'APPROVED' ? 'bg-green-900/40 text-green-300 border border-green-700' :
                        log.status === 'SUBMITTED' ? 'bg-blue-900/40 text-blue-300 border border-blue-700' :
                        'bg-slate-700/40 text-slate-300 border border-slate-600'
                      }`}>
                        {log.status}
                      </span>
                    </div>

                    <div className="text-sm text-slate-300 space-y-1">
                      <p><strong className="text-white">Work Done:</strong> {log.work_done}</p>
                      <p><strong className="text-white">Work Left:</strong> {log.work_left}</p>
                      {log.approved_work_left && (
                        <p><strong className="text-white">Approved Work Left:</strong> {log.approved_work_left}</p>
                      )}
                    </div>

                    {log.photo_paths && log.photo_paths.length > 0 && (
                      <div className="mt-3">
                        <p className="text-xs font-medium text-slate-300 mb-2">📸 Photos ({log.photo_paths.length})</p>
                        <div className="flex gap-2 flex-wrap max-h-24 overflow-y-auto">
                          {log.photo_paths.map((path, i) => (
                            <img
                              key={i}
                              src={path}
                              alt="work photo"
                              className="w-12 h-12 rounded-lg object-cover cursor-pointer hover:opacity-75 border border-slate-600 transition"
                              onClick={() => window.open(path, '_blank')}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Pagination for History */}
            {historyPages > 1 && (
              <div className="flex items-center justify-between mt-4 p-3 bg-slate-900/50 border-t border-slate-700 rounded-lg">
                <button
                  onClick={() => setCurrentHistoryPage(p => Math.max(1, p - 1))}
                  disabled={currentHistoryPage === 1}
                  className="p-2 hover:bg-green-600/30 hover:border hover:border-green-500/50 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition duration-200 text-slate-300 hover:text-green-300"
                  title="Previous page"
                >
                  <ChevronLeft size={18} />
                </button>
                <span className="text-xs font-semibold text-green-400 bg-green-900/30 px-3 py-1 rounded-full border border-green-700/50">
                  {currentHistoryPage} / {historyPages}
                </span>
                <button
                  onClick={() => setCurrentHistoryPage(p => Math.min(historyPages, p + 1))}
                  disabled={currentHistoryPage === historyPages}
                  className="p-2 hover:bg-green-600/30 hover:border hover:border-green-500/50 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition duration-200 text-slate-300 hover:text-green-300"
                  title="Next page"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Daily Tasks */}
        {activeTab === 'TASKS' && (
          <div className="space-y-3 overflow-y-auto flex-1 min-h-0 pr-2">
            <div className="bg-gradient-to-b from-slate-800 to-slate-850 rounded-lg border border-slate-700 p-4 hover:shadow-lg transition-shadow duration-300">
              <h3 className="font-bold text-white mb-4 flex items-center gap-2 pb-3 border-b border-amber-500/20">
                <span className="w-1 h-5 bg-gradient-to-b from-amber-500 to-amber-600 rounded"></span>
                Today's Tasks ({todayTasks.length})
              </h3>
              {todayTasks.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-4">No tasks assigned for today</p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {todayTasks.map(task => (
                    <div key={task.id} className="border border-slate-700 rounded-lg p-3 bg-slate-700/40 hover:bg-slate-700/60 transition">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="font-semibold text-white text-sm">{task.task_description}</p>
                          <span className={`inline-block text-xs px-2 py-0.5 rounded font-medium mt-1 ${
                            task.priority === 'high' ? 'bg-red-900/40 text-red-300 border border-red-700' :
                            task.priority === 'medium' ? 'bg-yellow-900/40 text-yellow-300 border border-yellow-700' :
                            'bg-green-900/40 text-green-300 border border-green-700'
                          }`}>
                            {task.priority}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-gradient-to-b from-slate-800 to-slate-850 rounded-lg border border-slate-700 p-4 hover:shadow-lg transition-shadow duration-300">
              <h3 className="font-bold text-white mb-4 flex items-center gap-2 pb-3 border-b border-blue-500/20">
                <span className="w-1 h-5 bg-gradient-to-b from-blue-500 to-blue-600 rounded"></span>
                All Tasks
              </h3>
              {paginatedTasks.length === 0 ? (
                <div className="text-center text-slate-400 py-8">No daily tasks assigned</div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {paginatedTasks.map(task => (
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
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Pagination for Tasks */}
              {tasksPages > 1 && (
                <div className="flex items-center justify-between mt-4 p-3 bg-slate-900/50 border-t border-slate-700 rounded-lg">
                  <button
                    onClick={() => setCurrentTaskPage(p => Math.max(1, p - 1))}
                    disabled={currentTaskPage === 1}
                    className="p-2 hover:bg-blue-600/30 hover:border hover:border-blue-500/50 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition duration-200 text-slate-300 hover:text-blue-300"
                    title="Previous page"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <span className="text-xs font-semibold text-blue-400 bg-blue-900/30 px-3 py-1 rounded-full border border-blue-700/50">
                    {currentTaskPage} / {tasksPages}
                  </span>
                  <button
                    onClick={() => setCurrentTaskPage(p => Math.min(tasksPages, p + 1))}
                    disabled={currentTaskPage === tasksPages}
                    className="p-2 hover:bg-blue-600/30 hover:border hover:border-blue-500/50 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition duration-200 text-slate-300 hover:text-blue-300"
                    title="Next page"
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PMSEmployee;
