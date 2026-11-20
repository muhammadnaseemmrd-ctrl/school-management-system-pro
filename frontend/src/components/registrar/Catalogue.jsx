import React, { useState } from 'react';
import apiClient from '../../utils/apiClient';
import { Card, Modal, Field, EmptyState, btnPrimary, btnGhost, btnDanger, inputCls, errMsg } from '../ui';
import { call, useGet, Loading, Note } from '../early/earlyKit';
import { Badge, Table, Td, Reason, when } from './kit';

// ---------- courses ----------
function CourseForm({ course, onClose, onSaved, scale }) {
  const [f, setF] = useState(course ? { code: course.code, title: course.title, credits: course.credits, department: course.department || '', description: course.description || '', pre: course.prerequisites.map((p) => `${p.code}:${p.minGrade}`).join(', '), co: course.corequisites.map((p) => p.code).join(', ') } : { code: '', title: '', credits: 3, department: '', description: '', pre: '', co: '' });
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    const prerequisites = f.pre.split(',').map((s) => s.trim()).filter(Boolean).map((s) => { const [code, minGrade] = s.split(':'); return { code: code.trim(), minGrade: (minGrade || 'D').trim() }; });
    const corequisites = f.co.split(',').map((s) => s.trim()).filter(Boolean).map((code) => ({ code }));
    const body = { title: f.title, credits: Number(f.credits), department: f.department, description: f.description, prerequisites, corequisites };
    try { if (course) await apiClient.patch(`/registrar/courses/${course._id}`, body); else await apiClient.post('/registrar/courses', { ...body, code: f.code }); onSaved(); } catch (x) { setErr(errMsg(x, 'Could not save the course.')); setBusy(false); }
  };
  return (
    <Modal title={course ? `Edit ${course.code}` : 'New course'} onClose={onClose} wide>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <Field label="Code (for example CS101)"><input className={inputCls} value={f.code} onChange={set('code')} disabled={!!course} required minLength={2} maxLength={20} /></Field>
        <Field label="Title"><input className={inputCls} value={f.title} onChange={set('title')} required maxLength={120} /></Field>
        <Field label="Credits"><input className={inputCls} type="number" min="0" max="30" step="0.5" value={f.credits} onChange={set('credits')} required /></Field>
        <Field label="Department"><input className={inputCls} value={f.department} onChange={set('department')} maxLength={60} /></Field>
        <div className="sm:col-span-2"><Field label="Prerequisites" hint={`Course code and the lowest grade that counts, for example CS101:C, MTH101:D. Grades: ${scale.map((g) => g.grade).join(' ')}`}><input className={inputCls} value={f.pre} onChange={set('pre')} placeholder="CS101:C" /></Field></div>
        <div className="sm:col-span-2"><Field label="Corequisites (taken in the same term or before)"><input className={inputCls} value={f.co} onChange={set('co')} placeholder="CS101L" /></Field></div>
        <div className="sm:col-span-2"><Field label="Description"><textarea className={inputCls} rows={2} value={f.description} onChange={set('description')} maxLength={600} /></Field></div>
        {err && <p role="alert" className="text-sm text-[#9f1239] sm:col-span-2">{err}</p>}
        <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" className={btnGhost} onClick={onClose}>Cancel</button><button className={btnPrimary} disabled={busy}>{busy ? 'Saving…' : 'Save course'}</button></div>
      </form>
    </Modal>
  );
}

