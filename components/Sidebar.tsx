
import React from 'react';
import { LayoutDashboard, Users, CalendarCheck, FileBarChart, Info, LogOut, UserCircle, CalendarDays, ClipboardList, X, Package, Archive, BarChart, HelpCircle, MessageCircle, Clock, GitGraph, HardHat, Calendar, DollarSign, StickyNote, ListChecks, Bell, Database } from 'lucide-react';
import { ViewMode, Role } from '../types';
import { COMPANY_LOGO } from '../constants';

interface SidebarProps {
  currentView: ViewMode;
  onNavigate: (view: ViewMode) => void;
  role: Role;
  onLogout: () => void;
  userName: string;
  isOpen: boolean;
  onClose: () => void;
  userDepartment?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentView, onNavigate, role, onLogout, userName, isOpen, onClose, userDepartment }) => {
  
  const adminItems = [
    { id: ViewMode.DASHBOARD, label: 'Dashboard', icon: LayoutDashboard },
    { id: ViewMode.CALENDAR, label: 'Company Calendar', icon: Calendar }, 
    { id: ViewMode.FINANCE, label: 'Finance & Payments', icon: DollarSign },
    { id: ViewMode.DATABASE, label: 'Data Hub & Backups', icon: Database },
    { id: ViewMode.NOTIFICATIONS, label: 'Notification Center', icon: Bell },
    { id: ViewMode.ORGANIZATION_TREE, label: 'Organization Tree', icon: GitGraph }, 
    { id: ViewMode.PROJECTS, label: 'Project Sites', icon: HardHat },
    { id: ViewMode.TIME_LOGS, label: 'Shift Logs', icon: Clock },
    { id: ViewMode.FMS_TASKS, label: 'Task Management', icon: ClipboardList },
    { id: ViewMode.CHECKLIST, label: 'Checklist Monitor', icon: ListChecks },
    { id: ViewMode.MATERIAL_ORDERS, label: 'O2D', icon: Package },
    { id: ViewMode.PERFORMANCE, label: 'KPI Report', icon: BarChart }, 
    { id: ViewMode.CHAT, label: 'Team Chat', icon: MessageCircle }, 
    { id: ViewMode.QUERIES, label: 'Query Box', icon: HelpCircle }, 
    { id: ViewMode.NOTEPAD, label: 'My Notepad', icon: StickyNote }, 
    { id: ViewMode.ATTENDANCE, label: 'Attendance Sheet', icon: CalendarCheck },
    { id: ViewMode.LEAVES, label: 'Leave Management', icon: FileBarChart },
    { id: ViewMode.EMPLOYEES, label: 'Team Master', icon: Users },
    { id: ViewMode.ARCHIVED_STAFF, label: 'Archived Team', icon: Archive },
    { id: ViewMode.HOLIDAYS, label: 'Holiday Manager', icon: CalendarDays },
    { id: ViewMode.README, label: 'Documentation', icon: Info },
  ];

  const employeeItems = [
    { id: ViewMode.EMPLOYEE_HOME, label: 'My Portal', icon: LayoutDashboard },
    { id: ViewMode.CALENDAR, label: 'Company Calendar', icon: Calendar }, 
    { id: ViewMode.NOTIFICATIONS, label: 'Notification Center', icon: Bell },
    { id: ViewMode.CHECKLIST, label: 'My Checklist', icon: ListChecks },
    { id: ViewMode.EMPLOYEE_TASKS, label: 'My Tasks', icon: ClipboardList },
    { id: ViewMode.EMPLOYEE_ORDERS, label: 'O2D', icon: Package },
    { id: ViewMode.LEAVES, label: 'Leave Application', icon: FileBarChart },
    { id: ViewMode.EMPLOYEE_CHAT, label: 'Team Chat', icon: MessageCircle }, 
    { id: ViewMode.EMPLOYEE_QUERIES, label: 'Raise Query', icon: HelpCircle }, 
    { id: ViewMode.NOTEPAD, label: 'My Notepad', icon: StickyNote }, 
    { id: ViewMode.README, label: 'Help & Docs', icon: Info },
  ];

  const isProjectTeam = userDepartment === 'Project Development & Execution';
  if (isProjectTeam && role === 'EMPLOYEE') {
      employeeItems.splice(3, 0, { id: ViewMode.EMPLOYEE_PROJECTS, label: 'Project Sites', icon: HardHat });
  }

  const isFinanceOrSales = userDepartment === 'Finance & Accounts' || userDepartment === 'Sales & Marketing';
  if (isFinanceOrSales && role === 'EMPLOYEE') {
      employeeItems.splice(3, 0, { id: ViewMode.FINANCE, label: 'Finance & Payments', icon: DollarSign });
  }

  const menuItems = role === 'ADMIN' ? adminItems : employeeItems;

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden print:hidden" onClick={onClose} />
      )}

      <div className={`fixed inset-y-0 left-0 z-50 w-72 bg-slate-900/95 backdrop-blur-xl text-white flex flex-col h-full shadow-[10px_0_30px_rgba(0,0,0,0.5)] transition-transform duration-300 transform ${isOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 md:relative print:hidden border-r border-white/5`}>
        <div className="p-8 pb-6 relative">
          <button onClick={onClose} className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white md:hidden">
            <X size={24} />
          </button>
          <div className="flex items-center gap-3 mb-1">
            <div className="relative group">
               <div className="absolute inset-0 bg-blue-500 rounded-lg blur opacity-50"></div>
               <img src={COMPANY_LOGO} alt="Logo" className="relative w-10 h-10 object-contain bg-white rounded-lg shadow-lg p-0.5" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight leading-none text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400">KALRA</h1>
              <h1 className="text-xl font-black tracking-tight leading-none text-slate-500">BUILDTECH</h1>
            </div>
          </div>
          <div className="mt-4 px-3 py-1 bg-slate-800/50 rounded-full border border-white/5 inline-flex items-center backdrop-blur-sm">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse mr-2"></span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-300">{role} PANEL</span>
          </div>
        </div>
        
        <nav className="flex-1 px-4 space-y-2 overflow-y-auto py-4 custom-scrollbar">
          {menuItems.map((item, index) => {
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => { onNavigate(item.id); onClose(); }}
                className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-all duration-300 group relative overflow-hidden ${
                  isActive 
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-[0_10px_20px_-5px_rgba(79,70,229,0.5)] translate-x-2 border border-white/20' 
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <item.icon size={20} className={isActive ? 'scale-110' : ''} />
                <span className={`font-medium tracking-wide ${isActive ? 'font-bold' : ''}`}>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/5 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-slate-800/40 rounded-2xl p-3 border border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-inner">
                <UserCircle size={22} />
              </div>
              <div className="overflow-hidden">
                <p className="text-sm font-bold text-slate-200 truncate">{userName}</p>
                <p className="text-[10px] text-emerald-400 uppercase tracking-wider font-bold">Online</p>
              </div>
            </div>
            <button onClick={onLogout} className="p-2 text-slate-500 hover:text-red-400 transition-all" title="Logout">
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
