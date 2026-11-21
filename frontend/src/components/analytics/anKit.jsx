import React, { useEffect, useState } from 'react';
import apiClient from '../../utils/apiClient';
import { Field, inputCls, btnGhost } from '../ui';
export { Table, Td, Reason, download, day, dt, PageBar, useGet, call, Tabs, Loading, Note, AskForm, money } from '../library/libKit';

export const today = () => new Date().toLocaleDateString('en-CA');
export const addDays = (d, n) => { const x = new Date(`${d}T00:00:00`); x.setDate(x.getDate() + n); return x.toLocaleDateString('en-CA'); };
export const ymName = (v) => (/^\d{4}-\d{2}$/.test(String(v || '')) ? new Date(`${v}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : v || '');
export const pct = (v) => (v === null || v === undefined ? '—' : `${v}%`);
export const nf = (n) => Number(n || 0).toLocaleString('en-PK');

const TONE = { good: 'bg-[#edf5f3] text-[#215a52]', info: 'bg-[#eef2f8] text-[#234c91]', warn: 'bg-[#fbf0ec] text-[#8a4636]', bad: 'bg-[#fff1f2] text-[#9f1239]', none: 'bg-[#f1f2f2] text-[#5b6b7b]' };
export const Tag = ({ tone = 'none', children }) => <span className={`inline-block whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-semibold ${TONE[tone]}`}>{children}</span>;
export const Sev = ({ s }) => (s === 'critical' ? <Tag tone="bad">Urgent</Tag> : <Tag tone="warn">Look at</Tag>);
export const STATUS = { pending: ['Waiting for approval', 'warn'], published: ['In use', 'good'], superseded: ['Replaced', 'none'], rejected: ['Turned down', 'bad'], open: ['Open', 'info'], done: ['Done', 'good'], dropped: ['Cancelled', 'none'] };
export const Status = ({ s }) => { const m = STATUS[s] || [s, 'none']; return <Tag tone={m[1]}>{m[0]}</Tag>; };

// The figure for a measure: hidden for a group too small to show, "no data" when nothing was recorded.
export const Value = ({ t, className = '' }) => {
  if (t.suppressed) return <span className={`text-[#5b6b7b] ${className}`} title="Too few children to show a figure safely">Hidden</span>;
  if (t.value === null || t.value === undefined) return <span className={`text-[#5b6b7b] ${className}`}>No data</span>;
  return <span dir="ltr" className={`tabular-nums ${className}`}>{t.value}%</span>;
};
export const Change = ({ v, good = 'up' }) => {
  if (v === null || v === undefined) return null; if (v === 0) return <span className="text-xs text-[#5b6b7b]">no change</span>;
  const up = v > 0; const fine = good === 'up' ? up : !up;
  return <span className={`text-xs font-semibold ${fine ? 'text-[#215a52]' : 'text-[#9f1239]'}`} dir="ltr">{up ? '▲' : '▼'} {Math.abs(v)} points</span>;
};
// a tiny trend line; the words are in the label so nothing depends on seeing it
export const Spark = ({ series, w = 120, h = 32 }) => {
  const pts = (series || []).filter((s) => s.value !== null && s.value !== undefined); if (pts.length < 2) return null;
  const lo = Math.min(...pts.map((p) => p.value)); const hi = Math.max(...pts.map((p) => p.value)); const span = hi - lo || 1;
  const xy = pts.map((p, i) => `${(i / (pts.length - 1)) * (w - 4) + 2},${h - 3 - ((p.value - lo) / span) * (h - 6)}`).join(' ');
  return <svg role="img" aria-label={`Trend from ${pts[0].value}% to ${pts[pts.length - 1].value}% over ${pts.length} months`} width={w} height={h} viewBox={`0 0 ${w} ${h}`}><polyline points={xy} fill="none" stroke="#2a5cac" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" /></svg>;
};
export const Bar = ({ v, tone = '#2a5cac' }) => <div className="h-2 w-full rounded bg-[#eef0f0]" aria-hidden="true"><div className="h-2 rounded" style={{ width: `${Math.max(0, Math.min(100, v || 0))}%`, background: tone }} /></div>;

export const PRESETS = [['7', 'Last 7 days'], ['30', 'Last 30 days'], ['90', 'Last 90 days'], ['365', 'Last year']];
export function usePeriod(initial = 30) { const [p, setP] = useState(() => { const to = addDays(today(), -1); return { from: addDays(to, -(initial - 1)), to }; }); return [p, setP]; }
export function PeriodBar({ value, onChange, groupBy, onGroup, groups }) {
  const preset = (n) => { const to = addDays(today(), -1); onChange({ from: addDays(to, -(Number(n) - 1)), to }); };
  return (
    <div className="flex flex-wrap items-end gap-3" role="group" aria-label="Period">
      <Field label="Quick choice"><select className={inputCls} value="" onChange={(e) => e.target.value && preset(e.target.value)}><option value="">Choose…</option>{PRESETS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
      <Field label="From"><input type="date" className={inputCls} value={value.from} max={value.to} onChange={(e) => e.target.value && onChange({ ...value, from: e.target.value })} /></Field>
      <Field label="To"><input type="date" className={inputCls} value={value.to} min={value.from} max={today()} onChange={(e) => e.target.value && onChange({ ...value, to: e.target.value })} /></Field>
      {onGroup && <Field label="Break down by"><select className={inputCls} value={groupBy} onChange={(e) => onGroup(e.target.value)}>{(groups || [['none', 'Whole school'], ['class', 'Class'], ['standard', 'Grade'], ['campus', 'Campus']]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>}
    </div>
  );
}
export const unitWord = (u) => ({ PKR: 'rupees' }[u] || u);

// who the person is here: level, whether the whole school or only some classes
export function useAnalyticsAccess() {
  const [s, setS] = useState({ ready: false, level: 'teacher', limited: false, admin: false, wide: false });
  useEffect(() => { let live = true; apiClient.get('/analytics/access').then((r) => { if (live) setS({ ready: true, ...r.data, wide: r.data.admin && !r.data.limited }); }).catch(() => { if (live) setS((x) => ({ ...x, ready: true, none: true })); }); return () => { live = false; }; }, []);
  return s;
}
export const GhostBtn = ({ className = '', ...p }) => <button className={`${btnGhost} ${className}`} {...p} />;