export function Courses({ scale }) {
  const [q, setQ] = useState(''); const [form, setForm] = useState(null); const [retire, setRetire] = useState(null); const g = useGet('/registrar/courses', { q: q || undefined, limit: 200 });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2"><div className="min-w-[200px] flex-1"><Field label="Search courses"><input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Code, title or department" /></Field></div><button className={btnPrimary} onClick={() => setForm({})}>New course</button></div>
      <Loading g={g}>{g.data && (g.data.courses.length === 0 ? <Card><EmptyState title="No courses yet" text="Add the courses your school offers. Programme rules, prerequisites and registration all use this list." action={<button className={btnPrimary} onClick={() => setForm({})}>Add the first course</button>} /></Card> : (
        <Table label="Courses" head={['Course', 'Credits', 'Needs first', 'Status', 'Changed', '']} min={640}>
          {g.data.courses.map((c) => (
            <tr key={c._id}><Td><span className="font-mono text-xs">{c.code}</span> <span className="font-medium">{c.title}</span><div className="text-xs text-[#5b6b7b]">{c.department}</div></Td><Td>{c.credits}</Td>
              <Td className="text-xs">{c.prerequisites.length ? c.prerequisites.map((p) => `${p.code} (${p.minGrade})`).join(', ') : 'Nothing'}{c.corequisites.length ? <div>With: {c.corequisites.map((p) => p.code).join(', ')}</div> : null}</Td>
              <Td><Badge s={c.status} /></Td><Td className="text-xs text-[#5b6b7b]">{c.history.length ? `${c.history[c.history.length - 1].byName || ''} ${when(c.history[c.history.length - 1].at)}` : ''}<div>Revision {c.revision}</div></Td>
              <Td><div className="flex gap-1"><button className={`${btnGhost} !px-2 !py-1 !text-xs`} aria-label={`Edit ${c.code}`} onClick={() => setForm(c)}>Edit</button>{c.status === 'active' ? <button className={`${btnGhost} !px-2 !py-1 !text-xs`} aria-label={`Retire ${c.code}`} onClick={() => setRetire(c)}>Retire</button> : <button className={`${btnGhost} !px-2 !py-1 !text-xs`} aria-label={`Bring back ${c.code}`} onClick={() => call(() => apiClient.post(`/registrar/courses/${c._id}/status`, { status: 'active' }), 'Course is active again', g.reload)}>Reactivate</button>}</div></Td></tr>
          ))}
        </Table>
      ))}</Loading>
      {form && <CourseForm course={form._id ? form : null} scale={scale} onClose={() => setForm(null)} onSaved={() => { setForm(null); g.reload(); }} />}
      {retire && <Reason title={`Retire ${retire.code}`} text="A retired course cannot be offered in new terms. It stays on records that already have it." confirm="Retire the course" min={0} label="Reason (optional)" onClose={() => setRetire(null)} onDone={async () => { await apiClient.post(`/registrar/courses/${retire._id}/status`, { status: 'retired' }); setRetire(null); g.reload(); }} />}
    </div>
  );
}

