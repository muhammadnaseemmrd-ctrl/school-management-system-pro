import React, { useState } from 'react';
import apiClient from '../../utils/apiClient';
import { Card, Field, EmptyState, btnPrimary, btnGhost, btnDanger, inputCls, errMsg } from '../ui';
import { useGet, call, Loading, Note, Tabs, Table, Td, Reason, TBadge, AskForm, money, day, lines } from './tkit';
import ContentEditor from './ContentEditor';

/* ───────── instructors ───────── */
export function Instructors() {
  const g = useGet('/training/instructors'); const t = useGet('/training/teachers'); const [form, setForm] = useState(null); const [verify, setVerify] = useState(null); const [suspend, setSuspend] = useState(null);
  const rows = g.data?.instructors || [];
  return (
    <div className="space-y-3">
      <Note>A course can go on sale only when one of its instructors has been verified. Verifying means you looked at certificates, experience or references, and wrote down what you checked.</Note>
      <div className="flex justify-end"><button className={btnPrimary} onClick={() => setForm({})}>Add an instructor</button></div>
      <Loading g={g}>{rows.length === 0 ? <Card><EmptyState title="No instructors yet" text="Add the people who teach your courses. A teacher at your school can be linked so they see their own courses." /></Card> : (
        <Table label="Instructors" head={['Instructor', 'Credentials', 'Status', 'Courses', '']} min={680}>
          {rows.map((r) => (
            <tr key={r._id}><Td><div className="font-medium">{r.name}</div><div className="text-xs text-[#5b6b7b]">{r.email}{r.teacherId ? ' · school teacher' : ''}</div></Td><Td className="max-w-[260px] text-xs">{r.credentials || <span className="text-[#9f1239]">None written yet</span>}{r.evidence ? <div className="mt-1 text-[#5b6b7b]">Checked: {r.evidence}</div> : null}</Td>
              <Td><TBadge s={r.status} />{r.verifiedBy ? <div className="text-[11px] text-[#5b6b7b]">by {r.verifiedBy} {day(r.verifiedAt)}</div> : null}</Td><Td className="text-xs">{r.courses.join(', ') || 'None'}</Td>
              <Td><div className="flex flex-wrap gap-1"><button className={`${btnGhost} !px-2 !py-1 !text-xs`} aria-label={`Edit ${r.name}`} onClick={() => setForm(r)}>Edit</button>{r.status !== 'verified' && <button className={`${btnGhost} !px-2 !py-1 !text-xs`} aria-label={`Verify ${r.name}`} onClick={() => setVerify(r)}>Verify</button>}{r.status !== 'suspended' && <button className={`${btnGhost} !px-2 !py-1 !text-xs`} aria-label={`Suspend ${r.name}`} onClick={() => setSuspend(r)}>Suspend</button>}{r.status === 'suspended' && <button className={`${btnGhost} !px-2 !py-1 !text-xs`} aria-label={`Reset ${r.name} to waiting`} onClick={() => call(() => apiClient.post(`/training/instructors/${r._id}/verify`, { decision: 'reset' }), 'Back to waiting for a check', g.reload)}>Reset</button>}</div></Td></tr>
          ))}
        </Table>
      )}</Loading>
      {form && <AskForm title={form._id ? `Edit ${form.name}` : 'Add an instructor'} confirm="Save instructor" onClose={() => setForm(null)} initial={form}
        fields={[...(form._id ? [] : [{ k: 'teacherId', label: 'A teacher at your school (optional)', type: 'select', options: [['', 'Not a school teacher'], ...(t.data?.teachers || []).map((x) => [x._id, x.name])] }]), { k: 'name', label: 'Name', hint: 'Left empty, the teacher\'s name is used.' }, { k: 'email', label: 'Email', type: 'email' }, { k: 'bio', label: 'Short bio (shown to buyers)', type: 'textarea', max: 800 }, { k: 'credentials', label: 'Credentials and experience (checked before verifying)', type: 'textarea', max: 800 }]}
        onDone={async (v) => { const body = { ...v }; if (!body.teacherId) delete body.teacherId; if (form._id) { delete body.teacherId; const r = await apiClient.patch(`/training/instructors/${form._id}`, body); if (r.data.reverify) await Promise.resolve(); } else await apiClient.post('/training/instructors', body); setForm(null); g.reload(); }} />}
      {verify && <AskForm title={`Verify ${verify.name}`} intro={`Credentials on file: ${verify.credentials || 'none'}`} confirm="Mark as verified" onClose={() => setVerify(null)} fields={[{ k: 'evidence', label: 'What did you check? (certificates, experience, references)', type: 'textarea', required: true, max: 500 }]} onDone={async (v) => { await apiClient.post(`/training/instructors/${verify._id}/verify`, { decision: 'verify', evidence: v.evidence }); setVerify(null); g.reload(); }} />}
      {suspend && <Reason title={`Suspend ${suspend.name}`} text="A suspended instructor cannot be the verified instructor on a course." confirm="Suspend" label="Reason" min={10} onClose={() => setSuspend(null)} onDone={async (note) => { await apiClient.post(`/training/instructors/${suspend._id}/verify`, { decision: 'suspend', note }); setSuspend(null); g.reload(); }} />}
    </div>
  );
}

