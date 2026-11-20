import React, { useState } from 'react';
import apiClient from '../../utils/apiClient';
import { Card, Modal, Field, EmptyState, btnPrimary, btnGhost, inputCls, errMsg } from '../ui';
import { call, useGet, Loading, Note } from '../early/earlyKit';
import { Badge, Table, Td, Reason, when } from './kit';

const NEXT = { planned: ['open', 'Open registration'], open: ['grading', 'Start grading'], grading: ['publish', 'Publish grades'], published: ['close', 'Close the term'] };

function SectionForm({ term, teachers, courses, section, onClose, onSaved }) {
  const [f, setF] = useState(section ? { teacherId: section.teacherId || '', capacity: section.capacity, schedule: section.schedule || '', room: section.room || '' } : { courseId: '', section: 'A', teacherId: '', capacity: 30, schedule: '', room: '' });
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => { e.preventDefault(); setBusy(true); setErr(''); try { const body = { ...f, capacity: Number(f.capacity), teacherId: f.teacherId || null }; if (section) await apiClient.patch(`/registrar/sections/${section._id}`, body); else await apiClient.post('/registrar/sections', { ...body, termId: term._id }); onSaved(); } catch (x) { setErr(errMsg(x, 'Could not save.')); setBusy(false); } };
  return (
    <Modal title={section ? `Edit ${section.courseCode} ${section.section}` : `Offer a course in ${term.name}`} onClose={onClose}>
      <form onSubmit={submit} className="grid gap-3">
        {!section && <><Field label="Course"><select className={inputCls} value={f.courseId} onChange={set('courseId')} required><option value="">Choose a course</option>{courses.map((c) => <option key={c._id} value={c._id}>{c.code} · {c.title}</option>)}</select></Field><Field label="Section"><input className={inputCls} value={f.section} onChange={set('section')} required maxLength={6} /></Field></>}
        <Field label="Instructor"><select className={inputCls} value={f.teacherId} onChange={set('teacherId')}><option value="">Not decided yet</option>{teachers.map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}</select></Field>
        <div className="grid grid-cols-2 gap-3"><Field label="Seats"><input className={inputCls} type="number" min="1" max="500" value={f.capacity} onChange={set('capacity')} required /></Field><Field label="Room"><input className={inputCls} value={f.room} onChange={set('room')} maxLength={30} /></Field></div>
        <Field label="Days and time" hint="For example MWF 09:00. Two courses at the same time cannot be taken together."><input className={inputCls} value={f.schedule} onChange={set('schedule')} maxLength={40} /></Field>
        {err && <p role="alert" className="text-sm text-[#9f1239]">{err}</p>}
        <div className="flex justify-end gap-2"><button type="button" className={btnGhost} onClick={onClose}>Cancel</button><button className={btnPrimary} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button></div>
      </form>
    </Modal>
  );
}

