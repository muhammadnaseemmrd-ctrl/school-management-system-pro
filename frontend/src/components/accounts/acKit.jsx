import React, { useEffect, useState } from 'react';
import apiClient from '../../utils/apiClient';
import { Field, inputCls } from '../ui';
export { Table, Td, Reason, saveBlob, download, day, dt, key, PageBar, useDebounced, useGet, call, Tabs, Loading, Note, AskForm, money } from '../library/libKit';

const TONE = { good: 'bg-[#edf5f3] text-[#215a52]', info: 'bg-[#eef2f8] text-[#234c91]', warn: 'bg-[#fbf0ec] text-[#8a4636]', bad: 'bg-[#fff1f2] text-[#9f1239]', none: 'bg-[#f1f2f2] text-[#5b6b7b]' };
const MAP = {
  journal: { draft: ['Draft', 'none'], submitted: ['Waiting for approval', 'warn'], rejected: ['Returned', 'bad'], posting: ['Posting', 'info'], posted: ['In the books', 'good'] },
  type: { manual: ['Journal', 'none'], opening: ['Opening balances', 'info'], adjusting: ['Adjustment', 'info'], system: ['Automatic', 'none'], reversal: ['Reversal', 'warn'] },
  period: { open: ['Open', 'good'], closing: ['Waiting for sign-off', 'warn'], closed: ['Closed', 'none'] },
  fund: { active: ['Open', 'good'], closed: ['Closed', 'none'] },
  budget: { draft: ['Draft', 'none'], approved: ['In force', 'good'], superseded: ['Replaced', 'none'] },
  recon: { draft: ['Being worked on', 'warn'], signed: ['Signed', 'good'] },
};
export const ABadge = ({ k, s, label }) => { const m = (MAP[k] || {})[s] || [String(s || '').replace(/_/g, ' '), 'none']; return <span className={`inline-block whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-semibold ${TONE[m[1]]}`}>{label || m[0]}</span>; };
export const KIND_WORD = { asset: 'Assets', liability: 'Liabilities', net_assets: 'Net assets', income: 'Income', expense: 'Expenses' };
export const FUND_KIND = { unrestricted: 'General', restricted: 'Restricted', grant: 'Grant' };
export const today = () => new Date().toLocaleDateString('en-CA');
export const ym = (d = new Date()) => d.toLocaleDateString('en-CA').slice(0, 7);
export const ymName = (v) => { if (!/^\d{4}-\d{2}$/.test(String(v || ''))) return v || ''; return new Date(`${v}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }); };
export const Num = ({ v, bold, neg }) => <span className={`tabular-nums ${bold ? 'font-bold' : ''} ${neg && v < 0 ? 'text-[#9f1239]' : ''}`} dir="ltr">{v === 0 || v == null ? '–' : Number(v).toLocaleString('en-PK')}</span>;
export const Stat = ({ label, value, sub, tone }) => <div className="rounded-xl border border-[#e3e7e7] bg-white p-3"><div className="text-xs text-[#5b6b7b]">{label}</div><div className={`mt-0.5 text-lg font-bold tabular-nums ${tone === 'bad' ? 'text-[#9f1239]' : 'text-[#1b2837]'}`} dir="ltr">{value}</div>{sub && <div className="text-xs text-[#5b6b7b]">{sub}</div>}</div>;
export const Trail = ({ rows }) => (rows && rows.length ? <ol className="space-y-1 text-xs text-[#3b4a5c]" aria-label="History">{rows.slice().reverse().map((t, i) => <li key={i}><span className="font-semibold">{t.action}</span>{t.byName ? ` · ${t.byName}` : ''}{t.note ? ` — ${t.note}` : ''} <span className="text-[#5b6b7b]">{t.at ? new Date(t.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</span></li>)}</ol> : null);
export const Dl = ({ items }) => <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">{items.filter(Boolean).map(([k, v]) => <div key={k}><dt className="text-xs text-[#5b6b7b]">{k}</dt><dd className="font-medium text-[#1b2837]">{v === '' || v == null ? '—' : v}</dd></div>)}</dl>;

// The chart of accounts, loaded once and shared by every picker.
let cache = null;
export function useChart(reload) {
  const [rows, setRows] = useState(cache || []);
  useEffect(() => { let live = true; apiClient.get('/accounts/accounts').then((r) => { cache = r.data.accounts; if (live) setRows(r.data.accounts); }).catch(() => {}); return () => { live = false; }; }, [reload]);
  return rows;
}
export function AccountSelect({ label, value, onChange, kinds, activeOnly = true, required, blank = 'Choose an account', ...rest }) {
  const rows = useChart(); const list = rows.filter((a) => (!kinds || kinds.includes(a.kind)) && (!activeOnly || a.active || a.code === value));
  return <Field label={label}><select className={inputCls} value={value || ''} onChange={(e) => onChange(e.target.value)} required={required} {...rest}><option value="">{blank}</option>{list.map((a) => <option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}</select></Field>;
}
