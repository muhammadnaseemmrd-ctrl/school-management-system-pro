import React, { useState } from 'react';
import { Plus, Download } from 'lucide-react';
import apiClient from '../../utils/apiClient';
import { Card, Modal, Field, Pill, EmptyState, btnPrimary, btnGhost, inputCls } from '../ui';
import { call, useGet, Loading, Note, Tabs, when, day, StaffSelect, COURSE_WORD } from './careKit';

const STATE = { valid: ['Active', 'Current'], expiring: ['Pending', 'Ends soon'], expired: ['Suspended', 'Expired'], missing: ['None', 'None'] };

function Training({ caps }) {
  const g = useGet('/care/training'); const staff = useGet('/care/staff'); const [f, setF] = useState(null); const d = g.data; const can = caps.work || caps.dsl;
  return (
    <div className="grid gap-3">
      {d && d.safeguardingGaps > 0 && can && <Note tone="warn">{d.safeguardingGaps} teachers have no current safeguarding training. They cannot join a confidential case until they do.</Note>}
      {can && <div className="flex justify-end"><button className={btnPrimary} onClick={() => setF({ staffId: '', course: 'safeguarding', completedOn: new Date().toLocaleDateString('en-CA'), expiresOn: '' })}><Plus className="h-4 w-4" />Record training</button></div>}
      <Loading g={g}>{d && (d.staff.length === 0 ? <EmptyState title="No staff" text="Staff training appears here." /> : (
        <div className="overflow-x-auto rounded-xl border border-[#e3e7e7] bg-white"><table className="w-full text-start text-sm"><caption className="sr-only">Staff training</caption><thead className="bg-[#f7f6f2] text-xs text-[#3b4a5c]"><tr><th scope="col" className="p-2 text-start">Name</th>{d.courses.map((c) => <th key={c} scope="col" className="p-2 text-start">{COURSE_WORD[c]}</th>)}</tr></thead>
          <tbody>{d.staff.map((r) => <tr key={r.staffId} className="border-t border-[#eef0f0]"><th scope="row" className="p-2 text-start font-medium">{r.name}</th>{d.courses.map((c) => { const x = r.courses[c]; return <td key={c} className="p-2"><Pill value={STATE[x.state][0]}>{x.state === 'missing' ? 'None' : `${STATE[x.state][1]} · ${day(x.expiresOn)}`}</Pill></td>; })}</tr>)}</tbody></table></div>))}</Loading>
      {f && <Modal title="Record training" onClose={() => setF(null)}><div className="grid gap-3"><StaffSelect staff={staff.data?.staff} value={f.staffId} onChange={(v) => setF({ ...f, staffId: v })} label="Who" empty="Choose…" /><Field label="Course"><select className={inputCls} value={f.course} onChange={(e) => setF({ ...f, course: e.target.value })}>{Object.entries(COURSE_WORD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <div className="grid grid-cols-2 gap-3"><Field label="Completed"><input type="date" className={inputCls} value={f.completedOn} onChange={(e) => setF({ ...f, completedOn: e.target.value })} /></Field><Field label="Expires" hint="Empty = twelve months"><input type="date" className={inputCls} value={f.expiresOn} onChange={(e) => setF({ ...f, expiresOn: e.target.value })} /></Field></div>
        <div className="flex justify-end gap-2"><button className={btnGhost} onClick={() => setF(null)}>Cancel</button><button className={btnPrimary} disabled={!f.staffId} onClick={() => call(() => apiClient.post('/care/training', { ...f, expiresOn: f.expiresOn || undefined }), 'Recorded', async () => { setF(null); await g.reload(); })}>Save</button></div></div></Modal>}
    </div>
  );
}

function Access({ caps }) {
  const mine = useGet('/care/access-requests/mine'); const pend = useGet(caps.dsl ? '/care/access-requests' : '/care/access-requests/mine', caps.dsl ? { status: 'Pending' } : {}); const log = useGet(caps.dsl ? '/care/access-log' : '/care/access-requests/mine', caps.dsl ? { limit: 30 } : {});
  const [f, setF] = useState({ number: '', reason: '', minutes: 30 });
  const decide = (a, approve) => call(() => apiClient.post(`/care/access-requests/${a._id}/decide`, { approve }), approve ? 'Approved' : 'Not approved', async () => { await pend.reload(); await mine.reload(); });
  return (
    <div className="grid gap-4">
      <Card><h4 className="text-sm font-bold">Emergency access to a confidential case</h4><p className="mb-2 text-xs text-[#5b6b7b]">Only for when a child may be at risk and you are not on the case. A different safeguarding lead must approve it. It lasts a short time, is read-only, and is recorded.</p>
        <div className="flex flex-wrap items-end gap-2"><Field label="Case number"><input className={`${inputCls} w-36`} placeholder="CC-2026-0001" value={f.number} onChange={(e) => setF({ ...f, number: e.target.value })} /></Field><div className="min-w-[220px] flex-1"><Field label="Why do you need it?" hint="At least 15 characters."><input dir="auto" className={inputCls} maxLength={500} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field></div><Field label="Minutes"><input type="number" min="5" max="60" className={`${inputCls} w-20`} value={f.minutes} onChange={(e) => setF({ ...f, minutes: Number(e.target.value) })} /></Field>
          <button className={btnPrimary} disabled={!f.number.trim() || f.reason.trim().length < 15} onClick={() => call(() => apiClient.post('/care/access-request', f), (r) => (r.data.approved ? 'Opened — you were the only lead, so this is recorded' : 'Sent to the safeguarding leads'), async () => { setF({ number: '', reason: '', minutes: 30 }); await mine.reload(); await pend.reload(); })}>Ask</button></div></Card>
      <Card><h4 className="mb-2 text-sm font-bold">My requests</h4><Loading g={mine}>{(mine.data?.access || []).length === 0 ? <p className="text-sm text-[#5b6b7b]">None.</p> : <ul className="grid gap-1.5 text-sm">{mine.data.access.map((a) => <li key={a._id} className="flex flex-wrap items-center gap-2"><b>{a.caseNumber}</b><Pill value={a.status === 'Approved' ? 'Active' : a.status === 'Pending' ? 'Pending' : 'None'}>{a.status}</Pill><span className="text-xs text-[#5b6b7b]">{when(a.createdAt)}{a.validTo ? ` · until ${when(a.validTo)}` : ''}</span></li>)}</ul>}</Loading></Card>
      {caps.dsl && <>
        <Card><h4 className="mb-2 text-sm font-bold">Waiting for a decision</h4><Loading g={pend}>{(pend.data?.access || []).length === 0 ? <p className="text-sm text-[#5b6b7b]">Nothing waiting.</p> : <ul className="grid gap-2">{pend.data.access.map((a) => <li key={a._id} className="rounded-xl border border-[#e3e7e7] p-3 text-sm"><div><b>{a.requestedByName}</b> wants to read <b>{a.caseNumber}</b> for {a.minutes} minutes</div><p dir="auto" className="text-[#3b4a5c]">{a.reason}</p><div className="mt-2 flex gap-2"><button className={btnPrimary} onClick={() => decide(a, true)}>Approve</button><button className={btnGhost} onClick={() => decide(a, false)}>Do not approve</button></div></li>)}</ul>}</Loading></Card>
        <Card><h4 className="mb-2 text-sm font-bold">Who opened confidential records</h4><Loading g={log}>{(log.data?.log || []).length === 0 ? <p className="text-sm text-[#5b6b7b]">No reads recorded.</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><caption className="sr-only">Access log</caption><thead className="text-xs text-[#5b6b7b]"><tr><th scope="col" className="p-1 text-start">When</th><th scope="col" className="p-1 text-start">Who</th><th scope="col" className="p-1 text-start">Record</th><th scope="col" className="p-1 text-start">Right used</th></tr></thead><tbody>{log.data.log.map((r) => <tr key={r._id} className="border-t border-[#eef0f0]"><td className="p-1">{when(r.at)}</td><td className="p-1">{r.actorName} ({r.actorRole})</td><td className="p-1">{r.entity}</td><td className="p-1">{r.via === 'break-glass' ? <Pill value="Suspended">emergency</Pill> : r.via}</td></tr>)}</tbody></table></div>}</Loading></Card></>}
    </div>
  );
}

function Privacy() {
  const g = useGet('/care/privacy', { status: 'open', limit: 50 }); const [no, setNo] = useState(null);
  const act = (r, action, response) => call(() => apiClient.post(`/care/privacy/${r._id}/decide`, { action, response }), action === 'review' ? 'In review' : 'Answered', async () => { setNo(null); await g.reload(); });
  const exportIt = async (r) => { try { const x = await apiClient.get(`/care/privacy/${r._id}/export`); const url = URL.createObjectURL(new Blob([JSON.stringify(x.data, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = `${r.number}.json`; a.click(); URL.revokeObjectURL(url); } catch { /* the toast is shown by the caller */ } };
  const rows = g.data?.requests || [];
  return (
    <Loading g={g}>{rows.length === 0 ? <EmptyState title="No open requests" text="Families and students can ask what the school holds, or ask for changes." /> : <ul className="grid gap-2" aria-label="Privacy requests">{rows.map((r) => { const late = new Date(r.dueAt) < new Date(); return <li key={r._id} className="rounded-xl border border-[#e3e7e7] bg-white p-3 text-sm"><div className="flex flex-wrap items-center gap-2"><b>{r.number}</b><Pill value="Approved">{r.kind}</Pill><Pill value={late ? 'Suspended' : 'Pending'}>{late ? 'Overdue' : r.status} · due {day(r.dueAt)}</Pill><span className="text-xs text-[#5b6b7b]">{r.studentName} · from {r.requesterName} ({r.requesterRole})</span></div>
      {r.detail && <p dir="auto" className="mt-1 text-[#3b4a5c]">{r.detail}</p>}
      <div className="mt-2 flex flex-wrap gap-2">{r.status === 'Open' && <button className={btnGhost} onClick={() => act(r, 'review')}>Start review</button>}{r.kind === 'access' && <button className={btnGhost} onClick={() => exportIt(r)}><Download className="h-4 w-4" />Preview export</button>}<button className={btnPrimary} onClick={() => setNo({ r, action: 'fulfil', text: '' })}>Answer</button><button className={btnGhost} onClick={() => setNo({ r, action: 'refuse', text: '' })}>Refuse</button></div></li>; })}</ul>}
      {no && <Modal title={`${no.action === 'fulfil' ? 'Answer' : 'Refuse'} ${no.r.number}`} onClose={() => setNo(null)}><div className="grid gap-3">{no.r.kind === 'erasure' && no.action === 'fulfil' && <Note>This removes goals, career notes and past appointments. Health plans, medicine logs and safeguarding records are kept under a legal hold, and the answer says so.</Note>}<Field label={no.action === 'refuse' ? 'Why?' : 'Message to the requester'} hint={no.action === 'refuse' ? 'At least 10 characters.' : ''}><textarea dir="auto" className={`${inputCls} min-h-[80px]`} maxLength={800} value={no.text} onChange={(e) => setNo({ ...no, text: e.target.value })} /></Field><div className="flex justify-end gap-2"><button className={btnGhost} onClick={() => setNo(null)}>Cancel</button><button className={btnPrimary} disabled={no.action === 'refuse' && no.text.trim().length < 10} onClick={() => act(no.r, no.action, no.text)}>Send</button></div></div></Modal>}
    </Loading>
  );
}

function Settings() {
  const g = useGet('/care/settings'); const [f, setF] = useState(null); const s = f || g.data?.settings;
  const num = (k, v) => setF({ ...(f || g.data.settings), [k]: Number(v) });
  return (
    <Loading g={g}>{s && <Card><div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Field label="Hours before a case with no lead is escalated"><input type="number" min="1" max="168" className={inputCls} value={s.escalateHours} onChange={(e) => num('escalateHours', e.target.value)} /></Field>
      <Field label="Hours before an unseen concern is escalated"><input type="number" min="1" max="168" className={inputCls} value={s.reportTriageHours} onChange={(e) => num('reportTriageHours', e.target.value)} /></Field>
      <Field label="Days to answer a privacy request"><input type="number" min="7" max="90" className={inputCls} value={s.privacyDays} onChange={(e) => num('privacyDays', e.target.value)} /></Field>
      <Field label="Anonymous concerns per person per day"><input type="number" min="1" max="20" className={inputCls} value={s.anonLimitPerDay} onChange={(e) => num('anonLimitPerDay', e.target.value)} /></Field>
      <Field label="Months a training record lasts"><input type="number" min="3" max="36" className={inputCls} value={s.trainingMonths} onChange={(e) => num('trainingMonths', e.target.value)} /></Field>
      <Field label="Minutes of emergency access"><input type="number" min="5" max="60" className={inputCls} value={s.breakGlassMinutes} onChange={(e) => num('breakGlassMinutes', e.target.value)} /></Field>
      <Field label="Days until an adjustment is reviewed"><input type="number" min="30" max="365" className={inputCls} value={s.accommodationReviewDays} onChange={(e) => num('accommodationReviewDays', e.target.value)} /></Field>
      {['watch', 'support', 'intensive'].map((l) => <Field key={l} label={`Days between reviews: ${l}`}><input type="number" min="1" max="120" className={inputCls} value={s.reviewDays[l]} onChange={(e) => setF({ ...(f || g.data.settings), reviewDays: { ...(f || g.data.settings).reviewDays, [l]: Number(e.target.value) } })} /></Field>)}
    </div><div className="mt-3 flex justify-end"><button className={btnPrimary} disabled={!f} onClick={() => call(() => apiClient.put('/care/settings', f), 'Saved', async () => { setF(null); await g.reload(); })}>Save</button></div></Card>}</Loading>
  );
}

export default function CareAdmin({ caps, isAdmin }) {
  const [tab, setTab] = useState('training');
  const items = [['training', 'Training'], ['access', 'Emergency access'], ...(caps.privacy ? [['privacy', 'Privacy requests']] : []), ...(isAdmin ? [['settings', 'Settings']] : [])];
  return (
    <div className="grid gap-3"><Tabs label="Staff and access" value={tab} onChange={setTab} items={items} />
      {tab === 'training' && <Training caps={caps} />}{tab === 'access' && <Access caps={caps} />}{tab === 'privacy' && caps.privacy && <Privacy />}{tab === 'settings' && isAdmin && <Settings />}</div>
  );
}
