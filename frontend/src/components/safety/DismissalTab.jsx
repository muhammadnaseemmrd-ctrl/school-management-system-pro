import React, { useEffect, useState, useCallback } from 'react';
import { toast } from 'react-hot-toast';
import apiClient from '../../utils/apiClient';
import { Card, Modal, Field, Pill, Pager, EmptyState, btnGhost, btnPrimary, btnDanger, inputCls, errMsg } from '../ui';
import { useList, Body, Tbl, Td, Row, Bar, act, Sub } from '../attendance/deskKit';
import { STATUS_TONE, Reason, Banner, hhmm, dayTime } from './safetyKit';

const BASIS = { guardian: 'Guardian on the list', authorisation: 'One-day authorisation', exception: 'Exception approved by a second person', 'emergency-override': 'Emergency override', none: '' };

// Release one child. A refusal never says why; it always asks staff to involve a person.
const ReleaseModal = ({ student, admin, onClose, onDone }) => {
  const [who, setWho] = useState(student.people[0] ? '0' : 'other'); const [code, setCode] = useState(''); const [err, setErr] = useState(''); const [needReason, setNeedReason] = useState(false);
  const [ex, setEx] = useState({ personName: '', relationship: '', phone: '', reason: '', familyConfirmedWith: '' }); const [mode, setMode] = useState('exception');
  const p = who === 'other' ? null : student.people[Number(who)];
  const send = async (extra = {}) => {
    setErr('');
    try {
      const body = { studentId: student._id, ...(p?.parentId ? { parentId: p.parentId } : { personName: p?.name }), ...(p?.kind === 'alternate' ? { code } : {}), ...extra };
      await apiClient.post('/safety/dismissal/release', body); toast.success(`${student.name} released`); onDone(); onClose();
    } catch (e) { if (e.response?.data?.code === 'absent-today') setNeedReason(true); else setErr(errMsg(e)); }
  };
  const sendEx = async () => {
    setErr('');
    try { await apiClient.post(mode === 'override' ? '/safety/dismissal/override' : '/safety/dismissal/exceptions', { studentId: student._id, ...ex }); toast.success(mode === 'override' ? 'Released. Another administrator must review this.' : 'Sent to an administrator for a decision'); onDone(); onClose(); }
    catch (e) { setErr(errMsg(e)); }
  };
  if (needReason) return <Reason title="Marked absent today" label="The register says absent. Why is the child here?" cta="Release anyway" min={5} onClose={onClose} onSubmit={(reason) => send({ overrideAbsent: true, reason })} />;
  return (
    <Modal title={`Release ${student.name}`} onClose={onClose}>
      {err && <div className="mb-3"><Banner tone="bad">{err}</Banner></div>}
      <div className="space-y-2">
        {student.people.map((x, i) => <label key={i} className="flex items-center gap-2 rounded-lg border border-[#e3e7e7] p-2 text-sm"><input type="radio" checked={who === String(i)} onChange={() => setWho(String(i))} /><span><b>{x.name}</b> · {x.relationship}{x.kind === 'alternate' ? ' (today only)' : ''}{x.phone ? <Sub>{x.phone}</Sub> : null}</span></label>)}
        <label className="flex items-center gap-2 rounded-lg border border-[#e3e7e7] p-2 text-sm"><input type="radio" checked={who === 'other'} onChange={() => setWho('other')} /> Someone who is not on the list</label>
      </div>
      {p?.kind === 'alternate' && <div className="mt-3"><Field label="Code the person was given"><input className={inputCls} value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" maxLength={6} /></Field></div>}
      {who !== 'other' && <div className="mt-4 flex justify-end gap-2"><button className={btnGhost} onClick={onClose}>Cancel</button><button className={btnPrimary} onClick={() => send()} disabled={p?.kind === 'alternate' && code.length < 6}>Release to {p?.name}</button></div>}
      {who === 'other' && (
        <div className="mt-3 space-y-3">
          <Banner>Phone a guardian first. A different administrator has to approve an exception.</Banner>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name of the person"><input className={inputCls} value={ex.personName} onChange={(e) => setEx({ ...ex, personName: e.target.value })} maxLength={80} /></Field>
            <Field label="Relationship"><input className={inputCls} value={ex.relationship} onChange={(e) => setEx({ ...ex, relationship: e.target.value })} maxLength={40} /></Field>
            <Field label="Phone"><input className={inputCls} value={ex.phone} onChange={(e) => setEx({ ...ex, phone: e.target.value })} maxLength={30} /></Field>
            <Field label="Which guardian did you phone?"><input className={inputCls} value={ex.familyConfirmedWith} onChange={(e) => setEx({ ...ex, familyConfirmedWith: e.target.value })} maxLength={80} /></Field>
          </div>
          <Field label={mode === 'override' ? 'Describe the emergency (at least 15 characters)' : 'Why can this not wait for the usual list?'}><textarea className={inputCls} rows={2} value={ex.reason} onChange={(e) => setEx({ ...ex, reason: e.target.value })} maxLength={300} /></Field>
          {admin && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={mode === 'override'} onChange={(e) => setMode(e.target.checked ? 'override' : 'exception')} /> Real emergency: release now without a second person (reviewed afterwards)</label>}
          <div className="flex justify-end gap-2"><button className={btnGhost} onClick={onClose}>Cancel</button><button className={mode === 'override' ? btnDanger : btnPrimary} onClick={sendEx} disabled={!ex.personName.trim()}>{mode === 'override' ? 'Release now' : 'Ask an administrator'}</button></div>
        </div>
      )}
    </Modal>
  );
};

const AltModal = ({ onClose, onDone }) => {
  const [f, setF] = useState({ q: '', studentId: '', studentName: '', personName: '', relationship: '', phone: '', confirmedWith: '' }); const [rows, setRows] = useState([]); const [code, setCode] = useState('');
  useEffect(() => { if (f.q.length < 2 || f.studentId) { setRows([]); return undefined; } const h = setTimeout(() => apiClient.get('/safety/dismissal/search', { params: { q: f.q } }).then((r) => setRows(r.data.students)).catch(() => {}), 250); return () => clearTimeout(h); }, [f.q, f.studentId]);
  const save = async () => { try { const r = await apiClient.post('/safety/dismissal/authorizations', { studentId: f.studentId, personName: f.personName, relationship: f.relationship, phone: f.phone, confirmedWith: f.confirmedWith }); setCode(r.data.code); onDone(); } catch (e) { toast.error(errMsg(e)); } };
  if (code) return <Modal title="Give this code to the person" onClose={onClose}><p className="text-center text-4xl font-bold tracking-widest">{code}</p><p className="mt-3 text-sm text-[#5b6b7b]">Shown once. They must bring it, with their name, when they collect {f.studentName} today.</p><div className="mt-4 flex justify-end"><button className={btnPrimary} onClick={onClose}>Done</button></div></Modal>;
  return (
    <Modal title="Record who may collect today (by phone)" onClose={onClose}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">{f.studentId ? <div className="flex items-center justify-between rounded-lg bg-[#f7f6f2] px-3 py-2 text-sm"><span>{f.studentName}</span><button className="text-xs font-semibold text-[#2a5cac]" onClick={() => setF({ ...f, studentId: '', studentName: '', q: '' })}>Change</button></div> : <div className="relative"><input className={inputCls} placeholder="Child's name (2+ letters)" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />{rows.length > 0 && <ul className="absolute z-10 mt-1 w-full rounded-lg border border-[#e3e7e7] bg-white shadow-lg">{rows.map((s) => <li key={s._id}><button className="block w-full px-3 py-2 text-start text-sm hover:bg-[#f7f6f2]" onClick={() => setF({ ...f, studentId: s._id, studentName: s.name })}>{s.name} · {s.classLabel}</button></li>)}</ul>}</div>}</div>
        <Field label="Person's full name"><input className={inputCls} value={f.personName} onChange={(e) => setF({ ...f, personName: e.target.value })} maxLength={80} /></Field>
        <Field label="Relationship"><input className={inputCls} value={f.relationship} onChange={(e) => setF({ ...f, relationship: e.target.value })} maxLength={40} /></Field>
        <Field label="Phone"><input className={inputCls} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} maxLength={30} /></Field>
        <Field label="Which guardian confirmed?"><input className={inputCls} value={f.confirmedWith} onChange={(e) => setF({ ...f, confirmedWith: e.target.value })} maxLength={80} /></Field>
      </div>
      <div className="mt-4 flex justify-end gap-2"><button className={btnGhost} onClick={onClose}>Cancel</button><button className={btnPrimary} disabled={!f.studentId || f.personName.trim().length < 3 || f.confirmedWith.trim().length < 2} onClick={save}>Create code</button></div>
    </Modal>
  );
};

const Events = ({ admin, duty, refreshKey }) => {
  const [filter, setFilter] = useState('today'); const params = filter === 'today' ? { day: new Date().toISOString().slice(0, 10) } : filter === 'review' ? { review: 'pending' } : { outcome: filter }; const l = useList('/safety/dismissal/events', 'events', params);
  useEffect(() => { l.reload(); /* eslint-disable-next-line */ }, [refreshKey]);
  const [rev, setRev] = useState(null); const [decl, setDecl] = useState(null);
  return (
    <Card className="!p-0">
      <Bar><b className="text-sm">Pickup record</b><select className={`${inputCls} !w-52`} value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter pickups"><option value="today">Today</option><option value="Pending">Waiting for a decision</option><option value="Refused">Refused</option>{admin && <option value="review">Emergency overrides to review</option>}</select></Bar>
      <Body l={l} cols={5} empty="Nothing here.">
        <Tbl head={['Child', 'Collected by', 'Result', 'Basis', '']}>{l.rows.map((e) => (
          <Row key={e._id}><Td>{e.studentName}<Sub>{dayTime(e.at)}</Sub></Td><Td>{e.collectorName || '—'}<Sub>{e.relationship}{e.familyConfirmedWith ? ` · phoned ${e.familyConfirmedWith}` : ''}</Sub></Td>
            <Td><Pill value={STATUS_TONE[e.outcome] || 'None'}>{e.outcome}</Pill>{e.refusedCode && <Sub>Cause: {e.refusedCode}</Sub>}{e.absentOverride && <Sub>Marked absent at the time</Sub>}</Td>
            <Td>{BASIS[e.basis]}{e.reason && <Sub>{e.reason}</Sub>}{e.reviewState === 'NeedsReview' && <Sub>Needs a second administrator's review</Sub>}{e.reviewState === 'Reviewed' && <Sub>Reviewed by {e.reviewedByName}: {e.reviewNote}</Sub>}</Td>
            <Td cls="whitespace-nowrap text-end">
              {admin && e.outcome === 'Pending' && <><button className={`${btnPrimary} !px-3 !py-1.5 !text-xs`} onClick={act(() => apiClient.post(`/safety/dismissal/exceptions/${e._id}/decide`, { decision: 'approve' }), 'Released', l.reload)}>Approve</button>{' '}<button className={`${btnGhost} !px-3 !py-1.5 !text-xs`} onClick={() => setDecl(e)}>Decline</button></>}
              {admin && e.reviewState === 'NeedsReview' && <button className={`${btnPrimary} !px-3 !py-1.5 !text-xs`} onClick={() => setRev(e)}>Review</button>}
            </Td></Row>))}</Tbl>
        <Pager pagination={l.pagination} onPage={l.setPage} />
      </Body>
      {rev && <Reason title="Review an emergency override" label="What did you find?" cta="Mark reviewed" onClose={() => setRev(null)} onSubmit={async (note) => { try { await apiClient.post(`/safety/dismissal/events/${rev._id}/review`, { note }); setRev(null); l.reload(); } catch (e) { toast.error(errMsg(e)); } }} />}
      {decl && <Reason title="Decline this exception" label="Reason" cta="Decline" danger onClose={() => setDecl(null)} onSubmit={async (note) => { try { await apiClient.post(`/safety/dismissal/exceptions/${decl._id}/decide`, { decision: 'decline', note }); setDecl(null); l.reload(); } catch (e) { toast.error(errMsg(e)); } }} />}
    </Card>
  );
};

const DismissalTab = ({ admin, duty }) => {
  const [classes, setClasses] = useState([]); const [classId, setClassId] = useState(''); const [data, setData] = useState(null); const [loading, setLoading] = useState(false); const [rel, setRel] = useState(null); const [alt, setAlt] = useState(false); const [tick, setTick] = useState(0);
  useEffect(() => { apiClient.get('/safety/dismissal/classes').then((r) => { setClasses(r.data.classes); if (r.data.classes[0]) setClassId(r.data.classes[0]._id); }).catch(() => {}); }, []);
  const load = useCallback(async () => { if (!classId) return; setLoading(true); try { setData((await apiClient.get('/safety/dismissal/roster', { params: { classId } })).data); } catch (e) { toast.error(errMsg(e)); } finally { setLoading(false); } }, [classId]);
  useEffect(() => { load(); }, [load]);
  const done = () => { load(); setTick((t) => t + 1); };
  return (
    <div className="space-y-4">
      <Card className="!p-0">
        <Bar>
          <select className={`${inputCls} !w-40`} value={classId} onChange={(e) => setClassId(e.target.value)} aria-label="Class">{classes.map((c) => <option key={c._id} value={c._id}>{c.label}</option>)}</select>
          <button className={btnGhost} onClick={load}>Refresh</button>
          {duty && <button className={btnGhost} onClick={() => setAlt(true)}>Record an alternate by phone</button>}
        </Bar>
        {loading && !data ? <div className="skeleton m-4 h-32" /> : !data || !data.students.length ? <EmptyState title="No students in this class." /> : (
          <Tbl head={['Child', 'Today', 'May collect', '']}>{data.students.map((s) => (
            <Row key={s._id}>
              <Td>{s.name}<Sub>Roll {s.rollNumber || '—'}</Sub></Td>
              <Td><Pill value={s.today === 'Present' ? 'Active' : s.today === 'Not marked' ? 'None' : 'Pending'}>{s.today}</Pill></Td>
              <Td>{s.released ? <span className="text-sm text-[#1f5d52]">Collected at {hhmm(s.released.at)} by {s.released.by}</span> : s.people.length ? <span className="text-sm">{s.people.map((p) => `${p.name} (${p.relationship}${p.kind === 'alternate' ? ', today' : ''})`).join(' · ')}</span> : <span className="text-sm text-[#5b6b7b]">Nobody listed</span>}{s.exceptionPending && <Sub>Exception waiting for an administrator</Sub>}</Td>
              <Td cls="text-end">{!s.released && <button className={`${btnPrimary} !px-3 !py-1.5 !text-xs`} onClick={() => setRel(s)}>Release…</button>}</Td>
            </Row>))}</Tbl>
        )}
      </Card>
      {(admin || duty) && <Events admin={admin} duty={duty} refreshKey={tick} />}
      {rel && <ReleaseModal student={rel} admin={admin} onClose={() => setRel(null)} onDone={done} />}
      {alt && <AltModal onClose={() => setAlt(false)} onDone={() => {}} />}
    </div>
  );
};
export default DismissalTab;
