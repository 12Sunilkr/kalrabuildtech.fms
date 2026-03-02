// Lightweight utilities and fetch wrapper for PMS frontend
export async function fetchJSON(url: string, opts: any = {}){
  const cfg: any = { headers: { 'Content-Type':'application/json' }, ...opts };
  if (cfg.body && typeof cfg.body !== 'string') cfg.body = JSON.stringify(cfg.body);
  const res = await fetch(url, cfg);
  if (!res.ok) throw new Error('Network error');
  return res.json();
}

export async function getProjectSummary(projectId: number){
  const res = await fetchJSON(`/api/pms/projects/${projectId}`);
  const progress = res && res.progress ? res.progress.progress_percent || 0 : 0;
  return { overallProgress: Math.round(progress) };
}

export async function uploadFile(url: string, formData: FormData){
  const res = await fetch(url, { method: 'POST', body: formData, credentials: 'include' });
  if (!res.ok) throw new Error('upload_failed');
  return res.json();
}

export function computeTaskProgress(done: number, target: number){
  if (!target) return 0;
  return Math.min(100, (done / target) * 100);
}

export function computeProjectProgress(tasks: Array<{done:number,target:number}>){
  let weighted = 0; let total = 0;
  tasks.forEach(t=>{ weighted += (t.target>0 ? (t.done / t.target) : 0) * t.target; total += t.target; });
  return total>0 ? (weighted/total)*100 : 0;
}
