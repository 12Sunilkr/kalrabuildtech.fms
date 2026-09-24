import React, { useState, useEffect, useMemo } from 'react';
import {
  FileSpreadsheet,
  Search,
  Plus,
  ExternalLink,
  Edit2,
  Trash2,
  Users,
  Check,
  UserCheck,
  Shield,
  Star,
  Clock,
  ShoppingBag,
  BarChart3,
  Building,
  DollarSign,
  CalendarCheck,
  ClipboardList,
  MoreVertical,
  X,
  Lock,
  UserX,
  Copy,
  Grid,
  List,
  RefreshCw,
  Sparkles,
  SlidersHorizontal,
  FolderPlus,
  FolderKanban,
  ArrowRight,
  MoveRight,
  ChevronRight,
  Layers
} from 'lucide-react';
import { ViewMode, User, KBTSheet } from '../types';

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
    purpose: 'Monthly attendance records and employee daily logs',
    url: 'https://docs.google.com/spreadsheets/d/1',
    responsible_person: 'HR Team',
    frequency: 'Daily',
    status: 'Active',
    assignedUsers: [],
    created_at: new Date().toISOString()
  },
  {
    id: 'KBT-002',
    name: 'PMS Master Sheet',
    department: 'PMS',
    purpose: 'Project Management System, milestones and weekly tracker',
    url: 'https://docs.google.com/spreadsheets/d/2',
    responsible_person: 'Project Lead',
    frequency: 'Weekly',
    status: 'Active',
    assignedUsers: [],
    created_at: new Date().toISOString()
  },
  {
    id: 'KBT-003',
    name: 'Finance & Accounts Ledger',
    department: 'Finance & Accounts',
    purpose: 'Income, expense, vouchers, balance and bank reconciliations',
    url: 'https://docs.google.com/spreadsheets/d/3',
    responsible_person: 'Finance Admin',
    frequency: 'Daily',
    status: 'Active',
    assignedUsers: [],
    created_at: new Date().toISOString()
  },
  {
    id: 'KBT-004',
    name: 'Purchase & Stock Register',
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
    name: 'Employee Master Database',
    department: 'HR & Attendance',
    purpose: 'Employee details, verification records and department directory',
    url: 'https://docs.google.com/spreadsheets/d/5',
    responsible_person: 'HR Admin',
    frequency: 'On-Demand',
    status: 'Active',
    assignedUsers: [],
    created_at: new Date().toISOString()
  },
  {
    id: 'KBT-006',
    name: 'Operations Task Tracker',
    department: 'Operations',
    purpose: 'Daily operational tasks, checklist items and site progress',
    url: 'https://docs.google.com/spreadsheets/d/6',
    responsible_person: 'Operations Team',
    frequency: 'Daily',
    status: 'Active',
    assignedUsers: [],
    created_at: new Date().toISOString()
  },
  {
    id: 'KBT-007',
    name: 'Site Engineering Projects',
    department: 'Engineering',
    purpose: 'Engineering drawings, project status reports and site measurements',
    url: 'https://docs.google.com/spreadsheets/d/7',
    responsible_person: 'Site Engineer',
    frequency: 'Monthly',
    status: 'Active',
    assignedUsers: [],
    created_at: new Date().toISOString()
  },
  {
    id: 'KBT-008',
    name: 'Executive MIS Reports',
    department: 'Management',
    purpose: 'Executive summaries, KPI metrics and management analytics',
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

const BASE_DEPARTMENTS = [
  'HR & Attendance',
  'PMS',
  'Finance & Accounts',
  'Procurement',
  'Operations',
  'Engineering',
  'Management'
];

export const SystemMaster: React.FC<SystemMasterProps> = ({ currentView, onNavigate, currentUser, showToast }) => {
  // Navigation tabs: 'directory' | 'add-sheet' | 'permissions'
  const [activeMainTab, setActiveMainTab] = useState<'directory' | 'add-sheet' | 'permissions'>('directory');

  // Data states
  const [sheets, setSheets] = useState<KBTSheet[]>([]);
  const [systemUsers, setSystemUsers] = useState<SystemMasterUser[]>([]);
  const [loading, setLoading] = useState(true);

  // View & Filter states: 'category' (Grouped sections) | 'grid' (All cards) | 'table' (Data table)
  const [viewMode, setViewMode] = useState<'category' | 'grid' | 'table'>('category');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDept, setSelectedDept] = useState<string>('All');
  const [filterType, setFilterType] = useState<'all' | 'starred' | 'recent'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'dept' | 'frequency' | 'newest'>('name');

  // Modal States
  const [isSheetModalOpen, setIsSheetModalOpen] = useState(false);
  const [isPermissionsModalOpen, setIsPermissionsModalOpen] = useState(false);
  const [isMoveCategoryModalOpen, setIsMoveCategoryModalOpen] = useState(false);
  const [isAddExistingModalOpen, setIsAddExistingModalOpen] = useState(false);
  const [targetCategoryForExisting, setTargetCategoryForExisting] = useState<string>('');
  const [sheetToMove, setSheetToMove] = useState<KBTSheet | null>(null);
  const [activeMenuSheetId, setActiveMenuSheetId] = useState<string | null>(null);

  // Form State - Add / Edit Sheet
  const [editingSheetId, setEditingSheetId] = useState<string | null>(null);
  const [formSheetId, setFormSheetId] = useState('');
  const [formName, setFormName] = useState('');
  const [formUrl, setFormUrl] = useState('');
  const [formDept, setFormDept] = useState('HR & Attendance');
  const [isCustomDept, setIsCustomDept] = useState(false);
  const [customDeptName, setCustomDeptName] = useState('');
  const [formPurpose, setFormPurpose] = useState('');
  const [formResponsible, setFormResponsible] = useState('');
  const [formFrequency, setFormFrequency] = useState('Daily');
  const [formNotes, setFormNotes] = useState('');
  const [formSubmitting, setFormSubmitting] = useState(false);

  // Move Category modal state
  const [moveToDept, setMoveToDept] = useState('HR & Attendance');
  const [isMoveCustomDept, setIsMoveCustomDept] = useState(false);
  const [moveCustomDeptName, setMoveCustomDeptName] = useState('');

  // Permissions Manager State
  const [permTargetSheetId, setPermTargetSheetId] = useState<string>('');
  const [permUserSearch, setPermUserSearch] = useState<string>('');
  const [permDeptFilter, setPermDeptFilter] = useState<string>('All');

  // Role permissions check
  const isAdmin = currentUser?.role === 'ADMIN' || currentUser?.role === 'PC';

  // Starred / Favorite Sheets
  const [starredIds, setStarredIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('kbt_starred_sheets');
      return saved ? new Set(JSON.parse(saved)) : new Set(['KBT-001', 'KBT-002', 'KBT-003']);
    } catch {
      return new Set(['KBT-001', 'KBT-002', 'KBT-003']);
    }
  });

  // Recently opened sheets
  const [recentOpened, setRecentOpened] = useState<{ id: string; openedAt: number }[]>(() => {
    try {
      const saved = localStorage.getItem('kbt_recent_sheets_v2');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Fetch initial data
  const fetchData = async () => {
    setLoading(true);
    try {
      const sheetsRes = await fetch('/api/system-master/sheets');
      if (sheetsRes.ok) {
        const sheetsData = await sheetsRes.json();
        const loaded: KBTSheet[] = sheetsData.data || [];
        setSheets(loaded.length ? loaded : DEFAULT_SHEETS);
      } else {
        setSheets(DEFAULT_SHEETS);
      }

      if (isAdmin) {
        const usersRes = await fetch('/api/system-master/users');
        if (usersRes.ok) {
          const usersData = await usersRes.json();
          setSystemUsers(usersData.data || []);
        }
      }
    } catch (err) {
      console.warn('Fallback to default sheets data', err);
      setSheets(DEFAULT_SHEETS);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [currentUser]);

  // Active sheets list
  const activeSheetsList = useMemo(() => {
    return sheets.length > 0 ? sheets : DEFAULT_SHEETS;
  }, [sheets]);

  // Effective users list
  const effectiveUsers = useMemo(() => {
    return systemUsers.length > 0 ? systemUsers : DEFAULT_SYSTEM_USERS;
  }, [systemUsers]);

  // Dynamically compute all unique departments across sheets & defaults
  const allDepartments = useMemo(() => {
    const fromSheets = activeSheetsList.map(s => s.department).filter(Boolean);
    const set = new Set([...BASE_DEPARTMENTS, ...fromSheets]);
    return Array.from(set);
  }, [activeSheetsList]);

  // Star toggle
  const toggleStar = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setStarredIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        showToast('Removed from favorites', 'info');
      } else {
        next.add(id);
        showToast('Added to favorites', 'success');
      }
      try {
        localStorage.setItem('kbt_starred_sheets', JSON.stringify(Array.from(next)));
      } catch {}
      return next;
    });
  };

  // Open Sheet in new tab & track recent
  const handleOpenSheet = (sheet: KBTSheet, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setRecentOpened(prev => {
      const filtered = prev.filter(r => r.id !== sheet.id);
      const updated = [{ id: sheet.id, openedAt: Date.now() }, ...filtered].slice(0, 10);
      try {
        localStorage.setItem('kbt_recent_sheets_v2', JSON.stringify(updated));
      } catch {}
      return updated;
    });
    window.open(sheet.url, '_blank', 'noopener,noreferrer');
  };

  // Copy Sheet Link
  const handleCopyLink = (sheet: KBTSheet, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    navigator.clipboard.writeText(sheet.url);
    showToast(`Copied link for "${sheet.name}"`, 'success');
  };

  // Filtered & Sorted sheets
  const displayedSheets = useMemo(() => {
    let result = [...activeSheetsList];

    // Filter by type (All, Starred, Recent)
    if (filterType === 'starred') {
      result = result.filter(s => starredIds.has(s.id));
    } else if (filterType === 'recent') {
      const recentIdMap = new Map(recentOpened.map((r, idx) => [r.id, idx]));
      result = result.filter(s => recentIdMap.has(s.id));
      result.sort((a, b) => (recentIdMap.get(a.id) ?? 99) - (recentIdMap.get(b.id) ?? 99));
    }

    // Filter by department
    if (selectedDept !== 'All') {
      result = result.filter(s => s.department.toLowerCase().includes(selectedDept.toLowerCase()));
    }

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        s =>
          s.name.toLowerCase().includes(q) ||
          s.department.toLowerCase().includes(q) ||
          (s.purpose && s.purpose.toLowerCase().includes(q)) ||
          s.id.toLowerCase().includes(q) ||
          (s.responsible_person && s.responsible_person.toLowerCase().includes(q))
      );
    }

    // Sort order (unless recent filter is active)
    if (filterType !== 'recent') {
      if (sortBy === 'name') {
        result.sort((a, b) => a.name.localeCompare(b.name));
      } else if (sortBy === 'dept') {
        result.sort((a, b) => a.department.localeCompare(b.department));
      } else if (sortBy === 'frequency') {
        result.sort((a, b) => a.frequency.localeCompare(b.frequency));
      } else if (sortBy === 'newest') {
        result.sort((a, b) => (b.id || '').localeCompare(a.id || ''));
      }
    }

    return result;
  }, [activeSheetsList, filterType, selectedDept, searchQuery, sortBy, starredIds, recentOpened]);

  // Group sheets by category for 'category' view mode
  const categorizedSheets = useMemo(() => {
    const map = new Map<string, KBTSheet[]>();

    const activeDepts = selectedDept === 'All' ? allDepartments : [selectedDept];

    activeDepts.forEach(dept => {
      map.set(dept, []);
    });

    displayedSheets.forEach(sheet => {
      const dept = sheet.department || 'Other';
      if (!map.has(dept)) {
        map.set(dept, []);
      }
      map.get(dept)!.push(sheet);
    });

    const list: { department: string; sheets: KBTSheet[] }[] = [];
    map.forEach((items, dept) => {
      if (items.length > 0 || !searchQuery) {
        list.push({ department: dept, sheets: items });
      }
    });

    return list;
  }, [displayedSheets, allDepartments, selectedDept, searchQuery]);

  // Category styling helper
  const getDepartmentTheme = (dept: string) => {
    const d = (dept || '').toLowerCase();
    if (d.includes('attendance') || d.includes('hr')) {
      return {
        icon: CalendarCheck,
        badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        cardAccent: 'from-emerald-500/20 to-transparent',
        iconBg: 'bg-emerald-600 text-white shadow-emerald-500/20',
        headerBg: 'bg-emerald-50/70 border-emerald-200 text-emerald-950',
        btnBg: 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20'
      };
    }
    if (d.includes('pms')) {
      return {
        icon: ClipboardList,
        badge: 'bg-blue-50 text-blue-700 border-blue-200',
        cardAccent: 'from-blue-500/20 to-transparent',
        iconBg: 'bg-blue-600 text-white shadow-blue-500/20',
        headerBg: 'bg-blue-50/70 border-blue-200 text-blue-950',
        btnBg: 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/20'
      };
    }
    if (d.includes('finance') || d.includes('account')) {
      return {
        icon: DollarSign,
        badge: 'bg-amber-50 text-amber-700 border-amber-200',
        cardAccent: 'from-amber-500/20 to-transparent',
        iconBg: 'bg-amber-600 text-white shadow-amber-500/20',
        headerBg: 'bg-amber-50/70 border-amber-200 text-amber-950',
        btnBg: 'bg-amber-600 hover:bg-amber-700 text-white shadow-amber-600/20'
      };
    }
    if (d.includes('procurement') || d.includes('stock') || d.includes('purchase')) {
      return {
        icon: ShoppingBag,
        badge: 'bg-purple-50 text-purple-700 border-purple-200',
        cardAccent: 'from-purple-500/20 to-transparent',
        iconBg: 'bg-purple-600 text-white shadow-purple-500/20',
        headerBg: 'bg-purple-50/70 border-purple-200 text-purple-950',
        btnBg: 'bg-purple-600 hover:bg-purple-700 text-white shadow-purple-600/20'
      };
    }
    if (d.includes('operation')) {
      return {
        icon: SlidersHorizontal,
        badge: 'bg-pink-50 text-pink-700 border-pink-200',
        cardAccent: 'from-pink-500/20 to-transparent',
        iconBg: 'bg-pink-600 text-white shadow-pink-500/20',
        headerBg: 'bg-pink-50/70 border-pink-200 text-pink-950',
        btnBg: 'bg-pink-600 hover:bg-pink-700 text-white shadow-pink-600/20'
      };
    }
    if (d.includes('engineering') || d.includes('project')) {
      return {
        icon: Building,
        badge: 'bg-cyan-50 text-cyan-700 border-cyan-200',
        cardAccent: 'from-cyan-500/20 to-transparent',
        iconBg: 'bg-cyan-600 text-white shadow-cyan-500/20',
        headerBg: 'bg-cyan-50/70 border-cyan-200 text-cyan-950',
        btnBg: 'bg-cyan-600 hover:bg-cyan-700 text-white shadow-cyan-600/20'
      };
    }
    if (d.includes('management') || d.includes('report') || d.includes('mis')) {
      return {
        icon: BarChart3,
        badge: 'bg-indigo-50 text-indigo-700 border-indigo-200',
        cardAccent: 'from-indigo-500/20 to-transparent',
        iconBg: 'bg-indigo-600 text-white shadow-indigo-500/20',
        headerBg: 'bg-indigo-50/70 border-indigo-200 text-indigo-950',
        btnBg: 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-600/20'
      };
    }
    if (d.includes('sales') || d.includes('market') || d.includes('crm')) {
      return {
        icon: Sparkles,
        badge: 'bg-rose-50 text-rose-700 border-rose-200',
        cardAccent: 'from-rose-500/20 to-transparent',
        iconBg: 'bg-rose-600 text-white shadow-rose-500/20',
        headerBg: 'bg-rose-50/70 border-rose-200 text-rose-950',
        btnBg: 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/20'
      };
    }
    return {
      icon: FileSpreadsheet,
      badge: 'bg-teal-50 text-teal-700 border-teal-200',
      cardAccent: 'from-teal-500/20 to-transparent',
      iconBg: 'bg-teal-600 text-white shadow-teal-500/20',
      headerBg: 'bg-teal-50/70 border-teal-200 text-teal-950',
      btnBg: 'bg-teal-600 hover:bg-teal-700 text-white shadow-teal-600/20'
    };
  };

  // Open Add Sheet (with pre-filled department)
  const handleOpenAddModal = (targetDepartment?: string) => {
    setEditingSheetId(null);
    setFormSheetId('');
    setFormName('');
    setFormUrl('');

    const defaultDept = targetDepartment && targetDepartment !== 'All'
      ? targetDepartment
      : selectedDept !== 'All'
      ? selectedDept
      : 'HR & Attendance';

    setFormDept(defaultDept);
    setIsCustomDept(false);
    setCustomDeptName('');
    setFormPurpose('');
    setFormResponsible(currentUser?.name || 'Admin');
    setFormFrequency('Daily');
    setFormNotes('');
    setIsSheetModalOpen(true);
  };

  // Open Edit Sheet Modal
  const handleOpenEditModal = (sheet: KBTSheet, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setActiveMenuSheetId(null);
    setEditingSheetId(sheet.id);
    setFormSheetId(sheet.id);
    setFormName(sheet.name);
    setFormUrl(sheet.url);

    if (allDepartments.includes(sheet.department)) {
      setFormDept(sheet.department);
      setIsCustomDept(false);
      setCustomDeptName('');
    } else {
      setFormDept('__CUSTOM__');
      setIsCustomDept(true);
      setCustomDeptName(sheet.department);
    }

    setFormPurpose(sheet.purpose || '');
    setFormResponsible(sheet.responsible_person || '');
    setFormFrequency(sheet.frequency || 'Daily');
    setFormNotes(sheet.notes || '');
    setIsSheetModalOpen(true);
  };

  // Quick Move Category for existing/previous sheet
  const handleOpenMoveCategoryModal = (sheet: KBTSheet, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setActiveMenuSheetId(null);
    setSheetToMove(sheet);
    setMoveToDept(sheet.department || 'HR & Attendance');
    setIsMoveCustomDept(false);
    setMoveCustomDeptName('');
    setIsMoveCategoryModalOpen(true);
  };

  // Save Category Move for Existing Sheet
  const handleConfirmMoveCategory = async (newDept: string) => {
    if (!sheetToMove) return;
    const finalDept = newDept.trim();
    if (!finalDept) {
      showToast('Please specify a category', 'error');
      return;
    }

    try {
      const res = await fetch(`/api/system-master/sheets/${sheetToMove.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ department: finalDept })
      });

      if (res.ok) {
        setSheets(prev => prev.map(s => (s.id === sheetToMove.id ? { ...s, department: finalDept } : s)));
        showToast(`Moved "${sheetToMove.name}" to category "${finalDept}"`, 'success');
        setIsMoveCategoryModalOpen(false);
        setSheetToMove(null);
      } else {
        showToast('Failed to change category', 'error');
      }
    } catch {
      showToast('Network error updating category', 'error');
    }
  };

  // Add Existing Sheet to Target Category
  const handleAddExistingSheetToCategory = async (sheetId: string, targetDept: string) => {
    const targetSheet = activeSheetsList.find(s => s.id === sheetId);
    if (!targetSheet) return;

    try {
      const res = await fetch(`/api/system-master/sheets/${sheetId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ department: targetDept })
      });

      if (res.ok) {
        setSheets(prev => prev.map(s => (s.id === sheetId ? { ...s, department: targetDept } : s)));
        showToast(`Added "${targetSheet.name}" to "${targetDept}" category`, 'success');
        setIsAddExistingModalOpen(false);
      } else {
        showToast('Failed to move sheet', 'error');
      }
    } catch {
      showToast('Error updating sheet category', 'error');
    }
  };

  // Delete Sheet
  const handleDeleteSheet = async (sheet: KBTSheet, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setActiveMenuSheetId(null);
    if (!window.confirm(`Are you sure you want to delete "${sheet.name}" (${sheet.id})?`)) return;

    try {
      const res = await fetch(`/api/system-master/sheets/${sheet.id}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('Sheet deleted successfully', 'success');
        fetchData();
      } else {
        showToast('Failed to delete sheet', 'error');
      }
    } catch {
      showToast('Network error while deleting sheet', 'error');
    }
  };

  // Save Sheet (Add / Update)
  const handleSaveSheet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formUrl.trim()) {
      showToast('Sheet Name and Google Sheet URL are required', 'error');
      return;
    }

    const effectiveDept = isCustomDept
      ? customDeptName.trim()
      : formDept === '__CUSTOM__'
      ? customDeptName.trim()
      : formDept;

    if (!effectiveDept) {
      showToast('Please specify a department / category for this sheet', 'error');
      return;
    }

    setFormSubmitting(true);
    const payload = {
      id: formSheetId.trim() || undefined,
      name: formName.trim(),
      url: formUrl.trim(),
      department: effectiveDept,
      purpose: formPurpose.trim(),
      responsible_person: formResponsible.trim(),
      frequency: formFrequency,
      status: 'Active',
      notes: formNotes.trim()
    };

    try {
      const url = editingSheetId ? `/api/system-master/sheets/${editingSheetId}` : '/api/system-master/sheets';
      const method = editingSheetId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        showToast(
          editingSheetId
            ? `Sheet updated in "${effectiveDept}"`
            : `New Google Sheet added to "${effectiveDept}"`,
          'success'
        );
        setIsSheetModalOpen(false);
        setActiveMainTab('directory');
        fetchData();
      } else {
        const data = await res.json();
        showToast(data.message || 'Operation failed', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Failed to connect to server', 'error');
    } finally {
      setFormSubmitting(false);
    }
  };

  // Open Permissions Modal
  const handleOpenPermissionsModal = (sheetId?: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setActiveMenuSheetId(null);
    setPermTargetSheetId(sheetId || (activeSheetsList[0]?.id ?? ''));
    setPermUserSearch('');
    setPermDeptFilter('All');
    setIsPermissionsModalOpen(true);
  };

  // Target sheet for permission modal
  const targetPermSheet = useMemo(() => {
    return activeSheetsList.find(s => s.id === permTargetSheetId) || activeSheetsList[0];
  }, [activeSheetsList, permTargetSheetId]);

  // Toggle user permission for selected sheet
  const handleToggleUserPermission = async (userEmail: string) => {
    if (!targetPermSheet) return;

    let updated = [...(targetPermSheet.assignedUsers || [])];
    const emailLower = userEmail.toLowerCase();
    const exists = updated.some(e => e.toLowerCase() === emailLower);

    if (exists) {
      updated = updated.filter(e => e.toLowerCase() !== emailLower);
    } else {
      updated.push(userEmail);
    }

    try {
      const res = await fetch(`/api/system-master/sheets/${targetPermSheet.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignedUsers: updated })
      });

      if (res.ok) {
        setSheets(prev => prev.map(s => (s.id === targetPermSheet.id ? { ...s, assignedUsers: updated } : s)));
        showToast(exists ? 'Access revoked' : 'Access granted', 'success');
      } else {
        showToast('Failed to update permission', 'error');
      }
    } catch {
      showToast('Server error updating permission', 'error');
    }
  };

  // Bulk grant by Department
  const handleGrantDepartment = async (deptName: string) => {
    if (!targetPermSheet) return;
    const deptUsers = effectiveUsers.filter(u => (u.department || 'General').toLowerCase() === deptName.toLowerCase());
    if (deptUsers.length === 0) {
      showToast(`No users found in ${deptName}`, 'warning');
      return;
    }

    const currentSet = new Set((targetPermSheet.assignedUsers || []).map(e => e.toLowerCase()));
    deptUsers.forEach(u => currentSet.add(u.email.toLowerCase()));
    const updated = Array.from(currentSet);

    try {
      const res = await fetch(`/api/system-master/sheets/${targetPermSheet.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignedUsers: updated })
      });

      if (res.ok) {
        setSheets(prev => prev.map(s => (s.id === targetPermSheet.id ? { ...s, assignedUsers: updated } : s)));
        showToast(`Granted access to all ${deptName} members`, 'success');
      }
    } catch {
      showToast('Error updating permissions', 'error');
    }
  };

  // Grant All / Clear All
  const handleSetAllPermissions = async (grantAll: boolean) => {
    if (!targetPermSheet) return;
    const updated = grantAll ? effectiveUsers.map(u => u.email) : [];

    try {
      const res = await fetch(`/api/system-master/sheets/${targetPermSheet.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignedUsers: updated })
      });

      if (res.ok) {
        setSheets(prev => prev.map(s => (s.id === targetPermSheet.id ? { ...s, assignedUsers: updated } : s)));
        showToast(grantAll ? 'Granted access to all employees' : 'Cleared all sheet access', 'info');
      }
    } catch {
      showToast('Error updating permissions', 'error');
    }
  };

  // Close menus when clicking outside
  useEffect(() => {
    const handleOutsideClick = () => setActiveMenuSheetId(null);
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, []);

  // Reusable Single Sheet Card Component
  const renderSheetCard = (sheet: KBTSheet) => {
    const theme = getDepartmentTheme(sheet.department);
    const DeptIcon = theme.icon;
    const isStarred = starredIds.has(sheet.id);
    const assignedCount = sheet.assignedUsers?.length || 0;

    return (
      <div
        key={sheet.id}
        className="bg-white border border-slate-200/80 hover:border-emerald-300/80 rounded-2xl p-5 flex flex-col justify-between shadow-2xs hover:shadow-lg transition-all duration-300 relative group overflow-hidden"
      >
        {/* Subtle top color gradient accent */}
        <div className={`absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r ${theme.cardAccent}`} />

        <div>
          {/* Top Row: Icon + Star + Admin Dropdown */}
          <div className="flex items-center justify-between mb-3.5">
            <div className="flex items-center gap-2">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${theme.iconBg} shadow-sm`}>
                <DeptIcon size={18} />
              </div>
              <span className="font-mono text-[10px] font-black text-slate-500 bg-slate-100 border border-slate-200/80 px-2 py-0.5 rounded-lg">
                {sheet.id}
              </span>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={e => toggleStar(sheet.id, e)}
                className="p-1.5 hover:bg-slate-100 rounded-xl text-slate-300 hover:text-amber-500 transition-colors"
                title={isStarred ? 'Remove from favorites' : 'Add to favorites'}
              >
                <Star size={17} className={isStarred ? 'fill-amber-400 text-amber-400' : ''} />
              </button>

              {isAdmin && (
                <div className="relative" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => setActiveMenuSheetId(activeMenuSheetId === sheet.id ? null : sheet.id)}
                    className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
                    title="Sheet Actions"
                  >
                    <MoreVertical size={16} />
                  </button>

                  {activeMenuSheetId === sheet.id && (
                    <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-slate-200 rounded-2xl shadow-xl z-30 p-1.5 space-y-1">
                      <button
                        onClick={e => handleOpenMoveCategoryModal(sheet, e)}
                        className="w-full text-left px-3 py-2 text-xs font-bold text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 rounded-xl flex items-center gap-2"
                      >
                        <FolderKanban size={13} className="text-emerald-600" />
                        <span>Change Category</span>
                      </button>
                      <button
                        onClick={e => handleOpenPermissionsModal(sheet.id, e)}
                        className="w-full text-left px-3 py-2 text-xs font-bold text-slate-700 hover:bg-blue-50 hover:text-blue-700 rounded-xl flex items-center gap-2"
                      >
                        <Shield size={13} className="text-blue-600" />
                        <span>Manage Access</span>
                      </button>
                      <button
                        onClick={e => handleOpenEditModal(sheet, e)}
                        className="w-full text-left px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 rounded-xl flex items-center gap-2"
                      >
                        <Edit2 size={13} />
                        <span>Edit Details</span>
                      </button>
                      <button
                        onClick={e => handleCopyLink(sheet, e)}
                        className="w-full text-left px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 rounded-xl flex items-center gap-2"
                      >
                        <Copy size={13} />
                        <span>Copy URL</span>
                      </button>
                      <div className="border-t border-slate-100 my-1" />
                      <button
                        onClick={e => handleDeleteSheet(sheet, e)}
                        className="w-full text-left px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 rounded-xl flex items-center gap-2"
                      >
                        <Trash2 size={13} />
                        <span>Delete Sheet</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Department Tag with Quick Move Trigger */}
          <div className="mb-2 flex items-center gap-1.5">
            <button
              onClick={e => (isAdmin ? handleOpenMoveCategoryModal(sheet, e) : null)}
              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[10px] font-bold border transition-colors ${theme.badge} ${
                isAdmin ? 'hover:brightness-95 cursor-pointer' : ''
              }`}
              title={isAdmin ? 'Click to change category' : undefined}
            >
              <span>{sheet.department}</span>
              {isAdmin && <ChevronRight size={10} className="text-slate-400" />}
            </button>
          </div>

          {/* Title */}
          <h3 className="text-sm sm:text-base font-black text-slate-900 group-hover:text-emerald-700 transition-colors line-clamp-1 leading-snug">
            {sheet.name}
          </h3>

          {/* Purpose / Description */}
          <p className="text-xs text-slate-500 mt-1 font-medium line-clamp-2 min-h-[32px] leading-relaxed">
            {sheet.purpose || 'Connected company sheet for reporting and operational tracking.'}
          </p>
        </div>

        {/* Card Bottom: Metadata & Actions */}
        <div className="mt-5 pt-3.5 border-t border-slate-100 space-y-3">
          {/* Frequency & User Access stats */}
          <div className="flex items-center justify-between text-[11px] font-bold text-slate-400">
            <span className="text-slate-500">
              {sheet.frequency || 'Daily'} Update
            </span>
            <div className="flex items-center gap-1.5 text-slate-500" title={`${assignedCount} assigned users`}>
              <Users size={13} className="text-slate-400" />
              <span>{assignedCount > 0 ? `${assignedCount} users` : 'All Team'}</span>
            </div>
          </div>

          {/* Primary Open & Copy Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={e => handleOpenSheet(sheet, e)}
              className="flex-1 py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-md shadow-emerald-600/20"
            >
              <span>Open Sheet</span>
              <ExternalLink size={13} />
            </button>

            <button
              onClick={e => handleCopyLink(sheet, e)}
              className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-all"
              title="Copy Sheet URL"
            >
              <Copy size={14} />
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50/70 text-slate-800 pb-16 font-sans">
      {/* 1. TOP HEADER & CONTROLS */}
      <div className="bg-white border-b border-slate-200/80 sticky top-0 z-20 backdrop-blur-md bg-white/90">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            {/* Title & Badge */}
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center text-white shadow-lg shadow-emerald-600/25 shrink-0">
                <FileSpreadsheet size={22} className="stroke-[2.2]" />
              </div>
              <div>
                <div className="flex items-center gap-2.5">
                  <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900">Sheet Center</h1>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200">
                    {activeSheetsList.length} Connected
                  </span>
                </div>
                <p className="text-xs text-slate-500 font-medium">
                  Organize, categorize and access company spreadsheets by department
                </p>
              </div>
            </div>

            {/* Top Navigation Tabs */}
            <div className="flex items-center gap-2 self-start md:self-auto overflow-x-auto pb-1 md:pb-0">
              <button
                onClick={() => setActiveMainTab('directory')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                  activeMainTab === 'directory'
                    ? 'bg-slate-900 text-white shadow-md'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                <FolderKanban size={14} />
                <span>1. Sheet Directory</span>
              </button>

              {isAdmin && (
                <>
                  <button
                    onClick={() => {
                      handleOpenAddModal();
                    }}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                      activeMainTab === 'add-sheet'
                        ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/25'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                    }`}
                  >
                    <Plus size={14} />
                    <span>2. Add New Sheet</span>
                  </button>

                  <button
                    onClick={() => handleOpenPermissionsModal()}
                    className="px-3.5 py-2 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 hover:border-blue-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap shadow-2xs"
                  >
                    <Shield size={14} className="text-blue-600" />
                    <span>3. Permissions</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6 space-y-6">
        {/* 2. SEARCH & FILTER BAR */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-3 sm:p-4 shadow-2xs space-y-3.5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            {/* Realtime Search */}
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search sheets by name, ID, department or purpose..."
                className="w-full bg-slate-50 border border-slate-200/80 text-slate-800 pl-10 pr-9 py-2.5 text-xs sm:text-sm rounded-xl outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 focus:bg-white transition-all placeholder:text-slate-400"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Quick Views & Layout Switcher */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0 shrink-0">
              {/* Layout Switcher (By Category / All Grid / Table) */}
              <div className="bg-slate-100 p-1 rounded-xl flex items-center border border-slate-200">
                <button
                  onClick={() => setViewMode('category')}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                    viewMode === 'category' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                  title="Grouped by Department Sections"
                >
                  <FolderKanban size={14} />
                  <span className="hidden sm:inline">By Category</span>
                </button>
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-1.5 rounded-lg transition-all ${
                    viewMode === 'grid' ? 'bg-white text-emerald-700 shadow-xs font-bold' : 'text-slate-500 hover:text-slate-800'
                  }`}
                  title="All Grid Cards View"
                >
                  <Grid size={15} />
                </button>
                <button
                  onClick={() => setViewMode('table')}
                  className={`p-1.5 rounded-lg transition-all ${
                    viewMode === 'table' ? 'bg-white text-emerald-700 shadow-xs font-bold' : 'text-slate-500 hover:text-slate-800'
                  }`}
                  title="Table List View"
                >
                  <List size={15} />
                </button>
              </div>

              {/* Filter Type Pills */}
              <div className="bg-slate-100 p-1 rounded-xl flex items-center border border-slate-200/80">
                <button
                  onClick={() => setFilterType('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                    filterType === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setFilterType('starred')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                    filterType === 'starred' ? 'bg-white text-amber-700 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Star size={13} className={filterType === 'starred' ? 'fill-amber-400 text-amber-500' : ''} />
                  <span>Starred</span>
                </button>
                <button
                  onClick={() => setFilterType('recent')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                    filterType === 'recent' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Clock size={13} />
                  <span>Recent</span>
                </button>
              </div>

              {/* Sort Selector */}
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as any)}
                className="bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
              >
                <option value="name">Sort: Name</option>
                <option value="dept">Sort: Category</option>
                <option value="frequency">Sort: Frequency</option>
                <option value="newest">Sort: Sheet ID</option>
              </select>
            </div>
          </div>

          {/* Department Filter Chips & Direct Category Creator */}
          <div className="flex items-center gap-1.5 overflow-x-auto pt-1 pb-1 border-t border-slate-100 custom-scrollbar">
            <button
              onClick={() => setSelectedDept('All')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 shrink-0 border ${
                selectedDept === 'All'
                  ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200/80 hover:text-slate-900'
              }`}
            >
              <span>All Categories</span>
              <span
                className={`px-1.5 py-0.2 rounded-md text-[10px] font-extrabold ${
                  selectedDept === 'All' ? 'bg-white/20 text-white' : 'bg-slate-200/70 text-slate-600'
                }`}
              >
                {activeSheetsList.length}
              </span>
            </button>

            {allDepartments.map(dept => {
              const isSelected = selectedDept === dept;
              const count = activeSheetsList.filter(s => s.department.toLowerCase().includes(dept.toLowerCase())).length;

              return (
                <button
                  key={dept}
                  onClick={() => setSelectedDept(dept)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 shrink-0 border ${
                    isSelected
                      ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200/80 hover:text-slate-900'
                  }`}
                >
                  <span>{dept}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-md text-[10px] font-extrabold ${
                      isSelected ? 'bg-white/20 text-white' : 'bg-slate-200/70 text-slate-600'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}

            {isAdmin && (
              <button
                onClick={() => {
                  setEditingSheetId(null);
                  setFormSheetId('');
                  setFormName('');
                  setFormUrl('');
                  setFormDept('__CUSTOM__');
                  setIsCustomDept(true);
                  setCustomDeptName('');
                  setFormPurpose('');
                  setFormResponsible(currentUser?.name || 'Admin');
                  setFormFrequency('Daily');
                  setFormNotes('');
                  setIsSheetModalOpen(true);
                }}
                className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1 shrink-0 border border-dashed border-emerald-300 bg-emerald-50/50 hover:bg-emerald-100 text-emerald-800"
                title="Create a new custom category"
              >
                <FolderPlus size={13} className="text-emerald-600" />
                <span>+ New Category</span>
              </button>
            )}
          </div>
        </div>

        {/* 3. SHEETS CONTENT DISPLAY */}
        {displayedSheets.length === 0 ? (
          <div className="bg-white border border-slate-200/80 rounded-3xl p-12 text-center max-w-lg mx-auto space-y-4 shadow-2xs mt-8">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center mx-auto text-emerald-600 shadow-inner">
              <FileSpreadsheet size={26} />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900">No Google Sheets Found</h3>
              <p className="text-xs text-slate-500 mt-1 font-medium">
                {searchQuery || selectedDept !== 'All' || filterType !== 'all'
                  ? `No sheets found under category "${selectedDept}".`
                  : 'No sheets have been connected yet.'}
              </p>
            </div>

            <div className="flex justify-center gap-2 pt-2">
              {(searchQuery || selectedDept !== 'All' || filterType !== 'all') && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedDept('All');
                    setFilterType('all');
                  }}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all inline-flex items-center gap-1.5"
                >
                  <span>Reset Filters</span>
                </button>
              )}

              {isAdmin && selectedDept !== 'All' && (
                <button
                  onClick={() => handleOpenAddModal(selectedDept)}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all inline-flex items-center gap-1.5 shadow-md shadow-emerald-600/20"
                >
                  <Plus size={14} />
                  <span>Add Sheet to {selectedDept}</span>
                </button>
              )}
            </div>
          </div>
        ) : viewMode === 'category' ? (
          /* CATEGORY / DEPARTMENT SECTIONS VIEW */
          <div className="space-y-8">
            {categorizedSheets.map(({ department, sheets }) => {
              const theme = getDepartmentTheme(department);
              const DeptIcon = theme.icon;

              return (
                <section
                  key={department}
                  className="bg-white/80 border border-slate-200/90 rounded-3xl p-5 sm:p-6 shadow-2xs space-y-4 transition-all"
                >
                  {/* Category Section Header */}
                  <div className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${theme.headerBg}`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${theme.iconBg} shadow-sm shrink-0`}>
                        <DeptIcon size={20} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-base font-black text-slate-900">{department}</h2>
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-white/80 text-slate-700 border border-slate-200 shadow-2xs">
                            {sheets.length} {sheets.length === 1 ? 'Sheet' : 'Sheets'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                          Department spreadsheets, reports and workflows
                        </p>
                      </div>
                    </div>

                    {isAdmin && (
                      <div className="flex items-center gap-2 self-start sm:self-auto">
                        <button
                          onClick={() => {
                            setTargetCategoryForExisting(department);
                            setIsAddExistingModalOpen(true);
                          }}
                          className="px-3 py-2 bg-white/90 hover:bg-white text-slate-700 hover:text-slate-900 border border-slate-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs"
                          title={`Assign an existing sheet to ${department}`}
                        >
                          <MoveRight size={13} className="text-slate-500" />
                          <span>+ Add Existing Sheet</span>
                        </button>

                        <button
                          onClick={() => handleOpenAddModal(department)}
                          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm active:scale-98 ${theme.btnBg}`}
                          title={`Add new Google Sheet to ${department}`}
                        >
                          <Plus size={14} className="stroke-[2.5]" />
                          <span>+ New {department} Sheet</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Category Sheets Grid */}
                  {sheets.length === 0 ? (
                    <div className="border border-dashed border-slate-200 rounded-2xl p-8 text-center bg-slate-50/50 space-y-3">
                      <p className="text-xs font-bold text-slate-600">No sheets in {department} yet</p>
                      {isAdmin && (
                        <div className="flex justify-center gap-2">
                          <button
                            onClick={() => {
                              setTargetCategoryForExisting(department);
                              setIsAddExistingModalOpen(true);
                            }}
                            className="px-3.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-all inline-flex items-center gap-1"
                          >
                            <MoveRight size={12} />
                            <span>Add Existing Sheet</span>
                          </button>
                          <button
                            onClick={() => handleOpenAddModal(department)}
                            className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all inline-flex items-center gap-1"
                          >
                            <Plus size={13} />
                            <span>Add New Sheet</span>
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5 pt-1">
                      {sheets.map(sheet => renderSheetCard(sheet))}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        ) : viewMode === 'grid' ? (
          /* FLAT GRID VIEW - ALL CARDS */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5">
            {displayedSheets.map(sheet => renderSheetCard(sheet))}
          </div>
        ) : (
          /* TABLE / LIST VIEW - ENTERPRISE DATA TABLE */
          <div className="bg-white border border-slate-200/90 rounded-2xl shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-extrabold uppercase tracking-wider text-[10px]">
                    <th className="py-3.5 px-4 w-10 text-center">★</th>
                    <th className="py-3.5 px-4">Sheet Name & ID</th>
                    <th className="py-3.5 px-4">Department / Category</th>
                    <th className="py-3.5 px-4">Purpose / Scope</th>
                    <th className="py-3.5 px-4">Lead / Owner</th>
                    <th className="py-3.5 px-4">Frequency</th>
                    <th className="py-3.5 px-4">Access Scope</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {displayedSheets.map(sheet => {
                    const theme = getDepartmentTheme(sheet.department);
                    const isStarred = starredIds.has(sheet.id);
                    const assignedCount = sheet.assignedUsers?.length || 0;

                    return (
                      <tr key={sheet.id} className="hover:bg-slate-50/70 transition-colors group">
                        {/* Star */}
                        <td className="py-3 px-4 text-center">
                          <button
                            onClick={e => toggleStar(sheet.id, e)}
                            className="text-slate-300 hover:text-amber-500 p-1"
                            title={isStarred ? 'Remove favorite' : 'Add favorite'}
                          >
                            <Star size={15} className={isStarred ? 'fill-amber-400 text-amber-400' : ''} />
                          </button>
                        </td>

                        {/* Sheet Name & ID */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[10px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                              {sheet.id}
                            </span>
                            <span className="font-extrabold text-slate-900 group-hover:text-emerald-700 transition-colors">
                              {sheet.name}
                            </span>
                          </div>
                        </td>

                        {/* Department / Category with Quick Change */}
                        <td className="py-3 px-4">
                          <button
                            onClick={e => (isAdmin ? handleOpenMoveCategoryModal(sheet, e) : null)}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border transition-colors ${theme.badge} ${
                              isAdmin ? 'hover:brightness-95 cursor-pointer' : ''
                            }`}
                            title={isAdmin ? 'Click to change category' : undefined}
                          >
                            <span>{sheet.department}</span>
                            {isAdmin && <ChevronRight size={10} className="text-slate-400" />}
                          </button>
                        </td>

                        {/* Purpose */}
                        <td className="py-3 px-4 max-w-xs truncate text-slate-500 font-medium" title={sheet.purpose}>
                          {sheet.purpose || '—'}
                        </td>

                        {/* Responsible */}
                        <td className="py-3 px-4 text-slate-700 font-semibold">
                          {sheet.responsible_person || 'HR / Admin'}
                        </td>

                        {/* Frequency */}
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md text-[10px] font-bold">
                            {sheet.frequency || 'Daily'}
                          </span>
                        </td>

                        {/* Access Scope */}
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                              assignedCount > 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {assignedCount > 0 ? `${assignedCount} users` : 'All Team'}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={e => handleOpenSheet(sheet, e)}
                              className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs flex items-center gap-1 shadow-2xs"
                            >
                              <span>Open</span>
                              <ExternalLink size={12} />
                            </button>

                            <button
                              onClick={e => handleCopyLink(sheet, e)}
                              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"
                              title="Copy URL"
                            >
                              <Copy size={14} />
                            </button>

                            {isAdmin && (
                              <>
                                <button
                                  onClick={e => handleOpenMoveCategoryModal(sheet, e)}
                                  className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg"
                                  title="Change Category"
                                >
                                  <FolderKanban size={14} />
                                </button>
                                <button
                                  onClick={e => handleOpenPermissionsModal(sheet.id, e)}
                                  className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                                  title="Manage Access"
                                >
                                  <Shield size={14} />
                                </button>
                                <button
                                  onClick={e => handleOpenEditModal(sheet, e)}
                                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"
                                  title="Edit Sheet"
                                >
                                  <Edit2 size={14} />
                                </button>
                                <button
                                  onClick={e => handleDeleteSheet(sheet, e)}
                                  className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                                  title="Delete Sheet"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* 4. ADD / EDIT SHEET MODAL */}
      {isSheetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div
            className="bg-white rounded-3xl max-w-xl w-full p-6 sm:p-8 shadow-2xl border border-slate-200 space-y-5 animate-in zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                  <FileSpreadsheet size={20} />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    {editingSheetId ? 'Edit Google Sheet' : 'Connect New Google Sheet'}
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    {editingSheetId ? `Update details for ${formSheetId}` : 'Register and assign a Google Sheet under its category'}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsSheetModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveSheet} className="space-y-4">
              {/* Category / Department Selection Banner */}
              <div className="bg-slate-50 border border-slate-200/80 p-3.5 rounded-2xl space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Category / Department *
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCustomDept(!isCustomDept);
                      if (!isCustomDept) setCustomDeptName('');
                    }}
                    className="text-[11px] font-extrabold text-emerald-700 hover:text-emerald-800 transition-colors flex items-center gap-1"
                  >
                    <FolderPlus size={12} />
                    <span>{isCustomDept ? 'Choose Existing' : '+ Custom Category'}</span>
                  </button>
                </div>

                {isCustomDept || formDept === '__CUSTOM__' ? (
                  <div className="space-y-1">
                    <input
                      type="text"
                      required
                      placeholder="e.g. Sales & Marketing, Legal, Site Operations..."
                      className="w-full bg-white border border-emerald-400 rounded-xl px-3.5 py-2.5 text-xs outline-none focus:ring-2 focus:ring-emerald-500 transition-all font-bold text-slate-900"
                      value={customDeptName}
                      onChange={e => setCustomDeptName(e.target.value)}
                    />
                    <p className="text-[10px] text-slate-400 font-medium">
                      Enter any new category name. It will be added to your department hub.
                    </p>
                  </div>
                ) : (
                  <select
                    className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs outline-none focus:ring-2 focus:ring-emerald-500 transition-all font-bold text-slate-900"
                    value={formDept}
                    onChange={e => {
                      if (e.target.value === '__CUSTOM__') {
                        setIsCustomDept(true);
                        setCustomDeptName('');
                      } else {
                        setFormDept(e.target.value);
                      }
                    }}
                  >
                    {allDepartments.map(dept => (
                      <option key={dept} value={dept}>
                        📁 {dept}
                      </option>
                    ))}
                    <option value="__CUSTOM__">✨ + Add New Custom Category...</option>
                  </select>
                )}
              </div>

              {/* Sheet Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Sheet Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Attendance Sheet, Vendor Ledger, Site Daily Tracker..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all font-semibold"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                />
              </div>

              {/* Google Sheet URL */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Google Sheet URL *
                </label>
                <div className="relative">
                  <input
                    type="url"
                    required
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all font-mono text-slate-700"
                    value={formUrl}
                    onChange={e => setFormUrl(e.target.value)}
                  />
                  {formUrl && (
                    <button
                      type="button"
                      onClick={() => window.open(formUrl, '_blank')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2 py-1 rounded-lg transition-colors flex items-center gap-1"
                    >
                      <span>Test Link</span>
                      <ExternalLink size={11} />
                    </button>
                  )}
                </div>
              </div>

              {/* Purpose / Description */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Purpose / Scope Description
                </label>
                <textarea
                  rows={2}
                  placeholder="Describe what this sheet is used for, update cycles, and relevant project notes..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all leading-relaxed"
                  value={formPurpose}
                  onChange={e => setFormPurpose(e.target.value)}
                />
              </div>

              {/* Responsible Lead & Update Frequency */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Responsible Person / Lead
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. HR Admin, Finance Manager..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
                    value={formResponsible}
                    onChange={e => setFormResponsible(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Update Frequency
                  </label>
                  <select
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all font-semibold"
                    value={formFrequency}
                    onChange={e => setFormFrequency(e.target.value)}
                  >
                    <option value="Daily">Daily</option>
                    <option value="Weekly">Weekly</option>
                    <option value="Monthly">Monthly</option>
                    <option value="On-Demand">On-Demand</option>
                  </select>
                </div>
              </div>

              {/* Modal Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsSheetModalOpen(false)}
                  className="px-4 py-2.5 text-slate-600 font-bold hover:bg-slate-100 rounded-xl text-xs transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl font-bold text-xs shadow-md shadow-emerald-600/20 transition-all flex items-center gap-1.5"
                >
                  {formSubmitting ? <RefreshCw size={13} className="animate-spin" /> : null}
                  <span>
                    {editingSheetId
                      ? 'Save Changes'
                      : isCustomDept && customDeptName
                      ? `Connect to ${customDeptName}`
                      : `Connect to ${formDept}`}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. CHANGE / MOVE CATEGORY MODAL FOR EXISTING SHEETS */}
      {isMoveCategoryModalOpen && sheetToMove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div
            className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-in zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
                  <FolderKanban size={20} />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">Change Sheet Category</h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Move <span className="font-bold text-slate-800">"{sheetToMove.name}"</span> to a new category
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsMoveCategoryModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/80 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Select New Category
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setIsMoveCustomDept(!isMoveCustomDept);
                      if (!isMoveCustomDept) setMoveCustomDeptName('');
                    }}
                    className="text-[11px] font-extrabold text-emerald-700 hover:text-emerald-800 flex items-center gap-1"
                  >
                    <FolderPlus size={12} />
                    <span>{isMoveCustomDept ? 'Choose Existing' : '+ Custom Category'}</span>
                  </button>
                </div>

                {isMoveCustomDept || moveToDept === '__CUSTOM__' ? (
                  <input
                    type="text"
                    required
                    placeholder="e.g. Sales & Marketing, Site Management..."
                    className="w-full bg-white border border-emerald-400 rounded-xl px-3.5 py-2.5 text-xs outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-slate-900"
                    value={moveCustomDeptName}
                    onChange={e => setMoveCustomDeptName(e.target.value)}
                  />
                ) : (
                  <select
                    className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-slate-900"
                    value={moveToDept}
                    onChange={e => {
                      if (e.target.value === '__CUSTOM__') {
                        setIsMoveCustomDept(true);
                        setMoveCustomDeptName('');
                      } else {
                        setMoveToDept(e.target.value);
                      }
                    }}
                  >
                    {allDepartments.map(dept => (
                      <option key={dept} value={dept}>
                        📁 {dept} {sheetToMove.department === dept ? '(Current)' : ''}
                      </option>
                    ))}
                    <option value="__CUSTOM__">✨ + Add New Custom Category...</option>
                  </select>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsMoveCategoryModalOpen(false)}
                  className="px-4 py-2 text-slate-600 font-bold hover:bg-slate-100 rounded-xl text-xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleConfirmMoveCategory(
                      isMoveCustomDept ? moveCustomDeptName : moveToDept === '__CUSTOM__' ? moveCustomDeptName : moveToDept
                    )
                  }
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow-md shadow-emerald-600/20 flex items-center gap-1.5"
                >
                  <MoveRight size={13} />
                  <span>Update Category</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 6. ADD EXISTING / PREVIOUS SHEET TO CATEGORY MODAL */}
      {isAddExistingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div
            className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-in zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold">
                  <MoveRight size={20} />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    Add Existing Sheet to "{targetCategoryForExisting}"
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Select any previous sheet to assign into this category
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsAddExistingModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1 custom-scrollbar">
              {activeSheetsList.filter(s => s.department !== targetCategoryForExisting).length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500 font-medium">
                  All sheets are already in this category!
                </div>
              ) : (
                activeSheetsList
                  .filter(s => s.department !== targetCategoryForExisting)
                  .map(sheet => {
                    const theme = getDepartmentTheme(sheet.department);
                    const CategoryIcon = theme.icon;

                    return (
                      <div
                        key={sheet.id}
                        className="p-3.5 rounded-2xl border border-slate-200/90 hover:border-emerald-300 hover:bg-slate-50/80 transition-all flex items-center justify-between group"
                      >
                        <div className="flex items-center gap-3 min-w-0 pr-2">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${theme.iconBg}`}>
                            <CategoryIcon size={16} />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-black text-slate-900 truncate">{sheet.name}</span>
                              <span className="font-mono text-[9px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.2 rounded">
                                {sheet.id}
                              </span>
                            </div>
                            <p className="text-[10px] text-slate-400 font-medium truncate mt-0.5">
                              Current: <span className="font-bold text-slate-600">{sheet.department}</span>
                            </p>
                          </div>
                        </div>

                        <button
                          onClick={() => handleAddExistingSheetToCategory(sheet.id, targetCategoryForExisting)}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1 shrink-0"
                        >
                          <Plus size={13} />
                          <span>Add to Category</span>
                        </button>
                      </div>
                    );
                  })
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsAddExistingModalOpen(false)}
                className="px-4 py-2 text-slate-600 font-bold hover:bg-slate-100 rounded-xl text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. PERMISSION MANAGEMENT MODAL */}
      {isPermissionsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div
            className="bg-white rounded-3xl max-w-3xl w-full p-6 sm:p-8 shadow-2xl border border-slate-200 space-y-6 max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                  <Shield size={20} />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">Sheet Access & Permissions</h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Authorize employees and departments to view specific Google Sheets
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsPermissionsModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Sheet Selector Bar */}
            <div className="bg-slate-50 border border-slate-200/80 p-3.5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
              <div className="flex-1">
                <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-1">
                  Selected Google Sheet
                </label>
                <select
                  value={permTargetSheetId}
                  onChange={e => setPermTargetSheetId(e.target.value)}
                  className="w-full bg-white border border-slate-200 text-slate-900 text-xs font-bold rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {activeSheetsList.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.id}) — {s.department}
                    </option>
                  ))}
                </select>
              </div>

              {/* Fast Grant/Clear Actions */}
              <div className="flex items-center gap-2 self-end sm:self-auto pt-2 sm:pt-0">
                <button
                  type="button"
                  onClick={() => handleSetAllPermissions(true)}
                  className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1"
                  title="Authorize all employees"
                >
                  <UserCheck size={14} />
                  <span>Grant All</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSetAllPermissions(false)}
                  className="px-3 py-2 bg-slate-100 hover:bg-red-50 hover:text-red-700 text-slate-600 border border-slate-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1"
                  title="Revoke all access"
                >
                  <UserX size={14} />
                  <span>Clear</span>
                </button>
              </div>
            </div>

            {/* Department Quick Grant Badges */}
            <div className="space-y-1.5 shrink-0">
              <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                Quick Grant by Department:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {allDepartments.slice(0, 8).map(dept => (
                  <button
                    key={dept}
                    type="button"
                    onClick={() => handleGrantDepartment(dept)}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-600 rounded-lg text-[11px] font-bold border border-slate-200 transition-all flex items-center gap-1"
                  >
                    <Plus size={11} />
                    <span>{dept}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Search & Department Filter */}
            <div className="flex items-center gap-3 shrink-0">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter team members by name, email or department..."
                  className="w-full bg-slate-50 border border-slate-200 text-slate-800 pl-9 pr-3 py-2 text-xs rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all font-medium"
                  value={permUserSearch}
                  onChange={e => setPermUserSearch(e.target.value)}
                />
              </div>

              <select
                value={permDeptFilter}
                onChange={e => setPermDeptFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="All">All Depts</option>
                {allDepartments.map(d => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            {/* Team Members Permission Toggle Grid */}
            <div className="flex-1 overflow-y-auto pr-1 space-y-2 max-h-[350px] custom-scrollbar">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {effectiveUsers
                  .filter(u => {
                    const matchSearch =
                      u.name.toLowerCase().includes(permUserSearch.toLowerCase()) ||
                      u.email.toLowerCase().includes(permUserSearch.toLowerCase()) ||
                      (u.department || '').toLowerCase().includes(permUserSearch.toLowerCase());
                    const matchDept = permDeptFilter === 'All' || (u.department || 'General') === permDeptFilter;
                    return matchSearch && matchDept;
                  })
                  .map(user => {
                    const isAssigned = (targetPermSheet?.assignedUsers || []).some(
                      email => email.toLowerCase() === user.email.toLowerCase()
                    );

                    return (
                      <div
                        key={user.id || user.email}
                        onClick={() => handleToggleUserPermission(user.email)}
                        className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between select-none ${
                          isAssigned
                            ? 'bg-emerald-50/70 border-emerald-300 text-emerald-950 shadow-2xs'
                            : 'bg-slate-50/70 border-slate-200 text-slate-700 hover:bg-slate-100 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0 pr-2">
                          <div
                            className={`w-8 h-8 rounded-xl flex items-center justify-center text-white font-bold shrink-0 text-xs ${
                              isAssigned ? 'bg-emerald-600' : 'bg-slate-600'
                            }`}
                          >
                            {user.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-black truncate">{user.name}</p>
                            <p className="text-[10px] text-slate-400 truncate">{user.department || 'General'}</p>
                          </div>
                        </div>

                        <div
                          className={`px-2.5 py-1 rounded-xl text-[10px] font-extrabold flex items-center gap-1 shrink-0 ${
                            isAssigned
                              ? 'bg-emerald-600 text-white shadow-2xs'
                              : 'bg-white text-slate-400 border border-slate-200'
                          }`}
                        >
                          {isAssigned ? (
                            <>
                              <Check size={11} className="stroke-[3]" />
                              <span>Allowed</span>
                            </>
                          ) : (
                            <>
                              <Lock size={10} />
                              <span>Restricted</span>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* Modal Bottom Footer */}
            <div className="flex justify-between items-center pt-3 border-t border-slate-100 shrink-0">
              <p className="text-[11px] text-slate-500 font-medium">
                Changes take effect immediately across all employee dashboards.
              </p>
              <button
                type="button"
                onClick={() => setIsPermissionsModalOpen(false)}
                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-xs"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SystemMaster;
