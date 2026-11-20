import React, { useState } from 'react';
import { Plus, AlertTriangle } from 'lucide-react';
import apiClient from '../../utils/apiClient';
import { Card, Modal, Field, Pill, EmptyState, Stat, btnPrimary, btnGhost, btnDanger, inputCls } from '../ui';
import { call, useGet, Loading, Note, Tabs, when, day, StudentPicker, SEV_TONE } from './careKit';

const SEVS = ['mild', 'moderate', 'severe'];

function ListEditor({ label, items, setItems, fields, blank }) {
  return (
    <fieldset className="grid gap-2"><legend className="mb-1 text-xs font-semibold text-[#3b4a5c]">{label}</legend>
      {items.map((it, i) => <div key={i} className="grid items-end gap-2 sm:grid-cols-[repeat(3,minmax(0,1fr))_auto]">{fields.map(([k, ph, kind]) => (kind === 'sev'
        ? <select key={k} aria-label="Severity" className={inputCls} value={it[k]} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)))}>{SEVS.map((s) => <option key={s}>{s}</option>)}</select>
        : <input key={k} dir="auto" aria-label={ph} placeholder={ph} className={inputCls} value={it[k] || ''} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)))} />))}
        <button type="button" className={btnGhost} onClick={() => setItems(items.filter((_, j) => j !== i))} aria-label="Remove">✕</button></div>)}
      <div><button type="button" className={btnGhost} onClick={() => setItems([...items, { ...blank }])}><Plus className="h-4 w-4" />Add</button></div>
    </fieldset>
  );
}

