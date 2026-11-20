import React, { useState } from 'react';
import apiClient from '../../utils/apiClient';
import { Card, Modal, Field, EmptyState, btnPrimary, btnGhost, inputCls, errMsg } from '../ui';
import { call, useGet, Loading, Note } from '../early/earlyKit';
import { Badge, Table, Td, Reason, KINDS, download, when } from './kit';
import { RecordView, AuditView } from './RecordView';

// Ask for a signed exception. Used by the registrar and by advisors.
export function ExceptionForm({ student, onClose, onSaved, versions = [], terms = [], groups = [] }) {
  const [f, setF] = useState({ kind: 'overload', reason: '', termId: '', maxCredits: 24, courseCode: '', substituteCode: '', groupKey: groups[0]?.key || '', versionId: '' });
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    const b = { studentId: student._id, kind: f.kind, reason: f.reason };
    if (f.kind === 'overload') { b.termId = f.termId; b.maxCredits = Number(f.maxCredits); }
    if (['prereq_waiver', 'extra_attempt'].includes(f.kind)) b.courseCode = f.courseCode;
    if (f.kind === 'substitution') { b.courseCode = f.courseCode; b.substituteCode = f.substituteCode; }
    if (f.kind === 'requirement_waiver') b.groupKey = f.groupKey;
    if (f.kind === 'catalog_switch') b.versionId = f.versionId;
    try { await apiClient.post('/registrar/exceptions', b); onSaved(); } catch (x) { setErr(errMsg(x, 'Could not send the request.')); setBusy(false); }
  };
  return (
    <Modal title={`Ask for an exception for ${student.name}`} onClose={onClose}>
      <form onSubmit={submit} className="grid gap-3">
        <Field label="What is needed"><select className={inputCls} value={f.kind} onChange={set('kind')}>{Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        {f.kind === 'overload' && <div className="grid grid-cols-2 gap-3"><Field label="Term"><select className={inputCls} value={f.termId} onChange={set('termId')} required><option value="">Choose</option>{terms.map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}</select></Field><Field label="Credits allowed"><input className={inputCls} type="number" min="1" max="60" value={f.maxCredits} onChange={set('maxCredits')} /></Field></div>}
        {['prereq_waiver', 'extra_attempt', 'substitution'].includes(f.kind) && <Field label={f.kind === 'substitution' ? 'Course the programme requires' : 'Course code'}><input className={inputCls} value={f.courseCode} onChange={set('courseCode')} required placeholder="CS301" /></Field>}
        {f.kind === 'substitution' && <Field label="Course the student took instead"><input className={inputCls} value={f.substituteCode} onChange={set('substituteCode')} required placeholder="PHY101" /></Field>}
        {f.kind === 'requirement_waiver' && <Field label="Requirement group">{groups.length ? <select className={inputCls} value={f.groupKey} onChange={set('groupKey')}>{groups.map((g) => <option key={g.key} value={g.key}>{g.title}</option>)}</select> : <input className={inputCls} value={f.groupKey} onChange={set('groupKey')} required />}</Field>}
        {f.kind === 'catalog_switch' && <Field label="Move to catalogue year"><select className={inputCls} value={f.versionId} onChange={set('versionId')} required><option value="">Choose</option>{versions.map((v) => <option key={v._id} value={v._id}>{v.label}</option>)}</select></Field>}
        <Field label="Reason (a different administrator reads this before deciding)"><textarea className={inputCls} rows={3} value={f.reason} onChange={set('reason')} required minLength={10} /></Field>
        {err && <p role="alert" className="text-sm text-[#9f1239]">{err}</p>}
        <div className="flex justify-end gap-2"><button type="button" className={btnGhost} onClick={onClose}>Cancel</button><button className={btnPrimary} disabled={busy}>Send the request</button></div>
      </form>
    </Modal>
  );
}

