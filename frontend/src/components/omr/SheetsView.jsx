import React, { useEffect, useState } from 'react';
import { Plus, Printer } from 'lucide-react';
import { toast } from 'react-hot-toast';
import apiClient from '../../utils/apiClient';
import { Card, Field, Modal, Pill, btnPrimary, btnGhost, inputCls, errMsg } from '../ui';
import { Bar, Body, Row, Sub, Td, Tbl, useList } from '../attendance/deskKit';
import { call, useGet } from '../timetable/planKit';
import { FORM_TONE, openPdf, dt } from './omrKit';

const classLabel = (c) => `${c.standard}${c.division ? '-' + c.division : ''}`;

function NewSheet({ onClose, onSaved }) {
  const [classes, setClasses] = useState([]); const [subjects, setSubjects] = useState([]); const [exams, setExams] = useState([]);
  const [f, setF] = useState({ title: '', classId: '', subjectId: '', examId: '', questions: 40, choices: 4, idDigits: 6, marksPerQuestion: 1, negative: 0 }); const [busy, setBusy] = useState(false); const set = (p) => setF((x) => ({ ...x, ...p }));
  useEffect(() => { apiClient.get('/classes', { params: { limit: 200 } }).then((r) => setClasses(r.data.classes || [])).catch(() => {}); apiClient.get('/subjects', { params: { limit: 200 } }).then((r) => setSubjects(r.data.subjects || [])).catch(() => {}); apiClient.get('/marks/exams', { params: { limit: 300 } }).then((r) => setExams(r.data.exams || [])).catch(() => {}); }, []);
  const go = async () => { setBusy(true); const r = await call(() => apiClient.post('/omr/forms', { ...f, subjectId: f.subjectId || undefined, examId: f.examId || undefined }), 'Answer sheet created.', () => { onSaved(); onClose(); }); setBusy(false); return r; };
  const exOpts = exams.filter((e) => !f.classId || String(e.classId?._id || e.classId) === f.classId);
  return (
    <Modal title="New answer sheet" onClose={onClose} wide>
      <div className="grid gap-3">
        <Field label="Title"><input className={inputCls} value={f.title} onChange={(e) => set({ title: e.target.value })} placeholder="Class 7 Maths, term 1" autoFocus /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Class"><select className={inputCls} value={f.classId} onChange={(e) => set({ classId: e.target.value, examId: '' })}><option value="">Choose…</option>{classes.map((c) => <option key={c._id} value={c._id}>Class {classLabel(c)}</option>)}</select></Field>
          <Field label="Subject" hint="Needed to publish marks unless the exam has one"><select className={inputCls} value={f.subjectId} onChange={(e) => set({ subjectId: e.target.value })}><option value="">Not set</option>{subjects.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}</select></Field>
          <Field label="Questions (1 to 100)"><input className={inputCls} type="number" min="1" max="100" value={f.questions} onChange={(e) => set({ questions: e.target.value })} /></Field>
          <Field label="Choices per question"><select className={inputCls} value={f.choices} onChange={(e) => set({ choices: e.target.value })}>{[2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} (A to {'ABCDE'[n - 1]})</option>)}</select></Field>
          <Field label="Marks for a right answer"><input className={inputCls} type="number" min="0.25" step="0.25" value={f.marksPerQuestion} onChange={(e) => set({ marksPerQuestion: e.target.value })} /></Field>
          <Field label="Marks lost for a wrong answer" hint="0 for no negative marking"><input className={inputCls} type="number" min="0" step="0.25" value={f.negative} onChange={(e) => set({ negative: e.target.value })} /></Field>
          <Field label="Candidate number length"><input className={inputCls} type="number" min="3" max="8" value={f.idDigits} onChange={(e) => set({ idDigits: e.target.value })} /></Field>
          <Field label="Exam the marks go to" hint="Can be chosen when publishing"><select className={inputCls} value={f.examId} onChange={(e) => set({ examId: e.target.value })}><option value="">Choose later</option>{exOpts.map((x) => <option key={x._id} value={x._id}>{x.name}</option>)}</select></Field>
        </div>
        <p className="text-xs text-[#5b6b7b]">Every student in the class gets a candidate number. After the first photo is taken, the number of questions and choices cannot change.</p>
        <div className="flex justify-end gap-2"><button className={btnGhost} onClick={onClose}>Cancel</button><button className={btnPrimary} disabled={busy || f.title.trim().length < 3 || !f.classId} onClick={go}>Create sheet</button></div>
      </div>
    </Modal>
  );
}

