import React, { useState } from 'react';
import apiClient from '../../utils/apiClient';
import { Card, Modal, Field, EmptyState, btnPrimary, btnGhost, btnDanger, inputCls, errMsg } from '../ui';
import { useGet, call, Loading, Note, Tabs, Table, Td, Reason, TBadge, AskForm, download, localInput, dt, day } from './tkit';

/* ───────── hand-ins ───────── */
function ReviewForm({ sub, onClose, onDone }) {
  const [scores, setScores] = useState(() => Object.fromEntries((sub.rubric || []).map((r) => [r.id, ''])));
  const [feedback, setFeedback] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const total = (sub.rubric || []).reduce((s, r) => s + r.max, 0); const got = (sub.rubric || []).reduce((s, r) => s + (Number(scores[r.id]) || 0), 0); const pct = total ? Math.round((got * 100) / total) : 0;
  const send = async (decision) => {
    setBusy(true); setErr('');
    try { await apiClient.post(`/training/submissions/${sub._id}/review`, { decision, scores: Object.fromEntries(Object.entries(scores).map(([k, v]) => [k, Number(v) || 0])), feedback }); await onDone(); } catch (e) { setErr(errMsg(e, 'Could not save the review.')); setBusy(false); }
  };
  return (
    <Modal title={`${sub.lessonTitle}: ${sub.learnerName}, attempt ${sub.attempt}`} onClose={onClose} wide>
      <div className="grid gap-3">
        {sub.brief && <div className="rounded-lg bg-[#f7f6f2] p-3 text-sm"><div className="mb-1 text-xs font-semibold text-[#5b6b7b]">The brief</div><p className="whitespace-pre-wrap">{sub.brief}</p></div>}
        <div className="rounded-lg border border-[#e3e7e7] p-3 text-sm"><div className="mb-1 text-xs font-semibold text-[#5b6b7b]">The learner's work</div><p className="whitespace-pre-wrap">{sub.text}</p>{sub.link && <p className="mt-2 text-xs">Link: <a className="text-[#2a5cac] underline" href={sub.link} target="_blank" rel="noopener noreferrer">{sub.link}</a></p>}</div>
        <fieldset className="grid gap-2"><legend className="mb-1 text-sm font-semibold">Marks</legend>{(sub.rubric || []).map((r) => <div key={r.id} className="grid grid-cols-[1fr_110px] items-center gap-2"><label htmlFor={`s-${r.id}`} className="text-sm">{r.title} <span className="text-xs text-[#5b6b7b]">out of {r.max}</span></label><input id={`s-${r.id}`} className={inputCls} type="number" min="0" max={r.max} value={scores[r.id]} onChange={(e) => setScores({ ...scores, [r.id]: e.target.value })} /></div>)}<p className="text-sm">Score: <b>{pct}%</b> · pass mark {sub.passPercent}%</p></fieldset>
        <Field label="Feedback to the learner" hint="Needed when you return the work."><textarea className={inputCls} rows={3} value={feedback} onChange={(e) => setFeedback(e.target.value)} maxLength={1500} /></Field>
        {err && <p role="alert" className="text-sm text-[#9f1239]">{err}</p>}
        <div className="flex flex-wrap justify-end gap-2"><button className={btnGhost} onClick={onClose}>Not now</button><button className={btnGhost} disabled={busy} onClick={() => send('return')}>Return for another try</button><button className={btnPrimary} disabled={busy || pct < sub.passPercent} onClick={() => send('accept')}>Accept the work</button></div>
      </div>
    </Modal>
  );
}

