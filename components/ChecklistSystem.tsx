import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { ChecklistTemplate, ChecklistInstance, Employee, User, FrequencyType, Notification, Holiday, ChecklistConfig } from '../types';
import { ListChecks, Plus, Calendar, CheckCircle2, Clock, Trash2, X, RefreshCw, AlertCircle, Loader2, Info, ShieldCheck, Sun, ArrowRight, Zap, Target, Users, Filter, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { format, addDays, addMonths, addYears, addWeeks, isSunday, isBefore, getDay } from 'date-fns';

interface ChecklistSystemProps {
  templates: ChecklistTemplate[];
  setTemplates: React.Dispatch<React.SetStateAction<ChecklistTemplate[]>>;
  instances: ChecklistInstance[];
  setInstances: React.Dispatch<React.SetStateAction<ChecklistInstance[]>>;
  currentUser: User;
  employees: Employee[];
  holidays: Holiday[];
  addNotification: (title: string, msg: string, type: Notification['type'], targetUser: string) => void;
}

export const ChecklistSystem: React.FC<ChecklistSystemProps> = ({ 
    templates, setTemplates, instances, setInstances, currentUser, employees, holidays, addNotification 
}) => {
  const [activeTab, setActiveTab] = useState<'AGENDA' | 'MONITOR' | 'MASTER'>('AGENDA');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Admin Filter States
  const [monitorLeadId, setMonitorLeadId] = useState<string>('ALL');
  const [monitorStatus, setMonitorStatus] = useState<'ALL' | 'PENDING' | 'COMPLETED'>('PENDING');
  const [monitorSearch, setMonitorSearch] = useState('');

  // Pagination States
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 25;

  const [newTemplate, setNewTemplate] = useState<Partial<ChecklistTemplate>>({
      active: true,
      config: { frequency: 'DAILY', particularDateType: 'EVERY-MONTH' }
  });

  const isAdmin = currentUser.role === 'ADMIN';
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  // Reset pagination when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [monitorLeadId, monitorStatus, monitorSearch, activeTab]);

  // --- Core Scheduling Logic ---

  const getNextWorkingDay = useCallback((d: Date): { date: Date, shifted: boolean } => {
      let check = new Date(d);
      const holidayDates = holidays.map(h => h.date);
      let limit = 0;
      let shifted = false;

      while ((isSunday(check) || holidayDates.includes(format(check, 'yyyy-MM-dd'))) && limit < 365) {
          check = addDays(check, 1);
          shifted = true;
          limit++;
      }
      return { date: check, shifted };
  }, [holidays]);

  const generateInstances = (template: ChecklistTemplate): ChecklistInstance[] => {
      const newInstances: ChecklistInstance[] = [];
      const startDate = new Date(template.startDate);
      // Generate 5 years ahead as per documentation
      const horizonDate = addYears(new Date(), 5); 
      const config = template.config;
      
      let cursorDate = new Date(startDate);
      let count = 0;
      const MAX_ITEMS = 2500; 

      const addInstance = (targetDate: Date, idx: number) => {
          if (config.frequency === 'DAILY' && isSunday(targetDate)) return;

          const { date: workingDate, shifted } = (config.frequency === 'DAILY') 
            ? { date: targetDate, shifted: false } 
            : getNextWorkingDay(targetDate);

          const dateStr = format(workingDate, 'yyyy-MM-dd');
          
          newInstances.push({
              id: `CI-${template.id}-${idx}`,
              templateId: template.id,
              date: dateStr,
              status: 'PENDING',
              shiftedDueToHoliday: shifted
          });
      };

      if (config.frequency === 'ONE-TIME' || config.frequency === 'EVENT-BASED') {
          addInstance(startDate, 0);
      } 
      else if (config.frequency === 'DAILY' || config.frequency === 'ALTERNATE') {
          const step = config.frequency === 'ALTERNATE' ? 2 : 1;
          while (isBefore(cursorDate, horizonDate) && count < MAX_ITEMS) {
              addInstance(cursorDate, count);
              cursorDate = addDays(cursorDate, step);
              count++;
          }
      }
      else if (config.frequency === 'WEEKLY' || config.frequency === 'FORTNIGHTLY') {
          const weekStep = config.frequency === 'FORTNIGHTLY' ? 2 : 1;
          const anchorDay = getDay(startDate); 
          
          while (isBefore(cursorDate, horizonDate) && count < MAX_ITEMS) {
              if (getDay(cursorDate) === anchorDay) {
                  addInstance(cursorDate, count);
                  cursorDate = addWeeks(cursorDate, weekStep);
              } else {
                  cursorDate = addDays(cursorDate, 1);
              }
              count++;
          }
      }
      else if (['MONTHLY', 'QUARTERLY', 'HALF-YEARLY', 'YEARLY', 'PARTICULAR-DATE'].includes(config.frequency)) {
          let monthStep = 1;
          if (config.frequency === 'QUARTERLY') monthStep = 3;
          if (config.frequency === 'HALF-YEARLY') monthStep = 6;
          if (config.frequency === 'YEARLY') monthStep = 12;
          
          if (config.frequency === 'PARTICULAR-DATE') {
              monthStep = config.particularDateType === 'EVERY-YEAR' ? 12 : 1;
          }

          while (isBefore(cursorDate, horizonDate) && count < MAX_ITEMS) {
              const target = new Date(cursorDate);
              addInstance(target, count);
              cursorDate = addMonths(cursorDate, monthStep);
              count++;
          }
      }

      return newInstances;
  };

  const handleCreateTemplate = () => {
      if (!newTemplate.taskName || !newTemplate.doerId || !newTemplate.startDate) {
          alert("Validation: Task Name, Assignee, and Start Date are required.");
          return;
      }

      setIsProcessing(true);
      setTimeout(() => {
          try {
              const template: ChecklistTemplate = {
                  id: `CT-${Date.now()}`,
                  taskName: newTemplate.taskName!,
                  doerId: newTemplate.doerId!,
                  department: employees.find(e => e.id === newTemplate.doerId)?.department || 'General',
                  startDate: newTemplate.startDate!,
                  config: (newTemplate.config as ChecklistConfig) || { frequency: 'DAILY' },
                  active: true
              };

              const newGenerated = generateInstances(template);
              setTemplates(prev => [...prev, template]);
              setInstances(prev => [...prev, ...newGenerated]);
              setShowCreateModal(false);
              setNewTemplate({ active: true, config: { frequency: 'DAILY', particularDateType: 'EVERY-MONTH' } });
              addNotification('Checklist Ready', `5-year schedule generated for "${template.taskName}".`, 'CHECKLIST', template.doerId);
          } finally {
              setIsProcessing(false);
          }
      }, 800);
  };

  const handleMarkDone = (id: string) => {
      setInstances(prev => prev.map(i => i.id === id ? { ...i, status: 'COMPLETED', completedDate: todayStr } : i));
  };

  const handleDeleteTemplate = (id: string) => {
      if (confirm("Terminate this routine? All future pending tasks for this pattern will be removed.")) {
          setTemplates(prev => prev.filter(t => t.id !== id));
          setInstances(prev => prev.filter(i => !(i.templateId === id && i.status === 'PENDING')));
      }
  };

  // --- Views Filtering ---

  const myMorningAgenda = useMemo(() => {
    return instances.filter(i => {
        const t = templates.find(temp => temp.id === i.templateId);
        return t?.doerId === currentUser.employeeId && i.status === 'PENDING' && i.date <= todayStr;
    }).sort((a,b) => a.date.localeCompare(b.date));
  }, [instances, templates, currentUser, todayStr]);

  const monitorData = useMemo(() => {
      return instances.filter(i => {
          const t = templates.find(temp => temp.id === i.templateId);
          const matchesLead = monitorLeadId === 'ALL' || t?.doerId === monitorLeadId;
          const matchesStatus = monitorStatus === 'ALL' || i.status === monitorStatus;
          const matchesSearch = monitorSearch === '' || t?.taskName.toLowerCase().includes(monitorSearch.toLowerCase());
          return matchesLead && matchesStatus && matchesSearch;
      }).sort((a, b) => a.date.localeCompare(b.date)); 
  }, [instances, templates, monitorLeadId, monitorStatus, monitorSearch]);

  const paginatedMonitorData = useMemo(() => {
      const start = (currentPage - 1) * itemsPerPage;
      return monitorData.slice(start, start + itemsPerPage);
  }, [monitorData, currentPage]);

  const totalPages = Math.ceil(monitorData.length / itemsPerPage);

  const stats = useMemo(() => {
      const myToday = instances.filter(i => {
          const t = templates.find(temp => temp.id === i.templateId);
          return t?.doerId === currentUser.employeeId && i.date === todayStr;
      });
      const total = myToday.length;
      const done = myToday.filter(i => i.status === 'COMPLETED').length;
      const percent = total > 0 ? Math.round((done/total)*100) : 0;
      return { total, done, percent };
  }, [instances, templates, currentUser, todayStr]);

  const frequencies: { id: FrequencyType, label: string }[] = [
      { id: 'ONE-TIME', label: 'One-time' },
      { id: 'DAILY', label: 'Daily' },
      { id: 'ALTERNATE', label: 'Alternate' },
      { id: 'WEEKLY', label: 'Weekly' },
      { id: 'FORTNIGHTLY', label: 'Fortnightly' },
      { id: 'MONTHLY', label: 'Monthly' },
      { id: 'QUARTERLY', label: 'Quarterly' },
      { id: 'HALF-YEARLY', label: 'Half-yearly' },
      { id: 'YEARLY', label: 'Yearly' },
      { id: 'PARTICULAR-DATE', label: 'Particular Date' },
      { id: 'EVENT-BASED', label: 'Event-based' },
  ];

  return (
    <div className="p-4 md:p-8 bg-slate-50/50 h-full overflow-y-auto custom-scrollbar">
      
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-8">
        <div>
          <h2 className="text-2xl md:text-3xl font-extrabold text-slate-800 flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 text-white rounded-xl flex items-center justify-center shadow-lg shadow-indigo-600/20 shrink-0">
              <ListChecks size={20} />
            </div>
            Routine Checklists
          </h2>
          <p className="text-slate-500 mt-2 font-medium md:ml-14">
            Compliance briefing for {format(new Date(), 'EEEE, MMM do')}.
          </p>
        </div>
        
        {isAdmin && (
            <button 
                onClick={() => setShowCreateModal(true)} 
                className="w-full md:w-auto bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-3 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20 transition-all active:scale-95 font-bold"
            >
                <Plus size={18} /> New Routine (5Y)
            </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mb-6 border-b border-slate-200 pb-2">
           <button onClick={() => setActiveTab('AGENDA')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'AGENDA' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-500 hover:bg-white'}`}>My Agenda</button>
           {isAdmin && (
               <>
                <button onClick={() => setActiveTab('MONITOR')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'MONITOR' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-500 hover:bg-white'}`}>Team Status</button>
                <button onClick={() => setActiveTab('MASTER')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'MASTER' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-500 hover:bg-white'}`}>Master Rules</button>
               </>
           )}
      </div>

      {activeTab === 'AGENDA' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-6">
                  <div className="flex items-center justify-between px-1">
                      <h3 className="font-bold text-slate-800 flex items-center gap-2 uppercase text-xs tracking-wider">
                        <Clock size={16} className="text-red-500"/> Actionable Items
                      </h3>
                      <span className="bg-red-50 text-red-600 px-3 py-1 rounded-full text-[10px] font-bold uppercase border border-red-100">{myMorningAgenda.length} Pending</span>
                  </div>

                  {myMorningAgenda.length === 0 ? (
                      <div className="p-12 text-center py-20 bg-white rounded-3xl border border-slate-100 text-slate-400 flex flex-col items-center">
                          <CheckCircle2 size={48} className="mb-4 opacity-10" />
                          <p className="font-medium">Everything is up to date.</p>
                      </div>
                  ) : (
                      <div className="space-y-4">
                          {myMorningAgenda.map((i) => {
                              const t = templates.find(temp => temp.id === i.templateId);
                              const isOverdue = i.date < todayStr;
                              
                              return (
                                  <div key={i.id} className={`bg-white p-5 rounded-2xl border transition-all flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 group ${isOverdue ? 'border-red-100 bg-red-50/10' : 'border-slate-100 shadow-sm'}`}>
                                      <div className="flex items-center gap-4 flex-1">
                                          <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${isOverdue ? 'bg-red-500 text-white' : (i.shiftedDueToHoliday ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-400')}`}>
                                              {isOverdue ? <AlertCircle size={24}/> : (i.shiftedDueToHoliday ? <RefreshCw size={20}/> : <Calendar size={24}/>)}
                                          </div>
                                          <div>
                                              <h4 className="font-bold text-slate-800 text-base leading-tight mb-1">{t?.taskName}</h4>
                                              <div className="flex flex-wrap items-center gap-2">
                                                  <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider border ${isOverdue ? 'bg-red-50 text-red-600 border-red-100' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                                                      {isOverdue ? 'OVERDUE' : i.date}
                                                  </span>
                                                  <span className="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded font-bold uppercase tracking-wider border border-indigo-100">
                                                      {t?.config.frequency.replace('-', ' ')}
                                                  </span>
                                                  {i.shiftedDueToHoliday && (
                                                      <span className="text-[10px] bg-orange-50 text-orange-600 px-2 py-0.5 rounded font-bold uppercase tracking-wider border border-orange-100">Holiday Shift</span>
                                                  )}
                                              </div>
                                          </div>
                                      </div>
                                      <button 
                                        onClick={() => handleMarkDone(i.id)} 
                                        className="w-full sm:w-auto bg-slate-900 hover:bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-bold text-xs transition-all shadow-sm flex items-center justify-center gap-2"
                                      >
                                          Mark Done <ArrowRight size={14}/>
                                      </button>
                                  </div>
                              );
                          })}
                      </div>
                  )}
              </div>

              <div className="space-y-6">
                  <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm text-center relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-4 opacity-[0.03] text-indigo-600 pointer-events-none">
                          <Sun size={120} />
                      </div>
                      
                      <div className="relative z-10">
                          <div className="relative inline-flex items-center justify-center mb-4">
                              <svg className="w-24 h-24 transform -rotate-90">
                                  <circle cx="48" cy="48" r="42" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-slate-100" />
                                  <circle cx="48" cy="48" r="42" stroke="currentColor" strokeWidth="8" fill="transparent" strokeDasharray={2 * Math.PI * 42} strokeDashoffset={2 * Math.PI * 42 * (1 - stats.percent / 100)} className="text-indigo-600 transition-all duration-1000 ease-out" strokeLinecap="round" />
                              </svg>
                              <span className="absolute text-xl font-black text-slate-800">{stats.percent}%</span>
                          </div>
                          <h4 className="font-bold text-slate-800 text-sm">Daily Goal Progress</h4>
                          <p className="text-[10px] text-slate-400 mt-1 font-bold uppercase tracking-widest">{stats.done} of {stats.total} secured.</p>
                      </div>
                  </div>

                  <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-4">
                       <div className="flex gap-4 items-start">
                          <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0"><Info size={16}/></div>
                          <div>
                              <p className="text-xs font-bold text-slate-800">NWD Automation</p>
                              <p className="text-[10px] text-slate-500 leading-relaxed mt-0.5">Recurring routines falling on Sundays or holidays move to the <strong>Next Working Day</strong>.</p>
                          </div>
                      </div>
                      <div className="flex gap-4 items-start">
                          <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center shrink-0"><Sun size={16}/></div>
                          <div>
                              <p className="text-xs font-bold text-slate-800">Daily Skip Policy</p>
                              <p className="text-[10px] text-slate-500 leading-relaxed mt-0.5">Strict Daily patterns skip Sundays entirely for team recovery.</p>
                          </div>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {activeTab === 'MONITOR' && isAdmin && (
          <div className="space-y-4 pb-20">
              <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col lg:flex-row gap-3 items-center">
                  <div className="flex-1 w-full relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16}/>
                      <input 
                        type="text" 
                        placeholder="Search Task..." 
                        className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                        value={monitorSearch}
                        onChange={e => setMonitorSearch(e.target.value)}
                      />
                  </div>
                  <div className="flex gap-2 w-full lg:w-auto">
                        <select 
                            className="flex-1 lg:w-40 pl-3 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs outline-none"
                            value={monitorLeadId}
                            onChange={e => setMonitorLeadId(e.target.value)}
                        >
                            <option value="ALL">All Leads</option>
                            {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                        </select>
                        <select 
                            className="flex-1 lg:w-40 pl-3 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs outline-none"
                            value={monitorStatus}
                            onChange={e => setMonitorStatus(e.target.value as any)}
                        >
                            <option value="ALL">All Status</option>
                            <option value="PENDING">Pending</option>
                            <option value="COMPLETED">Completed</option>
                        </select>
                  </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">
                  <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm min-w-[900px]">
                          <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase text-slate-400">
                              <tr>
                                  <th className="p-4">Date</th>
                                  <th className="p-4">Lead</th>
                                  <th className="p-4">Task</th>
                                  <th className="p-4">Frequency</th>
                                  <th className="p-4">Status</th>
                                  <th className="p-4 text-right">Completed</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                              {paginatedMonitorData.length === 0 ? (
                                  <tr><td colSpan={6} className="p-12 text-center text-slate-400 italic">No schedule records found.</td></tr>
                              ) : paginatedMonitorData.map(i => {
                                  const t = templates.find(temp => temp.id === i.templateId);
                                  const lead = employees.find(e => e.id === t?.doerId);
                                  
                                  return (
                                      <tr key={i.id} className="hover:bg-slate-50/50 transition-colors">
                                          <td className="p-4 font-mono font-bold text-xs text-slate-600">{i.date}</td>
                                          <td className="p-4 font-bold text-slate-700">{lead?.name || 'Unknown'}</td>
                                          <td className="p-4 font-medium text-slate-600">{t?.taskName}</td>
                                          <td className="p-4">
                                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t?.config.frequency.replace('-', ' ')}</span>
                                          </td>
                                          <td className="p-4">
                                              <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase border ${
                                                  i.status === 'COMPLETED' ? 'bg-green-50 text-green-700 border-green-100' : 'bg-orange-50 text-orange-700 border-orange-100'
                                              }`}>
                                                  {i.status}
                                              </span>
                                          </td>
                                          <td className="p-4 text-right font-mono text-xs text-slate-400">{i.completedDate || '-'}</td>
                                      </tr>
                                  );
                              })}
                          </tbody>
                      </table>
                  </div>

                  {monitorData.length > itemsPerPage && (
                    <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between shrink-0">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                            {((currentPage - 1) * itemsPerPage) + 1}-{Math.min(currentPage * itemsPerPage, monitorData.length)} of {monitorData.length}
                        </div>
                        <div className="flex gap-1">
                            <button onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))} disabled={currentPage === 1} className="p-1.5 bg-white border border-slate-200 rounded-lg disabled:opacity-30 hover:bg-slate-50 transition-all"><ChevronLeft size={16}/></button>
                            <div className="flex items-center px-3 text-xs font-bold text-slate-600">Page {currentPage} of {totalPages}</div>
                            <button onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))} disabled={currentPage === totalPages} className="p-1.5 bg-white border border-slate-200 rounded-lg disabled:opacity-30 hover:bg-slate-50 transition-all"><ChevronRight size={16}/></button>
                        </div>
                    </div>
                  )}
              </div>
          </div>
      )}

      {activeTab === 'MASTER' && isAdmin && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm min-w-[800px]">
                    <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase text-slate-400">
                        <tr>
                            <th className="p-4">Task Definition</th>
                            <th className="p-4">Responsible Lead</th>
                            <th className="p-4">Frequency</th>
                            <th className="p-4">Anchor Date</th>
                            <th className="p-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {templates.length === 0 ? (
                            <tr><td colSpan={5} className="p-12 text-center text-slate-400 italic">No master patterns configured.</td></tr>
                        ) : templates.map(t => (
                            <tr key={t.id} className="hover:bg-slate-50/50 group">
                                <td className="p-4">
                                    <div className="font-bold text-slate-800">{t.taskName}</div>
                                    <div className="text-[10px] text-slate-400 font-mono">REF: {t.id}</div>
                                </td>
                                <td className="p-4">
                                    <div className="font-bold text-slate-700">{employees.find(e => e.id === t.doerId)?.name}</div>
                                    <div className="text-[10px] text-slate-400 uppercase tracking-wider">{t.department}</div>
                                </td>
                                <td className="p-4">
                                    <span className="bg-slate-900 text-white px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border border-slate-800">
                                        {t.config.frequency === 'PARTICULAR-DATE' 
                                            ? `Every ${t.config.particularDateType === 'EVERY-YEAR' ? 'Year' : 'Month'}` 
                                            : t.config.frequency.replace('-', ' ')}
                                    </span>
                                </td>
                                <td className="p-4 text-slate-500 font-bold font-mono text-xs">{t.startDate}</td>
                                <td className="p-4 text-right">
                                    <button onClick={() => handleDeleteTemplate(t.id)} className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all">
                                        <Trash2 size={16}/>
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
              </div>
          </div>
      )}

      {showCreateModal && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 fade-in duration-300">
                  <div className="p-6 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
                      <div>
                        <h3 className="text-xl font-extrabold text-slate-800">Define Smart Routine</h3>
                        <p className="text-xs text-slate-500 font-medium">Auto-populates a 5-year compliance schedule.</p>
                      </div>
                      <button onClick={() => setShowCreateModal(false)} className="p-2 hover:bg-slate-200 rounded-full text-slate-500"><X size={20}/></button>
                  </div>
                  
                  <div className="p-6 space-y-6 overflow-y-auto">
                      <div>
                          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Description</label>
                          <input 
                            type="text" 
                            className="w-full border border-slate-200 p-3 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-bold text-lg" 
                            value={newTemplate.taskName || ''} 
                            onChange={e => setNewTemplate({...newTemplate, taskName: e.target.value})} 
                            placeholder="e.g. Weekly Site Safety Audit" 
                          />
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Responsible Lead</label>
                            <select className="w-full border border-slate-200 p-3 rounded-xl bg-white focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-sm" value={newTemplate.doerId || ''} onChange={e => setNewTemplate({...newTemplate, doerId: e.target.value})}>
                                <option value="">-- Select Member --</option>
                                {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Anchor Date</label>
                            <input type="date" className="w-full border border-slate-200 p-3 rounded-xl bg-white focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-sm" value={newTemplate.startDate || ''} onChange={e => setNewTemplate({...newTemplate, startDate: e.target.value})} />
                        </div>
                      </div>

                      <div>
                          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Recurrence Rule</label>
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                              {frequencies.map(f => (
                                  <button 
                                    key={f.id}
                                    type="button"
                                    onClick={() => setNewTemplate({...newTemplate, config: {...newTemplate.config!, frequency: f.id}})}
                                    className={`px-2 py-2 rounded-lg text-[9px] font-bold tracking-wider uppercase transition-all border ${newTemplate.config?.frequency === f.id ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-300'}`}
                                  >
                                      {f.label}
                                  </button>
                              ))}
                          </div>
                      </div>

                      {newTemplate.config?.frequency === 'PARTICULAR-DATE' && (
                          <div className="bg-indigo-50 p-4 rounded-2xl border border-indigo-100 space-y-4">
                              <div className="flex items-center gap-2 mb-1">
                                  <Target size={18} className="text-indigo-600" />
                                  <label className="block text-[10px] font-bold text-indigo-500 uppercase tracking-widest">Target Cycle</label>
                              </div>
                              <div className="flex gap-2">
                                  <button 
                                    type="button"
                                    onClick={() => setNewTemplate({...newTemplate, config: {...newTemplate.config!, particularDateType: 'EVERY-MONTH'}})}
                                    className={`flex-1 py-2 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-all border ${newTemplate.config?.particularDateType === 'EVERY-MONTH' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-indigo-400 border-indigo-200'}`}
                                  >
                                      Monthly on {newTemplate.startDate ? format(new Date(newTemplate.startDate), 'do') : 'Day'}
                                  </button>
                                  <button 
                                    type="button"
                                    onClick={() => setNewTemplate({...newTemplate, config: {...newTemplate.config!, particularDateType: 'EVERY-YEAR'}})}
                                    className={`flex-1 py-2 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-all border ${newTemplate.config?.particularDateType === 'EVERY-YEAR' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-indigo-400 border-indigo-200'}`}
                                  >
                                      Yearly on {newTemplate.startDate ? format(new Date(newTemplate.startDate), 'MMM do') : 'Date'}
                                  </button>
                              </div>
                          </div>
                      )}

                      <div className="bg-slate-900 p-5 rounded-2xl text-white shadow-inner flex items-start gap-4">
                          <ShieldCheck size={20} className="text-indigo-400 shrink-0 mt-0.5"/>
                          <div>
                              <p className="text-xs font-bold">Automation Policy</p>
                              <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
                                  Schedule iterates 5 years forward. Non-working days (Sundays/Holidays) shift tasks to the next available working day automatically.
                              </p>
                          </div>
                      </div>
                  </div>
                  
                  <div className="p-6 bg-slate-50 flex justify-end gap-3 border-t border-slate-100 shrink-0">
                      <button onClick={() => setShowCreateModal(false)} className="px-6 py-2.5 text-slate-500 font-bold hover:bg-slate-200 rounded-xl transition-all text-xs uppercase tracking-widest">Cancel</button>
                      <button 
                        onClick={handleCreateTemplate} 
                        disabled={isProcessing}
                        className="px-8 py-2.5 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-600/30 flex items-center gap-2 hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50 text-xs uppercase tracking-widest"
                      >
                        {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16}/>}
                        {isProcessing ? 'Processing' : 'Secure 5Y Plan'}
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};