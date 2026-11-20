import React, { useEffect, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import { Card, Field, EmptyState, btnPrimary, btnGhost, btnDanger, inputCls, errMsg } from '../ui';
import { Note, TBadge, KIND, dt, day } from './tkit';
import { useLGet } from './lkit';

const Bar = ({ value, label }) => <div role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label={label} className="h-2 w-full overflow-hidden rounded-full bg-[#e3e7e7]"><div className="h-full bg-[#2a5cac]" style={{ width: `${value}%` }} /></div>;

/* ───────── one lesson ───────── */
function Lesson({ api, courseId, lid, access, onChanged }) {
  const g = useLGet(api, `/courses/${courseId}/lessons/${lid}`); const d = g.data; const L = d?.lesson;
  const [active, setActive] = useState(0); const [answers, setAnswers] = useState({}); const [result, setResult] = useState(null); const [busy, setBusy] = useState(false);
  const [text, setText] = useState(''); const [link, setLink] = useState(''); const [err, setErr] = useState('');
  useEffect(() => { if (d) setActive(d.record.active); }, [d]);
  useEffect(() => { setResult(null); setAnswers({}); setErr(''); }, [lid]);
  const timed = d && (L.kind === 'video' || L.kind === 'reading') && L.minutes > 0 && !d.record.done && access.state === 'active';
  const needed = d?.activeNeeded || 0;
  // Real time on the page: a beat goes out only while this tab is showing. The server decides how much of it counts.
  const stop = useRef(false);
  useEffect(() => {
    if (!timed) return undefined; stop.current = false;
    const send = async () => { if (stop.current) return; try { const r = await api.post(`/courses/${courseId}/lessons/${lid}/beat`, { visible: document.visibilityState === 'visible' }); if (!stop.current && typeof r.data.active === 'number') setActive(r.data.active); } catch (e) { /* a missed beat just counts for less */ } };
    send(); const t = setInterval(send, 15000);
    return () => { stop.current = true; clearInterval(t); };
  }, [timed, api, courseId, lid]);
  const ok = (m) => { toast.success(m); };
  const answer = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    try { const r = await api.post(`/courses/${courseId}/lessons/${lid}/answer`, { answers }); setResult(r.data); await g.reload(); } catch (x) { setErr(errMsg(x, 'Could not check your answers.')); } finally { setBusy(false); }
  };
  const complete = async () => {
    setBusy(true); setErr('');
    try { const r = await api.post(`/courses/${courseId}/lessons/${lid}/complete`); ok(r.data.ready ? 'Lesson done. The course is ready for the instructor to review.' : 'Lesson done'); await g.reload(); onChanged(); } catch (x) { setErr(errMsg(x, 'Could not finish the lesson yet.')); } finally { setBusy(false); }
  };
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    try { await api.post(`/courses/${courseId}/lessons/${lid}/submit`, { text, link }); ok('Handed in. The instructor will review it.'); setText(''); setLink(''); await g.reload(); onChanged(); } catch (x) { setErr(errMsg(x, 'Could not hand in your work.')); } finally { setBusy(false); }
  };
  if (g.loading && !d) return <div className="p-4 text-sm text-[#5b6b7b]" role="status">Loading the lesson…</div>;
  if (g.error) return <Note tone="warn">{g.error}</Note>;
  if (!d) return null;
  const subs = d.submissions || []; const last = subs[subs.length - 1];
  const wait = last?.status === 'submitted'; const accepted = last?.status === 'accepted';
  return (
    <article className="space-y-3" aria-label={L.title}>
      <header><h3 className="text-lg font-semibold text-[#1b2837]">{L.title}</h3><p className="text-xs text-[#5b6b7b]">{KIND[L.kind]}{L.minutes ? ` · about ${L.minutes} ${L.minutes === 1 ? 'minute' : 'minutes'}` : ''}{L.required ? '' : ' · optional'}</p></header>
      {L.body && <div className="whitespace-pre-wrap rounded-xl border border-[#e3e7e7] bg-white p-4 text-sm leading-relaxed text-[#1b2837]">{L.body}</div>}
      {L.url && <p className="text-sm"><a className="font-semibold text-[#2a5cac] underline" href={L.url} target="_blank" rel="noopener noreferrer">{L.kind === 'video' ? 'Open the video' : 'Open the extra reading'} (new tab)</a></p>}
      {timed && (
        <Card>
          <p className="mb-1 text-sm font-semibold">Time on this lesson</p>
          <Bar value={Math.min(100, Math.round((active * 100) / needed))} label="Time counted on this lesson" />
          <p className="mt-1 text-xs text-[#5b6b7b]" aria-live="polite">{Math.min(Math.floor(active / 60), Math.ceil(needed / 60))} of about {Math.ceil(needed / 60)} {Math.ceil(needed / 60) === 1 ? 'minute' : 'minutes'} counted. Time counts only while this page is open and showing.</p>
        </Card>
      )}
      {L.check?.length > 0 && access.state === 'active' && !d.record.done && (
        <form onSubmit={answer} className="grid gap-3">
          <h4 className="font-semibold text-[#1b2837]">Questions {d.record.passed ? <span className="text-xs font-normal text-[#215a52]">(passed, best {d.record.best}%)</span> : <span className="text-xs font-normal text-[#5b6b7b]">(pass mark {L.passPercent}%)</span>}</h4>
          {L.check.map((q, qi) => (
            <fieldset key={q.id} className="rounded-xl border border-[#e3e7e7] bg-white p-3"><legend className="px-1 text-sm font-semibold">{qi + 1}. {q.q}{q.multi ? ' (choose all that apply)' : ''}</legend>
              <div className="grid gap-1">{q.options.map((o, oi) => { const cur = answers[q.id] || []; const on = cur.includes(oi); return <label key={oi} className="flex items-center gap-2 text-sm"><input type={q.multi ? 'checkbox' : 'radio'} name={`q-${q.id}`} checked={on} onChange={() => setAnswers({ ...answers, [q.id]: q.multi ? (on ? cur.filter((x) => x !== oi) : [...cur, oi]) : [oi] })} /> {o}</label>; })}</div>
              {result && (() => { const r = result.review.find((x) => x.id === q.id); return r ? (r.correct ? <p className="mt-1 text-xs font-semibold text-[#215a52]">Right.</p> : <p className="mt-1 text-xs text-[#9f1239]">Not right yet.{r.why ? ` ${r.why}` : ''}</p>) : null; })()}
            </fieldset>
          ))}
          {result && <Note tone={result.passed ? 'ok' : 'warn'}>You scored {result.percent}%. {result.passed ? 'That passes.' : `You need ${result.needed}%. Read the notes and try again.`}</Note>}
          <div><button className={btnPrimary} disabled={busy}>{busy ? 'Checking…' : result ? 'Check my answers again' : 'Check my answers'}</button></div>
        </form>
      )}
      {L.kind === 'assignment' && (
        <div className="space-y-3">
          {L.rubric?.length > 0 && <Card><h4 className="mb-1 text-sm font-semibold">How it is marked (pass mark {L.passPercent}%, {L.maxAttempts} attempts)</h4><ul className="text-sm">{L.rubric.map((r) => <li key={r.id}>{r.title}: {r.max} marks</li>)}</ul></Card>}
          {subs.map((s) => (
            <Card key={s._id}><div className="flex flex-wrap items-center gap-2"><b className="text-sm">Attempt {s.attempt}</b><TBadge s={s.status} />{s.percent != null && s.status !== 'submitted' && <span className="text-xs">{s.percent}%</span>}<span className="text-xs text-[#5b6b7b]">{dt(s.createdAt)}</span></div><p className="mt-1 whitespace-pre-wrap text-sm">{s.text}</p>{s.link && <p className="text-xs"><a className="text-[#2a5cac] underline" href={s.link} target="_blank" rel="noopener noreferrer">{s.link}</a></p>}{s.feedback && <div className="mt-2 rounded-lg bg-[#f7f6f2] p-2 text-sm"><b className="text-xs">Feedback:</b> {s.feedback}</div>}</Card>
          ))}
          {access.state === 'active' && !wait && !accepted && (
            <form onSubmit={submit} className="grid gap-2"><Field label="Your work"><textarea className={inputCls} rows={6} value={text} onChange={(e) => setText(e.target.value)} maxLength={6000} required={!link} /></Field><Field label="A link to your work (optional, https)"><input className={inputCls} type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" /></Field><div><button className={btnPrimary} disabled={busy}>{busy ? 'Handing in…' : 'Hand in my work'}</button></div></form>
          )}
          {wait && <Note>Your work is waiting for the instructor. You will see the result here.</Note>}
        </div>
      )}
      {err && <p role="alert" className="text-sm text-[#9f1239]">{err}</p>}
      {access.state === 'active' && L.kind !== 'assignment' && (d.record.done ? <p className="text-sm font-semibold text-[#215a52]">You have finished this lesson.</p> : <button className={btnPrimary} disabled={busy} onClick={complete}>Mark this lesson as done</button>)}
      {L.kind === 'assignment' && d.record.done && <p className="text-sm font-semibold text-[#215a52]">Your work was accepted. This lesson is done.</p>}
      {access.state !== 'active' && <Note tone="warn">{access.state === 'none' ? 'You are looking at a free preview. Join the course to track your progress.' : 'Your access to this course is not active, so progress is not being recorded.'}</Note>}
    </article>
  );
}

