import React, { useState, useEffect } from 'react';
import { fetchJSON } from '../src/utils/pmsUtils';
import { ChevronLeft, Plus, Edit, Trash2, Clock } from 'lucide-react';

interface WorkTask {
  id: number;
  task_name: string;
  week_start_date: string;
  planned_work: string;
  priority: string;
  assigned_to: number;
}

interface WorkPlannerViewProps {
  projectId: number | string;
  projectName: string;
  projectStatus?: string;
  onBack: () => void;
}

export default function WorkPlannerView({ projectId, projectName, projectStatus = 'Active', onBack }: WorkPlannerViewProps) {
  const [tasks, setTasks] = useState<WorkTask[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    task_name: '',
    planned_work: '',
    priority: 'Medium'
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    reloadTasks();
  }, [projectId]);

  const reloadTasks = async () => {
    try {
      const r = await fetchJSON(`/api/pms/weekly-tasks?project_id=${projectId}`);
      const rows = Array.isArray(r) ? r : (r && r.data) ? r.data : [];
      setTasks(rows);
    } catch (e) {
      setTasks([]);
    }
  };

  const handleAddPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.task_name || !formData.planned_work) {
      alert('Please fill in all fields');
      return;
    }

    setSubmitting(true);
    try {
      await fetchJSON('/api/pms/weekly-tasks', {
        method: 'POST',
        body: JSON.stringify({
          project_id: projectId,
          task_name: formData.task_name,
          week_start_date: selectedDate,
          planned_work: formData.planned_work,
          priority: formData.priority,
          assigned_to: 0
        })
      });
      setFormData({ task_name: '', planned_work: '', priority: 'Medium' });
      setShowForm(false);
      await reloadTasks();
    } catch (err) {
      console.error(err);
      alert('Failed to add plan');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (taskId: number) => {
    if (!confirm('Delete this task?')) return;
    try {
      await fetchJSON(`/api/pms/weekly-tasks/${taskId}`, { method: 'DELETE' });
      await reloadTasks();
    } catch (err) {
      console.error(err);
      alert('Delete failed');
    }
  };

  const morningTasks = tasks.filter(t => t.priority !== 'Low').length;
  const afternoonTasks = tasks.filter(t => t.priority === 'Low').length;
  const avgProgress = tasks.length > 0 ? Math.round((morningTasks / tasks.length) * 100) : 0;

  return (
    <div className="bg-white min-h-screen overflow-auto custom-scrollbar">
      {/* Header */}
      <div className="border-b border-slate-200 p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="text-slate-600 hover:text-slate-800 flex items-center gap-1"
            >
              <ChevronLeft size={20} />
              Back to Dashboard
            </button>
          </div>
          <span className="px-3 py-1 rounded-full text-sm font-medium bg-emerald-100 text-emerald-700">
            {projectStatus}
          </span>
        </div>

        <h1 className="text-3xl font-bold text-slate-900 mb-2">{projectName} - Work Planner</h1>
        <p className="text-slate-600">Plan and track daily work activities</p>

        {/* Controls */}
        <div className="flex items-center gap-4 mt-6">
          <div className="flex items-center gap-2">
            <Calendar size={20} className="text-indigo-600" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg font-medium"
            />
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium"
          >
            <Plus size={18} />
            Add Work Plan
          </button>
        </div>

        {/* Add Form */}
        {showForm && (
          <form onSubmit={handleAddPlan} className="mt-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div>
                <label className="text-sm font-medium text-slate-700">What To Do</label>
                <input
                  type="text"
                  value={formData.task_name}
                  onChange={(e) => setFormData({ ...formData, task_name: e.target.value })}
                  placeholder="Task name"
                  className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">Planned Work</label>
                <input
                  type="text"
                  value={formData.planned_work}
                  onChange={(e) => setFormData({ ...formData, planned_work: e.target.value })}
                  placeholder="Description"
                  className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">Priority</label>
                <select
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                  className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg"
                >
                  <option>Low</option>
                  <option>Medium</option>
                  <option>High</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-slate-400"
              >
                {submitting ? 'Adding...' : 'Add'}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Work Schedule Table */}
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-slate-900">KBT - Daily Work Planner</h2>
          </div>
          <div className="text-sm text-slate-600">
            <span className="font-semibold">Total Tasks: {tasks.length}</span>
            <span className="ml-6 font-semibold">Avg: {avgProgress}%</span>
          </div>
        </div>

        {tasks.length > 0 ? (
          <div className="overflow-x-auto mb-8 border border-slate-200 rounded-lg">
            <table className="w-full">
              <thead>
                <tr className="bg-indigo-600 text-white">
                  <th className="px-6 py-4 text-left font-bold text-base">Time Slot</th>
                  <th className="px-6 py-4 text-left font-bold text-base">What To Do</th>
                  <th className="px-6 py-4 text-left font-bold text-base">Planned Work</th>
                  <th className="px-6 py-4 text-left font-bold text-base">Actual Work Done</th>
                  <th className="px-6 py-4 text-left font-bold text-base">Progress</th>
                  <th className="px-6 py-4 text-center font-bold text-base">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task, idx) => (
                  <tr key={task.id} className="border-b border-slate-200 hover:bg-slate-50">
                    <td className="px-6 py-4 text-indigo-600 font-bold text-lg">
                      {idx === 0 ? '9:30 - 1:30' : '1:30 - 6:00'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-900 text-base">{task.task_name}</div>
                      <div className="text-sm text-slate-600 mt-1">
                        {task.priority === 'High'
                          ? 'Foundation Work'
                          : task.priority === 'Medium'
                            ? 'Structural Work'
                            : 'Support Work'}
                      </div>
                      <div className="text-xs text-slate-500 mt-1">Note: Good progress</div>
                    </td>
                    <td className="px-6 py-4 text-slate-700">
                      <div className="text-sm">{task.planned_work}</div>
                    </td>
                    <td className="px-6 py-4 text-slate-700">
                      <div className="text-sm">—</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="relative inline-flex items-center">
                          <div className="w-16 h-8 bg-gradient-to-r from-green-400 to-emerald-500 rounded-full flex items-center justify-center">
                            <span className="text-white font-bold text-sm">{(idx + 1) * 40}%</span>
                          </div>
                        </div>
                        <div className="w-20 h-1.5 bg-slate-300 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-green-400 to-emerald-500 rounded-full"
                            style={{ width: `${(idx + 1) * 40}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex justify-center gap-3">
                        <button className="w-8 h-8 rounded-full bg-slate-200 hover:bg-slate-300 flex items-center justify-center text-slate-600 hover:text-slate-800 transition">
                          <Edit size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(task.id)}
                          className="w-8 h-8 rounded-full bg-red-100 hover:bg-red-200 flex items-center justify-center text-red-600 hover:text-red-700 transition"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12 text-slate-500 bg-slate-50 rounded-lg border border-slate-200">
            <Clock size={48} className="mx-auto mb-4 opacity-20" />
            <p>No work plans yet. Add one to get started.</p>
          </div>
        )}

        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-6">
          <div className="bg-white rounded-lg p-6 border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-600 text-sm font-medium">Morning Tasks</p>
                <p className="text-4xl font-bold text-slate-900 mt-2">{morningTasks}</p>
              </div>
              <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center">
                <Clock className="text-blue-600" size={28} />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg p-6 border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-600 text-sm font-medium">Afternoon Tasks</p>
                <p className="text-4xl font-bold text-slate-900 mt-2">{afternoonTasks}</p>
              </div>
              <div className="w-14 h-14 bg-amber-100 rounded-full flex items-center justify-center">
                <Clock className="text-amber-600" size={28} />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg p-6 border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-600 text-sm font-medium">Overall Completion</p>
                <p className="text-4xl font-bold text-emerald-600 mt-2">{avgProgress}%</p>
              </div>
              <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center">
                <span className="text-emerald-600 text-2xl">✓</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Import Calendar icon
function Calendar({ size, className }: { size: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={className}
    >
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}
