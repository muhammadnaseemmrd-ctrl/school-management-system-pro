import React, { useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { CalendarClock, MapPin, Video } from 'lucide-react';
import apiClient from '../../utils/apiClient';
import { Card, Modal, Field, Pill, EmptyState, Stat, btnPrimary, btnGhost, btnDanger, inputCls } from '../ui';
import { call, useGet, Loading, Note, Tabs, when, dayOf, timeOf, SLOT_TONE, SLOT_WORD, PTM_TONE, PTM_WORD } from './commsKit';

const dtLocal = (d) => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 16); };
const Where = ({ p }) => (p.place ? <span className="inline-flex items-center gap-1 text-xs text-[#5b6b7b]">{p.mode === 'online' ? <Video className="h-3 w-3" /> : <MapPin className="h-3 w-3" />}{p.mode === 'online' ? <a className="text-[#2a5cac] underline" href={p.place} target="_blank" rel="noreferrer">Join online</a> : p.place}</span> : null);
const sessionsText = (p) => (p.sessions || []).map((s) => `${dayOf(`${s.day}T00:00:00`)} ${s.from}–${s.to}`).join(' · ');

/* ───────── planning a meeting day (administrator) ───────── */
function PlanForm({ ptm, onClose, onSaved }) {
  const classes = useGet('/classes', { limit: 200 }); const teachers = useGet('/teachers', { limit: 200 });
  const first = new Date(Date.now() + 7 * 86400000).toLocaleDateString('en-CA'); const locked = ptm && ptm.status !== 'Draft';
  const [f, setF] = useState(() => ptm ? { ...ptm, opensAt: dtLocal(ptm.opensAt), closesAt: dtLocal(ptm.closesAt) } : { title: '', note: '', classIds: [], teacherIds: [], sessions: [{ day: first, from: '10:00', to: '12:00' }], slotMinutes: 10, mode: 'in-person', place: '', opensAt: dtLocal(new Date()), closesAt: dtLocal(new Date(Date.now() + 6 * 86400000)), maxPerFamily: 6 });
  const toggle = (k, id) => setF({ ...f, [k]: f[k].includes(id) ? f[k].filter((x) => x !== id) : [...f[k], id] });
  const setS = (i, k, v) => setF({ ...f, sessions: f.sessions.map((s, j) => (j === i ? { ...s, [k]: v } : s)) });
  const save = () => { const body = locked ? { title: f.title, note: f.note } : { ...f, opensAt: new Date(f.opensAt).toISOString(), closesAt: new Date(f.closesAt).toISOString() }; return call(() => (ptm ? apiClient.put(`/comms/ptm/${ptm._id}`, body) : apiClient.post('/comms/ptm', body)), ptm ? 'Saved' : 'Meeting day saved as a draft', async (r) => { await onSaved(r.data.ptm); }); };
  return (
    <Modal wide title={ptm ? 'Edit meeting day' : 'Plan a meeting day'} onClose={onClose}>
      <div className="grid gap-3">
        {locked && <Note>This day is published. Only its title and note can change now.</Note>}
        <Field label="Title"><input className={inputCls} maxLength={120} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Note for families (optional)"><textarea dir="auto" className={`${inputCls} min-h-[64px]`} maxLength={500} value={f.note || ''} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
        {!locked && <>
          <fieldset className="grid gap-1"><legend className="mb-1 text-xs font-semibold text-[#3b4a5c]">Classes invited</legend><div className="flex max-h-32 flex-wrap gap-2 overflow-y-auto">{(classes.data?.classes || []).map((c) => <label key={c._id} className={`cursor-pointer rounded-lg border px-2.5 py-1 text-sm ${f.classIds.includes(c._id) ? 'border-[#2a5cac] bg-[#eef2f8]' : 'border-[#e3e7e7]'}`}><input type="checkbox" className="sr-only" checked={f.classIds.includes(c._id)} onChange={() => toggle('classIds', c._id)} />{c.standard}-{c.division}</label>)}</div></fieldset>
          <fieldset className="grid gap-1"><legend className="mb-1 text-xs font-semibold text-[#3b4a5c]">Teachers taking meetings</legend><div className="flex max-h-32 flex-wrap gap-2 overflow-y-auto">{(teachers.data?.teachers || []).map((t) => <label key={t._id} className={`cursor-pointer rounded-lg border px-2.5 py-1 text-sm ${f.teacherIds.includes(t._id) ? 'border-[#2a5cac] bg-[#eef2f8]' : 'border-[#e3e7e7]'}`}><input type="checkbox" className="sr-only" checked={f.teacherIds.includes(t._id)} onChange={() => toggle('teacherIds', t._id)} />{t.name}</label>)}</div></fieldset>
          <div className="grid gap-2"><div className="text-xs font-semibold text-[#3b4a5c]">Sessions</div>{f.sessions.map((s, i) => <div key={i} className="flex flex-wrap items-end gap-2"><Field label="Day"><input type="date" className={inputCls} value={s.day} onChange={(e) => setS(i, 'day', e.target.value)} /></Field><Field label="From"><input type="time" className={inputCls} value={s.from} onChange={(e) => setS(i, 'from', e.target.value)} /></Field><Field label="To"><input type="time" className={inputCls} value={s.to} onChange={(e) => setS(i, 'to', e.target.value)} /></Field>{f.sessions.length > 1 && <button className={btnGhost} onClick={() => setF({ ...f, sessions: f.sessions.filter((_, j) => j !== i) })}>Remove</button>}</div>)}{f.sessions.length < 6 && <div><button className={btnGhost} onClick={() => setF({ ...f, sessions: [...f.sessions, { day: first, from: '10:00', to: '12:00' }] })}>Add a session</button></div>}</div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3"><Field label="Minutes per meeting"><input type="number" min="5" max="30" className={inputCls} value={f.slotMinutes} onChange={(e) => setF({ ...f, slotMinutes: Number(e.target.value) })} /></Field><Field label="Most meetings per family"><input type="number" min="1" max="20" className={inputCls} value={f.maxPerFamily} onChange={(e) => setF({ ...f, maxPerFamily: Number(e.target.value) })} /></Field><Field label="How"><select className={inputCls} value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value })}><option value="in-person">In person</option><option value="online">Online</option></select></Field></div>
          <Field label={f.mode === 'online' ? 'Meeting link (https)' : 'Place'}><input className={inputCls} maxLength={200} value={f.place || ''} onChange={(e) => setF({ ...f, place: e.target.value })} /></Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><Field label="Booking opens"><input type="datetime-local" className={inputCls} value={f.opensAt} onChange={(e) => setF({ ...f, opensAt: e.target.value })} /></Field><Field label="Booking closes"><input type="datetime-local" className={inputCls} value={f.closesAt} onChange={(e) => setF({ ...f, closesAt: e.target.value })} /></Field></div>
        </>}
        <div className="flex justify-end gap-2"><button className={btnGhost} onClick={onClose}>Cancel</button><button className={btnPrimary} disabled={f.title.trim().length < 3 || (!locked && (!f.classIds.length || !f.teacherIds.length))} onClick={save}>Save</button></div>
      </div>
    </Modal>
  );
}

