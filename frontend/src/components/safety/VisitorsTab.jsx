import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import apiClient from '../../utils/apiClient';
import { Card, Modal, Field, Pill, Pager, btnGhost, btnPrimary, inputCls, errMsg } from '../ui';
import { useList, Body, Tbl, Td, Row, Bar, act, Sub } from '../attendance/deskKit';
import { ID_TYPES, VISIT_KINDS, STATUS_TONE, localIn, iso, dayTime, Reason, CodeBox, BadgePrint, Banner } from './safetyKit';

const NewVisit = ({ role, kids, hosts, onClose, onDone }) => {
  const [f, setF] = useState({ visitorName: '', phone: '', organisation: '', kind: 'Guest', purpose: '', hostKey: role === 'teacher' ? 'self' : 'office', studentId: kids?.[0]?._id || '', walkIn: false, from: localIn(0), to: localIn(60) });
  const [busy, setBusy] = useState(false); const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const save = async () => {
    setBusy(true);
    try {
      const [hostType, hostId] = f.hostKey.includes(':') ? f.hostKey.split(':') : [f.hostKey === 'office' ? 'office' : undefined, undefined];
      const body = { visitorName: f.visitorName, phone: f.phone, organisation: f.organisation, kind: f.kind, purpose: f.purpose, hostType, hostId, studentId: role === 'parent' ? f.studentId : undefined, walkIn: role === 'admin' ? f.walkIn : undefined, expectedFrom: f.walkIn ? undefined : iso(f.from), expectedTo: f.walkIn ? undefined : iso(f.to) };
      const r = await apiClient.post('/safety/visits', body);
      toast.success(r.data.visit.status === 'Approved' ? 'Visit approved. Share the invitation code.' : 'Sent to the host for approval.'); onDone(r.data); onClose();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Modal title={role === 'parent' ? 'Ask to visit the school' : 'New visit'} onClose={onClose} wide>
      <div className="grid gap-3 sm:grid-cols-2">
        {role !== 'parent' && <Field label="Visitor's name"><input className={inputCls} value={f.visitorName} onChange={set('visitorName')} maxLength={80} /></Field>}
        {role !== 'parent' && <Field label="Phone"><input className={inputCls} value={f.phone} onChange={set('phone')} maxLength={30} /></Field>}
        {role === 'parent' && kids?.length > 0 && <Field label="About which child"><select className={inputCls} value={f.studentId} onChange={set('studentId')}>{kids.map((k) => <option key={k._id} value={k._id}>{k.name}</option>)}</select></Field>}
        {role !== 'parent' && <Field label="Kind"><select className={inputCls} value={f.kind} onChange={set('kind')}>{VISIT_KINDS.map((k) => <option key={k}>{k}</option>)}</select></Field>}
        {role !== 'parent' && <Field label="Organisation (optional)"><input className={inputCls} value={f.organisation} onChange={set('organisation')} maxLength={80} /></Field>}
        {role !== 'teacher' && (
          <Field label="Who will they meet">
            <select className={inputCls} value={f.hostKey} onChange={set('hostKey')}><option value="office">School office</option>{(hosts || []).map((h) => <option key={h.id} value={`teacher:${h.id}`}>{h.name}</option>)}</select>
          </Field>
        )}
        {role === 'admin' && <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={f.walkIn} onChange={set('walkIn')} /> Walk-in (here now)</label>}
        {!f.walkIn && <><Field label="From"><input type="datetime-local" className={inputCls} value={f.from} onChange={set('from')} /></Field><Field label="Until"><input type="datetime-local" className={inputCls} value={f.to} onChange={set('to')} /></Field></>}
        <div className="sm:col-span-2"><Field label="Purpose"><input className={inputCls} value={f.purpose} onChange={set('purpose')} maxLength={200} placeholder="Why are they coming?" /></Field></div>
      </div>
      <div className="mt-4 flex justify-end gap-2"><button className={btnGhost} onClick={onClose}>Cancel</button><button className={btnPrimary} disabled={busy || f.purpose.trim().length < 3 || (role !== 'parent' && !f.visitorName.trim())} onClick={save}>Save</button></div>
    </Modal>
  );
};

export const CheckInModal = ({ visit, gates, code, onClose, onDone }) => {
  const [f, setF] = useState({ code: code || '', manualReason: '', idType: 'CNIC', idNumber: '', idChecked: false, purposeConfirmed: false, gate: gates?.[0] || '' }); const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const [err, setErr] = useState('');
  const go = async () => {
    setErr('');
    try { const r = await apiClient.post(`/safety/visits/${visit._id}/check-in`, { method: f.code ? 'qr' : 'manual', code: f.code || undefined, manualReason: f.manualReason, idType: f.idType, idNumber: f.idNumber, idChecked: f.idChecked, purposeConfirmed: f.purposeConfirmed, gate: f.gate }); toast.success('Checked in'); onDone(r.data.visit); onClose(); }
    catch (e) { setErr(errMsg(e)); }
  };
  return (
    <Modal title={`Check in ${visit.visitorName}`} onClose={onClose}>
      <p className="mb-3 text-sm text-[#3b4a5c]">Visiting {visit.hostName || 'the office'} · {visit.purpose}</p>
      {err && <div className="mb-3"><Banner tone="bad">{err}</Banner></div>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Invitation code (scan or type)"><input className={inputCls} value={f.code} onChange={set('code')} placeholder="AUL-V.…" /></Field>
        {!f.code && <Field label="Why by hand?"><input className={inputCls} value={f.manualReason} onChange={set('manualReason')} placeholder="e.g. lost the invitation" maxLength={120} /></Field>}
        <Field label="ID shown"><select className={inputCls} value={f.idType} onChange={set('idType')}>{ID_TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
        <Field label="ID number" hint="Only the last four characters are kept"><input className={inputCls} value={f.idNumber} onChange={set('idNumber')} autoComplete="off" /></Field>
        {gates?.length > 1 && <Field label="Gate"><select className={inputCls} value={f.gate} onChange={set('gate')}>{gates.map((g) => <option key={g}>{g}</option>)}</select></Field>}
      </div>
      <div className="mt-3 space-y-1 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={f.idChecked} onChange={set('idChecked')} /> I looked at the ID and it matches the visitor</label><label className="flex items-center gap-2"><input type="checkbox" checked={f.purposeConfirmed} onChange={set('purposeConfirmed')} /> I confirmed the purpose of the visit</label></div>
      <div className="mt-4 flex justify-end gap-2"><button className={btnGhost} onClick={onClose}>Cancel</button><button className={btnPrimary} onClick={go}>Check in and issue badge</button></div>
    </Modal>
  );
};

// Scan or type any Aulensia code at the desk
export const ScanModal = ({ gates, onClose, onDone }) => {
  const [code, setCode] = useState(''); const [res, setRes] = useState(null); const [err, setErr] = useState(''); const [checkIn, setCheckIn] = useState(null);
  const look = async () => { setErr(''); setRes(null); try { setRes((await apiClient.post('/safety/scan/lookup', { code })).data); } catch (e) { setErr(errMsg(e)); } };
  const move = async (direction) => { try { await apiClient.post(`/safety/contractors/${res.pass._id}/move`, { direction, gate: gates?.[0], code }); toast.success(direction === 'in' ? 'Admitted' : 'Marked as left'); onDone(); onClose(); } catch (e) { setErr(errMsg(e)); } };
  return (
    <Modal title="Scan or type a code" onClose={onClose}>
      <div className="flex gap-2"><input className={inputCls} value={code} onChange={(e) => setCode(e.target.value)} placeholder="AUL-V… or AUL-C…" autoFocus onKeyDown={(e) => e.key === 'Enter' && look()} /><button className={btnPrimary} onClick={look} disabled={!code.trim()}>Look up</button></div>
      {err && <div className="mt-3"><Banner tone="bad">{err}</Banner></div>}
      {res?.type === 'visitor' && (
        <div className="mt-4 rounded-lg bg-[#f7f6f2] p-3 text-sm"><b>{res.visit.visitorName}</b> · {res.visit.kind}<Sub>Visiting {res.visit.hostName || 'the office'} · {res.visit.purpose}</Sub>
          <div className="mt-3 flex gap-2">{res.next === 'check-in' && res.valid && <button className={btnPrimary} onClick={() => setCheckIn(res.visit)}>Check in…</button>}{res.next === 'check-out' && <button className={btnPrimary} onClick={act(() => apiClient.post(`/safety/visits/${res.visit._id}/check-out`, {}), 'Checked out', () => { onDone(); onClose(); })}>Check out</button>}{!res.valid && res.next === 'check-in' && <Banner>This invitation has expired.</Banner>}</div></div>
      )}
      {res?.type === 'contractor' && (
        <div className="mt-4 rounded-lg bg-[#f7f6f2] p-3 text-sm"><b>{res.pass.personName}</b> · {res.pass.company}<Sub>{res.pass.purpose} · until {dayTime(res.pass.validTo)}</Sub>
          <div className="mt-3 flex gap-2">{res.next === 'in' ? <button className={btnPrimary} onClick={() => move('in')} disabled={!res.valid}>Admit</button> : <button className={btnPrimary} onClick={() => move('out')}>Mark as left</button>}{!res.valid && res.next === 'in' && <Banner>This pass is not valid right now.</Banner>}</div></div>
      )}
      {checkIn && <CheckInModal visit={checkIn} gates={gates} code={code} onClose={() => setCheckIn(null)} onDone={() => { onDone(); onClose(); }} />}
    </Modal>
  );
};

const VisitorsTab = ({ role, duty, gates, hosts, kids, meId }) => {
  const [status, setStatus] = useState(''); const l = useList('/safety/visits', 'visits', { status }); const [nv, setNv] = useState(false); const [code, setCode] = useState(null); const [ci, setCi] = useState(null); const [dec, setDec] = useState(null); const [badge, setBadge] = useState(null); const [scan, setScan] = useState(false); const [cancel, setCancel] = useState(null);
  const invite = async (v) => { try { const r = await apiClient.post(`/safety/visits/${v._id}/invite`, {}); setCode({ title: `Invitation for ${v.visitorName}`, code: r.data.inviteCode, note: `Valid until ${dayTime(r.data.expiresAt)}. A new code replaces this one.` }); l.reload(); } catch (e) { toast.error(errMsg(e)); } };
  const showBadge = async (v) => { try { setBadge((await apiClient.get(`/safety/visits/${v._id}/badge`)).data.badge); l.reload(); } catch (e) { toast.error(errMsg(e)); } };
  const canDecide = (v) => v.status === 'Requested' && (role === 'admin' || (role === 'teacher' && String(v.hostId) === String(meId)));
  return (
    <Card className="!p-0">
      <Bar>
        <button className={btnPrimary} onClick={() => setNv(true)}>{role === 'parent' ? 'Ask to visit' : 'New visit'}</button>
        {duty && <button className={btnGhost} onClick={() => setScan(true)}>Scan or type a code</button>}
        <select className={`${inputCls} !w-44`} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter visits"><option value="">All visits</option>{['Requested', 'Approved', 'CheckedIn', 'CheckedOut', 'Declined', 'Expired', 'Cancelled', 'Refused'].map((s) => <option key={s}>{s}</option>)}</select>
      </Bar>
      <Body l={l} cols={5} empty="No visits yet.">
        <Tbl head={['Visitor', 'Host', 'When', 'Status', '']}>{l.rows.map((v) => (
          <Row key={v._id}>
            <Td>{v.visitorName}<Sub>{v.kind}{v.organisation ? ` · ${v.organisation}` : ''} · {v.purpose}{v.walkIn ? ' · walk-in' : ''}</Sub>{v.receptionOverride && <Sub>Approved by reception with a written reason</Sub>}</Td>
            <Td>{v.hostName || 'School office'}</Td>
            <Td cls="whitespace-nowrap">{dayTime(v.expectedFrom)}<Sub>until {dayTime(v.expectedTo)}</Sub></Td>
            <Td><Pill value={STATUS_TONE[v.status]}>{v.status}</Pill>{v.badge && <Sub>Badge {v.badge.number}</Sub>}{v.overstay && <Sub>Past the allowed time</Sub>}{v.idLast4 && <Sub>{v.idType} …{v.idLast4}</Sub>}</Td>
            <Td cls="whitespace-nowrap text-end">
              {canDecide(v) && <><button className={`${btnPrimary} !px-3 !py-1.5 !text-xs`} onClick={act(() => apiClient.post(`/safety/visits/${v._id}/decide`, { decision: 'approve' }), 'Approved', l.reload)}>Approve</button>{' '}<button className={`${btnGhost} !px-3 !py-1.5 !text-xs`} onClick={() => setDec({ v, decision: 'decline' })}>Decline</button>{' '}</>}
              {role === 'admin' && v.status === 'Requested' && v.walkIn && String(v.createdById) === String(meId) && <button className={`${btnGhost} !px-3 !py-1.5 !text-xs`} onClick={() => setDec({ v, decision: 'approve', override: true })}>Approve with reason</button>}
              {v.status === 'Approved' && <button className={`${btnGhost} !px-3 !py-1.5 !text-xs`} onClick={() => invite(v)}>Invitation</button>}{' '}
              {v.status === 'Approved' && duty && <button className={`${btnPrimary} !px-3 !py-1.5 !text-xs`} onClick={() => setCi(v)}>Check in</button>}{' '}
              {v.status === 'CheckedIn' && duty && <><button className={`${btnGhost} !px-3 !py-1.5 !text-xs`} onClick={() => showBadge(v)}>Badge</button>{' '}<button className={`${btnPrimary} !px-3 !py-1.5 !text-xs`} onClick={act(() => apiClient.post(`/safety/visits/${v._id}/check-out`, {}), 'Checked out', l.reload)}>Check out</button></>}
              {['Requested', 'Approved'].includes(v.status) && <button className={`${btnGhost} !px-3 !py-1.5 !text-xs`} onClick={() => setCancel(v)}>Cancel</button>}
            </Td>
          </Row>))}</Tbl>
        <Pager pagination={l.pagination} onPage={l.setPage} />
      </Body>
      {nv && <NewVisit role={role} kids={kids} hosts={hosts} onClose={() => setNv(false)} onDone={(d) => { l.reload(); if (d.inviteCode) setCode({ title: `Invitation for ${d.visit.visitorName}`, code: d.inviteCode, note: `Valid until ${dayTime(d.expiresAt)}.` }); }} />}
      {code && <CodeBox {...code} onClose={() => setCode(null)} />}
      {ci && <CheckInModal visit={ci} gates={gates} onClose={() => setCi(null)} onDone={l.reload} />}
      {badge && <BadgePrint badge={badge} onClose={() => setBadge(null)} />}
      {scan && <ScanModal gates={gates} onClose={() => setScan(false)} onDone={l.reload} />}
      {dec && <Reason title={dec.override ? 'Approve a walk-in without the host' : 'Decline this visit'} label={dec.override ? 'Why can the host not approve? (at least 10 characters)' : 'Reason (optional for the visitor)'} min={dec.override ? 10 : 0} cta={dec.override ? 'Approve' : 'Decline'} danger={!dec.override} onClose={() => setDec(null)} onSubmit={async (note) => { try { await apiClient.post(`/safety/visits/${dec.v._id}/decide`, { decision: dec.decision, note, override: dec.override }); toast.success('Done'); setDec(null); l.reload(); } catch (e) { toast.error(errMsg(e)); } }} />}
      {cancel && <Modal title="Cancel this visit?" onClose={() => setCancel(null)}><p className="text-sm">{cancel.visitorName} will no longer be admitted and the invitation stops working.</p><div className="mt-4 flex justify-end gap-2"><button className={btnGhost} onClick={() => setCancel(null)}>Keep it</button><button className={btnPrimary} onClick={async () => { try { await apiClient.post(`/safety/visits/${cancel._id}/cancel`, {}); setCancel(null); l.reload(); } catch (e) { toast.error(errMsg(e)); } }}>Cancel visit</button></div></Modal>}
    </Card>
  );
};
export default VisitorsTab;
