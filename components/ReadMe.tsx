
import React, { useState } from 'react';
import { BookOpen, User, ShieldCheck, LayoutDashboard, Clock, ClipboardList, Package, BarChart, FileText, Users, HelpCircle, MessageCircle, ListChecks, Play } from 'lucide-react';
import { Role } from '../types';

interface ReadMeProps {
  role: Role;
}

export const ReadMe: React.FC<ReadMeProps> = ({ role }) => {
  const [activeTab, setActiveTab] = useState<'GENERAL' | 'EMPLOYEE' | 'ADMIN'>('GENERAL');
  const [isPlaying, setIsPlaying] = useState(false);

  return (
    <div className="p-4 md:p-8 bg-slate-50/50 h-full overflow-y-auto custom-scrollbar">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8 text-center">
            <h1 className="text-3xl font-extrabold text-slate-900 mb-2">System Documentation</h1>
            <p className="text-slate-500">How to use the Attendance & FMS Platform</p>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap justify-center gap-2 mb-8">
            <button 
                onClick={() => setActiveTab('GENERAL')}
                className={`px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all ${activeTab === 'GENERAL' ? 'bg-slate-800 text-white shadow-lg' : 'bg-white text-slate-500 hover:bg-slate-100'}`}
            >
                <BookOpen size={18}/> General Logic
            </button>
            <button 
                onClick={() => setActiveTab('EMPLOYEE')}
                className={`px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all ${activeTab === 'EMPLOYEE' ? 'bg-blue-600 text-white shadow-lg' : 'bg-white text-slate-500 hover:bg-slate-100'}`}
            >
                <User size={18}/> Team Member Guide
            </button>
            
            {role === 'ADMIN' && (
                <button 
                    onClick={() => setActiveTab('ADMIN')}
                    className={`px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all ${activeTab === 'ADMIN' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white text-slate-500 hover:bg-slate-100'}`}
                >
                    <ShieldCheck size={18}/> Admin Guide
                </button>
            )}
        </div>

        {/* Content Area */}
        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-8">
            
            {/* GENERAL TAB */}
            {activeTab === 'GENERAL' && (
                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
                     <section>
                        <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600"><BookOpen size={18}/></div>
                            Core Concepts
                        </h2>
                        <p className="text-slate-600 leading-relaxed mb-4">
                            This platform is a unified Facility Management System (FMS) designed to replace manual spreadsheets. 
                            It integrates Attendance, Leave Management, Task Tracking, and Material Ordering into a single interface.
                        </p>
                        <ul className="list-disc pl-5 space-y-2 text-slate-600">
                            <li><strong>Real-time Sync:</strong> Actions taken by team members (like clocking out) instantly update the Admin dashboards.</li>
                            <li><strong>Role Based Access:</strong> Team members only see their own data. Admins see the entire organization.</li>
                            <li><strong>Data Persistence:</strong> All data is stored locally in the browser session for this demo version.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold text-slate-800 mb-4">Attendance Color Codes</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="flex items-center gap-3 p-3 border border-slate-100 rounded-xl bg-slate-50/50">
                                <div className="w-6 h-6 bg-white border border-slate-300 rounded shadow-sm flex items-center justify-center text-[10px] font-bold">1</div>
                                <span className="text-sm font-bold text-slate-600">Present (1.0)</span>
                            </div>
                            <div className="flex items-center gap-3 p-3 border border-slate-100 rounded-xl bg-slate-50/50">
                                <div className="w-6 h-6 bg-red-500 rounded shadow-sm shadow-red-500/20"></div>
                                <span className="text-sm font-bold text-slate-600">Absent (0.0)</span>
                            </div>
                            <div className="flex items-center gap-3 p-3 border border-slate-100 rounded-xl bg-slate-50/50">
                                <div className="w-6 h-6 bg-yellow-300 rounded shadow-sm shadow-yellow-300/20"></div>
                                <span className="text-sm font-bold text-slate-600">Half Day (0.5)</span>
                            </div>
                            <div className="flex items-center gap-3 p-3 border border-slate-100 rounded-xl bg-slate-50/50">
                                <div className="w-6 h-6 bg-blue-200 rounded shadow-sm shadow-blue-200/20"></div>
                                <span className="text-sm font-bold text-slate-600">Quarter Day (0.25)</span>
                            </div>
                            <div className="flex items-center gap-3 p-3 border border-slate-100 rounded-xl bg-slate-50/50">
                                <div className="w-6 h-6 bg-[#00b050] rounded shadow-sm shadow-green-500/20"></div>
                                <span className="text-sm font-bold text-slate-600">Off / Holiday</span>
                            </div>
                        </div>
                    </section>
                </div>
            )}

            {/* EMPLOYEE TAB */}
            {activeTab === 'EMPLOYEE' && (
                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
                    <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl text-blue-800 text-sm mb-6">
                        <strong>Welcome!</strong> As a team member, your main duties are to log your time, complete assigned tasks, and manage material requests.
                    </div>

                    {/* Video Tutorial Section */}
                    <div className="relative rounded-2xl overflow-hidden shadow-lg border border-slate-200 bg-slate-900 aspect-video group mb-8">
                        {isPlaying ? (
                            <video 
                                src=" " 
                                controls 
                                autoPlay 
                                className="w-full h-full object-cover"
                            />
                        ) : (
                            <div className="w-full h-full relative cursor-pointer" onClick={() => setIsPlaying(true)}>
                                <img 
                                    src="https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?q=80&w=2070&auto=format&fit=crop" 
                                    alt="Training Video Thumbnail" 
                                    className="w-full h-full object-cover opacity-60 group-hover:opacity-50 transition-opacity"
                                />
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <div className="w-20 h-20 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shadow-xl border border-white/30">
                                        <Play size={36} className="text-white fill-white ml-1.5" />
                                    </div>
                                </div>
                                <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/80 to-transparent">
                                    <h3 className="text-white font-bold text-xl mb-1">Getting Started with Kalra FMS</h3>
                                    <p className="text-slate-300 text-sm">Learn how to clock-in, manage tasks, and request leaves in 5 minutes.</p>
                                </div>
                            </div>
                        )}
                    </div>

                    <GuideSection 
                        title="My Portal & Attendance" 
                        icon={<LayoutDashboard size={20}/>}
                        steps={[
                            "Upon login, you land on 'My Portal'.",
                            "Use the big 'Start Shift' button to Clock In. The timer will start running.",
                            "Use 'End Shift' to Clock Out. Your hours will be calculated automatically.",
                            "Upload your Profile Picture and Mandatory Documents (Aadhar/PAN) directly from the dashboard card."
                        ]}
                    />

                    <GuideSection 
                        title="Task Management" 
                        icon={<ClipboardList size={20}/>}
                        steps={[
                            "Navigate to 'My Tasks' to see work assigned to you.",
                            "Click 'Complete Task' to finish a job. You MUST write a process note and upload proof (photo/doc).",
                            "If you cannot finish on time, click 'Raise Objection' to request a deadline extension."
                        ]}
                    />

                    <GuideSection 
                        title="Checklist & Compliance" 
                        icon={<ListChecks size={20}/>}
                        steps={[
                            "Go to 'My Checklist' to view recurring responsibilities (Daily, Weekly, etc.).",
                            "Mark tasks as 'Done' before the end of the day.",
                            "Tasks scheduled for Sundays are automatically moved to Monday or skipped based on the rule."
                        ]}
                    />

                    <GuideSection 
                        title="O2D System (Material Orders)" 
                        icon={<Package size={20}/>}
                        steps={[
                            "Go to 'O2D' to request materials.",
                            "Click 'Order Material', fill in the item details, quantity, and site location.",
                            "Select the store keeper or staff member you are ordering from.",
                            "When you physically receive the item, click 'Mark Received' and upload a photo proof."
                        ]}
                    />

                    <GuideSection 
                        title="Communication" 
                        icon={<MessageCircle size={20}/>}
                        steps={[
                            "Use 'Team Chat' for instant messaging with colleagues.",
                            "Use 'Raise Query' for formal requests or ticketing."
                        ]}
                    />
                </div>
            )}

            {/* ADMIN TAB */}
            {activeTab === 'ADMIN' && role === 'ADMIN' && (
                 <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
                    <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-xl text-indigo-800 text-sm mb-6">
                        <strong>Administrator Control Panel</strong> allows full oversight of the organization.
                    </div>

                    <GuideSection 
                        title="Team Management" 
                        icon={<Users size={20}/>}
                        steps={[
                            "Go to 'Team Master' to add new team members.",
                            "Click the 'Pen' icon to edit details or reset passwords.",
                            "Click the 'File' icon to view/download uploaded documents (Aadhar/PAN).",
                            "Use the 'Archive' button to deactivate a member without deleting their data."
                        ]}
                    />

                    <GuideSection 
                        title="Checklist Monitor" 
                        icon={<ListChecks size={20}/>}
                        steps={[
                            "Create new recurring checklists. 5-Year schedules are auto-generated.",
                            "Available Frequencies: Daily, Weekly, Monthly, Quarterly, Half-Yearly, Yearly.",
                            "Pattern Scheduling: Support for 'First Monday', 'Last Monday', and 'Mid-Month' (15th).",
                            "Smart Sunday Logic: 'Daily' tasks skip Sundays entirely. All other frequencies (Weekly/Monthly/etc) that fall on a Sunday are automatically shifted to the next day (Monday)."
                        ]}
                    />

                    <GuideSection 
                        title="Attendance Grid" 
                        icon={<Clock size={20}/>}
                        steps={[
                            "Go to 'Attendance Sheet' to see the monthly grid.",
                            "Right-Click on any cell to open the context menu.",
                            "You can manually mark Present, Absent, Half-Day, or Leaves.",
                            "Sundays and Holidays are auto-marked in Green."
                        ]}
                    />

                    <GuideSection 
                        title="Task & O2D Oversight" 
                        icon={<ClipboardList size={20}/>}
                        steps={[
                            "In 'Task Management', assign new tasks to any staff.",
                            "Review 'Extension Requests' and Approve/Reject them.",
                            "Use 'Hold' or 'Terminate' actions for tasks that are cancelled.",
                            "In 'O2D', approve pending material orders so staff can proceed."
                        ]}
                    />

                    <GuideSection 
                        title="Performance & KPI" 
                        icon={<BarChart size={20}/>}
                        steps={[
                            "Go to 'KPI Report' to see team scores.",
                            "Scores are auto-calculated based on Task Completion and On-Time delivery.",
                            "Click 'View Detailed KPI' to see the Report Card.",
                            "Use the 'Print' button to generate a PDF report for physical filing."
                        ]}
                    />
                </div>
            )}

        </div>
      </div>
    </div>
  );
};

const GuideSection = ({ title, icon, steps }: { title: string, icon: React.ReactNode, steps: string[] }) => (
    <div className="border-b border-slate-100 last:border-0 pb-6 last:pb-0">
        <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                {icon}
            </div>
            {title}
        </h3>
        <ul className="space-y-3">
            {steps.map((step, idx) => (
                <li key={idx} className="flex items-start gap-3 text-sm text-slate-600 leading-relaxed">
                    <span className="w-5 h-5 rounded-full bg-slate-50 border border-slate-200 text-slate-400 font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5">
                        {idx + 1}
                    </span>
                    {step}
                </li>
            ))}
        </ul>
    </div>
);
