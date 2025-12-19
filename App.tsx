
import React, { useState, useEffect, useCallback, useLayoutEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { Auth } from './components/Auth';
import { AttendanceSheet } from './components/AttendanceSheet';
import { EmployeeMaster } from './components/EmployeeMaster';
import { LeaveManagement } from './components/LeaveManagement';
import { Dashboard } from './components/Dashboard';
import { EmployeeDashboard } from './components/EmployeeDashboard';
import { ReadMe } from './components/ReadMe';
import { HolidayManager } from './components/HolidayManager';
import { TaskManager } from './components/TaskManager';
import { MaterialOrders } from './components/MaterialOrders';
import { ArchivedStaff } from './components/ArchivedStaff';
import { PerformanceReport } from './components/PerformanceReport';
import { QuerySystem } from './components/QuerySystem';
import { ChatSystem } from './components/ChatSystem';
import { TimeLogViewer } from './components/TimeLogViewer';
import { NotificationCenter } from './components/NotificationCenter';
import { OrganizationTree } from './components/OrganizationTree';
import { ProjectManager } from './components/ProjectManager';
import { CalendarView } from './components/CalendarView'; 
import { FinanceDashboard } from './components/FinanceDashboard'; 
import { Notepad } from './components/Notepad'; 
import { ChecklistSystem } from './components/ChecklistSystem'; 
import { DatabaseManager } from './components/DatabaseManager';
import { ViewMode, Employee, AttendanceRecord, User, TimeLog, AttendanceValue, Task, MaterialOrder, Query, ChatMessage, ChatGroup, Notification, Project, SitePhoto, SundayRequest, LeaveRequest, Holiday, Reminder, ClientFinancial, VendorFinancial, Note, ChecklistTemplate, ChecklistInstance } from './types';
import { INITIAL_EMPLOYEES, INITIAL_USERS, INITIAL_TASKS, INITIAL_ORDERS, INITIAL_ARCHIVED_EMPLOYEES, INITIAL_QUERIES, INITIAL_CHATS, COMPANY_LOGO, INITIAL_PROJECTS, INITIAL_LEAVE_REQUESTS, INITIAL_CLIENT_FINANCIALS, INITIAL_VENDOR_FINANCIALS, INITIAL_NOTES, INITIAL_CHECKLIST_TEMPLATES, INITIAL_CHECKLIST_INSTANCES } from './constants';
import { formatDateKey, isDateSunday, formatDecimalHours } from './utils/dateUtils';
import { differenceInMinutes } from 'date-fns';
import { Menu, Bell } from 'lucide-react';
import { useLocalStorage } from './hooks/useLocalStorage';

const App: React.FC = () => {
  // 1. AUTH STATE (Primary Authority)
  const [currentUser, setCurrentUser] = useLocalStorage<User | null>('fms_currentUser', null);
  const [users, setUsers] = useLocalStorage<User[]>('fms_users', INITIAL_USERS);
  const [authError, setAuthError] = useState<string>('');

  // 2. VIEW STATE (Decoupled from hash if not logged in)
  const [currentView, setCurrentView] = useState<ViewMode>(ViewMode.DASHBOARD);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // SECURITY GUARD: Clear hash immediately if no user session found on load
  useLayoutEffect(() => {
    if (!currentUser && window.location.hash !== '') {
      // Strips the #HASH from the address bar to prevent deep-linking while logged out
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, [currentUser]);

  // INITIALIZE VIEW: Only sync view state with role/hash AFTER login
  useEffect(() => {
    if (currentUser) {
      const hash = window.location.hash.replace('#', '');
      if (Object.values(ViewMode).includes(hash as ViewMode)) {
        setCurrentView(hash as ViewMode);
      } else {
        setCurrentView(currentUser.role === 'ADMIN' ? ViewMode.DASHBOARD : ViewMode.EMPLOYEE_HOME);
      }
    }
  }, [currentUser]);

  // SYNC VIEW TO HASH: Only if authenticated
  useEffect(() => {
    if (currentUser) {
      window.location.hash = currentView;
    }
  }, [currentView, currentUser]);

  // HANDLE HASH CHANGES: Only if authenticated
  useEffect(() => {
    const handleHashChange = () => {
      if (!currentUser) {
        if (window.location.hash !== '') window.history.replaceState(null, '', window.location.pathname);
        return;
      }
      const hash = window.location.hash.replace('#', '');
      if (Object.values(ViewMode).includes(hash as ViewMode) && hash !== currentView) {
        setCurrentView(hash as ViewMode);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [currentView, currentUser]);

  // --- App Data State ---
  const [employees, setEmployees] = useLocalStorage<Employee[]>('fms_employees', INITIAL_EMPLOYEES);
  const [archivedEmployees, setArchivedEmployees] = useLocalStorage<Employee[]>('fms_archived', INITIAL_ARCHIVED_EMPLOYEES);
  const [attendanceData, setAttendanceData] = useLocalStorage<Record<string, AttendanceRecord>>('fms_attendance', {});
  const [holidays, setHolidays] = useLocalStorage<Holiday[]>('fms_holidays', []); 
  const [reminders, setReminders] = useLocalStorage<Reminder[]>('fms_reminders', []); 
  const [timeLogs, setTimeLogs] = useLocalStorage<Record<string, Record<string, TimeLog>>>('fms_timelogs', {}); 
  const [tasks, setTasks] = useLocalStorage<Task[]>('fms_tasks', INITIAL_TASKS);
  const [orders, setOrders] = useLocalStorage<MaterialOrder[]>('fms_orders', INITIAL_ORDERS);
  const [queries, setQueries] = useLocalStorage<Query[]>('fms_queries', INITIAL_QUERIES);
  const [chatMessages, setChatMessages] = useLocalStorage<ChatMessage[]>('fms_chats', INITIAL_CHATS);
  const [chatGroups, setChatGroups] = useLocalStorage<ChatGroup[]>('fms_chat_groups', []);
  const [projects, setProjects] = useLocalStorage<Project[]>('fms_projects', INITIAL_PROJECTS); 
  const [sitePhotos, setSitePhotos] = useLocalStorage<SitePhoto[]>('fms_site_photos', []);
  const [sundayRequests, setSundayRequests] = useLocalStorage<SundayRequest[]>('fms_sunday_req', []);
  const [leaveRequests, setLeaveRequests] = useLocalStorage<LeaveRequest[]>('fms_leave_req', INITIAL_LEAVE_REQUESTS);
  const [clientFinancials, setClientFinancials] = useLocalStorage<ClientFinancial[]>('fms_client_fin', INITIAL_CLIENT_FINANCIALS);
  const [vendorFinancials, setVendorFinancials] = useLocalStorage<VendorFinancial[]>('fms_vendor_fin', INITIAL_VENDOR_FINANCIALS);
  const [notes, setNotes] = useLocalStorage<Note[]>('fms_notes', INITIAL_NOTES);
  const [checklistTemplates, setChecklistTemplates] = useLocalStorage<ChecklistTemplate[]>('fms_check_temp', INITIAL_CHECKLIST_TEMPLATES);
  const [checklistInstances, setChecklistInstances] = useLocalStorage<ChecklistInstance[]>('fms_check_inst', INITIAL_CHECKLIST_INSTANCES);
  const [notifications, setNotifications] = useLocalStorage<Notification[]>('fms_notifications', []);
  const [showNotifications, setShowNotifications] = useState(false);

  // --- Handlers ---

  const handleLogin = async (email: string, pass: string) => {
    await new Promise(r => setTimeout(r, 600));
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === pass);
    if (user) {
      if (user.role === 'EMPLOYEE' && user.employeeId) {
          const isActive = employees.find(e => e.id === user.employeeId);
          if (!isActive) {
              setAuthError('Account is inactive. Contact Administrator.');
              return;
          }
      }
      setCurrentUser(user);
      setAuthError('');
      // Force initial view after login
      setCurrentView(user.role === 'ADMIN' ? ViewMode.DASHBOARD : ViewMode.EMPLOYEE_HOME);
    } else {
      setAuthError('Invalid credentials. Access Denied.');
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setAuthError('');
    setIsSidebarOpen(false);
    window.location.hash = ''; // Clear hash from URL on logout
  };

  const addNotification = (title: string, message: string, type: Notification['type'], targetUser: string = 'ALL') => {
    const newNote: Notification = {
        id: `N-${Date.now()}`,
        title, message,
        time: new Date().toLocaleTimeString(),
        read: false, type, targetUser
    };
    setNotifications(prev => [newNote, ...prev]);
  };

  const handleClockIn = async () => {
    if (!currentUser?.employeeId) return;
    const empId = currentUser.employeeId;
    const now = new Date();
    const dateKey = formatDateKey(now);
    if (isDateSunday(now)) {
       const approvedReq = sundayRequests.find(r => r.employeeId === empId && r.date === dateKey && r.status === 'APPROVED');
       if (!approvedReq) {
           alert("Sunday work requires approval.");
           return;
       }
    }
    setTimeLogs(prev => ({ ...prev, [empId]: { ...(prev[empId] || {}), [dateKey]: { date: dateKey, clockIn: now.toISOString() } } }));
    setAttendanceData(prev => ({ ...prev, [empId]: { ...(prev[empId] || {}), [dateKey]: 1 } }));
    addNotification('Attendance', `Shift started at ${now.toLocaleTimeString()}`, 'SYSTEM', empId);
  };

  const handleClockOut = async () => {
    if (!currentUser?.employeeId) return;
    const empId = currentUser.employeeId;
    const now = new Date();
    const dateKey = formatDateKey(now);
    const currentLog = timeLogs[empId]?.[dateKey];
    if (!currentLog?.clockIn) return;
    const diffMinutes = differenceInMinutes(now, new Date(currentLog.clockIn));
    const hoursWorked = diffMinutes / 60; 
    setTimeLogs(prev => ({ ...prev, [empId]: { ...(prev[empId] || {}), [dateKey]: { ...currentLog, clockOut: now.toISOString(), durationHours: hoursWorked } } }));
    let val: AttendanceValue = 0;
    if (hoursWorked >= 7.5) val = 1;
    else if (hoursWorked >= 6) val = 0.75;
    else if (hoursWorked >= 4) val = 0.5;
    else if (hoursWorked >= 2) val = 0.25;
    setAttendanceData(prev => ({ ...prev, [empId]: { ...(prev[empId] || {}), [dateKey]: val } }));
    addNotification('Attendance', `Shift ended. Total: ${formatDecimalHours(hoursWorked)}`, 'SYSTEM', empId);
  };

  // MASTER SECURITY GUARD: If not logged in, return Auth component IMMEDIATELY
  if (!currentUser) {
    return (
      <Auth 
        onLogin={handleLogin} 
        onResetPassword={async (email) => {
          const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
          if (user) {
            setUsers(prev => prev.map(u => u.email === user.email ? { ...u, password: 'KBT' + Math.floor(Math.random()*9000) } : u));
            return true;
          }
          return false;
        }} 
        error={authError} 
      />
    );
  }

  // --- Render Logic (Only executes if authenticated) ---
  const myNotifications = notifications.filter(n => currentUser.role === 'ADMIN' || n.targetUser === currentUser.employeeId || n.targetUser === 'ALL');
  const unreadCount = myNotifications.filter(n => !n.read).length;

  const renderView = () => {
    const commonProps = { 
      employees, setEmployees, 
      attendanceData, setAttendanceData,
      currentUser, 
      tasks, setTasks, 
      orders, setOrders, 
      leaveRequests, setLeaveRequests, 
      holidays, setHolidays, 
      timeLogs, setTimeLogs, 
      projects, setProjects, 
      sitePhotos, setPhotos: setSitePhotos, 
      sundayRequests, setSundayRequests, 
      notes, setNotes, 
      checklistTemplates, setChecklistTemplates, 
      checklistInstances, setChecklistInstances, 
      addNotification, 
      users, setUsers, 
      archivedEmployees, setArchivedEmployees, 
      onNavigate: setCurrentView 
    };
    
    if (currentUser.role === 'ADMIN') {
      switch (currentView) {
        case ViewMode.DASHBOARD: return <Dashboard employees={employees} attendanceData={attendanceData} onNavigate={setCurrentView} />;
        case ViewMode.CALENDAR: return <CalendarView {...commonProps} leaves={leaveRequests} reminders={reminders} setReminders={setReminders} />;
        case ViewMode.ATTENDANCE: return <AttendanceSheet {...commonProps} />;
        case ViewMode.EMPLOYEES: return <EmployeeMaster {...commonProps} onSwitchUser={setCurrentUser} />;
        case ViewMode.CHECKLIST: return <ChecklistSystem {...commonProps} templates={checklistTemplates} setTemplates={setChecklistTemplates} instances={checklistInstances} setInstances={setChecklistInstances} />;
        case ViewMode.FMS_TASKS: return <TaskManager {...commonProps} />;
        case ViewMode.MATERIAL_ORDERS: return <MaterialOrders {...commonProps} />;
        case ViewMode.PROJECTS: return <ProjectManager {...commonProps} photos={sitePhotos} setPhotos={setSitePhotos} />;
        case ViewMode.FINANCE: return <FinanceDashboard {...commonProps} clientFinancials={clientFinancials} setClientFinancials={setClientFinancials} vendorFinancials={vendorFinancials} setVendorFinancials={setVendorFinancials} />;
        case ViewMode.TIME_LOGS: return <TimeLogViewer {...commonProps} />;
        case ViewMode.PERFORMANCE: return <PerformanceReport {...commonProps} />;
        case ViewMode.QUERIES: return <QuerySystem queries={queries} setQueries={setQueries} {...commonProps} />;
        case ViewMode.CHAT: return <ChatSystem messages={chatMessages} setMessages={setChatMessages} groups={chatGroups} setGroups={setChatGroups} {...commonProps} />;
        case ViewMode.NOTEPAD: return <Notepad {...commonProps} />;
        case ViewMode.ARCHIVED_STAFF: return <ArchivedStaff {...commonProps} />;
        case ViewMode.ORGANIZATION_TREE: return <OrganizationTree employees={employees} />;
        case ViewMode.HOLIDAYS: return <HolidayManager holidays={holidays} setHolidays={setHolidays} />;
        case ViewMode.LEAVES: return <LeaveManagement {...commonProps} />;
        case ViewMode.DATABASE: return <DatabaseManager allData={{...commonProps, users}} onRestore={(d) => {}} onReset={() => {}} />;
        case ViewMode.NOTIFICATIONS: return <NotificationCenter notifications={notifications} setNotifications={setNotifications} currentUser={currentUser} onNavigate={setCurrentView} />;
        case ViewMode.README: return <ReadMe role="ADMIN" />;
        default: return <Dashboard employees={employees} attendanceData={attendanceData} onNavigate={setCurrentView} />;
      }
    } else {
      switch (currentView) {
        case ViewMode.EMPLOYEE_HOME: return <EmployeeDashboard user={currentUser} onClockIn={handleClockIn} onClockOut={handleClockOut} onUpdateProfile={(id, data) => setEmployees(prev => prev.map(e => e.id === id ? { ...e, ...data } : e))} {...commonProps} />;
        case ViewMode.EMPLOYEE_TASKS: return <TaskManager {...commonProps} />;
        case ViewMode.EMPLOYEE_ORDERS: return <MaterialOrders {...commonProps} />;
        case ViewMode.EMPLOYEE_PROJECTS: return <ProjectManager {...commonProps} photos={sitePhotos} setPhotos={setSitePhotos} />;
        case ViewMode.CHECKLIST: return <ChecklistSystem {...commonProps} templates={checklistTemplates} setTemplates={setChecklistTemplates} instances={checklistInstances} setInstances={setChecklistInstances} />;
        case ViewMode.CALENDAR: return <CalendarView {...commonProps} leaves={leaveRequests} reminders={reminders} setReminders={setReminders} />;
        case ViewMode.LEAVES: return <LeaveManagement {...commonProps} />;
        case ViewMode.NOTEPAD: return <Notepad {...commonProps} />;
        case ViewMode.EMPLOYEE_CHAT: return <ChatSystem messages={chatMessages} setMessages={setChatMessages} groups={chatGroups} setGroups={setChatGroups} {...commonProps} />;
        case ViewMode.EMPLOYEE_QUERIES: return <QuerySystem queries={queries} setQueries={setQueries} {...commonProps} />;
        case ViewMode.NOTIFICATIONS: return <NotificationCenter notifications={notifications} setNotifications={setNotifications} currentUser={currentUser} onNavigate={setCurrentView} />;
        case ViewMode.README: return <ReadMe role="EMPLOYEE" />;
        default: return <EmployeeDashboard user={currentUser} onClockIn={handleClockIn} onClockOut={handleClockOut} onUpdateProfile={()=>{}} {...commonProps} />;
      }
    }
  };

  return (
    <div className="flex h-screen w-full font-sans text-slate-900 overflow-hidden relative">
      <div className="fixed inset-0 z-0 bg-slate-50 pointer-events-none">
          <div className="absolute top-0 -left-4 w-96 h-96 bg-purple-300 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
          <div className="absolute top-0 -right-4 w-96 h-96 bg-blue-300 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>
          <div className="absolute -bottom-32 left-20 w-96 h-96 bg-pink-300 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-4000"></div>
      </div>

      <Sidebar 
        currentView={currentView} 
        onNavigate={setCurrentView} 
        role={currentUser.role} 
        onLogout={handleLogout} 
        userName={currentUser.name} 
        isOpen={isSidebarOpen} 
        onClose={() => setIsSidebarOpen(false)} 
        userDepartment={employees.find(e => e.id === currentUser.employeeId)?.department} 
      />
      
      <main className="flex-1 flex flex-col h-full overflow-hidden relative z-10 glass-panel md:m-4 md:rounded-3xl border-slate-200 shadow-2xl">
        <header className="bg-white/80 backdrop-blur-md p-4 flex justify-between items-center shadow-sm z-30 border-b border-white/20">
          <div className="flex items-center gap-2 md:hidden">
            <img src={COMPANY_LOGO} alt="Logo" className="w-8 h-8 bg-white rounded-lg shadow-sm" />
            <span className="font-extrabold text-sm uppercase tracking-tight">Kalra FMS</span>
          </div>
          <div className="flex-1"></div>
          <div className="flex items-center gap-4">
             <button className="relative p-2 text-slate-500 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition-colors" onClick={() => setShowNotifications(!showNotifications)}>
                <Bell size={24} />
                {unreadCount > 0 && <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 rounded-full text-[10px] flex items-center justify-center font-bold text-white border border-white animate-pulse">{unreadCount}</span>}
             </button>
             <button onClick={() => setIsSidebarOpen(true)} className="p-2 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100 md:hidden"><Menu size={24} /></button>
          </div>
        </header>

        <div className="flex-1 overflow-hidden relative">
          <div key={currentView} className="h-full animate-fade-in-up">
              {renderView()}
          </div>
        </div>
      </main>

      {showNotifications && (
        <div className="fixed top-20 right-4 w-full max-w-sm z-[100] animate-in slide-in-from-right-4 fade-in duration-300">
           <NotificationCenter notifications={notifications} setNotifications={setNotifications} currentUser={currentUser} onCloseOverlay={() => setShowNotifications(false)} />
        </div>
      )}
    </div>
  );
};

export default App;
