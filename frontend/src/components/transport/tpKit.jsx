import React, { useEffect, useState } from 'react';
import apiClient from '../../utils/apiClient';
import { Field, inputCls } from '../ui';
export { Table, Td, Reason, saveBlob, download, day, dt, key, PageBar, useDebounced, useGet, call, Tabs, Loading, Note, AskForm } from '../library/libKit';

const TONE = { good: 'bg-[#edf5f3] text-[#215a52]', info: 'bg-[#eef2f8] text-[#234c91]', warn: 'bg-[#fbf0ec] text-[#8a4636]', bad: 'bg-[#fff1f2] text-[#9f1239]', none: 'bg-[#f1f2f2] text-[#5b6b7b]' };
const MAP = {
  trip: { scheduled: ['Not started', 'none'], checked: ['Ready to go', 'info'], active: ['On the road', 'good'], completed: ['Finished', 'good'], cancelled: ['Cancelled', 'none'], missed: ['Did not run', 'bad'] },
  board: { expected: ['Waiting', 'none'], boarded: ['On the bus', 'info'], alighted: ['Got off', 'good'], no_show: ['Not at the stop', 'warn'], opted_out: ['Not riding today', 'none'], absent: ['Absent from school', 'none'], exception: ['Needs attention', 'bad'] },
  incident: { open: ['Open', 'bad'], acknowledged: ['Being handled', 'warn'], resolved: ['Settled', 'good'] },
  severity: { low: ['Low', 'none'], medium: ['Medium', 'info'], high: ['High', 'warn'], critical: ['Critical', 'bad'] },
  vehicle: { active: ['In service', 'good'], inspection_hold: ['On hold: failed inspection', 'bad'], retired: ['Retired', 'none'] },
  driver: { active: ['Active', 'good'], suspended: ['Switched off', 'bad'] },
  result: { pass: ['Passed', 'good'], fail: ['Failed', 'bad'] },
};
export const TBadge = ({ k, s, label }) => { const m = (MAP[k] || {})[s] || [String(s || '').replace(/_/g, ' '), 'none']; return <span className={`inline-block whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-semibold ${TONE[m[1]]}`}>{label || m[0]}</span>; };
export const DIR = { morning: 'Morning (to school)', afternoon: 'Afternoon (home)' };
export const DIR_SHORT = { morning: 'Morning', afternoon: 'Afternoon' };
export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const KIND_WORD = { vehicle_fault: 'Vehicle fault', accident: 'Accident', breakdown: 'Breakdown', child_missing: 'Child not accounted for', unauthorised_collector: 'Wrong person at the stop', no_one_at_stop: 'Nobody at the stop', behaviour: 'Behaviour', medical: 'Medical', route_hazard: 'Route hazard', family_concern: 'Family concern', late: 'Very late', other: 'Other' };
export const hm = (d) => (d ? new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '');
export const today = () => new Date().toLocaleDateString('en-CA');
export const Dl = ({ items }) => <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">{items.filter(Boolean).map(([k, v]) => <div key={k}><dt className="text-xs text-[#5b6b7b]">{k}</dt><dd className="font-medium text-[#1b2837]">{v === '' || v == null ? '—' : v}</dd></div>)}</dl>;
export const Trail = ({ rows }) => (rows && rows.length ? <ol className="space-y-1 text-xs text-[#3b4a5c]" aria-label="History">{rows.slice().reverse().map((t, i) => <li key={i}><span className="font-semibold">{t.action}</span>{t.byName ? ` · ${t.byName}` : ''}{t.note ? ` — ${t.note}` : ''} <span className="text-[#5b6b7b]">{t.at ? new Date(t.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</span></li>)}</ol> : null);

// Find a child by name among the school's active children.
export function ChildPicker({ label = 'Child', value, onPick, autoFocus }) {
  const [q, setQ] = useState(''); const [rows, setRows] = useState([]);
  useEffect(() => {
    if (q.trim().length < 2) { setRows([]); return undefined; }
    const t = setTimeout(() => { apiClient.get('/transport/students', { params: { q } }).then((r) => setRows(r.data.students || [])).catch(() => setRows([])); }, 250);
    return () => clearTimeout(t);
  }, [q]);
  if (value) return <div className="flex items-center gap-2 rounded-lg border border-[#e3e7e7] bg-[#f7f6f2] px-3 py-2 text-sm"><span className="min-w-0 flex-1 truncate"><b>{value.name}</b>{value.className ? ` · ${value.className}` : ''}</span><button type="button" className="text-xs font-semibold text-[#2a5cac] underline" onClick={() => onPick(null)}>Change</button></div>;
  return (
    <div className="relative">
      <Field label={label} hint="Type at least two letters of the name"><input autoFocus={autoFocus} className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name" /></Field>
      {rows.length > 0 && <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-[#e3e7e7] bg-white shadow-lg" role="listbox">{rows.map((s) => <li key={s._id}><button type="button" className="w-full px-3 py-2 text-start text-sm hover:bg-[#f7f6f2]" onClick={() => { onPick(s); setQ(''); setRows([]); }}>{s.name}<span className="text-xs text-[#5b6b7b]"> · {s.className || 'no class'}{s.rides ? ' · already rides' : ''}</span></button></li>)}</ul>}
    </div>
  );
}
