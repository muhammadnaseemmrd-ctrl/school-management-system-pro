import React, { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import apiClient from '../../utils/apiClient';
import { Card, Modal, Field, Pill, Stat, EmptyState, btnGhost, btnPrimary, btnDanger, inputCls, errMsg } from '../ui';
import { useList, Body, Tbl, Td, Row, Bar, Sub } from '../attendance/deskKit';
import { Reason, Banner, dayTime } from '../safety/safetyKit';
import { useGet, call, KINDS, COVER_TONE, SWAP_TONE, SWAP_LABEL, fmtDay, todayLocal } from './planKit';

/* ───────── overview and publishing ───────── */
const Overview = ({ onGo }) => {
  const ov = useGet('/timetable-ops/overview'); const cf = useGet('/timetable-ops/conflicts'); const st = useGet('/timetable-ops/versions/status');
  const [note, setNote] = useState(''); const [from, setFrom] = useState(''); const [busy, setBusy] = useState(false);
  if (ov.loading || !ov.data) return <div className="skeleton h-40" />;
  const o = ov.data; const s = st.data; const B = ({ tab, ...p }) => <button className="text-start" onClick={() => onGo(tab)}><Stat {...p} /></button>;
  const refresh = () => { ov.reload(); cf.reload(); st.reload(); };
  const publish = async () => { setBusy(true); await call(() => apiClient.post('/timetable-ops/versions/publish', { note, effectiveFrom: from || undefined }), (r) => `Version ${r.data.version.number} published. ${r.data.version.summary?.notified ?? 0} people told.`, () => { setNote(''); refresh(); }); setBusy(false); };
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <B tab="overview" label="Double bookings" value={o.conflicts} tone={o.conflicts ? 'text-[#9f1239]' : undefined} sub="teachers or rooms used twice" />
        <B tab="workload" label="Over the limits" value={o.workloadExceptions} sub="teachers with too many periods" />
        <B tab="cover" label="Cover needed" value={o.coverNeeded} sub={`${o.coverProposed} waiting for approval`} />
        <B tab="swaps" label="Swaps to approve" value={o.swapsWaiting} sub={`${o.rooms} rooms in use`} />
      </div>
      <Card>
        <div className="mb-1 text-sm font-semibold">Publish the timetable</div>
        <p className="mb-3 text-sm text-[#3b4a5c]">{s?.latest ? `Version ${s.latest.number} was published ${dayTime(s.latest.publishedAt)} by ${s.latest.publishedByName}.` : 'Nothing has been published yet.'} {s && s.unpublishedClasses > 0 && <b>{s.unpublishedClasses} class(es) have changes that nobody has been told about yet.</b>}</p>
        <div className="grid gap-3 sm:grid-cols-3"><div className="sm:col-span-2"><Field label="What changed (shown to the history)"><input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} /></Field></div><Field label="Starts on (optional)"><input type="date" className={inputCls} min={todayLocal()} value={from} onChange={(e) => setFrom(e.target.value)} /></Field></div>
        <div className="mt-3 flex items-center justify-between gap-3"><span className="text-xs text-[#5b6b7b]">Only teachers and families whose lessons changed are notified. Every version is kept.</span><button className={btnPrimary} disabled={busy || !s?.canPublish} onClick={publish}>Publish and notify</button></div>
        {s && !s.canPublish && <p className="mt-2 text-sm text-[#7f2a1c]">{s.conflicts ? 'Fix the double bookings below first.' : 'Nothing has changed since the last version.'}</p>}
      </Card>
      {cf.data && (cf.data.conflicts.length > 0 || cf.data.warnings.length > 0) && <Card className="!p-0"><Bar><b className="text-sm">Needs attention</b></Bar>
        <Tbl head={['Problem', 'Where']}>{[...cf.data.conflicts.map((c, i) => <Row key={`c${i}`}><Td><Pill value="Suspended">{c.kind === 'teacher' ? 'Teacher twice' : 'Room twice'}</Pill><Sub>{c.kind === 'teacher' ? c.teacherName : c.room} · {c.day}</Sub></Td><Td>{c.a}<Sub>and {c.b}</Sub></Td></Row>),
          ...cf.data.warnings.map((w, i) => <Row key={`w${i}`}><Td><Pill value="Pending">{{ capacity: 'Room too small', roomKind: 'Wrong kind of room', inactiveRoom: 'Room out of use', unknownRoom: 'Unknown room' }[w.kind]}</Pill><Sub>{w.room} · {w.day}</Sub></Td><Td>{w.a}</Td></Row>)]}</Tbl></Card>}
    </div>
  );
};