function Register({ student, onClose, onDone }) {
  const g = useGet(`/registrar/students/${student._id}/catalog`); const [late, setLate] = useState(null);
  const enroll = async (s, lateReason) => { try { await apiClient.post(`/registrar/students/${student._id}/enroll`, { sectionId: s._id, ...(lateReason ? { lateReason } : {}) }); onDone(); g.reload(); setLate(null); } catch (e) { const m = e.response?.data?.message || ''; if (e.response?.status === 400 && /late|reason/i.test(m) && !lateReason) setLate(s); else if (e.response?.status === 409 && /deadline|add/i.test(m) && !lateReason) setLate(s); else call(() => Promise.reject(e)); } };
  return (
    <Modal title={`Register ${student.name}`} onClose={onClose} wide>
      <Loading g={g}>{g.data && (!g.data.term ? <Note>{g.data.message}</Note> : (
        <div className="space-y-2"><p className="text-sm text-[#5b6b7b]">{g.data.term.name} · {g.data.credits.registered} of {g.data.credits.limit} credits registered{g.data.term.addDropUntil ? ` · add and drop until ${when(g.data.term.addDropUntil)}` : ''}</p>{g.data.message && <Note>{g.data.message}</Note>}
          <ul className="grid max-h-[50vh] gap-2 overflow-y-auto">{g.data.sections.map((s) => (
            <li key={s._id} className="rounded-xl border border-[#e3e7e7] p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><span className="font-mono text-xs">{s.courseCode}</span> <span className="font-medium">{s.courseTitle}</span> <span className="text-xs text-[#5b6b7b]">section {s.section} · {s.credits} credits · {s.seatsLeft} seats left{s.schedule ? ` · ${s.schedule}` : ''}</span></div>
              {s.registered ? <Badge s="enrolled" /> : <button className={`${s.ok ? btnPrimary : btnGhost} !px-3 !py-1.5 !text-xs`} onClick={() => enroll(s)} aria-label={`Register for ${s.courseCode} section ${s.section}`}>Register</button>}</div>
              {!s.registered && s.reasons.length > 0 && <ul className="mt-1 list-disc ps-5 text-xs text-[#8a4636]">{s.reasons.map((r, i) => <li key={i}>{r.message}</li>)}</ul>}</li>
          ))}</ul></div>
      ))}</Loading>
      {late && <Reason title={`Add ${late.courseCode} late`} text="The add and drop deadline has passed. A reason is kept in the record." confirm="Register late" danger={false} onClose={() => setLate(null)} onDone={async (reason) => { await enroll(late, reason); }} />}
    </Modal>
  );
}

function Place({ student, onClose, onDone }) {
  const progs = useGet('/registrar/programs'); const tt = useGet('/registrar/teachers'); const [f, setF] = useState({ programId: '', versionId: '', advisorId: '', switch: !!student.program }); const [err, setErr] = useState('');
  const p = progs.data?.programs.find((x) => x._id === f.programId); const vs = (p?.versions || []).filter((v) => v.status === 'published');
  const submit = async (e) => { e.preventDefault(); setErr(''); try { await apiClient.post(`/registrar/students/${student._id}/program`, { programId: f.programId, ...(f.versionId ? { versionId: f.versionId } : {}), ...(f.advisorId ? { advisorId: f.advisorId } : {}), ...(f.switch ? { switch: true } : {}) }); onDone(); } catch (x) { setErr(errMsg(x, 'Could not place the student.')); } };
  return (
    <Modal title={student.program ? `Move ${student.name} to another programme` : `Place ${student.name} in a programme`} onClose={onClose}>
      <form onSubmit={submit} className="grid gap-3"><Loading g={progs}>
        <Field label="Programme"><select className={inputCls} value={f.programId} onChange={(e) => setF({ ...f, programId: e.target.value, versionId: '' })} required><option value="">Choose</option>{(progs.data?.programs || []).map((x) => <option key={x._id} value={x._id}>{x.name}</option>)}</select></Field>
        <Field label="Catalogue year" hint="The rules the student graduates under. Leave empty for the latest published year."><select className={inputCls} value={f.versionId} onChange={(e) => setF({ ...f, versionId: e.target.value })}><option value="">Latest published</option>{vs.map((v) => <option key={v._id} value={v._id}>{v.catalogYear}</option>)}</select></Field>
        <Field label="Advisor"><select className={inputCls} value={f.advisorId} onChange={(e) => setF({ ...f, advisorId: e.target.value })}><option value="">No advisor yet</option>{(tt.data?.teachers || []).map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}</select></Field>
        {err && <p role="alert" className="text-sm text-[#9f1239]">{err}</p>}<div className="flex justify-end gap-2"><button type="button" className={btnGhost} onClick={onClose}>Cancel</button><button className={btnPrimary}>{student.program ? 'Move the student' : 'Place the student'}</button></div></Loading></form>
    </Modal>
  );
}

// One student, as the registrar sees them.
function StudentPanel({ studentId, onClose, onChanged }) {
  const g = useGet(`/registrar/students/${studentId}/record`); const terms = useGet('/registrar/terms'); const progs = useGet('/registrar/programs'); const tt = useGet('/registrar/teachers');
  const [show, setShow] = useState(''); const [whatIf, setWhatIf] = useState(''); const [wi, setWi] = useState(null); const [drop, setDrop] = useState(null); const [msg, setMsg] = useState('');
  const d = g.data; const st = d ? { _id: studentId, name: d.student.name, program: d.program } : null; const done = () => { g.reload(); onChanged(); };
  const versions = (progs.data?.programs || []).flatMap((p) => p.versions.filter((v) => v.status === 'published').map((v) => ({ _id: v._id, label: `${p.code} ${v.catalogYear}` })));
  const running = d ? d.terms.flatMap((t) => t.courses.filter((c) => c.status === 'enrolled').map((c) => ({ ...c, termName: t.name, termStatus: t.status }))) : [];
  const issue = (kind) => call(() => apiClient.post(`/registrar/students/${studentId}/transcripts`, kind ? { kind } : {}), 'Transcript issued', done);
  return (
    <Modal title={d ? d.student.name : 'Student'} onClose={onClose} wide>
      <Loading g={g}>{d && (
        <div className="space-y-4">
          <p className="text-xs text-[#5b6b7b]">{d.student.admissionNumber ? `Admission no. ${d.student.admissionNumber}` : ''}</p>
          <div className="flex flex-wrap gap-2"><button className={btnPrimary} onClick={() => setShow('place')}>{d.program ? 'Change programme' : 'Place in a programme'}</button>
            {d.program?.status === 'active' && <><button className={btnGhost} onClick={() => setShow('register')}>Register for courses</button><button className={btnGhost} onClick={() => setShow('exception')}>Ask for an exception</button><button className={btnGhost} onClick={() => issue()}>Issue an official transcript</button></>}
            {d.program && <button className={btnGhost} onClick={() => download(`/registrar/transcripts/live/pdf?studentId=${studentId}`, 'record.pdf', setMsg)}>Print the live record</button>}</div>
          {msg && <Note tone="warn">{msg}</Note>}
          {running.length > 0 && <Card className="!p-3"><h4 className="mb-1 text-sm font-semibold text-[#1b2837]">Registered now</h4><ul className="grid gap-1 text-sm">{running.map((c) => <li key={c.enrollmentId} className="flex flex-wrap items-center justify-between gap-2"><span><span className="font-mono text-xs">{c.code}</span> {c.title} <span className="text-xs text-[#5b6b7b]">· {c.termName}</span></span><button className={`${btnGhost} !px-2 !py-1 !text-xs`} onClick={() => setDrop(c)} aria-label={`Drop or withdraw from ${c.code}`}>Drop or withdraw</button></li>)}</ul></Card>}
          <RecordView data={d} />
          {d.program?.status === 'active' && <Card className="!p-3"><h4 className="mb-2 text-sm font-semibold text-[#1b2837]">Check against another catalogue year</h4><div className="flex flex-wrap items-end gap-2"><div className="min-w-[180px]"><Field label="Catalogue year"><select className={inputCls} value={whatIf} onChange={(e) => setWhatIf(e.target.value)}><option value="">Choose</option>{versions.map((v) => <option key={v._id} value={v._id}>{v.label}</option>)}</select></Field></div><button className={btnGhost} disabled={!whatIf} onClick={async () => { try { const r = await apiClient.get(`/registrar/students/${studentId}/what-if`, { params: { versionId: whatIf } }); setWi(r.data); } catch (e) { setMsg(errMsg(e)); } }}>Check</button></div><p className="mt-1 text-xs text-[#5b6b7b]">Nothing changes. To move the student, use "Ask for an exception" and choose a catalogue switch.</p>{wi && <div className="mt-3"><h5 className="mb-2 text-sm font-semibold">If the student were on {wi.catalogYear}</h5><AuditView audit={wi.audit} /></div>}</Card>}
          {d.transcripts?.length > 0 && <Card className="!p-3"><h4 className="mb-2 text-sm font-semibold text-[#1b2837]">Transcripts</h4><Table label="Transcripts" head={['Number', 'Kind', 'Issued', 'Status', '']} min={480}>{d.transcripts.map((t) => <tr key={t._id}><Td className="font-mono text-xs">{t.serial}</Td><Td>{t.kind === 'final' ? 'Final' : 'Official'}</Td><Td>{when(t.createdAt)}</Td><Td><Badge s={t.status} /></Td><Td><button className={`${btnGhost} !px-2 !py-1 !text-xs`} onClick={() => download(`/registrar/transcripts/${t._id}/pdf`, `${t.serial}.pdf`, setMsg)} aria-label={`Download transcript ${t.serial}`}>PDF</button></Td></tr>)}</Table></Card>}
          {d.exceptions?.length > 0 && <Card className="!p-3"><h4 className="mb-2 text-sm font-semibold text-[#1b2837]">Exceptions on this student</h4><ul className="grid gap-1 text-sm">{d.exceptions.map((x) => <li key={x._id} className="flex flex-wrap items-center gap-2"><span>{KINDS[x.kind]}{x.courseCode ? ` · ${x.courseCode}` : ''}</span><Badge s={x.status} /><span className="text-xs text-[#5b6b7b]">{x.reason}</span></li>)}</ul></Card>}
        </div>
      )}</Loading>
      {show === 'place' && st && <Place student={st} onClose={() => setShow('')} onDone={() => { setShow(''); done(); }} />}
      {show === 'register' && st && <Register student={st} onClose={() => setShow('')} onDone={done} />}
      {show === 'exception' && st && <ExceptionForm student={st} versions={versions} terms={terms.data?.terms || []} groups={d?.audit?.groups || []} onClose={() => setShow('')} onSaved={() => { setShow(''); setMsg('Sent. A different administrator needs to approve it under Approvals.'); done(); }} />}
      {drop && <Reason title={`Drop or withdraw from ${drop.code}`} text="Inside the add and drop period the course simply disappears. After it, the course stays on the record as W and a reason is needed." confirm="Drop or withdraw" min={0} label="Reason (needed after the deadline)" onClose={() => setDrop(null)} onDone={async (reason) => { await apiClient.post(`/registrar/students/${studentId}/enrollments/${drop.enrollmentId}/drop`, reason ? { reason } : {}); setDrop(null); done(); }} />}
    </Modal>
  );
}

export function People() {
  const [q, setQ] = useState(''); const [placed, setPlaced] = useState(''); const [page, setPage] = useState(1); const [open, setOpen] = useState(null);
  const g = useGet('/registrar/people', { q: q || undefined, placed: placed || undefined, page, limit: 30 });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2"><div className="min-w-[200px] flex-1"><Field label="Search students"><input className={inputCls} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Name or admission number" /></Field></div><div className="w-48"><Field label="Show"><select className={inputCls} value={placed} onChange={(e) => { setPlaced(e.target.value); setPage(1); }}><option value="">Everyone</option><option value="yes">In a programme</option><option value="no">Not placed yet</option></select></Field></div></div>
      <Loading g={g}>{g.data && (g.data.people.length === 0 ? <Card><EmptyState title="No students found" text="Students come from your student list. Add them there, then place them in a programme here." /></Card> : (
        <>
          <Table label="Students" head={['Student', 'Programme', 'Catalogue', 'Advisor', 'Status', '']} min={680}>
            {g.data.people.map((s) => <tr key={s._id}><Td><span className="font-medium">{s.name}</span><div className="text-xs text-[#5b6b7b]">{s.admissionNumber}</div></Td><Td>{s.program?.name || <span className="text-[#8a4636]">Not placed</span>}</Td><Td>{s.program?.catalogYear || '—'}</Td><Td>{s.program?.advisorName || '—'}</Td><Td>{s.program ? <Badge s={s.program.status} /> : null}</Td><Td><button className={`${btnGhost} !px-2 !py-1 !text-xs`} onClick={() => setOpen(s._id)} aria-label={`Open ${s.name}`}>Open</button></Td></tr>)}
          </Table>
          {g.data.total > 30 && <div className="flex items-center justify-between text-sm"><button className={btnGhost} disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page} of {Math.ceil(g.data.total / 30)}</span><button className={btnGhost} disabled={page * 30 >= g.data.total} onClick={() => setPage(page + 1)}>Next</button></div>}
        </>
      ))}</Loading>
      {open && <StudentPanel studentId={open} onClose={() => setOpen(null)} onChanged={g.reload} />}
    </div>
  );
}