// ---------- programmes and their rules ----------
const blank = () => ({ title: '', rule: 'all', courses: '', prefixes: '', minCredits: 3, minCount: 1 });
function RulesEditor({ version, onClose, onSaved }) {
  const [f, setF] = useState({ totalCredits: version.totalCredits, minCgpa: version.minCgpa, note: version.note || '' });
  const [groups, setGroups] = useState(version.requirements.length ? version.requirements.map((r) => ({ title: r.title, rule: r.rule, courses: (r.courses || []).join(', '), prefixes: (r.prefixes || []).join(', '), minCredits: r.minCredits || 3, minCount: r.minCount || 1 })) : [blank()]);
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [problems, setProblems] = useState(null);
  const up = (i, k, v) => setGroups(groups.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const list = (s) => s.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean);
  const save = async (andCheck) => {
    setBusy(true); setErr('');
    try {
      await apiClient.patch(`/registrar/versions/${version._id}`, { totalCredits: Number(f.totalCredits), minCgpa: Number(f.minCgpa), note: f.note, requirements: groups.filter((g) => g.title.trim()).map((g) => ({ title: g.title, rule: g.rule, courses: list(g.courses), prefixes: list(g.prefixes), minCredits: Number(g.minCredits), minCount: Number(g.minCount) })) });
      if (andCheck) { const r = await apiClient.get(`/registrar/versions/${version._id}/checks`); setProblems(r.data.problems); setBusy(false); if (!r.data.problems.length) onSaved(); } else onSaved();
    } catch (x) { setErr(errMsg(x, 'Could not save these rules.')); setBusy(false); }
  };
  return (
    <Modal title={`Rules for catalogue ${version.catalogYear}`} onClose={onClose} wide>
      <div className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-3"><Field label="Credits to graduate"><input className={inputCls} type="number" min="1" value={f.totalCredits} onChange={(e) => setF({ ...f, totalCredits: e.target.value })} /></Field><Field label="Lowest average (CGPA)"><input className={inputCls} type="number" step="0.01" min="0" value={f.minCgpa} onChange={(e) => setF({ ...f, minCgpa: e.target.value })} /></Field><Field label="Note"><input className={inputCls} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} maxLength={300} /></Field></div>
        {groups.map((g, i) => (
          <fieldset key={i} className="grid gap-2 rounded-xl border border-[#e3e7e7] p-3 sm:grid-cols-2"><legend className="px-1 text-xs font-semibold text-[#3b4a5c]">Requirement group {i + 1}</legend>
            <Field label="Group title"><input className={inputCls} value={g.title} onChange={(e) => up(i, 'title', e.target.value)} placeholder="Core courses" /></Field>
            <Field label="Rule"><select className={inputCls} value={g.rule} onChange={(e) => up(i, 'rule', e.target.value)}><option value="all">All of these courses</option><option value="credits">A number of credits from these</option><option value="count">A number of courses from these</option></select></Field>
            <Field label="Courses (codes)"><input className={inputCls} value={g.courses} onChange={(e) => up(i, 'courses', e.target.value)} placeholder="MTH101, CS101" /></Field>
            <Field label="Or any course starting with" hint="For example ENG, ART"><input className={inputCls} value={g.prefixes} onChange={(e) => up(i, 'prefixes', e.target.value)} /></Field>
            {g.rule === 'credits' && <Field label="Credits needed"><input className={inputCls} type="number" min="1" value={g.minCredits} onChange={(e) => up(i, 'minCredits', e.target.value)} /></Field>}
            {g.rule === 'count' && <Field label="Courses needed"><input className={inputCls} type="number" min="1" value={g.minCount} onChange={(e) => up(i, 'minCount', e.target.value)} /></Field>}
            <div className="sm:col-span-2"><button type="button" className={`${btnGhost} !px-2 !py-1 !text-xs`} onClick={() => setGroups(groups.filter((_, j) => j !== i))} aria-label={`Remove group ${i + 1}`}>Remove this group</button></div>
          </fieldset>
        ))}
        <button type="button" className={`${btnGhost} justify-self-start`} onClick={() => setGroups([...groups, blank()])}>Add a requirement group</button>
        {problems?.length > 0 && <Note tone="warn">Fix these first: {problems.join(' · ')}</Note>}
        {err && <p role="alert" className="text-sm text-[#9f1239]">{err}</p>}
        <div className="flex justify-end gap-2"><button className={btnGhost} onClick={onClose}>Close</button><button className={btnGhost} disabled={busy} onClick={() => save(false)}>Save draft</button><button className={btnPrimary} disabled={busy} onClick={() => save(true)}>Save and check</button></div>
      </div>
    </Modal>
  );
}

