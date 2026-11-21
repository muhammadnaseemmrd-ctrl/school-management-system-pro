import React, { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { Card, Field, inputCls, btnPrimary, btnGhost, btnDanger } from '../ui';
import apiClient from '../../utils/apiClient';
import { Loading, Note, Tag, useGet, dt, DStatus, Sev, KIND_WORD, Reason } from './asKit';

const msg = (x, d) => x.response?.data?.message || d;

function Flags({ flags, acked, onAck }) {
  if (!flags?.length) return <p className="text-sm text-[#3b4a5c]">No warnings.</p>;
  return (
    <ul className="space-y-2" aria-label="Warnings">
      {flags.map((f) => (
        <li key={f.id} className="flex flex-wrap items-start gap-2 rounded-lg border border-[#e3e7e7] bg-white p-2 text-sm">
          <Sev s={f.severity} /> <span className="flex-1 text-[#1b2837]">{f.message}</span>
          {onAck && f.severity === 'warn' && <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={acked.includes(f.id)} onChange={() => onAck(f.id)} /> I checked this</label>}
        </li>
      ))}
    </ul>
  );
}

function Sections({ d, edit, sections, setSections, confirmed, onConfirm }) {
  return (
    <div className="space-y-3">
      {sections.map((s, i) => (
        <div key={s.id || `n${i}`} className="rounded-xl border border-[#e3e7e7] bg-white p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {edit ? <input aria-label={`Heading of part ${i + 1}`} className={inputCls} value={s.heading || ''} maxLength={100} onChange={(e) => setSections(sections.map((x, j) => (j === i ? { ...x, heading: e.target.value } : x)))} /> : <h3 className="text-sm font-bold text-[#1b2837]">{s.heading || `Part ${i + 1}`}</h3>}
            <span className="flex gap-1">{s.kind === 'teacher' && <Tag tone="info">Yours</Tag>}{s.edited && <Tag tone="info">Changed by a person</Tag>}{(s.cites || []).length > 0 && <Tag tone="good">From a source</Tag>}</span>
          </div>
          {edit ? <textarea aria-label={`Text of part ${i + 1}`} className={`${inputCls} mt-2`} rows={4} value={s.text} maxLength={4000} onChange={(e) => setSections(sections.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} /> : <p className="mt-2 whitespace-pre-wrap text-sm text-[#3b4a5c]">{s.text}</p>}
          {(s.cites || []).length > 0 && <p className="mt-1 text-xs text-[#5b6b7b]">Source: {s.cites.map((c) => c.title || c).join('; ')}</p>}
          {onConfirm && s.id && <label className="mt-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={confirmed.includes(s.id)} onChange={() => onConfirm(s.id)} /> I read this part</label>}
        </div>
      ))}
      {edit && <button type="button" className={btnGhost} onClick={() => setSections([...sections, { heading: '', text: '' }])}>Add a part of your own</button>}
    </div>
  );
}

function Questions({ edit, qs, setQs, confirmed, onConfirm }) {
  const upd = (i, patch) => setQs(qs.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  return (
    <ol className="space-y-3">
      {qs.map((q, i) => (
        <li key={q.id} className="rounded-xl border border-[#e3e7e7] bg-white p-3">
          <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-bold text-[#1b2837]">{i + 1}.</span><Tag tone="none">{q.kind === 'mcq' ? 'Multiple choice' : q.kind === 'tf' ? 'True or false' : 'Short answer'}</Tag><Tag tone="none">{q.difficulty}</Tag>{q.verified ? <Tag tone="good">Answer checked</Tag> : <Tag tone="warn">Answer not checked yet</Tag>}</div>
          {edit ? <textarea aria-label={`Question ${i + 1}`} className={`${inputCls} mt-2`} rows={2} value={q.stem} onChange={(e) => upd(i, { stem: e.target.value })} /> : <p className="mt-2 text-sm text-[#1b2837]">{q.stem}</p>}
          {q.kind === 'mcq' && <ul className="mt-2 space-y-1">{(q.options || []).map((o, k) => <li key={o.id || k} className="flex items-center gap-2 text-sm">{edit ? <><input type="radio" name={`c${q.id}`} checked={!!o.correct} onChange={() => upd(i, { options: q.options.map((x, m) => ({ ...x, correct: m === k })) })} aria-label={`Choice ${k + 1} is correct`} /><input aria-label={`Choice ${k + 1} of question ${i + 1}`} className={inputCls} value={o.text} onChange={(e) => upd(i, { options: q.options.map((x, m) => (m === k ? { ...x, text: e.target.value } : x)) })} /></> : <><span aria-hidden="true">{o.correct ? '✔' : '○'}</span><span className={o.correct ? 'font-semibold' : ''}>{o.text}{o.correct ? ' (correct)' : ''}</span></>}</li>)}</ul>}
          {q.kind === 'tf' && (edit ? <Field label="The statement is"><select className={inputCls} value={String(q.answerTrue)} onChange={(e) => upd(i, { answerTrue: e.target.value === 'true' })}><option value="true">True</option><option value="false">False</option></select></Field> : <p className="mt-1 text-sm">Answer: <b>{q.answerTrue ? 'True' : 'False'}</b></p>)}
          {q.kind === 'short' && (edit ? <Field label="Accepted answers (one per line)"><textarea className={inputCls} rows={2} value={(q.accepted || []).join('\n')} onChange={(e) => upd(i, { accepted: e.target.value.split('\n') })} /></Field> : <p className="mt-1 text-sm">Accepted: <b>{(q.accepted || []).join(' / ')}</b></p>)}
          {(q.cites || []).length > 0 && <p className="mt-1 text-xs text-[#5b6b7b]">Source: {q.cites.map((c) => c.title || c).join('; ')}</p>}
          {onConfirm && <label className="mt-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={confirmed.includes(q.id)} onChange={() => onConfirm(q.id)} /> I checked the answer to this question</label>}
        </li>
      ))}
    </ol>
  );
}

// One draft: read it, change it, send it for review, decide on it, publish it.
export default function DraftView({ id, onBack, me }) {
  const g = useGet(`/ai/drafts/${id}`); const [title, setTitle] = useState(''); const [sections, setSections] = useState([]); const [qs, setQs] = useState([]); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const [conf, setConf] = useState([]); const [acked, setAcked] = useState([]); const [lang, setLang] = useState(false); const [act, setAct] = useState(null);
  const d = g.data?.draft; const mine = !!(d && me && String(d.requesterId) === me.userId);
  useEffect(() => { if (d) { setTitle(d.title); setSections(d.content?.sections || []); setQs(d.content?.questions || []); setConf([]); setAcked([]); } }, [d?._id, d?.edits, d?.status]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!d) return <div className="space-y-3"><button className={btnGhost} onClick={onBack}>Back</button><Loading g={g}>{null}</Loading></div>;
  const isMine = mine; const editable = d.status === 'Draft' && isMine; const reviewable = d.status === 'Review' && me?.canReview;
  const toggle = (arr, set) => (x) => set(arr.includes(x) ? arr.filter((y) => y !== x) : [...arr, x]);
  const run = async (fn, ok) => { setBusy(true); setErr(''); try { await fn(); if (ok) toast.success(ok); g.reload(); } catch (x) { const f = x.response?.data?.flags; setErr(msg(x, 'That did not work.') + (f ? ` ${f.map((y) => y.message).join(' ')}` : '')); } setBusy(false); };
  const save = () => run(() => apiClient.put(`/ai/drafts/${d._id}`, d.kind === 'question_set' ? { title, questions: qs.map((q) => ({ ...q, accepted: (q.accepted || []).map((x) => x.trim()).filter(Boolean) })) } : { title, sections }), 'Saved');
  const decide = (decision, note) => run(async () => { await apiClient.post(`/ai/drafts/${d._id}/decide`, { decision, note, confirmed: { sections: d.kind === 'question_set' ? [] : conf, questions: d.kind === 'question_set' ? conf : [], flags: acked, readsTargetLanguage: lang } }); setAct(null); }, decision === 'approve' ? 'Approved' : 'Done');
  const warns = (d.flags || []).filter((f) => f.severity === 'warn');
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3"><button className={btnGhost} onClick={onBack}>Back to the list</button><h1 className="text-lg font-bold text-[#1b2837]"><span dir="ltr">{d.no}</span> · {KIND_WORD[d.kind] || d.kind}</h1><DStatus s={d.status} /></div>
      <Card>
        <div className="flex flex-wrap items-center gap-2 text-xs text-[#5b6b7b]"><span>By {d.requesterName}</span><span>· made {dt(d.createdAt)}</span><span>· {d.provenance?.builtin ? 'built-in drafter' : `outside model ${d.provenance?.model || ''}`}</span>{d.edits > 0 && <span>· changed by a person {d.edits} time{d.edits === 1 ? '' : 's'}</span>}{d.decidedByName && <span>· {d.status === 'Approved' ? 'approved' : 'decided'} by {d.decidedByName}{d.soleAdmin ? ' (the only administrator)' : ''}</span>}</div>
        <p className="mt-2 rounded-lg bg-[#fff8e6] p-2 text-xs text-[#6b4e00]">{d.provenance?.marker || 'Drafted with the writing assistant'}. Read it all before you use it. It can be wrong.</p>
        {d.decisionNote && <p className="mt-2 text-sm text-[#3b4a5c]">Note from the reviewer: {d.decisionNote}</p>}
        {d.expiresAt && <p className="mt-1 text-xs text-[#5b6b7b]">Kept until {dt(d.expiresAt)}, then the text is erased.</p>}
        {d.published && <Note tone="ok">Published as {d.published.type === 'Notice' ? 'a notice' : 'questions in the bank (as drafts)'} by {d.published.byName} on {dt(d.published.at)}.</Note>}
      </Card>
      {(g.data.approvals || []).length > 0 && <Card><h2 className="text-sm font-bold text-[#1b2837]">Decisions</h2><ul className="mt-2 space-y-1 text-sm">{g.data.approvals.map((a, i) => <li key={i}><b>{a.decision}</b> by {a.byName} · {dt(a.at)}{a.note ? ` · ${a.note}` : ''}</li>)}</ul></Card>}
      <Card>
        {editable ? <Field label="Title"><input className={inputCls} value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} /></Field> : <h2 className="text-base font-bold text-[#1b2837]">{d.title}</h2>}
        <div className="mt-3">{d.status === 'Withdrawn' || d.status === 'Expired' ? <p className="text-sm text-[#5b6b7b]">The text was erased.</p> : d.kind === 'question_set' ? <Questions edit={editable} qs={qs} setQs={setQs} confirmed={conf} onConfirm={reviewable ? toggle(conf, setConf) : null} /> : <Sections d={d} edit={editable} sections={sections} setSections={setSections} confirmed={conf} onConfirm={reviewable ? toggle(conf, setConf) : null} />}</div>
      </Card>
      <Card><h2 className="mb-2 text-sm font-bold text-[#1b2837]">Checks</h2><Flags flags={d.flags} acked={acked} onAck={reviewable ? toggle(acked, setAcked) : null} /></Card>
      {reviewable && d.kind === 'translation' && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={lang} onChange={(e) => setLang(e.target.checked)} /> I read the language this was translated into, and the text is right</label>}
      {err && <p role="alert" className="text-sm text-[#9f1239]">{err}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        {editable && <><button className={btnGhost} disabled={busy} onClick={save}>Save my changes</button><button className={btnPrimary} disabled={busy} onClick={() => run(() => apiClient.post(`/ai/drafts/${d._id}/submit`), 'Sent for review')}>Send for review</button></>}
        {reviewable && <><button className={btnPrimary} disabled={busy} onClick={() => decide('approve', '')}>Approve{warns.length ? ` (${acked.length}/${warns.length} warnings checked)` : ''}</button><button className={btnGhost} disabled={busy} onClick={() => setAct('return')}>Return for changes</button><button className={btnDanger} disabled={busy} onClick={() => setAct('reject')}>Turn down</button></>}
        {d.status === 'Approved' && d.publishes && !d.published && (isMine || me?.canReview) && <button className={btnPrimary} disabled={busy} onClick={() => run(() => apiClient.post(`/ai/drafts/${d._id}/publish`), 'Published')}>{d.kind === 'notice' ? 'Publish the notice' : 'Add the questions to the bank'}</button>}
        {['Draft', 'Review', 'Approved'].includes(d.status) && !d.published && (isMine || me?.level === 'admin') && <button className={btnDanger} disabled={busy} onClick={() => setAct('withdraw')}>Withdraw and erase</button>}
      </div>
      {act === 'return' && <Reason title="Return for changes" text="Say what should change." confirm="Return" danger={false} onClose={() => setAct(null)} onDone={(n) => decide('return', n)} />}
      {act === 'reject' && <Reason title="Turn this down" text="Say why." confirm="Turn down" onClose={() => setAct(null)} onDone={(n) => decide('reject', n)} />}
      {act === 'withdraw' && <Reason title="Withdraw this draft" text="The text is erased. This cannot be undone." confirm="Withdraw" onClose={() => setAct(null)} onDone={() => run(async () => { await apiClient.post(`/ai/drafts/${d._id}/withdraw`); setAct(null); }, 'Withdrawn')} />}
      {(g.data.trail || []).length > 0 && <Card><h2 className="text-sm font-bold text-[#1b2837]">History</h2><ul className="mt-2 space-y-1 text-xs text-[#3b4a5c]">{g.data.trail.map((t, i) => <li key={i}>{dt(t.at)} · {t.byName} · {t.action}{t.note ? ` · ${t.note}` : ''}</li>)}</ul></Card>}
    </div>
  );
}
