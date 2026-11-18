import React, { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import apiClient from '../../utils/apiClient';
import { Card, Modal, Field, Pill, Pager, Stat, EmptyState, btnGhost, btnPrimary, btnDanger, inputCls, fmtDate, errMsg } from '../ui';
import { useList, Body, Tbl, Td, Row, Bar, act, Sub, TONE, StudentPick, todayKey } from './deskKit';
import QrCode from './QrCode';

const LEAVE_KINDS = ['Medical', 'Family', 'Religious', 'Other', 'Exam', 'FieldTrip', 'Internship', 'Transfer'];
const STATUSES = ['Present', 'Absent', 'Late', 'HalfDay', 'Leave'];
const Reason = ({ title, label, cta, danger, onClose, onSubmit }) => {
  const [text, setText] = useState('');
  return (
    <Modal title={title} onClose={onClose}>
      <Field label={label}><textarea className={inputCls} rows={3} value={text} onChange={(e) => setText(e.target.value)} maxLength={300} /></Field>
      <div className="mt-4 flex justify-end gap-2"><button className={btnGhost} onClick={onClose}>Cancel</button><button className={danger ? btnDanger : btnPrimary} disabled={text.trim().length < 3} onClick={() => onSubmit(text.trim())}>{cta}</button></div>
    </Modal>
  );
};

/* ───────── overview ───────── */
const Overview = ({ onGo }) => {
  const [o, setO] = useState(null);
  useEffect(() => { apiClient.get('/attendance-ops/overview').then((r) => setO(r.data)).catch(() => {}); }, []);
  if (!o) return <div className="skeleton h-32" />;
  const B = ({ tab, ...p }) => <button className="text-start" onClick={() => onGo(tab)}><Stat {...p} /></button>;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <B tab="alerts" label="Absences waiting to be verified" value={o.pendingAlerts} sub="Parents are told only after someone checks" />
      <B tab="leave" label="Leave requests" value={o.leaveRequests} />
      <B tab="corrections" label="Corrections to decide" value={o.corrections} />
      <B tab="cases" label="Open follow-up cases" value={o.openCases} sub="Repeated absence" />
      <B tab="anomalies" label="Findings to review" value={o.openAnomalies} />
      <B tab="devices" label="Readers" value={o.devices} sub={o.staleDevices ? `${o.staleDevices} not reporting` : 'All reporting'} tone={o.staleDevices ? 'text-[#9f1239]' : undefined} />
    </div>
  );
};

