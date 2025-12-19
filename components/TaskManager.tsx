
import React, { useState, useEffect } from 'react';
import { Task, TaskStatus, Employee, User, Notification, ExtensionRequest } from '../types';
import { format, isPast, differenceInHours } from 'date-fns';
import { ClipboardList, Plus, Clock, CheckCircle2, AlertTriangle, AlertCircle, Calendar, User as UserIcon, Upload, X, Ban, PauseCircle, ChevronRight, FileText, Trash2, MoreVertical, Search, MessageSquare, Download, Sparkles, Link } from 'lucide-react';
import { AITextEnhancer } from './AITextEnhancer';
import { convertFileToBase64 } from '../utils/fileHelper';

interface TaskManagerProps {
  tasks: Task[];
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  currentUser: User;
  employees: Employee[];
  addNotification: (title: string, msg: string, type: Notification['type'], targetUser: string) => void;
}

export const TaskManager: React.FC<TaskManagerProps> = ({ tasks, setTasks, currentUser, employees, addNotification }) => {
  const [activeTab, setActiveTab] = useState<'ALL' | 'PENDING' | 'COMPLETED' | 'OVERDUE'>('ALL');
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showCompleteModal, setShowCompleteModal] = useState<string | null>(null); // Task ID
  const [showObjectionModal, setShowObjectionModal] = useState<string | null>(null); // Task ID
  
  // Action Reason Modal State
  const [actionPrompt, setActionPrompt] = useState<{taskId: string, type: 'HOLD' | 'TERMINATE' | 'DELETE'} | null>(null);
  const [actionReason, setActionReason] = useState('');

  const [mobileMenuOpenId, setMobileMenuOpenId] = useState<string | null>(null); // For mobile 3-dots menu
  const [searchTerm, setSearchTerm] = useState(''); // Text Search
  const [searchDate, setSearchDate] = useState(''); // Date Search

  // Form States for New Task
  const [newTask, setNewTask] = useState<Partial<Task>>({ priority: 'MEDIUM' });
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

  // --- Helper for Overdue Logic ---
  const isSameDay = (d1: Date, d2: Date) => {
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate();
  };

  // Check for auto-overdue visual
  const getDisplayStatus = (task: Task): TaskStatus => {
    // If pending and due date is strictly in the past (not today), it is OVERDUE
    if (task.status === 'PENDING' && isPast(new Date(task.dueDate)) && !isSameDay(new Date(), new Date(task.dueDate))) {
      return 'OVERDUE';
    }
    return task.status;
  };

  // --- File Upload Handler ---
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      try {
        const base64 = await convertFileToBase64(e.target.files[0]);
        setAttachment(base64);
      } catch (err) {
        console.error("File upload failed", err);
        alert("Failed to upload file.");
      }
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
      const assignedEmp = employees.find(e => e.id === t.assignedTo);
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

  const handleCreateTask = () => {
    if (newTask.title && newTask.assignedTo && newTask.dueDate) {
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      const task: Task = {
        id: `T-${Math.floor(1000 + Math.random() * 9000)}`,
        title: newTask.title,
        description: newTask.description || '',
        assignedTo: newTask.assignedTo,
        assignedBy: currentUser.name,
        createdDate: newTask.createdDate || todayStr,
        dueDate: newTask.dueDate,
        status: 'PENDING',
        priority: newTask.priority || 'MEDIUM',
        attachment: attachment || undefined,
        externalLink: newTask.externalLink || undefined,
        extensionHistory: []
      };
      setTasks([task, ...tasks]);
      setShowAssignModal(false);
      setNewTask({ priority: 'MEDIUM' });
      setAttachment(null);
      addNotification('New Task', `Task "${task.title}" assigned successfully.`, 'TASK', task.assignedTo);
    }
  };

  const handleCompleteTask = (taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    setTasks(tasks.map(t => {
      if (t.id === taskId) {
        return {
          ...t,
          status: 'COMPLETED',
          completionDate: new Date().toISOString().split('T')[0],
          completionProcess: processNote,
          completionAttachment: attachment || undefined
        };
      }
      return t;
    }));
    setShowCompleteModal(null);
    setProcessNote('');
    setAttachment(null);
    if(task) addNotification('Task Completed', `Task ${taskId} marked as completed by ${currentUser.name}.`, 'TASK', 'ADMIN');
  };

  const handleRaiseObjection = (taskId: string) => {
    setTasks(tasks.map(t => {
      if (t.id === taskId) {
        const newReq: ExtensionRequest = {
            requestedDate: extensionDate,
            reason: extensionReason,
            status: 'PENDING',
            timestamp: new Date().toISOString()
        };
        return {
          ...t,
          status: 'EXTENSION_REQUESTED',
          extensionRequest: newReq, // Set as current
          extensionHistory: [...(t.extensionHistory || []), newReq] // Add to log
        };
      }
      return t;
    }));
    setShowObjectionModal(null);
    setExtensionDate('');
    setExtensionReason('');
    addNotification('Task Alert', `Extension requested for Task ${taskId} by ${currentUser.name}.`, 'TASK', 'ADMIN');
  };

  const initiateAdminAction = (taskId: string, type: 'HOLD' | 'TERMINATE' | 'DELETE') => {
    setActionPrompt({ taskId, type });
    setActionReason('');
  };

  const confirmAdminAction = () => {
    if (!actionPrompt) return;
    if (!actionReason.trim()) {
        alert("Please provide a reason for this action.");
        return;
    }

    const { taskId, type } = actionPrompt;
    const task = tasks.find(t => t.id === taskId);

    if (type === 'DELETE') {
        setTasks(tasks.filter(t => t.id !== taskId));
    } else {
        setTasks(tasks.map(t => {
            if (t.id !== taskId) return t;
            return {
                ...t,
                status: type === 'HOLD' ? 'HOLD' : 'TERMINATED',
                statusNote: actionReason
            };
        }));
        if(task) addNotification('Task Update', `Task ${taskId} was ${type.toLowerCase()}ed by Admin.`, 'TASK', task.assignedTo);
    }
    setActionPrompt(null);
    setActionReason('');
  };

  const handleResumeTask = (taskId: string) => {
      const task = tasks.find(t => t.id === taskId);
      setTasks(tasks.map(t => {
          if (t.id !== taskId) return t;
          return { ...t, status: 'PENDING', statusNote: undefined };
      }));
      if(task) addNotification('Task Resumed', `Task ${taskId} is now active again.`, 'TASK', task.assignedTo);
  };

  const handleExtensionResponse = (taskId: string, approved: boolean) => {
      const task = tasks.find(t => t.id === taskId);
      setTasks(tasks.map(t => {
          if (t.id !== taskId) return t;
          
          // Update Log in history (find latest pending or update last added)
          let newHistory = t.extensionHistory || [];
          if (newHistory.length > 0) {
              const lastIndex = newHistory.length - 1;
              newHistory = [
                  ...newHistory.slice(0, lastIndex),
                  { ...newHistory[lastIndex], status: approved ? 'APPROVED' : 'REJECTED' }
              ];
          }

          if (approved && t.extensionRequest) {
              return {
                  ...t,
                  status: 'PENDING',
                  dueDate: t.extensionRequest.requestedDate,
                  extensionRequest: { ...t.extensionRequest, status: 'APPROVED' },
                  extensionHistory: newHistory
              };
          } else if (!approved && t.extensionRequest) {
              return {
                  ...t,
                  status: 'OVERDUE',
                  extensionRequest: { ...t.extensionRequest, status: 'REJECTED' },
                  extensionHistory: newHistory
              };
          }
          return t;
      }));
      if(task) addNotification('Extension Request', `Your extension request for Task ${taskId} was ${approved ? 'Approved' : 'Rejected'}.`, 'TASK', task.assignedTo);
  };

  // --- Filtering ---
  
  // Employees see tasks assigned TO them OR tasks assigned BY them
  const relevantTasks = isAdmin 
    ? tasks 
    : tasks.filter(t => t.assignedTo === currentUser.employeeId || t.assignedBy === currentUser.name);

  const filteredTasks = relevantTasks.filter(t => {
    const displayStatus = getDisplayStatus(t);

    // 1. Tab Filter
    let matchesTab = true;
    if (activeTab === 'PENDING') {
        // Pending tab should NOT show Overdue items
        matchesTab = (displayStatus === 'PENDING' || displayStatus === 'EXTENSION_REQUESTED' || displayStatus === 'HOLD');
    }
    else if (activeTab === 'COMPLETED') {
        matchesTab = (displayStatus === 'COMPLETED' || displayStatus === 'TERMINATED');
    }
    else if (activeTab === 'OVERDUE') {
        // Overdue tab should show calculated OVERDUE items
        matchesTab = (displayStatus === 'OVERDUE');
    }
    
    // 2. Search Filter (Text)
    const term = searchTerm.toLowerCase();
    const matchesSearch = 
      t.title.toLowerCase().includes(term) ||
      t.description.toLowerCase().includes(term) ||
      t.id.toLowerCase().includes(term);

    // 3. Search Filter (Date)
    const matchesDate = searchDate 
        ? t.dueDate === searchDate || t.createdDate === searchDate 
        : true;

    return matchesTab && matchesSearch && matchesDate;
  });

  const getPriorityColor = (p: string) => {
    switch(p) {
      case 'HIGH': return 'bg-red-100 text-red-700 border-red-200';
      case 'MEDIUM': return 'bg-orange-100 text-orange-700 border-orange-200';
      default: return 'bg-blue-100 text-blue-700 border-blue-200';
    }
  };

  const getStatusColor = (s: TaskStatus) => {
    switch(s) {
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
  const isNewTask = (dateStr: string) => {
      const created = new Date(dateStr);
      return differenceInHours(new Date(), created) < 48;
  };

  const renderActionButtons = (task: Task, isMobile: boolean) => {
    const displayStatus = getDisplayStatus(task);
    const isTaskOverdue = displayStatus === 'OVERDUE';
    const isCreator = task.assignedBy === currentUser.name;
    const isAssignee = task.assignedTo === currentUser.employeeId;

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
    <div className="p-4 md:p-8 bg-slate-50/50 h-full overflow-y-auto custom-scrollbar">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-6">
        <div>
          <h2 className="text-2xl md:text-3xl font-extrabold text-slate-800 flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 text-white rounded-xl flex items-center justify-center shadow-lg shadow-indigo-600/20 shrink-0">
              <ClipboardList size={20} />
            </div>
            Task Manager
          </h2>
          <p className="text-slate-500 mt-2 font-medium md:ml-14">
            Assign tasks, track progress, and manage submissions.
          </p>
        </div>
        
        <div className="flex flex-col md:flex-row gap-3 w-full md:w-auto">
          {isAdmin && (
            <>
              <button 
                onClick={handleExportTasks}
                className="w-full md:w-auto bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 px-5 py-3 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95 font-bold"
              >
                <Download size={18} />
                Export Data
              </button>
              <button 
                onClick={() => setShowAssignModal(true)}
                className="w-full md:w-auto bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-3 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20 transition-all active:scale-95 font-bold"
              >
                <Plus size={18} />
                Assign New Task
              </button>
            </>
          )}
        </div>
      </div>

      {/* Search and Filter Row */}
      <div className="flex flex-col gap-4 mb-6">
          
          {/* Top Row: Tabs */}
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide w-full">
            {['ALL', 'PENDING', 'COMPLETED', 'OVERDUE'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as any)}
                className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${
                  activeTab === tab 
                    ? 'bg-white text-indigo-600 shadow-md ring-1 ring-slate-100' 
                    : 'text-slate-400 hover:text-slate-600 hover:bg-white/50'
                }`}
              >
                {tab.charAt(0) + tab.slice(1).toLowerCase()}
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
               <div className="relative w-full md:w-48">
                <input 
                type="date"
                value={searchDate}
                onChange={(e) => setSearchDate(e.target.value)}
                className="w-full pl-4 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none shadow-sm transition-all text-slate-600 font-medium"
                />
                {searchDate && (
                    <button onClick={() => setSearchDate('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500">
                        <X size={16}/>
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
            .sort((a, b) => new Date(b.createdDate).getTime() - new Date(a.createdDate).getTime()) // Sort by Newest First
            .map(task => {
            const displayStatus = getDisplayStatus(task);
            const isTaskOverdue = displayStatus === 'OVERDUE';
            const assignedEmp = employees.find(e => e.id === task.assignedTo);
            const isCreator = task.assignedBy === currentUser.name;
            const isNew = isNewTask(task.createdDate);

            return (
              <div key={task.id} className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 hover:shadow-md transition-shadow relative overflow-visible group">
                <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${isTaskOverdue ? 'bg-red-500' : (task.status === 'COMPLETED' ? 'bg-green-500' : 'bg-indigo-500')}`}></div>
                
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
                    
                    <div className="flex flex-col sm:flex-row sm:flex-wrap items-start sm:items-center gap-3 sm:gap-6 text-sm text-slate-500">
                       <div className="flex items-center gap-2">
                        <UserIcon size={16} className="text-slate-400" />
                        <span className="font-medium">From: <span className="text-slate-700">{task.assignedBy}</span></span>
                      </div>
                      <div className="flex items-center gap-2">
                        <UserIcon size={16} className="text-slate-400" />
                        <span className="font-medium">To: <span className="text-slate-700">{assignedEmp?.name || task.assignedTo}</span></span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Calendar size={16} className="text-slate-400" />
                        <span className="font-medium">Assigned: <span className="text-slate-700">{format(new Date(task.createdDate), 'MMM do, yyyy')}</span></span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Calendar size={16} className="text-slate-400" />
                        <span className={`font-medium ${isTaskOverdue ? 'text-red-600 font-bold' : ''}`}>
                          Due: {format(new Date(task.dueDate), 'MMM do, yyyy')}
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
                      {task.status === 'COMPLETED' && (
                        <div className="bg-green-50/50 p-4 rounded-xl border border-green-100 text-sm">
                          <p className="font-bold text-green-800 mb-1 flex items-center gap-2"><CheckCircle2 size={16}/> Completed on {task.completionDate}</p>
                          <p className="text-green-700/80 italic break-words">"{task.completionProcess}"</p>
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
                          <p className="font-bold text-purple-800 mb-1 flex items-center gap-2"><Clock size={16}/> Extension Requested</p>
                          <p className="text-purple-700 mb-2">Team Member requested new date: <span className="font-bold">{task.extensionRequest?.requestedDate}</span></p>
                          <p className="text-purple-600 italic break-words">Reason: "{task.extensionRequest?.reason}"</p>
                          
                          {(isAdmin || isCreator) && (
                            <div className="flex gap-2 mt-3">
                              <button 
                                onClick={() => handleExtensionResponse(task.id, true)}
                                className="px-3 py-1.5 bg-purple-600 text-white rounded-lg text-xs font-bold shadow-sm hover:bg-purple-700"
                              >
                                Approve New Date
                              </button>
                              <button 
                                onClick={() => handleExtensionResponse(task.id, false)}
                                className="px-3 py-1.5 bg-white border border-purple-200 text-purple-600 rounded-lg text-xs font-bold hover:bg-purple-50"
                              >
                                Reject
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Show Status Note (Hold/Terminate Reason) */}
                      {(task.status === 'HOLD' || task.status === 'TERMINATED') && task.statusNote && (
                         <div className={`p-4 rounded-xl border text-sm ${task.status === 'HOLD' ? 'bg-yellow-50 border-yellow-100' : 'bg-gray-50 border-gray-200'}`}>
                           <p className={`font-bold mb-1 flex items-center gap-2 ${task.status === 'HOLD' ? 'text-yellow-800' : 'text-gray-700'}`}>
                              <MessageSquare size={16}/> {task.status === 'HOLD' ? 'Hold Reason' : 'Termination Reason'}
                           </p>
                           <p className={`${task.status === 'HOLD' ? 'text-yellow-700' : 'text-gray-600'} italic`}>"{task.statusNote}"</p>
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
               <button onClick={() => setShowAssignModal(false)} className="p-2 hover:bg-slate-200 rounded-full text-slate-500"><X size={20}/></button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto">
              <div className="relative">
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Task Title</label>
                <div className="relative">
                    <input 
                    type="text" 
                    className="w-full border border-slate-200 rounded-xl p-3 pr-10 focus:ring-2 focus:ring-indigo-500 outline-none"
                    value={newTask.title || ''}
                    onChange={e => setNewTask({...newTask, title: e.target.value})}
                    placeholder="e.g. Inspect HVAC Unit B"
                    />
                    <AITextEnhancer 
                        text={newTask.title || ''} 
                        onUpdate={(text) => setNewTask({...newTask, title: text})} 
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
                    value={newTask.assignedTo || ''}
                    onChange={e => setNewTask({...newTask, assignedTo: e.target.value})}
                  >
                    <option value="">Select Team Member</option>
                    {employees.map(e => (
                      <option key={e.id} value={e.id}>{e.name} ({e.department})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Priority</label>
                  <select 
                    className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                    value={newTask.priority || 'MEDIUM'}
                    onChange={e => setNewTask({...newTask, priority: e.target.value as any})}
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
                        onChange={e => setNewTask({...newTask, createdDate: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Due Date</label>
                    <input 
                      type="date" 
                      className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-indigo-500 outline-none"
                      value={newTask.dueDate || ''}
                      onChange={e => setNewTask({...newTask, dueDate: e.target.value})}
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
                  onChange={e => setNewTask({...newTask, description: e.target.value})}
                  placeholder="Detailed instructions..."
                />
                 <AITextEnhancer 
                    text={newTask.description || ''} 
                    onUpdate={(text) => setNewTask({...newTask, description: text})} 
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
                          onChange={e => setNewTask({...newTask, externalLink: e.target.value})}
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
              <button onClick={handleCreateTask} className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-600/20">Assign Task</button>
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
               <button onClick={() => setShowCompleteModal(null)} className="p-2 hover:bg-slate-200 rounded-full text-slate-500"><X size={20}/></button>
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
               <button onClick={() => setShowObjectionModal(null)} className="p-2 hover:bg-red-100 rounded-full text-red-500"><X size={20}/></button>
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
               <button onClick={() => setActionPrompt(null)} className="p-2 hover:bg-slate-200 rounded-full text-slate-500"><X size={20}/></button>
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
                  className={`px-5 py-2.5 text-white rounded-xl font-bold shadow-lg ${
                      actionPrompt.type === 'DELETE' || actionPrompt.type === 'TERMINATE' ? 'bg-red-600 shadow-red-600/20' : 'bg-yellow-500 shadow-yellow-500/20'
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
