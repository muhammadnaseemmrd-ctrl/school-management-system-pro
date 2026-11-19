import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Printer, KeyRound, Clock, Lock, Send, CheckCircle2, XCircle, BarChart3, Users } from 'lucide-react';
import { toast } from 'react-hot-toast';
import apiClient from '../../utils/apiClient';
import { Card, Field, Modal, Pill, btnPrimary, btnGhost, btnDanger, inputCls, errMsg } from '../ui';
import { Bar, Body, Row, Sub, Td, Tbl, useList } from '../attendance/deskKit';
import { call, useGet } from '../timetable/planKit';
import { Rich, KIND_LABEL, STATE_TONE, dt, fromLocalInput, toLocalInput, newId } from './assessKit';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function printPaper(p, key) {
  const items = p.items.map((i) => `<div style="margin:14px 0;page-break-inside:avoid"><b>${i.no}.</b> ${esc(i.plain || i.stem)} <i>[${i.marks}]</i>${(i.options || []).length ? `<ol type="A" style="margin:6px 0 0 22px">${i.options.map((o) => `<li>${esc(o.text)}${key && o.correct ? ' ✔' : ''}</li>`).join('')}</ol>` : ''}${i.pairs ? `<table style="margin-top:6px">${i.pairs.map((x) => `<tr><td>${esc(x.left)}</td><td>&nbsp;—&nbsp;</td><td>${esc(x.right)}</td></tr>`).join('')}</table>` : ''}${key && i.accepted ? `<div>Accepted: ${esc(i.accepted.join(', '))}</div>` : ''}${key && i.numAnswer !== undefined && i.numAnswer !== null ? `<div>Answer: ${esc(i.numAnswer)}</div>` : ''}${key && i.explanation ? `<div style="color:#555">${esc(i.explanation)}</div>` : ''}</div>`).join('');
  const html = `<!doctype html><meta charset="utf-8"><title>${esc(p.title)}</title><body style="font-family:Georgia,serif;max-width:720px;margin:24px auto;padding:0 16px"><h2>${esc(p.title)}${key ? ' — answer key' : ''}</h2><p>Time allowed: ${p.durationMin} minutes · Total marks: ${p.totalMarks}</p><p>${esc(p.instructions)}</p>${items}<script>window.onload=function(){window.print()}</script>`;
  const u = URL.createObjectURL(new Blob([html], { type: 'text/html' })); window.open(u, '_blank'); setTimeout(() => URL.revokeObjectURL(u), 60000);
}

function Picker({ chosen, onDone, onClose }) {
  const [q, setQ] = useState(''); const l = useList('/assess/bank', 'items', { state: 'Active', q: q || undefined, per: 50 }); const [sel, setSel] = useState(() => Object.fromEntries(chosen.map((c) => [c.itemId, c.marks])));
  const [seen, setSeen] = useState({}); useEffect(() => { setSeen((s) => ({ ...s, ...Object.fromEntries(l.rows.map((r) => [r._id, r])) })); }, [l.rows]);
  const flip = (i) => setSel((s) => { const n = { ...s }; if (n[i._id] !== undefined) delete n[i._id]; else n[i._id] = i.marks; return n; });
  return (
    <Modal title="Choose questions" onClose={onClose} wide>
      <input aria-label="Search questions" className={`${inputCls} mb-3`} placeholder="Search your questions and ones colleagues have shared" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="max-h-[50vh] overflow-auto rounded-lg border border-[#e3e7e7]">
        {l.loading ? <div className="skeleton m-3 h-20" /> : l.rows.length === 0 ? <p className="p-4 text-sm text-[#5b6b7b]">No active questions found. Questions must be made active in the bank first.</p> : l.rows.map((i) => (
          <div key={i._id} className="flex items-center gap-3 border-b border-[#e3e7e7] px-3 py-2 last:border-0">
            <input type="checkbox" aria-label="Use this question" checked={sel[i._id] !== undefined} onChange={() => flip(i)} />
            <div className="min-w-0 grow text-sm"><Rich text={i.stem.length > 140 ? `${i.stem.slice(0, 140)}…` : i.stem} /><Sub>{KIND_LABEL[i.kind]} · {i.topic || 'no topic'} · {i.difficulty}</Sub></div>
            {sel[i._id] !== undefined && <input aria-label="Marks" type="number" min="0.25" step="0.25" className={`${inputCls} !w-20`} value={sel[i._id]} onChange={(e) => setSel({ ...sel, [i._id]: e.target.value })} />}
          </div>))}
      </div>
      <div className="mt-3 flex items-center justify-between"><span className="text-sm text-[#5b6b7b]">{Object.keys(sel).length} chosen · {Object.values(sel).reduce((s, x) => s + Number(x || 0), 0)} marks</span>
        <button className={btnPrimary} onClick={() => { onDone(Object.entries(sel).map(([itemId, marks]) => ({ itemId, marks, stem: seen[itemId]?.stem, kind: seen[itemId]?.kind }))); onClose(); }}>Use these</button></div>
    </Modal>
  );
}

