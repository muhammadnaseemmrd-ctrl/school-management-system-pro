import React, { useState } from 'react';
import apiClient from '../../utils/apiClient';
import { Card, Modal, EmptyState, btnPrimary, btnGhost, btnDanger, errMsg } from '../ui';
import { useGet, call, Loading, Note, Table, Td, Reason, TBadge, AskForm, localInput, dt, day } from './tkit';

const MARKS = [['present', 'Present'], ['late', 'Late'], ['absent', 'Absent'], ['excused', 'Excused']];

function Attendance({ cohort, session, roster, onClose, onSaved }) {
  const [marks, setMarks] = useState(() => Object.fromEntries(roster.map((r) => [String(r.learnerId), (session.attendance || {})[String(r.learnerId)] || 'present'])));
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const save = async () => { setBusy(true); setErr(''); try { await apiClient.post(`/training/cohorts/${cohort._id}/sessions/${session.id}/attendance`, { marks }); await onSaved(); } catch (e) { setErr(errMsg(e, 'Could not save attendance.')); setBusy(false); } };
  return (
    <Modal title={`Attendance: ${session.title}`} onClose={onClose} wide>
      <div className="grid gap-3">
        <p className="text-sm text-[#5b6b7b]">{dt(session.startsAt)} · {session.minutes} minutes. A learner left unmarked counts as absent. Saving finishes the register and a course may then become ready for review.</p>
        {roster.length === 0 ? <Note>Nobody has a seat in this cohort yet.</Note> : (
          <Table label="Attendance" head={['Learner', 'Mark']} min={360}>
            {roster.map((r) => (
              <tr key={r.learnerId}><Td>{r.name}</Td><Td><div role="radiogroup" aria-label={`Mark for ${r.name}`} className="flex flex-wrap gap-3">{MARKS.map(([k, v]) => <label key={k} className="flex items-center gap-1 text-xs"><input type="radio" name={`m-${r.learnerId}`} checked={marks[String(r.learnerId)] === k} onChange={() => setMarks({ ...marks, [String(r.learnerId)]: k })} /> {v}</label>)}</div></Td></tr>
            ))}
          </Table>
        )}
        {err && <p role="alert" className="text-sm text-[#9f1239]">{err}</p>}
        <div className="flex justify-end gap-2"><button className={btnGhost} onClick={onClose}>Cancel</button><button className={btnPrimary} disabled={busy || roster.length === 0} onClick={save}>{busy ? 'Saving…' : 'Save attendance'}</button></div>
      </div>
    </Modal>
  );
}

function SessionForm({ cohort, session, onClose, onSaved }) {
  const s = session || {};
  return (
    <AskForm title={session ? `Edit ${s.title}` : 'Add a live session'} confirm="Save session" onClose={onClose} wide
      initial={{ title: s.title || '', startsAt: localInput(s.startsAt), minutes: s.minutes || 60, mode: s.mode || 'online', link: s.link || '', venue: s.venue || '' }}
      fields={[{ k: 'title', label: 'Title', required: true, max: 120 }, { k: 'startsAt', label: 'Starts', type: 'datetime-local', required: true }, { k: 'minutes', label: 'Minutes', type: 'number', min: 5, max: 600, required: true }, { k: 'mode', label: 'Where', type: 'select', options: [['online', 'Online'], ['venue', 'At a venue']] }, { k: 'link', label: 'Meeting link (https, for online)' }, { k: 'venue', label: 'Venue (for in person)' }]}
      onDone={async (v) => { const body = { ...v, startsAt: new Date(v.startsAt).toISOString(), minutes: Number(v.minutes) }; if (session) await apiClient.patch(`/training/cohorts/${cohort._id}/sessions/${s.id}`, body); else await apiClient.post(`/training/cohorts/${cohort._id}/sessions`, body); await onSaved(); }} />
  );
}

