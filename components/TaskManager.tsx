
import React, { useState, useEffect } from 'react';
import { Task, TaskStatus, Employee, User, Notification, ExtensionRequest } from '../types';
import { format, isPast, differenceInHours } from 'date-fns';
import { ClipboardList, Plus, Clock, CheckCircle2, AlertTriangle, AlertCircle, Calendar, User as UserIcon, Upload, X, Ban, PauseCircle, ChevronLeft, ChevronRight, FileText, Trash2, MoreVertical, Search, MessageSquare, Download, Sparkles, Link, RefreshCw, Users, ArrowRightLeft, XCircle, Layers } from 'lucide-react';

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
  archivedEmployees?: Employee[];
  addNotification: (title: string, msg: string, type: Notification['type'], targetUser: string) => void;
}

const TaskManagerComponent: React.FC<TaskManagerProps> = ({ tasks, setTasks, currentUser, employees, archivedEmployees = [], addNotification }) => {
  const [activeTab, setActiveTab] = useState<'ALL' | 'PENDING' | 'HOLD' | 'COMPLETED' | 'OVERDUE' | 'OBJECTIONS' | 'TERMINATE' | 'REJECT'>('ALL');
  const [, startTabTransition] = React.useTransition();
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showCompleteModal, setShowCompleteModal] = useState<string | null>(null); // Task ID
  const [showObjectionModal, setShowObjectionModal] = useState<string | null>(null); // Task ID

  // Loading / Error states for async operations
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Action Reason Modal State
  const [actionPrompt, setActionPrompt] = useState<{ taskId: string, type: 'HOLD' | 'TERMINATE' | 'DELETE' } | null>(null);

  const [mobileMenuOpenId, setMobileMenuOpenId] = useState<string | null>(null); // For mobile 3-dots menu
  const [searchTermInput, setSearchTermInput] = useState('');
  const [searchTerm, setSearchTerm] = useState(''); // Text Search

  useEffect(() => {
    const handler = setTimeout(() => {
      setSearchTerm(searchTermInput);
    }, 250);
    return () => clearTimeout(handler);
  }, [searchTermInput]);
  const [searchDateFrom, setSearchDateFrom] = useState(''); // Date Search From
  const [searchDateTo, setSearchDateTo] = useState(''); // Date Search To
  const [selectedMemberId, setSelectedMemberId] = useState<string>('ALL'); // Member filter (admin only)

  const [usersList, setUsersList] = useState<User[]>([]);

  // Form States for Edit Task
  const [showEditModal, setShowEditModal] = useState<string | null>(null); // Task ID

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [tasksPerPage, setTasksPerPage] = useState(20);

  const canSeeAllTasks = currentUser.role === 'ADMIN' || currentUser.role === 'PC';
  const isAdmin = currentUser.role === 'ADMIN';
  const isPC = currentUser.role === 'PC';

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

  // Reset page to 1 when filters or activeTab changes to avoid getting stranded
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, searchTerm, searchDateFrom, searchDateTo, selectedMemberId]);

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

  // --- Actions ---

  const createTask = async (payload: {
    title: string;
    description: string;
    assignedTo: string;
    assigned_to: number | null;
    dueDate: string;
    priority: 'LOW' | 'MEDIUM' | 'HIGH';
    attachment: string | null;
    externalLink: string | null;
    createdDate: string;
  }) => {
    setIsLoading(true);
    setError(null);
    try {
      const serverPayload: any = {
        title: payload.title,
        description: payload.description || '',
        assignedTo: payload.assignedTo,
        assigned_to: payload.assigned_to,
        assigned_by: Number(currentUser.id),
        dueDate: payload.dueDate,
        priority: payload.priority || 'MEDIUM',
        attachment: payload.attachment || null,
        externalLink: payload.externalLink || null,
        createdDate: payload.createdDate
      };

      const r = await api.post('/tasks', serverPayload);

      let newId = '';
      try {
        const created = extractPayload(r);
        if (created) {
          const createdTask = Array.isArray(created) ? created[0] : (created.task || created);
          if (createdTask && createdTask.id) newId = createdTask.id;
          setTasks(prev => [createdTask as Task, ...prev]);
        }
      } catch (e) {
        console.warn('Could not extract created task, continuing to refresh', e && (e.stack || e.message || e));
      }
      try { await fetchTasks(); } catch (e) { console.warn('Refresh after create failed, keeping optimistic state', e && (e.stack || e.message || e)); }
      setShowAssignModal(false);
      addNotification('New Task', `Task ${newId ? newId : ''} "${payload.title}" assigned successfully.`, 'TASK', String(payload.assignedTo || payload.assigned_to));
    } catch (err: any) {
      console.error('Create task failed', err);
      const message = err && err.response && (err.response.data?.message || err.response.data?.error) ? (err.response.data.message || err.response.data.error) : (err && err.message) || 'Failed to create task';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const handleCompleteTask = async (taskId: string, processNote: string, attachment: string | null) => {
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
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'COMPLETED', completionDate: payload.completionDate, completionProcess: payload.completionProcess, completionAttachment: payload.completionAttachment } : t));
      await fetchTasks();
      setShowCompleteModal(null);
      addNotification('Task Completed', `Task ${taskId} marked as completed by ${currentUser.name}.`, 'TASK', String('ADMIN'));
    } catch (e) {
      console.error('Complete task failed', e);
      setError('Failed to complete task');
    } finally {
      setIsLoading(false);
    }
  };

  const handleIncompleteTask = async (taskId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const task = tasks.find(t => t.id === taskId);

      // Call the dedicated uncomplete endpoint — this directly NULLs completionDate in the DB
      await api.put(`/tasks/${taskId}/uncomplete`, {});

      // Optimistically clear completion fields in local state
      setTasks(prev => prev.map(t =>
        t.id === taskId
          ? { ...t, status: 'PENDING' as TaskStatus, completionDate: undefined, completionProcess: undefined, completionAttachment: undefined }
          : t
      ));

      // Refresh from server so we get the authoritative state
      await fetchTasks();

      if (task) addNotification('Task Reverted', `Task "${task.title}" marked as incomplete by Admin.`, 'TASK', String(task.assignedTo));

      // Figure out where the task belongs based on its due date
      const dueDateObj = task?.dueDate ? new Date(task.dueDate) : null;
      const isValidDate = dueDateObj && !isNaN(dueDateObj.getTime());
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const isLate = isValidDate && dueDateObj! < todayStart;

      // Navigate admin/user to the correct tab
      setActiveTab(isLate ? 'OVERDUE' : 'PENDING');
    } catch (e) {
      console.error('Mark incomplete failed', e);
      setError('Failed to mark task as incomplete');
    } finally {
      setIsLoading(false);
    }
  };


  const handleRaiseObjection = async (taskId: string, extensionDate: string, extensionReason: string) => {
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
      const currentCount = (task as any)?.objectionCount || (task?.extensionHistory || []).length;
      if (currentCount >= 3) {
        setError('Maximum limit of 3 objections reached for this task');
        setIsLoading(false);
        return;
      }
      const newHistory = [...(task?.extensionHistory || []), newReq];
      await api.put(`/tasks/${taskId}`, { status: 'EXTENSION_REQUESTED', extensionRequest: newReq, extensionHistory: newHistory });
      await fetchTasks();
      setShowObjectionModal(null);
      addNotification('Task Alert', `Extension requested for Task ${taskId} by ${currentUser.name}.`, 'TASK', String('ADMIN'));
    } catch (e) {
      console.error('Raise objection failed', e);
      setError('Failed to raise extension request');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenEditModal = (task: Task) => {
    setShowEditModal(task.id);
  };

  const handleUpdateTask = async (payload: {
    title: string;
    description: string;
    assignedTo: string;
    assigned_to: number | null;
    dueDate: string;
    priority: 'LOW' | 'MEDIUM' | 'HIGH';
    attachment: string | null;
    externalLink: string | null;
  }) => {
    if (!showEditModal) return;
    setIsLoading(true);
    setError(null);
    try {
      await api.put(`/tasks/${showEditModal}`, payload);

      // Optimistic update
      setTasks(prev => prev.map(t => t.id === showEditModal ? { ...t, ...payload } : t));

      await fetchTasks();
      setShowEditModal(null);

      // Notification
      const oldTask = tasks.find(t => t.id === showEditModal);
      if (oldTask && oldTask.assignedTo !== payload.assignedTo) {
        addNotification('Task Transferred', `Task ${showEditModal} has been transferred.`, 'TASK', payload.assignedTo);
      } else {
        addNotification('Task Updated', `Task ${showEditModal} has been updated.`, 'TASK', payload.assignedTo);
      }
    } catch (err: any) {
      console.error('Update task failed', err);
      const message = err && err.response && (err.response.data?.message || err.response.data?.error) ? (err.response.data.message || err.response.data.error) : (err && err.message) || 'Failed to update task';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const initiateAdminAction = (taskId: string, type: 'HOLD' | 'TERMINATE' | 'DELETE') => {
    setActionPrompt({ taskId, type });
  };

  const confirmAdminAction = async (actionReason: string) => {
    if (!actionPrompt) return;
    
    const { taskId, type } = actionPrompt;
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
    }
  };

  const handleResumeTask = async (taskId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      await api.put(`/tasks/${taskId}`, { status: 'PENDING', statusNote: '' });
      // Optimistic UI update
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'PENDING', statusNote: '' } : t));
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
        await api.put(`/tasks/${taskId}`, { status: 'PENDING', dueDate: t.extensionRequest.requestedDate, extensionRequest: { ...t.extensionRequest, status: 'APPROVED' }, extensionHistory: newHistory, statusNote: '' });


        // Optimistic UI update
        setTasks(prev => prev.map(task => task.id === taskId ? { ...task, status: 'PENDING', dueDate: t.extensionRequest.requestedDate, extensionRequest: { ...t.extensionRequest, status: 'APPROVED' }, extensionHistory: newHistory, statusNote: '' } : task));

      } else if (!approved && t.extensionRequest) {
        // Rejecting: keep task as PENDING (do not set to OVERDUE) and record admin rejection note
        const rejectionNote = `Extension rejected by ${currentUser.name}`;
        const updatedReq = { ...t.extensionRequest, status: 'REJECTED', adminResponse: rejectionNote };

        await api.put(`/tasks/${taskId}`, { status: 'PENDING', extensionRequest: updatedReq, extensionHistory: newHistory, statusNote: rejectionNote });


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
        extensionRequest: '',
        statusNote: '',
        rejectionCount: acknowledgedBy === 'DOER' ? currentRejections + 1 : currentRejections
      });

      setTasks(prev => prev.map(t => t.id === taskId ? {
        ...t,
        status: newStatus,
        extensionRequest: undefined,
        statusNote: '',
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
  const safeTasks = React.useMemo(() => ensureArray(tasks), [tasks]);
  
  const archivedEmpIdSet = React.useMemo(() => {
    return new Set((archivedEmployees || []).map(e => String(e.id).trim()));
  }, [archivedEmployees]);

  const { relevantTasks, filteredTasks, counts } = React.useMemo(() => {
    const relevant = safeTasks.filter(t => {
      const assignedToId = (t.assignedTo || t.assignedToEmployeeId || '').toString().trim();
      const assignedByName = (t.assignedBy || t.assignedByName || '').toString().trim();

      // Exclude tasks assigned to employees who are currently archived
      if (assignedToId && archivedEmpIdSet.has(assignedToId)) {
        return false;
      }

      const matchesAssignedTo = assignedToId && currentUser.employeeId && assignedToId === currentUser.employeeId.toString();
      const matchesAssignedBy = assignedByName && (
        assignedByName === currentUser.employeeId?.toString() ||
        assignedByName === currentUser.id?.toString() ||
        assignedByName === currentUser.name
      );

      // Admins and PC see all tasks; non-admins see tasks assigned TO them or assigned BY them
      if (canSeeAllTasks) return true;
      return Boolean(matchesAssignedTo || matchesAssignedBy);
    });

  const filtered = relevant.filter(t => {
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

      const displayStatus = getDisplayStatus(t);
      const isCompletedOrOverdue = displayStatus === 'COMPLETED' || displayStatus === 'OVERDUE' || displayStatus === 'TERMINATED';

      const due = normalizeTaskDate(t.dueDate);
      const created = normalizeTaskDate(t.createdDate);
      // For completed/overdue tasks, also match against completionDate
      const completed = isCompletedOrOverdue ? normalizeTaskDate(t.completionDate) : '';

      if (searchDateFrom && searchDateTo) {
        matchesDate =
          (due && due >= searchDateFrom && due <= searchDateTo) ||
          (created && created >= searchDateFrom && created <= searchDateTo) ||
          (completed && completed >= searchDateFrom && completed <= searchDateTo);
      } else {
        const singleDate = searchDateFrom || searchDateTo;
        matchesDate = (due === singleDate) || (created === singleDate) || (!!completed && completed === singleDate);
      }
    }

    // 4. Member filter (admin and PC)
    let matchesMember = true;
    if (canSeeAllTasks && selectedMemberId !== 'ALL') {
      const assignedToId = (t.assignedTo || (t as any).assignedToEmployeeId || '').toString();
      matchesMember = assignedToId === selectedMemberId;
    }

    return matchesTab && matchesSearch && matchesDate && matchesMember;
  });

  // Apply member filter for tab counts so numbers match the filtered view
  const memberFilteredTasks = (canSeeAllTasks && selectedMemberId !== 'ALL')
    ? relevant.filter(t => (t.assignedTo || (t as any).assignedToEmployeeId || '').toString() === selectedMemberId)
    : relevant;

  const totalCount = memberFilteredTasks.length;
  const pendingCount = memberFilteredTasks.filter(t => getDisplayStatus(t) === 'PENDING').length;
  const holdCount = memberFilteredTasks.filter(t => getDisplayStatus(t) === 'HOLD' || t.status === 'HOLD').length;
  const completedCount = memberFilteredTasks.filter(t => {
    const ds = getDisplayStatus(t);
    return ds === 'COMPLETED' || ds === 'TERMINATED';
  }).length;
  const overdueCount = memberFilteredTasks.filter(t => getDisplayStatus(t) === 'OVERDUE').length;
  const objectionCount = memberFilteredTasks.filter(t => {
    const ds = getDisplayStatus(t);
    return Boolean(
      t.extensionRequest &&
      t.extensionRequest.status === 'PENDING' &&
      t.status === 'EXTENSION_REQUESTED' &&
      ds !== 'TERMINATED' && ds !== 'COMPLETED' && ds !== 'OVERDUE' && ds !== 'PENDING'
    );
  }).length;
  const terminateCount = memberFilteredTasks.filter(t => getDisplayStatus(t) === 'TERMINATED' || t.status === 'TERMINATED').length;
  const rejectCount = memberFilteredTasks.filter(t => {
    const ds = getDisplayStatus(t);
    return Boolean(
      t.extensionRequest &&
      t.extensionRequest.status === 'REJECTED' &&
      ds !== 'COMPLETED' && ds !== 'TERMINATED' && ds !== 'OVERDUE' && ds !== 'PENDING'
    );
  }).length;

  return { 
    relevantTasks: relevant, 
    filteredTasks: filtered, 
    counts: { totalCount, pendingCount, holdCount, completedCount, overdueCount, objectionCount, terminateCount, rejectCount } 
  };
}, [safeTasks, activeTab, searchTerm, searchDateFrom, searchDateTo, selectedMemberId, isAdmin, currentUser.employeeId, currentUser.id, currentUser.name, employees, archivedEmpIdSet]);

const { totalCount, pendingCount, holdCount, completedCount, overdueCount, objectionCount, terminateCount, rejectCount } = counts;

  // Memoize sorted tasks list (newest first)
  const sortedTasks = React.useMemo(() => {
    return [...filteredTasks].sort((a, b) => {
      const bTime = b.createdDate ? new Date(b.createdDate).getTime() : 0;
      const aTime = a.createdDate ? new Date(a.createdDate).getTime() : 0;
      return (isNaN(bTime) ? 0 : bTime) - (isNaN(aTime) ? 0 : aTime);
    });
  }, [filteredTasks]);

  // Slice sorted tasks based on pagination
  const paginatedTasks = React.useMemo(() => {
    const startIndex = (currentPage - 1) * tasksPerPage;
    return sortedTasks.slice(startIndex, startIndex + tasksPerPage);
  }, [sortedTasks, currentPage, tasksPerPage]);

  const totalPages = Math.max(1, Math.ceil(filteredTasks.length / tasksPerPage));

  // Helper for generating paginated page numbers with truncation
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisible = 5;
    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push('...');
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
      if (currentPage < totalPages - 2) pages.push('...');
      pages.push(totalPages);
    }
    return pages;
  };

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

    if (isPC) return null;

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
            {(isTaskOverdue || displayStatus === 'PENDING') && (() => {
              const objCount = (task as any).objectionCount || (task.extensionHistory || []).length;
              if (objCount >= 3) {
                return (
                  <div className={isMobile ? "w-full py-3 px-4 text-left text-sm font-bold flex items-center gap-3 text-red-500 bg-red-50 border border-red-100 rounded-lg" : "w-full py-2 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 border border-red-100 text-red-500 bg-red-50"}>
                    <AlertTriangle size={isMobile ? 18 : 16} /> Objection Limit (3/3)
                  </div>
                );
              }
              return (
                <button
                  onClick={() => setShowObjectionModal(task.id)}
                  className={isMobile ? btnBaseClass : `${btnBaseClass} bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 hover:text-red-600`}
                >
                  <AlertTriangle size={isMobile ? 18 : 16} /> Raise Objection
                </button>
              );
            })()}
          </>
        )}

        {/* Management Actions (For Admin or Creator) */}
        {(isAdmin || isCreator) && displayStatus !== 'COMPLETED' && displayStatus !== 'TERMINATED' && (
          <>
            <button
              onClick={() => handleOpenEditModal(task)}
              className={isMobile ? `${btnBaseClass} text-blue-600 hover:bg-blue-50` : `${btnBaseClass} bg-white border border-blue-200 text-blue-600 hover:bg-blue-50`}
            >
              <FileText size={isMobile ? 18 : 14} /> Edit Task
            </button>
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

        {/* Uncomplete Action (Admin Only) for Completed tasks */}
        {isAdmin && displayStatus === 'COMPLETED' && (
          <button
            onClick={() => handleIncompleteTask(task.id)}
            className={isMobile ? `${btnBaseClass} text-orange-600 hover:bg-orange-50` : `${btnBaseClass} bg-white border border-orange-200 text-orange-600 hover:bg-orange-50`}
          >
            <RefreshCw size={isMobile ? 18 : 14} /> Uncomplete
          </button>
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
    <div className="p-3 md:p-8 bg-gradient-to-br from-slate-50 via-white to-slate-50 h-full overflow-y-auto custom-scrollbar">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-3 md:gap-6 mb-6 md:mb-10 animate-fade-in-up">
        <div className="flex items-center gap-3 md:gap-5">
          <div className="w-10 h-10 md:w-16 md:h-16 bg-gradient-to-tr from-indigo-600 to-violet-700 text-white rounded-xl md:rounded-2xl flex items-center justify-center shadow-xl shadow-indigo-100 shrink-0">
            <ClipboardList size={20} className="md:hidden" />
            <ClipboardList size={32} className="hidden md:block" />
          </div>
          <div>
            <h2 className="text-xl md:text-4xl font-black text-slate-800 tracking-tight">Task Manager</h2>
            <p className="text-slate-500 font-semibold tracking-wide flex items-center gap-1 text-xs md:text-base">
              <Clock size={13} className="text-indigo-500" />
              Assign tasks and track progress
            </p>
          </div>
        </div>

        <div className="flex flex-row md:flex-col lg:flex-row gap-2 md:gap-4 w-full md:w-auto">
          {canSeeAllTasks && (
            <button
              onClick={handleExportTasks}
              className="flex-1 md:flex-none bg-white/80 backdrop-blur-sm border border-slate-200 text-slate-700 px-3 md:px-6 py-2.5 md:py-3.5 rounded-xl md:rounded-2xl flex items-center justify-center gap-2 transition-all hover:bg-white hover:shadow-lg active:scale-95 font-bold text-sm"
            >
              <Download size={16} />
              <span className="hidden sm:inline">Export Data</span>
              <span className="sm:hidden">Export</span>
            </button>
          )}
          {canSeeAllTasks && (
            <button
              onClick={() => setShowAssignModal(true)}
              className="flex-1 md:flex-none bg-gradient-to-r from-indigo-600 to-violet-700 hover:from-indigo-700 hover:to-violet-800 text-white px-3 md:px-8 py-2.5 md:py-3.5 rounded-xl md:rounded-2xl flex items-center justify-center gap-2 shadow-xl shadow-indigo-200 transition-all active:scale-95 font-bold text-sm"
            >
              <Plus size={18} />
              <span className="hidden sm:inline">Assign New Task</span>
              <span className="sm:hidden">New Task</span>
            </button>
          )}
        </div>
      </div>

      {/* Search and Filter Row */}
      <div className="flex flex-col gap-3 md:gap-6 mb-6 md:mb-8 animate-fade-in-up" style={{ animationDelay: '100ms' }}>

        {/* Tab bar: horizontally scrollable on mobile */}
        <div className="flex gap-1.5 md:gap-2 overflow-x-auto pb-1 md:pb-4 w-full bg-white/50 p-1.5 md:p-2 rounded-xl md:rounded-2xl border border-slate-100 backdrop-blur-sm" style={{ scrollbarWidth: 'none' }}>
          {[
            { id: 'ALL', label: 'All', count: totalCount, icon: Layers },
            { id: 'PENDING', label: 'Pending', count: pendingCount, icon: Clock },
            { id: 'HOLD', label: 'Hold', count: holdCount, icon: PauseCircle },
            { id: 'COMPLETED', label: 'Done', count: completedCount, icon: CheckCircle2 },
            { id: 'OVERDUE', label: 'Overdue', count: overdueCount, icon: AlertTriangle },
            { id: 'OBJECTIONS', label: 'Obj', count: objectionCount, icon: AlertCircle },
            { id: 'TERMINATE', label: 'Term', count: terminateCount, icon: Ban },
            { id: 'REJECT', label: 'Rej', count: rejectCount, icon: XCircle },
          ].map(({ id, label, count, icon: TabIcon }) => {
            const isActive = activeTab === id;
            return (
              <button
                key={id}
                onClick={() => {
                  startTabTransition(() => {
                    setActiveTab(id as any);
                  });
                }}
                className={`px-3 md:px-4 py-1.5 md:py-2.5 rounded-lg md:rounded-xl text-xs md:text-sm font-bold transition-all whitespace-nowrap flex items-center gap-1.5 md:gap-2 ${isActive
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100'
                    : 'text-slate-500 hover:bg-white hover:text-indigo-600'
                  }`}
              >
                <TabIcon size={15} className={`shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                <span>{label} ({count})</span>
              </button>
            );
          })}
        </div>

        {/* Bottom Row: Search + Filters — stacks vertically on mobile */}
        <div className="flex flex-col gap-2 md:flex-row md:gap-4">
          {/* Text Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="Search ID, title, name..."
              value={searchTermInput}
              onChange={(e) => setSearchTermInput(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none shadow-sm transition-all text-sm"
            />
          </div>

          {/* Member Filter — Admin & PC */}
          {canSeeAllTasks && (
            <div className="relative w-full md:w-56">
              <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={15} />
              <select
                value={selectedMemberId}
                onChange={e => {
                  const val = e.target.value;
                  startTabTransition(() => {
                    setSelectedMemberId(val);
                    setActiveTab('ALL');
                  });
                }}
                className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none shadow-sm transition-all text-sm font-semibold text-slate-700 appearance-none"
              >
                <option value="ALL">All Members ({relevantTasks.length})</option>
                {employees
                  .filter(e => e.status === 'Active')
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map(e => {
                    const count = relevantTasks.filter(t =>
                      (t.assignedTo || (t as any).assignedToEmployeeId || '').toString() === e.id
                    ).length;
                    return (
                      <option key={e.id} value={e.id}>
                        {e.name} ({count})
                      </option>
                    );
                  })}
              </select>
              {selectedMemberId !== 'ALL' && (
                <button
                  onClick={() => setSelectedMemberId('ALL')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500 transition-colors"
                  title="Clear member filter"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          )}

          {/* Date Range */}
          <div className="flex w-full md:w-auto gap-2">
            <div className="relative flex-1 md:w-40">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[9px] font-bold text-slate-400 uppercase tracking-wider pointer-events-none">From</span>
              <input
                type="date"
                value={searchDateFrom}
                onChange={(e) => setSearchDateFrom(e.target.value)}
                className="w-full pl-10 pr-2 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none shadow-sm transition-all text-xs font-medium text-slate-700"
              />
            </div>
            <div className="relative flex-1 md:w-40">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[9px] font-bold text-slate-400 uppercase tracking-wider pointer-events-none">To</span>
              <input
                type="date"
                value={searchDateTo}
                onChange={(e) => setSearchDateTo(e.target.value)}
                className="w-full pl-7 pr-2 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none shadow-sm transition-all text-xs font-medium text-slate-700"
              />
            </div>
            {(searchDateFrom || searchDateTo) && (
              <button
                onClick={() => { setSearchDateFrom(''); setSearchDateTo(''); }}
                className="flex items-center justify-center px-3 text-slate-400 hover:text-red-500 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
                title="Clear Dates"
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Active member filter badge */}
        {canSeeAllTasks && selectedMemberId !== 'ALL' && (() => {
          const emp = employees.find(e => e.id === selectedMemberId);
          const memberTaskCount = filteredTasks.length;
          return emp ? (
            <div className="flex items-center gap-2">
              <div className="inline-flex items-center gap-2 bg-indigo-50 border border-indigo-200 text-indigo-700 px-3 py-1.5 rounded-xl text-xs font-bold">
                <UserIcon size={12} />
                Showing tasks for <span className="font-black">{emp.name}</span>
                <span className="bg-indigo-600 text-white px-1.5 py-0.5 rounded-md text-[10px] font-black">{memberTaskCount}</span>
                <button onClick={() => setSelectedMemberId('ALL')} className="ml-1 text-indigo-400 hover:text-indigo-700 transition-colors"><X size={12} /></button>
              </div>
            </div>
          ) : null;
        })()}
      </div>

      {/* Task Grid */}
      <div className="grid grid-cols-1 gap-4 pb-20">
        {filteredTasks.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-3xl border border-slate-100 text-slate-400">
            <ClipboardList size={48} className="mx-auto mb-4 opacity-20" />
            <p className="font-medium">No tasks found matching your criteria.</p>
          </div>
        ) : (
          paginatedTasks
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

                            {(isAdmin || isCreator) && !isPC && (
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

      {/* Premium Pagination Controls */}
      {filteredTasks.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-4 items-center justify-between mt-6 bg-white/60 p-4 rounded-2xl border border-slate-100 backdrop-blur-sm shadow-sm animate-fade-in-up">
          <div className="flex items-center gap-3 text-xs md:text-sm font-semibold text-slate-500">
            <span>
              Showing <span className="text-slate-800 font-extrabold">{Math.min(filteredTasks.length, (currentPage - 1) * tasksPerPage + 1)}</span> to{' '}
              <span className="text-slate-800 font-extrabold">
                {Math.min(filteredTasks.length, currentPage * tasksPerPage)}
              </span>{' '}
              of <span className="text-slate-800 font-extrabold">{filteredTasks.length}</span> tasks
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
            <div className="flex items-center gap-1.5">
              <span>Show</span>
              <select
                value={tasksPerPage}
                onChange={(e) => {
                  setTasksPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-slate-700 text-xs font-bold focus:ring-2 focus:ring-indigo-500 outline-none transition-all cursor-pointer"
              >
                {[10, 20, 50, 100].map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {/* Previous Page */}
            <button
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className={`p-2 rounded-xl border border-slate-200 bg-white text-slate-600 transition-all hover:bg-slate-50 hover:text-indigo-600 disabled:opacity-40 disabled:hover:bg-white disabled:hover:text-slate-600 cursor-pointer ${
                currentPage === 1 ? 'cursor-not-allowed' : 'active:scale-95'
              }`}
              title="Previous Page"
            >
              <ChevronLeft size={16} />
            </button>

            {/* Page Numbers */}
            {getPageNumbers().map((page, index) => {
              if (page === '...') {
                return (
                  <span
                    key={`trunc-${index}`}
                    className="w-9 h-9 flex items-center justify-center text-slate-400 font-bold select-none"
                  >
                    ...
                  </span>
                );
              }
              const isCurrent = page === currentPage;
              return (
                <button
                  key={`page-${page}`}
                  onClick={() => setCurrentPage(page as number)}
                  className={`w-9 h-9 rounded-xl text-xs font-black transition-all cursor-pointer shadow-sm hover:scale-105 active:scale-95 ${
                    isCurrent
                      ? 'bg-indigo-600 text-white shadow-indigo-100 shadow-lg'
                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-indigo-600'
                  }`}
                >
                  {page}
                </button>
              );
            })}

            {/* Next Page */}
            <button
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className={`p-2 rounded-xl border border-slate-200 bg-white text-slate-600 transition-all hover:bg-slate-50 hover:text-indigo-600 disabled:opacity-40 disabled:hover:bg-white disabled:hover:text-slate-600 cursor-pointer ${
                currentPage === totalPages ? 'cursor-not-allowed' : 'active:scale-95'
              }`}
              title="Next Page"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* --- MODALS --- */}

      {/* 1. Create Task Modal */}
      <AssignTaskModal
        isOpen={showAssignModal}
        onClose={() => setShowAssignModal(false)}
        employees={employees}
        usersList={usersList}
        currentUser={currentUser}
        onSubmit={createTask}
        isLoading={isLoading}
        serverError={error}
        setServerError={setError}
      />

      {/* 2. Complete Task Modal */}
      {showCompleteModal && (
        <CompleteTaskModal
          isOpen={!!showCompleteModal}
          onClose={() => setShowCompleteModal(null)}
          onSubmit={(processNote, attachment) => handleCompleteTask(showCompleteModal, processNote, attachment)}
          isLoading={isLoading}
        />
      )}

      {/* 3. Objection Modal */}
      {showObjectionModal && (
        <ObjectionModal
          isOpen={!!showObjectionModal}
          onClose={() => setShowObjectionModal(null)}
          onSubmit={(extensionDate, extensionReason) => handleRaiseObjection(showObjectionModal, extensionDate, extensionReason)}
          isLoading={isLoading}
        />
      )}

      {/* 4. Admin Action Reason Modal */}
      {actionPrompt && (
        <ActionPromptModal
          isOpen={!!actionPrompt}
          onClose={() => setActionPrompt(null)}
          type={actionPrompt.type}
          onSubmit={confirmAdminAction}
          isLoading={isLoading}
        />
      )}

      {/* 5. Edit Task Modal */}
      {showEditModal && (() => {
        const taskToEdit = tasks.find(t => t.id === showEditModal);
        return taskToEdit ? (
          <EditTaskModal
            isOpen={!!showEditModal}
            onClose={() => setShowEditModal(null)}
            task={taskToEdit}
            employees={employees}
            usersList={usersList}
            onSubmit={handleUpdateTask}
            isLoading={isLoading}
            serverError={error}
            setServerError={setError}
          />
        ) : null;
      })()}

    </div>
  );
};

export const TaskManager = React.memo(TaskManagerComponent);

// ==========================================
// OPTIMIZED MEMOIZED MODAL SUB-COMPONENTS
// ==========================================

interface AssignTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  employees: Employee[];
  usersList: User[];
  currentUser: User;
  onSubmit: (payload: {
    title: string;
    description: string;
    assignedTo: string;
    assigned_to: number | null;
    dueDate: string;
    priority: 'LOW' | 'MEDIUM' | 'HIGH';
    attachment: string | null;
    externalLink: string | null;
    createdDate: string;
  }) => Promise<void>;
  isLoading: boolean;
  serverError: string | null;
  setServerError: (err: string | null) => void;
}

const AssignTaskModal: React.FC<AssignTaskModalProps> = React.memo(({
  isOpen,
  onClose,
  employees,
  usersList,
  currentUser,
  onSubmit,
  isLoading,
  serverError,
  setServerError
}) => {
  const [title, setTitle] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [priority, setPriority] = useState<'LOW' | 'MEDIUM' | 'HIGH'>('MEDIUM');
  const [createdDate, setCreatedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [dueDate, setDueDate] = useState('');
  const [description, setDescription] = useState('');
  const [externalLink, setExternalLink] = useState('');
  const [attachment, setAttachment] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      try {
        const base64 = await convertFileToBase64(e.target.files[0]);
        setAttachment(base64);
      } catch (err) {
        setServerError('Failed to upload task attachment. Please try again.');
      }
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !assignedTo || !dueDate) {
      setServerError('Please provide title, assignee and due date');
      return;
    }
    setServerError(null);

    const matchedUser = usersList.find(u => String(u.employeeId) === String(assignedTo));
    const assigned_to_numeric = matchedUser ? Number(matchedUser.id) : null;

    try {
      await onSubmit({
        title,
        description,
        assignedTo,
        assigned_to: assigned_to_numeric,
        dueDate,
        priority,
        attachment,
        externalLink,
        createdDate
      });
      // Clear form on success
      setTitle('');
      setAssignedTo('');
      setPriority('MEDIUM');
      setCreatedDate(format(new Date(), 'yyyy-MM-dd'));
      setDueDate('');
      setDescription('');
      setExternalLink('');
      setAttachment(null);
    } catch (e) {
      // Keep state so user can retry
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <form onSubmit={handleFormSubmit} className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center shrink-0">
          <h3 className="text-xl font-extrabold text-slate-800">Assign New Task</h3>
          <button type="button" onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full text-slate-500"><X size={20} /></button>
        </div>
        <div className="p-6 space-y-4 overflow-y-auto">
          {serverError && (
            <div className="p-3 bg-red-50 border border-red-100 text-red-700 rounded-xl text-sm">
              <strong className="font-bold">Error: </strong>
              <span>{serverError}</span>
            </div>
          )}

          <div className="relative">
            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Task Title</label>
            <div className="relative">
              <input
                type="text"
                className="w-full border border-slate-200 rounded-xl p-3 pr-10 focus:ring-2 focus:ring-indigo-500 outline-none"
                value={title}
                onChange={e => { setTitle(e.target.value); setServerError(null); }}
                placeholder="e.g. Inspect HVAC Unit B"
              />

            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Assign To</label>
              <select
                className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                value={assignedTo}
                onChange={e => { setAssignedTo(e.target.value || ''); setServerError(null); }}
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
                value={priority}
                onChange={e => setPriority(e.target.value as any)}
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
                value={createdDate}
                onChange={e => setCreatedDate(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Due Date</label>
              <input
                type="date"
                className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-indigo-500 outline-none"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-xs font-bold text-slate-500 uppercase">Description</label>
            </div>
            <textarea
              className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-indigo-500 outline-none h-24 resize-none"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Detailed instructions..."
            />

          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">External Link / Sheet URL (Optional)</label>
            <div className="relative">
              <Link className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="url"
                className="w-full border border-slate-200 rounded-xl p-3 pl-10 focus:ring-2 focus:ring-indigo-500 outline-none"
                value={externalLink}
                onChange={e => setExternalLink(e.target.value)}
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
                  <button type="button" onClick={(e) => { e.preventDefault(); setAttachment(null); }} className="p-1 hover:bg-slate-200 rounded-full"><X size={14} /></button>
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
          <button type="button" onClick={onClose} className="px-5 py-2.5 text-slate-600 font-bold hover:bg-slate-100 rounded-xl">Cancel</button>
          <button
            type="submit"
            disabled={isLoading}
            className={`px-5 py-2.5 rounded-xl font-bold shadow-lg transition-all ${isLoading ? 'bg-slate-400 text-white opacity-80 cursor-wait' : 'bg-indigo-600 text-white shadow-indigo-600/20'}`}>
            {isLoading ? 'Assigning...' : 'Assign Task'}
          </button>
        </div>
      </form>
    </div>
  );
});

AssignTaskModal.displayName = 'AssignTaskModal';

interface EditTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: Task;
  employees: Employee[];
  usersList: User[];
  onSubmit: (payload: {
    title: string;
    description: string;
    assignedTo: string;
    assigned_to: number | null;
    dueDate: string;
    priority: 'LOW' | 'MEDIUM' | 'HIGH';
    attachment: string | null;
    externalLink: string | null;
  }) => Promise<void>;
  isLoading: boolean;
  serverError: string | null;
  setServerError: (err: string | null) => void;
}

const EditTaskModal: React.FC<EditTaskModalProps> = React.memo(({
  isOpen,
  onClose,
  task,
  employees,
  usersList,
  onSubmit,
  isLoading,
  serverError,
  setServerError
}) => {
  const [title, setTitle] = useState(task.title || '');
  const [assignedTo, setAssignedTo] = useState(task.assignedTo || (task as any).assignedToEmployeeId || '');
  const [priority, setPriority] = useState<'LOW' | 'MEDIUM' | 'HIGH'>(task.priority || 'MEDIUM');
  const [dueDate, setDueDate] = useState(task.dueDate || '');
  const [description, setDescription] = useState(task.description || '');
  const [externalLink, setExternalLink] = useState(task.externalLink || '');
  const [attachment, setAttachment] = useState<string | null>(task.attachment || null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      try {
        const base64 = await convertFileToBase64(e.target.files[0]);
        setAttachment(base64);
      } catch (err) {
        setServerError('Failed to upload task attachment. Please try again.');
      }
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !assignedTo || !dueDate) {
      setServerError('Please provide title, assignee and due date');
      return;
    }
    setServerError(null);

    const matchedUser = usersList.find(u => String(u.employeeId) === String(assignedTo));
    const assigned_to_numeric = matchedUser ? Number(matchedUser.id) : null;

    try {
      await onSubmit({
        title,
        description,
        assignedTo,
        assigned_to: assigned_to_numeric,
        dueDate,
        priority,
        attachment,
        externalLink
      });
    } catch (e) {
      // Error is handled in parent
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <form onSubmit={handleFormSubmit} className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center shrink-0">
          <h3 className="text-xl font-extrabold text-slate-800">Edit Task</h3>
          <button type="button" onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full text-slate-500"><X size={20} /></button>
        </div>
        <div className="p-6 space-y-4 overflow-y-auto">
          {serverError && (
            <div className="p-3 bg-red-50 border border-red-100 text-red-700 rounded-xl text-sm">
              <strong className="font-bold">Error: </strong>
              <span>{serverError}</span>
            </div>
          )}

          <div className="relative">
            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Task Title</label>
            <div className="relative">
              <input
                type="text"
                className="w-full border border-slate-200 rounded-xl p-3 pr-10 focus:ring-2 focus:ring-indigo-500 outline-none"
                value={title}
                onChange={e => { setTitle(e.target.value); setServerError(null); }}
              />

            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <ArrowRightLeft size={13} className="text-indigo-600" /> Assign To / Transfer
              </label>
              <div className="relative">
                <Users className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <select
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-800 focus:outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-xs"
                  value={assignedTo}
                  onChange={e => { setAssignedTo(e.target.value); setServerError(null); }}
                >
                  <option value="">Select Team Member...</option>
                  {employees.filter(emp => !(emp as any).is_archived).map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.name} {emp.department ? `(${emp.department})` : ''}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-2">Priority Level</label>
              <select
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-800 focus:outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-xs"
                value={priority}
                onChange={e => setPriority(e.target.value as any)}
              >
                <option value="LOW">Low Priority</option>
                <option value="MEDIUM">Medium Priority</option>
                <option value="HIGH font-bold">High Priority (Urgent)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Calendar size={13} className="text-indigo-600" /> Target Due Date
              </label>
              <input
                type="date"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-800 focus:outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-xs"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-xs font-bold text-slate-500 uppercase">Description</label>
            </div>
            <textarea
              className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-indigo-500 outline-none h-24 resize-none"
              value={description}
              onChange={e => setDescription(e.target.value)}
            />

          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">External Link / Sheet URL (Optional)</label>
            <div className="relative">
              <Link className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="url"
                className="w-full border border-slate-200 rounded-xl p-3 pl-10 focus:ring-2 focus:ring-indigo-500 outline-none"
                value={externalLink}
                onChange={e => setExternalLink(e.target.value)}
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
                  <button type="button" onClick={(e) => { e.preventDefault(); setAttachment(null); }} className="p-1 hover:bg-slate-200 rounded-full"><X size={14} /></button>
                </div>
              ) : (
                <div className="text-slate-400 text-sm">
                  <Upload size={20} className="mx-auto mb-2" />
                  Click to upload new file (PDF, JPG, PNG)
                </div>
              )}
            </label>
          </div>
        </div>
        <div className="p-6 bg-slate-50/50 flex justify-end gap-3 border-t border-slate-100 shrink-0">
          <button type="button" onClick={onClose} className="px-5 py-2.5 text-slate-600 font-bold hover:bg-slate-100 rounded-xl">Cancel</button>
          <button
            type="submit"
            disabled={isLoading}
            className={`px-5 py-2.5 rounded-xl font-bold shadow-lg transition-all ${isLoading ? 'bg-slate-400 text-white opacity-80 cursor-wait' : 'bg-indigo-600 text-white shadow-indigo-600/20'}`}>
            {isLoading ? 'Updating...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
});

EditTaskModal.displayName = 'EditTaskModal';

interface CompleteTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (processNote: string, attachment: string | null) => Promise<void>;
  isLoading: boolean;
}

const CompleteTaskModal: React.FC<CompleteTaskModalProps> = React.memo(({
  isOpen,
  onClose,
  onSubmit,
  isLoading
}) => {
  const [processNote, setProcessNote] = useState('');
  const [attachment, setAttachment] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      try {
        const base64 = await convertFileToBase64(e.target.files[0]);
        setAttachment(base64);
      } catch (err) {
        setError('Failed to upload task attachment. Please try again.');
      }
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!processNote.trim()) {
      setError('Please provide a process description of how you completed this task.');
      return;
    }
    setError(null);
    await onSubmit(processNote, attachment);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <form onSubmit={handleFormSubmit} className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center shrink-0">
          <h3 className="text-xl font-extrabold text-slate-800">Submit Completion Report</h3>
          <button type="button" onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full text-slate-500"><X size={20} /></button>
        </div>
        <div className="p-6 space-y-4 overflow-y-auto">
          {error && (
            <div className="p-3 bg-red-50 border border-red-100 text-red-700 rounded-xl text-sm">
              <strong className="font-bold">Error: </strong>
              <span>{error}</span>
            </div>
          )}

          <div className="bg-indigo-50 p-4 rounded-xl text-indigo-800 text-sm font-medium mb-4">
            Please describe the steps taken to complete this task and attach any necessary proof (photos/documents).
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Process Description (How to?)</label>
            <textarea
              className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-indigo-500 outline-none h-32 resize-none"
              value={processNote}
              onChange={e => { setProcessNote(e.target.value); setError(null); }}
              placeholder="I have completed the task by..."
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
                  <button type="button" onClick={(e) => { e.preventDefault(); setAttachment(null); }} className="p-1 hover:bg-slate-200 rounded-full"><X size={14} /></button>
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
          <button type="button" onClick={onClose} className="px-5 py-2.5 text-slate-600 font-bold hover:bg-slate-100 rounded-xl">Cancel</button>
          <button type="submit" disabled={isLoading} className="px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold shadow-lg shadow-green-600/20 disabled:opacity-60">
            {isLoading ? 'Submitting...' : 'Mark as Completed'}
          </button>
        </div>
      </form>
    </div>
  );
});

CompleteTaskModal.displayName = 'CompleteTaskModal';

interface ObjectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (extensionDate: string, extensionReason: string) => Promise<void>;
  isLoading: boolean;
}

const ObjectionModal: React.FC<ObjectionModalProps> = React.memo(({
  isOpen,
  onClose,
  onSubmit,
  isLoading
}) => {
  const [extensionDate, setExtensionDate] = useState('');
  const [extensionReason, setExtensionReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!extensionDate.trim()) {
      setError('Please provide a proposed new deadline date.');
      return;
    }
    if (!extensionReason.trim()) {
      setError('Please provide a reason for the extension request.');
      return;
    }
    setError(null);
    await onSubmit(extensionDate, extensionReason);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <form onSubmit={handleFormSubmit} className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-slate-100 bg-red-50/50 flex justify-between items-center shrink-0">
          <h3 className="text-xl font-extrabold text-red-800">Raise Objection / Request Extension</h3>
          <button type="button" onClick={onClose} className="p-2 hover:bg-red-100 rounded-full text-red-500"><X size={20} /></button>
        </div>
        <div className="p-6 space-y-4 overflow-y-auto">
          {error && (
            <div className="p-3 bg-red-50 border border-red-100 text-red-700 rounded-xl text-sm">
              <strong className="font-bold">Error: </strong>
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-start gap-3 bg-red-50 p-4 rounded-xl text-red-800 text-sm font-medium">
            <AlertCircle size={20} className="flex-shrink-0 mt-0.5" />
            <p>Use this form if the task cannot be completed by the deadline or if there are blockers. This will alert the Assignee.</p>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Proposed New Deadline</label>
            <input
              type="date"
              className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-red-500 outline-none"
              value={extensionDate}
              onChange={e => { setExtensionDate(e.target.value); setError(null); }}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Reason / Note</label>
            <textarea
              className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-red-500 outline-none h-32 resize-none"
              value={extensionReason}
              onChange={e => { setExtensionReason(e.target.value); setError(null); }}
              placeholder="I cannot complete this because..."
            />

          </div>
        </div>
        <div className="p-6 bg-slate-50/50 flex justify-end gap-3 border-t border-slate-100 shrink-0">
          <button type="button" onClick={onClose} className="px-5 py-2.5 text-slate-600 font-bold hover:bg-slate-100 rounded-xl">Cancel</button>
          <button type="submit" disabled={isLoading} className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold shadow-lg shadow-red-600/20 disabled:opacity-60">
            {isLoading ? 'Submitting...' : 'Submit Request'}
          </button>
        </div>
      </form>
    </div>
  );
});

ObjectionModal.displayName = 'ObjectionModal';

interface ActionPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'HOLD' | 'TERMINATE' | 'DELETE';
  onSubmit: (actionReason: string) => Promise<void>;
  isLoading: boolean;
}

const ActionPromptModal: React.FC<ActionPromptModalProps> = React.memo(({
  isOpen,
  onClose,
  type,
  onSubmit,
  isLoading
}) => {
  const [actionReason, setActionReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!actionReason.trim()) {
      setError(`Please provide a reason before performing the ${type.toLowerCase()} action.`);
      return;
    }
    setError(null);
    await onSubmit(actionReason);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <form onSubmit={handleFormSubmit} className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col">
        <div className="p-6 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
          <h3 className="text-xl font-extrabold text-slate-800 capitalize">{type === 'DELETE' ? 'Delete Task' : `${type.toLowerCase()} Task`}</h3>
          <button type="button" onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full text-slate-500"><X size={20} /></button>
        </div>
        <div className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-100 text-red-700 rounded-xl text-sm">
              <strong className="font-bold">Error: </strong>
              <span>{error}</span>
            </div>
          )}

          <p className="text-sm text-slate-600 font-medium">
            {type === 'DELETE'
              ? "Are you sure you want to delete this task? Please provide a reason for the deletion record."
              : `Please specify the reason for ${type === 'HOLD' ? 'putting this task on hold' : 'terminating this task'}.`
            }
          </p>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Reason / Note <span className="text-red-500">*</span></label>
            <textarea
              className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-indigo-500 outline-none h-32 resize-none"
              value={actionReason}
              onChange={e => { setActionReason(e.target.value); setError(null); }}
              placeholder="Enter reason here..."
              autoFocus
            />

          </div>
        </div>
        <div className="p-6 bg-slate-50/50 flex justify-end gap-3 border-t border-slate-100">
          <button type="button" onClick={onClose} className="px-5 py-2.5 text-slate-600 font-bold hover:bg-slate-100 rounded-xl">Cancel</button>
          <button
            type="submit"
            disabled={isLoading}
            className={`px-5 py-2.5 text-white rounded-xl font-bold shadow-lg disabled:opacity-60 ${type === 'DELETE' || type === 'TERMINATE' ? 'bg-red-600 hover:bg-red-700 shadow-red-600/20' : 'bg-yellow-500 hover:bg-yellow-600 shadow-yellow-500/20'
              }`}
          >
            {isLoading ? 'Confirming...' : `Confirm ${type === 'DELETE' ? 'Delete' : (type === 'HOLD' ? 'Hold' : 'Terminate')}`}
          </button>
        </div>
      </form>
    </div>
  );
});

ActionPromptModal.displayName = 'ActionPromptModal';