function Editor({ id, meta, classes, onClose, onSaved }) {
  const blank = { title: '', kind: 'quiz', classIds: [], subjectId: '', instructions: '', settings: { durationMin: 30, attemptsMax: 1, scoring: 'best', shuffleQuestions: true, shuffleOptions: true, resume: 'resume', identity: 'login', passPct: 40, showAnswers: false, dualMarking: false, discrepancyPct: 15, appealDays: 7, reconnectGraceMin: 5, offlineGraceMin: 15, opensAt: '', closesAt: '' } };
  const [a, setA] = useState(null); const [refs, setRefs] = useState([]); const [pick, setPick] = useState(false); const [rules, setRules] = useState([{ id: newId(), topic: '', difficulty: '', kind: '', count: 3 }]); const [bp, setBp] = useState(null); const [busy, setBusy] = useState(false); const [savedId, setSavedId] = useState(id);
  useEffect(() => { if (!id) { setA(blank); return; } apiClient.get(`/assess/quizzes/${id}`).then((r) => { const x = r.data.assessment; setA({ ...blank, ...x, subjectId: x.subjectId || '', classIds: x.classIds.map(String), settings: { ...blank.settings, ...x.settings, opensAt: toLocalInput(x.settings.opensAt), closesAt: toLocalInput(x.settings.closesAt) } }); setRefs(x.items.map((i) => ({ itemId: i.ref, marks: i.marks, stem: i.stem, kind: i.kind }))); if (x.blueprint?.rules?.length) setRules(x.blueprint.rules); }).catch((e) => { toast.error(errMsg(e)); onClose(); }); }, [id]); // eslint-disable-line
  if (!a) return <Modal title="Quiz" onClose={onClose} wide><div className="skeleton h-40" /></Modal>;
  const set = (p) => setA((x) => ({ ...x, ...p })); const st = (p) => setA((x) => ({ ...x, settings: { ...x.settings, ...p } })); const locked = savedId && !['Draft', 'Review'].includes(a.status); const total = refs.reduce((s, r) => s + Number(r.marks || 0), 0);
  const body = () => ({ title: a.title, kind: a.kind, classIds: a.classIds, subjectId: a.subjectId || undefined, instructions: a.instructions, settings: { ...a.settings, opensAt: fromLocalInput(a.settings.opensAt), closesAt: fromLocalInput(a.settings.closesAt) }, itemRefs: refs.map((r) => ({ itemId: r.itemId, marks: r.marks })) });
  const save = async () => { setBusy(true); const r = await call(() => (savedId ? apiClient.put(`/assess/quizzes/${savedId}`, body()) : apiClient.post('/assess/quizzes', body())), 'Saved'); setBusy(false); if (r) { setSavedId(r.data.assessment._id); onSaved(); return r.data.assessment._id; } return null; };
  const previewBp = async () => { const sid = savedId || await save(); if (!sid) return; const r = await call(() => apiClient.post(`/assess/quizzes/${sid}/blueprint/preview`, { rules })); if (r) setBp(r.data); };
  const applyBp = async (allowShort) => { const sid = savedId || await save(); if (!sid) return; const r = await call(() => apiClient.post(`/assess/quizzes/${sid}/blueprint/apply`, { rules, allowShort, salt: bp?.salt }), 'Questions chosen from the blueprint'); if (r) { setRefs(r.data.assessment.items.map((i) => ({ itemId: i.ref, marks: i.marks, stem: i.stem, kind: i.kind }))); setBp(null); onSaved(); } };
  const toggleClass = (c) => set({ classIds: a.classIds.includes(c) ? a.classIds.filter((x) => x !== c) : [...a.classIds, c] });
  return (
    <Modal title={savedId ? 'Edit quiz' : 'New quiz or exam'} onClose={onClose} wide>
      <div className="grid gap-3">
        {locked && <div className="rounded-lg bg-[#fbf0ec] p-3 text-sm text-[#8a4636]">A published quiz cannot be edited. You can extend its window or close it from the quiz page.</div>}
        <fieldset disabled={locked} className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-3"><div className="sm:col-span-2"><Field label="Title"><input className={inputCls} value={a.title} onChange={(e) => set({ title: e.target.value })} /></Field></div>
            <Field label="Kind"><select className={inputCls} value={a.kind} onChange={(e) => set({ kind: e.target.value })}><option value="quiz">Quiz (you can publish it)</option><option value="exam">Exam (needs approval)</option></select></Field></div>
          <div className="grid gap-3 sm:grid-cols-2"><Field label="Subject"><select className={inputCls} value={a.subjectId} onChange={(e) => set({ subjectId: e.target.value })}><option value="">Any</option>{meta.subjects.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}</select></Field>
            <Field label="Classes"><div className="flex flex-wrap gap-2 rounded-lg border border-[#e3e7e7] p-2">{classes.map((c) => <label key={c._id} className={`cursor-pointer rounded-md border px-2 py-1 text-xs ${a.classIds.includes(c._id) ? 'border-[#2a5cac] bg-[#eef2f8] text-[#234c91]' : 'border-[#e3e7e7]'}`}><input type="checkbox" className="sr-only" checked={a.classIds.includes(c._id)} onChange={() => toggleClass(c._id)} />{c.standard}-{c.division}</label>)}</div></Field></div>
          <Field label="Instructions for students"><textarea className={inputCls} rows={2} value={a.instructions} onChange={(e) => set({ instructions: e.target.value })} /></Field>
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Minutes allowed"><input className={inputCls} type="number" min="1" value={a.settings.durationMin} onChange={(e) => st({ durationMin: e.target.value })} /></Field>
            <Field label="Attempts"><input className={inputCls} type="number" min="1" max="10" value={a.settings.attemptsMax} onChange={(e) => st({ attemptsMax: e.target.value })} /></Field>
            <Field label="Which score counts"><select className={inputCls} value={a.settings.scoring} onChange={(e) => st({ scoring: e.target.value })}><option value="best">Best</option><option value="last">Last</option><option value="average">Average</option></select></Field>
            <Field label="Pass mark %"><input className={inputCls} type="number" min="0" max="100" value={a.settings.passPct} onChange={(e) => st({ passPct: e.target.value })} /></Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2"><Field label={`Opens${a.kind === 'exam' ? '' : ' (optional)'}`}><input className={inputCls} type="datetime-local" value={a.settings.opensAt} onChange={(e) => st({ opensAt: e.target.value })} /></Field><Field label={`Closes${a.kind === 'exam' ? '' : ' (optional)'}`}><input className={inputCls} type="datetime-local" value={a.settings.closesAt} onChange={(e) => st({ closesAt: e.target.value })} /></Field></div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Check who is writing"><select className={inputCls} value={a.settings.identity} onChange={(e) => st({ identity: e.target.value })}><option value="login">Signed-in account only</option><option value="admission">Student types admission number</option><option value="invigilator">Invigilator\'s daily code</option></select></Field>
            <Field label="If the connection drops"><select className={inputCls} value={a.settings.resume} onChange={(e) => st({ resume: e.target.value })}><option value="resume">Student can carry on until time ends</option><option value="single-sitting">Single sitting: only a short gap is allowed</option></select></Field>
            <Field label="Late hand-in grace (minutes)" hint="Answers saved in time can still be handed in this long after the deadline."><input className={inputCls} type="number" min="0" max="60" value={a.settings.offlineGraceMin} onChange={(e) => st({ offlineGraceMin: e.target.value })} /></Field>
          </div>
          <div className="flex flex-wrap gap-4 text-sm">{[['shuffleQuestions', 'Shuffle questions'], ['shuffleOptions', 'Shuffle choices'], ['showAnswers', 'Show answers after the quiz closes'], ['dualMarking', 'Two markers for written answers']].map(([k, v]) => <label key={k} className="flex items-center gap-1.5"><input type="checkbox" checked={!!a.settings[k]} onChange={(e) => st({ [k]: e.target.checked })} /> {v}</label>)}</div>
          {a.settings.dualMarking && <div className="grid gap-3 sm:grid-cols-2"><Field label="Send to a third marker when marks differ by more than (% of the question)"><input className={inputCls} type="number" min="1" max="50" value={a.settings.discrepancyPct} onChange={(e) => st({ discrepancyPct: e.target.value })} /></Field></div>}

          <div className="rounded-xl border border-[#e3e7e7] p-3">
            <div className="mb-2 flex items-center justify-between"><h4 className="text-sm font-semibold">Questions ({refs.length}, {total} marks)</h4><button type="button" className={btnGhost} onClick={() => setPick(true)}>Choose from the bank</button></div>
            {refs.length === 0 ? <p className="text-sm text-[#5b6b7b]">None yet. Choose questions, or fill a blueprint below.</p> : <ol className="grid gap-1">{refs.map((r, i) => <li key={r.itemId} className="flex items-center gap-2 text-sm"><span className="w-5 text-xs text-[#5b6b7b]">{i + 1}.</span><span className="min-w-0 grow"><Rich text={(r.stem || KIND_LABEL[r.kind] || 'Question').slice(0, 120)} /></span><input aria-label="Marks" className={`${inputCls} !w-20`} type="number" min="0.25" step="0.25" value={r.marks} onChange={(e) => setRefs(refs.map((x, n) => (n === i ? { ...x, marks: e.target.value } : x)))} /><button type="button" className="text-xs text-[#9f1239]" aria-label="Remove question" onClick={() => setRefs(refs.filter((_, n) => n !== i))}>✕</button></li>)}</ol>}
          </div>
          <details className="rounded-xl border border-[#e3e7e7] p-3"><summary className="cursor-pointer text-sm font-semibold">Pick by blueprint (a balanced paper from the bank)</summary>
            <div className="mt-3 grid gap-2">{rules.map((r, i) => <div key={r.id} className="grid grid-cols-2 gap-2 sm:grid-cols-5"><select aria-label="Topic" className={inputCls} value={r.topic} onChange={(e) => setRules(rules.map((x, n) => (n === i ? { ...x, topic: e.target.value } : x)))}><option value="">Any topic</option>{meta.topics.map((t) => <option key={t}>{t}</option>)}</select>
              <select aria-label="Difficulty" className={inputCls} value={r.difficulty} onChange={(e) => setRules(rules.map((x, n) => (n === i ? { ...x, difficulty: e.target.value } : x)))}><option value="">Any difficulty</option>{['Easy', 'Medium', 'Hard'].map((d) => <option key={d}>{d}</option>)}</select>
              <select aria-label="Type" className={inputCls} value={r.kind} onChange={(e) => setRules(rules.map((x, n) => (n === i ? { ...x, kind: e.target.value } : x)))}><option value="">Any type</option>{Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              <input aria-label="How many" type="number" min="1" className={inputCls} value={r.count} onChange={(e) => setRules(rules.map((x, n) => (n === i ? { ...x, count: e.target.value } : x)))} /><button type="button" className="text-xs text-[#9f1239]" onClick={() => setRules(rules.filter((_, n) => n !== i))}>Remove rule</button></div>)}
              <div className="flex flex-wrap gap-2"><button type="button" className="text-xs font-semibold text-[#2a5cac]" onClick={() => setRules([...rules, { id: newId(), topic: '', difficulty: '', kind: '', count: 1 }])}>+ Add rule</button><span className="grow" /><button type="button" className={btnGhost} onClick={previewBp}>Preview</button></div>
              {bp && <div className="rounded-lg bg-[#f7f6f2] p-3 text-sm"><div>{bp.picked.length} questions, {bp.totalMarks} marks. Easy/Medium/Hard: {['Easy', 'Medium', 'Hard'].map((d) => bp.balance.difficulty[d] || 0).join(' / ')}</div>{bp.short.length > 0 && <div className="mt-1 text-[#8a4636]">The bank is short for {bp.short.length} rule{bp.short.length > 1 ? 's' : ''}: {bp.short.map((s) => `${s.topic || 'any'} ${s.difficulty || ''} (wanted ${s.wanted}, found ${s.found})`).join('; ')}</div>}
                <div className="mt-2 flex gap-2"><button type="button" className={btnPrimary} onClick={() => applyBp(false)}>Use this paper</button>{bp.short.length > 0 && <button type="button" className={btnGhost} onClick={() => applyBp(true)}>Use what exists</button>}</div></div>}
            </div></details>
        </fieldset>
        {!locked && <div className="flex justify-end gap-2"><button className={btnGhost} onClick={onClose}>Close</button><button className={btnPrimary} disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button></div>}
      </div>
      {pick && <Picker chosen={refs} onClose={() => setPick(false)} onDone={(sel) => setRefs(sel.map((s) => ({ ...s, stem: s.stem || refs.find((r) => r.itemId === s.itemId)?.stem })))} />}
    </Modal>
  );
}

function Detail({ id, isAdmin, onClose, onChanged }) {
  const g = useGet(`/assess/quizzes/${id}`); const roster = useGet(`/assess/quizzes/${id}/roster`); const [tab, setTab] = useState('overview'); const [an, setAn] = useState(null); const [code, setCode] = useState(null);
  const a = g.data?.assessment; const reload = () => { g.reload(); roster.reload(); onChanged(); };
  const post = async (path, ok, body, method = 'post') => { const r = await call(() => apiClient[method](`/assess/quizzes/${id}${path}`, body), ok); if (r) reload(); return r; };
  const ask = (msg, min = 5) => { const v = window.prompt(msg); return v && v.trim().length >= min ? v.trim() : null; };
  const paper = async (key) => { try { const r = await apiClient.get(`/assess/quizzes/${id}/paper`, { params: { key: key ? 1 : 0 } }); printPaper(r.data, key); } catch (e) { toast.error(errMsg(e)); } };
  const loadAnalysis = async () => { const r = await call(() => apiClient.get(`/assess/quizzes/${id}/analysis`)); if (r) setAn(r.data); };
  useEffect(() => { if (tab === 'analysis') loadAnalysis(); }, [tab]); // eslint-disable-line
  if (!a) return <Modal title="Quiz" onClose={onClose} wide><div className="skeleton h-40" /></Modal>;
  const released = roster.data?.released; const rows = roster.data?.rows || [];
  return (
    <Modal title={a.title} onClose={onClose} wide>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm"><Pill value={STATE_TONE[a.status]}>{a.status}</Pill><span className="text-[#5b6b7b]">{a.kind === 'exam' ? 'Exam' : 'Quiz'} · {a.items.length} questions · {a.totalMarks} marks · {a.settings.durationMin} min</span>{a.status === 'Published' && <Pill value={STATE_TONE[a.release.state]}>Results {a.release.state.toLowerCase()}</Pill>}</div>
      <div className="mb-3 flex flex-wrap gap-2 border-b border-[#e3e7e7]">{[['overview', 'Overview'], ['results', 'Students'], ['analysis', 'Analysis']].map(([k, v]) => <button key={k} onClick={() => setTab(k)} className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold ${tab === k ? 'border-[#2a5cac] text-[#2a5cac]' : 'border-transparent text-[#5b6b7b]'}`}>{v}</button>)}</div>
      {tab === 'overview' && (
        <div className="grid gap-3 text-sm">
          <div className="grid gap-1 text-[#3b4a5c]"><div>Opens: {dt(a.settings.opensAt)} · Closes: {dt(a.settings.closesAt)}</div><div>Identity check: {a.settings.identity === 'login' ? 'signed-in account' : a.settings.identity === 'admission' ? 'admission number' : 'invigilator code'} · Pass mark {a.settings.passPct}%</div>{a.review?.decidedByName && <div>{a.status === 'Draft' ? 'Sent back by' : 'Approved by'} {a.review.decidedByName}{a.review.note ? ` — ${a.review.note}` : ''}</div>}{a.review?.note && a.status === 'Draft' && <div className="rounded-lg bg-[#fbf0ec] p-2 text-[#8a4636]">Sent back: {a.review.note}</div>}</div>
          {a.keySealed && a.status === 'Published' && <div className="flex items-center gap-2 rounded-lg bg-[#eef2f8] p-3 text-[#234c91]"><Lock className="h-4 w-4" /> The answer key is sealed until the quiz closes{a.keyAuthorizedAt ? '' : ' or an administrator authorises it'}.</div>}
          <div className="flex flex-wrap gap-2">
            <button className={btnGhost} onClick={() => paper(false)}><Printer className="h-4 w-4" /> Print paper</button>
            {!a.keySealed && <button className={btnGhost} onClick={() => paper(true)}><KeyRound className="h-4 w-4" /> Print answer key</button>}
            {a.settings.identity === 'invigilator' && <button className={btnGhost} onClick={async () => { const r = await call(() => apiClient.get(`/assess/quizzes/${id}/invigilator-code`)); if (r) setCode(r.data.code); }}>Today's invigilator code</button>}
            {a.status === 'Draft' && a.kind === 'quiz' && <button className={btnPrimary} onClick={() => post('/publish', 'Published')}><Send className="h-4 w-4" /> Publish</button>}
            {a.status === 'Draft' && a.kind === 'exam' && <button className={btnPrimary} onClick={() => post('/submit-review', 'Sent for review')}><Send className="h-4 w-4" /> Send for review</button>}
            {a.status === 'Review' && isAdmin && <><button className={btnPrimary} onClick={() => post('/approve', 'Approved and published', { note: '' })}><CheckCircle2 className="h-4 w-4" /> Approve and publish</button><button className={btnGhost} onClick={() => { const n = ask('What needs to change?', 3); if (n) post('/reject', 'Sent back', { note: n }); }}><XCircle className="h-4 w-4" /> Send back</button></>}
            {a.status === 'Published' && <><button className={btnGhost} onClick={() => { const r = ask('Why is the key being released early? (administrators only)'); if (r) post('/authorize-key', 'Released', { reason: r }); }} hidden={!isAdmin || !a.keySealed}>Release paper and key early</button><button className={btnGhost} onClick={() => { const to = window.prompt('New closing time (YYYY-MM-DD HH:MM)'); const why = to && ask('Why is the window being extended?'); if (to && why) post('/extend', 'Window extended', { closesAt: new Date(to.replace(' ', 'T')).toISOString(), reason: why }); }}><Clock className="h-4 w-4" /> Extend</button><button className={btnDanger} onClick={() => { if (window.confirm('Close now? Anyone still writing is handed in with what they have saved.')) post('/close', 'Closed'); }}>Close now</button></>}
            {['Closed', 'Draft'].includes(a.status) && <button className={btnGhost} onClick={() => post('/archive', 'Archived')}>Archive</button>}
          </div>
          {code && <div className="rounded-lg border border-[#e3e7e7] p-3 text-center"><div className="text-xs text-[#5b6b7b]">Read this out in the room. It changes every day.</div><div className="font-mono text-3xl tracking-widest">{code}</div></div>}
          <ol className="grid gap-1 text-[#3b4a5c]">{a.items.map((i, n) => <li key={i.ref}>{n + 1}. <Rich text={(i.stem || '').slice(0, 130)} /> <span className="text-xs text-[#5b6b7b]">({KIND_LABEL[i.kind]}, {i.marks})</span></li>)}</ol>
        </div>
      )}
      {tab === 'results' && (
        <div className="grid gap-3">
          {roster.data && <div className="flex flex-wrap items-center gap-3 text-sm"><span>{roster.data.summary.submitted} of {roster.data.summary.students} have finished</span><span>{roster.data.summary.notStarted} not started</span><span>{roster.data.summary.marking} answers waiting for a marker</span><span className="grow" />
            {!released && ['Published', 'Closed'].includes(a.status) && (a.kind === 'quiz' || isAdmin) && <><button className={btnPrimary} onClick={() => post('/release', 'Results released', {})}>Release results</button><button className={btnGhost} onClick={() => { const at = window.prompt('Release at (YYYY-MM-DD HH:MM)'); if (at) post('/release', 'Release scheduled', { mode: 'schedule', at: new Date(at.replace(' ', 'T')).toISOString() }); }}>Schedule</button>{isAdmin && <button className={btnGhost} onClick={() => { const r = ask('Why release now, with the quiz still open or marking unfinished?'); if (r) post('/release', 'Released early', { force: true, reason: r }); }}>Release anyway…</button>}</>}
            {released && <Pill value="Active">Released</Pill>}</div>}
          <Tbl head={['Student', 'Attempts', 'Score counted', 'Notes']}>{rows.map((r) => <Row key={r.studentId}><Td>{r.name}<Sub>{r.admissionNumber}</Sub></Td><Td>{r.attempts.length ? r.attempts.map((x) => <div key={x._id}>#{x.no} <Pill value={STATE_TONE[x.status]}>{x.status}</Pill>{x.late ? ' late (connection)' : ''}</div>) : <span className="text-[#5b6b7b]">Not started</span>}</Td><Td>{r.counted ? `${r.counted.total} / ${r.counted.max} (${r.counted.pct}%) ${r.counted.passed ? 'Pass' : 'Below pass mark'}` : '—'}</Td><Td>{r.attempts.some((x) => x.incidents) ? 'Incident noted. ' : ''}{r.attempts.some((x) => x.focusLeft) ? `Left the window ${r.attempts.reduce((s, x) => s + x.focusLeft, 0)}×` : ''}{isAdmin && r.attempts.filter((x) => !x.voided).slice(-1).map((x) => <button key={x._id} className="ms-2 text-xs text-[#9f1239]" onClick={async () => { const why = ask('Why is this attempt being cancelled?'); if (why) { const z = await call(() => apiClient.post(`/assess/grading/attempts/${x._id}/void`, { reason: why }), 'Attempt voided'); if (z) reload(); } }}>Void attempt</button>)}</Td></Row>)}</Tbl>
        </div>
      )}
      {tab === 'analysis' && (an ? (
        <div className="grid gap-3 text-sm">
          <div className="flex flex-wrap gap-4"><span>{an.n} finished attempts</span><span>Average {an.mean}</span><span>Spread {an.sd}</span><span>Highest {an.high ?? '—'}</span><span>Lowest {an.low ?? '—'}</span><span>Pass rate {an.passRate ?? '—'}%</span></div>
          {an.note && <div className="rounded-lg bg-[#eef2f8] p-2 text-[#234c91]">{an.note}</div>}
          <Tbl head={['Question', 'Right', 'Separates strong from weak', 'Flags']}>{an.items.map((i) => <Row key={i.ref}><Td>{i.no}. <Rich text={(i.plain || '').slice(0, 90)} /><Sub>{KIND_LABEL[i.kind]} · {i.topic || ''}</Sub></Td><Td>{i.facility === null ? '—' : `${Math.round(i.facility * 100)}%`}<Sub>{i.interval ? `likely ${Math.round(i.interval[0] * 100)}–${Math.round(i.interval[1] * 100)}%` : ''}</Sub></Td><Td>{i.discrimination === null || i.discrimination === undefined ? '—' : i.discrimination.toFixed(2)}</Td><Td>{(i.flags || []).join(', ') || '—'}{i.options?.length > 0 && <Sub>{i.options.map((o) => `${o.correct ? '✔ ' : ''}${o.text}: ${o.picked}`).join(' · ')}</Sub>}</Td></Row>)}</Tbl>
          <div className="flex justify-end"><button className={btnGhost} onClick={async () => { const r = await call(() => apiClient.post(`/assess/quizzes/${id}/analysis/apply`), (x) => `${x.data.updated} questions updated in the bank`); if (r) onChanged(); }}>Save these figures to the question bank</button></div>
        </div>) : <div className="skeleton h-24" />)}
    </Modal>
  );
}

export default function QuizDesk({ isAdmin }) {
  const l = useList('/assess/quizzes', 'assessments', {}); const [edit, setEdit] = useState(undefined); const [open, setOpen] = useState(null); const metaG = useGet('/assess/bank/meta'); const [classes, setClasses] = useState([]);
  useEffect(() => { apiClient.get('/classes', { params: { limit: 200 } }).then((r) => setClasses(r.data.classes || [])).catch(() => {}); }, []);
  const meta = metaG.data || { subjects: [], topics: [] };
  return (
    <Card className="!p-0 overflow-hidden">
      <Bar><span className="text-sm font-semibold">Quizzes and online exams</span><span className="grow" /><button className={btnPrimary} onClick={() => setEdit(null)}><Plus className="h-4 w-4" /> New quiz or exam</button></Bar>
      <Body l={l} cols={5} empty="No quizzes yet. Make some questions in the bank, then build your first quiz.">
        <Tbl head={['Title', 'Status', 'Window', 'Students', '']}>{l.rows.map((a) => <Row key={a._id}><Td><button className="text-start font-medium hover:underline" onClick={() => setOpen(a._id)}>{a.title}</button><Sub>{a.kind === 'exam' ? 'Exam' : 'Quiz'} · {a.itemCount} questions · {a.totalMarks} marks · {a.authorName}</Sub></Td><Td><Pill value={STATE_TONE[a.status]}>{a.status}</Pill>{a.status === 'Published' && <Sub>Results {a.release.state.toLowerCase()}</Sub>}</Td><Td>{a.settings.opensAt ? dt(a.settings.opensAt) : 'Any time'}<Sub>{a.settings.closesAt ? `to ${dt(a.settings.closesAt)}` : ''}</Sub></Td><Td>{a.counts.submitted} done<Sub>{a.counts.marking ? `${a.counts.marking} waiting for marking` : `${a.counts.started} started`}</Sub></Td><Td>{['Draft', 'Review'].includes(a.status) && <button className="text-xs font-semibold text-[#2a5cac]" onClick={() => setEdit(a._id)}>Edit</button>}</Td></Row>)}</Tbl>
      </Body>
      {edit !== undefined && <Editor id={edit} meta={meta} classes={classes} onClose={() => setEdit(undefined)} onSaved={() => { l.reload(); metaG.reload(); }} />}
      {open && <Detail id={open} isAdmin={isAdmin} onClose={() => setOpen(null)} onChanged={l.reload} />}
    </Card>
  );
}
