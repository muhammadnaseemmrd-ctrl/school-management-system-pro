import React, { useState } from 'react';
import apiClient from '../../utils/apiClient';
import { Card, Modal, Field, EmptyState, btnPrimary, btnGhost, inputCls, errMsg } from '../ui';
import { call, useGet, Loading, Note, Tabs } from '../early/earlyKit';
import { Badge, Table, Td, Reason, KINDS, when } from './kit';

const who = (x) => (x.sole ? `${x.decidedByName} (sole administrator)` : x.decidedByName);

export function GradeChanges({ admin, soleAdmin }) {
  const [st, setSt] = useState('pending'); const g = useGet('/registrar/grade-changes', { status: st || undefined }); const [no, setNo] = useState(null);
  return (
    <div className="space-y-3">
      <div className="w-48"><Field label="Show"><select className={inputCls} value={st} onChange={(e) => setSt(e.target.value)}><option value="pending">Waiting</option><option value="approved">Approved</option><option value="rejected">Turned down</option><option value="">All</option></select></Field></div>
      {admin && soleAdmin && <Note>Your school has one administrator, so you can approve changes you asked for yourself. The record says so.</Note>}
      <Loading g={g}>{g.data && (g.data.changes.length === 0 ? <Card><EmptyState title="Nothing here" text="Changes to published grades appear here. Each one is signed when approved, and the old grade stays on the request." /></Card> : (
        <Table label="Grade changes" head={['Student and course', 'Change', 'Why', 'Asked by', 'Status', '']} min={720}>
          {g.data.changes.map((c) => <tr key={c._id}><Td><span className="font-medium">{c.studentName}</span><div className="text-xs text-[#5b6b7b]">{c.courseCode}{c.source === 'appeal' ? ' · from an appeal' : ''}</div></Td><Td><span className="font-semibold">{c.fromGrade} → {c.toGrade}</span></Td><Td className="max-w-[240px] text-xs">{c.reason}</Td><Td className="text-xs">{c.requestedByName}<div className="text-[#5b6b7b]">{when(c.createdAt)}</div></Td>
            <Td><Badge s={c.status} />{c.decidedByName && <div className="mt-1 text-xs text-[#5b6b7b]">{who(c)}{c.signed ? ' · signed' : ''}{c.decisionNote ? ` · ${c.decisionNote}` : ''}</div>}</Td>
            <Td>{admin && c.status === 'pending' && <div className="flex gap-1"><button className={`${btnPrimary} !px-2 !py-1 !text-xs`} aria-label={`Approve the ${c.courseCode} change for ${c.studentName}`} onClick={() => call(() => apiClient.post(`/registrar/grade-changes/${c._id}/decide`, { approve: true }), 'Approved and signed', g.reload)}>Approve</button><button className={`${btnGhost} !px-2 !py-1 !text-xs`} aria-label={`Turn down the ${c.courseCode} change for ${c.studentName}`} onClick={() => setNo(c)}>Turn down</button></div>}</Td></tr>)}
        </Table>
      ))}</Loading>
      {no && <Reason title="Turn down this change" confirm="Turn it down" min={3} label="Reason" onClose={() => setNo(null)} onDone={async (note) => { await apiClient.post(`/registrar/grade-changes/${no._id}/decide`, { approve: false, note }); setNo(null); g.reload(); }} />}
    </div>
  );
}

