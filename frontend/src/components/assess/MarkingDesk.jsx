import React, { useState } from 'react';
import { Plus, AlertTriangle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import apiClient from '../../utils/apiClient';
import { Card, Field, Modal, Pill, btnPrimary, btnGhost, btnDanger, inputCls, errMsg } from '../ui';
import { Bar, Body, Row, Sub, Td, Tbl, useList, StudentPick } from '../attendance/deskKit';
import { call, useGet } from '../timetable/planKit';
import { Rich, KIND_LABEL, STATE_TONE, dt, fromLocalInput } from './assessKit';

const show = (a) => (a === undefined || a === null || a === '' ? <span className="text-[#5b6b7b]">(blank)</span> : typeof a === 'string' ? <Rich text={a} /> : <code className="text-xs">{JSON.stringify(a)}</code>);

function MarkItem({ attemptId, it, onDone }) {
  const [score, setScore] = useState(''); const [comment, setComment] = useState(''); const [crit, setCrit] = useState({}); const [busy, setBusy] = useState(false); const rub = it.rubric;
  const sum = rub ? rub.criteria.reduce((s, c) => s + Number(crit[c.id] ?? 0), 0) : null;
  const go = async () => { setBusy(true); const body = rub && Object.keys(crit).length ? { criteria: rub.criteria.map((c) => ({ id: c.id, points: Number(crit[c.id] ?? c.levels[0].points) })), comment } : { score: Number(score), comment }; const r = await call(() => apiClient.post(`/assess/grading/attempts/${attemptId}/items/${it.ref}/mark`, body), (x) => (x.data.outcome === 'moderation' ? 'Marks differ too much, sent to a third marker' : x.data.outcome === 'waiting second marker' ? 'Saved. A second marker is next.' : 'Mark saved')); setBusy(false); if (r) onDone(); };
  return (
    <div className="rounded-xl border border-[#e3e7e7] p-3">
      <div className="flex items-start justify-between gap-2 text-sm"><div><span className="font-semibold">{it.no}.</span> <Rich text={it.plain} /><Sub>{KIND_LABEL[it.kind]} · out of {it.max}{it.needsReview && it.kind === 'short' ? ' · did not match an accepted answer' : ''}</Sub></div><Pill value={STATE_TONE[it.state] || 'None'}>{it.state}</Pill></div>
      <div className="mt-2 rounded-lg bg-[#f7f6f2] p-2 text-sm"><div className="text-xs font-semibold text-[#5b6b7b]">Student's answer</div>{show(it.answer)}{it.accepted?.length > 0 && <Sub>Accepted: {it.accepted.join(', ')}</Sub>}</div>
      {it.m1 && <div className="mt-2 text-xs text-[#3b4a5c]">First mark: {it.m1.score} ({it.m1.byName}){it.m1.comment ? ` — ${it.m1.comment}` : ''}</div>}
      {it.m2 && <div className="text-xs text-[#3b4a5c]">Second mark: {it.m2.score} ({it.m2.byName}){it.m2.comment ? ` — ${it.m2.comment}` : ''}</div>}
      {it.stage === 'm2' && <div className="mt-1 text-xs text-[#234c91]">Blind second marking: the first mark is hidden from you.</div>}
      {it.final !== undefined && it.final !== null && <div className="mt-1 text-sm font-semibold">Final mark: {it.final} / {it.max}</div>}
      {it.yourTurn && (
        <div className="mt-2 grid gap-2">
          {rub ? rub.criteria.map((c) => <Field key={c.id} label={c.name}><select className={inputCls} value={crit[c.id] ?? ''} onChange={(e) => setCrit({ ...crit, [c.id]: e.target.value })}><option value="">Choose a level</option>{c.levels.map((l) => <option key={l.points} value={l.points}>{l.points} — {l.descriptor || 'level'}</option>)}</select></Field>) : <Field label={`Mark out of ${it.max}`} hint="Steps of 0.25"><input className={`${inputCls} !w-32`} type="number" min="0" max={it.max} step="0.25" value={score} onChange={(e) => setScore(e.target.value)} /></Field>}
          {rub && <div className="text-xs text-[#5b6b7b]">Total so far: {sum} of {rub.criteria.reduce((s, c) => s + Math.max(...c.levels.map((l) => l.points)), 0)}</div>}
          <Field label="Feedback for the student (optional)"><input className={inputCls} value={comment} list={`cb-${it.ref}`} onChange={(e) => setComment(e.target.value)} />{rub && <datalist id={`cb-${it.ref}`}>{(rub.comments || []).map((c) => <option key={c} value={c} />)}</datalist>}</Field>
          <div className="flex justify-end"><button className={btnPrimary} disabled={busy || (!rub && score === '') || (rub && Object.keys(crit).length < rub.criteria.length)} onClick={go}>{it.stage === 'mod' ? 'Give moderated mark' : it.stage === 'm2' ? 'Give second mark' : 'Save mark'}</button></div>
        </div>)}
      {!it.yourTurn && !['done'].includes(it.stage) && <div className="mt-2 text-xs text-[#5b6b7b]">{it.stage === 'm2' ? 'A different person gives the second mark.' : it.stage === 'mod' ? 'A third person, who has not marked this, moderates it.' : ''}</div>}
    </div>
  );
}

function Grader({ attemptId, onClose, onChanged }) {
  const g = useGet(`/assess/grading/attempts/${attemptId}`); const d = g.data;
  const incident = async () => { const note = window.prompt('What happened?'); if (!note || note.trim().length < 3) return; const sev = window.confirm('Is this serious? OK for serious, Cancel for a note or warning.') ? 'serious' : 'warning'; const r = await call(() => apiClient.post(`/assess/grading/attempts/${attemptId}/incidents`, { note: note.trim(), severity: sev }), 'Incident recorded'); if (r) g.reload(); };
  return (
    <Modal title={d ? `Marking: ${d.title}` : 'Marking'} onClose={onClose} wide>
      {!d ? <div className="skeleton h-40" /> : (
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center gap-3 text-sm"><span className="font-semibold">{d.student.name}{d.student.admissionNumber ? ` (${d.student.admissionNumber})` : ''}</span><Pill value={STATE_TONE[d.status]}>{d.status}</Pill><span>{d.total} / {d.max}</span>{d.late && <span className="text-[#8a4636]">Handed in late because of the connection</span>}{d.focus.left > 0 && <span className="text-[#5b6b7b]">Left the window {d.focus.left}×</span>}<span className="grow" /><button className={btnGhost} onClick={incident}><AlertTriangle className="h-4 w-4" /> Note an incident</button></div>
          {d.incidents.length > 0 && <div className="rounded-lg bg-[#fbf0ec] p-2 text-sm text-[#8a4636]">{d.incidents.map((i, n) => <div key={n}>{i.severity}: {i.note} ({i.byName})</div>)}</div>}
          {d.items.map((it) => <MarkItem key={it.ref} attemptId={attemptId} it={it} onDone={() => { g.reload(); onChanged(); }} />)}
        </div>)}
    </Modal>
  );
}

export function MarkingQueue() {
  const l = useList('/assess/grading/queue', 'rows', {}); const [open, setOpen] = useState(null);
  return (
    <Card className="!p-0 overflow-hidden">
      <Bar><span className="text-sm font-semibold">Written answers waiting for a marker</span></Bar>
      <Body l={l} cols={4} empty="Nothing is waiting to be marked.">
        <Tbl head={['Candidate', 'Quiz', 'Waiting', '']}>{l.rows.map((r) => <Row key={r.attemptId}><Td>{r.candidate}<Sub>{dt(r.submittedAt)}</Sub></Td><Td>{r.title}{r.dual && <Sub>Two markers</Sub>}</Td><Td>{r.waiting} answers<Sub>{r.dual ? `first ${r.stages.m1} · second ${r.stages.m2} · third ${r.stages.mod}` : ''}</Sub></Td><Td>{r.yourTurn > 0 ? <button className={btnPrimary} onClick={() => setOpen(r.attemptId)}>Mark ({r.yourTurn})</button> : <button className={btnGhost} onClick={() => setOpen(r.attemptId)}>Open</button>}</Td></Row>)}</Tbl>
      </Body>
      {open && <Grader attemptId={open} onClose={() => setOpen(null)} onChanged={l.reload} />}
    </Card>
  );
}

function AppealModal({ a, onClose, onDone }) {
  const g = useGet(`/assess/grading/attempts/${a.attemptId}`); const [decision, setDecision] = useState('uphold'); const [note, setNote] = useState(''); const [ch, setCh] = useState({});
  const go = async () => { const changes = decision === 'revise' ? Object.entries(ch).filter(([, v]) => v !== '').map(([ref, v]) => ({ ref, score: Number(v) })) : undefined; const r = await call(() => apiClient.post(`/assess/appeals/${a._id}/decide`, { decision, note, changes }), 'Decision saved'); if (r) { onDone(); onClose(); } };
  return (
    <Modal title="Result appeal" onClose={onClose} wide>
      <div className="grid gap-3 text-sm">
        <div className="rounded-lg bg-[#f7f6f2] p-3"><div className="text-xs font-semibold text-[#5b6b7b]">{a.studentName} · {a.title}</div>{a.reason}</div>
        <div className="text-xs text-[#5b6b7b]">Marked by {a.markers.join(', ') || 'the system'}. A reviewer cannot be someone who marked this work.</div>
        {g.error ? <div className="rounded-lg bg-[#fbf0ec] p-2 text-[#8a4636]">{g.error}. You may be one of the markers, or not teach this class.</div> : g.data && g.data.items.map((it) => <div key={it.ref} className="flex items-center gap-2 rounded-lg border border-[#e3e7e7] p-2"><div className="grow"><Rich text={it.plain} /><Sub>Answer: {typeof it.answer === 'string' ? it.answer : JSON.stringify(it.answer ?? '')} · now {it.final ?? it.auto ?? 0} / {it.max}{a.refs?.includes(it.ref) ? ' · student asked about this' : ''}</Sub></div>{decision === 'revise' && <input aria-label="New mark" type="number" min="0" max={it.max} step="0.25" className={`${inputCls} !w-24`} placeholder="New mark" value={ch[it.ref] ?? ''} onChange={(e) => setCh({ ...ch, [it.ref]: e.target.value })} />}</div>)}
        <Field label="Decision"><select className={inputCls} value={decision} onChange={(e) => setDecision(e.target.value)}><option value="uphold">The original marks stand</option><option value="revise">Change some marks</option><option value="reject">Reject the appeal</option></select></Field>
        <Field label="Explain the decision (the student sees this)"><textarea className={inputCls} rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <div className="flex justify-end"><button className={btnPrimary} onClick={go}>Save decision</button></div>
      </div>
    </Modal>
  );
}
export function Appeals() {
  const l = useList('/assess/appeals', 'appeals', {}); const [open, setOpen] = useState(null);
  return (
    <Card className="!p-0 overflow-hidden">
      <Bar><span className="text-sm font-semibold">Result appeals</span></Bar>
      <Body l={l} cols={4} empty="No appeals.">
        <Tbl head={['Student', 'Quiz', 'Status', '']}>{l.rows.map((a) => <Row key={a._id}><Td>{a.studentName}<Sub>{dt(a.createdAt)}</Sub></Td><Td>{a.title}</Td><Td><Pill value={STATE_TONE[a.status]}>{a.status}</Pill>{a.status === 'Revised' && <Sub>{a.before} → {a.after}</Sub>}</Td><Td>{['Requested', 'InReview'].includes(a.status) ? <button className={btnPrimary} onClick={() => setOpen(a)}>Review</button> : <Sub>{a.reviewerName}</Sub>}</Td></Row>)}</Tbl>
      </Body>
      {open && <AppealModal a={open} onClose={() => setOpen(null)} onDone={l.reload} />}
    </Card>
  );
}

function AccessForm({ onClose, onDone }) {
  const quizzes = useGet('/assess/quizzes'); const [f, setF] = useState({ studentId: '', assessmentId: '', mode: 'access', extraTimePct: 0, extraAttempts: 0, largeText: false, readAloud: false, separateSitting: false, reason: '', opensAt: '', closesAt: '', validTo: '' });
  const go = async () => { const r = await call(() => apiClient.post('/assess/access', { ...f, opensAt: fromLocalInput(f.opensAt), closesAt: fromLocalInput(f.closesAt), validTo: f.validTo || undefined, assessmentId: f.assessmentId || undefined }), 'Saved'); if (r) { onDone(); onClose(); } };
  return (
    <Modal title="Exam arrangement or make-up" onClose={onClose} wide>
      <div className="grid gap-3">
        <StudentPick value={f.studentId} onChange={(v) => setF({ ...f, studentId: v })} />
        <Field label="What is it for?"><select className={inputCls} value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value })}><option value="access">Support while writing (extra time, large text, read aloud)</option><option value="makeup">Make-up for a missed quiz</option></select></Field>
        <Field label={f.mode === 'makeup' ? 'Which quiz?' : 'Only for one quiz? (leave empty for all)'}><select className={inputCls} value={f.assessmentId} onChange={(e) => setF({ ...f, assessmentId: e.target.value })}><option value="">{f.mode === 'makeup' ? 'Choose a quiz' : 'All quizzes'}</option>{(quizzes.data?.assessments || []).filter((a) => ['Published', 'Closed'].includes(a.status)).map((a) => <option key={a._id} value={a._id}>{a.title}</option>)}</select></Field>
        {f.mode === 'access' ? <div className="grid gap-3 sm:grid-cols-3"><Field label="Extra time %"><input className={inputCls} type="number" min="0" max="100" value={f.extraTimePct} onChange={(e) => setF({ ...f, extraTimePct: e.target.value })} /></Field><Field label="Valid until"><input className={inputCls} type="date" value={f.validTo} onChange={(e) => setF({ ...f, validTo: e.target.value })} /></Field><div className="flex flex-col justify-end gap-1 text-sm">{[['largeText', 'Large text'], ['readAloud', 'Read aloud'], ['separateSitting', 'Separate room']].map(([k, v]) => <label key={k} className="flex items-center gap-1.5"><input type="checkbox" checked={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.checked })} /> {v}</label>)}</div></div>
          : <div className="grid gap-3 sm:grid-cols-2"><Field label="Window opens"><input className={inputCls} type="datetime-local" value={f.opensAt} onChange={(e) => setF({ ...f, opensAt: e.target.value })} /></Field><Field label="Window closes"><input className={inputCls} type="datetime-local" value={f.closesAt} onChange={(e) => setF({ ...f, closesAt: e.target.value })} /></Field></div>}
        <Field label="Reason" hint="Only administrators and you can see this. It is never shown to the class or on the paper."><textarea className={inputCls} rows={2} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
        <div className="flex justify-end"><button className={btnPrimary} disabled={!f.studentId} onClick={go}>Save</button></div>
      </div>
    </Modal>
  );
}
export function Arrangements({ isAdmin }) {
  const l = useList('/assess/access', 'access', {}); const [add, setAdd] = useState(false);
  const decide = async (r, ok) => { const note = ok ? '' : window.prompt('Why is it declined?'); if (!ok && !note) return; const x = await call(() => apiClient.post(`/assess/access/${r._id}/decide`, { decision: ok ? 'approve' : 'decline', note }), ok ? 'Approved' : 'Declined'); if (x) l.reload(); };
  const revoke = async (r) => { const note = window.prompt('Why is it being withdrawn?'); if (!note) return; const x = await call(() => apiClient.post(`/assess/access/${r._id}/revoke`, { note }), 'Withdrawn'); if (x) l.reload(); };
  return (
    <Card className="!p-0 overflow-hidden">
      <Bar><span className="text-sm font-semibold">Exam arrangements and make-ups</span><span className="grow" /><button className={btnPrimary} onClick={() => setAdd(true)}><Plus className="h-4 w-4" /> {isAdmin ? 'Add' : 'Request'}</button></Bar>
      <Body l={l} cols={5} empty="No arrangements yet.">
        <Tbl head={['Student', 'What', 'Status', 'Reason', '']}>{l.rows.map((r) => <Row key={r._id}><Td>{r.studentName}<Sub>Asked by {r.requestedByName}</Sub></Td><Td>{r.mode === 'makeup' ? `Make-up ${dt(r.opensAt)} to ${dt(r.closesAt)}` : [r.extraTimePct ? `+${r.extraTimePct}% time` : '', r.largeText ? 'large text' : '', r.readAloud ? 'read aloud' : '', r.separateSitting ? 'separate room' : ''].filter(Boolean).join(', ') || 'Extra attempts'}</Td><Td><Pill value={STATE_TONE[r.status]}>{r.status}</Pill>{r.decidedByName && <Sub>{r.decidedByName}</Sub>}</Td><Td className="max-w-xs text-xs text-[#3b4a5c]">{r.reason || '—'}</Td><Td>{isAdmin && r.status === 'Requested' && <div className="flex gap-2"><button className={btnPrimary} onClick={() => decide(r, true)}>Approve</button><button className={btnGhost} onClick={() => decide(r, false)}>Decline</button></div>}{isAdmin && r.status === 'Active' && <button className="text-xs text-[#9f1239]" onClick={() => revoke(r)}>Withdraw</button>}</Td></Row>)}</Tbl>
      </Body>
      {add && <AccessForm onClose={() => setAdd(false)} onDone={l.reload} />}
    </Card>
  );
}
