
import React, { useState } from 'react';
import { Employee } from '../types';
import { Archive, RotateCcw, FileText, X } from 'lucide-react';

interface ArchivedStaffProps {
  archivedEmployees: Employee[];
  setArchivedEmployees: React.Dispatch<React.SetStateAction<Employee[]>>;
  setEmployees: React.Dispatch<React.SetStateAction<Employee[]>>;
  employees: Employee[];
}

export const ArchivedStaff: React.FC<ArchivedStaffProps> = ({ 
    archivedEmployees, 
    setArchivedEmployees,
    setEmployees,
    employees 
}) => {
  const [showDocsModal, setShowDocsModal] = useState(false);
  const [currentEmp, setCurrentEmp] = useState<Employee | null>(null);

  const handleRestore = (id: string) => {
    if (window.confirm('Restore this team member to the active list? Login access will be restored.')) {
        const empToRestore = archivedEmployees.find(e => e.id === id);
        if (empToRestore) {
            // Add back to active list using functional update to ensure fresh state
            setEmployees(prev => {
                // Prevent duplicates
                if (prev.some(e => e.id === id)) return prev;
                return [...prev, { ...empToRestore, status: 'Active' }];
            });
            
            // Remove from archive list
            setArchivedEmployees(prev => prev.filter(e => e.id !== id));
        }
    }
  };

  const openDocsModal = (emp: Employee) => {
      setCurrentEmp(emp);
      setShowDocsModal(true);
  };

  const closeDocsModal = () => {
      setShowDocsModal(false);
      setCurrentEmp(null);
  };

  return (
    <div className="p-4 md:p-8 bg-slate-50/50 h-full overflow-y-auto custom-scrollbar">
      <div className="mb-8">
         <h2 className="text-2xl md:text-3xl font-extrabold text-slate-800 flex items-center gap-3">
          <div className="w-10 h-10 bg-slate-600 text-white rounded-xl flex items-center justify-center shadow-lg shadow-slate-600/20 shrink-0">
            <Archive size={20} />
          </div>
          Archived Team
        </h2>
        <p className="text-slate-500 mt-2 font-medium md:ml-14">Past team members and inactive records. View documents or restore profiles.</p>
      </div>

      <div className="bg-white rounded-3xl shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)] border border-slate-100 overflow-hidden mb-8">
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[800px]">
            <thead className="bg-slate-50/50 border-b border-slate-200">
              <tr>
                <th className="p-5 text-xs font-bold uppercase tracking-wider text-slate-500">ID</th>
                <th className="p-5 text-xs font-bold uppercase tracking-wider text-slate-500">Name</th>
                <th className="p-5 text-xs font-bold uppercase tracking-wider text-slate-500">Last Designation</th>
                <th className="p-5 text-xs font-bold uppercase tracking-wider text-slate-500">Status</th>
                <th className="p-5 text-xs font-bold uppercase tracking-wider text-slate-500 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {archivedEmployees.map((emp) => (
                <tr key={emp.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="p-5 font-mono text-sm font-bold text-slate-600">{emp.id}</td>
                  <td className="p-5 font-bold text-slate-800">{emp.name}</td>
                  <td className="p-5 text-slate-600">{emp.designation || emp.department}</td>
                  <td className="p-5">
                    <span className="bg-slate-100 text-slate-500 px-3 py-1 rounded-full text-xs font-bold border border-slate-200">
                      Archived
                    </span>
                  </td>
                  <td className="p-5 text-right">
                    <div className="flex justify-end gap-2">
                         <button 
                            onClick={() => openDocsModal(emp)}
                            className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 text-xs font-bold rounded-lg hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 flex items-center gap-1 transition-all shadow-sm"
                            title="View Documents"
                        >
                            <FileText size={14} /> Docs
                        </button>
                        <button 
                            onClick={() => handleRestore(emp.id)}
                            className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 text-xs font-bold rounded-lg hover:bg-green-50 hover:text-green-600 hover:border-green-200 flex items-center gap-1 transition-all shadow-sm"
                        >
                            <RotateCcw size={14} /> Restore
                        </button>
                    </div>
                  </td>
                </tr>
              ))}
              {archivedEmployees.length === 0 && (
                <tr>
                    <td colSpan={5} className="p-12 text-center text-slate-400">
                        <div className="flex flex-col items-center">
                            <Archive size={32} className="mb-2 opacity-20"/>
                            No archived records found.
                        </div>
                    </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

       {/* DOCUMENTS MODAL */}
       {showDocsModal && currentEmp && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
                  <div className="p-6 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
                      <div>
                        <h3 className="text-xl font-extrabold text-slate-800">Archived Documents</h3>
                        <p className="text-sm text-slate-500">{currentEmp.name} ({currentEmp.id}) - Read Only</p>
                      </div>
                      <button onClick={closeDocsModal} className="p-2 hover:bg-slate-200 rounded-full text-slate-500"><X size={20}/></button>
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
    </div>
  );
};