function TermSections({ term, teachers, courses }) {
  const g = useGet('/registrar/sections', { termId: term._id }); const [form, setForm] = useState(null); const [cancel, setCancel] = useState(null); const [reopen, setReopen] = useState(null);
  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-center justify-between"><h4 className="text-sm font-semibold text-[#1b2837]">Sections offered</h4>{term.status !== 'closed' && <button className={btnGhost} onClick={() => setForm({})}>Offer a course</button>}</div>
      <Loading g={g}>{g.data && (g.data.sections.length === 0 ? <p className="text-sm text-[#5b6b7b]">Nothing is offered in this term yet.</p> : (
        <Table label={`${term.name} sections`} head={['Course', 'Instructor', 'When', 'Seats', 'Grades', '']} min={640}>
          {g.data.sections.map((s) => (
            <tr key={s._id}><Td><span className="font-mono text-xs">{s.courseCode}</span> {s.courseTitle} <span className="text-xs text-[#5b6b7b]">· section {s.section}</span>{s.status === 'cancelled' && <> <Badge s="cancelled" /></>}</Td><Td>{s.teacherName || <span className="text-[#8a4636]">Not decided</span>}</Td><Td className="text-xs">{s.schedule || '—'}{s.room ? ` · ${s.room}` : ''}</Td><Td>{s.enrolled} / {s.capacity}</Td><Td className="text-xs">{s.gradesSubmittedAt ? `Submitted ${when(s.gradesSubmittedAt)}` : s.enrolled ? 'Not submitted' : '—'}</Td>
              <Td>{s.status !== 'cancelled' && <div className="flex flex-wrap gap-1"><button className={`${btnGhost} !px-2 !py-1 !text-xs`} onClick={() => setForm(s)} aria-label={`Edit ${s.courseCode} section ${s.section}`}>Edit</button>{s.gradesSubmittedAt && ['open', 'grading'].includes(term.status) && <button className={`${btnGhost} !px-2 !py-1 !text-xs`} onClick={() => setReopen(s)} aria-label={`Reopen grades for ${s.courseCode}`}>Reopen grades</button>}{term.status !== 'closed' && <button className={`${btnGhost} !px-2 !py-1 !text-xs`} onClick={() => setCancel(s)} aria-label={`Cancel ${s.courseCode} section ${s.section}`}>Cancel</button>}</div>}</Td></tr>
          ))}
        </Table>
      ))}</Loading>
      {form && <SectionForm term={term} teachers={teachers} courses={courses} section={form._id ? form : null} onClose={() => setForm(null)} onSaved={() => { setForm(null); g.reload(); }} />}
      {cancel && <Reason title={`Cancel ${cancel.courseCode} section ${cancel.section}`} text="Students registered in it are dropped and told." confirm="Cancel the section" onClose={() => setCancel(null)} onDone={async (reason) => { await apiClient.post(`/registrar/sections/${cancel._id}/cancel`, { reason }); setCancel(null); g.reload(); }} />}
      {reopen && <Reason title={`Reopen grades for ${reopen.courseCode}`} text="The instructor can change grades again and must submit them again." confirm="Reopen" danger={false} onClose={() => setReopen(null)} onDone={async (reason) => { await apiClient.post(`/registrar/sections/${reopen._id}/reopen`, { reason }); setReopen(null); g.reload(); }} />}
    </div>
  );
}

