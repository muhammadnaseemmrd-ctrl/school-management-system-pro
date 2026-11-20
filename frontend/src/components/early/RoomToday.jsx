import React, { useEffect, useMemo, useState } from 'react';
import { Pill, Card, Modal, Field, EmptyState, btnPrimary, btnGhost, btnDanger, inputCls, errMsg } from '../ui';
import apiClient from '../../utils/apiClient';
import { toast } from 'react-hot-toast';
import { call, useGet, hm, StatusPill, Loading, Note, SEV_TONE } from './earlyKit';
import BulkLog from './BulkLog';
import ChildSheet from './ChildSheet';
import SafetyCard from './SafetyCard';

const REFUSE = 'Do not release the child. Ask the person to wait and call the principal.';

function RatioBanner({ room, carers, onPresence, canToggle, isTeacher, me }) {
  const s = room.status; const need = s.needStaff;
  return (
    <div role="status" aria-live="polite" className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${s.ok ? 'border-[#bfd8d2] bg-[#edf5f3] text-[#215a52]' : 'border-[#e3b4ac] bg-[#fff1f2] text-[#9f1239]'}`}>
      <div>
        <div className="font-semibold">{s.ok ? 'Enough adults for the children here' : s.overRatio ? `Not enough adults: ${need} more needed now` : 'More children here than the room holds'}</div>
        <div className="text-xs">{s.children} children here · {s.staff} {s.staff === 1 ? 'adult' : 'adults'} in the room · up to {s.perAdult} children for each adult (the school's own figure, set in settings)</div>
      </div>
      {canToggle && <button className={btnGhost} onClick={onPresence}>{carers.some((c) => c.staffId === me) ? 'I am leaving the room' : 'I am in the room'}</button>}
    </div>
  );
}

function CheckIn({ room, child, onClose, onDone }) {
  const [guardians, setGuardians] = useState([]); const [who, setWho] = useState('');  const [name, setName] = useState(''); const [rel, setRel] = useState(''); const [concern, setConcern] = useState(''); const [note, setNote] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { apiClient.get(`/early/children/${child._id}/collectors`).then((r) => { const g = (r.data.collectors || []).filter((c) => c.kind === 'parent'); setGuardians(g); if (g[0]) setWho(`p:${g[0].parentId}`); else setWho('other'); }).catch(() => setWho('other')); }, [child._id]);
  const submit = async () => { setBusy(true); const signedBy = who.startsWith('p:') ? { parentId: who.slice(2) } : { name, relationship: rel }; const r = await call(() => apiClient.post('/early/check-in', { childId: child._id, signedBy, concern, note }), `${child.name} is checked in`, null); setBusy(false); if (r) { if (r.data.reminder) toast(r.data.reminder, { duration: 6000 }); onDone(); } };
  return (
    <Modal title={`Check in ${child.name}`} onClose={onClose}>
      <div className="grid gap-3">
        <Field label="Who brought the child?">
          <select className={inputCls} value={who} onChange={(e) => setWho(e.target.value)}>{guardians.map((g) => <option key={g.parentId} value={`p:${g.parentId}`}>{g.name} ({g.relationship})</option>)}<option value="other">Someone else…</option></select>
        </Field>
        {who === 'other' && <><Field label="Their full name"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} /></Field><Field label="Relationship to the child"><input className={inputCls} value={rel} onChange={(e) => setRel(e.target.value)} /></Field><Note>If this person is not on the child's list, the family and the office are told.</Note></>}
        <Field label="Anything you noticed on arrival?" hint="Cough, a rash, poor sleep, medicine given at home. This is written into the health log."><input className={inputCls} value={concern} onChange={(e) => setConcern(e.target.value)} /></Field>
        <Field label="Message from the family (optional)"><input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <div className="flex justify-end gap-2"><button className={btnGhost} onClick={onClose}>Cancel</button><button className={btnPrimary} disabled={busy || (who === 'other' && name.trim().length < 2)} onClick={submit}>Check in</button></div>
      </div>
    </Modal>
  );
}

function CheckOut({ child, onClose, onDone }) {
  const [list, setList] = useState(null); const [pick, setPick] = useState(''); const [other, setOther] = useState(''); const [code, setCode] = useState(''); const [idOk, setIdOk] = useState(false); const [refused, setRefused] = useState(false); const [busy, setBusy] = useState(false);
  useEffect(() => { apiClient.get(`/early/children/${child._id}/collectors`).then((r) => { setList(r.data); const f = r.data.collectors?.[0]; if (f) setPick(f.kind === 'parent' ? `p:${f.parentId}` : `n:${f.name}`); else setPick('other'); }).catch(() => setList({ collectors: [], oneDay: [] })); }, [child._id]);
  const kind = pick.startsWith('p:') ? 'parent' : 'named';
  const submit = async () => {
    setBusy(true); setRefused(false);
    const collector = pick.startsWith('p:') ? { parentId: pick.slice(2) } : { personName: pick === 'other' ? other : pick.slice(2), code: code || undefined };
    try { await apiClient.post('/early/check-out', { childId: child._id, collector, idChecked: kind === 'parent' ? undefined : idOk }); toast.success(`${child.name} was released`); onDone(); }
    catch (e) { if (e.response?.status === 403) setRefused(true); else toast.error(errMsg(e)); }
    setBusy(false);
  };
  return (
    <Modal title={`Release ${child.name}`} onClose={onClose}>
      {refused ? (
        <div className="grid gap-4"><div role="alert" className="rounded-xl border-2 border-[#9f1239] bg-[#fff1f2] p-4 text-lg font-bold text-[#9f1239]">{REFUSE}</div><button className={btnPrimary} onClick={() => setRefused(false)}>Back</button></div>
      ) : !list ? <div className="p-4 text-sm text-[#5b6b7b]">Loading…</div> : (
        <div className="grid gap-3">
          <Field label="Who is collecting?"><select className={inputCls} value={pick} onChange={(e) => setPick(e.target.value)}>{list.collectors.map((c) => <option key={c.kind === 'parent' ? c.parentId : c.name} value={c.kind === 'parent' ? `p:${c.parentId}` : `n:${c.name}`}>{c.name} ({c.relationship})</option>)}<option value="other">Someone else…</option></select></Field>
          {pick === 'other' && <Field label="Their full name"><input className={inputCls} value={other} onChange={(e) => setOther(e.target.value)} /></Field>}
          {pick === 'other' && <Field label="One-day pickup code (if the family gave one)"><input className={inputCls} inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} /></Field>}
          {kind === 'named' && <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={idOk} onChange={(e) => setIdOk(e.target.checked)} /> I have looked at this person's ID</label>}
          {list.oneDay?.length > 0 && <Note>One-day authorisations today: {list.oneDay.map((o) => o.name).join(', ')}</Note>}
          <div className="flex justify-end gap-2"><button className={btnGhost} onClick={onClose}>Cancel</button><button className={btnPrimary} disabled={busy || (pick === 'other' && other.trim().length < 2) || (kind === 'named' && !idOk)} onClick={submit}>Release child</button></div>
        </div>
      )}
    </Modal>
  );
}

// one room, today: who is here, who is expected, the ratio, and the quick actions
export default function RoomToday({ roomId, me, isTeacher, isLead = false }) {
  const g = useGet(`/early/rooms/${roomId}`); const [sel, setSel] = useState([]); const [dlg, setDlg] = useState(null); const [q, setQ] = useState('');
  useEffect(() => { setSel([]); }, [roomId]);
  const d = g.data; const kids = useMemo(() => (d?.children || []).filter((c) => c.name.toLowerCase().includes(q.toLowerCase())), [d, q]);
  const done = () => { setDlg(null); g.reload(); };
  const toggle = (id) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const presence = async () => { const mine = d.present.some((c) => c.staffId === me); await call(() => apiClient.post(`/early/rooms/${roomId}/presence/${mine ? 'out' : 'in'}`, isTeacher ? {} : {}), mine ? 'You left the room' : 'You are in the room', g.reload); };
  const absent = async (c) => call(() => apiClient.post('/early/absent', { childIds: [c._id], reason: 'Not coming today' }), `${c.name} marked absent`, g.reload);
  return (
    <Loading g={g}>{d && (
      <div className="grid gap-3">
        <RatioBanner room={d.room} carers={d.present} canToggle={isTeacher} me={me} onPresence={presence} />
        <div className="flex flex-wrap items-center gap-2 text-sm"><Pill value="Approved">{d.counts.in} here</Pill><Pill value="Pending">{d.counts.expected - d.counts.in - d.counts.out - d.counts.absent} expected</Pill><Pill value="None">{d.counts.out} collected</Pill><Pill value="Suspended">{d.counts.absent} absent</Pill>
          <span className="text-xs text-[#5b6b7b]">With the children: {d.present.length ? d.present.map((c) => c.name).join(', ') : 'nobody has said they are in the room'}</span></div>
        <div className="flex flex-wrap items-center gap-2">
          <input className={`${inputCls} max-w-xs`} placeholder="Find a child" aria-label="Find a child" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className={btnPrimary} disabled={!sel.length} onClick={() => setDlg({ t: 'bulk' })}>{sel.length ? `Log for ${sel.length} selected` : 'Tick children to log'}</button>
          <button className={btnGhost} onClick={() => setSel(d.children.filter((c) => c.status === 'In').map((c) => c._id))}>Select everyone here</button>
          <button className={btnGhost} onClick={() => setDlg({ t: 'card' })}>Safety card</button>
        </div>
        {kids.length === 0 ? <Card><EmptyState title="No children in this room yet" text="An administrator places children in a room from Rooms and settings." /></Card> : (
          <Card className="!p-0 overflow-hidden"><ul>
            {kids.map((c) => (
              <li key={c._id} className="flex flex-wrap items-center gap-3 border-t border-[#e3e7e7] px-3 py-2 first:border-t-0">
                <input type="checkbox" aria-label={`Select ${c.name}`} checked={sel.includes(c._id)} disabled={c.status !== 'In'} onChange={() => toggle(c._id)} />
                <button className="min-w-[10rem] flex-1 text-start" onClick={() => setDlg({ t: 'child', c })}><span className="font-semibold text-[#1b2837]">{c.name}</span> <span className="text-xs text-[#5b6b7b]">{c.age}</span>
                  <span className="mt-0.5 flex flex-wrap gap-1">{c.allergy && <Pill value={SEV_TONE[c.allergy]}>Allergy: {c.allergy}</Pill>}{c.alert && <Pill value="Pending">Medical alert</Pill>}{c.inFlag.includes('unlisted') && <Pill value="Suspended">Unlisted drop-off</Pill>}{c.inFlag.includes('wellness') && <Pill value="Pending">Unwell on arrival</Pill>}</span></button>
                <div className="text-xs text-[#5b6b7b]">{c.status === 'In' ? `since ${hm(c.inAt)}` : c.status === 'Out' ? `${hm(c.outAt)} by ${c.collector || ''}` : ''}</div>
                <StatusPill s={c.status} />
                <div className="flex gap-2">
                  {c.status !== 'In' && c.status !== 'Absent' && <><button className={btnPrimary} onClick={() => setDlg({ t: 'in', c })}>Check in</button><button className={btnGhost} onClick={() => absent(c)}>Absent</button></>}
                  {c.status === 'Out' && <button className={btnGhost} onClick={() => setDlg({ t: 'in', c })}>Check in again</button>}
                  {c.status === 'Absent' && <button className={btnPrimary} onClick={() => setDlg({ t: 'in', c })}>Arrived</button>}
                  {c.status === 'In' && <button className={btnDanger} onClick={() => setDlg({ t: 'out', c })}>Release</button>}
                </div>
              </li>))}
          </ul></Card>)}
        {dlg?.t === 'in' && <CheckIn room={d.room} child={dlg.c} onClose={() => setDlg(null)} onDone={done} />}
        {dlg?.t === 'out' && <CheckOut child={dlg.c} onClose={() => setDlg(null)} onDone={done} />}
        {dlg?.t === 'bulk' && <BulkLog roomId={roomId} roster={d.children.filter((c) => sel.includes(c._id))} onClose={() => setDlg(null)} onDone={() => { setSel([]); done(); }} />}
        {dlg?.t === 'child' && <ChildSheet child={dlg.c} roomId={roomId} isLead={isLead} onClose={() => setDlg(null)} onChanged={g.reload} />}
        {dlg?.t === 'card' && <SafetyCard roomId={roomId} onClose={() => setDlg(null)} />}
      </div>)}
    </Loading>
  );
}
