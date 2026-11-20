import React, { useState } from 'react';
import { ArrowLeft, Download, Check } from 'lucide-react';
import { toast } from 'react-hot-toast';
import apiClient from '../../utils/apiClient';
import { Card, Field, Modal, Pill, Stat, btnPrimary, btnGhost, btnDanger, inputCls, errMsg } from '../ui';
import { Bar, Body, Row, Sub, Td, Tbl, useList } from '../attendance/deskKit';
import { call, useGet } from '../timetable/planKit';
import { BATCH_STEPS, BATCH_TONE, SCAN_TONE, dt, num, saveBlob } from './omrKit';
import ScanPanel from './ScanPanel';
import ReviewModal from './ReviewModal';

function Stepper({ status }) {
  const at = BATCH_STEPS.indexOf(status);
  return <ol className="flex flex-wrap gap-1.5 text-xs" aria-label="Where this sitting is">{BATCH_STEPS.map((s, i) => <li key={s} aria-current={i === at ? 'step' : undefined} className={`rounded-full px-2.5 py-1 font-semibold ${i < at ? 'bg-[#e3f1ea] text-[#1f6b3a]' : i === at ? 'bg-[#1b2837] text-white' : 'bg-[#f7f6f2] text-[#5b6b7b]'}`}>{i < at && <Check className="mr-1 inline h-3 w-3" aria-hidden="true" />}{s}</li>)}</ol>;
}

function Moderation({ batchId, isAdmin, notes, history, reload }) {
  const m = useGet(`/omr/batches/${batchId}/moderation`); const [note, setNote] = useState('');
  const addNote = () => call(() => apiClient.post(`/omr/batches/${batchId}/note`, { note }), 'Note added.', () => { setNote(''); reload(); });
  const d = m.data; const top = d ? Math.max(1, ...d.histogram) : 1;
  return (
    <div className="grid gap-4">
      {m.error && <div role="alert" className="text-sm text-[#9b2f1d]">{m.error}</div>}
      {d && (
        <>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6"><Stat label="Sheets" value={d.stats.n} /><Stat label="Average" value={`${d.stats.mean}%`} sub={`paper is out of ${num(d.max)}`} /><Stat label="Middle" value={`${d.stats.median}%`} /><Stat label="Lowest to highest" value={`${d.stats.min}–${d.stats.max}%`} /><Stat label="Full marks" value={d.stats.perfect} sub={`${d.stats.zero} scored zero`} /><Stat label="People's decisions" value={d.overrides.total} sub={Object.entries(d.overrides.byReviewer).map(([k, v]) => `${k}: ${v}`).join(' · ')} /></div>
          <div><div className="mb-1 text-sm font-semibold">How the class did (percent)</div><div className="flex h-24 items-end gap-1" role="img" aria-label={`Number of sheets in each ten percent band: ${d.histogram.join(', ')}`}>{d.histogram.map((v, i) => <div key={i} className="flex h-full flex-1 flex-col items-center justify-end"><span className="text-[10px] text-[#5b6b7b]">{v || ''}</span><div className="w-full rounded-t bg-[#2c776c]" style={{ height: `${(v / top) * 100}%`, minHeight: v ? 3 : 0 }} /></div>)}</div><div className="mt-0.5 flex gap-1 text-[10px] text-[#5b6b7b]">{d.histogram.map((_, i) => <span key={i} className="flex-1 text-center">{i * 10}</span>)}</div></div>
          {d.outliers.length > 0 && <div className="rounded-lg bg-[#f7f1de] p-2 text-sm text-[#6b4d00]">Unusually high or low: {d.outliers.map((o) => `${o.name} (${o.pct}%)`).join(', ')}. Look at their sheets before approving.</div>}
          {d.suspectItems.length > 0 && <div role="alert" className="rounded-lg bg-[#fbeeea] p-2 text-sm text-[#7a2a1b]">Questions {d.suspectItems.join(', ')}: almost nobody got these right, and most chose one other answer. Check the key.</div>}
          <details className="rounded-lg border border-[#e3e7e7] p-2"><summary className="cursor-pointer text-sm font-semibold">Each question ({d.items.length})</summary>
            <div className="mt-2 overflow-x-auto"><Tbl head={['Q', 'Key', 'Got it right', 'Chose', '']}>{d.items.map((x) => <Row key={x.q}><Td>{x.q}</Td><Td><code>{x.key}</code></Td><Td><div className="flex items-center gap-2"><div className="h-2 w-24 rounded bg-[#e3e7e7]"><div className="h-2 rounded bg-[#2c776c]" style={{ width: `${x.facility}%` }} /></div>{x.facility}%</div></Td><Td className="text-xs">{Object.entries(x.counts).filter(([, v]) => v).map(([l, v]) => `${l || 'blank'} ${v}`).join(' · ')}</Td><Td>{x.suspect && <Pill value="Suspended">Check key</Pill>}</Td></Row>)}</Tbl></div></details>
        </>
      )}
      <div className="grid gap-2"><div className="text-sm font-semibold">Notes for moderators</div>{(notes || []).map((n, i) => <div key={i} className="rounded bg-[#f7f6f2] p-2 text-xs"><b>{n.byName}</b> · {dt(n.at)} — {n.note}</div>)}<div className="flex gap-2"><input aria-label="New note" className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Write a note" /><button className={btnGhost} disabled={note.trim().length < 3} onClick={addNote}>Add</button></div></div>
      <details className="rounded-lg border border-[#e3e7e7] p-2"><summary className="cursor-pointer text-sm font-semibold">History ({(history || []).length})</summary><ul className="mt-2 grid gap-1 text-xs">{(history || []).map((h, i) => <li key={i} className="rounded bg-[#f7f6f2] p-1.5">{dt(h.at)} · {h.byName} · <b>{h.action}</b>{h.detail ? ` — ${h.detail}` : ''}</li>)}</ul></details>
    </div>
  );
}