function PlanEditor({ student, onClose }) {
  const g = useGet(`/care/health/plan/${student._id}`); const [f, setF] = useState(null); const [med, setMed] = useState(null);
  const p = g.data?.plan; const form = f || (g.data && { conditions: p?.conditions || [], allergies: p?.allergies || [], emergencyPlan: p?.emergencyPlan || '', diet: p?.diet || '', doctorName: p?.doctorName || '', doctorPhone: p?.doctorPhone || '' });
  const save = () => call(() => apiClient.put(`/care/health/plan/${student._id}`, form), 'Health plan saved', async () => { setF(null); await g.reload(); });
  const addMed = () => call(() => apiClient.post(`/care/health/plan/${student._id}/medications`, { ...med, times: med.times.split(/[ ,]+/).filter(Boolean) }), 'Medicine added. The parent has been asked for consent.', async () => { setMed(null); await g.reload(); });
  return (
    <Modal wide title={`Health plan: ${student.name}`} onClose={onClose}>
      <Loading g={g}>{form && <div className="grid gap-4">
        <ListEditor label="Conditions" items={form.conditions} setItems={(v) => setF({ ...form, conditions: v })} fields={[['name', 'Condition'], ['severity', '', 'sev'], ['notes', 'What staff should know']]} blank={{ name: '', severity: 'mild', notes: '' }} />
        <ListEditor label="Allergies" items={form.allergies} setItems={(v) => setF({ ...form, allergies: v })} fields={[['allergen', 'Allergic to'], ['reaction', 'Reaction'], ['severity', '', 'sev']]} blank={{ allergen: '', reaction: '', severity: 'mild' }} />
        <Field label="Emergency plan" hint="Shown to the child's teachers. A moderate or severe allergy, a severe condition or a plan makes an alert."><textarea dir="auto" className={`${inputCls} min-h-[70px]`} maxLength={1500} value={form.emergencyPlan} onChange={(e) => setF({ ...form, emergencyPlan: e.target.value })} /></Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3"><Field label="Diet"><input className={inputCls} maxLength={300} value={form.diet} onChange={(e) => setF({ ...form, diet: e.target.value })} /></Field><Field label="Doctor"><input className={inputCls} maxLength={80} value={form.doctorName} onChange={(e) => setF({ ...form, doctorName: e.target.value })} /></Field><Field label="Doctor's phone"><input className={inputCls} maxLength={30} value={form.doctorPhone} onChange={(e) => setF({ ...form, doctorPhone: e.target.value })} /></Field></div>
        <div className="flex justify-end"><button className={btnPrimary} onClick={save}>Save plan</button></div>
        {p && <div className="grid gap-2 border-t border-[#e3e7e7] pt-3"><div className="flex items-center justify-between"><h4 className="text-sm font-bold">Medicines</h4><button className={btnGhost} onClick={() => setMed({ name: '', dose: '', times: '', instructions: '', startOn: '', endOn: '' })}><Plus className="h-4 w-4" />Add medicine</button></div>
          {(p.medications || []).length === 0 && <p className="text-sm text-[#5b6b7b]">No medicines.</p>}
          <ul className="grid gap-2">{(p.medications || []).map((m) => <li key={m._id} className="flex flex-wrap items-center gap-2 rounded-xl border border-[#e3e7e7] bg-white p-3 text-sm"><span className="min-w-0 flex-1"><b>{m.name}</b> {m.dose} · {(m.times || []).join(', ') || 'when needed'}{m.endOn && ` · until ${day(m.endOn)}`}</span><Pill value={m.consented ? 'Active' : 'Pending'}>{m.consented ? `Parent agreed${m.consentByName ? ` (${m.consentByName})` : ''}` : 'Waiting for the parent'}</Pill><Pill value={m.active ? 'Approved' : 'None'}>{m.active ? 'In use' : 'Stopped'}</Pill>
            {m.active ? <button className={btnGhost} onClick={() => call(() => apiClient.put(`/care/health/plan/${student._id}/medications/${m._id}`, { active: false }), 'Stopped', g.reload)}>Stop</button> : <button className={btnGhost} onClick={() => call(() => apiClient.put(`/care/health/plan/${student._id}/medications/${m._id}`, { active: true }), 'Started again', g.reload)}>Start again</button>}</li>)}</ul></div>}
        {!p && <Note>Save the plan first, then add medicines.</Note>}
      </div>}</Loading>
      {med && <Modal title="Add a medicine" onClose={() => setMed(null)}><div className="grid gap-3"><Field label="Name"><input className={inputCls} maxLength={80} value={med.name} onChange={(e) => setMed({ ...med, name: e.target.value })} /></Field><Field label="Dose"><input className={inputCls} maxLength={60} value={med.dose} onChange={(e) => setMed({ ...med, dose: e.target.value })} /></Field>
        <Field label="Times each day" hint="For example 08:30 13:00. Leave empty for medicine given only when needed."><input className={inputCls} value={med.times} onChange={(e) => setMed({ ...med, times: e.target.value })} /></Field><Field label="Instructions"><input dir="auto" className={inputCls} maxLength={400} value={med.instructions} onChange={(e) => setMed({ ...med, instructions: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3"><Field label="From"><input type="date" className={inputCls} value={med.startOn} onChange={(e) => setMed({ ...med, startOn: e.target.value })} /></Field><Field label="Until"><input type="date" className={inputCls} value={med.endOn} onChange={(e) => setMed({ ...med, endOn: e.target.value })} /></Field></div>
        <Note>It cannot be given until the parent agrees.</Note><div className="flex justify-end gap-2"><button className={btnGhost} onClick={() => setMed(null)}>Cancel</button><button className={btnPrimary} disabled={med.name.trim().length < 2 || !med.dose.trim()} onClick={addMed}>Add</button></div></div></Modal>}
    </Modal>
  );
}

export function RecordVisit({ onClose, onSaved, fixed }) {
  const [st, setSt] = useState(fixed || null); const [f, setF] = useState({ kind: 'illness', symptoms: '', action: '', temperatureC: '', outcome: 'returned', followUp: '' });
  return (
    <Modal wide title="Record a sick bay visit" onClose={onClose}>
      <div className="grid gap-3">
        <StudentPicker value={st} onPick={setSt} autoFocus />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3"><Field label="What kind?"><select className={inputCls} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="illness">Illness</option><option value="injury">Injury</option><option value="allergy">Allergic reaction</option><option value="medication">Medicine</option><option value="other">Other</option></select></Field>
          <Field label="Temperature (°C)"><input type="number" step="0.1" className={inputCls} value={f.temperatureC} onChange={(e) => setF({ ...f, temperatureC: e.target.value })} /></Field><Field label="What happened next?"><select className={inputCls} value={f.outcome} onChange={(e) => setF({ ...f, outcome: e.target.value })}><option value="returned">Went back to class</option><option value="rested">Rested</option><option value="sent-home">Sent home</option><option value="ambulance">Ambulance called</option></select></Field></div>
        <Field label="What happened?"><textarea dir="auto" className={`${inputCls} min-h-[70px]`} maxLength={500} value={f.symptoms} onChange={(e) => setF({ ...f, symptoms: e.target.value })} /></Field><Field label="What was done?"><input dir="auto" className={inputCls} maxLength={500} value={f.action} onChange={(e) => setF({ ...f, action: e.target.value })} /></Field>
        {['sent-home', 'ambulance'].includes(f.outcome) || f.kind === 'allergy' ? <Note tone="warn">The parent and all administrators will be told straight away.</Note> : <Note>The parent will be told about this visit.</Note>}
        <div className="flex justify-end gap-2"><button className={btnGhost} onClick={onClose}>Cancel</button><button className={btnPrimary} disabled={!st || f.symptoms.trim().length < 3} onClick={() => call(() => apiClient.post('/care/health/incidents', { ...f, studentId: st._id, temperatureC: f.temperatureC === '' ? undefined : Number(f.temperatureC) }), (r) => (r.data.parentsTold ? 'Saved. The parent was told.' : 'Saved'), () => { onSaved && onSaved(); onClose(); })}>Save visit</button></div>
      </div>
    </Modal>
  );
}

function Today() {
  const g = useGet('/care/health/medication/today'); const [no, setNo] = useState(null);
  const log = (d, status, note) => call(() => apiClient.post('/care/health/medication/log', { studentId: d.studentId, medId: d.medId, slot: d.slot, status, note }), status === 'given' ? 'Recorded' : 'Recorded. The parent was told.', async () => { setNo(null); await g.reload(); });
  const doses = g.data?.doses || [];
  return (
    <Loading g={g}><div className="grid gap-3">
      {(g.data?.waitingForConsent || []).length > 0 && <Note>Waiting for a parent to agree: {g.data.waitingForConsent.map((w) => `${w.studentName} (${w.name})`).join(', ')}. These cannot be given yet.</Note>}
      {doses.length === 0 ? <EmptyState title="No medicine due today" text="Medicine with a parent's agreement appears here at its times." /> : <ul className="grid gap-2" aria-label="Medicine due today">{doses.map((d) => <li key={`${d.medId}${d.slot}`} className="flex flex-wrap items-center gap-2 rounded-xl border border-[#e3e7e7] bg-white p-3 text-sm"><b className="w-14">{d.slot || 'As needed'}</b><span className="min-w-0 flex-1"><b>{d.studentName}</b> · {d.name} {d.dose}{d.instructions ? ` · ${d.instructions}` : ''}</span>
        {d.log ? <Pill value={d.log.status === 'given' ? 'Active' : 'Suspended'}>{d.log.status} {d.log.byName ? `· ${d.log.byName}` : ''}</Pill> : <><button className={btnPrimary} onClick={() => log(d, 'given')}>Given</button><button className={btnGhost} onClick={() => setNo({ d, status: 'refused', note: '' })}>Refused</button><button className={btnGhost} onClick={() => setNo({ d, status: 'withheld', note: '' })}>Not given</button></>}</li>)}</ul>}
      {no && <Modal title={`Why was it ${no.status === 'refused' ? 'refused' : 'not given'}?`} onClose={() => setNo(null)}><div className="grid gap-3"><Field label="Reason"><input dir="auto" className={inputCls} maxLength={300} value={no.note} onChange={(e) => setNo({ ...no, note: e.target.value })} /></Field><Note>The parent will be told.</Note><div className="flex justify-end gap-2"><button className={btnGhost} onClick={() => setNo(null)}>Cancel</button><button className={btnPrimary} disabled={no.note.trim().length < 3} onClick={() => log(no.d, no.status, no.note)}>Save</button></div></div></Modal>}
    </div></Loading>
  );
}

function Proposals({ onChanged }) {
  const g = useGet('/care/health/proposals'); const rows = g.data?.proposals || [];
  return (
    <Loading g={g}>{rows.length === 0 ? <EmptyState title="Nothing waiting" text="Health information sent by parents appears here for you to check." /> : <ul className="grid gap-2">{rows.map((r) => <li key={r.studentId} className="grid gap-2 rounded-xl border border-[#e3e7e7] bg-white p-3 text-sm"><div><b>{r.studentName}</b> <span className="text-xs text-[#5b6b7b]">from {r.byName} · {when(r.at)}</span></div>
      <div className="text-xs text-[#3b4a5c]">{[(r.data.allergies || []).map((a) => `Allergy: ${a.allergen} (${a.severity})`), (r.data.conditions || []).map((c) => `Condition: ${c.name}`), (r.data.medications || []).map((m) => `Medicine: ${m.name} ${m.dose}`), r.data.emergencyPlan && `Plan: ${r.data.emergencyPlan}`, r.data.diet && `Diet: ${r.data.diet}`].flat().filter(Boolean).join(' · ')}</div>
      <div className="flex gap-2"><button className={btnPrimary} onClick={() => call(() => apiClient.post(`/care/health/plan/${r.studentId}/proposal`, { accept: true }), 'Added to the plan', async () => { await g.reload(); onChanged(); })}>Add to the plan</button><button className={btnGhost} onClick={() => call(() => apiClient.post(`/care/health/plan/${r.studentId}/proposal`, { accept: false, note: 'Please contact the school office.' }), 'Sent back', async () => { await g.reload(); onChanged(); })}>Send back</button></div></li>)}</ul>}</Loading>
  );
}

// The sick bay: for the nurse
function Nurse() {
  const sm = useGet('/care/health/summary'); const [tab, setTab] = useState('today'); const [st, setSt] = useState(null); const [plan, setPlan] = useState(null); const [visit, setVisit] = useState(false); const [vs, setVs] = useState(null); const s = sm.data;
  const inc = useGet(vs ? '/care/health/incidents' : '/care/health/incidents', vs ? { studentId: vs._id } : { day: s?.day });
  return (
    <div className="grid gap-3">
      {s && <div className="grid grid-cols-2 gap-3 sm:grid-cols-5"><Stat label="Health plans" value={s.plans} /><Stat label="Emergency alerts" value={s.alerts} /><Stat label="Doses today" value={`${s.dosesToday.given}/${s.dosesToday.total}`} sub={`${s.dosesToday.open} still to give`} /><Stat label="Visits today" value={s.incidentsToday} /><Stat label="Parent updates" value={s.proposals} /></div>}
      <div className="flex flex-wrap items-center gap-2"><Tabs label="Sick bay" value={tab} onChange={setTab} items={[['today', 'Medicine today', s?.dosesToday?.open], ['visits', 'Visits'], ['plans', 'Health plans'], ['updates', 'From parents', s?.proposals]]} /><div className="flex-1" /><button className={btnPrimary} onClick={() => setVisit(true)}><Plus className="h-4 w-4" />Record a visit</button></div>
      {tab === 'today' && <Today />}
      {tab === 'visits' && <div className="grid gap-2"><StudentPicker label="Show visits for" value={vs} onPick={setVs} /><Loading g={inc}>{(inc.data?.incidents || []).length === 0 ? <EmptyState title="No visits" text={vs ? 'This child has no recorded visits.' : 'Nobody has visited the sick bay today.'} /> : <ul className="grid gap-2">{inc.data.incidents.map((i) => <li key={i._id} className="rounded-xl border border-[#e3e7e7] bg-white p-3 text-sm"><div className="flex flex-wrap items-center gap-2"><b>{i.studentName}</b><Pill value={['sent-home', 'ambulance'].includes(i.outcome) ? 'Suspended' : 'None'}>{i.outcome}</Pill><span className="text-xs text-[#5b6b7b]">{i.kind} · {when(i.at)} · {i.loggedByName}{i.temperatureC ? ` · ${i.temperatureC} °C` : ''}</span></div><p dir="auto" className="mt-1">{i.symptoms}{i.action ? ` — ${i.action}` : ''}</p></li>)}</ul>}</Loading></div>}
      {tab === 'plans' && <div className="grid gap-2 sm:max-w-md"><StudentPicker label="Open a child's health plan" value={st} onPick={(x) => { setSt(null); if (x) setPlan(x); }} /></div>}
      {tab === 'updates' && <Proposals onChanged={sm.reload} />}
      {plan && <PlanEditor student={plan} onClose={() => { setPlan(null); sm.reload(); }} />}
      {visit && <RecordVisit onClose={() => setVisit(false)} onSaved={() => { sm.reload(); inc.reload(); }} />}
    </div>
  );
}

// What a teacher sees: alerts for the children they teach, and a way to log a visit
function TeacherHealth() {
  const g = useGet('/care/health/alerts'); const [visit, setVisit] = useState(false); const rows = g.data?.alerts || [];
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2"><p className="flex-1 text-sm text-[#3b4a5c]">Emergency information for children you teach. Keep it private.</p><button className={btnPrimary} onClick={() => setVisit(true)}><Plus className="h-4 w-4" />Record a visit</button></div>
      <Loading g={g}>{rows.length === 0 ? <EmptyState title="No alerts" text="None of your children has an emergency health alert." /> : <ul className="grid gap-2" aria-label="Health alerts">{rows.map((a) => <li key={a.studentId} className="rounded-xl border border-[#e3b4ac] bg-[#fff8f6] p-3 text-sm"><div className="flex items-center gap-2 font-bold"><AlertTriangle className="h-4 w-4 text-[#9f1239]" aria-hidden />{a.studentName}</div>
        <div className="mt-1 flex flex-wrap gap-1.5">{a.allergies.map((x, i) => <Pill key={i} value={SEV_TONE[x.severity]}>{x.allergen}{x.reaction ? ` — ${x.reaction}` : ''} ({x.severity})</Pill>)}{a.conditions.map((x, i) => <Pill key={`c${i}`} value="Suspended">{x.name}</Pill>)}</div>
        {a.emergencyPlan && <p dir="auto" className="mt-1.5"><b>If it happens:</b> {a.emergencyPlan}</p>}{a.diet && <p className="text-xs text-[#5b6b7b]">Diet: {a.diet}</p>}</li>)}</ul>}</Loading>
      {visit && <RecordVisit onClose={() => setVisit(false)} />}
    </div>
  );
}
export default function CareHealth({ caps }) { return caps.health ? <Nurse /> : <TeacherHealth />; }