/* ───────── courses ───────── */
function Details({ course, instructors, canEdit, onSaved }) {
  const c = course; const L = c.landing || {};
  const [f, setF] = useState({
    title: c.title, summary: c.summary || '', level: c.level || '', language: c.language || 'en', price: c.price || 0, accessDays: c.access?.days || 0, refundDays: c.refundDays ?? '', instMax: c.installments?.max || 1, accessAfter: c.installments?.accessAfter || 'first', discussion: c.discussion || 'moderated',
    ids: (c.instructorIds || []).map(String), headline: L.headline || '', outcomes: (L.outcomes || []).join('\n'), requirements: (L.requirements || []).join('\n'), audience: L.audience || '', faq: (L.faq || []).map((x) => `${x.q} | ${x.a}`).join('\n'), skills: (c.skills || []).map((s) => [s.code, s.name, s.level].filter(Boolean).join(' | ')).join('\n'),
  });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    const body = { title: f.title, summary: f.summary, level: f.level, language: f.language, price: Number(f.price) || 0, access: { days: Number(f.accessDays) || 0 }, refundDays: f.refundDays === '' ? null : Number(f.refundDays), installments: { max: Number(f.instMax) || 1, accessAfter: f.accessAfter }, discussion: f.discussion, instructorIds: f.ids,
      landing: { headline: f.headline, outcomes: lines(f.outcomes), requirements: lines(f.requirements), audience: f.audience, faq: lines(f.faq).map((x) => { const [q, ...a] = x.split('|'); return { q: (q || '').trim(), a: a.join('|').trim() }; }).filter((x) => x.q && x.a) },
      skills: lines(f.skills).map((x) => { const [code, name, level] = x.split('|').map((y) => y.trim()); return { code: code || '', name: name || code || '', level: level || '' }; }) };
    try { await apiClient.patch(`/training/courses/${c._id}`, body); await onSaved(); } catch (x) { setErr(errMsg(x, 'Could not save the details.')); } finally { setBusy(false); }
  };
  const d = !canEdit;
  return (
    <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
      <Field label="Title"><input className={inputCls} value={f.title} onChange={set('title')} required maxLength={140} disabled={d} /></Field>
      <Field label="Level"><input className={inputCls} value={f.level} onChange={set('level')} maxLength={30} placeholder="Beginner, Intermediate…" disabled={d} /></Field>
      <div className="sm:col-span-2"><Field label="Summary (shown to buyers)"><textarea className={inputCls} rows={2} value={f.summary} onChange={set('summary')} maxLength={500} disabled={d} /></Field></div>
      <Field label="Price (before tax)" hint="0 makes it a free course."><input className={inputCls} type="number" min="0" value={f.price} onChange={set('price')} disabled={d} /></Field>
      <Field label="Access lasts (days, 0 = no end)"><input className={inputCls} type="number" min="0" max="3650" value={f.accessDays} onChange={set('accessDays')} disabled={d} /></Field>
      <Field label="Instalments allowed (most)"><input className={inputCls} type="number" min="1" max="12" value={f.instMax} onChange={set('instMax')} disabled={d} /></Field>
      <Field label="When instalments open access"><select className={inputCls} value={f.accessAfter} onChange={set('accessAfter')} disabled={d}><option value="first">After the first instalment is confirmed</option><option value="full">Only after the last instalment is confirmed</option></select></Field>
      <Field label="Refund window (days)" hint="Empty uses the school-wide policy."><input className={inputCls} type="number" min="0" max="365" value={f.refundDays} onChange={set('refundDays')} disabled={d} /></Field>
      <Field label="Discussion board"><select className={inputCls} value={f.discussion} onChange={set('discussion')} disabled={d}><option value="moderated">Moderated: posts wait for approval</option><option value="open">Open: posts show at once</option><option value="off">Off</option></select></Field>
      <fieldset className="sm:col-span-2"><legend className="mb-1 text-xs font-semibold text-[#3b4a5c]">Instructors</legend>
        <div className="flex flex-wrap gap-3">{instructors.map((i) => <label key={i._id} className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={d} checked={f.ids.includes(String(i._id))} onChange={(e) => setF({ ...f, ids: e.target.checked ? [...f.ids, String(i._id)] : f.ids.filter((x) => x !== String(i._id)) })} /> {i.name} <TBadge s={i.status} /></label>)}{instructors.length === 0 && <span className="text-sm text-[#5b6b7b]">Add an instructor first (Instructors tab).</span>}</div></fieldset>
      <div className="sm:col-span-2"><Field label="Landing page headline"><input className={inputCls} value={f.headline} onChange={set('headline')} maxLength={140} disabled={d} /></Field></div>
      <Field label="What a learner can do at the end (one per line)"><textarea className={inputCls} rows={4} value={f.outcomes} onChange={set('outcomes')} disabled={d} /></Field>
      <Field label="What a learner needs first (one per line)"><textarea className={inputCls} rows={4} value={f.requirements} onChange={set('requirements')} disabled={d} /></Field>
      <div className="sm:col-span-2"><Field label="Who it is for"><input className={inputCls} value={f.audience} onChange={set('audience')} maxLength={300} disabled={d} /></Field></div>
      <Field label="Questions and answers (one per line: question | answer)"><textarea className={inputCls} rows={3} value={f.faq} onChange={set('faq')} disabled={d} /></Field>
      <Field label="Skills a certificate names (one per line: CODE | name | level)"><textarea className={inputCls} rows={3} value={f.skills} onChange={set('skills')} disabled={d} /></Field>
      {err && <p role="alert" className="text-sm text-[#9f1239] sm:col-span-2">{err}</p>}
      {canEdit && <div className="sm:col-span-2"><button className={btnPrimary} disabled={busy}>{busy ? 'Saving…' : 'Save the details'}</button></div>}
    </form>
  );
}

