import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import apiClient from '../../utils/apiClient';
import { Card, Modal, Field, Pill, EmptyState, btnPrimary, btnGhost, inputCls } from '../ui';
import { call, useGet, Loading, Note, when, StudentPicker, StaffSelect, CATS } from './careKit';

export const CONCERN_CATS = [['bullying', 'Bullying'], ['safety', 'Someone may be in danger'], ['wellbeing', 'Wellbeing'], ['health', 'Health'], ['other', 'Something else']];
const SOURCE = { student: 'A student', parent: 'A parent', staff: 'A member of staff', anonymous: 'Nobody (anonymous)' };
const TONE = { New: 'Pending', Triaged: 'Approved', Case: 'Active', Dismissed: 'None' };

// A short form to tell the safeguarding leads about a worry. Anyone at the school may use it.
export function RaiseConcern({ onClose, allowAnonymous = false, fixedStudent, hidePicker = false }) {
  const [f, setF] = useState({ category: 'wellbeing', body: '', anonymous: false }); const [st, setSt] = useState(fixedStudent || null); const [code, setCode] = useState(null);
  if (code) return <Modal title="Sent" onClose={onClose}><div className="grid gap-3"><Note tone="ok">{code.message}</Note><div className="rounded-xl border border-[#e3e7e7] bg-[#f7f6f2] p-4 text-center"><div className="text-xs text-[#5b6b7b]">Your code</div><div className="select-all text-2xl font-bold tracking-wider" aria-label="Your receipt code">{code.code}</div></div><div className="flex justify-end"><button className={btnPrimary} onClick={onClose}>Done</button></div></div></Modal>;
  return (
    <Modal wide title="Tell us about a worry" onClose={onClose}>
      <div className="grid gap-3">
        <Note tone="warn">If someone is in danger right now, tell a member of staff straight away. This form is read by the school's safeguarding team.</Note>
        <Field label="What is it about?"><select className={inputCls} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{CONCERN_CATS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        {!fixedStudent && !hidePicker && <StudentPicker label="Who is it about? (optional)" value={st} onPick={setSt} />}
        <Field label="What happened?" hint="At least 10 characters."><textarea dir="auto" className={`${inputCls} min-h-[110px]`} maxLength={2000} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
        {allowAnonymous && <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={f.anonymous} onChange={(e) => setF({ ...f, anonymous: e.target.checked })} /><span>Do not send my name. You will get a code to see the reply. We cannot tell who you are, so we cannot contact you any other way.</span></label>}
        <div className="flex justify-end gap-2"><button className={btnGhost} onClick={onClose}>Cancel</button><button className={btnPrimary} disabled={f.body.trim().length < 10} onClick={() => call(() => apiClient.post('/care/reports', { ...f, aboutStudentId: st ? st._id : undefined }), null, (r) => setCode(r.data))}>Send</button></div>
      </div>
    </Modal>
  );
}

function ReportView({ id, caps, onClose, onChanged, onCase }) {
  const g = useGet(`/care/reports/${id}`); const staff = useGet('/care/staff'); const [reply, setReply] = useState(''); const [why, setWhy] = useState(''); const [mode, setMode] = useState('');
  const r = g.data?.report; const done = async () => { onChanged(); onClose(); };
  return (
    <Modal wide title="Concern" onClose={onClose}>
      <Loading g={g}>{r && <div className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2"><Pill value={TONE[r.status]}>{r.status}</Pill>{r.urgent && <Pill value="Suspended">Urgent</Pill>}<span className="text-xs text-[#5b6b7b]">From {SOURCE[r.source]}{r.reporterName ? ` (${r.reporterName})` : ''} · {when(r.createdAt)}{r.aboutName ? ` · about ${r.aboutName}` : ''}</span></div>
        <p dir="auto" className="whitespace-pre-wrap break-words rounded-xl bg-[#f7f6f2] p-3 text-sm">{r.body}</p>
        {r.reply && <Note>Reply sent: <span dir="auto">{r.reply}</span></Note>}
        {r.status !== 'Case' && r.status !== 'Dismissed' && <>
          <Field label="Reply to the person who sent this" hint={r.source === 'anonymous' ? 'They will see it with their code. We do not know who they are.' : 'They will be told there is a reply.'}><textarea dir="auto" className={`${inputCls} min-h-[60px]`} maxLength={600} value={reply} onChange={(e) => setReply(e.target.value)} /></Field>
          <div className="flex flex-wrap justify-end gap-2"><button className={btnGhost} disabled={reply.trim().length < 3} onClick={() => call(() => apiClient.post(`/care/reports/${id}/reply`, { text: reply }), 'Reply sent', async () => { setReply(''); await g.reload(); onChanged(); })}>Send reply</button>
            <button className={btnGhost} onClick={() => setMode(mode === 'close' ? '' : 'close')}>Close without a case</button><button className={btnPrimary} onClick={() => onCase(r)}>Turn into a case</button></div>
          {mode === 'close' && <div className="flex items-end gap-2"><div className="flex-1"><Field label="Why is it closed?"><input dir="auto" className={inputCls} maxLength={300} value={why} onChange={(e) => setWhy(e.target.value)} /></Field></div><button className={btnGhost} disabled={why.trim().length < 5} onClick={() => call(() => apiClient.post(`/care/reports/${id}/dismiss`, { reason: why }), 'Closed', done)}>Close</button></div>}</>}
      </div>}</Loading>
    </Modal>
  );
}

export default function CareConcerns({ caps, onOpenCase, onTurnIntoCase }) {
  const [status, setStatus] = useState('open'); const g = useGet('/care/reports', { status: status || undefined, limit: 50 }); const [open, setOpen] = useState(null); const [form, setForm] = useState(false); const rows = g.data?.reports || [];
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-end gap-2"><Field label="Show"><select className={`${inputCls} w-40`} value={status} onChange={(e) => setStatus(e.target.value)}><option value="open">Waiting</option><option value="Case">Became a case</option><option value="Dismissed">Closed</option><option value="">All</option></select></Field><div className="flex-1" /><button className={btnPrimary} onClick={() => setForm(true)}><Plus className="h-4 w-4" />Raise a concern</button></div>
      {!caps.dsl && <Note>You can see wellbeing and health concerns. Bullying and safety concerns go to the safeguarding leads.</Note>}
      <Loading g={g}>{rows.length === 0 ? <EmptyState title="Nothing waiting" text="Concerns from students, parents and staff appear here." /> : <ul className="grid gap-2" aria-label="Concerns">{rows.map((r) => <li key={r._id}><button className="w-full rounded-xl border border-[#e3e7e7] bg-white p-3 text-start hover:bg-[#f7f6f2]" onClick={() => setOpen(r._id)}><div className="flex flex-wrap items-center gap-2"><Pill value={TONE[r.status]}>{r.status}</Pill>{r.urgent && <Pill value="Suspended">Urgent</Pill>}<span className="min-w-0 flex-1 truncate text-sm" dir="auto">{r.body}</span></div><div className="mt-1 text-xs text-[#5b6b7b]">{SOURCE[r.source]}{r.aboutName ? ` · about ${r.aboutName}` : ''} · {when(r.createdAt)}</div></button></li>)}</ul>}</Loading>
      {open && <ReportView id={open} caps={caps} onClose={() => setOpen(null)} onChanged={g.reload} onCase={(r) => { setOpen(null); onTurnIntoCase(r); }} />}
      {form && <RaiseConcern onClose={() => { setForm(false); g.reload(); }} />}
    </div>
  );
}
