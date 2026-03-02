
import React, { useState, useEffect } from 'react';
import { ClientFinancial, VendorFinancial, User, Project } from '../types';
import { DollarSign, TrendingUp, TrendingDown, Plus, Search, Calendar, X, AlertCircle, Clock, History, Printer, Download, MapPin, Trash2 } from 'lucide-react';
import { isPast } from 'date-fns';
import api, { safeGet, safePost, safeDelete, extractPayload, ensureArray } from '../src/utils/api';

interface FinanceDashboardProps {
    clientFinancials: ClientFinancial[];
    setClientFinancials: React.Dispatch<React.SetStateAction<ClientFinancial[]>>;
    vendorFinancials: VendorFinancial[];
    setVendorFinancials: React.Dispatch<React.SetStateAction<VendorFinancial[]>>;
    projects: Project[];
    setProjects: React.Dispatch<React.SetStateAction<Project[]>>;
    currentUser: User;
}

const StatCard = ({ title, value, subtext, icon: Icon, gradient, delay }: any) => (
    <div
        style={{ animationDelay: delay }}
        className="bg-white/80 backdrop-blur-xl p-6 rounded-3xl shadow-[0_10px_30px_-10px_rgba(0,0,0,0.1)] border border-white/50 flex items-center justify-between group hover:-translate-y-2 hover:shadow-[0_20px_40px_-10px_rgba(0,0,0,0.15)] transition-all duration-300 animate-scale-in"
    >
        <div>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-2">{title}</p>
            <p className="text-3xl font-extrabold text-slate-800 tracking-tight">{value}</p>
            {subtext && <p className="text-[10px] font-bold mt-2 text-slate-500 uppercase tracking-wider">{subtext}</p>}
        </div>
        <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${gradient} text-white flex items-center justify-center shadow-lg transform rotate-3 group-hover:rotate-12 group-hover:scale-110 transition-transform duration-500`}>
            <Icon size={28} />
        </div>
    </div>
);

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
    const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null); // ID of client to confirm deletion
    const [deleting, setDeleting] = useState(false); // Prevent duplicate submits while deleting
    const [paymentAmount, setPaymentAmount] = useState<number | ''>('');
    const [paymentMode, setPaymentMode] = useState('Cheque');
    const [paymentRemarks, setPaymentRemarks] = useState('');
    const [paymentDate, setPaymentDate] = useState<string>('');

    // Create New Record State
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newClientFin, setNewClientFin] = useState<Partial<ClientFinancial>>({});
    const [newVendorFin, setNewVendorFin] = useState<Partial<VendorFinancial>>({});

    // New Project Creation State inside Modal
    const [isNewProjectMode, setIsNewProjectMode] = useState(false);
    const [newProjectName, setNewProjectName] = useState('');
    const [newProjectLocation, setNewProjectLocation] = useState('');

    // --- Calculations ---

    const safeClientFinancials = ensureArray(clientFinancials);
    const safeVendorFinancials = ensureArray(vendorFinancials);

    const totalReceivables = safeClientFinancials.reduce((acc, curr) => acc + (curr.totalDealValue || 0), 0);
    const totalReceived = safeClientFinancials.reduce((acc, curr) => acc + (curr.receivedAmount || 0), 0);
    const totalPendingIn = totalReceivables - totalReceived;

    const totalPayables = safeVendorFinancials.reduce((acc, curr) => acc + (curr.totalAmount || 0), 0);
    const totalPaid = safeVendorFinancials.reduce((acc, curr) => acc + (curr.paidAmount || 0), 0);
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

    const handleAddPayment = async () => {
        if (!paymentAmount || !selectedRecordId || !paymentDate) { alert('Please enter amount and payment date.'); return; }
        const amt = Number(paymentAmount);
        if (isNaN(amt) || amt <= 0) { alert('Please enter a valid amount.'); return; }
        const date = paymentDate || new Date().toISOString().split('T')[0];

        try {
            const desc = activeTab === 'CLIENT'
                ? JSON.stringify({ for: 'CLIENT', targetId: selectedRecordId, mode: paymentMode, remarks: paymentRemarks })
                : JSON.stringify({ for: 'VENDOR', targetId: selectedRecordId, mode: paymentMode, remarks: paymentRemarks });

            await safePost('/finance', { amount: amt, currency: 'INR', type: 'PAYMENT', description: desc, date }, { withCredentials: true });
            await loadFinance();
        } catch (err) {
            console.error('Failed to record payment on server', err && (err.stack || err.message || err));
            alert('Failed to record payment on server. Try again later.');
        } finally {
            setShowPaymentModal(false);
            resetPaymentForm();
        }
    };

    const handleCreateRecord = async () => {
        const today = new Date().toISOString().split('T')[0];
        try {
            if (activeTab === 'CLIENT') {
                let finalProjectId = newClientFin.projectId;
                if (isNewProjectMode && newProjectName) {
                    const newProjId = `P-${Date.now()}`;
                    const newProject: Project = { id: newProjId, name: newProjectName, location: newProjectLocation || 'Main Site', status: 'ACTIVE', assignedEmployees: [], description: 'Created from Finance Dashboard' };
                    setProjects(prev => [...prev, newProject]);
                    finalProjectId = newProjId;
                }
                if (!finalProjectId || !newClientFin.clientName || !newClientFin.totalDealValue) { alert('Please select a project and enter client details.'); return; }
                const desc = JSON.stringify({ clientName: newClientFin.clientName, projectId: finalProjectId });
                await safePost('/finance', { amount: Number(newClientFin.totalDealValue), currency: 'INR', type: 'CLIENT', description: desc, date: newClientFin.registrationDate || today }, { withCredentials: true });
            } else {
                if (!newVendorFin.vendorName || !newVendorFin.totalAmount) { alert('Please enter vendor details.'); return; }
                const desc = JSON.stringify({ vendorName: newVendorFin.vendorName, invoiceNo: newVendorFin.invoiceNo || '-' });
                await safePost('/finance', { amount: Number(newVendorFin.totalAmount), currency: 'INR', type: 'VENDOR', description: desc, date: newVendorFin.invoiceDate || today }, { withCredentials: true });
            }
            await loadFinance();
            setShowCreateModal(false);
            setNewClientFin({}); setIsNewProjectMode(false); setNewProjectName(''); setNewProjectLocation('');
            setNewVendorFin({});
        } catch (err) {
            console.error('Failed to create finance record', err && (err.stack || err.message || err));
            alert('Failed to create finance record on server.');
        }
    };

    // Load finance rows and rebuild client/vendor summaries
    const loadFinance = async () => {
        try {
            const res = await safeGet('/finance');
            const payload = extractPayload(res);
            const rows = ensureArray(payload);

            const clientsMap: Record<string, ClientFinancial> = {};
            const vendorsMap: Record<string, VendorFinancial> = {};

            // First pass: create CLIENT and VENDOR entries (independent of order)
            for (const r of rows) {
                const descRaw = r.description;
                let desc: any = null;
                try { desc = typeof descRaw === 'string' ? JSON.parse(descRaw) : descRaw; } catch (e) { desc = null; }

                if (r.type === 'CLIENT' && desc && desc.clientName && desc.projectId) {
                    const key = `${desc.clientName}::${desc.projectId}`;
                    if (!clientsMap[key]) {
                        clientsMap[key] = { id: key, projectId: desc.projectId, clientName: desc.clientName, totalDealValue: Number(r.amount || 0), receivedAmount: 0, balance: Number(r.amount || 0), registrationDate: r.date || '', lastPaymentDate: undefined, status: 'Pending', transactions: [] };
                    }
                } else if (r.type === 'VENDOR' && desc && desc.vendorName) {
                    const key = `${desc.vendorName}::${desc.invoiceNo || '-'}::${r.date || ''}`;
                    if (!vendorsMap[key]) {
                        vendorsMap[key] = { id: key, vendorName: desc.vendorName, category: 'General', invoiceNo: desc.invoiceNo || '-', invoiceDate: r.date || '', dueDate: '', totalAmount: Number(r.amount || 0), paidAmount: 0, balance: Number(r.amount || 0), status: 'Pending', transactions: [] };
                    }
                }
            }

            // Second pass: attach PAYMENTS to their targets (clients/vendors)
            for (const r of rows) {
                if (r.type !== 'PAYMENT') continue;
                const descRaw = r.description;
                let desc: any = null;
                try { desc = typeof descRaw === 'string' ? JSON.parse(descRaw) : descRaw; } catch (e) { desc = null; }

                if (desc && desc.for === 'CLIENT' && desc.targetId) {
                    const key = desc.targetId;
                    const client = clientsMap[key];
                    if (client) {
                        client.receivedAmount += Number(r.amount || 0);
                        client.balance = client.totalDealValue - client.receivedAmount;
                        client.lastPaymentDate = r.date || client.lastPaymentDate;
                        client.status = client.balance <= 0 ? 'Paid' : 'Pending';
                        client.transactions.push({ id: `TX-${r.id || Date.now()}`, date: r.date || '', amount: Number(r.amount || 0), mode: desc.mode || 'Cheque', remarks: desc.remarks || '' });
                    }
                }

                if (desc && desc.for === 'VENDOR' && desc.targetId) {
                    const key = desc.targetId;
                    const vendor = vendorsMap[key];
                    if (vendor) {
                        vendor.paidAmount += Number(r.amount || 0);
                        vendor.balance = vendor.totalAmount - vendor.paidAmount;
                        vendor.status = vendor.balance <= 0 ? 'Paid' : 'Pending';
                        vendor.transactions.push({ id: `TX-${r.id || Date.now()}`, date: r.date || '', amount: Number(r.amount || 0), mode: desc.mode || 'Cheque', remarks: desc.remarks || '' });
                    }
                }
            }

            const clientsArr = Object.values(clientsMap);
            const vendorsArr = Object.values(vendorsMap);
            setClientFinancials(clientsArr);
            setVendorFinancials(vendorsArr);
        } catch (err) {
            console.warn('Failed to load finance rows', err && (err.stack || err.message || err));
        }
    };

    // Load finance initially when component mounts
    useEffect(() => {
        loadFinance();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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
        setPaymentDate('');
        setSelectedRecordId(null);
    };

    const openPaymentModal = (id: string) => {
        setSelectedRecordId(id);
        const today = new Date().toISOString().split('T')[0];
        setPaymentDate(today);
        setShowPaymentModal(true);
    };

    // --- Filtering ---

    const filteredClientData = safeClientFinancials.filter(c =>
        (c.clientName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.projectId || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    const filteredVendorData = safeVendorFinancials.filter(v =>
        (v.vendorName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (v.category || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="p-4 md:p-8 space-y-8 bg-slate-50/50 h-full overflow-y-auto custom-scrollbar print:p-0 print:bg-white print:overflow-visible">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 print:hidden animate-fade-in-up">
                <div>
                    <h1 className="text-4xl font-black text-slate-800 tracking-tight flex items-center gap-4">
                        <div className="w-12 h-12 bg-emerald-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-600/20 shrink-0">
                            <DollarSign size={28} />
                        </div>
                        Finance & Payments
                    </h1>
                    <p className="text-slate-500 mt-2 font-medium">
                        Track client project receivables and vendor payment obligations.
                    </p>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-fade-in-up">
                <StatCard
                    title="Total Receivables"
                    value={formatCurrency(totalReceivables)}
                    subtext={`Collected: ${formatCurrency(totalReceived)}`}
                    icon={TrendingUp}
                    gradient="from-emerald-500 to-teal-600"
                    delay="0ms"
                />
                <StatCard
                    title="Pending Inflow"
                    value={formatCurrency(totalPendingIn)}
                    subtext="Outstanding from Clients"
                    icon={AlertCircle}
                    gradient="from-orange-500 to-rose-600"
                    delay="100ms"
                />
                <StatCard
                    title="Vendor Dues"
                    value={formatCurrency(totalPendingOut)}
                    subtext={`Total Billed: ${formatCurrency(totalPayables)}`}
                    icon={TrendingDown}
                    gradient="from-red-500 to-rose-600"
                    delay="200ms"
                />
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
                            <Printer size={18} />
                        </button>
                        <button
                            onClick={handleExport}
                            className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-4 py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 shadow-sm transition-all"
                            title="Download Excel/CSV"
                        >
                            <Download size={18} />
                        </button>
                        <button
                            onClick={() => setShowCreateModal(true)}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 active:scale-95 transition-all"
                        >
                            <Plus size={18} /> Add Record
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
                                                        <Calendar size={12} /> {rec.registrationDate}
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
                                                        <History size={14} /> History
                                                    </button>
                                                    <button
                                                        onClick={() => openPaymentModal(rec.id)}
                                                        className="text-emerald-600 font-bold text-xs hover:underline flex items-center gap-1"
                                                    >
                                                        <Plus size={14} /> Add Pay
                                                    </button>
                                                    {(currentUser.role === 'ADMIN' || currentUser.role === 'SUPER_ADMIN') ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => setShowDeleteConfirm(rec.id)}
                                                            className="text-red-600 font-bold text-xs hover:underline flex items-center gap-1 pointer-events-auto z-40 cursor-pointer px-2 py-0.5 rounded"
                                                            title="Delete Client and History"
                                                            aria-label={`Delete client ${rec.clientName || rec.id}`}
                                                        >
                                                            <Trash2 size={14} /> Delete
                                                        </button>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            disabled
                                                            className="text-red-300 font-bold text-xs flex items-center gap-1 cursor-not-allowed"
                                                            title="Admin only"
                                                        >
                                                            <Trash2 size={14} /> Delete
                                                        </button>
                                                    )}
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
                                                    {overdue && <AlertCircle size={14} />}
                                                </div>
                                            </td>
                                            <td className="p-4 text-right print:hidden">
                                                <div className="flex justify-end gap-3">
                                                    <button
                                                        onClick={() => setShowHistoryModal(rec.id)}
                                                        className="text-indigo-600 font-bold text-xs hover:underline flex items-center gap-1"
                                                        title="View History"
                                                    >
                                                        <History size={14} /> History
                                                    </button>
                                                    <button
                                                        onClick={() => openPaymentModal(rec.id)}
                                                        className="text-emerald-600 font-bold text-xs hover:underline flex items-center gap-1"
                                                    >
                                                        <Plus size={14} /> Record Pay
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
                            <button onClick={() => setShowCreateModal(false)} className="p-2 hover:bg-emerald-100 rounded-full text-emerald-800"><X size={20} /></button>
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
                                                    <MapPin size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-indigo-400" />
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
                                                    onChange={e => setNewClientFin({ ...newClientFin, projectId: e.target.value })}
                                                >
                                                    <option value="">Select Project</option>
                                                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                                </select>
                                                <button
                                                    onClick={() => setIsNewProjectMode(true)}
                                                    className="p-3 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-100 border border-indigo-200 transition-colors"
                                                    title="Add New Project"
                                                >
                                                    <Plus size={20} />
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
                                            onChange={e => setNewClientFin({ ...newClientFin, clientName: e.target.value })}
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Total Deal Value (INR)</label>
                                        <input
                                            type="number"
                                            className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-lg text-emerald-700"
                                            value={newClientFin.totalDealValue || ''}
                                            onChange={e => setNewClientFin({ ...newClientFin, totalDealValue: Number(e.target.value) })}
                                        />
                                    </div>

                                    {/* Added Registration Date Field */}
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Registration / Start Date</label>
                                        <input
                                            type="date"
                                            className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-emerald-500 outline-none"
                                            value={newClientFin.registrationDate || ''}
                                            onChange={e => setNewClientFin({ ...newClientFin, registrationDate: e.target.value })}
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
                                            onChange={e => setNewVendorFin({ ...newVendorFin, vendorName: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Category</label>
                                        <input
                                            type="text"
                                            className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-emerald-500 outline-none"
                                            value={newVendorFin.category || ''}
                                            onChange={e => setNewVendorFin({ ...newVendorFin, category: e.target.value })}
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
                                                onChange={e => setNewVendorFin({ ...newVendorFin, invoiceNo: e.target.value })}
                                            />
                                        </div>

                                        <div className="col-span-1">
                                            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Total Amount</label>
                                            <input
                                                type="number"
                                                className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-emerald-500 outline-none"
                                                value={newVendorFin.totalAmount || ''}
                                                onChange={e => setNewVendorFin({ ...newVendorFin, totalAmount: Number(e.target.value) })}
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
                                                onChange={e => setNewVendorFin({ ...newVendorFin, invoiceDate: e.target.value })}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Due Date</label>
                                            <input
                                                type="date"
                                                className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-emerald-500 outline-none"
                                                value={newVendorFin.dueDate || ''}
                                                onChange={e => setNewVendorFin({ ...newVendorFin, dueDate: e.target.value })}
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
                            <button onClick={() => setShowPaymentModal(false)} className="p-2 hover:bg-slate-200 rounded-full text-slate-500"><X size={20} /></button>
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
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Payment Date</label>
                                <input
                                    type="date"
                                    className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-emerald-500 outline-none"
                                    value={paymentDate}
                                    onChange={e => setPaymentDate(e.target.value)}
                                    aria-label="Payment received date"
                                />
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
                                                <Download size={20} />
                                            </button>
                                            <button onClick={() => setShowHistoryModal(null)} className="p-2 hover:bg-slate-200 rounded-full text-slate-500"><X size={20} /></button>
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
                                            <Clock size={18} className="text-slate-400" /> Transactions
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

                        {/* DELETE CONFIRMATION MODAL (CLIENT ONLY) */}
                        {showDeleteConfirm && (
                            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 pointer-events-auto">
                                <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden" role="dialog" aria-modal="true" aria-labelledby="confirm-delete-title">
                                    <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                                        <h3 id="confirm-delete-title" className="text-lg font-extrabold text-slate-800">Confirm Deletion</h3>
                                        <button onClick={() => setShowDeleteConfirm(null)} className="p-2 hover:bg-slate-100 rounded-full text-slate-500"><X size={20} /></button>
                                    </div>
                                    <div className="p-6">
                                        <p className="text-sm text-slate-600 mb-4">Are you sure you want to <b>delete this client</b> and <b>all associated history (payments)</b>? This action cannot be undone.</p>
                                        <div className="text-sm text-slate-500 italic mb-2">Client: <b>{(() => {
                                            try { const parts = (showDeleteConfirm || '').split('::'); return parts[0] ? `${parts[0]} (${parts[1] || 'project'})` : showDeleteConfirm; } catch { return showDeleteConfirm; }
                                        })()}</b></div>
                                        <div className="flex gap-2 justify-end mt-4">
                                            <button onClick={() => setShowDeleteConfirm(null)} className="px-4 py-2 rounded-xl bg-white border border-slate-200 font-bold">Cancel</button>
                                            <button disabled={deleting} onClick={async () => {
                                                if (!showDeleteConfirm) return;

                                                // Final authorization check on client-side for clarity
                                                if (!(currentUser.role === 'ADMIN' || currentUser.role === 'SUPER_ADMIN')) {
                                                    alert('Permission denied: only administrators can delete clients.');
                                                    setShowDeleteConfirm(null);
                                                    return;
                                                }

                                                if (!confirm('Are you sure? This will permanently delete the client and all associated records.')) {
                                                    return;
                                                }

                                                setDeleting(true);
                                                try {
                                                    // Use existing delete endpoint with id param (server handles composite key or numeric id)
                                                    await api.delete('/finance/client', { params: { id: showDeleteConfirm } });

                                                    // Refresh finance list (same pattern as Task deletion)
                                                    await loadFinance();

                                                    alert('Client and associated history deleted successfully.');
                                                } catch (e: any) {
                                                    console.error('Delete client failed', e && (e.stack || e.message || e));
                                                    if (e && e.response) {
                                                        const st = e.response.status;
                                                        if (st === 403) {
                                                            alert('Permission denied: only administrators can delete clients.');
                                                        } else if (st === 404) {
                                                            alert(`No matching records found for id: ${showDeleteConfirm}`);
                                                        } else {
                                                            alert(`Failed to delete client (status ${st}). Check console for details.`);
                                                        }
                                                    } else {
                                                        alert('Failed to delete client. Network error or server unreachable.');
                                                    }
                                                } finally {
                                                    setDeleting(false);
                                                    setShowDeleteConfirm(null);
                                                }
                                            }} className="px-4 py-2 rounded-xl bg-red-600 text-white font-bold">{deleting ? 'Deleting...' : 'Delete'}</button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

        </div>
    );
};