function KeyEditor({ form, data, reload }) {
  const k = data.key; const n = form.questions; const letters = 'ABCDE'.slice(0, form.choices);
  const [ans, setAns] = useState(() => (k ? [...k.answers] : Array(n).fill(''))); const [paste, setPaste] = useState(''); const [reason, setReason] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { setAns(k ? [...k.answers] : Array(n).fill('')); }, [k?.version, n]); // eslint-disable-line react-hooks/exhaustive-deps
  const setOne = (i, v) => setAns((a) => a.map((x, j) => (j === i ? v : x)));
  const applyPaste = () => { const s = paste.toUpperCase().replace(/[\s,;]+/g, ''); const out = []; for (let i = 0; i < s.length;) { if (s[i] === '(') { const j = s.indexOf(')', i); if (j < 0) break; out.push(s.slice(i + 1, j).split('').join('|')); i = j + 1; } else out.push(s[i++]); } if (out.length !== n) { toast.error(`That has ${out.length} answers; the sheet has ${n} questions.`); return; } setAns(out); setPaste(''); };
  const complete = ans.length === n && ans.every(Boolean); const changed = k ? ans.map((a, i) => (a !== k.answers[i] ? i + 1 : 0)).filter(Boolean) : [];
  const save = async () => { setBusy(true); await call(() => apiClient.post(`/omr/forms/${form._id}/key`, { answers: ans, reason }), (r) => `Key ${r.data.version} saved${r.data.regraded?.length ? `; ${r.data.regraded.length} batch(es) regraded` : ''}.`, () => { setReason(''); reload(); }); setBusy(false); };
  const cycle = (i) => { const opts = [...letters.split(''), '*', '-']; const cur = ans[i]; const at = opts.indexOf(cur); setOne(i, opts[(at + 1) % opts.length]); };
  return (
    <div className="grid gap-3">
      <div className="text-sm text-[#3b4a5c]">{k ? `Current key: version ${k.version}, set by ${k.byName}.` : 'No key yet. Enter it before grading.'} Click a question to change its answer. <b>*</b> gives everyone the marks; <b>-</b> drops the question.</div>
      <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-10" role="group" aria-label="Answer key">{ans.map((a, i) => <button key={i} type="button" onClick={() => cycle(i)} aria-label={`Question ${i + 1}: ${a || 'not set'}. Click to change.`} className={`rounded-md border px-1 py-1.5 text-center text-sm ${a ? 'border-[#cdd5d5] bg-white' : 'border-dashed border-[#e0b04a] bg-[#fdf8ea]'} ${changed.includes(i + 1) ? 'ring-2 ring-[#2a5cac]' : ''}`}><span className="block text-[10px] text-[#5b6b7b]">{i + 1}</span><span className="font-semibold">{a || '·'}</span></button>)}</div>
      <Field label="Or paste the whole key" hint="One letter per question, for example ABCDDCBA. Use (BC) when two answers are accepted."><div className="flex gap-2"><input className={inputCls} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="ABCDABCD…" /><button className={btnGhost} disabled={!paste} onClick={applyPaste}>Use</button></div></Field>
      {k && <Field label="Why is the key changing?" hint="Everyone who moderates this paper is told, and graded batches are regraded."><input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example: question 12 was misprinted, B is correct" /></Field>}
      <div className="flex justify-end"><button className={btnPrimary} disabled={busy || !complete || (k && (!changed.length || reason.trim().length < 5))} onClick={save}>{k ? `Save as version ${k.version + 1}${changed.length ? ` (${changed.length} changed)` : ''}` : 'Save key'}</button></div>
      {data.keys.length > 0 && <details className="rounded-lg border border-[#e3e7e7] p-2 text-sm"><summary className="cursor-pointer font-semibold">Earlier versions ({data.keys.length})</summary><ul className="mt-2 grid gap-1 text-xs">{data.keys.map((x) => <li key={x.version} className="rounded bg-[#f7f6f2] p-1.5">Version {x.version} · {dt(x.createdAt)} · {x.byName}{x.changed?.length ? ` · changed question${x.changed.length > 1 ? 's' : ''} ${x.changed.join(', ')}` : ''}{x.reason ? ` — ${x.reason}` : ''}</li>)}</ul></details>}
    </div>
  );
}

function SheetDetail({ id, onClose, onChanged, openBatch }) {
  const g = useGet(`/omr/forms/${id}`); const [tab, setTab] = useState('print'); const [copies, setCopies] = useState(30); const [one, setOne] = useState('');
  if (!g.data) return <Modal title="Answer sheet" onClose={onClose} wide><div className="text-sm text-[#5b6b7b]">{g.error || 'Loading…'}</div></Modal>;
  const { form, candidates, batches } = g.data; const reload = () => { g.reload(); onChanged(); };
  const tabs = [['print', 'Print'], ['key', 'Answer key'], ['batches', 'Sittings'], ['people', 'Candidates'], ['settings', 'Settings']];
  const printBlank = () => call(() => openPdf(`/omr/forms/${id}/sheet?copies=${copies}`));
  const printAll = () => call(() => openPdf(`/omr/forms/${id}/sheet?mode=personal`));
  const printOne = () => call(() => openPdf(`/omr/forms/${id}/sheet?mode=personal&no=${one}`));
  const newBatch = () => call(() => apiClient.post(`/omr/forms/${id}/batches`, { title: `${form.title} sitting` }), 'Sitting opened.', (r) => { onChanged(); openBatch(r.data.batch._id); });
  return (
    <Modal title={`${form.title} · sheet ${String(form.code).padStart(4, '0')}`} onClose={onClose} wide>
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm"><Pill value={FORM_TONE[form.status]}>{form.status}</Pill><span className="text-[#5b6b7b]">{form.questions} questions · {form.choices} choices · {form.candidateCount} candidates · {form.negative ? `−${form.negative} for a wrong answer` : 'no negative marking'}</span><button className={`${btnPrimary} ml-auto`} onClick={newBatch}>Start a sitting</button></div>
        <div role="tablist" className="flex flex-wrap gap-2">{tabs.map(([k, v]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${tab === k ? 'bg-[#1b2837] text-white' : 'bg-[#f7f6f2] text-[#3b4a5c] hover:bg-[#e9efee]'}`}>{v}</button>)}</div>
        {tab === 'print' && (
          <div className="grid gap-3 text-sm">
            <p className="text-[#3b4a5c]">Print on plain A4 at 100% size (no "fit to page"). Use black ink. The four black squares in the corners and the sheet code are what the scanner uses to find its way, so do not trim or mark them.</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <Card className="p-3"><div className="font-semibold">Blank sheets</div><Sub>Candidates write and fill in their own number.</Sub><div className="mt-2 flex items-center gap-2"><input aria-label="Number of copies" className={`${inputCls} w-20`} type="number" min="1" max="200" value={copies} onChange={(e) => setCopies(e.target.value)} /><button className={btnGhost} onClick={printBlank}><Printer className="mr-1 inline h-4 w-4" aria-hidden="true" />Open PDF</button></div></Card>
              <Card className="p-3"><div className="font-semibold">One for each candidate</div><Sub>Name, admission number and candidate number are already printed and filled in.</Sub><div className="mt-2"><button className={btnGhost} onClick={printAll}><Printer className="mr-1 inline h-4 w-4" aria-hidden="true" />Open {form.candidateCount} pages</button></div></Card>
              <Card className="p-3"><div className="font-semibold">A spare for one candidate</div><Sub>For a lost or spoiled sheet.</Sub><div className="mt-2 flex items-center gap-2"><select aria-label="Candidate" className={inputCls} value={one} onChange={(e) => setOne(e.target.value)}><option value="">Choose…</option>{candidates.map((c) => <option key={c.no} value={c.no}>{c.no} · {c.name}</option>)}</select><button className={btnGhost} disabled={!one} onClick={printOne}>Open</button></div></Card>
            </div>
          </div>
        )}
        {tab === 'key' && <KeyEditor form={form} data={g.data} reload={reload} />}
        {tab === 'batches' && (batches.length ? <div className="grid gap-2">{batches.map((b) => <button key={b._id} onClick={() => openBatch(b._id)} className="flex flex-wrap items-center gap-2 rounded-lg border border-[#e3e7e7] bg-white p-2 text-left text-sm hover:bg-[#f7f6f2]"><span className="font-semibold">{b.title}</span><Pill value={b.status === 'Published' ? 'Active' : b.status === 'Approved' ? 'Approved' : 'Pending'}>{b.status}</Pill><span className="text-xs text-[#5b6b7b]">{dt(b.createdAt)}{b.keyVersion ? ` · key ${b.keyVersion}` : ''}</span></button>)}</div> : <div className="rounded-lg bg-[#f7f6f2] p-3 text-sm text-[#5b6b7b]">No sittings yet. Start one when the papers are ready to scan.</div>)}
        {tab === 'people' && <Candidates id={id} data={g.data} reload={reload} />}
        {tab === 'settings' && <Settings form={form} locked={form.locked} reload={reload} />}
      </div>
    </Modal>
  );
}

function Candidates({ id, data, reload }) {
  const sync = () => call(() => apiClient.post(`/omr/forms/${id}/candidates`, {}), (r) => (r.data.added ? `${r.data.added} new student(s) added.` : 'Everyone in the class already has a number.'), reload);
  return <div className="grid gap-2"><div className="flex items-center justify-between text-sm"><span>{data.candidates.length} candidates</span><button className={btnGhost} onClick={sync}>Add students who joined the class</button></div><div className="max-h-72 overflow-y-auto rounded-lg border border-[#e3e7e7]"><Tbl head={['No.', 'Name', 'Admission']}>{data.candidates.map((c) => <Row key={c.no}><Td>{String(c.no).padStart(data.form.idDigits, '0')}</Td><Td>{c.name}</Td><Td>{c.admissionNumber}</Td></Row>)}</Tbl></div></div>;
}

function Settings({ form, locked, reload }) {
  const [f, setF] = useState({ title: form.title, marksPerQuestion: form.marksPerQuestion, negative: form.negative, instructions: form.instructions || '', thresholds: { ...form.thresholds } }); const set = (p) => setF((x) => ({ ...x, ...p })); const th = (k, v) => setF((x) => ({ ...x, thresholds: { ...x.thresholds, [k]: v } }));
  const save = () => call(() => apiClient.put(`/omr/forms/${form._id}`, { ...f, marksPerQuestion: Number(f.marksPerQuestion), negative: Number(f.negative), thresholds: Object.fromEntries(Object.entries(f.thresholds).map(([k, v]) => [k, Number(v)])) }), 'Saved.', reload);
  const arch = () => call(() => apiClient.post(`/omr/forms/${form._id}/archive`, {}), 'Archived.', reload);
  const T = [['mark', 'Counts as marked at', 'Share of the bubble filled, 0.3 to 0.8'], ['faint', 'Looks faint from', 'Below "marked" and above blank'], ['gap', 'Clear winner needs a lead of', 'Between the best and second-best bubble'], ['blurMm', 'Blur limit (mm)', 'Edge width of the corner marks'], ['minContrast', 'Least ink-to-paper contrast', '0 to 255'], ['minPaper', 'Darkest acceptable paper', '0 to 255'], ['blankPct', 'Mostly blank when', 'Percent of questions blank']];
  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-3"><Field label="Title"><input className={inputCls} value={f.title} onChange={(e) => set({ title: e.target.value })} /></Field><Field label="Marks for a right answer"><input className={inputCls} type="number" step="0.25" value={f.marksPerQuestion} onChange={(e) => set({ marksPerQuestion: e.target.value })} /></Field><Field label="Marks lost for a wrong answer"><input className={inputCls} type="number" step="0.25" value={f.negative} onChange={(e) => set({ negative: e.target.value })} /></Field></div>
      <Field label="Instructions printed on the sheet" hint="Leave empty for the standard instructions"><textarea className={inputCls} rows={2} maxLength={400} value={f.instructions} onChange={(e) => set({ instructions: e.target.value })} /></Field>
      <details className="rounded-lg border border-[#e3e7e7] p-2"><summary className="cursor-pointer text-sm font-semibold">How strictly marks are read</summary><div className="mt-2 grid gap-3 sm:grid-cols-2">{T.map(([k, label, hint]) => <Field key={k} label={label} hint={hint}><input className={inputCls} type="number" step="0.05" value={f.thresholds[k] ?? ''} onChange={(e) => th(k, e.target.value)} /></Field>)}</div></details>
      {locked && <p className="text-xs text-[#5b6b7b]">Photos exist for this sheet, so the number of questions and choices is fixed.</p>}
      <div className="flex justify-between"><button className={btnGhost} onClick={arch}>Archive this sheet</button><button className={btnPrimary} onClick={save}>Save settings</button></div>
    </div>
  );
}

export default function SheetsView({ openBatch }) {
  const l = useList('/omr/forms', 'forms', {}); const [neu, setNeu] = useState(false); const [open, setOpen] = useState(null);
  return (
    <Card>
      <Bar><h3 className="text-base font-bold text-[#1b2837]">Answer sheets</h3><button className={`${btnPrimary} ml-auto`} onClick={() => setNeu(true)}><Plus className="mr-1 inline h-4 w-4" aria-hidden="true" />New answer sheet</button></Bar>
      <Body l={l} cols={6} empty="No answer sheets yet. Make one, print it, and let candidates fill it in on paper.">
        <Tbl head={['Sheet', 'Class', 'Questions', 'Key', 'Sittings', '']}>{l.rows.map((f) => <Row key={f._id}><Td><button className="text-left font-semibold text-[#234c91] hover:underline" onClick={() => setOpen(f._id)}>{f.title}</button><Sub>Code {String(f.code).padStart(4, '0')}{f.status === 'Archived' ? ' · archived' : ''}</Sub></Td><Td>{f.className}{f.subjectName ? ` · ${f.subjectName}` : ''}</Td><Td>{f.questions} × {f.choices}</Td><Td>{f.keyVersion ? <Pill value="Active">Version {f.keyVersion}</Pill> : <Pill value="Pending">Not set</Pill>}</Td><Td>{f.batches}</Td><Td><button className={btnGhost} onClick={() => setOpen(f._id)}>Open</button></Td></Row>)}</Tbl>
      </Body>
      {neu && <NewSheet onClose={() => setNeu(false)} onSaved={l.reload} />}
      {open && <SheetDetail id={open} onClose={() => setOpen(null)} onChanged={l.reload} openBatch={(b) => { setOpen(null); openBatch(b); }} />}
    </Card>
  );
}
