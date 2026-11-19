import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Copy, Share2, Upload, Download, Trash2, Archive, Check } from 'lucide-react';
import { toast } from 'react-hot-toast';
import apiClient from '../../utils/apiClient';
import { Card, Field, Modal, Pill, btnPrimary, btnGhost, btnDanger, inputCls, errMsg } from '../ui';
import { Bar, Body, Row, Sub, Td, Tbl, useList } from '../attendance/deskKit';
import { call, useGet } from '../timetable/planKit';
import { Rich, KIND_LABEL, STATE_TONE, newId } from './assessKit';
import { speak, hasNotation } from './notation';

const blank = (kind = 'mcq') => ({ kind, stem: '', stemUr: '', marks: 1, topic: '', difficulty: 'Medium', bloom: '', competency: '', standard: '', explanation: '', partialCredit: false, negativeMarks: 0, license: { kind: 'original', source: '', holder: '' },
  options: kind === 'tf' ? [] : [{ id: newId(), text: '', correct: true }, { id: newId(), text: '' }, { id: newId(), text: '' }, { id: newId(), text: '' }], answerTrue: true, accepted: '', numAnswer: '', numTolerance: 0, unit: '', caseSensitive: false,
  pairs: [{ id: newId(), left: '', right: '' }, { id: newId(), left: '', right: '' }], sequence: [{ id: newId(), text: '' }, { id: newId(), text: '' }], rubricId: '', subjectId: '', changeNote: '' });

