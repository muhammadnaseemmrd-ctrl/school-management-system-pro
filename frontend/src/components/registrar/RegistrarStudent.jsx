import React, { useState } from 'react';
import apiClient from '../../utils/apiClient';
import { Card, Modal, Field, EmptyState, btnPrimary, btnGhost, inputCls, errMsg } from '../ui';
import { call, useGet, Loading, Note, Tabs } from '../early/earlyKit';
import { Badge, Table, Td, Reason, KINDS, download, when } from './kit';
import { RecordView } from './RecordView';

function AppealForm({ course, days, onClose, onDone }) {
  const [v, setV] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const go = async (e) => { e.preventDefault(); setBusy(true); setErr(''); try { await apiClient.post('/registrar/me/appeals', { enrollmentId: course.enrollmentId, reason: v }); onDone(); } catch (x) { setErr(errMsg(x, 'Could not file the appeal.')); setBusy(false); } };
  return (
    <Modal title={`Appeal your ${course.code} grade`} onClose={onClose}>
      <form onSubmit={go} className="grid gap-3"><p className="text-sm text-[#5b6b7b]">Your grade is {course.grade}. Say what you think is wrong, in at least 20 characters. The instructor adds how it was decided, then the registrar decides and tells you why.</p>
        <Field label="What you think is wrong"><textarea className={inputCls} rows={4} value={v} onChange={(e) => setV(e.target.value)} required minLength={20} autoFocus /></Field>
        {err && <p role="alert" className="text-sm text-[#9f1239]">{err}</p>}<div className="flex justify-end gap-2"><button type="button" className={btnGhost} onClick={onClose}>Cancel</button><button className={btnPrimary} disabled={busy || v.trim().length < 20}>{busy ? 'Sending…' : 'File the appeal'}</button></div></form>
    </Modal>
  );
}