export function Submissions() {
  const [status, setStatus] = useState('submitted'); const g = useGet('/training/submissions', { status }); const [open, setOpen] = useState(null); const [more, setMore] = useState(null); const rows = g.data?.submissions || [];
  return (
    <div className="space-y-3">
      <div className="flex items-end gap-2"><Field label="Show"><select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}><option value="submitted">Waiting for review</option><option value="returned">Returned</option><option value="accepted">Accepted</option></select></Field></div>
      <Loading g={g}>{rows.length === 0 ? <Card><EmptyState title="Nothing here" text={status === 'submitted' ? 'No work is waiting for review.' : 'Nothing in this list.'} /></Card> : (
        <Table label="Hand-ins" head={['Learner', 'Lesson', 'Attempt', 'Handed in', 'Result', '']} min={680}>
          {rows.map((s) => <tr key={s._id}><Td className="font-medium">{s.learnerName}<div className="text-xs font-normal text-[#5b6b7b]">{s.courseTitle}</div></Td><Td>{s.lessonTitle}</Td><Td>{s.attempt} of {s.maxAttempts + (s.extraAttempts || 0)}</Td><Td className="text-xs">{dt(s.createdAt)}</Td><Td>{s.status === 'submitted' ? <TBadge s="submitted" /> : <><TBadge s={s.status} /> {s.percent}%</>}</Td>
            <Td><div className="flex flex-wrap gap-1">{s.status === 'submitted' && <button className={`${btnPrimary} !px-2 !py-1 !text-xs`} aria-label={`Review ${s.learnerName} ${s.lessonTitle}`} onClick={() => setOpen(s)}>Review</button>}{s.status === 'returned' && <button className={`${btnGhost} !px-2 !py-1 !text-xs`} aria-label={`Allow another attempt for ${s.learnerName}`} onClick={() => setMore(s)}>Allow another attempt</button>}</div></Td></tr>)}
        </Table>
      )}</Loading>
      {open && <ReviewForm sub={open} onClose={() => setOpen(null)} onDone={async () => { setOpen(null); await g.reload(); }} />}
      {more && <AskForm title="Allow another attempt" confirm="Allow" onClose={() => setMore(null)} initial={{ extra: 1 }} fields={[{ k: 'extra', label: 'Extra attempts (1 to 3)', type: 'number', min: 1, max: 3 }]} onDone={async (v) => { await apiClient.post(`/training/submissions/${more._id}/attempts`, { extra: Number(v.extra) }); setMore(null); g.reload(); }} />}
    </div>
  );
}

/* ───────── completion review ───────── */
export function Completions() {
  const [all, setAll] = useState(false); const g = useGet('/training/completions', { all: all ? '1' : undefined }); const [hold, setHold] = useState(null); const [appr, setAppr] = useState(null); const rows = g.data?.completions || [];
  return (
    <div className="space-y-3">
      <Note>A course counts as finished only after a person looks at the work. Approving issues a signed certificate that anyone can check with its code. Putting it on hold tells the learner what to fix.</Note>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Include completions already approved</label>
      <Loading g={g}>{rows.length === 0 ? <Card><EmptyState title="Nobody is waiting" text="A learner appears here when they have finished every needed lesson, had their work accepted and met the attendance needed." /></Card> : (
        <Table label="Completions" head={['Learner', 'Course', 'Evidence', 'State', '']} min={760}>
          {rows.map((r) => (
            <tr key={r.entitlementId}><Td className="font-medium">{r.learnerName}</Td><Td>{r.courseTitle}</Td>
              <Td className="text-xs"><div>Lessons {r.percent}%{r.attendance !== null && r.attendance !== undefined ? ` · attendance ${r.attendance}%` : ''}</div>{r.work.map((w, i) => <div key={i}>{w.title}: {w.percent}%</div>)}{r.missing.length > 0 && <div className="text-[#9f1239]">Missing: {r.missing[0]}</div>}{r.refunded && <div className="text-[#9f1239]">Part of the order ({r.orderNo}) was refunded</div>}{r.completionNote && <div className="text-[#8a4636]">Note: {r.completionNote}</div>}</Td>
              <Td><TBadge s={r.completion} />{r.state !== 'active' && <div className="mt-1"><TBadge s={r.state} /></div>}</Td>
              <Td>{r.completion !== 'complete' && <div className="flex flex-wrap gap-1"><button className={`${btnPrimary} !px-2 !py-1 !text-xs`} aria-label={`Approve ${r.learnerName} for ${r.courseTitle}`} disabled={r.missing.length > 0} onClick={() => setAppr(r)}>Approve and issue certificate</button><button className={`${btnGhost} !px-2 !py-1 !text-xs`} aria-label={`Hold ${r.learnerName}`} onClick={() => setHold(r)}>Hold</button></div>}</Td></tr>
          ))}
        </Table>
      )}</Loading>
      {hold && <Reason title={`Hold ${hold.learnerName}'s completion`} text="The learner is told what to fix." confirm="Put on hold" min={10} danger={false} label="What needs fixing" onClose={() => setHold(null)} onDone={async (note) => { await apiClient.post(`/training/completions/${hold.entitlementId}/decide`, { decision: 'hold', note }); setHold(null); g.reload(); }} />}
      {appr && <AskForm title={`Approve ${appr.learnerName}`} intro={`This issues a signed certificate for "${appr.courseTitle}". It cannot be taken back, only withdrawn with a reason.`} confirm="Approve and issue" onClose={() => setAppr(null)} fields={[{ k: 'note', label: 'Note for the record (optional)', type: 'textarea', max: 400 }]} onDone={async (v) => { await apiClient.post(`/training/completions/${appr.entitlementId}/decide`, { decision: 'approve', note: v.note }); setAppr(null); g.reload(); }} />}
    </div>
  );
}