/* ───────── one slot row for staff ───────── */
function SlotRow({ s, mine, onChanged, canAct }) {
  const [dlg, setDlg] = useState(null); const [f, setF] = useState({ reason: '', teacherNote: '', summary: '' }); const started = new Date(s.startsAt) <= new Date();
  const post = (what, body, ok) => call(() => apiClient.post(`/comms/ptm/slots/${s._id}/${what}`, body), ok, async () => { setDlg(null); await onChanged(); });
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-lg border border-[#e3e7e7] bg-white px-3 py-2 text-sm">
      <span className="w-24 font-semibold">{timeOf(s.startsAt)}–{timeOf(s.endsAt)}</span>
      {!mine && <span className="w-32 truncate text-[#5b6b7b]">{s.teacherName}</span>}
      <Pill value={SLOT_TONE[s.state]}>{SLOT_WORD[s.state]}</Pill>
      <span className="min-w-0 flex-1 truncate" dir="auto">{s.studentName ? `${s.studentName} · ${s.parentName || ''}` : ''}{s.parentNote ? ` — “${s.parentNote}”` : ''}{s.state === 'Cancelled' && s.cancelWhy ? ` — ${s.cancelWhy}` : ''}</span>
      {canAct && s.state === 'Free' && <button className={btnGhost} onClick={() => post('block', {}, 'Time blocked')}>Block</button>}
      {canAct && s.state === 'Blocked' && <button className={btnGhost} onClick={() => post('unblock', {}, 'Offered again')}>Offer again</button>}
      {canAct && s.state === 'Booked' && <>{started && <button className={btnPrimary} onClick={() => { setF({ reason: '', teacherNote: s.teacherNote || '', summary: s.summary || '' }); setDlg('done'); }}>Record meeting</button>}{started && <button className={btnGhost} onClick={() => post('noshow', {}, 'Marked as did not come')}>Did not come</button>}<button className={btnDanger} onClick={() => { setF({ ...f, reason: '' }); setDlg('cancel'); }}>Cancel</button></>}
      {s.state === 'Done' && (s.summary || s.teacherNote) && <button className={btnGhost} onClick={() => setDlg('view')}>Notes</button>}
      {dlg === 'cancel' && <Modal title="Cancel this meeting" onClose={() => setDlg(null)}><p className="mb-2 text-sm">The family will be told and can choose another time.</p><Field label="Reason (the family sees it)"><input dir="auto" className={inputCls} maxLength={200} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field><div className="mt-4 flex justify-end gap-2"><button className={btnGhost} onClick={() => setDlg(null)}>Back</button><button className={btnDanger} disabled={f.reason.trim().length < 3} onClick={() => post('cancel', { reason: f.reason }, 'Meeting cancelled')}>Cancel meeting</button></div></Modal>}
      {dlg === 'done' && <Modal wide title={`Meeting with ${s.parentName}`} onClose={() => setDlg(null)}><div className="grid gap-3"><Field label="Summary for the family" hint="Shared with the family. Keep it to what was agreed."><textarea dir="auto" className={`${inputCls} min-h-[90px]`} maxLength={1000} value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} /></Field><Field label="Your private note" hint="Only teachers and administrators can read this."><textarea dir="auto" className={`${inputCls} min-h-[70px]`} maxLength={1000} value={f.teacherNote} onChange={(e) => setF({ ...f, teacherNote: e.target.value })} /></Field></div><div className="mt-4 flex justify-end gap-2"><button className={btnGhost} onClick={() => setDlg(null)}>Back</button><button className={btnPrimary} onClick={() => post('done', { summary: f.summary, teacherNote: f.teacherNote }, 'Meeting recorded')}>Save</button></div></Modal>}
      {dlg === 'view' && <Modal title="Notes from the meeting" onClose={() => setDlg(null)}><p className="text-xs font-semibold text-[#5b6b7b]">Shared with the family</p><p className="mb-3 whitespace-pre-wrap text-sm" dir="auto">{s.summary || '—'}</p><p className="text-xs font-semibold text-[#5b6b7b]">Private note</p><p className="whitespace-pre-wrap text-sm" dir="auto">{s.teacherNote || '—'}</p></Modal>}
    </li>
  );
}