export function Terms() {
  const g = useGet('/registrar/terms'); const tt = useGet('/registrar/teachers'); const cs = useGet('/registrar/courses', { status: 'active', limit: 200 });
  const [open, setOpen] = useState(null); const [form, setForm] = useState(false); const [f, setF] = useState({ code: '', name: '', startDate: '', endDate: '', addDropUntil: '' }); const [err, setErr] = useState(''); const [block, setBlock] = useState(null); const [force, setForce] = useState(null); const [parallel, setParallel] = useState(null);
  const step = async (t, s) => {
    try { await apiClient.post(`/registrar/terms/${t._id}/${s}`, {}); g.reload(); setBlock(null); } catch (e) {
      const d = e.response?.data;
      if (s === 'publish' && d?.blockers) setBlock({ term: t, blockers: d.blockers }); else if (s === 'open' && e.response?.status === 409 && /another term/i.test(d?.message || '')) setParallel(t); else call(() => Promise.reject(e));
    }
  };
  return (
    <div className="space-y-3">
      <div className="flex justify-between gap-2"><p className="text-sm text-[#5b6b7b]">A term moves through planned, open for registration, grading, published, closed. Students see grades only after the term is published.</p><button className={btnPrimary} onClick={() => { setErr(''); setForm(true); }}>New term</button></div>
      <Loading g={g}>{g.data && (g.data.terms.length === 0 ? <Card><EmptyState title="No terms yet" text="Create the first term, then offer courses in it." /></Card> : g.data.terms.map((t) => (
        <Card key={t._id}>
          <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-semibold text-[#1b2837]">{t.name} <span className="font-mono text-xs text-[#5b6b7b]">{t.code}</span></h3><p className="text-xs text-[#5b6b7b]">{when(t.startDate)} to {when(t.endDate)}{t.addDropUntil ? ` · add and drop until ${when(t.addDropUntil)}` : ''} · {t.sections} sections · {t.enrolments} registrations{t.publishedAt ? ` · published ${when(t.publishedAt)}` : ''}</p></div>
            <div className="flex items-center gap-2"><Badge s={t.status === 'published' ? 'published' : t.status} />{NEXT[t.status] && <button className={btnPrimary} onClick={() => step(t, NEXT[t.status][0])}>{NEXT[t.status][1]}</button>}<button className={btnGhost} aria-expanded={open === t._id} onClick={() => setOpen(open === t._id ? null : t._id)}>{open === t._id ? 'Hide sections' : 'Sections'}</button></div></div>
          {open === t._id && <TermSections term={t} teachers={tt.data?.teachers || []} courses={cs.data?.courses || []} />}
        </Card>
      )))}</Loading>
      {form && <Modal title="New term" onClose={() => setForm(false)}><form className="grid gap-3" onSubmit={async (e) => { e.preventDefault(); try { await apiClient.post('/registrar/terms', f); setForm(false); setF({ code: '', name: '', startDate: '', endDate: '', addDropUntil: '' }); g.reload(); } catch (x) { setErr(errMsg(x)); } }}>
        <div className="grid grid-cols-2 gap-3"><Field label="Code"><input className={inputCls} value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} required placeholder="F26" /></Field><Field label="Name"><input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required placeholder="Fall 2026" /></Field></div>
        <div className="grid grid-cols-2 gap-3"><Field label="Starts"><input type="date" className={inputCls} value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} required /></Field><Field label="Ends"><input type="date" className={inputCls} value={f.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} required /></Field></div>
        <Field label="Add and drop until" hint="After this day a student can only withdraw, and the course shows as W."><input type="date" className={inputCls} value={f.addDropUntil} onChange={(e) => setF({ ...f, addDropUntil: e.target.value })} /></Field>
        {err && <p role="alert" className="text-sm text-[#9f1239]">{err}</p>}<div className="flex justify-end gap-2"><button type="button" className={btnGhost} onClick={() => setForm(false)}>Cancel</button><button className={btnPrimary}>Create term</button></div></form></Modal>}
      {block && <Modal title={`${block.term.name} is not ready to publish`} onClose={() => setBlock(null)} wide>
        <div className="grid gap-3"><p className="text-sm text-[#3b4a5c]">These sections still have grades missing:</p><ul className="grid gap-1 text-sm">{block.blockers.map((b, i) => <li key={i}><span className="font-semibold">{b.section}</span> — {b.submitted ? `${b.ungraded} student(s) without a grade` : 'grades not submitted yet'}{b.teacher ? ` (${b.teacher})` : ''}</li>)}</ul>
          <Note>You can wait for the instructors, or publish now and mark the missing grades Incomplete (I). The reason is kept.</Note>
          <div className="flex justify-end gap-2"><button className={btnGhost} onClick={() => setBlock(null)}>Wait</button><button className={btnPrimary} onClick={() => { setForce(block.term); setBlock(null); }}>Publish with Incomplete…</button></div></div></Modal>}
      {force && <Reason title={`Publish ${force.name} anyway`} text="Missing grades become Incomplete (I). They can be replaced later through a signed grade change." confirm="Publish with Incomplete" onClose={() => setForce(null)} onDone={async (reason) => { await apiClient.post(`/registrar/terms/${force._id}/publish`, { markIncomplete: true, reason }); setForce(null); g.reload(); }} />}
      {parallel && <Reason title={`Open ${parallel.name} next to another term`} text="Another term is already open. Do this only when two terms really run together, such as a summer term." confirm="Open anyway" danger={false} onClose={() => setParallel(null)} onDone={async (reason) => { await apiClient.post(`/registrar/terms/${parallel._id}/open`, { allowParallel: true, reason }); setParallel(null); g.reload(); }} />}
    </div>
  );
}
