
import React, { useState, useEffect, useRef } from 'react';
import { ChatMessage, Employee, User, ChatGroup, Notification } from '../types';
import { MessageCircle, Search, Paperclip, Send, User as UserIcon, Eye, Users, Plus, X, ArrowLeft } from 'lucide-react';
import { AITextEnhancer } from './AITextEnhancer';
import api, { safeGet, extractPayload, ensureArray } from '../src/utils/api';

interface ChatSystemProps {
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  groups: ChatGroup[];
  setGroups: React.Dispatch<React.SetStateAction<ChatGroup[]>>;
  currentUser: User;
  employees: Employee[];
  addNotification: (title: string, msg: string, type: Notification['type'], targetUser: string) => void;
}

export const ChatSystem: React.FC<ChatSystemProps> = ({ messages, setMessages, groups, setGroups, currentUser, employees, addNotification }) => {
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null); // EmployeeID or GroupID
  const [inputText, setInputText] = useState('');
  const [attachment, setAttachment] = useState<File | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Message action state
  const [menuForMessage, setMenuForMessage] = useState<{ id: string, x: number, y: number } | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [replyToMessageId, setReplyToMessageId] = useState<string | null>(null);
  const [showInfoMessageId, setShowInfoMessageId] = useState<string | null>(null);
  // Track local cache of teamIds marked as read with timestamp to avoid repeated read POSTs
  const [markedReadTimes, setMarkedReadTimes] = useState<Record<string,string>>({});
  // Guard to avoid overlapping/duplicate fetches for the same teamId (prevents double-calls in StrictMode and overlapping polls)
  const activeFetches = useRef<Record<string, boolean>>({});
  // Poll control handle
  const pollStopRef = useRef<Record<string, boolean>>({});

  // Admin Monitoring Mode State
  const [adminMonitorTarget, setAdminMonitorTarget] = useState<string | null>(null);
  const [adminMonitorPartner, setAdminMonitorPartner] = useState<string | null>(null);
  // Monitoring messages state (for admin monitor detail view)
  const [monitorMessages, setMonitorMessages] = useState<ChatMessage[]>([]);
  const [monitorLoading, setMonitorLoading] = useState(false);
  
  // Create Group Modal
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupMembers, setNewGroupMembers] = useState<string[]>([]);

  const isAdmin = currentUser.role === 'ADMIN';

  // --- Helpers ---
  const getDirectTeamId = (a: string, b: string) => `DM-${[a, b].sort().join('-')}`;
  const isDirectTeamId = (id?: string | null) => !!id && id.startsWith && id.startsWith('DM-');
  const extractDirectPartnerId = (teamId: string, me: string) => {
      if (!isDirectTeamId(teamId)) return null;
      const parts = teamId.split('-').slice(1);
      return parts.find(p => p !== me) || null;
  };

  const getConversation = (user1: string, user2: string) => {
    // Check if user2 is a group
    const isGroup = groups.some(g => g.id === user2);
    const isDirect = isDirectTeamId(user2);

    if (isGroup) {
        return messages.filter(m => m.receiverId === user2).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    } else if (isDirect) {
        // Direct message (canonical DM id) -> filter by teamId
        return messages.filter(m => m.teamId === user2).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    } else {
        // Legacy / transient format: use sender/receiver pairs
        return messages.filter(
            m => (m.senderId === user1 && m.receiverId === user2) || 
                 (m.senderId === user2 && m.receiverId === user1)
        ).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    }
  };

  const handleSendMessage = () => {
    if ((!inputText.trim() && !attachment) || !selectedChatId) return;

    // Determine canonical receiver and team id for direct messages
    const partnerId = isDirectTeamId(selectedChatId || null) ? extractDirectPartnerId(selectedChatId!, currentUser.employeeId || 'ADMIN') : null;
    const receiverForOptimistic = partnerId || selectedChatId || (currentUser.employeeId || 'ADMIN');

    const newMessage: ChatMessage = {
        id: `C-${Date.now()}`,
        senderId: currentUser.employeeId || 'ADMIN',
        receiverId: receiverForOptimistic || (selectedChatId || ''),
        content: inputText,
        timestamp: new Date().toISOString(),
        attachment: attachment ? attachment.name : undefined,
        teamId: selectedChatId || undefined
    };

        // Optimistic UI update then persist to server
        setMessages([...messages, newMessage]);
        setInputText('');
        setAttachment(null);
        const meta: any = {};
        if (newMessage.attachment) meta.attachment = newMessage.attachment;
        if (replyToMessageId) meta.replyTo = replyToMessageId;
        (async () => {
            try {
                await api.post('/chat', { teamId: selectedChatId, message: newMessage.content, meta: Object.keys(meta).length ? meta : undefined });
                const r = await safeGet(`/chat/${encodeURIComponent(selectedChatId!)}`);
                const p = extractPayload(r);
                setMessages(ensureArray(p));
            } catch (e) {
                console.warn('Chat send failed', e && (e.stack || e.message || e));
            }
        })();
        if (!groups.some(g => g.id === selectedChatId)) addNotification('New Message', `Message from ${currentUser.name}`, 'CHAT', String(selectedChatId));
        setReplyToMessageId(null);
  };

  const handleCreateGroup = () => {
    if (newGroupName && newGroupMembers.length > 0) {
        const newGroup: ChatGroup = {
            id: `G-${Date.now()}`,
            name: newGroupName,
            members: [...newGroupMembers, currentUser.employeeId || 'ADMIN'],
            createdBy: currentUser.employeeId || 'ADMIN'
        };
        setGroups([...groups, newGroup]);
        setShowGroupModal(false);
        setNewGroupName('');
        setNewGroupMembers([]);
        addNotification('Chat Group', `Group "${newGroupName}" created.`, 'CHAT', String('ALL'));
    }
  };

  const toggleGroupMember = (empId: string) => {
    if (newGroupMembers.includes(empId)) {
        setNewGroupMembers(newGroupMembers.filter(id => id !== empId));
    } else {
        setNewGroupMembers([...newGroupMembers, empId]);
    }
  };

  useEffect(() => {
    if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, selectedChatId, adminMonitorPartner]);

    // Load messages for selected chat from server and mark as read
    useEffect(() => {
        let mounted = true;
        const load = async () => {
            if (!selectedChatId) return;
            // Prevent duplicate simultaneous fetches for same teamId
            if (activeFetches.current[selectedChatId]) return;
            activeFetches.current[selectedChatId] = true;
            try {
                const r = await safeGet(`/chat/${encodeURIComponent(selectedChatId)}`);
                const p = extractPayload(r);
                if (mounted) setMessages(ensureArray(p));

                // Mark this conversation as read for the current user, but avoid repeated POSTs for same last message
                try {
                    const payloadArr = ensureArray(p) as any[];
                    const latestMsgTs = (payloadArr && payloadArr.length) ? payloadArr[payloadArr.length - 1].timestamp : undefined;
                    const lastMarked = markedReadTimes[selectedChatId || ''];
                    if (!latestMsgTs || !lastMarked || Date.parse(latestMsgTs) > Date.parse(lastMarked)) {
                        try {
                            await api.post(`/chat/${encodeURIComponent(selectedChatId)}/read`);
                        } catch (err) {
                            // If route returned 404, try alternate team ids (fallback) and log for debugging
                            const status = err && err.response && err.response.status;
                            console.warn('Mark chat read failed', status || err && (err.message || err));
                            if (status === 404) {
                                // Try fallback: if canonical DM id, try posting to partner id; if plain emp id, try canonical DM id
                                try {
                                    let fallbackTarget = selectedChatId || '';
                                    if (isDirectTeamId(selectedChatId)) {
                                        const partner = extractDirectPartnerId(selectedChatId!, currentUser.employeeId || 'ADMIN');
                                        if (partner) fallbackTarget = partner;
                                    } else if (selectedChatId && !selectedChatId.startsWith('G-')) {
                                        // try canonical DM with my id
                                        fallbackTarget = getDirectTeamId(currentUser.employeeId || 'ADMIN', selectedChatId);
                                    }
                                    if (fallbackTarget) await api.post(`/chat/${encodeURIComponent(fallbackTarget)}/read`);
                                } catch (err2) { console.warn('Fallback mark chat read failed', err2 && (err2.message || err2)); }
                            }
                        }
                        // On success (or regardless for now), cache lastMarked time
                        const now = new Date().toISOString();
                        setMarkedReadTimes(prev => ({ ...prev, [selectedChatId as string]: now }));
                        // Re-fetch messages after marking read so seen/delivered status is updated
                        try {
                            const r2 = await safeGet(`/chat/${encodeURIComponent(selectedChatId)}`);
                            const p2 = extractPayload(r2);
                            if (mounted) setMessages(ensureArray(p2));
                        } catch (e2) { /* ignore refetch failures */ }
                    }
                } catch (e) { console.warn('Mark chat read failed', e && (e.message || e)); }
            } catch (e) { console.warn('Failed to load chat messages', e && (e.stack || e.message || e)); }
            finally { activeFetches.current[selectedChatId] = false; }
        };
        load();
        return () => { mounted = false; };
    }, [selectedChatId]);

    // Poll for updates (read receipts, edits, pins) while a conversation is open so sender sees updates when partner reads
    useEffect(() => {
        if (!selectedChatId) return;
        let mounted = true;
        pollStopRef.current[selectedChatId] = false;

        // Poll loop using setTimeout to avoid overlapping requests; only poll when document is visible
        const pollOnce = async () => {
            if (!mounted || pollStopRef.current[selectedChatId]) return;
            try {
                if (document.visibilityState === 'visible' && !activeFetches.current[selectedChatId]) {
                    activeFetches.current[selectedChatId] = true;
                    try {
                        const r = await safeGet(`/chat/${encodeURIComponent(selectedChatId)}`);
                        const p = extractPayload(r);
                        if (mounted) setMessages(ensureArray(p));
                    } catch (e) {
                        // ignore poll fetch errors
                    } finally {
                        activeFetches.current[selectedChatId] = false;
                    }
                }
            } catch (e) { }
            if (!mounted || pollStopRef.current[selectedChatId]) return;
            // schedule next poll
            setTimeout(() => { try { pollOnce(); } catch (e) { /* ignore */ } }, 7000);
        };

        // Start the first poll cycle
        setTimeout(() => { try { pollOnce(); } catch (e) { /* ignore */ } }, 7000);

        return () => { mounted = false; pollStopRef.current[selectedChatId] = true; };
    }, [selectedChatId]);


  // --- ADMIN VIEW RENDER ---
  if (isAdmin && !selectedChatId && !adminMonitorTarget) {
      return (
          <div className="p-4 md:p-8 bg-slate-50/50 h-full overflow-y-auto custom-scrollbar">
              <div className="mb-8 flex justify-between items-end">
                <div>
                    <h2 className="text-2xl md:text-3xl font-extrabold text-slate-800 flex items-center gap-3">
                        <div className="w-10 h-10 bg-indigo-600 text-white rounded-xl flex items-center justify-center shadow-lg shadow-indigo-600/20 shrink-0">
                        <MessageCircle size={20} />
                        </div>
                        Team Chat
                    </h2>
                    <p className="text-slate-500 mt-2 font-medium">Chat with staff, manage groups, or monitor logs.</p>
                </div>
                <button 
                  onClick={() => setShowGroupModal(true)}
                  className="bg-indigo-600 text-white px-4 py-2 rounded-xl font-bold shadow-lg shadow-indigo-600/20 flex items-center gap-2 hover:bg-indigo-700"
                >
                    <Plus size={18}/> Create Group
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                      <h3 className="font-bold text-lg mb-4 text-slate-800">Direct Messages</h3>
                      <div className="space-y-2 max-h-60 overflow-y-auto">
                        {employees.filter(e => e.id !== 'ADMIN').map(emp => (
                            <button 
                                key={emp.id}
                                onClick={() => setSelectedChatId(getDirectTeamId(currentUser.employeeId || 'ADMIN', emp.id))}
                                className="w-full text-left p-3 hover:bg-slate-50 rounded-xl flex items-center gap-3 transition-colors border border-transparent hover:border-slate-100"
                            >
                                <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center font-bold">
                                    {emp.name.charAt(0)}
                                </div>
                                <div>
                                    <p className="font-bold text-slate-700">{emp.name}</p>
                                    <p className="text-xs text-slate-400">{emp.department}</p>
                                </div>
                            </button>
                        ))}
                      </div>
                  </div>

                   <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                      <h3 className="font-bold text-lg mb-4 text-slate-800">Group Chats</h3>
                      <div className="space-y-2 max-h-60 overflow-y-auto">
                        {groups.length === 0 ? <p className="text-slate-400 text-sm">No active groups.</p> : groups.map(grp => (
                             <button 
                                key={grp.id}
                                onClick={() => setSelectedChatId(grp.id)}
                                className="w-full text-left p-3 hover:bg-slate-50 rounded-xl flex items-center gap-3 transition-colors border border-transparent hover:border-slate-100"
                            >
                                <div className="w-10 h-10 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center font-bold">
                                    <Users size={18}/>
                                </div>
                                <div>
                                    <p className="font-bold text-slate-700">{grp.name}</p>
                                    <p className="text-xs text-slate-400">{grp.members.length} members</p>
                                </div>
                            </button>
                        ))}
                      </div>
                  </div>

                  <div className="col-span-1 md:col-span-2 bg-white p-6 rounded-3xl shadow-sm border border-slate-100 border-l-4 border-l-orange-400">
                      <h3 className="font-bold text-lg mb-4 text-slate-800 flex items-center gap-2">
                          <Eye size={20} className="text-orange-500"/> Monitor Staff Chats
                      </h3>
                      <p className="text-xs text-slate-400 mb-4">Select an employee to view their chat history.</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {employees.map(emp => (
                            <button 
                                key={emp.id}
                                onClick={() => setAdminMonitorTarget(emp.id)}
                                className="w-full text-left p-3 hover:bg-orange-50 rounded-xl flex items-center gap-3 transition-colors border border-transparent hover:border-orange-100"
                            >
                                <div className="w-8 h-8 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center font-bold text-xs">
                                    {emp.name.charAt(0)}
                                </div>
                                <span className="font-bold text-slate-700 text-sm">{emp.name}</span>
                            </button>
                        ))}
                      </div>
                  </div>
              </div>

               {/* CREATE GROUP MODAL */}
               {showGroupModal && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="p-6 border-b border-slate-100 bg-indigo-50/50 flex justify-between items-center shrink-0">
                        <h3 className="text-xl font-extrabold text-indigo-900">Create Team Group</h3>
                        <button onClick={() => setShowGroupModal(false)} className="p-2 hover:bg-indigo-100 rounded-full text-indigo-800"><X size={20}/></button>
                        </div>
                        <div className="p-6 space-y-4 overflow-y-auto">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Group Name</label>
                                <input 
                                    type="text" 
                                    className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-indigo-500 outline-none font-bold"
                                    value={newGroupName}
                                    onChange={e => setNewGroupName(e.target.value)}
                                    placeholder="e.g. Sales Team"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Select Members</label>
                                <div className="space-y-2 max-h-40 overflow-y-auto border border-slate-200 rounded-xl p-2">
                                    {employees.filter(e => e.id !== 'ADMIN').map(emp => (
                                        <div key={emp.id} className="flex items-center gap-3 p-2 hover:bg-slate-50 rounded-lg cursor-pointer" onClick={() => toggleGroupMember(emp.id)}>
                                            <div className={`w-5 h-5 rounded border flex items-center justify-center ${newGroupMembers.includes(emp.id) ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300'}`}>
                                                {newGroupMembers.includes(emp.id) && <Plus size={14} className="text-white transform rotate-45" />}
                                            </div>
                                            <span className="text-sm font-medium text-slate-700">{emp.name}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                         <div className="p-6 bg-slate-50/50 flex justify-end gap-3 border-t border-slate-100 shrink-0">
                            <button onClick={() => setShowGroupModal(false)} className="px-5 py-2.5 text-slate-600 font-bold hover:bg-slate-100 rounded-xl">Cancel</button>
                            <button onClick={handleCreateGroup} className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-600/20">Create Group</button>
                        </div>
                    </div>
                </div>
               )}
          </div>
      );
  }

  // --- ADMIN MONITORING DETAIL VIEW ---
  if (adminMonitorTarget) {
      const targetEmp = employees.find(e => e.id === adminMonitorTarget);
      
      // If partner selected, show chat (supporting DM canonical ids, groups, and an 'ALL' view)
      if (adminMonitorPartner) {


          const partnerName = adminMonitorPartner === 'ALL' ? 'All Conversations' : (isDirectTeamId(adminMonitorPartner) ? (extractDirectPartnerId(adminMonitorPartner, adminMonitorTarget) || adminMonitorPartner) : (groups.find(g => g.id === adminMonitorPartner)?.name || employees.find(e => e.id === adminMonitorPartner)?.name || adminMonitorPartner));

          const history = monitorMessages.slice().sort((a,b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

          return (
             <div className="flex flex-col h-full bg-slate-50">
                 <div className="p-4 bg-white border-b border-slate-200 shadow-sm flex items-center justify-between">
                     <div className="flex items-center gap-3">
                         <button onClick={() => setAdminMonitorPartner(null)} className="text-sm font-bold text-slate-500 hover:text-slate-800">← Back</button>
                         <div>
                            <h3 className="font-bold text-slate-800 text-lg">Monitoring: {targetEmp?.name} & {partnerName}</h3>
                            <p className="text-xs text-orange-500 font-bold uppercase tracking-wider">Read Only Mode</p>
                         </div>
                     </div>
                     <button onClick={() => { setAdminMonitorTarget(null); setAdminMonitorPartner(null); }} className="text-slate-400 hover:text-red-500">Close Monitor</button>
                 </div>
                 
                 <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-100" ref={scrollRef}>
                    {history.length === 0 ? (
                        <p className="text-center text-slate-400 mt-10">No messages found for this selection.</p>
                    ) : (
                        history.map(msg => {
                            const isTargetSender = msg.senderId === adminMonitorTarget;
                            const partnerLbl = (msg.senderId === adminMonitorTarget) ? (employees.find(e => e.id === msg.receiverId)?.name || msg.receiverId) : (employees.find(e => e.id === msg.senderId)?.name || msg.senderId);
                            return (
                                <div key={msg.id} className={`flex ${isTargetSender ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[70%] p-4 rounded-2xl shadow-sm ${isTargetSender ? 'bg-white text-slate-800 rounded-tr-none' : 'bg-slate-200 text-slate-800 rounded-tl-none'}`}>
                                        <p className="text-xs font-bold mb-1 opacity-50">{isTargetSender ? targetEmp?.name : partnerLbl}</p>
                                        <p>{msg.content}</p>
                                        {msg.attachment && (
                                            <div className="mt-2 p-2 bg-slate-50 border border-slate-200 rounded flex items-center gap-2 text-xs">
                                                <Paperclip size={14}/> {msg.attachment}
                                            </div>
                                        )}
                                        <p className="text-[10px] opacity-40 mt-1 text-right">{new Date(msg.timestamp).toLocaleTimeString()}</p>
                                    </div>
                                </div>
                            );
                        })
                    )}
                 </div>
             </div>
          );
      }

      // Build partners list for the target: DMs (canonical), legacy partners, and groups where target is a member
      const myTarget = String(adminMonitorTarget);
      const dmPartners = Array.from(new Set(messages.filter(m => m.teamId && isDirectTeamId(m.teamId) && m.teamId.split('-').slice(1).includes(myTarget)).map(m => String(m.teamId))));
      const legacyPartners = Array.from(new Set([
          ...messages.filter(m => m.senderId === myTarget).map(m => m.receiverId),
          ...messages.filter(m => m.receiverId === myTarget).map(m => m.senderId)
      ].filter(Boolean).map(String)));
      const groupPartners = Array.from(new Set(groups.filter(g => g.members.includes(myTarget)).map(g => g.id)));

      // Merge and normalize: ALL, DM canonical ids, legacy partners converted to canonical DM, then group ids
      const partnerList: string[] = ['ALL', ...dmPartners, ...legacyPartners.map(id => getDirectTeamId(myTarget, id as string)), ...groupPartners];

      // Fetch monitor messages when admin selects a partner
      useEffect(() => {
          let mounted = true;
          setMonitorMessages([]);
          if (!adminMonitorTarget || !adminMonitorPartner) return;
          (async () => {
              setMonitorLoading(true);
              try {
                  if (adminMonitorPartner === 'ALL') {
                      const r = await safeGet(`/chat/employee/${encodeURIComponent(adminMonitorTarget)}`);
                      const p = extractPayload(r);
                      if (mounted) setMonitorMessages(ensureArray(p));
                  } else if (isDirectTeamId(adminMonitorPartner) || adminMonitorPartner.startsWith('G-')) {
                      const r = await safeGet(`/chat/${encodeURIComponent(adminMonitorPartner)}`);
                      const p = extractPayload(r);
                      if (mounted) setMonitorMessages(ensureArray(p));
                  } else {
                      // Legacy employee id — convert to canonical DM and fetch
                      const canonical = getDirectTeamId(adminMonitorTarget, adminMonitorPartner);
                      const r = await safeGet(`/chat/${encodeURIComponent(canonical)}`);
                      const p = extractPayload(r);
                      if (mounted) setMonitorMessages(ensureArray(p));
                  }
              } catch (err) { console.warn('Failed to load monitor messages', err && (err.message || err)); }
              finally { if (mounted) setMonitorLoading(false); }
          })();
          return () => { mounted = false; };
      }, [adminMonitorPartner, adminMonitorTarget]);

      return (
        <div className="p-8 bg-slate-50 h-full">
            <button onClick={() => setAdminMonitorTarget(null)} className="mb-4 text-sm font-bold text-slate-500 hover:text-slate-800">← Back to Dashboard</button>
            <h2 className="text-2xl font-bold text-slate-800 mb-6">Select conversation for {targetEmp?.name}</h2>
            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                {partnerList.length === 0 ? (
                    <div className="p-10 text-center text-slate-400">No conversations found for this user.</div>
                ) : (
                    partnerList.map(id => {
                        const isAll = id === 'ALL';
                        const isGroup = groups.some(g => g.id === id);
                        const partnerEmpId = isDirectTeamId(id) ? extractDirectPartnerId(id, adminMonitorTarget) : (!isGroup && !isAll ? id : null);
                        const partnerEmp = partnerEmpId ? employees.find(e => e.id === partnerEmpId) : null;
                        const group = groups.find(g => g.id === id);
                        const displayName = isAll ? 'All Conversations' : (group ? group.name : (partnerEmp ? partnerEmp.name : (isDirectTeamId(id) ? (extractDirectPartnerId(id, adminMonitorTarget) || id) : id)));
                        return (
                             <button 
                                key={id}
                                onClick={() => setAdminMonitorPartner(id)}
                                className="w-full text-left p-4 hover:bg-slate-50 border-b border-slate-100 last:border-0 flex items-center gap-3"
                            >
                                <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold text-sm">
                                    {displayName.charAt(0)}
                                </div>
                                <div className="flex-1">
                                    <div className="font-bold text-slate-800 truncate">{displayName}</div>
                                    <div className="text-xs text-slate-400">{isAll ? 'View all messages for this user' : (group ? `${group.members.length} members` : (partnerEmp ? partnerEmp.designation || '' : 'Direct message'))}</div>
                                </div>
                            </button>
                        );
                    })
                )}
            </div>
        </div>
      );
  }

  // --- REGULAR CHAT VIEW (Employee or Admin Chatting) ---

  const myId = currentUser.employeeId || 'ADMIN';
  const chatHistory = selectedChatId ? getConversation(myId, selectedChatId) : [];

  let activePartnerEmp = null as Employee | null;
  let activeGroup = null as ChatGroup | null;
  let chatName = 'Unknown';

  if (selectedChatId) {
      if (isDirectTeamId(selectedChatId)) {
          const partnerId = extractDirectPartnerId(selectedChatId, myId);
          activePartnerEmp = employees.find(e => e.id === partnerId) || null;
          chatName = activePartnerEmp ? activePartnerEmp.name : (partnerId || 'Direct Message');
      } else {
          activePartnerEmp = employees.find(e => e.id === selectedChatId) || null;
          activeGroup = groups.find(g => g.id === selectedChatId) || null;
          chatName = activePartnerEmp ? activePartnerEmp.name : (activeGroup ? activeGroup.name : 'Unknown');
      }
  }

  return (
    <div className="flex h-full bg-slate-50 overflow-hidden">
      {/* Sidebar List */}
      <div className={`${selectedChatId ? 'hidden md:flex' : 'flex'} w-full md:w-80 bg-white border-r border-slate-200 flex-col`}>
        <div className="p-4 border-b border-slate-100">
            <h2 className="font-bold text-xl text-slate-800 mb-4">Messages</h2>
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input type="text" placeholder="Search people..." className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
        </div>
        <div className="flex-1 overflow-y-auto">
            {/* Groups */}
            {groups.length > 0 && (
                <>
                <div className="px-4 py-2 text-xs font-bold text-slate-400 uppercase tracking-wider">Groups</div>
                {groups.map(grp => (
                     <button
                        key={grp.id}
                        onClick={() => setSelectedChatId(grp.id)}
                        className={`w-full text-left p-4 flex items-center gap-3 hover:bg-slate-50 transition-colors ${selectedChatId === grp.id ? 'bg-indigo-50 border-r-4 border-indigo-500' : ''}`}
                    >
                        <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 font-bold shrink-0">
                            <Users size={20} />
                        </div>
                        <div className="overflow-hidden">
                            <p className="font-bold text-slate-800 truncate">{grp.name}</p>
                            <p className="text-xs text-slate-400 truncate">{grp.members.length} members</p>
                        </div>
                    </button>
                ))}
                </>
            )}

            {/* People */}
            <div className="px-4 py-2 text-xs font-bold text-slate-400 uppercase tracking-wider mt-2">People</div>
            {/* DEBUG: show current employees count and current user id to help debug empty list for non-admins */}
            <div className="px-4 pb-2 text-xs text-slate-400">Employees: <span className="font-bold">{employees.length}</span> • You: <span className="font-bold">{myId}</span></div>
            {employees.filter(e => e.id !== myId).map(emp => (
                <button
                    key={emp.id}
                    title={emp.name}
                    aria-label={`Open conversation with ${emp.name}`}
                    onClick={() => setSelectedChatId(getDirectTeamId(myId, emp.id))}
                    className={`w-full text-left p-4 flex items-center gap-3 hover:bg-slate-50 transition-colors ${selectedChatId === getDirectTeamId(myId, emp.id) ? 'bg-indigo-50 border-r-4 border-indigo-500' : ''}`}
                >
                    <div className="w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 font-bold shrink-0">
                        {emp.name.charAt(0)}
                    </div>
                    <div className="overflow-hidden">
                        <p className="font-bold text-slate-800 truncate">{emp.name}</p>
                        <p className="text-xs text-slate-400 truncate">{emp.designation}</p>
                    </div>
                </button>
            ))}
        </div>
      </div>

      {/* Chat Window */}
      {selectedChatId ? (
          <div className="flex-1 flex flex-col h-full">
              {/* Header */}
              <div className="p-4 bg-white border-b border-slate-200 flex items-center gap-3 shadow-sm z-10">
                  <button onClick={() => setSelectedChatId(null)} className="md:hidden text-slate-500 p-1"><ArrowLeft size={20}/></button>
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${activeGroup ? 'bg-purple-100 text-purple-600' : 'bg-indigo-100 text-indigo-600'}`}>
                      {activeGroup ? <Users size={20}/> : chatName.charAt(0)}
                  </div>
                  <div>
                      <h3 className="font-bold text-slate-800">{chatName}</h3>
                      {activePartnerEmp && <p className="text-xs text-green-500 font-bold flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-green-500"></div> Online</p>}
                      {activeGroup && <p className="text-xs text-slate-400">{activeGroup.members.length} members</p>}
                  </div>
              </div>

              {/* Messages */}
              <div onClick={() => setMenuForMessage(null)} className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50" ref={scrollRef}>
                  {chatHistory.length === 0 ? (
                      <div className="text-center text-slate-400 mt-10 opacity-50">
                          <MessageCircle size={48} className="mx-auto mb-2"/>
                          <p>Start the conversation</p>
                      </div>
                  ) : (
                    chatHistory.map(msg => {
                        const isMe = msg.senderId === myId;
                        const senderName = employees.find(e => e.id === msg.senderId)?.name || msg.senderId;

                        const timeStr = msg.timestamp && !isNaN(Date.parse(msg.timestamp)) ? new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : (msg.updatedAt && !isNaN(Date.parse(msg.updatedAt)) ? new Date(msg.updatedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '');

                        return (
                            <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                                <div className={`relative max-w-[75%] p-4 rounded-2xl shadow-sm text-sm ${isMe ? 'bg-indigo-600 text-white rounded-tr-none' : msg.isDeleted ? 'bg-slate-100 text-slate-400 italic' : 'bg-white text-slate-800 border border-slate-100 rounded-tl-none'}`}>
                                    {!isMe && <p className="text-[10px] font-bold opacity-60 mb-1 text-slate-600">{senderName}</p>} 

                                    {/* Edit mode */}
                                    {editingMessageId === msg.id ? (
                                        <div className="flex gap-2">
                                            <input className="flex-1 rounded p-2 border border-slate-200" value={editText} onChange={(e) => setEditText(e.target.value)} />
                                            <button className="px-3 py-1 bg-green-600 text-white rounded" onClick={async () => {
                                                try { await api.put(`/chat/${encodeURIComponent(msg.id)}`, { message: editText }); const r = await safeGet(`/chat/${encodeURIComponent(selectedChatId!)}`); const p = extractPayload(r); setMessages(ensureArray(p)); } catch (e) { console.warn('Edit failed', e && (e.message || e)); }
                                                setEditingMessageId(null); setEditText('');
                                            }}>Save</button>
                                            <button className="px-3 py-1 bg-slate-200 rounded" onClick={() => { setEditingMessageId(null); setEditText(''); }}>Cancel</button>
                                        </div>
                                    ) : (
                                        <>
                                            <p>{msg.isDeleted ? 'Message deleted' : (msg.content && String(msg.content).trim() !== '' && msg.content !== 'Invalid Date' ? msg.content : (msg.attachment ? '(Attachment)' : ''))}</p>
                                            {msg.attachment && (
                                                <div className={`mt-2 p-2 rounded flex items-center gap-2 text-xs ${isMe ? 'bg-indigo-500' : 'bg-slate-100'}`}>
                                                    <Paperclip size={14}/> {msg.attachment}
                                                </div>
                                            )}
                                        </>
                                    )}

                                    {/* Actions */}
                                    {!msg.isDeleted && (
                                        <button onClick={(e) => {
                                            e.stopPropagation();
                                            const rect = (e.target as HTMLElement).getBoundingClientRect();
                                            setMenuForMessage({ id: msg.id, x: Math.round(rect.right), y: Math.round(rect.bottom) });
                                        }} className={`absolute top-1 right-1 text-slate-400 hover:text-slate-800 p-1`}><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M3 9.5A1.5 1.5 0 1 1 3 6.5a1.5 1.5 0 0 1 0 3zm5 0A1.5 1.5 0 1 1 8 6.5a1.5 1.5 0 0 1 0 3zm5 0A1.5 1.5 0 1 1 13 6.5a1.5 1.5 0 0 1 0 3z"/></svg></button>
                                    )}

                                    {menuForMessage && menuForMessage.id === msg.id && (
                                        <div style={{ position: 'fixed', left: menuForMessage.x - 180, top: menuForMessage.y + 6 }} className="w-44 bg-white rounded shadow z-50 text-sm text-slate-700">
                                            <button className="w-full text-left px-3 py-2 hover:bg-slate-50" onClick={() => { setShowInfoMessageId(msg.id); setMenuForMessage(null); }}>Info</button>
                                            <button className="w-full text-left px-3 py-2 hover:bg-slate-50" onClick={() => { setMenuForMessage(null); setReplyToMessageId(msg.id); }}>Reply</button>
                                            <button className="w-full text-left px-3 py-2 hover:bg-slate-50" onClick={async () => { setMenuForMessage(null); try { await navigator.clipboard.writeText(msg.content || ''); } catch (e) { console.warn('Copy failed', e); } }}>Copy</button>
                                            {(msg.senderId === myId || isAdmin) && <button className="w-full text-left px-3 py-2 hover:bg-slate-50" onClick={() => { setMenuForMessage(null); setEditingMessageId(msg.id); setEditText(msg.content || ''); }}>Edit</button>}
                                            {(msg.senderId === myId || isAdmin) && <button className="w-full text-left px-3 py-2 hover:bg-slate-50 text-red-600" onClick={async () => { setMenuForMessage(null); try { await api.delete(`/chat/${encodeURIComponent(msg.id)}`); const r = await safeGet(`/chat/${encodeURIComponent(selectedChatId!)}`); const p = extractPayload(r); setMessages(ensureArray(p)); } catch (e) { console.warn('Delete failed', e && (e.message || e)); } }}>Delete</button>}
                                            <button className="w-full text-left px-3 py-2 hover:bg-slate-50" onClick={async () => { setMenuForMessage(null); try { await api.put(`/chat/${encodeURIComponent(msg.id)}`, { isPinned: !msg.isPinned }); const r = await safeGet(`/chat/${encodeURIComponent(selectedChatId!)}`); const p = extractPayload(r); setMessages(ensureArray(p)); } catch (e) { console.warn('Pin failed', e && (e.message || e)); } }}>{msg.isPinned ? 'Unpin' : 'Pin'}</button>
                                        </div>
                                    )}

                                    <div className="flex items-center gap-2 justify-end mt-1">
                                        <p className={`text-[10px] ${isMe ? 'text-indigo-200' : 'text-slate-400'}`}>{timeStr}</p>
                                        {isMe && (() => {
                                            const seenFlag = (msg as any).isSeen;
                                            const seenAt = (msg as any).seenAt;
                                            return (
                                                <div className="text-[12px] opacity-80" title={seenFlag ? `Seen ${seenAt ? new Date(seenAt).toLocaleString() : ''}` : (seenFlag === false ? 'Delivered' : 'Sending...')}> 
                                                    {seenFlag ? (
                                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20 6L9 17l-5-5" stroke="#34B7F1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                                    ) : (
                                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20 6L9 17l-5-5" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                                    )}
                                                </div>
                                            );
                                        })()}
                                    </div>
                                </div>
                            </div>
                        );
                    })
                  )}
              </div>

              {/* Input */}
              <div className="p-4 bg-white border-t border-slate-200">
                  <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-2xl p-2">
                          <button className="p-2 text-slate-400 hover:text-indigo-600 transition-colors relative shrink-0">
                            <Paperclip size={20} />
                            <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => setAttachment(e.target.files?.[0] || null)} />
                          </button>
                          
                          {/* Input Area with embedded AI */}
                          <div className="flex-1 relative">
                              {replyToMessageId && (
                                  <div className="mb-2 p-2 bg-slate-100 rounded text-xs text-slate-600 flex items-center justify-between">
                                      <div className="truncate">Replying to: {chatHistory.find(m => m.id === replyToMessageId)?.content || '...'} </div>
                                      <button onClick={() => setReplyToMessageId(null)} className="text-slate-400 px-2">✕</button>
                                  </div>
                              )}
                              <input 
                                type="text" 
                                value={inputText}
                                onChange={(e) => setInputText(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                                placeholder={attachment ? `Attached: ${attachment.name}` : "Type a message..."}
                                className="w-full bg-transparent outline-none text-slate-700 placeholder-slate-400 pr-10 py-1"
                              />
                              <AITextEnhancer 
                                    text={inputText} 
                                    onUpdate={setInputText} 
                                    context="friendly but professional"
                                    mini={true}
                              />
                          </div>

                          <button 
                            onClick={handleSendMessage}
                            className="p-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-600/20 shrink-0"
                          >
                            <Send size={20} />
                          </button>
                      </div>
                  </div>
              </div>

              {/* Info modal */}
              {showInfoMessageId && (() => {
                  const msg = chatHistory.find(m => m.id === showInfoMessageId);
                  if (!msg) return null;
                  return (
                      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50">
                          <div className="bg-white rounded-2xl p-6 w-full max-w-sm">
                              <div className="flex justify-between items-center mb-4">
                                  <h3 className="font-bold">Message info</h3>
                                  <button onClick={() => setShowInfoMessageId(null)} className="text-slate-500">Close</button>
                              </div>
                              <div className="text-sm text-slate-700">
                                  <p><strong>From:</strong> {employees.find(e => e.id === msg.senderId)?.name || msg.senderId}</p>
                                  <p className="mt-2"><strong>Sent:</strong> {msg.timestamp ? new Date(msg.timestamp).toLocaleString() : 'Unknown'}</p>
                                  {msg.updatedAt && <p className="mt-2"><strong>Edited:</strong> {new Date(msg.updatedAt).toLocaleString()}</p>}
                                  {msg.isPinned && <p className="mt-2">📌 Pinned</p>}
                                  {msg.replyTo && <p className="mt-2">↩️ Reply to: {chatHistory.find(m => m.id === msg.replyTo)?.content || msg.replyTo}</p>}
                                  <p className="mt-2"><strong>Status:</strong> {msg.isDeleted ? 'Deleted' : ((msg as any).isSeen ? `Seen ${(msg as any).seenAt ? new Date((msg as any).seenAt).toLocaleString() : ''}` : 'Delivered')}</p>
                              </div>
                          </div>
                      </div>
                  );
              })()}

          </div>
      ) : (
          <div className="hidden md:flex flex-1 items-center justify-center bg-slate-50 text-slate-400 flex-col">
              <MessageCircle size={64} className="mb-4 opacity-20" />
              <p>Select a conversation to start chatting.</p>
          </div>
      )}
    </div>
  );
};
