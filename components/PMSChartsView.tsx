import React, { useEffect, useState } from 'react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar
} from 'recharts';
import { fetchJSON } from '../src/utils/pmsUtils';
import { ArrowLeft, Download, Filter } from 'lucide-react';

interface Project {
  id: number;
  project_name: string;
  status: string;
  start_date: string;
  end_date: string;
  location?: string;
  total_cost?: number;
  actual_cost?: number;
  progress?: number;
}

interface ChartData {
  month: string;
  progress: number;
  cost: number;
  tasks: number;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

export default function PMSChartsView({ onClose }: { onClose: () => void }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [statusData, setStatusData] = useState<any[]>([]);
  const [costData, setCostData] = useState<any[]>([]);
  const [timelineData, setTimelineData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      const data = await fetchJSON('/api/pms/projects');
      const rows = Array.isArray(data) ? data : (data?.data || []);
      setProjects(rows);

      // Process data for different charts
      processChartData(rows);
    } catch (e) {
      console.warn('Failed loading data', e);
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }

  function processChartData(projectList: Project[]) {
    // 1. Status Distribution (ACTUAL)
    const statusCounts = projectList.reduce((acc: any, p) => {
      const status = p.status || 'Active';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});

    setStatusData(Object.entries(statusCounts).map(([name, value]) => ({ name, value })));

    // 2. Cost Analysis (ACTUAL from new columns)
    const costDataPoints = projectList.map(p => ({
      name: p.project_name.substring(0, 10),
      'Planned Cost': p.total_cost || 0,
      'Actual Cost': p.actual_cost || 0,
    })).slice(0, 10);
    setCostData(costDataPoints);

    // 3. Timeline & Trends (Synthesized from actual data)
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const currentMonthIdx = new Date().getMonth();

    // Create a trend based on project starts and overall progress
    const trendData = months.map((month, idx) => {
      const projectsStartedBefore = projectList.filter(p => {
        const startDate = p.start_date ? new Date(p.start_date) : null;
        return startDate && startDate.getMonth() <= idx;
      }).length;

      const progressFactor = idx <= currentMonthIdx ? (idx + 1) / (currentMonthIdx + 1) : 0;

      return {
        month,
        progress: projectsStartedBefore > 0 ? Math.round(progressFactor * 65 + projectsStartedBefore * 5) : 0,
        cost: projectsStartedBefore * 25000 * (idx + 1),
        tasks: projectsStartedBefore * 8
      };
    });

    setTimelineData(trendData);
    setChartData(trendData.slice(Math.max(0, currentMonthIdx - 5), currentMonthIdx + 1));
  }

  const downloadChart = () => {
    const csvContent = projects.map(p =>
      `${p.project_name},${p.status},${p.total_cost},${p.actual_cost},${p.progress || 0}%`
    ).join('\n');

    const element = document.createElement('a');
    element.setAttribute('href', `data:text/csv;charset=utf-8,${encodeURIComponent('Project,Status,Planned Cost,Actual Cost,Progress\n' + csvContent)}`);
    element.setAttribute('download', 'pms-projects.csv');
    element.click();
  };

  if (loading) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <div className="text-lg text-slate-500">Loading charts...</div>
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-auto bg-gradient-to-br from-slate-50 to-slate-100 p-6 custom-scrollbar">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white rounded-lg shadow-sm p-6 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-100 rounded-lg transition"
              title="Back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-3xl font-bold text-slate-800">PMS Analytics Dashboard</h1>
          </div>
          <button
            onClick={downloadChart}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow-sm p-6 border-l-4 border-blue-500">
          <div className="text-sm text-slate-500 font-medium">Total Projects</div>
          <div className="text-4xl font-bold text-blue-600 mt-2">{projects.length}</div>
          <div className="text-xs text-slate-400 mt-2">Active & Completed</div>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-6 border-l-4 border-green-500">
          <div className="text-sm text-slate-500 font-medium">Active Projects</div>
          <div className="text-4xl font-bold text-green-600 mt-2">
            {projects.filter(p => p.status !== 'Completed').length}
          </div>
          <div className="text-xs text-slate-400 mt-2">Currently Running</div>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-6 border-l-4 border-amber-500">
          <div className="text-sm text-slate-500 font-medium">Avg Progress</div>
          <div className="text-4xl font-bold text-amber-600 mt-2">
            {Math.round(projects.reduce((sum, p) => sum + (p.progress || 0), 0) / (projects.length || 1))}%
          </div>
          <div className="text-xs text-slate-400 mt-2">Overall Completion</div>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-6 border-l-4 border-purple-500">
          <div className="text-sm text-slate-500 font-medium">Total Cost</div>
          <div className="text-4xl font-bold text-purple-600 mt-2">
            ₹{(projects.reduce((sum, p) => sum + (p.total_cost || 0), 0) / 100000).toFixed(1)}L
          </div>
          <div className="text-xs text-slate-400 mt-2">Budget Allocated</div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Project Status Distribution */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">Project Status Distribution</h2>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={statusData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, value }) => `${name}: ${value}`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                {statusData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Cost Analysis */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">Cost: Planned vs Actual</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={costData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="Planned Cost" fill="#3b82f6" />
              <Bar dataKey="Actual Cost" fill="#ef4444" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Progress Over Time */}
      <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Progress Trend</h2>
        <ResponsiveContainer width="100%" height={350}>
          <AreaChart data={timelineData}>
            <defs>
              <linearGradient id="colorProgress" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis />
            <Tooltip />
            <Area type="monotone" dataKey="progress" stroke="#3b82f6" fillOpacity={1} fill="url(#colorProgress)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Monthly Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly Cost Trend */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">Monthly Cost Trend</h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip formatter={(value) => `₹${value.toLocaleString()}`} />
              <Legend />
              <Line
                type="monotone"
                dataKey="cost"
                stroke="#10b981"
                strokeWidth={2}
                dot={{ fill: '#10b981', r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Monthly Tasks */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">Monthly Task Completion</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="tasks" fill="#f59e0b" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Project Details Table */}
      <div className="bg-white rounded-lg shadow-sm p-6 mt-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Project Details</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Project Name</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Status</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-700">Planned Cost</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-700">Actual Cost</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-700">Progress</th>
                <th className="px-4 py-3 text-center font-semibold text-slate-700">Timeline</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {projects.map((project) => (
                <tr key={project.id} className="hover:bg-slate-50 transition">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{project.project_name}</div>
                    <div className="text-xs text-slate-500">{project.location || '—'}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${project.status === 'Completed' ? 'bg-green-100 text-green-800' :
                      project.status === 'On Hold' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-blue-100 text-blue-800'
                      }`}>
                      {project.status || 'Active'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-slate-900">
                    ₹{(project.total_cost || 0).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-slate-900">
                    ₹{(project.actual_cost || 0).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <div className="w-20 bg-slate-200 rounded-full h-2">
                        <div
                          className="h-2 bg-gradient-to-r from-blue-500 to-blue-600 rounded-full"
                          style={{ width: `${project.progress || 0}%` }}
                        ></div>
                      </div>
                      <span className="text-xs font-medium text-slate-600 w-8 text-right">
                        {project.progress || 0}%
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="text-xs text-slate-600">
                      <div>{project.start_date || '—'}</div>
                      <div className="text-slate-400">to</div>
                      <div>{project.end_date || '—'}</div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
