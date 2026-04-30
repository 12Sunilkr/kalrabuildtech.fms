
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ChatMessage, Employee, User, ChatGroup, Notification } from '../types';
import { MessageCircle, Search, Send, Users, Plus, X, ArrowLeft, Check, CheckCheck, MoreVertical, Paperclip, Shield, ChevronDown } from 'lucide-react';
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

const ADMIN_ID = 'ADMIN';

function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function formatTime(ts: string) {
  if (!ts || isNaN(Date.parse(ts))) return '';
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDay(ts: string) {
  if (!ts || isNaN(Date.parse(ts))) return '';
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}

const avatarColors = ['#6366f1','#8b5cf6','#ec4899','#f59e0b','#10b981','#3b82f6','#ef4444','#14b8a6'];
function getColor(id: string) { let h = 0; for (let i = 0; i < id.length; i++) h = id.charCodeAt(i) + ((h << 5) - h); return avatarColors[Math.abs(h) % avatarColors.length]; }

export const ChatSystem: React.FC<ChatSystemProps> = ({ messages, setMessages, groups, setGroups, currentUser, employees, addNotification }) => {
  const myId = currentUser.employeeId || ADMIN_ID;
  const isAdmin = currentUser.role === 'ADMIN';

  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [search, setSearch] = useState('');
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupMembers, setNewGroupMembers] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [menuMsgId, setMenuMsgId] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  // Use ref (not state) for seen timestamps — avoids stale closure in poll callbacks
  const lastSeenTsRef = useRef<Record<string, number>>({});
  const mountTs = useRef(Date.now());
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeFetch = useRef(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Helper: mark a chat as seen RIGHT NOW (clears badge, updates baseline)
  const markChatSeen = useCallback((chatId: string) => {
    lastSeenTsRef.current[chatId] = Date.now();
    setUnreadCounts(prev => prev[chatId] ? { ...prev, [chatId]: 0 } : prev);
  }, []);

  // ── Helpers ──
  const getDmId = (a: string, b: string) => `DM-${[a, b].sort().join('-')}`;
  const isDmId = (id?: string | null) => !!id && id.startsWith('DM-');
  const getPartnerId = (dmId: string) => dmId.split('-').slice(1).find(p => p !== myId) || null;

  // ── Get last message for any chatId ──
  const getLastMsg = (chatId: string) => [...messages].filter(m => m.teamId === chatId || m.receiverId === chatId).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];

  // ── Load messages when chat selected ──
  const loadMessages = useCallback(async (chatId: string, silent = false) => {
    if (!chatId || activeFetch.current) return;
    activeFetch.current = true;
    try {
      const r = await safeGet(`/chat/${encodeURIComponent(chatId)}`);
      const msgs = ensureArray(extractPayload(r));
      setMessages(msgs);
      if (!silent) {
        markChatSeen(chatId);
        try { await api.post(`/chat/${encodeURIComponent(chatId)}/read`); } catch {}
      }
    } catch (e) { console.warn('Chat load failed', e); }
    finally { activeFetch.current = false; }
  }, [setMessages, markChatSeen]);

  // ── Background poll: detect new messages in background chats ──
  const pollAllChats = useCallback(async () => {
    try {
      const res = await safeGet('/chat/unread_summary');
      const counts = extractPayload(res);
      if (!counts || typeof counts !== 'object') return;

      setUnreadCounts(prev => {
        let changed = false;
        const next = { ...prev };
        for (const [chatId, unread] of Object.entries(counts)) {
          if (chatId === selectedChatId) continue;
          if (next[chatId] !== unread) {
            next[chatId] = unread as number;
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    } catch (e) {
      // ignore
    }
  }, [selectedChatId]);

  useEffect(() => {
    if (!selectedChatId) return;
    setIsLoading(true);
    loadMessages(selectedChatId).finally(() => setIsLoading(false));
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => loadMessages(selectedChatId, true), 6000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [selectedChatId, loadMessages]);

  // Background poll for unread badges
  useEffect(() => {
    const interval = setInterval(pollAllChats, 10000);
    return () => clearInterval(interval);
  }, [pollAllChats]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, selectedChatId]);

  useEffect(() => {
    if (selectedChatId) inputRef.current?.focus();
  }, [selectedChatId]);

  // ── Derive chat history ──
  const chatHistory = React.useMemo(() => {
    if (!selectedChatId) return [];
    const isGroup = groups.some(g => g.id === selectedChatId);
    if (isGroup) return messages.filter(m => m.receiverId === selectedChatId).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    if (isDmId(selectedChatId)) return messages.filter(m => m.teamId === selectedChatId).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    return messages.filter(m => (m.senderId === myId && m.receiverId === selectedChatId) || (m.senderId === selectedChatId && m.receiverId === myId)).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [messages, selectedChatId, groups, myId]);

  // ── Send message ──
  const handleSend = async () => {
    if (!inputText.trim() || !selectedChatId || isSending) return;
    const text = inputText.trim();
    setInputText('');
    setIsSending(true);

    const partnerId = isDmId(selectedChatId) ? getPartnerId(selectedChatId) : selectedChatId;
    const newMsg: ChatMessage = {
      id: `C-${Date.now()}`,
      senderId: myId,
      receiverId: partnerId || selectedChatId,
      content: text,
      timestamp: new Date().toISOString(),
      teamId: selectedChatId,
    };
    setMessages(prev => [...prev, newMsg]);

    try {
      await api.post('/chat', { teamId: selectedChatId, message: text, senderId: myId });
      const r = await safeGet(`/chat/${encodeURIComponent(selectedChatId)}`);
      setMessages(ensureArray(extractPayload(r)));
    } catch (e) { console.warn('Send failed', e); }
    finally { setIsSending(false); }
  };

  // ── Create group ──
  const handleCreateGroup = async () => {
    if (!newGroupName || newGroupMembers.length === 0) return;
    const grp: ChatGroup = { id: `G-${Date.now()}`, name: newGroupName, members: [...newGroupMembers, myId], createdBy: myId };
    setGroups(prev => [...prev, grp]);
    setShowGroupModal(false);
    setNewGroupName('');
    setNewGroupMembers([]);
    addNotification('Group Chat', `Group "${newGroupName}" created`, 'CHAT', 'ALL');
  };

  // ── Chat info ──
  const activeGroup = selectedChatId ? groups.find(g => g.id === selectedChatId) : null;
  const activePartner = selectedChatId && isDmId(selectedChatId) ? employees.find(e => e.id === getPartnerId(selectedChatId)) : null;
  const chatName = activeGroup ? activeGroup.name : (activePartner ? activePartner.name : isAdmin ? 'Admin' : 'Unknown');

  // ── Filter contacts ──
  const filteredEmployees = employees.filter(e => e.id !== myId && e.name.toLowerCase().includes(search.toLowerCase()));
  const filteredGroups = groups.filter(g => g.name.toLowerCase().includes(search.toLowerCase()));

  // ── Sender display ──
  const getSenderName = (senderId: string) => {
    if (senderId === ADMIN_ID || senderId === 'ADMIN') return 'Admin';
    return employees.find(e => e.id === senderId)?.name || senderId;
  };

  // ── Group messages by date ──
  const groupedMessages = React.useMemo(() => {
    const groups: { date: string; messages: ChatMessage[] }[] = [];
    let lastDate = '';
    chatHistory.forEach(msg => {
      const d = formatDay(msg.timestamp);
      if (d !== lastDate) { groups.push({ date: d, messages: [] }); lastDate = d; }
      groups[groups.length - 1]?.messages.push(msg);
    });
    return groups;
  }, [chatHistory]);

  return (
    <div className="flex h-full overflow-hidden" style={{ fontFamily: "'Inter', sans-serif", background: '#f0f2f5' }}>
      {/* ── Sidebar ── */}
      <div className={`${selectedChatId ? 'hidden md:flex' : 'flex'} flex-col w-full md:w-96 bg-white border-r`} style={{ borderColor: '#e9edef' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3" style={{ background: '#f0f2f5' }}>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm" style={{ background: '#00a884' }}>
              {getInitials(currentUser.name || 'ME')}
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800">{currentUser.name}</p>
              {isAdmin && <span className="text-xs font-bold px-1.5 py-0.5 rounded text-white" style={{ background: '#7c3aed', fontSize: '9px' }}>ADMIN</span>}
            </div>
          </div>
          {isAdmin && (
            <button onClick={() => setShowGroupModal(true)} className="p-2 rounded-full hover:bg-gray-200 transition-colors" title="New Group">
              <Users size={20} className="text-gray-600" />
            </button>
          )}
        </div>

        {/* Search */}
        <div className="px-3 py-2" style={{ background: '#fff' }}>
          <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: '#f0f2f5' }}>
            <Search size={16} className="text-gray-400 shrink-0" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search or start new chat" className="bg-transparent flex-1 text-sm outline-none text-gray-700 placeholder-gray-400" />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {/* Groups sorted by latest message */}
          {filteredGroups
            .map(grp => ({ grp, lastMsg: getLastMsg(grp.id), unread: unreadCounts[grp.id] || 0 }))
            .sort((a, b) => (b.lastMsg ? new Date(b.lastMsg.timestamp).getTime() : 0) - (a.lastMsg ? new Date(a.lastMsg.timestamp).getTime() : 0))
            .map(({ grp, lastMsg, unread }) => {
              const active = selectedChatId === grp.id;
              return (
                <button key={grp.id} onClick={() => { setSelectedChatId(grp.id); markChatSeen(grp.id); }}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors border-b"
                  style={{ borderColor: '#f0f2f5', background: active ? '#ebebeb' : unread > 0 ? '#f0fdf4' : undefined }}>
                  <div className="relative">
                    <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0" style={{ background: '#7c3aed' }}>
                      <Users size={20} className="text-white" />
                    </div>
                    {unread > 0 && <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center" style={{ background: '#00a884' }}>{unread > 9 ? '9+' : unread}</span>}
                  </div>
                  <div className="flex-1 text-left overflow-hidden">
                    <div className="flex justify-between items-baseline">
                      <p className={`text-sm truncate ${unread > 0 ? 'font-bold text-gray-900' : 'font-semibold text-gray-800'}`}>{grp.name}</p>
                      {lastMsg && <span className="text-xs shrink-0 ml-1" style={{ color: unread > 0 ? '#00a884' : '#667781' }}>{formatTime(lastMsg.timestamp)}</span>}
                    </div>
                    <p className={`text-xs truncate ${unread > 0 ? 'font-semibold text-gray-700' : 'text-gray-400'}`}>{lastMsg ? lastMsg.content : `${grp.members.length} members`}</p>
                  </div>
                </button>
              );
            })}

          {/* Separator */}
          {!search && filteredGroups.length > 0 && <div className="px-4 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest" style={{ background: '#f0f2f5' }}>Direct Messages</div>}

          {/* Employees sorted by latest message */}
          {filteredEmployees
            .map(emp => {
              const dmId = getDmId(myId, emp.id);
              const lastMsg = getLastMsg(dmId);
              const unread = unreadCounts[dmId] || 0;
              return { emp, dmId, lastMsg, unread, ts: lastMsg ? new Date(lastMsg.timestamp).getTime() : 0 };
            })
            .sort((a, b) => b.ts - a.ts)
            .map(({ emp, dmId, lastMsg, unread }) => {
              const active = selectedChatId === dmId;
              const lastSender = lastMsg ? getSenderName(lastMsg.senderId) : '';
              return (
                <button key={emp.id} onClick={() => { setSelectedChatId(dmId); markChatSeen(dmId); }}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-all border-b"
                  style={{ borderColor: '#f0f2f5', background: active ? '#ebebeb' : unread > 0 ? '#f0fdf4' : undefined }}>
                  <div className="relative shrink-0">
                    <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-sm" style={{ background: getColor(emp.id) }}>
                      {getInitials(emp.name)}
                    </div>
                    {unread > 0 && <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full text-white text-[10px] font-bold flex items-center justify-center" style={{ background: '#00a884' }}>{unread > 9 ? '9+' : unread}</span>}
                  </div>
                  <div className="flex-1 text-left overflow-hidden">
                    <div className="flex justify-between items-baseline">
                      <p className={`text-sm truncate ${unread > 0 ? 'font-bold text-gray-900' : 'font-semibold text-gray-700'}`}>{emp.name}</p>
                      {lastMsg && <span className="text-[11px] shrink-0 ml-1" style={{ color: unread > 0 ? '#00a884' : '#667781' }}>{formatTime(lastMsg.timestamp)}</span>}
                    </div>
                    <p className={`text-xs truncate ${unread > 0 ? 'font-semibold text-gray-800' : 'text-gray-400'}`}>
                      {lastMsg ? (lastMsg.senderId === myId ? `You: ${lastMsg.content}` : lastMsg.content) : emp.designation || emp.department || ''}
                    </p>
                  </div>
                </button>
              );
            })}
        </div>
      </div>

      {/* ── Chat Window ── */}
      {selectedChatId ? (
        <div className="flex-1 flex flex-col h-full" style={{ background: '#efeae2' }}>
          {/* Chat Header */}
          <div className="flex items-center gap-3 px-4 py-3 shadow-sm z-10" style={{ background: '#f0f2f5' }}>
            <button onClick={() => setSelectedChatId(null)} className="md:hidden p-1 text-gray-500 hover:text-gray-800">
              <ArrowLeft size={22} />
            </button>
            <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-white font-bold text-sm" style={{ background: activeGroup ? '#7c3aed' : activePartner ? getColor(activePartner.id) : '#00a884' }}>
              {activeGroup ? <Users size={18} /> : getInitials(chatName)}
            </div>
            <div className="flex-1">
              <p className="font-semibold text-gray-900 text-sm">{chatName}</p>
              <p className="text-xs text-gray-500">{activeGroup ? `${activeGroup.members.length} members` : activePartner ? activePartner.designation || activePartner.department || 'Employee' : 'Administrator'}</p>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-1" onClick={() => setMenuMsgId(null)}
            style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' xmlns='http://www.w3.org/2000/svg'%3E%3C/svg%3E\")", backgroundSize: '400px' }}>
            {isLoading ? (
              <div className="flex justify-center mt-20"><div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#00a884', borderTopColor: 'transparent' }} /></div>
            ) : chatHistory.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3 mt-20">
                <div className="w-20 h-20 rounded-full flex items-center justify-center" style={{ background: '#d9fdd3' }}>
                  <MessageCircle size={36} style={{ color: '#00a884' }} />
                </div>
                <p className="font-medium">No messages yet</p>
                <p className="text-sm text-center max-w-xs">Start the conversation by sending a message below.</p>
              </div>
            ) : (
              groupedMessages.map((group, gi) => (
                <div key={gi}>
                  {/* Date separator */}
                  <div className="flex justify-center my-3">
                    <span className="text-xs px-3 py-1 rounded-full font-medium shadow-sm" style={{ background: '#fff', color: '#667781' }}>{group.date}</span>
                  </div>
                  {group.messages.map((msg, mi) => {
                    const isMe = msg.senderId === myId;
                    const senderName = getSenderName(msg.senderId);
                    const senderIsAdmin = msg.senderId === ADMIN_ID;
                    const showName = !isMe && (!!activeGroup || senderIsAdmin);
                    const prevMsg = mi > 0 ? group.messages[mi - 1] : null;
                    const isSameGroup = prevMsg && prevMsg.senderId === msg.senderId;

                    return (
                      <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} ${isSameGroup ? 'mt-0.5' : 'mt-2'}`}>
                        {/* Avatar for others */}
                        {!isMe && (
                          <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mr-1 self-end mb-0.5 text-white font-bold text-xs" style={{ background: senderIsAdmin ? '#7c3aed' : getColor(msg.senderId), visibility: isSameGroup ? 'hidden' : 'visible' }}>
                            {senderIsAdmin ? <Shield size={12} /> : getInitials(senderName)}
                          </div>
                        )}

                        <div className={`relative max-w-[70%] group`}>
                          <div className={`px-3 py-2 rounded-2xl shadow-sm text-sm leading-relaxed ${isMe ? 'rounded-tr-sm text-gray-900' : 'rounded-tl-sm text-gray-900'}`}
                            style={{ background: isMe ? '#d9fdd3' : '#fff' }}>
                            {showName && !isSameGroup && (
                              <p className="text-xs font-bold mb-1" style={{ color: senderIsAdmin ? '#7c3aed' : getColor(msg.senderId) }}>
                                {senderIsAdmin ? '🛡 Admin' : senderName}
                              </p>
                            )}

                            {editingId === msg.id ? (
                              <div className="flex gap-2 items-center">
                                <input value={editText} onChange={e => setEditText(e.target.value)} className="flex-1 border rounded px-2 py-1 text-sm outline-none" style={{ borderColor: '#00a884' }} autoFocus />
                                <button onClick={async () => { try { await api.put(`/chat/${msg.id}`, { message: editText }); await loadMessages(selectedChatId); } catch {} setEditingId(null); }} className="text-xs font-bold text-white px-2 py-1 rounded" style={{ background: '#00a884' }}>Save</button>
                                <button onClick={() => setEditingId(null)} className="text-xs text-gray-500">✕</button>
                              </div>
                            ) : (
                              <p className={msg.isDeleted ? 'italic text-gray-400' : ''}>{msg.isDeleted ? 'This message was deleted' : msg.content}</p>
                            )}

                            {msg.attachment && (
                              <div className="flex items-center gap-1 mt-1 text-xs rounded px-2 py-1" style={{ background: 'rgba(0,0,0,0.05)' }}>
                                <Paperclip size={11} /> {msg.attachment}
                              </div>
                            )}

                            <div className="flex items-center justify-end gap-1 mt-0.5">
                              <span className="text-xs" style={{ color: '#667781', fontSize: '10px' }}>{formatTime(msg.timestamp)}</span>
                              {isMe && (
                                (msg as any).isSeen
                                  ? <CheckCheck size={14} style={{ color: '#53bdeb' }} />
                                  : <Check size={14} style={{ color: '#667781' }} />
                              )}
                            </div>
                          </div>

                          {/* Tail */}
                          <div className={`absolute top-0 w-3 h-3 overflow-hidden ${isMe ? '-right-1.5' : '-left-1.5'}`} style={{ top: '0' }}>
                            <div className={`w-4 h-4 rotate-45 ${isMe ? 'translate-x-1 -translate-y-1' : '-translate-x-1 -translate-y-1'}`} style={{ background: isMe ? '#d9fdd3' : '#fff' }} />
                          </div>

                          {/* Context menu trigger */}
                          {!msg.isDeleted && (
                            <button onClick={e => { e.stopPropagation(); setMenuMsgId(menuMsgId === msg.id ? null : msg.id); }}
                              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-gray-700">
                              <ChevronDown size={14} />
                            </button>
                          )}

                          {menuMsgId === msg.id && (
                            <div className={`absolute ${isMe ? 'right-0' : 'left-0'} top-8 z-50 bg-white rounded-xl shadow-xl border py-1 w-40 text-sm`} style={{ borderColor: '#e9edef' }} onClick={e => e.stopPropagation()}>
                              {(isMe || isAdmin) && <button onClick={() => { setEditingId(msg.id); setEditText(msg.content || ''); setMenuMsgId(null); }} className="w-full text-left px-4 py-2 hover:bg-gray-50">Edit</button>}
                              {(isMe || isAdmin) && <button onClick={async () => { setMenuMsgId(null); try { await api.delete(`/chat/${msg.id}`); await loadMessages(selectedChatId); } catch {} }} className="w-full text-left px-4 py-2 hover:bg-gray-50 text-red-500">Delete</button>}
                              <button onClick={() => { navigator.clipboard.writeText(msg.content || '').catch(() => {}); setMenuMsgId(null); }} className="w-full text-left px-4 py-2 hover:bg-gray-50">Copy</button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          {/* Input */}
          <div className="px-3 py-2 flex items-center gap-2" style={{ background: '#f0f2f5' }}>
            <div className="flex-1 flex items-center gap-2 px-4 py-2 rounded-full" style={{ background: '#fff' }}>
              <input ref={inputRef} value={inputText} onChange={e => setInputText(e.target.value)} onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()} placeholder="Type a message" className="flex-1 outline-none text-sm text-gray-800 placeholder-gray-400 bg-transparent" />
            </div>
            <button onClick={handleSend} disabled={!inputText.trim() || isSending} className="w-11 h-11 rounded-full flex items-center justify-center text-white transition-all active:scale-95 disabled:opacity-50" style={{ background: '#00a884' }}>
              <Send size={20} className={isSending ? 'animate-pulse' : ''} />
            </button>
          </div>
        </div>
      ) : (
        <div className="hidden md:flex flex-1 flex-col items-center justify-center" style={{ background: '#f0f2f5' }}>
          <div className="w-24 h-24 rounded-full flex items-center justify-center mb-6 shadow-xl" style={{ background: '#00a884' }}>
            <MessageCircle size={44} className="text-white" />
          </div>
          <h2 className="text-2xl font-light text-gray-600 mb-2">KalraBuildtech Chat</h2>
          <p className="text-gray-400 text-sm">Select a conversation to start messaging</p>
        </div>
      )}

      {/* ── Create Group Modal ── */}
      {showGroupModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h3 className="font-bold text-gray-800">New Group</h3>
              <button onClick={() => setShowGroupModal(false)}><X size={20} className="text-gray-500" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1.5">Group Name</label>
                <input value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="e.g. Sales Team" className="w-full border rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2" style={{ borderColor: '#e9edef' }} />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1.5">Add Participants</label>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {employees.filter(e => e.id !== myId).map(emp => (
                    <div key={emp.id} onClick={() => setNewGroupMembers(prev => prev.includes(emp.id) ? prev.filter(i => i !== emp.id) : [...prev, emp.id])}
                      className="flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer hover:bg-gray-50 transition-colors">
                      <div className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0" style={{ background: getColor(emp.id) }}>{getInitials(emp.name)}</div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-800">{emp.name}</p>
                        <p className="text-xs text-gray-400">{emp.department}</p>
                      </div>
                      <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center" style={{ borderColor: newGroupMembers.includes(emp.id) ? '#00a884' : '#d1d5db', background: newGroupMembers.includes(emp.id) ? '#00a884' : 'transparent' }}>
                        {newGroupMembers.includes(emp.id) && <Check size={11} className="text-white" />}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="px-5 py-4 border-t flex justify-end gap-3">
              <button onClick={() => setShowGroupModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl font-medium">Cancel</button>
              <button onClick={handleCreateGroup} disabled={!newGroupName || newGroupMembers.length === 0} className="px-5 py-2 text-sm text-white rounded-xl font-bold disabled:opacity-50" style={{ background: '#00a884' }}>Create Group</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
