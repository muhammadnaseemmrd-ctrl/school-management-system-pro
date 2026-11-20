import React, { useState } from 'react';
import { Plus, Download } from 'lucide-react';
import apiClient from '../../utils/apiClient';
import { Card, Modal, Field, Pill, EmptyState, btnPrimary, btnGhost, inputCls } from '../ui';
import { call, useGet, Loading, Note, Tabs, when, day, ADJ_WORD, APPT_WORD, APPT_TONE, SEV_TONE, errText } from './careKit';
import { RaiseConcern } from './CareConcerns';

const SEVS = ['mild', 'moderate', 'severe'];

function ChildPicker({ kids, value, onChange }) {
  if (!kids || kids.length < 2) return null;
  return <Field label="Child"><select className={`${inputCls} sm:w-64`} value={value} onChange={(e) => onChange(e.target.value)}>{kids.map((k) => <option key={k.studentId} value={k.studentId}>{k.name}</option>)}</select></Field>;
}

/* ───────── Support: what the school is doing ───────── */
function RequestAppt({ role, kid, onClose, onSaved }) {
  const opts = role === 'student' ? [['counselling', 'Talk to the counsellor'], ['nurse', 'See the nurse']] : [['parent-meeting', 'A meeting with the school'], ['nurse', 'Ask to see the nurse']];
  const [f, setF] = useState({ kind: opts[0][0], reason: '' });
  return (
    <Modal title="Ask for an appointment" onClose={onClose}>
      <div className="grid gap-3">
        <Field label="Who?"><select className={inputCls} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{opts.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label={role === 'student' && f.kind === 'counselling' ? 'Anything you want them to know? (private)' : 'What is it about?'} hint="Optional."><input dir="auto" className={inputCls} maxLength={160} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
        {role === 'student' && f.kind === 'counselling' && <Note>Only the counsellor sees this. Your parents are not told about your support sessions.</Note>}
        <div className="flex justify-end gap-2"><button className={btnGhost} onClick={onClose}>Cancel</button><button className={btnPrimary} onClick={() => call(() => apiClient.post('/care/appointments', { kind: f.kind, reason: f.reason, studentId: kid.studentId }), 'Sent. The school will give you a time.', () => { onSaved(); onClose(); })}>Send</button></div>
      </div>
    </Modal>
  );
}
function Support({ role }) {
  const g = useGet('/care/family/support'); const [sel, setSel] = useState(''); const [ask, setAsk] = useState(false); const [goal, setGoal] = useState({ title: '', target: '' });
  const kids = g.data?.children || []; const kid = kids.find((k) => k.studentId === sel) || kids[0];
  return (
    <Loading g={g}>{!kid ? <EmptyState title="Nobody linked" text="Support information appears here once a child is linked to your account." /> : (
      <div className="grid gap-4">
        <ChildPicker kids={kids} value={kid.studentId} onChange={setSel} />
        <div className="flex justify-end"><button className={btnPrimary} onClick={() => setAsk(true)}><Plus className="h-4 w-4" />Ask for an appointment</button></div>
        <Card><h4 className="mb-2 text-sm font-bold">Help in lessons and exams</h4>{kid.accommodations.length === 0 ? <p className="text-sm text-[#5b6b7b]">No adjustments are in place.</p> : <ul className="grid gap-1.5 text-sm">{kid.accommodations.map((a, i) => <li key={i}><b>{ADJ_WORD[a.kind]}{a.extraTimePct ? ` (${a.extraTimePct}%)` : ''}</b> <span dir="auto" className="text-[#3b4a5c]">{a.detail}</span>{a.validTo && <span className="text-xs text-[#5b6b7b]"> · until {day(a.validTo)}</span>}</li>)}</ul>}</Card>
        <Card><h4 className="mb-2 text-sm font-bold">Appointments</h4>{kid.appointments.length === 0 ? <p className="text-sm text-[#5b6b7b]">Nothing booked or waiting.</p> : <ul className="grid gap-1.5 text-sm" aria-label="Appointments">{kid.appointments.map((a) => <li key={a._id} className="flex flex-wrap items-center gap-2"><Pill value={APPT_TONE[a.status]}>{a.status === 'Requested' ? 'Waiting for a time' : a.status}</Pill><span>{APPT_WORD[a.kind]}{a.staffName ? ` with ${a.staffName}` : ''}{a.at ? ` · ${when(a.at)}` : ''}{a.room ? ` · ${a.room}` : ''}</span></li>)}</ul>}</Card>
        <Card><h4 className="mb-2 text-sm font-bold">Goals and achievements</h4>
          {role === 'student' && <div className="mb-3 flex flex-wrap items-end gap-2"><div className="min-w-[180px] flex-1"><Field label="A goal of my own"><input dir="auto" className={inputCls} maxLength={140} value={goal.title} onChange={(e) => setGoal({ ...goal, title: e.target.value })} /></Field></div><div className="min-w-[160px] flex-1"><Field label="How will I know?"><input dir="auto" className={inputCls} maxLength={300} value={goal.target} onChange={(e) => setGoal({ ...goal, target: e.target.value })} /></Field></div><button className={btnPrimary} disabled={goal.title.trim().length < 3} onClick={() => call(() => apiClient.post('/care/goals', { title: goal.title, target: goal.target, kind: 'personal' }), 'Added', async () => { setGoal({ title: '', target: '' }); await g.reload(); })}>Add</button></div>}
          {kid.goals.length === 0 ? <p className="text-sm text-[#5b6b7b]">No goals yet.</p> : <ul className="grid gap-1.5 text-sm">{kid.goals.map((x) => <li key={x._id} className="flex flex-wrap items-center gap-2"><Pill value={x.status === 'Met' ? 'Active' : x.status === 'Dropped' ? 'None' : 'Approved'}>{x.kind === 'achievement' ? 'Achievement' : x.status === 'Met' ? 'Done' : 'Goal'}</Pill><span dir="auto" className="min-w-0 flex-1">{x.title}{x.target ? ` — ${x.target}` : ''}</span><span className="text-xs text-[#5b6b7b]">{x.progress}%</span>{role === 'student' && x.status === 'Active' && x.ownerRole === 'student' && <select aria-label={`Progress on ${x.title}`} className={`${inputCls} w-24`} value={x.progress} onChange={(e) => call(() => apiClient.post(`/care/goals/${x._id}/review`, { progress: Number(e.target.value) }), 'Updated', g.reload)}>{[0, 25, 50, 75, 100].map((p) => <option key={p} value={p}>{p}%</option>)}</select>}</li>)}</ul>}</Card>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card><h4 className="mb-2 text-sm font-bold">Mentor</h4>{kid.mentors.length === 0 ? <p className="text-sm text-[#5b6b7b]">No mentor yet.</p> : <ul className="text-sm">{kid.mentors.map((m, i) => <li key={i}><b>{m.mentorName}</b> <span dir="auto" className="text-[#3b4a5c]">{m.focus}</span> <span className="text-xs text-[#5b6b7b]">· {m.meetings} meetings</span></li>)}</ul>}</Card>
          <Card><h4 className="mb-2 text-sm font-bold">Career pathway</h4>{!kid.career ? <p className="text-sm text-[#5b6b7b]">Not started yet.</p> : <div className="grid gap-1 text-sm" dir="auto">{kid.career.pathway && <div><b>Pathway:</b> {kid.career.pathway}</div>}{kid.career.interests?.length > 0 && <div><b>Interests:</b> {kid.career.interests.join(', ')}</div>}{kid.career.subjects?.length > 0 && <div><b>Subjects:</b> {kid.career.subjects.join(', ')}</div>}{kid.career.nextStep && <div><b>Next step:</b> {kid.career.nextStep}</div>}</div>}</Card>
        </div>
        {ask && <RequestAppt role={role} kid={kid} onClose={() => setAsk(false)} onSaved={g.reload} />}
      </div>)}</Loading>
  );
}

/* ───────── Health ───────── */
function SendInfo({ kid, onClose, onSaved }) {
  const [f, setF] = useState({ allergies: [], conditions: [], emergencyPlan: '', diet: '', doctorName: '', doctorPhone: '', med: { name: '', dose: '', times: '' } });
  const upd = (k, i, key, v) => setF({ ...f, [k]: f[k].map((x, j) => (j === i ? { ...x, [key]: v } : x)) });
  const meds = f.med.name.trim() && f.med.dose.trim() ? [{ name: f.med.name, dose: f.med.dose, times: f.med.times.split(/[ ,]+/).filter(Boolean) }] : [];
  const empty = !f.allergies.some((a) => a.allergen.trim()) && !f.conditions.some((c) => c.name.trim()) && !f.emergencyPlan.trim() && !f.diet.trim() && !f.doctorName.trim() && meds.length === 0;
  return (
    <Modal wide title={`Tell the school about ${kid.name}'s health`} onClose={onClose}>
      <div className="grid gap-3">
        <Note>The school nurse checks this before it is added to the health plan.</Note>
        <fieldset className="grid gap-2"><legend className="mb-1 text-xs font-semibold text-[#3b4a5c]">Allergies</legend>
          {f.allergies.map((a, i) => <div key={i} className="grid gap-2 sm:grid-cols-[repeat(3,minmax(0,1fr))_auto]"><input dir="auto" aria-label="Allergic to" placeholder="Allergic to" className={inputCls} value={a.allergen} onChange={(e) => upd('allergies', i, 'allergen', e.target.value)} /><input dir="auto" aria-label="Reaction" placeholder="Reaction" className={inputCls} value={a.reaction} onChange={(e) => upd('allergies', i, 'reaction', e.target.value)} /><select aria-label="How serious" className={inputCls} value={a.severity} onChange={(e) => upd('allergies', i, 'severity', e.target.value)}>{SEVS.map((s) => <option key={s}>{s}</option>)}</select><button type="button" className={btnGhost} aria-label="Remove" onClick={() => setF({ ...f, allergies: f.allergies.filter((_, j) => j !== i) })}>✕</button></div>)}
          <div><button type="button" className={btnGhost} onClick={() => setF({ ...f, allergies: [...f.allergies, { allergen: '', reaction: '', severity: 'mild' }] })}><Plus className="h-4 w-4" />Add allergy</button></div></fieldset>
        <fieldset className="grid gap-2"><legend className="mb-1 text-xs font-semibold text-[#3b4a5c]">Health conditions</legend>
          {f.conditions.map((c, i) => <div key={i} className="grid gap-2 sm:grid-cols-[repeat(3,minmax(0,1fr))_auto]"><input dir="auto" aria-label="Condition" placeholder="Condition" className={inputCls} value={c.name} onChange={(e) => upd('conditions', i, 'name', e.target.value)} /><input dir="auto" aria-label="What staff should know" placeholder="What staff should know" className={inputCls} value={c.notes} onChange={(e) => upd('conditions', i, 'notes', e.target.value)} /><select aria-label="How serious" className={inputCls} value={c.severity} onChange={(e) => upd('conditions', i, 'severity', e.target.value)}>{SEVS.map((s) => <option key={s}>{s}</option>)}</select><button type="button" className={btnGhost} aria-label="Remove" onClick={() => setF({ ...f, conditions: f.conditions.filter((_, j) => j !== i) })}>✕</button></div>)}
          <div><button type="button" className={btnGhost} onClick={() => setF({ ...f, conditions: [...f.conditions, { name: '', notes: '', severity: 'mild' }] })}><Plus className="h-4 w-4" />Add condition</button></div></fieldset>
        <Field label="What should staff do in an emergency?"><textarea dir="auto" className={`${inputCls} min-h-[60px]`} maxLength={1500} value={f.emergencyPlan} onChange={(e) => setF({ ...f, emergencyPlan: e.target.value })} /></Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3"><Field label="Diet"><input dir="auto" className={inputCls} maxLength={300} value={f.diet} onChange={(e) => setF({ ...f, diet: e.target.value })} /></Field><Field label="Doctor"><input dir="auto" className={inputCls} maxLength={80} value={f.doctorName} onChange={(e) => setF({ ...f, doctorName: e.target.value })} /></Field><Field label="Doctor's phone"><input className={inputCls} maxLength={30} value={f.doctorPhone} onChange={(e) => setF({ ...f, doctorPhone: e.target.value })} /></Field></div>
        <fieldset className="grid gap-2"><legend className="mb-1 text-xs font-semibold text-[#3b4a5c]">A medicine the school should give (optional)</legend><div className="grid grid-cols-1 gap-2 sm:grid-cols-3"><input dir="auto" aria-label="Medicine name" placeholder="Name" className={inputCls} value={f.med.name} onChange={(e) => setF({ ...f, med: { ...f.med, name: e.target.value } })} /><input dir="auto" aria-label="Dose" placeholder="Dose" className={inputCls} value={f.med.dose} onChange={(e) => setF({ ...f, med: { ...f.med, dose: e.target.value } })} /><input aria-label="Times" placeholder="Times, e.g. 08:30 13:00" className={inputCls} value={f.med.times} onChange={(e) => setF({ ...f, med: { ...f.med, times: e.target.value } })} /></div></fieldset>
        <div className="flex justify-end gap-2"><button className={btnGhost} onClick={onClose}>Cancel</button><button className={btnPrimary} disabled={empty} onClick={() => call(() => apiClient.post('/care/family/health/proposal', { studentId: kid.studentId, allergies: f.allergies.filter((a) => a.allergen.trim()), conditions: f.conditions.filter((c) => c.name.trim()), emergencyPlan: f.emergencyPlan, diet: f.diet, doctorName: f.doctorName, doctorPhone: f.doctorPhone, medications: meds }), 'Sent to the school nurse', () => { onSaved(); onClose(); })}>Send</button></div>
      </div>
    </Modal>
  );
}
function Health({ role }) {
  const g = useGet('/care/family/health'); const [sel, setSel] = useState(''); const [send, setSend] = useState(false);
  const kids = g.data?.children || []; const kid = kids.find((k) => k.studentId === sel) || kids[0]; const p = kid?.plan;
  const consent = (m, yes) => call(() => apiClient.post('/care/family/medication-consent', { studentId: kid.studentId, medId: m._id, consent: yes }), yes ? 'You agreed. The school can now give it.' : 'You withdrew your agreement', g.reload);
  return (
    <Loading g={g}>{!kid ? <EmptyState title="Nobody linked" text="Health information appears here once a child is linked to your account." /> : (
      <div className="grid gap-4">
        <ChildPicker kids={kids} value={kid.studentId} onChange={setSel} />
        {role === 'parent' && <div className="flex items-center justify-end gap-2">{p?.proposal && <Pill value="Pending">Update sent {day(p.proposal.at)}, waiting for the nurse</Pill>}<button className={btnPrimary} onClick={() => setSend(true)}><Plus className="h-4 w-4" />Send health information</button></div>}
        {!p ? <Note>The school has no health plan for {kid.name} yet.{role === 'parent' ? ' Use the button to tell the nurse about allergies, conditions or medicine.' : ''}</Note> : <>
          <Card><h4 className="mb-2 text-sm font-bold">Health plan</h4><div className="grid gap-2 text-sm">
            <div className="flex flex-wrap gap-1.5">{(p.allergies || []).map((a, i) => <Pill key={i} value={SEV_TONE[a.severity]}>{a.allergen}{a.reaction ? ` — ${a.reaction}` : ''} ({a.severity})</Pill>)}{(p.conditions || []).map((c, i) => <Pill key={`c${i}`} value={SEV_TONE[c.severity]}>{c.name} ({c.severity})</Pill>)}{!(p.allergies || []).length && !(p.conditions || []).length && <span className="text-[#5b6b7b]">No allergies or conditions recorded.</span>}</div>
            {p.emergencyPlan && <p dir="auto"><b>In an emergency:</b> {p.emergencyPlan}</p>}{p.diet && <p dir="auto"><b>Diet:</b> {p.diet}</p>}{p.doctorName && <p dir="auto"><b>Doctor:</b> {p.doctorName} {p.doctorPhone}</p>}{p.verifiedAt && <p className="text-xs text-[#5b6b7b]">Checked by the school on {day(p.verifiedAt)}</p>}</div></Card>
          <Card><h4 className="mb-2 text-sm font-bold">Medicine at school</h4>{(p.medications || []).length === 0 ? <p className="text-sm text-[#5b6b7b]">None.</p> : <ul className="grid gap-2" aria-label="Medicines">{p.medications.map((m) => <li key={m._id} className="flex flex-wrap items-center gap-2 rounded-xl border border-[#e3e7e7] p-3 text-sm"><span className="min-w-0 flex-1"><b>{m.name}</b> {m.dose} · {(m.times || []).join(', ') || 'when needed'}{m.instructions ? ` · ${m.instructions}` : ''}{m.endOn ? ` · until ${day(m.endOn)}` : ''}</span>{!m.active ? <Pill value="None">Stopped</Pill> : m.consented ? <Pill value="Active">You agreed{m.consentAt ? ` ${day(m.consentAt)}` : ''}</Pill> : <Pill value="Pending">Needs your agreement</Pill>}
            {role === 'parent' && m.active && (m.consented ? <button className={btnGhost} onClick={() => consent(m, false)}>Withdraw</button> : <button className={btnPrimary} onClick={() => consent(m, true)}>I agree</button>)}</li>)}</ul>}
            {role === 'parent' && (p.medications || []).some((m) => m.active && !m.consented) && <Note tone="warn">The school cannot give a medicine until you agree.</Note>}</Card>
        </>}
        <Card><h4 className="mb-2 text-sm font-bold">Sick bay visits</h4>{(kid.incidents || []).length === 0 ? <p className="text-sm text-[#5b6b7b]">No visits.</p> : <ul className="grid gap-1.5 text-sm">{kid.incidents.map((i) => <li key={i._id}><b>{when(i.at)}</b> · {i.kind} · {i.outcome} <span dir="auto" className="text-[#3b4a5c]">— {i.symptoms}{i.action ? `. ${i.action}` : ''}</span></li>)}</ul>}</Card>
        {send && <SendInfo kid={kid} onClose={() => setSend(false)} onSaved={g.reload} />}
      </div>)}</Loading>
  );
}

/* ───────── Concerns ───────── */
function Concerns({ role }) {
  const [form, setForm] = useState(false); const [code, setCode] = useState(''); const [st, setSt] = useState(null); const [err, setErr] = useState('');
  const check = async () => { setErr(''); setSt(null); try { const r = await apiClient.get('/care/reports/status', { params: { code: code.trim() } }); setSt(r.data); } catch (e) { setErr(errText(e, 'We could not find that code.')); } };
  return (
    <div className="grid gap-4">
      <Card><h4 className="text-sm font-bold">Worried about something?</h4><p className="mb-3 text-sm text-[#3b4a5c]">Tell the school's safeguarding team. You can send your name, or send it without one.{role === 'parent' ? '' : ' If you are in danger right now, tell a teacher straight away.'}</p><button className={btnPrimary} onClick={() => setForm(true)}>Tell us</button></Card>
      <Card><h4 className="mb-2 text-sm font-bold">Check on something you sent</h4><div className="flex flex-wrap items-end gap-2"><Field label="Your code"><input className={`${inputCls} w-56`} placeholder="e.g. K7MQ-2XPD-9TRB" value={code} onChange={(e) => setCode(e.target.value)} /></Field><button className={btnGhost} disabled={code.trim().length < 6} onClick={check}>Check</button></div>
        {err && <p role="alert" className="mt-2 text-sm text-[#9f1239]">{err}</p>}
        {st && <div className="mt-3 grid gap-1 text-sm"><div><Pill value="Approved">{st.status}</Pill> <span className="text-xs text-[#5b6b7b]">sent {when(st.sentAt)}</span></div>{st.reply ? <Note>Reply: <span dir="auto">{st.reply}</span></Note> : <p className="text-[#5b6b7b]">No reply yet.</p>}</div>}</Card>
      {form && <RaiseConcern allowAnonymous hidePicker onClose={() => setForm(false)} />}
    </div>
  );
}

/* ───────── Privacy ───────── */
function Privacy({ role }) {
  const g = useGet('/care/privacy'); const kids = useGet('/care/family/support'); const [f, setF] = useState(null); const rows = g.data?.requests || [];
  const exportIt = async (r) => { try { const x = await apiClient.get(`/care/privacy/${r._id}/export`); const url = URL.createObjectURL(new Blob([JSON.stringify(x.data, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = `${r.number}.json`; a.click(); URL.revokeObjectURL(url); } catch { /* ignore */ } };
  const list = kids.data?.children || [];
  return (
    <div className="grid gap-3">
      <Note>You can ask the school what it holds about a child, ask it to correct something, or ask it to remove information. The school answers within the time the law allows. Safeguarding and health records may have to be kept.</Note>
      <div className="flex justify-end"><button className={btnPrimary} onClick={() => setF({ kind: 'access', detail: '', studentId: list[0]?.studentId || '' })}><Plus className="h-4 w-4" />New request</button></div>
      <Loading g={g}>{rows.length === 0 ? <EmptyState title="No requests" text="Requests you send appear here." /> : <ul className="grid gap-2" aria-label="Privacy requests">{rows.map((r) => <li key={r._id} className="rounded-xl border border-[#e3e7e7] bg-white p-3 text-sm"><div className="flex flex-wrap items-center gap-2"><b>{r.number}</b><Pill value="Approved">{r.kind}</Pill><Pill value={r.status === 'Fulfilled' ? 'Active' : r.status === 'Refused' ? 'Suspended' : 'Pending'}>{r.status}</Pill><span className="text-xs text-[#5b6b7b]">{r.studentName} · answer due {day(r.dueAt)}</span></div>{r.response && <p dir="auto" className="mt-1 text-[#3b4a5c]">{r.response}</p>}{r.kind === 'access' && r.status === 'Fulfilled' && <button className={`${btnGhost} mt-2`} onClick={() => exportIt(r)}><Download className="h-4 w-4" />Download what the school holds</button>}</li>)}</ul>}</Loading>
      {f && <Modal title="New privacy request" onClose={() => setF(null)}><div className="grid gap-3">
        {role === 'parent' && list.length > 1 && <Field label="Child"><select className={inputCls} value={f.studentId} onChange={(e) => setF({ ...f, studentId: e.target.value })}>{list.map((k) => <option key={k.studentId} value={k.studentId}>{k.name}</option>)}</select></Field>}
        <Field label="What do you want?"><select className={inputCls} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="access">Show me what you hold</option><option value="correction">Correct something</option><option value="erasure">Remove information</option></select></Field>
        <Field label="Details" hint={f.kind === 'access' ? 'Optional.' : 'Say what is wrong or what should be removed.'}><textarea dir="auto" className={`${inputCls} min-h-[80px]`} maxLength={800} value={f.detail} onChange={(e) => setF({ ...f, detail: e.target.value })} /></Field>
        <div className="flex justify-end gap-2"><button className={btnGhost} onClick={() => setF(null)}>Cancel</button><button className={btnPrimary} disabled={f.kind !== 'access' && f.detail.trim().length < 5} onClick={() => call(() => apiClient.post('/care/privacy', { kind: f.kind, detail: f.detail, studentId: role === 'parent' ? f.studentId : undefined }), 'Sent', async () => { setF(null); await g.reload(); })}>Send</button></div></div></Modal>}
    </div>
  );
}

export default function FamilyCare({ role = 'parent' }) {
  const [tab, setTab] = useState('support');
  return (
    <div className="grid gap-4">
      <Tabs label="Wellbeing" value={tab} onChange={setTab} items={[['support', role === 'student' ? 'My support' : 'Support'], ['health', 'Health'], ['concerns', 'Tell us a worry'], ['privacy', 'My information']]} />
      {tab === 'support' && <Support role={role} />}{tab === 'health' && <Health role={role} />}{tab === 'concerns' && <Concerns role={role} />}{tab === 'privacy' && <Privacy role={role} />}
    </div>
  );
}