function Publish({ batch, form, onClose, onDone }) {
  const [exams, setExams] = useState(null); const [examId, setExamId] = useState(form.examId || ''); const [busy, setBusy] = useState(false);
  React.useEffect(() => { apiClient.get('/marks/exams', { params: { limit: 300 } }).then((r) => setExams((r.data.exams || []).filter((e) => String(e.classId?._id || e.classId) === String(form.classId)))).catch(() => setExams([])); }, [form.classId]);
  const go = async () => { setBusy(true); const r = await call(() => apiClient.post(`/omr/batches/${batch._id}/publish`, { examId }), (x) => `${x.data.written} marks published.`, () => { onDone(); onClose(); }); setBusy(false); return r; };
  return (
    <Modal title="Publish marks" onClose={onClose}>
      <div className="grid gap-3 text-sm"><p>Marks are scaled to the exam's total and written to the marks book. Students and guardians who may see marks are told.</p>
        <Field label="Exam"><select className={inputCls} value={examId} onChange={(e) => setExamId(e.target.value)}><option value="">Choose…</option>{(exams || []).map((e) => <option key={e._id} value={e._id}>{e.name} · out of {e.totalMarks}</option>)}</select></Field>
        {exams && !exams.length && <div className="rounded-lg bg-[#f7f1de] p-2 text-[#6b4d00]">There is no exam for this class yet. Create one in "Exams", then come back.</div>}
        <div className="flex justify-end gap-2"><button className={btnGhost} onClick={onClose}>Cancel</button><button className={btnPrimary} disabled={!examId || busy} onClick={go}>Publish</button></div></div>
    </Modal>
  );
}

function ReasonModal({ ask, onClose }) {
  const [reason, setReason] = useState('');
  return (
    <Modal title={ask.title} onClose={onClose}>
      <div className="grid gap-3"><Field label={ask.label} hint={ask.hint || 'At least 5 letters. Kept in the history.'}><input className={inputCls} autoFocus value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <div className="flex justify-end gap-2"><button className={btnGhost} onClick={onClose}>Cancel</button><button className={ask.danger ? btnDanger : btnPrimary} disabled={reason.trim().length < 5} onClick={() => { ask.ok(reason.trim()); onClose(); }}>Confirm</button></div></div>
    </Modal>
  );
}