function Unbooked({ p }) {
  const ub = useGet(`/comms/ptm/${p._id}/unbooked`);
  return (
    <Loading g={ub}>{ub.data && <div className="grid gap-2"><div className="flex flex-wrap items-center gap-2"><span className="text-sm">{ub.data.total} families have not booked ({ub.data.bookedFamilies} have).</span>{ub.data.total > 0 && p.status === 'Open' && <button className={btnPrimary} onClick={() => call(() => apiClient.post(`/comms/ptm/${p._id}/nudge`), (r) => `${r.data.told} families reminded`, ub.reload)}>Remind them</button>}</div><ul className="grid gap-1 sm:grid-cols-2">{ub.data.families.map((f) => <li key={f._id} className="rounded-lg border border-[#e3e7e7] bg-white px-3 py-2 text-sm"><b>{f.name}</b> <span className="text-xs text-[#5b6b7b]">{f.children.join(', ')}</span></li>)}</ul></div>}</Loading>
  );
}

function Day({ ptmId, isAdmin, onBack, onChanged }) {
  const g = useGet(`/comms/ptm/${ptmId}`); const [teacher, setTeacher] = useState(''); const sl = useGet(`/comms/ptm/${ptmId}/slots`, { teacherId: teacher || undefined }); const [view, setView] = useState('slots'); const [edit, setEdit] = useState(false); const [cancel, setCancel] = useState(null);
  const user = useSelector((x) => x.auth.user); const me = String(user?._id || user?.id || ''); const p = g.data?.ptm; const refresh = async () => { await g.reload(); await sl.reload(); onChanged && onChanged(); };
  const byDay = useMemo(() => { const m = new Map(); for (const s of sl.data?.slots || []) { const k = new Date(s.startsAt).toLocaleDateString('en-CA'); m.set(k, [...(m.get(k) || []), s]); } return [...m.entries()]; }, [sl.data]);
  const shown = (g.data?.teachers || []).filter((t) => isAdmin || String(t.teacherId) === me); const tot = shown.reduce((a, t) => ({ free: a.free + t.free, booked: a.booked + t.booked, done: a.done + t.done }), { free: 0, booked: 0, done: 0 });
  return (
    <Loading g={g}>{p && <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2"><button className={btnGhost} onClick={onBack}>Back</button><div className="min-w-0 flex-1"><div className="font-bold">{p.title}</div><div className="text-xs text-[#5b6b7b]">{sessionsText(p)} · {p.slotMinutes} min each <Where p={p} /></div></div><Pill value={PTM_TONE[p.status]}>{PTM_WORD[p.status]}</Pill>
        {isAdmin && <><button className={btnGhost} onClick={() => setEdit(true)}>Edit</button>{p.status === 'Draft' && <button className={btnPrimary} onClick={() => call(() => apiClient.post(`/comms/ptm/${p._id}/publish`), (r) => `Published with ${r.data.slots} times. Families were told.`, refresh)}>Publish</button>}{p.status === 'Open' && <button className={btnGhost} onClick={() => call(() => apiClient.post(`/comms/ptm/${p._id}/close`), 'Booking closed', refresh)}>Close booking</button>}{['Open', 'Closed'].includes(p.status) && <button className={btnDanger} onClick={() => setCancel({ reason: '' })}>Cancel the day</button>}</>}</div>
      {p.status === 'Draft' ? <Note>This is a draft. Families and teachers cannot see it until you publish it.</Note> : <>
        <div className="grid grid-cols-3 gap-3"><Stat label="Free times" value={tot.free} /><Stat label="Booked" value={tot.booked} /><Stat label="Held" value={tot.done} sub="meetings recorded" /></div>
        <div className="flex flex-wrap items-center gap-2">{isAdmin && <Tabs label="View" value={view} onChange={setView} items={[['slots', 'Times'], ['unbooked', 'Not booked yet']]} />}{isAdmin && view === 'slots' && <select aria-label="Teacher" className={`${inputCls} w-48`} value={teacher} onChange={(e) => setTeacher(e.target.value)}><option value="">All teachers</option>{(g.data.teachers || []).map((t) => <option key={t.teacherId} value={t.teacherId}>{t.teacherName} ({t.booked} booked)</option>)}</select>}</div>
        {view === 'unbooked' && isAdmin ? <Unbooked p={p} /> : (
          <Loading g={sl}>{byDay.length === 0 ? <Card><EmptyState title="No times to show" /></Card> : byDay.map(([day, list]) => <div key={day} className="grid gap-1"><div className="text-sm font-bold">{dayOf(`${day}T00:00:00`)}</div><ul className="grid gap-1">{list.map((s) => <SlotRow key={s._id} s={s} mine={!isAdmin} canAct={p.status !== 'Cancelled'} onChanged={refresh} />)}</ul></div>)}</Loading>)}
      </>}
      {edit && <PlanForm ptm={p} onClose={() => setEdit(false)} onSaved={async () => { setEdit(false); await refresh(); }} />}
      {cancel && <Modal title="Cancel the whole meeting day" onClose={() => setCancel(null)}><p className="mb-2 text-sm">Every booked family will be told. This cannot be undone.</p><Field label="Reason (families see it)"><input dir="auto" className={inputCls} maxLength={200} value={cancel.reason} onChange={(e) => setCancel({ reason: e.target.value })} /></Field><div className="mt-4 flex justify-end gap-2"><button className={btnGhost} onClick={() => setCancel(null)}>Back</button><button className={btnDanger} disabled={cancel.reason.trim().length < 3} onClick={() => call(() => apiClient.post(`/comms/ptm/${p._id}/cancel`, cancel), (r) => `Cancelled. ${r.data.told} families told.`, async () => { setCancel(null); await refresh(); })}>Cancel the day</button></div></Modal>}
    </div>}</Loading>
  );
}

/* ───────── staff: list of meeting days ───────── */
export default function MeetingsStaff({ isAdmin, onChanged }) {
  const g = useGet('/comms/ptm'); const [open, setOpen] = useState(null); const [plan, setPlan] = useState(false); const list = g.data?.meetings || [];
  if (open) return <Day ptmId={open} isAdmin={isAdmin} onBack={() => { setOpen(null); g.reload(); }} onChanged={onChanged} />;
  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-2"><p className="text-sm text-[#5b6b7b]">{isAdmin ? 'Plan a parent-teacher meeting day. Families book their own times.' : 'Meeting days you are part of. Block times you cannot do, and record each meeting afterwards.'}</p>{isAdmin && <button className={btnPrimary} onClick={() => setPlan(true)}><CalendarClock className="h-4 w-4" />Plan a day</button>}</div>
      <Loading g={g}>{list.length === 0 ? <Card><EmptyState title="No meeting days" text={isAdmin ? 'Plan one, publish it, and families are told they can book.' : 'You will see a day here once the school publishes it.'} /></Card> : <ul className="grid gap-2 sm:grid-cols-2">{list.map((p) => <li key={p._id}><button className="w-full rounded-xl border border-[#e3e7e7] bg-white p-3 text-start hover:bg-[#f7f6f2]" onClick={() => setOpen(p._id)}><div className="flex items-center gap-2"><b className="flex-1">{p.title}</b><Pill value={PTM_TONE[p.status]}>{PTM_WORD[p.status]}</Pill></div><div className="text-xs text-[#5b6b7b]">{sessionsText(p)}</div><div className="mt-1 text-xs">{p.booked} booked · {p.free} free · {p.slots} times</div></button></li>)}</ul>}</Loading>
      {plan && <PlanForm onClose={() => setPlan(false)} onSaved={async (p) => { setPlan(false); await g.reload(); setOpen(p._id); }} />}
    </div>
  );
}

/* ───────── family: book a time ───────── */
function Booking({ m, onBack, onBooked }) {
  const [kid, setKid] = useState(m.children[0]?._id || ''); const g = useGet(`/comms/ptm/family/${m._id}/slots`, { studentId: kid }); const [pick, setPick] = useState(null); const [note, setNote] = useState('');
  const d = g.data;
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2"><button className={btnGhost} onClick={onBack}>Back</button><div className="min-w-0 flex-1"><div className="font-bold">{m.title}</div><div className="text-xs text-[#5b6b7b]">{sessionsText(m)} <Where p={m} /></div></div></div>
      {m.note && <Note>{m.note}</Note>}
      <Field label="Book for which child"><select className={`${inputCls} w-64`} value={kid} onChange={(e) => setKid(e.target.value)}>{m.children.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}</select></Field>
      <Loading g={g}>{d && (d.teachers.length === 0 ? <Card><EmptyState title="No teachers for this child" /></Card> : d.teachers.map((t) => <Card key={t._id} className="!p-3"><div className="mb-2 font-bold">{t.name}</div>{t.slots.length === 0 ? <p className="text-sm text-[#5b6b7b]">No free times left.</p> : <div className="flex flex-wrap gap-2">{t.slots.map((s) => <button key={s._id} disabled={!d.open || s.state === 'Mine'} className={`rounded-lg border px-3 py-1.5 text-sm ${s.state === 'Mine' ? 'border-[#bfd8d2] bg-[#edf5f3]' : 'border-[#e3e7e7] bg-white hover:bg-[#eef2f8]'} disabled:opacity-70`} onClick={() => { setPick({ s, t }); setNote(''); }}>{dayOf(s.startsAt)} {timeOf(s.startsAt)}{s.state === 'Mine' ? ' · yours' : ''}</button>)}</div>}</Card>))}</Loading>
      {!d?.open && d && <Note tone="warn">Booking is closed for this meeting day.</Note>}
      {pick && <Modal title="Book this time" onClose={() => setPick(null)}><p className="mb-2 text-sm">{pick.t.name} · {dayOf(pick.s.startsAt)} {timeOf(pick.s.startsAt)}–{timeOf(pick.s.endsAt)}</p><Field label="Anything you would like to talk about (optional)"><input dir="auto" className={inputCls} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} /></Field><div className="mt-4 flex justify-end gap-2"><button className={btnGhost} onClick={() => setPick(null)}>Back</button><button className={btnPrimary} onClick={() => call(() => apiClient.post(`/comms/ptm/slots/${pick.s._id}/book`, { studentId: kid, note: note || undefined }), 'Booked', async () => { setPick(null); await g.reload(); onBooked && onBooked(); })}>Book</button></div></Modal>}
    </div>
  );
}