function Editor({ id, meta, onClose, onSaved }) {
  const [q, setQ] = useState(null); const [versions, setVersions] = useState([]); const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!id) { setQ(blank()); return; }
    apiClient.get(`/assess/bank/${id}`).then((r) => { const i = r.data.item; setVersions(r.data.versions); setQ({ ...blank(i.kind), ...i, accepted: (i.accepted || []).join('\n'), answerTrue: i.kind === 'tf' ? !!i.options?.find((o) => o.id === 'true')?.correct : true, rubricId: i.rubricId || '', subjectId: i.subjectId || '', numAnswer: i.numAnswer ?? '', changeNote: '', license: i.license || blank().license }); }).catch((e) => { toast.error(errMsg(e)); onClose(); });
  }, [id]); // eslint-disable-line
  if (!q) return <Modal title="Question" onClose={onClose} wide><div className="skeleton h-40" /></Modal>;
  const set = (p) => setQ((x) => ({ ...x, ...p })); const kind = q.kind; const locked = !!q.locked; const readOnly = q.current === false;
  const setKind = (k) => { const b = blank(k); set({ kind: k, options: b.options, ...(k === 'tf' ? { options: [] } : {}) }); };
  const opt = (i, p) => set({ options: q.options.map((o, n) => (n === i ? { ...o, ...p } : (p.correct && kind !== 'multi' ? { ...o, correct: false } : o))) });
  const payload = () => ({ ...q, accepted: q.accepted, rubricId: q.rubricId || undefined, subjectId: q.subjectId || undefined, options: kind === 'tf' ? [] : q.options });
  const save = async () => { setBusy(true); const r = await call(() => (id ? apiClient.put(`/assess/bank/${id}`, payload()) : apiClient.post('/assess/bank', payload())), id ? (locked ? 'New version saved' : 'Saved') : 'Question created'); setBusy(false); if (r) { onSaved(); if (!id || r.data.newVersion) onClose(); } };
  const act = async (path, ok, method = 'post', body) => { const r = await call(() => apiClient[method](`/assess/bank/${id}${path}`, body), ok); if (r) { onSaved(); onClose(); } };
  const rows = (arr, key, mk, render) => <div className="grid gap-2">{arr.map((x, i) => <div key={x.id || i} className="flex items-start gap-2">{render(x, i)}<button type="button" className="mt-1 text-xs text-[#9f1239]" aria-label="Remove" onClick={() => set({ [key]: arr.filter((_, n) => n !== i) })}>✕</button></div>)}<button type="button" className="text-start text-xs font-semibold text-[#2a5cac]" onClick={() => set({ [key]: [...arr, mk()] })}>+ Add</button></div>;
  return (
    <Modal title={id ? `Question (version ${q.version})` : 'New question'} onClose={onClose} wide>
      <div className="grid gap-3">
        {readOnly && <div className="rounded-lg bg-[#fbf0ec] p-3 text-sm text-[#8a4636]">This is an older version, kept exactly as it was in published quizzes. Open the latest version to change the question.</div>}
        {locked && !readOnly && <div className="rounded-lg bg-[#eef2f8] p-3 text-sm text-[#234c91]">This question is in a published quiz. Saving makes a new version; the published quiz keeps the old one.</div>}
        <fieldset disabled={readOnly} className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Type"><select className={inputCls} value={kind} disabled={!!id} onChange={(e) => setKind(e.target.value)}>{Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
            <Field label="Marks"><input className={inputCls} type="number" min="0.25" step="0.25" value={q.marks} onChange={(e) => set({ marks: e.target.value })} /></Field>
            <Field label="Subject"><select className={inputCls} value={q.subjectId} onChange={(e) => set({ subjectId: e.target.value })}><option value="">Any</option>{meta.subjects.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}</select></Field>
          </div>
          <Field label="Question" hint="Maths and science: x^2, H_2O, \frac{a}{b}, \sqrt{x}, \pi, \alpha"><textarea className={inputCls} rows={3} value={q.stem} onChange={(e) => set({ stem: e.target.value })} /></Field>
          {hasNotation(q.stem) && <div className="rounded-lg bg-[#f7f6f2] p-3 text-sm"><div className="text-xs font-semibold text-[#5b6b7b]">Preview</div><Rich text={q.stem} /><div className="mt-1 text-xs text-[#5b6b7b]">Read aloud as: {speak(q.stem)}</div></div>}
          <Field label="Question in Urdu (optional)"><textarea dir="rtl" className={inputCls} rows={2} value={q.stemUr} onChange={(e) => set({ stemUr: e.target.value })} /></Field>

          {['mcq', 'multi'].includes(kind) && <Field label={kind === 'multi' ? 'Choices (tick every correct one)' : 'Choices (select the correct one)'}>{rows(q.options, 'options', () => ({ id: newId(), text: '' }), (o, i) => (<><input aria-label={`Choice ${i + 1} is correct`} className="mt-3" type={kind === 'multi' ? 'checkbox' : 'radio'} name="correct" checked={!!o.correct} onChange={(e) => opt(i, { correct: e.target.checked })} /><input aria-label={`Choice ${i + 1}`} className={inputCls} value={o.text} onChange={(e) => opt(i, { text: e.target.value })} /></>))}</Field>}
          {kind === 'tf' && <Field label="Correct answer"><div className="flex gap-4 text-sm"><label className="flex items-center gap-1"><input type="radio" checked={q.answerTrue} onChange={() => set({ answerTrue: true })} /> True</label><label className="flex items-center gap-1"><input type="radio" checked={!q.answerTrue} onChange={() => set({ answerTrue: false })} /> False</label></div></Field>}
          {kind === 'short' && <><Field label="Accepted answers (one per line)" hint="Capitals, spaces and a full stop at the end are ignored. Other answers are shown to the teacher to mark."><textarea className={inputCls} rows={3} value={q.accepted} onChange={(e) => set({ accepted: e.target.value })} /></Field><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={q.caseSensitive} onChange={(e) => set({ caseSensitive: e.target.checked })} /> Capital letters matter</label></>}
          {kind === 'numeric' && <div className="grid gap-3 sm:grid-cols-3"><Field label="Correct number"><input className={inputCls} type="number" step="any" value={q.numAnswer} onChange={(e) => set({ numAnswer: e.target.value })} /></Field><Field label="Allowed difference"><input className={inputCls} type="number" min="0" step="any" value={q.numTolerance} onChange={(e) => set({ numTolerance: e.target.value })} /></Field><Field label="Unit (shown)"><input className={inputCls} value={q.unit} onChange={(e) => set({ unit: e.target.value })} /></Field></div>}
          {kind === 'match' && <Field label="Pairs (left matches right; the right side is shuffled for students)">{rows(q.pairs, 'pairs', () => ({ id: newId(), left: '', right: '' }), (p, i) => (<><input aria-label={`Left ${i + 1}`} className={inputCls} value={p.left} onChange={(e) => set({ pairs: q.pairs.map((x, n) => (n === i ? { ...x, left: e.target.value } : x)) })} /><input aria-label={`Right ${i + 1}`} className={inputCls} value={p.right} onChange={(e) => set({ pairs: q.pairs.map((x, n) => (n === i ? { ...x, right: e.target.value } : x)) })} /></>))}</Field>}
          {kind === 'order' && <Field label="Steps in the correct order (students see them shuffled)">{rows(q.sequence, 'sequence', () => ({ id: newId(), text: '' }), (s, i) => (<><span className="mt-2.5 w-5 text-xs text-[#5b6b7b]">{i + 1}.</span><input aria-label={`Step ${i + 1}`} className={inputCls} value={s.text} onChange={(e) => set({ sequence: q.sequence.map((x, n) => (n === i ? { ...x, text: e.target.value } : x)) })} /></>))}</Field>}
          {kind === 'essay' && <Field label="Marking rubric (optional)"><select className={inputCls} value={q.rubricId} onChange={(e) => set({ rubricId: e.target.value })}><option value="">Give a mark directly</option>{meta.rubrics.map((r) => <option key={r._id} value={r._id}>{r.name} ({r.max} points)</option>)}</select></Field>}
          {['multi', 'match', 'order'].includes(kind) && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={q.partialCredit} onChange={(e) => set({ partialCredit: e.target.checked })} /> Give part marks for part-right answers</label>}
          {['mcq', 'tf'].includes(kind) && <Field label="Marks lost for a wrong answer" hint="A blank answer never loses marks."><input className={inputCls} type="number" min="0" step="0.25" value={q.negativeMarks} onChange={(e) => set({ negativeMarks: e.target.value })} /></Field>}

          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Topic"><input className={inputCls} list="topics" value={q.topic} onChange={(e) => set({ topic: e.target.value })} /><datalist id="topics">{meta.topics.map((t) => <option key={t} value={t} />)}</datalist></Field>
            <Field label="Difficulty"><select className={inputCls} value={q.difficulty} onChange={(e) => set({ difficulty: e.target.value })}>{['Easy', 'Medium', 'Hard'].map((d) => <option key={d}>{d}</option>)}</select></Field>
            <Field label="Thinking level"><select className={inputCls} value={q.bloom} onChange={(e) => set({ bloom: e.target.value })}><option value="">—</option>{meta.bloom.map((d) => <option key={d}>{d}</option>)}</select></Field>
            <Field label="Learning goal"><input className={inputCls} value={q.competency} onChange={(e) => set({ competency: e.target.value })} /></Field>
          </div>
          <Field label="Explanation shown after the quiz (optional)"><textarea className={inputCls} rows={2} value={q.explanation} onChange={(e) => set({ explanation: e.target.value })} /></Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Where it came from"><select className={inputCls} value={q.license.kind} onChange={(e) => set({ license: { ...q.license, kind: e.target.value } })}><option value="original">I wrote it</option><option value="adapted">Adapted from another source</option><option value="licensed">Used under a licence</option><option value="open">Open licence</option></select></Field>
            {q.license.kind !== 'original' && <><Field label="Source or book"><input className={inputCls} value={q.license.source} onChange={(e) => set({ license: { ...q.license, source: e.target.value } })} /></Field><Field label="Copyright holder"><input className={inputCls} value={q.license.holder} onChange={(e) => set({ license: { ...q.license, holder: e.target.value } })} /></Field></>}
          </div>
          {locked && <Field label="What are you changing, and why?"><input className={inputCls} value={q.changeNote} onChange={(e) => set({ changeNote: e.target.value })} /></Field>}
        </fieldset>
        {versions.length > 1 && <div className="rounded-lg border border-[#e3e7e7] p-3 text-xs text-[#3b4a5c]"><div className="mb-1 font-semibold">Versions</div>{versions.map((v) => <div key={v._id}>Version {v.version}{v.current ? ' (latest)' : ''} · {v.authorName}{v.changeNote ? ` · ${v.changeNote}` : ''}</div>)}</div>}
        <div className="flex flex-wrap justify-between gap-2 pt-1">
          <div className="flex flex-wrap gap-2">
            {id && !readOnly && q.state !== 'Active' && <button className={btnGhost} onClick={() => act('/activate', 'Question is active')}><Check className="h-4 w-4" /> Make active</button>}
            {id && !readOnly && q.state === 'Active' && <button className={btnGhost} onClick={() => act('/retire', 'Question retired')}><Archive className="h-4 w-4" /> Retire</button>}
            {id && !readOnly && q.state === 'Active' && <button className={btnGhost} onClick={() => act('/share', q.sharing === 'school' ? 'Now private' : 'Shared with colleagues', 'post', { sharing: q.sharing === 'school' ? 'private' : 'school' })}><Share2 className="h-4 w-4" /> {q.sharing === 'school' ? 'Stop sharing' : 'Share with colleagues'}</button>}
            {id && <button className={btnGhost} onClick={() => act('/duplicate', 'Copy created as a draft')}><Copy className="h-4 w-4" /> Copy</button>}
            {id && !readOnly && !locked && q.state === 'Draft' && q.version === 1 && <button className={btnDanger} onClick={() => act('', 'Deleted', 'delete')}><Trash2 className="h-4 w-4" /> Delete</button>}
          </div>
          {!readOnly && <button className={btnPrimary} disabled={busy} onClick={save}>{busy ? 'Saving…' : locked ? 'Save as new version' : 'Save'}</button>}
        </div>
      </div>
    </Modal>
  );
}

