import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import apiClient from '../../utils/apiClient';
import { Card, Modal, Field, EmptyState, btnGhost, btnPrimary, btnDanger, inputCls, errMsg } from '../ui';
import { useGet, Loading, Note, Table, Td, AskForm, DIR, DAYS, TBadge } from './tpKit';

const blank = () => ({ id: '', name: '', offsetMin: 0, lat: '', lng: '' });

function StopsEditor({ route, onClose, onDone }) {
  const [rows, setRows] = useState(() => (route.stops.filter((s) => s.active !== false).length ? route.stops.filter((s) => s.active !== false).map((s) => ({ id: s._id, name: s.name, offsetMin: s.offsetMin, lat: s.lat ?? '', lng: s.lng ?? '' })) : [blank()]));
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const set = (i, k, v) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const move = (i, d) => { const j = i + d; if (j < 0 || j >= rows.length) return; const c = rows.slice(); [c[i], c[j]] = [c[j], c[i]]; setRows(c); };
  const save = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    try { await apiClient.put(`/transport/routes/${route._id}/stops`, { stops: rows.map((r) => ({ id: r.id || undefined, name: r.name, offsetMin: Number(r.offsetMin), lat: r.lat === '' ? undefined : Number(r.lat), lng: r.lng === '' ? undefined : Number(r.lng) })) }); toast.success('Stops saved.'); onDone(); } catch (x) { setErr(errMsg(x, 'Could not save the stops.')); setBusy(false); }
  };
  return (
    <Modal title={`Stops on ${route.name}`} onClose={onClose} wide>
      <form onSubmit={save} className="space-y-3">
        <p className="text-sm text-[#5b6b7b]">List the stops in the order the bus visits them in the morning. “Minutes from start” is how long after leaving the first stop the bus reaches this one. The afternoon run uses the same stops in reverse. Latitude and longitude are optional; with them, families get a better arrival estimate.</p>
        <div className="space-y-2">{rows.map((r, i) => (
          <div key={i} className="grid grid-cols-12 items-end gap-2 rounded-lg border border-[#e3e7e7] p-2">
            <div className="col-span-12 sm:col-span-4"><Field label={`Stop ${i + 1} name`}><input className={inputCls} value={r.name} onChange={(e) => set(i, 'name', e.target.value)} required /></Field></div>
            <div className="col-span-4 sm:col-span-2"><Field label="Minutes from start"><input type="number" min="0" max="600" className={inputCls} value={r.offsetMin} onChange={(e) => set(i, 'offsetMin', e.target.value)} required /></Field></div>
            <div className="col-span-4 sm:col-span-2"><Field label="Latitude"><input type="number" step="any" className={inputCls} value={r.lat} onChange={(e) => set(i, 'lat', e.target.value)} /></Field></div>
            <div className="col-span-4 sm:col-span-2"><Field label="Longitude"><input type="number" step="any" className={inputCls} value={r.lng} onChange={(e) => set(i, 'lng', e.target.value)} /></Field></div>
            <div className="col-span-12 flex gap-1 sm:col-span-2"><button type="button" className={`${btnGhost} !px-2 !py-1.5 !text-xs`} onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move stop ${i + 1} up`}>Up</button><button type="button" className={`${btnGhost} !px-2 !py-1.5 !text-xs`} onClick={() => move(i, 1)} disabled={i === rows.length - 1} aria-label={`Move stop ${i + 1} down`}>Down</button><button type="button" className={`${btnDanger} !px-2 !py-1.5 !text-xs`} onClick={() => setRows(rows.filter((_, j) => j !== i))} disabled={rows.length === 1} aria-label={`Remove stop ${i + 1}`}>Remove</button></div>
          </div>))}
        </div>
        <button type="button" className={btnGhost} onClick={() => setRows([...rows, { ...blank(), offsetMin: Number(rows[rows.length - 1]?.offsetMin || 0) + 5 }])}>Add a stop</button>
        {err && <p role="alert" className="text-sm text-[#9f1239]">{err}</p>}
        <div className="flex justify-end gap-2"><button type="button" className={btnGhost} onClick={onClose}>Not now</button><button className={btnPrimary} disabled={busy}>{busy ? 'Saving…' : 'Save the stops'}</button></div>
      </form>
    </Modal>
  );
}

function PlanForm({ route, direction, existing, vehicles, drivers, onClose, onDone }) {
  const [f, setF] = useState(() => ({ startTime: existing?.startTime || (direction === 'morning' ? '07:00' : '14:00'), durationMin: existing?.durationMin || 40, days: existing?.days || [1, 2, 3, 4, 5], vehicleId: existing?.vehicleId || '', driverId: existing?.driverId || '', escortName: existing?.escortName || '', reason: '' }));
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const tog = (d) => setF({ ...f, days: f.days.includes(d) ? f.days.filter((x) => x !== d) : [...f.days, d].sort() });
  const save = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    try { const r = await apiClient.put('/transport/plans', { routeId: route._id, direction, ...f, durationMin: Number(f.durationMin), vehicleId: f.vehicleId || undefined, driverId: f.driverId || undefined }); (r.data.warnings || []).forEach((w) => toast(w, { icon: '⚠️', duration: 7000 })); toast.success('Plan saved.'); onDone(); } catch (x) { setErr(errMsg(x, 'Could not save the plan.')); setBusy(false); }
  };
  return (
    <Modal title={`${route.name} · ${DIR[direction]}`} onClose={onClose}>
      <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
        <Field label="Leaves at"><input type="time" className={inputCls} value={f.startTime} onChange={(e) => setF({ ...f, startTime: e.target.value })} required /></Field>
        <Field label="Run takes (minutes)"><input type="number" min="5" max="600" className={inputCls} value={f.durationMin} onChange={(e) => setF({ ...f, durationMin: e.target.value })} required /></Field>
        <fieldset className="sm:col-span-2"><legend className="mb-1 text-xs font-semibold text-[#3b4a5c]">Days it runs</legend><div className="flex flex-wrap gap-2">{DAYS.map((d, i) => <label key={d} className={`cursor-pointer rounded-lg border px-3 py-1.5 text-sm ${f.days.includes(i) ? 'border-[#2a5cac] bg-[#eef2f8] font-semibold' : 'border-[#e3e7e7]'}`}><input type="checkbox" className="sr-only" checked={f.days.includes(i)} onChange={() => tog(i)} />{d}</label>)}</div></fieldset>
        <Field label="Bus"><select className={inputCls} value={f.vehicleId} onChange={(e) => setF({ ...f, vehicleId: e.target.value })}><option value="">Not chosen yet</option>{vehicles.filter((v) => v.status !== 'retired').map((v) => <option key={v._id} value={v._id}>{v.plate} ({v.capacity} seats){v.status === 'inspection_hold' ? ' – on hold' : ''}</option>)}</select></Field>
        <Field label="Driver"><select className={inputCls} value={f.driverId} onChange={(e) => setF({ ...f, driverId: e.target.value })}><option value="">Not chosen yet</option>{drivers.filter((d) => d.status === 'active').map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}</select></Field>
        <div className="sm:col-span-2"><Field label="Escort or attendant (optional)"><input className={inputCls} value={f.escortName} onChange={(e) => setF({ ...f, escortName: e.target.value })} /></Field></div>
        {existing && <div className="sm:col-span-2"><Field label="Why are you changing it? (kept in the record)"><textarea className={inputCls} rows={2} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} required minLength={5} /></Field></div>}
        {err && <p role="alert" className="text-sm text-[#9f1239] sm:col-span-2">{err}</p>}
        <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" className={btnGhost} onClick={onClose}>Not now</button><button className={btnPrimary} disabled={busy || !f.days.length}>{busy ? 'Saving…' : 'Save the plan'}</button></div>
      </form>
    </Modal>
  );
}

export default function Routes({ manage }) {
  const g = useGet('/transport/routes'); const vehicles = useGet('/transport/vehicles'); const drivers = useGet('/transport/drivers');
  const [add, setAdd] = useState(false); const [stops, setStops] = useState(null); const [plan, setPlan] = useState(null);
  return (
    <div className="space-y-3">
      <Note>A route is a list of stops. A plan says which bus and driver run it, at what time, on which days. The system makes each day’s trips from the plans. Assign children to a stop under Children.</Note>
      {manage && <div><button className={btnPrimary} onClick={() => setAdd(true)}>Add a route</button></div>}
      <Loading g={g}>{g.data && (g.data.length === 0 ? <Card><EmptyState title="No routes yet" text="Add a route, then list its stops and plan a morning and afternoon run." /></Card> : (
        <div className="grid gap-3 lg:grid-cols-2">{g.data.map((r) => (
          <Card key={r._id}>
            <div className="flex items-start justify-between gap-2"><div><h3 className="font-semibold text-[#1b2837]">{r.name}</h3><p className="text-xs text-[#5b6b7b]">{r.riders} children{r.monthlyFee ? ` · Rs ${Number(r.monthlyFee).toLocaleString('en-PK')} a month` : ''}</p></div>{manage && <button className={`${btnGhost} !px-3 !py-1.5 !text-xs`} onClick={() => setStops(r)}>Edit stops</button>}</div>
            {r.ridersWithoutStop > 0 && <p className="mt-2 rounded-lg bg-[#fbf0ec] px-2 py-1 text-xs text-[#8a4636]">{r.ridersWithoutStop} child(ren) have no stop yet, so they are left off the trips.</p>}
            <ol className="mt-2 space-y-0.5 text-sm">{r.stops.filter((s) => s.active !== false).map((s) => <li key={s._id}><span className="text-xs text-[#5b6b7b]">+{s.offsetMin} min</span> · {s.name}{s.lat != null && s.lng != null ? <span className="text-xs text-[#5b6b7b]"> · has position</span> : null}</li>)}{r.stops.filter((s) => s.active !== false).length === 0 && <li className="text-[#5b6b7b]">No stops yet.</li>}</ol>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">{['morning', 'afternoon'].map((d) => { const p = r.plans.find((x) => x.direction === d); return (
              <div key={d} className="rounded-lg border border-[#e3e7e7] p-2 text-sm"><p className="text-xs font-semibold text-[#3b4a5c]">{DIR[d]}</p>
                {p ? <p className="mt-1">{p.startTime} · {p.durationMin} min<br /><span className="text-xs text-[#5b6b7b]">{p.days.map((x) => DAYS[x]).join(' ')}</span></p> : <p className="mt-1 text-xs text-[#5b6b7b]">No plan yet.</p>}
                {manage && <button className="mt-1 text-xs font-semibold text-[#2a5cac] underline" disabled={!r.stops.some((s) => s.active !== false)} onClick={() => setPlan({ route: r, direction: d, existing: p })}>{p ? 'Change the plan' : 'Make a plan'}</button>}</div>); })}</div>
          </Card>))}</div>))}</Loading>
      {add && <AskForm title="Add a route" confirm="Add the route" fields={[{ k: 'name', label: 'Route name', required: true, full: true }, { k: 'monthlyFee', label: 'Monthly fee (Rs)', type: 'number', min: 0, def: 0 }, { k: 'notes', label: 'Notes', type: 'textarea' }]} onClose={() => setAdd(false)} onDone={async (x) => { await apiClient.post('/transport/routes', { ...x, monthlyFee: Number(x.monthlyFee || 0) }); setAdd(false); toast.success('Route added.'); g.reload(); }} />}
      {stops && <StopsEditor route={stops} onClose={() => setStops(null)} onDone={() => { setStops(null); g.reload(); }} />}
      {plan && <PlanForm route={plan.route} direction={plan.direction} existing={plan.existing} vehicles={vehicles.data || []} drivers={drivers.data || []} onClose={() => setPlan(null)} onDone={() => { setPlan(null); g.reload(); }} />}
    </div>
  );
}
