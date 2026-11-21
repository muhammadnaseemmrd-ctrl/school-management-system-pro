import React from 'react';
export { Table, Td, Reason, saveBlob, download, money, day, dt, key, PageBar, useDebounced, useGet, call, Tabs, Loading, Note, AskForm } from '../library/libKit';

const TONE = { good: 'bg-[#edf5f3] text-[#215a52]', info: 'bg-[#eef2f8] text-[#234c91]', warn: 'bg-[#fbf0ec] text-[#8a4636]', bad: 'bg-[#fff1f2] text-[#9f1239]', none: 'bg-[#f1f2f2] text-[#5b6b7b]' };
const MAP = {
  req: { draft: ['Draft', 'none'], submitted: ['Waiting for approval', 'warn'], approved: ['Approved', 'good'], rejected: ['Turned down', 'bad'], ordered: ['Ordered', 'info'], closed: ['Closed', 'none'], cancelled: ['Cancelled', 'none'] },
  order: { issued: ['Issued', 'info'], part_received: ['Part received', 'warn'], received: ['Received', 'good'], closed: ['Closed', 'none'], cancelled: ['Cancelled', 'none'] },
  bill: { entered: ['Waiting for approval', 'warn'], approved: ['Ready to pay', 'info'], rejected: ['Turned down', 'bad'], paid: ['Paid', 'good'], void: ['Cancelled', 'none'] },
  match: { matched: ['Matches the order', 'good'], within_tolerance: ['Close enough', 'info'], exception: ['Does not match', 'bad'], over: ['More than ordered', 'bad'] },
  asset: { in_service: ['In service', 'good'], in_repair: ['In repair', 'warn'], stored: ['In storage', 'none'], disposal_requested: ['Disposal waiting', 'warn'], disposed: ['Gone', 'none'], lost: ['Lost', 'bad'] },
  ticket: { open: ['Open', 'info'], assigned: ['Assigned', 'info'], in_progress: ['In progress', 'warn'], done: ['Done', 'good'], closed: ['Closed', 'none'], cancelled: ['Cancelled', 'none'] },
  priority: { low: ['Low', 'none'], normal: ['Normal', 'info'], high: ['High', 'warn'], urgent: ['Urgent', 'bad'] },
  phase: { proposed: ['Proposed', 'warn'], approved: ['Approved', 'good'], building: ['Under way', 'info'], handover: ['Handover', 'info'], completed: ['Completed', 'good'], cancelled: ['Cancelled', 'none'] },
  budget: { draft: ['Draft', 'warn'], approved: ['Approved', 'good'], closed: ['Closed', 'none'] },
  ask: { requested: ['Waiting for a decision', 'warn'], approved: ['Approved', 'good'], rejected: ['Turned down', 'bad'] },
  vendor: { active: ['Active', 'good'], blocked: ['Blocked', 'bad'] },
  fund: { active: ['Open', 'good'], closed: ['Closed', 'none'] },
  contract: { active: ['Running', 'good'], ended: ['Ended', 'none'], cancelled: ['Cancelled', 'none'] },
};
export const PBadge = ({ k, s, label }) => { const m = (MAP[k] || {})[s] || [String(s || '').replace(/_/g, ' '), 'none']; return <span className={`inline-block whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-semibold ${TONE[m[1]]}`}>{label || m[0]}</span>; };
export const KINDS = { general: 'General', restricted: 'Restricted', grant: 'Grant', donor: 'Donor' };
export const ASSET_KINDS = { furniture: 'Furniture', it: 'Computers and IT', lab: 'Lab equipment', vehicle: 'Vehicles', building: 'Buildings', sports: 'Sports', other: 'Other' };
export const METHODS = [['bank_transfer', 'Bank transfer'], ['cheque', 'Cheque'], ['cash', 'Cash']];
export const MATCH_HELP = { matched: 'The bill is for what was ordered and received.', within_tolerance: 'The bill differs by less than the allowed tolerance.' };
// One small label and value pair for detail panels.
export const Dl = ({ items }) => <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">{items.filter(Boolean).map(([k, v]) => <div key={k}><dt className="text-xs text-[#5b6b7b]">{k}</dt><dd className="font-medium text-[#1b2837]">{v === '' || v == null ? '—' : v}</dd></div>)}</dl>;
export const Trail = ({ rows }) => (rows && rows.length ? <ol className="space-y-1 text-xs text-[#3b4a5c]" aria-label="History">{rows.slice().reverse().map((t, i) => <li key={i}><span className="font-semibold">{t.action}</span>{t.byName ? ` · ${t.byName}` : ''}{t.note ? ` — ${t.note}` : ''} <span className="text-[#5b6b7b]">{t.at ? new Date(t.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</span></li>)}</ol> : null);
export const today = () => new Date().toISOString().slice(0, 10);
