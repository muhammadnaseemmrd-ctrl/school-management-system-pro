import React, { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import apiClient from '../../utils/apiClient';
import { Card, Field, EmptyState, btnGhost, btnPrimary, btnDanger, inputCls, errMsg } from '../ui';
import { useGet, Loading, Note, TBadge, DIR, hm, day, today, Table, Td } from './tpKit';

const STATE_WORD = { expected: 'Not on the bus yet', boarded: 'On the bus', alighted: 'Got off', no_show: 'The bus did not find them at the stop', opted_out: 'Not riding today', absent: 'Marked absent from school', exception: 'The school is looking into it' };

// A plain picture of the route: stops in order, the bus as a marker. No map service is contacted, so nothing about the child leaves the school's own system.
function RouteLine({ live }) {
  const stops = live.stops; const lat = (s) => s.lat; const have = stops.filter((s) => s.lat != null && s.lng != null);
  return (
    <div className="space-y-2">
      <ol className="space-y-1 text-sm" aria-label="Stops on the route">{stops.map((s, i) => <li key={i} className={`flex items-center gap-2 ${s.mine ? 'font-semibold text-[#1b2837]' : 'text-[#3b4a5c]'}`}><span className={`inline-block h-3 w-3 rounded-full ${s.arrived ? 'bg-[#215a52]' : 'border-2 border-[#2a5cac] bg-white'}`} aria-hidden="true" />{s.name}{s.mine ? ' (your stop)' : ''}{s.arrived ? <span className="text-xs text-[#5b6b7b]"> · bus has been here</span> : null}</li>)}</ol>
      {have.length > 0 && live.position && (() => {
        const xs = [...have.map((s) => s.lng), live.position.lng]; const ys = [...have.map((s) => s.lat), live.position.lat]; const x0 = Math.min(...xs); const x1 = Math.max(...xs); const y0 = Math.min(...ys); const y1 = Math.max(...ys); const W = 320; const H = 160; const pad = 16;
        const px = (x) => pad + (x1 === x0 ? (W - 2 * pad) / 2 : ((x - x0) / (x1 - x0)) * (W - 2 * pad)); const py = (y) => H - pad - (y1 === y0 ? (H - 2 * pad) / 2 : ((y - y0) / (y1 - y0)) * (H - 2 * pad));
        return (
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-sm rounded-xl border border-[#e3e7e7] bg-[#f7f6f2]" role="img" aria-label={`Sketch of the route. The bus is ${live.stopsAway} stop(s) before ${live.stopName}.`}>
            <polyline fill="none" stroke="#9fb4d6" strokeWidth="2" points={have.map((s) => `${px(s.lng)},${py(s.lat)}`).join(' ')} />
            {have.map((s, i) => <circle key={i} cx={px(s.lng)} cy={py(s.lat)} r={s.mine ? 6 : 4} fill={s.mine ? '#2a5cac' : s.arrived ? '#215a52' : '#fff'} stroke="#2a5cac" strokeWidth="2" />)}
            <g transform={`translate(${px(live.position.lng)},${py(live.position.lat)})`}><rect x="-9" y="-6" width="18" height="12" rx="3" fill="#b45309" /><circle cx="-4" cy="7" r="2" fill="#1b2837" /><circle cx="4" cy="7" r="2" fill="#1b2837" /></g>
          </svg>
        );
      })()}
    </div>
  );
}

function Live({ childId }) {
  const [d, setD] = useState(null); const [err, setErr] = useState(''); const [tick, setTick] = useState(0);
  useEffect(() => { let on = true; apiClient.get('/transport/me/live', { params: { childId } }).then((r) => { if (on) { setD(r.data); setErr(''); } }).catch((e) => { if (on) setErr(errMsg(e, 'Could not load the live view.')); }); return () => { on = false; }; }, [childId, tick]);
  useEffect(() => { if (!d || !d.live) return undefined; const t = setInterval(() => setTick((x) => x + 1), 15000); return () => clearInterval(t); }, [d && d.live]); // eslint-disable-line react-hooks/exhaustive-deps
  if (err) return <p role="alert" className="text-sm text-[#9f1239]">{err}</p>; if (!d) return <p className="text-sm text-[#5b6b7b]" role="status">Loading…</p>;
  if (!d.live) return <p className="text-sm text-[#5b6b7b]">{d.reason === 'no_active_trip' ? 'The bus is not on a trip right now. The live view appears here while it is.' : d.reason === 'no_position_yet' ? 'The trip has started, but the bus has not sent its position yet.' : d.reason === 'not_a_rider' ? 'This child does not ride a school bus.' : 'The live view is not available.'}</p>;
  return (
    <div className="space-y-2" aria-live="polite">
      <p className="text-sm"><b>{d.routeName}</b> · {DIR[d.direction]}{d.delayMin >= 5 ? <span className="text-[#8a4636]"> · running {d.delayMin} minutes late</span> : <span className="text-[#215a52]"> · on time</span>}</p>
      <p className="text-sm">{d.stopsAway === 0 && !d.etaAt ? `The bus has reached ${d.stopName}.` : <>Expected at <b>{d.stopName}</b> around <b>{hm(d.etaAt)}</b>{d.stopsAway ? ` (${d.stopsAway} stop${d.stopsAway === 1 ? '' : 's'} before it)` : ''}.</>}</p>
      <RouteLine live={d} />
      <p className="text-xs text-[#5b6b7b]">{d.note} Last position {hm(d.position.at)}.</p>
    </div>
  );
}

function TrackingChoice({ childId, on, onChange }) {
  const [busy, setBusy] = useState(false);
  const set = async (grant) => {
    setBusy(true);
    try { if (grant) await apiClient.post('/consents/mine', { subjectType: 'student', subjectId: childId, purpose: 'bus_tracking' }); else await apiClient.post('/consents/mine/withdraw', { subjectType: 'student', subjectId: childId, purpose: 'bus_tracking' }); toast.success(grant ? 'The live bus view is on.' : 'The live bus view is off.'); onChange(); } catch (e) { toast.error(errMsg(e)); }
    setBusy(false);
  };
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#f7f6f2] p-3 text-sm"><span>{on ? 'You have agreed to the live bus view for this child. You can take your agreement back at any time.' : 'Showing where the bus is needs your agreement. It is used only for this and only while the trip is under way.'}</span>
      <button className={on ? btnGhost : btnPrimary} disabled={busy} onClick={() => set(!on)}>{busy ? 'Working…' : on ? 'Turn the live view off' : 'Agree and turn it on'}</button></div>
  );
}

export default function TransportMe({ role = 'parent', childId = '' }) {
  const g = useGet('/transport/me', { childId: role === 'parent' ? childId : undefined }); const d = g.data; const [skip, setSkip] = useState(false); const [concern, setConcern] = useState(false); const [f, setF] = useState({ date: today(), direction: 'both', reason: '' }); const [note, setNote] = useState(''); const [busy, setBusy] = useState(false);
  const submitSkip = async (e) => { e.preventDefault(); setBusy(true); try { await apiClient.post('/transport/me/skip', { childId, ...f }); toast.success('The bus will not wait for this child.'); setSkip(false); g.reload(); } catch (x) { toast.error(errMsg(x)); } setBusy(false); };
  const submitConcern = async (e) => { e.preventDefault(); setBusy(true); try { const r = await apiClient.post('/transport/me/concern', { childId, note }); toast.success(`Sent to the school (${r.data.incidentNo}).`); setConcern(false); setNote(''); } catch (x) { toast.error(errMsg(x)); } setBusy(false); };
  return (
    <Loading g={g}>{d && (
      <div className="space-y-4">
        <div><h2 className="text-xl font-bold text-[#1b2837]">School bus</h2><p className="text-sm text-[#5b6b7b]">{d.child.name}</p></div>
        {!d.rider ? <Card><EmptyState title="Not on a school bus" text="This child is not on a bus route. If they should be, ask the school office." /></Card> : (
          <>
            <Card><h3 className="mb-2 font-semibold text-[#1b2837]">Route</h3><dl className="grid gap-2 text-sm sm:grid-cols-3"><div><dt className="text-xs text-[#5b6b7b]">Route</dt><dd className="font-medium">{d.rider.routeName}</dd></div><div><dt className="text-xs text-[#5b6b7b]">Stop</dt><dd className="font-medium">{d.rider.stopName || 'Not chosen yet'}</dd></div><div><dt className="text-xs text-[#5b6b7b]">At the end of the day</dt><dd className="font-medium">{d.rider.handoff === 'guardian' ? 'Handed to an authorised adult' : 'May go home on their own'}</dd></div></dl>
              {d.rider.plans.length > 0 && <p className="mt-2 text-xs text-[#5b6b7b]">{d.rider.plans.map((p) => `${DIR[p.direction]} leaves at ${p.startTime}`).join(' · ')}</p>}</Card>
            <Card><h3 className="mb-2 font-semibold text-[#1b2837]">Today</h3>
              {d.trips.length === 0 ? <p className="text-sm text-[#5b6b7b]">No bus trip for this child today.</p> : <ul className="space-y-3">{d.trips.map((t) => (
                <li key={t.tripId} className="rounded-xl border border-[#e3e7e7] p-3 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><b>{DIR[t.direction]}</b><TBadge k="trip" s={t.status} /></div>
                  <p className="mt-1">{t.stopName} · planned {hm(t.plannedAt)}{t.etaAt ? ` · now expected ${hm(t.etaAt)}` : ''}{t.delayMin >= 5 ? <span className="text-[#8a4636]"> ({t.delayMin} min late)</span> : null}</p>
                  <p className="mt-1 text-[#3b4a5c]">{STATE_WORD[t.state] || t.state}{t.boardedAt ? ` · on at ${hm(t.boardedAt)}` : ''}{t.alightedAt ? ` · off at ${hm(t.alightedAt)}` : ''}{t.handedTo ? ` · received by ${t.handedTo}` : ''}</p>
                  {t.driverFirstName && <p className="text-xs text-[#5b6b7b]">Driver {t.driverFirstName} · bus {t.vehiclePlate}</p>}</li>))}</ul>}</Card>
            {role === 'parent' && (
              <Card><h3 className="mb-2 font-semibold text-[#1b2837]">Where is the bus?</h3>
                {d.tracking.consent ? <Live childId={childId} /> : <p className="text-sm text-[#5b6b7b]">The live bus view is off.</p>}<TrackingChoice childId={childId} on={d.tracking.consent} onChange={g.reload} />
                <p className="mt-2 text-xs text-[#5b6b7b]">The bus position is shown only while the trip is under way, is never shown on a child’s own login, and is deleted when the trip ends.</p></Card>
            )}
            {role === 'parent' && (
              <Card><div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-semibold text-[#1b2837]">Not riding?</h3><p className="text-sm text-[#5b6b7b]">Tell the bus not to wait for {d.child.name.split(' ')[0]} on a day.</p></div><button className={btnGhost} onClick={() => setSkip(true)}>Give notice</button></div>
                {d.skips.length > 0 && <ul className="mt-3 space-y-1 text-sm">{d.skips.map((s) => <li key={s._id} className="flex items-center justify-between gap-2"><span>{day(s.date)} · {s.direction === 'both' ? 'both runs' : DIR[s.direction]}{s.reason ? ` · ${s.reason}` : ''}</span><button className="text-xs font-semibold text-[#2a5cac] underline" onClick={async () => { try { await apiClient.delete(`/transport/me/skip/${s._id}`); toast.success('Notice taken back.'); g.reload(); } catch (x) { toast.error(errMsg(x)); } }} aria-label={`Take back notice for ${day(s.date)}`}>Take back</button></li>)}</ul>}</Card>
            )}
            {d.history.length > 0 && <Card><h3 className="mb-2 font-semibold text-[#1b2837]">Recent days</h3><Table label="Recent bus trips" head={['Day', 'Run', 'What happened']} min={420}>{d.history.slice(0, 10).map((h, i) => <tr key={i}><Td>{day(h.date)}</Td><Td>{DIR[h.direction]}</Td><Td>{STATE_WORD[h.state] || h.state}{h.boardedAt ? ` · on ${hm(h.boardedAt)}` : ''}{h.alightedAt ? ` · off ${hm(h.alightedAt)}` : ''}</Td></tr>)}</Table></Card>}
            {role === 'parent' && <div><button className={btnGhost} onClick={() => setConcern(true)}>Tell the school about a concern</button></div>}
          </>
        )}
        {skip && (
          <div role="dialog" aria-modal="true" aria-label="Give notice" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><form onSubmit={submitSkip} className="w-full max-w-md space-y-3 rounded-2xl bg-white p-5"><h3 className="text-lg font-semibold">Not riding</h3>
            <Field label="Day"><input type="date" className={inputCls} min={today()} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} required /></Field>
            <Field label="Which run"><select className={inputCls} value={f.direction} onChange={(e) => setF({ ...f, direction: e.target.value })}><option value="both">Both runs</option><option value="morning">Morning only</option><option value="afternoon">Afternoon only</option></select></Field>
            <Field label="Reason (optional)"><input className={inputCls} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} maxLength={200} /></Field>
            <div className="flex justify-end gap-2"><button type="button" className={btnGhost} onClick={() => setSkip(false)}>Not now</button><button className={btnPrimary} disabled={busy}>{busy ? 'Sending…' : 'Send notice'}</button></div></form></div>
        )}
        {concern && (
          <div role="dialog" aria-modal="true" aria-label="Tell the school about a concern" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><form onSubmit={submitConcern} className="w-full max-w-md space-y-3 rounded-2xl bg-white p-5"><h3 className="text-lg font-semibold">A concern about the bus or route</h3>
            <Field label="What is the concern?" hint="For example an unsafe stop, a late bus, or how a trip is run."><textarea className={inputCls} rows={4} value={note} onChange={(e) => setNote(e.target.value)} required minLength={10} maxLength={500} /></Field>
            <p className="text-xs text-[#5b6b7b]">Goes to the school’s transport office and gets a number. For an emergency, phone the school.</p>
            <div className="flex justify-end gap-2"><button type="button" className={btnGhost} onClick={() => setConcern(false)}>Not now</button><button className={btnPrimary} disabled={busy || note.trim().length < 10}>{busy ? 'Sending…' : 'Send'}</button></div></form></div>
        )}
      </div>
    )}</Loading>
  );
}
