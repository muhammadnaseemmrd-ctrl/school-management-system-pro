import React, { useState } from 'react';
import { Card, Modal, Pill, Field, EmptyState, btnPrimary, btnGhost, btnDanger, inputCls, errMsg } from '../ui';
import apiClient from '../../utils/apiClient';
import { toast } from 'react-hot-toast';
import { call, useGet, Loading, Note, Tabs } from './earlyKit';

function RoomForm({ room, bands, teachers, onClose, onDone }) {
  const [r, setR] = useState(room ? { name: room.name, ageBand: room.ageBand, capacity: room.capacity, ratio: room.ratio || 0, leadId: room.lead?._id || '', staffIds: room.staff.map((s) => s._id), notes: room.notes || '' } : { name: '', ageBand: 'toddler', capacity: 12, ratio: 0, leadId: '', staffIds: [], notes: '' });
  const save = () => call(() => (room ? apiClient.put(`/early/rooms/${room._id}`, r) : apiClient.post('/early/rooms', r)), 'Saved', onDone);
  return (
    <Modal title={room ? 'Edit room' : 'New room'} onClose={onClose} wide><div className="grid gap-3 sm:grid-cols-2">
      <Field label="Room name"><input className={inputCls} value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} /></Field><Field label="Age group"><select className={inputCls} value={r.ageBand} onChange={(e) => setR({ ...r, ageBand: e.target.value })}>{Object.entries(bands).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
      <Field label="Most children in the room"><input className={inputCls} type="number" value={r.capacity} onChange={(e) => setR({ ...r, capacity: Number(e.target.value) })} /></Field><Field label="Children for each adult" hint="0 uses the school's figure for this age group."><input className={inputCls} type="number" value={r.ratio} onChange={(e) => setR({ ...r, ratio: Number(e.target.value) })} /></Field>
      <Field label="Room lead"><select className={inputCls} value={r.leadId} onChange={(e) => setR({ ...r, leadId: e.target.value })}><option value="">None</option>{teachers.map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}</select></Field>
      <fieldset><legend className="mb-1 text-xs font-semibold">Carers</legend><div className="flex max-h-32 flex-wrap gap-2 overflow-auto">{teachers.map((t) => <label key={t._id} className="flex items-center gap-1 text-sm"><input type="checkbox" checked={r.staffIds.includes(t._id)} onChange={() => setR({ ...r, staffIds: r.staffIds.includes(t._id) ? r.staffIds.filter((x) => x !== t._id) : [...r.staffIds, t._id] })} />{t.name}</label>)}</div></fieldset>
      <div className="sm:col-span-2 flex justify-end gap-2"><button className={btnGhost} onClick={onClose}>Cancel</button><button className={btnPrimary} onClick={save}>Save room</button></div></div></Modal>
  );
}

function Place({ room, onClose, onDone }) {
  const [q, setQ] = useState(''); const [found, setFound] = useState([]); const [sel, setSel] = useState([]);
  const find = async () => { try { const r = await apiClient.get('/early/children/search', { params: { q } }); setFound(r.data.children || []); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <Modal title={`Place children in ${room.name}`} onClose={onClose} wide><div className="grid gap-3"><div className="flex gap-2"><input className={inputCls} aria-label="Search for a child" placeholder="Type a name (at least 2 letters)" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && find()} /><button className={btnGhost} onClick={find}>Search</button></div>
      <ul className="max-h-64 overflow-auto rounded-xl border border-[#e3e7e7] bg-white">{found.map((c) => <li key={c._id}><label className="flex items-center gap-2 border-t border-[#e3e7e7] px-3 py-2 text-sm first:border-t-0"><input type="checkbox" checked={sel.includes(c._id)} onChange={() => setSel(sel.includes(c._id) ? sel.filter((x) => x !== c._id) : [...sel, c._id])} /><span className="flex-1">{c.name} <span className="text-xs text-[#5b6b7b]">{c.age}</span></span>{c.room && <Pill value="None">now in {c.room}</Pill>}</label></li>)}{!found.length && <li className="p-3 text-sm text-[#5b6b7b]">Search to find children.</li>}</ul>
      <div className="flex justify-end"><button className={btnPrimary} disabled={!sel.length} onClick={() => call(() => apiClient.post(`/early/rooms/${room._id}/children`, { childIds: sel }), (r) => `${r.data.placed} placed, ${r.data.moved} moved`, onDone)}>Place {sel.length || ''}</button></div></div></Modal>
  );
}

