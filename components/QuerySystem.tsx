import React, { useState } from 'react';
import { Query, Employee, User, Notification } from '../types';
import { HelpCircle, Plus, Search, CheckCircle2, X, Send } from 'lucide-react';
import { format } from 'date-fns';
import { AITextEnhancer } from './AITextEnhancer';

interface QuerySystemProps {
  queries: Query[];
  setQueries: React.Dispatch<React.SetStateAction<Query[]>>;
  currentUser: User;
  employees: Employee[];
  addNotification: (title: string, msg: string, type: Notification['type'], targetUser: string) => void;
}

export const QuerySystem: React.FC<QuerySystemProps> = ({ queries, setQueries, currentUser, employees, addNotification }) => {
  const [activeTab, setActiveTab] = useState<'INBOX' | 'SENT'>('INBOX');
  const [showModal, setShowModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // New Query State
  const [newQuery, setNewQuery] = useState<Partial<Query>>({});

  const handleCreateQuery = () => {
    if (newQuery.subject && newQuery.message && newQuery.to) {
      const query: Query = {
        id: `Q-${Math.floor(1000 + Math.random() * 9000)}`,
        subject: newQuery.subject,
        message: newQuery.message,
        from: currentUser.employeeId || 'ADMIN',
        to: newQuery.to,
        date: new Date().toISOString().split('T')[0],
        status: 'OPEN'
      };
      setQueries([query, ...queries]);
      setShowModal(false);
      setNewQuery({});
      addNotification('New Query', `Query "${newQuery.subject}" sent by ${currentUser.name}.`, 'QUERY', query.to);
    }
  };

  const handleResolve = (id: string) => {
    setQueries(queries.map(q => q.id === id ? { ...q, status: 'RESOLVED' } : q));
  };

  const filteredQueries = queries.filter(q => {
    // If Admin, they see ALL queries in the inbox view to monitor everything
    if (currentUser.role === 'ADMIN' && activeTab === 'INBOX') {
        const term = searchTerm.toLowerCase();
        return q.subject.toLowerCase().includes(term) || q.message.toLowerCase().includes(term);
    }

    // Normal User Logic
    const isInbox = activeTab === 'INBOX' && q.to === currentUser.employeeId;
    const isSent = activeTab === 'SENT' && q.from === currentUser.employeeId;
    
    if (!(isInbox || isSent)) return false;

    const term = searchTerm.toLowerCase();
    return q.subject.toLowerCase().includes(term) || q.message.toLowerCase().includes(term);
  });

  return (
    <div className="p-4 md:p-8 bg-slate-50/50 h-full overflow-y-auto custom-scrollbar">
       <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-8">
        <div>
           <h2 className="text-2xl md:text-3xl font-extrabold text-slate-800 flex items-center gap-3">
            <div className="w-10 h-10 bg-teal-500 text-white rounded-xl flex items-center justify-center shadow-lg shadow-teal-500/20 shrink-0">
              <HelpCircle size={20} />
            </div>
            Query Box
          </h2>
          <p className="text-slate-500 mt-2 font-medium md:ml-14">
            Ask questions, raise tickets, or seek help from colleagues.
          </p>
        </div>
        <button 
          onClick={() => setShowModal(true)}
          className="bg-teal-600 hover:bg-teal-700 text-white px-5 py-3 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-teal-600/20 transition-all active:scale-95 font-bold"
        >
          <Plus size={18} />
          Raise New Query
        </button>
      </div>

      <div className="flex flex-col md:flex-row gap-4 justify-between items-center mb-6">
        <div className="flex gap-2 bg-white p-1 rounded-xl shadow-sm border border-slate-200">
            <button 
                onClick={() => setActiveTab('INBOX')}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'INBOX' ? 'bg-teal-500 text-white shadow' : 'text-slate-500 hover:bg-slate-50'}`}
            >
                {currentUser.role === 'ADMIN' ? 'All Queries (Monitor)' : 'Received (Inbox)'}
            </button>
            <button 
                onClick={() => setActiveTab('SENT')}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'SENT' ? 'bg-teal-500 text-white shadow' : 'text-slate-500 hover:bg-slate-50'}`}
            >
                Sent by Me
            </button>
        </div>
        
        <div className="relative w-full md:w-72 shrink-0">
             <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
             <input 
               type="text"
               placeholder="Search queries..."
               value={searchTerm}
               onChange={(e) => setSearchTerm(e.target.value)}
               className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none shadow-sm transition-all"
             />
        </div>
      </div>

      <div className="space-y-4">
        {filteredQueries.length === 0 ? (
           <div className="text-center py-20 bg-white rounded-3xl border border-slate-100 text-slate-400">
             <HelpCircle size={48} className="mx-auto mb-4 opacity-20" />
             <p className="font-medium">No queries found.</p>
           </div>
        ) : (
            filteredQueries.map(q => {
                const sender = employees.find(e => e.id === q.from)?.name || q.from;
                const receiver = employees.find(e => e.id === q.to)?.name || q.to;

                return (
                    <div key={q.id} className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 hover:shadow-md transition-shadow relative overflow-hidden">
                        <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${q.status === 'RESOLVED' ? 'bg-green-500' : 'bg-teal-500'}`}></div>
                        <div className="flex flex-col md:flex-row justify-between gap-4">
                            <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                     <span className="font-mono text-xs font-bold text-slate-400 bg-slate-50 px-2 py-1 rounded border border-slate-200">{q.id}</span>
                                     <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${q.status === 'RESOLVED' ? 'bg-green-100 text-green-700 border-green-200' : 'bg-teal-50 text-teal-700 border-teal-200'}`}>
                                        {q.status}
                                     </span>
                                     <span className="text-xs text-slate-400 ml-auto md:ml-0">{q.date}</span>
                                </div>
                                <h3 className="text-lg font-bold text-slate-800 mb-2">{q.subject}</h3>
                                <p className="text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-100 italic">"{q.message}"</p>
                                <div className="mt-3 text-xs font-medium text-slate-500 flex gap-4">
                                    <span>From: <strong className="text-slate-700">{sender}</strong></span>
                                    <span>To: <strong className="text-slate-700">{receiver}</strong></span>
                                </div>
                            </div>
                            
                            {(q.status === 'OPEN') && (q.to === currentUser.employeeId || currentUser.role === 'ADMIN') && (
                                <div className="flex items-center">
                                    <button 
                                        onClick={() => handleResolve(q.id)}
                                        className="px-4 py-2 bg-white border border-green-200 text-green-700 font-bold text-sm rounded-xl hover:bg-green-50 flex items-center gap-2 shadow-sm"
                                    >
                                        <CheckCircle2 size={16} /> Mark Resolved
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                );
            })
        )}
      </div>

       {/* RAISE QUERY MODAL */}
       {showModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-100 bg-teal-50/50 flex justify-between items-center shrink-0">
               <h3 className="text-xl font-extrabold text-teal-900">Ask a Query</h3>
               <button onClick={() => setShowModal(false)} className="p-2 hover:bg-teal-100 rounded-full text-teal-800"><X size={20}/></button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto">
              <div className="relative">
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Subject</label>
                <div className="relative">
                    <input 
                    type="text" 
                    className="w-full border border-slate-200 rounded-xl p-3 pr-10 focus:ring-2 focus:ring-teal-500 outline-none"
                    value={newQuery.subject || ''}
                    onChange={e => setNewQuery({...newQuery, subject: e.target.value})}
                    placeholder="Brief topic..."
                    />
                     <AITextEnhancer 
                        text={newQuery.subject || ''} 
                        onUpdate={(text) => setNewQuery({...newQuery, subject: text})} 
                        context="concise"
                        mini={true}
                    />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">To (Employee)</label>
                <select 
                    className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-teal-500 outline-none bg-white"
                    value={newQuery.to || ''}
                    onChange={e => setNewQuery({...newQuery, to: e.target.value})}
                >
                    <option value="">Select Recipient</option>
                    {employees.filter(e => e.id !== currentUser.employeeId).map(e => (
                        <option key={e.id} value={e.id}>{e.name} ({e.department})</option>
                    ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Message</label>
                <textarea 
                  className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-teal-500 outline-none h-32 resize-none"
                  value={newQuery.message || ''}
                  onChange={e => setNewQuery({...newQuery, message: e.target.value})}
                  placeholder="Explain your query..."
                />
                 <AITextEnhancer 
                    text={newQuery.message || ''} 
                    onUpdate={(text) => setNewQuery({...newQuery, message: text})} 
                />
              </div>
            </div>
            <div className="p-6 bg-slate-50/50 flex justify-end gap-3 border-t border-slate-100 shrink-0">
              <button onClick={() => setShowModal(false)} className="px-5 py-2.5 text-slate-600 font-bold hover:bg-slate-100 rounded-xl">Cancel</button>
              <button onClick={handleCreateQuery} className="px-5 py-2.5 bg-teal-600 text-white rounded-xl font-bold shadow-lg shadow-teal-600/20 flex items-center gap-2">
                 <Send size={18} /> Submit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};