function Publishing({ course, checks, unpublished, admin, soleAdmin, onChanged }) {
  const [reject, setReject] = useState(false); const [arch, setArch] = useState(false); const dec = course.decision; const blocks = checks.filter((x) => x.level === 'block');
  return (
    <div className="space-y-3">
      <Card>
        <h3 className="mb-2 font-semibold text-[#1b2837]">Before this can go on sale</h3>
        {checks.length === 0 ? <Note tone="ok">Every check passes.</Note> : (
          <ul className="grid gap-1 text-sm">{checks.map((x, i) => <li key={i} className="flex gap-2"><span className={`shrink-0 font-semibold ${x.level === 'block' ? 'text-[#9f1239]' : 'text-[#8a4636]'}`}>{x.level === 'block' ? 'Must fix:' : 'Worth a look:'}</span><span>{x.text}</span></li>)}</ul>
        )}
      </Card>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><h3 className="font-semibold text-[#1b2837]">Status: <TBadge s={course.status} /></h3><p className="text-xs text-[#5b6b7b]">{course.live ? `Live version ${course.live.version}, published ${day(course.live.publishedAt)}${course.live.approvedBy ? ` and approved by ${course.live.approvedBy}` : ''}.` : 'Not published yet.'}{unpublished ? ' There are changes that are not live.' : ''}</p></div>
          <div className="flex flex-wrap gap-2">
            {course.status !== 'archived' && dec?.state !== 'submitted' && <button className={btnPrimary} disabled={blocks.length > 0 || (course.live && !unpublished)} onClick={() => call(() => apiClient.post(`/training/courses/${course._id}/submit`, {}), 'Sent for approval', onChanged)}>Send for approval</button>}
            {admin && dec?.state === 'submitted' && <><button className={btnPrimary} onClick={() => call(() => apiClient.post(`/training/courses/${course._id}/decide`, { decision: 'approve' }), (r) => `Published as version ${r.data.version}`, onChanged)}>Approve and publish</button><button className={btnGhost} onClick={() => setReject(true)}>Send back</button></>}
            {admin && course.status !== 'archived' && <button className={btnDanger} onClick={() => setArch(true)}>Archive</button>}
            {admin && course.status === 'archived' && <button className={btnGhost} onClick={() => call(() => apiClient.post(`/training/courses/${course._id}/archive`, { restore: true }), 'Restored', onChanged)}>Restore</button>}
          </div>
        </div>
        {dec?.state === 'submitted' && <p className="mt-2 text-sm">Sent for approval by {dec.byName} on {day(dec.at)}. {admin ? (soleAdmin ? 'You are the only administrator, so you may approve it yourself and the record says so.' : 'A different administrator from the one who sent it must approve it.') : 'An administrator will look at it.'}</p>}
        {dec?.state === 'rejected' && <p className="mt-2 text-sm text-[#9f1239]">Sent back by {dec.byName}: {dec.note}</p>}
      </Card>
      <Card><h3 className="mb-2 font-semibold text-[#1b2837]">History</h3><ul className="grid gap-1 text-xs text-[#3b4a5c]">{[...(course.history || [])].reverse().slice(0, 15).map((h, i) => <li key={i}>{day(h.at)} · {h.byName || 'System'} · {h.change}</li>)}</ul></Card>
      {reject && <Reason title="Send the course back" text="Say what needs fixing. The author will see this." confirm="Send back" min={10} danger={false} label="What needs fixing" onClose={() => setReject(false)} onDone={async (note) => { await apiClient.post(`/training/courses/${course._id}/decide`, { decision: 'reject', note }); setReject(false); onChanged(); }} />}
      {arch && <Reason title="Archive this course" text="Learners who already have access keep it. Open cohorts are closed and nobody new can buy it." confirm="Archive" min={10} onClose={() => setArch(false)} onDone={async (reason) => { await apiClient.post(`/training/courses/${course._id}/archive`, { reason }); setArch(false); onChanged(); }} />}
    </div>
  );
}

