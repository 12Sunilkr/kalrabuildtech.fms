
import React, { useState, useEffect, useCallback, useLayoutEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { Auth } from './components/Auth';
import { Dashboard } from './components/Dashboard';
import { EmployeeDashboard } from './components/EmployeeDashboard';

// Lazy load heavy modules to improve initial load time and responsiveness
const AttendanceSheet = React.lazy(() => import('./components/AttendanceSheet').then(m => ({ default: m.AttendanceSheet })));
const EmployeeMaster = React.lazy(() => import('./components/EmployeeMaster').then(m => ({ default: m.EmployeeMaster })));
const LeaveManagement = React.lazy(() => import('./components/LeaveManagement').then(m => ({ default: m.LeaveManagement })));
const ReadMe = React.lazy(() => import('./components/ReadMe').then(m => ({ default: m.ReadMe })));
const HolidayManager = React.lazy(() => import('./components/HolidayManager').then(m => ({ default: m.HolidayManager })));
const TaskManager = React.lazy(() => import('./components/TaskManager').then(m => ({ default: m.TaskManager })));
const MaterialOrders = React.lazy(() => import('./components/MaterialOrders').then(m => ({ default: m.MaterialOrders })));
const ArchivedStaff = React.lazy(() => import('./components/ArchivedStaff').then(m => ({ default: m.ArchivedStaff })));
const PerformanceReport = React.lazy(() => import('./components/PerformanceReport').then(m => ({ default: m.PerformanceReport })));
const QuerySystem = React.lazy(() => import('./components/QuerySystem').then(m => ({ default: m.QuerySystem })));
const ChatSystem = React.lazy(() => import('./components/ChatSystem').then(m => ({ default: m.ChatSystem })));
const TimeLogViewer = React.lazy(() => import('./components/TimeLogViewer').then(m => ({ default: m.TimeLogViewer })));
const NotificationCenter = React.lazy(() => import('./components/NotificationCenter').then(m => ({ default: m.NotificationCenter })));
const OrganizationTree = React.lazy(() => import('./components/OrganizationTree').then(m => ({ default: m.OrganizationTree })));
const CalendarView = React.lazy(() => import('./components/CalendarView').then(m => ({ default: m.CalendarView })));
const FinanceDashboard = React.lazy(() => import('./components/FinanceDashboard').then(m => ({ default: m.FinanceDashboard })));
const Notepad = React.lazy(() => import('./components/Notepad').then(m => ({ default: m.Notepad })));
const ChecklistSystem = React.lazy(() => import('./components/ChecklistSystem').then(m => ({ default: m.ChecklistSystem })));
const DatabaseManager = React.lazy(() => import('./components/DatabaseManager').then(m => ({ default: m.DatabaseManager })));
const PMSDashboard = React.lazy(() => import('./components/PMSDashboard'));
const CRMModule = React.lazy(() => import('./components/CRMModule').then(m => ({ default: m.CRMModule })));
import { ViewMode, Employee, AttendanceRecord, User, TimeLog, AttendanceValue, Task, MaterialOrder, Query, ChatMessage, ChatGroup, Notification, SundayRequest, LeaveRequest, Holiday, Reminder, ClientFinancial, VendorFinancial, Note, ChecklistTemplate, ChecklistInstance, CRMLead } from './types';
import { INITIAL_EMPLOYEES, INITIAL_USERS, INITIAL_TASKS, INITIAL_ORDERS, INITIAL_ARCHIVED_EMPLOYEES, INITIAL_QUERIES, INITIAL_CHATS, COMPANY_LOGO, INITIAL_LEAVE_REQUESTS, INITIAL_CLIENT_FINANCIALS, INITIAL_VENDOR_FINANCIALS, INITIAL_NOTES, INITIAL_CHECKLIST_TEMPLATES, INITIAL_CHECKLIST_INSTANCES } from './constants';
import { formatDateKey, isDateSunday, formatDecimalHours } from './utils/dateUtils';
import { differenceInMinutes } from 'date-fns';
import { Menu, Bell, CheckCircle, AlertCircle, Info, X, AlertTriangle, MessageCircle } from 'lucide-react';
import api, { extractPayload as apiExtractPayload, ensureArray as apiEnsureArray, safeGet } from './src/utils/api';

const App: React.FC = () => {
  // 1. AUTH STATE (Primary Authority)
  // NOTE: Switch from localStorage-backed users/currentUser to server-backed SQLite (via /api/users).
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>(INITIAL_USERS);
  const [authError, setAuthError] = useState<string>('');

  // Use shared helpers from api module to normalize responses and ensure arrays
  const extractPayload = apiExtractPayload;
  const ensureArray = apiEnsureArray;

  // Install global fetch wrapper to attach Authorization header and keep requests relative to /api
  useEffect(() => {
    const orig = window.fetch.bind(window);

    const wrapper = async (input: RequestInfo, init?: RequestInit) => {
      let url: string;
      let body: any = undefined;
      let reqInit: RequestInit = init ? { ...init } : {};

      if (typeof input === 'string') {
        url = input;
      } else {
        url = input.url || '';
        try { body = (input as Request).body || undefined; } catch (e) { /* ignore */ }
      }

      // Keep requests as-provided. Frontend should use relative /api paths.
      reqInit.headers = new Headers(reqInit.headers || {} as HeadersInit);
      // Do not read from localStorage anymore. Authentication uses cookies or explicit Authorization headers.

      if (!reqInit.credentials) reqInit.credentials = 'include';
      try { if (url.startsWith('/api') || url.includes('/api')) reqInit.cache = 'no-store'; } catch (e) { /* ignore */ }

      if (typeof input !== 'string' && body && !reqInit.body) reqInit.body = body as any;

      return orig(url, reqInit);
    };

    // Replace global fetch
    // @ts-ignore
    window.fetch = wrapper;
    return () => {
      // Restore original
      // @ts-ignore
      window.fetch = orig;
    };
  }, []);

  // One-time migration: if client-side localStorage contains data, send it to backend then clear it.
  // Migration removed from app code to avoid further localStorage access.
  // Run the migration manually from browser Console using the script shown in README or via the DevTools snippet provided earlier.

  // Restore session and load users from the server on startup
  useEffect(() => {
    const init = async () => {
      // Helper: normalize server responses (handles both fetch-json and axios response shapes)
      const extractPayload = (resp: any) => {
        if (!resp) return null;
        // axios response: resp.data contains wrapper { success, data }
        const wrapper = resp.data !== undefined ? resp.data : resp;
        if (wrapper && typeof wrapper === 'object' && ('success' in wrapper) && ('data' in wrapper)) return wrapper.data;
        return wrapper;
      };

      const ensureArray = (v: any) => Array.isArray(v) ? v : [];
      try {
        // If the user logged out intentionally during this browser session, skip restoring the server session
        // (this avoids restoring sessions on refresh if logout didn't fully invalidate cookies).
        if (sessionStorage.getItem('kbt_session_logout')) {
          console.log('Skipping session restore due to recent logout');
          // DO NOT remove kbt_session_logout here. Keep it until explicit login,
          // to completely prevent auto-restore on subsequent refreshes.
          setCurrentUser(null);
        } else {
          // Try to restore session via shared axios client
          try {
            // Use safeGet with cache-bust fallback to avoid relying on cached 304 responses in production
            let meRes = await safeGet('/auth/me', { cacheBust: false });
            let mePayload = extractPayload(meRes);
            if ((!mePayload || Object.keys(mePayload).length === 0) && meRes && meRes.status === 304) {
              // Retry with cache busting to force fresh response from backend
              try {
                meRes = await safeGet('/auth/me', { cacheBust: true });
                mePayload = extractPayload(meRes);
              } catch (e) {
                console.warn('Retry /auth/me with cacheBust failed', e && (e.stack || e.message || e));
              }
            }
            const meUser = mePayload && (mePayload.user || mePayload) ? (mePayload.user || mePayload) : null;
            setCurrentUser(meUser || null);
            if (meUser) {
              try {
                const tRes = await safeGet('/tasks', { cacheBust: true });
                const tasksPayload = extractPayload(tRes);
                setTasks(ensureArray(tasksPayload));
              } catch (e) {
                console.warn('Failed to fetch tasks after restoring session', e && (e.stack || e.message || e));
              }
            }
          } catch (e) {
            console.warn('Auth/me unreachable (axios)', e && (e.stack || e.message || e));
          }
        }
      } catch (err) {
        console.warn('Auth/me unexpected error', err && (err.stack || err.message || err));
      }
      try {
        const uRes = await safeGet('/users');
        const uPayload = extractPayload(uRes);
        const uArr = ensureArray(uPayload);
        setUsers(uArr.length ? uArr : INITIAL_USERS);
      } catch (err) {
        console.error('User API unreachable, using local defaults', err && (err.stack || err.message || err));
        setUsers(INITIAL_USERS);
      }

      // Try to load employees from server
      try {
        const r = await safeGet('/employees');
        const empsPayload = extractPayload(r);
        const empsArr = ensureArray(empsPayload).map((e: any) => ({ ...e, hideAttendance: !!e.hideAttendance }));
        setEmployees(empsArr);
      } catch (err) {
        console.warn('Employees API unreachable', err && (err.stack || err.message || err));
      }

      // Also load archived employees separately (admin only)
      try {
        const ra = await safeGet('/employees?archived=1');
        const archivedArr = ensureArray(extractPayload(ra)).map((e: any) => ({ ...e, hideAttendance: !!e.hideAttendance }));
        setArchivedEmployees(archivedArr);
      } catch (err) {
        console.warn('Archived employees fetch failed', err && (err.stack || err.message || err));
      }

      // Load attendance records from server
      // NOTE: Removed massive pre-loading here!
      // This is now handled lazily by the currentView useEffect below
    };
    init();
  }, []);

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
        // Default to Dashboard for admins and profile for employees on session restore
        setCurrentView(currentUser.role === 'ADMIN' ? ViewMode.DASHBOARD : ViewMode.EMPLOYEE_HOME);
      }
      // Clear any deep-link hash on session restore so refreshing doesn't reopen demo/deep-linked pages
      if (window.location.hash) window.history.replaceState(null, '', window.location.pathname);
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

  // --- App Data State (server-backed; no localStorage for business data) ---
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [archivedEmployees, setArchivedEmployees] = useState<Employee[]>([]);
  const [attendanceData, setAttendanceData] = useState<Record<string, AttendanceRecord>>({});
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [timeLogs, setTimeLogs] = useState<Record<string, Record<string, TimeLog[]>>>({});
  const [tasks, setTasks] = React.useState<Task[]>(INITIAL_TASKS); // Tasks now fetched from backend, no longer persisted to localStorage
  const [orders, setOrders] = useState<MaterialOrder[]>([]);
  const [queries, setQueries] = useState<Query[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatGroups, setChatGroups] = useState<ChatGroup[]>([]);
  const [sundayRequests, setSundayRequests] = useState<SundayRequest[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>(INITIAL_LEAVE_REQUESTS);
  const [clientFinancials, setClientFinancials] = useState<ClientFinancial[]>([]);
  const [vendorFinancials, setVendorFinancials] = useState<VendorFinancial[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [checklistTemplates, setChecklistTemplates] = useState<ChecklistTemplate[]>(INITIAL_CHECKLIST_TEMPLATES);
  const [checklistInstances, setChecklistInstances] = useState<ChecklistInstance[]>(INITIAL_CHECKLIST_INSTANCES);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' | 'warning' } | null>(null);

  // Initialize the unread count check across the app
  const [globalUnreadChatCount, setGlobalUnreadChatCount] = useState(0);

  // Quick background unread messages check (for header badge)
  useEffect(() => {
    if (!currentUser) return;
    const fetchUnread = async () => {
      try {
        const res = await safeGet('/chat/unread_count_fast');
        const count = extractPayload(res) || 0;
        setGlobalUnreadChatCount(count);
      } catch (e) {
        // ignore fast polling failures silently
      }
    };
    fetchUnread();
    const iv = setInterval(fetchUnread, 15000);
    return () => clearInterval(iv);
  }, [currentUser]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Fetch data specific to the current view ON DEMAND (lazy loading)
  useEffect(() => {
    if (!currentUser) return;

    // Helper to run a specific fetch safely
    const fetchForView = async () => {
      try {
        switch (currentView) {
          case ViewMode.DASHBOARD:
          case ViewMode.EMPLOYEE_HOME:
          case ViewMode.ATTENDANCE:
          case ViewMode.TIME_LOGS:
          case ViewMode.PERFORMANCE: {
            // Fetch Attendance
            const sat = await safeGet('/attendance');
            const arr = ensureArray(extractPayload(sat));
            const ag: Record<string, AttendanceRecord> = {};
            arr.forEach((a: any) => {
              if (!a) return;
              if (!ag[a.userId]) ag[a.userId] = {};
              ag[a.userId][a.date] = a.value == null ? (a.clockIn ? 1 : 0) : a.value;
            });
            setAttendanceData(ag);

            // Fetch Timelogs
            const stl = await safeGet('/timelogs');
            const tlPayload = ensureArray(extractPayload(stl));
            const tlAg: Record<string, Record<string, TimeLog[]>> = {};
            tlPayload.forEach((t: any) => {
              if (!t) return;
              const dateKey = t.startTime ? t.startTime.split('T')[0] : (t.createdAt?.split('T')[0] || '');
              if (!tlAg[t.userId]) tlAg[t.userId] = {};
              if (!tlAg[t.userId][dateKey]) tlAg[t.userId][dateKey] = [];
              let duration = t.durationHours;
              if (!duration && t.startTime && t.endTime) duration = Math.max(0, (new Date(t.endTime).getTime() - new Date(t.startTime).getTime()) / 3600000);
              tlAg[t.userId][dateKey].push({ id: t.id, date: dateKey, clockIn: t.startTime, clockOut: t.endTime, durationHours: duration });
            });
            setTimeLogs(tlAg);

            // Also refresh tasks when hitting Performance/Dashboard
            const tRes = await safeGet('/tasks');
            setTasks(ensureArray(extractPayload(tRes)));

            // Fetch Checklists to display stats natively
            try {
              const ctRes = await safeGet('/checklist-templates');
              const mappedTpl = ensureArray(extractPayload(ctRes)).map((x: any) => ({
                id: x.id,
                taskName: x.data?.taskName || x.taskName,
                doerId: x.data?.doerId || x.doerId,
                buddyId: x.data?.buddyId || x.buddyId,
                department: x.data?.department || x.department,
                startDate: x.data?.startDate || x.startDate,
                config: x.data?.config ?? x.config ?? { frequency: 'DAILY' },
                active: x.data?.active ?? x.active ?? true
              }));
              setChecklistTemplates(mappedTpl);

              const insts: any[] = [];
              await Promise.all(mappedTpl.map(async (tpl) => {
                try {
                  const ir = await safeGet(`/checklists/${encodeURIComponent(tpl.id)}`);
                  const rows = ensureArray(extractPayload(ir));
                  rows.forEach((it: any) => {
                    try {
                      const p = JSON.parse(it.item);
                      insts.push({
                        ...p, dbId: it.id, doerId: p.doerId ?? tpl.doerId,
                        department: p.department ?? tpl.department,
                        taskName: p.taskName ?? tpl.taskName,
                        templateId: String(tpl.id),
                        status: it.done ? 'COMPLETED' : (p.status ?? 'PENDING'),
                        completedDate: p.completedDate
                      });
                    } catch {
                      insts.push({
                        id: it.id, templateId: String(tpl.id), date: it.item,
                        status: it.done ? 'COMPLETED' : 'PENDING',
                        dbId: it.id, doerId: tpl.doerId, department: tpl.department, taskName: tpl.taskName
                      });
                    }
                  });
                } catch { /* ignore */ }
              }));
              setChecklistInstances(insts);
            } catch (e) {
              console.warn('Failed to load checklists in dashboard', e);
            }
            break;
          }
          case ViewMode.FMS_TASKS:
          case ViewMode.EMPLOYEE_TASKS: {
            const tRes = await safeGet('/tasks');
            setTasks(ensureArray(extractPayload(tRes)));
            break;
          }

          case ViewMode.CALENDAR:
          case ViewMode.HOLIDAYS: {
            const h = await safeGet('/holidays');
            setHolidays(ensureArray(extractPayload(h)));
            const r = await safeGet('/reminders');
            setReminders(ensureArray(extractPayload(r)));
            break;
          }
          case ViewMode.MATERIAL_ORDERS:
          case ViewMode.EMPLOYEE_ORDERS: {
            const o2 = await safeGet('/o2d');
            const { normalizeO2dArray } = await import('./src/utils/o2d');
            setOrders(normalizeO2dArray(ensureArray(extractPayload(o2))));
            break;
          }
          case ViewMode.QUERIES:
          case ViewMode.EMPLOYEE_QUERIES: {
            const q = await safeGet('/queries');
            setQueries(ensureArray(extractPayload(q)));
            break;
          }
          case ViewMode.NOTEPAD: {
            const uid = currentUser.employeeId || currentUser.id;
            if (uid) {
              const np = await safeGet(`/notepad/${encodeURIComponent(uid)}`);
              setNotes(ensureArray(extractPayload(np)));
            }
            break;
          }
          case ViewMode.LEAVES: {
            const qUser = currentUser && (currentUser.employeeId || currentUser.id);
            const leavesUrl = currentUser.role === 'ADMIN' ? '/leave' : (qUser ? `/leave?userId=${encodeURIComponent(qUser)}` : '/leave');
            const lv = await safeGet(leavesUrl);
            setLeaveRequests(ensureArray(extractPayload(lv)));
            break;
          }
          case ViewMode.FINANCE: {
            const f = await safeGet('/finance');
            setClientFinancials(ensureArray(extractPayload(f)));
            break;
          }
        }

        // Fetch notifications regularly or on view change so they are updated
        if (currentUser && (currentUser.employeeId || currentUser.id)) {
          const uid = currentUser.employeeId || currentUser.id;
          const n = await safeGet(`/notifications/${encodeURIComponent(uid)}`);
          setNotifications(ensureArray(extractPayload(n)));
        }
      } catch (err) {
        console.warn('Lazy fetch for view failed', currentView, err);
      }
    };

    fetchForView();
  }, [currentView, currentUser]);

  const showToast = (message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info') => {
    setToast({ message, type });
  };

  // --- Handlers ---

  const handleLogin = async (email: string, pass: string) => {
    // Use shared axios client to perform login so cookies and credentials are handled consistently
    try {
      console.log('Performing login request for', email);
      const payload = { email: email.toLowerCase(), password: pass };
      console.log('Login payload summary:', { email: payload.email, hasPassword: !!payload.password });

      const res = await api.post('/auth/login', payload, { withCredentials: true });
      const payloadData = extractPayload(res) || {};
      // If backend didn't return user in login response (some production setups may rely on cookie-only sessions),
      // try to fetch /auth/me immediately with cacheBust to obtain user info.
      let user = (payloadData.user || (payloadData && payloadData.id) ? payloadData : null) as User | null;
      if (!user) {
        // Server sets httpOnly cookie on login; we rely on that cookie (axios has withCredentials:true)
        try {
          const meRes = await safeGet('/auth/me', { cacheBust: true });
          const mePayload = extractPayload(meRes);
          user = mePayload && (mePayload.user || mePayload) ? (mePayload.user || mePayload) : null;
        } catch (e) {
          console.warn('/auth/me after login failed', e && (e.stack || e.message || e));
        }
      } else {
        // Server sets httpOnly cookie on login; no localStorage token storage.
      }

      // If user still not resolved, treat as failure
      if (!user) {
        setAuthError((res && (res as any).data && (res as any).data.message) || 'Invalid credentials. Access Denied.');
        return;
      }

      // Proceed with resolved user
      if (user) {
        if (user.role === 'EMPLOYEE' && user.employeeId) {
          const isActive = employees.find(e => e.id === user.employeeId);
          // if (!isActive) {
          //   setAuthError('Account is inactive. Contact Administrator.');
          //   return;
          // }
        }
        setCurrentUser(user);
        // Do not persist full user object in localStorage; session is server-managed.
        setAuthError('');
        try { sessionStorage.removeItem('kbt_session_logout'); } catch (e) { /* ignore */ }
        // Clear any deep-link hash left from prior sessions to avoid unexpected demo page on login
        if (window.location.hash) window.history.replaceState(null, '', window.location.pathname);
        // Default to profile (EMPLOYEE_HOME) for employees, Dashboard for admins
        setCurrentView(user.role === 'ADMIN' ? ViewMode.DASHBOARD : ViewMode.EMPLOYEE_HOME);
        // Fetch tasks for this user after login (cache-bust to avoid stale 304)
        try {
          const tRes = await safeGet('/tasks', { cacheBust: true });
          setTasks(ensureArray(extractPayload(tRes)));
          // Also refresh reminders for the logged-in user
          try {
            const rRes = await safeGet('/reminders', { cacheBust: true });
            setReminders(ensureArray(extractPayload(rRes)));
          } catch (e) { console.warn('Failed to fetch reminders after login', e && (e.stack || e.message || e)); }
        } catch (e) {
          console.warn('Failed to fetch tasks on login', e && (e.stack || e.message || e));
        }
        return;
      }
      setAuthError('Invalid credentials. Access Denied.');
    } catch (err) {
      // If server unreachable, fall back to local in-browser users
      console.error('Auth server unreachable, falling back to local users', err && (err.stack || err.message || err));
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
        try { sessionStorage.removeItem('kbt_session_logout'); } catch (e) { /* ignore */ }
        // Clear any deep-link hash left from prior sessions to avoid unexpected demo page on login
        if (window.location.hash) window.history.replaceState(null, '', window.location.pathname);
        // Force initial view after login: profile for employees, dashboard for admins
        setCurrentView(user.role === 'ADMIN' ? ViewMode.DASHBOARD : ViewMode.EMPLOYEE_HOME);
      } else {
        setAuthError('Invalid credentials. Access Denied.');
      }
    }
  };

  const handleLogout = async () => {
    try {
      // Avoid sending the literal string "null" as JSON body which body-parser
      // rejects in strict mode. Passing undefined omits the request body.
      await api.post('/auth/logout', undefined, { withCredentials: true });
    } catch (err) {
      console.warn('Logout call failed', err);
    }
    // Remove persisted token
    // Remove client token storage (we do not persist token to localStorage)
    setCurrentUser(null);
    setAuthError('');
    setIsSidebarOpen(false);
    setTasks([]);
    // Mark session as intentionally logged out so a subsequent refresh will not restore it
    try { sessionStorage.setItem('kbt_session_logout', '1'); } catch (e) { /* ignore */ }
    window.location.hash = ''; // Clear hash from URL on logout
  };

  const addNotification = (title: string, message: string, type: Notification['type'], targetUser: string = 'ALL') => {
    const newNote: Notification = {
      id: `N-${Date.now()}`,
      title, message,
      time: new Date().toLocaleTimeString(),
      read: false, type, targetUser
    };

    // Show on-screen toast for immediate visibility
    const toastType = type === 'SYSTEM' || type === 'ORDER' ? 'info' : (type === 'TASK' ? 'success' : 'info');
    showToast(`${title}: ${message}`, toastType as any);

    // Optimistically update UI
    setNotifications(prev => [newNote, ...prev]);

    // Persist to server asynchronously. Server stores structured data in `meta`.
    (async () => {
      try {
        await api.post('/notifications', { userId: targetUser, message, meta: { title, type, targetUser, time: newNote.time } }, { withCredentials: true });
        // If the notification targets the current user or is global, refresh notifications for current user
        if (!currentUser) return;
        if (targetUser === 'ALL' || targetUser === currentUser.employeeId || targetUser === String(currentUser.id) || currentUser.role === 'ADMIN') {
          try {
            const res = await safeGet(`/notifications/${encodeURIComponent(currentUser.employeeId || currentUser.id)}`, { cacheBust: true });
            const payload = extractPayload(res);
            setNotifications(ensureArray(payload));
          } catch (e) { /* non-fatal: keep optimistic UI */ }
        }
      } catch (e) {
        console.error('Failed to persist notification to server', e && (e.stack || e.message || e));
      }
    })();
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

    const tId = `TL-${empId}-${Date.now()}`;
    const aId = `A-${empId}-${dateKey}`;

    try {
      // Create timelog
      await api.post('/timelogs', { id: tId, userId: empId, startTime: now.toISOString() }, { withCredentials: true });
      // Create attendance record (value may be null until clock out)
      // Note: Attendance usually tracks one record per day, but timelogs track sessions.
      await api.post('/attendance', { id: aId, userId: empId, date: dateKey, clockIn: now.toISOString(), value: null }, { withCredentials: true });

      const newLog: TimeLog = { id: tId, date: dateKey, clockIn: now.toISOString() };

      // Update local state to reflect server
      setTimeLogs(prev => {
        const userLogs = prev[empId] || {};
        const dayLogs = userLogs[dateKey] || [];
        return {
          ...prev,
          [empId]: {
            ...userLogs,
            [dateKey]: [...dayLogs, newLog]
          }
        };
      });
      setAttendanceData(prev => ({ ...prev, [empId]: { ...(prev[empId] || {}), [dateKey]: 1 } }));
      addNotification('Attendance', `Shift started at ${now.toLocaleTimeString()}`, 'SYSTEM', String(empId));
      addNotification('System Alert', `${currentUser.name} clocked in at ${now.toLocaleTimeString()}`, 'SYSTEM', 'ADMIN');
    } catch (err) {
      console.warn('Clock-in server call failed, falling back to local update', err);
      const newLog: TimeLog = { id: tId, date: dateKey, clockIn: now.toISOString() };
      setTimeLogs(prev => {
        const userLogs = prev[empId] || {};
        const dayLogs = userLogs[dateKey] || [];
        return {
          ...prev,
          [empId]: {
            ...userLogs,
            [dateKey]: [...dayLogs, newLog]
          }
        };
      });
      setAttendanceData(prev => ({ ...prev, [empId]: { ...(prev[empId] || {}), [dateKey]: 1 } }));
      addNotification('Attendance', `Shift started at ${now.toLocaleTimeString()}`, 'SYSTEM', String(empId));
      addNotification('System Alert', `${currentUser.name} clocked in at ${now.toLocaleTimeString()}`, 'SYSTEM', 'ADMIN');
    }
  };

  const handleClockOut = async () => {
    if (!currentUser?.employeeId) return;
    const empId = currentUser.employeeId;
    const now = new Date();
    const dateKey = formatDateKey(now);
    const dayLogs = timeLogs[empId]?.[dateKey] || [];
    const currentLog = dayLogs.find(l => !l.clockOut);

    if (!currentLog?.clockIn) return;
    const diffMinutes = differenceInMinutes(now, new Date(currentLog.clockIn));
    const hoursWorked = diffMinutes / 60;

    const tId = currentLog.id || `TL-${empId}-${dateKey}`;
    const aId = `A-${empId}-${dateKey}`;

    // Compute day total hours for attendance value
    const otherLogsHours = dayLogs.filter(l => l.id !== currentLog.id).reduce((sum, l) => sum + (l.durationHours || 0), 0);
    const totalDayHours = otherLogsHours + hoursWorked;

    const computedVal: AttendanceValue = totalDayHours >= 7.5 ? 1 : (totalDayHours >= 6 ? 0.75 : (totalDayHours >= 4 ? 0.5 : (totalDayHours >= 2 ? 0.25 : 0)));

    try {
      // Update timelog endTime
      await api.put(`/timelogs/${encodeURIComponent(tId)}`, { endTime: now.toISOString() }, { withCredentials: true });

      // Update attendance with clockOut and computed value
      await api.put(`/attendance/${encodeURIComponent(aId)}`, { clockOut: now.toISOString(), value: computedVal }, { withCredentials: true });

      // Update local state
      setTimeLogs(prev => {
        const userLogs = prev[empId] || {};
        const dLogs = userLogs[dateKey] || [];
        const updatedLogs = dLogs.map(l => l.id === currentLog.id ? { ...l, clockOut: now.toISOString(), durationHours: hoursWorked } : l);
        return {
          ...prev,
          [empId]: {
            ...userLogs,
            [dateKey]: updatedLogs
          }
        };
      });
      setAttendanceData(prev => ({ ...prev, [empId]: { ...(prev[empId] || {}), [dateKey]: computedVal } }));
      addNotification('Attendance', `Shift ended. Total: ${formatDecimalHours(totalDayHours)}`, 'SYSTEM', String(empId));
      addNotification('System Alert', `${currentUser.name} clocked out out. Shift total: ${formatDecimalHours(totalDayHours)}`, 'SYSTEM', 'ADMIN');
    } catch (err) {
      console.warn('Clock-out server call failed, falling back to local update', err);
      setTimeLogs(prev => {
        const userLogs = prev[empId] || {};
        const dLogs = userLogs[dateKey] || [];
        const updatedLogs = dLogs.map(l => l.id === currentLog.id ? { ...l, clockOut: now.toISOString(), durationHours: hoursWorked } : l);
        return {
          ...prev,
          [empId]: {
            ...userLogs,
            [dateKey]: updatedLogs
          }
        };
      });
      setAttendanceData(prev => ({ ...prev, [empId]: { ...(prev[empId] || {}), [dateKey]: computedVal } }));
      addNotification('Attendance', `Shift ended. Total: ${formatDecimalHours(totalDayHours)}`, 'SYSTEM', String(empId));
      addNotification('System Alert', `${currentUser.name} clocked out. Shift total: ${formatDecimalHours(totalDayHours)}`, 'SYSTEM', 'ADMIN');
    }
  };

  const handleUpdateProfile = async (empId: string, data: Partial<Employee>) => {
    try {
      await api.put(`/employees/${encodeURIComponent(empId)}`, data, { withCredentials: true });
      const res = await safeGet('/employees');
      setEmployees(ensureArray(extractPayload(res)));
      showToast('Profile Updated Successfully', 'success');
      addNotification('Security Hub', 'Compliance documentation or profile details have been updated.', 'SYSTEM', empId);
    } catch (err) {
      console.error('Failed to update profile', err);
      showToast('Profile update failed', 'error');
    }
  };

  // MASTER SECURITY GUARD: If not logged in, return Auth component IMMEDIATELY
  if (!currentUser) {
    return (
      <Auth
        onLogin={handleLogin}
        onResetPassword={async (email) => {
          try {
            const res = await api.get('/users');
            const list = ensureArray(extractPayload(res));
            const user = list.find((u: any) => u.email.toLowerCase() === email.toLowerCase());
            if (!user) return false;
            const newPass = 'KBT' + Math.floor(Math.random() * 9000);
            const upd = await api.put(`/users/${user.id}`, { password: newPass }, { withCredentials: true });
            if (!upd) return false;
            const refreshed = await api.get('/users');
            setUsers(ensureArray(extractPayload(refreshed)));
            return true;
          } catch (err) {
            console.error('Reset password failed', err);
            return false;
          }
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
        case ViewMode.PMS_ADMIN: return <PMSDashboard />;
        case ViewMode.FINANCE: return <FinanceDashboard {...commonProps} clientFinancials={clientFinancials} setClientFinancials={setClientFinancials} vendorFinancials={vendorFinancials} setVendorFinancials={setVendorFinancials} />;
        case ViewMode.TIME_LOGS: return <TimeLogViewer {...commonProps} />;
        case ViewMode.PERFORMANCE: return <PerformanceReport {...commonProps} checklistInstances={checklistInstances} checklistTemplates={checklistTemplates} />;
        case ViewMode.QUERIES: return <QuerySystem queries={queries} setQueries={setQueries} {...commonProps} />;
        case ViewMode.CHAT: return <ChatSystem messages={chatMessages} setMessages={setChatMessages} groups={chatGroups} setGroups={setChatGroups} {...commonProps} />;
        case ViewMode.NOTEPAD: return <Notepad {...commonProps} />;
        case ViewMode.CRM: return <CRMModule currentUser={currentUser} employees={employees} />;
        case ViewMode.ARCHIVED_STAFF: return <ArchivedStaff {...commonProps} />;
        case ViewMode.ORGANIZATION_TREE: return <OrganizationTree employees={employees} />;
        case ViewMode.HOLIDAYS: return <HolidayManager holidays={holidays} setHolidays={setHolidays} />;
        case ViewMode.LEAVES: return <LeaveManagement {...commonProps} />;
        case ViewMode.DATABASE: return <DatabaseManager allData={{ ...commonProps, users }} onRestore={(d) => { }} onReset={() => { }} />;
        case ViewMode.NOTIFICATIONS: return <NotificationCenter notifications={notifications} setNotifications={setNotifications} currentUser={currentUser} onNavigate={setCurrentView} />;
        case ViewMode.README: return <ReadMe role="ADMIN" />;
        default: return <Dashboard employees={employees} attendanceData={attendanceData} onNavigate={setCurrentView} />;
      }
    } else {
      switch (currentView) {
        case ViewMode.EMPLOYEE_TASKS: return <TaskManager {...commonProps} />;
        case ViewMode.EMPLOYEE_ORDERS: return <MaterialOrders {...commonProps} />;
        case ViewMode.PMS_EMPLOYEE: return <PMSDashboard />;
        case ViewMode.FINANCE: return <FinanceDashboard {...commonProps} clientFinancials={clientFinancials} setClientFinancials={setClientFinancials} vendorFinancials={vendorFinancials} setVendorFinancials={setVendorFinancials} />;
        case ViewMode.CHECKLIST: return <ChecklistSystem {...commonProps} templates={checklistTemplates} setTemplates={setChecklistTemplates} instances={checklistInstances} setInstances={setChecklistInstances} />;
        case ViewMode.CALENDAR: return <CalendarView {...commonProps} leaves={leaveRequests} reminders={reminders} setReminders={setReminders} />;
        case ViewMode.LEAVES: return <LeaveManagement {...commonProps} />;
        case ViewMode.NOTEPAD: return <Notepad {...commonProps} />;
        case ViewMode.EMPLOYEE_CHAT: return <ChatSystem messages={chatMessages} setMessages={setChatMessages} groups={chatGroups} setGroups={setChatGroups} {...commonProps} />;
        case ViewMode.EMPLOYEE_QUERIES: return <QuerySystem queries={queries} setQueries={setQueries} {...commonProps} />;
        case ViewMode.NOTIFICATIONS: return <NotificationCenter notifications={notifications} setNotifications={setNotifications} currentUser={currentUser} onNavigate={setCurrentView} />;
        case ViewMode.EMPLOYEE_CRM: return <CRMModule currentUser={currentUser} employees={employees} />;
        case ViewMode.README: return <ReadMe role="EMPLOYEE" />;
        default: return <EmployeeDashboard user={currentUser} onClockIn={handleClockIn} onClockOut={handleClockOut} onUpdateProfile={handleUpdateProfile} {...commonProps} />;
      }
    }
  };

  return (
    <div className="flex bg-slate-50 min-h-screen h-[100dvh] w-full font-sans text-slate-900 overflow-hidden relative print:h-auto print:overflow-visible">
      <div className="fixed inset-0 z-0 bg-slate-50 pointer-events-none print:hidden">
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

      <main className="flex-1 flex flex-col h-full overflow-hidden relative z-10 glass-panel md:my-4 md:mr-4 md:rounded-r-3xl border-slate-200 shadow-2xl print:m-0 print:rounded-none print:shadow-none print:border-none">
        <header className="bg-white/80 backdrop-blur-md px-3 py-2 md:px-4 md:py-4 flex justify-between items-center shadow-sm z-30 border-b border-white/20 print:hidden">
          <button
            className="flex items-center gap-2 md:hidden hover:opacity-80 transition-opacity focus:outline-none text-left"
            onClick={() => setCurrentView(currentUser.role === 'ADMIN' ? ViewMode.DASHBOARD : ViewMode.EMPLOYEE_HOME)}
          >
            <img src={COMPANY_LOGO} alt="Logo" className="w-7 h-7 bg-white rounded-lg shadow-sm" />
            <span className="font-extrabold text-xs uppercase tracking-tight">Kalra FMS</span>
          </button>
          <div className="flex-1"></div>
          <div className="flex items-center gap-2 md:gap-4">
            <button className="relative p-2 text-slate-500 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition-colors" onClick={() => setShowNotifications(!showNotifications)}>
              <Bell size={22} />
              {unreadCount > 0 && <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 rounded-full text-[10px] flex items-center justify-center font-bold text-white border border-white animate-pulse">{unreadCount}</span>}
            </button>
            <button onClick={() => setIsSidebarOpen(true)} className="p-2 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100 md:hidden"><Menu size={22} /></button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar relative print:overflow-visible print:h-auto">
          <div key={currentView} className="min-h-full h-full animate-fade-in-up">
            <React.Suspense fallback={
              <div className="flex items-center justify-center h-full w-full bg-slate-50/50">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                  <span className="text-xs font-bold text-slate-500 animate-pulse">Loading module...</span>
                </div>
              </div>
            }>
              {renderView()}
            </React.Suspense>
          </div>
        </div>
      </main>

      {showNotifications && (
        <div className="fixed top-20 right-4 w-full max-w-sm z-[100] animate-in slide-in-from-right-4 fade-in duration-300">
          <NotificationCenter notifications={notifications} setNotifications={setNotifications} currentUser={currentUser} onCloseOverlay={() => setShowNotifications(false)} />
        </div>
      )}

      {/* Global Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 left-6 md:left-auto md:w-96 z-[200] animate-fade-in-up">
          <div className={`p-4 rounded-2xl shadow-2xl border backdrop-blur-md flex items-start gap-3 ${toast.type === 'success' ? 'bg-emerald-50/90 border-emerald-100 text-emerald-900' :
              toast.type === 'error' ? 'bg-rose-50/90 border-rose-100 text-rose-900' :
                toast.type === 'warning' ? 'bg-amber-50/90 border-amber-100 text-amber-900' :
                  'bg-indigo-50/90 border-indigo-100 text-indigo-900'
            }`}>
            <div className={`p-2 rounded-xl shrink-0 ${toast.type === 'success' ? 'bg-emerald-100 text-emerald-600' :
                toast.type === 'error' ? 'bg-rose-100 text-rose-600' :
                  toast.type === 'warning' ? 'bg-amber-100 text-amber-600' :
                    'bg-indigo-100 text-indigo-600'
              }`}>
              {toast.type === 'success' && <CheckCircle size={18} />}
              {toast.type === 'error' && <AlertCircle size={18} />}
              {toast.type === 'warning' && <AlertTriangle size={18} />}
              {toast.type === 'info' && <Info size={18} />}
            </div>
            <div className="flex-1 pt-1">
              <p className="text-sm font-bold leading-tight">{toast.message}</p>
            </div>
            <button
              onClick={() => setToast(null)}
              className="p-1 hover:bg-black/5 rounded-lg transition-colors shrink-0"
            >
              <X size={16} className="opacity-40" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