// the registrar's side of an appeal
function AppealCard({ a, admin, onChanged }) {
  const [dec, setDec] = useState(null); const [note, setNote] = useState(false);
  return (
    <Card className="!p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><span className="font-mono text-xs">{a.number}</span> <span className="font-semibold text-[#1b2837]">{a.studentName}</span> <span className="text-sm text-[#5b6b7b]">· {a.courseCode} · grade {a.gradeAtFiling}</span></div><Badge s={a.status} /></div>
      <p className="mt-2 text-sm text-[#3b4a5c]">“{a.reason}”</p>
      {a.instructorNote && <p className="mt-2 rounded-lg bg-[#f7f6f2] p-2 text-sm"><span className="font-semibold">Instructor: </span>{a.instructorNote}</p>}
      {a.decision && <p className="mt-2 rounded-lg bg-[#f7f6f2] p-2 text-sm"><span className="font-semibold">Decision by {a.decision.byName}{a.decision.toGrade ? `, new grade ${a.decision.toGrade}` : ''}{a.decision.signed ? ' (signed)' : ''}: </span>{a.decision.note}</p>}
      <details className="mt-2"><summary className="cursor-pointer text-xs font-semibold text-[#2a5cac]">History</summary><ul className="mt-1 text-xs text-[#5b6b7b]">{a.events.map((e, i) => <li key={i}>{when(e.at)} · {e.byName} · {e.what}</li>)}</ul></details>
      <div className="mt-3 flex flex-wrap gap-2">
        {['submitted', 'under_review'].includes(a.status) && <button className={`${btnGhost} !px-3 !py-1.5 !text-xs`} onClick={() => setNote(true)} aria-label={`Add an instructor note to ${a.number}`}>{admin ? 'Add a note for the instructor' : 'Add how the grade was decided'}</button>}
        {admin && a.status === 'submitted' && <button className={`${btnGhost} !px-3 !py-1.5 !text-xs`} onClick={() => call(() => apiClient.post(`/registrar/appeals/${a._id}/assign`, {}), 'Taken for review', onChanged)}>Take for review</button>}
        {admin && ['submitted', 'under_review'].includes(a.status) && <button className={`${btnPrimary} !px-3 !py-1.5 !text-xs`} onClick={() => setDec(a)} aria-label={`Decide appeal ${a.number}`}>Decide</button>}
      </div>
      {dec && <Modal title={`Decide ${a.number}`} onClose={() => setDec(null)}><DecideForm a={a} onDone={() => { setDec(null); onChanged(); }} /></Modal>}
      {note && <NoteForm a={a} onClose={() => setNote(false)} onDone={() => { setNote(false); onChanged(); }} />}
    </Card>
  );
}
function DecideForm({ a, onDone }) {
  const [o, setO] = useState('reject'); const [to, setTo] = useState(''); const [n, setN] = useState(''); const [err, setErr] = useState(''); const sc = useGet('/registrar/settings');
  const go = async (e) => { e.preventDefault(); setErr(''); try { await apiClient.post(`/registrar/appeals/${a._id}/decide`, { outcome: o, note: n, ...(o === 'uphold' ? { toGrade: to } : {}) }); onDone(); } catch (x) { setErr(errMsg(x, 'Could not save the decision.')); } };
  return (
    <form onSubmit={go} className="grid gap-3">
      <Field label="Outcome"><select className={inputCls} value={o} onChange={(e) => setO(e.target.value)}><option value="reject">Keep the grade</option><option value="uphold">Change the grade</option></select></Field>
      {o === 'uphold' && <Field label={`New grade (now ${a.gradeAtFiling})`}><select className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} required><option value="">Choose</option>{(sc.data?.scale || []).filter((g) => g.grade !== a.gradeAtFiling).map((g) => <option key={g.grade}>{g.grade}</option>)}</select></Field>}
      <Field label="Reasons (the student reads this)"><textarea className={inputCls} rows={3} value={n} onChange={(e) => setN(e.target.value)} required minLength={5} /></Field>
      {err && <p role="alert" className="text-sm text-[#9f1239]">{err}</p>}<div className="flex justify-end"><button className={btnPrimary}>Save the decision</button></div>
    </form>
  );
}
function NoteForm({ a, onClose, onDone }) {
  return <Reason title={`Note on ${a.number}`} text="Explain how the grade was decided. The registrar reads this before deciding." confirm="Add the note" danger={false} label="Note" onClose={onClose} onDone={async (note) => { await apiClient.post(`/registrar/appeals/${a._id}/note`, { note }); onDone(); }} />;
}
export function Appeals({ admin }) {
  const [st, setSt] = useState(''); const g = useGet('/registrar/appeals', { status: st || undefined });
  return (
    <div className="space-y-3">
      <div className="w-48"><Field label="Show"><select className={inputCls} value={st} onChange={(e) => setSt(e.target.value)}><option value="">All</option><option value="submitted">Filed</option><option value="under_review">Being reviewed</option><option value="upheld">Upheld</option><option value="rejected">Not upheld</option></select></Field></div>
      <Loading g={g}>{g.data && (g.data.appeals.length === 0 ? <Card><EmptyState title="No appeals" text="Students can appeal a published grade for a set number of days. Appeals appear here." /></Card> : g.data.appeals.map((a) => <AppealCard key={a._id} a={a} admin={admin} onChanged={g.reload} />))}</Loading>
    </div>
  );
}