/* ───────── rooms ───────── */
const RoomForm = ({ room, classes, onClose, onDone }) => {
  const [f, setF] = useState({ name: room?.name || '', kind: room?.kind || 'Classroom', capacity: room?.capacity ?? 40, equipment: (room?.equipment || []).join(', '), homeClassId: room?.homeClassId || '', notes: room?.notes || '' });
  const save = async () => { const body = { ...f, capacity: Number(f.capacity), homeClassId: f.homeClassId || null }; const r = await call(() => (room ? apiClient.put(`/timetable-ops/rooms/${room._id}`, body) : apiClient.post('/timetable-ops/rooms', body)), 'Saved'); if (r) { onDone(); onClose(); } };
  return (
    <Modal title={room ? 'Edit room' : 'Add a room'} onClose={onClose}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name"><input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={60} /></Field>
        <Field label="Kind"><select className={inputCls} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{KINDS.map((k) => <option key={k}>{k}</option>)}</select></Field>
        <Field label="Seats"><input type="number" min="1" className={inputCls} value={f.capacity} onChange={(e) => setF({ ...f, capacity: e.target.value })} /></Field>
        <Field label="Home of class (optional)"><select className={inputCls} value={f.homeClassId} onChange={(e) => setF({ ...f, homeClassId: e.target.value })}><option value="">None</option>{classes.map((c) => <option key={c._id} value={c._id}>{c.standard}-{c.division}</option>)}</select></Field>
        <div className="sm:col-span-2"><Field label="Equipment (comma separated)"><input className={inputCls} value={f.equipment} onChange={(e) => setF({ ...f, equipment: e.target.value })} /></Field></div>
      </div>
      <div className="mt-4 flex justify-end gap-2"><button className={btnGhost} onClick={onClose}>Cancel</button><button className={btnPrimary} disabled={!f.name.trim()} onClick={save}>Save</button></div>
    </Modal>
  );
};
const Rooms = () => {
  const l = useList('/timetable-ops/rooms', 'rooms'); const cls = useGet('/classes'); const [edit, setEdit] = useState(null); const [view, setView] = useState(null);
  const classes = cls.data?.classes || [];
  const open = async (r) => { const x = await call(() => apiClient.get(`/timetable-ops/rooms/${r._id}/schedule`)); if (x) setView({ room: r, lessons: x.data.lessons }); };
  return (
    <Card className="!p-0">
      <Bar><button className={btnPrimary} onClick={() => setEdit({})}>Add a room</button><span className="text-sm text-[#5b6b7b]">Once rooms are listed, a period can only use a listed room, and a room can never be booked twice.</span></Bar>
      <Body l={l} cols={5} empty="No rooms yet. Add your classrooms and labs.">
        <Tbl head={['Room', 'Kind', 'Seats', 'Used', '']}>{l.rows.map((r) => (
          <Row key={r._id}><Td>{r.name}{!r.active && <Sub>Out of use</Sub>}{r.homeClassName && <Sub>Home of {r.homeClassName}</Sub>}{r.equipment?.length > 0 && <Sub>{r.equipment.join(', ')}</Sub>}</Td><Td>{r.kind}</Td><Td>{r.capacity}</Td><Td>{r.periodsPerWeek} periods a week</Td>
            <Td cls="whitespace-nowrap text-end"><button className={`${btnGhost} !px-3 !py-1.5 !text-xs`} onClick={() => open(r)}>Week</button>{' '}<button className={`${btnGhost} !px-3 !py-1.5 !text-xs`} onClick={() => setEdit(r)}>Edit</button>{' '}<button className={`${btnGhost} !px-3 !py-1.5 !text-xs`} onClick={() => call(() => apiClient.post(`/timetable-ops/rooms/${r._id}/active`, { active: !r.active }), r.active ? 'Taken out of use' : 'Back in use', l.reload)}>{r.active ? 'Take out of use' : 'Use again'}</button></Td></Row>))}</Tbl>
      </Body>
      {edit && <RoomForm room={edit._id ? edit : null} classes={classes} onClose={() => setEdit(null)} onDone={l.reload} />}
      {view && <Modal title={`${view.room.name} this week`} onClose={() => setView(null)} wide>{view.lessons.length ? <Tbl head={['Day', 'Time', 'Class', 'Lesson']}>{view.lessons.map((x, i) => <Row key={i}><Td>{x.day}</Td><Td>{x.startTime}-{x.endTime}</Td><Td>{x.className}</Td><Td>{x.subjectName}<Sub>{x.teacherName}</Sub></Td></Row>)}</Tbl> : <p className="text-sm">Nothing is booked in this room.</p>}</Modal>}
    </Card>
  );
};

