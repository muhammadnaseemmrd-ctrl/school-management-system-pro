import React, { useMemo, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import apiClient from '../../utils/apiClient';
import { buildLayout } from './layout.js';
import { Modal, Field, Pill, btnPrimary, btnGhost, btnDanger, inputCls, errMsg } from '../ui';
import { useGet } from '../timetable/planKit';
import { SCAN_TONE, STATE_WORDS, useBlobUrl, dt, pct } from './omrKit';

const ACCEPTABLE = ['blur', 'dark', 'contrast', 'mostly-blank'];
const REASONS = ['Clear mark, read wrongly', 'Light pencil, intended answer', 'Rubbed out, the other mark stands', 'Two marks: counts as wrong', 'Left blank', 'Candidate number written by hand'];

// One cut-out of the straightened page, so a person can look at the real marks
function Crop({ url, x, y, w, h, width = 260, rings }) {
  return (
    <svg viewBox={`${x} ${y} ${w} ${h}`} width={width} className="rounded border border-[#e3e7e7] bg-white" role="img" aria-label="Cut-out of the answer sheet">
      {url && <image href={url} x="0" y="0" width="210" height="297" preserveAspectRatio="none" />}
      {(rings || []).map((r, i) => <circle key={i} cx={r.x} cy={r.y} r="2.6" fill="none" stroke={r.color} strokeWidth="0.35" />)}
    </svg>
  );
}

export default function ReviewModal({ scanId, form, onClose, onSaved, onRetake }) {
  const d = useGet(`/omr/scans/${scanId}`); const cand = useGet(`/omr/forms/${form._id}`);
  const page = useBlobUrl(d.data && d.data.scan.status !== 'Rescan' ? `/omr/scans/${scanId}/image` : '');
  const layout = useMemo(() => buildLayout({ questions: form.questions, choices: form.choices, idDigits: form.idDigits }), [form.questions, form.choices, form.idDigits]);
  const [pend, setPend] = useState({}); const [accept, setAccept] = useState([]); const [cno, setCno] = useState(''); const [reason, setReason] = useState(''); const [all, setAll] = useState(false); const [busy, setBusy] = useState(false); const [zoom, setZoom] = useState(false); const list = useRef(null);
  if (d.loading || !d.data) return <Modal title="Sheet" onClose={onClose} wide>{d.error ? <div role="alert" className="text-sm text-[#9b2f1d]">{d.error}</div> : <div className="text-sm text-[#5b6b7b]">Loading…</div>}</Modal>;
  const { scan, answers, thresholds: th, reviews } = d.data; const letters = scan.letters; const settled = ['Superseded'].includes(scan.status);
  const need = (a) => ['multiple', 'faint', 'low'].includes(a.state) && a.by !== 'review';
  const shown = answers.filter((a) => all || need(a) || pend[a.q] !== undefined || a.by === 'review');
  const openFlags = scan.flags.filter((f) => !f.resolved);
  const pick = (q, m) => setPend((p) => ({ ...p, [q]: m }));
  const decided = (a) => (pend[a.q] !== undefined ? pend[a.q] : (a.by === 'review' ? a.final : undefined));
  const undecided = answers.filter((a) => need(a) && pend[a.q] === undefined);
  const key = (e, a) => { const k = e.key.toUpperCase(); if (letters.includes(k) && k.length === 1) { pick(a.q, k); e.preventDefault(); } else if (k === 'B' && !letters.includes('B')) { pick(a.q, ''); } else if (e.key === 'Backspace' || e.key === ' ' || k === '0') { pick(a.q, ''); e.preventDefault(); } else if (k === 'X') { pick(a.q, 'X'); } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { const rows = [...list.current.querySelectorAll('[data-row]')]; const i = rows.indexOf(e.currentTarget); rows[i + (e.key === 'ArrowDown' ? 1 : -1)]?.focus(); e.preventDefault(); } };
  const changes = Object.keys(pend).length + accept.length + (cno ? 1 : 0);
  const save = async () => {
    setBusy(true);
    try { const body = { reason, answers: Object.entries(pend).map(([q, mark]) => ({ q: Number(q), mark })), accept, candidate: cno ? { no: Number(cno) } : undefined }; await apiClient.post(`/omr/scans/${scanId}/review`, body); toast.success('Decisions saved.'); onSaved(); onClose(); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const reject = async () => { try { await apiClient.post(`/omr/scans/${scanId}/reject`, { reason: reason.trim() }); toast.success('Sheet set aside.'); onSaved(); onClose(); } catch (e) { toast.error(errMsg(e)); } };
  const idRows = layout.idCols[0]; const idX = layout.id.x0 - 9; const idW = layout.idDigits * layout.id.dx + 14; const idH = (idRows[9].y - idRows[0].y) + 10;
  const ringsFor = (a) => { const row = layout.rows[a.q - 1]; return row.cols.map((b, i) => ({ x: b.x, y: b.y, color: a.fills[i] >= th.mark ? '#2c776c' : a.fills[i] >= th.faint ? '#c98a00' : 'transparent' })); };

  return (
    <Modal title={`Check sheet${scan.candidate.name ? ` · ${scan.candidate.name}` : ''}`} onClose={onClose} wide>
      <div className="grid gap-4" style={{ minWidth: 0 }}>
        <div className="flex flex-wrap items-center gap-2 text-sm"><Pill value={SCAN_TONE[scan.status] || 'None'}>{scan.status}</Pill><span className="text-[#5b6b7b]">Photographed {dt(scan.capturedAt)} by {scan.capturedByName}</span>{scan.rescanOf && <span className="text-[#5b6b7b]">· replaces an earlier photo</span>}
          {scan.grade && scan.grade.max != null && <span className="ml-auto font-semibold">{scan.grade.raw} / {scan.grade.max}</span>}</div>
        {openFlags.length > 0 && (
          <div className="grid gap-2" aria-label="Problems with this photo">
            {openFlags.map((f) => (
              <div key={f.code} className={`flex flex-wrap items-center gap-2 rounded-lg p-2 text-sm ${f.level === 'block' ? 'bg-[#fbeeea] text-[#7a2a1b]' : 'bg-[#f7f1de] text-[#6b4d00]'}`}>
                <span className="min-w-0 flex-1">{f.msg}</span>
                {ACCEPTABLE.includes(f.code) && !settled && <label className="flex items-center gap-1.5 text-xs font-semibold"><input type="checkbox" checked={accept.includes(f.code)} onChange={(e) => setAccept(e.target.checked ? [...accept, f.code] : accept.filter((c) => c !== f.code))} />I looked at the page: it is readable</label>}
                {f.code === 'corners' && onRetake && <button className={btnGhost} onClick={() => { onRetake(scanId); onClose(); }}>Take a new photo</button>}
              </div>
            ))}
          </div>
        )}
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div>
            <div className="mb-1 flex items-center justify-between"><span className="text-sm font-semibold">The page as read</span><button className="text-xs text-[#234c91] underline" onClick={() => setZoom(!zoom)}>{zoom ? 'Fit to window' : 'Larger'}</button></div>
            <div className={`overflow-auto rounded-lg border border-[#e3e7e7] bg-[#f7f6f2] ${zoom ? 'max-h-[70vh]' : 'max-h-[46vh]'}`}>{page.url ? <img src={page.url} alt="The straightened answer sheet" className={zoom ? 'w-[900px] max-w-none' : 'w-full'} /> : <div className="p-6 text-center text-sm text-[#5b6b7b]">{page.err || scan.status === 'Rescan' ? 'There is no straightened page for this sheet.' : 'Loading the page…'}</div>}</div>
            <div className="mt-2"><a className="text-xs text-[#234c91] underline" href="#photo" onClick={async (e) => { e.preventDefault(); try { const r = await apiClient.get(`/omr/scans/${scanId}/image?kind=photo`, { responseType: 'blob' }); window.open(URL.createObjectURL(r.data), '_blank', 'noopener'); } catch (er) { toast.error(errMsg(er)); } }}>Open the original photo</a></div>
          </div>
          <div className="grid content-start gap-3">
            <div className="rounded-lg border border-[#e3e7e7] p-2">
              <div className="mb-1 text-sm font-semibold">Candidate</div>
              <div className="flex flex-wrap items-start gap-3"><Crop url={page.url} x={idX} y={idRows[0].y - 6} w={idW} h={idH} width={190} />
                <div className="grid min-w-[10rem] flex-1 gap-1 text-sm"><div>Read as <code className="rounded bg-[#f7f6f2] px-1">{scan.candidate.read || '—'}</code> {scan.candidate.state === 'ok' ? <span className="text-[#1f6b3a]">· {scan.candidate.name}{scan.candidate.by === 'review' ? ' (chosen by a person)' : ''}</span> : <span className="text-[#9b2f1d]">· {scan.candidate.state === 'unknown' ? 'not on the list' : 'unclear'}</span>}</div>
                  {!settled && <Field label="Choose the candidate"><select className={inputCls} value={cno} onChange={(e) => setCno(e.target.value)}><option value="">{scan.candidate.state === 'ok' ? 'Keep as read' : 'Choose…'}</option>{(cand.data?.candidates || []).map((c) => <option key={c.no} value={c.no}>{String(c.no).padStart(form.idDigits, '0')} · {c.name}</option>)}</select></Field>}
                </div></div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2"><div className="text-sm font-semibold">Answers {undecided.length > 0 ? <span className="font-normal text-[#8a5a00]">· {undecided.length} still need a decision</span> : <span className="font-normal text-[#1f6b3a]">· nothing waiting</span>}</div><label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />Show every question</label></div>
            <div ref={list} className="grid max-h-[46vh] gap-2 overflow-y-auto pr-1" aria-label="Questions to check. Press A to E to choose, B or Backspace for blank, X for two marks, up and down to move.">
              {shown.length === 0 && <div className="rounded-lg bg-[#f7f6f2] p-3 text-sm text-[#5b6b7b]">Every mark on this sheet was clear. Tick "Show every question" to look at any of them.</div>}
              {shown.map((a) => { const row = layout.rows[a.q - 1]; const cur = decided(a); const colX = row.cols[0].x - layout.q.bubbleX; const w = layout.q.bubbleX + (layout.choices - 1) * layout.q.bubbleDx + 5;
                return (
                  <div key={a.q} data-row tabIndex={settled ? -1 : 0} onKeyDown={settled ? undefined : (e) => key(e, a)} className={`rounded-lg border p-2 outline-none focus:ring-2 focus:ring-[#2a5cac] ${need(a) && cur === undefined ? 'border-[#e0b04a] bg-[#fdf8ea]' : 'border-[#e3e7e7] bg-white'}`}>
                    <div className="flex flex-wrap items-center gap-3">
                      <Crop url={page.url} x={colX} y={row.y - 3.6} w={w} h={7.2} width={Math.round(w * 4.4)} rings={ringsFor(a)} />
                      <div className="grid gap-1 text-xs"><div className="font-semibold text-[#1b2837]">Question {a.q}</div><div className="text-[#5b6b7b]">{STATE_WORDS[a.state]}{a.det ? `: ${a.det}` : ''} · {a.fills.map((v, i) => `${letters[i]} ${pct(v)}`).join('  ')}</div></div>
                    </div>
                    {!settled && <div className="mt-1.5 flex flex-wrap gap-1" role="radiogroup" aria-label={`Answer for question ${a.q}`}>{[...letters.split(''), '', 'X'].map((m) => <button key={m || 'blank'} role="radio" aria-checked={cur === m} onClick={() => pick(a.q, m)} className={`min-w-[2.2rem] rounded-md border px-2 py-1 text-xs font-semibold ${cur === m ? 'border-[#2a5cac] bg-[#2a5cac] text-white' : 'border-[#cdd5d5] bg-white text-[#3b4a5c] hover:bg-[#f7f6f2]'}`}>{m === '' ? 'Blank' : m === 'X' ? 'Two marks' : m}</button>)}
                      {a.by === 'review' && pend[a.q] === undefined && <span className="self-center text-xs text-[#5b6b7b]">decided by {a.byName}: {a.final === '' ? 'blank' : a.final === 'X' ? 'two marks (wrong)' : a.final}</span>}</div>}
                  </div>); })}
            </div>
          </div>
        </div>
        {!settled && (
          <div className="grid gap-2 border-t border-[#e3e7e7] pt-3">
            <Field label="Why (kept with the decision)" hint="Required when you change or confirm something"><input className={inputCls} value={reason} list="omr-reasons" onChange={(e) => setReason(e.target.value)} placeholder="For example: clear mark, light pencil" /><datalist id="omr-reasons">{REASONS.map((r) => <option key={r} value={r} />)}</datalist></Field>
            <div className="flex flex-wrap items-center justify-end gap-2">{!['Rescan'].includes(scan.status) && <button className={btnDanger} disabled={reason.trim().length < 3} title={reason.trim().length < 3 ? 'Write the reason above first' : 'The sheet will need a new photo'} onClick={reject}>Set this sheet aside</button>}<button className={btnGhost} onClick={onClose}>Close</button><button className={btnPrimary} disabled={busy || !changes || reason.trim().length < 3} onClick={save}>{changes ? `Save ${changes} decision${changes === 1 ? '' : 's'}` : 'Save'}</button></div>
          </div>
        )}
        {reviews.length > 0 && (
          <details className="rounded-lg border border-[#e3e7e7] p-2 text-sm"><summary className="cursor-pointer font-semibold">What people decided on this sheet ({reviews.length})</summary>
            <ul className="mt-2 grid gap-1 text-xs">{reviews.map((r, i) => <li key={i} className="rounded bg-[#f7f6f2] p-1.5">{dt(r.at)} · {r.by} · {r.kind === 'answer' ? `Question ${r.questionNo}: ${r.detectedMark || 'blank'} → ${r.reviewerMark}` : r.kind === 'candidate' ? `Candidate: ${r.detectedMark || '?'} → ${r.reviewerMark}` : r.kind === 'scan' ? `Accepted: ${r.detectedMark}` : `Set aside (${r.reviewerMark})`} — {r.reason}</li>)}</ul></details>
        )}
      </div>
    </Modal>
  );
}
