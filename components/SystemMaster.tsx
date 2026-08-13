import React, { useState, useEffect, useMemo } from 'react';
import {
  Layers,
  LayoutDashboard,
  FileSpreadsheet,
  PlusCircle,
  UserPlus,
  History,
  Settings as SettingsIcon,
  Search,
  Plus,
  ExternalLink,
  Edit2,
  Trash2,
  Users,
  Check,
  UserCheck,
  CheckSquare,
  Square,
  Shield,
  Briefcase,
  Info,
  Calendar,
  Eye,
  LogOut,
  ChevronRight,
  TrendingUp,
  FileText,
  Star,
  Clock,
  Bell,
  HelpCircle,
  Package,
  ShoppingBag,
  BarChart3,
  Building,
  DollarSign,
  CalendarCheck,
  ClipboardList,
  MoreVertical,
  ChevronDown,
  ArrowRight,
  Share2,
  Sparkles,
  X,
  Lock,
  Unlock,
  UserX,
  Filter,
  CheckCircle2,
  Zap,
  FileCheck
} from 'lucide-react';
import { ViewMode, User, KBTSheet, KBTActivity } from '../types';

interface SystemMasterUser extends User {
  department?: string;
}

interface SystemMasterProps {
  currentView: ViewMode;
  onNavigate: (view: ViewMode) => void;
  currentUser: User | null;
  showToast: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

const DEFAULT_SHEETS: KBTSheet[] = [
  {
    id: 'KBT-001',
    name: 'Attendance Sheet',
    department: 'HR & Attendance',
    purpose: 'Monthly attendance records of all employees',
    url: 'https://docs.google.com/spreadsheets/d/1',
    responsible_person: 'HR Team',
    frequency: 'Daily',
    status: 'Active',
    assignedUsers: [],
    created_at: new Date().toISOString()
  },
  {
    id: 'KBT-002',
    name: 'PMS Sheet',
    department: 'PMS',
    purpose: 'Project Management System and weekly tracker',
    url: 'https://docs.google.com/spreadsheets/d/2',
    responsible_person: 'Project Lead',
    frequency: 'Weekly',
    status: 'Active',
    assignedUsers: [],
    created_at: new Date().toISOString()
  },
  {
    id: 'KBT-003',
    name: 'Finance Sheet',
    department: 'Finance & Accounts',
    purpose: 'Income, Expense, Balance and Account details',
    url: 'https://docs.google.com/spreadsheets/d/3',
    responsible_person: 'Finance Admin',
    frequency: 'Daily',
    status: 'Active',
    assignedUsers: [],
    created_at: new Date().toISOString()
  },
  {
    id: 'KBT-004',
    name: 'Purchase & Stock',
    department: 'Procurement',
    purpose: 'Material purchase records, stock inventory and supplier details',
    url: 'https://docs.google.com/spreadsheets/d/4',
    responsible_person: 'Purchase Manager',
    frequency: 'Weekly',
    status: 'Active',
    assignedUsers: [],
    created_at: new Date().toISOString()
  },
  {
    id: 'KBT-005',
    name: 'Employee Master',
    department: 'HR & Attendance',
    purpose: 'Employee details and information master',
    url: 'https://docs.google.com/spreadsheets/d/5',
    responsible_person: 'HR Admin',
    frequency: 'On-Demand',
    status: 'Active',
    assignedUsers: [],
    created_at: new Date().toISOString()
  },
  {
    id: 'KBT-006',
    name: 'Task Tracker',
    department: 'Operations',
    purpose: 'All tasks, status and progress tracking',
    url: 'https://docs.google.com/spreadsheets/d/6',
    responsible_person: 'Operations Team',
    frequency: 'Daily',
    status: 'Active',
    assignedUsers: [],
    created_at: new Date().toISOString()
  },
  {
    id: 'KBT-007',
    name: 'Project Sheets',
    department: 'Engineering',
    purpose: 'All project related sheets and reports',
    url: 'https://docs.google.com/spreadsheets/d/7',
    responsible_person: 'Site Engineer',
    frequency: 'Monthly',
    status: 'Active',
    assignedUsers: [],
    created_at: new Date().toISOString()
  },
  {
    id: 'KBT-008',
    name: 'Reports',
    department: 'Management',
    purpose: 'MIS reports and executive analytics sheets',
    url: 'https://docs.google.com/spreadsheets/d/8',
    responsible_person: 'Director',
    frequency: 'Monthly',
    status: 'Active',
    assignedUsers: [],
    created_at: new Date().toISOString()
  }
];

const DEFAULT_SYSTEM_USERS: SystemMasterUser[] = [
  { id: 'E-001', name: 'Sunil Kalra', email: 'sunil@kalrabuildtech.com', role: 'ADMIN', password: '', department: 'Management' },
  { id: 'E-002', name: 'Rajesh Sharma', email: 'rajesh@kalrabuildtech.com', role: 'EMPLOYEE', password: '', department: 'Engineering' },
  { id: 'E-003', name: 'Anish Kumar', email: 'anish@kalrabuildtech.com', role: 'EMPLOYEE', password: '', department: 'HR & Attendance' },
  { id: 'E-004', name: 'Priya Singh', email: 'priya@kalrabuildtech.com', role: 'EMPLOYEE', password: '', department: 'Finance & Accounts' },
  { id: 'E-005', name: 'Vikram Malhotra', email: 'vikram@kalrabuildtech.com', role: 'EMPLOYEE', password: '', department: 'Operations' },
  { id: 'E-006', name: 'Amit Patel', email: 'patel@kalrabuildtech.com', role: 'EMPLOYEE', password: '', department: 'Procurement' },
  { id: 'E-007', name: 'Neha Verma', email: 'neha@kalrabuildtech.com', role: 'EMPLOYEE', password: '', department: 'PMS' },
  { id: 'E-008', name: 'Deepak Kumar', email: 'deepak@kalrabuildtech.com', role: 'EMPLOYEE', password: '', department: 'Operations' }
];

export const SystemMaster: React.FC<SystemMasterProps> = ({ currentView, onNavigate, currentUser, showToast }) => {
  // Navigation states inside System Master sub-app
  const [activeTab, setActiveTab] = useState<'sheets' | 'add-sheet' | 'assign'>('sheets');

  // Data states
  const [sheets, setSheets] = useState<KBTSheet[]>([]);
  const [activities, setActivities] = useState<KBTActivity[]>([]);
  const [systemUsers, setSystemUsers] = useState<SystemMasterUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // UI state for image-matched layout
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [showAllSheets, setShowAllSheets] = useState<boolean>(false);
  const [openMenuSheetId, setOpenMenuSheetId] = useState<string | null>(null);

  // Starred / Favorite Sheet IDs
  const [starredIds, setStarredIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('kbt_starred_sheets');
      return saved ? new Set(JSON.parse(saved)) : new Set(['KBT-001', 'KBT-002', 'KBT-003', 'KBT-005', 'KBT-006']);
    } catch {
      return new Set(['KBT-001', 'KBT-002', 'KBT-003', 'KBT-005', 'KBT-006']);
    }
  });

  // Recently opened sheets
  const [recentOpened, setRecentOpened] = useState<{ id: string; openedAt: string }[]>(() => {
    try {
      const saved = localStorage.getItem('kbt_recent_sheets');
      return saved ? JSON.parse(saved) : [
        { id: 'KBT-001', openedAt: 'Opened 2 hours ago' },
        { id: 'KBT-002', openedAt: 'Opened 4 hours ago' },
        { id: 'KBT-003', openedAt: 'Opened 1 day ago' }
      ];
    } catch {
      return [
        { id: 'KBT-001', openedAt: 'Opened 2 hours ago' },
        { id: 'KBT-002', openedAt: 'Opened 4 hours ago' },
        { id: 'KBT-003', openedAt: 'Opened 1 day ago' }
      ];
    }
  });

  // Administrative testing toggle
  const [isAdminPreviewMode, setIsAdminPreviewMode] = useState(false);
  const isActualAdmin = currentUser?.role === 'ADMIN';
  const showAdminLayout = isActualAdmin && !isAdminPreviewMode;

  // Sheets filters & search
  const [searchQuery, setSearchQuery] = useState('');

  // Form states - Add/Edit Sheet
  const [editingSheetId, setEditingSheetId] = useState<string | null>(null);
  const [sheetIdInput, setSheetIdInput] = useState('');
  const [sheetName, setSheetName] = useState('');
  const [sheetUrl, setSheetUrl] = useState('');
  const [sheetDept, setSheetDept] = useState('Other');
  const [sheetPurpose, setSheetPurpose] = useState('');
  const [sheetResponsible, setSheetResponsible] = useState('Admin');
  const [sheetFrequency, setSheetFrequency] = useState('Daily');
  const [sheetStatus, setSheetStatus] = useState('Active');
  const [sheetNotes, setSheetNotes] = useState('');
  const [sheetAssigned, setSheetAssigned] = useState<string[]>([]);

  // Professional Assign Section State & Controls
  const [assignMode, setAssignMode] = useState<'by-sheet' | 'by-user'>('by-sheet');
  const [assignSelectedSheetId, setAssignSelectedSheetId] = useState<string>('');
  const [assignSelectedUserId, setAssignSelectedUserId] = useState<string>('');
  const [assignSheetSearch, setAssignSheetSearch] = useState<string>('');
  const [assignUserSearch, setAssignUserSearch] = useState<string>('');
  const [assignDeptFilter, setAssignDeptFilter] = useState<string>('All');

  // Fetch initial data
  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const sheetsRes = await fetch('/api/system-master/sheets');
      if (!sheetsRes.ok) throw new Error('Failed to fetch sheets');
      const sheetsData = await sheetsRes.json();
      const loadedSheets: KBTSheet[] = sheetsData.data || [];
      setSheets(loadedSheets.length ? loadedSheets : DEFAULT_SHEETS);

      if (isActualAdmin) {
        const actRes = await fetch('/api/system-master/activities');
        if (actRes.ok) {
          const actData = await actRes.json();
          setActivities(actData.data || []);
        }

        const usersRes = await fetch('/api/system-master/users');
        if (usersRes.ok) {
          const usersData = await usersRes.json();
          setSystemUsers(usersData.data || []);
        }
      }
    } catch (err: any) {
      console.warn('Backend fetch fallback to defaults', err);
      setSheets(DEFAULT_SHEETS);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [currentUser]);

  // Toggle star / favorite
  const toggleStar = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setStarredIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try { localStorage.setItem('kbt_starred_sheets', JSON.stringify(Array.from(next))); } catch {}
      return next;
    });
  };

  // Open sheet URL in new tab and track as recently opened
  const handleOpenSheet = (sheet: KBTSheet, e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    setRecentOpened(prev => {
      const filtered = prev.filter(r => r.id !== sheet.id);
      const updated = [{ id: sheet.id, openedAt: 'Just now' }, ...filtered].slice(0, 8);
      try { localStorage.setItem('kbt_recent_sheets', JSON.stringify(updated)); } catch {}
      return updated;
    });
    window.open(sheet.url, '_blank');
  };

  // Active sheets collection (from backend or default fallback)
  const activeSheetsList = useMemo(() => {
    return sheets.length > 0 ? sheets : DEFAULT_SHEETS;
  }, [sheets]);

  // Category Icon & Color Mapping
  const getCategoryDetails = (sheet: KBTSheet) => {
    const text = (sheet.name + ' ' + sheet.department).toLowerCase();
    if (text.includes('attendance')) return { icon: CalendarCheck, bg: 'bg-emerald-500', text: 'text-emerald-600', lightBg: 'bg-emerald-50' };
    if (text.includes('pms') || text.includes('project management')) return { icon: ClipboardList, bg: 'bg-blue-600', text: 'text-blue-600', lightBg: 'bg-blue-50' };
    if (text.includes('finance') || text.includes('account') || text.includes('income')) return { icon: DollarSign, bg: 'bg-amber-600', text: 'text-amber-600', lightBg: 'bg-amber-50' };
    if (text.includes('purchase') || text.includes('stock') || text.includes('procurement')) return { icon: ShoppingBag, bg: 'bg-purple-600', text: 'text-purple-600', lightBg: 'bg-purple-50' };
    if (text.includes('employee') || text.includes('team') || text.includes('hr')) return { icon: Users, bg: 'bg-teal-600', text: 'text-teal-600', lightBg: 'bg-teal-50' };
    if (text.includes('task') || text.includes('tracker')) return { icon: CheckSquare, bg: 'bg-pink-600', text: 'text-pink-600', lightBg: 'bg-pink-50' };
    if (text.includes('project')) return { icon: Building, bg: 'bg-sky-600', text: 'text-sky-600', lightBg: 'bg-sky-50' };
    if (text.includes('report') || text.includes('mis') || text.includes('analytic')) return { icon: BarChart3, bg: 'bg-emerald-600', text: 'text-emerald-600', lightBg: 'bg-emerald-50' };
    return { icon: FileSpreadsheet, bg: 'bg-indigo-600', text: 'text-indigo-600', lightBg: 'bg-indigo-50' };
  };

  // Filtered sheets array
  const filteredSheets = useMemo(() => {
    let result = activeSheetsList;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.department.toLowerCase().includes(q) ||
        s.purpose.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q)
      );
    }

    if (selectedCategory !== 'All') {
      const cat = selectedCategory.toLowerCase();
      result = result.filter(s => {
        const text = (s.name + ' ' + s.department).toLowerCase();
        if (cat === 'attendance') return text.includes('attendance') || text.includes('hr');
        if (cat === 'pms') return text.includes('pms') || text.includes('task');
        if (cat === 'finance') return text.includes('finance') || text.includes('account');
        if (cat === 'purchase') return text.includes('purchase') || text.includes('stock') || text.includes('procurement');
        if (cat === 'hr') return text.includes('hr') || text.includes('employee') || text.includes('team');
        if (cat === 'projects') return text.includes('project') || text.includes('engineering');
        if (cat === 'reports') return text.includes('report') || text.includes('mis');
        return text.includes(cat);
      });
    }

    return result;
  }, [activeSheetsList, searchQuery, selectedCategory]);

  // Handle Sheet CRUD
  const handleSheetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sheetName || !sheetUrl) {
      showToast('Name and URL are required', 'error');
      return;
    }

    const payload = {
      id: sheetIdInput.trim() || undefined,
      name: sheetName,
      url: sheetUrl,
      department: sheetDept,
      purpose: sheetPurpose,
      responsible_person: sheetResponsible,
      frequency: sheetFrequency,
      status: sheetStatus,
      notes: sheetNotes,
      assignedUsers: sheetAssigned
    };

    try {
      let url = '/api/system-master/sheets';
      let method = 'POST';

      if (editingSheetId) {
        url = `/api/system-master/sheets/${editingSheetId}`;
        method = 'PUT';
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (res.ok) {
        showToast(editingSheetId ? 'Sheet updated successfully' : 'Sheet added successfully', 'success');
        resetSheetForm();
        fetchData();
        setActiveTab('sheets');
      } else {
        showToast(data.message || 'Action failed', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Server error', 'error');
    }
  };

  const editSheet = (sheet: KBTSheet) => {
    setEditingSheetId(sheet.id);
    setSheetIdInput(sheet.id);
    setSheetName(sheet.name);
    setSheetUrl(sheet.url);
    setSheetDept(sheet.department);
    setSheetPurpose(sheet.purpose);
    setSheetResponsible(sheet.responsible_person);
    setSheetFrequency(sheet.frequency);
    setSheetStatus(sheet.status);
    setSheetNotes(sheet.notes || '');
    setSheetAssigned(sheet.assignedUsers || []);
    setActiveTab('add-sheet');
  };

  const deleteSheet = async (id: string) => {
    if (!window.confirm(`Are you sure you want to delete sheet ${id}?`)) return;

    try {
      const res = await fetch(`/api/system-master/sheets/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        showToast('Sheet deleted successfully', 'success');
        fetchData();
      } else {
        showToast(data.message || 'Failed to delete', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Server error', 'error');
    }
  };

  const resetSheetForm = () => {
    setEditingSheetId(null);
    setSheetIdInput('');
    setSheetName('');
    setSheetUrl('');
    setSheetDept('Other');
    setSheetPurpose('');
    setSheetResponsible('Admin');
    setSheetFrequency('Daily');
    setSheetStatus('Active');
    setSheetNotes('');
    setSheetAssigned([]);
  };

  // Single Sheet Assignment batch operations
  const selectedSheetForAssign = useMemo(() => {
    return activeSheetsList.find(s => s.id === assignSelectedSheetId);
  }, [activeSheetsList, assignSelectedSheetId]);

  const toggleUserAssignment = async (email: string) => {
    if (!selectedSheetForAssign) return;

    let updated = [...(selectedSheetForAssign.assignedUsers || [])];
    const emailLower = email.toLowerCase();
    const exists = updated.some(e => e.toLowerCase() === emailLower);
    if (exists) {
      updated = updated.filter(e => e.toLowerCase() !== emailLower);
    } else {
      updated.push(email);
    }

    try {
      const res = await fetch(`/api/system-master/sheets/${selectedSheetForAssign.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignedUsers: updated })
      });

      if (res.ok) {
        setSheets(prev => prev.map(s => s.id === selectedSheetForAssign.id ? { ...s, assignedUsers: updated } : s));
        showToast('Assignment updated', 'success');
      } else {
        showToast('Failed to update assignment', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Server error', 'error');
    }
  };

  // Effective users memo (Fallback to default system users if server users list is empty)
  const effectiveUsers = useMemo(() => {
    return systemUsers.length > 0 ? systemUsers : DEFAULT_SYSTEM_USERS;
  }, [systemUsers]);

  // Initialize selection defaults
  useEffect(() => {
    if (activeSheetsList.length > 0 && !assignSelectedSheetId) {
      setAssignSelectedSheetId(activeSheetsList[0].id);
    }
  }, [activeSheetsList, assignSelectedSheetId]);

  useEffect(() => {
    if (effectiveUsers.length > 0 && !assignSelectedUserId) {
      setAssignSelectedUserId(effectiveUsers[0].id);
    }
  }, [effectiveUsers, assignSelectedUserId]);

  const selectedUserForAssign = useMemo(() => {
    return effectiveUsers.find(u => u.id === assignSelectedUserId) || effectiveUsers[0];
  }, [effectiveUsers, assignSelectedUserId]);

  // Key permission matrix stats
  const totalAccessGrants = useMemo(() => {
    return activeSheetsList.reduce((acc, sheet) => acc + (sheet.assignedUsers?.length || 0), 0);
  }, [activeSheetsList]);

  const configuredSheetsCount = useMemo(() => {
    return activeSheetsList.filter(sheet => (sheet.assignedUsers?.length || 0) > 0).length;
  }, [activeSheetsList]);

  const unassignedSheetsCount = useMemo(() => {
    return activeSheetsList.filter(sheet => (!sheet.assignedUsers || sheet.assignedUsers.length === 0)).length;
  }, [activeSheetsList]);

  // Bulk action handlers
  const handleGrantAllUsersToSheet = async (sheetId: string) => {
    const targetSheet = activeSheetsList.find(s => s.id === sheetId);
    if (!targetSheet) return;
    const allEmails = effectiveUsers.map(u => u.email);
    try {
      const res = await fetch(`/api/system-master/sheets/${sheetId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignedUsers: allEmails })
      });
      if (res.ok) {
        setSheets(prev => prev.map(s => s.id === sheetId ? { ...s, assignedUsers: allEmails } : s));
        showToast(`Authorized all ${allEmails.length} team members`, 'success');
      } else {
        showToast('Failed to update sheet permissions', 'error');
      }
    } catch {
      showToast('Server error updating permissions', 'error');
    }
  };

  const handleClearAllUsersFromSheet = async (sheetId: string) => {
    try {
      const res = await fetch(`/api/system-master/sheets/${sheetId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignedUsers: [] })
      });
      if (res.ok) {
        setSheets(prev => prev.map(s => s.id === sheetId ? { ...s, assignedUsers: [] } : s));
        showToast('Cleared all permissions for this sheet', 'info');
      } else {
        showToast('Failed to clear permissions', 'error');
      }
    } catch {
      showToast('Server error', 'error');
    }
  };

  const handleGrantDepartmentToSheet = async (sheetId: string, departmentName: string) => {
    const targetSheet = activeSheetsList.find(s => s.id === sheetId);
    if (!targetSheet) return;
    const deptEmails = effectiveUsers.filter(u => (u.department || 'General') === departmentName).map(u => u.email);
    if (deptEmails.length === 0) {
      showToast(`No employees found in ${departmentName}`, 'warning');
      return;
    }
    const currentSet = new Set((targetSheet.assignedUsers || []).map(e => e.toLowerCase()));
    deptEmails.forEach(e => currentSet.add(e.toLowerCase()));
    const updatedUsers = Array.from(currentSet);

    try {
      const res = await fetch(`/api/system-master/sheets/${sheetId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignedUsers: updatedUsers })
      });
      if (res.ok) {
        setSheets(prev => prev.map(s => s.id === sheetId ? { ...s, assignedUsers: updatedUsers } : s));
        showToast(`Granted access to all ${departmentName} team members`, 'success');
      } else {
        showToast('Failed to update permissions', 'error');
      }
    } catch {
      showToast('Server error', 'error');
    }
  };

  const handleToggleSheetForUser = async (userEmail: string, sheetId: string) => {
    const targetSheet = activeSheetsList.find(s => s.id === sheetId);
    if (!targetSheet) return;
    let updatedUsers = [...(targetSheet.assignedUsers || [])];
    const emailLower = userEmail.toLowerCase();
    const isAssigned = updatedUsers.some(e => e.toLowerCase() === emailLower);
    if (isAssigned) {
      updatedUsers = updatedUsers.filter(e => e.toLowerCase() !== emailLower);
    } else {
      updatedUsers.push(userEmail);
    }

    try {
      const res = await fetch(`/api/system-master/sheets/${sheetId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignedUsers: updatedUsers })
      });
      if (res.ok) {
        setSheets(prev => prev.map(s => s.id === sheetId ? { ...s, assignedUsers: updatedUsers } : s));
        showToast(isAssigned ? `Access revoked for ${targetSheet.name}` : `Access granted for ${targetSheet.name}`, isAssigned ? 'info' : 'success');
      } else {
        showToast('Failed to update user access', 'error');
      }
    } catch {
      showToast('Server error', 'error');
    }
  };

  const handleGrantAllSheetsToUser = async (userEmail: string) => {
    try {
      const updatedSheets = activeSheetsList.map(sheet => {
        const currentUsers = sheet.assignedUsers || [];
        if (!currentUsers.some(e => e.toLowerCase() === userEmail.toLowerCase())) {
          return { ...sheet, assignedUsers: [...currentUsers, userEmail] };
        }
        return sheet;
      });

      for (const s of updatedSheets) {
        await fetch(`/api/system-master/sheets/${s.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assignedUsers: s.assignedUsers })
        });
      }

      setSheets(updatedSheets);
      showToast(`Granted access to all sheets for user`, 'success');
    } catch {
      showToast('Server error', 'error');
    }
  };

  const handleRevokeAllSheetsFromUser = async (userEmail: string) => {
    try {
      const updatedSheets = activeSheetsList.map(sheet => {
        const currentUsers = sheet.assignedUsers || [];
        const filteredUsers = currentUsers.filter(e => e.toLowerCase() !== userEmail.toLowerCase());
        return { ...sheet, assignedUsers: filteredUsers };
      });

      for (const s of updatedSheets) {
        await fetch(`/api/system-master/sheets/${s.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assignedUsers: s.assignedUsers })
        });
      }

      setSheets(updatedSheets);
      showToast(`Revoked all sheet access for user`, 'info');
    } catch {
      showToast('Server error', 'error');
    }
  };

  // List of category tabs
  const CATEGORY_TABS = [
    { id: 'All', label: 'All Sheets', icon: FileSpreadsheet },
    { id: 'Attendance', label: 'Attendance', icon: CalendarCheck },
    { id: 'PMS', label: 'PMS', icon: ClipboardList },
    { id: 'Finance', label: 'Finance', icon: DollarSign },
    { id: 'Purchase', label: 'Purchase & Stock', icon: ShoppingBag },
    { id: 'HR', label: 'HR', icon: Users },
    { id: 'Projects', label: 'Projects', icon: Building },
    { id: 'Reports', label: 'Reports', icon: BarChart3 }
  ];

  const visibleCards = showAllSheets ? filteredSheets : filteredSheets.slice(0, 8);

  return (
    <div className="min-h-screen bg-slate-50/60 font-sans text-slate-800 flex flex-col">
      {/* Global Top Bar */}
      <header className="bg-white border-b border-slate-200/80 px-6 py-3.5 flex items-center justify-between z-20 sticky top-0 backdrop-blur-md bg-white/90">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white shadow-md shadow-emerald-600/20 shrink-0">
            <FileSpreadsheet size={22} />
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-slate-900 leading-tight">Sheet Hub</h1>
            <p className="text-xs text-slate-400 font-medium">All Google Sheets in one place</p>
          </div>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-4">
          <div className="relative hidden md:block w-72">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search sheets..."
              className="w-full bg-slate-50 border border-slate-200/80 text-slate-800 pl-10 pr-12 py-2 text-xs rounded-xl outline-none focus:ring-2 focus:ring-emerald-500/30 focus:bg-white transition-all"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono font-bold text-slate-400 bg-white border border-slate-200 px-1.5 py-0.5 rounded shadow-2xs">⌘K</span>
          </div>

          <div className="flex items-center gap-2">
            <button className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors relative" title="Notifications">
              <Bell size={18} />
              <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-red-500 text-white rounded-full text-[9px] font-bold flex items-center justify-center border-2 border-white">12</span>
            </button>
            <button className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors" title="Help & Docs">
              <HelpCircle size={18} />
            </button>
          </div>

          {isActualAdmin && (
            <button
              onClick={() => setIsAdminPreviewMode(!isAdminPreviewMode)}
              className="flex items-center gap-2 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all border border-slate-200"
            >
              <Eye size={14} />
              <span className="hidden sm:inline">{isAdminPreviewMode ? 'View as Admin' : 'View as Employee'}</span>
            </button>
          )}
        </div>
      </header>

      {/* Module Level Navigation Bar for 3 Sections */}
      <div className="bg-white border-b border-slate-200 px-6 py-2.5 flex items-center justify-between sticky top-[65px] z-15 backdrop-blur-md bg-white/95 shadow-xs">
        <div className="flex items-center gap-2 overflow-x-auto py-0.5 custom-scrollbar">
          <button
            onClick={() => setActiveTab('sheets')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'sheets'
                ? 'bg-slate-900 text-white shadow-md'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <FileSpreadsheet size={15} />
            <span>1. Sheet Directory</span>
            <span className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold ${activeTab === 'sheets' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}`}>
              {activeSheetsList.length}
            </span>
          </button>

          {showAdminLayout && (
            <>
              <button
                onClick={() => { resetSheetForm(); setActiveTab('add-sheet'); }}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                  activeTab === 'add-sheet'
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <PlusCircle size={15} />
                <span>2. {editingSheetId ? 'Edit Google Sheet' : 'Connect New Sheet'}</span>
              </button>

              <button
                onClick={() => setActiveTab('assign')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                  activeTab === 'assign'
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Shield size={15} className={activeTab === 'assign' ? 'text-amber-300' : 'text-blue-600'} />
                <span>3. Assign Sheet Permissions</span>
                <span className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold ${activeTab === 'assign' ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-700'}`}>
                  {totalAccessGrants}
                </span>
              </button>
            </>
          )}
        </div>

        {showAdminLayout && activeTab === 'sheets' && (
          <button
            onClick={() => setActiveTab('assign')}
            className="px-3.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0"
          >
            <Shield size={14} />
            <span>Manage Permissions</span>
          </button>
        )}
      </div>

      {/* Main Page Area */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">

        {/* 1. Top 4 Stats Overview Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
          {/* Card 1: Total Sheets */}
          <div className="bg-white border border-slate-200/70 rounded-2xl p-5 shadow-2xs hover:shadow-md transition-all flex items-center gap-4 group">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100 group-hover:scale-105 transition-transform">
              <FileSpreadsheet size={22} />
            </div>
            <div>
              <p className="text-xs text-slate-500 font-bold">Total Sheets</p>
              <h3 className="text-2xl font-black text-slate-900 leading-tight mt-0.5">{activeSheetsList.length}</h3>
              <p className="text-[11px] text-slate-400 font-medium">All connected sheets</p>
            </div>
          </div>

          {/* Card 2: Shared With Me */}
          <div className="bg-white border border-slate-200/70 rounded-2xl p-5 shadow-2xs hover:shadow-md transition-all flex items-center gap-4 group">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 border border-blue-100 group-hover:scale-105 transition-transform">
              <Users size={22} />
            </div>
            <div>
              <p className="text-xs text-slate-500 font-bold">Shared With Me</p>
              <h3 className="text-2xl font-black text-slate-900 leading-tight mt-0.5">8</h3>
              <p className="text-[11px] text-slate-400 font-medium">Sheets shared</p>
            </div>
          </div>

          {/* Card 3: Recently Opened */}
          <div className="bg-white border border-slate-200/70 rounded-2xl p-5 shadow-2xs hover:shadow-md transition-all flex items-center gap-4 group">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 border border-amber-100 group-hover:scale-105 transition-transform">
              <Clock size={22} />
            </div>
            <div>
              <p className="text-xs text-slate-500 font-bold">Recently Opened</p>
              <h3 className="text-2xl font-black text-slate-900 leading-tight mt-0.5">{recentOpened.length || 6}</h3>
              <p className="text-[11px] text-slate-400 font-medium">In last 7 days</p>
            </div>
          </div>

          {/* Card 4: Important */}
          <div className="bg-white border border-slate-200/70 rounded-2xl p-5 shadow-2xs hover:shadow-md transition-all flex items-center gap-4 group">
            <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0 border border-purple-100 group-hover:scale-105 transition-transform">
              <Star size={22} className="fill-purple-100" />
            </div>
            <div>
              <p className="text-xs text-slate-500 font-bold">Important</p>
              <h3 className="text-2xl font-black text-slate-900 leading-tight mt-0.5">{starredIds.size}</h3>
              <p className="text-[11px] text-slate-400 font-medium">Marked as important</p>
            </div>
          </div>
        </div>

        {/* 2. Category Filter Pills Row */}
        <div className="bg-white/80 border border-slate-200/80 p-2 rounded-2xl backdrop-blur-sm flex items-center justify-between gap-3 overflow-x-auto hide-scrollbar">
          <div className="flex items-center gap-1.5 overflow-x-auto hide-scrollbar py-0.5">
            {CATEGORY_TABS.map(({ id, label, icon: TabIcon }) => {
              const isActive = selectedCategory === id;
              return (
                <button
                  key={id}
                  onClick={() => setSelectedCategory(id)}
                  className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-2 ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <TabIcon size={14} className={isActive ? 'text-white' : 'text-slate-400'} />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>

          {showAdminLayout && (
            <button
              onClick={() => { resetSheetForm(); setActiveTab('add-sheet'); }}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-md shadow-emerald-600/20 shrink-0 ml-2"
            >
              <Plus size={15} />
              <span>Connect New Sheet</span>
            </button>
          )}
        </div>

        {/* ADMIN TAB NAVIGATION (Add / Assign) */}
        {showAdminLayout && activeTab !== 'sheets' && (
          <div className="bg-white border border-slate-200/80 p-4 rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setActiveTab('sheets')}
                className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-colors text-xs font-bold flex items-center gap-1"
              >
                <ArrowRight size={14} className="rotate-180" /> Back to Sheets
              </button>
              <h2 className="text-sm font-bold text-slate-800">
                {activeTab === 'add-sheet' ? (editingSheetId ? 'Edit Google Sheet' : 'Connect New Google Sheet') : 'Assign Sheets to Team'}
              </h2>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { resetSheetForm(); setActiveTab('add-sheet'); }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border ${activeTab === 'add-sheet' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-white border-slate-200 text-slate-600'}`}
              >
                Form
              </button>
              <button
                onClick={() => setActiveTab('assign')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border ${activeTab === 'assign' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-white border-slate-200 text-slate-600'}`}
              >
                Assign Permissions
              </button>
            </div>
          </div>
        )}

        {/* 3. ADMIN ADD/EDIT FORM */}
        {showAdminLayout && activeTab === 'add-sheet' && (
          <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm max-w-3xl mx-auto space-y-6">
            <h3 className="text-lg font-extrabold text-slate-900">{editingSheetId ? 'Edit Google Sheet Registry' : 'Connect New Google Sheet'}</h3>
            <form onSubmit={handleSheetSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Sheet Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Attendance Sheet"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                    value={sheetName}
                    onChange={e => setSheetName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Department / Category</label>
                  <select
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white font-medium"
                    value={sheetDept}
                    onChange={e => setSheetDept(e.target.value)}
                  >
                    <option value="HR & Attendance">HR & Attendance</option>
                    <option value="PMS">PMS</option>
                    <option value="Finance & Accounts">Finance & Accounts</option>
                    <option value="Procurement">Procurement & Stock</option>
                    <option value="Operations">Operations</option>
                    <option value="Engineering">Engineering & Projects</option>
                    <option value="Management">Management & Reports</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Google Sheet URL *</label>
                <input
                  type="url"
                  required
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white font-mono"
                  value={sheetUrl}
                  onChange={e => setSheetUrl(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Purpose / Description</label>
                <textarea
                  rows={2}
                  placeholder="Monthly attendance records of all employees..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                  value={sheetPurpose}
                  onChange={e => setSheetPurpose(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Responsible Person</label>
                  <input
                    type="text"
                    placeholder="HR Admin"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                    value={sheetResponsible}
                    onChange={e => setSheetResponsible(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Update Frequency</label>
                  <select
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white font-medium"
                    value={sheetFrequency}
                    onChange={e => setSheetFrequency(e.target.value)}
                  >
                    <option value="Daily">Daily</option>
                    <option value="Weekly">Weekly</option>
                    <option value="Monthly">Monthly</option>
                    <option value="On-Demand">On-Demand</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => { resetSheetForm(); setActiveTab('sheets'); }}
                  className="px-5 py-2.5 text-slate-600 font-bold hover:bg-slate-100 rounded-xl text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow-md shadow-emerald-600/20"
                >
                  {editingSheetId ? 'Update Sheet' : 'Save & Register Sheet'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* 4. SHEET GRID CARDS (Matching Image Exactly) */}
        {activeTab === 'sheets' && (
          <>
            {filteredSheets.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center max-w-xl mx-auto space-y-4 shadow-2xs">
                <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center mx-auto text-slate-400">
                  <FileSpreadsheet size={24} />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-800">No Sheets Found</h3>
                  <p className="text-xs text-slate-500 mt-1">Try clearing your search query or selecting another department category.</p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                {visibleCards.map(s => {
                  const cat = getCategoryDetails(s);
                  const Icon = cat.icon;
                  const isStarred = starredIds.has(s.id);

                  return (
                    <div
                      key={s.id}
                      className="bg-white border border-slate-200/80 hover:border-slate-300 hover:shadow-lg rounded-2xl p-5 flex flex-col justify-between transition-all duration-300 relative group overflow-hidden"
                    >
                      <div>
                        {/* Top Icon & Star Header */}
                        <div className="flex items-center justify-between mb-4">
                          <div className={`w-11 h-11 rounded-2xl ${cat.bg} flex items-center justify-center shadow-md shadow-slate-200/60`}>
                            <Icon size={20} className="text-white" />
                          </div>

                          <button
                            onClick={e => toggleStar(s.id, e)}
                            className="p-1.5 hover:bg-slate-100 rounded-xl text-slate-300 hover:text-amber-400 transition-colors"
                            title={isStarred ? 'Unmark important' : 'Mark as important'}
                          >
                            <Star size={18} className={isStarred ? 'fill-amber-400 text-amber-400' : ''} />
                          </button>
                        </div>

                        {/* Title & Description */}
                        <h3 className="text-base font-extrabold text-slate-900 group-hover:text-blue-600 transition-colors line-clamp-1 leading-snug">
                          {s.name}
                        </h3>
                        <p className="text-xs text-slate-500 mt-1.5 font-medium line-clamp-2 min-h-[32px] leading-relaxed">
                          {s.purpose || 'Monthly records and connected workflow details.'}
                        </p>
                      </div>

                      {/* Bottom Details & Open Action */}
                      <div className="mt-5 pt-4 border-t border-slate-100 space-y-3.5">
                        <div className="flex items-center justify-between text-[11px] font-bold text-slate-400">
                          <div className="flex items-center gap-1.5 text-slate-500">
                            <Users size={13} className="text-slate-400" />
                            <span>{s.assignedUsers?.length || 12}</span>
                          </div>
                          <span>Updated {s.frequency === 'Daily' ? '2h ago' : '1d ago'}</span>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={e => handleOpenSheet(s, e)}
                            className="flex-1 py-2.5 bg-blue-50 hover:bg-blue-600 text-blue-600 hover:text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-2xs active:scale-98"
                          >
                            <span>Open</span>
                            <ExternalLink size={13} />
                          </button>

                          {showAdminLayout && (
                            <div className="relative">
                              <button
                                onClick={() => setOpenMenuSheetId(openMenuSheetId === s.id ? null : s.id)}
                                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
                              >
                                <MoreVertical size={16} />
                              </button>

                              {openMenuSheetId === s.id && (
                                <div className="absolute right-0 bottom-full mb-1 w-36 bg-white border border-slate-200 rounded-2xl shadow-xl z-30 p-1.5 space-y-1">
                                  <button
                                    onClick={() => { setOpenMenuSheetId(null); editSheet(s); }}
                                    className="w-full text-left px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 rounded-xl flex items-center gap-2"
                                  >
                                    <Edit2 size={13} /> Edit
                                  </button>
                                  <button
                                    onClick={() => { setOpenMenuSheetId(null); deleteSheet(s.id); }}
                                    className="w-full text-left px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 rounded-xl flex items-center gap-2"
                                  >
                                    <Trash2 size={13} /> Delete
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Show More Sheets Button */}
            {filteredSheets.length > 8 && (
              <div className="flex justify-center pt-2">
                <button
                  onClick={() => setShowAllSheets(!showAllSheets)}
                  className="px-6 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-blue-600 rounded-2xl text-xs font-extrabold transition-all flex items-center gap-2 shadow-2xs"
                >
                  <span>{showAllSheets ? 'Show Less Sheets' : 'Show More Sheets'}</span>
                  <ChevronDown size={16} className={`transition-transform ${showAllSheets ? 'rotate-180' : ''}`} />
                </button>
              </div>
            )}
          </>
        )}

        {/* 5. BOTTOM 3-COLUMN SECTION (Image Matched) */}
        {activeTab === 'sheets' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-4">
            {/* Column 1: Recently Opened */}
            <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-2xs space-y-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 text-slate-800 font-extrabold text-sm mb-4">
                  <Clock size={16} className="text-blue-600" />
                  <span>Recently Opened</span>
                </div>

                <div className="space-y-3">
                  {recentOpened.slice(0, 3).map((r, idx) => {
                    const sheet = activeSheetsList.find(s => s.id === r.id) || activeSheetsList[idx % activeSheetsList.length];
                    const isStarred = starredIds.has(sheet.id);

                    return (
                      <div
                        key={sheet.id + idx}
                        onClick={e => handleOpenSheet(sheet, e)}
                        className="flex items-center justify-between p-3 hover:bg-slate-50 rounded-2xl transition-colors cursor-pointer group"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100">
                            <FileSpreadsheet size={18} />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-extrabold text-slate-800 group-hover:text-blue-600 transition-colors truncate">
                              {sheet.name}
                            </p>
                            <p className="text-[10px] text-slate-400 font-medium mt-0.5">{r.openedAt || 'Opened 2 hours ago'}</p>
                          </div>
                        </div>

                        <button
                          onClick={e => toggleStar(sheet.id, e)}
                          className="p-1 text-slate-300 hover:text-amber-400 shrink-0 ml-2"
                        >
                          <Star size={16} className={isStarred ? 'fill-amber-400 text-amber-400' : ''} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100">
                <button
                  onClick={() => setSelectedCategory('All')}
                  className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center justify-center gap-1.5 w-full py-1"
                >
                  <span>View All</span>
                  <ArrowRight size={14} />
                </button>
              </div>
            </div>

            {/* Column 2: Important Sheets */}
            <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-2xs space-y-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 text-slate-800 font-extrabold text-sm mb-4">
                  <Star size={16} className="text-purple-600 fill-purple-100" />
                  <span>Important Sheets</span>
                </div>

                <div className="space-y-3">
                  {Array.from(starredIds).slice(0, 3).map(id => {
                    const sheet = activeSheetsList.find(s => s.id === id) || activeSheetsList[0];

                    return (
                      <div
                        key={sheet.id}
                        onClick={e => handleOpenSheet(sheet, e)}
                        className="flex items-center justify-between p-3 hover:bg-slate-50 rounded-2xl transition-colors cursor-pointer group"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100">
                            <FileSpreadsheet size={18} />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-extrabold text-slate-800 group-hover:text-blue-600 transition-colors truncate">
                              {sheet.name}
                            </p>
                            <p className="text-[10px] text-slate-400 font-medium mt-0.5">Marked as important</p>
                          </div>
                        </div>

                        <Star size={16} className="fill-amber-400 text-amber-400 shrink-0 ml-2" />
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100">
                <button
                  onClick={() => setSelectedCategory('All')}
                  className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center justify-center gap-1.5 w-full py-1"
                >
                  <span>View All</span>
                  <ArrowRight size={14} />
                </button>
              </div>
            </div>

            {/* Column 3: Connect Card Banner */}
            <div className="bg-gradient-to-br from-emerald-500/10 via-teal-500/10 to-emerald-600/5 border border-emerald-200/80 rounded-3xl p-6 relative overflow-hidden flex flex-col justify-between">
              <div className="space-y-3 relative z-10">
                <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-lg shadow-emerald-600/20">
                  <FileSpreadsheet size={24} />
                </div>

                <h3 className="text-lg font-black text-slate-900 leading-tight">All your important Sheets in one place</h3>
                <p className="text-xs text-slate-600 font-medium leading-relaxed">
                  Quick access, organized by department & up to date with real-time permissions.
                </p>
              </div>

              {showAdminLayout && (
                <div className="pt-6 relative z-10">
                  <button
                    onClick={() => { resetSheetForm(); setActiveTab('add-sheet'); }}
                    className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-600/20 active:scale-98"
                  >
                    <Plus size={16} />
                    <span>Connect New Sheet</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 6. ADMIN ASSIGN SHEETS VIEW (3RD SECTION - REDESIGNED PROFESSIONAL MATRIX) */}
        {showAdminLayout && activeTab === 'assign' && (
          <div className="space-y-6 max-w-7xl mx-auto pb-10">
            {/* Enterprise Hero Banner */}
            <div className="relative overflow-hidden bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-6 sm:p-8 shadow-xl border border-slate-800">
              <div className="absolute right-0 top-0 translate-x-12 -translate-y-12 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
              <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="space-y-2">
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 backdrop-blur-md rounded-full text-[11px] font-bold text-blue-300 border border-white/10">
                    <Shield size={13} className="text-emerald-400" />
                    <span>SECTION 3 — PERMISSION MATRIX</span>
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
                    Assign Sheet Permissions & Access
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-300 max-w-2xl font-medium leading-relaxed">
                    Manage team access scopes, authorize Google Sheet distribution, and configure department permissions.
                  </p>
                </div>

                {/* Mode Switcher Toggle */}
                <div className="bg-slate-800/90 p-1.5 rounded-2xl border border-white/10 backdrop-blur-md flex items-center gap-1 shrink-0 self-start md:self-auto shadow-inner">
                  <button
                    onClick={() => setAssignMode('by-sheet')}
                    className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                      assignMode === 'by-sheet'
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                        : 'text-slate-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <FileSpreadsheet size={15} />
                    <span>By Sheet</span>
                  </button>

                  <button
                    onClick={() => setAssignMode('by-user')}
                    className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                      assignMode === 'by-user'
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                        : 'text-slate-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <Users size={15} />
                    <span>By Employee</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Top 4 KPI Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 border border-blue-100 font-bold">
                  <FileSpreadsheet size={20} />
                </div>
                <div>
                  <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Total Sheets</p>
                  <p className="text-xl font-black text-slate-900">{activeSheetsList.length}</p>
                </div>
              </div>

              <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100 font-bold">
                  <UserCheck size={20} />
                </div>
                <div>
                  <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Total Active Grants</p>
                  <p className="text-xl font-black text-slate-900">{totalAccessGrants}</p>
                </div>
              </div>

              <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 border border-indigo-100 font-bold">
                  <CheckSquare size={20} />
                </div>
                <div>
                  <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Configured Sheets</p>
                  <p className="text-xl font-black text-slate-900">{configuredSheetsCount}</p>
                </div>
              </div>

              <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs flex items-center gap-3.5">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 font-bold border ${unassignedSheetsCount > 0 ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-slate-50 text-slate-400 border-slate-200'}`}>
                  <Info size={20} />
                </div>
                <div>
                  <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Unassigned Sheets</p>
                  <p className={`text-xl font-black ${unassignedSheetsCount > 0 ? 'text-amber-600' : 'text-slate-900'}`}>{unassignedSheetsCount}</p>
                </div>
              </div>
            </div>

            {/* WORKSPACE AREA */}
            {assignMode === 'by-sheet' ? (
              /* MODE A: BY SHEET */
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Left Pane - Select Sheet (4 cols) */}
                <div className="lg:col-span-4 bg-white border border-slate-200/90 rounded-3xl p-5 shadow-xs space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                      <FileSpreadsheet size={15} className="text-blue-600" />
                      1. Select Sheet
                    </h3>
                    <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                      {activeSheetsList.length} total
                    </span>
                  </div>

                  <div className="relative">
                    <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Filter sheets..."
                      className="w-full bg-slate-50 border border-slate-200 text-slate-800 pl-9 pr-3 py-2 text-xs rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                      value={assignSheetSearch}
                      onChange={e => setAssignSheetSearch(e.target.value)}
                    />
                    {assignSheetSearch && (
                      <button onClick={() => setAssignSheetSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs">
                        <X size={13} />
                      </button>
                    )}
                  </div>

                  <div className="space-y-2.5 max-h-[520px] overflow-y-auto pr-1 custom-scrollbar">
                    {activeSheetsList
                      .filter(s =>
                        s.name.toLowerCase().includes(assignSheetSearch.toLowerCase()) ||
                        s.department.toLowerCase().includes(assignSheetSearch.toLowerCase()) ||
                        s.id.toLowerCase().includes(assignSheetSearch.toLowerCase())
                      )
                      .map(s => {
                        const isSelected = assignSelectedSheetId === s.id;
                        const assignedCount = s.assignedUsers?.length || 0;
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => setAssignSelectedSheetId(s.id)}
                            className={`w-full text-left p-3.5 rounded-2xl border transition-all relative overflow-hidden group ${
                              isSelected
                                ? 'bg-gradient-to-r from-blue-50 to-indigo-50/80 border-blue-400 text-blue-900 shadow-sm font-bold'
                                : 'bg-white border-slate-200/80 hover:border-slate-300 text-slate-700 hover:bg-slate-50 font-medium'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-xs font-black truncate max-w-[170px]">{s.name}</span>
                              <span className="font-mono text-[10px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{s.id}</span>
                            </div>
                            <div className="flex items-center justify-between text-[10px] text-slate-500">
                              <span className="truncate max-w-[130px] font-medium">{s.department}</span>
                              <span className={`px-2 py-0.5 rounded-full font-bold ${assignedCount > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                {assignedCount} {assignedCount === 1 ? 'user' : 'users'}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                  </div>
                </div>

                {/* Right Pane - Assign Team Accounts (8 cols) */}
                <div className="lg:col-span-8 bg-white border border-slate-200/90 rounded-3xl p-6 shadow-xs space-y-6">
                  {selectedSheetForAssign ? (
                    <>
                      {/* Selected Sheet Info Header */}
                      <div className="bg-slate-50/80 border border-slate-200/70 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 bg-blue-600 text-white rounded-md text-[10px] font-bold font-mono">
                              {selectedSheetForAssign.id}
                            </span>
                            <h3 className="text-base font-black text-slate-900">{selectedSheetForAssign.name}</h3>
                            <span className="px-2 py-0.5 bg-slate-200 text-slate-700 rounded-md text-[10px] font-bold">
                              {selectedSheetForAssign.department}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 font-medium leading-relaxed">
                            {selectedSheetForAssign.purpose || 'Google Sheet permission control and assignment.'}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => handleGrantAllUsersToSheet(selectedSheetForAssign.id)}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1"
                            title="Authorize all employees"
                          >
                            <UserCheck size={14} />
                            <span>Grant All</span>
                          </button>
                          <button
                            onClick={() => handleClearAllUsersFromSheet(selectedSheetForAssign.id)}
                            className="px-3 py-1.5 bg-slate-200 hover:bg-red-50 hover:text-red-600 text-slate-600 rounded-xl text-xs font-bold transition-all flex items-center gap-1"
                            title="Clear all assignments"
                          >
                            <UserX size={14} />
                            <span>Clear</span>
                          </button>
                        </div>
                      </div>

                      {/* Department Quick Grant Buttons */}
                      <div className="space-y-2">
                        <p className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">Quick Grant by Department:</p>
                        <div className="flex flex-wrap gap-1.5">
                          {['HR & Attendance', 'PMS', 'Finance & Accounts', 'Procurement', 'Operations', 'Engineering'].map(dept => (
                            <button
                              key={dept}
                              type="button"
                              onClick={() => handleGrantDepartmentToSheet(selectedSheetForAssign.id, dept)}
                              className="px-2.5 py-1 bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-600 rounded-lg text-[11px] font-bold border border-slate-200 transition-all flex items-center gap-1"
                            >
                              <Plus size={11} /> {dept}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Employee Search & Filter Bar */}
                      <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
                        <div className="relative flex-1 w-full">
                          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input
                            type="text"
                            placeholder="Search employee by name, email or department..."
                            className="w-full bg-slate-50 border border-slate-200 text-slate-800 pl-9 pr-3 py-2 text-xs rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                            value={assignUserSearch}
                            onChange={e => setAssignUserSearch(e.target.value)}
                          />
                          {assignUserSearch && (
                            <button onClick={() => setAssignUserSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs">
                              <X size={13} />
                            </button>
                          )}
                        </div>

                        <select
                          className="bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                          value={assignDeptFilter}
                          onChange={e => setAssignDeptFilter(e.target.value)}
                        >
                          <option value="All">All Departments</option>
                          <option value="HR & Attendance">HR & Attendance</option>
                          <option value="PMS">PMS</option>
                          <option value="Finance & Accounts">Finance & Accounts</option>
                          <option value="Procurement">Procurement</option>
                          <option value="Operations">Operations</option>
                          <option value="Engineering">Engineering</option>
                          <option value="Management">Management</option>
                        </select>
                      </div>

                      {/* Employee Cards Permission Matrix Grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 max-h-[420px] overflow-y-auto pr-1 custom-scrollbar">
                        {effectiveUsers
                          .filter(u => {
                            const matchSearch = u.name.toLowerCase().includes(assignUserSearch.toLowerCase()) ||
                              u.email.toLowerCase().includes(assignUserSearch.toLowerCase()) ||
                              (u.department || '').toLowerCase().includes(assignUserSearch.toLowerCase());
                            const matchDept = assignDeptFilter === 'All' || (u.department || 'General') === assignDeptFilter;
                            return matchSearch && matchDept;
                          })
                          .map(user => {
                            const isAssigned = (selectedSheetForAssign.assignedUsers || []).some(
                              email => email.toLowerCase() === user.email.toLowerCase()
                            );

                            return (
                              <div
                                key={user.id || user.email}
                                onClick={() => toggleUserAssignment(user.email)}
                                className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between group ${
                                  isAssigned
                                    ? 'bg-emerald-50/60 border-emerald-300 text-emerald-950 shadow-2xs'
                                    : 'bg-white border-slate-200/80 hover:border-slate-300 text-slate-700 hover:bg-slate-50'
                                }`}
                              >
                                <div className="flex items-center gap-3 min-w-0 pr-2">
                                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold shrink-0 text-xs shadow-xs ${
                                    isAssigned ? 'bg-emerald-600' : 'bg-slate-700'
                                  }`}>
                                    {user.name.slice(0, 2).toUpperCase()}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-xs font-black truncate">{user.name}</p>
                                    <p className="text-[10px] text-slate-400 truncate mt-0.5 font-medium">{user.email}</p>
                                    <div className="flex items-center gap-1.5 mt-1">
                                      <span className="text-[9px] font-bold text-slate-500 bg-slate-100 border border-slate-200 px-1.5 py-0.2 rounded">
                                        {user.department || 'General'}
                                      </span>
                                      <span className="text-[9px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.2 rounded">
                                        {user.role}
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                <div className={`w-7 h-7 rounded-xl border flex items-center justify-center shrink-0 transition-all ${
                                  isAssigned
                                    ? 'bg-emerald-600 border-emerald-600 text-white shadow-xs scale-105'
                                    : 'border-slate-300 bg-slate-100 text-slate-400 group-hover:border-slate-400'
                                }`}>
                                  {isAssigned ? <Check size={14} className="stroke-[3]" /> : <Lock size={12} />}
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-16 space-y-3">
                      <FileSpreadsheet size={36} className="text-slate-300 mx-auto" />
                      <p className="text-sm font-bold text-slate-600">No Sheet Selected</p>
                      <p className="text-xs text-slate-400">Select a Google Sheet from the left panel to manage permissions.</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* MODE B: BY EMPLOYEE */
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Left Pane - Select Employee (4 cols) */}
                <div className="lg:col-span-4 bg-white border border-slate-200/90 rounded-3xl p-5 shadow-xs space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                      <Users size={15} className="text-blue-600" />
                      1. Select Employee
                    </h3>
                    <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                      {effectiveUsers.length} total
                    </span>
                  </div>

                  <div className="relative">
                    <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Filter team members..."
                      className="w-full bg-slate-50 border border-slate-200 text-slate-800 pl-9 pr-3 py-2 text-xs rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                      value={assignUserSearch}
                      onChange={e => setAssignUserSearch(e.target.value)}
                    />
                    {assignUserSearch && (
                      <button onClick={() => setAssignUserSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs">
                        <X size={13} />
                      </button>
                    )}
                  </div>

                  <div className="space-y-2.5 max-h-[520px] overflow-y-auto pr-1 custom-scrollbar">
                    {effectiveUsers
                      .filter(u =>
                        u.name.toLowerCase().includes(assignUserSearch.toLowerCase()) ||
                        u.email.toLowerCase().includes(assignUserSearch.toLowerCase()) ||
                        (u.department || '').toLowerCase().includes(assignUserSearch.toLowerCase())
                      )
                      .map(u => {
                        const isSelected = assignSelectedUserId === u.id;
                        const assignedSheetCount = activeSheetsList.filter(s =>
                          (s.assignedUsers || []).some(email => email.toLowerCase() === u.email.toLowerCase())
                        ).length;

                        return (
                          <button
                            key={u.id || u.email}
                            type="button"
                            onClick={() => setAssignSelectedUserId(u.id)}
                            className={`w-full text-left p-3.5 rounded-2xl border transition-all flex items-center justify-between group ${
                              isSelected
                                ? 'bg-gradient-to-r from-blue-50 to-indigo-50/80 border-blue-400 text-blue-900 shadow-sm font-bold'
                                : 'bg-white border-slate-200/80 hover:border-slate-300 text-slate-700 hover:bg-slate-50 font-medium'
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold shrink-0 text-xs ${
                                isSelected ? 'bg-blue-600' : 'bg-slate-700'
                              }`}>
                                {u.name.slice(0, 2).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-black truncate">{u.name}</p>
                                <p className="text-[10px] text-slate-400 truncate font-medium">{u.department || 'General'}</p>
                              </div>
                            </div>

                            <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] shrink-0 ${
                              assignedSheetCount > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                            }`}>
                              {assignedSheetCount} {assignedSheetCount === 1 ? 'sheet' : 'sheets'}
                            </span>
                          </button>
                        );
                      })}
                  </div>
                </div>

                {/* Right Pane - Sheet Access Control per Employee (8 cols) */}
                <div className="lg:col-span-8 bg-white border border-slate-200/90 rounded-3xl p-6 shadow-xs space-y-6">
                  {selectedUserForAssign ? (
                    <>
                      {/* Selected User Header */}
                      <div className="bg-slate-50/80 border border-slate-200/70 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-3.5">
                          <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-black text-sm shadow-md">
                            {selectedUserForAssign.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-base font-black text-slate-900">{selectedUserForAssign.name}</h3>
                              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-md text-[10px] font-bold">
                                {selectedUserForAssign.role}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 font-medium">{selectedUserForAssign.email} • {selectedUserForAssign.department || 'General'}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => handleGrantAllSheetsToUser(selectedUserForAssign.email)}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1"
                          >
                            <CheckSquare size={14} />
                            <span>Grant All Sheets</span>
                          </button>
                          <button
                            onClick={() => handleRevokeAllSheetsFromUser(selectedUserForAssign.email)}
                            className="px-3 py-1.5 bg-slate-200 hover:bg-red-50 hover:text-red-600 text-slate-600 rounded-xl text-xs font-bold transition-all flex items-center gap-1"
                          >
                            <UserX size={14} />
                            <span>Revoke All</span>
                          </button>
                        </div>
                      </div>

                      {/* Filter Search */}
                      <div className="relative">
                        <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          placeholder="Filter sheets by title or category..."
                          className="w-full bg-slate-50 border border-slate-200 text-slate-800 pl-9 pr-3 py-2 text-xs rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                          value={assignSheetSearch}
                          onChange={e => setAssignSheetSearch(e.target.value)}
                        />
                        {assignSheetSearch && (
                          <button onClick={() => setAssignSheetSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs">
                            <X size={13} />
                          </button>
                        )}
                      </div>

                      {/* Sheet Cards Grid for Selected Employee */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 max-h-[460px] overflow-y-auto pr-1 custom-scrollbar">
                        {activeSheetsList
                          .filter(s =>
                            s.name.toLowerCase().includes(assignSheetSearch.toLowerCase()) ||
                            s.department.toLowerCase().includes(assignSheetSearch.toLowerCase())
                          )
                          .map(sheet => {
                            const isAssigned = (sheet.assignedUsers || []).some(
                              email => email.toLowerCase() === selectedUserForAssign.email.toLowerCase()
                            );
                            const cat = getCategoryDetails(sheet);
                            const CategoryIcon = cat.icon;

                            return (
                              <div
                                key={sheet.id}
                                onClick={() => handleToggleSheetForUser(selectedUserForAssign.email, sheet.id)}
                                className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between group ${
                                  isAssigned
                                    ? 'bg-emerald-50/60 border-emerald-300 text-emerald-950 shadow-2xs'
                                    : 'bg-white border-slate-200/80 hover:border-slate-300 text-slate-700 hover:bg-slate-50'
                                }`}
                              >
                                <div className="flex items-center gap-3 min-w-0 pr-2">
                                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 shadow-xs ${cat.bg}`}>
                                    <CategoryIcon size={18} />
                                  </div>
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <p className="text-xs font-black truncate">{sheet.name}</p>
                                      <span className="font-mono text-[9px] font-bold text-slate-400 bg-slate-100 px-1 rounded">{sheet.id}</span>
                                    </div>
                                    <p className="text-[10px] text-slate-400 truncate mt-0.5 font-medium">{sheet.purpose || sheet.department}</p>
                                  </div>
                                </div>

                                <div className={`w-7 h-7 rounded-xl border flex items-center justify-center shrink-0 transition-all ${
                                  isAssigned
                                    ? 'bg-emerald-600 border-emerald-600 text-white shadow-xs scale-105'
                                    : 'border-slate-300 bg-slate-100 text-slate-400 group-hover:border-slate-400'
                                }`}>
                                  {isAssigned ? <Check size={14} className="stroke-[3]" /> : <Lock size={12} />}
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-16 space-y-3">
                      <Users size={36} className="text-slate-300 mx-auto" />
                      <p className="text-sm font-bold text-slate-600">No Employee Selected</p>
                      <p className="text-xs text-slate-400">Select an employee from the left panel to configure sheet access.</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
};

export default SystemMaster;
