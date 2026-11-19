import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Clock, Wifi, WifiOff, Volume2, ChevronLeft, ChevronRight, CheckCircle2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import apiClient from '../../utils/apiClient';
import { Card, EmptyState, Field, Modal, Pill, btnPrimary, btnGhost, inputCls, errMsg } from '../ui';
import { useGet } from '../timetable/planKit';
import { Rich, KIND_LABEL, STATE_TONE, clock, dt } from './assessKit';
import { plain } from './notation';

const keyOf = (id) => `aulensia-attempt-${id}`;
const mem = { get: (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } }, del: (k) => { try { localStorage.removeItem(k); } catch { /* storage unavailable */ } } };

function Answer({ it, value, onChange, big }) {
  const sz = big ? 'text-lg' : 'text-sm';
  if (['mcq', 'tf'].includes(it.kind)) return <div role="radiogroup" aria-label="Choices" className="grid gap-2">{it.options.map((o) => <label key={o.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 ${sz} ${value === o.id ? 'border-[#2a5cac] bg-[#eef2f8]' : 'border-[#e3e7e7] bg-white'}`}><input type="radio" name={it.ref} checked={value === o.id} onChange={() => onChange(o.id)} /><Rich text={o.text} /></label>)}</div>;
  if (it.kind === 'multi') { const v = Array.isArray(value) ? value : []; return <div className="grid gap-2"><p className="text-xs text-[#5b6b7b]">Choose every correct answer.</p>{it.options.map((o) => <label key={o.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 ${sz} ${v.includes(o.id) ? 'border-[#2a5cac] bg-[#eef2f8]' : 'border-[#e3e7e7] bg-white'}`}><input type="checkbox" checked={v.includes(o.id)} onChange={(e) => onChange(e.target.checked ? [...v, o.id] : v.filter((x) => x !== o.id))} /><Rich text={o.text} /></label>)}</div>; }
  if (it.kind === 'short') return <input aria-label="Your answer" className={`${inputCls} ${sz}`} value={value || ''} maxLength={300} onChange={(e) => onChange(e.target.value)} />;
  if (it.kind === 'numeric') return <div className="flex items-center gap-2"><input aria-label="Your answer" inputMode="decimal" className={`${inputCls} ${sz} !w-48`} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />{it.unit && <span className="text-sm text-[#5b6b7b]">{it.unit}</span>}</div>;
  if (it.kind === 'essay') return <textarea aria-label="Your answer" className={`${inputCls} ${sz}`} rows={8} value={value || ''} onChange={(e) => onChange(e.target.value)} />;
  if (it.kind === 'match') { const v = value && typeof value === 'object' ? value : {}; return <div className="grid gap-2">{it.left.map((l) => <div key={l.id} className="grid items-center gap-2 sm:grid-cols-2"><div className={`rounded-lg bg-[#f7f6f2] p-2 ${sz}`}><Rich text={l.text} /></div><select aria-label={`Match for ${l.text}`} className={inputCls} value={v[l.id] || ''} onChange={(e) => onChange({ ...v, [l.id]: e.target.value })}><option value="">Choose…</option>{it.right.map((r) => <option key={r.id} value={r.id}>{r.text}</option>)}</select></div>)}</div>; }
  if (it.kind === 'order') {
    const cur = Array.isArray(value) && value.length ? value : it.sequence.map((s) => s.id); const by = Object.fromEntries(it.sequence.map((s) => [s.id, s.text])); const move = (i, d) => { const n = [...cur]; const j = i + d; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j], n[i]]; onChange(n); };
    return <div className="grid gap-2"><p className="text-xs text-[#5b6b7b]">Use the arrows to put the steps in the right order.{!Array.isArray(value) && <button type="button" className="ms-2 font-semibold text-[#2a5cac]" onClick={() => onChange(cur)}>Keep this order</button>}</p>{cur.map((id, i) => <div key={id} className={`flex items-center gap-2 rounded-xl border border-[#e3e7e7] bg-white p-2 ${sz}`}><span className="w-5 text-xs text-[#5b6b7b]">{i + 1}.</span><span className="grow"><Rich text={by[id]} /></span><button type="button" className={`${btnGhost} !px-2 !py-1`} aria-label="Move up" onClick={() => move(i, -1)}>↑</button><button type="button" className={`${btnGhost} !px-2 !py-1`} aria-label="Move down" onClick={() => move(i, 1)}>↓</button></div>)}</div>;
  }
  return null;
}
const answered = (v) => (Array.isArray(v) ? v.length > 0 : v && typeof v === 'object' ? Object.keys(v).length > 0 : v !== undefined && v !== null && String(v) !== '');

