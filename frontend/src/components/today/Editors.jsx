import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import { Modal, Field, btnGhost, btnPrimary, inputCls, errMsg } from '../ui';
import { submit, newLocalId } from '../../utils/syncQueue';

const say = (res, after) => {
  if (res.queued) { toast('Saved on this device. It is not on the server yet and will be sent when you are online.', { icon: '📶', duration: 5000 }); return 'queued'; }
  const r = res.result;
  if (r.status === 'Rejected') { toast.error(r.message); return 'rejected'; }
  if (r.status === 'Partial' || r.status === 'Conflicted') { toast(r.message, { icon: '⚠️', duration: 7000 }); after && after(); return 'conflict'; }
  toast.success(r.message || 'Saved'); return 'applied';
};

const SEG = ['Present', 'Absent', 'Late', 'Leave'];
/* ───────── register (daily roll call for the head master's class, or one lesson) ───────── */
export const RegisterModal = ({ mode, lesson, cls, date, onClose, onSaved, onConflict }) => {
  const key = lesson ? `${lesson.startTime}-${lesson.endTime}` : ''; const existing = (mode === 'period' ? cls.periods?.[key] : cls.daily) || {};
  const [rows, setRows] = useState(() => Object.fromEntries(cls.students.map((s) => [s._id, existing[s._id] || (s.onLeave ? 'Leave' : 'Present')]))); const [busy, setBusy] = useState(false);
  const statuses = mode === 'daily' ? [...SEG.slice(0, 3), 'HalfDay', 'Leave'] : SEG; const counts = statuses.reduce((m, s) => ({ ...m, [s]: Object.values(rows).filter((x) => x === s).length }), {});
  const save = async () => {
    setBusy(true);
    try {
      const base = Object.fromEntries(cls.students.map((s) => [s._id, existing[s._id] || null])); const records = cls.students.map((s) => ({ studentId: s._id, status: rows[s._id] }));
      const payload = mode === 'period' ? { classId: cls.classId, subjectId: lesson.subjectId || null, startTime: lesson.startTime, endTime: lesson.endTime, date, records, base } : { classId: cls.classId, date, records, base };
      const res = await submit({ kind: mode === 'period' ? 'period' : 'attendance', entityKey: mode === 'period' ? `period:${cls.classId}:${date}:${lesson.startTime}` : `att:${cls.classId}:${date}`, payload, label: `${mode === 'period' ? 'Lesson register' : 'Roll call'} ${cls.className}` });
      const out = say(res, onConflict); if (out === 'rejected') { setBusy(false); return; }
      onSaved(records, out); onClose();
    } catch (e) { toast.error(errMsg(e)); setBusy(false); }
  };
  return (
    <Modal title={`${mode === 'period' ? `${lesson.subjectName} · ` : 'Roll call · '}${cls.className}`} onClose={onClose} wide>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm"><span className="text-[#3b4a5c]">{statuses.map((s) => `${counts[s]} ${s}`).join(' · ')}</span><button className={`${btnGhost} !px-3 !py-1.5 !text-xs`} onClick={() => setRows(Object.fromEntries(cls.students.map((s) => [s._id, s.onLeave ? 'Leave' : 'Present'])))}>Everyone present</button></div>
      <ul className="divide-y divide-[#e3e7e7] rounded-xl border border-[#e3e7e7]">
        {cls.students.map((s) => (
          <li key={s._id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"><span className="min-w-0 text-sm"><span className="font-semibold">{s.name}</span><span className="ms-2 text-xs text-[#5b6b7b]">{s.rollNumber}{s.onLeave ? ' · on approved leave' : ''}</span></span>
            <span role="radiogroup" aria-label={`Status for ${s.name}`} className="flex flex-wrap gap-1">{statuses.map((st) => <button key={st} role="radio" aria-checked={rows[s._id] === st} onClick={() => setRows({ ...rows, [s._id]: st })} className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${rows[s._id] === st ? (st === 'Absent' ? 'border-red-300 bg-red-50 text-red-800' : st === 'Present' ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-amber-300 bg-amber-50 text-amber-900') : 'border-[#e3e7e7] bg-white text-[#3b4a5c]'}`}>{st === 'HalfDay' ? 'Half day' : st}</button>)}</span></li>))}
      </ul>
      <p className="mt-3 text-xs text-[#5b6b7b]">If someone else already marked a child differently while you were away, that child goes to your clash inbox instead of being overwritten.</p>
      <div className="mt-4 flex justify-end gap-2"><button className={btnGhost} onClick={onClose}>Cancel</button><button className={btnPrimary} disabled={busy} onClick={save}>Save register</button></div>
    </Modal>
  );
};

/* ───────── marks ───────── */
export const MarksModal = ({ exam, cls, onClose, onSaved, onConflict }) => {
  const [v, setV] = useState(() => Object.fromEntries(cls.students.map((s) => [s._id, exam.current?.[s._id] ? String(exam.current[s._id].marks) : '']))); const [busy, setBusy] = useState(false);
  const changed = cls.students.filter((s) => v[s._id] !== '' && (!exam.current?.[s._id] || String(exam.current[s._id].marks) !== v[s._id])); const bad = changed.some((s) => Number(v[s._id]) < 0 || Number(v[s._id]) > exam.totalMarks || Number.isNaN(Number(v[s._id])));
  const save = async () => {
    setBusy(true); let queued = 0; let ok = 0; let clash = 0; let refused = 0; const saved = {};
    for (const s of changed) {
      try {
        const cur = exam.current?.[s._id]; const res = await submit({ kind: 'marks', entityKey: `marks:${exam.examId}:${s._id}:${exam.subjectId}`, payload: { examId: exam.examId, studentId: s._id, subjectId: exam.subjectId, marks: Number(v[s._id]), outOfMarks: exam.totalMarks, remarks: cur?.remarks || '', base: cur ? { marks: cur.marks, remarks: cur.remarks || '' } : null }, label: `${exam.name}: ${s.name}` });
        if (res.queued) { queued += 1; saved[s._id] = { marks: Number(v[s._id]), remarks: cur?.remarks || '' }; } else if (res.result.status === 'Applied') { ok += 1; saved[s._id] = { marks: Number(v[s._id]), remarks: cur?.remarks || '' }; } else if (res.result.status === 'Conflicted') clash += 1; else { refused += 1; toast.error(`${s.name}: ${res.result.message}`); }
      } catch (e) { refused += 1; toast.error(errMsg(e)); }
    }
    if (queued) toast('Marks saved on this device. They are not on the server yet.', { icon: '📶', duration: 5000 }); if (ok) toast.success(`${ok} mark${ok === 1 ? '' : 's'} saved`); if (clash) { toast(`${clash} mark${clash === 1 ? ' was' : 's were'} changed by someone else. Choose in Clashes.`, { icon: '⚠️', duration: 7000 }); onConflict && onConflict(); }
    onSaved(saved); if (!refused) onClose(); else setBusy(false);
  };
  return (
    <Modal title={`${exam.name} · ${exam.subjectName} · ${exam.className}`} onClose={onClose} wide>
      <p className="mb-3 text-sm text-[#3b4a5c]">Marks out of {exam.totalMarks}. {exam.entered} of {exam.total} entered so far.</p>
      <ul className="divide-y divide-[#e3e7e7] rounded-xl border border-[#e3e7e7]">{cls.students.map((s) => <li key={s._id} className="flex items-center justify-between gap-3 px-3 py-2"><label htmlFor={`m-${s._id}`} className="text-sm"><span className="font-semibold">{s.name}</span><span className="ms-2 text-xs text-[#5b6b7b]">{s.rollNumber}</span></label><input id={`m-${s._id}`} type="number" inputMode="decimal" min="0" max={exam.totalMarks} className={`${inputCls} !w-24 text-end`} value={v[s._id]} onChange={(e) => setV({ ...v, [s._id]: e.target.value })} /></li>)}</ul>
      {bad && <p className="mt-2 text-sm text-[#9f1239]">Marks must be between 0 and {exam.totalMarks}.</p>}
      <div className="mt-4 flex justify-end gap-2"><button className={btnGhost} onClick={onClose}>Cancel</button><button className={btnPrimary} disabled={busy || !changed.length || bad} onClick={save}>Save {changed.length || ''} mark{changed.length === 1 ? '' : 's'}</button></div>
    </Modal>
  );
};

/* ───────── drafts and notes ───────── */
export const DraftEditor = ({ draft, pack, preset, onClose, onSaved }) => {
  const [f, setF] = useState(() => ({ kind: draft?.kind || preset?.kind || 'lessonNote', title: draft?.title || '', body: draft?.body || '', classId: draft?.classId || preset?.classId || '', subjectId: draft?.subjectId || preset?.subjectId || '', date: draft?.date || preset?.date || '', dueDate: draft?.dueDate || '' })); const [busy, setBusy] = useState(false);
  const classes = pack.classes || []; const subs = (pack.assignments || []).filter((a) => !f.classId || String(a.classId) === String(f.classId));
  const save = async () => {
    setBusy(true); const localId = draft?.localId || newLocalId();
    try {
      const payload = { ...f, classId: f.classId || null, subjectId: f.subjectId || null };
      const res = await submit({ kind: 'draft', entityKey: `draft:${localId}`, baseRevision: draft?.revision || 0, payload, label: `Draft: ${f.title || 'untitled'}` });
      const out = say(res); if (out === 'rejected') { setBusy(false); return; }
      onSaved({ localId, ...payload, revision: res.result?.revision || draft?.revision || 0, status: 'Draft', updatedAt: new Date().toISOString() }); onClose();
    } catch (e) { toast.error(errMsg(e)); setBusy(false); }
  };
  return (
    <Modal title={draft ? 'Edit draft' : 'New draft'} onClose={onClose} wide>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="What is it"><select className={inputCls} value={f.kind} disabled={!!draft} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="lessonNote">Lesson note (private)</option><option value="homework">Homework (published later)</option><option value="reminder">Reminder (private)</option></select></Field>
        <Field label="Title"><input className={inputCls} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={120} /></Field>
        <Field label="Class"><select className={inputCls} value={f.classId} onChange={(e) => setF({ ...f, classId: e.target.value, subjectId: '' })}><option value="">None</option>{classes.map((c) => <option key={c.classId} value={c.classId}>{c.className}</option>)}</select></Field>
        <Field label="Subject"><select className={inputCls} value={f.subjectId} onChange={(e) => setF({ ...f, subjectId: e.target.value })}><option value="">None</option>{subs.map((a) => <option key={`${a.classId}-${a.subjectId}`} value={a.subjectId}>{a.subjectName}{!f.classId ? ` · ${a.className}` : ''}</option>)}</select></Field>
        {f.kind === 'lessonNote' && <Field label="For the day"><input type="date" className={inputCls} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>}
        {f.kind === 'homework' && <Field label="Due on"><input type="date" className={inputCls} value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></Field>}
        <div className="sm:col-span-2"><Field label="Text"><textarea className={inputCls} rows={5} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} maxLength={4000} /></Field></div>
      </div>
      <div className="mt-4 flex justify-end gap-2"><button className={btnGhost} onClick={onClose}>Cancel</button><button className={btnPrimary} disabled={busy || (!f.title.trim() && !f.body.trim())} onClick={save}>Save draft</button></div>
    </Modal>
  );
};