function Record() {
  const g = useGet('/registrar/me'); const [ap, setAp] = useState(null); const [msg, setMsg] = useState('');
  const d = g.data;
  return (
    <Loading g={g}>{d && (
      <div className="space-y-4">
        {msg && <Note tone="ok">{msg}</Note>}
        {!d.program && <Note>You are not placed in a programme yet. The registrar's office will place you, and your courses and degree audit will appear here.</Note>}
        <RecordView data={d} mine onAppeal={(c) => setAp(c)} />
        {d.gradeChanges.length > 0 && <Card className="!p-4"><h4 className="mb-2 font-semibold text-[#1b2837]">Grade changes on your record</h4><ul className="grid gap-1 text-sm">{d.gradeChanges.map((c, i) => <li key={i}>{c.courseCode}: {c.fromGrade} → {c.toGrade} <span className="text-xs text-[#5b6b7b]">· {when(c.decidedAt)}{c.source === 'appeal' ? ' · after your appeal' : ''}</span></li>)}</ul></Card>}
        {d.appeals.length > 0 && <Card className="!p-4"><h4 className="mb-2 font-semibold text-[#1b2837]">Your appeals</h4><ul className="grid gap-3 text-sm">{d.appeals.map((a) => (
          <li key={a._id} className="rounded-xl border border-[#e3e7e7] p-3"><div className="flex flex-wrap items-center justify-between gap-2"><span><span className="font-mono text-xs">{a.number}</span> {a.courseCode} · grade {a.gradeAtFiling}</span><Badge s={a.status} /></div>
            {a.decision && <p className="mt-1 text-xs text-[#3b4a5c]">{a.decision.toGrade ? `New grade ${a.decision.toGrade}. ` : ''}{a.decision.note}</p>}
            {['submitted', 'under_review'].includes(a.status) && <button className={`${btnGhost} mt-2 !px-2 !py-1 !text-xs`} onClick={() => call(() => apiClient.post(`/registrar/me/appeals/${a._id}/withdraw`, {}), 'Appeal withdrawn', g.reload)} aria-label={`Withdraw appeal ${a.number}`}>Withdraw</button>}</li>))}</ul></Card>}
        {d.exceptions.length > 0 && <Card className="!p-4"><h4 className="mb-2 font-semibold text-[#1b2837]">Requests made for you</h4><ul className="grid gap-1 text-sm">{d.exceptions.map((x) => <li key={x._id} className="flex flex-wrap items-center gap-2"><span>{KINDS[x.kind]}{x.courseCode ? ` · ${x.courseCode}` : ''}</span><Badge s={x.status} /></li>)}</ul></Card>}
        {ap && <AppealForm course={ap} onClose={() => setAp(null)} onDone={() => { setAp(null); setMsg('Your appeal was filed. You will be told when it is decided.'); g.reload(); }} />}
      </div>
    )}</Loading>
  );
}

function Register() {
  const g = useGet('/registrar/me/catalog'); const [drop, setDrop] = useState(null);
  const enroll = (s) => call(() => apiClient.post('/registrar/me/enroll', { sectionId: s._id }), `Registered for ${s.courseCode}`, g.reload);
  const d = g.data;
  return (
    <Loading g={g}>{d && (!d.term || d.sections.length === 0 ? <Card><EmptyState title="Registration is not open" text={d.message || 'No courses are offered in the open term yet.'} /></Card> : (
      <div className="space-y-3">
        <p className="text-sm text-[#5b6b7b]">{d.term.name} · {d.credits.registered} of {d.credits.limit} credits registered{d.term.addDropUntil ? ` · you can add and drop until ${when(d.term.addDropUntil)}` : ''}</p>
        {!d.selfRegistration && <Note>Registration is done by the registrar's office at your school. You can see what is open and why.</Note>}
        <ul className="grid gap-2">{d.sections.map((s) => (
          <li key={s._id} className="rounded-xl border border-[#e3e7e7] bg-white p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><span className="font-mono text-xs">{s.courseCode}</span> <span className="font-medium text-[#1b2837]">{s.courseTitle}</span><div className="text-xs text-[#5b6b7b]">Section {s.section} · {s.credits} credits · {s.teacherName || 'Instructor not decided'}{s.schedule ? ` · ${s.schedule}` : ''} · {s.seatsLeft} seats left</div></div>
            {s.registered ? <div className="flex items-center gap-2"><Badge s="enrolled" /><button className={`${btnGhost} !px-2 !py-1 !text-xs`} onClick={() => setDrop(s)} aria-label={`Drop ${s.courseCode}`}>Drop</button></div> : d.selfRegistration ? <button className={`${s.ok ? btnPrimary : btnGhost} !px-3 !py-1.5 !text-xs`} disabled={!s.ok} onClick={() => enroll(s)} aria-label={`Register for ${s.courseCode} section ${s.section}`}>Register</button> : null}</div>
            {!s.registered && s.reasons.length > 0 && <ul className="mt-1 list-disc ps-5 text-xs text-[#8a4636]">{s.reasons.map((r, i) => <li key={i}>{r.message}</li>)}</ul>}</li>
        ))}</ul>
        {drop && <Reason title={`Drop ${drop.courseCode}`} text="Inside the add and drop period the course disappears from your record." confirm="Drop the course" min={0} label="Reason (optional)" onClose={() => setDrop(null)} onDone={async () => { await apiClient.post(`/registrar/me/enrollments/${drop.enrollmentId}/drop`, {}); setDrop(null); g.reload(); }} />}
      </div>
    ))}</Loading>
  );
}

function Transcripts() {
  const g = useGet('/registrar/me'); const [msg, setMsg] = useState('');
  return (
    <div className="space-y-3">
      <Note>An official transcript is signed by the school and has a check code anyone can use at the public check page. The unofficial copy is for your own use and has no code.</Note>
      <div className="flex flex-wrap gap-2"><button className={btnGhost} onClick={() => download('/registrar/transcripts/live/pdf', 'my-record-unofficial.pdf', setMsg)}>Download an unofficial copy</button><button className={btnPrimary} onClick={() => call(() => apiClient.post('/registrar/me/transcript-request', {}), 'Request sent to the registrar')}>Ask for an official transcript</button></div>
      {msg && <Note tone="warn">{msg}</Note>}
      <Loading g={g}>{g.data && (g.data.transcripts.length === 0 ? <Card><EmptyState title="No official transcripts yet" text="When the registrar issues one, you can download it here." /></Card> : (
        <Table label="Official transcripts" head={['Number', 'Kind', 'Issued', 'Check code', '']} min={560}>
          {g.data.transcripts.map((t) => <tr key={t._id}><Td className="font-mono text-xs">{t.serial}</Td><Td>{t.kind === 'final' ? 'Final' : 'Official'}</Td><Td>{when(t.createdAt)}</Td><Td className="font-mono text-xs">{t.verifyKey}</Td><Td><button className={`${btnGhost} !px-2 !py-1 !text-xs`} onClick={() => download(`/registrar/transcripts/${t._id}/pdf`, `${t.serial}.pdf`, setMsg)} aria-label={`Download transcript ${t.serial}`}>PDF</button></Td></tr>)}
        </Table>
      ))}</Loading>
    </div>
  );
}

export default function RegistrarStudent() {
  const [tab, setTab] = useState('record');
  return (
    <div className="space-y-4">
      <div><h2 className="text-xl font-bold text-[#1b2837]">My academic record</h2><p className="text-sm text-[#5b6b7b]">Your courses, grades, degree progress and transcripts.</p></div>
      <Tabs label="Academic record sections" value={tab} onChange={setTab} items={[['record', 'Record and degree'], ['register', 'Register for courses'], ['transcripts', 'Transcripts']]} />
      {tab === 'record' && <Record />}{tab === 'register' && <Register />}{tab === 'transcripts' && <Transcripts />}
    </div>
  );
}
