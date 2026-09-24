
import React, { useMemo, useState, useEffect } from 'react';
import { LayoutDashboard, Users, CalendarCheck, FileBarChart, Info, LogOut, UserCircle, CalendarDays, ClipboardList, X, Package, Archive, BarChart, BarChart3, HelpCircle, MessageCircle, Clock, GitGraph, HardHat, Calendar, DollarSign, StickyNote, ListChecks, Bell, Database, BookOpen, Map, Layers, History, Search, FolderKanban, Percent } from 'lucide-react';
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

interface NavItem {
  id: ViewMode;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

interface NavCategory {
  category: string;
  items: NavItem[];
}

const SidebarComponent: React.FC<SidebarProps> = ({ currentView, onNavigate, role, onLogout, userName, isOpen, onClose, userDepartment }) => {
  const isFinanceOrSales = userDepartment === 'Finance & Accounts' || userDepartment === 'Sales & Marketing';

  const navCategories = useMemo<NavCategory[]>(() => {
    if (role === 'ADMIN' || role === 'PC') {
      const hiddenForPC = new Set([
        ViewMode.ATTENDANCE,
        ViewMode.EMPLOYEES,
        ViewMode.ARCHIVED_STAFF,
        ViewMode.DATABASE,
        ViewMode.TIME_LOGS,
      ]);

      const rawGroups: NavCategory[] = [
        {
          category: 'Overview',
          items: [
            { id: ViewMode.DASHBOARD, label: 'Dashboard', icon: LayoutDashboard },
            { id: ViewMode.PERFORMANCE, label: 'KPI Report', icon: BarChart },
            { id: ViewMode.CALENDAR, label: 'Company Calendar', icon: Calendar },
            { id: ViewMode.NOTIFICATIONS, label: 'Notification Center', icon: Bell },
            { id: ViewMode.SYSTEM_MASTER, label: 'Sheet Center', icon: Layers },
          ],
        },
        {
          category: 'Operations & Workflow',
          items: [
            { id: ViewMode.FMS_TASKS, label: 'Task Management', icon: ClipboardList },
            { id: ViewMode.CHECKLIST, label: 'Checklist Monitor', icon: ListChecks },
            { id: ViewMode.MATERIAL_ORDERS, label: 'O2D Orders', icon: Package },
            { id: ViewMode.CRM, label: 'CRM', icon: Users },
            { id: ViewMode.TIME_LOGS, label: 'Shift Logs', icon: Clock },
            { id: ViewMode.PMS_ADMIN, label: 'PMS Dashboard', icon: BarChart3 },
          ],
        },
        {
          category: 'Workforce & HR',
          items: [
            { id: ViewMode.ATTENDANCE, label: 'Attendance Sheet', icon: CalendarCheck },
            { id: ViewMode.LEAVES, label: 'Leave Management', icon: FileBarChart },
            { id: ViewMode.EMPLOYEES, label: 'Team Master', icon: Users },
            { id: ViewMode.ARCHIVED_STAFF, label: 'Archived Team', icon: Archive },
            { id: ViewMode.HOLIDAYS, label: 'Holiday Manager', icon: CalendarDays },
            { id: ViewMode.ORGANIZATION_TREE, label: 'Organization Tree', icon: GitGraph },
          ],
        },
        {
          category: 'System & Tools',
          items: [
            { id: ViewMode.FINANCE, label: 'Finance & Payments', icon: DollarSign },
            { id: ViewMode.DATABASE, label: 'Data Hub & Backups', icon: Database },
            { id: ViewMode.CHAT, label: 'Team Chat', icon: MessageCircle },
            { id: ViewMode.QUERIES, label: 'Query Box', icon: HelpCircle },
            { id: ViewMode.NOTEPAD, label: 'My Notepad', icon: StickyNote },
            { id: ViewMode.PLAYBOOK, label: 'Playbook', icon: BookOpen },
            { id: ViewMode.README, label: 'Documentation', icon: Info },
          ],
        },
      ];

      if (role === 'PC') {
        return rawGroups
          .map(group => ({
            ...group,
            items: group.items.filter(item => !hiddenForPC.has(item.id)),
          }))
          .filter(group => group.items.length > 0);
      }

      return rawGroups;
    }

    // EMPLOYEE ROLE
    const employeeWorkItems: NavItem[] = [
      { id: ViewMode.EMPLOYEE_TASKS, label: 'My Tasks', icon: ClipboardList },
      { id: ViewMode.CHECKLIST, label: 'My Checklist', icon: ListChecks },
      { id: ViewMode.PMS_EMPLOYEE, label: 'PMS', icon: BarChart3 },
      { id: ViewMode.EMPLOYEE_ORDERS, label: 'O2D Orders', icon: Package },
    ];

    if (isFinanceOrSales) {
      employeeWorkItems.push(
        { id: ViewMode.FINANCE, label: 'Finance & Payments', icon: DollarSign },
        { id: ViewMode.EMPLOYEE_CRM, label: 'CRM Leads', icon: Users }
      );
    }

    return [
      {
        category: 'Overview',
        items: [
          { id: ViewMode.EMPLOYEE_HOME, label: 'My Portal', icon: LayoutDashboard },
          { id: ViewMode.CALENDAR, label: 'Company Calendar', icon: Calendar },
          { id: ViewMode.NOTIFICATIONS, label: 'Notification Center', icon: Bell },
          { id: ViewMode.SYSTEM_MASTER, label: 'Sheet Center', icon: Layers },
        ],
      },
      {
        category: 'My Work & Tasks',
        items: employeeWorkItems,
      },
      {
        category: 'Self Service & HR',
        items: [
          { id: ViewMode.LEAVES, label: 'Leave Application', icon: FileBarChart },
          { id: ViewMode.NOTEPAD, label: 'My Notepad', icon: StickyNote },
        ],
      },
      {
        category: 'Collaboration & Help',
        items: [
          { id: ViewMode.EMPLOYEE_CHAT, label: 'Team Chat', icon: MessageCircle },
          { id: ViewMode.EMPLOYEE_QUERIES, label: 'Raise Query', icon: HelpCircle },
          { id: ViewMode.PLAYBOOK, label: 'Playbook', icon: BookOpen },
          { id: ViewMode.README, label: 'Help & Docs', icon: Info },
        ],
      },
    ];
  }, [role, isFinanceOrSales]);

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden print:hidden" onClick={onClose} />
      )}

      <div className={`fixed inset-y-0 left-0 z-50 w-72 bg-slate-900 text-white flex flex-col h-full shadow-2xl transition-transform duration-300 transform ${isOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 md:relative print:hidden border-r border-slate-800`}>
        <div className="p-6 pb-4 relative">
          <button onClick={onClose} className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white md:hidden rounded-lg focus-visible:ring-2 focus-visible:ring-indigo-400" aria-label="Close menu">
            <X size={22} />
          </button>
          <button 
            onClick={() => {
              onNavigate(role === 'ADMIN' || role === 'PC' ? ViewMode.DASHBOARD : ViewMode.EMPLOYEE_HOME);
              onClose();
            }}
            className="flex items-center gap-3 mb-1 text-left w-full hover:opacity-80 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 rounded-xl p-1"
          >
            <div className="relative group shrink-0">
               <div className="absolute inset-0 bg-blue-500 rounded-lg blur opacity-50 transition-opacity group-hover:opacity-75"></div>
               <img src={COMPANY_LOGO} alt="Kalra Buildtech Logo" className="relative w-10 h-10 object-contain bg-white rounded-lg shadow-lg p-0.5" />
            </div>
            <div className="text-xl font-black tracking-tight leading-none flex items-center gap-1.5" aria-label="Kalra Buildtech">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-300">KALRA</span>
              <span className="text-slate-400">BUILDTECH</span>
            </div>
          </button>
          <div className="mt-2.5 ml-1 px-3 py-1 bg-slate-800 rounded-full border border-slate-700/60 inline-flex items-center">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse mr-2" aria-hidden="true"></span>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300">{role} PANEL</span>
          </div>
        </div>
        
        <nav className="flex-1 px-3 py-3 space-y-5 overflow-y-auto custom-scrollbar" aria-label="Sidebar Navigation">
          {navCategories.map((group, groupIdx) => (
            <div key={group.category} role="group" aria-labelledby={`nav-heading-${groupIdx}`} className="space-y-1">
              <h3 
                id={`nav-heading-${groupIdx}`} 
                className="px-3 text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5"
              >
                {group.category}
              </h3>
              {group.items.map((item) => {
                const isActive = currentView === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => { onNavigate(item.id); onClose(); }}
                    aria-current={isActive ? 'page' : undefined}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 group relative ${
                      isActive 
                        ? 'bg-indigo-600 text-white font-semibold shadow-sm shadow-indigo-500/20' 
                        : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                    } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400`}
                  >
                    <item.icon size={18} className={`shrink-0 ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'}`} />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="p-3.5 border-t border-slate-800 bg-slate-950/60 space-y-2">
          <div className="bg-slate-800/60 rounded-xl p-2.5 border border-slate-700/50 flex items-center justify-between">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-inner shrink-0">
                <UserCircle size={20} />
              </div>
              <div className="overflow-hidden">
                <p className="text-xs font-bold text-slate-200 truncate">{userName}</p>
                <p className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block"></span> Online
                </p>
              </div>
            </div>
          </div>

          <button 
            onClick={onLogout} 
            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-slate-800 hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 border border-slate-700/60 hover:border-rose-500/30 rounded-xl text-xs font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 shadow-2xs active:scale-98" 
            title="Sign out of account" 
            aria-label="Logout"
          >
            <LogOut size={15} />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </>
  );
};

export const Sidebar = React.memo(SidebarComponent);