export function MeetingsFamily({ onChanged }) {
  const g = useGet('/comms/ptm/family'); const [open, setOpen] = useState(null); const [cx, setCx] = useState(null); const d = g.data; const mine = d?.mine || [];
  const reload = async () => { await g.reload(); onChanged && onChanged(); };
  if (open) return <Booking m={open} onBack={() => { setOpen(null); reload(); }} onBooked={onChanged} />;
  return (
    <Loading g={g}>{d && <div className="grid gap-4">
      <section aria-label="My bookings" className="grid gap-2"><h3 className="font-bold">My meetings</h3>{mine.length === 0 ? <Card><p className="text-sm text-[#5b6b7b]">You have not booked a meeting yet.</p></Card> : <ul className="grid gap-2">{mine.map((s) => <li key={s._id} className="rounded-xl border border-[#e3e7e7] bg-white p-3 text-sm"><div className="flex flex-wrap items-center gap-2"><b>{s.teacherName}</b><span>about {s.studentName}</span><Pill value={SLOT_TONE[s.state]}>{SLOT_WORD[s.state]}</Pill><span className="ms-auto text-xs text-[#5b6b7b]">{dayOf(s.startsAt)} {timeOf(s.startsAt)}</span></div>{s.state === 'Cancelled' && s.cancelWhy && <p className="mt-1 text-xs text-[#9f1239]" dir="auto">The school cancelled this: {s.cancelWhy}</p>}{s.state === 'Done' && s.summary && <div className="mt-2 rounded-lg bg-[#edf5f3] p-2" dir="auto"><div className="text-xs font-semibold text-[#215a52]">Notes from the meeting</div><p className="whitespace-pre-wrap">{s.summary}</p></div>}{s.state === 'Booked' && new Date(s.startsAt) > new Date() && <div className="mt-2"><button className={btnGhost} onClick={() => setCx(s)}>Cancel this meeting</button></div>}</li>)}</ul>}</section>
      <section aria-label="Meeting days" className="grid gap-2"><h3 className="font-bold">Meeting days open for booking</h3>{d.meetings.length === 0 ? <Card><EmptyState title="Nothing open for booking" text="When the school plans a parent-teacher meeting day for your child, you will be told and can choose a time here." /></Card> : <ul className="grid gap-2 sm:grid-cols-2">{d.meetings.map((m) => <li key={m._id}><Card className="!p-3"><div className="flex items-center gap-2"><b className="flex-1">{m.title}</b><Pill value={m.booking ? 'Active' : 'None'}>{m.booking ? 'Booking open' : 'Booking closed'}</Pill></div><div className="text-xs text-[#5b6b7b]">{sessionsText(m)}</div><div className="text-xs text-[#5b6b7b]">For {m.children.map((c) => c.name).join(', ')} · up to {m.maxPerFamily} meetings <Where p={m} /></div><div className="mt-2"><button className={btnPrimary} onClick={() => setOpen(m)}>{m.booking ? 'Choose a time' : 'See times'}</button></div></Card></li>)}</ul>}</section>
      {cx && <Modal title="Cancel this meeting" onClose={() => setCx(null)}><p className="mb-3 text-sm">Cancel your meeting with {cx.teacherName} on {dayOf(cx.startsAt)} at {timeOf(cx.startsAt)}? The time will be offered to other families.</p><div className="flex justify-end gap-2"><button className={btnGhost} onClick={() => setCx(null)}>Keep it</button><button className={btnDanger} onClick={() => call(() => apiClient.post(`/comms/ptm/slots/${cx._id}/cancel`, {}), 'Meeting cancelled', async () => { setCx(null); await reload(); })}>Cancel meeting</button></div></Modal>}
    </div>}</Loading>
  );
}