export default function BatchView({ id, isAdmin, onBack }) {
  const b = useGet(`/omr/batches/${id}`); const [tab, setTab] = useState('scan'); const [filter, setFilter] = useState(''); const [review, setReview] = useState(null); const [replace, setReplace] = useState(null); const [pub, setPub] = useState(false); const [ask, setAsk] = useState(null);
  const sc = useList(`/omr/batches/${id}/scans`, 'scans', filter ? { status: filter } : {});
  if (!b.data) return <Card className="p-4 text-sm text-[#5b6b7b]">{b.error || 'Loading…'}</Card>;
  const { batch, form, counts, absent, keyStale } = b.data; const st = batch.status; const reload = () => { b.reload(); sc.reload(); };
  const run = (fn, ok) => call(fn, ok, reload); const post = (p, body) => () => apiClient.post(`/omr/batches/${id}/${p}`, body || {});
  const reopen = () => setAsk({ title: 'Reopen this sitting', label: 'Why is it being reopened?', ok: (reason) => run(post('reopen', { reason }), 'Reopened.') });
  const regrade = () => setAsk({ title: 'Regrade published marks', label: 'Why are the published marks being changed?', hint: 'The current answer key is applied. Students and guardians are told about marks that change.', danger: true, ok: (reason) => run(post('regrade-published', { reason }), (r) => `${r.data.changed} published mark(s) updated.`) });
  const canScan = ['Scanning', 'Graded', 'Moderation'].includes(st);
  const th = form.thresholds;
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3"><button className={btnGhost} onClick={onBack}><ArrowLeft className="mr-1 inline h-4 w-4" aria-hidden="true" />All sittings</button><div><h3 className="text-lg font-bold text-[#1b2837]">{batch.title}</h3><div className="text-xs text-[#5b6b7b]">{form.title} · sheet {String(form.code).padStart(4, '0')} · key {form.keyVersion || 'not set'}{batch.keyVersion ? ` (graded on key ${batch.keyVersion})` : ''}</div></div><div className="ml-auto"><Pill value={BATCH_TONE[st]}>{st}</Pill></div></div>
      <Stepper status={st} />
      {keyStale && <div role="alert" className="rounded-lg bg-[#fbeeea] p-3 text-sm text-[#7a2a1b]">The answer key was revised after these marks were published. {isAdmin ? 'Use "Regrade published marks" to apply the new key.' : 'An administrator can apply the new key.'}</div>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><Stat label="Sheets taken" value={counts.total} /><Stat label="Need a person" value={counts.needsReview} tone={counts.needsReview ? 'text-[#9b5f00]' : undefined} /><Stat label="Need a new photo" value={counts.rescan} /><Stat label="Counted" value={counts.counted} sub={counts.ungraded ? `${counts.ungraded} not graded yet` : 'all graded'} /><Stat label="No sheet yet" value={absent.length} sub={absent.slice(0, 3).map((a) => a.name).join(', ')} /></div>
      <Card><Bar>
        {['Scanning', 'Graded', 'Moderation'].includes(st) && <button className={btnPrimary} onClick={() => run(post('grade'), (r) => `${r.data.graded} sheets graded.`)}>{st === 'Scanning' ? 'Grade this batch' : 'Grade again'}</button>}
        {st === 'Graded' && <button className={btnPrimary} onClick={() => run(post('submit'), 'Sent for moderation.')}>Send for moderation</button>}
        {st === 'Moderation' && isAdmin && <button className={btnPrimary} onClick={() => run(post('approve', {}), 'Approved.')}>Approve grades</button>}
        {st === 'Approved' && isAdmin && <button className={btnPrimary} onClick={() => setPub(true)}>Publish marks…</button>}
        {st === 'Published' && isAdmin && keyStale && <button className={btnDanger} onClick={regrade}>Regrade published marks</button>}
        {['Graded', 'Moderation', 'Approved'].includes(st) && isAdmin && <button className={btnGhost} onClick={reopen}>Reopen</button>}
        {['Approved', 'Published'].includes(st) && <button className={`${btnGhost} ml-auto`} onClick={() => call(() => saveBlob(`/omr/batches/${id}/export`, `omr-${String(form.code).padStart(4, '0')}.csv`))}><Download className="mr-1 inline h-4 w-4" aria-hidden="true" />Export grades (CSV)</button>}
        {st === 'Moderation' && !isAdmin && <span className="text-sm text-[#5b6b7b]">Waiting for an administrator to approve. They must be a different person from whoever graded or corrected it.</span>}
      </Bar></Card>
      <div role="tablist" className="flex flex-wrap gap-2">{[['scan', 'Photograph sheets'], ['sheets', `Sheets (${counts.total})`], ['mod', 'Moderation']].map(([k, v]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${tab === k ? 'bg-[#1b2837] text-white' : 'bg-[#f7f6f2] text-[#3b4a5c] hover:bg-[#e9efee]'}`}>{v}</button>)}</div>
      {tab === 'scan' && <Card className="p-4">{canScan ? <ScanPanel batchId={id} form={form} th={th} replace={replace} onReplaced={() => setReplace(null)} onChanged={reload} /> : <div className="text-sm text-[#5b6b7b]">This sitting is {st.toLowerCase()}. Reopen it to add or change sheets.</div>}</Card>}
      {tab === 'sheets' && (
        <Card><Bar><label className="text-sm font-medium" htmlFor="omr-filter">Show</label><select id="omr-filter" className={`${inputCls} w-48`} value={filter} onChange={(e) => setFilter(e.target.value)}><option value="">All sheets</option>{['Needs review', 'Ready', 'Graded', 'Rescan', 'Superseded'].map((s) => <option key={s} value={s}>{s}</option>)}</select></Bar>
          <Body l={sc} cols={6} empty="No sheets here yet. Photograph some on the other tab.">
            <Tbl head={['Candidate', 'Status', 'To look at', 'Marks', 'Photographed', '']}>{sc.rows.map((s) => <Row key={s._id}><Td><div className="font-medium">{s.candidate.name || (s.candidate.read ? `Number ${s.candidate.read}` : 'Unknown')}</div><Sub>{s.candidate.admissionNumber}{s.rescanOf ? ' · replacement photo' : ''}</Sub></Td><Td><Pill value={SCAN_TONE[s.status]}>{s.status}</Pill></Td><Td className="text-xs">{s.status === 'Rescan' ? 'New photo needed' : [s.toReview ? `${s.toReview} mark${s.toReview > 1 ? 's' : ''}` : '', ...s.flags.filter((f) => f.level === 'block' && !f.resolved).map((f) => f.code)].filter(Boolean).join(', ') || '—'}</Td><Td>{s.grade && s.status === 'Graded' ? `${num(s.grade.raw)} / ${num(s.grade.max)}` : '—'}</Td><Td className="text-xs">{dt(s.capturedAt)}<Sub>{s.capturedByName}</Sub></Td><Td>{s.status === 'Rescan' ? <button className={btnGhost} onClick={() => { setReplace(s._id); setTab('scan'); toast('The next photo will replace this sheet.'); }}>Retake</button> : s.status !== 'Superseded' && <button className={btnGhost} onClick={() => setReview(s._id)}>{s.status === 'Needs review' ? 'Check' : 'Open'}</button>}</Td></Row>)}</Tbl>
          </Body></Card>
      )}
      {tab === 'mod' && (batch.keyVersion ? <Card className="p-4"><Moderation batchId={id} isAdmin={isAdmin} notes={batch.notes} history={batch.history} reload={b.reload} /></Card> : <Card className="p-4 text-sm text-[#5b6b7b]">Grade the batch to see how the class did and which questions look wrong.</Card>)}
      {review && <ReviewModal scanId={review} form={form} onClose={() => setReview(null)} onSaved={reload} onRetake={(sid) => { setReplace(sid); setTab('scan'); }} />}
      {ask && <ReasonModal ask={ask} onClose={() => setAsk(null)} />}
      {pub && <Publish batch={batch} form={form} onClose={() => setPub(false)} onDone={reload} />}
    </div>
  );
}