/* ───────── alerts ───────── */
const Alerts = () => {
  const [status, setStatus] = useState(''); const l = useList('/attendance-ops/alerts', 'alerts', { status }); const [hold, setHold] = useState(null); const [view, setView] = useState(null);
  const open = async (a) => { try { setView((await apiClient.get(`/attendance-ops/alerts/${a._id}`)).data); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <Card className="!p-0">
      <Bar><select className={`${inputCls} !w-44`} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter alerts"><option value="">All alerts</option>{['Pending', 'Verified', 'Sent', 'Cancelled'].map((s) => <option key={s}>{s}</option>)}</select><span className="text-xs text-[#5b6b7b]">An alert reaches a parent only after it is verified and any wait has passed.</span></Bar>
      <Body l={l} cols={5} empty="No alerts here.">
        <Tbl head={['Student', 'What', 'Status', 'Detail', '']}>{l.rows.map((a) => (
          <Row key={a._id}><Td>{a.student?.name}<Sub>Roll {a.student?.rollNumber || '—'}</Sub></Td><Td>{a.kind}<Sub>{a.date}</Sub></Td><Td><Pill value={TONE[a.status]}>{a.status}</Pill>{a.dueAt && a.status === 'Verified' && <Sub>Sends after {new Date(a.dueAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Sub>}{a.cancelledReason && <Sub>{a.cancelledReason}</Sub>}</Td><Td cls="max-w-xs">{a.detail}</Td>
            <Td cls="whitespace-nowrap text-end">
              {a.status === 'Pending' && <button className={`${btnPrimary} !px-3 !py-1.5 !text-xs`} onClick={act(() => apiClient.post(`/attendance-ops/alerts/${a._id}/verify`, {}), 'Verified', l.reload)}>Verify</button>}{' '}
              {['Pending', 'Verified'].includes(a.status) && <button className={`${btnGhost} !px-3 !py-1.5 !text-xs`} onClick={() => setHold(a)}>Hold back</button>}{' '}
              {a.status === 'Sent' && <button className={`${btnGhost} !px-3 !py-1.5 !text-xs`} onClick={() => open(a)}>Who read it</button>}
            </Td></Row>))}</Tbl>
        <Pager pagination={l.pagination} onPage={l.setPage} />
      </Body>
      {hold && <Reason title="Hold this alert back" label="Why should it not go out?" cta="Hold back" danger onClose={() => setHold(null)} onSubmit={async (reason) => { try { await apiClient.post(`/attendance-ops/alerts/${hold._id}/cancel`, { reason }); toast.success('Held back'); setHold(null); l.reload(); } catch (e) { toast.error(errMsg(e)); } }} />}
      {view && (
        <Modal title="Delivery, reading and reply" onClose={() => setView(null)}>
          <p className="mb-3 text-sm text-[#3b4a5c]">Delivered, read and answered are three separate facts.</p>
          <Tbl head={['Who', 'Delivered', 'Read', 'Answered']}>{view.receipts.map((r) => <Row key={r._id}><Td>{r.role}</Td><Td>{fmtDate(r.deliveredAt)}</Td><Td>{r.readAt ? fmtDate(r.readAt) : 'Not yet'}</Td><Td>{r.acknowledgedAt ? <>{fmtDate(r.acknowledgedAt)}{r.reply && <Sub>“{r.reply}”</Sub>}</> : 'Not yet'}</Td></Row>)}</Tbl>
        </Modal>
      )}
    </Card>
  );
};

/* ───────── leave ───────── */
const NewLeave = ({ onClose, onDone }) => {
  const [f, setF] = useState({ studentId: '', kind: 'Medical', fromDate: todayKey(), toDate: todayKey(), reason: '' }); const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = act(async () => { await apiClient.post('/attendance-ops/leave', f); onDone(); onClose(); }, 'Request recorded');
  return (
    <Modal title="Record leave or a mobility state" onClose={onClose}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><Field label="Student"><StudentPick value={f.studentId} onChange={(v) => setF({ ...f, studentId: v })} /></Field></div>
        <Field label="Kind" hint="Exam, field trip, internship and transfer are kept apart from ordinary leave"><select className={inputCls} value={f.kind} onChange={set('kind')}>{LEAVE_KINDS.map((k) => <option key={k}>{k}</option>)}</select></Field>
        <div />
        <Field label="From"><input type="date" className={inputCls} value={f.fromDate} onChange={set('fromDate')} /></Field><Field label="To"><input type="date" className={inputCls} value={f.toDate} onChange={set('toDate')} /></Field>
        <div className="sm:col-span-2"><Field label="Reason"><textarea className={inputCls} rows={2} value={f.reason} onChange={set('reason')} maxLength={400} /></Field></div>
      </div>
      <div className="mt-4 flex justify-end gap-2"><button className={btnGhost} onClick={onClose}>Cancel</button><button className={btnPrimary} disabled={!f.studentId || f.reason.trim().length < 3} onClick={save}>Record</button></div>
    </Modal>
  );
};
const Leave = () => {
  const [status, setStatus] = useState('Requested'); const l = useList('/attendance-ops/leave', 'leave', { status }); const [adding, setAdding] = useState(false); const [refuse, setRefuse] = useState(null);
  const decide = (id, decision, note) => act(() => apiClient.post(`/attendance-ops/leave/${id}/decide`, { decision, note }), decision === 'approve' ? 'Approved' : 'Refused', l.reload);
  return (
    <Card className="!p-0">
      <Bar><select className={`${inputCls} !w-44`} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter leave"><option value="">All</option>{['Requested', 'Approved', 'Rejected', 'Cancelled'].map((s) => <option key={s}>{s}</option>)}</select><button className={`${btnPrimary} ms-auto`} onClick={() => setAdding(true)}>Record leave</button></Bar>
      <Body l={l} cols={5} empty="No leave requests here.">
        <Tbl head={['Student', 'Kind', 'Dates', 'Reason', 'Status', '']}>{l.rows.map((x) => (
          <Row key={x._id}><Td>{x.studentName}</Td><Td>{x.kind}<Sub>{x.state === 'Mobility' ? 'Mobility, not leave' : 'Excused leave'}</Sub></Td><Td>{x.fromDate} to {x.toDate}{x.appliedDays > 0 && <Sub>{x.appliedDays} absent day(s) turned into leave</Sub>}</Td><Td cls="max-w-xs">{x.reason}{x.decisionNote && <Sub>{x.decisionNote}</Sub>}</Td><Td><Pill value={TONE[x.status]}>{x.status}</Pill></Td>
            <Td cls="whitespace-nowrap text-end">{x.status === 'Requested' && <><button className={`${btnPrimary} !px-3 !py-1.5 !text-xs`} onClick={decide(x._id, 'approve')}>Approve</button>{' '}<button className={`${btnDanger} !px-3 !py-1.5 !text-xs`} onClick={() => setRefuse(x)}>Refuse</button></>}</Td></Row>))}</Tbl>
        <Pager pagination={l.pagination} onPage={l.setPage} />
      </Body>
      {adding && <NewLeave onClose={() => setAdding(false)} onDone={l.reload} />}
      {refuse && <Reason title="Refuse this request" label="Why is it refused?" cta="Refuse" danger onClose={() => setRefuse(null)} onSubmit={async (note) => { await decide(refuse._id, 'reject', note)(); setRefuse(null); }} />}
    </Card>
  );
};

/* ───────── corrections ───────── */
const NewCorrection = ({ onClose, onDone }) => {
  const [f, setF] = useState({ studentId: '', date: todayKey(), status: 'Present', arrivedAt: '', leftAt: '', reason: '' }); const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = act(async () => { await apiClient.post('/attendance-ops/corrections', { ...f, arrivedAt: f.arrivedAt || undefined, leftAt: f.leftAt || undefined }); onDone(); onClose(); }, 'Correction requested');
  return (
    <Modal title="Ask for a correction" onClose={onClose}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><Field label="Student"><StudentPick value={f.studentId} onChange={(v) => setF({ ...f, studentId: v })} /></Field></div>
        <Field label="Date"><input type="date" max={todayKey()} className={inputCls} value={f.date} onChange={set('date')} /></Field>
        <Field label="It should say"><select className={inputCls} value={f.status} onChange={set('status')}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></Field>
        {f.status === 'Late' && <Field label="Arrived at"><input type="time" className={inputCls} value={f.arrivedAt} onChange={set('arrivedAt')} /></Field>}
        {f.status === 'HalfDay' && <Field label="Left at"><input type="time" className={inputCls} value={f.leftAt} onChange={set('leftAt')} /></Field>}
        <div className="sm:col-span-2"><Field label="What was wrong?"><textarea className={inputCls} rows={2} value={f.reason} onChange={set('reason')} maxLength={400} /></Field></div>
      </div>
      <p className="mt-2 text-xs text-[#5b6b7b]">Someone else decides. The original mark is always kept.</p>
      <div className="mt-4 flex justify-end gap-2"><button className={btnGhost} onClick={onClose}>Cancel</button><button className={btnPrimary} disabled={!f.studentId || f.reason.trim().length < 5} onClick={save}>Send request</button></div>
    </Modal>
  );
};
const Corrections = () => {
  const [status, setStatus] = useState('Requested'); const l = useList('/attendance-ops/corrections', 'corrections', { status }); const [adding, setAdding] = useState(false); const [refuse, setRefuse] = useState(null); const [hist, setHist] = useState(null);
  const decide = (id, decision, note) => act(() => apiClient.post(`/attendance-ops/corrections/${id}/decide`, { decision, note }), decision === 'approve' ? 'Approved and applied' : 'Refused', l.reload);
  const history = async (sid) => { try { setHist((await apiClient.get(`/attendance-ops/history/${sid}`)).data.history); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <Card className="!p-0">
      <Bar><select className={`${inputCls} !w-44`} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter corrections"><option value="">All</option>{['Requested', 'Approved', 'Rejected'].map((s) => <option key={s}>{s}</option>)}</select><button className={`${btnPrimary} ms-auto`} onClick={() => setAdding(true)}>Ask for a correction</button></Bar>
      <Body l={l} cols={5} empty="No corrections here.">
        <Tbl head={['Student', 'Date', 'Change', 'Reason', 'Status', '']}>{l.rows.map((x) => (
          <Row key={x._id}><Td>{x.studentName}<Sub>asked by {x.requestedByRole}</Sub></Td><Td>{x.date}</Td><Td>{x.original?.status} → <b>{x.requested?.status}</b></Td><Td cls="max-w-xs">{x.reason}{x.decisionNote && <Sub>{x.decisionNote}</Sub>}</Td><Td><Pill value={TONE[x.status]}>{x.status}</Pill></Td>
            <Td cls="whitespace-nowrap text-end">{x.status === 'Requested' && <><button className={`${btnPrimary} !px-3 !py-1.5 !text-xs`} onClick={decide(x._id, 'approve')}>Approve</button>{' '}<button className={`${btnDanger} !px-3 !py-1.5 !text-xs`} onClick={() => setRefuse(x)}>Refuse</button>{' '}</>}<button className={`${btnGhost} !px-3 !py-1.5 !text-xs`} onClick={() => history(x.studentId)}>History</button></Td></Row>))}</Tbl>
        <Pager pagination={l.pagination} onPage={l.setPage} />
      </Body>
      {adding && <NewCorrection onClose={() => setAdding(false)} onDone={l.reload} />}
      {refuse && <Reason title="Refuse this correction" label="Why is it refused?" cta="Refuse" danger onClose={() => setRefuse(null)} onSubmit={async (note) => { await decide(refuse._id, 'reject', note)(); setRefuse(null); }} />}
      {hist && <Modal title="Every change, oldest kept" onClose={() => setHist(null)} wide>{hist.length ? <Tbl head={['When', 'Date', 'From', 'To', 'By', 'Why']}>{hist.map((h) => <Row key={h._id}><Td>{fmtDate(h.at)}</Td><Td>{h.date}</Td><Td>{h.before?.status || '—'}</Td><Td>{h.after?.status || '—'}</Td><Td>{h.changedByRole}<Sub>{h.source}</Sub></Td><Td>{h.reason}</Td></Row>)}</Tbl> : <EmptyState title="No changes recorded" />}</Modal>}
    </Card>
  );
};

/* ───────── repeated absence cases ───────── */
const Cases = ({ admin }) => {
  const [status, setStatus] = useState('Open'); const l = useList('/attendance-ops/cases', 'cases', { status }); const [open, setOpen] = useState(null); const [text, setText] = useState(''); const [outcome, setOutcome] = useState('');
  const load = async (id) => { try { setOpen((await apiClient.get(`/attendance-ops/cases/${id}`)).data); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <Card className="!p-0">
      <Bar><select className={`${inputCls} !w-44`} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter cases"><option value="">All</option>{['Open', 'InProgress', 'Resolved'].map((s) => <option key={s}>{s}</option>)}</select>{admin && <button className={`${btnGhost} ms-auto`} onClick={act(async () => { const r = await apiClient.post('/attendance-ops/cases/scan', {}); toast.success(`${r.data.opened} new case(s)`); }, '', l.reload)}>Look for new cases</button>}</Bar>
      <Body l={l} cols={4} empty="No follow-up cases. They open on their own when absences repeat.">
        <Tbl head={['Student', 'Why', 'Status', '']}>{l.rows.map((c) => (
          <Row key={c._id}><Td>{c.studentName}<Sub>Roll {c.rollNumber || '—'}</Sub></Td><Td>{c.trigger?.absences} absences in {c.trigger?.windowDays} days<Sub>{c.trigger?.from} to {c.trigger?.to}</Sub></Td><Td><Pill value={TONE[c.status]}>{c.status}</Pill></Td><Td cls="text-end"><button className={`${btnGhost} !px-3 !py-1.5 !text-xs`} onClick={() => { setText(''); setOutcome(''); load(c._id); }}>Open</button></Td></Row>))}</Tbl>
        <Pager pagination={l.pagination} onPage={l.setPage} />
      </Body>
      {open && (
        <Modal title={`Follow-up: ${open.case.studentName}`} onClose={() => setOpen(null)} wide>
          <p className="mb-3 text-sm text-[#3b4a5c]">This is a supportive conversation with the family, not a punishment. Record what you hear and what is agreed.</p>
          <div className="mb-3 flex flex-wrap gap-1">{open.days.map((d, i) => <span key={i} className="rounded bg-[#f1f2f2] px-2 py-0.5 text-xs">{d.date} · {d.status}</span>)}</div>
          <ul className="mb-3 space-y-2">{open.case.notes.map((n, i) => <li key={i} className="rounded-lg bg-[#f7f6f2] p-2 text-sm">{n.text}<Sub>{n.byRole} · {fmtDate(n.at)}</Sub></li>)}</ul>
          {open.case.status !== 'Resolved' && (
            <>
              <Field label="Add a note"><div className="flex gap-2"><input className={inputCls} value={text} onChange={(e) => setText(e.target.value)} maxLength={600} /><button className={btnPrimary} disabled={text.trim().length < 3} onClick={act(() => apiClient.post(`/attendance-ops/cases/${open.case._id}/notes`, { text }), 'Note added', () => { setText(''); load(open.case._id); l.reload(); })}>Add</button></div></Field>
              <Field label="Close the case" hint="Say what was agreed with the family"><div className="flex gap-2"><input className={inputCls} value={outcome} onChange={(e) => setOutcome(e.target.value)} maxLength={400} /><button className={btnGhost} disabled={outcome.trim().length < 5} onClick={act(() => apiClient.post(`/attendance-ops/cases/${open.case._id}/status`, { status: 'Resolved', outcome }), 'Case closed', () => { setOpen(null); l.reload(); })}>Close case</button></div></Field>
            </>
          )}
          {open.case.outcome && <p className="mt-2 text-sm"><b>Outcome:</b> {open.case.outcome}</p>}
        </Modal>
      )}
    </Card>
  );
};

/* ───────── anomalies ───────── */
const KIND = { MissingRollCall: 'No register taken', EveryonePresent: 'Everyone present', PresentOnLeave: 'Present on leave day', AbsentButAtGate: 'Absent but at the gate', PresentNoGateEntry: 'No gate entry', PeriodClash: 'Two lessons at once', DeviceDrift: 'Reader clock off', DeviceSilent: 'Reader silent' };
const Anomalies = ({ admin }) => {
  const [status, setStatus] = useState('Open'); const l = useList('/attendance-ops/anomalies', 'anomalies', { status }); const [rev, setRev] = useState(null);
  return (
    <Card className="!p-0">
      <Bar><select className={`${inputCls} !w-44`} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter findings"><option value="">All</option>{['Open', 'Reviewed', 'Dismissed'].map((s) => <option key={s}>{s}</option>)}</select>{admin && <button className={`${btnPrimary} ms-auto`} onClick={act(async () => { const r = await apiClient.post('/attendance-ops/anomalies/scan', {}); toast.success(`${r.data.raised} new finding(s)`); }, '', l.reload)}>Scan today</button>}<span className="text-xs text-[#5b6b7b]">These are questions for a person. Nothing is changed automatically.</span></Bar>
      <Body l={l} cols={4} empty="Nothing to review.">
        <Tbl head={['Finding', 'Who', 'Status', '']}>{l.rows.map((a) => (
          <Row key={a._id}><Td>{KIND[a.kind] || a.kind}<Sub>{a.date}</Sub></Td><Td cls="max-w-md">{a.detail}<Sub>{a.studentName || a.className}</Sub></Td><Td><Pill value={TONE[a.status]}>{a.status}</Pill>{a.note && <Sub>{a.note}</Sub>}</Td><Td cls="text-end">{admin && a.status === 'Open' && <button className={`${btnGhost} !px-3 !py-1.5 !text-xs`} onClick={() => setRev(a)}>Review</button>}</Td></Row>))}</Tbl>
        <Pager pagination={l.pagination} onPage={l.setPage} />
      </Body>
      {rev && <Reason title={KIND[rev.kind] || 'Review'} label="What did you find?" cta="Mark reviewed" onClose={() => setRev(null)} onSubmit={async (note) => { try { await apiClient.post(`/attendance-ops/anomalies/${rev._id}/review`, { status: 'Reviewed', note }); toast.success('Reviewed'); setRev(null); l.reload(); } catch (e) { toast.error(errMsg(e)); } }} />}
    </Card>
  );
};

/* ───────── lessons: the period register ───────── */
const Lessons = () => {
  const [lessons, setLessons] = useState(null); const [open, setOpen] = useState(null);
  const load = useCallback(() => apiClient.get('/attendance-ops/period/today').then((r) => setLessons(r.data.lessons)).catch((e) => { toast.error(errMsg(e)); setLessons([]); }), []);
  useEffect(() => { load(); }, [load]);
  if (!lessons) return <div className="skeleton h-32" />;
  return (
    <Card className="!p-0">
      {!lessons.length ? <EmptyState title="No lessons for you today" text="Lessons come from the timetable, including any you cover." /> : (
        <Tbl head={['Time', 'Class', 'Subject', 'Marked', '']}>{lessons.map((x, i) => (
          <Row key={i}><Td>{x.startTime}–{x.endTime}</Td><Td>{x.className}{x.cover && <Sub>You are covering</Sub>}</Td><Td>{x.subjectName}</Td><Td>{x.marked}/{x.total}</Td>
            <Td cls="text-end"><button className={`${btnPrimary} !px-3 !py-1.5 !text-xs`} disabled={x.windowStatus === 'upcoming'} onClick={() => setOpen(x)}>{x.windowStatus === 'closed' ? 'View' : x.windowStatus === 'upcoming' ? 'Not started' : 'Take register'}</button></Td></Row>))}</Tbl>
      )}
      {open && <PeriodRegister lesson={open} onClose={() => setOpen(null)} onSaved={load} />}
    </Card>
  );
};
const PERIOD = ['Present', 'Absent', 'Late', 'Leave'];
const PeriodRegister = ({ lesson, onClose, onSaved }) => {
  const [rows, setRows] = useState(null); const mid = useRef(`p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`); const captured = useRef(new Date().toISOString());
  const q = { classId: lesson.classId, subjectId: lesson.subjectId || undefined, startTime: lesson.startTime, endTime: lesson.endTime };
  useEffect(() => { apiClient.get('/attendance-ops/period/roster', { params: q }).then((r) => setRows(r.data.students.map((s) => ({ ...s, status: s.status || (s.leave ? 'Leave' : 'Present') })))).catch((e) => { toast.error(errMsg(e)); onClose(); }); /* eslint-disable-next-line */ }, []);
  const save = act(async () => { await apiClient.post('/attendance-ops/period', { ...q, mutationId: mid.current, capturedAt: captured.current, records: rows.map((r) => ({ studentId: r._id, status: r.status })) }); onSaved(); onClose(); }, 'Register saved');
  return (
    <Modal title={`${lesson.className} · ${lesson.subjectName} · ${lesson.startTime}`} onClose={onClose} wide>
      {!rows ? <div className="skeleton h-40" /> : (
        <>
          <ul className="max-h-[55vh] divide-y divide-[#e3e7e7] overflow-auto">{rows.map((r) => (
            <li key={r._id} className="flex items-center gap-3 py-2"><span className="w-8 text-xs text-[#5b6b7b]">{r.rollNumber}</span><span className="flex-1 text-sm">{r.name}{r.atGate && <span className="ms-2 text-[11px] text-[#5b6b7b]">came through the gate</span>}{r.leave && <span className="ms-2 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-800">{r.leave.kind}</span>}</span>
              <select className={`${inputCls} !w-28`} value={r.status} onChange={(e) => setRows(rows.map((x) => (x._id === r._id ? { ...x, status: e.target.value } : x)))} aria-label={`Status for ${r.name}`}>{PERIOD.map((s) => <option key={s}>{s}</option>)}</select></li>))}</ul>
          <p className="mt-2 text-xs text-[#5b6b7b]">A gate scan only shows someone came in. This register is what counts for the lesson.</p>
          <div className="mt-3 flex justify-end gap-2"><button className={btnGhost} onClick={onClose}>Cancel</button><button className={btnPrimary} onClick={save}>Save register</button></div>
        </>
      )}
    </Modal>
  );
};

/* ───────── classroom check-in ───────── */
const SessionView = ({ id, onClose }) => {
  const [code, setCode] = useState(null); const [left, setLeft] = useState(0); const [det, setDet] = useState(null);
  const refresh = useCallback(async () => { try { const [c, d] = await Promise.all([apiClient.get(`/attendance-ops/sessions/${id}/code`), apiClient.get(`/attendance-ops/sessions/${id}`)]); setCode(c.data.code); setLeft(c.data.expiresInSeconds); setDet(d.data); } catch (e) { toast.error(errMsg(e)); } }, [id]);
  useEffect(() => { refresh(); const t = setInterval(() => setLeft((x) => x - 1), 1000); return () => clearInterval(t); }, [refresh]);
  useEffect(() => { if (left <= 0) refresh(); }, [left, refresh]);
  const decide = (e, decision, note) => act(() => apiClient.post(`/attendance-ops/sessions/${id}/evidence/${e._id}/decide`, { decision, note }), decision === 'approve' ? 'Approved' : 'Refused', refresh);
  return (
    <Modal title="Class check-in" onClose={onClose} wide>
      <div className="flex flex-wrap items-start gap-6">
        <div className="text-center">{code && <QrCode value={code} />}<p className="mt-2 text-xs text-[#5b6b7b]">New code in {Math.max(0, left)}s</p><p className="mt-1 select-all break-all font-mono text-[11px] text-[#5b6b7b]">{code}</p><p className="mt-1 text-xs text-[#5b6b7b]">Students without a camera can type this code.</p></div>
        <div className="min-w-[16rem] flex-1">
          <div className="mb-2 flex items-center justify-between"><p className="text-sm font-semibold">{det?.counts.pending || 0} waiting · {det?.counts.approved || 0} approved{det?.counts.flagged ? ` · ${det.counts.flagged} flagged` : ''}</p><button className={`${btnGhost} !px-3 !py-1.5 !text-xs`} onClick={act(async () => { const r = await apiClient.post(`/attendance-ops/sessions/${id}/approve-clean`, {}); toast.success(`${r.data.approved} approved, ${r.data.heldForReview} held for a look`); }, '', refresh)}>Approve all clean</button></div>
          <ul className="max-h-64 divide-y divide-[#e3e7e7] overflow-auto">{(det?.evidence || []).map((e) => (
            <li key={e._id} className="flex items-center gap-2 py-2 text-sm"><span className="flex-1">{e.studentName}{e.flags.length > 0 && <span className="ms-2 rounded bg-[#fff1f2] px-1.5 py-0.5 text-[11px] font-semibold text-[#9f1239]">{e.flags.join(', ')}</span>}</span>
              {e.status === 'Pending' ? <><button className={`${btnPrimary} !px-2 !py-1 !text-xs`} onClick={decide(e, 'approve')}>Approve</button><button className={`${btnDanger} !px-2 !py-1 !text-xs`} onClick={decide(e, 'reject', 'Not in the room')}>Refuse</button></> : <Pill value={TONE[e.status]}>{e.status}</Pill>}</li>))}</ul>
        </div>
      </div>
      <div className="mt-4 flex justify-end"><button className={btnDanger} onClick={act(() => apiClient.post(`/attendance-ops/sessions/${id}/close`, {}), 'Check-in closed', onClose)}>Close check-in</button></div>
    </Modal>
  );
};
const CheckIn = () => {
  const [classes, setClasses] = useState([]); const [subjects, setSubjects] = useState([]); const [f, setF] = useState({ classId: '', subjectId: '' }); const [sessions, setSessions] = useState([]); const [open, setOpen] = useState(null);
  const load = useCallback(() => apiClient.get('/attendance-ops/sessions').then((r) => setSessions(r.data.sessions)).catch(() => {}), []);
  useEffect(() => { load(); apiClient.get('/classes', { params: { limit: 100 } }).then((r) => setClasses(r.data.classes || [])).catch(() => {}); apiClient.get('/subjects', { params: { limit: 100 } }).then((r) => setSubjects(r.data.subjects || [])).catch(() => {}); }, [load]);
  const start = act(async () => { const r = await apiClient.post('/attendance-ops/sessions', { classId: f.classId, subjectId: f.subjectId || undefined }); setOpen(r.data.session._id); load(); });
  return (
    <div className="space-y-4">
      <Card><p className="mb-3 text-sm text-[#3b4a5c]">Show a code in class. Students scan it on their phone; you approve who really was there. Only that they scanned, and when, is recorded. No location is read.</p>
        <div className="flex flex-wrap items-end gap-2"><Field label="Class"><select className={`${inputCls} !w-40`} value={f.classId} onChange={(e) => setF({ ...f, classId: e.target.value })}><option value="">Choose</option>{classes.map((c) => <option key={c._id} value={c._id}>{c.standard}-{c.division}</option>)}</select></Field>
          <Field label="Subject"><select className={`${inputCls} !w-48`} value={f.subjectId} onChange={(e) => setF({ ...f, subjectId: e.target.value })}><option value="">Whole class</option>{subjects.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}</select></Field><button className={btnPrimary} disabled={!f.classId} onClick={start}>Open check-in</button></div></Card>
      <Card className="!p-0">{!sessions.length ? <EmptyState title="No open check-ins" /> : <Tbl head={['Class', 'Subject', 'Date', '']}>{sessions.map((s) => <Row key={s._id}><Td>{s.className}</Td><Td>{s.subjectName || 'Whole class'}</Td><Td>{s.date}</Td><Td cls="text-end"><button className={`${btnGhost} !px-3 !py-1.5 !text-xs`} onClick={() => setOpen(s._id)}>Show code</button></Td></Row>)}</Tbl>}</Card>
      {open && <SessionView id={open} onClose={() => { setOpen(null); load(); }} />}
    </div>
  );
};

/* ───────── devices ───────── */
const Devices = () => {
  const [rows, setRows] = useState(null); const [gate, setGate] = useState(null); const [name, setName] = useState(''); const [key, setKey] = useState(null); const [badge, setBadge] = useState({ studentId: '', badgeId: '' });
  const load = useCallback(() => { apiClient.get('/attendance-ops/devices').then((r) => setRows(r.data.devices)).catch(() => setRows([])); apiClient.get('/attendance-ops/gate').then((r) => setGate(r.data)).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);
  if (!rows) return <div className="skeleton h-32" />;
  return (
    <div className="space-y-4">
      <Card className="!p-0">
        <Bar><input className={`${inputCls} !w-56`} placeholder="Name, e.g. Main gate" value={name} onChange={(e) => setName(e.target.value)} aria-label="Reader name" /><button className={btnPrimary} disabled={name.trim().length < 2} onClick={act(async () => { const r = await apiClient.post('/attendance-ops/devices', { name, kind: 'gate' }); setKey(r.data.key); setName(''); load(); })}>Register a reader</button></Bar>
        {!rows.length ? <EmptyState title="No readers yet" text="A gate reader or scanner signs in with its own key and sends entry events." /> : (
          <Tbl head={['Reader', 'Health', 'Last seen', '']}>{rows.map((d) => <Row key={d._id}><Td>{d.name}<Sub>{d.kind}</Sub></Td><Td><Pill value={TONE[d.health]}>{d.health}</Pill>{Math.abs(d.driftSeconds) > 0 && <Sub>clock {d.driftSeconds}s off</Sub>}</Td><Td>{d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleString() : 'Never'}</Td>
            <Td cls="whitespace-nowrap text-end"><button className={`${btnGhost} !px-3 !py-1.5 !text-xs`} onClick={act(async () => setKey((await apiClient.post(`/attendance-ops/devices/${d._id}/rotate-key`, {})).data.key))}>New key</button>{' '}<button className={`${btnGhost} !px-3 !py-1.5 !text-xs`} onClick={act(() => apiClient.post(`/attendance-ops/devices/${d._id}/status`, { status: d.status === 'Active' ? 'Disabled' : 'Active' }), '', load)}>{d.status === 'Active' ? 'Disable' : 'Enable'}</button></Td></Row>)}</Tbl>
        )}
      </Card>
      <Card><p className="mb-2 text-sm font-semibold">Assign an ID badge</p><div className="flex flex-wrap items-center gap-2"><div className="w-64"><StudentPick value={badge.studentId} onChange={(v) => setBadge({ ...badge, studentId: v })} /></div><input className={`${inputCls} !w-48`} placeholder="Badge number" value={badge.badgeId} onChange={(e) => setBadge({ ...badge, badgeId: e.target.value })} aria-label="Badge number" /><button className={btnPrimary} disabled={!badge.studentId} onClick={act(() => apiClient.put(`/attendance-ops/badges/${badge.studentId}`, { badgeId: badge.badgeId }), 'Badge saved', () => setBadge({ studentId: '', badgeId: '' }))}>Save</button></div></Card>
      <Card className="!p-0"><div className="border-b border-[#e3e7e7] p-3 text-sm font-semibold">Gate entries today<Sub>{gate?.note}</Sub></div>{!gate?.events?.length ? <EmptyState title="No gate entries today" /> : <Tbl head={['Student', 'Time', 'Flags']}>{gate.events.slice(0, 40).map((e) => <Row key={e._id}><Td>{e.studentName}</Td><Td>{new Date(e.occurredAt).toLocaleTimeString()}</Td><Td>{(e.flags || []).join(', ') || '—'}</Td></Row>)}</Tbl>}</Card>
      {key && <Modal title="Copy this key now" onClose={() => setKey(null)}><p className="mb-2 text-sm text-[#3b4a5c]">It is shown once. Only a fingerprint of it is kept.</p><p className="select-all break-all rounded-lg bg-[#f7f6f2] p-3 font-mono text-sm">{key}</p><div className="mt-4 flex justify-end"><button className={btnPrimary} onClick={() => setKey(null)}>I have copied it</button></div></Modal>}
    </div>
  );
};

/* ───────── policy ───────── */
const Policy = () => {
  const [s, setS] = useState(null);
  useEffect(() => { apiClient.get('/attendance-ops/settings').then((r) => setS(r.data.settings)).catch(() => {}); }, []);
  if (!s) return <div className="skeleton h-32" />;
  const num = (k) => (e) => setS({ ...s, [k]: e.target.value }); const bool = (k) => (e) => setS({ ...s, [k]: e.target.checked });
  const save = act(async () => { const body = { ...s }; ['graceMinutes', 'caseThreshold', 'caseWindowDays', 'qrWindowSeconds', 'deviceStaleMinutes', 'driftToleranceSeconds', 'duplicateWindowSeconds'].forEach((k) => { body[k] = Number(body[k]); }); setS((await apiClient.put('/attendance-ops/settings', body)).data.settings); }, 'Policy saved');
  const Check = ({ k, label, hint }) => <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1 h-4 w-4 accent-[#2a5cac]" checked={!!s[k]} onChange={bool(k)} /><span><b>{label}</b><Sub>{hint}</Sub></span></label>;
  return (
    <Card>
      <div className="grid gap-4 sm:grid-cols-2">
        <Check k="requireVerification" label="A teacher must verify absences first" hint="Off: the mark itself counts as verified." />
        <Field label="Wait before telling parents (minutes)" hint="A correction inside this wait means no alert is ever sent."><input inputMode="numeric" className={inputCls} value={s.graceMinutes} onChange={num('graceMinutes')} /></Field>
        <Field label="Open a follow-up case after this many absences"><input inputMode="numeric" className={inputCls} value={s.caseThreshold} onChange={num('caseThreshold')} /></Field>
        <Field label="…within this many days"><input inputMode="numeric" className={inputCls} value={s.caseWindowDays} onChange={num('caseWindowDays')} /></Field>
        <Field label="Flag a class with no register after" hint="School time, like 10:00"><input className={inputCls} value={s.rollCallCutoff} onChange={num('rollCallCutoff')} /></Field>
        <Field label="Reader counts as silent after (minutes)"><input inputMode="numeric" className={inputCls} value={s.deviceStaleMinutes} onChange={num('deviceStaleMinutes')} /></Field>
        <Field label="Reader clock tolerance (seconds)"><input inputMode="numeric" className={inputCls} value={s.driftToleranceSeconds} onChange={num('driftToleranceSeconds')} /></Field>
        <Field label="Suspect a duplicate scan within (seconds)"><input inputMode="numeric" className={inputCls} value={s.duplicateWindowSeconds} onChange={num('duplicateWindowSeconds')} /></Field>
        <Check k="selfCheckInEnabled" label="Students may check in to a class by QR code" hint="Records only that they scanned the code. Never location. The teacher approves each one." />
        <Field label="Code changes every (seconds)"><input inputMode="numeric" className={inputCls} value={s.qrWindowSeconds} onChange={num('qrWindowSeconds')} /></Field>
        <Check k="biometricPilot" label="Biometric pilot" hint="Needs a no-camera alternative first: QR check-in or an ID badge reader. Students and families can opt out." />
      </div>
      <div className="mt-4 flex justify-end"><button className={btnPrimary} onClick={save}>Save policy</button></div>
    </Card>
  );
};

/* ───────── the desk ───────── */
const AttendanceDesk = ({ role = 'admin' }) => {
  const admin = role === 'admin';
  const TABS = admin
    ? [['overview', 'Overview'], ['alerts', 'Alerts'], ['leave', 'Leave'], ['corrections', 'Corrections'], ['cases', 'Follow-up'], ['anomalies', 'Findings'], ['checkin', 'Class check-in'], ['devices', 'Readers'], ['policy', 'Policy']]
    : [['lessons', 'My lessons'], ['alerts', 'Alerts'], ['leave', 'Leave'], ['corrections', 'Corrections'], ['cases', 'Follow-up'], ['checkin', 'Class check-in'], ['anomalies', 'Findings']];
  const [tab, setTab] = useState(TABS[0][0]);
  return (
    <div className="space-y-4">
      <div role="tablist" className="flex flex-wrap gap-1 border-b border-[#e3e7e7]">{TABS.map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold ${tab === id ? 'border-[#2a5cac] text-[#2a5cac]' : 'border-transparent text-[#5b6b7b] hover:text-[#1b2837]'}`}>{label}</button>)}</div>
      {tab === 'overview' && <Overview onGo={setTab} />}
      {tab === 'lessons' && <Lessons />}
      {tab === 'alerts' && <Alerts />}
      {tab === 'leave' && <Leave />}
      {tab === 'corrections' && <Corrections />}
      {tab === 'cases' && <Cases admin={admin} />}
      {tab === 'anomalies' && <Anomalies admin={admin} />}
      {tab === 'checkin' && <CheckIn />}
      {tab === 'devices' && <Devices />}
      {tab === 'policy' && <Policy />}
    </div>
  );
};
export default AttendanceDesk;
