
import React from 'react';
import { Employee } from '../types';
import { DEPARTMENT_ROLES } from '../constants';
import { Network, UserCircle, Briefcase, Building2, PaintBucket, Landmark, PieChart, ShieldCheck, Users, HardHat, GitBranch } from 'lucide-react';

interface OrganizationTreeProps {
  employees: Employee[];
}

const getDeptIcon = (dept: string) => {
    switch (dept) {
        case 'CHAIRMAN': return <Landmark size={20} />;
        case 'CEO': return <Briefcase size={20} />;
        case 'Construction & Execution': return <HardHat size={20} />;
        case 'Architecture & Design': return <PaintBucket size={20} />;
        case 'Purchase': return <Building2 size={20} />;
        case 'Finance & Accounts': return <PieChart size={20} />;
        case 'Sales & Marketing': return <Network size={20} />;
        case 'Legal Compliance & Approvals': return <ShieldCheck size={20} />;
        case 'Administration & HR': return <Users size={20} />;
        default: return <Briefcase size={20} />;
    }
};

export const OrganizationTree: React.FC<OrganizationTreeProps> = ({ employees }) => {
  const departmentKeys = Object.keys(DEPARTMENT_ROLES);

  // Group employees by Department
  const employeesByDept = employees.reduce((acc, emp) => {
    const dept = emp.department || 'Unassigned';
    if (!acc[dept]) acc[dept] = [];
    acc[dept].push(emp);
    return acc;
  }, {} as Record<string, Employee[]>);

  const renderDeptCard = (dept: string, index: number, isLeadership: boolean = false) => {
      const staff = employeesByDept[dept] || [];
      const roles = DEPARTMENT_ROLES[dept] || [];
      
      return (
        <div 
          key={dept} 
          className={`relative group animate-fade-in-up flex flex-col h-full`}
          style={{ animationDelay: `${index * 50}ms` }}
        >
            <div className={`absolute -inset-0.5 bg-gradient-to-br ${isLeadership ? 'from-blue-600 to-indigo-600' : 'from-slate-200 to-slate-300'} rounded-[2rem] blur opacity-20 group-hover:opacity-40 transition duration-500`}></div>
            <div className="relative bg-white rounded-[2rem] shadow-xl border border-slate-100 flex flex-col h-full overflow-hidden transition-all duration-300 group-hover:-translate-y-1">
                
                {/* Header */}
                <div className={`p-6 border-b ${isLeadership ? 'bg-gradient-to-br from-slate-900 to-slate-800 text-white' : 'bg-slate-50 border-slate-100 text-slate-800'}`}>
                    <div className="flex justify-between items-center mb-2">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-inner ${isLeadership ? 'bg-white/10 text-blue-400' : 'bg-white text-indigo-600 shadow-sm'}`}>
                            {getDeptIcon(dept)}
                        </div>
                        <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full ${isLeadership ? 'bg-white/10 text-slate-300' : 'bg-slate-200 text-slate-600'}`}>
                            {staff.length} {staff.length === 1 ? 'Member' : 'Members'}
                        </span>
                    </div>
                    <h3 className="font-black text-lg tracking-tight leading-tight mt-4 uppercase">
                        {dept}
                    </h3>
                </div>

                {/* Staff List */}
                <div className="p-6 flex-1 bg-white space-y-6 overflow-y-auto custom-scrollbar max-h-[400px]">
                   {staff.length === 0 ? (
                       <div className="flex flex-col items-center justify-center py-8 text-slate-300">
                           <Users size={32} className="mb-2 opacity-50" />
                           <span className="text-[10px] font-bold uppercase tracking-widest">No Active Personnel</span>
                       </div>
                   ) : (
                       roles.length > 0 ? (
                           roles.map(role => {
                               const staffInRole = staff.filter(e => e.designation === role);
                               if (staffInRole.length === 0) return null;
                               return (
                                   <div key={role} className="space-y-3">
                                       <div className="flex items-center gap-2">
                                           <div className="h-px bg-slate-100 flex-1"></div>
                                           <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">{role}</span>
                                           <div className="h-px bg-slate-100 flex-1"></div>
                                       </div>
                                       <div className="space-y-2">
                                           {staffInRole.map(emp => (
                                               <div key={emp.id} className="flex items-center gap-4 p-3 rounded-2xl bg-slate-50/50 border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/30 transition-colors group/emp">
                                                   <div className="w-10 h-10 rounded-[1rem] bg-white border border-slate-200 flex items-center justify-center text-slate-400 shrink-0 overflow-hidden shadow-sm group-hover/emp:shadow-indigo-100 transition-all">
                                                       {emp.avatar ? <img src={emp.avatar} className="w-full h-full object-cover"/> : <UserCircle size={20}/>}
                                                   </div>
                                                   <div className="min-w-0">
                                                       <p className="text-sm font-black text-slate-700 truncate group-hover/emp:text-indigo-900 transition-colors">{emp.name}</p>
                                                       <p className="text-[10px] text-slate-400 font-bold tracking-widest uppercase mt-0.5">{emp.id}</p>
                                                   </div>
                                               </div>
                                           ))}
                                       </div>
                                   </div>
                               );
                           })
                       ) : (
                           <div className="space-y-2">
                               {staff.map(emp => (
                                   <div key={emp.id} className="flex items-center gap-4 p-3 rounded-2xl bg-slate-50/50 border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/30 transition-colors group/emp">
                                       <div className="w-10 h-10 rounded-[1rem] bg-white border border-slate-200 flex items-center justify-center text-slate-400 shrink-0 overflow-hidden shadow-sm group-hover/emp:shadow-indigo-100 transition-all">
                                           {emp.avatar ? <img src={emp.avatar} className="w-full h-full object-cover"/> : <UserCircle size={20}/>}
                                       </div>
                                       <div className="min-w-0">
                                           <p className="text-sm font-black text-slate-700 truncate group-hover/emp:text-indigo-900 transition-colors">{emp.name}</p>
                                           <p className="text-[10px] text-slate-400 font-bold tracking-widest uppercase mt-0.5">{emp.id}</p>
                                       </div>
                                   </div>
                               ))}
                           </div>
                       )
                   )}
                   
                   {/* Catch-all for staff not matching specific roles */}
                   {roles.length > 0 && staff.filter(e => !roles.includes(e.designation || '')).length > 0 && (
                       <div className="space-y-3 pt-2">
                           <div className="flex items-center gap-2">
                               <div className="h-px bg-slate-100 flex-1"></div>
                               <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Other Support</span>
                               <div className="h-px bg-slate-100 flex-1"></div>
                           </div>
                           <div className="space-y-2">
                                {staff.filter(e => !roles.includes(e.designation || '')).map(emp => (
                                    <div key={emp.id} className="flex items-center gap-4 p-3 rounded-2xl bg-slate-50/50 border border-slate-100 hover:border-slate-300 transition-colors group/emp">
                                        <div className="w-10 h-10 rounded-[1rem] bg-white border border-slate-200 flex items-center justify-center text-slate-400 shrink-0 overflow-hidden shadow-sm">
                                             {emp.avatar ? <img src={emp.avatar} className="w-full h-full object-cover"/> : <UserCircle size={20}/>}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-sm font-black text-slate-700 truncate">{emp.name}</p>
                                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">{emp.designation || 'No Role'}</p>
                                        </div>
                                    </div>
                                ))}
                           </div>
                       </div>
                   )}
                </div>
            </div>
        </div>
      );
  };

  const topTier = ['CHAIRMAN', 'CEO'];
  const operationalDepts = departmentKeys.filter(d => !topTier.includes(d));

  return (
    <div className="p-4 md:p-10 bg-[#f8fafc] h-full overflow-y-auto custom-scrollbar">
      <div className="mb-12 md:mb-16 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
            <h2 className="text-3xl md:text-4xl font-black text-slate-800 flex items-center gap-4 tracking-tight">
            <div className="w-14 h-14 bg-gradient-to-br from-indigo-600 to-blue-700 text-white rounded-[1.2rem] flex items-center justify-center shadow-xl shadow-indigo-600/20 shrink-0 transform -rotate-3">
                <GitBranch size={28} />
            </div>
            Corporate Hierarchy
            </h2>
            <p className="text-slate-500 mt-3 font-bold text-sm tracking-wide md:ml-18">
            Strategic organizational structure and departmental divisions.
            </p>
        </div>
        <div className="px-6 py-3 bg-white border border-slate-200 rounded-2xl shadow-sm text-center">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Workforce</p>
            <p className="text-2xl font-black text-indigo-600 leading-none">{employees.length}</p>
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto pb-24">
        
        {/* Head of Organization */}
        <div className="flex flex-col items-center mb-16 animate-fade-in-up">
            <div className="relative group cursor-default">
                <div className="absolute -inset-2 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 rounded-[2.5rem] blur-xl opacity-30 group-hover:opacity-50 transition duration-1000"></div>
                <div className="relative bg-slate-900 text-white px-16 py-10 rounded-[2.5rem] shadow-2xl z-10 text-center flex flex-col items-center border border-slate-700/50 backdrop-blur-xl">
                    <div className="absolute top-0 right-0 p-6 text-white/5 transform group-hover:scale-110 transition-transform duration-700">
                        <Building2 size={120} />
                    </div>
                    <div className="w-20 h-20 bg-gradient-to-br from-slate-700 to-slate-800 rounded-2xl flex items-center justify-center mb-6 text-blue-400 shadow-inner border border-slate-600 relative z-10">
                        <Landmark size={40} />
                    </div>
                    <h1 className="text-4xl font-black tracking-tighter uppercase relative z-10">Kalra Buildtech</h1>
                    <p className="text-xs text-blue-400 font-black uppercase tracking-[0.4em] mt-4 relative z-10">Headquarters</p>
                </div>
            </div>
            
            {/* Main Trunk */}
            <div className="h-16 w-1.5 bg-gradient-to-b from-slate-900 to-indigo-200 rounded-full my-2"></div>
        </div>

        {/* Leadership Tier */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 max-w-4xl mx-auto mb-16 relative">
             {/* Branching Lines for Leadership */}
             <div className="hidden md:block absolute top-0 left-1/4 right-1/4 h-1.5 bg-indigo-200 -mt-2 rounded-full"></div>
             <div className="hidden md:block absolute top-0 left-1/4 w-1.5 h-6 bg-indigo-200 -mt-2 rounded-b-full"></div>
             <div className="hidden md:block absolute top-0 right-1/4 w-1.5 h-6 bg-indigo-200 -mt-2 rounded-b-full"></div>
             
             {topTier.map((dept, index) => renderDeptCard(dept, index, true))}
        </div>

        {/* Operational Departments Tier */}
        <div className="flex flex-col items-center mb-16">
             <div className="h-16 w-1.5 bg-gradient-to-b from-indigo-200 to-slate-200 rounded-full"></div>
             <div className="px-8 py-3 bg-white border border-slate-200 rounded-full shadow-sm text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] z-10">
                 Operational Divisions
             </div>
             <div className="h-12 w-1.5 bg-slate-200 rounded-full -mt-4"></div>
        </div>

        {/* Departments Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
           {operationalDepts.map((dept, index) => renderDeptCard(dept, index + topTier.length, false))}
        </div>
      </div>
    </div>
  );
};