export function Graduation() {
  const progs = useGet('/registrar/programs'); const [pid, setPid] = useState(''); const g = useGet('/registrar/candidates', { programId: pid || undefined }); const [open, setOpen] = useState(null); const [sure, setSure] = useState(null);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2"><div className="w-64"><Field label="Programme"><select className={inputCls} value={pid} onChange={(e) => setPid(e.target.value)}><option value="">All programmes</option>{(progs.data?.programs || []).map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}</select></Field></div>{g.data && <p className="pb-2 text-sm text-[#5b6b7b]">{g.data.eligible} of {g.data.total} students meet every rule.</p>}</div>
      <Loading g={g}>{g.data && (g.data.students.length === 0 ? <Card><EmptyState title="No students in programmes" text="Place students in a programme first." /></Card> : (
        <Table label="Graduation candidates" head={['Student', 'Programme', 'Credits', 'Average', 'Ready', 'What is missing', '']} min={760}>
          {g.data.students.map((s) => <tr key={s.studentId}><Td className="font-medium">{s.name}</Td><Td>{s.program} <span className="text-xs text-[#5b6b7b]">{s.catalogYear}</span></Td><Td>{s.earned} / {s.needed}</Td><Td>{s.cgpa}</Td><Td>{s.eligible ? <Badge s="met" tone="good" /> : <Badge s="todo" />}</Td><Td className="max-w-[260px] text-xs text-[#5b6b7b]">{s.eligible ? (s.inProgress ? 'Has courses still running' : '') : s.blockers.join(' · ')}</Td>
            <Td><div className="flex gap-1"><button className={`${btnGhost} !px-2 !py-1 !text-xs`} onClick={() => setOpen(s.studentId)} aria-label={`Open ${s.name}`}>Open</button>{s.eligible && <button className={`${btnPrimary} !px-2 !py-1 !text-xs`} onClick={() => setSure(s)} aria-label={`Graduate ${s.name}`}>Graduate</button>}</div></Td></tr>)}
        </Table>
      ))}</Loading>
      {open && <StudentPanel studentId={open} onClose={() => setOpen(null)} onChanged={g.reload} />}
      {sure && <Modal title={`Graduate ${sure.name}`} onClose={() => setSure(null)}><div className="grid gap-3"><p className="text-sm text-[#3b4a5c]">This records graduation with a fingerprint of the audit, closes any open registrations and issues a final transcript. It cannot be undone.</p><div className="flex justify-end gap-2"><button className={btnGhost} onClick={() => setSure(null)}>Not now</button><button className={btnPrimary} onClick={() => call(() => apiClient.post(`/registrar/students/${sure.studentId}/graduate`, {}), 'Graduated. The final transcript is ready.', () => { setSure(null); g.reload(); })}>Graduate the student</button></div></div></Modal>}
    </div>
  );
}