/* ───────── certificates ───────── */
function SpecForm({ onClose, onDone }) {
  const lr = useGet('/training/learners', { limit: 100 }); const bn = useGet('/training/bundles');
  return (
    <AskForm title="Issue a specialisation" intro="Only when the learner has completed every course in the bundle." confirm="Issue" onClose={onClose} initial={{ learnerId: lr.data?.learners?.[0]?._id || '', bundleId: bn.data?.bundles?.[0]?._id || '' }} key={`${lr.loading}${bn.loading}`}
      fields={[{ k: 'learnerId', label: 'Learner', type: 'select', required: true, options: (lr.data?.learners || []).map((l) => [l._id, l.name]) }, { k: 'bundleId', label: 'Bundle', type: 'select', required: true, options: (bn.data?.bundles || []).map((b) => [b._id, b.title]) }]}
      onDone={async (v) => { await apiClient.post('/training/credentials/specialization', v); onDone(); }} />
  );
}

export function Certificates({ admin }) {
  const [flag, setFlag] = useState(false); const g = useGet('/training/credentials', { flag: flag ? '1' : undefined });
  const [keep, setKeep] = useState(null); const [rev, setRev] = useState(null); const [spec, setSpec] = useState(false); const rows = g.data?.credentials || [];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={flag} onChange={(e) => setFlag(e.target.checked)} /> Only those that need a decision after a refund</label>{admin && <button className={btnGhost} onClick={() => setSpec(true)}>Issue a specialisation</button>}</div>
      <Loading g={g}>{rows.length === 0 ? <Card><EmptyState title="No certificates" text="Certificates appear when a finished course is approved." /></Card> : (
        <Table label="Certificates" head={['Number', 'Learner', 'Title', 'Issued', 'Status', '']} min={760}>
          {rows.map((c) => (
            <tr key={c._id}><Td className="font-mono text-xs">{c.serial}<div className="text-[11px] text-[#5b6b7b]">check {c.verifyKey}</div></Td><Td>{c.learnerName}</Td><Td>{c.title}</Td><Td className="text-xs">{day(c.createdAt)}</Td><Td><TBadge s={c.status === 'valid' ? 'valid' : 'revoked'} tone={c.status === 'valid' ? undefined : 'bad'} />{c.status !== 'valid' && <div className="text-[11px] text-[#5b6b7b]">{c.revokedReason}</div>}{c.refundFlag && <div className="text-[11px] font-semibold text-[#8a4636]">Refunded after it was earned: decide</div>}</Td>
              <Td><div className="flex flex-wrap gap-1"><button className={`${btnGhost} !px-2 !py-1 !text-xs`} aria-label={`Download ${c.serial}`} onClick={() => download(`/training/credentials/${c._id}/pdf`, `${c.serial}.pdf`)}>PDF</button>{admin && c.refundFlag && <button className={`${btnGhost} !px-2 !py-1 !text-xs`} aria-label={`It stands: ${c.serial}`} onClick={() => setKeep(c)}>It stands</button>}{admin && c.status === 'valid' && <button className={`${btnDanger} !px-2 !py-1 !text-xs`} aria-label={`Withdraw ${c.serial}`} onClick={() => setRev(c)}>Withdraw</button>}</div></Td></tr>
          ))}
        </Table>
      )}</Loading>
      {keep && <Reason title={`${keep.serial} stands`} text="The refund does not take the certificate away. Say why." confirm="Keep the certificate" min={10} danger={false} onClose={() => setKeep(null)} onDone={async (reason) => { await apiClient.post(`/training/credentials/${keep._id}/keep`, { reason }); setKeep(null); g.reload(); }} />}
      {rev && <Reason title={`Withdraw ${rev.serial}`} text="The record stays. Anyone who checks the code sees it was withdrawn." confirm="Withdraw" min={10} onClose={() => setRev(null)} onDone={async (reason) => { await apiClient.post(`/training/credentials/${rev._id}/revoke`, { reason }); setRev(null); g.reload(); }} />}
      {spec && <SpecForm onClose={() => setSpec(false)} onDone={() => { setSpec(false); g.reload(); }} />}
    </div>
  );
}

