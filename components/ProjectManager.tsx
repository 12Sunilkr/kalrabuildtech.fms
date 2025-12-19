
import React, { useState } from 'react';
import { Project, SitePhoto, User, Employee, Notification } from '../types';
import { HardHat, Plus, MapPin, Camera, Image, Upload, User as UserIcon, Calendar, X, ExternalLink, Download, Search, Filter } from 'lucide-react';
import { convertFileToBase64 } from '../utils/fileHelper';
import { format } from 'date-fns';

interface ProjectManagerProps {
  projects: Project[];
  setProjects: React.Dispatch<React.SetStateAction<Project[]>>;
  photos: SitePhoto[];
  setPhotos: React.Dispatch<React.SetStateAction<SitePhoto[]>>;
  currentUser: User;
  employees: Employee[];
  addNotification: (title: string, msg: string, type: Notification['type'], targetUser: string) => void;
}

export const ProjectManager: React.FC<ProjectManagerProps> = ({ 
    projects, setProjects, photos, setPhotos, currentUser, employees, addNotification 
}) => {
    
  const isAdmin = currentUser.role === 'ADMIN';
  const [activeTab, setActiveTab] = useState<'PROJECTS' | 'PHOTOS'>('PROJECTS');
  const [showAddProject, setShowAddProject] = useState(false);
  
  // Create Project State
  const [newProject, setNewProject] = useState<Partial<Project>>({ status: 'ACTIVE', assignedEmployees: [] });

  // Photo Upload State
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null); // For Employee Upload or Admin View
  const [uploadLoading, setUploadLoading] = useState(false);

  // Admin Photo Filter
  const [filterDate, setFilterDate] = useState('');
  const [filterUser, setFilterUser] = useState('');

  // --- Handlers ---

  const handleCreateProject = () => {
    if (newProject.name && newProject.location) {
        const project: Project = {
            id: `P-${Math.floor(1000 + Math.random() * 9000)}`,
            name: newProject.name,
            location: newProject.location,
            status: 'ACTIVE',
            assignedEmployees: newProject.assignedEmployees || [],
            description: newProject.description
        };
        setProjects([...projects, project]);
        setShowAddProject(false);
        setNewProject({ status: 'ACTIVE', assignedEmployees: [] });
        addNotification('Project Created', `New project ${project.name} initialized.`, 'PROJECT', 'ALL');
    }
  };

  const toggleAssignedEmployee = (empId: string) => {
      const current = newProject.assignedEmployees || [];
      if (current.includes(empId)) {
          setNewProject({ ...newProject, assignedEmployees: current.filter(id => id !== empId) });
      } else {
          setNewProject({ ...newProject, assignedEmployees: [...current, empId] });
      }
  };

  // --- LIVE PHOTO UPLOAD LOGIC ---
  
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!selectedProjectId || !e.target.files?.[0]) return;

      const file = e.target.files[0];
      const todayStr = new Date().toISOString().split('T')[0];
      
      // 1. Check Daily Limit
      const myPhotosToday = photos.filter(p => 
          p.uploadedBy === currentUser.employeeId && 
          p.date === todayStr &&
          p.projectId === selectedProjectId
      );

      if (myPhotosToday.length >= 15) {
          alert("Maximum daily limit of 15 photos reached for this project.");
          return;
      }

      setUploadLoading(true);

      // 2. Get Geolocation
      if (!navigator.geolocation) {
          alert("Geolocation is not supported by your browser. Location data will be missing.");
          processUpload(file, null);
      } else {
          navigator.geolocation.getCurrentPosition(
              (position) => {
                  processUpload(file, {
                      lat: position.coords.latitude,
                      lng: position.coords.longitude,
                      accuracy: position.coords.accuracy
                  });
              },
              (error) => {
                  console.error("Geo Error", error);
                  alert("Unable to retrieve location. Please allow location access.");
                  processUpload(file, null);
              },
              { enableHighAccuracy: true }
          );
      }
  };

  const processUpload = async (file: File, gps: { lat: number, lng: number, accuracy: number } | null) => {
      try {
          const base64 = await convertFileToBase64(file);
          const newPhoto: SitePhoto = {
              id: `IMG-${Date.now()}`,
              projectId: selectedProjectId!,
              uploadedBy: currentUser.employeeId || 'UNKNOWN',
              timestamp: new Date().toISOString(),
              date: new Date().toISOString().split('T')[0],
              imageUrl: base64,
              gps: gps || undefined
          };
          
          setPhotos(prev => [newPhoto, ...prev]);
          addNotification('Site Photo', `New photo uploaded for project.`, 'PROJECT', 'ADMIN');
          
      } catch (err) {
          console.error(err);
          alert("Failed to process image.");
      } finally {
          setUploadLoading(false);
      }
  };

  // --- RENDERING ---

  // Employee View: List of assigned projects
  if (!isAdmin && !selectedProjectId) {
      const myProjects = projects.filter(p => p.assignedEmployees.includes(currentUser.employeeId || ''));
      
      return (
          <div className="p-4 md:p-8 bg-slate-50/50 h-full overflow-y-auto custom-scrollbar">
              <div className="mb-8">
                  <h2 className="text-2xl md:text-3xl font-extrabold text-slate-800 flex items-center gap-3">
                      <div className="w-10 h-10 bg-indigo-600 text-white rounded-xl flex items-center justify-center shadow-lg shadow-indigo-600/20 shrink-0">
                          <HardHat size={20} />
                      </div>
                      My Sites
                  </h2>
                  <p className="text-slate-500 mt-2 font-medium">Select a project to upload daily site photos.</p>
              </div>

              {myProjects.length === 0 ? (
                  <div className="p-12 text-center text-slate-400 bg-white rounded-3xl border border-slate-100">
                      <HardHat size={48} className="mx-auto mb-4 opacity-20"/>
                      <p>No projects assigned to you yet.</p>
                  </div>
              ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {myProjects.map(project => (
                          <button 
                            key={project.id}
                            onClick={() => setSelectedProjectId(project.id)}
                            className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 hover:shadow-lg transition-all text-left group"
                          >
                              <div className="flex justify-between items-start mb-4">
                                  <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center font-bold">
                                      {project.name.charAt(0)}
                                  </div>
                                  <span className="px-2 py-1 bg-green-50 text-green-700 text-xs font-bold rounded uppercase border border-green-100">Active</span>
                              </div>
                              <h3 className="text-lg font-bold text-slate-800 group-hover:text-indigo-600 transition-colors mb-1">{project.name}</h3>
                              <p className="text-sm text-slate-500 mb-4 flex items-center gap-1"><MapPin size={14}/> {project.location}</p>
                              <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                                   <span className="text-xs font-bold text-slate-400">Tap to View & Upload</span>
                                   <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-indigo-600 group-hover:text-white transition-all">
                                       <Camera size={16}/>
                                   </div>
                              </div>
                          </button>
                      ))}
                  </div>
              )}
          </div>
      );
  }

  // Employee View: Inside a Project (Upload Interface)
  if (!isAdmin && selectedProjectId) {
      const project = projects.find(p => p.id === selectedProjectId);
      const todayStr = new Date().toISOString().split('T')[0];
      const todayPhotos = photos.filter(p => p.projectId === selectedProjectId && p.date === todayStr && p.uploadedBy === currentUser.employeeId);
      
      return (
          <div className="p-4 md:p-8 bg-slate-50/50 h-full overflow-y-auto custom-scrollbar flex flex-col">
              <button onClick={() => setSelectedProjectId(null)} className="mb-4 text-sm font-bold text-slate-500 hover:text-slate-800 self-start">← Back to Projects</button>
              
              <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 mb-6">
                  <h2 className="text-2xl font-black text-slate-800 mb-1">{project?.name}</h2>
                  <p className="text-slate-500 flex items-center gap-1 text-sm font-medium mb-6"><MapPin size={14}/> {project?.location}</p>

                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 text-center">
                      <div className="mb-2 text-sm font-bold text-slate-500 uppercase tracking-widest">Daily Uploads</div>
                      <div className="text-4xl font-black text-slate-800 mb-2">{todayPhotos.length} <span className="text-lg text-slate-400 font-medium">/ 15</span></div>
                      
                      {todayPhotos.length < 5 && (
                          <div className="text-xs font-bold text-orange-500 mb-4 flex items-center justify-center gap-1">
                              ⚠️ Minimum 5 photos required daily.
                          </div>
                      )}
                      {todayPhotos.length >= 15 ? (
                           <div className="text-green-600 font-bold py-3 bg-green-50 rounded-xl border border-green-200">Daily Limit Reached ✅</div>
                      ) : (
                          <label className={`w-full py-4 rounded-xl flex items-center justify-center gap-2 font-bold text-white shadow-lg transition-all cursor-pointer ${uploadLoading ? 'bg-slate-400' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/30'}`}>
                              <input 
                                type="file" 
                                accept="image/*" 
                                capture="environment" 
                                onChange={handlePhotoUpload} 
                                disabled={uploadLoading} 
                                className="hidden"
                              />
                              {uploadLoading ? 'Uploading...' : <><Camera size={20}/> Take Live Photo</>}
                          </label>
                      )}
                  </div>
              </div>

              {/* Today's Gallery */}
              <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><Image size={18}/> Today's Uploads</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {todayPhotos.map(photo => (
                      <div key={photo.id} className="relative aspect-square rounded-xl overflow-hidden shadow-sm bg-black group">
                          <img src={photo.imageUrl} className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity" />
                          <div className="absolute bottom-0 left-0 right-0 p-2 bg-black/60 text-white text-[10px] backdrop-blur-sm">
                              <div>{format(new Date(photo.timestamp), 'h:mm a')}</div>
                              {photo.gps && <div className="truncate">GPS: {photo.gps.lat.toFixed(4)}, {photo.gps.lng.toFixed(4)}</div>}
                          </div>
                      </div>
                  ))}
              </div>
          </div>
      );
  }

  // Admin View
  return (
    <div className="p-4 md:p-8 bg-slate-50/50 h-full overflow-y-auto custom-scrollbar">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-8">
        <div>
           <h2 className="text-2xl md:text-3xl font-extrabold text-slate-800 flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 text-white rounded-xl flex items-center justify-center shadow-lg shadow-indigo-600/20 shrink-0">
              <HardHat size={20} />
            </div>
            Project Sites
          </h2>
          <p className="text-slate-500 mt-2 font-medium md:ml-14">
            Manage sites, assign engineers, and review daily progress photos.
          </p>
        </div>
        <button 
          onClick={() => setShowAddProject(true)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-3 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20 transition-all active:scale-95 font-bold"
        >
          <Plus size={18} />
          Create Project
        </button>
      </div>

      <div className="flex gap-2 mb-6 border-b border-slate-200">
          <button 
            onClick={() => setActiveTab('PROJECTS')}
            className={`px-4 py-2 text-sm font-bold border-b-2 transition-colors ${activeTab === 'PROJECTS' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
              All Projects
          </button>
          <button 
            onClick={() => setActiveTab('PHOTOS')}
            className={`px-4 py-2 text-sm font-bold border-b-2 transition-colors ${activeTab === 'PHOTOS' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
              Photo Gallery
          </button>
      </div>

      {activeTab === 'PROJECTS' && (
           <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
               {projects.map(project => (
                   <div key={project.id} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
                       <div className="flex justify-between items-start mb-4">
                           <div>
                               <h3 className="text-lg font-bold text-slate-800">{project.name}</h3>
                               <p className="text-sm text-slate-500 flex items-center gap-1"><MapPin size={14}/> {project.location}</p>
                           </div>
                           <span className="px-2 py-1 bg-green-50 text-green-700 text-xs font-bold rounded uppercase border border-green-100">{project.status}</span>
                       </div>
                       
                       <p className="text-sm text-slate-600 mb-4 line-clamp-2">{project.description}</p>
                       
                       <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 mb-4">
                           <div className="text-xs font-bold text-slate-400 uppercase mb-2">Assigned Team</div>
                           <div className="flex flex-wrap gap-2">
                               {project.assignedEmployees.map(empId => {
                                   const emp = employees.find(e => e.id === empId);
                                   return (
                                       <div key={empId} className="flex items-center gap-1 bg-white px-2 py-1 rounded border border-slate-200 text-xs font-bold text-slate-700" title={empId}>
                                           <UserIcon size={10}/> {emp?.name || empId}
                                       </div>
                                   );
                               })}
                               {project.assignedEmployees.length === 0 && <span className="text-xs text-slate-400 italic">No staff assigned</span>}
                           </div>
                       </div>
                       
                       <div className="flex items-center justify-between text-xs font-bold text-slate-400">
                           <span>ID: {project.id}</span>
                           <button onClick={() => { setActiveTab('PHOTOS'); setSelectedProjectId(project.id); }} className="text-indigo-600 hover:underline">View Photos →</button>
                       </div>
                   </div>
               ))}
           </div>
      )}

      {activeTab === 'PHOTOS' && (
          <div className="space-y-6">
              {/* Filter Bar */}
              <div className="bg-white p-4 rounded-2xl border border-slate-100 flex flex-col md:flex-row gap-4 items-center shadow-sm">
                  <div className="flex items-center gap-2 w-full md:w-auto">
                      <Filter size={18} className="text-slate-400"/>
                      <span className="text-sm font-bold text-slate-700">Filters:</span>
                  </div>
                  <select 
                    value={selectedProjectId || ''} 
                    onChange={e => setSelectedProjectId(e.target.value || null)}
                    className="flex-1 w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                      <option value="">All Projects</option>
                      {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <input 
                    type="date" 
                    value={filterDate} 
                    onChange={e => setFilterDate(e.target.value)}
                    className="w-full md:w-auto bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <select 
                    value={filterUser} 
                    onChange={e => setFilterUser(e.target.value)}
                    className="w-full md:w-auto bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                      <option value="">All Users</option>
                      {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                  <button 
                    onClick={() => { setSelectedProjectId(null); setFilterDate(''); setFilterUser(''); }}
                    className="text-sm text-slate-500 font-bold hover:text-red-500"
                  >
                      Clear
                  </button>
              </div>

              {/* Photo Grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {photos
                    .filter(p => !selectedProjectId || p.projectId === selectedProjectId)
                    .filter(p => !filterDate || p.date === filterDate)
                    .filter(p => !filterUser || p.uploadedBy === filterUser)
                    .map(photo => {
                        const project = projects.find(proj => proj.id === photo.projectId);
                        const uploader = employees.find(e => e.id === photo.uploadedBy);

                        return (
                             <div key={photo.id} className="relative aspect-square rounded-xl overflow-hidden shadow-sm bg-black group">
                                <img src={photo.imageUrl} className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity cursor-zoom-in" onClick={() => window.open(photo.imageUrl, '_blank')} />
                                <div className="absolute top-2 right-2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                     <a href={photo.imageUrl} download={`Site_${photo.id}.jpg`} className="p-1.5 bg-black/50 text-white rounded-lg backdrop-blur hover:bg-white hover:text-black">
                                        <Download size={14}/>
                                     </a>
                                     {photo.gps && (
                                         <a 
                                            href={`https://www.google.com/maps/search/?api=1&query=${photo.gps.lat},${photo.gps.lng}`} 
                                            target="_blank" 
                                            rel="noreferrer"
                                            className="p-1.5 bg-black/50 text-white rounded-lg backdrop-blur hover:bg-white hover:text-black"
                                            title="View on Map"
                                         >
                                            <MapPin size={14}/>
                                         </a>
                                     )}
                                </div>
                                <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent text-white text-[10px] pt-6">
                                    <div className="font-bold truncate">{project?.name}</div>
                                    <div className="flex justify-between items-center opacity-80">
                                        <span>{uploader?.name.split(' ')[0]}</span>
                                        <span>{format(new Date(photo.timestamp), 'MMM d, h:mm a')}</span>
                                    </div>
                                </div>
                             </div>
                        );
                    })
                  }
              </div>
          </div>
      )}

      {/* CREATE PROJECT MODAL */}
      {showAddProject && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-6 border-b border-slate-100 bg-indigo-50/50 flex justify-between items-center shrink-0">
                    <h3 className="text-xl font-extrabold text-indigo-900">Initialize New Project</h3>
                    <button onClick={() => setShowAddProject(false)} className="p-2 hover:bg-indigo-100 rounded-full text-indigo-800"><X size={20}/></button>
                </div>
                <div className="p-6 space-y-4 overflow-y-auto">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Project Name</label>
                        <input 
                            type="text" 
                            className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-indigo-500 outline-none font-bold"
                            value={newProject.name || ''}
                            onChange={e => setNewProject({...newProject, name: e.target.value})}
                            placeholder="e.g. Sector 45 Commercial Hub"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Location / Site Address</label>
                        <input 
                            type="text" 
                            className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-indigo-500 outline-none"
                            value={newProject.location || ''}
                            onChange={e => setNewProject({...newProject, location: e.target.value})}
                            placeholder="Full address..."
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Assign Team Members</label>
                        <div className="border border-slate-200 rounded-xl p-2 max-h-40 overflow-y-auto space-y-1">
                             {employees.map(emp => (
                                    <div 
                                        key={emp.id} 
                                        onClick={() => toggleAssignedEmployee(emp.id)}
                                        className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer border ${newProject.assignedEmployees?.includes(emp.id) ? 'bg-indigo-50 border-indigo-200' : 'border-transparent hover:bg-slate-50'}`}
                                    >
                                        <div className={`w-4 h-4 rounded border flex items-center justify-center ${newProject.assignedEmployees?.includes(emp.id) ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300 bg-white'}`}>
                                            {newProject.assignedEmployees?.includes(emp.id) && <div className="w-2 h-2 bg-white rounded-sm" />}
                                        </div>
                                        <div>
                                            <span className="text-sm font-medium text-slate-700 block">{emp.name}</span>
                                            <span className="text-xs text-slate-400">{emp.designation || emp.department}</span>
                                        </div>
                                    </div>
                                ))
                             }
                             {employees.length === 0 && <div className="text-center text-slate-400 text-xs py-4">No team members available.</div>}
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Description</label>
                        <textarea 
                            className="w-full border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-indigo-500 outline-none h-24 resize-none"
                            value={newProject.description || ''}
                            onChange={e => setNewProject({...newProject, description: e.target.value})}
                            placeholder="Scope of work..."
                        />
                    </div>
                </div>
                <div className="p-6 bg-slate-50/50 flex justify-end gap-3 border-t border-slate-100 shrink-0">
                    <button onClick={() => setShowAddProject(false)} className="px-5 py-2.5 text-slate-600 font-bold hover:bg-slate-100 rounded-xl">Cancel</button>
                    <button onClick={handleCreateProject} className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-600/20">Create Project</button>
                </div>
            </div>
        </div>
      )}

    </div>
  );
};