function CourseView({ id, role, soleAdmin, onBack }) {
  const g = useGet(`/training/courses/${id}`); const ins = useGet('/training/instructors'); const [tab, setTab] = useState('outline'); const d = g.data; const admin = role === 'admin';
  return (
    <div className="space-y-3">
      <button className={btnGhost} onClick={onBack}>Back to the courses</button>
      <Loading g={g}>{d && (
        <>
          <div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-semibold text-[#1b2837]">{d.course.title}</h3><TBadge s={d.course.status} />{d.unpublished && <TBadge s="draft" tone="warn" />}</div>
          <Tabs label="Course sections" value={tab} onChange={setTab} items={[['outline', 'Lessons'], ['details', 'Details and landing page'], ['publish', 'Checks and publishing', d.checks.filter((x) => x.level === 'block').length || null]]} />
          {tab === 'outline' && <ContentEditor key={d.course.updatedAt} course={d.course} canEdit onSaved={() => g.reload()} />}
          {tab === 'details' && <Details course={d.course} instructors={ins.data?.instructors || []} canEdit={admin} onSaved={() => g.reload()} />}
          {tab === 'publish' && <Publishing course={d.course} checks={d.checks} unpublished={d.unpublished} admin={admin} soleAdmin={soleAdmin} onChanged={() => g.reload()} />}
        </>
      )}</Loading>
    </div>
  );
}

export function Courses({ role = 'admin', soleAdmin }) {
  const g = useGet('/training/courses'); const [open, setOpen] = useState(null); const [form, setForm] = useState(false); const rows = g.data?.courses || [];
  if (open) return <CourseView id={open} role={role} soleAdmin={soleAdmin} onBack={() => { setOpen(null); g.reload(); }} />;
  return (
    <div className="space-y-3">
      {role === 'admin' && <div className="flex justify-end"><button className={btnPrimary} onClick={() => setForm(true)}>New course</button></div>}
      <Loading g={g}>{rows.length === 0 ? <Card><EmptyState title={role === 'admin' ? 'No courses yet' : 'You are not an instructor on any course yet'} text={role === 'admin' ? 'Create a course, write its lessons, then send it for approval. Nothing is on sale until a verified instructor is named and it is approved.' : 'An administrator adds you as an instructor on a course. It then shows here.'} /></Card> : (
        <Table label="Courses" head={['Course', 'Status', 'Price', 'Lessons', 'Learners', 'Open cohorts', '']} min={720}>
          {rows.map((c) => (
            <tr key={c._id}><Td><span className="font-medium">{c.title}</span>{c.rejected && <div className="text-xs text-[#9f1239]">Sent back for changes</div>}{c.unpublished && c.status === 'published' && <div className="text-xs text-[#8a4636]">Changes not live yet</div>}</Td><Td><TBadge s={c.pendingReview ? 'review' : c.status} /></Td><Td>{c.price ? money(c.price) : 'Free'}</Td><Td>{c.lessons}</Td><Td>{c.learners}</Td><Td>{c.openCohorts}</Td>
              <Td><button className={`${btnGhost} !px-2 !py-1 !text-xs`} aria-label={`Open ${c.title}`} onClick={() => setOpen(c._id)}>Open</button></Td></tr>
          ))}
        </Table>
      )}</Loading>
      {form && <AskForm title="New course" confirm="Create the course" onClose={() => setForm(false)} fields={[{ k: 'title', label: 'Title', required: true, max: 140, full: true }, { k: 'summary', label: 'Summary (shown to buyers)', type: 'textarea', max: 500 }, { k: 'price', label: 'Price before tax (0 = free)', type: 'number', min: 0, def: 0 }]}
        onDone={async (v) => { const r = await apiClient.post('/training/courses', { title: v.title, summary: v.summary, price: Number(v.price) || 0 }); setForm(false); await g.reload(); setOpen(r.data._id); }} />}
    </div>
  );
}