export function Programmes({ soleAdmin }) {
  const g = useGet('/registrar/programs'); const [newP, setNewP] = useState(false); const [newV, setNewV] = useState(null); const [edit, setEdit] = useState(null); const [no, setNo] = useState(null); const [retire, setRetire] = useState(null);
  const [pf, setPf] = useState({ code: '', name: '', level: 'bachelor' }); const [vf, setVf] = useState({ catalogYear: '', copyFrom: '', totalCredits: 120, minCgpa: 2 }); const [err, setErr] = useState('');
  const act = (path, ok, body) => call(() => apiClient.post(path, body || {}), ok, g.reload);
  return (
    <div className="space-y-3">
      <div className="flex justify-between gap-2"><p className="text-sm text-[#5b6b7b]">Each programme has rules for each catalogue year. A published year never changes, so a student keeps the rules they started under.</p><button className={btnPrimary} onClick={() => { setErr(''); setNewP(true); }}>New programme</button></div>
      <Loading g={g}>{g.data && (g.data.programs.length === 0 ? <Card><EmptyState title="No programmes yet" text="Create a programme, then add the rules for its first catalogue year." /></Card> : g.data.programs.map((p) => (
        <Card key={p._id}>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-semibold text-[#1b2837]">{p.name} <span className="font-mono text-xs text-[#5b6b7b]">{p.code}</span></h3><p className="text-xs text-[#5b6b7b]">{p.students} student(s) · {p.level}</p></div><button className={btnGhost} onClick={() => { setErr(''); setVf({ catalogYear: '', copyFrom: p.versions[0]?._id || '', totalCredits: 120, minCgpa: 2 }); setNewV(p); }}>New catalogue year</button></div>
          {p.versions.length === 0 ? <p className="text-sm text-[#5b6b7b]">No catalogue year yet.</p> : (
            <Table label={`${p.name} catalogue years`} head={['Year', 'Status', 'Credits', 'Groups', 'Students', 'Approval', '']} min={720}>
              {p.versions.map((v) => (
                <tr key={v._id}><Td className="font-semibold">{v.catalogYear}</Td><Td><Badge s={v.status} /></Td><Td>{v.totalCredits} · min {v.minCgpa}</Td><Td>{v.requirements.length}</Td><Td>{v.students}</Td>
                  <Td className="text-xs text-[#5b6b7b]">{v.approval ? `${v.approval.byName}, ${when(v.approval.at)}${v.approval.sole ? ' (sole administrator)' : ''}` : v.status === 'review' ? `Sent by ${v.submittedByName}` : v.note || ''}{v.contentHash ? <div className="font-mono" title="Fingerprint of the rules">{v.contentHash.slice(0, 10)}</div> : null}</Td>
                  <Td><div className="flex flex-wrap gap-1">
                    {v.status === 'draft' && <><button className={`${btnGhost} !px-2 !py-1 !text-xs`} onClick={() => setEdit(v)} aria-label={`Edit rules for ${p.code} ${v.catalogYear}`}>Edit rules</button><button className={`${btnGhost} !px-2 !py-1 !text-xs`} onClick={() => act(`/registrar/versions/${v._id}/submit`, 'Sent for approval')} aria-label={`Send ${p.code} ${v.catalogYear} for approval`}>Send for approval</button></>}
                    {v.status === 'review' && <><button className={`${btnPrimary} !px-2 !py-1 !text-xs`} onClick={() => act(`/registrar/versions/${v._id}/decide`, 'Published', { approve: true })} aria-label={`Approve ${p.code} ${v.catalogYear}`}>Approve</button><button className={`${btnGhost} !px-2 !py-1 !text-xs`} onClick={() => setNo(v)} aria-label={`Send ${p.code} ${v.catalogYear} back`}>Send back</button></>}
                    {v.status !== 'retired' && <button className={`${btnGhost} !px-2 !py-1 !text-xs`} onClick={() => setRetire(v)} aria-label={`${v.status === 'published' ? 'Retire' : 'Delete'} ${p.code} ${v.catalogYear}`}>{v.status === 'published' ? 'Retire' : 'Delete'}</button>}
                  </div></Td></tr>
              ))}
            </Table>
          )}
        </Card>
      )))}</Loading>
      {soleAdmin && <Note>Your school has one administrator, so you can approve rules you wrote yourself. The record says so. Adding a second administrator makes approvals a two-person step.</Note>}
      {newP && <Modal title="New programme" onClose={() => setNewP(false)}><form className="grid gap-3" onSubmit={async (e) => { e.preventDefault(); try { await apiClient.post('/registrar/programs', pf); setNewP(false); setPf({ code: '', name: '', level: 'bachelor' }); g.reload(); } catch (x) { setErr(errMsg(x)); } }}><Field label="Code"><input className={inputCls} value={pf.code} onChange={(e) => setPf({ ...pf, code: e.target.value })} required minLength={2} placeholder="BSCS" /></Field><Field label="Name"><input className={inputCls} value={pf.name} onChange={(e) => setPf({ ...pf, name: e.target.value })} required minLength={2} /></Field><Field label="Level"><select className={inputCls} value={pf.level} onChange={(e) => setPf({ ...pf, level: e.target.value })}>{['certificate', 'diploma', 'bachelor', 'master', 'doctorate', 'other'].map((l) => <option key={l}>{l}</option>)}</select></Field>{err && <p role="alert" className="text-sm text-[#9f1239]">{err}</p>}<div className="flex justify-end gap-2"><button type="button" className={btnGhost} onClick={() => setNewP(false)}>Cancel</button><button className={btnPrimary}>Create</button></div></form></Modal>}
      {newV && <Modal title={`New catalogue year for ${newV.code}`} onClose={() => setNewV(null)}><form className="grid gap-3" onSubmit={async (e) => { e.preventDefault(); try { const body = { catalogYear: vf.catalogYear, ...(vf.copyFrom ? { copyFrom: vf.copyFrom } : { totalCredits: Number(vf.totalCredits), minCgpa: Number(vf.minCgpa) }) }; await apiClient.post(`/registrar/programs/${newV._id}/versions`, body); setNewV(null); g.reload(); } catch (x) { setErr(errMsg(x)); } }}>
        <Field label="Catalogue year (for example 2027)"><input className={inputCls} value={vf.catalogYear} onChange={(e) => setVf({ ...vf, catalogYear: e.target.value })} required /></Field>
        {newV.versions.length > 0 && <Field label="Start from"><select className={inputCls} value={vf.copyFrom} onChange={(e) => setVf({ ...vf, copyFrom: e.target.value })}><option value="">Empty rules</option>{newV.versions.map((v) => <option key={v._id} value={v._id}>Copy of {v.catalogYear}</option>)}</select></Field>}
        {!vf.copyFrom && <div className="grid grid-cols-2 gap-3"><Field label="Credits to graduate"><input className={inputCls} type="number" min="1" value={vf.totalCredits} onChange={(e) => setVf({ ...vf, totalCredits: e.target.value })} /></Field><Field label="Lowest average"><input className={inputCls} type="number" step="0.01" value={vf.minCgpa} onChange={(e) => setVf({ ...vf, minCgpa: e.target.value })} /></Field></div>}
        {err && <p role="alert" className="text-sm text-[#9f1239]">{err}</p>}<div className="flex justify-end gap-2"><button type="button" className={btnGhost} onClick={() => setNewV(null)}>Cancel</button><button className={btnPrimary}>Create draft</button></div></form></Modal>}
      {edit && <RulesEditor version={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); g.reload(); }} />}
      {no && <Reason title="Send the rules back" text="Say what needs to change. The draft can then be edited again." confirm="Send back" danger={false} label="What needs to change" min={3} onClose={() => setNo(null)} onDone={async (note) => { await apiClient.post(`/registrar/versions/${no._id}/decide`, { approve: false, note }); setNo(null); g.reload(); }} />}
      {retire && <Reason title={retire.status === 'published' ? `Retire ${retire.catalogYear}` : `Delete the ${retire.catalogYear} draft`} text={retire.status === 'published' ? 'Students already on this year keep it. New students can no longer be placed on it.' : 'A draft that was never published is removed.'} confirm={retire.status === 'published' ? 'Retire' : 'Delete'} min={0} label="Reason (optional)" onClose={() => setRetire(null)} onDone={async () => { await apiClient.post(`/registrar/versions/${retire._id}/retire`, {}); setRetire(null); g.reload(); }} />}
    </div>
  );
}

