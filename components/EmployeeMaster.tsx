import React, { useState } from 'react';
import api, { extractPayload as apiExtractPayload, ensureArray as apiEnsureArray, safeGet } from '../src/utils/api';
import { Employee, User, Role, ViewMode } from '../types';
import { DEPARTMENT_ROLES } from '../constants';
import { Users, ShieldCheck, UserPlus, Search, Mail, Phone, LogIn, FileText, Edit2, Archive, X, Lock, Trash2, AlertTriangle, Plus, LayoutGrid, List as ListIcon, Filter, ExternalLink, Shield, CheckSquare, Clock, Briefcase, ArrowLeft } from 'lucide-react';

interface EmployeeMasterProps {
  employees: Employee[];
  setEmployees: (v: Employee[]) => void;
  users: User[];
  setUsers: (v: User[]) => void;
  archivedEmployees: Employee[];
  setArchivedEmployees: (v: Employee[]) => void;
  onNavigate: (mode: ViewMode) => void;
  onSwitchUser: (u: User) => void;
  currentUser: User; // Current authenticated user (used for admin actions)
}

const extractPayload = apiExtractPayload;
const ensureArray = apiEnsureArray;

export const EmployeeMaster: React.FC<EmployeeMasterProps> = ({
  employees, setEmployees,
  users, setUsers,
  archivedEmployees, setArchivedEmployees,
  onNavigate,
  onSwitchUser,
  currentUser
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 20;
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDocsModal, setShowDocsModal] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null);
  const [reassignToId, setReassignToId] = useState<string>('');
  const [isDeleting, setIsDeleting] = useState(false);

  // State for Add/Edit
  const [currentEmp, setCurrentEmp] = useState<Partial<Employee>>({ status: 'Active' });
  const [password, setPassword] = useState(''); // For adding or editing user password
  const [role, setRole] = useState<Role>('EMPLOYEE'); // Role selection for new users

  // State for Admin Password Change
  const [editingAdminEmail, setEditingAdminEmail] = useState<string | null>(null);
  const [newAdminPassword, setNewAdminPassword] = useState('');

  // State for Login As
  const [loginTarget, setLoginTarget] = useState<User | null>(null);
  const [loginPass, setLoginPass] = useState('');

  // View States
  const [activeTab, setActiveTab] = useState('All');
  const [viewLayout, setViewLayout] = useState<'grid' | 'list'>('grid');
  const [selectedEmpDetail, setSelectedEmpDetail] = useState<Employee | null>(null);

  const openEmployeeDetail = async (emp: Employee) => {
    setSelectedEmpDetail(emp);
    if (emp.documents) return;
    try {
      const res = await safeGet(`/employees/${encodeURIComponent(emp.id)}`, { cacheTtlMs: 30000 });
      const full = extractPayload(res) as Employee | null;
      if (full) setSelectedEmpDetail({ ...emp, ...full });
    } catch (e) {
      console.warn('Could not load full employee profile', e);
    }
  };

  // Custom Dept/Role states
  const [isNewDept, setIsNewDept] = useState(false);
  const [isNewDesig, setIsNewDesig] = useState(false);

  const allDepartments = Array.from(new Set([
    ...Object.keys(DEPARTMENT_ROLES),
    ...employees.map(e => e.department)
  ])).filter(Boolean).sort();

  const getDesignationsForDept = (dept: string) => {
    const predefined = DEPARTMENT_ROLES[dept] || [];
    const existing = employees.filter(e => e.department === dept && e.designation).map(e => e.designation);
    return Array.from(new Set([...predefined, ...existing])).filter(Boolean).sort();
  };

  // --- Helpers ---

  const generateNextId = () => {
    const existingIds = employees.map(e => e.id);
    let maxId = 0;
    existingIds.forEach(id => {
      // Assuming ID format E001, E002...
      const match = id.match(/^E(\d+)$/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxId) maxId = num;
      }
    });
    const nextNum = maxId + 1;
    return `E${nextNum.toString().padStart(3, '0')}`;
  };

  const handleOpenAddModal = () => {
    setIsNewDept(false);
    setIsNewDesig(false);
    setCurrentEmp({
      status: 'Active',
      id: generateNextId(), // Auto-generate ID
      department: allDepartments[0] || '', // Default dept
      hideAttendance: false,
      employmentType: 'Full Time' // Default tenure
    });
    setPassword('');
    setRole('EMPLOYEE');
    setShowAddModal(true);
  };

  const handleDepartmentChange = (dept: string) => {
    if (dept === '__NEW__') {
      setIsNewDept(true);
      setCurrentEmp(prev => ({ ...prev, department: '', designation: '' }));
      setIsNewDesig(true);
    } else {
      setIsNewDept(false);
      setIsNewDesig(false);
      setCurrentEmp(prev => ({
        ...prev,
        department: dept,
        designation: '' // Reset designation when dept changes
      }));
    }
  };

  const handleAddEmployee = async () => {
    if (currentEmp.id && currentEmp.name && currentEmp.department) {
      let finalDesignation = currentEmp.designation;
      const allowedRoles = DEPARTMENT_ROLES[currentEmp.department] || [];
      if (!finalDesignation && allowedRoles.length === 0) {
        finalDesignation = currentEmp.department;
      }

      const newEmployee: Employee = {
        id: currentEmp.id,
        name: currentEmp.name,
        department: currentEmp.department,
        joiningDate: currentEmp.joiningDate || new Date().toISOString().split('T')[0],
        birthDate: currentEmp.birthDate, // Add DOB
        createdAt: new Date().toISOString(), // Track when added to system
        status: currentEmp.status as 'Active' | 'Inactive',
        designation: finalDesignation,
        email: currentEmp.email,
        phone: currentEmp.phone,
        hideAttendance: !!currentEmp.hideAttendance,
        employmentType: currentEmp.employmentType || 'Full Time'
      };

      setEmployees([...employees, newEmployee]);

      // Create employee on server (if available), then create the user account
      try {
        const empRes = await api.post('/employees', newEmployee, { withCredentials: true });
        const empPayload = extractPayload(empRes);
        if (empPayload) {
          // If API returned created employee, add it optimistically
          const created = Array.isArray(empPayload) ? empPayload[0] : empPayload;
          if (created && created.id) setEmployees([created as Employee, ...employees]);
          try { const r = await safeGet('/employees'); setEmployees(ensureArray(extractPayload(r))); } catch (e) { console.warn('Could not refresh employees after create', e && (e.stack || e.message || e)); }
        }
      } catch (err) {
        console.warn('Employee create failed on server, continuing with local copy', err && (err.stack || err.message || err));
      }

      if (currentEmp.email) {
        // Try to create user on server; fall back to local in offline mode
        try {
          const res = await api.post('/users', { name: currentEmp.name, email: currentEmp.email, password: password || '123', role, employeeId: currentEmp.id }, { withCredentials: true });
          const resPayload = extractPayload(res);
          if (resPayload) {
            const listRes = await safeGet('/users');
            setUsers(ensureArray(extractPayload(listRes)));

            // Optionally auto-login the newly created user (server session cookie)
            try {
              const loginRes = await api.post('/auth/login', { email: currentEmp.email, password: password || '123' }, { withCredentials: true });
              const loginPayload = extractPayload(loginRes);
              if (loginPayload?.user) onSwitchUser(loginPayload.user);
            } catch (e) {
              console.warn('Auto-login failed', e && (e.stack || e.message || e));
            }
          } else {
            setUsers([...users, ({ id: `L-${Date.now()}`, email: currentEmp.email, password: password || '123', role, name: currentEmp.name, employeeId: currentEmp.id } as User)]);
          }
        } catch (err) {
          console.error('Failed to create user on server, using local fallback', err && (err.stack || err.message || err));
          setUsers([...users, ({ id: `L-${Date.now()}`, email: currentEmp.email, password: password || '123', role, name: currentEmp.name, employeeId: currentEmp.id } as User)]);
        }
      }

      setShowAddModal(false);
      setCurrentEmp({ status: 'Active' });
      setPassword('');
    }
  };

  const openEditModal = async (emp: Employee) => {
    setIsNewDept(false);
    setIsNewDesig(false);
    let target = emp;
    if (!emp.documents) {
      try {
        const res = await safeGet(`/employees/${encodeURIComponent(emp.id)}`, { cacheTtlMs: 30000 });
        const full = extractPayload(res) as Employee | null;
        if (full) target = { ...emp, ...full };
      } catch (e) {
        console.warn('Could not load full employee for edit', e);
      }
    }
    setCurrentEmp(target);
    setPassword('');

    const linkedUser = users.find(u => u.employeeId === emp.id);
    setRole(linkedUser ? linkedUser.role : 'EMPLOYEE');

    setShowEditModal(true);
  };

  const openDocsModal = (emp: Employee) => {
    setCurrentEmp(emp);
    setShowDocsModal(true);
  };

  const handleEditEmployee = async () => {
    if (!currentEmp.id) return;

    // Optimistically update local employees
    setEmployees(employees.map(e => e.id === currentEmp.id ? { ...e, ...currentEmp } as Employee : e));

    // Update employee on server
    try {
      const empUpd = await api.put(`/employees/${currentEmp.id}`, currentEmp, { withCredentials: true });
      if (empUpd) {
        const refreshed = await safeGet('/employees');
        setEmployees(ensureArray(extractPayload(refreshed)));
      }
    } catch (err) {
      console.warn('Failed to update employee on server, keeping local copy', err && (err.stack || err.message || err));
    }

    // Update User details (Email, Role, Password)
    const linkedUser = users.find(u => u.employeeId === currentEmp.id);
    if (linkedUser && (linkedUser as any).id) {
      // Update server-side user when we have an id
      try {
        const updRes = await api.put(`/users/${(linkedUser as any).id}`, { name: currentEmp.name || linkedUser.name, email: currentEmp.email || linkedUser.email, password: password || undefined, role }, { withCredentials: true });
        if (updRes) {
          const list = await safeGet('/users');
          setUsers(ensureArray(extractPayload(list)));
        } else {
          setUsers(users.map(u => u.employeeId === currentEmp.id ? { ...u, name: currentEmp.name || u.name, email: currentEmp.email || u.email, role, password: password ? password : u.password } : u));
        }
      } catch (err) {
        console.error('Failed to update user on server, using local fallback', err && (err.stack || err.message || err));
        setUsers(users.map(u => u.employeeId === currentEmp.id ? { ...u, name: currentEmp.name || u.name, email: currentEmp.email || u.email, role, password: password ? password : u.password } : u));
      }
    } else if (currentEmp.email) {
      // Create user on server or fallback locally
      try {
        const res = await api.post('/users', { name: currentEmp.name || '', email: currentEmp.email, password: password || '123', role, employeeId: currentEmp.id }, { withCredentials: true });
        const payload = extractPayload(res);
        if (payload) {
          const list = await safeGet('/users');
          setUsers(ensureArray(extractPayload(list)));
          try {
            const lr = await api.post('/auth/login', { email: currentEmp.email, password: password || '123' }, { withCredentials: true });
            const d = extractPayload(lr);
            if (d?.user) onSwitchUser(d.user);
          } catch (e) { console.warn('Auto-login failed', e && (e.stack || e.message || e)); }
        } else {
          setUsers([...users, ({ id: `L-${Date.now()}`, email: currentEmp.email, password: password || '123', role, name: currentEmp.name || '', employeeId: currentEmp.id } as User)]);
        }
      } catch (err) {
        console.error('Failed to create user on server, using local fallback', err && (err.stack || err.message || err));
        setUsers([...users, ({ id: `L-${Date.now()}`, email: currentEmp.email, password: password || '123', role, name: currentEmp.name || '', employeeId: currentEmp.id } as User)]);
      }
    }

    setShowEditModal(false);
  };

  const handleUpdateAdminPassword = async (email: string) => {
    if (!newAdminPassword) {
      alert("Please enter a new password.");
      return;
    }
    try {
      // Find user on server
      const res = await safeGet('/users');
      const list = ensureArray(extractPayload(res));
      const user = list.find((u: any) => u.email === email);
      if (!user) throw new Error('User not found');
      const upd = await api.put(`/users/${user.id}`, { password: newAdminPassword }, { withCredentials: true });
      if (!upd) throw new Error('Update failed');
      const refreshed = await safeGet('/users');
      setUsers(ensureArray(extractPayload(refreshed)));
      setEditingAdminEmail(null);
      setNewAdminPassword('');
      alert("Admin password updated successfully.");
    } catch (err) {
      console.error('Failed to update admin password on server, using local fallback', err && (err.stack || err.message || err));
      setUsers(users.map(u => u.email === email ? { ...u, password: newAdminPassword } : u));
      setEditingAdminEmail(null);
      setNewAdminPassword('');
      alert("Admin password updated (local fallback).");
    }
  };

  const handlePermanentDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await api.delete(
        `/employees/${deleteTarget.id}/permanent`,
        { data: { replacementEmployeeId: reassignToId || undefined }, withCredentials: true } as any
      );
      setEmployees(employees.filter(e => e.id !== deleteTarget.id));
      setUsers(users.filter(u => u.employeeId !== deleteTarget.id));
      setShowDeleteModal(false);
      setDeleteTarget(null);
      setReassignToId('');
    } catch (err) {
      console.error('Permanent delete failed', err);
      alert('Failed to permanently delete. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleArchive = async (id: string) => {
    if (window.confirm('Are you sure you want to archive this team member? Data will be moved to the Archive section.')) {
      const empToArchive = employees.find(e => e.id === id);
      if (empToArchive) {
        // Optimistic UI update
        setArchivedEmployees([...archivedEmployees, { ...empToArchive, status: 'Inactive' }]);
        setEmployees(employees.filter(e => e.id !== id));
        onNavigate(ViewMode.ARCHIVED_STAFF);

        // Update server status and archive flags if possible
        try {
          // Mark employee archived
          await api.put(`/employees/${id}`, { status: 'Inactive', is_archived: 1 });

          // If there is a linked user, archive that user as well
          const linkedUser = users.find(u => u.employeeId === id);
          if (linkedUser && (linkedUser as any).id) {
            try {
              await api.delete(`/users/${(linkedUser as any).id}`);
            } catch (e) { console.warn('Failed to archive linked user', e); }
          }

          // Refresh server lists
          try {
            const r = await api.get('/employees?archived=1'); setArchivedEmployees(apiEnsureArray(apiExtractPayload(r)));
          } catch (e) { console.warn('Failed to refresh archived employees', e); }
          try {
            const uu = await api.get('/users'); setUsers(apiEnsureArray(apiExtractPayload(uu)));
          } catch (e) { console.warn('Failed to refresh users list', e); }

        } catch (err) {
          console.warn('Failed to archive employee on server', err);
        }
      }
    }
  };

  const attemptLogin = () => {
    if (loginTarget) {
      if (loginPass === loginTarget.password) {
        onSwitchUser(loginTarget);
        setLoginTarget(null);
        setLoginPass('');
      } else {
        alert("Incorrect Password. Access Denied.");
      }
    }
  };

  const filteredEmployees = employees.filter(e => {
    const term = searchTerm.toLowerCase();
    const matchesSearch = e.name.toLowerCase().includes(term) ||
      e.id.toLowerCase().includes(term) ||
      e.department.toLowerCase().includes(term);
    
    if (!matchesSearch) return false;

    if (activeTab === 'Active') return e.status === 'Active';
    if (activeTab === 'Full Time') return e.employmentType === 'Full Time' || e.employmentType === 'Probation';
    if (activeTab === 'Part Time') return e.employmentType === 'Part Time' || e.employmentType === 'Internship' || e.employmentType === 'Contractual';
    return true;
  });

  const totalPages = Math.ceil(filteredEmployees.length / rowsPerPage);
  const paginatedEmployees = filteredEmployees.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

  // Reset page when search changes
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  return (
    <div className="p-4 md:p-8 bg-slate-50 h-full overflow-y-auto custom-scrollbar">
      
      {selectedEmpDetail ? (
        <div className="animate-in fade-in slide-in-from-right-4 duration-300 max-w-5xl mx-auto">
          {/* Header for detail view */}
          <div className="flex items-center justify-between mb-6">
            <button onClick={() => setSelectedEmpDetail(null)} className="px-4 py-2 bg-white border border-slate-200 rounded-xl shadow-sm hover:bg-slate-50 text-slate-700 flex items-center gap-2 font-bold text-sm transition-colors">
              <ArrowLeft size={18} /> Back to Team
            </button>
            <div className="flex gap-2">
              <button onClick={() => { openEditModal(selectedEmpDetail); }} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-sm font-bold text-sm flex items-center gap-2 transition-colors">
                <Edit2 size={16} /> Edit Profile
              </button>
            </div>
          </div>
          
          <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden mb-8">
            <div className="h-28 bg-gradient-to-r from-slate-800 to-slate-900 relative">
              <div className="absolute inset-0 opacity-20 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] mix-blend-overlay"></div>
            </div>
            
            <div className="px-6 md:px-10 pb-10 relative">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8 relative z-10">
                <div className="flex flex-col md:flex-row items-center md:items-end gap-6 text-center md:text-left">
                  <div className="w-32 h-32 bg-white rounded-3xl p-1.5 shadow-lg border border-slate-100 shrink-0 -mt-16">
                    {selectedEmpDetail.avatar ? (
                      <img src={selectedEmpDetail.avatar} alt={selectedEmpDetail.name} className="w-full h-full rounded-2xl object-cover" />
                    ) : (
                      <div className="w-full h-full bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center font-black text-4xl shadow-inner">
                        {selectedEmpDetail.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="mb-2">
                    <div className="bg-slate-100 border border-slate-200 text-slate-700 px-3 py-1 rounded-lg font-mono text-xs font-bold w-max mx-auto md:mx-0 mb-3 shadow-sm flex items-center gap-2">
                      <Shield size={12} className="text-slate-400" /> ID: {selectedEmpDetail.id}
                    </div>
                    <h2 className="text-3xl font-black text-slate-900 leading-tight">{selectedEmpDetail.name}</h2>
                    <p className="text-slate-500 font-bold text-lg mt-1">{selectedEmpDetail.designation || 'Team Member'}</p>
                  </div>
                </div>
                
                <div className="flex items-center justify-center gap-3">
                  <span className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 shadow-sm border ${selectedEmpDetail.status === 'Active' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                    <div className={`w-2 h-2 rounded-full ${selectedEmpDetail.status === 'Active' ? 'bg-green-500' : 'bg-red-500'}`}></div>
                    {selectedEmpDetail.status}
                  </span>
                </div>
              </div>
              
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Column - Contact & Basic Info */}
                <div className="space-y-6">
                  <div className="bg-slate-50 rounded-3xl p-6 border border-slate-100">
                    <h3 className="text-xs font-bold text-slate-400 tracking-wider uppercase mb-5 flex items-center gap-3">
                      Contact Info <div className="h-px bg-slate-200 flex-1"></div>
                    </h3>
                    <div className="space-y-5">
                      <div className="flex items-start gap-4">
                        <div className="p-2.5 bg-white rounded-xl shadow-sm text-slate-500 border border-slate-100"><Mail size={18} /></div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-bold text-slate-400 uppercase mb-0.5">Email Address</p>
                          <p className="text-sm font-bold text-slate-800 truncate">{selectedEmpDetail.email || <span className="italic text-slate-400 font-normal">Not provided</span>}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-4">
                        <div className="p-2.5 bg-white rounded-xl shadow-sm text-slate-500 border border-slate-100"><Phone size={18} /></div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-bold text-slate-400 uppercase mb-0.5">Phone Number</p>
                          <p className="text-sm font-bold text-slate-800">{selectedEmpDetail.phone || <span className="italic text-slate-400 font-normal">Not provided</span>}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-slate-50 rounded-3xl p-6 border border-slate-100">
                    <h3 className="text-xs font-bold text-slate-400 tracking-wider uppercase mb-5 flex items-center gap-3">
                      Quick Actions <div className="h-px bg-slate-200 flex-1"></div>
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      <button onClick={() => { openDocsModal(selectedEmpDetail); }} className="p-4 bg-white border border-slate-200 text-slate-700 rounded-2xl text-xs font-bold hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 transition-all flex flex-col items-center justify-center gap-2.5 shadow-sm group">
                        <div className="p-2 bg-slate-50 rounded-xl group-hover:bg-blue-100 transition-colors"><FileText size={20}/></div>
                        Documents
                      </button>
                      <button onClick={() => alert('Role & Permissions management is handled via the Admin Access panel.')} className="p-4 bg-white border border-slate-200 text-slate-700 rounded-2xl text-xs font-bold hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 transition-all flex flex-col items-center justify-center gap-2.5 shadow-sm group">
                        <div className="p-2 bg-slate-50 rounded-xl group-hover:bg-blue-100 transition-colors"><Shield size={20}/></div>
                        Permissions
                      </button>
                      <button onClick={() => { setDeleteTarget(selectedEmpDetail); setShowDeleteModal(true); }} className="p-4 bg-white border border-slate-200 text-slate-700 rounded-2xl text-xs font-bold hover:bg-red-50 hover:text-red-700 hover:border-red-200 transition-all flex flex-col items-center justify-center gap-2.5 shadow-sm group col-span-2">
                        <div className="p-2 bg-slate-50 rounded-xl group-hover:bg-red-100 transition-colors"><Trash2 size={20} className="group-hover:text-red-600"/></div>
                        Delete Account
                      </button>
                    </div>
                  </div>
                </div>
                
                {/* Right Column - Work & Documents Summary */}
                <div className="lg:col-span-2 space-y-6">
                  <div className="bg-white rounded-3xl p-6 md:p-8 border border-slate-200 shadow-sm h-full flex flex-col">
                    <h3 className="text-xs font-bold text-slate-400 tracking-wider uppercase mb-6 flex items-center gap-4">Employment Details <div className="h-px bg-slate-100 flex-1"></div></h3>
                    <div className="grid grid-cols-2 gap-y-8 gap-x-6">
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Department</p>
                        <p className="text-sm font-bold text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100 inline-block">{selectedEmpDetail.department}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Tenure Type</p>
                        <div className="flex items-center gap-2 text-sm font-bold text-purple-700 bg-purple-50 border border-purple-100 px-3 py-1.5 rounded-lg inline-flex">
                          <div className="w-1.5 h-1.5 rounded-full bg-purple-500"></div>
                          {selectedEmpDetail.employmentType || 'Full Time'}
                        </div>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Joining Date</p>
                        <p className="text-base font-bold text-slate-800 flex items-center gap-2">
                          <Clock size={16} className="text-slate-400" />
                          {selectedEmpDetail.joiningDate ? new Date(selectedEmpDetail.joiningDate).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">System Added On</p>
                        <p className="text-base font-bold text-slate-800 flex items-center gap-2">
                          <Clock size={16} className="text-slate-400" />
                          {selectedEmpDetail.createdAt ? new Date(selectedEmpDetail.createdAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'}
                        </p>
                      </div>
                    </div>
                    
                    <h3 className="text-xs font-bold text-slate-400 tracking-wider uppercase mt-10 mb-6 flex items-center gap-4">Documents Overview <div className="h-px bg-slate-100 flex-1"></div></h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-auto">
                      {['Aadhar Front', 'Aadhar Back', 'PAN Front', 'PAN Back'].map((doc, i) => {
                        const hasDoc = [
                          selectedEmpDetail.documents?.aadharFront,
                          selectedEmpDetail.documents?.aadharBack,
                          selectedEmpDetail.documents?.panFront,
                          selectedEmpDetail.documents?.panBack
                        ][i];
                        return (
                          <div key={doc} className={`p-4 rounded-2xl border flex flex-col items-center justify-center gap-3 text-center transition-all ${hasDoc ? 'bg-green-50 border-green-200 text-green-700 shadow-sm' : 'bg-slate-50 border-dashed border-slate-200 text-slate-400'}`}>
                            {hasDoc ? <CheckSquare size={24} className="text-green-500"/> : <FileText size={24} className="opacity-50"/>}
                            <div>
                              <p className="text-[10px] font-bold uppercase">{doc}</p>
                              <p className={`text-[10px] mt-1 ${hasDoc ? 'font-bold bg-green-100 px-2 py-0.5 rounded-full' : 'italic font-medium'}`}>{hasDoc ? 'Uploaded' : 'Missing'}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center shadow-sm">
            <Users size={24} />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-900 leading-tight">Team Master</h2>
            <p className="text-slate-500 text-sm">Manage and monitor all team members across departments</p>
          </div>
        </div>
        <div className="flex gap-3">
          <button className="px-4 py-2.5 bg-white border border-slate-200 text-slate-700 font-semibold rounded-xl shadow-sm text-sm hover:bg-slate-50 transition-colors">
            + Import
          </button>
          <button onClick={() => setShowAdminModal(true)} className="px-4 py-2.5 bg-white border border-slate-200 text-slate-700 font-semibold rounded-xl shadow-sm text-sm flex items-center gap-2 hover:bg-slate-50 transition-colors">
            <ShieldCheck size={16} /> Admin Access
          </button>
          <button onClick={handleOpenAddModal} className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-sm text-sm flex items-center gap-2 transition-colors">
            <Plus size={16} /> Add Member
          </button>
        </div>
      </div>

      {/* STATS CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 border-t-4 border-t-blue-500 flex flex-col justify-between">
          <div className="flex justify-between items-start mb-4">
            <div className="p-2 bg-slate-50 rounded-lg text-slate-600"><Users size={18} /></div>
            <span className="px-2 py-0.5 bg-green-50 text-green-600 text-xs font-bold rounded-full">↑ 2 new</span>
          </div>
          <div>
            <h3 className="text-3xl font-black text-slate-800">{employees.length}</h3>
            <p className="text-xs font-bold text-slate-400 tracking-wider uppercase mt-1">Total Members</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 border-t-4 border-t-green-500 flex flex-col justify-between">
          <div className="flex justify-between items-start mb-4">
            <div className="p-2 bg-slate-50 rounded-lg text-green-600"><CheckSquare size={18} /></div>
            <span className="px-2 py-0.5 bg-green-50 text-green-600 text-xs font-bold rounded-full">{Math.round((employees.filter(e => e.status === 'Active').length / (employees.length || 1)) * 100)}%</span>
          </div>
          <div>
            <h3 className="text-3xl font-black text-slate-800">{employees.filter(e => e.status === 'Active').length}</h3>
            <p className="text-xs font-bold text-slate-400 tracking-wider uppercase mt-1">Active Members</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 border-t-4 border-t-purple-500 flex flex-col justify-between">
          <div className="flex justify-between items-start mb-4">
            <div className="p-2 bg-slate-50 rounded-lg text-purple-600"><Clock size={18} /></div>
            <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs font-bold rounded-full">{Math.round((employees.filter(e => e.employmentType === 'Full Time').length / (employees.length || 1)) * 100)}%</span>
          </div>
          <div>
            <h3 className="text-3xl font-black text-slate-800">{employees.filter(e => e.employmentType === 'Full Time').length}</h3>
            <p className="text-xs font-bold text-slate-400 tracking-wider uppercase mt-1">Full Time</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 border-t-4 border-t-orange-400 flex flex-col justify-between">
          <div className="flex justify-between items-start mb-4">
            <div className="p-2 bg-slate-50 rounded-lg text-orange-500"><Briefcase size={18} /></div>
            <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs font-bold rounded-full">Active</span>
          </div>
          <div>
            <h3 className="text-3xl font-black text-slate-800">{allDepartments.length}</h3>
            <p className="text-xs font-bold text-slate-400 tracking-wider uppercase mt-1">Departments</p>
          </div>
        </div>
      </div>

      {/* TOOLBAR */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-6">
        <div className="relative w-full md:w-[400px]">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="Search by Name, ID, or Department..." 
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all shadow-sm" 
            value={searchTerm} 
            onChange={e => setSearchTerm(e.target.value)} 
          />
        </div>
        
        <div className="flex items-center justify-between md:justify-end gap-6 w-full md:w-auto">
          <div className="flex gap-4 md:gap-5 text-sm font-semibold overflow-x-auto pb-2 md:pb-0 hide-scrollbar">
            <button onClick={() => setActiveTab('All')} className={`flex items-center gap-1.5 whitespace-nowrap transition-colors ${activeTab === 'All' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-700'}`}>All <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${activeTab === 'All' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>{employees.length}</span></button>
            <button onClick={() => setActiveTab('Active')} className={`flex items-center gap-1.5 whitespace-nowrap transition-colors ${activeTab === 'Active' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-700'}`}>Active <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${activeTab === 'Active' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>{employees.filter(e => e.status === 'Active').length}</span></button>
            <button onClick={() => setActiveTab('Full Time')} className={`flex items-center gap-1.5 whitespace-nowrap transition-colors ${activeTab === 'Full Time' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-700'}`}>Full Time <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${activeTab === 'Full Time' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>{employees.filter(e => e.employmentType === 'Full Time' || e.employmentType === 'Probation').length}</span></button>
            <button onClick={() => setActiveTab('Part Time')} className={`flex items-center gap-1.5 whitespace-nowrap transition-colors ${activeTab === 'Part Time' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-700'}`}>Part Time <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${activeTab === 'Part Time' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>{employees.filter(e => e.employmentType === 'Part Time' || e.employmentType === 'Internship' || e.employmentType === 'Contractual').length}</span></button>
          </div>
          
          <div className="flex items-center gap-3 shrink-0 hidden md:flex">
            <div className="flex bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
              <button onClick={() => setViewLayout('grid')} className={`p-1.5 rounded-lg transition-colors ${viewLayout === 'grid' ? 'bg-blue-50 text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}><LayoutGrid size={16} /></button>
              <button onClick={() => setViewLayout('list')} className={`p-1.5 rounded-lg transition-colors ${viewLayout === 'list' ? 'bg-blue-50 text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}><ListIcon size={16} /></button>
            </div>
            <button className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 font-semibold rounded-xl text-sm hover:bg-slate-50 shadow-sm transition-colors">
              <Filter size={16} /> Filter
            </button>
          </div>
        </div>
      </div>

      {/* CONTENT AREA */}
      {paginatedEmployees.length === 0 ? (
        <div className="bg-white rounded-3xl p-12 text-center border border-slate-100 shadow-sm flex flex-col items-center">
          <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4 border border-slate-100">
            <Search size={24} className="text-slate-300" />
          </div>
          <p className="text-slate-500 font-medium">No team members found matching your search.</p>
        </div>
      ) : viewLayout === 'list' ? (
        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden mb-8">
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[1000px]">
              <thead className="bg-slate-50/80 border-b border-slate-100">
                <tr>
                  <th className="p-5 text-xs font-bold uppercase tracking-wider text-slate-500">ID</th>
                  <th className="p-5 text-xs font-bold uppercase tracking-wider text-slate-500">Team Member Details</th>
                  <th className="p-5 text-xs font-bold uppercase tracking-wider text-slate-500">Contact</th>
                  <th className="p-5 text-xs font-bold uppercase tracking-wider text-slate-500">Department</th>
                  <th className="p-5 text-xs font-bold uppercase tracking-wider text-slate-500">Designation</th>
                  <th className="p-5 text-xs font-bold uppercase tracking-wider text-slate-500">Tenure</th>
                  <th className="p-5 text-xs font-bold uppercase tracking-wider text-slate-500">Status</th>
                  <th className="p-5 text-xs font-bold uppercase tracking-wider text-slate-500 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {paginatedEmployees.map((emp) => (
                  <tr key={emp.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="p-5 font-mono text-sm font-bold text-slate-600">{emp.id}</td>
                    <td className="p-5">
                      <div className="font-bold text-slate-800">{emp.name}</div>
                      <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                        <Mail size={10} className="text-slate-400" /> {emp.email || 'No Email'}
                      </div>
                    </td>
                    <td className="p-5">
                      {emp.phone ? (
                        <div className="flex items-center gap-1 text-slate-600 font-medium">
                          <Phone size={12} className="text-slate-400" /> {emp.phone}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 italic">No Phone</span>
                      )}
                    </td>
                    <td className="p-5">
                      <span className="bg-blue-50 text-blue-700 px-3 py-1 rounded-lg text-xs font-bold">
                        {emp.department}
                      </span>
                    </td>
                    <td className="p-5 text-slate-600 text-sm font-medium">{emp.designation || '-'}</td>
                    <td className="p-5">
                      <span className="bg-purple-50 text-purple-700 px-3 py-1 rounded-lg text-xs font-bold">
                        {emp.employmentType || 'Full Time'}
                      </span>
                    </td>
                    <td className="p-5">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold flex w-max items-center gap-1.5 ${emp.status === 'Active' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${emp.status === 'Active' ? 'bg-green-500' : 'bg-red-500'}`}></div>
                        {emp.status}
                      </span>
                    </td>
                    <td className="p-5 text-right">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => openEmployeeDetail(emp)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="View Details"><ExternalLink size={16}/></button>
                        <button onClick={() => openEditModal(emp)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Edit Profile"><Edit2 size={16} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-8">
          {paginatedEmployees.map((emp, i) => {
            const tints = ['from-blue-50/80', 'from-green-50/80', 'from-orange-50/80', 'from-purple-50/80', 'from-pink-50/80'];
            const tint = tints[i % tints.length];
            return (
              <div key={emp.id} className="bg-white rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all flex flex-col relative overflow-hidden">
                <div className={`h-24 bg-gradient-to-b ${tint} to-transparent absolute top-0 left-0 right-0 pointer-events-none`}></div>
                
                <div className="p-6 flex-1 z-10 relative">
                  <div className="flex justify-between items-start mb-5">
                    <div className="w-14 h-14 bg-white text-blue-600 rounded-2xl flex items-center justify-center font-bold text-xl shadow-sm border border-slate-100">
                      {emp.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                    </div>
                    <div className={`px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 bg-white shadow-sm border border-slate-100 ${emp.status === 'Active' ? 'text-green-600' : 'text-red-600'}`}>
                      <div className={`w-1.5 h-1.5 rounded-full ${emp.status === 'Active' ? 'bg-green-500' : 'bg-red-500'}`}></div>
                      {emp.status}
                    </div>
                  </div>
                  
                  <h3 className="font-bold text-lg text-slate-900 leading-tight mb-1">{emp.name}</h3>
                  <p className="text-sm text-slate-500 mb-5 font-medium">{emp.designation || 'Team Member'}</p>
                  
                  <div className="space-y-2.5 mb-6">
                    <div className="flex items-center gap-2.5 text-sm text-slate-600">
                      <Mail size={14} className="text-slate-400" />
                      <span className="truncate">{emp.email || <span className="italic text-slate-400">No email on record</span>}</span>
                    </div>
                    <div className="flex items-center gap-2.5 text-sm text-slate-600">
                      <Phone size={14} className="text-slate-400" />
                      <span>{emp.phone || <span className="italic text-slate-400">No phone on record</span>}</span>
                    </div>
                  </div>
                  
                  <div className="flex flex-wrap gap-2">
                    <span className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-bold">{emp.department}</span>
                    <span className="px-3 py-1.5 bg-purple-50 text-purple-700 rounded-lg text-xs font-bold flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-purple-400"></div>
                      {emp.employmentType || 'Full Time'}
                    </span>
                  </div>
                </div>
                
                <div className="px-4 py-3 border-t border-slate-50 flex items-center justify-between">
                  <div className="flex gap-1">
                    <button onClick={() => openEditModal(emp)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors" title="Edit Profile"><Edit2 size={15}/></button>
                    <button onClick={() => {}} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors" title="Permissions"><Shield size={15}/></button>
                    <button onClick={() => { setDeleteTarget(emp); setShowDeleteModal(true); }} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors" title="Delete"><Trash2 size={15}/></button>
                  </div>
                  <button onClick={() => openEmployeeDetail(emp)} className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold text-xs rounded-xl transition-colors">
                    View Details <ExternalLink size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-6 py-4 bg-white border border-slate-100 rounded-2xl shadow-sm mb-8">
          <span className="text-sm text-slate-500 font-medium">
            Showing {(currentPage - 1) * rowsPerPage + 1} to {Math.min(currentPage * rowsPerPage, filteredEmployees.length)} of {filteredEmployees.length} entries
          </span>
          <div className="flex gap-2">
            <button 
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="px-4 py-2 text-sm font-bold rounded-xl border border-slate-200 bg-white text-slate-600 disabled:opacity-50 hover:bg-slate-50 transition-colors"
            >
              Previous
            </button>
            <button 
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="px-4 py-2 text-sm font-bold rounded-xl border border-slate-200 bg-white text-slate-600 disabled:opacity-50 hover:bg-slate-50 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}

        </>
      )}



      {/* ADD MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center shrink-0">
              <h3 className="text-xl font-extrabold text-slate-800">Add New Team Member</h3>
              <button onClick={() => setShowAddModal(false)} className="p-2 hover:bg-slate-200 rounded-full text-slate-500"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Member ID</label>
                  <input
                    type="text"
                    className="w-full border border-slate-200 bg-slate-50 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-mono font-bold text-slate-600"
                    value={currentEmp.id || ''}
                    onChange={e => setCurrentEmp({ ...currentEmp, id: e.target.value })}
                    placeholder="E001"
                    readOnly // Auto-generated
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">System Role</label>
                  <select
                    className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none bg-white font-medium"
                    value={role}
                    onChange={(e) => setRole(e.target.value as Role)}
                  >
                    <option value="EMPLOYEE">Team Member</option>
                    <option value="ADMIN">Administrator</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Name</label>
                <input
                  type="text"
                  className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  value={currentEmp.name || ''}
                  onChange={e => setCurrentEmp({ ...currentEmp, name: e.target.value })}
                  placeholder="John Doe"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Department</label>
                {isNewDept ? (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                      placeholder="Enter new department"
                      value={currentEmp.department || ''}
                      onChange={e => setCurrentEmp({ ...currentEmp, department: e.target.value })}
                      autoFocus
                    />
                    <button type="button" onClick={() => { setIsNewDept(false); setIsNewDesig(false); setCurrentEmp({...currentEmp, department: allDepartments[0] || '', designation: ''}); }} className="px-3 text-slate-400 hover:text-slate-600 bg-slate-100 rounded-xl">
                      <X size={20} />
                    </button>
                  </div>
                ) : (
                  <select
                    className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none bg-white transition-all"
                    value={currentEmp.department || ''}
                    onChange={e => handleDepartmentChange(e.target.value)}
                  >
                    {allDepartments.map(dept => (
                      <option key={dept} value={dept}>{dept}</option>
                    ))}
                    <option value="__NEW__" className="font-bold text-blue-600">+ Add New Department...</option>
                  </select>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Designation / Role</label>
                {isNewDesig || isNewDept ? (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                      placeholder="Enter designation / role"
                      value={currentEmp.designation || ''}
                      onChange={e => setCurrentEmp({ ...currentEmp, designation: e.target.value })}
                      autoFocus={!isNewDept}
                    />
                    {!isNewDept && (
                      <button type="button" onClick={() => { setIsNewDesig(false); setCurrentEmp({...currentEmp, designation: ''}); }} className="px-3 text-slate-400 hover:text-slate-600 bg-slate-100 rounded-xl">
                        <X size={20} />
                      </button>
                    )}
                  </div>
                ) : (
                  <select
                    className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none bg-white transition-all"
                    value={currentEmp.designation || ''}
                    onChange={e => {
                      if (e.target.value === '__NEW__') {
                        setIsNewDesig(true);
                        setCurrentEmp({ ...currentEmp, designation: '' });
                      } else {
                        setCurrentEmp({ ...currentEmp, designation: e.target.value });
                      }
                    }}
                  >
                    <option value="">Select Designation</option>
                    {getDesignationsForDept(currentEmp.department || '').map(role => (
                      <option key={role} value={role}>{role}</option>
                    ))}
                    <option value="__NEW__" className="font-bold text-blue-600">+ Add New Designation...</option>
                  </select>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Tenure / Employment Type</label>
                <select
                  className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none bg-white transition-all"
                  value={currentEmp.employmentType || 'Full Time'}
                  onChange={e => setCurrentEmp({ ...currentEmp, employmentType: e.target.value })}
                >
                  <option value="Full Time">Full Time</option>
                  <option value="Probation">Probation</option>
                  <option value="Contractual">Contractual</option>
                  <option value="Internship">Internship</option>
                  <option value="Part Time">Part Time</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Phone Number</label>
                  <input
                    type="text"
                    className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    value={currentEmp.phone || ''}
                    onChange={e => setCurrentEmp({ ...currentEmp, phone: e.target.value })}
                    placeholder="9876543210"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Date of Birth</label>
                  <input
                    type="date"
                    className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    value={currentEmp.birthDate || ''}
                    onChange={e => setCurrentEmp({ ...currentEmp, birthDate: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Joining Date</label>
                <input
                  type="date"
                  className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  value={currentEmp.joiningDate || ''}
                  onChange={e => setCurrentEmp({ ...currentEmp, joiningDate: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Email (Login ID)</label>
                  <input
                    type="email"
                    className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    value={currentEmp.email || ''}
                    onChange={e => setCurrentEmp({ ...currentEmp, email: e.target.value })}
                    placeholder="user@fms.com"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Login Password</label>
                  <input
                    type="password"
                    className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Enter password"
                  />
                </div>
              </div>
              <div className="mt-3">
                <label className="inline-flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={!!currentEmp.hideAttendance} onChange={e => setCurrentEmp({ ...currentEmp, hideAttendance: e.target.checked })} />
                  <span className="text-xs font-bold text-slate-600">Hide attendance from Admins</span>
                </label>
              </div>
            </div>
            <div className="p-6 bg-slate-50/50 flex justify-end gap-3 border-t border-slate-100 shrink-0">
              <button onClick={() => setShowAddModal(false)} className="px-5 py-2.5 text-slate-600 font-bold hover:bg-slate-100 rounded-xl">Cancel</button>
              <button onClick={handleAddEmployee} className="px-5 py-2.5 bg-slate-900 text-white rounded-xl font-bold shadow-lg shadow-slate-900/20">Save Record</button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT MODAL */}
      {showEditModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-100 bg-blue-50/50 flex justify-between items-center shrink-0">
              <h3 className="text-xl font-extrabold text-blue-900">Edit Profile</h3>
              <button onClick={() => setShowEditModal(false)} className="p-2 hover:bg-blue-100 rounded-full text-blue-800"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto custom-scrollbar">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Name</label>
                <input
                  type="text"
                  className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none"
                  value={currentEmp.name || ''}
                  onChange={e => setCurrentEmp({ ...currentEmp, name: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Department</label>
                {isNewDept ? (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                      placeholder="Enter new department"
                      value={currentEmp.department || ''}
                      onChange={e => setCurrentEmp({ ...currentEmp, department: e.target.value })}
                      autoFocus
                    />
                    <button type="button" onClick={() => { setIsNewDept(false); setIsNewDesig(false); setCurrentEmp({...currentEmp, department: allDepartments[0] || '', designation: ''}); }} className="px-3 text-slate-400 hover:text-slate-600 bg-slate-100 rounded-xl">
                      <X size={20} />
                    </button>
                  </div>
                ) : (
                  <select
                    className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none bg-white transition-all"
                    value={currentEmp.department || ''}
                    onChange={e => handleDepartmentChange(e.target.value)}
                  >
                    {allDepartments.map(dept => (
                      <option key={dept} value={dept}>{dept}</option>
                    ))}
                    <option value="__NEW__" className="font-bold text-blue-600">+ Add New Department...</option>
                  </select>
                )}
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Designation / Role</label>
                {isNewDesig || isNewDept ? (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                      placeholder="Enter designation / role"
                      value={currentEmp.designation || ''}
                      onChange={e => setCurrentEmp({ ...currentEmp, designation: e.target.value })}
                      autoFocus={!isNewDept}
                    />
                    {!isNewDept && (
                      <button type="button" onClick={() => { setIsNewDesig(false); setCurrentEmp({...currentEmp, designation: ''}); }} className="px-3 text-slate-400 hover:text-slate-600 bg-slate-100 rounded-xl">
                        <X size={20} />
                      </button>
                    )}
                  </div>
                ) : (
                  <select
                    className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none bg-white transition-all"
                    value={currentEmp.designation || ''}
                    onChange={e => {
                      if (e.target.value === '__NEW__') {
                        setIsNewDesig(true);
                        setCurrentEmp({ ...currentEmp, designation: '' });
                      } else {
                        setCurrentEmp({ ...currentEmp, designation: e.target.value });
                      }
                    }}
                  >
                    <option value="">Select Designation</option>
                    {getDesignationsForDept(currentEmp.department || '').map(role => (
                      <option key={role} value={role}>{role}</option>
                    ))}
                    <option value="__NEW__" className="font-bold text-blue-600">+ Add New Designation...</option>
                  </select>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Tenure / Employment Type</label>
                <select
                  className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none bg-white transition-all"
                  value={currentEmp.employmentType || 'Full Time'}
                  onChange={e => setCurrentEmp({ ...currentEmp, employmentType: e.target.value })}
                >
                  <option value="Full Time">Full Time</option>
                  <option value="Probation">Probation</option>
                  <option value="Contractual">Contractual</option>
                  <option value="Internship">Internship</option>
                  <option value="Part Time">Part Time</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Phone</label>
                  <input
                    type="text"
                    className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none"
                    value={currentEmp.phone || ''}
                    onChange={e => setCurrentEmp({ ...currentEmp, phone: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Date of Birth</label>
                  <input
                    type="date"
                    className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none"
                    value={currentEmp.birthDate || ''}
                    onChange={e => setCurrentEmp({ ...currentEmp, birthDate: e.target.value })}
                  />
                </div>                  <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Joining Date</label>
                  <input
                    type="date"
                    className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none"
                    value={currentEmp.joiningDate || ''}
                    onChange={e => setCurrentEmp({ ...currentEmp, joiningDate: e.target.value })}
                  />
                </div>              </div>

              <hr className="border-slate-100 my-2" />
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2 flex items-center gap-1"><Mail size={12} /> Email (Login ID)</label>
                  <input
                    type="email"
                    className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none"
                    value={currentEmp.email || ''}
                    onChange={e => setCurrentEmp({ ...currentEmp, email: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2 flex items-center gap-1"><ShieldCheck size={12} /> System Role</label>
                  <select
                    className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                    value={role}
                    onChange={e => setRole(e.target.value as Role)}
                  >
                    <option value="EMPLOYEE">Team Member</option>
                    <option value="ADMIN">Administrator</option>
                  </select>
                </div>
              </div>

              <div className="bg-red-50 p-4 rounded-xl mt-2">
                <label className="block text-xs font-bold text-red-500 uppercase mb-2 flex items-center gap-1"><Lock size={12} /> Reset Password</label>
                <input
                  type="password"
                  className="w-full border border-red-100 rounded-xl p-3 focus:ring-2 focus:ring-red-500 outline-none bg-white placeholder-red-200"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter new password to reset"
                />
              </div>
              <div className="mt-3">
                <label className="inline-flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={!!currentEmp.hideAttendance} onChange={e => setCurrentEmp({ ...currentEmp, hideAttendance: e.target.checked })} />
                  <span className="text-xs font-bold text-slate-600">Hide attendance from Admins</span>
                </label>
              </div>
            </div>
            <div className="p-6 bg-slate-50/50 flex justify-end gap-3 border-t border-slate-100 shrink-0">
              <button onClick={() => setShowEditModal(false)} className="px-5 py-2.5 text-slate-600 font-bold hover:bg-slate-100 rounded-xl">Cancel</button>
              <button onClick={handleEditEmployee} className="px-5 py-2.5 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-600/20">Update Profile</button>
            </div>
          </div>
        </div>
      )}

      {/* DOCUMENTS MODAL */}
      {showDocsModal && currentEmp && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
              <div>
                <h3 className="text-xl font-extrabold text-slate-800">Member Documents</h3>
                <p className="text-sm text-slate-500">{currentEmp.name} ({currentEmp.id})</p>
              </div>
              <button onClick={() => setShowDocsModal(false)} className="p-2 hover:bg-slate-200 rounded-full text-slate-500"><X size={20} /></button>
            </div>
            <div className="p-6 overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {[
                  { label: 'Aadhar Front', val: currentEmp.documents?.aadharFront },
                  { label: 'Aadhar Back', val: currentEmp.documents?.aadharBack },
                  { label: 'PAN Front', val: currentEmp.documents?.panFront },
                  { label: 'PAN Back', val: currentEmp.documents?.panBack },
                ].map((doc, idx) => (
                  <div key={idx} className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
                    <h4 className="font-bold text-slate-700 mb-3 text-sm uppercase">{doc.label}</h4>
                    {doc.val ? (
                      <div className="space-y-3">
                        <div className="h-40 bg-slate-200 rounded-lg overflow-hidden border border-slate-300">
                          <img src={doc.val} alt={doc.label} className="w-full h-full object-contain" />
                        </div>
                        <a
                          href={doc.val}
                          download={`${currentEmp.name}_${doc.label}`}
                          className="block w-full text-center py-2 bg-white border border-slate-300 rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-100 hover:text-blue-600"
                        >
                          Download
                        </a>
                      </div>
                    ) : (
                      <div className="h-40 flex items-center justify-center text-slate-400 bg-slate-100 rounded-lg border-2 border-dashed border-slate-200">
                        <span className="text-xs font-bold">Not Uploaded</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ADMIN ACCESS MODAL */}
      {showAdminModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col">
            <div className="p-6 border-b border-slate-100 bg-slate-900 text-white flex justify-between items-center">
              <h3 className="text-xl font-extrabold flex items-center gap-2"><ShieldCheck size={24} /> Admin Access Control</h3>
              <button onClick={() => setShowAdminModal(false)} className="p-2 hover:bg-white/10 rounded-full text-white/70 hover:text-white"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-6">
              <p className="text-sm text-slate-500 bg-slate-50 p-3 rounded-xl border border-slate-100">
                Manage login credentials for system administrators. These accounts have full access to the FMS.
              </p>
              <div className="space-y-3">
                {users.filter(u => u.role === 'ADMIN').map(admin => (
                  <div key={admin.email} className="p-4 border border-slate-200 rounded-2xl flex flex-col gap-3 hover:border-slate-300 transition-colors shadow-sm">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-bold text-slate-800 text-lg">{admin.name}</div>
                        <div className="text-sm text-slate-500 flex items-center gap-1"><Mail size={12} /> {admin.email}</div>
                      </div>
                      <div className="bg-slate-900 text-white text-[10px] px-2 py-1 rounded font-bold uppercase tracking-wider">Super Admin</div>
                    </div>

                    {editingAdminEmail === admin.email ? (
                      <div className="mt-2 bg-slate-50 p-3 rounded-xl border border-slate-200 animate-in fade-in slide-in-from-top-2">
                        <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">New Password</label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-slate-500"
                            value={newAdminPassword}
                            onChange={(e) => setNewAdminPassword(e.target.value)}
                            placeholder="Enter new password"
                          />
                          <button
                            onClick={() => handleUpdateAdminPassword(admin.email)}
                            className="bg-green-600 text-white px-4 py-2 rounded-lg font-bold text-xs hover:bg-green-700"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => { setEditingAdminEmail(null); setNewAdminPassword(''); }}
                            className="bg-white border border-slate-300 text-slate-600 px-3 py-2 rounded-lg font-bold text-xs hover:bg-slate-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setEditingAdminEmail(admin.email); setNewAdminPassword(''); }}
                        className="self-start mt-2 text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-100 hover:border-indigo-200 transition-colors"
                      >
                        <Lock size={12} /> Change Password
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* LOGIN AS MODAL */}
      {loginTarget && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col">
            <div className="p-6 border-b border-slate-100 bg-indigo-50/50 flex justify-between items-center">
              <h3 className="text-lg font-extrabold text-indigo-900">Login Verification</h3>
              <button onClick={() => setLoginTarget(null)} className="p-2 hover:bg-indigo-100 rounded-full text-indigo-800"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-600">
                Please enter the password for <span className="font-bold text-slate-800">{loginTarget.name}</span> to access their dashboard.
              </p>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Password</label>
                <input
                  type="password"
                  className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-indigo-500 outline-none"
                  value={loginPass}
                  onChange={e => setLoginPass(e.target.value)}
                  placeholder="Enter member password"
                />
              </div>
            </div>
            <div className="p-6 bg-slate-50/50 flex justify-end gap-3 border-t border-slate-100">
              <button onClick={() => setLoginTarget(null)} className="px-5 py-2.5 text-slate-600 font-bold hover:bg-slate-100 rounded-xl">Cancel</button>
              <button onClick={attemptLogin} className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-600/20">Access Dashboard</button>
            </div>
          </div>
        </div>
      )}

      {/* PERMANENT DELETE MODAL */}
      {showDeleteModal && deleteTarget && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
            {/* Header */}
            <div className="p-6 bg-red-50 border-b border-red-100 flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-red-100 flex items-center justify-center shrink-0">
                <Trash2 size={22} className="text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-extrabold text-red-900">Permanently Delete Member</h3>
                <p className="text-sm text-red-600 font-medium mt-0.5">
                  {deleteTarget.name} &nbsp;·&nbsp; <span className="font-mono">{deleteTarget.id}</span>
                </p>
              </div>
              <button onClick={() => setShowDeleteModal(false)} className="ml-auto p-2 hover:bg-red-100 rounded-full text-red-400">
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-5">
              {/* Warning */}
              <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex gap-3">
                <AlertTriangle size={16} className="text-red-500 shrink-0 mt-0.5" />
                <div className="text-xs text-red-700 leading-relaxed space-y-1">
                  <p><strong>This action is irreversible.</strong> The following will be permanently removed:</p>
                  <ul className="list-disc ml-4 space-y-0.5">
                    <li>Employee record ({deleteTarget.id})</li>
                    <li>Linked login account ({deleteTarget.email || 'none'})</li>
                    <li>All checklist templates & schedules assigned to them</li>
                  </ul>
                </div>
              </div>

              {/* Reassign tasks */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Reassign Their Tasks To (Optional)
                </label>
                <select
                  className="w-full border border-slate-200 rounded-xl p-3 bg-slate-50 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-red-400"
                  value={reassignToId}
                  onChange={e => setReassignToId(e.target.value)}
                >
                  <option value="">— Leave tasks unassigned —</option>
                  {employees
                    .filter(e => e.id !== deleteTarget.id && e.status === 'Active')
                    .map(e => (
                      <option key={e.id} value={e.id}>{e.name} ({e.id})</option>
                    ))}
                </select>
                <p className="text-[11px] text-slate-400 mt-1.5">
                  If no replacement is selected, tasks will remain in the system as unassigned.
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="px-5 py-2.5 text-slate-600 font-bold hover:bg-slate-100 rounded-xl text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handlePermanentDelete}
                disabled={isDeleting}
                className="flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-xl font-bold shadow-lg shadow-red-600/20 active:scale-95 transition-all text-sm"
              >
                {isDeleting
                  ? <><span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> Deleting…</>
                  : <><Trash2 size={14} /> Permanently Delete</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
