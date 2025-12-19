
import React from 'react';
import { Employee } from '../types';
import { DEPARTMENT_ROLES } from '../constants';
import { GitGraph, UserCircle } from 'lucide-react';

interface OrganizationTreeProps {
  employees: Employee[];
}

export const OrganizationTree: React.FC<OrganizationTreeProps> = ({ employees }) => {
  const departmentKeys = Object.keys(DEPARTMENT_ROLES);

  // Group employees by Department
  const employeesByDept = employees.reduce((acc, emp) => {
    const dept = emp.department || 'Unassigned';
    if (!acc[dept]) acc[dept] = [];
    acc[dept].push(emp);
    return acc;
  }, {} as Record<string, Employee[]>);

  return (
    <div className="p-4 md:p-8 bg-slate-50/50 h-full overflow-y-auto custom-scrollbar">
      <div className="mb-8 md:mb-12">
        <h2 className="text-2xl md:text-3xl font-extrabold text-slate-800 flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 text-white rounded-xl flex items-center justify-center shadow-lg shadow-indigo-600/20 shrink-0">
            <GitGraph size={20} />
          </div>
          Organization Structure
        </h2>
        <p className="text-slate-500 mt-2 font-medium md:ml-14">
          Visual hierarchy of departments and teams.
        </p>
      </div>

      <div className="max-w-7xl mx-auto space-y-12 pb-20">
        {/* Root Node: Kalra Buildtech */}
        <div className="flex flex-col items-center">
            <div className="bg-slate-900 text-white px-8 py-4 rounded-2xl shadow-xl border-4 border-white ring-1 ring-slate-200 z-10 text-center">
                <h1 className="text-xl font-black tracking-tight">KALRA BUILDTECH</h1>
                <p className="text-xs text-slate-400 font-medium uppercase tracking-widest mt-1">Headquarters</p>
            </div>
            <div className="h-12 w-0.5 bg-slate-300"></div>
        </div>

        {/* Tree Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8 relative">
           
           {departmentKeys.map((dept, index) => {
               const staff = employeesByDept[dept] || [];
               const roles = DEPARTMENT_ROLES[dept];
               const isLeadership = dept === 'CHAIRMAN' || dept === 'CEO';

               return (
                   <div key={dept} className={`flex flex-col ${isLeadership ? 'md:col-span-2 lg:col-span-4 items-center' : ''}`}>
                       {/* Dept Card */}
                       <div className={`w-full bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden group hover:shadow-md transition-all ${isLeadership ? 'max-w-md border-indigo-200 shadow-indigo-100' : ''}`}>
                           <div className={`px-4 py-3 border-b font-bold text-sm uppercase tracking-wide flex justify-between items-center ${isLeadership ? 'bg-indigo-50 text-indigo-800 border-indigo-100' : 'bg-slate-50 text-slate-600 border-slate-100'}`}>
                               <span>{dept}</span>
                               <span className="text-xs bg-white px-2 py-0.5 rounded border border-slate-200 text-slate-400">{staff.length}</span>
                           </div>
                           
                           <div className="p-4 space-y-3">
                               {staff.length === 0 ? (
                                   <div className="text-center py-4 text-slate-300 text-xs italic">
                                       No staff assigned
                                   </div>
                               ) : (
                                   roles.length > 0 ? (
                                       // If Roles are defined, sort by them
                                       roles.map(role => {
                                           const staffInRole = staff.filter(e => e.designation === role);
                                           if (staffInRole.length === 0) return null;
                                           return (
                                               <div key={role} className="mb-3 last:mb-0">
                                                   <div className="text-[10px] font-bold text-slate-400 uppercase mb-1.5">{role}</div>
                                                   <div className="space-y-2">
                                                       {staffInRole.map(emp => (
                                                           <div key={emp.id} className="flex items-center gap-3 p-2 rounded-xl bg-slate-50 border border-slate-100 hover:border-indigo-200 transition-colors">
                                                               <div className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-400 shrink-0 overflow-hidden">
                                                                   {emp.avatar ? <img src={emp.avatar} className="w-full h-full object-cover"/> : <UserCircle size={16}/>}
                                                               </div>
                                                               <div className="min-w-0">
                                                                   <p className="text-sm font-bold text-slate-700 truncate">{emp.name}</p>
                                                                   <p className="text-[10px] text-slate-400 font-mono">{emp.id}</p>
                                                               </div>
                                                           </div>
                                                       ))}
                                                   </div>
                                               </div>
                                           );
                                       })
                                   ) : (
                                       // No defined roles, just list staff
                                        <div className="space-y-2">
                                            {staff.map(emp => (
                                                <div key={emp.id} className="flex items-center gap-3 p-2 rounded-xl bg-slate-50 border border-slate-100 hover:border-indigo-200 transition-colors">
                                                    <div className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-400 shrink-0 overflow-hidden">
                                                        {emp.avatar ? <img src={emp.avatar} className="w-full h-full object-cover"/> : <UserCircle size={16}/>}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-bold text-slate-700 truncate">{emp.name}</p>
                                                        <p className="text-[10px] text-slate-400 font-mono">{emp.id}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                   )
                               )}
                               
                               {/* Catch-all for staff not matching specific roles if array was present */}
                               {roles.length > 0 && staff.filter(e => !roles.includes(e.designation || '')).length > 0 && (
                                   <div className="mt-4 pt-4 border-t border-slate-100">
                                       <div className="text-[10px] font-bold text-slate-400 uppercase mb-1.5">Other / Unassigned Role</div>
                                       <div className="space-y-2">
                                            {staff.filter(e => !roles.includes(e.designation || '')).map(emp => (
                                                <div key={emp.id} className="flex items-center gap-3 p-2 rounded-xl bg-slate-50 border border-slate-100 hover:border-red-200 transition-colors">
                                                    <div className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-400 shrink-0 overflow-hidden">
                                                         {emp.avatar ? <img src={emp.avatar} className="w-full h-full object-cover"/> : <UserCircle size={16}/>}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-bold text-slate-700 truncate">{emp.name}</p>
                                                        <p className="text-[10px] text-slate-400">{emp.designation || 'No Role'}</p>
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
           })}
        </div>
      </div>
    </div>
  );
};
