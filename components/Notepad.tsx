
import React, { useState } from 'react';
import { Note, User } from '../types';
import { StickyNote, Plus, Search, X, Edit2, Trash2, Calendar, Tag } from 'lucide-react';
import { format } from 'date-fns';
import { AITextEnhancer } from './AITextEnhancer';

interface NotepadProps {
  notes: Note[];
  setNotes: React.Dispatch<React.SetStateAction<Note[]>>;
  currentUser: User;
}

const NOTE_COLORS = [
  { id: 'yellow', class: 'bg-yellow-100 border-yellow-200' },
  { id: 'blue', class: 'bg-blue-100 border-blue-200' },
  { id: 'green', class: 'bg-green-100 border-green-200' },
  { id: 'pink', class: 'bg-pink-100 border-pink-200' },
  { id: 'white', class: 'bg-white border-slate-200' },
];

export const Notepad: React.FC<NotepadProps> = ({ notes, setNotes, currentUser }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [currentNote, setCurrentNote] = useState<Partial<Note>>({ 
      color: 'yellow', 
      category: 'Work' 
  });
  const [isEditing, setIsEditing] = useState(false);

  const userId = currentUser.employeeId || 'ADMIN';

  // Filter user's notes
  const myNotes = notes
    .filter(n => n.userId === userId)
    .filter(n => n.title.toLowerCase().includes(searchTerm.toLowerCase()) || n.content.toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  const handleSaveNote = () => {
      if (currentNote.title && currentNote.content) {
          const timestamp = new Date().toISOString();
          
          if (isEditing && currentNote.id) {
              setNotes(notes.map(n => n.id === currentNote.id ? { ...n, ...currentNote, updatedAt: timestamp } as Note : n));
          } else {
              const newNote: Note = {
                  id: `NOTE-${Date.now()}`,
                  userId: userId,
                  title: currentNote.title,
                  content: currentNote.content,
                  updatedAt: timestamp,
                  category: currentNote.category || 'Work',
                  color: currentNote.color || 'yellow'
              };
              setNotes([newNote, ...notes]);
          }
          
          closeModal();
      } else {
          alert("Title and content are required.");
      }
  };

  const handleDeleteNote = (id: string) => {
      if (window.confirm("Are you sure you want to delete this note?")) {
          setNotes(notes.filter(n => n.id !== id));
      }
  };

  const openEditModal = (note: Note) => {
      setCurrentNote(note);
      setIsEditing(true);
      setShowModal(true);
  };

  const openAddModal = () => {
      setCurrentNote({ color: 'yellow', category: 'Work' });
      setIsEditing(false);
      setShowModal(true);
  };

  const closeModal = () => {
      setShowModal(false);
      setCurrentNote({ color: 'yellow', category: 'Work' });
      setIsEditing(false);
  };

  return (
    <div className="p-4 md:p-8 bg-slate-50/50 h-full overflow-y-auto custom-scrollbar">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-8">
        <div>
           <h2 className="text-2xl md:text-3xl font-extrabold text-slate-800 flex items-center gap-3">
            <div className="w-10 h-10 bg-yellow-400 text-yellow-900 rounded-xl flex items-center justify-center shadow-lg shadow-yellow-400/20 shrink-0">
              <StickyNote size={20} />
            </div>
            My Notepad
          </h2>
          <p className="text-slate-500 mt-2 font-medium md:ml-14">
            Keep track of your personal tasks and ideas.
          </p>
        </div>
        <button 
          onClick={openAddModal}
          className="bg-slate-900 hover:bg-slate-800 text-white px-5 py-3 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-slate-900/20 transition-all active:scale-95 font-bold"
        >
          <Plus size={18} />
          Create Note
        </button>
      </div>

      <div className="relative w-full max-w-md mb-8">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
        <input 
            type="text"
            placeholder="Search notes..."
            className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-yellow-400 shadow-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {myNotes.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-3xl border border-slate-100 text-slate-400">
              <StickyNote size={48} className="mx-auto mb-4 opacity-20" />
              <p className="font-medium">No notes yet. Start writing!</p>
          </div>
      ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {myNotes.map(note => {
                  const colorObj = NOTE_COLORS.find(c => c.id === note.color) || NOTE_COLORS[0];
                  return (
                      <div key={note.id} className={`p-6 rounded-2xl shadow-sm border flex flex-col h-64 hover:shadow-md transition-shadow relative group ${colorObj.class}`}>
                          <div className="flex justify-between items-start mb-3">
                              <span className="text-[10px] font-bold uppercase tracking-wider bg-white/50 px-2 py-1 rounded text-slate-600 border border-black/5">
                                  {note.category}
                              </span>
                              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button onClick={() => openEditModal(note)} className="p-1.5 bg-white/80 rounded-lg hover:bg-white text-slate-600 hover:text-blue-600 shadow-sm"><Edit2 size={14}/></button>
                                  <button onClick={() => handleDeleteNote(note.id)} className="p-1.5 bg-white/80 rounded-lg hover:bg-white text-slate-600 hover:text-red-600 shadow-sm"><Trash2 size={14}/></button>
                              </div>
                          </div>
                          
                          <h3 className="font-bold text-slate-800 text-lg mb-2 line-clamp-1">{note.title}</h3>
                          <div className="flex-1 overflow-hidden relative">
                              <p className="text-slate-600 text-sm whitespace-pre-wrap">{note.content}</p>
                              <div className={`absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-${note.color === 'white' ? 'white' : note.color + '-100'} to-transparent`}></div>
                          </div>

                          <div className="mt-4 pt-3 border-t border-black/5 flex items-center gap-2 text-xs font-medium text-slate-500">
                              <Calendar size={12}/>
                              <span>{format(new Date(note.updatedAt), 'MMM d, yyyy • h:mm a')}</span>
                          </div>
                      </div>
                  );
              })}
          </div>
      )}

      {/* ADD/EDIT MODAL */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center shrink-0">
               <h3 className="text-xl font-extrabold text-slate-800">{isEditing ? 'Edit Note' : 'New Note'}</h3>
               <button onClick={closeModal} className="p-2 hover:bg-slate-200 rounded-full text-slate-500"><X size={20}/></button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto">
               <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Title</label>
                  <input 
                      type="text" 
                      className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-yellow-400 outline-none font-bold text-lg"
                      value={currentNote.title || ''}
                      onChange={e => setCurrentNote({ ...currentNote, title: e.target.value })}
                      placeholder="Note Title"
                      autoFocus
                  />
               </div>
               
               <div className="grid grid-cols-2 gap-4">
                   <div>
                       <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Category</label>
                       <select 
                          className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-yellow-400 outline-none bg-white"
                          value={currentNote.category}
                          onChange={e => setCurrentNote({ ...currentNote, category: e.target.value as any })}
                       >
                           <option value="Work">Work</option>
                           <option value="Personal">Personal</option>
                           <option value="Important">Important</option>
                       </select>
                   </div>
                   <div>
                       <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Color</label>
                       <div className="flex gap-2">
                           {NOTE_COLORS.map(c => (
                               <button 
                                  key={c.id}
                                  onClick={() => setCurrentNote({ ...currentNote, color: c.id as any })}
                                  className={`w-8 h-8 rounded-full border-2 ${c.class.split(' ')[0]} ${currentNote.color === c.id ? 'border-slate-600 scale-110 shadow-sm' : 'border-transparent hover:scale-105'}`}
                               />
                           ))}
                       </div>
                   </div>
               </div>

               <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Content</label>
                  <textarea 
                      className="w-full border border-slate-200 rounded-xl p-4 focus:ring-2 focus:ring-yellow-400 outline-none h-48 resize-none bg-slate-50 leading-relaxed"
                      value={currentNote.content || ''}
                      onChange={e => setCurrentNote({ ...currentNote, content: e.target.value })}
                      placeholder="Write something..."
                  />
                  <AITextEnhancer 
                      text={currentNote.content || ''} 
                      onUpdate={(text) => setCurrentNote({ ...currentNote, content: text })}
                      context="clear and concise"
                  />
               </div>
            </div>
            <div className="p-6 bg-slate-50/50 flex justify-end gap-3 border-t border-slate-100 shrink-0">
               <button onClick={closeModal} className="px-5 py-2.5 text-slate-600 font-bold hover:bg-slate-100 rounded-xl">Cancel</button>
               <button onClick={handleSaveNote} className="px-5 py-2.5 bg-slate-900 text-white rounded-xl font-bold shadow-lg shadow-slate-900/20">Save Note</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
