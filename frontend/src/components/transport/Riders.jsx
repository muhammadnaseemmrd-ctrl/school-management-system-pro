import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import apiClient from '../../utils/apiClient';
import { Card, Modal, Field, EmptyState, btnGhost, btnPrimary, btnDanger, inputCls, errMsg } from '../ui';
import { useGet, Loading, Note, Table, Td, Reason, useDebounced, ChildPicker } from './tpKit';

const HAND = [['release', 'May go home on their own'], ['guardian', 'Must be handed to an authorised adult']];

function Assign({ routes, onClose, onDone, preset }) {
  const [kids, setKids] = useState([]); const [pick, setPick] = useState(null); const [routeId, setRouteId] = useState(preset || routes[0]?._id || ''); const [stopId, setStopId] = useState(''); const [handoff, setHandoff] = useState('release'); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const route = routes.find((r) => r._id === routeId); const add = (c) => { if (c && !kids.some((k) => k._id === c._id)) setKids([...kids, c]); setPick(null); };
  const go = async (e) => { e.preventDefault(); setBusy(true); setErr(''); try { await apiClient.post('/transport/riders/assign', { studentIds: kids.map((k) => k._id), routeId, stopId: stopId || undefined, handoff }); toast.success(`${kids.length} child(ren) assigned.`); onDone(); } catch (x) { setErr(errMsg(x)); setBusy(false); } };
  return (
    <Modal title="Put children on a route" onClose={onClose}>
      <form onSubmit={go} className="grid gap-3">
        <ChildPicker label="Add a child" value={pick} onPick={add} />
        {kids.length > 0 && <ul className="flex flex-wrap gap-2" aria-label="Chosen children">{kids.map((k) => <li key={k._id} className="flex items-center gap-1 rounded-full bg-[#eef2f8] px-3 py-1 text-xs"><span>{k.name}</span><button type="button" className="font-bold" onClick={() => setKids(kids.filter((x) => x._id !== k._id))} aria-label={`Remove ${k.name}`}>×</button></li>)}</ul>}
        <Field label="Route"><select className={inputCls} value={routeId} onChange={(e) => { setRouteId(e.target.value); setStopId(''); }} required>{routes.map((r) => <option key={r._id} value={r._id}>{r.name}</option>)}</select></Field>
        <Field label="Stop" hint="A child with no stop is left off the trips until one is chosen."><select className={inputCls} value={stopId} onChange={(e) => setStopId(e.target.value)}><option value="">Choose later</option>{(route?.stops || []).filter((s) => s.active !== false).map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}</select></Field>
        <Field label="At the end of the day"><select className={inputCls} value={handoff} onChange={(e) => setHandoff(e.target.value)}>{HAND.map(([a, b]) => <option key={a} value={a}>{b}</option>)}</select></Field>
        {err && <p role="alert" className="text-sm text-[#9f1239]">{err}</p>}
        <div className="flex justify-end gap-2"><button type="button" className={btnGhost} onClick={onClose}>Not now</button><button className={btnPrimary} disabled={busy || !kids.length || !routeId}>{busy ? 'Working…' : 'Assign'}</button></div>
      </form>
    </Modal>
  );
}

export default function Riders({ manage }) {
  const routes = useGet('/transport/routes'); const [routeId, setRouteId] = useState(''); const [un, setUn] = useState(false); const [q, setQ] = useState(''); const dq = useDebounced(q);
  const g = useGet('/transport/riders', { routeId: routeId || undefined, unassigned: un ? '1' : undefined, q: dq || undefined }); const [add, setAdd] = useState(false); const [edit, setEdit] = useState(null); const [rm, setRm] = useState(null);
  const rts = routes.data || [];
  return (
    <div className="space-y-3">
      <Card><div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[12rem] flex-1"><Field label="Search children"><input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, class or stop" /></Field></div>
        <Field label="Route"><select className={inputCls} value={routeId} onChange={(e) => setRouteId(e.target.value)}><option value="">All routes</option>{rts.map((r) => <option key={r._id} value={r._id}>{r.name}</option>)}</select></Field>
        <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" checked={un} onChange={(e) => setUn(e.target.checked)} /> Only children with no stop</label>
        {manage && <button className={btnPrimary} onClick={() => setAdd(true)} disabled={!rts.length}>Put children on a route</button>}</div></Card>
      <Loading g={g}>{g.data && (g.data.length === 0 ? <Card><EmptyState title="No children found" text={rts.length ? 'Put children on a route and choose their stop.' : 'Add a route first.'} /></Card> : (
        <Table label="Children who ride the bus" head={['Child', 'Class', 'Route', 'Stop', 'End of day', '']} min={700}>{g.data.map((r) => (
          <tr key={r.studentId}><Td className="font-medium">{r.name}{!r.active && <span className="ms-1 text-xs text-[#5b6b7b]">(left school)</span>}</Td><Td>{r.className}</Td><Td>{r.routeName}</Td><Td>{r.stopName || <span className="text-xs font-semibold text-[#8a4636]">No stop</span>}</Td><Td className="text-xs">{r.handoff === 'guardian' ? 'To an adult' : 'May go alone'}</Td>
            <Td>{manage && <span className="flex gap-1"><button className={`${btnGhost} !px-2 !py-1 !text-xs`} onClick={() => setEdit(r)} aria-label={`Change ${r.name}`}>Change</button><button className={`${btnGhost} !px-2 !py-1 !text-xs`} onClick={() => setRm(r)} aria-label={`Take ${r.name} off the bus`}>Remove</button></span>}</Td></tr>))}</Table>))}</Loading>
      {add && <Assign routes={rts} preset={routeId} onClose={() => setAdd(false)} onDone={() => { setAdd(false); g.reload(); routes.reload(); }} />}
      {edit && (() => { const r = rts.find((x) => x._id === edit.routeId); return (
        <Modal title={`Change ${edit.name}`} onClose={() => setEdit(null)}>
          <form className="grid gap-3" onSubmit={async (e) => { e.preventDefault(); try { await apiClient.patch(`/transport/riders/${edit.studentId}`, { stopId: edit.stopId || '', handoff: edit.handoff }); toast.success('Saved.'); setEdit(null); g.reload(); routes.reload(); } catch (x) { toast.error(errMsg(x)); } }}>
            <Field label="Stop"><select className={inputCls} value={edit.stopId || ''} onChange={(e) => setEdit({ ...edit, stopId: e.target.value })}><option value="">No stop</option>{(r?.stops || []).filter((s) => s.active !== false).map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}</select></Field>
            <Field label="At the end of the day"><select className={inputCls} value={edit.handoff} onChange={(e) => setEdit({ ...edit, handoff: e.target.value })}>{HAND.map(([a, b]) => <option key={a} value={a}>{b}</option>)}</select></Field>
            <p className="text-xs text-[#5b6b7b]">To move a child to another route, use “Put children on a route”. Trips already made but not started are updated.</p>
            <div className="flex justify-end gap-2"><button type="button" className={btnGhost} onClick={() => setEdit(null)}>Not now</button><button className={btnPrimary}>Save</button></div>
          </form></Modal>); })()}
      {rm && <Reason title={`Take ${rm.name} off the bus`} text="They are removed from every trip that has not started. Past trips keep their record." confirm="Remove" label="Why (kept in the record)" onClose={() => setRm(null)} onDone={async (r) => { await apiClient.delete(`/transport/riders/${rm.studentId}`, { data: { reason: r } }); setRm(null); toast.success('Removed.'); g.reload(); routes.reload(); }} />}
    </div>
  );
}
