import React, { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import apiClient from '../../utils/apiClient';
import { Card, Modal, Field, Pill, EmptyState, btnGhost, btnPrimary, inputCls, fmtDate, errMsg } from '../ui';
import FamilySafety from '../safety/FamilySafety';
import { useList, Body, Tbl, Td, Row, Bar, act, Sub, TONE, todayKey } from './deskKit';

const LEAVE_KINDS = ['Medical', 'Family', 'Religious', 'Exam', 'FieldTrip', 'Internship', 'Other'];
const STATUSES = ['Present', 'Absent', 'Late', 'HalfDay', 'Leave'];

// What the school told me, whether I opened it, and my answer
const Alerts = () => {
  const l = useList('/attendance-ops/me/alerts', 'alerts'); const [reply, setReply] = useState({});
  return (
    <Card className="!p-0">
      <Body l={l} cols={4} empty="No attendance alerts. When a child is marked absent, late or leaves early, it appears here.">
        <ul className="divide-y divide-[#e3e7e7]">{l.rows.map((a) => (
          <li key={a.receiptId} className="p-4">
            <div className="flex flex-wrap items-center gap-2"><b>{a.student}</b><Pill value={a.kind === 'Absent' ? 'Suspended' : 'Pending'}>{a.kind}</Pill><span className="text-sm text-[#5b6b7b]">{a.date}</span></div>
            <p className="mt-1 text-sm">{a.detail}</p>
            <p className="mt-1 text-xs text-[#5b6b7b]">Delivered {fmtDate(a.deliveredAt)} · {a.readAt ? `Read ${fmtDate(a.readAt)}` : 'Not read yet'}{a.acknowledgedAt ? ` · You answered ${fmtDate(a.acknowledgedAt)}` : ''}</p>
            {a.acknowledgedAt ? (a.reply && <p className="mt-2 rounded-lg bg-[#f7f6f2] p-2 text-sm">Your reply: {a.reply}</p>) : (
              <div className="mt-2 flex flex-wrap gap-2"><input className={`${inputCls} flex-1`} placeholder="Add a reply for the school (optional)" maxLength={300} value={reply[a._id] || ''} onChange={(e) => setReply({ ...reply, [a._id]: e.target.value })} aria-label="Reply to the school" />
                <button className={btnPrimary} onClick={act(() => apiClient.post(`/attendance-ops/me/alerts/${a._id}/ack`, { reply: reply[a._id] || '' }), 'Thank you, the school has your answer', l.reload)}>I have seen this</button></div>
            )}
          </li>))}</ul>
      </Body>
    </Card>
  );
};

const LeaveForm = ({ kids, onClose, onDone }) => {
  const [f, setF] = useState({ studentId: kids[0]?._id || '', kind: 'Medical', fromDate: todayKey(), toDate: todayKey(), reason: '', evidenceUrl: '' }); const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = act(async () => { await apiClient.post('/attendance-ops/leave', { ...f, evidenceUrl: f.evidenceUrl || undefined }); onDone(); onClose(); }, 'Request sent. You will be told when it is decided');
  return (
    <Modal title="Ask for leave" onClose={onClose}>
      <div className="grid gap-3 sm:grid-cols-2">
        {kids.length > 1 && <Field label="Child"><select className={inputCls} value={f.studentId} onChange={set('studentId')}>{kids.map((k) => <option key={k._id} value={k._id}>{k.name}</option>)}</select></Field>}
        <Field label="Kind"><select className={inputCls} value={f.kind} onChange={set('kind')}>{LEAVE_KINDS.map((k) => <option key={k}>{k}</option>)}</select></Field>
        <Field label="From"><input type="date" className={inputCls} value={f.fromDate} onChange={set('fromDate')} /></Field><Field label="To"><input type="date" className={inputCls} value={f.toDate} onChange={set('toDate')} /></Field>
        <div className="sm:col-span-2"><Field label="Reason"><textarea className={inputCls} rows={2} value={f.reason} onChange={set('reason')} maxLength={400} /></Field></div>
        <div className="sm:col-span-2"><Field label="Link to a doctor note or letter (optional)"><input className={inputCls} value={f.evidenceUrl} onChange={set('evidenceUrl')} /></Field></div>
      </div>
      <div className="mt-4 flex justify-end gap-2"><button className={btnGhost} onClick={onClose}>Cancel</button><button className={btnPrimary} disabled={!f.studentId || f.reason.trim().length < 3} onClick={save}>Send request</button></div>
    </Modal>
  );
};
const Leave = ({ kids }) => {
  const l = useList('/attendance-ops/leave', 'leave'); const [adding, setAdding] = useState(false);
  return (
    <Card className="!p-0">
      <Bar><span className="text-sm text-[#5b6b7b]">Approved leave is recorded as excused, not as an unexplained absence.</span><button className={`${btnPrimary} ms-auto`} onClick={() => setAdding(true)}>Ask for leave</button></Bar>
      <Body l={l} cols={4} empty="No leave requests yet.">
        <Tbl head={['Child', 'Kind', 'Dates', 'Status', '']}>{l.rows.map((x) => <Row key={x._id}><Td>{x.studentName}</Td><Td>{x.kind}</Td><Td>{x.fromDate} to {x.toDate}{x.decisionNote && <Sub>{x.decisionNote}</Sub>}</Td><Td><Pill value={TONE[x.status]}>{x.status}</Pill></Td>
          <Td cls="text-end">{x.status === 'Requested' && <button className={`${btnGhost} !px-3 !py-1.5 !text-xs`} onClick={act(() => apiClient.post(`/attendance-ops/leave/${x._id}/cancel`, {}), 'Withdrawn', l.reload)}>Withdraw</button>}</Td></Row>)}</Tbl>
      </Body>
      {adding && <LeaveForm kids={kids} onClose={() => setAdding(false)} onDone={l.reload} />}
    </Card>
  );
};

const CorrectionForm = ({ kids, onClose, onDone }) => {
  const [f, setF] = useState({ studentId: kids[0]?._id || '', date: todayKey(), status: 'Present', arrivedAt: '', reason: '' }); const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = act(async () => { await apiClient.post('/attendance-ops/corrections', { ...f, arrivedAt: f.arrivedAt || undefined }); onDone(); onClose(); }, 'Sent to the school. The original mark stays on record');
  return (
    <Modal title="Something is wrong with a mark" onClose={onClose}>
      <div className="grid gap-3 sm:grid-cols-2">
        {kids.length > 1 && <Field label="Child"><select className={inputCls} value={f.studentId} onChange={set('studentId')}>{kids.map((k) => <option key={k._id} value={k._id}>{k.name}</option>)}</select></Field>}
        <Field label="Date"><input type="date" max={todayKey()} className={inputCls} value={f.date} onChange={set('date')} /></Field>
        <Field label="It should say"><select className={inputCls} value={f.status} onChange={set('status')}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></Field>
        {f.status === 'Late' && <Field label="Arrived at"><input type="time" className={inputCls} value={f.arrivedAt} onChange={set('arrivedAt')} /></Field>}
        <div className="sm:col-span-2"><Field label="What happened?"><textarea className={inputCls} rows={2} value={f.reason} onChange={set('reason')} maxLength={400} /></Field></div>
      </div>
      <div className="mt-4 flex justify-end gap-2"><button className={btnGhost} onClick={onClose}>Cancel</button><button className={btnPrimary} disabled={!f.studentId || f.reason.trim().length < 5} onClick={save}>Send</button></div>
    </Modal>
  );
};
const Corrections = ({ kids }) => {
  const l = useList('/attendance-ops/corrections', 'corrections'); const [adding, setAdding] = useState(false);
  return (
    <Card className="!p-0">
      <Bar><span className="text-sm text-[#5b6b7b]">Ask the school to look again at a mark.</span><button className={`${btnPrimary} ms-auto`} onClick={() => setAdding(true)}>Report a wrong mark</button></Bar>
      <Body l={l} cols={4} empty="No corrections asked for.">
        <Tbl head={['Child', 'Date', 'Change', 'Status']}>{l.rows.map((x) => <Row key={x._id}><Td>{x.studentName}</Td><Td>{x.date}</Td><Td>{x.original?.status} → {x.requested?.status}</Td><Td><Pill value={TONE[x.status]}>{x.status}</Pill>{x.decisionNote && <Sub>{x.decisionNote}</Sub>}</Td></Row>)}</Tbl>
      </Body>
      {adding && <CorrectionForm kids={kids} onClose={() => setAdding(false)} onDone={l.reload} />}
    </Card>
  );
};

// Class check-in for a student: type the code, or scan it where the phone supports it. No location is ever read.
const CheckIn = () => {
  const [code, setCode] = useState(''); const [sessions, setSessions] = useState(null); const [consent, setConsent] = useState(false); const [need, setNeed] = useState(false); const [scan, setScan] = useState(false);
  const video = useRef(null); const key = useRef((() => { try { let k = localStorage.getItem('att-device'); if (!k) { k = `d-${Math.random().toString(36).slice(2, 12)}`; localStorage.setItem('att-device', k); } return k; } catch { return ''; } })());
  const load = useCallback(() => apiClient.get('/attendance-ops/sessions').then((r) => setSessions(r.data.sessions)).catch(() => setSessions([])), []);
  useEffect(() => { load(); }, [load]);
  const submit = async (value) => {
    try { const r = await apiClient.post('/attendance-ops/check-in', { code: String(value).trim(), consent: consent || undefined, clientKey: key.current }); toast.success(r.data.message); setCode(''); setNeed(false); }
    catch (e) { if (e.response?.status === 428) { setNeed(true); toast(e.response.data.message, { icon: 'ℹ️', duration: 7000 }); } else toast.error(errMsg(e)); }
  };
  useEffect(() => {
    if (!scan) return undefined;
    let stream; let stop = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }); if (video.current) { video.current.srcObject = stream; await video.current.play(); }
        const det = new window.BarcodeDetector({ formats: ['qr_code'] });
        const tick = async () => { if (stop) return; try { const r = await det.detect(video.current); if (r[0]) { setScan(false); submit(r[0].rawValue); return; } } catch { /* keep looking */ } requestAnimationFrame(tick); }; tick();
      } catch { toast.error('The camera could not be opened. Type the code instead.'); setScan(false); }
    })();
    return () => { stop = true; if (stream) stream.getTracks().forEach((t) => t.stop()); };
    // eslint-disable-next-line
  }, [scan]);
  return (
    <div className="space-y-4">
      <Card>
        <p className="text-sm text-[#3b4a5c]">When your teacher shows a code in class, scan it or type it here. Only that you scanned it, and when, is recorded. Your location is never read, and nothing runs in the background.</p>
        {sessions && !sessions.length && <p className="mt-3 rounded-lg bg-[#f7f6f2] p-3 text-sm">No class check-in is open right now.</p>}
        {sessions?.map((s) => <p key={s._id} className="mt-3 rounded-lg bg-[#edf5f3] p-3 text-sm text-[#215a52]">Open now: {s.className} {s.subjectName && `· ${s.subjectName}`}</p>)}
        <div className="mt-3 flex flex-wrap gap-2"><input className={`${inputCls} flex-1`} placeholder="Type the code from the board" value={code} onChange={(e) => setCode(e.target.value)} aria-label="Check-in code" autoCapitalize="off" autoCorrect="off" />
          <button className={btnPrimary} disabled={code.trim().length < 12} onClick={() => submit(code)}>Check in</button>
          {typeof window !== 'undefined' && 'BarcodeDetector' in window && <button className={btnGhost} onClick={() => setScan(true)}>Scan with camera</button>}</div>
        {need && <label className="mt-3 flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 h-4 w-4" checked={consent} onChange={(e) => setConsent(e.target.checked)} /><span>I agree that class check-in records only that I scanned the code, and when. I can withdraw this at any time.</span></label>}
        {need && <button className={`${btnPrimary} mt-3`} disabled={!consent || code.trim().length < 12} onClick={() => submit(code)}>Agree and check in</button>}
        {scan && <div className="mt-3"><video ref={video} className="w-full max-w-sm rounded-lg" playsInline muted /><button className={`${btnGhost} mt-2`} onClick={() => setScan(false)}>Stop camera</button></div>}
      </Card>
    </div>
  );
};