/* ───────── discussion ───────── */
function Discussion({ api, courseId }) {
  const g = useLGet(api, `/courses/${courseId}/discussion`); const [body, setBody] = useState(''); const [reply, setReply] = useState(null); const [busy, setBusy] = useState(false); const d = g.data;
  const post = async (e) => { e.preventDefault(); setBusy(true); try { const r = await api.post(`/courses/${courseId}/discussion`, { body, parentId: reply?._id }); toast.success(r.data.status === 'held' ? 'Posted. It shows once the instructor approves it.' : 'Posted'); setBody(''); setReply(null); await g.reload(); } catch (x) { toast.error(errMsg(x)); } finally { setBusy(false); } };
  const report = async (p) => { try { await api.post(`/posts/${p._id}/report`, { reason: 'Reported by a learner' }); toast.success('Thank you. The instructor will look at it.'); await g.reload(); } catch (x) { toast.error(errMsg(x)); } };
  if (g.loading && !d) return <p className="text-sm text-[#5b6b7b]" role="status">Loading…</p>; if (g.error) return <Note tone="warn">{g.error}</Note>;
  if (d.mode === 'off') return <Note>Discussion is switched off for this course.</Note>;
  const tops = d.posts.filter((p) => !p.parentId); const kids = (id) => d.posts.filter((p) => String(p.parentId) === String(id));
  const One = ({ p, depth }) => (
    <li className={depth ? 'ms-6' : ''}><div className="rounded-xl border border-[#e3e7e7] bg-white p-3 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{p.authorName}{p.staff ? '' : ''} <span className="text-xs font-normal text-[#5b6b7b]">{dt(p.createdAt)}</span></span>{p.status === 'held' && <TBadge s="pending" tone="warn" />}</div><p className="mt-1 whitespace-pre-wrap">{p.body}</p>{p.status === 'held' && <p className="mt-1 text-xs text-[#8a4636]">Only you can see this until the instructor approves it.</p>}
      <div className="mt-1 flex gap-3 text-xs">{d.canPost && p.status === 'visible' && !depth && <button className="font-semibold text-[#2a5cac] underline" onClick={() => setReply(p)} aria-label={`Reply to ${p.authorName}`}>Reply</button>}{p.status === 'visible' && !p.mine && !p.staff && !p.reported && <button className="text-[#5b6b7b] underline" onClick={() => report(p)} aria-label={`Report the post by ${p.authorName}`}>Report</button>}{p.reported && <span className="text-[#5b6b7b]">You reported this</span>}</div></div>
      {kids(p._id).length > 0 && <ul className="mt-2 grid gap-2">{kids(p._id).map((k) => <One key={k._id} p={k} depth={1} />)}</ul>}</li>
  );
  return (
    <div className="space-y-3">
      {d.mode === 'moderated' || d.minor ? <Note>Posts here are read by the instructor before others can see them.</Note> : null}
      {d.canPost ? (
        <form onSubmit={post} className="grid gap-2"><Field label={reply ? `Replying to ${reply.authorName}` : 'Ask a question or share something'}><textarea className={inputCls} rows={3} value={body} onChange={(e) => setBody(e.target.value)} maxLength={1500} required /></Field><div className="flex gap-2"><button className={btnPrimary} disabled={busy || body.trim().length < 2}>{busy ? 'Posting…' : 'Post'}</button>{reply && <button type="button" className={btnGhost} onClick={() => setReply(null)}>Stop replying</button>}</div></form>
      ) : <Note>Only learners with active access can post.</Note>}
      {tops.length === 0 ? <EmptyState title="No posts yet" text="Be the first to ask a question." /> : <ul className="grid gap-2">{tops.map((p) => <One key={p._id} p={p} depth={0} />)}</ul>}
    </div>
  );
}

/* ───────── office hours ───────── */
function Slots({ api, courseId }) {
  const g = useLGet(api, `/courses/${courseId}/slots`); const [topic, setTopic] = useState('');
  const act = async (fn, ok) => { try { await fn(); toast.success(ok); await g.reload(); } catch (x) { toast.error(errMsg(x)); await g.reload(); } };
  if (g.loading && !g.data) return <p className="text-sm text-[#5b6b7b]" role="status">Loading…</p>; if (g.error) return <Note tone="warn">{g.error}</Note>;
  const rows = g.data.slots;
  return (
    <div className="space-y-3">
      <Field label="What would you like to talk about? (optional)"><input className={inputCls} value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={200} /></Field>
      {rows.length === 0 ? <EmptyState title="No office hours open" text="Your instructor has not opened any slots yet. Check again later." /> : (
        <ul className="grid gap-2">{rows.map((s) => (
          <li key={s._id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#e3e7e7] bg-white p-3 text-sm"><span><b>{dt(s.startsAt)}</b> · {s.minutes} min · {s.instructorName} · {s.mode === 'online' ? 'Online' : s.venue}{s.mine && s.link && <> · <a className="text-[#2a5cac] underline" href={s.link} target="_blank" rel="noopener noreferrer">Join the meeting</a></>}{s.mine && s.topic ? ` · ${s.topic}` : ''}</span>
            {s.mine ? <span className="flex items-center gap-2"><TBadge s="booked" /><button className={`${btnGhost} !px-2 !py-1 !text-xs`} onClick={() => act(() => api.post(`/slots/${s._id}/cancel`), 'Booking cancelled')}>Cancel my booking</button></span> : <button className={`${btnPrimary} !px-3 !py-1.5 !text-xs`} aria-label={`Book ${dt(s.startsAt)}`} onClick={() => act(() => api.post(`/slots/${s._id}/book`, { topic }), 'Booked')}>Book this slot</button>}</li>
        ))}</ul>
      )}
    </div>
  );
}

/* ───────── the course ───────── */
export default function CoursePlayer({ api, courseId, startLesson, onBack }) {
  const g = useLGet(api, `/courses/${courseId}`); const d = g.data; const [tab, setTab] = useState('lessons'); const [lid, setLid] = useState(startLesson || '');
  useEffect(() => { if (d && !lid) { const all = d.modules.flatMap((m) => m.lessons); setLid((all.find((l) => l.state === 'open') || all[0] || {}).id || ''); } }, [d, lid]);
  if (g.loading && !d) return <div className="p-6 text-sm text-[#5b6b7b]" role="status">Loading the course…</div>;
  if (g.error) return <div className="space-y-3"><button className={btnGhost} onClick={onBack}>Back to my courses</button><Note tone="warn">{g.error}</Note></div>;
  const a = d.access; const rd = d.readiness; const all = d.modules.flatMap((m) => m.lessons);
  return (
    <div className="space-y-3">
      <button className={btnGhost} onClick={onBack}>Back to my courses</button>
      <div><h2 className="text-xl font-bold text-[#1b2837]">{d.course.title}</h2><p className="text-sm text-[#5b6b7b]">{d.course.summary}</p></div>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-semibold">{d.percent}% of the needed lessons done</span>{a.completion === 'complete' ? <TBadge s="complete" /> : a.completion === 'ready' ? <TBadge s="ready" /> : a.completion === 'held' ? <TBadge s="held" /> : <TBadge s={a.state === 'none' ? 'locked' : 'inprogress'} />}</div>
        <div className="mt-2"><Bar value={d.percent} label="Course progress" /></div>
        {a.state === 'paused' && <div className="mt-2"><Note tone="warn">Your access is paused because an instalment is late. Pay it and send proof from "My orders". Your progress is kept.</Note></div>}
        {a.state === 'revoked' && <div className="mt-2"><Note tone="warn">Your access to this course has ended. What you did is kept.</Note></div>}
        {a.state === 'expired' && <div className="mt-2"><Note tone="warn">Your access to this course has run out. What you did is kept.</Note></div>}
        {a.completion === 'ready' && <p className="mt-2 text-sm text-[#234c91]">You have done everything. An instructor will look at your work and issue your certificate.</p>}
        {a.completion === 'held' && <p className="mt-2 text-sm text-[#8a4636]">The instructor put your completion on hold: {a.note}</p>}
        {a.completion === 'complete' && <p className="mt-2 text-sm text-[#215a52]">Finished {day(a.completedAt)}. Your certificate is under "Certificates".</p>}
        {rd && !rd.ready && a.completion !== 'complete' && rd.missing?.length > 0 && <p className="mt-2 text-xs text-[#5b6b7b]">Still needed: {rd.missing.slice(0, 3).join('; ')}{rd.missing.length > 3 ? '…' : ''}</p>}
      </Card>
      <div role="tablist" aria-label="Course sections" className="flex flex-wrap gap-2">{[['lessons', 'Lessons'], ['discussion', 'Discussion'], ['slots', 'Office hours'], ...(d.cohort?.sessions?.length ? [['sessions', 'Live sessions']] : [])].map(([k, v]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`rounded-lg px-3 py-2 text-sm font-semibold ${tab === k ? 'bg-[#2a5cac] text-white' : 'border border-[#e3e7e7] bg-white text-[#1b2837] hover:bg-[#f7f6f2]'}`}>{v}</button>)}</div>
      {tab === 'lessons' && (
        <div className="grid gap-4 md:grid-cols-[280px_1fr]">
          <nav aria-label="Lessons" className="space-y-3">{d.modules.map((m) => (
            <div key={m.id}><h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-[#5b6b7b]">{m.title}</h3>
              <ul className="grid gap-1">{m.lessons.map((l) => (
                <li key={l.id}><button disabled={l.state === 'locked'} aria-current={lid === l.id ? 'true' : undefined} onClick={() => setLid(l.id)} className={`flex w-full items-start justify-between gap-2 rounded-lg border px-3 py-2 text-start text-sm ${lid === l.id ? 'border-[#2a5cac] bg-[#eef2f8]' : 'border-[#e3e7e7] bg-white'} disabled:opacity-60`}><span>{l.title}<span className="block text-[11px] text-[#5b6b7b]">{KIND[l.kind]}{l.state === 'locked' && l.why ? ` · ${l.why}` : ''}</span></span><span className="shrink-0 text-[11px] font-semibold">{l.state === 'done' ? <span className="text-[#215a52]">Done</span> : l.state === 'locked' ? <span className="text-[#5b6b7b]">Locked</span> : ''}</span></button></li>
              ))}</ul></div>
          ))}</nav>
          <div>{lid ? <Lesson key={lid} api={api} courseId={courseId} lid={lid} access={a} onChanged={g.reload} /> : <EmptyState title="Pick a lesson" />}</div>
        </div>
      )}
      {tab === 'discussion' && <Discussion api={api} courseId={courseId} />}
      {tab === 'slots' && <Slots api={api} courseId={courseId} />}
      {tab === 'sessions' && d.cohort && (
        <div className="space-y-2"><p className="text-sm text-[#5b6b7b]">{d.cohort.name}. {d.cohort.minAttendance}% attendance is needed.</p>
          <ul className="grid gap-2">{d.cohort.sessions.map((s) => <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#e3e7e7] bg-white p-3 text-sm"><span><b>{s.title}</b> · {dt(s.startsAt)} · {s.minutes} min · {s.mode === 'online' ? 'Online' : s.venue}{s.link && <> · <a className="text-[#2a5cac] underline" href={s.link} target="_blank" rel="noopener noreferrer">Join</a></>}</span>{s.mark ? <TBadge s={s.mark === 'present' ? 'done' : s.mark === 'late' ? 'pending' : s.mark === 'excused' ? 'inprogress' : 'missed'} /> : null}{s.mark && <span className="text-xs text-[#5b6b7b]">{s.mark}</span>}</li>)}</ul></div>
      )}
    </div>
  );
}