export function Exceptions({ admin, soleAdmin }) {
  const [st, setSt] = useState('pending'); const g = useGet('/registrar/exceptions', { status: st || undefined }); const [no, setNo] = useState(null);
  return (
    <div className="space-y-3">
      <div className="w-48"><Field label="Show"><select className={inputCls} value={st} onChange={(e) => setSt(e.target.value)}><option value="pending">Waiting</option><option value="approved">Approved</option><option value="rejected">Turned down</option><option value="">All</option></select></Field></div>
      {admin && soleAdmin && <Note>Your school has one administrator, so you can approve requests you made yourself. The record says so.</Note>}
      <Loading g={g}>{g.data && (g.data.exceptions.length === 0 ? <Card><EmptyState title="No exceptions" text="Overloads, waivers, substitutions, extra attempts and catalogue switches are asked for here and signed by a different administrator." /></Card> : (
        <Table label="Exceptions" head={['Student', 'What', 'Why', 'Asked by', 'Status', '']} min={720}>
          {g.data.exceptions.map((x) => <tr key={x._id}><Td className="font-medium">{x.studentName}</Td><Td>{KINDS[x.kind]}<div className="text-xs text-[#5b6b7b]">{[x.courseCode, x.substituteCode && `instead: ${x.substituteCode}`, x.groupKey, x.maxCredits && `${x.maxCredits} credits`].filter(Boolean).join(' · ')}</div></Td><Td className="max-w-[240px] text-xs">{x.reason}</Td><Td className="text-xs">{x.requestedByName}<div className="text-[#5b6b7b]">{when(x.createdAt)}</div></Td>
            <Td><Badge s={x.status} />{x.decidedByName && <div className="mt-1 text-xs text-[#5b6b7b]">{who(x)}{x.signed ? ' · signed' : ''}{x.decisionNote ? ` · ${x.decisionNote}` : ''}</div>}</Td>
            <Td>{x.status === 'pending' && (admin ? <div className="flex gap-1"><button className={`${btnPrimary} !px-2 !py-1 !text-xs`} aria-label={`Approve the request for ${x.studentName}`} onClick={() => call(() => apiClient.post(`/registrar/exceptions/${x._id}/decide`, { approve: true }), 'Approved and signed', g.reload)}>Approve</button><button className={`${btnGhost} !px-2 !py-1 !text-xs`} aria-label={`Turn down the request for ${x.studentName}`} onClick={() => setNo(x)}>Turn down</button></div> : <button className={`${btnGhost} !px-2 !py-1 !text-xs`} onClick={() => call(() => apiClient.post(`/registrar/exceptions/${x._id}/withdraw`, {}), 'Request withdrawn', g.reload)}>Withdraw</button>)}</Td></tr>)}
        </Table>
      ))}</Loading>
      {no && <Reason title="Turn down this request" confirm="Turn it down" min={3} label="Reason" onClose={() => setNo(null)} onDone={async (note) => { await apiClient.post(`/registrar/exceptions/${no._id}/decide`, { approve: false, note }); setNo(null); g.reload(); }} />}
    </div>
  );
}

export function Approvals({ soleAdmin, counts = {} }) {
  const [tab, setTab] = useState('changes');
  return (
    <div className="space-y-3">
      <Tabs label="Approvals" value={tab} onChange={setTab} items={[['changes', 'Grade changes', counts.gradeChanges], ['appeals', 'Appeals', counts.appeals], ['exceptions', 'Exceptions', counts.exceptions]]} />
      {tab === 'changes' && <GradeChanges admin soleAdmin={soleAdmin} />}{tab === 'appeals' && <Appeals admin />}{tab === 'exceptions' && <Exceptions admin soleAdmin={soleAdmin} />}
    </div>
  );
}
