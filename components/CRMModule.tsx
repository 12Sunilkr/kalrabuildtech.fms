import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Search, Plus, LayoutGrid, List, BarChart3,
  AlertCircle, Phone, Calendar, DollarSign,
  TrendingUp, Users, Briefcase, Activity,
  Bell, Settings, X, CheckSquare, ChevronRight
} from 'lucide-react';
import api, { extractPayload, ensureArray } from '../src/utils/api';
import { format, isBefore, startOfDay, parseISO } from 'date-fns';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CRMLead {
  id: string;
  s_no: number;
  name: string;
  mobile: string;
  source: 'Call' | 'Walk-in' | 'Reference' | 'Online';
  priority: 'Hot' | 'Warm' | 'Cold';
  status: 'New' | 'Follow-up' | 'Meeting Fixed' | 'Closed';
  site_visit: boolean;
  next_followup_date?: string;
  deal_value: number;
  assigned_to: string;
  assigned_name?: string;
  project?: string;
  remarks?: string;
  date?: string;
  created_at?: string;
}

export interface User {
  id?: string | number;
  employeeId?: string;
  role: 'ADMIN' | 'EMPLOYEE' | 'SUPER_ADMIN' | 'PC';
  name?: string;
  initials?: string;
}

export interface Employee {
  id: string;
  name: string;
  initials?: string;
}

type TabType = 'BOARD' | 'LIST' | 'DASHBOARD';
type Priority = 'Hot' | 'Warm' | 'Cold';
type Status = 'New' | 'Follow-up' | 'Meeting Fixed' | 'Closed';

