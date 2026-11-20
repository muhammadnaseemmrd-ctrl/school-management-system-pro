import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import apiClient from '../../utils/apiClient';
import { Card, Modal, Field, Pill, EmptyState, btnPrimary, btnGhost, btnDanger, inputCls } from '../ui';
import { call, useGet, Loading, Note, Tabs, when, day, dtLocal, StudentPicker, StaffSelect, ADJ, ADJ_WORD, APPT_WORD, APPT_TONE } from './careKit';

/* ───────── adjustments ───────── */
function Propose({ onClose, onSaved }) {
  const [st, setSt] = useState(null); const [f, setF] = useState({ kind: 'extra-time', detail: '', extraTimePct: 25, evidence: '', validFrom: '', validTo: '' });
  return (
    <Modal wide title="Propose an adjustment" onClose={onClose}>
      <div className="grid gap-3">
        <StudentPicker value={st} onPick={setSt} autoFocus />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><Field label="What kind?"><select className={inputCls} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{ADJ.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>{f.kind === 'extra-time' && <Field label="Extra time (%)"><input type="number" min="5" max="100" className={inputCls} value={f.extraTimePct} onChange={(e) => setF({ ...f, extraTimePct: Number(e.target.value) })} /></Field>}</div>
        <Field label="What exactly will the school do?"><textarea dir="auto" className={`${inputCls} min-h-[70px]`} maxLength={600} value={f.detail} onChange={(e) => setF({ ...f, detail: e.target.value })} /></Field>
        <Field label="Evidence (optional)" hint="For example an assessment report or the teacher's observations."><input dir="auto" className={inputCls} maxLength={600} value={f.evidence} onChange={(e) => setF({ ...f, evidence: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3"><Field label="Starts"><input type="date" className={inputCls} value={f.validFrom} onChange={(e) => setF({ ...f, validFrom: e.target.value })} /></Field><Field label="Ends (optional)"><input type="date" className={inputCls} value={f.validTo} onChange={(e) => setF({ ...f, validTo: e.target.value })} /></Field></div>
        <Note>A support coordinator other than you decides. The parent and class teachers are told once it is agreed.</Note>
        <div className="flex justify-end gap-2"><button className={btnGhost} onClick={onClose}>Cancel</button><button className={btnPrimary} disabled={!st || f.detail.trim().length < 5} onClick={() => call(() => apiClient.post('/care/accommodations', { ...f, studentId: st._id, validFrom: f.validFrom || undefined, validTo: f.validTo || undefined }), 'Sent for a decision', () => { onSaved(); onClose(); })}>Send</button></div>
      </div>
    </Modal>
  );
}
function Adjustments({ caps }) {
  const [status, setStatus] = useState(caps.work ? 'Proposed' : 'Active'); const g = useGet('/care/accommodations', caps.work ? { status: status || undefined } : {}); const [form, setForm] = useState(false); const [no, setNo] = useState(null); const rows = g.data?.accommodations || [];
  const decide = (a, approve, note) => call(() => apiClient.post(`/care/accommodations/${a._id}/decide`, { approve, note }), approve ? 'Agreed' : 'Declined', async () => { setNo(null); await g.reload(); });
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-end gap-2">{caps.work && <Field label="Show"><select className={`${inputCls} w-40`} value={status} onChange={(e) => setStatus(e.target.value)}><option value="Proposed">Waiting for a decision</option><option value="Active">In place</option><option value="Ended">Ended</option><option value="Declined">Declined</option><option value="">All</option></select></Field>}<div className="flex-1" /><button className={btnPrimary} onClick={() => setForm(true)}><Plus className="h-4 w-4" />Propose an adjustment</button></div>
      {!caps.work && <Note>Adjustments in place for children you teach. Follow them in lessons and exams.</Note>}
      <Loading g={g}>{rows.length === 0 ? <EmptyState title="Nothing here" text="Agreed adjustments for children with special needs appear here." /> : <ul className="grid gap-2" aria-label="Adjustments">{rows.map((a) => <li key={a._id} className="rounded-xl border border-[#e3e7e7] bg-white p-3 text-sm"><div className="flex flex-wrap items-center gap-2"><b>{a.studentName}</b><span>{ADJ_WORD[a.kind]}{a.extraTimePct ? ` (${a.extraTimePct}%)` : ''}</span>{a.status && <Pill value={a.status === 'Active' ? 'Active' : a.status === 'Proposed' ? 'Pending' : 'None'}>{a.status === 'Proposed' ? 'Waiting' : a.status}</Pill>}{a.soleApprover && <Pill value="Pending">Sole approval</Pill>}</div>
        <p dir="auto" className="mt-1 text-[#3b4a5c]">{a.detail}</p>{caps.work && <p className="mt-1 text-xs text-[#5b6b7b]">Proposed by {a.proposedByName}{a.evidence ? ` · Evidence: ${a.evidence}` : ''}{a.reviewOn ? ` · review ${day(a.reviewOn)}` : ''}{a.decidedByName ? ` · decided by ${a.decidedByName}` : ''}</p>}
        {caps.work && a.status === 'Proposed' && <div className="mt-2 flex gap-2"><button className={btnPrimary} onClick={() => decide(a, true)}>Agree</button><button className={btnGhost} onClick={() => setNo({ a, note: '' })}>Decline</button></div>}{caps.work && a.status === 'Active' && <div className="mt-2"><button className={btnGhost} onClick={() => call(() => apiClient.post(`/care/accommodations/${a._id}/end`, { note: 'Ended by coordinator' }), 'Ended', g.reload)}>End it</button></div>}</li>)}</ul>}</Loading>
      {form && <Propose onClose={() => setForm(false)} onSaved={g.reload} />}
      {no && <Modal title="Why is it declined?" onClose={() => setNo(null)}><div className="grid gap-3"><Field label="Reason"><input dir="auto" className={inputCls} maxLength={300} value={no.note} onChange={(e) => setNo({ ...no, note: e.target.value })} /></Field><div className="flex justify-end gap-2"><button className={btnGhost} onClick={() => setNo(null)}>Cancel</button><button className={btnPrimary} disabled={no.note.trim().length < 3} onClick={() => decide(no.a, false, no.note)}>Decline</button></div></div></Modal>}
    </div>
  );
}

/* ───────── appointments ───────── */
function Book({ caps, appt, onClose, onSaved }) {
  const staff = useGet('/care/staff'); const [st, setSt] = useState(appt ? { _id: appt.studentId, name: appt.studentName } : null);
  const kinds = [['counselling', 'Support session', caps.counsel], ['nurse', 'Sick bay', caps.health], ['mentor', 'Mentor', caps.work || caps.mentor], ['parent-meeting', 'Meeting with a parent', caps.work]].filter((k) => k[2]);
  const [f, setF] = useState({ kind: appt?.kind || kinds[0]?.[0] || 'mentor', staffId: '', at: dtLocal(new Date(Date.now() + 86400000)), durationMin: 30, room: '' });
  const go = () => call(() => (appt ? apiClient.post(`/care/appointments/${appt._id}/schedule`, { at: new Date(f.at).toISOString(), staffId: f.staffId || undefined, durationMin: f.durationMin, room: f.room }) : apiClient.post('/care/appointments', { kind: f.kind, studentId: st._id, at: new Date(f.at).toISOString(), staffId: f.staffId || undefined, durationMin: f.durationMin, room: f.room })), 'Booked', () => { onSaved(); onClose(); });
  return (
    <Modal wide title={appt ? 'Book a time' : 'Book an appointment'} onClose={onClose}>
      <div className="grid gap-3">
        {!appt && <><StudentPicker value={st} onPick={setSt} autoFocus /><Field label="Kind"><select className={inputCls} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{kinds.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field></>}
        <StaffSelect staff={staff.data?.staff} value={f.staffId} onChange={(v) => setF({ ...f, staffId: v })} label="With" empty="Me" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3"><Field label="When"><input type="datetime-local" className={inputCls} value={f.at} onChange={(e) => setF({ ...f, at: e.target.value })} /></Field><Field label="Minutes"><input type="number" min="10" max="180" className={inputCls} value={f.durationMin} onChange={(e) => setF({ ...f, durationMin: Number(e.target.value) })} /></Field><Field label="Room"><input className={inputCls} maxLength={40} value={f.room} onChange={(e) => setF({ ...f, room: e.target.value })} /></Field></div>
        <div className="flex justify-end gap-2"><button className={btnGhost} onClick={onClose}>Cancel</button><button className={btnPrimary} disabled={!appt && !st} onClick={go}>Book</button></div>
      </div>
    </Modal>
  );
}
function Appointments({ caps }) {
  const [status, setStatus] = useState('open'); const g = useGet('/care/appointments', { status: status || undefined }); const [book, setBook] = useState(null); const rows = g.data?.appointments || [];
  const set = (a, s) => call(() => apiClient.post(`/care/appointments/${a._id}/status`, { status: s }), 'Updated', g.reload);
  const canBook = caps.counsel || caps.health || caps.work;
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-end gap-2"><Field label="Show"><select className={`${inputCls} w-36`} value={status} onChange={(e) => setStatus(e.target.value)}><option value="open">Coming up</option><option value="Done">Done</option><option value="">All</option></select></Field><div className="flex-1" />{(canBook || caps.teaches) && <button className={btnPrimary} onClick={() => setBook({})}><Plus className="h-4 w-4" />Book</button>}</div>
      <Loading g={g}>{rows.length === 0 ? <EmptyState title="No appointments" text="Requests from students and parents appear here for you to give a time." /> : <ul className="grid gap-2" aria-label="Appointments">{rows.map((a) => <li key={a._id} className="flex flex-wrap items-center gap-2 rounded-xl border border-[#e3e7e7] bg-white p-3 text-sm"><Pill value={APPT_TONE[a.status]}>{a.status}</Pill><span className="min-w-0 flex-1"><b>{a.studentName}</b> · {APPT_WORD[a.kind]}{a.staffName ? ` with ${a.staffName}` : ''}{a.at ? ` · ${when(a.at)}` : ''}{a.room ? ` · ${a.room}` : ''}{a.reasonLine && a.kind !== 'counselling' ? <span dir="auto" className="text-xs text-[#5b6b7b]"> · {a.reasonLine}</span> : null}</span>
        {a.status === 'Requested' && <button className={btnPrimary} onClick={() => setBook({ appt: a })}>Give a time</button>}{a.status === 'Booked' && <><button className={btnGhost} onClick={() => set(a, 'Done')}>Done</button><button className={btnGhost} onClick={() => set(a, 'Missed')}>Did not come</button></>}{['Requested', 'Booked'].includes(a.status) && <button className={btnGhost} onClick={() => set(a, 'Cancelled')}>Cancel</button>}</li>)}</ul>}</Loading>
      {book && <Book caps={caps} appt={book.appt} onClose={() => setBook(null)} onSaved={g.reload} />}
    </div>
  );
}

/* ───────── plans: goals, mentors, careers for one child ───────── */
function StudentPlan({ student, caps }) {
  const goals = useGet('/care/goals', { studentId: student._id }); const mentors = useGet('/care/mentors', { studentId: student._id, status: 'all' }); const career = useGet(`/care/careers/${student._id}`); const staff = useGet('/care/staff');
  const [g, setG] = useState({ title: '', kind: 'personal', target: '', dueOn: '' }); const [m, setM] = useState({ mentorId: '', focus: '' }); const [cf, setCf] = useState(null); const [meet, setMeet] = useState({}); const c = career.data?.career;
  const form = cf || { interests: (c?.interests || []).join(', '), strengths: (c?.strengths || []).join(', '), pathway: c?.pathway || '', subjects: (c?.subjects || []).join(', '), nextStep: c?.nextStep || '', notes: c?.notes || '' };
  const list = (s) => s.split(',').map((x) => x.trim()).filter(Boolean);
  return (
    <div className="grid gap-4">
      <Card><h4 className="mb-2 text-sm font-bold">Goals and achievements</h4>
        <div className="mb-2 flex flex-wrap items-end gap-2"><div className="min-w-[180px] flex-1"><Field label="Title"><input dir="auto" className={inputCls} maxLength={140} value={g.title} onChange={(e) => setG({ ...g, title: e.target.value })} /></Field></div><Field label="Kind"><select className={inputCls} value={g.kind} onChange={(e) => setG({ ...g, kind: e.target.value })}><option value="personal">Personal goal</option>{caps.work && <option value="iep">Learning plan goal</option>}<option value="achievement">Achievement</option></select></Field><Field label="Target"><input dir="auto" className={inputCls} maxLength={300} value={g.target} onChange={(e) => setG({ ...g, target: e.target.value })} /></Field><button className={btnPrimary} disabled={g.title.trim().length < 3} onClick={() => call(() => apiClient.post('/care/goals', { ...g, studentId: student._id, dueOn: g.dueOn || undefined }), g.kind === 'achievement' ? 'Recorded. The student and parent were told.' : 'Added', async () => { setG({ title: '', kind: 'personal', target: '', dueOn: '' }); await goals.reload(); })}>Add</button></div>
        <Loading g={goals}>{(goals.data?.goals || []).length === 0 ? <p className="text-sm text-[#5b6b7b]">No goals yet.</p> : <ul className="grid gap-1.5">{goals.data.goals.map((x) => <li key={x._id} className="flex flex-wrap items-center gap-2 text-sm"><Pill value={x.status === 'Met' ? 'Active' : x.status === 'Dropped' ? 'None' : 'Approved'}>{x.kind === 'achievement' ? 'Achievement' : x.kind === 'iep' ? 'Learning plan' : 'Goal'}</Pill><span dir="auto" className="min-w-0 flex-1">{x.title}{x.target ? ` — ${x.target}` : ''}</span><span className="text-xs text-[#5b6b7b]">{x.progress}%</span>{x.status === 'Active' && <select aria-label="Progress" className={`${inputCls} w-24`} value={x.progress} onChange={(e) => call(() => apiClient.post(`/care/goals/${x._id}/review`, { progress: Number(e.target.value) }), 'Updated', goals.reload)}>{[0, 25, 50, 75, 100].map((p) => <option key={p} value={p}>{p}%</option>)}</select>}</li>)}</ul>}</Loading></Card>
      <Card><h4 className="mb-2 text-sm font-bold">Mentor</h4>
        {caps.work && <div className="mb-2 flex flex-wrap items-end gap-2"><StaffSelect staff={staff.data?.staff} value={m.mentorId} onChange={(v) => setM({ ...m, mentorId: v })} label="Pair with" empty="Choose…" /><div className="min-w-[180px] flex-1"><Field label="Focus"><input dir="auto" className={inputCls} maxLength={300} value={m.focus} onChange={(e) => setM({ ...m, focus: e.target.value })} /></Field></div><button className={btnPrimary} disabled={!m.mentorId} onClick={() => call(() => apiClient.post('/care/mentors', { studentId: student._id, ...m }), 'Paired', async () => { setM({ mentorId: '', focus: '' }); await mentors.reload(); })}>Pair</button></div>}
        <Loading g={mentors}>{(mentors.data?.pairs || []).length === 0 ? <p className="text-sm text-[#5b6b7b]">No mentor yet.</p> : <ul className="grid gap-2">{mentors.data.pairs.map((p) => <li key={p._id} className="rounded-xl border border-[#e3e7e7] p-2 text-sm"><div className="flex flex-wrap items-center gap-2"><b>{p.mentorName}</b><Pill value={p.status === 'Active' ? 'Active' : 'None'}>{p.status}</Pill><span className="min-w-0 flex-1 text-xs text-[#5b6b7b]" dir="auto">{p.focus} · {(p.meetings || []).length} meetings</span>{caps.work && p.status === 'Active' && <button className={btnGhost} onClick={() => call(() => apiClient.post(`/care/mentors/${p._id}/end`, {}), 'Ended', mentors.reload)}>End</button>}</div>
          {p.status === 'Active' && <div className="mt-1.5 flex gap-2"><input aria-label="Meeting note" dir="auto" placeholder="Log a meeting" className={inputCls} maxLength={400} value={meet[p._id] || ''} onChange={(e) => setMeet({ ...meet, [p._id]: e.target.value })} /><button className={btnGhost} disabled={(meet[p._id] || '').trim().length < 3} onClick={() => call(() => apiClient.post(`/care/mentors/${p._id}/meeting`, { note: meet[p._id] }), 'Logged', async () => { setMeet({ ...meet, [p._id]: '' }); await mentors.reload(); })}>Log</button></div>}</li>)}</ul>}</Loading></Card>
      <Card><h4 className="mb-2 text-sm font-bold">Career pathway</h4>
        <Loading g={career}><div className="grid gap-2"><div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><Field label="Interests" hint="Separate with commas"><input dir="auto" className={inputCls} value={form.interests} onChange={(e) => setCf({ ...form, interests: e.target.value })} /></Field><Field label="Strengths"><input dir="auto" className={inputCls} value={form.strengths} onChange={(e) => setCf({ ...form, strengths: e.target.value })} /></Field><Field label="Chosen pathway"><input dir="auto" className={inputCls} value={form.pathway} onChange={(e) => setCf({ ...form, pathway: e.target.value })} /></Field><Field label="Subjects to take"><input dir="auto" className={inputCls} value={form.subjects} onChange={(e) => setCf({ ...form, subjects: e.target.value })} /></Field></div>
          <Field label="Next step"><input dir="auto" className={inputCls} maxLength={300} value={form.nextStep} onChange={(e) => setCf({ ...form, nextStep: e.target.value })} /></Field>
          {(career.data?.suggestions || []).length > 0 && <div className="text-xs text-[#3b4a5c]">Suggested from interests: {career.data.suggestions.map((s) => <button key={s.id} type="button" className="me-2 underline" onClick={() => setCf({ ...form, pathway: s.name, subjects: s.subjects.join(', ') })}>{s.name}</button>)}</div>}
          <div className="flex justify-end"><button className={btnPrimary} onClick={() => call(() => apiClient.put(`/care/careers/${student._id}`, { interests: list(form.interests), strengths: list(form.strengths), pathway: form.pathway, subjects: list(form.subjects), nextStep: form.nextStep, notes: form.notes }), 'Saved', async () => { setCf(null); await career.reload(); })}>Save</button></div></div></Loading></Card>
    </div>
  );
}
function Plans({ caps }) { const [st, setSt] = useState(null); return <div className="grid gap-3"><div className="sm:max-w-md"><StudentPicker label="Pick a child" value={st} onPick={setSt} /></div>{st ? <StudentPlan key={st._id} student={st} caps={caps} /> : <Note>Pick a child to see their goals, mentor and career pathway.</Note>}</div>; }

export default function CareSupport({ caps }) {
  const [tab, setTab] = useState('adjust');
  return (
    <div className="grid gap-3">
      <Tabs label="Support" value={tab} onChange={setTab} items={[['adjust', 'Adjustments'], ['appts', 'Appointments'], ['plans', 'Goals, mentors and careers']]} />
      {tab === 'adjust' && <Adjustments caps={caps} />}{tab === 'appts' && <Appointments caps={caps} />}{tab === 'plans' && <Plans caps={caps} />}
    </div>
  );
}