// Consent a family controls: class check-in and biometric opt-out
const Consent = ({ kids }) => {
  const [id, setId] = useState(kids[0]?._id || ''); const [c, setC] = useState(null);
  useEffect(() => { if (id) apiClient.get(`/attendance-ops/consent/${id}`).then((r) => setC(r.data.consent)).catch(() => setC(null)); }, [id]);
  const put = (patch) => act(async () => setC((await apiClient.put(`/attendance-ops/consent/${id}`, patch)).data.consent), 'Saved');
  if (!kids.length) return <EmptyState title="No child linked" />;
  return (
    <Card>
      {kids.length > 1 && <Field label="Child"><select className={`${inputCls} !w-60`} value={id} onChange={(e) => setId(e.target.value)}>{kids.map((k) => <option key={k._id} value={k._id}>{k.name}</option>)}</select></Field>}
      {c && (
        <div className="mt-3 space-y-3 text-sm">
          <label className="flex items-start gap-3"><input type="checkbox" className="mt-1 h-4 w-4 accent-[#2a5cac]" checked={c.selfCheckIn} onChange={(e) => put({ selfCheckIn: e.target.checked })()} /><span><b>Allow class check-in by QR code</b><Sub>Records only that a code was scanned, and when. No location, no background use.</Sub></span></label>
          <label className="flex items-start gap-3"><input type="checkbox" className="mt-1 h-4 w-4 accent-[#2a5cac]" checked={c.biometricOptOut} onChange={(e) => put({ biometricOptOut: e.target.checked })()} /><span><b>Do not use fingerprint or face recognition</b><Sub>If the school ever pilots it, your child will use a badge or the teacher&apos;s register instead.</Sub></span></label>
        </div>
      )}
    </Card>
  );
};

const FamilyDesk = ({ role = 'parent', kids = [] }) => {
  const TABS = [['alerts', 'Alerts'], ['leave', 'Leave'], ['corrections', 'Wrong mark?'], ...(role === 'student' ? [['checkin', 'Class check-in']] : []), ['safety', 'Pickup & visitors'], ['consent', 'Privacy choices']];
  const [tab, setTab] = useState('alerts');
  return (
    <div className="space-y-4">
      <div role="tablist" className="flex flex-wrap gap-1 border-b border-[#e3e7e7]">{TABS.map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold ${tab === id ? 'border-[#2a5cac] text-[#2a5cac]' : 'border-transparent text-[#5b6b7b] hover:text-[#1b2837]'}`}>{label}</button>)}</div>
      {tab === 'alerts' && <Alerts />}{tab === 'leave' && <Leave kids={kids} />}{tab === 'corrections' && <Corrections kids={kids} />}{tab === 'checkin' && <CheckIn />}{tab === 'safety' && <FamilySafety role={role} kids={kids} />}{tab === 'consent' && <Consent kids={kids} />}
    </div>
  );
};
export default FamilyDesk;
