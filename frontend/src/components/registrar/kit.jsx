import React, { useState } from 'react';
import apiClient from '../../utils/apiClient';
import { Modal, Field, btnGhost, btnPrimary, btnDanger, inputCls, errMsg } from '../ui';

export const when = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
export const saveBlob = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };
export const download = async (path, name, onErr) => { try { const r = await apiClient.get(path, { responseType: 'blob' }); saveBlob(r.data, name); } catch (e) { (onErr || alert)(errMsg(e, 'Could not download that file.')); } };

// Every status is a word; colour only supports it.
const TONE = {
  good: 'bg-[#edf5f3] text-[#215a52]', info: 'bg-[#eef2f8] text-[#234c91]', warn: 'bg-[#fbf0ec] text-[#8a4636]', bad: 'bg-[#fff1f2] text-[#9f1239]', none: 'bg-[#f1f2f2] text-[#5b6b7b]',
};
const MAP = {
  draft: ['Draft', 'none'], review: ['Waiting for approval', 'warn'], published: ['In use', 'good'], retired: ['Retired', 'none'], active: ['Active', 'good'], planned: ['Planned', 'none'], open: ['Open for registration', 'good'], grading: ['Grading', 'info'], closed: ['Closed', 'none'],
  pending: ['Waiting', 'warn'], approved: ['Approved', 'good'], rejected: ['Turned down', 'bad'], used: ['Used', 'none'], withdrawn: ['Withdrawn', 'none'], submitted: ['Filed', 'warn'], under_review: ['Being reviewed', 'info'], upheld: ['Upheld', 'good'],
  valid: ['Genuine', 'good'], revoked: ['Withdrawn', 'bad'], graduated: ['Graduated', 'good'], cancelled: ['Cancelled', 'none'], enrolled: ['Registered', 'info'], completed: ['Completed', 'good'], dropped: ['Dropped', 'none'],
  done: ['Done', 'good'], substituted: ['Done by substitution', 'good'], inprogress: ['In progress', 'info'], todo: ['Still to take', 'warn'], waived: ['Waived', 'good'], met: ['Met', 'good'],
};
export const Badge = ({ s, tone }) => { const m = MAP[s] || [s, 'none']; return <span className={`inline-block whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-semibold ${TONE[tone || m[1]]}`}>{m[0]}</span>; };
export const KINDS = { overload: 'Extra credits', prereq_waiver: 'Skip a prerequisite', extra_attempt: 'Extra attempt', requirement_waiver: 'Waive a requirement group', substitution: 'Substitute a course', catalog_switch: 'Change catalogue year' };
export const gradeTxt = (g) => g || '—';

// Ask for a reason before a step that is kept in the record.
export function Reason({ title, text, confirm, onClose, onDone, label = 'Reason (kept in the record)', min = 5, danger = true }) {
  const [v, setV] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const go = async (e) => { e.preventDefault(); setBusy(true); setErr(''); try { await onDone(v.trim()); } catch (x) { setErr(errMsg(x, 'That did not work.')); setBusy(false); } };
  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={go} className="grid gap-3">
        {text && <p className="text-sm text-[#5b6b7b]">{text}</p>}
        <Field label={label}><textarea className={inputCls} rows={3} value={v} onChange={(e) => setV(e.target.value)} required minLength={min} autoFocus /></Field>
        {err && <p role="alert" className="text-sm text-[#9f1239]">{err}</p>}
        <div className="flex justify-end gap-2"><button type="button" className={btnGhost} onClick={onClose}>Not now</button><button className={danger ? btnDanger : btnPrimary} disabled={busy || v.trim().length < min}>{busy ? 'Working…' : confirm}</button></div>
      </form>
    </Modal>
  );
}

export const Table = ({ head, children, label, min = 560 }) => (
  <div role="region" aria-label={label} tabIndex={0} className="overflow-x-auto rounded-xl border border-[#e3e7e7]"><table aria-label={label} className="w-full text-sm" style={{ minWidth: min }}><thead className="border-b border-[#e3e7e7] bg-[#f7f6f2] text-xs text-[#5b6b7b]"><tr>{head.map((h) => <th key={h} scope="col" className="p-2 text-start font-semibold">{h}</th>)}</tr></thead><tbody>{children}</tbody></table></div>
);
export const Td = ({ children, className = '' }) => <td className={`border-b border-[#f0f1f1] p-2 align-top ${className}`}>{children}</td>;