interface CRMProps {
  currentUser: User;
  employees: Employee[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PROJECTS = ['FPR', 'MG', 'AW', 'BA', 'BR', '282C'];

const SOURCES = ['Call', 'Walk-in', 'Reference', 'Online'] as const;

const SOURCE_ICON: Record<string, string> = {
  Call: '📞',
  'Walk-in': '🚶',
  Reference: '🤝',
  Online: '🌐',
};

const PRIORITY_STYLE: Record<Priority, { bg: string; color: string; dot: string }> = {
  Hot: { bg: '#fef2f2', color: '#dc2626', dot: '#ef4444' },
  Warm: { bg: '#fffbeb', color: '#92400e', dot: '#f59e0b' },
  Cold: { bg: '#f1f5f9', color: '#64748b', dot: '#94a3b8' },
};

const STATUS_STYLE: Record<Status, { bg: string; color: string }> = {
  'New': { bg: '#eff6ff', color: '#1d4ed8' },
  'Follow-up': { bg: '#fffbeb', color: '#92400e' },
  'Meeting Fixed': { bg: '#f3e8ff', color: '#7e22ce' },
  'Closed': { bg: '#f0fdf4', color: '#15803d' },
};

const BOARD_COLUMNS: { id: Status; label: string; dot: string }[] = [
  { id: 'New', label: 'New Leads', dot: '#3b7fe8' },
  { id: 'Follow-up', label: 'In Follow-up', dot: '#d97706' },
  { id: 'Meeting Fixed', label: 'Meeting Fixed', dot: '#9333ea' },
  { id: 'Closed', label: 'Closed / Won', dot: '#0ea472' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d?: string) {
  if (!d) return '—';
  return format(parseISO(d), 'MMM dd, yyyy');
}

function fmtVal(v?: number): string | null {
  if (!v || v === 0) return null;
  if (v >= 10_000_000) return '₹' + (v / 10_000_000).toFixed(2) + ' Cr';
  if (v >= 100_000) return '₹' + (v / 100_000).toFixed(1) + 'L';
  return '₹' + v.toLocaleString('en-IN');
}

function isOverdue(dateStr?: string) {
  if (!dateStr) return false;
  return isBefore(parseISO(dateStr), startOfDay(new Date()));
}

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function getFollowupStatus(dateStr?: string) {
  if (!dateStr) return null;
  const target = parseISO(dateStr);
  const now = new Date();
  const diffInMs = target.getTime() - now.getTime();
  const diffInDays = Math.ceil(diffInMs / (1000 * 60 * 60 * 24));

  if (diffInDays < 0) {
    const overdue = Math.abs(diffInDays);
    return { text: `Overdue ${overdue}d`, color: '#dc2626', bg: '#fef2f2' };
  }
  if (diffInDays === 0) {
    return { text: 'Today', color: '#92400e', bg: '#fffbeb' };
  }
  if (diffInDays === 1) {
    return { text: 'Tomorrow', color: '#1d4ed8', bg: '#eff6ff' };
  }
  return { text: `In ${diffInDays}d`, color: '#64748b', bg: '#f1f5f9' };
}

function getCardStyle(lead: CRMLead) {
  if (lead.status === 'Closed') return { bg: '#f0fdf4', border: '#bbf7d0', hoverBorder: '#4ade80' };

  if (lead.next_followup_date) {
    const target = parseISO(lead.next_followup_date);
    const now = new Date();
    const diffInDays = Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (diffInDays <= 0) {
      return { bg: '#fef2f2', border: '#fecaca', hoverBorder: '#f87171' };
    }
  }

  if (lead.status === 'Follow-up') return { bg: '#fffbeb', border: '#fde68a', hoverBorder: '#fbbf24' };
  if (lead.status === 'Meeting Fixed') return { bg: '#faf5ff', border: '#e9d5ff', hoverBorder: '#d8b4fe' };
  if (lead.status === 'New') return { bg: '#eff6ff', border: '#bfdbfe', hoverBorder: '#60a5fa' };

  return { bg: '#fff', border: '#e2e8f0', hoverBorder: '#94a3b8' };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const Avatar: React.FC<{ name: string; size?: number }> = ({ name, size = 32 }) => (
  <div style={{
    width: size, height: size, borderRadius: '50%',
    background: '#0f1f3d', color: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: size * 0.34, fontWeight: 600, flexShrink: 0,
  }}>
    {initials(name)}
  </div>
);

const PriorityDot: React.FC<{ priority: Priority }> = ({ priority }) => (
  <div style={{
    width: 8, height: 8, borderRadius: '50%',
    background: PRIORITY_STYLE[priority].dot, flexShrink: 0, marginTop: 3,
  }} />
);

const StatusPill: React.FC<{ status: Status }> = ({ status }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', gap: 5,
    fontSize: 11, fontWeight: 500, padding: '3px 10px', borderRadius: 20,
    background: STATUS_STYLE[status].bg, color: STATUS_STYLE[status].color,
  }}>
    {status}
  </span>
);

const PriorityBadge: React.FC<{ priority: Priority }> = ({ priority }) => (
  <span style={{
    fontSize: 10, padding: '2px 8px', borderRadius: 4, fontWeight: 600,
    background: PRIORITY_STYLE[priority].bg, color: PRIORITY_STYLE[priority].color,
  }}>
    {priority}
  </span>
);

// ─── Lead Card (Board) ────────────────────────────────────────────────────────

const LeadCard: React.FC<{
  lead: CRMLead;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onClick: () => void;
  overdue: boolean;
}> = ({ lead, onDragStart, onClick, overdue }) => {
  const cardStyle = getCardStyle(lead);
  return (
    <div
      draggable
      onDragStart={e => onDragStart(e, lead.id)}
      onClick={onClick}
      style={{
        background: cardStyle.bg,
        border: `1px solid ${cardStyle.border}`,
        borderRadius: 10, padding: 14, cursor: 'pointer',
        transition: 'all 0.15s',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLDivElement).style.borderColor = cardStyle.hoverBorder;
        (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 12px rgba(0,0,0,0.06)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.borderColor = cardStyle.border;
        (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
      }}
    >
      {/* Top row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 13, color: '#1e293b' }}>{lead.name}</div>
          <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
            {lead.id}{lead.project ? ` · ${lead.project}` : ''}
          </div>
        </div>
        <PriorityDot priority={lead.priority} />
      </div>

      {/* Phone */}
      <div style={{ fontSize: 11.5, color: '#64748b', display: 'flex', alignItems: 'center', gap: 5, marginBottom: 10 }}>
        <Phone size={11} color="#94a3b8" />
        {lead.mobile}
      </div>

      {/* Tags */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
        <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 5, fontWeight: 500, background: '#eff6ff', color: '#1d4ed8' }}>
          {SOURCE_ICON[lead.source]} {lead.source}
        </span>
        {lead.site_visit && (
          <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 5, fontWeight: 500, background: '#f3e8ff', color: '#7c3aed' }}>
            🏠 Site Visited
          </span>
        )}
        {overdue && (
          <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 5, fontWeight: 500, background: '#fef2f2', color: '#dc2626' }}>
            ⚠ Overdue
          </span>
        )}
      </div>

      {/* Footer */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        paddingTop: 10, borderTop: '1px solid #f1f5f9',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ fontSize: 10.5, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Calendar size={11} color="#94a3b8" />
            {lead.next_followup_date ? fmtDate(lead.next_followup_date) : 'No follow-up'}
          </div>
          {lead.next_followup_date && lead.status !== 'Closed' && (
            <div style={{
              fontSize: 9.5, fontWeight: 700, padding: '1px 6px', borderRadius: 4, width: 'fit-content',
              background: getFollowupStatus(lead.next_followup_date)?.bg,
              color: getFollowupStatus(lead.next_followup_date)?.color,
              textTransform: 'uppercase', letterSpacing: '0.3px'
            }}>
              {getFollowupStatus(lead.next_followup_date)?.text}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {lead.assigned_name && <Avatar name={lead.assigned_name} size={24} />}
        </div>
      </div>
    </div>
  );
};

// ─── Board View ───────────────────────────────────────────────────────────────

const BoardView: React.FC<{
  leads: CRMLead[];
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDrop: (e: React.DragEvent, status: Status) => void;
  onLeadClick: (lead: CRMLead) => void;
}> = ({ leads, onDragStart, onDrop, onLeadClick }) => (
  <div style={{ display: 'flex', gap: 16, height: '100%', overflowX: 'auto', paddingBottom: 4, alignItems: 'flex-start' }}>
    {BOARD_COLUMNS.map(col => {
      const colLeads = leads.filter(l => l.status === col.id);
      return (
        <div
          key={col.id}
          onDragOver={e => e.preventDefault()}
          onDrop={e => onDrop(e, col.id)}
          style={{
            flexShrink: 0, width: 300,
            display: 'flex', flexDirection: 'column',
            background: '#f8fafc', border: '1px solid #e2e8f0',
            borderRadius: 12, overflow: 'hidden',
          }}
        >
          {/* Column header */}
          <div style={{
            padding: '14px 16px', background: '#fff',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: col.dot }} />
              <span style={{ fontSize: 12.5, fontWeight: 600, color: '#1e293b' }}>{col.label}</span>
              <span style={{
                fontSize: 11, fontWeight: 600, padding: '2px 8px',
                borderRadius: 20, background: '#f4f6fa', color: '#64748b',
              }}>{colLeads.length}</span>
            </div>
          </div>

          {/* Cards */}
          <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto', flex: 1, minHeight: 200 }}>
            {colLeads.length === 0 ? (
              <div style={{
                border: '1.5px dashed #cbd5e1', borderRadius: 8, height: 60,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, color: '#94a3b8',
              }}>
                Drop leads here
              </div>
            ) : (
              colLeads.map(lead => (
                <LeadCard
                  key={lead.id}
                  lead={lead}
                  onDragStart={onDragStart}
                  onClick={() => onLeadClick(lead)}
                  overdue={isOverdue(lead.next_followup_date) && lead.status !== 'Closed'}
                />
              ))
            )}
          </div>
        </div>
      );
    })}
  </div>
);

// ─── List View ────────────────────────────────────────────────────────────────

const ListView: React.FC<{
  leads: CRMLead[];
  onLeadClick: (lead: CRMLead) => void;
}> = ({ leads, onLeadClick }) => (
  <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: '#f8fafc' }}>
            {['Lead', 'Project', 'Status', 'Priority', 'Agent', 'Follow-up'].map((h, i) => (
              <th key={h} style={{
                padding: '11px 16px', fontSize: 10.5, fontWeight: 600,
                color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.7px',
                textAlign: 'left',
                borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap',
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {leads.length === 0 ? (
            <tr>
              <td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                No leads found
              </td>
            </tr>
          ) : leads.map(lead => {
            const overdue = isOverdue(lead.next_followup_date) && lead.status !== 'Closed';
            return (
              <tr
                key={lead.id}
                onClick={() => onLeadClick(lead)}
                style={{ cursor: 'pointer', borderBottom: '1px solid #f1f5f9', transition: 'background 0.1s' }}
                onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = '#fafbfc'}
                onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = ''}
              >
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ fontWeight: 600, fontSize: 12.5, color: '#1e293b' }}>{lead.name}</div>
                  <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 2 }}>{lead.id} · {lead.mobile}</div>
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ fontSize: 12, color: '#1e293b', fontWeight: 500 }}>{lead.project || '—'}</div>
                  <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 2 }}>{lead.source}</div>
                </td>
                <td style={{ padding: '12px 16px' }}><StatusPill status={lead.status} /></td>
                <td style={{ padding: '12px 16px' }}><PriorityBadge priority={lead.priority} /></td>
                <td style={{ padding: '12px 16px' }}>
                  {lead.assigned_name ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Avatar name={lead.assigned_name} size={24} />
                      <span style={{ fontSize: 12, color: '#64748b' }}>{lead.assigned_name}</span>
                    </div>
                  ) : '—'}
                </td>
                <td style={{ padding: '12px 16px', fontSize: 11.5, color: overdue ? '#dc2626' : '#94a3b8', fontWeight: overdue ? 500 : 400 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span>{lead.next_followup_date ? fmtDate(lead.next_followup_date) : '—'}</span>
                    {lead.next_followup_date && lead.status !== 'Closed' && (
                      <span style={{
                        fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3, width: 'fit-content',
                        background: getFollowupStatus(lead.next_followup_date)?.bg,
                        color: getFollowupStatus(lead.next_followup_date)?.color,
                        textTransform: 'uppercase'
                      }}>
                        {getFollowupStatus(lead.next_followup_date)?.text}
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  </div>
);

// ─── Dashboard View ───────────────────────────────────────────────────────────

const DashboardView: React.FC<{ leads: CRMLead[]; employees: Employee[] }> = ({ leads, employees }) => {
  const total = leads.length;
  const visits = leads.filter(l => l.site_visit).length;
  const closed = leads.filter(l => l.status === 'Closed').length;
  const followup = leads.filter(l => l.status === 'Follow-up').length;
  const newL = leads.filter(l => l.status === 'New').length;
  const conv = total > 0 ? Math.round((closed / total) * 100) : 0;
  const overdueCount = leads.filter(l => isOverdue(l.next_followup_date) && l.status !== 'Closed').length;

  const srcMap: Record<string, number> = {};
  leads.forEach(l => { srcMap[l.source] = (srcMap[l.source] || 0) + 1; });
  const srcs = Object.entries(srcMap).sort((a, b) => b[1] - a[1]);

  const kpis = [
    { label: 'Total Leads', value: total, sub: '+3 this week', accent: '#3b7fe8' },
    { label: 'Site Visits', value: visits, sub: `${Math.round(visits / total * 100) || 0}% of leads`, accent: '#c9a84c' },
    { label: 'Conversion Rate', value: `${conv}%`, sub: `${closed} deals closed`, accent: '#0ea472' },
    { label: 'Overdue Follow-ups', value: overdueCount, sub: 'Needs attention', accent: '#e53e3e' },
  ];

  const cardStyle: React.CSSProperties = {
    background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 18,
  };

  return (
    <div style={{ paddingBottom: 32 }}>
      {/* KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 20 }}>
        {kpis.map(k => (
          <div key={k.label} style={{ ...cardStyle, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: k.accent }} />
            <div style={{ fontSize: 10.5, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.8px', fontWeight: 500, marginBottom: 8 }}>
              {k.label}
            </div>
            <div style={{ fontSize: 26, fontWeight: 600, color: '#1e293b', lineHeight: 1 }}>{k.value}</div>
            <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 6 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Charts Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Funnel */}
        <div style={cardStyle}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: '#1e293b', marginBottom: 16 }}>Pipeline Funnel</div>
          {[
            { label: 'New', count: newL, color: '#3b7fe8' },
            { label: 'Follow-up', count: followup, color: '#d97706' },
            { label: 'Meeting', count: leads.filter(l => l.status === 'Meeting Fixed').length, color: '#9333ea' },
            { label: 'Site Visit', count: visits, color: '#7c3aed' },
            { label: 'Closed', count: closed, color: '#0ea472' },
          ].map(f => (
            <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div style={{ fontSize: 11.5, color: '#64748b', width: 80, flexShrink: 0 }}>{f.label}</div>
              <div style={{ flex: 1, background: '#f1f5f9', borderRadius: 4, height: 10, overflow: 'hidden' }}>
                <div style={{ width: `${total > 0 ? Math.round(f.count / total * 100) : 0}%`, height: 10, borderRadius: 4, background: f.color, transition: 'width 0.8s ease' }} />
              </div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#1e293b', width: 24, textAlign: 'right', flexShrink: 0 }}>{f.count}</div>
            </div>
          ))}
        </div>

        {/* Source breakdown */}
        <div style={cardStyle}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: '#1e293b', marginBottom: 16 }}>Leads by Source</div>
          {srcs.map(([src, n]) => (
            <div key={src} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
              <div style={{ width: 28, height: 28, borderRadius: 6, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>
                {SOURCE_ICON[src]}
              </div>
              <div style={{ flex: 1, fontSize: 12, fontWeight: 500, color: '#1e293b' }}>{src}</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>{total > 0 ? Math.round(n / total * 100) : 0}%</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#1e293b' }}>{n}</div>
            </div>
          ))}
        </div>

        {/* Team performance */}
        <div style={cardStyle}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: '#1e293b', marginBottom: 16 }}>Team Performance</div>
          {employees.map(emp => {
            const empLeads = leads.filter(l => l.assigned_to === emp.id).length;
            const empClosed = leads.filter(l => l.assigned_to === emp.id && l.status === 'Closed').length;
            const maxL = Math.max(...employees.map(e => leads.filter(l => l.assigned_to === e.id).length), 1);
            return (
              <div key={emp.id} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: 110, flexShrink: 0 }}>
                  <Avatar name={emp.name} size={24} />
                  <span style={{ fontSize: 12, color: '#1e293b' }}>{emp.name.split(' ')[0]}</span>
                </div>
                <div style={{ flex: 1, background: '#f1f5f9', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                  <div style={{ width: `${Math.round(empLeads / maxL * 100)}%`, height: 8, borderRadius: 4, background: '#0f1f3d' }} />
                </div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', width: 50, textAlign: 'right', flexShrink: 0 }}>
                  {empLeads} leads
                </div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#0ea472', width: 50, textAlign: 'right', flexShrink: 0 }}>
                  {empClosed} closed
                </div>
              </div>
            );
          })}
        </div>

        {/* Recent activity */}
        <div style={cardStyle}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: '#1e293b', marginBottom: 16 }}>Recent Activity</div>
          {leads.slice(0, 4).map((lead, i) => (
            <div key={lead.id} style={{ display: 'flex', gap: 10, marginBottom: 14, position: 'relative' }}>
              {i < 3 && (
                <div style={{
                  position: 'absolute', left: 15, top: 30, bottom: -14,
                  width: 1, background: '#e2e8f0',
                }} />
              )}
              <div style={{
                width: 30, height: 30, borderRadius: '50%',
                background: '#f4f6fa', border: '1.5px solid #e2e8f0',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, flexShrink: 0, zIndex: 1,
              }}>
                {lead.status === 'Closed' ? '✅' : lead.site_visit ? '🏠' : '📞'}
              </div>
              <div style={{ flex: 1, paddingTop: 4 }}>
                <div style={{ fontSize: 12, color: '#1e293b' }}>
                  {lead.status === 'Closed'
                    ? `Deal closed – ${lead.name}`
                    : lead.site_visit
                      ? `Site visit – ${lead.name}, ${lead.project}`
                      : `Follow-up – ${lead.name}`}
                </div>
                <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 2 }}>
                  {lead.created_at ? fmtDate(lead.created_at) : 'Recent'}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── Lead Form Modal ──────────────────────────────────────────────────────────

const LeadFormModal: React.FC<{
  lead: CRMLead | null;
  onClose: () => void;
  onSave: (data: Partial<CRMLead>) => void;
  onDelete?: (leadId: string) => void;
  employees: Employee[];
  isAdmin: boolean;
  currentUserId: string;
}> = ({ lead, onClose, onSave, onDelete, employees, isAdmin, currentUserId }) => {
  const [form, setForm] = useState<Partial<CRMLead>>({
    name: '', mobile: '', source: 'Call', site_visit: false,
    priority: 'Warm', status: 'New',
    date: new Date().toISOString().split('T')[0],
    assigned_to: currentUserId, deal_value: 0, remarks: '',
    project: PROJECTS[0],
  });
  const [history, setHistory] = useState<{ date: string, note: string }[]>([]);
  const [newRemark, setNewRemark] = useState('');

  useEffect(() => {
    if (lead) {
      setForm({
        ...lead,
        next_followup_date: lead.next_followup_date?.split('T')[0] ?? '',
      });
      if (lead.remarks) {
        try {
          const parsed = JSON.parse(lead.remarks);
          if (Array.isArray(parsed)) {
            setHistory(parsed);
          } else {
            setHistory([{ date: lead.created_at?.split('T')[0] || lead.date || '', note: lead.remarks }]);
          }
        } catch {
          setHistory([{ date: lead.created_at?.split('T')[0] || lead.date || '', note: lead.remarks }]);
        }
      } else {
        setHistory([]);
      }
    }
  }, [lead]);

  const set = (k: keyof CRMLead, v: any) => setForm(prev => ({ ...prev, [k]: v }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.mobile) { alert('Name and Mobile are required'); return; }
    // Always append new remark (supports unlimited notes)
    let finalHistory = [...history];
    if (newRemark.trim()) {
      finalHistory = [{ date: new Date().toISOString().split('T')[0], note: newRemark.trim() }, ...finalHistory];
      setNewRemark('');
    }
    onSave({ ...form, remarks: JSON.stringify(finalHistory) });
  };

  const handleDeleteNote = (idx: number) => {
    if (!isAdmin) return;
    if (!window.confirm('Delete this follow-up note?')) return;
    setHistory(prev => prev.filter((_, i) => i !== idx));
  };

  const handleDeleteLead = () => {
    if (!lead || !onDelete) return;
    if (!window.confirm(`Delete lead "${lead.name}"? This cannot be undone.`)) return;
    onDelete(lead.id);
  };

  const inputStyle: React.CSSProperties = {
    border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px',
    fontSize: 12.5, color: '#1e293b', outline: 'none',
    fontFamily: 'DM Sans, sans-serif', width: '100%', background: '#fff',
    boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11.5, fontWeight: 600, color: '#64748b',
    textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 5, display: 'block',
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(15,31,61,0.55)',
      zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{
        background: '#fff', borderRadius: 16,
        width: '100%', maxWidth: 600, maxHeight: '85vh',
        overflow: 'hidden', display: 'flex', flexDirection: 'column',
        boxShadow: '0 25px 50px rgba(0,0,0,0.2)',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px', borderBottom: '1px solid #e2e8f0',
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#1e293b' }}>
              {lead ? lead.name : 'Add New Lead'}
            </div>
            <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 3 }}>
              {lead ? `${lead.id} · ${lead.project}` : 'Fill in the lead details below'}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4 }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} style={{ padding: 24, overflowY: 'auto', flex: 1 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {/* Name */}
            <div>
              <label style={labelStyle}>Client Name *</label>
              <input required style={inputStyle} value={form.name || ''} onChange={e => set('name', e.target.value)} placeholder="Full name" />
            </div>
            {/* Mobile */}
            <div>
              <label style={labelStyle}>Mobile *</label>
              <input required style={inputStyle} value={form.mobile || ''} onChange={e => set('mobile', e.target.value)} placeholder="Phone number" />
            </div>
            {/* Project */}
            <div>
              <label style={labelStyle}>Project</label>
              <select style={inputStyle} value={form.project || ''} onChange={e => set('project', e.target.value)}>
                {PROJECTS.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            {/* Source */}
            <div>
              <label style={labelStyle}>Source</label>
              <select style={inputStyle} value={form.source || 'Call'} onChange={e => set('source', e.target.value as any)}>
                {SOURCES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            {/* Priority */}
            <div>
              <label style={labelStyle}>Priority</label>
              <div style={{ display: 'flex', background: '#f4f6fa', borderRadius: 8, padding: 3, gap: 2 }}>
                {(['Hot', 'Warm', 'Cold'] as Priority[]).map(p => (
                  <button
                    key={p} type="button"
                    onClick={() => set('priority', p)}
                    style={{
                      flex: 1, padding: '6px', border: 'none',
                      borderRadius: 6, fontSize: 12, cursor: 'pointer',
                      fontWeight: 500, transition: 'all 0.15s',
                      fontFamily: 'DM Sans, sans-serif',
                      background: form.priority === p ? '#fff' : 'transparent',
                      color: form.priority === p ? '#1e293b' : '#64748b',
                      boxShadow: form.priority === p ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    }}
                  >
                    {p === 'Hot' ? '🔥' : p === 'Warm' ? '⚡' : '❄️'} {p}
                  </button>
                ))}
              </div>
            </div>
            {/* Status */}
            <div>
              <label style={labelStyle}>Status</label>
              <select style={inputStyle} value={form.status || 'New'} onChange={e => set('status', e.target.value as any)}>
                <option>New</option>
                <option>Follow-up</option>
                <option>Meeting Fixed</option>
                <option>Closed</option>
              </select>
            </div>
            {/* Follow-up date */}
            <div>
              <label style={labelStyle}>Next Follow-up</label>
              <input type="date" style={inputStyle} value={form.next_followup_date || ''} onChange={e => set('next_followup_date', e.target.value)} />
            </div>
            {/* Assign to (admin only) */}
            {isAdmin && (
              <div>
                <label style={labelStyle}>Assign To</label>
                <select style={inputStyle} value={form.assigned_to || ''} onChange={e => set('assigned_to', e.target.value)}>
                  <option value="">Select Agent...</option>
                  {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                </select>
              </div>
            )}
            {/* Site visit */}
            <div style={{ gridColumn: '1 / -1' }}>
              <label
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', border: '1px solid #e2e8f0',
                  borderRadius: 8, cursor: 'pointer', background: '#fafbfc',
                }}
              >
                <div style={{
                  width: 18, height: 18, borderRadius: 4,
                  border: `1.5px solid ${form.site_visit ? '#0f1f3d' : '#e2e8f0'}`,
                  background: form.site_visit ? '#0f1f3d' : '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, transition: 'all 0.15s',
                }}>
                  {form.site_visit && <span style={{ color: '#fff', fontSize: 11 }}>✓</span>}
                </div>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 500, color: '#1e293b' }}>Site Visit Completed</div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>Mark if client has visited the property</div>
                </div>
                <input type="checkbox" checked={!!form.site_visit} onChange={e => set('site_visit', e.target.checked)} style={{ display: 'none' }} />
              </label>
            </div>
            {/* Remarks / Follow-up History */}
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Add Follow-up Note</label>
              <textarea
                style={{ ...inputStyle, resize: 'vertical' }}
                rows={2}
                value={newRemark}
                onChange={e => setNewRemark(e.target.value)}
                placeholder="What did the client say today?"
              />
            </div>

            {history.length > 0 && (
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>
                  Follow-up History
                  <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 400, color: '#94a3b8', textTransform: 'none', letterSpacing: 0 }}>
                    {history.length} note{history.length !== 1 ? 's' : ''}
                  </span>
                </label>
                <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', maxHeight: 240, overflowY: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                      <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                        <th style={{ padding: '8px 12px', textAlign: 'left', color: '#64748b', fontWeight: 600, width: '110px' }}>Date</th>
                        <th style={{ padding: '8px 12px', textAlign: 'left', color: '#64748b', fontWeight: 600 }}>Client Remarks</th>
                        {isAdmin && <th style={{ padding: '8px 12px', width: 36 }} />}
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((h, i) => (
                        <tr key={i} style={{ borderBottom: i === history.length - 1 ? 'none' : '1px solid #f1f5f9' }}>
                          <td style={{ padding: '8px 12px', color: '#64748b', verticalAlign: 'top', whiteSpace: 'nowrap' }}>{fmtDate(h.date)}</td>
                          <td style={{ padding: '8px 12px', color: '#1e293b', wordBreak: 'break-word' }}>{h.note}</td>
                          {isAdmin && (
                            <td style={{ padding: '4px 8px', textAlign: 'center', verticalAlign: 'middle' }}>
                              <button
                                type="button"
                                title="Delete this note"
                                onClick={() => handleDeleteNote(i)}
                                style={{
                                  background: 'none', border: 'none', cursor: 'pointer',
                                  color: '#cbd5e1', padding: 4, borderRadius: 4,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  transition: 'color 0.15s',
                                }}
                                onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = '#dc2626'}
                                onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = '#cbd5e1'}
                              >
                                <X size={13} />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{
            marginTop: 24, paddingTop: 16, borderTop: '1px solid #e2e8f0',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
          }}>
            {/* Left: Delete lead (admin + existing lead only) */}
            <div>
              {isAdmin && lead && onDelete && (
                <button
                  type="button"
                  onClick={handleDeleteLead}
                  style={{
                    border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626',
                    borderRadius: 8, padding: '8px 16px', fontSize: 12.5,
                    fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
                    display: 'flex', alignItems: 'center', gap: 6,
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLButtonElement).style.background = '#dc2626';
                    (e.currentTarget as HTMLButtonElement).style.color = '#fff';
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLButtonElement).style.background = '#fef2f2';
                    (e.currentTarget as HTMLButtonElement).style.color = '#dc2626';
                  }}
                >
                  <X size={14} /> Delete Lead
                </button>
              )}
            </div>
            {/* Right: Cancel + Save */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button" onClick={onClose}
                style={{
                  border: '1px solid #e2e8f0', background: '#fff',
                  borderRadius: 8, padding: '8px 18px', fontSize: 12.5,
                  fontWeight: 500, cursor: 'pointer', color: '#64748b',
                  fontFamily: 'DM Sans, sans-serif',
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                style={{
                  border: 'none', background: '#0f1f3d', color: '#fff',
                  borderRadius: 8, padding: '8px 22px', fontSize: 12.5,
                  fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
                }}
              >
                {lead ? 'Save Changes' : 'Create Lead'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─── Main CRM Module ──────────────────────────────────────────────────────────

export const CRMModule: React.FC<CRMProps> = ({ currentUser, employees }) => {
  const [leads, setLeads] = useState<CRMLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('BOARD');
  const [showForm, setShowForm] = useState(false);
  const [selectedLead, setSelectedLead] = useState<CRMLead | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterSource, setFilterSource] = useState('');
  const [filterAssigned, setFilterAssigned] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // ── Data fetching ────────────────────────────────────────────────────────

  const fetchLeads = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/crm/leads', { withCredentials: true });
      let data: CRMLead[] = ensureArray(extractPayload(res));
      if (currentUser.role === 'EMPLOYEE') {
        const myId = currentUser.employeeId || String(currentUser.id ?? '');
        data = data.filter(l => l.assigned_to === myId);
      }
      setLeads(data);
    } catch (err) {
      console.error('Failed to fetch CRM leads', err);
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  // ── Filtering ────────────────────────────────────────────────────────────

  const filteredLeads = useMemo(() => leads.filter(l => {
    const q = searchTerm.toLowerCase();
    const matchSearch = !q || l.name.toLowerCase().includes(q) || l.mobile.includes(q) || (l.project || '').toLowerCase().includes(q);
    const matchPriority = !filterPriority || l.priority === filterPriority;
    const matchSource = !filterSource || l.source === filterSource;
    const matchAssigned = !filterAssigned || l.assigned_to === filterAssigned;
    const matchStatus = !filterStatus || l.status === filterStatus;
    return matchSearch && matchPriority && matchSource && matchAssigned && matchStatus;
  }), [leads, searchTerm, filterPriority, filterSource, filterAssigned, filterStatus]);

  // ── CRUD ─────────────────────────────────────────────────────────────────

  const handleSaveLead = async (data: Partial<CRMLead>) => {
    try {
      if (data.id) {
        await api.put(`/crm/leads/${data.id}`, data, { withCredentials: true });
      } else {
        await api.post('/crm/leads', data, { withCredentials: true });
      }
      await fetchLeads();
      setShowForm(false);
      setSelectedLead(null);
    } catch (err) {
      console.error('Failed to save lead', err);
      alert('Failed to save lead. Please try again.');
    }
  };

  const handleDeleteLead = async (leadId: string) => {
    try {
      await api.delete(`/crm/leads/${leadId}`, { withCredentials: true });
      setLeads(prev => prev.filter(l => l.id !== leadId));
      setShowForm(false);
      setSelectedLead(null);
    } catch (err) {
      console.error('Failed to delete lead', err);
      alert('Failed to delete lead. Please try again.');
    }
  };

  const updateLeadStatus = async (leadId: string, newStatus: Status) => {
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status: newStatus } : l));
    try {
      await api.put(`/crm/leads/${leadId}`, { status: newStatus }, { withCredentials: true });
    } catch (err) {
      console.error('Failed to update status', err);
      fetchLeads();
    }
  };

  // ── Drag & Drop ──────────────────────────────────────────────────────────

  const handleDragStart = (e: React.DragEvent, leadId: string) => {
    e.dataTransfer.setData('leadId', leadId);
  };

  const handleDrop = (e: React.DragEvent, status: Status) => {
    e.preventDefault();
    const leadId = e.dataTransfer.getData('leadId');
    if (!leadId) return;
    const lead = leads.find(l => l.id === leadId);
    if (lead && lead.status !== status) updateLeadStatus(leadId, status);
  };

  // ── Tab switch ───────────────────────────────────────────────────────────

  const openLead = (lead: CRMLead) => { setSelectedLead(lead); setShowForm(true); };

  const tabLabel: Record<TabType, string> = { BOARD: 'Pipeline Board', LIST: 'Lead List', DASHBOARD: 'Dashboard' };

  // ─── Styles ───────────────────────────────────────────────────────────────

  const selectStyle: React.CSSProperties = {
    border: '1px solid #e2e8f0', background: '#fff', borderRadius: 6,
    padding: '5px 10px', fontSize: 11.5, color: '#64748b',
    outline: 'none', fontFamily: 'DM Sans, sans-serif', cursor: 'pointer',
  };

  return (
    <>
      {/* Google Font */}
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Serif+Display&display=swap');`}</style>

      <div style={{ display: 'flex', height: '100vh', fontFamily: 'DM Sans, sans-serif', background: '#f4f6fa', color: '#1e293b', overflow: 'hidden' }}>

        {/* ── Main ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Topbar */}
          <div style={{
            background: '#fff', borderBottom: '1px solid #e2e8f0',
            padding: '0 24px', height: 58,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
          }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 600, color: '#1e293b' }}>{tabLabel[activeTab]}</div>
              <div style={{ fontSize: 11, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 4, marginTop: 1 }}>
                CRM <ChevronRight size={10} /> {tabLabel[activeTab]}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ display: 'flex', background: '#f8fafc', padding: '4px', borderRadius: '8px', border: '1px solid #e2e8f0', gap: '4px' }}>
                {(['BOARD', 'LIST', 'DASHBOARD'] as TabType[]).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    style={{
                      padding: '6px 12px', borderRadius: '6px', fontSize: 12, fontWeight: 500,
                      background: activeTab === tab ? '#fff' : 'transparent',
                      color: activeTab === tab ? '#1e293b' : '#64748b',
                      border: activeTab === tab ? '1px solid #e2e8f0' : '1px solid transparent',
                      boxShadow: activeTab === tab ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                      cursor: 'pointer', transition: 'all 0.2s', outline: 'none'
                    }}
                  >
                    {tabLabel[tab]}
                  </button>
                ))}
              </div>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: '#f4f6fa', border: '1px solid #e2e8f0',
                borderRadius: 8, padding: '6px 12px', width: 230,
              }}>
                <Search size={14} color="#94a3b8" />
                <input
                  type="text" placeholder="Search by Client Name, Mobile or Project..."
                  value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                  style={{ border: 'none', background: 'transparent', fontSize: 12, color: '#1e293b', outline: 'none', width: '100%', fontFamily: 'DM Sans, sans-serif' }}
                />
              </div>
              <button
                onClick={() => { setSelectedLead(null); setShowForm(true); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: '#0f1f3d', color: '#fff', border: 'none',
                  borderRadius: 8, padding: '8px 16px', fontSize: 12.5,
                  fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
                }}
              >
                <Plus size={14} /> Add Lead
              </button>
            </div>
          </div>

          {/* Sub-bar: tabs + filters */}
          <div style={{
            background: '#fff', borderBottom: '1px solid #e2e8f0',
            padding: '0 24px', display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', flexShrink: 0,
          }}>
            <div style={{ display: 'flex' }}>
              {(['BOARD', 'LIST', 'DASHBOARD'] as TabType[]).map(t => (
                <div
                  key={t}
                  onClick={() => setActiveTab(t)}
                  style={{
                    padding: '14px 18px', fontSize: 12.5, fontWeight: 500,
                    cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap',
                    color: activeTab === t ? '#0f1f3d' : '#64748b',
                    borderBottom: activeTab === t ? '2px solid #c9a84c' : '2px solid transparent',
                  }}
                >
                  {tabLabel[t]}
                </div>
              ))}
            </div>

            {activeTab !== 'DASHBOARD' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0' }}>
                <select style={selectStyle} onChange={e => setFilterPriority(e.target.value)}>
                  <option value="">All Priorities</option>
                  <option>Hot</option><option>Warm</option><option>Cold</option>
                </select>
                <select style={selectStyle} onChange={e => setFilterSource(e.target.value)}>
                  <option value="">All Sources</option>
                  {SOURCES.map(s => <option key={s}>{s}</option>)}
                </select>
                <select style={selectStyle} onChange={e => setFilterAssigned(e.target.value)}>
                  <option value="">All Agents</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
                {activeTab === 'LIST' && (
                  <select style={selectStyle} onChange={e => setFilterStatus(e.target.value)}>
                    <option value="">All Status</option>
                    <option>New</option><option>Follow-up</option><option>Closed</option>
                  </select>
                )}
              </div>
            )}
          </div>

          {/* Content */}
          <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
            {loading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                <div style={{
                  width: 36, height: 36, border: '3px solid #e2e8f0',
                  borderTop: '3px solid #0f1f3d', borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                }} />
                <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
              </div>
            ) : (
              <>
                {activeTab === 'BOARD' && (
                  <BoardView
                    leads={filteredLeads}
                    onDragStart={handleDragStart}
                    onDrop={handleDrop}
                    onLeadClick={openLead}
                  />
                )}
                {activeTab === 'LIST' && (
                  <ListView leads={filteredLeads} onLeadClick={openLead} />
                )}
                {activeTab === 'DASHBOARD' && (
                  <DashboardView leads={leads} employees={employees} />
                )}
              </>
            )}
          </div>
        </div>

        {/* Lead Form Modal */}
        {showForm && (
          <LeadFormModal
            lead={selectedLead}
            onClose={() => { setShowForm(false); setSelectedLead(null); }}
            onSave={handleSaveLead}
            onDelete={currentUser.role === 'ADMIN' ? handleDeleteLead : undefined}
            employees={employees}
            isAdmin={currentUser.role === 'ADMIN' || currentUser.role === 'SUPER_ADMIN'}
            currentUserId={currentUser.employeeId || String(currentUser.id ?? '')}
          />
        )}
      </div>
    </>
  );
};

export default CRMModule;