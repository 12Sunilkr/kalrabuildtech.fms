
import React, { useState } from 'react';
import { Notification, User, ViewMode } from '../types';
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
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'ALL' | 'UNREAD'>('ALL');

  const isOverlay = !!onCloseOverlay;

  const myNotifications = notifications.filter(n => {
    const isForMe = currentUser.role === 'ADMIN' 
        ? true 
        : (n.targetUser === currentUser.employeeId || n.targetUser === 'ALL');
    const matchesSearch = n.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          n.message.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filter === 'ALL' ? true : !n.read;
    return isForMe && matchesSearch && matchesFilter;
  });

  const markAllRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const deleteNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
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
            {myNotifications.length === 0 ? (
                <div className="p-12 text-center text-slate-400 flex flex-col items-center">
                    <Bell size={48} className="mb-4 opacity-10" />
                    <p className="text-sm">No notifications found.</p>
                </div>
            ) : (
                myNotifications.map(note => (
                    <div key={note.id} className={`p-4 md:p-6 flex items-start gap-4 hover:bg-slate-50 transition-colors ${!note.read ? 'bg-blue-50/20' : ''}`}>
                         <div className="shrink-0">{getIcon(note.type)}</div>
                         <div className="flex-1 min-w-0">
                             <div className="flex justify-between items-start mb-1">
                                 <h4 className={`text-sm font-bold truncate ${!note.read ? 'text-slate-900' : 'text-slate-600'}`}>
                                     {note.title}
                                     {!note.read && <span className="ml-2 w-2 h-2 rounded-full bg-blue-500 inline-block shadow-[0_0_8px_blue]"></span>}
                                 </h4>
                                 <span className="text-[10px] text-slate-400 font-mono shrink-0">{note.time}</span>
                             </div>
                             <p className="text-sm text-slate-500 leading-relaxed line-clamp-2">{note.message}</p>
                         </div>
                         <button onClick={() => deleteNotification(note.id)} className="p-2 text-slate-300 hover:text-red-500 transition-colors">
                             <Trash2 size={16} />
                         </button>
                    </div>
                ))
            )}
        </div>
      </div>
    </div>
  );
};
