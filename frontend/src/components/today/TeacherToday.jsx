import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import { BookOpen, CalendarClock, ClipboardCheck, FileText, Download, Inbox, Send } from 'lucide-react';
import apiClient from '../../utils/apiClient';
import { Card, Pill, Stat, EmptyState, btnGhost, btnPrimary, btnDanger, errMsg } from '../ui';
import { Sub } from '../attendance/deskKit';
import { dayTime } from '../safety/safetyKit';
import { useSync, flush, discard, readCache, writeCache, setOpenConflicts } from '../../utils/syncQueue';
import { SyncBanner, SyncChip, hm } from './todayKit';
import { RegisterModal, MarksModal, DraftEditor } from './Editors';
import ConflictInbox from './ConflictInbox';

const STATE = { upcoming: ['None', 'Later'], open: ['Active', 'Open now'], closed: ['None', 'Finished'] };
const KIND = { lessonNote: 'Lesson note', homework: 'Homework', reminder: 'Reminder' };

const TeacherToday = ({ onNavigate }) => {
  const sync = useSync(); const [pack, setPack] = useState(() => readCache('pack')); const [stale, setStale] = useState(false); const [err, setErr] = useState(''); const [tab, setTab] = useState('today');
  const [reg, setReg] = useState(null); const [marks, setMarks] = useState(null); const [draft, setDraft] = useState(null);
  const load = useCallback(async () => {
    try { const r = await apiClient.get('/teacher-today/pack'); setPack(r.data); writeCache('pack', r.data); setStale(false); setErr(''); setOpenConflicts(r.data.today.openConflicts); }
    catch (e) { if (!e.response) setStale(true); else setErr(errMsg(e, 'Could not load your day')); }
  }, []);
  useEffect(() => { load(); }, [load]);
  // after the device finishes sending, refresh from the server so what is shown is what is saved
  useEffect(() => { if (sync.lastSyncAt && !sync.queued.length) load(); }, [sync.lastSyncAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const patch = (fn) => setPack((p) => { const n = fn(JSON.parse(JSON.stringify(p))); writeCache('pack', n); return n; });
  const today = pack?.today; const conflicts = sync.openConflicts || today?.openConflicts || 0;
  const drafts = useMemo(() => (pack?.drafts || []), [pack]); const pendingKeys = new Set(sync.queued.map((q) => q.entityKey));

  if (!pack) return err ? <Card><EmptyState title={err} action={<button className={btnGhost} onClick={load}>Try again</button>} /></Card> : stale ? <Card><EmptyState title="You are offline and nothing is saved on this device yet" text="Open this screen once with a connection and your day is kept here for later." /></Card> : <div className="skeleton h-64" />;
  const clsOf = (id) => pack.classes.find((c) => String(c.classId) === String(id));
  const afterRegister = (mode, lesson, cls, records) => patch((p) => { const c = p.classes.find((x) => x.classId === cls.classId); const m = Object.fromEntries(records.map((r) => [r.studentId, r.status])); if (mode === 'period') { const k = `${lesson.startTime}-${lesson.endTime}`; c.periods[k] = { ...(c.periods[k] || {}), ...m }; const l = p.today.lessons.find((x) => x.startTime === lesson.startTime && String(x.classId) === String(lesson.classId)); if (l) { l.marked = Object.keys(c.periods[k]).length; l.needsRegister = false; } } else { c.daily = { ...c.daily, ...m }; const r = p.today.rolls.find((x) => x.classId === cls.classId); if (r) { r.taken = Object.keys(c.daily).length; r.state = r.taken >= r.total ? 'done' : 'partial'; } } return p; });
  const lessons = today.lessons; const c = today.counts;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-xl font-bold text-[#1b2837]">Today, {new Date(`${today.date}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })}</h2><p className="text-sm text-[#5b6b7b]">{today.teacher.name} · {stale ? `offline copy saved ${hm(pack.generatedAt)}` : `updated ${hm(pack.generatedAt)}`}</p></div>
        <div className="flex flex-wrap items-center gap-2"><SyncChip /><button className={`${btnGhost} !px-3 !py-1.5 !text-xs`} onClick={() => { load().then(() => toast.success('Your day is saved on this device until ' + hm(pack.validUntil) + ' tomorrow.')); }} title="Keep today's classes, registers and drafts on this device"><Download className="me-1 inline h-3.5 w-3.5" />Save for offline</button></div>
      </div>
      <SyncBanner onFailed={() => setTab('waiting')} />
      {stale && <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">Showing what this device saved at {hm(pack.generatedAt)}. Other people's changes since then are not shown.</div>}
      {pack.validUntil && new Date(pack.validUntil) < new Date() && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">This offline copy is out of date. Connect to refresh it before relying on it.</div>}

      <div role="tablist" className="flex flex-wrap gap-1 border-b border-[#e3e7e7]">{[['today', 'Today'], ['drafts', `Drafts${c.drafts ? ` (${c.drafts})` : ''}`], ['clashes', `Clashes${conflicts ? ` (${conflicts})` : ''}`], ['waiting', `Waiting to send${sync.queued.length + sync.failed.length ? ` (${sync.queued.length + sync.failed.length})` : ''}`]].map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold ${tab === id ? 'border-[#2a5cac] text-[#2a5cac]' : 'border-transparent text-[#5b6b7b] hover:text-[#1b2837]'}`}>{label}</button>)}</div>

      {tab === 'today' && <>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Stat label="Lessons" value={c.lessons} sub={today.next ? `Next: ${today.next.startTime} ${today.next.subjectName}` : 'Nothing more today'} /><Stat label="Registers to take" value={c.registersToTake + c.rollsToTake} sub={`${c.rollsToTake} roll call, ${c.registersToTake} lesson`} tone={c.registersToTake + c.rollsToTake ? 'text-[#b86650]' : undefined} /><Stat label="To mark" value={c.toMark + c.marksDue} sub={`${c.toMark} homework, ${c.marksDue} exam sets`} /><Stat label="Clashes" value={conflicts} sub={conflicts ? 'Waiting for your choice' : 'None'} tone={conflicts ? 'text-[#9f1239]' : undefined} /></div>
        {(today.coverAsked.length > 0 || today.swapsWaiting > 0) && <Card className="!border-[#cfe0f5] !bg-[#f3f8fe]"><div className="flex flex-wrap items-center justify-between gap-2 text-sm"><span><CalendarClock className="me-1 inline h-4 w-4" />{today.coverAsked.length > 0 && `${today.coverAsked.length} lesson${today.coverAsked.length === 1 ? '' : 's'} to cover waiting for your answer. `}{today.swapsWaiting > 0 && `${today.swapsWaiting} lesson swap${today.swapsWaiting === 1 ? '' : 's'} waiting for you.`}</span><button className={btnGhost} onClick={() => onNavigate && onNavigate('timetablePlan')}>Open timetable &amp; cover</button></div></Card>}

        <Card className="!p-0"><div className="border-b border-[#e3e7e7] p-3 text-sm font-semibold">Your lessons</div>
          {lessons.length === 0 ? <EmptyState title="No lessons today" text="Enjoy the time. Your roll calls and marking are below." /> : <ul className="divide-y divide-[#e3e7e7]">{lessons.map((l, i) => { const cls = clsOf(l.classId); return (
            <li key={`${l.startTime}-${l.classId}-${i}`} className="flex flex-wrap items-center justify-between gap-3 p-3">
              <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{l.startTime}-{l.endTime}</span><Pill value={STATE[l.windowStatus][0]}>{STATE[l.windowStatus][1]}</Pill>{l.cover && <Pill value="Pending">You are covering</Pill>}</div>
                <div className="text-sm">{l.subjectName} · {l.className}{l.room ? ` · ${l.room}` : ''}</div>
                <Sub>Register: {l.marked} of {l.total} marked{l.notes.length > 0 && ` · ${l.notes.length} note${l.notes.length === 1 ? '' : 's'}`}{l.homeworkDue.length > 0 && ` · homework due: ${l.homeworkDue.map((h) => h.title).join(', ')}`}</Sub></div>
              <div className="flex flex-wrap gap-2"><button className={l.needsRegister ? btnPrimary : btnGhost} disabled={!cls} onClick={() => setReg({ mode: 'period', lesson: l, cls })}>{l.marked ? 'Edit register' : 'Take register'}</button><button className={btnGhost} onClick={() => setDraft({ preset: { kind: 'lessonNote', classId: l.classId, subjectId: l.subjectId || '', date: today.date } })}>Add note</button></div>
            </li>); })}</ul>}</Card>

        {today.rolls.length > 0 && <Card className="!p-0"><div className="border-b border-[#e3e7e7] p-3 text-sm font-semibold">Class roll call</div><ul className="divide-y divide-[#e3e7e7]">{today.rolls.map((r) => <li key={r.classId} className="flex flex-wrap items-center justify-between gap-2 p-3"><div><span className="font-semibold">Class {r.className}</span><Sub>{r.state === 'done' ? `All ${r.total} marked` : r.state === 'empty' ? 'No students' : `${r.taken} of ${r.total} marked`}</Sub></div><button className={r.state === 'done' ? btnGhost : btnPrimary} disabled={r.state === 'empty'} onClick={() => setReg({ mode: 'daily', cls: clsOf(r.classId) })}>{r.state === 'done' ? 'Edit roll call' : 'Take roll call'}</button></li>)}</ul></Card>}

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="!p-0"><div className="border-b border-[#e3e7e7] p-3 text-sm font-semibold"><ClipboardCheck className="me-1 inline h-4 w-4" />Marks to enter</div>{today.marksDue.length === 0 ? <p className="p-4 text-sm text-[#5b6b7b]">All exam marks are in.</p> : <ul className="divide-y divide-[#e3e7e7]">{pack.exams.map((e) => <li key={`${e.examId}-${e.subjectId}`} className="flex items-center justify-between gap-2 p-3 text-sm"><div><div className="font-semibold">{e.name}</div><Sub>{e.subjectName} · {e.className} · {e.entered} of {e.total} entered</Sub></div><button className={btnGhost} disabled={!clsOf(e.classId)} onClick={() => setMarks(e)}>Enter marks</button></li>)}</ul>}</Card>
          <Card className="!p-0"><div className="border-b border-[#e3e7e7] p-3 text-sm font-semibold"><BookOpen className="me-1 inline h-4 w-4" />Homework to mark</div>{today.marking.length === 0 ? <p className="p-4 text-sm text-[#5b6b7b]">Nothing is waiting to be marked.</p> : <ul className="divide-y divide-[#e3e7e7]">{today.marking.map((h) => <li key={h.homeworkId} className="flex items-center justify-between gap-2 p-3 text-sm"><div><div className="font-semibold">{h.title}</div><Sub>{h.className} · {h.subjectName} · {h.ungraded} handed in</Sub></div><button className={btnGhost} onClick={() => onNavigate && onNavigate('homework')}>Open</button></li>)}</ul>}</Card>
        </div>
      </>}

      {tab === 'drafts' && <Card className="!p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e3e7e7] p-3"><span className="text-sm text-[#3b4a5c]">Written here, even with no network. Homework drafts are published when you choose; notes and reminders stay private.</span><button className={btnPrimary} onClick={() => setDraft({})}><FileText className="me-1 inline h-4 w-4" />New draft</button></div>
        {drafts.length === 0 ? <EmptyState title="No drafts" text="Start a lesson note or homework and it is kept safe." /> : <ul className="divide-y divide-[#e3e7e7]">{drafts.map((d) => { const waiting = pendingKeys.has(`draft:${d.localId}`); return (
          <li key={d.localId} className="flex flex-wrap items-center justify-between gap-2 p-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{d.title || '(no title)'}</span><Pill value="None">{KIND[d.kind]}</Pill>{waiting && <Pill value="Pending">Waiting to send</Pill>}</div><Sub>{[clsOf(d.classId)?.className, d.date, d.dueDate && `due ${d.dueDate}`].filter(Boolean).join(' · ')} · updated {dayTime(d.updatedAt)}</Sub></div>
            <div className="flex flex-wrap gap-2"><button className={btnGhost} onClick={() => setDraft({ draft: d })}>Edit</button>
              {d.kind === 'homework' && <button className={btnPrimary} disabled={waiting || !sync.online} title={waiting ? 'Send your changes first' : ''} onClick={async () => { if (!window.confirm('Publish this homework to the class now?')) return; try { await apiClient.post(`/sync/drafts/${d.localId}/publish`); toast.success('Homework published'); load(); } catch (e) { toast.error(errMsg(e)); } }}><Send className="me-1 inline h-4 w-4" />Publish</button>}
              <button className={btnGhost} disabled={!sync.online} onClick={async () => { if (!window.confirm('Discard this draft?')) return; try { await apiClient.post(`/sync/drafts/${d.localId}/discard`); load(); } catch (e) { toast.error(errMsg(e)); } }}>Discard</button></div></li>); })}</ul>}
      </Card>}

      {tab === 'clashes' && <ConflictInbox onChanged={load} />}

      {tab === 'waiting' && <div className="space-y-4">
        <Card className="!p-0"><div className="flex items-center justify-between gap-2 border-b border-[#e3e7e7] p-3 text-sm font-semibold"><span><Inbox className="me-1 inline h-4 w-4" />On this device, not yet on the server</span><button className={btnGhost} disabled={!sync.online || !sync.queued.length || sync.syncing} onClick={() => flush()}>Send now</button></div>
          {sync.queued.length === 0 ? <p className="p-4 text-sm text-[#5b6b7b]">Nothing is waiting. Everything you did has reached the server.</p> : <ul className="divide-y divide-[#e3e7e7]">{sync.queued.map((q) => <li key={q.mutationId} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"><div><div className="font-semibold">{q.label || q.kind}</div><Sub>Made at {hm(q.capturedAt)} · <Pill value="Pending">Waiting to send</Pill></Sub></div><button className={`${btnGhost} !px-3 !py-1.5 !text-xs`} onClick={() => { if (window.confirm('Throw away this unsent change? It has not reached the server.')) discard(q.mutationId, 'queued'); }}>Throw away</button></li>)}</ul>}</Card>
        {sync.failed.length > 0 && <Card className="!p-0 !border-red-200"><div className="border-b border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-900">Refused by the server</div><ul className="divide-y divide-[#e3e7e7]">{sync.failed.map((q) => <li key={q.mutationId} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"><div><div className="font-semibold">{q.label || q.kind}</div><Sub>{q.error}</Sub></div><button className={`${btnDanger} !px-3 !py-1.5 !text-xs`} onClick={() => discard(q.mutationId, 'failed')}>Dismiss</button></li>)}</ul></Card>}
        <Card className="!p-0"><div className="border-b border-[#e3e7e7] p-3 text-sm font-semibold">Recently sent</div>{sync.recent.length === 0 ? <p className="p-4 text-sm text-[#5b6b7b]">Nothing sent from this device yet.</p> : <ul className="divide-y divide-[#e3e7e7]">{sync.recent.map((r, i) => <li key={i} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"><span>{r.label || r.kind}<Sub>{r.message}</Sub></span><span className="flex items-center gap-2"><Pill value={r.status === 'Applied' ? 'Approved' : r.status === 'Rejected' ? 'Suspended' : 'Pending'}>{r.status === 'Applied' ? 'Saved' : r.status}</Pill><span className="text-xs text-[#5b6b7b]">{hm(r.at)}</span></span></li>)}</ul>}</Card>
      </div>}

      {reg && <RegisterModal {...reg} date={today.date} onClose={() => setReg(null)} onConflict={() => setTab('clashes')} onSaved={(records, out) => { afterRegister(reg.mode, reg.lesson, reg.cls, records); if (out === 'conflict') setTab('clashes'); load(); }} />}
      {marks && <MarksModal exam={marks} cls={clsOf(marks.classId)} onClose={() => setMarks(null)} onConflict={() => setTab('clashes')} onSaved={(saved) => { patch((p) => { const e = p.exams.find((x) => x.examId === marks.examId && x.subjectId === marks.subjectId); if (e) { e.current = { ...e.current, ...saved }; e.entered = Object.keys(e.current).length; } return p; }); load(); }} />}
      {draft && <DraftEditor {...draft} pack={pack} onClose={() => setDraft(null)} onSaved={(d) => { patch((p) => { const i = p.drafts.findIndex((x) => x.localId === d.localId); if (i >= 0) p.drafts[i] = d; else p.drafts.unshift(d); p.today.counts.drafts = p.drafts.length; return p; }); }} />}
    </div>
  );
};
export default TeacherToday;
