
import React, { useState, useEffect, useRef } from 'react';
import { ChatMessage, Employee, User, ChatGroup, Notification } from '../types';
import { MessageCircle, Search, Paperclip, Send, User as UserIcon, Eye, Users, Plus, X, ArrowLeft } from 'lucide-react';
import { AITextEnhancer } from './AITextEnhancer';

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

  // Admin Monitoring Mode State
  const [adminMonitorTarget, setAdminMonitorTarget] = useState<string | null>(null);
  const [adminMonitorPartner, setAdminMonitorPartner] = useState<string | null>(null);
  
  // Create Group Modal
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupMembers, setNewGroupMembers] = useState<string[]>([]);

  const isAdmin = currentUser.role === 'ADMIN';

  // --- Helpers ---
  
  const getConversation = (user1: string, user2: string) => {
    // Check if user2 is a group
    const isGroup = groups.some(g => g.id === user2);
    
    if (isGroup) {
        return messages.filter(m => m.receiverId === user2).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    } else {
        return messages.filter(
            m => (m.senderId === user1 && m.receiverId === user2) || 
                 (m.senderId === user2 && m.receiverId === user1)
        ).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    }
  };

  const handleSendMessage = () => {
    if ((!inputText.trim() && !attachment) || !selectedChatId) return;

    const newMessage: ChatMessage = {
        id: `C-${Date.now()}`,
        senderId: currentUser.employeeId || 'ADMIN',
        receiverId: selectedChatId,
        content: inputText,
        timestamp: new Date().toISOString(),
        attachment: attachment ? attachment.name : undefined
    };

    setMessages([...messages, newMessage]);
    setInputText('');
    setAttachment(null);
    
    // Notify
    if (!groups.some(g => g.id === selectedChatId)) {
       // Only notify if 1-on-1 (Simulated)
       addNotification('New Message', `Message from ${currentUser.name}`, 'CHAT', selectedChatId);
    }
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
        addNotification('Chat Group', `Group "${newGroupName}" created.`, 'CHAT', 'ALL');
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
                                onClick={() => setSelectedChatId(emp.id)}
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
      
      // If partner selected, show chat
      if (adminMonitorPartner) {
          const partnerEmp = employees.find(e => e.id === adminMonitorPartner);
          const history = getConversation(adminMonitorTarget, adminMonitorPartner);
          
          return (
             <div className="flex flex-col h-full bg-slate-50">
                 <div className="p-4 bg-white border-b border-slate-200 shadow-sm flex items-center justify-between">
                     <div className="flex items-center gap-3">
                         <button onClick={() => setAdminMonitorPartner(null)} className="text-sm font-bold text-slate-500 hover:text-slate-800">← Back</button>
                         <div>
                            <h3 className="font-bold text-slate-800 text-lg">Monitoring: {targetEmp?.name} & {partnerEmp?.name}</h3>
                            <p className="text-xs text-orange-500 font-bold uppercase tracking-wider">Read Only Mode</p>
                         </div>
                     </div>
                     <button onClick={() => { setAdminMonitorTarget(null); setAdminMonitorPartner(null); }} className="text-slate-400 hover:text-red-500">Close Monitor</button>
                 </div>
                 
                 <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-100" ref={scrollRef}>
                    {history.length === 0 ? (
                        <p className="text-center text-slate-400 mt-10">No messages between these users.</p>
                    ) : (
                        history.map(msg => {
                            const isTargetSender = msg.senderId === adminMonitorTarget;
                            return (
                                <div key={msg.id} className={`flex ${isTargetSender ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[70%] p-4 rounded-2xl shadow-sm ${isTargetSender ? 'bg-white text-slate-800 rounded-tr-none' : 'bg-slate-200 text-slate-800 rounded-tl-none'}`}>
                                        <p className="text-xs font-bold mb-1 opacity-50">{isTargetSender ? targetEmp?.name : partnerEmp?.name}</p>
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

      // List partners that the target has chatted with
      // Get unique IDs interacted with
      const interactedIds = Array.from(new Set([
          ...messages.filter(m => m.senderId === adminMonitorTarget).map(m => m.receiverId),
          ...messages.filter(m => m.receiverId === adminMonitorTarget).map(m => m.senderId)
      ]));

      return (
        <div className="p-8 bg-slate-50 h-full">
            <button onClick={() => setAdminMonitorTarget(null)} className="mb-4 text-sm font-bold text-slate-500 hover:text-slate-800">← Back to Dashboard</button>
            <h2 className="text-2xl font-bold text-slate-800 mb-6">Select conversation for {targetEmp?.name}</h2>
            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                {interactedIds.length === 0 ? (
                    <div className="p-10 text-center text-slate-400">No conversations found for this user.</div>
                ) : (
                    interactedIds.map(id => {
                        const partner = employees.find(e => e.id === id);
                        return (
                             <button 
                                key={id}
                                onClick={() => setAdminMonitorPartner(id)}
                                className="w-full text-left p-4 hover:bg-slate-50 border-b border-slate-100 last:border-0 flex items-center gap-3"
                            >
                                <div className="w-10 h-10 bg-slate-200 rounded-full flex items-center justify-center font-bold text-slate-500">
                                    {partner?.name.charAt(0) || '?'}
                                </div>
                                <span className="font-bold text-slate-700">{partner?.name || id}</span>
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

  const activePartnerEmp = employees.find(e => e.id === selectedChatId);
  const activeGroup = groups.find(g => g.id === selectedChatId);
  const chatName = activePartnerEmp ? activePartnerEmp.name : (activeGroup ? activeGroup.name : 'Unknown');

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
            {employees.filter(e => e.id !== myId).map(emp => (
                <button
                    key={emp.id}
                    onClick={() => setSelectedChatId(emp.id)}
                    className={`w-full text-left p-4 flex items-center gap-3 hover:bg-slate-50 transition-colors ${selectedChatId === emp.id ? 'bg-indigo-50 border-r-4 border-indigo-500' : ''}`}
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
              <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50" ref={scrollRef}>
                  {chatHistory.length === 0 ? (
                      <div className="text-center text-slate-400 mt-10 opacity-50">
                          <MessageCircle size={48} className="mx-auto mb-2"/>
                          <p>Start the conversation</p>
                      </div>
                  ) : (
                    chatHistory.map(msg => {
                        const isMe = msg.senderId === myId;
                        const senderName = employees.find(e => e.id === msg.senderId)?.name || msg.senderId;
                        
                        return (
                            <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[75%] p-4 rounded-2xl shadow-sm text-sm ${isMe ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-white text-slate-800 border border-slate-100 rounded-tl-none'}`}>
                                    {activeGroup && !isMe && <p className="text-[10px] font-bold opacity-60 mb-1 text-purple-600">{senderName}</p>}
                                    <p>{msg.content}</p>
                                    {msg.attachment && (
                                        <div className={`mt-2 p-2 rounded flex items-center gap-2 text-xs ${isMe ? 'bg-indigo-500' : 'bg-slate-100'}`}>
                                            <Paperclip size={14}/> {msg.attachment}
                                        </div>
                                    )}
                                    <p className={`text-[10px] mt-1 text-right ${isMe ? 'text-indigo-200' : 'text-slate-400'}`}>
                                        {new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                    </p>
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
