import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import apiClient from '../../utils/apiClient';
import { EmptyState, TableSkeleton, btnGhost, errMsg, inputCls } from '../ui';

// Small shared pieces for the attendance desks (staff and family)
export const todayKey = () => new Date().toISOString().slice(0, 10);

export const useList = (path, key, params, enabled = true) => {
  const [s, setS] = useState({ rows: [], pagination: null, loading: true, error: '' }); const [page, setPage] = useState(1); const q = JSON.stringify(params || {});
  const load = useCallback(async () => {
    if (!enabled) return;
    setS((x) => ({ ...x, loading: true }));
    try { const r = await apiClient.get(path, { params: { page, ...JSON.parse(q) } }); setS({ rows: r.data[key] || [], pagination: r.data.pagination || null, loading: false, error: '' }); }
    catch (e) { setS({ rows: [], pagination: null, loading: false, error: errMsg(e, 'Could not load this list') }); }
  }, [path, key, page, q, enabled]);
  useEffect(() => { load(); }, [load]); useEffect(() => { setPage(1); }, [q]);
  return { ...s, setPage, reload: load };
};
export const Body = ({ l, cols, empty, children }) => (l.loading ? <TableSkeleton cols={cols} /> : l.error ? <EmptyState title={l.error} action={<button className={btnGhost} onClick={l.reload}>Try again</button>} /> : !l.rows.length ? <EmptyState title={empty} /> : children);
const Th = ({ children }) => <th className="px-3 py-2 text-start text-xs font-semibold uppercase tracking-wide text-[#5b6b7b]">{children}</th>;
export const Tbl = ({ head, children }) => <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>{head.map((h, i) => <Th key={i}>{h}</Th>)}</tr></thead><tbody>{children}</tbody></table></div>;
export const Td = ({ children, cls = '' }) => <td className={`px-3 py-2 align-top ${cls}`}>{children}</td>;
export const Row = ({ children }) => <tr className="border-t border-[#e3e7e7]">{children}</tr>;
export const Bar = ({ children }) => <div className="flex flex-wrap items-center gap-2 border-b border-[#e3e7e7] p-3">{children}</div>;
export const act = (fn, ok, after) => async () => { try { await fn(); if (ok) toast.success(ok); if (after) after(); } catch (e) { toast.error(errMsg(e)); } };
export const Sub = ({ children }) => <div className="mt-0.5 text-xs text-[#5b6b7b]">{children}</div>;
export const TONE = { Pending: 'Pending', Verified: 'Active', Sent: 'Approved', Cancelled: 'None', Requested: 'Pending', Approved: 'Approved', Rejected: 'Suspended', Open: 'Pending', InProgress: 'Active', Resolved: 'Approved', Reviewed: 'Active', Dismissed: 'None', Closed: 'None', Healthy: 'Active', Silent: 'Suspended', 'Clock drift': 'Pending', Disabled: 'None', Info: 'None' };

// A student picker that searches by name so a desk never needs a long dropdown
export const StudentPick = ({ value, onChange, label = 'Student' }) => {
  const [q, setQ] = useState(''); const [rows, setRows] = useState([]); const [picked, setPicked] = useState(null);
  useEffect(() => {
    if (q.trim().length < 2) { setRows([]); return undefined; }
    const h = setTimeout(() => apiClient.get('/students', { params: { search: q, limit: 8 } }).then((r) => setRows(r.data.students || [])).catch(() => setRows([])), 250);
    return () => clearTimeout(h);
  }, [q]);
  if (value && picked) return <div className="flex items-center justify-between rounded-lg border border-[#e3e7e7] bg-[#f7f6f2] px-3 py-2 text-sm"><span>{picked.name}</span><button type="button" className="text-xs font-semibold text-[#2a5cac]" onClick={() => { onChange(''); setPicked(null); }}>Change</button></div>;
  return (
    <div className="relative">
      <input className={inputCls} placeholder={`${label}: type at least 2 letters`} value={q} onChange={(e) => setQ(e.target.value)} aria-label={label} />
      {rows.length > 0 && <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-[#e3e7e7] bg-white shadow-lg">{rows.map((s) => <li key={s._id}><button type="button" className="block w-full px-3 py-2 text-start text-sm hover:bg-[#f7f6f2]" onClick={() => { onChange(s._id); setPicked(s); setQ(''); setRows([]); }}>{s.name} <span className="text-xs text-[#5b6b7b]">{s.rollNumber ? `· roll ${s.rollNumber}` : ''}</span></button></li>)}</ul>}
    </div>
  );
};
