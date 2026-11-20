import React, { useState } from 'react';
import axios from 'axios';
import { Table, Td, Reason, saveBlob, download } from '../registrar/kit';
import { Modal, Field, btnGhost, btnPrimary, inputCls, errMsg } from '../ui';
export { Table, Td, Reason, saveBlob, download };
export { useGet, call, Tabs, Loading, Note } from '../early/earlyKit';

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '/api' : 'http://localhost:5000/api');
// A plain client for pages with no staff sign-in (the shop, the learner's private link, the checks). It never sends a staff token and never redirects to the login page.
export const plain = axios.create({ baseURL: API_URL, headers: { 'Content-Type': 'application/json' } });

export const money = (n, cur = 'PKR') => `${cur === 'PKR' ? 'Rs' : cur} ${Number(n || 0).toLocaleString('en-PK')}`;
export const day = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
export const dt = (d) => (d ? new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
export const localInput = (d) => { if (!d) return ''; const x = new Date(d); const p = (n) => String(n).padStart(2, '0'); return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}T${p(x.getHours())}:${p(x.getMinutes())}`; };
export const lines = (s) => String(s || '').split('\n').map((x) => x.trim()).filter(Boolean);

const TONE = { good: 'bg-[#edf5f3] text-[#215a52]', info: 'bg-[#eef2f8] text-[#234c91]', warn: 'bg-[#fbf0ec] text-[#8a4636]', bad: 'bg-[#fff1f2] text-[#9f1239]', none: 'bg-[#f1f2f2] text-[#5b6b7b]' };
const MAP = {
  draft: ['Draft', 'none'], review: ['Waiting for approval', 'warn'], published: ['On sale', 'good'], archived: ['Archived', 'none'],
  planned: ['Planned', 'none'], open: ['Open', 'good'], running: ['Running', 'info'], closed: ['Closed', 'none'], cancelled: ['Cancelled', 'none'],
  pending: ['Waiting for payment', 'warn'], part_paid: ['Part paid', 'info'], paid: ['Paid', 'good'], refunded: ['Refunded', 'none'], part_refunded: ['Part refunded', 'warn'],
  due: ['Due', 'warn'], proof: ['Proof sent', 'info'], active: ['Active', 'good'], paused: ['Paused: payment late', 'warn'], revoked: ['Access ended', 'bad'], expired: ['Expired', 'none'],
  verified: ['Verified', 'good'], suspended: ['Suspended', 'bad'], approved: ['Approved', 'good'], invoiced: ['Invoiced', 'warn'],
  ready: ['Ready for review', 'info'], held: ['On hold', 'warn'], complete: ['Complete', 'good'], none: ['In progress', 'none'],
  submitted: ['Waiting for review', 'warn'], returned: ['Returned', 'warn'], accepted: ['Accepted', 'good'],
  valid: ['Valid', 'good'], visible: ['Shown', 'good'], hidden: ['Hidden', 'none'], booked: ['Booked', 'info'], attended: ['Attended', 'good'], missed: ['Missed', 'bad'],
  comp: ['Written grant', 'info'], sponsor: ['Sponsor', 'info'], free: ['Free course', 'good'], payment: ['Payment', 'good'],
  done: ['Done', 'good'], locked: ['Locked', 'none'], inprogress: ['In progress', 'info'],
};
export const TBadge = ({ s, tone }) => { const m = MAP[s] || [s, 'none']; return <span className={`inline-block whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-semibold ${TONE[tone || m[1]]}`}>{m[0]}</span>; };
export const KIND = { video: 'Video', reading: 'Reading', check: 'Check questions', assignment: 'Hand-in work' };
export const PAY_METHODS = [['bank', 'Bank transfer'], ['easypaisa', 'Easypaisa'], ['jazzcash', 'JazzCash'], ['cash', 'Cash at the office'], ['card', 'Card'], ['other', 'Other']];

// A quick text prompt inside a dialog (new key shown once, etc.)
export function ShowOnce({ title, text, secret, onClose }) {
  const [copied, setCopied] = useState(false);
  return (
    <Modal title={title} onClose={onClose}>
      <div className="grid gap-3">
        <p className="text-sm text-[#3b4a5c]">{text}</p>
        <div className="break-all rounded-lg border border-[#e3e7e7] bg-[#f7f6f2] p-3 font-mono text-xs text-[#1b2837]" data-testid="shown-once">{secret}</div>
        <div className="flex justify-end gap-2"><button className={btnGhost} onClick={async () => { try { await navigator.clipboard.writeText(secret); setCopied(true); } catch (e) { setCopied(false); } }}>{copied ? 'Copied' : 'Copy'}</button><button className={btnPrimary} onClick={onClose}>I have saved it</button></div>
      </div>
    </Modal>
  );
}

// A small form dialog: fields are declared, values come back as an object.
export function AskForm({ title, intro, fields, confirm = 'Save', onClose, onDone, initial = {}, wide, extra }) {
  const [v, setV] = useState(() => Object.fromEntries(fields.map((f) => [f.k, initial[f.k] ?? f.def ?? ''])));
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const go = async (e) => { e.preventDefault(); setBusy(true); setErr(''); try { await onDone(v); } catch (x) { setErr(errMsg(x, 'That did not work.')); setBusy(false); } };
  return (
    <Modal title={title} onClose={onClose} wide={wide}>
      <form onSubmit={go} className="grid gap-3 sm:grid-cols-2">
        {intro && <p className="text-sm text-[#5b6b7b] sm:col-span-2">{intro}</p>}
        {fields.map((f) => (
          <div key={f.k} className={f.full || f.type === 'textarea' ? 'sm:col-span-2' : ''}>
            <Field label={f.label} hint={f.hint}>
              {f.type === 'textarea' ? <textarea className={inputCls} rows={f.rows || 3} value={v[f.k]} onChange={(e) => setV({ ...v, [f.k]: e.target.value })} required={f.required} maxLength={f.max} />
                : f.type === 'select' ? <select className={inputCls} value={v[f.k]} onChange={(e) => setV({ ...v, [f.k]: e.target.value })} required={f.required}>{f.options.map(([a, b]) => <option key={a} value={a}>{b}</option>)}</select>
                  : f.type === 'check' ? <span className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!v[f.k]} onChange={(e) => setV({ ...v, [f.k]: e.target.checked })} /> {f.text}</span>
                    : <input className={inputCls} type={f.type || 'text'} value={v[f.k]} onChange={(e) => setV({ ...v, [f.k]: e.target.value })} required={f.required} min={f.min} max={f.max} step={f.step} placeholder={f.ph} />}
            </Field>
          </div>
        ))}
        {extra}
        {err && <p role="alert" className="text-sm text-[#9f1239] sm:col-span-2">{err}</p>}
        <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" className={btnGhost} onClick={onClose}>Not now</button><button className={btnPrimary} disabled={busy}>{busy ? 'Working…' : confirm}</button></div>
      </form>
    </Modal>
  );
}
