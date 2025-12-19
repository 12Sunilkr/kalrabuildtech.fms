
import React, { useState } from 'react';
import { ClientFinancial, VendorFinancial, User, Project } from '../types';
import { DollarSign, TrendingUp, TrendingDown, Plus, Search, Calendar, X, AlertCircle, Clock, History, Printer, Download, MapPin } from 'lucide-react';
import { isPast } from 'date-fns';

interface FinanceDashboardProps {
  clientFinancials: ClientFinancial[];
  setClientFinancials: React.Dispatch<React.SetStateAction<ClientFinancial[]>>;
  vendorFinancials: VendorFinancial[];
  setVendorFinancials: React.Dispatch<React.SetStateAction<VendorFinancial[]>>;
  projects: Project[];
  setProjects: React.Dispatch<React.SetStateAction<Project[]>>;
  currentUser: User;
}

export const FinanceDashboard: React.FC<FinanceDashboardProps> = ({
  clientFinancials, setClientFinancials,
  vendorFinancials, setVendorFinancials,
  projects, setProjects,
  currentUser
}) => {
  const [activeTab, setActiveTab] = useState<'CLIENT' | 'VENDOR'>('CLIENT');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modals
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState<string | null>(null); // ID of record to show history for
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null); // To attach payment to
  const [paymentAmount, setPaymentAmount] = useState<number | ''>('');
  const [paymentMode, setPaymentMode] = useState('Cheque');
  const [paymentRemarks, setPaymentRemarks] = useState('');
  
  // Create New Record State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newClientFin, setNewClientFin] = useState<Partial<ClientFinancial>>({});
  const [newVendorFin, setNewVendorFin] = useState<Partial<VendorFinancial>>({});
  
  // New Project Creation State inside Modal
  const [isNewProjectMode, setIsNewProjectMode] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectLocation, setNewProjectLocation] = useState('');

  // --- Calculations ---
  
  const totalReceivables = clientFinancials.reduce((acc, curr) => acc + curr.totalDealValue, 0);
  const totalReceived = clientFinancials.reduce((acc, curr) => acc + curr.receivedAmount, 0);
  const totalPendingIn = totalReceivables - totalReceived;

  const totalPayables = vendorFinancials.reduce((acc, curr) => acc + curr.totalAmount, 0);
  const totalPaid = vendorFinancials.reduce((acc, curr) => acc + curr.paidAmount, 0);
  const totalPendingOut = totalPayables - totalPaid;

  // --- Helpers ---

  const formatCurrency = (val: number) => {
      return new Intl.NumberFormat('en-IN', {
          style: 'currency',
          currency: 'INR',
          maximumFractionDigits: 0
      }).format(val);
  };

  const isOverdue = (dateStr?: string) => {
      if (!dateStr) return false;
      const date = new Date(dateStr);
      return isPast(date) && !isToday(date);
  };

  const isToday = (someDate: Date) => {
    const today = new Date();
    return someDate.getDate() == today.getDate() &&
      someDate.getMonth() == today.getMonth() &&
      someDate.getFullYear() == today.getFullYear();
  };

  const handleAddPayment = () => {
      if (!paymentAmount || !selectedRecordId) return;

      const amt = Number(paymentAmount);
      const today = new Date().toISOString().split('T')[0];

      if (activeTab === 'CLIENT') {
          setClientFinancials(prev => prev.map(rec => {
              if (rec.id === selectedRecordId) {
                  const newReceived = rec.receivedAmount + amt;
                  const newBalance = rec.totalDealValue - newReceived;
                  return {
                      ...rec,
                      receivedAmount: newReceived,
                      balance: newBalance,
                      lastPaymentDate: today,
                      status: newBalance <= 0 ? 'Paid' : 'Pending',
                      transactions: [
                          ...rec.transactions, 
                          { 
                              id: `TX-${Date.now()}`,
                              date: today,
                              amount: amt,
                              mode: paymentMode as any,
                              remarks: paymentRemarks
                          }
                      ]
                  };
              }
              return rec;
          }));
      } else {
           setVendorFinancials(prev => prev.map(rec => {
              if (rec.id === selectedRecordId) {
                  const newPaid = rec.paidAmount + amt;
                  const newBalance = rec.totalAmount - newPaid;
                  return {
                      ...rec,
                      paidAmount: newPaid,
                      balance: newBalance,
                      status: newBalance <= 0 ? 'Paid' : (newPaid > 0 ? 'Partially Paid' : 'Pending'),
                      transactions: [
                          ...rec.transactions, 
                          { 
                              id: `TX-${Date.now()}`,
                              date: today,
                              amount: amt,
                              mode: paymentMode as any,
                              remarks: paymentRemarks
                          }
                      ]
                  };
              }
              return rec;
          }));
      }

      setShowPaymentModal(false);
      resetPaymentForm();
  };

  const handleCreateRecord = () => {
      if (activeTab === 'CLIENT') {
          let finalProjectId = newClientFin.projectId;

          // If creating a new project on the fly
          if (isNewProjectMode && newProjectName) {
              const newProjId = `P-${Date.now()}`;
              const newProject: Project = {
                  id: newProjId,
                  name: newProjectName,
                  location: newProjectLocation || 'Main Site',
                  status: 'ACTIVE',
                  assignedEmployees: [],
                  description: 'Created from Finance Dashboard'
              };
              
              // Update projects state
              setProjects(prev => [...prev, newProject]);
              finalProjectId = newProjId;
          }

          if (finalProjectId && newClientFin.clientName && newClientFin.totalDealValue) {
              const newRec: ClientFinancial = {
                  id: `FIN-C${Date.now()}`,
                  projectId: finalProjectId,
                  clientName: newClientFin.clientName,
                  totalDealValue: Number(newClientFin.totalDealValue),
                  receivedAmount: 0,
                  balance: Number(newClientFin.totalDealValue),
                  registrationDate: newClientFin.registrationDate || new Date().toISOString().split('T')[0],
                  status: 'Pending',
                  transactions: []
              };
              setClientFinancials([...clientFinancials, newRec]);
              
              // Reset
              setShowCreateModal(false);
              setNewClientFin({});
              setIsNewProjectMode(false);
              setNewProjectName('');
              setNewProjectLocation('');
          } else {
              alert("Please select a project and enter client details.");
          }
      } else {
          if (newVendorFin.vendorName && newVendorFin.totalAmount) {
              const newRec: VendorFinancial = {
                  id: `FIN-V${Date.now()}`,
                  vendorName: newVendorFin.vendorName!,
                  category: newVendorFin.category || 'General',
                  invoiceNo: newVendorFin.invoiceNo || '-',
                  invoiceDate: newVendorFin.invoiceDate || '',
                  dueDate: newVendorFin.dueDate || '',
                  totalAmount: Number(newVendorFin.totalAmount),
                  paidAmount: 0,
                  balance: Number(newVendorFin.totalAmount),
                  status: 'Pending',
                  transactions: []
              };
              setVendorFinancials([...vendorFinancials, newRec]);
              setShowCreateModal(false);
              setNewVendorFin({});
          }
      }
  };

  const handlePrint = () => {
      window.print();
  };

  const handleExport = () => {
      const data = activeTab === 'CLIENT' ? filteredClientData : filteredVendorData;
      if (data.length === 0) return alert("No data to export.");

      let csvContent = "data:text/csv;charset=utf-8,";
      
      if (activeTab === 'CLIENT') {
          csvContent += "Client Name,Project,Total Deal,Received,Balance,Registration Date,Status\n";
          (data as ClientFinancial[]).forEach(row => {
              csvContent += `${row.clientName},${row.projectId},${row.totalDealValue},${row.receivedAmount},${row.balance},${row.registrationDate || '-'},${row.status}\n`;
          });
      } else {
          csvContent += "Vendor,Category,Invoice No,Total Amount,Paid,Balance,Due Date,Status\n";
          (data as VendorFinancial[]).forEach(row => {
              csvContent += `${row.vendorName},${row.category},${row.invoiceNo},${row.totalAmount},${row.paidAmount},${row.balance},${row.dueDate || '-'},${row.status}\n`;
          });
      }

      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `Finance_Report_${activeTab}_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  const handleDownloadHistory = (record: ClientFinancial | VendorFinancial) => {
      let csvContent = "data:text/csv;charset=utf-8,";
      csvContent += "Date,Amount,Mode,Remarks\n";
      
      record.transactions.forEach(tx => {
          csvContent += `${tx.date},${tx.amount},${tx.mode},"${tx.remarks || ''}"\n`;
      });

      const name = 'clientName' in record ? record.clientName : record.vendorName;
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `${name.replace(/\s+/g, '_')}_History.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  const resetPaymentForm = () => {
      setPaymentAmount('');
      setPaymentRemarks('');
      setPaymentMode('Cheque');
      setSelectedRecordId(null);
  };

  const openPaymentModal = (id: string) => {
      setSelectedRecordId(id);
      setShowPaymentModal(true);
  };

  // --- Filtering ---

  const filteredClientData = clientFinancials.filter(c => 
      c.clientName.toLowerCase().includes(searchTerm.toLowerCase()) || 
      c.projectId.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredVendorData = vendorFinancials.filter(v => 
      v.vendorName.toLowerCase().includes(searchTerm.toLowerCase()) || 
      v.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-4 md:p-8 bg-slate-50/50 h-full overflow-y-auto custom-scrollbar print:p-0 print:bg-white print:overflow-visible">
      <div className="mb-8 print:hidden">
        <h2 className="text-2xl md:text-3xl font-extrabold text-slate-800 flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-600 text-white rounded-xl flex items-center justify-center shadow-lg shadow-emerald-600/20 shrink-0">
              <DollarSign size={20} />
            </div>
            Finance & Payments
        </h2>
        <p className="text-slate-500 mt-2 font-medium md:ml-14">
            Track client project receivables and vendor payment obligations.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 print:grid-cols-3 print:gap-4">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between print:border-slate-300">
              <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Total Receivables</p>
                  <h3 className="text-2xl font-black text-slate-800">{formatCurrency(totalReceivables)}</h3>
                  <div className="flex items-center gap-1 text-xs font-bold mt-2 text-green-600">
                      <TrendingUp size={14}/> Collected: {formatCurrency(totalReceived)}
                  </div>
              </div>
              <div className="w-12 h-12 bg-green-50 text-green-600 rounded-full flex items-center justify-center print:hidden">
                  <TrendingUp size={24}/>
              </div>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between print:border-slate-300">
              <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Pending Inflow</p>
                  <h3 className="text-2xl font-black text-orange-600">{formatCurrency(totalPendingIn)}</h3>
                  <div className="text-xs text-slate-400 mt-2">
                     Outstanding from Clients
                  </div>
              </div>
              <div className="w-12 h-12 bg-orange-50 text-orange-600 rounded-full flex items-center justify-center print:hidden">
                  <AlertCircle size={24}/>
              </div>
          </div>

           <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between print:border-slate-300">
              <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Vendor Dues</p>
                  <h3 className="text-2xl font-black text-red-600">{formatCurrency(totalPendingOut)}</h3>
                  <div className="flex items-center gap-1 text-xs font-bold mt-2 text-slate-500">
                      Total Billed: {formatCurrency(totalPayables)}
                  </div>
              </div>
              <div className="w-12 h-12 bg-red-50 text-red-600 rounded-full flex items-center justify-center print:hidden">
                  <TrendingDown size={24}/>
              </div>
          </div>
      </div>

      {/* Controls - HIDDEN ON PRINT */}
      <div className="flex flex-col xl:flex-row justify-between items-center gap-4 mb-6 print:hidden">
           <div className="bg-white p-1 rounded-xl shadow-sm border border-slate-200 flex gap-1 w-full xl:w-auto">
               <button 
                onClick={() => setActiveTab('CLIENT')}
                className={`flex-1 xl:flex-none px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'CLIENT' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
               >
                   Client Receivables
               </button>
               <button 
                onClick={() => setActiveTab('VENDOR')}
                className={`flex-1 xl:flex-none px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'VENDOR' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
               >
                   Vendor Payables
               </button>
           </div>
           
           <div className="flex flex-col md:flex-row gap-3 w-full xl:w-auto">
               <div className="relative flex-1 md:w-64">
                   <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                   <input 
                    type="text" 
                    placeholder="Search records..." 
                    className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                   />
               </div>
               <div className="flex gap-2">
                   <button 
                    onClick={handlePrint}
                    className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-4 py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 shadow-sm transition-all"
                    title="Print Report"
                   >
                       <Printer size={18}/>
                   </button>
                   <button 
                    onClick={handleExport}
                    className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-4 py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 shadow-sm transition-all"
                    title="Download Excel/CSV"
                   >
                       <Download size={18}/>
                   </button>
                   <button 
                    onClick={() => setShowCreateModal(true)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 active:scale-95 transition-all"
                   >
                       <Plus size={18}/> Add Record
                   </button>
               </div>
           </div>
      </div>

      {/* Tables */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden print:border-none print:shadow-none">
          <div className="overflow-x-auto">
              {activeTab === 'CLIENT' ? (
                  <table className="w-full text-left text-sm">
                      <thead className="bg-slate-50 border-b border-slate-200 text-xs font-bold uppercase text-slate-500 print:bg-white print:text-black print:border-black">
                          <tr>
                              <th className="p-4">Client Name</th>
                              <th className="p-4">Project</th>
                              <th className="p-4 text-right">Total Deal</th>
                              <th className="p-4 text-right">Received</th>
                              <th className="p-4 text-right">Balance</th>
                              <th className="p-4">Reg. Date</th>
                              <th className="p-4">Status</th>
                              <th className="p-4 text-right print:hidden">Actions</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 print:divide-slate-300">
                          {filteredClientData.map(rec => {
                              return (
                                  <tr key={rec.id} className="hover:bg-slate-50 transition-colors print:hover:bg-transparent">
                                      <td className="p-4 font-bold text-slate-800">{rec.clientName}</td>
                                      <td className="p-4 text-slate-600">{rec.projectId}</td>
                                      <td className="p-4 text-right font-mono text-slate-600">{formatCurrency(rec.totalDealValue)}</td>
                                      <td className="p-4 text-right font-mono text-green-600 font-bold">{formatCurrency(rec.receivedAmount)}</td>
                                      <td className="p-4 text-right font-mono text-red-600 font-bold">{formatCurrency(rec.balance)}</td>
                                      <td className="p-4">
                                          {rec.registrationDate ? (
                                              <div className="flex items-center gap-1 font-bold text-xs text-slate-600">
                                                  <Calendar size={12}/> {rec.registrationDate}
                                              </div>
                                          ) : (
                                              <span className="text-xs text-slate-400 italic">Not set</span>
                                          )}
                                      </td>
                                      <td className="p-4">
                                          <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase border ${rec.status === 'Paid' ? 'bg-green-100 text-green-700 border-green-200' : 'bg-orange-100 text-orange-700 border-orange-200'}`}>
                                              {rec.status}
                                          </span>
                                      </td>
                                      <td className="p-4 text-right print:hidden">
                                          <div className="flex justify-end gap-3">
                                              <button 
                                                onClick={() => setShowHistoryModal(rec.id)}
                                                className="text-indigo-600 font-bold text-xs hover:underline flex items-center gap-1"
                                                title="View Transaction History"
                                              >
                                                  <History size={14}/> History
                                              </button>
                                              <button 
                                                onClick={() => openPaymentModal(rec.id)}
                                                className="text-emerald-600 font-bold text-xs hover:underline flex items-center gap-1"
                                              >
                                                  <Plus size={14}/> Add Pay
                                              </button>
                                          </div>
                                      </td>
                                  </tr>
                              );
                          })}
                      </tbody>
                  </table>
              ) : (
                  <table className="w-full text-left text-sm">
                      <thead className="bg-slate-50 border-b border-slate-200 text-xs font-bold uppercase text-slate-500 print:bg-white print:text-black print:border-black">
                          <tr>
                              <th className="p-4">Vendor</th>
                              <th className="p-4">Category</th>
                              <th className="p-4">Invoice Details</th>
                              <th className="p-4 text-right">Total Amount</th>
                              <th className="p-4 text-right">Paid</th>
                              <th className="p-4 text-right">Due</th>
                              <th className="p-4">Due Date</th>
                              <th className="p-4 text-right print:hidden">Actions</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 print:divide-slate-300">
                           {filteredVendorData.map(rec => {
                               const overdue = isOverdue(rec.dueDate) && rec.balance > 0;
                               return (
                                  <tr key={rec.id} className="hover:bg-slate-50 transition-colors print:hover:bg-transparent">
                                      <td className="p-4 font-bold text-slate-800">{rec.vendorName}</td>
                                      <td className="p-4 text-slate-600">{rec.category}</td>
                                      <td className="p-4 text-xs text-slate-500">
                                          <div>{rec.invoiceNo}</div>
                                          <div>{rec.invoiceDate}</div>
                                      </td>
                                      <td className="p-4 text-right font-mono text-slate-600">{formatCurrency(rec.totalAmount)}</td>
                                      <td className="p-4 text-right font-mono text-green-600 font-bold">{formatCurrency(rec.paidAmount)}</td>
                                      <td className="p-4 text-right font-mono text-red-600 font-bold">{formatCurrency(rec.balance)}</td>
                                      <td className="p-4">
                                          <div className={`flex items-center gap-1 font-bold ${overdue ? 'text-red-600' : 'text-slate-700'}`}>
                                              {rec.dueDate}
                                              {overdue && <AlertCircle size={14}/>}
                                          </div>
                                      </td>
                                      <td className="p-4 text-right print:hidden">
                                          <div className="flex justify-end gap-3">
                                              <button 
                                                onClick={() => setShowHistoryModal(rec.id)}
                                                className="text-indigo-600 font-bold text-xs hover:underline flex items-center gap-1"
                                                title="View History"
                                              >
                                                  <History size={14}/> History
                                              </button>
                                              <button 
                                                onClick={() => openPaymentModal(rec.id)}
                                                className="text-emerald-600 font-bold text-xs hover:underline flex items-center gap-1"
                                              >
                                                  <Plus size={14}/> Record Pay
                                              </button>
                                          </div>
                                      </td>
                                  </tr>
                               );
                          })}
                      </tbody>
                  </table>
              )}
          </div>
      </div>

      {/* CREATE RECORD MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 print:hidden">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
                 <div className="p-6 border-b border-slate-100 bg-emerald-50/50 flex justify-between items-center shrink-0">
                    <h3 className="text-xl font-extrabold text-emerald-900">
                        {activeTab === 'CLIENT' ? 'Add Client Project' : 'Add Vendor Invoice'}
                    </h3>
                    <button onClick={() => setShowCreateModal(false)} className="p-2 hover:bg-emerald-100 rounded-full text-emerald-800"><X size={20}/></button>
                </div>
                <div className="p-6 space-y-4 overflow-y-auto">
                    {activeTab === 'CLIENT' ? (
                        <>
                             <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Project</label>
                                {isNewProjectMode ? (
                                    <div className="space-y-2 bg-indigo-50 p-3 rounded-xl border border-indigo-100">
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="text-xs font-bold text-indigo-800 uppercase">New Project Details</span>
                                            <button onClick={() => setIsNewProjectMode(false)} className="text-xs text-indigo-500 underline hover:text-indigo-700">Cancel</button>
                                        </div>
                                        <input 
                                            type="text" 
                                            className="w-full border border-indigo-200 rounded-lg p-2 text-sm focus:outline-none focus:border-indigo-500"
                                            placeholder="Enter New Project Name"
                                            value={newProjectName}
                                            onChange={(e) => setNewProjectName(e.target.value)}
                                            autoFocus
                                        />
                                        <div className="relative">
                                            <MapPin size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-indigo-400"/>
                                            <input 
                                                type="text" 
                                                className="w-full border border-indigo-200 rounded-lg pl-8 p-2 text-sm focus:outline-none focus:border-indigo-500"
                                                placeholder="Location (Optional)"
                                                value={newProjectLocation}
                                                onChange={(e) => setNewProjectLocation(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex gap-2">
                                        <select 
                                            className="flex-1 border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
                                            value={newClientFin.projectId || ''}
                                            onChange={e => setNewClientFin({...newClientFin, projectId: e.target.value})}
                                        >
                                            <option value="">Select Project</option>
                                            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                        </select>
                                        <button 
                                            onClick={() => setIsNewProjectMode(true)}
                                            className="p-3 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-100 border border-indigo-200 transition-colors"
                                            title="Add New Project"
                                        >
                                            <Plus size={20}/>
                                        </button>
                                    </div>
                                )}
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Client Name</label>
                                <input 
                                    type="text" 
                                    className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-emerald-500 outline-none"
                                    value={newClientFin.clientName || ''}
                                    onChange={e => setNewClientFin({...newClientFin, clientName: e.target.value})}
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Total Deal Value (INR)</label>
                                <input 
                                    type="number" 
                                    className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-lg text-emerald-700"
                                    value={newClientFin.totalDealValue || ''}
                                    onChange={e => setNewClientFin({...newClientFin, totalDealValue: Number(e.target.value)})}
                                />
                            </div>

                            {/* Added Registration Date Field */}
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Registration / Start Date</label>
                                <input 
                                    type="date" 
                                    className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-emerald-500 outline-none"
                                    value={newClientFin.registrationDate || ''}
                                    onChange={e => setNewClientFin({...newClientFin, registrationDate: e.target.value})}
                                />
                            </div>
                        </>
                    ) : (
                         <>
                             <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Vendor Name</label>
                                <input 
                                    type="text" 
                                    className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-emerald-500 outline-none"
                                    value={newVendorFin.vendorName || ''}
                                    onChange={e => setNewVendorFin({...newVendorFin, vendorName: e.target.value})}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Category</label>
                                <input 
                                    type="text" 
                                    className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-emerald-500 outline-none"
                                    value={newVendorFin.category || ''}
                                    onChange={e => setNewVendorFin({...newVendorFin, category: e.target.value})}
                                    placeholder="e.g. Material, Labor, Service"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Invoice No</label>
                                    <input 
                                        type="text" 
                                        className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-emerald-500 outline-none"
                                        value={newVendorFin.invoiceNo || ''}
                                        onChange={e => setNewVendorFin({...newVendorFin, invoiceNo: e.target.value})}
                                    />
                                </div>
                                
                                <div className="col-span-1">
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Total Amount</label>
                                    <input 
                                        type="number" 
                                        className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-emerald-500 outline-none"
                                        value={newVendorFin.totalAmount || ''}
                                        onChange={e => setNewVendorFin({...newVendorFin, totalAmount: Number(e.target.value)})}
                                    />
                                </div>
                            </div>
                             <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Invoice Date</label>
                                    <input 
                                        type="date" 
                                        className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-emerald-500 outline-none"
                                        value={newVendorFin.invoiceDate || ''}
                                        onChange={e => setNewVendorFin({...newVendorFin, invoiceDate: e.target.value})}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Due Date</label>
                                    <input 
                                        type="date" 
                                        className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-emerald-500 outline-none"
                                        value={newVendorFin.dueDate || ''}
                                        onChange={e => setNewVendorFin({...newVendorFin, dueDate: e.target.value})}
                                    />
                                </div>
                            </div>
                        </>
                    )}
                </div>
                <div className="p-6 bg-slate-50/50 flex justify-end gap-3 border-t border-slate-100 shrink-0">
                    <button onClick={() => setShowCreateModal(false)} className="px-5 py-2.5 text-slate-600 font-bold hover:bg-slate-100 rounded-xl">Cancel</button>
                    <button onClick={handleCreateRecord} className="px-5 py-2.5 bg-emerald-600 text-white rounded-xl font-bold shadow-lg shadow-emerald-600/20">Save Record</button>
                </div>
            </div>
        </div>
      )}

      {/* PAYMENT MODAL */}
      {showPaymentModal && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 print:hidden">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col">
                 <div className="p-6 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
                    <h3 className="text-xl font-extrabold text-slate-800">Record Payment</h3>
                    <button onClick={() => setShowPaymentModal(false)} className="p-2 hover:bg-slate-200 rounded-full text-slate-500"><X size={20}/></button>
                </div>
                <div className="p-6 space-y-4">
                     <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Amount</label>
                        <input 
                            type="number" 
                            className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-lg"
                            value={paymentAmount}
                            onChange={e => setPaymentAmount(e.target.value as any)}
                            placeholder="0.00"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Payment Mode</label>
                        <select 
                            className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
                            value={paymentMode}
                            onChange={e => setPaymentMode(e.target.value)}
                        >
                            <option value="Cheque">Cheque</option>
                            <option value="NEFT/RTGS">NEFT / RTGS</option>
                            <option value="UPI">UPI</option>
                            <option value="Cash">Cash</option>
                        </select>
                    </div>
                     <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Remarks / Ref No.</label>
                        <textarea 
                            className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-emerald-500 outline-none resize-none h-20"
                            value={paymentRemarks}
                            onChange={e => setPaymentRemarks(e.target.value)}
                            placeholder="e.g. Cheque No 123456"
                        />
                    </div>
                </div>
                <div className="p-6 bg-slate-50/50 flex justify-end gap-3 border-t border-slate-100 shrink-0">
                    <button onClick={() => setShowPaymentModal(false)} className="px-5 py-2.5 text-slate-600 font-bold hover:bg-slate-100 rounded-xl">Cancel</button>
                    <button onClick={handleAddPayment} className="px-5 py-2.5 bg-emerald-600 text-white rounded-xl font-bold shadow-lg shadow-emerald-600/20">Confirm</button>
                </div>
            </div>
          </div>
      )}

      {/* TRANSACTION HISTORY MODAL */}
      {showHistoryModal && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 print:hidden">
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
                  {(() => {
                      const record = activeTab === 'CLIENT' 
                        ? clientFinancials.find(c => c.id === showHistoryModal)
                        : vendorFinancials.find(v => v.id === showHistoryModal);
                      
                      if (!record) return null;

                      return (
                          <>
                            <div className="p-6 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
                                <div>
                                    <h3 className="text-xl font-extrabold text-slate-800">Payment History</h3>
                                    <p className="text-sm text-slate-500">
                                        {'clientName' in record ? record.clientName : record.vendorName}
                                    </p>
                                </div>
                                <div className="flex gap-2">
                                    <button 
                                        onClick={() => handleDownloadHistory(record)}
                                        className="p-2 hover:bg-slate-200 rounded-full text-blue-600"
                                        title="Download History CSV"
                                    >
                                        <Download size={20}/>
                                    </button>
                                    <button onClick={() => setShowHistoryModal(null)} className="p-2 hover:bg-slate-200 rounded-full text-slate-500"><X size={20}/></button>
                                </div>
                            </div>
                            <div className="p-6 overflow-y-auto">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                                    <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl text-center">
                                        <div className="text-xs font-bold text-blue-500 uppercase tracking-wider">Total Amount</div>
                                        <div className="text-lg font-black text-slate-800">{formatCurrency('totalDealValue' in record ? record.totalDealValue : record.totalAmount)}</div>
                                    </div>
                                    <div className="p-4 bg-green-50 border border-green-100 rounded-xl text-center">
                                        <div className="text-xs font-bold text-green-500 uppercase tracking-wider">Paid / Received</div>
                                        <div className="text-lg font-black text-green-700">{formatCurrency('receivedAmount' in record ? record.receivedAmount : record.paidAmount)}</div>
                                    </div>
                                    <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-center">
                                        <div className="text-xs font-bold text-red-500 uppercase tracking-wider">Balance</div>
                                        <div className="text-lg font-black text-red-700">{formatCurrency(record.balance)}</div>
                                    </div>
                                </div>

                                <h4 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                                    <Clock size={18} className="text-slate-400"/> Transactions
                                </h4>
                                
                                {record.transactions.length === 0 ? (
                                    <div className="text-center py-8 text-slate-400 italic bg-slate-50 rounded-xl border border-dashed border-slate-200">
                                        No transactions recorded yet.
                                    </div>
                                ) : (
                                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                                        <table className="w-full text-sm text-left">
                                            <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold border-b border-slate-200">
                                                <tr>
                                                    <th className="p-3 pl-4">Date</th>
                                                    <th className="p-3 text-right">Amount</th>
                                                    <th className="p-3">Mode</th>
                                                    <th className="p-3">Remarks</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {record.transactions.map((tx, idx) => (
                                                    <tr key={tx.id || idx} className="hover:bg-slate-50">
                                                        <td className="p-3 pl-4 font-mono font-bold text-slate-600">{tx.date}</td>
                                                        <td className="p-3 text-right font-bold text-slate-800">{formatCurrency(tx.amount)}</td>
                                                        <td className="p-3">
                                                            <span className="bg-white border border-slate-200 px-2 py-1 rounded text-xs font-medium text-slate-600">
                                                                {tx.mode}
                                                            </span>
                                                        </td>
                                                        <td className="p-3 text-slate-500 italic max-w-[200px] truncate" title={tx.remarks}>
                                                            {tx.remarks || '-'}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                            <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end shrink-0">
                                <button onClick={() => setShowHistoryModal(null)} className="px-6 py-2.5 bg-slate-800 text-white rounded-xl font-bold shadow-lg shadow-slate-800/20">Close</button>
                            </div>
                          </>
                      );
                  })()}
              </div>
          </div>
      )}

    </div>
  );
};
