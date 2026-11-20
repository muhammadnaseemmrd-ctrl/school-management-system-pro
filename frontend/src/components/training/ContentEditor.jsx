import React, { useState } from 'react';
import apiClient from '../../utils/apiClient';
import { Card, Modal, Field, btnPrimary, btnGhost, btnDanger, inputCls, errMsg } from '../ui';
import { call, KIND, Note } from './tkit';

const blankQ = () => ({ q: '', options: ['', ''], correct: [0], why: '' });
const blankLesson = (kind = 'reading') => ({ title: '', kind, minutes: kind === 'check' || kind === 'assignment' ? 0 : 10, required: true, preview: false, dripDays: 0, requires: '', body: '', url: '', check: kind === 'check' ? [blankQ()] : [], passPercent: kind === 'assignment' ? 60 : 70, maxAttempts: 3, rubric: kind === 'assignment' ? [{ title: '', max: 10 }] : [] });
const move = (arr, i, d) => { const j = i + d; if (j < 0 || j >= arr.length) return arr; const c = [...arr]; [c[i], c[j]] = [c[j], c[i]]; return c; };

function QuestionEditor({ q, i, onChange, onRemove }) {
  const set = (k, v) => onChange({ ...q, [k]: v });
  const setOpt = (oi, v) => set('options', q.options.map((o, k) => (k === oi ? v : o)));
  const toggle = (oi) => set('correct', q.correct.includes(oi) ? q.correct.filter((x) => x !== oi) : [...q.correct, oi]);
  const drop = (oi) => onChange({ ...q, options: q.options.filter((_, k) => k !== oi), correct: q.correct.filter((x) => x !== oi).map((x) => (x > oi ? x - 1 : x)) });
  return (
    <fieldset className="rounded-xl border border-[#e3e7e7] p-3">
      <legend className="px-1 text-xs font-semibold text-[#3b4a5c]">Question {i + 1}</legend>
      <div className="grid gap-2">
        <Field label="Question"><input className={inputCls} value={q.q} onChange={(e) => set('q', e.target.value)} maxLength={300} /></Field>
        {q.options.map((o, oi) => (
          <div key={oi} className="flex items-center gap-2">
            <input type="checkbox" checked={q.correct.includes(oi)} onChange={() => toggle(oi)} aria-label={`Answer ${oi + 1} is correct`} />
            <input className={inputCls} value={o} onChange={(e) => setOpt(oi, e.target.value)} placeholder={`Answer ${oi + 1}`} aria-label={`Answer ${oi + 1} for question ${i + 1}`} maxLength={160} />
            {q.options.length > 2 && <button type="button" className={`${btnGhost} !px-2 !py-1 !text-xs`} onClick={() => drop(oi)} aria-label={`Remove answer ${oi + 1}`}>Remove</button>}
          </div>
        ))}
        <p className="text-[11px] text-[#5b6b7b]">Tick every answer that is correct. Learners never see which ones are ticked.</p>
        <div className="flex flex-wrap gap-2">{q.options.length < 6 && <button type="button" className={`${btnGhost} !px-2 !py-1 !text-xs`} onClick={() => set('options', [...q.options, ''])}>Add an answer</button>}<button type="button" className={`${btnDanger} !px-2 !py-1 !text-xs`} onClick={onRemove}>Remove question</button></div>
        <Field label="Why the right answer is right (shown after a wrong try)"><input className={inputCls} value={q.why} onChange={(e) => set('why', e.target.value)} maxLength={300} /></Field>
      </div>
    </fieldset>
  );
}