function Runner({ boot, onExit }) {
  const [d] = useState(boot); const id = d.attemptId; const offset = useRef(new Date(d.serverNow).getTime() - Date.now()); const due = new Date(d.dueAt).getTime();
  const [answers, setAnswers] = useState(() => { const local = mem.get(keyOf(id)); return { ...(local?.answers || {}), ...(d.answers || {}) }; }); const [idx, setIdx] = useState(0); const [left, setLeft] = useState(Math.round((due - (Date.now() + offset.current)) / 1000));
  const [online, setOnline] = useState(navigator.onLine); const [saved, setSaved] = useState('saved'); const [done, setDone] = useState(null); const [confirm, setConfirm] = useState(false); const [busy, setBusy] = useState(false);
  const seq = useRef(d.seq || 0); const dirty = useRef({}); const receipt = useRef(null); const focus = useRef([]); const inflight = useRef(false); const submitted = useRef(false);
  const it = d.items[idx]; const big = d.access?.largeText;
  const flush = useCallback(async () => {
    if (inflight.current || submitted.current || !Object.keys(dirty.current).length) return; inflight.current = true; const batch = dirty.current; dirty.current = {}; const f = focus.current; focus.current = []; const n = ++seq.current; setSaved('saving');
    try { const r = await apiClient.put(`/assess/take/attempts/${id}/save`, { answers: batch, seq: n, focus: f }); receipt.current = r.data.receipt || receipt.current; setSaved(Object.keys(dirty.current).length ? 'saving' : 'saved'); }
    catch (e) { dirty.current = { ...batch, ...dirty.current }; focus.current = [...f, ...focus.current]; seq.current = n - 1; setSaved(e.response?.status === 422 ? 'late' : 'offline'); }
    finally { inflight.current = false; }
  }, [id]);
  const change = (ref, v) => { setAnswers((a) => { const n = { ...a, [ref]: v }; mem.set(keyOf(id), { answers: n }); return n; }); dirty.current[ref] = v; setSaved('dirty'); };
  useEffect(() => { const t = setInterval(() => { setLeft(Math.round((due - (Date.now() + offset.current)) / 1000)); }, 1000); return () => clearInterval(t); }, [due]);
  useEffect(() => { const t = setInterval(flush, 8000); const q = setTimeout(flush, 1500); return () => { clearInterval(t); clearTimeout(q); }; }, [flush, answers]);
  useEffect(() => { const on = () => { setOnline(true); flush(); }; const off = () => setOnline(false); const blur = () => focus.current.push({ at: Date.now(), kind: 'left' }); const back = () => focus.current.push({ at: Date.now(), kind: 'back' }); const unload = (e) => { if (!submitted.current) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('online', on); window.addEventListener('offline', off); window.addEventListener('blur', blur); window.addEventListener('focus', back); window.addEventListener('beforeunload', unload);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); window.removeEventListener('blur', blur); window.removeEventListener('focus', back); window.removeEventListener('beforeunload', unload); }; }, [flush]);
  const submit = useCallback(async (auto) => {
    if (submitted.current) return; submitted.current = true; setBusy(true); setConfirm(false);
    try { const r = await apiClient.post(`/assess/take/attempts/${id}/submit`, auto ? { receipt: receipt.current } : { answers: { ...dirty.current }, receipt: receipt.current }); mem.del(keyOf(id)); setDone(r.data); }
    catch (e) { submitted.current = false; if (e.response?.status === 409) { mem.del(keyOf(id)); setDone({ status: 'Submitted', note: 'This was already handed in.' }); } else toast.error(errMsg(e, 'Could not hand in. Check your connection; your answers are kept on this device.')); }
    finally { setBusy(false); }
  }, [id]);
  useEffect(() => { if (left <= 0 && !submitted.current) submit(true); }, [left, submit]);
  const unanswered = d.items.filter((x) => !answered(answers[x.ref])).length; const warn = left <= 300;
  const speak = () => { try { const u = new SpeechSynthesisUtterance(it.stemSpeech || plain(it.stem)); speechSynthesis.cancel(); speechSynthesis.speak(u); } catch { toast.error('Reading aloud is not available on this device.'); } };
  return createPortal(
    <div className="fixed inset-0 z-[60] overflow-auto bg-[#f7f6f2]" role="dialog" aria-modal="true" aria-label={d.title}>
      {done ? (
        <div className="mx-auto mt-16 max-w-md rounded-2xl border border-[#e3e7e7] bg-white p-8 text-center"><CheckCircle2 className="mx-auto h-10 w-10 text-[#2c776c]" /><h2 className="mt-3 text-xl font-bold text-[#1b2837]">Handed in</h2><p className="mt-2 text-sm text-[#3b4a5c]">{done.note || 'Your answers were received.'} Your result appears when your teacher releases it.</p><button className={`${btnPrimary} mt-5`} onClick={onExit}>Back to my quizzes</button></div>
      ) : (
        <div className="mx-auto max-w-3xl p-4">
          <div className="sticky top-0 z-10 -mx-4 mb-4 flex flex-wrap items-center gap-3 border-b border-[#e3e7e7] bg-white/95 px-4 py-3 backdrop-blur">
            <div className="min-w-0 grow"><div className="truncate text-sm font-bold text-[#1b2837]">{d.title}</div><div className="text-xs text-[#5b6b7b]">Question {idx + 1} of {d.items.length} · {it.marks} mark{it.marks === 1 ? '' : 's'}</div></div>
            <div role="timer" aria-live={warn ? 'assertive' : 'off'} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-bold ${warn ? 'bg-[#fbf0ec] text-[#8a4636]' : 'bg-[#eef2f8] text-[#234c91]'}`}><Clock className="h-4 w-4" /> {clock(left)}</div>
            <div className="flex items-center gap-1 text-xs text-[#5b6b7b]" aria-live="polite">{online ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4 text-[#8a4636]" />}{!online || saved === 'offline' ? 'No connection. Answers are kept on this device.' : saved === 'saving' || saved === 'dirty' ? 'Saving…' : saved === 'late' ? 'Time is up' : 'Saved'}</div>
          </div>
          <Card>
            <div className={`mb-4 font-medium text-[#1b2837] ${big ? 'text-xl' : 'text-base'}`}><Rich text={it.stem} />{d.access?.readAloud && <button type="button" className={`${btnGhost} ms-3 !px-2 !py-1 align-middle`} onClick={speak} aria-label="Read the question aloud"><Volume2 className="h-4 w-4" /></button>}</div>
            <Answer it={it} value={answers[it.ref]} onChange={(v) => change(it.ref, v)} big={big} />
          </Card>
          <div className="mt-4 flex items-center justify-between"><button className={btnGhost} disabled={idx === 0} onClick={() => setIdx(idx - 1)}><ChevronLeft className="h-4 w-4" /> Back</button>{idx < d.items.length - 1 ? <button className={btnPrimary} onClick={() => setIdx(idx + 1)}>Next <ChevronRight className="h-4 w-4" /></button> : <button className={btnPrimary} onClick={() => setConfirm(true)}>Finish and hand in</button>}</div>
          <nav aria-label="Questions" className="mt-6 flex flex-wrap gap-2">{d.items.map((x, i) => <button key={x.ref} onClick={() => setIdx(i)} aria-label={`Question ${i + 1}${answered(answers[x.ref]) ? ', answered' : ', not answered'}`} className={`h-9 w-9 rounded-lg border text-sm font-semibold ${i === idx ? 'border-[#2a5cac] bg-[#2a5cac] text-white' : answered(answers[x.ref]) ? 'border-[#2c776c] bg-[#edf5f3] text-[#215a52]' : 'border-[#e3e7e7] bg-white text-[#3b4a5c]'}`}>{i + 1}</button>)}<button className={`${btnGhost} !py-1.5`} onClick={() => setConfirm(true)}>Hand in</button></nav>
          <p className="mt-6 text-xs text-[#5b6b7b]">What is recorded: {d.disclosure.join(' ')}</p>
        </div>)}
      {confirm && <Modal title="Hand in now?" onClose={() => setConfirm(false)}><p className="text-sm text-[#3b4a5c]">{unanswered ? `${unanswered} question${unanswered > 1 ? 's are' : ' is'} not answered. ` : 'Every question has an answer. '}You cannot change your answers after handing in.</p><div className="mt-4 flex justify-end gap-2"><button className={btnGhost} onClick={() => setConfirm(false)}>Keep working</button><button className={btnPrimary} disabled={busy} onClick={() => submit(false)}>{busy ? 'Handing in…' : 'Hand in'}</button></div></Modal>}
    </div>, document.body);
}