function RubricEditor({ rubric, onClose, onSaved }) {
  const [r, setR] = useState(rubric || { name: '', criteria: [{ id: newId(), name: '', levels: [{ points: 0, descriptor: '' }, { points: 2, descriptor: '' }] }], comments: [] }); const [busy, setBusy] = useState(false);
  const crit = (i, p) => setR((x) => ({ ...x, criteria: x.criteria.map((c, n) => (n === i ? { ...c, ...p } : c)) }));
  const save = async () => { setBusy(true); const x = await call(() => (rubric?._id ? apiClient.put(`/assess/rubrics/${rubric._id}`, r) : apiClient.post('/assess/rubrics', r)), 'Rubric saved'); setBusy(false); if (x) { onSaved(); onClose(); } };
  return (
    <Modal title={rubric?._id ? 'Edit rubric' : 'New rubric'} onClose={onClose} wide>
      <div className="grid gap-3">
        <Field label="Name"><input className={inputCls} value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} /></Field>
        {r.criteria.map((c, i) => (
          <div key={c.id} className="rounded-lg border border-[#e3e7e7] p-3">
            <div className="flex gap-2"><input aria-label={`Criterion ${i + 1}`} placeholder="Criterion, for example Ideas" className={inputCls} value={c.name} onChange={(e) => crit(i, { name: e.target.value })} /><button className="text-xs text-[#9f1239]" onClick={() => setR({ ...r, criteria: r.criteria.filter((_, n) => n !== i) })}>Remove</button></div>
            <div className="mt-2 grid gap-2">{c.levels.map((l, j) => <div key={j} className="flex gap-2"><input aria-label="Points" type="number" min="0" step="0.5" className={`${inputCls} !w-24`} value={l.points} onChange={(e) => crit(i, { levels: c.levels.map((x, n) => (n === j ? { ...x, points: e.target.value } : x)) })} /><input aria-label="What this level looks like" placeholder="What this level looks like" className={inputCls} value={l.descriptor || ''} onChange={(e) => crit(i, { levels: c.levels.map((x, n) => (n === j ? { ...x, descriptor: e.target.value } : x)) })} /></div>)}
              <button className="text-start text-xs font-semibold text-[#2a5cac]" onClick={() => crit(i, { levels: [...c.levels, { points: 0, descriptor: '' }] })}>+ Add level</button></div>
          </div>
        ))}
        <button className="text-start text-xs font-semibold text-[#2a5cac]" onClick={() => setR({ ...r, criteria: [...r.criteria, { id: newId(), name: '', levels: [{ points: 0, descriptor: '' }, { points: 2, descriptor: '' }] }] })}>+ Add criterion</button>
        <Field label="Comment bank (one per line, for quick feedback)"><textarea className={inputCls} rows={3} value={(r.comments || []).join('\n')} onChange={(e) => setR({ ...r, comments: e.target.value.split('\n') })} /></Field>
        <div className="flex justify-end"><button className={btnPrimary} disabled={busy} onClick={save}>Save rubric</button></div>
      </div>
    </Modal>
  );
}

