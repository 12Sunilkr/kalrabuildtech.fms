
import React, { useState, useEffect } from 'react';
import { Notification, User, ViewMode } from '../types';
import api, { safeGet, safePut, safeDelete, extractPayload, ensureArray } from '../src/utils/api';
import { Bell, Search, CheckCircle2, Trash2, MailOpen, AlertTriangle, ArrowLeft, X } from 'lucide-react';

interface NotificationCenterProps {
  notifications: Notification[];
  setNotifications: React.Dispatch<React.SetStateAction<Notification[]>>;
  currentUser: User;
  onNavigate?: (view: ViewMode) => void;
  onCloseOverlay?: () => void;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({ 
    notifications, setNotifications, currentUser, onNavigate, onCloseOverlay 
}) => {
  // NotificationCenter follows the Task module pattern:
  // - Always treat server as single source of truth
  // - Fetch notifications on mount (or when user becomes available)
  // - Validate and normalize API responses to arrays with `ensureArray`
  // - Never call GET during a simple UI click (clicks only toggle UI or call write endpoints)
  // - Defensively guard all render-time property accesses to avoid crashes
  // These guards ensure the component never calls `.map()` on undefined and never crashes on refresh.
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'ALL' | 'UNREAD'>('ALL');
  const [loading, setLoading] = useState(false);

  const isOverlay = !!onCloseOverlay;

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const notificationsPerPage = isOverlay ? 8 : 15;

  const safeNotifications = ensureArray(notifications);

  const myNotifications = safeNotifications.filter(n => {
    const isForMe = currentUser.role === 'ADMIN'
        ? true
        : (n.targetUser === currentUser.employeeId || n.targetUser === 'ALL');
    const matchesSearch = (n.title || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (n.message || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filter === 'ALL' ? true : !n.read;
    return isForMe && matchesSearch && matchesFilter;
  });

  // Memoize sliced subset for the current page
  const paginatedNotifications = React.useMemo(() => {
    const startIndex = (currentPage - 1) * notificationsPerPage;
    return myNotifications.slice(startIndex, startIndex + notificationsPerPage);
  }, [myNotifications, currentPage, notificationsPerPage]);

  const totalPages = Math.max(1, Math.ceil(myNotifications.length / notificationsPerPage));

  // Fetch notifications for current user from server and update state
  const fetchNotifications = async () => {
    // Defensive: do not attempt to fetch without a logged-in user
    if (!currentUser || !(currentUser.employeeId || currentUser.id)) {
      setNotifications([]);
      return;
    }
    setLoading(true);
    try {
      const res = await safeGet(`/notifications/${encodeURIComponent(currentUser.employeeId || currentUser.id)}`, { cacheBust: true });
      const payload = extractPayload(res);
      const rows = ensureArray(payload);
      // Normalize server rows to frontend Notification shape
      const normalized = rows.map((r: any) => {
        const meta = r.meta ? (typeof r.meta === 'string' ? (() => { try { return JSON.parse(r.meta); } catch { return null; } })() : r.meta) : null;
        return {
          id: r.id,
          title: meta && meta.title ? meta.title : (r.message ? (typeof r.message === 'string' ? r.message.split('\n')[0] : 'Notification') : 'Notification'),
          message: r.message,
          time: meta && meta.time ? meta.time : r.createdAt || '',
          read: !!r.isRead,
          type: meta && meta.type ? meta.type : 'SYSTEM',
          targetUser: r.userId || (meta && meta.targetUser) || 'ALL'
        } as Notification;
      });
      setNotifications(normalized);
    } catch (err) {
      console.error('Failed to fetch notifications', err && (err.stack || err.message || err));
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  };

  // Load notifications on mount and whenever `currentUser` becomes available
  useEffect(() => {
    fetchNotifications();
    // Re-run when currentUser changes so we fetch as soon as user is known
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  // Reset page to 1 when filter or search changes to prevent page mismatch
  useEffect(() => {
    setCurrentPage(1);
  }, [filter, searchTerm]);

  const markAllRead = async () => {
    try {
      const qUser = currentUser.employeeId || currentUser.id;
      await safePut(`/notifications/read-all/${encodeURIComponent(qUser)}`, {}, { withCredentials: true });
      await fetchNotifications();
    } catch (e) { console.error('Failed to mark all notifications read', e && (e.message || e)); }
  };

  const deleteNotification = async (id: string) => {
    try {
      await safeDelete(`/notifications/${encodeURIComponent(id)}`, { withCredentials: true });
      await fetchNotifications();
    } catch (e) { console.error('Failed to delete notification', e && (e.message || e)); }
  };

  const formatTime = (timeString: string) => {
    if (!timeString) return '';
    try {
      // If it already looks like a formatted short time (e.g., "10:30 AM")
      if (!timeString.includes('T') && timeString.includes(':')) {
        const testDate = new Date(timeString);
        if (isNaN(testDate.getTime())) return timeString;
      }
      const d = new Date(timeString);
      if (isNaN(d.getTime())) return timeString;
      return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d);
    } catch (e) {
      return timeString;
    }
  };

  const getIcon = (type: Notification['type']) => {
      switch(type) {
          case 'TASK': return <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold">T</div>;
          case 'ORDER': return <div className="w-8 h-8 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center font-bold">O</div>;
          case 'SYSTEM': return <div className="w-8 h-8 rounded-full bg-red-100 text-red-600 flex items-center justify-center font-bold"><AlertTriangle size={16}/></div>;
          case 'CHAT': return <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold">C</div>;
          case 'QUERY': return <div className="w-8 h-8 rounded-full bg-teal-100 text-teal-600 flex items-center justify-center font-bold">Q</div>;
          default: return <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center font-bold">N</div>;
      }
  };

  const formatShortMessage = (msg: string) => {
    if (!msg) return '';
    let m = msg.replace(/\(Migrated Task\)/g, 'an older task').replace(/\(Migrated Checklist Task\)/g, 'an older checklist');

    try {
      if (m.includes('marked as completed by')) {
        const match = m.match(/Task (.+?) marked as completed by (.+?)\.?$/i);
        if (match) return `✅ ${match[2].trim()} completed ${match[1].trim()}`;
      }
      if (m.includes('assigned successfully')) {
        const match = m.match(/Task ([\w-]+)?\s*"(.+?)" assigned successfully/i);
        if (match) return `📌 ${match[1] ? match[1] + ' ' : ''}Assigned: ${match[2]}`;
      }
      if (m.includes('permanently deleted')) {
         const match = m.match(/Task (.+?) was permanently deleted/i);
         if (match) return `🗑️ ${match[1].trim()} deleted`;
      }
      if (m.includes('Extension requested for Task')) {
         const match = m.match(/Extension requested for Task (.+?) by (.+?)\.?$/i);
         if (match) return `⏳ ${match[2].trim()} asks extension on ${match[1].trim()}`;
      }
      if (m.includes('moved to Overdue')) {
         const match = m.match(/Task (.+?) moved to Overdue/i);
         if (match) return `🚨 ${match[1].trim()} is Overdue!`;
      }
      if (m.includes('acknowledged the extension rejection')) {
         const match = m.match(/for Task (.+?)\./i);
         return `👀 Extension rejected for ${match ? match[1].trim() : 'Task'}`;
      }
      if (m.includes('reset to Pending by Admin')) {
         const match = m.match(/Task (.+?) reset to Pending/i);
         if (match) return `🔄 Admin reset ${match[1].trim()}`;
      }
      if (m.includes('is now active again')) {
         const match = m.match(/Task (.+?) is now active/i);
         if (match) return `▶️ ${match[1].trim()} resumed`;
      }
      if (m.includes('Your extension request for Task')) {
         const match = m.match(/Task (.+?) was (.+?)\.?$/i);
         if (match) return `📅 Extension ${match[2].trim()} for ${match[1].trim()}`;
      }
      if (m.includes('was holded by Admin') || m.includes('was put on hold')) {
         const match = m.match(/Task (.+?) was /i);
         if (match) return `⏸️ ${match[1].trim()} on Hold`;
      }
      if (m.includes('was terminated by Admin')) {
         const match = m.match(/Task (.+?) was terminated/i);
         if (match) return `🛑 ${match[1].trim()} Terminated`;
      }
      if (m.includes('clocked in at')) {
         const match = m.match(/(.+?) clocked in at (.+)/i);
         if (match) return `🟢 Shift Start: ${match[1].trim()} at ${match[2].trim()}`;
      }
      if (m.includes('clocked out.')) {
         const match = m.match(/(.+?) clocked out(?:\ out)?\. Shift total: (.+)/i);
         if (match) return `🔴 Shift End: ${match[1].trim()} (Total: ${match[2].trim()}h)`;
      }
      if (m.includes('Shift started at')) {
         return `🟢 You started shift at ${m.replace('Shift started at', '').trim()}`;
      }
      if (m.includes('Shift ended. Total:')) {
         return `🔴 You ended shift. Total: ${m.replace('Shift ended. Total:', '').trim()}h`;
      }
    } catch(e) {}

    return m;
  };

  return (
    <div className={`flex flex-col h-full overflow-hidden ${isOverlay ? 'bg-white rounded-3xl shadow-2xl border border-slate-200' : 'bg-slate-50/50 p-4 md:p-8'}`}>
      <div className={`flex flex-col md:flex-row justify-between items-start md:items-end gap-4 ${isOverlay ? 'p-6 border-b' : 'mb-8'}`}>
        <div>
           {onNavigate && !isOverlay && (
              <button onClick={() => onNavigate(currentUser.role === 'ADMIN' ? ViewMode.DASHBOARD : ViewMode.EMPLOYEE_HOME)} className="flex items-center gap-1 text-slate-400 hover:text-slate-800 text-xs font-bold uppercase mb-2">
                 <ArrowLeft size={14}/> Back to Dashboard
              </button>
           )}
           <h2 className={`${isOverlay ? 'text-xl' : 'text-2xl md:text-3xl'} font-extrabold text-slate-800 flex items-center gap-3`}>
            <div className="w-10 h-10 bg-slate-800 text-white rounded-xl flex items-center justify-center shadow-lg shrink-0">
              <Bell size={20} />
            </div>
            Notifications
          </h2>
          {!isOverlay && <p className="text-slate-500 mt-2 font-medium md:ml-14">History and alerts.</p>}
        </div>
        <div className="flex gap-2">
            <button onClick={markAllRead} className="bg-white border border-slate-200 text-slate-600 hover:text-blue-600 px-4 py-2 rounded-xl text-sm font-bold shadow-sm transition-all flex items-center gap-2">
              <MailOpen size={16} /> Read All
            </button>
            {isOverlay && (
                <button onClick={onCloseOverlay} className="p-2 hover:bg-slate-100 rounded-full text-slate-400">
                    <X size={20}/>
                </button>
            )}
        </div>
      </div>

      <div className={`bg-white border border-slate-200 overflow-hidden flex flex-col flex-1 ${isOverlay ? '' : 'rounded-3xl shadow-sm mb-8'}`}>
        <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row gap-3 justify-between items-center bg-slate-50/30">
            <div className="flex gap-2 w-full md:w-auto">
                <button onClick={() => setFilter('ALL')} className={`flex-1 md:flex-none px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${filter === 'ALL' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>All</button>
                <button onClick={() => setFilter('UNREAD')} className={`flex-1 md:flex-none px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${filter === 'UNREAD' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>Unread</button>
            </div>
            <div className="relative w-full md:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input type="text" placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm outline-none" />
            </div>
        </div>

        <div className="divide-y divide-slate-100 overflow-y-auto custom-scrollbar flex-1">
          {loading ? (
            <div className="p-8 text-center text-slate-500">Loading notifications…</div>
          ) : (!Array.isArray(myNotifications) || myNotifications.length === 0) ? (
            <div className="p-12 text-center text-slate-400 flex flex-col items-center">
              <Bell size={48} className="mb-4 opacity-10" />
              <p className="text-sm">No notifications found.</p>
            </div>
          ) : (
            paginatedNotifications.map(note => (
              <div key={note && note.id ? note.id : Math.random().toString(36).slice(2)} className={`p-5 flex items-start gap-4 hover:bg-slate-50 transition-all border-l-4 ${!note?.read ? 'border-l-blue-500 bg-blue-50/10' : 'border-l-transparent'}`}>
                 <div className="shrink-0 mt-1">{getIcon((note && note.type) as Notification['type'])}</div>
                 <div className="flex-1 min-w-0">
                   <div className="flex justify-between items-center mb-1.5">
                     <h4 className={`text-sm font-black tracking-tight ${!note?.read ? 'text-slate-900' : 'text-slate-500'}`}>
                       {note?.title || 'Notification'}
                       {!note?.read && <span className="ml-2 px-1.5 py-0.5 bg-blue-100 text-[10px] text-blue-600 rounded-md uppercase tracking-wider font-black">New</span>}
                     </h4>
                     {note?.time ? <span className="text-[10px] text-slate-400 font-bold bg-slate-100 px-2 py-0.5 rounded-full shrink-0">{formatTime(note.time)}</span> : null}
                   </div>
                   <p className={`text-sm leading-relaxed ${!note?.read ? 'text-slate-700 font-medium' : 'text-slate-500 font-normal'}`}>
                     {formatShortMessage(note?.message || '')}
                   </p>
                 </div>
                 <button 
                   onClick={() => deleteNotification(note && note.id ? note.id : '')} 
                   className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                   title="Delete notification"
                 >
                   <Trash2 size={16} />
                 </button>
              </div>
            ))
          )}
        </div>

        {/* Dynamic Compact Pagination Controls */}
        {myNotifications.length > 0 && (
          <div className="p-4 border-t border-slate-100 flex flex-col sm:flex-row gap-3 items-center justify-between bg-slate-50/50 shrink-0">
            <span className="text-xs font-semibold text-slate-500">
              Showing <span className="text-slate-800 font-extrabold">{Math.min(myNotifications.length, (currentPage - 1) * notificationsPerPage + 1)}</span> to{' '}
              <span className="text-slate-800 font-extrabold">{Math.min(myNotifications.length, currentPage * notificationsPerPage)}</span> of{' '}
              <span className="text-slate-800 font-extrabold">{myNotifications.length}</span> entries
            </span>

            {totalPages > 1 && (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 transition-all hover:bg-slate-50 hover:text-indigo-600 disabled:opacity-40 disabled:hover:bg-white disabled:hover:text-slate-600 cursor-pointer active:scale-95 disabled:active:scale-100 text-xs font-bold shadow-sm"
                >
                  Prev
                </button>
                
                <span className="text-xs font-black text-slate-600 bg-white border border-slate-200 px-3 py-1.5 rounded-lg shadow-sm font-mono">
                  {currentPage} / {totalPages}
                </span>

                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 transition-all hover:bg-slate-50 hover:text-indigo-600 disabled:opacity-40 disabled:hover:bg-white disabled:hover:text-slate-600 cursor-pointer active:scale-95 disabled:active:scale-100 text-xs font-bold shadow-sm"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