function Result({ attemptId, onClose }) {
  const g = useGet(`/assess/take/attempts/${attemptId}/result`); const d = g.data; const [reason, setReason] = useState(''); const [refs, setRefs] = useState([]); const [asking, setAsking] = useState(false);
  const go = async () => { try { await apiClient.post(`/assess/take/attempts/${attemptId}/appeal`, { reason, refs }); toast.success('Your appeal was sent'); setAsking(false); g.reload(); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <Modal title={d?.title || 'Result'} onClose={onClose} wide>
      {g.error ? <p className="text-sm text-[#8a4636]">{g.error}</p> : !d ? <div className="skeleton h-32" /> : (
        <div className="grid gap-3 text-sm">
          <div className="flex flex-wrap items-center gap-3"><span className="text-2xl font-bold text-[#1b2837]">{d.total} / {d.max}</span><span className="text-[#3b4a5c]">{d.pct}%</span><Pill value={d.passed ? 'Active' : 'None'}>{d.passed ? 'Passed' : 'Below pass mark'}</Pill>{d.pendingMarks > 0 && <span className="text-[#8a4636]">{d.pendingMarks} answers still being marked</span>}{d.late && <span className="text-xs text-[#5b6b7b]">Handed in late because of the connection</span>}</div>
          {d.resultVersion > 1 && <div className="rounded-lg bg-[#eef2f8] p-2 text-[#234c91]">This result was changed after an appeal (version {d.resultVersion}).</div>}
          <ol className="grid gap-2">{d.items.map((i) => <li key={i.ref} className="rounded-lg border border-[#e3e7e7] p-2"><div className="flex justify-between gap-2"><span><span className="font-semibold">{i.no}.</span> <Rich text={i.plain} /></span><span className="whitespace-nowrap font-semibold">{i.pending ? 'Marking…' : `${i.score} / ${i.max}`}</span></div>{i.feedback && <div className="mt-1 text-xs text-[#3b4a5c]">Teacher: {i.feedback}</div>}{i.options && <div className="mt-1 text-xs text-[#215a52]">Correct: {i.options.filter((o) => o.correct).map((o) => o.text).join(', ') || (Array.isArray(i.correct) ? i.correct.join(', ') : i.correct)}{i.explanation ? ` — ${i.explanation}` : ''}</div>}{!i.options && i.correct !== undefined && <div className="mt-1 text-xs text-[#215a52]">Correct: {Array.isArray(i.correct) ? i.correct.join(', ') : String(i.correct)}</div>}{d.canAppeal && asking && <label className="mt-1 flex items-center gap-1 text-xs"><input type="checkbox" checked={refs.includes(i.ref)} onChange={(e) => setRefs(e.target.checked ? [...refs, i.ref] : refs.filter((x) => x !== i.ref))} /> This is the answer I am asking about</label>}</li>)}</ol>
          {d.appeal && <div className="rounded-lg bg-[#f7f6f2] p-3"><div className="font-semibold">Appeal: {d.appeal.status}</div>{d.appeal.note && <div>{d.appeal.note}</div>}{d.appeal.status === 'Revised' && <div>Your mark changed from {d.appeal.before} to {d.appeal.after}.</div>}</div>}
          {d.canAppeal && !asking && <div className="flex items-center justify-between"><span className="text-xs text-[#5b6b7b]">You can ask for a second look until {dt(d.appealBy)}.</span><button className={btnGhost} onClick={() => setAsking(true)}>Ask for a second look</button></div>}
          {asking && <div className="grid gap-2"><Field label="What do you think is wrong?"><textarea className={inputCls} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Field><div className="flex justify-end gap-2"><button className={btnGhost} onClick={() => setAsking(false)}>Cancel</button><button className={btnPrimary} disabled={reason.trim().length < 10} onClick={go}>Send appeal</button></div></div>}
        </div>)}
    </Modal>
  );
}

export default function TakeQuiz() {
  const g = useGet('/assess/take/available'); const [run, setRun] = useState(null); const [ask, setAsk] = useState(null); const [idn, setIdn] = useState(''); const [res, setRes] = useState(null); const [busy, setBusy] = useState(false);
  const rows = g.data?.assessments || [];
  const start = async (a, identity) => { setBusy(true); try { const r = await apiClient.post(`/assess/take/${a._id}/start`, identity ? { identity } : {}); setAsk(null); setRun(r.data); } catch (e) { toast.error(errMsg(e, 'Could not start')); } finally { setBusy(false); } };
  const begin = (a) => (a.identity !== 'login' && !a.inProgressId ? (setIdn(''), setAsk(a)) : start(a));
  if (run) return <Runner boot={run} onExit={() => { setRun(null); g.reload(); }} />;
  return (
    <div className="grid gap-3">
      {g.loading && !g.data ? <div className="skeleton h-24" /> : g.error ? <EmptyState title={g.error} action={<button className={btnGhost} onClick={g.reload}>Try again</button>} /> : rows.length === 0 ? <EmptyState title="No quizzes yet" text="When a teacher sets a quiz for your class it appears here." /> : rows.map((a) => (
        <Card key={a._id}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><div className="text-base font-bold text-[#1b2837]">{a.title}</div><div className="text-xs text-[#5b6b7b]">{a.kind === 'exam' ? 'Exam' : 'Quiz'} · {a.questions} questions · {a.totalMarks} marks · {a.durationMin} minutes{a.extraTimePct ? ` (+${a.extraTimePct}%)` : ''} · attempt {Math.min(a.attemptsUsed + (a.inProgressId ? 0 : 1), a.attemptsAllowed)} of {a.attemptsAllowed}</div>
              <div className="mt-1 text-xs text-[#3b4a5c]">{a.opensAt ? `Opens ${dt(a.opensAt)}. ` : ''}{a.closesAt ? `Closes ${dt(a.closesAt)}.` : ''}{a.makeup ? ' (make-up window)' : ''}</div>{a.instructions && <p className="mt-2 text-sm text-[#3b4a5c]">{a.instructions}</p>}</div>
            <div className="flex flex-col items-end gap-2">
              {a.state === 'open' && <button className={btnPrimary} disabled={busy} onClick={() => begin(a)}>{a.inProgressId ? 'Carry on' : 'Start'}</button>}
              {a.state === 'upcoming' && <Pill value="Pending">Not open yet</Pill>}{a.state === 'closed' && <Pill value="None">Closed</Pill>}{a.state === 'done' && <Pill value="Approved">Handed in</Pill>}
              {a.result ? <button className={btnGhost} onClick={() => setRes(a.result.attemptId)}>{a.result.total} / {a.result.max} · View result</button> : a.attempts.some((x) => x.status !== 'InProgress') && <span className="text-xs text-[#5b6b7b]">Result not released yet</span>}
            </div>
          </div>
        </Card>))}
      {ask && <Modal title={ask.identity === 'admission' ? 'Confirm it is you' : 'Invigilator code'} onClose={() => setAsk(null)}><div className="grid gap-3"><p className="text-sm text-[#3b4a5c]">{ask.identity === 'admission' ? 'Type your admission number.' : 'Your invigilator will tell you today\'s six-digit code.'}</p><input aria-label={ask.identity === 'admission' ? 'Admission number' : 'Code'} className={inputCls} value={idn} onChange={(e) => setIdn(e.target.value)} autoFocus />
        <div className="rounded-lg bg-[#f7f6f2] p-3 text-xs text-[#3b4a5c]">Before you start: {g.data?.disclosure?.join(' ')} The timer is kept by the school's server and keeps running if you lose your connection.</div><div className="flex justify-end"><button className={btnPrimary} disabled={!idn.trim() || busy} onClick={() => start(ask, ask.identity === 'admission' ? { admission: idn.trim() } : { code: idn.trim() })}>Start</button></div></div></Modal>}
      {res && <Result attemptId={res} onClose={() => { setRes(null); g.reload(); }} />}
    </div>
  );
}