/* ───────── cover ───────── */
const NewCover = ({ teachers, onClose, onDone }) => {
  const [f, setF] = useState({ date: todayLocal(), absentTeacherId: '', lesson: '', reason: '' }); const [lessons, setLessons] = useState([]);
  useEffect(() => { setLessons([]); setF((x) => ({ ...x, lesson: '' })); if (f.absentTeacherId && f.date) apiClient.get('/timetable-ops/lessons', { params: { date: f.date, teacherId: f.absentTeacherId } }).then((r) => setLessons(r.data.lessons)).catch(() => {}); }, [f.date, f.absentTeacherId]);
  const save = async () => { const l = lessons[Number(f.lesson)]; const r = await call(() => apiClient.post('/timetable-ops/cover', { date: f.date, absentTeacherId: f.absentTeacherId, classId: l.classId, startTime: l.startTime, endTime: l.endTime, reason: f.reason }), 'Cover requested'); if (r) { onDone(); onClose(); } };
  return (
    <Modal title="Ask for cover" onClose={onClose}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Date"><input type="date" className={inputCls} min={todayLocal()} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Teacher who is away"><select className={inputCls} value={f.absentTeacherId} onChange={(e) => setF({ ...f, absentTeacherId: e.target.value })}><option value="">Choose…</option>{teachers.map((t) => <option key={t.teacherId} value={t.teacherId}>{t.name}</option>)}</select></Field>
        <div className="sm:col-span-2"><Field label="Lesson"><select className={inputCls} value={f.lesson} onChange={(e) => setF({ ...f, lesson: e.target.value })}><option value="">{lessons.length ? 'Choose…' : 'No lessons that day'}</option>{lessons.map((x, i) => <option key={i} value={i}>{x.startTime}-{x.endTime} · {x.className} · {x.subjectName}</option>)}</select></Field></div>
        <div className="sm:col-span-2"><Field label="Why"><input className={inputCls} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} maxLength={200} /></Field></div>
      </div>
      <div className="mt-4 flex justify-end gap-2"><button className={btnGhost} onClick={onClose}>Cancel</button><button className={btnPrimary} disabled={f.lesson === '' || f.reason.trim().length < 3} onClick={save}>Request cover</button></div>
    </Modal>
  );
};
const Candidates = ({ cover, onClose, onDone }) => {
  const c = useGet(`/timetable-ops/cover/${cover._id}/candidates`);
  return (
    <Modal title={`Cover for ${cover.className} · ${fmtDay(cover.date)} ${cover.startTime}`} onClose={onClose} wide>
      <p className="mb-3 text-sm text-[#3b4a5c]">Teachers who are free, in fair order: those who know the subject and class first, then those who have covered least in the last 30 days.</p>
      {c.loading ? <div className="skeleton h-24" /> : c.data?.candidates.length ? <Tbl head={['Teacher', 'Knows', 'Covers (30 days)', 'Periods that day', '']}>{c.data.candidates.map((t) => <Row key={t._id}><Td>{t.name}</Td><Td>{[t.teachesSubject && 'subject', t.teachesClass && 'class'].filter(Boolean).join(', ') || '—'}</Td><Td>{t.coversLast30Days}</Td><Td>{t.periodsThatDay}</Td><Td cls="text-end"><button className={`${btnPrimary} !px-3 !py-1.5 !text-xs`} onClick={async () => { const r = await call(() => apiClient.post(`/timetable-ops/cover/${cover._id}/propose`, { teacherId: t._id }), 'Proposed. A second administrator must approve it.'); if (r) { onDone(); onClose(); } }}>Propose</button></Td></Row>)}</Tbl> : <p className="text-sm">Nobody is free for this lesson.</p>}
      {c.data?.excluded.length > 0 && <details className="mt-3 text-sm"><summary className="cursor-pointer font-semibold">Not available ({c.data.excluded.length})</summary><ul className="mt-2 space-y-1 text-[#3b4a5c]">{c.data.excluded.map((e) => <li key={e._id}>{e.name} {e.why}</li>)}</ul></details>}
    </Modal>
  );
};
const Cover = ({ teachers }) => {
  const [status, setStatus] = useState(''); const l = useList('/timetable-ops/cover', 'cover', { status }); const [nw, setNw] = useState(false); const [pick, setPick] = useState(null); const [rel, setRel] = useState(null);
  return (
    <Card className="!p-0">
      <Bar><button className={btnPrimary} onClick={() => setNw(true)}>Ask for cover</button><select className={`${inputCls} !w-44`} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter"><option value="">Open and arranged</option>{['Needed', 'Proposed', 'Assigned', 'Cancelled'].map((s) => <option key={s}>{s}</option>)}</select><span className="text-sm text-[#5b6b7b]">Leave cover from the HR screen appears here too.</span></Bar>
      <Body l={l} cols={5} empty="No cover is needed.">
        <Tbl head={['Lesson', 'Away', 'Cover', 'Status', '']}>{l.rows.map((c) => (
          <Row key={c._id}><Td>{fmtDay(c.date)} {c.startTime}-{c.endTime}<Sub>{c.className} · {c.subjectName}</Sub></Td><Td>{c.absentName}<Sub>{c.source === 'swap' ? 'Swap' : c.source === 'adhoc' ? c.reason : 'Leave'}</Sub></Td><Td>{c.coverName || (c.proposedName ? `${c.proposedName} (proposed by ${c.proposedByName})` : '—')}{c.responseNote && <Sub>Handed back: {c.responseNote}</Sub>}</Td><Td><Pill value={COVER_TONE[c.status]}>{c.status}</Pill></Td>
            <Td cls="whitespace-nowrap text-end">
              {['Needed', 'Proposed'].includes(c.status) && <button className={`${btnGhost} !px-3 !py-1.5 !text-xs`} onClick={() => setPick(c)}>{c.status === 'Proposed' ? 'Change' : 'Find cover'}</button>}{' '}
              {c.status === 'Proposed' && <><button className={`${btnPrimary} !px-3 !py-1.5 !text-xs`} onClick={() => call(() => apiClient.post(`/timetable-ops/cover/${c._id}/decide`, { decision: 'approve' }), 'Approved. The teachers are told.', l.reload)}>Approve</button>{' '}<button className={`${btnGhost} !px-3 !py-1.5 !text-xs`} onClick={() => call(() => apiClient.post(`/timetable-ops/cover/${c._id}/decide`, { decision: 'decline' }), 'Declined', l.reload)}>Decline</button></>}
              {c.status === 'Assigned' && c.source !== 'swap' && c.source !== 'leave' && <button className={`${btnGhost} !px-3 !py-1.5 !text-xs`} onClick={() => call(() => apiClient.post(`/timetable-ops/cover/${c._id}/release`, {}), 'Released', l.reload)}>Release</button>}
              {c.source === 'adhoc' && c.status !== 'Cancelled' && <button className={`${btnGhost} !px-3 !py-1.5 !text-xs`} onClick={() => setRel(c)}>Call off</button>}
            </Td></Row>))}</Tbl>
      </Body>
      {nw && <NewCover teachers={teachers} onClose={() => setNw(false)} onDone={l.reload} />}
      {pick && <Candidates cover={pick} onClose={() => setPick(null)} onDone={l.reload} />}
      {rel && <Reason title="Call off this cover request" label="Why? (the lesson will run as normal)" cta="Call off" danger min={0} onClose={() => setRel(null)} onSubmit={async () => { await call(() => apiClient.post(`/timetable-ops/cover/${rel._id}/release`, { cancel: true }), 'Called off', l.reload); setRel(null); }} />}
    </Card>
  );
};

/* ───────── swaps ───────── */
export const SwapList = ({ admin, meId }) => {
  const l = useList('/timetable-ops/swaps', 'swaps');
  const desc = (x) => `${x.className} ${x.startTime}-${x.endTime} ${x.subjectName}`;
  const go = (id, path, body, ok) => call(() => apiClient.post(`/timetable-ops/swaps/${id}/${path}`, body), ok, l.reload);
  return (
    <Body l={l} cols={4} empty="No swaps.">
      <Tbl head={['Date', 'Exchange', 'Status', '']}>{l.rows.map((s) => (
        <Row key={s._id}><Td>{fmtDay(s.date)}</Td><Td>{s.requesterName} gives {desc(s.requesterLesson)}<Sub>{s.peerName} gives {desc(s.peerLesson)} · {s.reason}</Sub></Td><Td><Pill value={SWAP_TONE[s.status]}>{SWAP_LABEL[s.status]}</Pill></Td>
          <Td cls="whitespace-nowrap text-end">
            {!admin && s.status === 'Requested' && String(s.peerId) === String(meId) && <><button className={`${btnPrimary} !px-3 !py-1.5 !text-xs`} onClick={() => go(s._id, 'respond', { response: 'accept' }, 'Agreed. An administrator will approve it.')}>Agree</button>{' '}<button className={`${btnGhost} !px-3 !py-1.5 !text-xs`} onClick={() => go(s._id, 'respond', { response: 'decline' }, 'Declined')}>Decline</button>{' '}</>}
            {admin && s.status === 'PeerAccepted' && <><button className={`${btnPrimary} !px-3 !py-1.5 !text-xs`} onClick={() => go(s._id, 'decide', { decision: 'approve' }, 'Approved. Both teachers are told.')}>Approve</button>{' '}<button className={`${btnGhost} !px-3 !py-1.5 !text-xs`} onClick={() => go(s._id, 'decide', { decision: 'decline' }, 'Not approved')}>Decline</button>{' '}</>}
            {['Requested', 'PeerAccepted', 'Approved'].includes(s.status) && s.date >= todayLocal() && <button className={`${btnGhost} !px-3 !py-1.5 !text-xs`} onClick={() => go(s._id, 'cancel', {}, 'Cancelled')}>Cancel</button>}
          </Td></Row>))}</Tbl>
    </Body>
  );
};
export const NewSwap = ({ colleagues, onClose, onDone, myId }) => {
  const [f, setF] = useState({ date: todayLocal(), peerId: '', mine: '', theirs: '', reason: '' }); const [mine, setMine] = useState([]); const [theirs, setTheirs] = useState([]);
  useEffect(() => { setF((x) => ({ ...x, mine: '' })); apiClient.get('/timetable-ops/lessons', { params: { date: f.date, teacherId: myId } }).then((r) => setMine(r.data.lessons)).catch(() => setMine([])); }, [f.date, myId]);
  useEffect(() => { setF((x) => ({ ...x, theirs: '' })); setTheirs([]); if (f.peerId) apiClient.get('/timetable-ops/lessons', { params: { date: f.date, teacherId: f.peerId } }).then((r) => setTheirs(r.data.lessons)).catch(() => {}); }, [f.date, f.peerId]);
  const lbl = (x) => `${x.startTime}-${x.endTime} · ${x.className} · ${x.subjectName}`; const body = () => { const a = mine[Number(f.mine)]; const b = theirs[Number(f.theirs)]; return { date: f.date, peerId: f.peerId, reason: f.reason, myLesson: { classId: a.classId, startTime: a.startTime, endTime: a.endTime }, peerLesson: { classId: b.classId, startTime: b.startTime, endTime: b.endTime } }; };
  return (
    <Modal title="Swap a lesson with a colleague" onClose={onClose} wide>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Date"><input type="date" className={inputCls} min={todayLocal()} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Colleague"><select className={inputCls} value={f.peerId} onChange={(e) => setF({ ...f, peerId: e.target.value })}><option value="">Choose…</option>{colleagues.map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}</select></Field>
        <Field label="Your lesson"><select className={inputCls} value={f.mine} onChange={(e) => setF({ ...f, mine: e.target.value })}><option value="">{mine.length ? 'Choose…' : 'No lessons that day'}</option>{mine.map((x, i) => <option key={i} value={i}>{lbl(x)}</option>)}</select></Field>
        <Field label="Their lesson"><select className={inputCls} value={f.theirs} onChange={(e) => setF({ ...f, theirs: e.target.value })}><option value="">{theirs.length ? 'Choose…' : 'Choose a colleague first'}</option>{theirs.map((x, i) => <option key={i} value={i}>{lbl(x)}</option>)}</select></Field>
        <div className="sm:col-span-2"><Field label="Why"><input className={inputCls} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} maxLength={200} /></Field></div>
      </div>
      <p className="mt-3 text-sm text-[#5b6b7b]">Your colleague must agree, then an administrator approves. Nothing changes until then.</p>
      <div className="mt-4 flex justify-end gap-2"><button className={btnGhost} onClick={onClose}>Cancel</button><button className={btnPrimary} disabled={f.mine === '' || f.theirs === '' || f.reason.trim().length < 3} onClick={async () => { const r = await call(() => apiClient.post('/timetable-ops/swaps', body()), 'Sent to your colleague'); if (r) { onDone(); onClose(); } }}>Ask</button></div>
    </Modal>
  );
};

