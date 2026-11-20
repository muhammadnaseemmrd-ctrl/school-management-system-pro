import React, { useState } from 'react';
import { Card, Modal, Pill, Field, EmptyState, btnPrimary, btnGhost, btnDanger, inputCls, errMsg } from '../ui';
import apiClient from '../../utils/apiClient';
import { toast } from 'react-hot-toast';
import { openPdf } from '../omr/omrKit';
import { call, useGet, Loading, Note, Tabs } from './earlyKit';
import PlayArea from './PlayArea';

const KINDS = ['phonics', 'tracing', 'matching', 'story', 'audio', 'worksheet', 'motor', 'sensory', 'routine', 'game', 'other'];
const LIC = { own: 'Our own work', open: 'Open licence', licensed: 'Licensed to us', unknown: 'Source not stated' };
const readB64 = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });

function Form({ base, onClose, onDone, isAdmin }) {
  const [a, setA] = useState(base || { title: '', kind: 'sensory', lang: 'en', ageFromMonths: 24, ageToMonths: 60, summary: '', materials: [], steps: [''], body: '', transcript: '', safety: { supervision: 'adult-near', smallParts: false, allergens: false, notes: '' }, license: { kind: 'own', statement: '' }, durationMin: 15, groupMin: 1, groupMax: 6 });
  const [issues, setIssues] = useState([]); const set = (k, v) => setA({ ...a, [k]: v }); const num = (k) => (e) => set(k, Number(e.target.value)); const sf = (k, v) => set('safety', { ...a.safety, [k]: v }); const lc = (k, v) => set('license', { ...a.license, [k]: v });
  const body = () => ({ ...a, steps: a.steps.filter((s) => s.trim()), materials: a.materials.filter((s) => s.trim()) });
  const save = async (publish) => {
    try { const r = a._id ? await apiClient.put(`/early/activities/${a._id}`, body()) : await apiClient.post('/early/activities', body()); const id = r.data.activity._id; if (publish) { try { await apiClient.post(`/early/activities/${id}/publish`); toast.success('Published'); } catch (e) { if (e.response?.data?.issues) { setIssues(e.response.data.issues); setA({ ...a, _id: id }); return; } throw e; } } else toast.success('Saved as a draft'); onDone(); } catch (e) { toast.error(errMsg(e)); }
  };
  const audio = async (file) => { if (!a._id) { toast('Save the draft first, then add a recording.'); return; } try { await apiClient.put(`/early/activities/${a._id}/audio`, { audio: await readB64(file) }); toast.success('Recording saved'); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <Modal title={a._id ? 'Edit activity' : 'New activity'} onClose={onClose} wide>
      <div className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-2"><Field label="Title"><input className={inputCls} value={a.title} onChange={(e) => set('title', e.target.value)} /></Field><Field label="Kind"><select className={inputCls} value={a.kind} onChange={(e) => set('kind', e.target.value)}>{KINDS.map((k) => <option key={k}>{k}</option>)}</select></Field>
          <Field label="From age (months)"><input className={inputCls} type="number" value={a.ageFromMonths} onChange={num('ageFromMonths')} /></Field><Field label="To age (months)"><input className={inputCls} type="number" value={a.ageToMonths} onChange={num('ageToMonths')} /></Field>
          <Field label="Smallest group"><input className={inputCls} type="number" value={a.groupMin} onChange={num('groupMin')} /></Field><Field label="Largest group"><input className={inputCls} type="number" value={a.groupMax} onChange={num('groupMax')} /></Field></div>
        <Field label="One line about it"><input className={inputCls} value={a.summary} onChange={(e) => set('summary', e.target.value)} /></Field>
        <Field label="Materials (one per line)"><textarea className={inputCls} rows={2} value={a.materials.join('\n')} onChange={(e) => set('materials', e.target.value.split('\n'))} /></Field>
        <Field label="Steps (one per line)"><textarea className={inputCls} rows={4} value={a.steps.join('\n')} onChange={(e) => set('steps', e.target.value.split('\n'))} /></Field>
        {['story', 'audio'].includes(a.kind) && <><Field label="Story text"><textarea className={inputCls} rows={3} dir="auto" value={a.body} onChange={(e) => set('body', e.target.value)} /></Field><Field label="Transcript (required for audio)"><textarea className={inputCls} rows={3} dir="auto" value={a.transcript} onChange={(e) => set('transcript', e.target.value)} /></Field><Field label="Recording (up to 1 MB, about two minutes)"><input type="file" accept="audio/*" aria-label="Recording" onChange={(e) => e.target.files[0] && audio(e.target.files[0])} /></Field></>}
        <fieldset className="grid gap-2 rounded-xl border border-[#e3e7e7] p-3"><legend className="px-1 text-xs font-semibold">Safety</legend>
          <div className="grid gap-2 sm:grid-cols-3"><Field label="Adult"><select className={inputCls} value={a.safety.supervision} onChange={(e) => sf('supervision', e.target.value)}><option value="adult-close">An adult close beside the child</option><option value="adult-near">An adult near</option><option value="adult-present">An adult in the room</option></select></Field><label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={a.safety.smallParts} onChange={(e) => sf('smallParts', e.target.checked)} /> Small parts</label><label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={a.safety.allergens} onChange={(e) => sf('allergens', e.target.checked)} /> Food or allergens</label></div></fieldset>
        <fieldset className="grid gap-2 rounded-xl border border-[#e3e7e7] p-3"><legend className="px-1 text-xs font-semibold">Where it came from</legend>
          <select className={inputCls} aria-label="Source" value={a.license.kind} onChange={(e) => lc('kind', e.target.value)}>{Object.entries(LIC).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <input className={inputCls} aria-label="Licence statement" placeholder="Licence statement or who made it" value={a.license.statement} onChange={(e) => lc('statement', e.target.value)} />
          {a.license.kind !== 'own' && !isAdmin && <Note>Only an administrator can publish content that is not your own work.</Note>}</fieldset>
        {issues.length > 0 && <Note tone="warn"><ul className="list-disc ps-5">{issues.map((i) => <li key={i}>{i}</li>)}</ul></Note>}
        <div className="flex justify-end gap-2"><button className={btnGhost} onClick={onClose}>Cancel</button><button className={btnGhost} onClick={() => save(false)}>Save draft</button><button className={btnPrimary} onClick={() => save(true)}>Save and publish</button></div>
      </div>
    </Modal>
  );
}

function Library({ isAdmin, onPlan }) {
  const [f, setF] = useState({ q: '', kind: '', age: '' }); const g = useGet('/early/activities', { ...(f.q ? { q: f.q } : {}), ...(f.kind ? { kind: f.kind } : {}), ...(f.age ? { ageMonths: f.age } : {}) }); const [open, setOpen] = useState(null); const [edit, setEdit] = useState(null);
  const copy = (a) => call(() => apiClient.post('/early/activities/copy', { ref: a.ref }), 'Copied as a draft', () => { setOpen(null); g.reload(); });
  const show = async (a) => { const r = await apiClient.get(`/early/activities/${encodeURIComponent(a.ref)}`); setOpen(r.data.activity); };
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2"><input className={`${inputCls} max-w-xs`} aria-label="Search activities" placeholder="Search" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} /><select className={`${inputCls} w-40`} aria-label="Kind" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="">Every kind</option>{KINDS.map((k) => <option key={k}>{k}</option>)}</select><input className={`${inputCls} w-36`} type="number" aria-label="Child's age in months" placeholder="Age (months)" value={f.age} onChange={(e) => setF({ ...f, age: e.target.value })} /><button className={btnPrimary} onClick={() => setEdit({})}>New activity</button></div>
      <Loading g={g}>{(g.data?.activities || []).length === 0 ? <Card><EmptyState title="No activities match" /></Card> : (
        <div className="grid gap-2 sm:grid-cols-2">{g.data.activities.map((a) => (
          <Card key={a.ref} className="!p-3"><div className="flex flex-wrap items-center gap-2"><b className="flex-1">{a.title}</b>{a.origin === 'aulensia' ? <Pill value="Approved">Aulensia</Pill> : <Pill value={a.state === 'Published' ? 'Active' : 'Pending'}>{a.state}</Pill>}</div><div className="text-xs text-[#5b6b7b]">{a.kind} · {a.ageFromMonths}–{a.ageToMonths} months · {a.durationMin} min</div><p className="mt-1 text-sm">{a.summary}</p>
            <div className="mt-2 flex gap-2"><button className={btnGhost} onClick={() => show(a)}>Open</button>{a.state === 'Published' && <button className={btnGhost} onClick={() => onPlan(a)}>Plan it</button>}</div></Card>))}</div>)}</Loading>
      {open && <Modal title={open.title} onClose={() => setOpen(null)} wide><div className="grid gap-3"><div className="flex flex-wrap gap-2 text-xs"><Pill value="None">{open.kind}</Pill><Pill value="None">{open.ageFromMonths}–{open.ageToMonths} months</Pill><Pill value="None">group of {open.groupMin}–{open.groupMax}</Pill><Pill value={open.safety?.smallParts ? 'Pending' : 'None'}>{open.safety?.supervision?.replace('adult-', 'adult ')}</Pill></div>
        {open.materials.length > 0 && <div><b className="text-sm">Materials</b><ul className="list-disc ps-5 text-sm">{open.materials.map((m) => <li key={m}>{m}</li>)}</ul></div>}{open.steps.length > 0 && <div><b className="text-sm">Steps</b><ol className="list-decimal ps-5 text-sm">{open.steps.map((m) => <li key={m}>{m}</li>)}</ol></div>}{open.body && <p className="whitespace-pre-wrap text-sm" dir="auto">{open.body}</p>}
        <p className="text-xs text-[#5b6b7b]">{LIC[open.license?.kind] || 'Original to Aulensia'}{open.license?.statement ? ` · ${open.license.statement}` : ''}</p>
        <div className="flex justify-end gap-2">{open.state === 'Draft' && <button className={btnGhost} onClick={() => { setEdit(open); setOpen(null); }}>Edit</button>}<button className={btnPrimary} onClick={() => copy(open)}>Make our own copy</button></div></div></Modal>}
      {edit && <Form base={edit._id ? edit : null} isAdmin={isAdmin} onClose={() => setEdit(null)} onDone={() => { setEdit(null); g.reload(); }} />}
    </div>
  );
}

function Plans({ roomId, roster, preset, clearPreset }) {
  const g = useGet('/early/plans', { roomId }); const [add, setAdd] = useState(!!preset); const [form, setForm] = useState({ activityRef: preset?.ref || '', slot: 'Morning', groupName: '', childIds: [] }); const [done, setDone] = useState(null); const lib = useGet('/early/activities', { state: 'Published' });
  const create = () => call(() => apiClient.post('/early/plans', { roomId, ...form }), (r) => r.data.warning || 'Planned', () => { setAdd(false); clearPreset(); g.reload(); });
  const skip = (p) => call(() => apiClient.post(`/early/plans/${p._id}/skip`, { outcome: 'Not today' }), 'Skipped', g.reload);
  return (
    <div className="grid gap-3">
      <div className="flex justify-end"><button className={btnPrimary} onClick={() => setAdd(true)}>Plan a small group</button></div>
      <Loading g={g}>{(g.data?.plans || []).length === 0 ? <Card><EmptyState title="Nothing planned today" text="Choose an activity from the library and a small group of children." /></Card> : (
        <Card className="!p-0 overflow-hidden"><ul>{g.data.plans.map((p) => (
          <li key={p._id} className="flex flex-wrap items-center gap-3 border-t border-[#e3e7e7] px-3 py-2 first:border-t-0"><Pill value="None">{p.slot}</Pill><div className="min-w-[10rem] flex-1"><div className="font-semibold">{p.activityTitle}</div><div className="text-xs text-[#5b6b7b]">{p.groupName ? `${p.groupName}: ` : ''}{p.children.map((c) => c.name).join(', ')}</div></div>
            <Pill value={p.status === 'Done' ? 'Active' : p.status === 'Skipped' ? 'Suspended' : 'Pending'}>{p.status}</Pill>
            {p.status === 'Planned' && <><button className={btnPrimary} onClick={() => setDone(p)}>Finish</button><button className={btnGhost} onClick={() => skip(p)}>Skip</button></>}
            <button className={btnGhost} onClick={() => openPdf(`/early/worksheets/observation?roomId=${roomId}&planId=${p._id}`)}>Observation sheet</button></li>))}</ul></Card>)}</Loading>
      {add && <Modal title="Plan a small group" onClose={() => { setAdd(false); clearPreset(); }} wide><div className="grid gap-3">
        <Field label="Activity"><select className={inputCls} value={form.activityRef} onChange={(e) => setForm({ ...form, activityRef: e.target.value })}><option value="">Choose…</option>{(lib.data?.activities || []).filter((a) => a.state === 'Published').map((a) => <option key={a.ref} value={a.ref}>{a.title}</option>)}</select></Field>
        <div className="grid gap-3 sm:grid-cols-2"><Field label="When"><select className={inputCls} value={form.slot} onChange={(e) => setForm({ ...form, slot: e.target.value })}>{['Morning', 'Midday', 'Afternoon'].map((s) => <option key={s}>{s}</option>)}</select></Field><Field label="Group name (optional)"><input className={inputCls} value={form.groupName} onChange={(e) => setForm({ ...form, groupName: e.target.value })} /></Field></div>
        <fieldset><legend className="mb-1 text-xs font-semibold">Who is in the group? (up to 12)</legend><div className="flex flex-wrap gap-2">{roster.map((c) => <label key={c._id} className="flex items-center gap-1 text-sm"><input type="checkbox" checked={form.childIds.includes(c._id)} onChange={() => setForm({ ...form, childIds: form.childIds.includes(c._id) ? form.childIds.filter((x) => x !== c._id) : [...form.childIds, c._id] })} />{c.name}</label>)}</div></fieldset>
        <div className="flex justify-end"><button className={btnPrimary} disabled={!form.activityRef || !form.childIds.length} onClick={create}>Add to the plan</button></div></div></Modal>}
      {done && <Finish plan={done} onClose={() => setDone(null)} onDone={() => { setDone(null); g.reload(); }} />}
    </div>
  );
}

function Finish({ plan, onClose, onDone }) {
  const fw = useGet('/early/frameworks', { full: 1 }); const [outcome, setOutcome] = useState(''); const [obs, setObs] = useState({}); const items = (fw.data?.frameworks || []).find((f) => f.origin === 'aulensia')?.areas?.flatMap((a) => a.items) || [];
  const submit = () => call(() => apiClient.post(`/early/plans/${plan._id}/done`, { outcome, observations: Object.entries(obs).filter(([, v]) => v.itemKey && v.level).map(([childId, v]) => ({ childId, ...v })) }), (r) => `Finished. ${r.data.observations} observations saved.`, onDone);
  return (
    <Modal title={`Finish: ${plan.activityTitle}`} onClose={onClose} wide><div className="grid gap-3"><Note>Optionally note what you saw for each child. Each child who is here gets an activity entry in today's log.</Note>
      {plan.children.map((c) => <div key={c._id} className="grid gap-2 sm:grid-cols-[8rem_1fr_9rem]"><div className="self-center text-sm font-semibold">{c.name}</div>
        <select className={inputCls} aria-label={`Milestone for ${c.name}`} value={obs[c._id]?.itemKey || ''} onChange={(e) => setObs({ ...obs, [c._id]: { ...obs[c._id], itemKey: e.target.value, level: obs[c._id]?.level || 'Practising' } })}><option value="">Nothing to note</option>{items.map((i) => <option key={i.key} value={i.key}>{i.label}</option>)}</select>
        <select className={inputCls} aria-label={`Level for ${c.name}`} value={obs[c._id]?.level || ''} onChange={(e) => setObs({ ...obs, [c._id]: { ...obs[c._id], level: e.target.value } })}>{['Exploring', 'Practising', 'Confident'].map((l) => <option key={l}>{l}</option>)}</select></div>)}
      <Field label="How did it go? (optional)"><input className={inputCls} value={outcome} onChange={(e) => setOutcome(e.target.value)} /></Field><div className="flex justify-end gap-2"><button className={btnGhost} onClick={onClose}>Cancel</button><button className={btnPrimary} onClick={submit}>Finish</button></div></div></Modal>
  );
}

function Routines({ roomId }) {
  const g = useGet('/early/routines', { roomId }); const icons = useGet('/early/icons'); const [e, setE] = useState(null);
  const blank = () => ({ name: '', shareWithFamilies: true, steps: [{ at: '08:30', icon: 'arrive', minutes: 20 }] });
  const save = () => call(() => (e._id ? apiClient.put(`/early/routines/${e._id}`, e) : apiClient.post('/early/routines', { roomId, ...e })), 'Saved', () => { setE(null); g.reload(); });
  const upd = (i, p) => setE({ ...e, steps: e.steps.map((s, j) => (j === i ? { ...s, ...p } : s)) });
  return (
    <div className="grid gap-3"><div className="flex justify-end"><button className={btnPrimary} onClick={() => setE(blank())}>New routine</button></div>
      <Loading g={g}>{(g.data?.routines || []).length === 0 ? <Card><EmptyState title="No visual routine yet" text="A picture timetable helps children know what comes next. Families can see it too." /></Card> : g.data.routines.map((r) => (
        <Card key={r._id}><div className="mb-2 flex items-center gap-2"><b className="flex-1">{r.name}</b>{r.shareWithFamilies ? <Pill value="Active">Shared with families</Pill> : <Pill value="None">Staff only</Pill>}<button className={btnGhost} onClick={() => setE(r)}>Edit</button><button className={btnDanger} onClick={() => call(() => apiClient.delete(`/early/routines/${r._id}`), 'Removed', g.reload)}>Remove</button></div>
          <ol className="flex flex-wrap gap-3">{r.steps.map((s, i) => <li key={i} className="w-24 rounded-xl border border-[#e3e7e7] p-2 text-center"><div className="text-xs text-[#5b6b7b]">{s.at}</div><div className="text-sm font-semibold">{s.label}</div><div className="text-[11px] text-[#5b6b7b]">{s.minutes} min</div></li>)}</ol></Card>))}</Loading>
      {e && <Modal title={e._id ? 'Edit routine' : 'New routine'} onClose={() => setE(null)} wide><div className="grid gap-3"><Field label="Name"><input className={inputCls} value={e.name} onChange={(ev) => setE({ ...e, name: ev.target.value })} /></Field><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={e.shareWithFamilies} onChange={(ev) => setE({ ...e, shareWithFamilies: ev.target.checked })} /> Show this routine to families</label>
        {e.steps.map((s, i) => <div key={i} className="grid gap-2 sm:grid-cols-[6rem_1fr_1fr_5rem_auto]"><input type="time" className={inputCls} aria-label="Time" value={s.at} onChange={(ev) => upd(i, { at: ev.target.value })} /><select className={inputCls} aria-label="Picture" value={s.icon} onChange={(ev) => upd(i, { icon: ev.target.value })}>{(icons.data?.icons || []).map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select><input className={inputCls} aria-label="Words" placeholder="Words (optional)" value={s.label || ''} onChange={(ev) => upd(i, { label: ev.target.value })} /><input className={inputCls} type="number" aria-label="Minutes" value={s.minutes} onChange={(ev) => upd(i, { minutes: Number(ev.target.value) })} /><button className={btnGhost} onClick={() => setE({ ...e, steps: e.steps.filter((_, j) => j !== i) })}>Remove</button></div>)}
        <button className={`${btnGhost} justify-self-start`} onClick={() => setE({ ...e, steps: [...e.steps, { at: e.steps.at(-1)?.at || '09:00', icon: 'play', minutes: 15 }] })}>Add a step</button><div className="flex justify-end"><button className={btnPrimary} onClick={save}>Save routine</button></div></div></Modal>}
    </div>
  );
}

function Sheets() {
  const [text, setText] = useState('ABC'); const [pattern, setPattern] = useState(''); const [rows, setRows] = useState(4);
  return (
    <Card><h3 className="mb-2 font-bold">Tracing sheet</h3><div className="grid max-w-xl gap-3 sm:grid-cols-3"><Field label="Letters or numbers" hint="Up to 12"><input className={inputCls} value={text} maxLength={12} disabled={!!pattern} onChange={(e) => setText(e.target.value)} /></Field><Field label="Or a pattern"><select className={inputCls} value={pattern} onChange={(e) => setPattern(e.target.value)}><option value="">None</option>{['lines', 'zigzag', 'waves', 'loops', 'circles'].map((p) => <option key={p}>{p}</option>)}</select></Field><Field label="Rows"><input className={inputCls} type="number" min={1} max={8} value={rows} onChange={(e) => setRows(Number(e.target.value))} /></Field></div>
      <button className={`${btnPrimary} mt-3`} onClick={() => openPdf(`/early/worksheets/tracing?${pattern ? `pattern=${pattern}` : `text=${encodeURIComponent(text)}`}&rows=${rows}`).catch((e) => toast.error(errMsg(e, 'Could not make the sheet')))}>Open printable sheet</button></Card>
  );
}

export default function ActivityDesk({ roomId, isAdmin }) {
  const [tab, setTab] = useState('library'); const [preset, setPreset] = useState(null); const room = useGet(`/early/rooms/${roomId}`);
  return (
    <div className="grid gap-3"><Tabs label="Activities" value={tab} onChange={setTab} items={[['library', 'Activity library'], ['plans', "Today's groups"], ['routines', 'Visual routines'], ['sheets', 'Printable sheets'], ['play', 'Practice with a child']]} />
      {tab === 'library' && <Library isAdmin={isAdmin} onPlan={(a) => { setPreset(a); setTab('plans'); }} />}
      {tab === 'plans' && room.data && <Plans roomId={roomId} roster={room.data.children} preset={preset} clearPreset={() => setPreset(null)} />}
      {tab === 'routines' && <Routines roomId={roomId} />}{tab === 'sheets' && <Sheets />}
      {tab === 'play' && room.data && <PracticePick roster={room.data.children} />}
    </div>
  );
}
function PracticePick({ roster }) {
  const [id, setId] = useState('');
  return <div className="grid gap-3"><Field label="Practising with (optional, to note what you saw)"><select className={inputCls} value={id} onChange={(e) => setId(e.target.value)}><option value="">Just playing</option>{roster.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}</select></Field><PlayArea childId={id || undefined} childName={roster.find((c) => c._id === id)?.name} /></div>;
}
