
import React, { useState, useEffect, useCallback, useMemo, useLayoutEffect } from 'react';
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
const SystemMaster = React.lazy(() => import('./components/SystemMaster'));
const Playbook = React.lazy(() => import('./components/Playbook').then(m => ({ default: m.Playbook })));
import { ViewMode, Employee, AttendanceRecord, User, TimeLog, AttendanceValue, Task, MaterialOrder, Query, ChatMessage, ChatGroup, Notification, SundayRequest, LeaveRequest, Holiday, Reminder, ClientFinancial, VendorFinancial, Note, ChecklistTemplate, ChecklistInstance, CRMLead } from './types';
import { INITIAL_EMPLOYEES, INITIAL_USERS, INITIAL_TASKS, INITIAL_ORDERS, INITIAL_ARCHIVED_EMPLOYEES, INITIAL_QUERIES, INITIAL_CHATS, COMPANY_LOGO, INITIAL_LEAVE_REQUESTS, INITIAL_CLIENT_FINANCIALS, INITIAL_VENDOR_FINANCIALS, INITIAL_NOTES, INITIAL_CHECKLIST_TEMPLATES, INITIAL_CHECKLIST_INSTANCES } from './constants';
import { formatDateKey, isDateSunday, formatDecimalHours } from './utils/dateUtils';
import { differenceInMinutes } from 'date-fns';
import { Menu, Bell, CheckCircle, AlertCircle, Info, X, AlertTriangle, MessageCircle } from 'lucide-react';
import api, { extractPayload as apiExtractPayload, ensureArray as apiEnsureArray, safeGet, safeGetSwr } from './src/utils/api';