function LessonForm({ lesson, earlier, onClose, onSave }) {
  const [f, setF] = useState({ ...blankLesson(lesson.kind), ...lesson, check: lesson.check || [], rubric: lesson.rubric || [] });
  const set = (k, v) => setF({ ...f, [k]: v });
  const [err, setErr] = useState('');
  const submit = (e) => { e.preventDefault(); setErr(''); onSave({ ...f, minutes: Number(f.minutes) || 0, dripDays: Number(f.dripDays) || 0, passPercent: Number(f.passPercent) || 0, maxAttempts: Number(f.maxAttempts) || 3 }); };
  const timed = f.kind === 'video' || f.kind === 'reading';
  return (
    <Modal title={lesson.title ? `Edit "${lesson.title}"` : 'New lesson'} onClose={onClose} wide>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <Field label="Title"><input className={inputCls} value={f.title} onChange={(e) => set('title', e.target.value)} required maxLength={140} /></Field>
        <Field label="Kind"><select className={inputCls} value={f.kind} onChange={(e) => setF({ ...blankLesson(e.target.value), title: f.title, body: f.body, required: f.required, preview: f.preview, id: f.id })}>{Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        {timed && <Field label="Length in minutes" hint="Learners must spend about 60% of this time on the page before they can finish it (at most 30 minutes)."><input className={inputCls} type="number" min="1" max="600" value={f.minutes} onChange={(e) => set('minutes', e.target.value)} required /></Field>}
        {f.kind === 'video' && <Field label="Video address (https)" hint="A link to a video the learner can open. Nothing is stored on this site."><input className={inputCls} type="url" value={f.url} onChange={(e) => set('url', e.target.value)} placeholder="https://" /></Field>}
        {f.kind === 'reading' && <Field label="Link to extra reading (optional, https)"><input className={inputCls} type="url" value={f.url} onChange={(e) => set('url', e.target.value)} placeholder="https://" /></Field>}
        <div className="sm:col-span-2"><Field label={f.kind === 'assignment' ? 'The brief: what the learner must hand in' : 'Lesson text'}><textarea className={inputCls} rows={f.kind === 'assignment' ? 4 : 6} value={f.body} onChange={(e) => set('body', e.target.value)} maxLength={12000} /></Field></div>
        <div className="flex flex-wrap items-center gap-4 sm:col-span-2 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={f.required} onChange={(e) => set('required', e.target.checked)} /> Needed to finish the course</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={f.preview} onChange={(e) => set('preview', e.target.checked)} /> Free preview for buyers</label>
        </div>
        <Field label="Opens this many days after the learner starts" hint="0 means it opens straight away."><input className={inputCls} type="number" min="0" max="365" value={f.dripDays} onChange={(e) => set('dripDays', e.target.value)} /></Field>
        <Field label="Opens only after this earlier lesson is done" hint={f.id ? '' : 'A brand-new lesson can be chosen here after the first save.'}><select className={inputCls} value={f.requires} onChange={(e) => set('requires', e.target.value)}><option value="">Nothing in particular</option>{earlier.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}</select></Field>
        {(f.kind === 'check' || f.kind === 'video' || f.kind === 'reading') && (
          <div className="grid gap-3 sm:col-span-2">
            <h4 className="text-sm font-semibold text-[#1b2837]">{f.kind === 'check' ? 'Questions' : 'Questions to answer before finishing (optional)'}</h4>
            {f.check.map((q, i) => <QuestionEditor key={q.id || i} q={q} i={i} onChange={(nq) => set('check', f.check.map((x, k) => (k === i ? nq : x)))} onRemove={() => set('check', f.check.filter((_, k) => k !== i))} />)}
            {f.check.length < 10 && <div><button type="button" className={btnGhost} onClick={() => set('check', [...f.check, blankQ()])}>Add a question</button></div>}
            {f.check.length > 0 && <Field label="Pass mark (%)"><input className={inputCls} type="number" min="1" max="100" value={f.passPercent} onChange={(e) => set('passPercent', e.target.value)} /></Field>}
          </div>
        )}
        {f.kind === 'assignment' && (
          <div className="grid gap-3 sm:col-span-2">
            <h4 className="text-sm font-semibold text-[#1b2837]">Marking guide (rubric)</h4>
            {f.rubric.map((r, i) => (
              <div key={r.id || i} className="grid grid-cols-[1fr_90px_auto] items-end gap-2">
                <Field label={`Criterion ${i + 1}`}><input className={inputCls} value={r.title} onChange={(e) => set('rubric', f.rubric.map((x, k) => (k === i ? { ...x, title: e.target.value } : x)))} maxLength={120} /></Field>
                <Field label="Marks"><input className={inputCls} type="number" min="1" max="100" value={r.max} onChange={(e) => set('rubric', f.rubric.map((x, k) => (k === i ? { ...x, max: Number(e.target.value) } : x)))} /></Field>
                {f.rubric.length > 1 ? <button type="button" className={`${btnGhost} !px-2 !py-2 !text-xs`} onClick={() => set('rubric', f.rubric.filter((_, k) => k !== i))} aria-label={`Remove criterion ${i + 1}`}>Remove</button> : <span />}
              </div>
            ))}
            {f.rubric.length < 8 && <div><button type="button" className={btnGhost} onClick={() => set('rubric', [...f.rubric, { title: '', max: 10 }])}>Add a criterion</button></div>}
            <div className="grid gap-3 sm:grid-cols-2"><Field label="Pass mark (%)"><input className={inputCls} type="number" min="1" max="100" value={f.passPercent} onChange={(e) => set('passPercent', e.target.value)} /></Field><Field label="Attempts allowed"><input className={inputCls} type="number" min="1" max="10" value={f.maxAttempts} onChange={(e) => set('maxAttempts', e.target.value)} /></Field></div>
          </div>
        )}
        {err && <p role="alert" className="text-sm text-[#9f1239] sm:col-span-2">{err}</p>}
        <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" className={btnGhost} onClick={onClose}>Cancel</button><button className={btnPrimary}>Keep this lesson</button></div>
      </form>
    </Modal>
  );
}

// The course outline: modules in order, lessons in order. Nothing is saved until "Save the outline".
export default function ContentEditor({ course, onSaved, canEdit = true }) {
  const [mods, setMods] = useState(() => JSON.parse(JSON.stringify(course.draft?.modules || [])));
  const [dirty, setDirty] = useState(false); const [edit, setEdit] = useState(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const upd = (next) => { setMods(next); setDirty(true); };
  const flatBefore = (mi, li) => mods.flatMap((m, a) => m.lessons.map((l, b) => ({ l, a, b }))).filter((x) => x.l.id && (x.a < mi || (x.a === mi && x.b < li))).map((x) => x.l);
  const save = async () => {
    setBusy(true); setErr('');
    try { const r = await apiClient.patch(`/training/courses/${course._id}`, { modules: mods }); setDirty(false); await onSaved(r.data); } catch (e) { setErr(errMsg(e, 'Could not save the outline.')); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-3">
      {!canEdit && <Note>You can read the outline. Only the instructors on this course and administrators can change it.</Note>}
      {mods.length === 0 && <Note>This course has no lessons yet. Add a module, then add lessons to it.</Note>}
      {mods.map((m, mi) => (
        <Card key={m.id || mi}>
          <div className="mb-2 flex flex-wrap items-end gap-2">
            <div className="min-w-[200px] flex-1"><Field label={`Module ${mi + 1} title`}><input className={inputCls} value={m.title} disabled={!canEdit} onChange={(e) => upd(mods.map((x, k) => (k === mi ? { ...x, title: e.target.value } : x)))} maxLength={120} /></Field></div>
            <label className="flex items-center gap-2 pb-2 text-xs"><input type="checkbox" disabled={!canEdit} checked={!!m.requiresPrevious} onChange={(e) => upd(mods.map((x, k) => (k === mi ? { ...x, requiresPrevious: e.target.checked } : x)))} /> Opens after the previous module</label>
            {canEdit && <div className="flex gap-1 pb-1"><button className={`${btnGhost} !px-2 !py-1 !text-xs`} onClick={() => upd(move(mods, mi, -1))} aria-label={`Move module ${mi + 1} up`}>Up</button><button className={`${btnGhost} !px-2 !py-1 !text-xs`} onClick={() => upd(move(mods, mi, 1))} aria-label={`Move module ${mi + 1} down`}>Down</button><button className={`${btnDanger} !px-2 !py-1 !text-xs`} onClick={() => upd(mods.filter((_, k) => k !== mi))} aria-label={`Remove module ${mi + 1}`}>Remove</button></div>}
          </div>
          <ul className="grid gap-1">
            {m.lessons.map((l, li) => (
              <li key={l.id || li} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#f0f1f1] px-3 py-2 text-sm">
                <span><span className="font-medium">{l.title || 'Untitled lesson'}</span> <span className="text-xs text-[#5b6b7b]">· {KIND[l.kind]}{l.minutes ? ` · ${l.minutes} min` : ''}{l.required ? '' : ' · optional'}{l.preview ? ' · preview' : ''}{l.dripDays ? ` · day ${l.dripDays}` : ''}</span></span>
                {canEdit && <span className="flex gap-1"><button className={`${btnGhost} !px-2 !py-1 !text-xs`} onClick={() => upd(mods.map((x, k) => (k === mi ? { ...x, lessons: move(x.lessons, li, -1) } : x)))} aria-label={`Move ${l.title || 'lesson'} up`}>Up</button><button className={`${btnGhost} !px-2 !py-1 !text-xs`} onClick={() => upd(mods.map((x, k) => (k === mi ? { ...x, lessons: move(x.lessons, li, 1) } : x)))} aria-label={`Move ${l.title || 'lesson'} down`}>Down</button><button className={`${btnGhost} !px-2 !py-1 !text-xs`} onClick={() => setEdit({ mi, li })} aria-label={`Edit ${l.title || 'lesson'}`}>Edit</button><button className={`${btnDanger} !px-2 !py-1 !text-xs`} onClick={() => upd(mods.map((x, k) => (k === mi ? { ...x, lessons: x.lessons.filter((_, z) => z !== li) } : x)))} aria-label={`Remove ${l.title || 'lesson'}`}>Remove</button></span>}
              </li>
            ))}
          </ul>
          {canEdit && <div className="mt-2 flex flex-wrap gap-2">{Object.entries(KIND).map(([k, v]) => <button key={k} className={`${btnGhost} !px-3 !py-1.5 !text-xs`} onClick={() => setEdit({ mi, li: m.lessons.length, fresh: k })}>Add {v.toLowerCase()}</button>)}</div>}
        </Card>
      ))}
      {canEdit && <div className="flex flex-wrap items-center gap-2"><button className={btnGhost} onClick={() => upd([...mods, { title: '', requiresPrevious: false, lessons: [] }])}>Add a module</button><button className={btnPrimary} onClick={save} disabled={!dirty || busy}>{busy ? 'Saving…' : 'Save the outline'}</button>{dirty && <span className="text-xs text-[#8a4636]">You have changes that are not saved.</span>}</div>}
      {err && <p role="alert" className="text-sm text-[#9f1239]">{err}</p>}
      {edit && (
        <LessonForm lesson={edit.fresh ? blankLesson(edit.fresh) : mods[edit.mi].lessons[edit.li]} earlier={flatBefore(edit.mi, edit.li)} onClose={() => setEdit(null)}
          onSave={(les) => { upd(mods.map((x, k) => (k === edit.mi ? { ...x, lessons: edit.fresh ? [...x.lessons, les] : x.lessons.map((y, z) => (z === edit.li ? les : y)) } : x))); setEdit(null); }} />
      )}
    </div>
  );
}