function Settings() {
  const g = useGet('/early/settings'); const [s, setS] = useState(null); const d = g.data; const v = s || d?.settings;
  const save = () => call(() => apiClient.put('/early/settings', v), 'Saved', () => { setS(null); g.reload(); });
  return (
    <Loading g={g}>{v && <Card><div className="grid max-w-2xl gap-3"><Note>These are the school's own figures, set for this school. They are not presented as legal minimums: check what applies to you.</Note>
      <div className="grid gap-3 sm:grid-cols-3">{Object.entries(d.bands).map(([k, label]) => <Field key={k} label={`Children for each adult: ${label}`}><input className={inputCls} type="number" min={1} value={v.ratios[k]} onChange={(e) => setS({ ...v, ratios: { ...v.ratios, [k]: Number(e.target.value) } })} /></Field>)}</div>
      <div className="grid gap-3 sm:grid-cols-2"><Field label="Remind carers when a nap is longer than (minutes)"><input className={inputCls} type="number" value={v.napAlertMinutes} onChange={(e) => setS({ ...v, napAlertMinutes: Number(e.target.value) })} /></Field><Field label="Largest photo (KB)"><input className={inputCls} type="number" value={v.photoMaxKb} onChange={(e) => setS({ ...v, photoMaxKb: Number(e.target.value) })} /></Field></div>
      {[['notifyOnCheckIn', 'Tell the family when a child arrives'], ['notifyOnCheckOut', 'Tell the family when a child is collected'], ['wellnessLookAtArrival', 'Remind carers to look at each child on arrival']].map(([k, l]) => <label key={k} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!v[k]} onChange={(e) => setS({ ...v, [k]: e.target.checked })} /> {l}</label>)}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked disabled /> A second person checks every diary before a family sees it (always on)</label>
      <div className="flex justify-end"><button className={btnPrimary} disabled={!s} onClick={save}>Save settings</button></div></div></Card>}</Loading>
  );
}

function Ratios() {
  const g = useGet('/early/ratios'); const ev = useGet('/early/ratio-events', { limit: 20 });
  return (
    <div className="grid gap-3"><Loading g={g}>{g.data && <Card className="!p-0 overflow-hidden"><ul>{g.data.rooms.map((r) => <li key={r.roomId} className="flex flex-wrap items-center gap-3 border-t border-[#e3e7e7] px-3 py-2 first:border-t-0"><b className="min-w-[8rem] flex-1">{r.name}</b><span className="text-sm">{r.children} children · {r.staff} adults</span><Pill value={r.ok ? 'Active' : 'Suspended'}>{r.ok ? 'Enough adults' : r.overRatio ? `${r.needStaff} more adult needed` : 'Over room capacity'}</Pill></li>)}</ul></Card>}</Loading>
      <h3 className="text-sm font-bold">Recent times a room had too few adults</h3><Loading g={ev}>{(ev.data?.events || []).length === 0 ? <p className="text-sm text-[#5b6b7b]">None recorded.</p> : <Card className="!p-0 overflow-hidden"><ul>{ev.data.events.map((e) => <li key={e._id} className="flex flex-wrap items-center gap-3 border-t border-[#e3e7e7] px-3 py-2 text-sm first:border-t-0"><b className="flex-1">{e.roomName}</b><span>{e.children} children, {e.staff} adults</span><span className="text-xs text-[#5b6b7b]">{new Date(e.startedAt).toLocaleString('en-GB')}{e.endedAt ? ` – ${new Date(e.endedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : ' (still open)'}</span></li>)}</ul></Card>}</Loading></div>
  );
}

export default function RoomsAdmin() {
  const [tab, setTab] = useState('rooms'); const g = useGet('/early/rooms', { all: 1 }); const set = useGet('/early/settings'); const t = useGet('/teachers', { limit: 200 }); const [edit, setEdit] = useState(null); const [place, setPlace] = useState(null);
  const teachers = t.data?.teachers || [];
  return (
    <div className="grid gap-3"><Tabs label="Rooms" value={tab} onChange={setTab} items={[['rooms', 'Rooms'], ['ratios', 'Adults and children'], ['settings', 'School settings']]} />
      {tab === 'rooms' && <><div className="flex justify-end"><button className={btnPrimary} onClick={() => setEdit({})}>New room</button></div>
        <Loading g={g}>{(g.data?.rooms || []).length === 0 ? <Card><EmptyState title="No rooms yet" text="Create a room, name its lead, then place children in it." /></Card> : <div className="grid gap-2 sm:grid-cols-2">{g.data.rooms.map((r) => (
          <Card key={r._id}><div className="flex flex-wrap items-center gap-2"><b className="flex-1">{r.name}</b>{!r.active && <Pill value="None">Closed</Pill>}<Pill value={r.status.ok ? 'Active' : 'Suspended'}>{r.status.ok ? 'OK' : 'Check adults'}</Pill></div><div className="text-xs text-[#5b6b7b]">{r.bandLabel} · {r.placed} of {r.capacity} places · up to {r.perAdult} per adult</div><div className="mt-1 text-xs">Lead: {r.lead?.name || 'not set'} · Carers: {r.staff.map((s) => s.name).join(', ') || 'none'}</div>
            <div className="mt-2 flex flex-wrap gap-2"><button className={btnGhost} onClick={() => setPlace(r)}>Place children</button><button className={btnGhost} onClick={() => setEdit(r)}>Edit</button>{r.active && <button className={btnDanger} onClick={() => call(() => apiClient.post(`/early/rooms/${r._id}/archive`), 'Room closed', g.reload)}>Close room</button>}</div></Card>))}</div>}</Loading></>}
      {tab === 'ratios' && <Ratios />}{tab === 'settings' && <Settings />}
      {edit && set.data && <RoomForm room={edit._id ? edit : null} bands={set.data.bands} teachers={teachers} onClose={() => setEdit(null)} onDone={() => { setEdit(null); g.reload(); }} />}
      {place && <Place room={place} onClose={() => setPlace(null)} onDone={() => { setPlace(null); g.reload(); }} />}
    </div>
  );
}
