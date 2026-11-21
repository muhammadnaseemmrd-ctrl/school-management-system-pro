import React, { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import apiClient from '../../utils/apiClient';
import { Card, Stat, EmptyState, btnGhost, btnPrimary, errMsg } from '../ui';
import { useGet, Loading, Note, Table, Td, Reason, TBadge, DIR_SHORT, KIND_WORD, hm, dt, day } from './tpKit';
import TripDetail from './TripDetail';

export function TripRow({ t, onOpen }) {
  return (
    <tr>
      <Td><button className="font-semibold text-[#2a5cac] underline" onClick={() => onOpen(t._id)} aria-label={`Open ${t.routeName} ${DIR_SHORT[t.direction]} trip`}>{t.routeName}</button><div className="text-xs text-[#5b6b7b]">{DIR_SHORT[t.direction]} · {day(t.date)}</div></Td>
      <Td><TBadge k="trip" s={t.status} />{t.status === 'active' && t.delayMin >= 5 && <div className="mt-1 text-xs text-[#8a4636]">{t.delayMin} min late</div>}{t.status === 'completed' && t.unreconciled > 0 && <div className="mt-1 text-xs font-semibold text-[#9f1239]">{t.unreconciled} not accounted for</div>}</Td>
      <Td>{hm(t.plannedStart)}{t.startedAt ? <div className="text-xs text-[#5b6b7b]">left {hm(t.startedAt)}</div> : null}</Td>
      <Td>{t.vehiclePlate || '—'}<div className="text-xs text-[#5b6b7b]">{t.driverName || 'No driver'}</div></Td>
      <Td>{(t.counts?.boarded || 0)} on · {(t.counts?.expected || 0)} waiting · {(t.counts?.alighted || 0)} off</Td>
    </tr>
  );
}

export default function Today({ go }) {
  const g = useGet('/transport/overview'); const d = g.data; const [open, setOpen] = useState(null); const [busy, setBusy] = useState(false); const [ask, setAsk] = useState(null);
  const active = d && d.totals.active > 0;
  useEffect(() => { if (!active) return undefined; const t = setInterval(() => g.reload(), 20000); return () => clearInterval(t); }, [active]); // eslint-disable-line react-hooks/exhaustive-deps
  const make = async () => { setBusy(true); try { const r = await apiClient.post('/transport/trips/generate', {}); toast.success(r.data.made ? `${r.data.made} trip(s) made.` : 'Every trip for today already exists.'); g.reload(); } catch (e) { toast.error(errMsg(e)); } setBusy(false); };
  return (
    <Loading g={g}>{d && (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5"><Stat label="Trips today" value={d.totals.trips} /><Stat label="On the road" value={d.totals.active} /><Stat label="Not started" value={d.totals.notStarted} tone={d.totals.notStarted ? 'text-[#8a4636]' : undefined} /><Stat label="Finished" value={d.totals.completed} /><Stat label="Did not run" value={d.totals.missed} tone={d.totals.missed ? 'text-[#9f1239]' : undefined} /></div>
        {d.vehiclesOnHold.length > 0 && <Note tone="warn">{d.vehiclesOnHold.map((v) => v.plate).join(', ')} {d.vehiclesOnHold.length > 1 ? 'are' : 'is'} on hold after a failed inspection. A held bus cannot start a trip. Give its trips to another bus, or pass a new inspection.</Note>}
        {d.exceptions.length > 0 && (
          <Card><h3 className="mb-2 font-semibold text-[#1b2837]">Children who need someone now</h3>
            <ul className="space-y-2 text-sm">{d.exceptions.map((x) => <li key={x._id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[#fff1f2] p-2"><span><b>{x.studentName}</b> · {KIND_WORD[x.exception.kind] || x.exception.kind}<span className="block text-xs text-[#5b6b7b]">{x.exception.note}</span></span><button className={`${btnGhost} !px-3 !py-1.5 !text-xs`} onClick={() => setAsk(x)}>Settle</button></li>)}</ul></Card>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold text-[#1b2837]">Today’s trips, {day(d.date)}</h3>{active && <span className="text-xs text-[#5b6b7b]" role="status">Updating every 20 seconds</span>}<button className={btnGhost} disabled={busy} onClick={make}>{busy ? 'Working…' : 'Make today’s trips'}</button></div>
        {d.trips.length === 0 ? <Card><EmptyState title="No trips today" text={d.plans === 0 ? 'No run is planned yet. Open Routes and stops to make a plan with a bus, a driver and the days it runs.' : 'None of the plans run today. If this is wrong, check the days of each plan.'} action={d.plans === 0 ? <button className={btnPrimary} onClick={() => go('routes')}>Open routes and stops</button> : null} /></Card> : (
          <Table label="Today's trips" head={['Route', 'Status', 'Planned', 'Bus and driver', 'Children']} min={680}>{d.trips.map((t) => <TripRow key={t._id} t={t} onOpen={setOpen} />)}</Table>
        )}
        <div className="grid gap-3 lg:grid-cols-2">
          <Card><h3 className="mb-2 font-semibold text-[#1b2837]">Open incidents</h3>{d.incidents.length === 0 ? <p className="text-sm text-[#5b6b7b]">None open.</p> : <ul className="space-y-2 text-sm">{d.incidents.slice(0, 6).map((i) => <li key={i._id} className="flex items-start justify-between gap-2"><span><b>{i.incidentNo}</b> · {KIND_WORD[i.kind] || i.kind}<span className="block text-xs text-[#5b6b7b]">{i.note}</span></span><TBadge k="severity" s={i.severity} /></li>)}</ul>}<button className="mt-2 text-xs font-semibold text-[#2a5cac] underline" onClick={() => go('incidents')}>Open all incidents</button></Card>
          <Card><h3 className="mb-2 font-semibold text-[#1b2837]">Papers and inspections</h3>{d.expiring.length === 0 && d.inspectionsDue.length === 0 ? <p className="text-sm text-[#5b6b7b]">Nothing is due soon.</p> : <ul className="space-y-1 text-sm">{d.expiring.map((x, i) => <li key={i} className={x.expired ? 'font-semibold text-[#9f1239]' : ''}>{x.kind}: {x.who} {x.expired ? 'ran out' : 'runs out'} {day(x.on)}</li>)}{d.inspectionsDue.map((v) => <li key={v._id}>{v.plate}: inspection {v.due ? `due ${day(v.due)}` : 'has never been done'}</li>)}</ul>}</Card>
        </div>
        {open && <TripDetail id={open} onClose={() => setOpen(null)} onChange={g.reload} />}
        {ask && <Reason title={`Settle: ${ask.studentName}`} text="Say what was done. The family is not told the details; the account stays in the record." confirm="Mark as settled" danger={false} label="What was done" min={8} onClose={() => setAsk(null)} onDone={async (r) => { await apiClient.post(`/transport/exceptions/${ask._id}/resolve`, { resolution: r }); setAsk(null); toast.success('Settled.'); g.reload(); }} />}
      </div>
    )}</Loading>
  );
}