function CohortView({ id, admin, onBack }) {
  const g = useGet(`/training/cohorts/${id}`); const [sess, setSess] = useState(null); const [att, setAtt] = useState(null); const [edit, setEdit] = useState(false); const [cancel, setCancel] = useState(false); const co = g.data?.cohort; const roster = g.data?.roster || [];
  const ins = useGet('/training/instructors');
  return (
    <div className="space-y-3">
      <button className={btnGhost} onClick={onBack}>Back to the cohorts</button>
      <Loading g={g}>{co && (
        <>
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div><h3 className="text-lg font-semibold text-[#1b2837]">{co.name}</h3><p className="text-sm text-[#5b6b7b]">{co.mode === 'self' ? 'Self-paced' : 'Live sessions'} · {day(co.startsAt)} to {day(co.endsAt)} · seats {co.seatsTaken}{co.capacity ? ` of ${co.capacity}` : ' (no limit)'}{co.mode === 'led' ? ` · ${co.minAttendance}% attendance needed` : ''}</p></div>
              <div className="flex flex-wrap items-center gap-2"><TBadge s={co.status} />{admin && <button className={`${btnGhost} !px-3 !py-1.5 !text-xs`} onClick={() => setEdit(true)}>Edit</button>}
                {admin && co.status === 'open' && <button className={`${btnGhost} !px-3 !py-1.5 !text-xs`} onClick={() => call(() => apiClient.post(`/training/cohorts/${co._id}/status`, { status: 'closed' }), 'Closed to new learners', g.reload)}>Close enrolment</button>}
                {admin && co.status === 'closed' && <button className={`${btnGhost} !px-3 !py-1.5 !text-xs`} onClick={() => call(() => apiClient.post(`/training/cohorts/${co._id}/status`, { status: 'open' }), 'Open again', g.reload)}>Reopen</button>}
                {admin && !['cancelled'].includes(co.status) && <button className={`${btnDanger} !px-3 !py-1.5 !text-xs`} onClick={() => setCancel(true)}>Cancel cohort</button>}</div>
            </div>
          </Card>
          {co.mode === 'led' && (
            <Card>
              <div className="mb-2 flex items-center justify-between"><h4 className="font-semibold text-[#1b2837]">Live sessions</h4><button className={btnPrimary} onClick={() => setSess({})}>Add a session</button></div>
              {(co.sessions || []).length === 0 ? <EmptyState title="No sessions yet" text="Add the dates learners should come to. Learners get a reminder the day before." /> : (
                <Table label="Sessions" head={['Session', 'When', 'Where', 'Register', '']} min={680}>
                  {co.sessions.map((s) => {
                    const past = new Date(s.startsAt) <= new Date(); const present = Object.values(s.attendance || {}).filter((x) => x === 'present' || x === 'late').length;
                    return (
                      <tr key={s.id}><Td className="font-medium">{s.title}</Td><Td>{dt(s.startsAt)}<div className="text-xs text-[#5b6b7b]">{s.minutes} min</div></Td><Td className="text-xs">{s.mode === 'online' ? 'Online' : s.venue}</Td><Td>{s.marked ? <span className="text-xs">{present} of {Object.keys(s.attendance || {}).length} came</span> : <span className="text-xs text-[#5b6b7b]">{past ? 'Not taken yet' : 'Not started'}</span>}</Td>
                        <Td><div className="flex flex-wrap gap-1">{past && <button className={`${btnGhost} !px-2 !py-1 !text-xs`} aria-label={`${s.marked ? 'Change' : 'Take'} attendance for ${s.title}`} onClick={() => setAtt(s)}>{s.marked ? 'Change register' : 'Take attendance'}</button>}<button className={`${btnGhost} !px-2 !py-1 !text-xs`} aria-label={`Edit ${s.title}`} onClick={() => setSess(s)}>Edit</button>{!s.marked && <button className={`${btnDanger} !px-2 !py-1 !text-xs`} aria-label={`Remove ${s.title}`} onClick={() => call(() => apiClient.delete(`/training/cohorts/${co._id}/sessions/${s.id}`), 'Session removed', g.reload)}>Remove</button>}</div></Td></tr>
                    );
                  })}
                </Table>
              )}
            </Card>
          )}
          <Card>
            <h4 className="mb-2 font-semibold text-[#1b2837]">Learners with a seat ({roster.length})</h4>
            {roster.length === 0 ? <p className="text-sm text-[#5b6b7b]">Nobody yet.</p> : (
              <Table label="Roster" head={['Learner', 'Access', 'Course']} min={420}>{roster.map((r) => <tr key={r.learnerId}><Td>{r.name}<div className="text-xs text-[#5b6b7b]">{r.email}</div></Td><Td><TBadge s={r.status} /></Td><Td><TBadge s={r.completion} /></Td></tr>)}</Table>
            )}
          </Card>
        </>
      )}</Loading>
      {sess && <SessionForm cohort={co} session={sess.id ? sess : null} onClose={() => setSess(null)} onSaved={async () => { setSess(null); await g.reload(); }} />}
      {att && <Attendance cohort={co} session={att} roster={roster.filter((r) => r.status !== 'revoked')} onClose={() => setAtt(null)} onSaved={async () => { setAtt(null); await g.reload(); }} />}
      {cancel && <Reason title="Cancel this cohort" text="A cohort with learners in it cannot be cancelled. Move or refund them first." confirm="Cancel the cohort" min={10} onClose={() => setCancel(false)} onDone={async (reason) => { await apiClient.post(`/training/cohorts/${co._id}/status`, { status: 'cancelled', reason }); setCancel(false); g.reload(); }} />}
      {edit && co && <AskForm title="Edit the cohort" confirm="Save" wide onClose={() => setEdit(false)} initial={{ name: co.name, startsAt: localInput(co.startsAt), endsAt: localInput(co.endsAt), enrolUntil: localInput(co.enrolUntil), capacity: co.capacity || 0, minAttendance: co.minAttendance || 0, instructorId: co.instructorId || '' }}
        fields={[{ k: 'name', label: 'Name', required: true }, { k: 'capacity', label: 'Seats (0 = no limit)', type: 'number', min: 0 }, { k: 'startsAt', label: 'Starts', type: 'datetime-local' }, { k: 'endsAt', label: 'Ends', type: 'datetime-local' }, { k: 'enrolUntil', label: 'Enrol until', type: 'datetime-local' }, { k: 'minAttendance', label: 'Attendance needed (%)', type: 'number', min: 0, max: 100 }, { k: 'instructorId', label: 'Lead instructor', type: 'select', options: [['', 'Not set'], ...(ins.data?.instructors || []).map((i) => [i._id, i.name])] }]}
        onDone={async (v) => { const body = { name: v.name, capacity: Number(v.capacity) || 0, minAttendance: Number(v.minAttendance) || 0, instructorId: v.instructorId || null }; for (const k of ['startsAt', 'endsAt', 'enrolUntil']) body[k] = v[k] ? new Date(v[k]).toISOString() : null; await apiClient.patch(`/training/cohorts/${co._id}`, body); setEdit(false); g.reload(); }} />}
    </div>
  );
}