export default function QuestionBank() {
  const metaG = useGet('/assess/bank/meta'); const [tab, setTab] = useState('questions'); const [f, setF] = useState({ q: '', kind: '', state: '', mine: '' }); const [edit, setEdit] = useState(undefined); const [rub, setRub] = useState(undefined); const [picked, setPicked] = useState([]);
  const l = useList('/assess/bank', 'items', { q: f.q || undefined, kind: f.kind || undefined, state: f.state || undefined, mine: f.mine || undefined }); const rubs = useGet('/assess/rubrics'); const fileRef = useRef(null);
  const meta = metaG.data || { subjects: [], topics: [], bloom: [], rubrics: [] }; const refresh = () => { l.reload(); metaG.reload(); rubs.reload(); };
  const exportIt = async () => { try { const r = await apiClient.get('/assess/bank/export', { params: { ids: picked.join(',') }, responseType: 'blob' }); const u = URL.createObjectURL(r.data); const a = document.createElement('a'); a.href = u; a.download = 'aulensia-questions.json'; a.click(); URL.revokeObjectURL(u); } catch (e) { let m = 'Could not export'; try { m = JSON.parse(await e.response.data.text()).message; } catch { /* keep */ } toast.error(m); } };
  const importIt = async (file) => { if (!file) return; try { const body = JSON.parse(await file.text()); const lic = window.prompt('Under what licence may these questions be used? (for example: written by me, or open licence)'); if (!lic) return; const r = await apiClient.post('/assess/bank/import', { ...body, licenseStatement: lic }); toast.success(`${r.data.made} questions imported as drafts`); refresh(); } catch (e) { toast.error(errMsg(e, 'That file could not be imported')); } };
  const tog = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  return (
    <Card className="!p-0 overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-[#e3e7e7] px-4 pt-3">
        {[['questions', 'Questions'], ['rubrics', 'Rubrics']].map(([k, v]) => <button key={k} onClick={() => setTab(k)} className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold ${tab === k ? 'border-[#2a5cac] text-[#2a5cac]' : 'border-transparent text-[#5b6b7b]'}`}>{v}</button>)}
      </div>
      {tab === 'questions' ? (
        <>
          <Bar>
            <input aria-label="Search questions" className={`${inputCls} !w-52`} placeholder="Search questions" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
            <select aria-label="Type" className={`${inputCls} !w-44`} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="">All types</option>{Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <select aria-label="State" className={`${inputCls} !w-32`} value={f.state} onChange={(e) => setF({ ...f, state: e.target.value })}><option value="">Any state</option><option>Draft</option><option>Active</option><option>Retired</option></select>
            <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={f.mine === '1'} onChange={(e) => setF({ ...f, mine: e.target.checked ? '1' : '' })} /> Mine only</label>
            <span className="grow" />
            {picked.length > 0 && <button className={btnGhost} onClick={exportIt}><Download className="h-4 w-4" /> Export {picked.length}</button>}
            <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={(e) => { importIt(e.target.files?.[0]); e.target.value = ''; }} />
            <button className={btnGhost} onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" /> Import</button>
            <button className={btnPrimary} onClick={() => setEdit(null)}><Plus className="h-4 w-4" /> New question</button>
          </Bar>
          <Body l={l} cols={6} empty="No questions yet. Write your first one, or import a package.">
            <Tbl head={['', 'Question', 'Type', 'Topic', 'Marks', 'State', 'Used']}>{l.rows.map((i) => (
              <Row key={i._id}>
                <Td><input type="checkbox" aria-label="Select for export" checked={picked.includes(i._id)} onChange={() => tog(i._id)} /></Td>
                <Td><button className="text-start font-medium text-[#1b2837] hover:underline" onClick={() => setEdit(i._id)}><Rich text={i.stem.length > 110 ? `${i.stem.slice(0, 110)}…` : i.stem} /></button><Sub>{i.authorName}{i.sharing === 'school' ? ' · shared' : ''}{i.version > 1 ? ` · version ${i.version}` : ''}{i.locked ? ' · in a published quiz' : ''}</Sub></Td>
                <Td>{KIND_LABEL[i.kind]}</Td><Td>{i.topic || '—'}<Sub>{i.difficulty}{i.bloom ? ` · ${i.bloom}` : ''}</Sub></Td><Td>{i.marks}</Td><Td><Pill value={STATE_TONE[i.state]}>{i.state}</Pill></Td>
                <Td>{i.usage?.quizzes || 0} {(i.usage?.quizzes || 0) === 1 ? 'quiz' : 'quizzes'}{i.usage?.facility !== null && i.usage?.facility !== undefined ? <Sub>{Math.round(i.usage.facility * 100)}% right</Sub> : null}</Td>
              </Row>))}</Tbl>
          </Body>
        </>
      ) : (
        <div className="p-4">
          <div className="mb-3 flex justify-between"><p className="text-sm text-[#5b6b7b]">A rubric gives markers fixed levels for each criterion, so two teachers mark alike.</p><button className={btnPrimary} onClick={() => setRub(null)}><Plus className="h-4 w-4" /> New rubric</button></div>
          {(rubs.data?.rubrics || []).length === 0 ? <p className="text-sm text-[#5b6b7b]">No rubrics yet.</p> : <div className="grid gap-2 sm:grid-cols-2">{rubs.data.rubrics.map((r) => <button key={r._id} className="rounded-xl border border-[#e3e7e7] p-3 text-start hover:bg-[#f7f6f2]" onClick={() => setRub(r)}><div className="font-semibold">{r.name}</div><div className="text-xs text-[#5b6b7b]">{r.criteria.length} criteria · {r.max} points · {r.authorName}</div></button>)}</div>}
        </div>
      )}
      {edit !== undefined && <Editor id={edit} meta={meta} onClose={() => setEdit(undefined)} onSaved={refresh} />}
      {rub !== undefined && <RubricEditor rubric={rub} onClose={() => setRub(undefined)} onSaved={refresh} />}
    </Card>
  );
}
