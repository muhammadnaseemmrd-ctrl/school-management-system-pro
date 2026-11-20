import React, { useState } from 'react';
import apiClient from '../../utils/apiClient';
import { Card, Modal, Field, EmptyState, btnPrimary, btnGhost, inputCls, errMsg } from '../ui';
import { call, useGet, Loading, Note, Tabs } from '../early/earlyKit';
import { Badge, Table, Td, when } from './kit';
import { StudentRecord } from './RecordView';
import { GradeChanges, Appeals, Exceptions } from './Approvals';
import { ExceptionForm } from './People';

function ChangeForm({ row, grades, onClose, onDone }) {
  const [to, setTo] = useState(''); const [why, setWhy] = useState(''); const [err, setErr] = useState('');
  const go = async (e) => { e.preventDefault(); setErr(''); try { await apiClient.post('/registrar/grade-changes', { enrollmentId: row.enrollmentId, toGrade: to, reason: why }); onDone(); } catch (x) { setErr(errMsg(x, 'Could not send the request.')); } };
  return (
    <Modal title={`Change ${row.name}'s published grade`} onClose={onClose}>
      <form onSubmit={go} className="grid gap-3"><p className="text-sm text-[#5b6b7b]">The grade is {row.grade}. A published grade changes only through a request the registrar signs.</p>
        <Field label="New grade"><select className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} required><option value="">Choose</option>{grades.filter((g) => g !== row.grade).map((g) => <option key={g}>{g}</option>)}</select></Field>
        <Field label="Why the grade should change"><textarea className={inputCls} rows={3} value={why} onChange={(e) => setWhy(e.target.value)} required minLength={10} /></Field>
        {err && <p role="alert" className="text-sm text-[#9f1239]">{err}</p>}<div className="flex justify-end gap-2"><button type="button" className={btnGhost} onClick={onClose}>Cancel</button><button className={btnPrimary}>Send the request</button></div></form>
    </Modal>
  );
}

function Gradebook({ sectionId, onClose, onChanged }) {
  const g = useGet(`/registrar/sections/${sectionId}/roster`); const [edits, setEdits] = useState({}); const [change, setChange] = useState(null); const [msg, setMsg] = useState(null);
  const d = g.data; const val = (s) => (edits[s.enrollmentId] !== undefined ? edits[s.enrollmentId] : s.grade);
  const save = async () => {
    const grades = Object.entries(edits).map(([enrollmentId, grade]) => ({ enrollmentId, grade })); if (!grades.length) return setMsg({ tone: 'info', text: 'Nothing changed.' });
    try { const r = await apiClient.put(`/registrar/sections/${sectionId}/grades`, { grades }); setEdits({}); setMsg(r.data.skipped.length ? { tone: 'warn', text: `Saved ${r.data.saved}. Skipped ${r.data.skipped.length}: ${r.data.skipped.map((s) => s.why).join(' ')}` } : { tone: 'ok', text: `Saved ${r.data.saved} grade(s).` }); g.reload(); } catch (e) { setMsg({ tone: 'warn', text: errMsg(e, 'Could not save.') }); }
  };
  const submit = async () => {
    if (Object.keys(edits).length) await save();
    try { await apiClient.post(`/registrar/sections/${sectionId}/submit`, {}); setMsg({ tone: 'ok', text: 'Grades submitted. They stay hidden from students until the registrar publishes the term.' }); g.reload(); onChanged(); } catch (e) { const m = e.response?.data?.missing; setMsg({ tone: 'warn', text: m ? `Still ungraded: ${m.map((x) => x.name || x).join(', ')}` : errMsg(e, 'Could not submit.') }); }
  };
  return (
    <Modal title={d ? `${d.section.courseCode} · section ${d.section.section}` : 'Class list'} onClose={onClose} wide>
      <Loading g={g}>{d && (
        <div className="space-y-3">
          <p className="text-sm text-[#5b6b7b]">{d.term?.name} · {d.students.length} student(s){d.section.gradesSubmittedAt ? ` · submitted ${when(d.section.gradesSubmittedAt)}` : ''}</p>
          {msg && <Note tone={msg.tone === 'warn' ? 'warn' : msg.tone === 'ok' ? 'ok' : 'info'}>{msg.text}</Note>}
          <Table label="Class list and grades" head={['Student', 'Status', 'Grade', '']} min={480}>
            {d.students.map((s) => (
              <tr key={s.enrollmentId}><Td><span className="font-medium">{s.name}</span><div className="text-xs text-[#5b6b7b]">{s.admissionNumber}{s.attemptNo > 1 ? ` · attempt ${s.attemptNo}` : ''}</div></Td><Td>{s.status === 'withdrawn' ? <Badge s="withdrawn" /> : s.gradeState === 'final' ? <Badge s="published" /> : s.gradeState === 'submitted' ? <span className="text-xs text-[#215a52]">Submitted</span> : s.gradeState === 'draft' ? <span className="text-xs text-[#5b6b7b]">Draft</span> : <span className="text-xs text-[#8a4636]">Not graded</span>}</Td>
                <Td>{d.canEdit && s.status === 'enrolled' ? <select aria-label={`Grade for ${s.name}`} className={`${inputCls} !w-24`} value={val(s)} onChange={(e) => setEdits({ ...edits, [s.enrollmentId]: e.target.value })}><option value="">—</option>{d.grades.map((x) => <option key={x}>{x}</option>)}</select> : <span className="font-semibold">{s.grade || '—'}</span>}</Td>
                <Td>{s.gradeState === 'final' && s.status === 'completed' && <button className={`${btnGhost} !px-2 !py-1 !text-xs`} onClick={() => setChange(s)} aria-label={`Ask to change the grade for ${s.name}`}>Ask to change</button>}</Td></tr>
            ))}
          </Table>
          {d.canEdit ? <div className="flex flex-wrap justify-end gap-2"><button className={btnGhost} onClick={save}>Save draft</button><button className={btnPrimary} onClick={submit}>Submit grades</button></div> : <Note>{d.section.gradesSubmittedAt ? 'These grades were submitted. The registrar can reopen them if something needs fixing.' : 'Grades can be entered while the term is open or in grading.'}</Note>}
        </div>
      )}</Loading>
      {change && d && <ChangeForm row={change} grades={d.grades.filter((x) => x !== 'I')} onClose={() => setChange(null)} onDone={() => { setChange(null); setMsg({ tone: 'ok', text: 'Request sent to the registrar.' }); }} />}
    </Modal>
  );
}