/* ───────── workload ───────── */
const Workload = () => {
  const w = useGet('/timetable-ops/workload'); const [lim, setLim] = useState(null);
  if (w.loading || !w.data) return <div className="skeleton h-40" />;
  const d = w.data;
  const saveLimits = async () => { const cfg = (await apiClient.get('/timetables/config')).data.config; if (!cfg) { toast.error('Save the school timing settings first.'); return; } await call(() => apiClient.post('/timetables/config', { schoolStartTime: cfg.schoolStartTime, schoolEndTime: cfg.schoolEndTime, lectureDurationMinutes: cfg.lectureDurationMinutes, workingDays: cfg.workingDays, breaks: cfg.breaks, academicYear: cfg.academicYear, maxPeriodsPerDay: Number(lim.maxPeriodsPerDay), maxPeriodsPerWeek: Number(lim.maxPeriodsPerWeek), maxConsecutive: Number(lim.maxConsecutive) }), 'Limits saved', () => { setLim(null); w.reload(); }); };
  return (
    <Card className="!p-0">
      <Bar><span className="text-sm">Limits: {d.limits.maxPeriodsPerDay} a day, {d.limits.maxPeriodsPerWeek} a week, {d.limits.maxConsecutive} in a row.</span><button className={btnGhost} onClick={() => setLim({ ...d.limits })}>Change limits</button></Bar>
      <div className="overflow-x-auto"><Tbl head={['Teacher', 'Week', ...d.days.map((x) => x.slice(0, 3)), 'In a row', 'Cover', 'Exceptions']}>{d.teachers.map((t) => (
        <Row key={t.teacherId}><Td>{t.name}</Td><Td>{t.weekPeriods}</Td>{d.days.map((x) => <Td key={x}>{t.days[x]}<Sub>{t.freePerDay[x]} free</Sub></Td>)}<Td>{t.maxInARow}</Td><Td>{t.coverTakenThisWeek ? `took ${t.coverTakenThisWeek}` : ''}{t.coverGivenThisWeek ? ` gave ${t.coverGivenThisWeek}` : ''}</Td><Td>{t.exceptions.length ? t.exceptions.map((e, i) => <Pill key={i} value="Suspended">{e}</Pill>) : <span className="text-[#5b6b7b]">OK</span>}</Td></Row>))}</Tbl></div>
      {lim && <Modal title="Workload limits" onClose={() => setLim(null)}><div className="grid gap-3 sm:grid-cols-3">{[['maxPeriodsPerDay', 'Periods a day'], ['maxPeriodsPerWeek', 'Periods a week'], ['maxConsecutive', 'In a row']].map(([k, label]) => <Field key={k} label={label}><input type="number" min="1" className={inputCls} value={lim[k]} onChange={(e) => setLim({ ...lim, [k]: e.target.value })} /></Field>)}</div><p className="mt-3 text-sm text-[#5b6b7b]">Cover is never offered to a teacher who would pass the daily limit.</p><div className="mt-4 flex justify-end gap-2"><button className={btnGhost} onClick={() => setLim(null)}>Cancel</button><button className={btnPrimary} onClick={saveLimits}>Save</button></div></Modal>}
    </Card>
  );
};

