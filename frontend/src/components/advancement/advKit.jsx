import React from 'react';
import { toast } from 'react-hot-toast';
import apiClient from '../../utils/apiClient';
export { useGet, call, Tabs, Loading, Note, Table, Td, Reason, AskForm, Tag, dt, day, download, money, nf, today, addDays } from '../group/gKit';
export { ShowOnce } from '../training/tkit';

// send, say it worked, then refresh. A failure is thrown so the open form can show it.
export const send = async (method, path, body, ok, after) => { const r = await apiClient[method](`/advancement${path}`, body); if (ok) toast.success(ok); if (after) after(r.data); return r.data; };
export const Tile = ({ label, value, tone, sub }) => <div className="rounded-xl border border-[#e3e7e7] bg-white p-4"><p className="text-xs font-semibold text-[#5b6b7b]">{label}</p><p className={`mt-1 text-2xl font-bold tabular-nums ${tone || 'text-[#1b2837]'}`} dir="ltr">{value}</p>{sub && <p className="mt-0.5 text-xs text-[#5b6b7b]">{sub}</p>}</div>;
export const Grid = ({ children }) => <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>;
export const Empty = ({ children }) => <div className="rounded-xl border border-dashed border-[#d5dbdb] bg-white p-6 text-center text-sm text-[#5b6b7b]">{children}</div>;
export const lines = (s) => String(s || '').split('\n').map((x) => x.trim()).filter(Boolean);
export const tone = (s) => ({ Met: 'good', Accepted: 'good', Verified: 'good', Approved: 'good', Live: 'good', Active: 'good', Fulfilled: 'good', Published: 'good', Closed: 'none', Expiring: 'warn', Waiting: 'warn', Submitted: 'warn', Pending: 'warn', Requested: 'warn', Review: 'warn', Draft: 'none', Open: 'info', Invited: 'info', Gap: 'bad', Rejected: 'bad', Declined: 'bad', Overdue: 'bad', Expired: 'bad', Withdrawn: 'none', Erased: 'none', Held: 'info', Planned: 'info' }[s] || 'none');