// ---------- grade scale and policy ----------
export function Settings({ onChanged }) {
  const g = useGet('/registrar/settings'); const [scale, setScale] = useState(null); const [policy, setPolicy] = useState(null); const [err, setErr] = useState('');
  const s = scale || g.data?.scale; const p = policy || g.data?.policy;
  const save = async () => { setErr(''); try { await apiClient.put('/registrar/settings', { scale: s.map((x) => ({ grade: x.grade, points: Number(x.points), pass: !!x.pass })), policy: { ...p, maxAttempts: Number(p.maxAttempts), maxCreditsPerTerm: Number(p.maxCreditsPerTerm), appealDays: Number(p.appealDays) } }); setScale(null); setPolicy(null); g.reload(); onChanged?.(); } catch (e) { setErr(errMsg(e, 'Could not save.')); } };
  return (
    <Loading g={g}>{g.data && s && p && (
      <div className="space-y-4">
        <Card>
          <h3 className="mb-1 font-semibold text-[#1b2837]">Grade scale</h3><p className="mb-3 text-xs text-[#5b6b7b]">Points drive every average. A grade already on a published transcript keeps its points. W, I, AU, P and NP are reserved for withdrawals and special marks.</p>
          <Table label="Grade scale" head={['Grade', 'Points', 'Counts as a pass', '']} min={420}>
            {s.map((x, i) => (<tr key={i}><Td><input aria-label={`Grade ${i + 1}`} className={`${inputCls} !w-20`} value={x.grade} onChange={(e) => setScale(s.map((y, j) => (j === i ? { ...y, grade: e.target.value.toUpperCase() } : y)))} maxLength={2} /></Td><Td><input aria-label={`Points for ${x.grade || `grade ${i + 1}`}`} className={`${inputCls} !w-24`} type="number" step="0.01" min="0" max="10" value={x.points} onChange={(e) => setScale(s.map((y, j) => (j === i ? { ...y, points: e.target.value, pass: Number(e.target.value) > 0 } : y)))} /></Td><Td><input type="checkbox" aria-label={`${x.grade} counts as a pass`} checked={!!x.pass} onChange={(e) => setScale(s.map((y, j) => (j === i ? { ...y, pass: e.target.checked } : y)))} /></Td><Td><button className={`${btnGhost} !px-2 !py-1 !text-xs`} onClick={() => setScale(s.filter((_, j) => j !== i))} aria-label={`Remove ${x.grade || 'grade'}`}>Remove</button></Td></tr>))}
          </Table>
          <div className="mt-2 flex gap-2"><button className={btnGhost} onClick={() => setScale([...s, { grade: '', points: 0, pass: false }])}>Add a grade</button><button className={btnGhost} onClick={() => setScale(g.data.defaults.scale)}>Use the standard scale</button></div>
        </Card>
        <Card className="grid gap-3 sm:grid-cols-2">
          <h3 className="font-semibold text-[#1b2837] sm:col-span-2">Policy</h3>
          <Field label="When a course is repeated, the average uses" hint="Every attempt stays on the record. This only decides which attempts count."><select className={inputCls} value={p.repeat} onChange={(e) => setPolicy({ ...p, repeat: e.target.value })}><option value="latest">The latest attempt</option><option value="best">The best attempt</option><option value="average">The average of all attempts</option></select></Field>
          <Field label="A course may be repeated when the grade is below" hint="Courses passed at or above this need a signed exception."><select className={inputCls} value={p.repeatBelow} onChange={(e) => setPolicy({ ...p, repeatBelow: e.target.value })}>{s.map((x) => <option key={x.grade}>{x.grade}</option>)}</select></Field>
          <Field label="Most attempts at one course"><input className={inputCls} type="number" min="1" max="10" value={p.maxAttempts} onChange={(e) => setPolicy({ ...p, maxAttempts: e.target.value })} /></Field>
          <Field label="Most credits in one term"><input className={inputCls} type="number" min="1" max="60" value={p.maxCreditsPerTerm} onChange={(e) => setPolicy({ ...p, maxCreditsPerTerm: e.target.value })} /></Field>
          <Field label="Days a student can appeal after grades are published"><input className={inputCls} type="number" min="1" max="120" value={p.appealDays} onChange={(e) => setPolicy({ ...p, appealDays: e.target.value })} /></Field>
          <label className="flex items-center gap-2 self-end text-sm text-[#1b2837]"><input type="checkbox" checked={!!p.selfRegistration} onChange={(e) => setPolicy({ ...p, selfRegistration: e.target.checked })} /> Students may register themselves</label>
        </Card>
        {err && <p role="alert" className="text-sm text-[#9f1239]">{err}</p>}
        <div className="flex justify-end"><button className={btnPrimary} onClick={save} disabled={!scale && !policy}>Save scale and policy</button></div>
      </div>
    )}</Loading>
  );
}