/* ───────── versions ───────── */
const Versions = () => {
  const l = useList('/timetable-ops/versions', 'versions'); const [open, setOpen] = useState(null); const [cls, setCls] = useState('');
  const load = async (id, classId = '') => { const r = await call(() => apiClient.get(`/timetable-ops/versions/${id}`, { params: classId ? { classId } : {} })); if (r) { setOpen(r.data.version); setCls(classId); } };
  return (
    <Card className="!p-0">
      <Bar><b className="text-sm">Published versions</b><span className="text-sm text-[#5b6b7b]">An old version can never be edited. Restoring one makes it the working timetable again.</span></Bar>
      <Body l={l} cols={5} empty="Nothing has been published yet.">
        <Tbl head={['Version', 'Published', 'Changed', 'Told', '']}>{l.rows.map((v) => <Row key={v._id}><Td>#{v.number}{v.note && <Sub>{v.note}</Sub>}{v.effectiveFrom && <Sub>from {v.effectiveFrom}</Sub>}</Td><Td>{dayTime(v.publishedAt)}<Sub>{v.publishedByName}</Sub></Td><Td>{v.summary?.changedClasses ?? 0} classes, {v.summary?.changedTeachers ?? 0} teachers</Td><Td>{v.summary?.notified ?? 0}</Td><Td cls="text-end"><button className={`${btnGhost} !px-3 !py-1.5 !text-xs`} onClick={() => load(v._id)}>Open</button></Td></Row>)}</Tbl>
      </Body>
      {open && <Modal title={`Version ${open.number}`} onClose={() => setOpen(null)} wide>
        <p className="mb-3 text-sm text-[#3b4a5c]">{open.note || 'No note.'} Published {dayTime(open.publishedAt)} by {open.publishedByName}. {open.summary?.periods} periods in {open.summary?.classes} classes.</p>
        {open.changes?.length > 0 ? <div className="mb-4 space-y-2">{open.changes.map((c) => <div key={c.classId} className="rounded-lg border border-[#e3e7e7] p-2 text-sm"><b>{c.label}</b>{c.removed.map((x, i) => <div key={`r${i}`} className="text-[#9f1239]">− {x}</div>)}{c.added.map((x, i) => <div key={`a${i}`} className="text-[#1f5d52]">+ {x}</div>)}</div>)}</div> : <p className="mb-3 text-sm">This was the first version, so every class is new.</p>}
        <Field label="See a class as it was"><select className={inputCls} value={cls} onChange={(e) => load(open._id, e.target.value)}><option value="">Choose a class…</option>{open.classes.map((c) => <option key={c.classId} value={c.classId}>{c.label}</option>)}</select></Field>
        {open.timetable && <div className="mt-3 overflow-x-auto"><Tbl head={['Day', 'Periods']}>{open.timetable.map((d) => <Row key={d.dayOfWeek}><Td>{d.dayOfWeek}</Td><Td>{d.slots.filter((s) => !s.isBreak).map((s, i) => <div key={i}>{s.startTime}-{s.endTime} {s.subjectName} <span className="text-[#5b6b7b]">{s.teacherName}{s.room ? ` · ${s.room}` : ''}</span></div>)}</Td></Row>)}</Tbl></div>}
        <div className="mt-4 flex justify-end"><button className={btnDanger} onClick={() => { if (window.confirm('Replace the working timetable with this version?')) call(() => apiClient.post(`/timetable-ops/versions/${open._id}/restore`, {}), (r) => r.data.message, () => setOpen(null)); }}>Restore this version</button></div>
      </Modal>}
    </Card>
  );
};

const TimetablePlanning = () => {
  const wl = useGet('/timetable-ops/workload'); const teachers = wl.data?.teachers || [];
  const TABS = [['overview', 'Overview'], ['rooms', 'Rooms'], ['cover', 'Cover'], ['swaps', 'Swaps'], ['workload', 'Workload'], ['versions', 'Versions']]; const [tab, setTab] = useState('overview');
  return (
    <div className="space-y-4">
      <div role="tablist" className="flex flex-wrap gap-1 border-b border-[#e3e7e7]">{TABS.map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold ${tab === id ? 'border-[#2a5cac] text-[#2a5cac]' : 'border-transparent text-[#5b6b7b] hover:text-[#1b2837]'}`}>{label}</button>)}</div>
      {tab === 'overview' && <Overview onGo={setTab} />}
      {tab === 'rooms' && <Rooms />}
      {tab === 'cover' && <Cover teachers={teachers} />}
      {tab === 'swaps' && <Card className="!p-0"><SwapList admin /></Card>}
      {tab === 'workload' && <Workload />}
      {tab === 'versions' && <Versions />}
    </div>
  );
};
export default TimetablePlanning;
