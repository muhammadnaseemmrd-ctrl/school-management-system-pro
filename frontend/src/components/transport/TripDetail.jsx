import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import apiClient from '../../utils/apiClient';
import { Modal, Field, btnGhost, btnPrimary, btnDanger, inputCls, errMsg } from '../ui';
import { useGet, Loading, Note, Table, Td, Reason, AskForm, TBadge, DIR, KIND_WORD, Dl, hm, dt, day, ChildPicker } from './tpKit';

export default function TripDetail({ id, onClose, onChange, canManage = true }) {
  const g = useGet(`/transport/trips/${id}`); const t = g.data?.trip; const [ask, setAsk] = useState(null); const [one, setOne] = useState(null);
  const drivers = useGet('/transport/drivers'); const vehicles = useGet('/transport/vehicles');
  const reload = () => { g.reload(); onChange && onChange(); };
  const act = async (fn, ok) => { try { await fn(); toast.success(ok); reload(); } catch (e) { toast.error(errMsg(e)); } };
  const op = (body, ok) => act(() => apiClient.post(`/transport/trips/${id}/op`, body), ok);
  const live = t && t.status === 'active'; const before = t && ['scheduled', 'checked'].includes(t.status); const open = t && !['completed', 'cancelled', 'missed'].includes(t.status);
  return (
    <Modal title={t ? `${t.routeName} · ${DIR[t.direction]}` : 'Trip'} onClose={onClose} wide>
      <Loading g={g}>{t && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2"><TBadge k="trip" s={t.status} />{live && t.delayMin >= 5 && <span className="text-xs text-[#8a4636]">{t.delayMin} minutes late</span>}{t.status === 'cancelled' && <span className="text-xs text-[#5b6b7b]">{t.cancelReason}</span>}</div>
          <Dl items={[['Date', day(t.date)], ['Planned start', hm(t.plannedStart)], ['Left at', hm(t.startedAt)], ['Ended at', hm(t.endedAt)], ['Bus', t.vehiclePlate], ['Driver', t.driverName], ['Escort', t.escortName], ['Seats', t.capacity], ['Safety check', t.checklist?.doneAt ? `Passed at ${hm(t.checklist.doneAt)}` : 'Not done yet'], ['Empty-bus check', t.emptyCheck?.done ? `Done at ${hm(t.emptyCheck.at)}` : 'Not done']]} />
          {open && canManage && (
            <div className="flex flex-wrap gap-2">
              <button className={btnGhost} onClick={() => setAsk('reassign')}>Change driver or bus</button>
              <button className={btnGhost} onClick={() => setOne({ child: null, stopId: '' })}>Add a child for today</button>
              {before && <button className={btnDanger} onClick={() => setAsk('cancel')}>Cancel this trip</button>}
            </div>
          )}
          <section><h4 className="mb-1 text-sm font-semibold">Stops</h4>
            <Table label="Stops" head={['#', 'Stop', 'Planned', 'Expected', 'Reached']} min={420}>{t.stops.map((s) => <tr key={String(s.stopId)}><Td>{s.seq}</Td><Td className="font-medium">{s.name}</Td><Td>{hm(s.plannedAt)}</Td><Td>{s.arrivedAt ? '—' : hm(s.etaAt)}</Td><Td>{s.arrivedAt ? hm(s.arrivedAt) : '—'}</Td></tr>)}</Table></section>
          <section><h4 className="mb-1 text-sm font-semibold">Children ({g.data.boards.length})</h4>
            <Table label="Children on this trip" head={['Child', 'Stop', 'State', 'Hand-over', '']} min={560}>{g.data.boards.map((b) => (
              <tr key={b._id}><Td className="font-medium">{b.studentName}<div className="text-xs text-[#5b6b7b]">{b.className}</div></Td><Td>{b.stopName}</Td>
                <Td><TBadge k="board" s={b.state} />{b.exception?.kind && !b.exception.resolved ? <div className="mt-1 text-xs text-[#9f1239]">{KIND_WORD[b.exception.kind] || b.exception.kind}</div> : null}</Td>
                <Td className="text-xs">{b.handoff === 'guardian' ? 'Must go to an adult' : 'May go home alone'}{b.handedTo?.name ? <div>Received by {b.handedTo.name}</div> : null}</Td>
                <Td>{live && canManage && b.state === 'expected' && <button className={`${btnGhost} !px-2 !py-1 !text-xs`} onClick={() => op({ type: 'board', studentId: b.studentId, stopId: b.stopId }, 'Marked as on the bus.')} aria-label={`Mark ${b.studentName} on the bus`}>On the bus</button>}</Td></tr>
            ))}</Table></section>
          {g.data.incidents.length > 0 && <section><h4 className="mb-1 text-sm font-semibold">Incidents</h4><ul className="space-y-1 text-sm">{g.data.incidents.map((i) => <li key={i._id}><b>{i.incidentNo}</b> · {KIND_WORD[i.kind] || i.kind} · <TBadge k="incident" s={i.status} /><div className="text-xs text-[#5b6b7b]">{i.note}</div></li>)}</ul></section>}
          {live && g.data.track.length > 0 && <Note>The bus last reported its position at {hm(g.data.track[g.data.track.length - 1].at)}. Positions exist only while a trip is under way and are deleted when it ends, unless an incident needs them.</Note>}
          <section><h4 className="mb-1 text-sm font-semibold">What happened</h4>{g.data.events.length === 0 ? <p className="text-sm text-[#5b6b7b]">Nothing yet.</p> : <ol className="max-h-56 space-y-1 overflow-y-auto text-xs text-[#3b4a5c]">{g.data.events.map((e) => <li key={e._id}><span className="text-[#5b6b7b]">{hm(e.at)}</span> · <b>{e.kind.replace(/_/g, ' ')}</b>{e.studentName ? ` · ${e.studentName}` : ''}{e.note ? ` — ${e.note}` : ''}{e.byName ? ` (${e.byName}${e.byKind === 'staff' ? ', office' : ''})` : ''}{e.late ? ' · sent late' : ''}</li>)}</ol>}</section>
        </div>
      )}</Loading>
      {ask === 'cancel' && <Reason title="Cancel this trip" text="Families of every child on the trip are told it is cancelled." confirm="Cancel the trip" onClose={() => setAsk(null)} onDone={async (r) => { await apiClient.post(`/transport/trips/${id}/cancel`, { reason: r }); setAsk(null); toast.success('Trip cancelled.'); reload(); }} />}
      {ask === 'reassign' && t && (
        <AskForm title="Change driver or bus" intro={t.status === 'active' ? 'The trip is under way, so a reason is needed and the first driver loses access at once.' : 'The new bus must not be on hold or already used at this time.'} confirm="Change" fields={[
          { k: 'driverId', label: 'Driver', type: 'select', options: [['', 'Keep the same'], ...(drivers.data || []).filter((d) => d.status === 'active').map((d) => [d._id, d.name])] },
          { k: 'vehicleId', label: 'Bus', type: 'select', options: [['', 'Keep the same'], ...(vehicles.data || []).filter((v) => v.status === 'active').map((v) => [v._id, `${v.plate} (${v.capacity} seats)`])] },
          { k: 'reason', label: 'Reason', type: 'textarea', required: t.status === 'active' }]} onClose={() => setAsk(null)}
        onDone={async (x) => { await apiClient.post(`/transport/trips/${id}/reassign`, { driverId: x.driverId || undefined, vehicleId: x.vehicleId || undefined, reason: x.reason }); setAsk(null); toast.success('Changed.'); reload(); }} />
      )}
      {one && t && (
        <Modal title="Add a child for today" onClose={() => setOne(null)}>
          <form className="grid gap-3" onSubmit={async (e) => { e.preventDefault(); try { await apiClient.post(`/transport/trips/${id}/add-rider`, { studentId: one.child._id, stopId: one.stopId, reason: one.reason }); setOne(null); toast.success('Added to this trip only.'); reload(); } catch (x) { toast.error(errMsg(x)); } }}>
            <ChildPicker value={one.child} onPick={(c) => setOne({ ...one, child: c })} autoFocus />
            <Field label="Stop"><select className={inputCls} value={one.stopId} onChange={(e) => setOne({ ...one, stopId: e.target.value })} required><option value="">Choose a stop</option>{t.stops.map((s) => <option key={String(s.stopId)} value={String(s.stopId)}>{s.name}</option>)}</select></Field>
            <Field label="Why (kept in the record)"><textarea className={inputCls} rows={2} value={one.reason || ''} onChange={(e) => setOne({ ...one, reason: e.target.value })} required minLength={8} /></Field>
            <div className="flex justify-end gap-2"><button type="button" className={btnGhost} onClick={() => setOne(null)}>Not now</button><button className={btnPrimary} disabled={!one.child || !one.stopId}>Add for today</button></div>
          </form>
        </Modal>
      )}
    </Modal>
  );
}
