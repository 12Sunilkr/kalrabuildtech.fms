
import React, { useState, useEffect } from 'react';
import { Task, TaskStatus, Employee, User, Notification, ExtensionRequest } from '../types';
import { format, isPast, differenceInHours } from 'date-fns';
import { ClipboardList, Plus, Clock, CheckCircle2, AlertTriangle, AlertCircle, Calendar, User as UserIcon, Upload, X, Ban, PauseCircle, ChevronRight, FileText, Trash2, MoreVertical, Search, MessageSquare, Download, Sparkles, Link } from 'lucide-react';
import { AITextEnhancer } from './AITextEnhancer';
import { convertFileToBase64 } from '../utils/fileHelper';
import api, { extractPayload as apiExtractPayload, ensureArray as apiEnsureArray, safeGet } from '../src/utils/api';

const extractPayload = apiExtractPayload;
const ensureArray = apiEnsureArray;

// Note: TaskManager previously stored tasks in localStorage; it now synchronizes with the backend API.

interface TaskManagerProps {
  tasks: Task[];
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  currentUser: User;
  employees: Employee[];
  addNotification: (title: string, msg: string, type: Notification['type'], targetUser: string) => void;
}

export const TaskManager: React.FC<TaskManagerProps> = ({ tasks, setTasks, currentUser, employees, addNotification }) => {
  const [activeTab, setActiveTab] = useState<'ALL' | 'PENDING' | 'HOLD' | 'COMPLETED' | 'OVERDUE' | 'OBJECTIONS' | 'TERMINATE' | 'REJECT'>('ALL');
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showCompleteModal, setShowCompleteModal] = useState<string | null>(null); // Task ID
  const [showObjectionModal, setShowObjectionModal] = useState<string | null>(null); // Task ID

  // Loading / Error states for async operations
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Action Reason Modal State
  const [actionPrompt, setActionPrompt] = useState<{ taskId: string, type: 'HOLD' | 'TERMINATE' | 'DELETE' } | null>(null);
  const [actionReason, setActionReason] = useState('');

  const [mobileMenuOpenId, setMobileMenuOpenId] = useState<string | null>(null); // For mobile 3-dots menu
  const [searchTerm, setSearchTerm] = useState(''); // Text Search
  const [searchDateFrom, setSearchDateFrom] = useState(''); // Date Search From
  const [searchDateTo, setSearchDateTo] = useState(''); // Date Search To

  // Form States for New Task
  const [newTask, setNewTask] = useState<Partial<Task>>({ priority: 'MEDIUM' });
  const [usersList, setUsersList] = useState<User[]>([]);
  // store selected assignee as EMPLOYEE ID (string) to show all employees added in the app
  const [newAssignedUserId, setNewAssignedUserId] = useState<string | ''>('');
  const [attachment, setAttachment] = useState<string | null>(null);

  // Form States for Completion/Objection
  const [processNote, setProcessNote] = useState('');
  const [extensionDate, setExtensionDate] = useState('');
  const [extensionReason, setExtensionReason] = useState('');

  const isAdmin = currentUser.role === 'ADMIN';

  // Close mobile menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setMobileMenuOpenId(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  // Refresh tasks on mount and when currentUser changes
  useEffect(() => {
    fetchTasks();
    fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  const fetchUsers = async () => {
    try {
      const r = await safeGet('/users');
      const p = apiExtractPayload(r) as any;
      const arr = Array.isArray(p) ? p : (p && p.data) || p;
      setUsersList(Array.isArray(arr) ? arr : []);
    } catch (e) {
      console.warn('Failed to fetch users', e);
    }
  };

  // --- Helper for Overdue Logic ---
  const isSameDay = (d1: Date, d2: Date) => {
    return d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate();
  };

  // Check for auto-overdue visual
  const getDisplayStatus = (task: Task): TaskStatus => {
    // If task has been completed, consider it COMPLETED regardless of due date/status
    if (task.completionDate) return 'COMPLETED';

    // If pending and due date is strictly in the past (not today), it is OVERDUE
    const dueDateObj = task.dueDate ? new Date(task.dueDate) : null;
    const isValidDate = dueDateObj && !isNaN(dueDateObj.getTime());
    if ((task.status || '').toUpperCase() === 'PENDING' && isValidDate && isPast(dueDateObj!) && !isSameDay(new Date(), dueDateObj!)) {
      return 'OVERDUE';
    }

    return (task.status || '') as TaskStatus;
  };

  // Helper: consider tasks with completionDate as completed
  const isTaskCompleted = (task: Task) => {
    return !!task.completionDate || (task.status || '').toUpperCase() === 'COMPLETED';
  };

  // --- File Upload Handler ---
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      try {
        const base64 = await convertFileToBase64(e.target.files[0]);
        setAttachment(base64);
      } catch (err) {
        addNotification('System Error', 'Failed to upload task attachment. Please try again.', 'SYSTEM', String(currentUser.id));
      }
    }
  };

  // --- Fetch tasks from server for current user (admin fetches all) ---
  const fetchTasks = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // The API returns tasks for the logged-in user when called as GET /api/tasks
      const r = await safeGet('/tasks');
      const payload = extractPayload(r);
      setTasks(ensureArray(payload));
    } catch (e) {
      console.warn('Failed to fetch tasks', e);
      setError('Failed to load tasks');
    } finally {
      setIsLoading(false);
    }
  };

  // --- Export Functionality ---
  const handleExportTasks = () => {
    // 1. Define Headers matching the request
    const headers = [
      'Task Id',
      'GIVEN BY',
      'GIVEN TO',
      'GIVEN TO USER ID',
      'TASK DESCRIPTION',
      'DEPARTMENT',
      'TASK FREQUENCY',
      'PLANNED DATE',
      'COMPLETED ON',
      'STATUS',
      'OBJECTION DATE',
      'OBJECTION REASON',
      'ADMIN/SYSTEM REMARKS'
    ];

    // 2. Map Data
    const csvContent = tasks.map(t => {
      const assignedEmp = employees.find(e => e.id === (t.assignedTo || t.assignedToEmployeeId || ''));
      const assignedEmpName = assignedEmp?.name || 'Unknown';
      const department = assignedEmp?.department || 'General';
      const displayStatus = getDisplayStatus(t);

      // Escape special characters for CSV (quotes, commas, newlines)
      const escape = (text: string | undefined | null) => {
        if (!text) return '';
        const escaped = text.toString().replace(/"/g, '""'); // Escape double quotes
        return `"${escaped}"`; // Wrap in quotes
      };

      // Combine Title and Description
      const fullDescription = `${t.title} - ${t.description}`;

      // Extract Latest Objection Details
      const latestObjection = t.extensionRequest;
      const objectionDate = latestObjection ? latestObjection.requestedDate : '';
      const objectionReason = latestObjection ? latestObjection.reason : '';

      // Aggregate Other Remarks
      let otherRemarks = [];

      // Admin Action Notes
      if (t.statusNote) {
        otherRemarks.push(`Admin Note: ${t.statusNote}`);
      }

      // Completion Notes
      if (t.completionProcess) {
        otherRemarks.push(`Completion Note: ${t.completionProcess}`);
      }

      // Extension Status
      if (latestObjection) {
        otherRemarks.push(`Objection Status: ${latestObjection.status}`);
      }

      const remarksString = otherRemarks.join(' | ');

      return [
        escape(t.id),
        escape(t.assignedBy),
        escape(assignedEmpName),
        escape(t.assignedTo),
        escape(fullDescription),
        escape(department),
        escape("One-time"), // Standard tasks are usually one-time
        escape(t.dueDate),
        escape(t.completionDate || ''),
        escape(displayStatus),
        escape(objectionDate),
        escape(objectionReason),
        escape(remarksString)
      ].join(',');
    });

    // 3. Combine Headers and Data
    const csvString = [headers.join(','), ...csvContent].join('\n');

    // 4. Trigger Download
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `FMS_Tasks_Structure_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- Actions ---

  const createTask = async () => {
    // Require a selected user from the Assign dropdown (we use newAssignedUserId)
    if (!(newTask.title && (newAssignedUserId !== '' && newAssignedUserId != null) && newTask.dueDate)) {
      setError('Please provide title, assignee and due date');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      // selected assignee is an employee ID (string)
      const selectedEmployeeId = String(newAssignedUserId || '');
      // Try to resolve numeric user id (assigned_to) from usersList using employeeId matching
      const matchedUser = usersList.find(u => String(u.employeeId) === selectedEmployeeId);
      const assigned_to_numeric = matchedUser ? Number(matchedUser.id) : null;

      // Keep local task state consistent: assignedTo should be employee id
      setNewTask(prev => ({ ...prev, assignedTo: selectedEmployeeId }));

      const payload: any = {
        title: newTask.title,
        description: newTask.description || '',
        // server accepts either employee-id (assignedTo) or numeric user id (assigned_to). Provide both when available.
        assignedTo: selectedEmployeeId,
        assigned_to: assigned_to_numeric || null,
        assigned_by: Number(currentUser.id),
        dueDate: newTask.dueDate,
        priority: newTask.priority || 'MEDIUM',
        attachment: attachment || null,
        externalLink: newTask.externalLink || null
      };
      console.log('TaskManager.createTask -> POST /tasks payload:', payload);
      const r = await api.post('/tasks', payload);
      console.log('TaskManager.createTask -> POST /tasks response:', r && r.data ? r.data : r);
      // Use returned task to update local state immediately so DB writes are not lost
      let newId = '';
      try {
        const created = extractPayload(r);
        if (created) {
          // If API returned created resource (object or array), add to local list
          const createdTask = Array.isArray(created) ? created[0] : (created.task || created);
          if (createdTask && createdTask.id) newId = createdTask.id;
          setTasks(prev => [createdTask as Task, ...prev]);
        }
      } catch (e) {
        console.warn('Could not extract created task, continuing to refresh', e && (e.stack || e.message || e));
      }
      // Refresh tasks view (admin fetches all, employees fetch self). If this fails, keep local optimistic copy.
      try { await fetchTasks(); } catch (e) { console.warn('Refresh after create failed, keeping optimistic state', e && (e.stack || e.message || e)); }
      setShowAssignModal(false);
      setNewTask({ priority: 'MEDIUM' });
      setAttachment(null);
      // Clear selected assignee
      setNewAssignedUserId('');
      // Notify using the employee id if available, otherwise numeric id
      addNotification('New Task', `Task ${newId ? newId : ''} "${payload.title}" assigned successfully.`, 'TASK', String(payload.assignedTo || payload.assigned_to));
    } catch (err: any) {
      console.error('Create task failed', err);
      const message = err && err.response && (err.response.data?.message || err.response.data?.error) ? (err.response.data.message || err.response.data.error) : (err && err.message) || 'Failed to create task';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCompleteTask = async (taskId: string) => {
    if (!processNote.trim()) {
      setError('Please provide a process description of how you completed this task.');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const payload = {
        status: 'COMPLETED',
        completionDate: new Date().toISOString().split('T')[0],
        completionProcess: processNote,
        completionAttachment: attachment || null
      };
      await api.put(`/tasks/${taskId}`, payload);
      // Optimistic UI update
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'COMPLETED', completionDate: payload.completionDate, completionProcess: payload.completionProcess, completionAttachment: payload.completionAttachment } : t));
      await fetchTasks();
      setShowCompleteModal(null);
      setProcessNote('');
      setAttachment(null);
      addNotification('Task Completed', `Task ${taskId} marked as completed by ${currentUser.name}.`, 'TASK', String('ADMIN'));
    } catch (e) {
      console.error('Complete task failed', e);
      setError('Failed to complete task');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRaiseObjection = async (taskId: string) => {
    if (!extensionDate.trim()) {
      setError('Please provide a proposed new deadline date.');
      return;
    }
    if (!extensionReason.trim()) {
      setError('Please provide a reason for the extension request.');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const newReq: ExtensionRequest = {
        requestedDate: extensionDate,
        reason: extensionReason,
        status: 'PENDING',
        timestamp: new Date().toISOString()
      };
      // Update extensionRequest and extensionHistory on the server
      // Fetch existing task to build new history
      const res = await safeGet('/tasks');
      const payload = extractPayload(res);
      const allTasks = ensureArray(payload);
      const task = tasks.find(t => t.id === taskId) || allTasks.find((x: any) => x.id === taskId);
      const newHistory = [...(task?.extensionHistory || []), newReq];
      await api.put(`/tasks/${taskId}`, { status: 'EXTENSION_REQUESTED', extensionRequest: newReq, extensionHistory: newHistory });
      await fetchTasks();
      setShowObjectionModal(null);
      setExtensionDate('');
      setExtensionReason('');
      addNotification('Task Alert', `Extension requested for Task ${taskId} by ${currentUser.name}.`, 'TASK', String('ADMIN'));
    } catch (e) {
      console.error('Raise objection failed', e);
      setError('Failed to raise extension request');
    } finally {
      setIsLoading(false);
    }
  };

  const initiateAdminAction = (taskId: string, type: 'HOLD' | 'TERMINATE' | 'DELETE') => {
    setActionPrompt({ taskId, type });
    setActionReason('');
  };

  const confirmAdminAction = async () => {
    if (!actionPrompt) return;
    
    const { taskId, type } = actionPrompt;
    if (!actionReason.trim()) {
      setError(`Please provide a reason before performing the ${type.toLowerCase()} action.`);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      if (type === 'DELETE') {
        // Permanently delete the task from the database
        await api.delete(`/tasks/${taskId}`);

        // Optimistically remove from local state
        let assigned: any = null;
        setTasks(prev => {
          const taskToDelete = prev.find(t => t.id === taskId);
          if (taskToDelete) assigned = taskToDelete.assignedTo;
          return prev.filter(t => t.id !== taskId);
        });

        if (assigned) addNotification('Task Deleted', `Task ${taskId} was permanently deleted by Admin.`, 'TASK', String(assigned));
      } else {
        // For HOLD and TERMINATE, update status instead
        const newStatus = type === 'HOLD' ? 'HOLD' : 'TERMINATED';
        // When terminating, clear extension request so it doesn't appear in objections
        const updatePayload = type === 'TERMINATE'
          ? { status: newStatus, statusNote: actionReason, extensionRequest: null, extensionHistory: [] }
          : { status: newStatus, statusNote: actionReason };

        // Persist change on server
        await api.put(`/tasks/${taskId}`, updatePayload);

        // Optimistically update local tasks so UI reflects immediately and avoid stale-state issues
        let assigned: any = null;
        setTasks(prev => prev.map(t => {
          if (t.id === taskId) {
            assigned = t.assignedTo;
            return type === 'TERMINATE'
              ? { ...t, status: newStatus, statusNote: actionReason, extensionRequest: null, extensionHistory: [] }
              : { ...t, status: newStatus, statusNote: actionReason };
          }
          return t;
        }));

        if (assigned) addNotification('Task Update', `Task ${taskId} was ${type.toLowerCase()}ed by Admin.`, 'TASK', String(assigned));
      }

      // Keep server-authoritative data in sync
      await fetchTasks();
    } catch (e) {
      console.error('Admin action failed', e);
      setError('Failed to perform admin action');
    } finally {
      setIsLoading(false);
      setActionPrompt(null);
      setActionReason('');
    }
  };

  const handleResumeTask = async (taskId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      await api.put(`/tasks/${taskId}`, { status: 'PENDING', statusNote: null });
      // Optimistic UI update
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'PENDING', statusNote: null } : t));
      await fetchTasks();
      const task = tasks.find(t => t.id === taskId);
      if (task) addNotification('Task Resumed', `Task ${taskId} is now active again.`, 'TASK', String(task.assignedTo));
    } catch (e) {
      console.error('Resume task failed', e);
      setError('Failed to resume task');
    } finally {
      setIsLoading(false);
    }
  };

  const handleExtensionResponse = async (taskId: string, approved: boolean) => {
    setIsLoading(true);
    setError(null);
    console.log('handleExtensionResponse start', { taskId, approved });
    try {
      // Fetch existing task to update its history
      const res = await safeGet('/tasks');
      const payload = extractPayload(res);
      const allTasks = ensureArray(payload);
      const t = allTasks.find((x: any) => x.id === taskId);
      if (!t) throw new Error('Task not found');

      let newHistory = t.extensionHistory || [];
      if (newHistory.length > 0) {
        const lastIndex = newHistory.length - 1;
        newHistory = [
          ...newHistory.slice(0, lastIndex),
          { ...newHistory[lastIndex], status: approved ? 'APPROVED' : 'REJECTED' }
        ];
      }

      if (approved && t.extensionRequest) {
        // Approving: move due date forward and set back to pending
        await api.put(`/tasks/${taskId}`, { status: 'PENDING', dueDate: t.extensionRequest.requestedDate, extensionRequest: { ...t.extensionRequest, status: 'APPROVED' }, extensionHistory: newHistory, statusNote: null });
        console.log('handleExtensionResponse: approved put completed', { taskId, newDate: t.extensionRequest.requestedDate });

        // Optimistic UI update
        setTasks(prev => prev.map(task => task.id === taskId ? { ...task, status: 'PENDING', dueDate: t.extensionRequest.requestedDate, extensionRequest: { ...t.extensionRequest, status: 'APPROVED' }, extensionHistory: newHistory, statusNote: null } : task));

      } else if (!approved && t.extensionRequest) {
        // Rejecting: keep task as PENDING (do not set to OVERDUE) and record admin rejection note
        const rejectionNote = `Extension rejected by ${currentUser.name}`;
        const updatedReq = { ...t.extensionRequest, status: 'REJECTED', adminResponse: rejectionNote };

        await api.put(`/tasks/${taskId}`, { status: 'PENDING', extensionRequest: updatedReq, extensionHistory: newHistory, statusNote: rejectionNote });
        console.log('handleExtensionResponse: rejected put completed', { taskId, note: rejectionNote });

        // Optimistic UI update
        setTasks(prev => prev.map(task => task.id === taskId ? { ...task, status: 'PENDING', extensionRequest: updatedReq, extensionHistory: newHistory, statusNote: rejectionNote } : task));
      }

      // Keep server in sync
      await fetchTasks();
      if (t) addNotification('Extension Request', `Your extension request for Task ${taskId} was ${approved ? 'Approved' : 'Rejected'}.`, 'TASK', String(t.assignedTo));
    } catch (e) {
      console.error('Extension response failed', e);
      setError('Failed to update extension request');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAcknowledgeRejection = async (taskId: string, acknowledgedBy: 'DOER' | 'ADMIN') => {
    setIsLoading(true);
    setError(null);
    try {
      const task = tasks.find(t => t.id === taskId);
      const currentRejections = (task as any)?.rejectionCount || 0;

      // Doer acknowledging → task moves to OVERDUE (extension denied, task is now late)
      // Admin acknowledging → task moves back to PENDING (admin reviewed & resets)
      const newStatus = acknowledgedBy === 'DOER' ? 'OVERDUE' : 'PENDING';

      await api.put(`/tasks/${taskId}`, {
        status: newStatus,
        extensionRequest: null,
        statusNote: null,
        rejectionCount: acknowledgedBy === 'DOER' ? currentRejections + 1 : currentRejections
      });

      setTasks(prev => prev.map(t => t.id === taskId ? {
        ...t,
        status: newStatus,
        extensionRequest: null,
        statusNote: null,
        rejectionCount: acknowledgedBy === 'DOER' ? currentRejections + 1 : currentRejections
      } : t));

      await fetchTasks();
      const msg = acknowledgedBy === 'DOER'
        ? `Task ${taskId} moved to Overdue — extension rejected and acknowledged.`
        : `Task ${taskId} reset to Pending by Admin after rejection review.`;
      addNotification('Acknowledged', msg, 'TASK', String(currentUser.id));
      // Auto-navigate to destination tab so user sees the task immediately
      setActiveTab(acknowledgedBy === 'DOER' ? 'OVERDUE' : 'PENDING');
    } catch (e) {
      console.error('Acknowledge rejection failed', e);
      setError('Failed to acknowledge rejection');
    } finally {
      setIsLoading(false);
    }
  };

  // --- Filtering ---

  // Employees see tasks assigned TO them OR tasks assigned BY them
  const safeTasks = ensureArray(tasks);
  const relevantTasks = safeTasks.filter(t => {
    const assignedToId = (t.assignedTo || t.assignedToEmployeeId || '').toString();
    const assignedByName = (t.assignedBy || t.assignedByName || '').toString();

    const matchesAssignedTo = assignedToId && currentUser.employeeId && assignedToId === currentUser.employeeId.toString();
    const matchesAssignedBy = assignedByName && (
      assignedByName === currentUser.employeeId?.toString() ||
      assignedByName === currentUser.id?.toString() ||
      assignedByName === currentUser.name
    );

    // Admins should see all tasks; non-admins see tasks assigned TO them or assigned BY them
    if (isAdmin) return true;
    return Boolean(matchesAssignedTo || matchesAssignedBy);
  });

  const filteredTasks = relevantTasks.filter(t => {
    const displayStatus = getDisplayStatus(t);

    // 1. Tab Filter
    let matchesTab = true;
    if (activeTab === 'PENDING') {
      // Pending tab should show only tasks with status 'PENDING' (exclude HOLD/EXTENSION_REQUESTED)
      matchesTab = (displayStatus === 'PENDING');
    } else if (activeTab === 'HOLD') {
      // Hold tab shows tasks explicitly put on HOLD
      matchesTab = (displayStatus === 'HOLD' || t.status === 'HOLD');
    } else if (activeTab === 'COMPLETED') {
      matchesTab = (displayStatus === 'COMPLETED' || displayStatus === 'TERMINATED');
    } else if (activeTab === 'OVERDUE') {
      // Overdue tab should show calculated OVERDUE items
      matchesTab = (displayStatus === 'OVERDUE');
    } else if (activeTab === 'OBJECTIONS') {
      // Objections tab: pending extension requests only
      // Exclude tasks already acknowledged (OVERDUE/PENDING/COMPLETED/TERMINATED)
      matchesTab = Boolean(
        t.extensionRequest &&
        t.extensionRequest.status === 'PENDING' &&
        t.status === 'EXTENSION_REQUESTED' &&
        displayStatus !== 'TERMINATED' &&
        displayStatus !== 'COMPLETED' &&
        displayStatus !== 'OVERDUE' &&
        displayStatus !== 'PENDING'
      );
    } else if (activeTab === 'TERMINATE') {
      // Terminate tab shows tasks with TERMINATED status
      matchesTab = (t.status === 'TERMINATED');
    } else if (activeTab === 'REJECT') {
      // Reject tab: rejected extension requests awaiting acknowledgement
      // Once acknowledged the task moves to OVERDUE or PENDING — exclude those here
      matchesTab = Boolean(
        t.extensionRequest &&
        t.extensionRequest.status === 'REJECTED' &&
        displayStatus !== 'COMPLETED' &&
        displayStatus !== 'TERMINATED' &&
        displayStatus !== 'OVERDUE' &&
        displayStatus !== 'PENDING'
      );
    }

    // 2. Search Filter (Text)
    const term = searchTerm.toLowerCase();
    const assigneeEmp = employees.find(e => e.id === (t.assignedTo || (t as any).assignedToEmployeeId || ''));
    const assigneeName = assigneeEmp ? (assigneeEmp.name || '').toLowerCase() : '';
    const assignedByName = (t.assignedByName || '').toString().toLowerCase();
    const matchesSearch =
      (t.title || '').toLowerCase().includes(term) ||
      (t.description || '').toLowerCase().includes(term) ||
      (t.id || '').toLowerCase().includes(term) ||
      assigneeName.includes(term) ||
      assignedByName.includes(term);

    // 3. Search Filter (Date)
    let matchesDate = true;
    if (searchDateFrom || searchDateTo) {
      const normalizeTaskDate = (dStr?: string | null) => {
          if (!dStr) return '';
          try {
              const d = new Date(dStr);
              if (isNaN(d.getTime())) return '';
              return d.toISOString().split('T')[0];
          } catch {
              return '';
          }
      };
      
      const due = normalizeTaskDate(t.dueDate);
      const created = normalizeTaskDate(t.createdDate);
      
      if (searchDateFrom && searchDateTo) {
        matchesDate = (due && due >= searchDateFrom && due <= searchDateTo) || (created && created >= searchDateFrom && created <= searchDateTo);
      } else {
        const singleDate = searchDateFrom || searchDateTo;
        matchesDate = (due === singleDate) || (created === singleDate);
      }
    }

    return matchesTab && matchesSearch && matchesDate;
  });

  const totalCount = relevantTasks.length;
  const pendingCount = relevantTasks.filter(t => getDisplayStatus(t) === 'PENDING').length;
  const holdCount = relevantTasks.filter(t => getDisplayStatus(t) === 'HOLD' || t.status === 'HOLD').length;
  const completedCount = relevantTasks.filter(t => {
    const ds = getDisplayStatus(t);
    return ds === 'COMPLETED' || ds === 'TERMINATED';
  }).length;
  const overdueCount = relevantTasks.filter(t => getDisplayStatus(t) === 'OVERDUE').length;
  const objectionCount = relevantTasks.filter(t => {
    const ds = getDisplayStatus(t);
    return Boolean(
      t.extensionRequest &&
      t.extensionRequest.status === 'PENDING' &&
      t.status === 'EXTENSION_REQUESTED' &&
      ds !== 'TERMINATED' && ds !== 'COMPLETED' && ds !== 'OVERDUE' && ds !== 'PENDING'
    );
  }).length;
  const terminateCount = relevantTasks.filter(t => getDisplayStatus(t) === 'TERMINATED' || t.status === 'TERMINATED').length;
  const rejectCount = relevantTasks.filter(t => {
    const ds = getDisplayStatus(t);
    return Boolean(
      t.extensionRequest &&
      t.extensionRequest.status === 'REJECTED' &&
      ds !== 'COMPLETED' && ds !== 'TERMINATED' && ds !== 'OVERDUE' && ds !== 'PENDING'
    );
  }).length;

  const getPriorityColor = (p: string) => {
    switch (p) {
      case 'HIGH': return 'bg-red-100 text-red-700 border-red-200';
      case 'MEDIUM': return 'bg-orange-100 text-orange-700 border-orange-200';
      default: return 'bg-blue-100 text-blue-700 border-blue-200';
    }
  };

  const getStatusColor = (s: TaskStatus) => {
    switch (s) {
      case 'COMPLETED': return 'bg-green-100 text-green-700 border-green-200';
      case 'PENDING': return 'bg-slate-100 text-slate-700 border-slate-200';
      case 'OVERDUE': return 'bg-red-50 text-red-600 border-red-200';
      case 'HOLD': return 'bg-yellow-50 text-yellow-600 border-yellow-200';
      case 'TERMINATED': return 'bg-gray-200 text-gray-500 border-gray-300';
      case 'EXTENSION_REQUESTED': return 'bg-purple-50 text-purple-600 border-purple-200';
      default: return 'bg-slate-100';
    }
  };

  // Helper to check if task is "New" (created in last 48 hours)
  const isNewTask = (dateStr?: string) => {
    if (!dateStr) return false;
    const created = new Date(dateStr);
    if (isNaN(created.getTime())) return false;
    return differenceInHours(new Date(), created) < 48;
  };

  const renderActionButtons = (task: Task, isMobile: boolean) => {
    const displayStatus = getDisplayStatus(task);
    const isTaskOverdue = displayStatus === 'OVERDUE';
    const assignedToId = (task.assignedTo || (task as any).assignedToEmployeeId || '').toString();
    const isCreator = (task.assignedBy === currentUser.name) || (task.assignedBy === currentUser.employeeId) || (String(task.assignedBy) === String(currentUser.id)) || (task.assignedByName === currentUser.name);
    const isAssignee = assignedToId && currentUser.employeeId && assignedToId === currentUser.employeeId.toString();

    const btnBaseClass = isMobile
      ? "w-full py-3 px-4 text-left text-sm font-bold flex items-center gap-3 hover:bg-slate-50 rounded-lg transition-colors text-slate-700"
      : "w-full py-2 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors";

    return (
      <>
        {/* Completion Actions (For Assignee) */}
        {isAssignee && displayStatus !== 'COMPLETED' && displayStatus !== 'TERMINATED' && displayStatus !== 'HOLD' && (
          <>
            <button
              onClick={() => setShowCompleteModal(task.id)}
              className={isMobile ? `${btnBaseClass} text-indigo-600 bg-indigo-50` : `${btnBaseClass} bg-indigo-600 hover:bg-indigo-700 text-white shadow-md`}
            >
              <CheckCircle2 size={isMobile ? 18 : 16} /> Complete Task
            </button>
            {(isTaskOverdue || displayStatus === 'PENDING') && (
              <button
                onClick={() => setShowObjectionModal(task.id)}
                className={isMobile ? btnBaseClass : `${btnBaseClass} bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 hover:text-red-600`}
              >
                <AlertTriangle size={isMobile ? 18 : 16} /> Raise Objection
              </button>
            )}
          </>
        )}

        {/* Management Actions (For Admin or Creator) */}
        {(isAdmin || isCreator) && displayStatus !== 'COMPLETED' && displayStatus !== 'TERMINATED' && (
          <>
            {displayStatus !== 'HOLD' ? (
              <button
                onClick={() => initiateAdminAction(task.id, 'HOLD')}
                className={isMobile ? btnBaseClass : `${btnBaseClass} bg-white border border-yellow-200 text-yellow-600 hover:bg-yellow-50`}
              >
                <PauseCircle size={isMobile ? 18 : 14} /> Hold Task
              </button>
            ) : (
              <button
                onClick={() => handleResumeTask(task.id)}
                className={isMobile ? btnBaseClass : `${btnBaseClass} bg-yellow-100 text-yellow-700 hover:bg-yellow-200`}
              >
                <Clock size={isMobile ? 18 : 14} /> Resume Task
              </button>
            )}

            <button
              onClick={() => initiateAdminAction(task.id, 'TERMINATE')}
              className={isMobile ? btnBaseClass : `${btnBaseClass} bg-white border border-red-200 text-red-600 hover:bg-red-50`}
            >
              <Ban size={isMobile ? 18 : 14} /> Terminate
            </button>
          </>
        )}

        {/* Admin Only Delete */}
        {isAdmin && (
          <button
            onClick={() => initiateAdminAction(task.id, 'DELETE')}
            className={isMobile ? `${btnBaseClass} text-red-600 hover:bg-red-50` : `${btnBaseClass} bg-slate-50 border border-slate-200 text-slate-400 hover:bg-red-50 hover:text-red-600 hover:border-red-200 mt-auto`}
          >
            <Trash2 size={isMobile ? 18 : 14} /> Delete
          </button>
        )}
      </>
    );
  };

  return (
    <div className="p-4 md:p-8 bg-gradient-to-br from-slate-50 via-white to-slate-50 h-full overflow-y-auto custom-scrollbar">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-10 animate-fade-in-up">
        <div className="flex items-center gap-5">
          <div className="w-16 h-16 bg-gradient-to-tr from-indigo-600 to-violet-700 text-white rounded-2xl flex items-center justify-center shadow-xl shadow-indigo-100 rotate-3 hover:rotate-0 transition-transform duration-300 shrink-0">
            <ClipboardList size={32} />
          </div>
          <div>
            <h2 className="text-3xl md:text-4xl font-black text-slate-800 tracking-tight">Task Manager</h2>
            <p className="text-slate-500 font-semibold tracking-wide flex items-center gap-2">
              <Clock size={16} className="text-indigo-500" />
              Assign tasks and track progress
            </p>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-4 w-full md:w-auto">
          {isAdmin && (
            <>
              <button
                onClick={handleExportTasks}
                className="w-full md:w-auto bg-white/80 backdrop-blur-sm border border-slate-200 text-slate-700 px-6 py-3.5 rounded-2xl flex items-center justify-center gap-2 transition-all hover:bg-white hover:shadow-lg active:scale-95 font-bold"
              >
                <Download size={20} />
                Export Data
              </button>
              <button
                onClick={() => setShowAssignModal(true)}
                className="w-full md:w-auto bg-gradient-to-r from-indigo-600 to-violet-700 hover:from-indigo-700 hover:to-violet-800 text-white px-8 py-3.5 rounded-2xl flex items-center justify-center gap-3 shadow-xl shadow-indigo-200 transition-all active:scale-95 font-bold"
              >
                <Plus size={24} className="animate-pulse" />
                Assign New Task
              </button>
            </>
          )}
        </div>
      </div>

      {/* Search and Filter Row */}
      <div className="flex flex-col gap-6 mb-8 animate-fade-in-up" style={{ animationDelay: '100ms' }}>

        {/* Top Row: Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-4 scrollbar-hide w-full bg-white/50 p-2 rounded-2xl border border-slate-100 backdrop-blur-sm">
          {['ALL', 'PENDING', 'HOLD', 'COMPLETED', 'OVERDUE', 'OBJECTIONS', 'TERMINATE', 'REJECT'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${activeTab === tab
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100'
                  : 'text-slate-500 hover:bg-white hover:text-indigo-600'
                }`}
            >
              {tab === 'ALL' ? `All (${totalCount})` : tab === 'PENDING' ? `Pending (${pendingCount})` : tab === 'HOLD' ? `Hold (${holdCount})` : tab === 'COMPLETED' ? `Completed (${completedCount})` : tab === 'OVERDUE' ? `Overdue (${overdueCount})` : tab === 'OBJECTIONS' ? `Objections (${objectionCount})` : tab === 'TERMINATE' ? `Terminate (${terminateCount})` : `Reject (${rejectCount})`}
            </button>
          ))}
        </div>

        {/* Bottom Row: Search Inputs */}
        <div className="flex flex-col md:flex-row gap-4">
          {/* Text Search Input */}
          <div className="relative w-full md:flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Search tasks ID, title..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none shadow-sm transition-all"
            />
          </div>

          {/* Date Search Input */}
          <div className="flex w-full md:w-auto gap-2">
            <div className="relative flex-1 md:w-40 items-center justify-center">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400 uppercase tracking-wider pointer-events-none">From</span>
              <input
                type="date"
                value={searchDateFrom}
                onChange={(e) => setSearchDateFrom(e.target.value)}
                className="w-full pl-12 pr-2 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none shadow-sm transition-all text-xs font-medium text-slate-700 h-full"
              />
            </div>
            <div className="relative flex-1 md:w-40 items-center justify-center">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400 uppercase tracking-wider pointer-events-none">To</span>
              <input
                type="date"
                value={searchDateTo}
                onChange={(e) => setSearchDateTo(e.target.value)}
                className="w-full pl-8 pr-2 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none shadow-sm transition-all text-xs font-medium text-slate-700 h-full"
              />
            </div>
            {(searchDateFrom || searchDateTo) && (
              <button 
                onClick={() => { setSearchDateFrom(''); setSearchDateTo(''); }} 
                className="flex items-center justify-center px-3 text-slate-400 hover:text-red-500 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors h-[42px]"
                title="Clear Dates"
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Task Grid */}
      <div className="grid grid-cols-1 gap-4 pb-20">
        {filteredTasks.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-3xl border border-slate-100 text-slate-400">
            <ClipboardList size={48} className="mx-auto mb-4 opacity-20" />
            <p className="font-medium">No tasks found matching your criteria.</p>
          </div>
        ) : (
          filteredTasks
            .sort((a, b) => {
              const bTime = b.createdDate ? new Date(b.createdDate).getTime() : 0;
              const aTime = a.createdDate ? new Date(a.createdDate).getTime() : 0;
              return (isNaN(bTime) ? 0 : bTime) - (isNaN(aTime) ? 0 : aTime);
            }) // Sort by Newest First
            .map(task => {
              const displayStatus = getDisplayStatus(task);
              const isTaskOverdue = displayStatus === 'OVERDUE';
              const assignedToId = (task.assignedTo || (task as any).assignedToEmployeeId || '').toString();
              const assignedEmp = employees.find(e => e.id === (task.assignedTo || task.assignedToEmployeeId || ''));
              const isCreator = (task.assignedBy === currentUser.name) || (task.assignedBy === currentUser.employeeId) || (String(task.assignedBy) === String(currentUser.id)) || (task.assignedByName === currentUser.name);
              const isAssignee = assignedToId && currentUser.employeeId && assignedToId === currentUser.employeeId.toString();
              const isNew = isNewTask(task.createdDate);

              return (
                <div key={task.id} className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 hover:shadow-md transition-shadow relative overflow-visible group">
                  <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${isTaskOverdue ? 'bg-red-500' : (isTaskCompleted(task) ? 'bg-green-500' : 'bg-indigo-500')}`}></div>

                  {/* Mobile Menu Button (3 Dots) */}
                  <div className="md:hidden absolute top-4 right-4">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setMobileMenuOpenId(mobileMenuOpenId === task.id ? null : task.id);
                      }}
                      className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors"
                    >
                      <MoreVertical size={20} />
                    </button>

                    {/* Mobile Actions Dropdown */}
                    {mobileMenuOpenId === task.id && (
                      <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-2xl border border-slate-100 z-50 p-2 flex flex-col gap-1 animate-in fade-in zoom-in-95 duration-100">
                        {renderActionButtons(task, true)}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col md:flex-row gap-6 justify-between items-start">
                    <div className="flex-1 w-full pr-8 md:pr-0">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className="font-mono text-xs font-bold text-slate-400 bg-slate-50 px-2 py-1 rounded border border-slate-200">{task.id}</span>
                        {isNew && (
                          <span className="flex items-center gap-1 bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border border-yellow-200">
                            <Sparkles size={10} fill="currentColor" /> New
                          </span>
                        )}
                        <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${getPriorityColor(task.priority)}`}>
                          {task.priority} Priority
                        </span>
                        <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${getStatusColor(displayStatus)}`}>
                          {displayStatus.replace('_', ' ')}
                        </span>
                      </div>

                      <h3 className="text-xl font-bold text-slate-800 mb-2">{task.title}</h3>
                      <p className="text-slate-500 text-sm leading-relaxed mb-4 max-w-2xl">{task.description}</p>

                      {/* Rejection / Objection counters */}
                      {((task as any).rejectionCount > 0 || (task as any).objectionCount > 0 ||
                        (task.extensionHistory && task.extensionHistory.length > 0)) && (() => {
                        const rejCount = (task as any).rejectionCount ||
                          (task.extensionHistory || []).filter((h: any) => h.status === 'REJECTED').length;
                        const objCount = (task as any).objectionCount ||
                          (task.extensionHistory || []).filter((h: any) => h.status === 'PENDING' || h.status === 'APPROVED' || h.status === 'REJECTED').length;
                        return (
                          <div className="flex flex-wrap gap-2 mb-3">
                            {objCount > 0 && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wide bg-purple-50 text-purple-600 border border-purple-200">
                                <AlertTriangle size={10} /> {objCount} Objection{objCount > 1 ? 's' : ''}
                              </span>
                            )}
                            {rejCount > 0 && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wide bg-red-50 text-red-600 border border-red-200">
                                <Ban size={10} /> {rejCount} Rejection{rejCount > 1 ? 's' : ''}
                              </span>
                            )}
                          </div>
                        );
                      })()}

                      <div className="flex flex-col sm:flex-row sm:flex-wrap items-start sm:items-center gap-3 sm:gap-6 text-sm text-slate-500">
                        <div className="flex items-center gap-2">
                          <UserIcon size={16} className="text-slate-400" />
                          <span className="font-medium">From: <span className="text-slate-700">{task.assignedBy || task.assignedByName || task.assignedBy}</span></span>
                        </div>
                        <div className="flex items-center gap-2">
                          <UserIcon size={16} className="text-slate-400" />
                          <span className="font-medium">To: <span className="text-slate-700">{assignedEmp?.name || task.assignedToName || task.assignedTo}</span></span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Calendar size={16} className="text-slate-400" />
                          <span className="font-medium">Assigned: <span className="text-slate-700">{task.createdDate && !isNaN(new Date(task.createdDate).getTime()) ? format(new Date(task.createdDate), 'MMM do, yyyy') : 'N/A'}</span></span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Calendar size={16} className="text-slate-400" />
                          <span className={`font-medium ${isTaskOverdue ? 'text-red-600 font-bold' : ''}`}>
                            Due: {task.dueDate && !isNaN(new Date(task.dueDate).getTime()) ? format(new Date(task.dueDate), 'MMM do, yyyy') : 'N/A'}
                          </span>
                        </div>
                        {task.attachment && (
                          <div className="flex items-center gap-2 text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg">
                            <FileText size={14} />
                            <a href={task.attachment} download={`Task_${task.id}_Attachment`} className="text-xs font-bold hover:underline">Download Attachment</a>
                          </div>
                        )}
                        {task.externalLink && (
                          <div className="flex items-center gap-2 text-blue-600 bg-blue-50 px-2 py-1 rounded-lg">
                            <Link size={14} />
                            <a href={task.externalLink} target="_blank" rel="noreferrer" className="text-xs font-bold hover:underline truncate max-w-[150px]">
                              Open Link
                            </a>
                          </div>
                        )}
                      </div>

                      {/* Completion / Extension / Status Notes */}
                      <div className="space-y-3 mt-4">
                        {isTaskCompleted(task) && (
                          <div className="bg-green-50/50 p-4 rounded-xl border border-green-100 text-sm">
                            <p className="font-bold text-green-800 mb-1 flex items-center gap-2"><CheckCircle2 size={16} /> Completed on {task.completionDate}</p>
                            {task.completionProcess && (
                              <p className="text-green-700/80 italic break-words">{task.completionProcess}</p>
                            )}
                            {task.completionAttachment && (
                              <div className="mt-2 text-green-700 flex items-center gap-2">
                                <FileText size={14} />
                                <a href={task.completionAttachment} download={`Task_${task.id}_Proof`} className="font-bold underline">Download Proof</a>
                              </div>
                            )}
                          </div>
                        )}

                        {task.status === 'EXTENSION_REQUESTED' && (
                          <div className="bg-purple-50 p-4 rounded-xl border border-purple-100 text-sm">
                            <p className="font-bold text-purple-800 mb-1 flex items-center gap-2"><Clock size={16} /> Extension Requested</p>
                            <p className="text-purple-700 mb-2">Team Member requested new date: <span className="font-bold">{task.extensionRequest?.requestedDate}</span></p>
                            <p className="text-purple-600 italic break-words">Reason: "{task.extensionRequest?.reason}"</p>

                            {(isAdmin || isCreator) && (
                              <div className="flex gap-2 mt-3">
                                <button
                                  onClick={() => handleExtensionResponse(task.id, true)}
                                  disabled={isLoading}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm transition-all ${isLoading ? 'bg-purple-400 text-white opacity-60 cursor-not-allowed' : 'bg-purple-600 text-white hover:bg-purple-700'}`}
                                >
                                  Approve New Date
                                </button>
                                <button
                                  onClick={() => handleExtensionResponse(task.id, false)}
                                  disabled={isLoading}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${isLoading ? 'bg-white border-purple-100 text-purple-300 cursor-not-allowed' : 'bg-white border border-purple-200 text-purple-600 hover:bg-purple-50'}`}
                                >
                                  Reject
                                </button>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Show Status Note (Hold/Terminate Reason) */}
                        {(task.status === 'HOLD' || task.status === 'TERMINATED' || task.status === 'REJECTED' || task.extensionRequest?.status === 'REJECTED') && task.statusNote && (
                          <div className={`p-4 rounded-xl border text-sm ${task.status === 'HOLD' ? 'bg-yellow-50 border-yellow-100' : (task.status === 'TERMINATED' ? 'bg-gray-50 border-gray-200' : 'bg-red-50 border-red-100')}`}>
                            <div className="flex justify-between items-start gap-3">
                              <div className="flex-1">
                                <p className={`font-bold mb-1 flex items-center gap-2 ${task.status === 'HOLD' ? 'text-yellow-800' : (task.status === 'TERMINATED' ? 'text-gray-700' : 'text-red-700')}`}>
                                  <MessageSquare size={16} /> {task.status === 'HOLD' ? 'Hold Reason' : (task.status === 'TERMINATED' ? 'Termination Reason' : 'Rejection')}
                                </p>
                                <p className={`${task.status === 'HOLD' ? 'text-yellow-700' : (task.status === 'TERMINATED' ? 'text-gray-600' : 'text-red-700')} italic`}>&quot;{task.statusNote}&quot;</p>
                              </div>
                              {task.extensionRequest?.status === 'REJECTED' && (isAssignee || isAdmin) && displayStatus !== 'OVERDUE' && displayStatus !== 'PENDING' && (
                                <div className="flex flex-col gap-1.5">
                                  {isAssignee && (
                                    <button
                                      onClick={() => handleAcknowledgeRejection(task.id, 'DOER')}
                                      disabled={isLoading}
                                      title="Acknowledge rejection — task will move to Overdue"
                                      className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${isLoading ? 'bg-red-300 text-white cursor-not-allowed' : 'bg-red-600 text-white hover:bg-red-700'}`}
                                    >
                                      Acknowledge → Overdue
                                    </button>
                                  )}
                                  {isAdmin && (
                                    <button
                                      onClick={() => handleAcknowledgeRejection(task.id, 'ADMIN')}
                                      disabled={isLoading}
                                      title="Admin: reset task to Pending"
                                      className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${isLoading ? 'bg-indigo-300 text-white cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
                                    >
                                      Reset → Pending
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>

                    </div>

                    {/* Desktop Actions Area (Hidden on Mobile) */}
                    <div className="hidden md:flex flex-col gap-2 w-full md:w-auto md:min-w-[160px]">
                      {renderActionButtons(task, false)}
                    </div>
                  </div>
                </div>
              );
            })
        )}
      </div>

      {/* --- MODALS --- */}

      {/* 1. Create Task Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center shrink-0">
              <h3 className="text-xl font-extrabold text-slate-800">Assign New Task</h3>
              <button onClick={() => setShowAssignModal(false)} className="p-2 hover:bg-slate-200 rounded-full text-slate-500"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto">
              {/* Inline error display for validation/server errors */}
              {error && (
                <div className="p-3 bg-red-50 border border-red-100 text-red-700 rounded-xl text-sm">
                  <strong className="font-bold">Error: </strong>
                  <span>{error}</span>
                </div>
              )}

              <div className="relative">
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Task Title</label>
                <div className="relative">
                  <input
                    type="text"
                    className="w-full border border-slate-200 rounded-xl p-3 pr-10 focus:ring-2 focus:ring-indigo-500 outline-none"
                    value={newTask.title || ''}
                    onChange={e => { setNewTask({ ...newTask, title: e.target.value }); setError(null); }}
                    placeholder="e.g. Inspect HVAC Unit B"
                  />
                  <AITextEnhancer
                    text={newTask.title || ''}
                    onUpdate={(text) => { setNewTask({ ...newTask, title: text }); setError(null); }}
                    context="concise"
                    mini={true}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Assign To</label>
                  <select
                    className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                    value={newAssignedUserId}
                    onChange={e => { setNewAssignedUserId(e.target.value || ''); setError(null); }}
                  >
                    <option value="">Select Team Member</option>
                    {employees.filter(emp => !(emp as any).is_archived).map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.name} <span className="text-slate-400">({emp.id})</span></option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Priority</label>
                  <select
                    className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                    value={newTask.priority || 'MEDIUM'}
                    onChange={e => setNewTask({ ...newTask, priority: e.target.value as any })}
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Assigned Date</label>
                  <input
                    type="date"
                    className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-indigo-500 outline-none"
                    value={newTask.createdDate || format(new Date(), 'yyyy-MM-dd')}
                    onChange={e => setNewTask({ ...newTask, createdDate: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Due Date</label>
                  <input
                    type="date"
                    className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-indigo-500 outline-none"
                    value={newTask.dueDate || ''}
                    onChange={e => setNewTask({ ...newTask, dueDate: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-xs font-bold text-slate-500 uppercase">Description</label>
                </div>
                <textarea
                  className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-indigo-500 outline-none h-24 resize-none"
                  value={newTask.description || ''}
                  onChange={e => setNewTask({ ...newTask, description: e.target.value })}
                  placeholder="Detailed instructions..."
                />
                <AITextEnhancer
                  text={newTask.description || ''}
                  onUpdate={(text) => setNewTask({ ...newTask, description: text })}
                />
              </div>

              {/* External Link Input */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">External Link / Sheet URL (Optional)</label>
                <div className="relative">
                  <Link className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                    type="url"
                    className="w-full border border-slate-200 rounded-xl p-3 pl-10 focus:ring-2 focus:ring-indigo-500 outline-none"
                    value={newTask.externalLink || ''}
                    onChange={e => setNewTask({ ...newTask, externalLink: e.target.value })}
                    placeholder="https://docs.google.com/spreadsheets/..."
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Attachment (Optional)</label>
                <label className="border-2 border-dashed border-slate-200 rounded-xl p-4 text-center hover:bg-slate-50 cursor-pointer transition-colors block">
                  <input type="file" className="hidden" onChange={handleFileChange} />
                  {attachment ? (
                    <div className="flex items-center justify-center gap-2 text-indigo-600 font-bold">
                      <FileText size={20} />
                      File Attached ({(attachment.length / 1024).toFixed(0)} KB)
                      <button onClick={(e) => { e.preventDefault(); setAttachment(null); }} className="p-1 hover:bg-slate-200 rounded-full"><X size={14} /></button>
                    </div>
                  ) : (
                    <div className="text-slate-400 text-sm">
                      <Upload size={20} className="mx-auto mb-2" />
                      Click to upload file (PDF, JPG, PNG)
                    </div>
                  )}
                </label>
              </div>
            </div>
            <div className="p-6 bg-slate-50/50 flex justify-end gap-3 border-t border-slate-100 shrink-0">
              <button onClick={() => setShowAssignModal(false)} className="px-5 py-2.5 text-slate-600 font-bold hover:bg-slate-100 rounded-xl">Cancel</button>
              <button
                type="button"
                onClick={createTask}
                className={`px-5 py-2.5 rounded-xl font-bold shadow-lg transition-all ${isLoading ? 'bg-slate-400 text-white opacity-80 cursor-wait' : 'bg-indigo-600 text-white shadow-indigo-600/20'}`}>
                {isLoading ? 'Assigning...' : 'Assign Task'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Complete Task Modal */}
      {showCompleteModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center shrink-0">
              <h3 className="text-xl font-extrabold text-slate-800">Submit Completion Report</h3>
              <button onClick={() => setShowCompleteModal(null)} className="p-2 hover:bg-slate-200 rounded-full text-slate-500"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto">
              <div className="bg-indigo-50 p-4 rounded-xl text-indigo-800 text-sm font-medium mb-4">
                Please describe the steps taken to complete this task and attach any necessary proof (photos/documents).
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Process Description (How to?)</label>
                <textarea
                  className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-indigo-500 outline-none h-32 resize-none"
                  value={processNote}
                  onChange={e => setProcessNote(e.target.value)}
                  placeholder="I have completed the task by..."
                />
                <AITextEnhancer
                  text={processNote}
                  onUpdate={setProcessNote}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Proof Attachment</label>
                <label className="border-2 border-dashed border-slate-200 rounded-xl p-4 text-center hover:bg-slate-50 cursor-pointer transition-colors block">
                  <input type="file" className="hidden" onChange={handleFileChange} />
                  {attachment ? (
                    <div className="flex items-center justify-center gap-2 text-green-600 font-bold">
                      <CheckCircle2 size={20} />
                      Proof Attached ({(attachment.length / 1024).toFixed(0)} KB)
                      <button onClick={(e) => { e.preventDefault(); setAttachment(null); }} className="p-1 hover:bg-slate-200 rounded-full"><X size={14} /></button>
                    </div>
                  ) : (
                    <div className="text-slate-400 text-sm">
                      <Upload size={20} className="mx-auto mb-2" />
                      Upload Completion Proof (JPG, PDF)
                    </div>
                  )}
                </label>
              </div>
            </div>
            <div className="p-6 bg-slate-50/50 flex justify-end gap-3 border-t border-slate-100 shrink-0">
              <button onClick={() => setShowCompleteModal(null)} className="px-5 py-2.5 text-slate-600 font-bold hover:bg-slate-100 rounded-xl">Cancel</button>
              <button onClick={() => handleCompleteTask(showCompleteModal)} className="px-5 py-2.5 bg-green-600 text-white rounded-xl font-bold shadow-lg shadow-green-600/20">Mark as Completed</button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Objection Modal */}
      {showObjectionModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-100 bg-red-50/50 flex justify-between items-center shrink-0">
              <h3 className="text-xl font-extrabold text-red-800">Raise Objection / Request Extension</h3>
              <button onClick={() => setShowObjectionModal(null)} className="p-2 hover:bg-red-100 rounded-full text-red-500"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto">
              <div className="flex items-start gap-3 bg-red-50 p-4 rounded-xl text-red-800 text-sm font-medium">
                <AlertCircle size={20} className="flex-shrink-0 mt-0.5" />
                <p>Use this form if the task cannot be completed by the deadline or if there are blockers. This will alert the Assignee.</p>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Proposed New Deadline</label>
                <input
                  type="date"
                  className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-red-500 outline-none"
                  value={extensionDate || ''}
                  onChange={e => setExtensionDate(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Reason / Note</label>
                <textarea
                  className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-red-500 outline-none h-32 resize-none"
                  value={extensionReason}
                  onChange={e => setExtensionReason(e.target.value)}
                  placeholder="I cannot complete this because..."
                />
                <AITextEnhancer
                  text={extensionReason}
                  onUpdate={setExtensionReason}
                />
              </div>
            </div>
            <div className="p-6 bg-slate-50/50 flex justify-end gap-3 border-t border-slate-100 shrink-0">
              <button onClick={() => setShowObjectionModal(null)} className="px-5 py-2.5 text-slate-600 font-bold hover:bg-slate-100 rounded-xl">Cancel</button>
              <button onClick={() => handleRaiseObjection(showObjectionModal)} className="px-5 py-2.5 bg-red-600 text-white rounded-xl font-bold shadow-lg shadow-red-600/20">Submit Request</button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Admin Action Reason Modal */}
      {actionPrompt && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col">
            <div className="p-6 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <h3 className="text-xl font-extrabold text-slate-800 capitalize">{actionPrompt.type === 'DELETE' ? 'Delete Task' : `${actionPrompt.type.toLowerCase()} Task`}</h3>
              <button onClick={() => setActionPrompt(null)} className="p-2 hover:bg-slate-200 rounded-full text-slate-500"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-600 font-medium">
                {actionPrompt.type === 'DELETE'
                  ? "Are you sure you want to delete this task? Please provide a reason for the deletion record."
                  : `Please specify the reason for ${actionPrompt.type === 'HOLD' ? 'putting this task on hold' : 'terminating this task'}.`
                }
              </p>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Reason / Note <span className="text-red-500">*</span></label>
                <textarea
                  className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-indigo-500 outline-none h-32 resize-none"
                  value={actionReason}
                  onChange={e => setActionReason(e.target.value)}
                  placeholder="Enter reason here..."
                  autoFocus
                />
                <AITextEnhancer
                  text={actionReason}
                  onUpdate={setActionReason}
                />
              </div>
            </div>
            <div className="p-6 bg-slate-50/50 flex justify-end gap-3 border-t border-slate-100">
              <button onClick={() => setActionPrompt(null)} className="px-5 py-2.5 text-slate-600 font-bold hover:bg-slate-100 rounded-xl">Cancel</button>
              <button
                onClick={confirmAdminAction}
                className={`px-5 py-2.5 text-white rounded-xl font-bold shadow-lg ${actionPrompt.type === 'DELETE' || actionPrompt.type === 'TERMINATE' ? 'bg-red-600 shadow-red-600/20' : 'bg-yellow-500 shadow-yellow-500/20'
                  }`}
              >
                Confirm {actionPrompt.type === 'DELETE' ? 'Delete' : (actionPrompt.type === 'HOLD' ? 'Hold' : 'Terminate')}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
