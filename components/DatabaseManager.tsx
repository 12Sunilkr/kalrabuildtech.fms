
import React, { useRef, useState } from 'react';
import { Database, Download, Upload, Trash2, RefreshCw, ShieldAlert, FileJson, Table, Info, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';

interface DatabaseManagerProps {
    allData: any;
    onRestore: (data: any) => void;
    onReset: () => void;
}

export const DatabaseManager: React.FC<DatabaseManagerProps> = ({ allData, onRestore, onReset }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [confirmReset, setConfirmReset] = useState(false);
    const [importStatus, setImportStatus] = useState<'idle' | 'success' | 'error'>('idle');

    const handleExport = () => {
        const dataStr = JSON.stringify(allData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Kalra_FMS_DB_Backup_${format(new Date(), 'yyyy-MM-dd_HHmm')}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const json = JSON.parse(event.target?.result as string);
                // Validate basic structure (Check if major keys exist)
                if (json.employees && json.users) {
                    if (confirm("This will overwrite all current system data with the uploaded file. Are you sure?")) {
                        onRestore(json);
                        setImportStatus('success');
                        setTimeout(() => setImportStatus('idle'), 3000);
                    }
                } else {
                    throw new Error("Invalid database format.");
                }
            } catch (err) {
                console.error(err);
                setImportStatus('error');
                alert("Failed to import database. File is corrupt or invalid format.");
                setTimeout(() => setImportStatus('idle'), 3000);
            }
        };
        reader.readAsText(file);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleResetSystem = () => {
        if (!confirmReset) {
            setConfirmReset(true);
            return;
        }
        onReset();
        setConfirmReset(false);
        alert("System data has been completely cleared.");
    };

    const stats = [
        { label: 'Employees', count: allData.employees?.length || 0, color: 'text-blue-600' },
        { label: 'Tasks', count: allData.tasks?.length || 0, color: 'text-indigo-600' },
        { label: 'Orders', count: allData.orders?.length || 0, color: 'text-orange-600' },
        { label: 'Leaves', count: allData.leaveRequests?.length || 0, color: 'text-purple-600' },
        { label: 'Finance Trans.', count: (allData.clientFinancials?.reduce((a: any, c: any) => a + (c.transactions?.length || 0), 0) + allData.vendorFinancials?.reduce((a: any, v: any) => a + (v.transactions?.length || 0), 0)) || 0, color: 'text-emerald-600' },
        { label: 'Site Photos', count: allData.sitePhotos?.length || 0, color: 'text-pink-600' },
    ];

    return (
        <div className="p-4 md:p-8 bg-slate-50/50 h-full overflow-y-auto custom-scrollbar">
            <div className="mb-8">
                <h2 className="text-2xl md:text-3xl font-extrabold text-slate-800 flex items-center gap-3">
                    <div className="w-10 h-10 bg-slate-800 text-white rounded-xl flex items-center justify-center shadow-lg shadow-slate-900/20 shrink-0">
                        <Database size={20} />
                    </div>
                    System Data Hub
                </h2>
                <p className="text-slate-500 mt-2 font-medium md:ml-14">
                    Global management of system records, backups, and portable data files.
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12">
                {/* Health Check Section */}
                <div className="lg:col-span-2 space-y-6">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 flex items-center gap-2 px-1">
                        <Table size={14}/> Database Row Counts
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                        {stats.map(s => (
                            <div key={s.label} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col items-center justify-center text-center">
                                <span className={`text-3xl font-black mb-1 font-mono ${s.color}`}>{s.count}</span>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{s.label}</span>
                            </div>
                        ))}
                    </div>

                    <div className="bg-blue-50 border border-blue-100 p-6 rounded-3xl flex gap-4 items-start">
                        <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-blue-600 shadow-sm shrink-0"><Info size={20}/></div>
                        <div>
                            <h4 className="font-bold text-blue-900 text-sm mb-1">Architecture Note</h4>
                            <p className="text-blue-700/70 text-xs leading-relaxed">
                                The system currently operates on a **Local Persistence Layer**. All changes are saved in your browser's persistent storage. 
                                We recommend regular backups using the tool on the right to ensure zero data loss during browser maintenance.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Operations Section */}
                <div className="space-y-6">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 flex items-center gap-2 px-1">
                        <RefreshCw size={14}/> Data Operations
                    </h3>
                    
                    {/* Backup */}
                    <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center shrink-0"><Download size={20}/></div>
                            <div>
                                <h4 className="font-bold text-slate-800 text-sm">Full Backup</h4>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Export as JSON</p>
                            </div>
                        </div>
                        <p className="text-xs text-slate-500">Download a portable snapshot of the entire database for archiving or migration.</p>
                        <button 
                            onClick={handleExport}
                            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm shadow-lg shadow-indigo-600/20 transition-all flex items-center justify-center gap-2"
                        >
                            Download Database File
                        </button>
                    </div>

                    {/* Restore */}
                    <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center shrink-0"><Upload size={20}/></div>
                            <div>
                                <h4 className="font-bold text-slate-800 text-sm">Restore Data</h4>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Import JSON</p>
                            </div>
                        </div>
                        <p className="text-xs text-slate-500">Restore your system state from a previously exported backup file.</p>
                        <input type="file" ref={fileInputRef} onChange={handleImport} className="hidden" accept=".json" />
                        <button 
                            onClick={() => fileInputRef.current?.click()}
                            className={`w-full py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${
                                importStatus === 'success' ? 'bg-green-600 text-white' :
                                importStatus === 'error' ? 'bg-red-600 text-white' :
                                'bg-white border-2 border-emerald-100 text-emerald-600 hover:bg-emerald-50'
                            }`}
                        >
                            {importStatus === 'success' ? <><CheckCircle2 size={16}/> Restored!</> : 
                             importStatus === 'error' ? 'Invalid File' : 
                             <><FileJson size={16}/> Select Backup File</>}
                        </button>
                    </div>

                    {/* Danger Zone */}
                    <div className="bg-red-50 p-6 rounded-3xl border border-red-100 space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-white text-red-600 rounded-xl flex items-center justify-center shrink-0 shadow-sm"><ShieldAlert size={20}/></div>
                            <div>
                                <h4 className="font-bold text-red-900 text-sm">Danger Zone</h4>
                                <p className="text-[10px] text-red-400 font-bold uppercase tracking-wider">Destructive Actions</p>
                            </div>
                        </div>
                        <p className="text-[10px] text-red-700/70 font-medium">Resetting will permanently delete all records, users, and shift logs. This cannot be undone unless you have a backup.</p>
                        
                        <button 
                            onClick={handleResetSystem}
                            onMouseLeave={() => setConfirmReset(false)}
                            className={`w-full py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${
                                confirmReset 
                                ? 'bg-red-600 text-white animate-pulse' 
                                : 'bg-white border-2 border-red-100 text-red-600 hover:bg-red-100'
                            }`}
                        >
                            <Trash2 size={16}/>
                            {confirmReset ? 'Click again to confirm WIPE' : 'Reset System Database'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Structure View */}
            <div className="bg-slate-900 rounded-3xl p-8 overflow-hidden relative group">
                <div className="absolute top-0 right-0 p-8 opacity-10 text-white group-hover:rotate-12 transition-transform duration-500">
                    <FileJson size={180} />
                </div>
                <h4 className="text-white font-bold mb-4 flex items-center gap-2">
                    <AlertTriangle size={18} className="text-yellow-400"/> System Schema Reference
                </h4>
                <div className="bg-black/40 rounded-2xl p-4 border border-white/5">
                    <pre className="text-indigo-300 text-[10px] font-mono leading-relaxed overflow-x-auto whitespace-pre-wrap">
                        {`{
  "employees": ${allData.employees?.length} entries,
  "attendance": ${Object.keys(allData.attendanceData || {}).length} record paths,
  "tasks": ${allData.tasks?.length} entries,
  "finances": {
    "clients": ${allData.clientFinancials?.length},
    "vendors": ${allData.vendorFinancials?.length}
  }
}`}
                    </pre>
                </div>
            </div>
        </div>
    );
};
