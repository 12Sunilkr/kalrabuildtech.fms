
import React, { useState } from 'react';
import { Employee, User, ViewMode, Role } from '../types';
import { DEPARTMENT_ROLES } from '../constants';
import { Plus, Search, Trash2, Edit2, UserPlus, Users, X, Save, Lock, Archive, Shield, FileText, Download, LogIn, Mail, Phone, ShieldCheck, Cake } from 'lucide-react';

interface EmployeeMasterProps {
  employees: Employee[];
  setEmployees: React.Dispatch<React.SetStateAction<Employee[]>>;
  users: User[];
  setUsers: React.Dispatch<React.SetStateAction<User[]>>;
  archivedEmployees: Employee[];
  setArchivedEmployees: React.Dispatch<React.SetStateAction<Employee[]>>;
  onNavigate: (view: ViewMode) => void;
  onSwitchUser: (user: User) => void;
}

export const EmployeeMaster: React.FC<EmployeeMasterProps> = ({ 
  employees, setEmployees, 
  users, setUsers, 
  archivedEmployees, setArchivedEmployees,
  onNavigate,
  onSwitchUser
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDocsModal, setShowDocsModal] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  
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

  const departments = Object.keys(DEPARTMENT_ROLES);

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
    setCurrentEmp({ 
        status: 'Active',
        id: generateNextId(), // Auto-generate ID
        department: departments[0] // Default dept
    }); 
    setPassword('');
    setRole('EMPLOYEE');
    setShowAddModal(true); 
  };

  const handleDepartmentChange = (dept: string) => {
     setCurrentEmp(prev => ({
         ...prev,
         department: dept,
         designation: '' // Reset designation when dept changes
     }));
  };

  const handleAddEmployee = () => {
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
        phone: currentEmp.phone
      };

      setEmployees([...employees, newEmployee]);
      
      if (currentEmp.email) {
          setUsers([...users, {
              email: currentEmp.email,
              password: password || '123', 
              role: role,
              name: currentEmp.name,
              employeeId: currentEmp.id
          }]);
      }

      setShowAddModal(false);
      setCurrentEmp({ status: 'Active' });
      setPassword('');
    }
  };

  const openEditModal = (emp: Employee) => {
    setCurrentEmp(emp);
    setPassword(''); 
    
    // Find linked user to pre-fill role
    const linkedUser = users.find(u => u.employeeId === emp.id);
    if (linkedUser) {
        setRole(linkedUser.role);
    } else {
        setRole('EMPLOYEE');
    }
    
    setShowEditModal(true);
  };

  const openDocsModal = (emp: Employee) => {
    setCurrentEmp(emp);
    setShowDocsModal(true);
  };

  const handleEditEmployee = () => {
    if (!currentEmp.id) return;
    
    setEmployees(employees.map(e => e.id === currentEmp.id ? { ...e, ...currentEmp } as Employee : e));

    // Update User details (Email, Role, Password)
    const linkedUser = users.find(u => u.employeeId === currentEmp.id);
    if (linkedUser) {
        setUsers(users.map(u => {
            if (u.employeeId === currentEmp.id) {
                return {
                    ...u,
                    name: currentEmp.name || u.name,
                    email: currentEmp.email || u.email,
                    role: role, // Update Role from state
                    password: password ? password : u.password 
                };
            }
            return u;
        }));
    } else if (currentEmp.email) {
        // If user didn't exist but email is now provided, create user
        setUsers([...users, {
            email: currentEmp.email,
            password: password || '123',
            role: role,
            name: currentEmp.name || '',
            employeeId: currentEmp.id
        }]);
    }

    setShowEditModal(false);
  };

  const handleUpdateAdminPassword = (email: string) => {
    if (!newAdminPassword) {
        alert("Please enter a new password.");
        return;
    }
    setUsers(users.map(u => u.email === email ? { ...u, password: newAdminPassword } : u));
    setEditingAdminEmail(null);
    setNewAdminPassword('');
    alert("Admin password updated successfully.");
  };

  const handleArchive = (id: string) => {
    if (window.confirm('Are you sure you want to archive this team member? Data will be moved to the Archive section.')) {
      const empToArchive = employees.find(e => e.id === id);
      if (empToArchive) {
          setArchivedEmployees([...archivedEmployees, { ...empToArchive, status: 'Inactive' }]);
          setEmployees(employees.filter(e => e.id !== id));
          onNavigate(ViewMode.ARCHIVED_STAFF);
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

  const filteredEmployees = employees.filter(e => 
    e.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.department.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-4 md:p-8 bg-slate-50/50 h-full overflow-y-auto custom-scrollbar">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4">
        <div>
           <h2 className="text-2xl md:text-3xl font-extrabold text-slate-800 flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-800 text-white rounded-xl flex items-center justify-center shadow-lg shadow-slate-900/20 shrink-0">
              <Users size={20} />
            </div>
            Team Master
          </h2>
          <p className="text-slate-500 mt-2 font-medium md:ml-14">Active Team Records: <span className="font-bold text-slate-800">{employees.length}</span></p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
            <button 
                onClick={() => setShowAdminModal(true)}
                className="flex-1 md:flex-none bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 px-5 py-3 rounded-xl flex items-center justify-center gap-2 font-bold shadow-sm"
            >
                <ShieldCheck size={18} /> Admin Access
            </button>
            <button 
                onClick={handleOpenAddModal}
                className="flex-1 md:flex-none bg-slate-900 hover:bg-slate-800 text-white px-5 py-3 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-slate-900/20 transition-all active:scale-95 font-bold"
            >
                <UserPlus size={18} />
                Add Member
            </button>
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)] border border-slate-100 overflow-hidden mb-8">
        <div className="p-6 border-b border-slate-100 flex gap-4 bg-white/50">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input 
              type="text"
              placeholder="Search by Name, ID, or Dept..."
              className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[1000px]">
            <thead className="bg-slate-50/50 border-b border-slate-200">
              <tr>
                <th className="p-5 text-xs font-bold uppercase tracking-wider text-slate-500">ID</th>
                <th className="p-5 text-xs font-bold uppercase tracking-wider text-slate-500">Team Member Details</th>
                <th className="p-5 text-xs font-bold uppercase tracking-wider text-slate-500">Contact</th>
                <th className="p-5 text-xs font-bold uppercase tracking-wider text-slate-500">Department</th>
                <th className="p-5 text-xs font-bold uppercase tracking-wider text-slate-500">Designation</th>
                <th className="p-5 text-xs font-bold uppercase tracking-wider text-slate-500">Status</th>
                <th className="p-5 text-xs font-bold uppercase tracking-wider text-slate-500 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredEmployees.map((emp) => (
                <tr key={emp.id} className="hover:bg-slate-50/80 transition-colors group">
                  <td className="p-5 font-mono text-sm font-bold text-slate-600">{emp.id}</td>
                  <td className="p-5">
                      <div className="font-bold text-slate-800">{emp.name}</div>
                      <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                          <Mail size={10} className="text-slate-400"/> {emp.email || 'No Email'}
                      </div>
                  </td>
                  <td className="p-5">
                      {emp.phone ? (
                          <div className="flex items-center gap-1 text-slate-600 font-medium">
                              <Phone size={12} className="text-slate-400"/> {emp.phone}
                          </div>
                      ) : (
                          <span className="text-xs text-slate-400 italic">No Phone</span>
                      )}
                  </td>
                  <td className="p-5">
                    <span className="bg-blue-50 text-blue-700 px-3 py-1 rounded-lg text-xs font-bold border border-blue-100">
                      {emp.department}
                    </span>
                  </td>
                  <td className="p-5 text-slate-600 text-sm font-medium">{emp.designation || '-'}</td>
                  <td className="p-5">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold border ${
                      emp.status === 'Active' 
                        ? 'bg-green-50 text-green-700 border-green-100' 
                        : 'bg-red-50 text-red-700 border-red-100'
                    }`}>
                      {emp.status}
                    </span>
                  </td>
                  <td className="p-5 text-right">
                    <div className="flex justify-end gap-2">
                       <button 
                        onClick={() => {
                            const u = users.find(u => u.employeeId === emp.id);
                            if (u) {
                                setLoginTarget(u);
                                setLoginPass('');
                            } else {
                                alert("No user account linked to this member.");
                            }
                        }}
                        className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                        title="Login as User"
                      >
                        <LogIn size={16} />
                      </button>
                       <button 
                        onClick={() => openDocsModal(emp)}
                        className="p-2 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                        title="View Documents"
                      >
                        <FileText size={16} />
                      </button>
                      <button 
                        onClick={() => openEditModal(emp)}
                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Edit Profile"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button 
                        onClick={() => handleArchive(emp.id)} 
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Archive Member"
                      >
                        <Archive size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredEmployees.length === 0 && (
            <div className="p-12 text-center text-slate-400 flex flex-col items-center">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                 <Search size={24} className="text-slate-300" />
              </div>
              <p>No team members found matching your search.</p>
            </div>
          )}
        </div>
      </div>

      {/* ADD MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center shrink-0">
               <h3 className="text-xl font-extrabold text-slate-800">Add New Team Member</h3>
               <button onClick={() => setShowAddModal(false)} className="p-2 hover:bg-slate-200 rounded-full text-slate-500"><X size={20}/></button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Member ID</label>
                    <input 
                      type="text" 
                      className="w-full border border-slate-200 bg-slate-50 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-mono font-bold text-slate-600"
                      value={currentEmp.id || ''}
                      onChange={e => setCurrentEmp({...currentEmp, id: e.target.value})}
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
                  onChange={e => setCurrentEmp({...currentEmp, name: e.target.value})}
                  placeholder="John Doe"
                />
              </div>
              
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Department</label>
                <select 
                  className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none bg-white transition-all"
                  value={currentEmp.department || ''}
                  onChange={e => handleDepartmentChange(e.target.value)}
                >
                    {departments.map(dept => (
                        <option key={dept} value={dept}>{dept}</option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Designation / Role</label>
                {currentEmp.department && DEPARTMENT_ROLES[currentEmp.department]?.length > 0 ? (
                    <select 
                      className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none bg-white transition-all"
                      value={currentEmp.designation || ''}
                      onChange={e => setCurrentEmp({...currentEmp, designation: e.target.value})}
                    >
                        <option value="">Select Designation</option>
                        {DEPARTMENT_ROLES[currentEmp.department].map(role => (
                            <option key={role} value={role}>{role}</option>
                        ))}
                    </select>
                ) : (
                    <input 
                      type="text" 
                      className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all bg-slate-50 text-slate-500"
                      value={currentEmp.department || ''} // Auto-fill with Dept Name
                      readOnly
                    />
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Phone Number</label>
                    <input 
                        type="text" 
                        className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                        value={currentEmp.phone || ''}
                        onChange={e => setCurrentEmp({...currentEmp, phone: e.target.value})}
                        placeholder="9876543210"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Date of Birth</label>
                    <input 
                        type="date" 
                        className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                        value={currentEmp.birthDate || ''}
                        onChange={e => setCurrentEmp({...currentEmp, birthDate: e.target.value})}
                    />
                  </div>
              </div>
              
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Joining Date</label>
                <input 
                    type="date" 
                    className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    value={currentEmp.joiningDate || ''}
                    onChange={e => setCurrentEmp({...currentEmp, joiningDate: e.target.value})}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Email (Login ID)</label>
                    <input 
                    type="email" 
                    className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    value={currentEmp.email || ''}
                    onChange={e => setCurrentEmp({...currentEmp, email: e.target.value})}
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
               <button onClick={() => setShowEditModal(false)} className="p-2 hover:bg-blue-100 rounded-full text-blue-800"><X size={20}/></button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Name</label>
                <input 
                  type="text" 
                  className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none"
                  value={currentEmp.name || ''}
                  onChange={e => setCurrentEmp({...currentEmp, name: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Department</label>
                <select 
                  className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none bg-white transition-all"
                  value={currentEmp.department || ''}
                  onChange={e => handleDepartmentChange(e.target.value)}
                >
                    {departments.map(dept => (
                        <option key={dept} value={dept}>{dept}</option>
                    ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Designation / Role</label>
                {currentEmp.department && DEPARTMENT_ROLES[currentEmp.department]?.length > 0 ? (
                    <select 
                      className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none bg-white transition-all"
                      value={currentEmp.designation || ''}
                      onChange={e => setCurrentEmp({...currentEmp, designation: e.target.value})}
                    >
                        <option value="">Select Designation</option>
                        {DEPARTMENT_ROLES[currentEmp.department].map(role => (
                            <option key={role} value={role}>{role}</option>
                        ))}
                    </select>
                ) : (
                    <input 
                      type="text" 
                      className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all bg-slate-50 text-slate-500"
                      value={currentEmp.department || ''}
                      readOnly
                    />
                )}
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Phone</label>
                    <input 
                      type="text" 
                      className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none"
                      value={currentEmp.phone || ''}
                      onChange={e => setCurrentEmp({...currentEmp, phone: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Date of Birth</label>
                    <input 
                      type="date" 
                      className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none"
                      value={currentEmp.birthDate || ''}
                      onChange={e => setCurrentEmp({...currentEmp, birthDate: e.target.value})}
                    />
                  </div>
              </div>
              
              <hr className="border-slate-100 my-2"/>
              <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2 flex items-center gap-1"><Mail size={12}/> Email (Login ID)</label>
                    <input 
                      type="email" 
                      className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none"
                      value={currentEmp.email || ''}
                      onChange={e => setCurrentEmp({...currentEmp, email: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2 flex items-center gap-1"><ShieldCheck size={12}/> System Role</label>
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
                  <label className="block text-xs font-bold text-red-500 uppercase mb-2 flex items-center gap-1"><Lock size={12}/> Reset Password</label>
                  <input 
                    type="password" 
                    className="w-full border border-red-100 rounded-xl p-3 focus:ring-2 focus:ring-red-500 outline-none bg-white placeholder-red-200"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Enter new password to reset"
                  />
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
                      <button onClick={() => setShowDocsModal(false)} className="p-2 hover:bg-slate-200 rounded-full text-slate-500"><X size={20}/></button>
                  </div>
                  <div className="p-6 overflow-y-auto">
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
                    <h3 className="text-xl font-extrabold flex items-center gap-2"><ShieldCheck size={24}/> Admin Access Control</h3>
                    <button onClick={() => setShowAdminModal(false)} className="p-2 hover:bg-white/10 rounded-full text-white/70 hover:text-white"><X size={20}/></button>
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
                                        <div className="text-sm text-slate-500 flex items-center gap-1"><Mail size={12}/> {admin.email}</div>
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
                                        <Lock size={12}/> Change Password
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
               <button onClick={() => setLoginTarget(null)} className="p-2 hover:bg-indigo-100 rounded-full text-indigo-800"><X size={20}/></button>
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

    </div>
  );
};