export function Cohorts({ admin = true }) {
  const g = useGet('/training/cohorts'); const cs = useGet('/training/courses', { status: 'published' }); const [open, setOpen] = useState(null); const [form, setForm] = useState(false); const rows = g.data?.cohorts || [];
  if (open) return <CohortView id={open} admin={admin} onBack={() => { setOpen(null); g.reload(); }} />;
  const published = (cs.data?.courses || []).filter((c) => c.status === 'published');
  return (
    <div className="space-y-3">
      {admin && <div className="flex justify-end"><button className={btnPrimary} onClick={() => setForm(true)} disabled={!published.length} title={published.length ? '' : 'Publish a course first'}>New cohort</button></div>}
      {admin && !published.length && <Note>A cohort runs for a published course. Publish one first.</Note>}
      <Loading g={g}>{rows.length === 0 ? <Card><EmptyState title="No cohorts yet" text="A cohort is one run of a course: its dates, seats and live sessions. Self-paced courses use a self-paced cohort." /></Card> : (
        <Table label="Cohorts" head={['Cohort', 'Course', 'Dates', 'Seats', 'Status', '']} min={720}>
          {rows.map((c) => (
            <tr key={c._id}><Td className="font-medium">{c.name}<div className="text-xs text-[#5b6b7b]">{c.mode === 'self' ? 'Self-paced' : `${c.sessions} live session${c.sessions === 1 ? '' : 's'}`}</div></Td><Td>{c.courseTitle}</Td><Td className="text-xs">{day(c.startsAt)} – {day(c.endsAt)}</Td><Td>{c.seatsTaken}{c.capacity ? ` / ${c.capacity}` : ''}</Td><Td><TBadge s={c.status} /></Td>
              <Td><button className={`${btnGhost} !px-2 !py-1 !text-xs`} aria-label={`Open ${c.name}`} onClick={() => setOpen(c._id)}>Open</button></Td></tr>
          ))}
        </Table>
      )}</Loading>
      {form && <AskForm title="New cohort" confirm="Create the cohort" wide onClose={() => setForm(false)} initial={{ courseId: published[0]?._id || '', mode: 'led', capacity: 0, minAttendance: 75 }}
        fields={[{ k: 'courseId', label: 'Course', type: 'select', options: published.map((c) => [c._id, c.title]), required: true }, { k: 'name', label: 'Name (for example "Spring 2027")', required: true }, { k: 'mode', label: 'Kind', type: 'select', options: [['led', 'Live sessions with attendance'], ['self', 'Self-paced']] }, { k: 'capacity', label: 'Seats (0 = no limit)', type: 'number', min: 0 }, { k: 'startsAt', label: 'Starts', type: 'datetime-local' }, { k: 'endsAt', label: 'Ends', type: 'datetime-local' }, { k: 'enrolUntil', label: 'Enrol until', type: 'datetime-local' }, { k: 'minAttendance', label: 'Attendance needed (%)', type: 'number', min: 0, max: 100 }]}
        onDone={async (v) => { const body = { courseId: v.courseId, name: v.name, mode: v.mode, capacity: Number(v.capacity) || 0, minAttendance: Number(v.minAttendance) || 0 }; for (const k of ['startsAt', 'endsAt', 'enrolUntil']) if (v[k]) body[k] = new Date(v[k]).toISOString(); const r = await apiClient.post('/training/cohorts', body); setForm(false); await g.reload(); setOpen(r.data._id); }} />}
    </div>
  );
}