function Sections() {
  const g = useGet('/registrar/my/sections'); const [open, setOpen] = useState(null);
  return (
    <>
    <Loading g={g}>{g.data && (g.data.sections.length === 0 ? <Card><EmptyState title="No sections assigned" text="When the registrar assigns you to a course section, it appears here with its class list." /></Card> : (
      <Table label="My sections" head={['Course', 'Term', 'Students', 'When', 'Grades', '']} min={640}>
        {g.data.sections.map((s) => <tr key={s._id}><Td><span className="font-mono text-xs">{s.courseCode}</span> {s.courseTitle} <span className="text-xs text-[#5b6b7b]">· section {s.section}</span></Td><Td>{s.termName}</Td><Td>{s.enrolled}</Td><Td className="text-xs">{s.schedule || '—'}</Td><Td className="text-xs">{s.gradesSubmittedAt ? `Submitted ${when(s.gradesSubmittedAt)}` : ['open', 'grading'].includes(s.termStatus) ? 'To enter' : '—'}</Td><Td><button className={`${btnGhost} !px-2 !py-1 !text-xs`} onClick={() => setOpen(s._id)} aria-label={`Open the class list for ${s.courseCode} section ${s.section}`}>Class list</button></Td></tr>)}
      </Table>
    ))}</Loading>
    {open && <Gradebook sectionId={open} onClose={() => setOpen(null)} onChanged={g.reload} />}
    </>
  );
}

function Advisees() {
  const g = useGet('/registrar/my/advisees'); const terms = useGet('/registrar/terms'); const [open, setOpen] = useState(null); const [ask, setAsk] = useState(null); const [msg, setMsg] = useState('');
  return (
    <div className="space-y-3">
      {msg && <Note tone="ok">{msg}</Note>}
      <Loading g={g}>{g.data && (g.data.advisees.length === 0 ? <Card><EmptyState title="No advisees" text="Students the registrar assigns to you appear here with their record and degree audit." /></Card> : (
        <Table label="My advisees" head={['Student', 'Programme', 'Catalogue', 'Status', '']} min={560}>
          {g.data.advisees.map((a) => <tr key={a.studentId}><Td className="font-medium">{a.name}</Td><Td>{a.program}</Td><Td>{a.catalogYear}</Td><Td><Badge s={a.status} /></Td><Td><div className="flex gap-1"><button className={`${btnGhost} !px-2 !py-1 !text-xs`} onClick={() => setOpen(a)} aria-label={`Open the record of ${a.name}`}>Record</button>{a.status === 'active' && <button className={`${btnGhost} !px-2 !py-1 !text-xs`} onClick={() => setAsk(a)} aria-label={`Ask for an exception for ${a.name}`}>Ask for an exception</button>}</div></Td></tr>)}
        </Table>
      ))}</Loading>
      {open && <Modal title={open.name} onClose={() => setOpen(null)} wide><StudentRecord studentId={open.studentId} /></Modal>}
      {ask && <ExceptionForm student={{ _id: ask.studentId, name: ask.name }} terms={terms.data?.terms || []} versions={[]} onClose={() => setAsk(null)} onSaved={() => { setAsk(null); setMsg('Sent. A registrar administrator decides on it.'); }} />}
    </div>
  );
}

export default function RegistrarTeacher() {
  const [tab, setTab] = useState('sections');
  return (
    <div className="space-y-4">
      <div><h2 className="text-xl font-bold text-[#1b2837]">Courses and advising</h2><p className="text-sm text-[#5b6b7b]">Enter grades for the sections you teach, and look after the students you advise.</p></div>
      <Tabs label="Registrar sections" value={tab} onChange={setTab} items={[['sections', 'My sections'], ['advisees', 'My advisees'], ['changes', 'Grade changes'], ['appeals', 'Appeals'], ['exceptions', 'Exceptions']]} />
      {tab === 'sections' && <Sections />}{tab === 'advisees' && <Advisees />}{tab === 'changes' && <GradeChanges />}{tab === 'appeals' && <Appeals />}{tab === 'exceptions' && <Exceptions />}
    </div>
  );
}
