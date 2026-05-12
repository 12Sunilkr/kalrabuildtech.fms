import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { ZoomIn, ZoomOut, Maximize, X, Briefcase, Target, ShieldCheck, BookOpen, ChevronRight } from 'lucide-react';
import { Employee } from '../types';
import { PlaybookEntry } from './Playbook';
import { COMPANY_LOGO } from '../constants';

// ─── Types ───────────────────────────────────────────────────────────────────
interface OrgNode    { id: string; title: string; designation: string; type: string; children?: OrgNode[]; }
interface DesigLayout { id: string; title: string; designation: string; side: 'L'|'R'; boxX: number; cy: number; employees: { id:string; name:string; cy:number; boxX:number }[]; }

// ─── SVG constants ────────────────────────────────────────────────────────────
const CX   = 500; const CENT_R = 52;
const DW   = 134; const DH   = 36;
const EW   = 116; const EH   = 28;
const VGAP = 10;  const GGAP = 22; const PAD = 64;
const CR   = 8;   // corner radius
const COL_LINE   = '#6366f1';
const COL_DESIG  = '#1e293b'; const COL_DESIG_STROKE = '#475569';
const COL_EMP    = '#0f172a'; const COL_EMP_STROKE   = '#334155';
const COL_ACTIVE = '#1e1b4b'; const COL_ACTIVE_STROKE = '#818cf8';

// x positions — left side
const L_TRUNK = 392; const L_DR = 340; const L_DL = L_DR - DW; // 206
const L_ET = 175;   const L_ER = L_ET - 8; const L_EL = L_ER - EW; // 51

// x positions — right side (mirrored)
const R_TRUNK = CX + (CX - L_TRUNK); // 608
const R_DL    = CX + (CX - L_DR);    // 660
const R_DR    = R_DL + DW;           // 794
const R_ET    = CX + (CX - L_ET);    // 825
const R_EL    = R_ET + 8;            // 833
const R_ER    = R_EL + EW;           // 949

const SVG_W   = R_ER + 28; // 977

// ─── Helpers ──────────────────────────────────────────────────────────────────
const cut = (s: string, n: number) => s.length > n ? s.slice(0, n - 1) + '…' : s;

function buildTree(employees: Employee[]): OrgNode {
  const g: Record<string, Employee[]> = {};
  employees.forEach(e => {
    if (e.status === 'Inactive') return;
    const d = e.designation || e.department || 'Staff';
    (g[d] = g[d] || []).push(e);
  });
  return {
    id: 'root', title: 'Kalra Buildtech', designation: 'Kalra Buildtech', type: 'root',
    children: Object.entries(g).map(([desig, emps]) => ({
      id: `d-${desig}`, title: desig, designation: desig, type: 'designation',
      children: emps.map(emp => ({ id: `e-${emp.id}`, title: emp.name, designation: desig, type: 'employee' })),
    })),
  };
}

function calcLayout(tree: OrgNode, expanded: Set<string>) {
  const all = tree.children ?? [];
  const half = Math.ceil(all.length / 2);
  const gh = (g: OrgNode) => expanded.has(g.id) && (g.children?.length ?? 0) > 0
    ? (g.children!.length) * (EH + VGAP) - VGAP : DH;

  function side(groups: OrgNode[], s: 'L'|'R', off: number): DesigLayout[] {
    let y = off;
    return groups.map(g => {
      const h = gh(g); const cy = y + h / 2;
      const isE = expanded.has(g.id);
      const emps = isE ? (g.children ?? []).map((e, i) => ({
        id: e.id, name: cut(e.title, 15),
        cy: y + i * (EH + VGAP) + EH / 2,
        boxX: s === 'L' ? L_EL : R_EL,
      })) : [];
      y += h + GGAP;
      return { id: g.id, title: cut(g.title, 18), designation: g.designation, side: s, boxX: s === 'L' ? L_DL : R_DL, cy, employees: emps };
    });
  }

  const sumH = (gs: OrgNode[]) => gs.reduce((a, g, i) => a + gh(g) + (i < gs.length-1 ? GGAP : 0), 0);
  const lH = sumH(all.slice(0, half)), rH = sumH(all.slice(half));
  const maxH = Math.max(lH, rH, CENT_R * 2 + 40);
  const centerY = PAD + maxH / 2;
  return {
    desigs: [
      ...side(all.slice(0, half), 'L', PAD + (maxH - lH) / 2),
      ...side(all.slice(half),    'R', PAD + (maxH - rH) / 2),
    ],
    centerY,
    svgH: maxH + PAD * 2,
  };
}

