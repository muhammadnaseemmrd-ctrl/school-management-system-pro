import React, { useCallback, useEffect, useRef, useState } from 'react';
import { plain } from '../training/tkit';
import { btnGhost, btnPrimary, btnDanger, inputCls, errMsg } from '../ui';
import { KIND_WORD, DIR, hm, key as newKey } from './tpKit';

// The driver's phone page. No school sign-in: the private link is the way in, kept on this phone and sent in headers.
// Every action carries its own id and the time it was done, so one sent twice counts once, and a bad signal never loses a child.
const QKEY = 'driverQueue';
const loadQ = () => { try { return JSON.parse(localStorage.getItem(QKEY) || '[]'); } catch (e) { return []; } };
const saveQ = (q) => { try { localStorage.setItem(QKEY, JSON.stringify(q.slice(-300))); } catch (e) { /* storage full: stays in memory for this visit */ } };
const PROBLEMS = ['vehicle_fault', 'accident', 'breakdown', 'behaviour', 'medical', 'route_hazard', 'late', 'other'];

export default function DriverApp({ link, onLeave }) {
  const [id, k] = link.split('.'); const H = { 'X-Driver-Id': id, 'X-Driver-Key': k };
  const get = useCallback((p) => plain.get(`/transport/driver${p}`, { headers: H }), [link]); // eslint-disable-line react-hooks/exhaustive-deps
  const post = useCallback((p, b) => plain.post(`/transport/driver${p}`, b || {}, { headers: H }), [link]); // eslint-disable-line react-hooks/exhaustive-deps
  const [me, setMe] = useState(null); const [err, setErr] = useState(''); const [sel, setSel] = useState(null); const [queue, setQueue] = useState(loadQ); const [refused, setRefused] = useState([]); const [online, setOnline] = useState(navigator.onLine !== false);
  const [busy, setBusy] = useState(false); const [stop, setStop] = useState(null); const [ho, setHo] = useState(null); const [end, setEnd] = useState(null); const [prob, setProb] = useState(null); const [answers, setAnswers] = useState({}); const [alert_, setAlert] = useState('');
  const lastPing = useRef(0);

  const refresh = useCallback(async () => { try { const r = await get('/me'); setMe(r.data); setErr(''); } catch (e) { if (e.response && e.response.status === 401) { setErr('This link is no longer valid. Ask the school for a new one.'); setMe(null); } else if (!me) setErr(errMsg(e, 'Could not load your trips. Check your signal.')); } }, [get]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { refresh(); }, [refresh]);
  const trip = me && me.trips.find((t) => t._id === sel);
  useEffect(() => { const on = () => setOnline(true); const off = () => setOnline(false); window.addEventListener('online', on); window.addEventListener('offline', off); return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); }; }, []);
  const patchLocal = (tripId, body) => setMe((m) => m && ({ ...m, trips: m.trips.map((t) => { if (t._id !== tripId) return t; const now = new Date().toISOString(); const riders = t.riders.map((r) => {
    if (body.studentId && String(r.studentId) !== String(body.studentId)) return r;
    if (body.type === 'board') return { ...r, state: 'boarded', boardedAt: now }; if (body.type === 'no_show') return { ...r, state: 'no_show' }; if (body.type === 'alight') return { ...r, state: 'alighted' };
    if (body.type === 'school_arrival' && r.state === 'boarded') return { ...r, state: 'alighted' }; return r; });
    const stops = body.type === 'arrive' ? t.stops.map((s) => (String(s.stopId) === String(body.stopId) ? { ...s, arrivedAt: now } : s)) : t.stops; return { ...t, riders, stops }; }) }));

  // Send what is waiting, oldest first. A refused one is shown to the driver once and dropped; one that could not be sent stays.
  const flush = useCallback(async (q0) => {
    const q = q0 || queue; if (!q.length) return;
    try { const r = await post('/sync', { ops: q }); const keep = []; const bad = []; r.data.results.forEach((res, i) => { const op = q.find((x) => x.clientKey === res.clientKey) || q[i]; if (res.ok) return; if (res.retry) keep.push(op); else bad.push({ op, message: res.message }); }); setQueue(keep); saveQ(keep); if (bad.length) setRefused((x) => [...x, ...bad]); await refresh(); } catch (e) { /* still offline: they stay */ }
  }, [post, queue, refresh]);
  useEffect(() => { if (online && queue.length) flush(); }, [online]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (tripId, body, { quiet } = {}) => {
    const op = { ...body, tripId, clientKey: newKey(), at: new Date().toISOString() }; setBusy(true); setAlert('');
    try { const r = await post(`/trips/${tripId}/op`, op); await refresh(); return { ok: true, data: r.data }; }
    catch (e) {
      if (!e.response) { if (['board', 'no_show', 'alight', 'arrive', 'school_arrival'].includes(body.type)) { const q = [...queue, op]; setQueue(q); saveQ(q); patchLocal(tripId, body); return { ok: true, queued: true }; } setAlert('No signal. This step needs a connection. Try again when you are back in coverage.'); return { ok: false }; }
      const m = e.response.data || {}; setAlert(m.message || 'That did not work.'); return { ok: false, data: m };
    } finally { setBusy(false); }
  };

  // The bus's position, only while a trip is active and only from this phone.
  const active = me && me.trips.find((t) => t.status === 'active');
  useEffect(() => {
    if (!active || !navigator.geolocation) return undefined;
    const send = (p) => { const now = Date.now(); if (now - lastPing.current < 15000 || !navigator.onLine) return; lastPing.current = now; post(`/trips/${active._id}/op`, { type: 'ping', lat: p.coords.latitude, lng: p.coords.longitude, speedKmh: p.coords.speed != null ? Math.round(p.coords.speed * 3.6) : undefined, at: new Date().toISOString() }).catch(() => {}); };
    const w = navigator.geolocation.watchPosition(send, () => {}, { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 });
    let lock = null; try { if (navigator.wakeLock) navigator.wakeLock.request('screen').then((l) => { lock = l; }).catch(() => {}); } catch (e) { /* not supported */ }
    return () => { navigator.geolocation.clearWatch(w); if (lock) lock.release().catch(() => {}); };
  }, [active && active._id]); // eslint-disable-line react-hooks/exhaustive-deps

  const waiting = queue.length;
  const banner = (
    <div className="space-y-2">
      {!online && <p role="status" className="rounded-lg bg-[#fbf0ec] px-3 py-2 text-sm text-[#8a4636]">No signal. Boarding, stops and hand-overs are saved on this phone and sent when you are back.</p>}
      {waiting > 0 && <p role="status" className="flex items-center justify-between gap-2 rounded-lg bg-[#eef2f8] px-3 py-2 text-sm text-[#234c91]"><span>{waiting} action{waiting === 1 ? '' : 's'} saved on this phone, not yet sent.</span><button className={`${btnGhost} !px-3 !py-1 !text-xs`} onClick={() => flush()} disabled={!online}>Send now</button></p>}
      {refused.length > 0 && <div role="alert" className="rounded-lg bg-[#fff1f2] px-3 py-2 text-sm text-[#9f1239]"><b>The school could not accept {refused.length === 1 ? 'one saved action' : `${refused.length} saved actions`}:</b><ul className="mt-1 list-disc ps-5">{refused.map((r, i) => <li key={i}>{r.message}</li>)}</ul><button className="mt-1 text-xs font-semibold underline" onClick={() => setRefused([])}>I have read this</button></div>}
      {alert_ && <p role="alert" className="rounded-lg bg-[#fff1f2] px-3 py-2 text-sm font-semibold text-[#9f1239]">{alert_}</p>}
    </div>
  );

  if (err && !me) return <div className="space-y-3"><p role="alert" className="text-[#9f1239]">{err}</p><button className={btnGhost} onClick={onLeave}>Use a different link</button></div>;
  if (!me) return <p role="status" className="text-sm text-[#5b6b7b]">Loading…</p>;

  const head = (
    <div className="flex items-start justify-between gap-2"><div><p className="text-xs font-semibold uppercase tracking-widest text-[#5b6b7b]">{me.school.name}</p><h1 className="text-xl font-semibold text-[#1b2837]">{sel ? `${trip?.routeName || ''}` : `Hello, ${me.driver.name.split(' ')[0]}`}</h1></div>
      <span className="flex gap-2">{sel && <button className={`${btnGhost} !px-3 !py-1.5 !text-xs`} onClick={() => { setSel(null); setAlert(''); }}>All trips</button>}{!sel && <button className={`${btnGhost} !px-3 !py-1.5 !text-xs`} onClick={onLeave}>Sign out</button>}</span></div>
  );

  if (!sel || !trip) return (
    <div className="space-y-3">{head}{banner}
      {me.trips.length === 0 ? <p className="rounded-xl border border-[#e3e7e7] bg-white p-4 text-sm text-[#3b4a5c]">No trip is given to you today.{me.school.phone ? ` Call the school on ${me.school.phone} if that is wrong.` : ''}</p> : (
        <ul className="space-y-2">{me.trips.map((t) => <li key={t._id}><button className="w-full rounded-2xl border border-[#e3e7e7] bg-white p-4 text-start hover:bg-[#f7f6f2]" onClick={() => setSel(t._id)}><span className="flex items-center justify-between gap-2"><b>{t.routeName}</b><span className="rounded-md bg-[#eef2f8] px-2 py-0.5 text-[11px] font-semibold text-[#234c91]">{{ scheduled: 'Not started', checked: 'Ready to go', active: 'On the road', completed: 'Finished', cancelled: 'Cancelled', missed: 'Did not run' }[t.status]}</span></span><span className="mt-1 block text-sm text-[#3b4a5c]">{DIR[t.direction]} · {hm(t.plannedStart)} · bus {t.vehiclePlate || 'not set'}</span><span className="block text-xs text-[#5b6b7b]">{t.riders.length} children</span></button></li>)}</ul>)}
      <button className={btnGhost} onClick={refresh}>Refresh</button>
    </div>
  );

  const onBus = trip.riders.filter((r) => r.state === 'boarded'); const unaccounted = trip.riders.filter((r) => ['boarded', 'expected'].includes(r.state)).length; const afternoon = trip.direction === 'afternoon';
  const stopsLeft = trip.stops.filter((s) => !s.arrivedAt); const nextStop = stopsLeft[0];
  const checklist = trip.checklist; const allAnswered = checklist && checklist.items.every((i) => answers[i.key]);
  const submitCheck = async () => { const r = await act(trip._id, { type: 'checklist', items: checklist.items.map((i) => ({ key: i.key, ok: answers[i.key].ok, note: answers[i.key].note || '' })) }); if (r.ok && r.data && r.data.passed === false) setAlert(`Do not start. ${r.data.failed.map((f) => f.label).join(', ')} failed. The office has been told. Wait for instructions.`); else if (r.ok) setAnswers({}); };

  return (
    <div className="space-y-4">{head}{banner}
      <div className="rounded-2xl border border-[#e3e7e7] bg-white p-3 text-sm"><b>{DIR[trip.direction]}</b> · {hm(trip.plannedStart)} · bus {trip.vehiclePlate} ({trip.capacity} seats){trip.escortName ? ` · escort ${trip.escortName}` : ''}<br /><span className="text-[#3b4a5c]">{onBus.length} on the bus · {trip.riders.filter((r) => r.state === 'expected').length} waiting · {trip.riders.filter((r) => r.state === 'alighted').length} off</span>{onBus.length > trip.capacity && <span className="block font-semibold text-[#9f1239]">More children than seats.</span>}</div>

      {['cancelled', 'missed'].includes(trip.status) && <p className="rounded-xl bg-[#f1f2f2] p-3 text-sm">This trip is {trip.status === 'cancelled' ? 'cancelled' : 'marked as not run'}.</p>}
      {trip.status === 'completed' && <p className="rounded-xl bg-[#edf5f3] p-3 text-sm text-[#215a52]">This trip is finished. Thank you.{trip.unreconciled > 0 ? ` ${trip.unreconciled} child(ren) were recorded as not accounted for; the school is following up.` : ''}</p>}

      {trip.status === 'scheduled' && checklist && (
        <section className="space-y-2 rounded-2xl border border-[#e3e7e7] bg-white p-3"><h2 className="font-semibold">Check the bus before you go</h2><p className="text-xs text-[#5b6b7b]">Answer every line. A problem with a line marked critical stops the trip and tells the office.</p>
          <ul className="space-y-2">{checklist.items.map((i) => (
            <li key={i.key} className="rounded-lg border border-[#f0f1f1] p-2 text-sm"><p>{i.label}{i.critical && <span className="ms-1 text-[11px] font-semibold text-[#9f1239]">critical</span>}</p>
              <div className="mt-1 flex gap-2"><button className={`${answers[i.key]?.ok === true ? btnPrimary : btnGhost} !px-3 !py-1.5 !text-xs`} aria-pressed={answers[i.key]?.ok === true} onClick={() => setAnswers({ ...answers, [i.key]: { ok: true } })}>All good</button><button className={`${answers[i.key]?.ok === false ? btnDanger : btnGhost} !px-3 !py-1.5 !text-xs`} aria-pressed={answers[i.key]?.ok === false} onClick={() => setAnswers({ ...answers, [i.key]: { ok: false, note: answers[i.key]?.note || '' } })}>Problem</button></div>
              {answers[i.key]?.ok === false && <input className={`${inputCls} mt-2`} placeholder="What is wrong?" aria-label={`What is wrong with: ${i.label}`} value={answers[i.key].note} onChange={(e) => setAnswers({ ...answers, [i.key]: { ok: false, note: e.target.value } })} />}</li>))}</ul>
          <button className={btnPrimary} disabled={busy || !allAnswered || !online} onClick={submitCheck}>{busy ? 'Sending…' : 'Send the check'}</button></section>
      )}
      {trip.status === 'checked' && <button className={`${btnPrimary} w-full !py-4 !text-base`} disabled={busy || !online} onClick={() => act(trip._id, { type: 'start' })}>Start the trip</button>}

      {trip.status === 'active' && (
        <>
          {nextStop ? <section className="rounded-2xl border border-[#2a5cac] bg-[#eef2f8] p-3"><p className="text-xs font-semibold text-[#234c91]">Next stop</p><p className="text-lg font-semibold">{nextStop.name}</p><p className="text-xs text-[#3b4a5c]">planned {hm(nextStop.plannedAt)}</p><button className={`${btnPrimary} mt-2`} disabled={busy} onClick={() => act(trip._id, { type: 'arrive', stopId: nextStop.stopId })}>We have reached {nextStop.name}</button></section> : <p className="rounded-xl bg-[#edf5f3] p-3 text-sm text-[#215a52]">Every stop has been reached.</p>}
          {!afternoon && <button className={btnGhost} disabled={busy || onBus.length === 0} onClick={() => act(trip._id, { type: 'school_arrival' })}>We are at school: everyone gets off</button>}
          {trip.stops.map((s) => {
            const here = trip.riders.filter((r) => String(r.stopId) === String(s.stopId)); if (!here.length) return null;
            return (
              <section key={String(s.stopId)} className="rounded-2xl border border-[#e3e7e7] bg-white p-3"><h2 className="font-semibold">{s.name}{s.arrivedAt ? <span className="ms-2 text-xs font-normal text-[#215a52]">reached {hm(s.arrivedAt)}</span> : null}</h2>
                <ul className="mt-2 divide-y divide-[#f0f1f1]">{here.map((r) => (
                  <li key={String(r.studentId)} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"><span><b>{r.name}</b> <span className="text-xs text-[#5b6b7b]">{r.className}</span>{afternoon && r.handoff === 'guardian' && <span className="ms-1 rounded bg-[#fbf0ec] px-1 text-[11px] font-semibold text-[#8a4636]">hand to an adult</span>}{r.exception && <span className="block text-xs font-semibold text-[#9f1239]">{KIND_WORD[r.exception] || r.exception}</span>}</span>
                    <span className="flex gap-1">
                      {r.state === 'expected' && <><button className={`${btnPrimary} !px-3 !py-1.5 !text-xs`} disabled={busy} onClick={() => act(trip._id, { type: 'board', studentId: r.studentId, stopId: s.stopId })} aria-label={`${r.name} is on the bus`}>On the bus</button>{!afternoon && <button className={`${btnGhost} !px-3 !py-1.5 !text-xs`} disabled={busy} onClick={() => act(trip._id, { type: 'no_show', studentId: r.studentId, stopId: s.stopId })} aria-label={`${r.name} is not at the stop`}>Not here</button>}</>}
                      {r.state === 'no_show' && <><span className="text-xs text-[#8a4636]">Not at the stop</span><button className={`${btnGhost} !px-3 !py-1.5 !text-xs`} onClick={() => act(trip._id, { type: 'board', studentId: r.studentId, stopId: s.stopId })} aria-label={`${r.name} came late and is on the bus`}>Came late</button></>}
                      {r.state === 'boarded' && (afternoon ? <button className={`${btnPrimary} !px-3 !py-1.5 !text-xs`} disabled={busy} onClick={() => (r.handoff === 'guardian' ? setHo({ r, stopId: s.stopId, pick: '', name: '' }) : act(trip._id, { type: 'alight', studentId: r.studentId, stopId: s.stopId, handedTo: { kind: 'self' } }))} aria-label={`${r.name} gets off here`}>Gets off</button> : <span className="text-xs text-[#215a52]">On the bus</span>)}
                      {r.state === 'alighted' && <span className="text-xs text-[#215a52]">Off</span>}{r.state === 'opted_out' && <span className="text-xs text-[#5b6b7b]">Not riding today</span>}{r.state === 'absent' && <span className="text-xs text-[#5b6b7b]">Absent</span>}</span></li>))}</ul></section>);
          })}
          <div className="flex flex-wrap gap-2"><button className={btnGhost} onClick={() => setProb({ kind: 'other', note: '', studentId: '' })}>Report a problem</button><button className={`${btnDanger} !px-5`} onClick={() => setEnd({ emptyChecked: false, count: '', reason: '' })}>End the trip</button></div>
          <p className="text-xs text-[#5b6b7b]">While a trip is on, this phone shares the bus position with the school. It stops when you end the trip. Keep this page open.</p>
        </>
      )}
      {['scheduled', 'checked'].includes(trip.status) && <button className={btnGhost} onClick={() => setProb({ kind: 'vehicle_fault', note: '', studentId: '' })}>Report a problem</button>}

      {ho && (
        <div role="dialog" aria-modal="true" aria-label={`Hand over ${ho.r.name}`} className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center"><div className="w-full max-w-md space-y-3 rounded-2xl bg-white p-4"><h2 className="text-lg font-semibold">Who is receiving {ho.r.name}?</h2>
          {ho.r.collectors.length === 0 && <p className="text-sm text-[#8a4636]">Nobody is listed to collect this child. Do not release them to anyone you do not know; call the school.</p>}
          <ul className="space-y-2">{ho.r.collectors.map((c) => <li key={c.ref}><label className={`flex cursor-pointer items-center gap-2 rounded-lg border p-2 text-sm ${ho.pick === c.ref ? 'border-[#2a5cac] bg-[#eef2f8]' : 'border-[#e3e7e7]'}`}><input type="radio" name="collector" checked={ho.pick === c.ref} onChange={() => setHo({ ...ho, pick: c.ref, name: '' })} />{c.label}</label></li>)}
            <li><label className={`flex cursor-pointer items-center gap-2 rounded-lg border p-2 text-sm ${ho.pick === '__other' ? 'border-[#2a5cac] bg-[#eef2f8]' : 'border-[#e3e7e7]'}`}><input type="radio" name="collector" checked={ho.pick === '__other'} onChange={() => setHo({ ...ho, pick: '__other' })} />Someone else is here</label>{ho.pick === '__other' && <input className={`${inputCls} mt-2`} placeholder="Their name" aria-label="Name of the person" value={ho.name} onChange={(e) => setHo({ ...ho, name: e.target.value })} />}</li>
            <li><label className={`flex cursor-pointer items-center gap-2 rounded-lg border p-2 text-sm ${ho.pick === '__none' ? 'border-[#9f1239] bg-[#fff1f2]' : 'border-[#e3e7e7]'}`}><input type="radio" name="collector" checked={ho.pick === '__none'} onChange={() => setHo({ ...ho, pick: '__none' })} />Nobody is at the stop</label></li></ul>
          <div className="flex justify-end gap-2"><button className={btnGhost} onClick={() => setHo(null)}>Cancel</button><button className={btnPrimary} disabled={busy || !ho.pick || (ho.pick === '__other' && ho.name.trim().length < 2)} onClick={async () => { const handedTo = ho.pick === '__none' ? { kind: 'no_one' } : ho.pick === '__other' ? { kind: 'authorised', name: ho.name.trim() } : { kind: 'guardian', ref: ho.pick }; const r = await act(trip._id, { type: 'alight', studentId: ho.r.studentId, stopId: ho.stopId, handedTo }); setHo(null); if (r.ok && r.data && r.data.held) setAlert(`${ho.r.name} stays on the bus. The school will call the family. Do not release the child.`); }}>Hand over</button></div></div></div>
      )}
      {end && (
        <div role="dialog" aria-modal="true" aria-label="End the trip" className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center"><form className="w-full max-w-md space-y-3 rounded-2xl bg-white p-4" onSubmit={async (e) => { e.preventDefault(); const r = await act(trip._id, { type: 'end', emptyChecked: true, count: end.count === '' ? undefined : Number(end.count), reason: end.reason || undefined }); if (r.ok) { setEnd(null); setSel(null); } else if (r.data && r.data.reason === 'unreconciled') setEnd({ ...end, need: r.data.onboard }); }}>
          <h2 className="text-lg font-semibold">End the trip</h2>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={end.emptyChecked} onChange={(e) => setEnd({ ...end, emptyChecked: e.target.checked })} /> I have walked the whole bus, looked under every seat, and no child is left on board.</label>
          {(end.need || unaccounted > 0) && <><p className="text-sm text-[#9f1239]">{end.need || unaccounted} child(ren) are still marked on the bus or were never marked at all. Mark them first if you can. If you cannot, say what happened to them.</p><textarea className={inputCls} rows={3} required placeholder="For example: handed to the office at 2:40" aria-label="What happened to the children still on the bus" value={end.reason} onChange={(e) => setEnd({ ...end, reason: e.target.value })} /></>}
          <div className="flex justify-end gap-2"><button type="button" className={btnGhost} onClick={() => setEnd(null)}>Back</button><button className={btnDanger} disabled={busy || !end.emptyChecked || !online}>End the trip</button></div></form></div>
      )}
      {prob && (
        <div role="dialog" aria-modal="true" aria-label="Report a problem" className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center"><form className="w-full max-w-md space-y-3 rounded-2xl bg-white p-4" onSubmit={async (e) => { e.preventDefault(); const r = await act(trip._id, { type: 'incident', kind: prob.kind, note: prob.note, severity: ['accident', 'medical', 'breakdown'].includes(prob.kind) ? 'high' : 'medium', studentId: prob.studentId || undefined }); if (r.ok) { setProb(null); setAlert('The office has been told.'); } }}>
          <h2 className="text-lg font-semibold">Report a problem</h2>
          <label className="block text-sm"><span className="mb-1 block text-xs font-semibold text-[#3b4a5c]">What kind</span><select className={inputCls} value={prob.kind} onChange={(e) => setProb({ ...prob, kind: e.target.value })}>{PROBLEMS.map((p) => <option key={p} value={p}>{KIND_WORD[p]}</option>)}</select></label>
          <label className="block text-sm"><span className="mb-1 block text-xs font-semibold text-[#3b4a5c]">Which child (if one)</span><select className={inputCls} value={prob.studentId} onChange={(e) => setProb({ ...prob, studentId: e.target.value })}><option value="">Not about one child</option>{trip.riders.map((r) => <option key={String(r.studentId)} value={r.studentId}>{r.name}</option>)}</select></label>
          <label className="block text-sm"><span className="mb-1 block text-xs font-semibold text-[#3b4a5c]">What happened</span><textarea className={inputCls} rows={3} required minLength={5} value={prob.note} onChange={(e) => setProb({ ...prob, note: e.target.value })} /></label>
          <p className="text-xs text-[#5b6b7b]">For an emergency, call the school or the emergency number first.{me.school.phone ? ` School: ${me.school.phone}.` : ''}</p>
          <div className="flex justify-end gap-2"><button type="button" className={btnGhost} onClick={() => setProb(null)}>Cancel</button><button className={btnPrimary} disabled={busy || prob.note.trim().length < 5 || !online}>Send to the office</button></div></form></div>
      )}
    </div>
  );
}