/* ───────── discussion ───────── */
export function Discussion() {
  const [view, setView] = useState('held'); const g = useGet('/training/posts', { view }); const [hide, setHide] = useState(null); const [reply, setReply] = useState(null); const rows = g.data?.posts || [];
  return (
    <div className="space-y-3">
      <Tabs label="Discussion views" value={view} onChange={setView} items={[['held', 'Waiting for approval'], ['reported', 'Reported'], ['hidden', 'Hidden']]} />
      <Loading g={g}>{rows.length === 0 ? <Card><EmptyState title="Nothing here" text="Posts that need a decision show up in this list." /></Card> : (
        <ul className="grid gap-2">{rows.map((p) => (
          <li key={p._id} className="rounded-xl border border-[#e3e7e7] bg-white p-3 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{p.authorName} <span className="text-xs font-normal text-[#5b6b7b]">in {p.courseTitle} · {dt(p.createdAt)}</span></span>{p.reportCount > 0 && <span className="text-xs font-semibold text-[#9f1239]">{p.reportCount} report{p.reportCount === 1 ? '' : 's'}</span>}</div><p className="mt-1 whitespace-pre-wrap">{p.body}</p>{p.reports?.length > 0 && <ul className="mt-1 text-xs text-[#5b6b7b]">{p.reports.map((r, i) => <li key={i}>Reported: {r.reason || 'no reason given'}</li>)}</ul>}{p.hiddenReason && <p className="mt-1 text-xs text-[#5b6b7b]">Hidden: {p.hiddenReason}</p>}
            <div className="mt-2 flex flex-wrap gap-1">{p.status !== 'visible' || p.reportCount > 0 ? <button className={`${btnPrimary} !px-2 !py-1 !text-xs`} aria-label={`Show post by ${p.authorName}`} onClick={() => call(() => apiClient.post(`/training/posts/${p._id}/decide`, { action: 'show' }), 'Post is shown', g.reload)}>Show it</button> : null}{p.status !== 'hidden' && <button className={`${btnDanger} !px-2 !py-1 !text-xs`} aria-label={`Hide post by ${p.authorName}`} onClick={() => setHide(p)}>Hide it</button>}{p.status === 'visible' && <button className={`${btnGhost} !px-2 !py-1 !text-xs`} aria-label={`Reply to ${p.authorName}`} onClick={() => setReply(p)}>Reply as instructor</button>}</div></li>
        ))}</ul>
      )}</Loading>
      {hide && <Reason title="Hide this post" text="The learner does not see a reason. It is kept in the record." confirm="Hide it" min={5} onClose={() => setHide(null)} onDone={async (reason) => { await apiClient.post(`/training/posts/${hide._id}/decide`, { action: 'hide', reason }); setHide(null); g.reload(); }} />}
      {reply && <AskForm title="Reply as the instructor" confirm="Post reply" onClose={() => setReply(null)} fields={[{ k: 'body', label: 'Your reply', type: 'textarea', required: true, max: 1500 }]} onDone={async (v) => { await apiClient.post(`/training/courses/${reply.courseId}/posts`, { body: v.body, parentId: reply._id }); setReply(null); g.reload(); }} />}
    </div>
  );
}

/* ───────── office hours ───────── */
export function Slots({ admin }) {
  const g = useGet('/training/slots'); const cs = useGet('/training/courses', { status: 'published' }); const ins = useGet('/training/instructors'); const [form, setForm] = useState(false); const [out, setOut] = useState(null); const rows = g.data?.slots || []; const courses = (cs.data?.courses || []).filter((c) => c.status === 'published');
  return (
    <div className="space-y-3">
      <div className="flex justify-end"><button className={btnPrimary} onClick={() => setForm(true)} disabled={!courses.length}>Open slots</button></div>
      <Loading g={g}>{rows.length === 0 ? <Card><EmptyState title="No slots" text="Open one or more back-to-back slots. Learners book one, and only one learner can take a slot." /></Card> : (
        <Table label="Office hours" head={['When', 'Course', 'Instructor', 'Booked by', 'Status', '']} min={760}>
          {rows.map((s) => {
            const past = new Date(s.startsAt) <= new Date();
            return (
              <tr key={s._id}><Td>{dt(s.startsAt)}<div className="text-xs text-[#5b6b7b]">{s.minutes} min · {s.mode === 'online' ? 'Online' : s.venue}</div></Td><Td>{s.courseTitle}</Td><Td>{s.instructorName}</Td><Td>{s.bookedName || '—'}{s.topic && <div className="text-xs text-[#5b6b7b]">{s.topic}</div>}</Td><Td><TBadge s={s.status} />{s.followUp && <div className="text-[11px] text-[#5b6b7b]">{s.followUp}</div>}</Td>
                <Td><div className="flex flex-wrap gap-1">{s.status === 'booked' && past && <button className={`${btnGhost} !px-2 !py-1 !text-xs`} aria-label={`Record the outcome of ${dt(s.startsAt)}`} onClick={() => setOut(s)}>Record outcome</button>}{['open', 'booked'].includes(s.status) && <button className={`${btnDanger} !px-2 !py-1 !text-xs`} aria-label={`Cancel the slot at ${dt(s.startsAt)}`} onClick={() => call(() => apiClient.post(`/training/slots/${s._id}/cancel`), 'Slot cancelled', g.reload)}>Cancel</button>}</div></Td></tr>
            );
          })}
        </Table>
      )}</Loading>
      {form && <AskForm title="Open office-hour slots" confirm="Open the slots" wide onClose={() => setForm(false)} initial={{ courseId: courses[0]?._id || '', startsAt: '', minutes: 20, count: 3, mode: 'online', link: '', venue: '', instructorId: '' }}
        fields={[{ k: 'courseId', label: 'Course', type: 'select', required: true, options: courses.map((c) => [c._id, c.title]) }, ...(admin ? [{ k: 'instructorId', label: 'Instructor', type: 'select', required: true, options: [['', 'Choose…'], ...(ins.data?.instructors || []).map((i) => [i._id, i.name])] }] : []), { k: 'startsAt', label: 'First slot starts', type: 'datetime-local', required: true }, { k: 'minutes', label: 'Minutes each', type: 'number', min: 5, max: 120 }, { k: 'count', label: 'How many, back to back', type: 'number', min: 1, max: 12 }, { k: 'mode', label: 'Where', type: 'select', options: [['online', 'Online'], ['venue', 'At a venue']] }, { k: 'link', label: 'Meeting link (https, online)' }, { k: 'venue', label: 'Venue (in person)' }]}
        onDone={async (v) => { await apiClient.post('/training/slots', { courseId: v.courseId, instructorId: v.instructorId || undefined, startsAt: new Date(v.startsAt).toISOString(), minutes: Number(v.minutes), count: Number(v.count), mode: v.mode, link: v.link, venue: v.venue }); setForm(false); g.reload(); }} />}
      {out && <AskForm title="Record what happened" confirm="Save" onClose={() => setOut(null)} initial={{ outcome: 'attended' }} fields={[{ k: 'outcome', label: 'Outcome', type: 'select', options: [['attended', 'The learner came'], ['missed', 'The learner did not come']] }, { k: 'followUp', label: 'Follow-up (optional)', type: 'textarea', max: 400 }]} onDone={async (v) => { await apiClient.post(`/training/slots/${out._id}/outcome`, v); setOut(null); g.reload(); }} />}
    </div>
  );
}