const App: React.FC = () => {
  // 1. AUTH STATE (Primary Authority)
  // NOTE: Switch from localStorage-backed users/currentUser to server-backed SQLite (via /api/users).
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>(INITIAL_USERS);
  const [authError, setAuthError] = useState<string>('');
  const [isAuthChecking, setIsAuthChecking] = useState(true);

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
      const token = localStorage.getItem('kbt_token');
      if (token) {
        reqInit.headers.set('Authorization', `Bearer ${token}`);
      }
      // Do not read from localStorage anymore. Authentication uses cookies or explicit Authorization headers.

      if (!reqInit.credentials) reqInit.credentials = 'include';
      // NOTE: Do NOT force cache:'no-store' here — caching is managed by the
      // application-level SWR cache in requestCache.ts. Forcing no-store globally
      // was the primary cause of full network round-trips on every tab switch.

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
      let meUser: User | null = null;
      try {
        // If the user logged out intentionally during this browser session, skip restoring the server session
        // (this avoids restoring sessions on refresh if logout didn't fully invalidate cookies).
        if (sessionStorage.getItem('kbt_session_logout')) {
          console.log('Skipping session restore due to recent logout');
          // DO NOT remove kbt_session_logout here. Keep it until explicit login,
          // to completely prevent auto-restore on subsequent refreshes.
          setCurrentUser(null);
          setUsers(INITIAL_USERS);
        } else {
          // Fetch /auth/me with cache busting to resolve current session status immediately
          const meRes = await safeGet('/auth/me', { cacheBust: true });
          const mePayload = extractPayload(meRes);
          meUser = mePayload && (mePayload.user || mePayload) ? (mePayload.user || mePayload) : null;
          setCurrentUser(meUser || null);

          if (meUser) {
            // Preload core master data (users and employees) in background without blocking initial rendering
            Promise.all([
              safeGet('/users')
                .then(res => {
                  const uArr = ensureArray(extractPayload(res));
                  setUsers(uArr.length ? uArr : INITIAL_USERS);
                })
                .catch(err => {
                  console.error('Background users fetch failed', err);
                  setUsers(INITIAL_USERS);
                }),

              safeGet('/employees')
                .then(res => {
                  const empsArr = ensureArray(extractPayload(res)).map((e: any) => ({ ...e, hideAttendance: !!e.hideAttendance }));
                  setEmployees(empsArr);
                })
                .catch(err => console.warn('Background employees fetch failed', err)),

              safeGet(`/attendance?userId=${encodeURIComponent(meUser.employeeId || meUser.id)}`, { cacheBust: true })
                .then(res => applyAttendance(ensureArray(extractPayload(res))))
                .catch(err => console.warn('Background attendance fetch failed', err)),

              safeGet(`/timelogs?userId=${encodeURIComponent(meUser.employeeId || meUser.id)}`, { cacheBust: true })
                .then(res => applyTimelogs(ensureArray(extractPayload(res))))
                .catch(err => console.warn('Background timelogs fetch failed', err)),

              meUser.role === 'ADMIN'
                ? safeGet('/employees?archived=1')
                    .then(res => {
                      const archivedArr = ensureArray(extractPayload(res)).map((e: any) => ({ ...e, hideAttendance: !!e.hideAttendance }));
                      setArchivedEmployees(archivedArr);
                    })
                    .catch(err => console.warn('Background archived employees fetch failed', err))
                : Promise.resolve()
            ]).catch(err => {
              console.warn('Master data preloading encountered errors', err);
            });

            // Instant active log restoration from localStorage cache on session restore
            try {
              const uKey = meUser.employeeId || String(meUser.id);
              const todayKey = new Date().toISOString().split('T')[0]; // YYYY-MM-DD in UTC
              // Also try local date key in IST/local timezone
              const localToday = formatDateKey(new Date());
              const localLogRaw = localStorage.getItem(`kbt_active_log_${uKey}`) || (meUser.id ? localStorage.getItem(`kbt_active_log_${String(meUser.id)}`) : null);
              if (localLogRaw) {
                const localLog = JSON.parse(localLogRaw);
                if (localLog && localLog.clockIn && !localLog.clockOut) {
                  const logDate = localLog.clockIn.split('T')[0]; // UTC date
                  const logLocalDate = localLog.date || logDate;
                  // Only restore active logs from TODAY — discard stale logs from previous days
                  const isToday = logDate === todayKey || logLocalDate === localToday;
                  if (isToday) {
                    const logWithUser = { ...localLog, userId: localLog.userId || uKey };
                    applyTimelogs([logWithUser]);
                  } else {
                    // Stale log from a previous day — clear it
                    console.log('[Init] Clearing stale localStorage active log from', logDate);
                    try {
                      localStorage.removeItem(`kbt_active_log_${uKey}`);
                      if (meUser.id) localStorage.removeItem(`kbt_active_log_${String(meUser.id)}`);
                    } catch (e2) { /* ignore */ }
                  }
                }
              }
            } catch (e) { /* ignore */ }
          } else {
            setUsers(INITIAL_USERS);
          }
        }
      } catch (err) {
        console.warn('Auth/me session restoration failed', err);
        setUsers(INITIAL_USERS);
      } finally {
        setIsAuthChecking(false);
      }
    };
    init();
  }, []);

  // 2. VIEW STATE (Decoupled from hash if not logged in)
  const [currentView, setCurrentView] = useState<ViewMode>(ViewMode.DASHBOARD);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [, startTransition] = React.useTransition();

  const onNavigate = useCallback((view: ViewMode) => {
    startTransition(() => {
      setCurrentView(view);
    });
  }, []);

  const closeSidebar = useCallback(() => {
    setIsSidebarOpen(false);
  }, []);

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

  const [showPolicyPopup, setShowPolicyPopup] = useState(false);

  useEffect(() => {
    if (currentUser && currentUser.role !== 'ADMIN') {
      // Show only once per calendar day per user
      const uid = currentUser.employeeId || currentUser.id;
      const storageKey = `kbt_policy_seen_${uid}`;
      const today = new Date().toISOString().split('T')[0]; // e.g. "2026-05-28"
      const lastSeen = localStorage.getItem(storageKey);
      if (lastSeen !== today) {
        setShowPolicyPopup(true);
      }
    }
  }, [currentUser]);

  const handleClosePolicyPopup = useCallback(() => {
    setShowPolicyPopup(false);
    // Record today's date so the popup doesn't show again today
    if (currentUser) {
      const uid = currentUser.employeeId || currentUser.id;
      const today = new Date().toISOString().split('T')[0];
      try { localStorage.setItem(`kbt_policy_seen_${uid}`, today); } catch { /* ignore */ }
    }
  }, [currentUser]);

  const currentUserDepartment = useMemo(() => {
    if (!currentUser) return undefined;
    return employees.find(e => e.id === currentUser.employeeId)?.department;
  }, [currentUser, employees]);

  const myNotifications = useMemo(() => {
    if (!currentUser) return [];
    return notifications.filter(n => currentUser.role === 'ADMIN' || n.targetUser === currentUser.employeeId || n.targetUser === 'ALL');
  }, [notifications, currentUser]);

  const unreadCount = useMemo(() => myNotifications.filter(n => !n.read).length, [myNotifications]);

  // Initialize the unread count check across the app
  const [globalUnreadChatCount, setGlobalUnreadChatCount] = useState(0);

  // Background unread chat badge (pauses when tab hidden, slower interval)
  useEffect(() => {
    if (!currentUser) return;
    const fetchUnread = async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      try {
        const res = await safeGet('/chat/unread_count_fast', { cacheTtlMs: 12000 });
        const count = extractPayload(res) || 0;
        setGlobalUnreadChatCount(count);
      } catch {
        /* ignore polling failures */
      }
    };
    fetchUnread();
    const iv = setInterval(fetchUnread, 45000);
    const onVisible = () => { if (document.visibilityState === 'visible') fetchUnread(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(iv);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [currentUser]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // --- SWR helpers ---
  // applyAttendance / applyTimelogs / loadChecklistsBatch are defined once outside useEffect
  // so we can call them from both the main useEffect and SWR callbacks.

  const applyAttendance = useCallback((arr: any[]) => {
    const incoming = ensureArray(arr);
    setAttendanceData(prev => {
      const next = { ...prev };
      incoming.forEach((a: any) => {
        if (!a || !a.userId || !a.date) return;
        if (!next[a.userId]) next[a.userId] = {};
        next[a.userId] = {
          ...next[a.userId],
          [a.date]: a.value == null ? (a.clockIn ? 1 : 0) : a.value
        };
      });
      return next;
    });
  }, []);

  const applyTimelogs = useCallback((tlPayload: any[]) => {
    const incoming = ensureArray(tlPayload);
    setTimeLogs(prev => {
      const next = { ...prev };
      incoming.forEach((t: any) => {
        // Allow logs with a clockIn but missing userId (from localStorage cache)
        if (!t || (!t.userId && !t.clockIn)) return;

        let dateKey = t.date;
        if (!dateKey) {
          const dt = t.startTime ? new Date(t.startTime) : (t.clockIn ? new Date(t.clockIn) : (t.createdAt ? new Date(t.createdAt) : null));
          if (dt && !isNaN(dt.getTime())) {
            dateKey = formatDateKey(dt);
          } else {
            dateKey = t.startTime ? t.startTime.split('T')[0] : (t.clockIn?.split('T')[0] || t.createdAt?.split('T')[0] || '');
          }
        }
        if (!dateKey) return;

        const targetUserIds = new Set<string>();
        if (t.userId) targetUserIds.add(String(t.userId));
        // ALWAYS add both ID forms for the current user if this log belongs to them
        if (currentUser) {
          const empId = currentUser.employeeId;
          const numId = String(currentUser.id);
          const tUid = String(t.userId || '');
          if (!t.userId || tUid === empId || tUid === numId) {
            // This log belongs to current user — register under both ID forms
            if (empId) targetUserIds.add(empId);
            if (numId) targetUserIds.add(numId);
          }
        }

        let duration = t.durationHours;
        if (!duration && t.startTime && t.endTime) {
          duration = Math.max(0, (new Date(t.endTime).getTime() - new Date(t.startTime).getTime()) / 3600000);
        }

        const tStartMs = t.startTime ? new Date(t.startTime).getTime() : (t.clockIn ? new Date(t.clockIn).getTime() : 0);

        targetUserIds.forEach(uId => {
          if (!next[uId]) next[uId] = {};
          const userLogs = { ...next[uId] };
          const dayLogs = [...(userLogs[dateKey] || [])];

          const existingIndex = dayLogs.findIndex(item => {
            if (t.id && item.id === t.id) return true;
            const itemStartMs = item.clockIn ? new Date(item.clockIn).getTime() : 0;
            if (tStartMs && itemStartMs && Math.abs(tStartMs - itemStartMs) < 120000) return true;
            if (item.clockIn === t.startTime) return true;
            return false;
          });

          const newLogEntry: TimeLog = {
            id: t.id,
            date: dateKey,
            // Support both server format (startTime) and localStorage format (clockIn)
            clockIn: t.startTime || t.clockIn || t.createdAt,
            clockOut: t.endTime ? t.endTime : undefined,
            durationHours: duration
          };

          if (existingIndex >= 0) {
            const oldLog = dayLogs[existingIndex];
            dayLogs[existingIndex] = {
              ...oldLog,
              ...newLogEntry,
              id: t.id || oldLog.id,
              clockOut: t.endTime ? t.endTime : undefined,
              durationHours: newLogEntry.durationHours ?? oldLog.durationHours
            };
          } else {
            dayLogs.push(newLogEntry);
          }

          userLogs[dateKey] = dayLogs;
          next[uId] = userLogs;
        });
      });
      return next;
    });
  }, [currentUser]);

  // Fetch data specific to the current view ON DEMAND (lazy loading, stale-while-revalidate)
  useEffect(() => {
    if (!currentUser) return;

    const loadChecklistsBatch = async () => {
      try {
        // Checklist templates (SWR: instant from cache, refresh in bg)
        const ctRes = await safeGetSwr(
          '/checklist-templates',
          (fresh) => {
            const mappedTpl = ensureArray(extractPayload(fresh)).map((x: any) => ({
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
          }
        );
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

        const batchRes = await safeGetSwr(
          '/checklists-instances/all',
          (fresh) => {
            const grouped = extractPayload(fresh) as Record<string, any[]> || {};
            const insts: any[] = [];
            mappedTpl.forEach((tpl) => {
              const rows = ensureArray(grouped[String(tpl.id)]);
              rows.forEach((it: any) => {
                try {
                  const p = JSON.parse(it.item);
                  insts.push({ ...p, dbId: it.id, doerId: p.doerId ?? tpl.doerId, department: p.department ?? tpl.department, taskName: p.taskName ?? tpl.taskName, templateId: String(tpl.id), status: it.done ? 'COMPLETED' : (p.status ?? 'PENDING'), completedDate: p.completedDate });
                } catch {
                  insts.push({ id: it.id, templateId: String(tpl.id), date: it.item, status: it.done ? 'COMPLETED' : 'PENDING', dbId: it.id, doerId: tpl.doerId, department: tpl.department, taskName: tpl.taskName });
                }
              });
            });
            setChecklistInstances(insts);
          }
        );
        const grouped = extractPayload(batchRes) as Record<string, any[]> || {};
        const insts: any[] = [];
        mappedTpl.forEach((tpl) => {
          const rows = ensureArray(grouped[String(tpl.id)]);
          rows.forEach((it: any) => {
            try {
              const p = JSON.parse(it.item);
              insts.push({ ...p, dbId: it.id, doerId: p.doerId ?? tpl.doerId, department: p.department ?? tpl.department, taskName: p.taskName ?? tpl.taskName, templateId: String(tpl.id), status: it.done ? 'COMPLETED' : (p.status ?? 'PENDING'), completedDate: p.completedDate });
            } catch {
              insts.push({ id: it.id, templateId: String(tpl.id), date: it.item, status: it.done ? 'COMPLETED' : 'PENDING', dbId: it.id, doerId: tpl.doerId, department: tpl.department, taskName: tpl.taskName });
            }
          });
        });
        setChecklistInstances(insts);
      } catch (e) {
        console.warn('Failed to load checklists', e);
      }
    };

    // SWR-based fetchers: serve cached data instantly, revalidate in background
    const fetchForView = async () => {
      try {
        switch (currentView) {
          case ViewMode.DASHBOARD: {
            if (currentUser.role === 'ADMIN') {
              await Promise.all([
                safeGetSwr('/tasks', (fresh) => setTasks(ensureArray(extractPayload(fresh)))),
                safeGetSwr('/attendance', (fresh) => applyAttendance(ensureArray(extractPayload(fresh)))),
                safeGetSwr('/employees', (fresh) => setEmployees(ensureArray(extractPayload(fresh)))),
              ]).then(([tRes, sat, eRes]) => {
                // Apply data from cache immediately (may be stale, bg refresh handles update)
                setTasks(ensureArray(extractPayload(tRes)));
                applyAttendance(ensureArray(extractPayload(sat)));
                setEmployees(ensureArray(extractPayload(eRes)));
              });
            }
            break;
          }
          case ViewMode.EMPLOYEE_HOME: {
            const uid = currentUser.employeeId || String(currentUser.id);
            await Promise.all([
              safeGetSwr(`/attendance?userId=${encodeURIComponent(uid)}`, (fresh) => applyAttendance(ensureArray(extractPayload(fresh)))),
              safeGetSwr(`/timelogs?userId=${encodeURIComponent(uid)}`, (fresh) => applyTimelogs(ensureArray(extractPayload(fresh)))),
              safeGetSwr('/tasks', (fresh) => setTasks(ensureArray(extractPayload(fresh)))),
              safeGetSwr('/employees', (fresh) => setEmployees(ensureArray(extractPayload(fresh)))),
            ]).then(([sat, stl, tRes, eRes]) => {
              applyAttendance(ensureArray(extractPayload(sat)));
              applyTimelogs(ensureArray(extractPayload(stl)));
              setTasks(ensureArray(extractPayload(tRes)));
              setEmployees(ensureArray(extractPayload(eRes)));
            });
            break;
          }
          case ViewMode.ATTENDANCE: {
            await Promise.all([
              safeGetSwr('/attendance', (fresh) => applyAttendance(ensureArray(extractPayload(fresh)))),
              safeGetSwr('/employees', (fresh) => setEmployees(ensureArray(extractPayload(fresh)))),
            ]).then(([sat, eRes]) => {
              applyAttendance(ensureArray(extractPayload(sat)));
              setEmployees(ensureArray(extractPayload(eRes)));
            });
            break;
          }
          case ViewMode.TIME_LOGS: {
            await Promise.all([
              safeGetSwr('/attendance', (fresh) => applyAttendance(ensureArray(extractPayload(fresh)))),
              safeGetSwr('/timelogs', (fresh) => applyTimelogs(ensureArray(extractPayload(fresh)))),
            ]).then(([sat, stl]) => {
              applyAttendance(ensureArray(extractPayload(sat)));
              applyTimelogs(ensureArray(extractPayload(stl)));
            });
            break;
          }
          case ViewMode.PERFORMANCE: {
            await Promise.all([
              safeGetSwr('/attendance', (fresh) => applyAttendance(ensureArray(extractPayload(fresh)))),
              safeGetSwr('/timelogs', (fresh) => applyTimelogs(ensureArray(extractPayload(fresh)))),
              safeGetSwr('/employees', (fresh) => setEmployees(ensureArray(extractPayload(fresh)))),
              safeGetSwr('/tasks', (fresh) => setTasks(ensureArray(extractPayload(fresh)))),
            ]).then(([sat, stl, eRes, tRes]) => {
              applyAttendance(ensureArray(extractPayload(sat)));
              applyTimelogs(ensureArray(extractPayload(stl)));
              setEmployees(ensureArray(extractPayload(eRes)));
              setTasks(ensureArray(extractPayload(tRes)));
            });
            await loadChecklistsBatch();
            break;
          }
          case ViewMode.CHECKLIST: {
            await loadChecklistsBatch();
            break;
          }
          case ViewMode.FMS_TASKS:
          case ViewMode.EMPLOYEE_TASKS: {
            const tRes = await safeGetSwr('/tasks', (fresh) => setTasks(ensureArray(extractPayload(fresh))));
            setTasks(ensureArray(extractPayload(tRes)));
            break;
          }
          case ViewMode.CALENDAR:
          case ViewMode.HOLIDAYS: {
            await Promise.all([
              safeGetSwr('/holidays', (fresh) => setHolidays(ensureArray(extractPayload(fresh)))),
              safeGetSwr('/reminders', (fresh) => setReminders(ensureArray(extractPayload(fresh)))),
            ]).then(([h, r]) => {
              setHolidays(ensureArray(extractPayload(h)));
              setReminders(ensureArray(extractPayload(r)));
            });
            break;
          }
          case ViewMode.MATERIAL_ORDERS:
          case ViewMode.EMPLOYEE_ORDERS: {
            const o2 = await safeGetSwr('/o2d', async (fresh) => {
              const { normalizeO2dArray } = await import('./src/utils/o2d');
              setOrders(normalizeO2dArray(ensureArray(extractPayload(fresh))));
            });
            const { normalizeO2dArray } = await import('./src/utils/o2d');
            setOrders(normalizeO2dArray(ensureArray(extractPayload(o2))));
            break;
          }
          case ViewMode.QUERIES:
          case ViewMode.EMPLOYEE_QUERIES: {
            const q = await safeGetSwr('/queries', (fresh) => setQueries(ensureArray(extractPayload(fresh))));
            setQueries(ensureArray(extractPayload(q)));
            break;
          }
          case ViewMode.NOTEPAD: {
            const uid = currentUser.employeeId || currentUser.id;
            if (uid) {
              const np = await safeGetSwr(`/notepad/${encodeURIComponent(uid)}`, (fresh) => setNotes(ensureArray(extractPayload(fresh))));
              setNotes(ensureArray(extractPayload(np)));
            }
            break;
          }
          case ViewMode.LEAVES: {
            const qUser = currentUser && (currentUser.employeeId || currentUser.id);
            const leavesUrl = currentUser.role === 'ADMIN' ? '/leave' : (qUser ? `/leave?userId=${encodeURIComponent(qUser)}` : '/leave');
            const lv = await safeGetSwr(leavesUrl, (fresh) => setLeaveRequests(ensureArray(extractPayload(fresh))));
            setLeaveRequests(ensureArray(extractPayload(lv)));
            break;
          }
          case ViewMode.EMPLOYEES: {
            const [eRes, uRes, aRes] = await Promise.all([
              safeGetSwr('/employees', (fresh) => setEmployees(ensureArray(extractPayload(fresh)))),
              safeGetSwr('/users', (fresh) => setUsers(ensureArray(extractPayload(fresh)))),
              currentUser.role === 'ADMIN'
                ? safeGetSwr('/employees?archived=1', (fresh) => setArchivedEmployees(ensureArray(extractPayload(fresh))))
                : Promise.resolve(null)
            ]);
            setEmployees(ensureArray(extractPayload(eRes)));
            setUsers(ensureArray(extractPayload(uRes)));
            if (aRes) setArchivedEmployees(ensureArray(extractPayload(aRes)));
            break;
          }
          case ViewMode.FINANCE: {
            const f = await safeGetSwr('/finance', (fresh) => setClientFinancials(ensureArray(extractPayload(fresh))));
            setClientFinancials(ensureArray(extractPayload(f)));
            break;
          }
        }

        // Notifications: SWR with a shorter TTL (30s fresh, 5min stale)
        if (currentUser && (currentUser.employeeId || currentUser.id)) {
          const uid = currentUser.employeeId || currentUser.id;
          const n = await safeGetSwr(
            `/notifications/${encodeURIComponent(uid)}`,
            (fresh) => setNotifications(ensureArray(extractPayload(fresh))),
            undefined,
            30_000,
            300_000
          );
          setNotifications(ensureArray(extractPayload(n)));
        }
      } catch (err) {
        console.warn('Lazy fetch for view failed', currentView, err);
      }
    };

    fetchForView();
  }, [currentView, currentUser, applyAttendance, applyTimelogs]);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info') => {
    setToast({ message, type });
  }, []);

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
      let user = (payloadData.user ? payloadData.user : (payloadData && payloadData.id ? payloadData : null)) as User | null;
      if (!user) {
        // Server sets httpOnly cookie on login; we rely on that cookie (axios has withCredentials:true)
        try {
          const meRes = await safeGet('/auth/me', { cacheBust: true });
          const mePayload = extractPayload(meRes);
          user = mePayload && (mePayload.user || mePayload) ? (mePayload.user || mePayload) : null;
        } catch (e) {
          console.warn('/auth/me after login failed', e && (e.stack || e.message || e));
        }
      }

      // If user still not resolved, treat as failure
      if (!user) {
        setAuthError((res && (res as any).data && (res as any).data.message) || 'Invalid credentials. Access Denied.');
        return;
      }

      // Proceed with resolved user
      if (user) {
        const token = payloadData.token;
        if (token) {
          localStorage.setItem('kbt_token', token);
        }
        // Professional parallelized eager-load of all necessary master data to prevent any generic fallback templates
        // We use catch blocks on individual promises so a single endpoint failure won't halt the entire login flow
        await Promise.all([
          safeGet('/users', { cacheBust: true })
            .then(uRes => {
              const uArr = ensureArray(extractPayload(uRes));
              setUsers(uArr.length ? uArr : INITIAL_USERS);
            })
            .catch(err => {
              console.warn('Failed to eager-fetch users on login', err);
              setUsers(INITIAL_USERS);
            }),
            
          safeGet('/employees', { cacheBust: true })
            .then(empRes => {
              const empsArr = ensureArray(extractPayload(empRes)).map((e: any) => ({ ...e, hideAttendance: !!e.hideAttendance }));
              setEmployees(empsArr.length ? empsArr : INITIAL_EMPLOYEES);
            })
            .catch(err => {
              console.warn('Failed to eager-fetch employees on login', err);
              setEmployees(INITIAL_EMPLOYEES);
            }),
            
          safeGet('/tasks', { cacheBust: true })
            .then(tRes => setTasks(ensureArray(extractPayload(tRes))))
            .catch(err => console.warn('Failed to eager-fetch tasks on login', err)),
            
          safeGet('/reminders', { cacheBust: true })
            .then(rRes => setReminders(ensureArray(extractPayload(rRes))))
            .catch(err => console.warn('Failed to eager-fetch reminders on login', err)),

          safeGet('/attendance', { cacheBust: true })
            .then(res => applyAttendance(ensureArray(extractPayload(res))))
            .catch(err => console.warn('Failed to eager-fetch attendance on login', err)),

          safeGet('/timelogs', { cacheBust: true })
            .then(res => applyTimelogs(ensureArray(extractPayload(res))))
            .catch(err => console.warn('Failed to eager-fetch timelogs on login', err)),

          user.role === 'ADMIN' 
            ? safeGet('/employees?archived=1', { cacheBust: true })
                .then(ra => {
                  const archivedArr = ensureArray(extractPayload(ra)).map((e: any) => ({ ...e, hideAttendance: !!e.hideAttendance }));
                  setArchivedEmployees(archivedArr);
                })
                .catch(err => console.warn('Failed to eager-fetch archived employees on login', err))
            : Promise.resolve()
        ]);

        setCurrentUser(user);
        // Do not persist full user object in localStorage; session is server-managed.
        setAuthError('');
        try { sessionStorage.removeItem('kbt_session_logout'); } catch (e) { /* ignore */ }
        // Clear any deep-link hash left from prior sessions to avoid unexpected demo page on login
        if (window.location.hash) window.history.replaceState(null, '', window.location.pathname);
        // Default to profile (EMPLOYEE_HOME) for employees, Dashboard for admins
        setCurrentView(user.role === 'ADMIN' ? ViewMode.DASHBOARD : ViewMode.EMPLOYEE_HOME);
        return;
      }
      setAuthError('Invalid credentials. Access Denied.');
    } catch (err) {
      // If server unreachable, fall back to local in-browser users
      console.error('Auth server unreachable, falling back to local users', err && (err.stack || err.message || err));
      await new Promise(r => setTimeout(r, 600));

      // Populate local master data for mock session so components are fully hydrated
      setEmployees(INITIAL_EMPLOYEES);
      setTasks(INITIAL_TASKS);
      setUsers(INITIAL_USERS);

      const user = INITIAL_USERS.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === pass);
      if (user) {
        if (user.role === 'EMPLOYEE' && user.employeeId) {
          const isActive = INITIAL_EMPLOYEES.find(e => e.id === user.employeeId);
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

  const handleLogout = useCallback(async () => {
    try {
      // Avoid sending the literal string "null" as JSON body which body-parser
      // rejects in strict mode. Passing undefined omits the request body.
      await api.post('/auth/logout', undefined, { withCredentials: true });
    } catch (err) {
      console.warn('Logout call failed', err);
    }
    // Remove persisted token
    localStorage.removeItem('kbt_token');
    // Remove client token storage (we do not persist token to localStorage)
    setCurrentUser(null);
    setAuthError('');
    setIsSidebarOpen(false);
    setTasks([]);
    // Mark session as intentionally logged out so a subsequent refresh will not restore it
    try { sessionStorage.setItem('kbt_session_logout', '1'); } catch (e) { /* ignore */ }
    window.location.hash = ''; // Clear hash from URL on logout
  }, []);

  const addNotification = useCallback((title: string, message: string, type: Notification['type'], targetUser: string = 'ALL') => {
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
  }, [currentUser, extractPayload, ensureArray, safeGet, showToast]);

  const handleClockIn = useCallback(async () => {
    const empId = currentUser?.employeeId || (currentUser?.id ? String(currentUser.id) : '');
    if (!empId) return;
    const now = new Date();
    const dateKey = formatDateKey(now);

    const userLogMap = timeLogs[empId] || (currentUser?.employeeId ? timeLogs[currentUser.employeeId] : undefined) || (currentUser?.id ? timeLogs[String(currentUser.id)] : undefined) || {};
    const existingDayLogs = userLogMap[dateKey] || [];
    if (existingDayLogs.length >= 2) return;

    const tId = `TL-${empId}-${Date.now()}`;
    const aId = `A-${empId}-${dateKey}`;
    const newLog: TimeLog = { id: tId, date: dateKey, clockIn: now.toISOString() };

    const updateTargetKeys = new Set<string>([empId]);
    if (currentUser?.employeeId) updateTargetKeys.add(currentUser.employeeId);
    if (currentUser?.id) updateTargetKeys.add(String(currentUser.id));

    // --- OPTIMISTIC UPDATE FIRST: UI responds instantly ---
    // Save with userId so applyTimelogs can restore it on refresh
    const logForStorage = { ...newLog, userId: empId };
    try {
      updateTargetKeys.forEach(k => localStorage.setItem(`kbt_active_log_${k}`, JSON.stringify(logForStorage)));
    } catch (e) { /* ignore */ }

    setTimeLogs(prev => {
      const next = { ...prev };
      updateTargetKeys.forEach(k => {
        const uLogs = next[k] || {};
        const dLogs = uLogs[dateKey] || [];
        next[k] = { ...uLogs, [dateKey]: [...dLogs, newLog] };
      });
      return next;
    });
    setAttendanceData(prev => {
      const next = { ...prev };
      updateTargetKeys.forEach(k => {
        next[k] = { ...(next[k] || {}), [dateKey]: 1 };
      });
      return next;
    });
    addNotification('Attendance', `Shift started at ${now.toLocaleTimeString()}`, 'SYSTEM', String(empId));
    addNotification('System Alert', `${currentUser.name} clocked in at ${now.toLocaleTimeString()}`, 'SYSTEM', 'ADMIN');

    // --- Background server sync then re-fetch to get authoritative state ---
    try {
      await api.post('/timelogs', { id: tId, userId: empId, startTime: now.toISOString() }, { withCredentials: true });
      if (existingDayLogs.length === 0) {
        await api.post('/attendance', { id: aId, userId: empId, date: dateKey, clockIn: now.toISOString(), value: null }, { withCredentials: true });
      }
      // Re-fetch fresh timelogs from server to sync the canonical timelog ID (handles "existing session reused" case)
      const freshRes = await safeGet(`/timelogs?userId=${encodeURIComponent(empId)}`, { cacheBust: true });
      const freshLogs = ensureArray(extractPayload(freshRes));
      if (freshLogs.length > 0) applyTimelogs(freshLogs);
      // Update localStorage with authoritative active log from server
      const serverActiveLog = freshLogs.find((l: any) => !l.endTime);
      if (serverActiveLog) {
        const serverLog = { id: serverActiveLog.id, date: dateKey, clockIn: serverActiveLog.startTime, userId: empId };
        try { updateTargetKeys.forEach(k => localStorage.setItem(`kbt_active_log_${k}`, JSON.stringify(serverLog))); } catch (e) { /* ignore */ }
      }
    } catch (err) {
      console.warn('[ClockIn] Background server sync failed (optimistic update already applied)', err);
    }
  }, [currentUser, sundayRequests, timeLogs, addNotification, applyTimelogs, safeGet, extractPayload, ensureArray]);

  const handleClockOut = useCallback(async () => {
    const empId = currentUser?.employeeId || (currentUser?.id ? String(currentUser.id) : '');
    if (!empId) return;
    const now = new Date();
    const dateKey = formatDateKey(now);

    const userLogMap = timeLogs[empId] || (currentUser?.employeeId ? timeLogs[currentUser.employeeId] : undefined) || (currentUser?.id ? timeLogs[String(currentUser.id)] : undefined) || {};
    const allUserLogs = Object.values(userLogMap).flat();
    const currentLog = allUserLogs.find(l => !l.clockOut);

    if (!currentLog?.clockIn) return;
    const clockInMs = new Date(currentLog.clockIn).getTime();
    const diffMs = isNaN(clockInMs) ? 0 : now.getTime() - clockInMs;
    const diffMinutes = Math.max(0, diffMs / 60000);
    const hoursWorked = Math.max(0, diffMinutes / 60);

    const tId = currentLog.id || `TL-${empId}-${dateKey}`;
    const aId = `A-${empId}-${dateKey}`;

    const dayLogs = userLogMap[dateKey] || [];
    const otherLogsHours = dayLogs.filter(l => l.id !== currentLog.id).reduce((sum, l) => sum + (l.durationHours || 0), 0);
    const totalDayHours = otherLogsHours + hoursWorked;
    const computedVal: AttendanceValue = totalDayHours >= 7.5 ? 1 : (totalDayHours >= 6 ? 0.75 : (totalDayHours >= 4 ? 0.5 : (totalDayHours >= 2 ? 0.25 : 0)));

    const updateTargetKeys = new Set<string>([empId]);
    if (currentUser?.employeeId) updateTargetKeys.add(currentUser.employeeId);
    if (currentUser?.id) updateTargetKeys.add(String(currentUser.id));

    try {
      updateTargetKeys.forEach(k => localStorage.removeItem(`kbt_active_log_${k}`));
    } catch (e) { /* ignore */ }

    // --- OPTIMISTIC UPDATE FIRST: UI responds instantly ---
    setTimeLogs(prev => {
      const next = { ...prev };
      updateTargetKeys.forEach(k => {
        const uLogs = next[k] || {};
        const logDateKey = currentLog.date || dateKey;
        const dLogs = uLogs[logDateKey] || [];
        const updatedLogs = dLogs.map(l => (l.id === currentLog.id || l.clockIn === currentLog.clockIn) ? { ...l, clockOut: now.toISOString(), durationHours: hoursWorked } : l);
        next[k] = { ...uLogs, [logDateKey]: updatedLogs };
      });
      return next;
    });
    setAttendanceData(prev => {
      const next = { ...prev };
      updateTargetKeys.forEach(k => {
        next[k] = { ...(next[k] || {}), [dateKey]: computedVal };
      });
      return next;
    });
    addNotification('Attendance', `Shift ended. Total: ${formatDecimalHours(totalDayHours)}`, 'SYSTEM', String(empId));
    addNotification('System Alert', `${currentUser.name} clocked out. Shift total: ${formatDecimalHours(totalDayHours)}`, 'SYSTEM', 'ADMIN');

    // --- Background server sync (non-blocking) ---
    try {
      await api.put(`/timelogs/${encodeURIComponent(tId)}`, { endTime: now.toISOString() }, { withCredentials: true });
      await api.put(`/attendance/${encodeURIComponent(aId)}`, { clockOut: now.toISOString(), value: computedVal }, { withCredentials: true });
    } catch (err) {
      console.warn('[ClockOut] Background server sync failed (optimistic update already applied)', err);
    }
  }, [currentUser, timeLogs, addNotification]);

  const handleUpdateProfile = useCallback(async (empId: string, data: Partial<Employee>) => {
    if (!empId || empId.trim() === '') {
      console.warn('handleUpdateProfile: empId is empty, skipping update');
      return;
    }
    // Optimistic update — show change immediately in UI before server confirms
    setEmployees(prev => prev.map(e => e.id === empId ? { ...e, ...data } : e));
    try {
      await api.put(`/employees/${encodeURIComponent(empId)}`, data, { withCredentials: true });
      // Refresh from server to get authoritative state (including avatar inside documents)
      const res = await safeGet('/employees');
      setEmployees(ensureArray(extractPayload(res)));
      showToast('Profile Updated Successfully', 'success');
      addNotification('Security Hub', 'Compliance documentation or profile details have been updated.', 'SYSTEM', empId);
    } catch (err) {
      console.error('Failed to update profile', err);
      showToast('Profile update failed', 'error');
      // Rollback optimistic update on failure by refreshing from server
      try { const res = await safeGet('/employees'); setEmployees(ensureArray(extractPayload(res))); } catch { }
    }
  }, [addNotification, ensureArray, extractPayload, safeGet, showToast]);

  // INITIALIZATION LOADER: Show a lightweight loading state while restoring session status
  if (isAuthChecking) {
    return (
      <div className="flex items-center justify-center h-screen w-screen bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
          <span className="text-xs font-bold text-slate-500 animate-pulse">Initializing...</span>
        </div>
      </div>
    );
  }

  // MASTER SECURITY GUARD: If not logged in, return Auth component IMMEDIATELY
  if (!currentUser) {
    return (
      <Auth
        onLogin={handleLogin}
        onResetPassword={async (email) => {
          try {
            // Eagerly call the public forgot-password API
            const res = await api.post('/auth/forgot-password', { email });
            const payload = extractPayload(res);
            if (payload && payload.otp) {
              return payload.otp; // return the generated OTP
            }
            return false;
          } catch (err) {
            console.warn('Backend reset password failed, attempting local fallback', err);
            // Professional local fallback logic
            const user = users.find((u: any) => u.email.toLowerCase() === email.toLowerCase());
            if (!user) return false;
            // Generate a 6-digit numeric OTP for local fallback
            const otpCode = String(Math.floor(100000 + Math.random() * 900000));
            (window as any)._localOtp = otpCode;
            return otpCode; 
          }
        }}
        onConfirmReset={async (email, otp, newPass) => {
          try {
            const res = await api.post('/auth/reset-password-otp', { email, otp, password: newPass });
            if (res && res.data && res.data.success) {
              // Refresh local users list
              try { const uList = await safeGet('/users'); setUsers(ensureArray(extractPayload(uList))); } catch {}
              return true;
            }
            return false;
          } catch (err) {
            console.warn('Backend reset password-otp failed, attempting local fallback', err);
            // Professional local fallback logic
            const user = users.find((u: any) => u.email.toLowerCase() === email.toLowerCase());
            if (!user) return false;
            
            // Validate local OTP
            const expectedOtp = (window as any)._localOtp || '123456';
            if (otp !== expectedOtp) return false;

            setUsers(prev => prev.map(u => u.id === user.id ? { ...u, password: newPass, plain_password: newPass } : u));
            return true;
          }
        }}
        error={authError}
      />
    );
  }

  // --- Render Logic (Only executes if authenticated) ---
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
        case ViewMode.PLAYBOOK: return <Playbook currentUser={currentUser} employees={employees} />;
        case ViewMode.HOLIDAYS: return <HolidayManager holidays={holidays} setHolidays={setHolidays} />;
        case ViewMode.LEAVES: return <LeaveManagement {...commonProps} />;
        case ViewMode.DATABASE: return <DatabaseManager allData={{ ...commonProps, users }} onRestore={(d) => { }} onReset={() => { }} />;
        case ViewMode.NOTIFICATIONS: return <NotificationCenter notifications={notifications} setNotifications={setNotifications} currentUser={currentUser} onNavigate={setCurrentView} />;
        case ViewMode.README: return <ReadMe role="ADMIN" />;
        case ViewMode.SYSTEM_MASTER: return <SystemMaster currentView={currentView} onNavigate={setCurrentView} currentUser={currentUser} showToast={showToast} />;
        default: return <Dashboard employees={employees} attendanceData={attendanceData} onNavigate={setCurrentView} />;
      }
    } else {
      switch (currentView) {
        case ViewMode.EMPLOYEE_HOME:
          return <EmployeeDashboard user={currentUser} onClockIn={handleClockIn} onClockOut={handleClockOut} onUpdateProfile={handleUpdateProfile} {...commonProps} />;
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
        case ViewMode.PLAYBOOK: return <Playbook currentUser={currentUser} employees={employees} />;
        case ViewMode.SYSTEM_MASTER: return <SystemMaster currentView={currentView} onNavigate={setCurrentView} currentUser={currentUser} showToast={showToast} />;
        default: return <EmployeeDashboard user={currentUser} onClockIn={handleClockIn} onClockOut={handleClockOut} onUpdateProfile={handleUpdateProfile} {...commonProps} />;
      }
    }
  };

  return (
    <div className="flex bg-slate-50 min-h-screen h-[100dvh] w-full font-sans text-slate-900 overflow-hidden relative print:h-auto print:overflow-visible print:block">
      <div className="fixed inset-0 z-0 bg-slate-50 pointer-events-none print:hidden">
        <div className="absolute top-0 -left-4 w-96 h-96 bg-purple-300 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
        <div className="absolute top-0 -right-4 w-96 h-96 bg-blue-300 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>
        <div className="absolute -bottom-32 left-20 w-96 h-96 bg-pink-300 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-4000"></div>
      </div>

      <Sidebar
        currentView={currentView}
        onNavigate={onNavigate}
        role={currentUser.role}
        onLogout={handleLogout}
        userName={currentUser.name}
        isOpen={isSidebarOpen}
        onClose={closeSidebar}
        userDepartment={currentUserDepartment}
      />

      <main className="flex-1 flex flex-col h-full overflow-hidden relative z-10 glass-panel md:my-4 md:mr-4 md:rounded-r-3xl border-slate-200 shadow-2xl print:m-0 print:rounded-none print:shadow-none print:border-none print:block">
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

        <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar relative print:overflow-visible print:h-auto print:block">
          <div className="min-h-full h-full animate-fade-in-up">
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

      {showPolicyPopup && (
        <div className="fixed inset-0 z-[300] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in duration-300">
            <div className="p-6 sm:p-8">
              <div className="w-12 h-12 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center mb-6">
                <AlertTriangle size={24} />
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 mb-4 leading-tight">
                📢 New Attendance Policy
                <span className="block text-sm text-red-500 font-bold mt-1 uppercase tracking-wider">(Effective Immediately)</span>
              </h2>
              <div className="space-y-4 text-sm sm:text-base text-slate-600 font-medium leading-relaxed">
                <p>
                  Employees are permitted to arrive 5 to 15 minutes late up to <strong className="text-slate-900">two times per month</strong> without any penalty.
                </p>
                <p>
                  Beginning with the third occurrence in the same month, a fine of <strong className="text-red-600">₹200</strong> will be applied for each additional late arrival.
                </p>
                <p>
                  The total amount collected through these fines will be utilized for employee welfare and team engagement activities at the end of each month.
                </p>
                <p className="pt-2 text-slate-500 italic">
                  We appreciate your cooperation in maintaining workplace discipline and punctuality.
                </p>
              </div>
            </div>
            <div className="p-4 sm:p-6 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button
                onClick={handleClosePolicyPopup}
                className="w-full sm:w-auto px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-all active:scale-95 shadow-lg shadow-indigo-200"
              >
                I have read and understood
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