function branchPath(fromX: number, fromY: number, toX: number, toY: number): string {
  if (Math.abs(toY - fromY) < 1) return `M ${fromX} ${fromY} H ${toX}`;
  const down = toY > fromY;
  const left = toX < fromX;
  const cY = down ? toY - CR : toY + CR;
  const cX = left ? fromX - CR : fromX + CR;
  return `M ${fromX} ${fromY} V ${cY} Q ${fromX} ${toY} ${cX} ${toY} H ${toX}`;
}

// ─── Role Modal ───────────────────────────────────────────────────────────────
const RoleModal: React.FC<{ d: DesigLayout; pb: PlaybookEntry[]; onClose: () => void }> = ({ d, pb, onClose }) => {
  // Only match designation-type entries for the org tree
  const entry = pb.find(p =>
    p.assignType !== 'user' &&
    (p.designation ?? '').toLowerCase() === d.designation.toLowerCase()
  );
  // Normalize responsibilities to string (handles legacy array data)
  const resp = Array.isArray(entry?.responsibilities)
    ? (entry!.responsibilities as unknown as string[]).join('\n\n')
    : (entry?.responsibilities ?? '');
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-slate-100 flex justify-between items-start bg-gradient-to-r from-indigo-50 to-slate-50">
          <div>
            <h2 className="text-lg font-bold text-slate-800">{d.title}</h2>
            <span className="inline-flex items-center gap-1.5 mt-1.5 px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-700 text-xs font-semibold">
              <Briefcase size={12} />{d.designation}
            </span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"><X size={18} /></button>
        </div>
        <div className="p-5 max-h-[55vh] overflow-y-auto">
          {entry ? (
            <>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5"><Target size={14} className="text-indigo-500" />Key Responsibilities</p>
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">{resp}</p>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center py-8 text-center gap-2">
              <BookOpen size={28} className="text-slate-300" />
              <p className="text-slate-500 font-medium text-sm">No Playbook entry yet</p>
              <p className="text-slate-400 text-xs">Admin can add this in the <span className="text-indigo-500 font-medium">Playbook</span> section.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Main ─────────────────────────────────────────────────────────────────────
export const OrganizationTree: React.FC<{ employees: Employee[] }> = ({ employees }) => {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<DesigLayout | null>(null);
  const [zoom,     setZoom]     = useState(0.85);
  const [playbook, setPlaybook] = useState<PlaybookEntry[]>([]);
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/storage/playbook_entries', { credentials: 'include' })
      .then(r => r.ok ? r.json() : { data: [] })
      .then(res => setPlaybook(Array.isArray(res?.data) ? res.data : []))
      .catch(() => {});
  }, []);

  const tree = useMemo(() => buildTree(employees), [employees]);
  const { desigs, centerY, svgH } = useMemo(() => calcLayout(tree, expanded), [tree, expanded]);
  const leftD  = desigs.filter(d => d.side === 'L');
  const rightD = desigs.filter(d => d.side === 'R');

  const autoFit = useCallback(() => {
    const c = canvasRef.current; if (!c) return;
    const cw = c.clientWidth - 32, ch = c.clientHeight - 32;
    setZoom(parseFloat(Math.max(0.25, Math.min(cw / SVG_W, ch / svgH, 1)).toFixed(2)));
  }, [svgH]);

  useEffect(() => { const t = setTimeout(autoFit, 350); return () => clearTimeout(t); }, [autoFit]);

  const toggle = (id: string) => setExpanded(prev => {
    const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s;
  });

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:'#f8fafc', overflow:'hidden' }}>

      {/* ── Top bar ── */}
      <div style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 20px', background:'#fff', borderBottom:'1px solid #e2e8f0', flexShrink:0, boxShadow:'0 1px 3px rgba(0,0,0,0.06)' }}>
        <span style={{ fontWeight:700, fontSize:16, color:'#1e293b', letterSpacing:'-0.3px' }}>Organization Tree</span>
        <div style={{ display:'flex', alignItems:'center', background:'#f1f5f9', borderRadius:8, padding:'3px 4px', border:'1px solid #e2e8f0', gap:2 }}>
          <button onClick={() => setZoom(p => parseFloat(Math.max(0.25, p - 0.1).toFixed(2)))} style={btnStyle} title="Zoom out"><ZoomOut size={14} /></button>
          <span style={{ padding:'0 10px', fontSize:11, fontWeight:600, color:'#64748b', minWidth:46, textAlign:'center' }}>{Math.round(zoom*100)}%</span>
          <button onClick={() => setZoom(p => parseFloat(Math.min(2, p + 0.1).toFixed(2)))}  style={btnStyle} title="Zoom in"><ZoomIn size={14} /></button>
          <div style={{ width:1, height:16, background:'#cbd5e1', margin:'0 2px' }} />
          <button onClick={autoFit} style={btnStyle} title="Fit to screen"><Maximize size={14} /></button>
        </div>
        <span style={{ marginLeft:'auto', fontSize:11, color:'#94a3b8' }}>Click to expand · Right-click for Playbook</span>
      </div>

      {/* ── Canvas ── */}
      <div ref={canvasRef} style={{ flex:1, minHeight:0, overflow:'auto', background:'#f1f5f9', position:'relative' }}>
        {/* Dot grid */}
        <div style={{ position:'absolute', inset:0, backgroundImage:'radial-gradient(circle, #cbd5e1 1px, transparent 1px)', backgroundSize:'28px 28px', pointerEvents:'none', opacity:0.6 }} />
        <div style={{ display:'inline-block', padding:16, transformOrigin:'top left', transform:`scale(${zoom})` }}>
          <svg width={SVG_W} height={svgH} style={{ display:'block', overflow:'visible' }}>
            <defs>
              <radialGradient id="kbtG" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#4f46e5" /><stop offset="100%" stopColor="#1e1b4b" />
              </radialGradient>
              <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.15" />
              </filter>
            </defs>

            {/* Left trunk line */}
            {leftD.length > 0 && <line x1={CX-CENT_R} y1={centerY} x2={L_TRUNK} y2={centerY} stroke={COL_LINE} strokeWidth="1.8" />}
            {leftD.length > 1 && <line x1={L_TRUNK} y1={leftD[0].cy} x2={L_TRUNK} y2={leftD[leftD.length-1].cy} stroke={COL_LINE} strokeWidth="1.8" />}
            {leftD.map(d => <path key={`lb-${d.id}`} d={branchPath(L_TRUNK, d.cy, L_DR, d.cy)} stroke={COL_LINE} fill="none" strokeWidth="1.8" strokeLinecap="round" />)}

            {/* Right trunk line */}
            {rightD.length > 0 && <line x1={CX+CENT_R} y1={centerY} x2={R_TRUNK} y2={centerY} stroke={COL_LINE} strokeWidth="1.8" />}
            {rightD.length > 1 && <line x1={R_TRUNK} y1={rightD[0].cy} x2={R_TRUNK} y2={rightD[rightD.length-1].cy} stroke={COL_LINE} strokeWidth="1.8" />}
            {rightD.map(d => <path key={`rb-${d.id}`} d={branchPath(R_TRUNK, d.cy, R_DL, d.cy)} stroke={COL_LINE} fill="none" strokeWidth="1.8" strokeLinecap="round" />)}

            {/* Employee lines */}
            {desigs.map(d => d.employees.length === 0 ? null : (() => {
              const isL = d.side === 'L';
              const dEdge = isL ? L_DL : R_DR;
              const et    = isL ? L_ET : R_ET;
              const eEnd  = isL ? L_ER : R_EL;
              return (
                <g key={`el-${d.id}`}>
                  <line x1={dEdge} y1={d.cy} x2={et} y2={d.cy} stroke={COL_LINE} strokeWidth="1.4" />
                  {d.employees.length > 1 && <line x1={et} y1={d.employees[0].cy} x2={et} y2={d.employees[d.employees.length-1].cy} stroke={COL_LINE} strokeWidth="1.4" />}
                  {d.employees.map(e => <path key={`eb-${e.id}`} d={branchPath(et, e.cy, eEnd, e.cy)} stroke={COL_LINE} fill="none" strokeWidth="1.3" strokeLinecap="round" />)}
                </g>
              );
            })())}

            {/* Junction dots */}
            {leftD.map(d  => <circle key={`jl-${d.id}`} cx={L_TRUNK} cy={d.cy} r={4.5} fill="#ef4444" />)}
            {rightD.map(d => <circle key={`jr-${d.id}`} cx={R_TRUNK} cy={d.cy} r={4.5} fill="#10b981" />)}
            {desigs.map(d => d.employees.map(e => <circle key={`je-${e.id}`} cx={d.side==='L'?L_ET:R_ET} cy={e.cy} r={3.5} fill="#f59e0b" />))}

            {/* Center KBT */}
            <circle cx={CX} cy={centerY} r={CENT_R+6} fill="white" opacity={0.6} />
            <circle cx={CX} cy={centerY} r={CENT_R} fill="url(#kbtG)" filter="url(#shadow)" />
            <circle cx={CX} cy={centerY} r={CENT_R} fill="none" stroke="#818cf8" strokeWidth="2" />
            {COMPANY_LOGO
              ? <image href={COMPANY_LOGO} x={CX-24} y={centerY-24} width={48} height={48} style={{ clipPath:'circle(24px)' }} />
              : <text x={CX} y={centerY+5} textAnchor="middle" fill="white" fontSize={17} fontWeight="bold" fontFamily="system-ui">KBT</text>
            }
            <text x={CX} y={centerY+CENT_R+14} textAnchor="middle" fill="#6366f1" fontSize={9.5} fontWeight="700" letterSpacing="1" fontFamily="system-ui">KALRA BUILDTECH</text>

            {/* Designation boxes */}
            {desigs.map(d => {
              const isE = expanded.has(d.id);
              return (
                <g key={d.id} style={{ cursor:'pointer' }} onClick={() => toggle(d.id)} onContextMenu={e => { e.preventDefault(); setSelected(d); }}>
                  <rect x={d.boxX} y={d.cy-DH/2} width={DW} height={DH} rx={7} filter="url(#shadow)"
                    fill={isE ? COL_ACTIVE : '#fff'} stroke={isE ? COL_ACTIVE_STROKE : COL_DESIG_STROKE} strokeWidth="1.5" />
                  <text x={d.boxX+DW/2} y={d.cy+4} textAnchor="middle" fill={isE ? '#e0e7ff' : '#1e293b'} fontSize={11.5} fontWeight={isE?'600':'500'} fontFamily="system-ui">
                    {d.title}
                  </text>
                </g>
              );
            })}

            {/* Employee boxes */}
            {desigs.map(d => d.employees.map(e => (
              <g key={e.id} style={{ cursor:'pointer' }} onClick={() => setSelected(d)}>
                <rect x={e.boxX} y={e.cy-EH/2} width={EW} height={EH} rx={6} filter="url(#shadow)"
                  fill="#fff" stroke="#cbd5e1" strokeWidth="1.2" />
                <text x={e.boxX+EW/2} y={e.cy+4} textAnchor="middle" fill="#475569" fontSize={10.5} fontFamily="system-ui">{e.name}</text>
              </g>
            )))}
          </svg>
        </div>
      </div>

      {selected && <RoleModal d={selected} pb={playbook} onClose={() => setSelected(null)} />}
    </div>
  );
};

const btnStyle: React.CSSProperties = {
  display:'flex', alignItems:'center', justifyContent:'center',
  padding:6, color:'#64748b', background:'transparent', border:'none', cursor:'pointer',
  borderRadius:6, transition:'background 0.15s, color 0.15s',
};
