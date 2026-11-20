import React, { useEffect, useState } from 'react';
import { Card, Modal, Pill, Field, EmptyState, btnPrimary, btnGhost, btnDanger, inputCls, errMsg } from '../ui';
import apiClient from '../../utils/apiClient';
import { toast } from 'react-hot-toast';
import { call, useGet, hm, Loading, Note, Tabs, AuthImg, STATUS_WORD, STATUS_TONE } from './earlyKit';
import PlayArea from './PlayArea';

const LEVEL_WORD = { Exploring: 'Starting to explore', Practising: 'Practising', Confident: 'Confident' };

function Post({ p, childId, onRead }) {
  useEffect(() => { if (!p.read) apiClient.post(`/early/family/posts/${p._id}/read`).then(onRead).catch(() => {}); }, [p._id, p.read, onRead]);
  return (
    <Card><div className="mb-2 flex flex-wrap items-center gap-2"><b>{new Date(`${p.day}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</b>{p.kind === 'portfolio' && <Pill value="Approved">Learning portfolio</Pill>}{!p.read && <Pill value="Pending">New</Pill>}</div>
      {p.title && <h4 className="font-bold">{p.title}</h4>}
      {p.body && <p className="whitespace-pre-wrap text-base leading-relaxed" dir="auto">{p.body}</p>}
      {p.lines.length > 0 && <ul className="mt-2 grid gap-1 text-sm" dir="auto">{p.lines.map((l, i) => <li key={i}><span className="text-[#5b6b7b]">{l.time}</span> {l.text}</li>)}</ul>}
      {p.photos.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{p.photos.map((m) => <figure key={m._id} className="w-40"><AuthImg src={`/early/media/${m._id}/image`} alt={m.alt} className="h-32 w-40 rounded-xl object-cover" />{m.caption && <figcaption className="text-xs text-[#5b6b7b]">{m.caption}</figcaption>}</figure>)}</div>}
      {p.observations.length > 0 && <div className="mt-3 rounded-xl bg-[#f7f6f2] p-3 text-sm"><b>Something new we noticed</b><ul className="mt-1 grid gap-1">{p.observations.map((o, i) => <li key={i}>{o.label} <Pill value="Approved">{LEVEL_WORD[o.level]}</Pill>{o.note ? ` — ${o.note}` : ''}</li>)}</ul></div>}
      {p.teacherComment && <p className="mt-3 border-s-4 border-[#2a5cac] ps-3 text-sm italic" dir="auto">{p.teacherComment}</p>}
      <div className="mt-2 text-xs text-[#5b6b7b]">From {p.authorName}</div></Card>
  );
}

function Diary({ child, reload }) {
  const g = useGet(`/early/family/children/${child._id}/feed`, { limit: 20 });
  return <Loading g={g}>{(g.data?.posts || []).length === 0 ? <Card><EmptyState title="No diary entries yet" text="When the nursery shares a day with you it will appear here." /></Card> : <div className="grid gap-3">{g.data.posts.map((p) => <Post key={p._id} p={p} childId={child._id} onRead={reload} />)}</div>}</Loading>;
}

function Today({ child }) {
  const t = child.today; const r = useGet(`/early/family/children/${child._id}/routine`);
  return (
    <div className="grid gap-3"><Card>{t ? <div className="flex flex-wrap items-center gap-3"><Pill value={STATUS_TONE[t.status]}>{STATUS_WORD[t.status]}</Pill><span className="text-sm">{t.status === 'In' ? `Arrived at ${hm(t.inAt)}` : t.status === 'Out' ? `Collected at ${hm(t.outAt)}${t.collector ? ` by ${t.collector}` : ''}` : t.status === 'Absent' ? 'Marked absent today' : 'Not here yet today'}</span></div> : <p className="text-sm">Attendance is not shared on this account.</p>}</Card>
      <Loading g={r}>{(r.data?.routines || []).map((x) => <Card key={x._id}><h4 className="mb-2 font-bold">{x.name}</h4><ol className="flex flex-wrap gap-3">{x.steps.map((s, i) => <li key={i} className="w-24 rounded-xl border border-[#e3e7e7] p-2 text-center"><div className="text-xs text-[#5b6b7b]">{s.at}</div><div className="text-sm font-semibold">{s.label}</div></li>)}</ol></Card>)}</Loading></div>
  );
}

function PickupForm({ child, base, onClose, onDone }) {
  const [f, setF] = useState(base || { action: 'add', personName: '', relationship: '', phone: '', validTo: '' });
  const go = () => call(() => apiClient.post(`/early/family/children/${child._id}/pickup`, { ...f, validTo: f.validTo || undefined }), (r) => r.data.message, onDone);
  return (
    <Modal title={f.action === 'add' ? 'Ask for someone to be added' : f.action === 'pause' ? `Pause ${f.personName}` : `Remove ${f.personName}`} onClose={onClose}><div className="grid gap-3">
      <Note>Nothing changes until the nursery has confirmed this with you by phone or in person.</Note>
      {f.action === 'add' && <><Field label="Their full name"><input className={inputCls} value={f.personName} onChange={(e) => setF({ ...f, personName: e.target.value })} /></Field><Field label="How are they related to your child?"><input className={inputCls} value={f.relationship} onChange={(e) => setF({ ...f, relationship: e.target.value })} /></Field><Field label="Their phone number"><input className={inputCls} inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field><Field label="Until (optional)" hint="Leave empty if there is no end date."><input type="date" className={inputCls} value={f.validTo} onChange={(e) => setF({ ...f, validTo: e.target.value })} /></Field></>}
      {f.action === 'pause' && <Field label="They may collect again from"><input type="date" className={inputCls} value={f.validTo} onChange={(e) => setF({ ...f, validTo: e.target.value })} /></Field>}
      <div className="flex justify-end gap-2"><button className={btnGhost} onClick={onClose}>Cancel</button><button className={btnPrimary} onClick={go}>Send to the nursery</button></div></div></Modal>
  );
}

function Pickup({ child }) {
  const g = useGet(`/early/family/children/${child._id}/pickup`); const [f, setF] = useState(null); const d = g.data;
  return (
    <Loading g={g}>{d && <div className="grid gap-3"><Note>{d.note}</Note>
      <Card><div className="mb-2 flex items-center justify-between"><h4 className="font-bold">Who may collect {child.name}</h4><button className={btnPrimary} onClick={() => setF({ action: 'add', personName: '', relationship: '', phone: '', validTo: '' })}>Add someone</button></div>
        <ul className="divide-y divide-[#e3e7e7]">{d.people.map((p, i) => <li key={p.linkId || i} className="flex flex-wrap items-center gap-2 py-2"><span className="min-w-[8rem] flex-1">{p.name} <span className="text-xs text-[#5b6b7b]">{p.relationship}</span></span>{p.paused && <Pill value="Pending">Paused until {new Date(p.resumesOn).toLocaleDateString('en-GB')}</Pill>}{p.kind === 'guardian' && <Pill value="None">Parent or guardian</Pill>}
          {p.canChange && <>{!p.paused && <button className={btnGhost} onClick={() => setF({ action: 'pause', linkId: p.linkId, personName: p.name, validTo: '' })}>Pause</button>}<button className={btnDanger} onClick={() => setF({ action: 'remove', linkId: p.linkId, personName: p.name })}>Remove</button></>}</li>)}{d.people.length === 0 && <li className="py-2 text-sm text-[#5b6b7b]">Nobody is on the list yet.</li>}</ul></Card>
      <Card><h4 className="mb-2 font-bold">Your requests</h4>{d.requests.length === 0 ? <p className="text-sm text-[#5b6b7b]">No requests.</p> : <ul className="divide-y divide-[#e3e7e7]">{d.requests.map((r) => <li key={r._id} className="flex flex-wrap items-center gap-2 py-2 text-sm"><span className="flex-1">{r.action === 'add' ? 'Add' : r.action === 'pause' ? 'Pause' : 'Remove'} {r.personName}</span><Pill value={{ Requested: 'Pending', Verified: 'Approved', Applied: 'Active', Declined: 'Suspended', Cancelled: 'None' }[r.state]}>{{ Requested: 'Waiting for the nursery to contact you', Verified: 'Confirmed, being applied', Applied: 'Done', Declined: 'Not applied', Cancelled: 'Cancelled' }[r.state]}</Pill>{r.decidedNote && <span className="text-xs">{r.decidedNote}</span>}{['Requested', 'Verified'].includes(r.state) && <button className={btnGhost} onClick={() => call(() => apiClient.post(`/early/family/pickup/${r._id}/cancel`), 'Cancelled', g.reload)}>Cancel</button>}</li>)}</ul>}</Card>
      {f && <PickupForm child={child} base={f} onClose={() => setF(null)} onDone={() => { setF(null); g.reload(); }} />}</div>}</Loading>
  );
}

function Profile({ child }) {
  const g = useGet(`/early/family/children/${child._id}/profile`); const c = useGet(`/early/family/children/${child._id}/consent`); const [e, setE] = useState(null); const d = g.data;
  const toggle = (k, v) => call(() => apiClient.put(`/early/family/children/${child._id}/consent`, { [k]: v }), 'Saved', c.reload);
  const send = () => call(() => apiClient.post(`/early/family/children/${child._id}/profile`, e), (r) => r.data.message, () => { setE(null); g.reload(); });
  const row = (k, i, p) => setE({ ...e, [k]: e[k].map((x, j) => (j === i ? { ...x, ...p } : x)) });
  return (
    <div className="grid gap-3">
      <Loading g={c}>{c.data && <Card><h4 className="mb-2 font-bold">What the nursery may share</h4><div className="grid gap-2">{[['journal', 'A daily diary about my child'], ['photos', 'Photos of my child in diary entries'], ['portfolio', 'A learning portfolio']].map(([k, l]) => <label key={k} className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={!!c.data.consent[k]} onChange={(ev) => toggle(k, ev.target.checked)} /> {l}</label>)}</div><p className="mt-2 text-xs text-[#5b6b7b]">You can change this at any time. Turning off photos hides them straight away.</p></Card>}</Loading>
      <Loading g={g}>{d && <Card><div className="mb-2 flex items-center justify-between"><h4 className="font-bold">Health and safety information</h4><button className={btnGhost} onClick={() => setE({ allergies: d.profile.allergies.map(({ what, severity, action }) => ({ what, severity, action })), diet: d.profile.diet, medicalAlert: d.profile.medicalAlert, emergencyContacts: d.profile.emergencyContacts, comfort: d.profile.comfort })}>Send an update</button></div>
        {d.waiting > 0 && <Note>You sent an update. The nursery will confirm it with you before it is added.</Note>}
        <dl className="mt-2 grid gap-2 text-sm"><div><dt className="font-semibold">Allergies</dt><dd>{d.profile.allergies.length ? d.profile.allergies.map((a) => `${a.what} (${a.severity})`).join(', ') : 'None recorded'}</dd></div><div><dt className="font-semibold">Diet</dt><dd>{d.profile.diet || '—'}</dd></div><div><dt className="font-semibold">Alert</dt><dd>{d.profile.medicalAlert || '—'}</dd></div><div><dt className="font-semibold">Emergency contacts</dt><dd>{d.profile.emergencyContacts.length ? d.profile.emergencyContacts.map((x) => `${x.name} ${x.phone}`).join(' · ') : '—'}</dd></div></dl></Card>}</Loading>
      {e && <Modal title="Send an update" onClose={() => setE(null)} wide><div className="grid gap-3"><Note>The nursery will phone you to confirm before this is added. Please send the full list, not only what has changed.</Note>
        <div className="grid gap-2">{e.allergies.map((a, i) => <div key={i} className="grid gap-2 sm:grid-cols-[1fr_8rem_2fr_auto]"><input className={inputCls} aria-label="Allergy" placeholder="Allergy" value={a.what} onChange={(ev) => row('allergies', i, { what: ev.target.value })} /><select className={inputCls} aria-label="Severity" value={a.severity} onChange={(ev) => row('allergies', i, { severity: ev.target.value })}>{['mild', 'moderate', 'severe'].map((s) => <option key={s}>{s}</option>)}</select><input className={inputCls} aria-label="What to do" placeholder="What the nursery should do" value={a.action} onChange={(ev) => row('allergies', i, { action: ev.target.value })} /><button className={btnGhost} onClick={() => setE({ ...e, allergies: e.allergies.filter((_, j) => j !== i) })}>Remove</button></div>)}<button className={`${btnGhost} justify-self-start`} onClick={() => setE({ ...e, allergies: [...e.allergies, { what: '', severity: 'moderate', action: '' }] })}>Add an allergy</button></div>
        <div className="grid gap-3 sm:grid-cols-2"><Field label="Diet"><input className={inputCls} value={e.diet} onChange={(ev) => setE({ ...e, diet: ev.target.value })} /></Field><Field label="Alert for carers" hint="What carers should do, not a diagnosis."><input className={inputCls} value={e.medicalAlert} onChange={(ev) => setE({ ...e, medicalAlert: ev.target.value })} /></Field></div>
        <div className="grid gap-2">{e.emergencyContacts.map((x, i) => <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]"><input className={inputCls} aria-label="Name" placeholder="Name" value={x.name} onChange={(ev) => row('emergencyContacts', i, { name: ev.target.value })} /><input className={inputCls} aria-label="Relationship" placeholder="Relationship" value={x.relationship} onChange={(ev) => row('emergencyContacts', i, { relationship: ev.target.value })} /><input className={inputCls} aria-label="Phone" inputMode="tel" placeholder="Phone" value={x.phone} onChange={(ev) => row('emergencyContacts', i, { phone: ev.target.value })} /><button className={btnGhost} onClick={() => setE({ ...e, emergencyContacts: e.emergencyContacts.filter((_, j) => j !== i) })}>Remove</button></div>)}{e.emergencyContacts.length < 5 && <button className={`${btnGhost} justify-self-start`} onClick={() => setE({ ...e, emergencyContacts: [...e.emergencyContacts, { name: '', relationship: '', phone: '' }] })}>Add a contact</button>}</div>
        <div className="flex justify-end gap-2"><button className={btnGhost} onClick={() => setE(null)}>Cancel</button><button className={btnPrimary} onClick={send}>Send to the nursery</button></div></div></Modal>}
    </div>
  );
}

// The family's view of the nursery: the shared diary, today, who may collect, and what they have agreed to
export default function FamilyNursery() {
  const g = useGet('/early/family/children'); const [id, setId] = useState(''); const [tab, setTab] = useState('diary'); const kids = g.data?.children || [];
  useEffect(() => { if (!id && kids.length) setId(kids[0]._id); }, [kids, id]);
  const child = kids.find((k) => k._id === id);
  return (
    <Loading g={g}>{!child ? <Card><EmptyState title="No nursery child on this account" /></Card> : (
      <div className="grid gap-4">
        {kids.length > 1 && <div className="flex flex-wrap gap-2" role="tablist" aria-label="Child">{kids.map((k) => <button key={k._id} role="tab" aria-selected={k._id === id} onClick={() => setId(k._id)} className={`rounded-full px-4 py-2 text-sm font-bold ${k._id === id ? 'bg-[#2a5cac] text-white' : 'border border-[#e3e7e7] bg-white'}`}>{k.name.split(' ')[0]}{k.unread ? ` (${k.unread})` : ''}</button>)}</div>}
        <Card><h2 className="text-xl font-black">{child.name}</h2><p className="text-sm text-[#5b6b7b]">{[child.room, child.age].filter(Boolean).join(" · ")}</p></Card>
        <Tabs label="Nursery" value={tab} onChange={setTab} items={[['diary', 'Diary', child.unread], ['today', 'Today'], ['pickup', 'Who collects'], ['info', 'Health and consent'], ['play', 'Play together']]} />
        <div key={child._id}>{tab === 'diary' && <Diary child={child} reload={g.reload} />}{tab === 'today' && <Today child={child} />}{tab === 'pickup' && <Pickup child={child} />}{tab === 'info' && <Profile child={child} />}{tab === 'play' && <PlayArea />}</div>
      </div>)}</Loading>
  );
}
