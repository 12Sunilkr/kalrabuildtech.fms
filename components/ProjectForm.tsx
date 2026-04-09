import React, { useEffect, useState } from 'react';
import { fetchJSON } from '../src/utils/pmsUtils';

export default function ProjectForm({ onDone }:{onDone?:()=>void}){
  const [form, setForm] = useState({ project_name:'', location:'', assigned_employee_id:'', start_date: '', google_sheet_link: '' });
  const [employees, setEmployees] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(()=>{
    let mounted = true;
    (async ()=>{
      try{
        const res = await fetchJSON('/api/employees');
        const list = Array.isArray(res) ? res : (res && res.data) ? res.data : [];
        if (mounted) setEmployees(list);
      }catch(e){ console.warn('Failed to load employees', e); }
    })();
    return ()=>{ mounted = false };
  },[]);

  const submit = async (e:any) => {
    e.preventDefault();
    setSubmitting(true);
    try{
      const payload = {
        project_name: form.project_name,
        assigned_employee_id: form.assigned_employee_id,
        location: form.location,
        start_date: form.start_date || null,
        google_sheet_link: form.google_sheet_link || null
      };
      await fetchJSON('/api/pms/projects', { method: 'POST', body: JSON.stringify(payload) });
      onDone && onDone();
    }catch(err){ console.error(err); alert('Failed to create project'); }
    setSubmitting(false);
  };

  return (
    <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div className="col-span-1 sm:col-span-2">
        <label className="text-sm font-medium">Project name</label>
        <input className="w-full mt-1 p-2 border rounded" placeholder="Project name" value={form.project_name} onChange={e=>setForm({...form, project_name:e.target.value})} />
      </div>

      <div>
        <label className="text-sm font-medium">Location</label>
        <input className="w-full mt-1 p-2 border rounded" placeholder="Location" value={form.location} onChange={e=>setForm({...form, location:e.target.value})} />
      </div>

      <div>
        <label className="text-sm font-medium">Assign to (Team member)</label>
        <select className="w-full mt-1 p-2 border rounded" value={form.assigned_employee_id} onChange={e=>setForm({...form, assigned_employee_id:e.target.value})}>
          <option value="">-- Select team member --</option>
          {employees.map(emp => (
            <option key={emp.id} value={emp.id}>{emp.name} {emp.designation ? `(${emp.designation})` : ''}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-sm font-medium">Start date</label>
        <input className="w-full mt-1 p-2 border rounded" type="date" value={form.start_date} onChange={e=>setForm({...form, start_date:e.target.value})} />
      </div>

      <div className="sm:col-span-2">
        <label className="text-sm font-medium">Google Sheet Link (Optional)</label>
        <input className="w-full mt-1 p-2 border rounded" type="url" placeholder="https://docs.google.com/spreadsheets/..." value={form.google_sheet_link} onChange={e=>setForm({...form, google_sheet_link:e.target.value})} />
      </div>

      <div className="sm:col-span-2">
        <button disabled={submitting} className="w-full bg-indigo-600 text-white py-2 rounded mt-2">{submitting ? 'Creating...' : 'Create Project'}</button>
      </div>
    </form>
  );
}
