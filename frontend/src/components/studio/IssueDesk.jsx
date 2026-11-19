import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import { Check, Download, FileText, Image as ImageIcon, Printer, RotateCcw, Search, X } from 'lucide-react';
import apiClient from '../../utils/apiClient';
import { Card, EmptyState, Field, Modal, Pill, btnDanger, btnGhost, btnPrimary, errMsg, fmtDate, inputCls } from '../ui';
import { Body, Bar, Row, Sub, Td, Tbl, useList } from '../attendance/deskKit';
import { Reason, dayTime } from '../safety/safetyKit';
import { useGet, call } from '../timetable/planKit';
import { STATE_LABEL, STATE_TONE, blobUrl, renderPng } from './layoutKit';

// Show a PDF inside the page (works where pop-ups are blocked) with a download link
export const PdfModal = ({ title, url, notes, onClose }) => (
  <Modal title={title} onClose={onClose} wide>
    <iframe title={title} src={url} className="h-[70vh] w-full rounded-lg border border-[#e3e7e7]" />
    {notes && <p className="mt-2 rounded bg-[#fffbee] p-2 text-xs">{notes}</p>}
    <div className="mt-3 flex justify-end gap-2"><a className={btnGhost} href={url} download={`${title.replace(/[^\w-]+/g, '-')}.pdf`}><Download size={14} /> Download</a><button className={btnPrimary} onClick={onClose}>Close</button></div>
  </Modal>
);
export const usePdf = () => {
  const [pdf, setPdf] = useState(null);
  const open = async (title, path) => { try { const b = await blobUrl(apiClient, path); setPdf({ title, ...b }); } catch (e) { toast.error('Could not make the PDF. Please try again.'); } };
  const close = () => { if (pdf?.url) URL.revokeObjectURL(pdf.url); setPdf(null); };
  return { open, node: pdf ? <PdfModal title={pdf.title} url={pdf.url} notes={pdf.notes} onClose={close} /> : null };
};
export async function downloadPng(id, serial, sideIndex = 0) {
  const r = await apiClient.get(`/studio/issuances/${id}/snapshot`); const d = r.data; const images = {}; Object.entries(d.images || {}).forEach(([k, v]) => { images[k] = v; });
  // pictures live behind the signed-in API, so fetch them into object URLs first
  const made = [];
  for (const [k, v] of Object.entries(images)) { try { const b = await apiClient.get(v.replace(/^\/api/, ''), { responseType: 'blob' }); const u = URL.createObjectURL(b.data); made.push(u); images[k] = u; } catch (e) { delete images[k]; } }
  const blob = await renderPng({ layout: d.layout, theme: d.theme, values: d.values, images, locale: d.locale }, sideIndex, 300);
  made.forEach((u) => URL.revokeObjectURL(u)); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${serial}${d.layout.sides.length > 1 ? (sideIndex ? '-back' : '-front') : ''}.png`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  return d.layout.sides.length;
}

// ── issue ──
export function IssueDesk({ catalog, onIssued }) {
  const tpls = useGet('/studio/templates'); const [tplId, setTplId] = useState(''); const [q, setQ] = useState(''); const [classId, setClassId] = useState(''); const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState({ rows: [], terms: [], loading: false }); const [picked, setPicked] = useState([]); const [custom, setCustom] = useState({}); const [term, setTerm] = useState(''); const [validUntil, setValidUntil] = useState(''); const [locale, setLocale] = useState('en'); const [busy, setBusy] = useState(false); const [result, setResult] = useState(null);
  const live = (tpls.data?.templates || []).filter((t) => t.liveVersion && !t.archived);
  const tpl = live.find((t) => t._id === tplId); const fam = tpl && catalog.families.find((f) => f.key === tpl.family); const subj = fam?.subject;
  const customFields = Object.entries(fam?.fields || {}).filter(([k]) => k.startsWith('custom.')).map(([k, f]) => [k.slice(7), f]);
  useEffect(() => { apiClient.get('/classes', { params: { limit: 200 } }).then((r) => setClasses(r.data.classes || [])).catch(() => {}); }, []);
  useEffect(() => {
    if (!tpl || subj === 'custom') { setSubjects({ rows: [], terms: [], loading: false }); return undefined; }
    setSubjects((s) => ({ ...s, loading: true })); const h = setTimeout(() => apiClient.get('/studio/subjects', { params: { family: tpl.family, q, classId: classId || undefined } }).then((r) => setSubjects({ rows: r.data.subjects, terms: r.data.terms, loading: false })).catch(() => setSubjects({ rows: [], terms: [], loading: false })), 250);
    return () => clearTimeout(h);
  }, [tplId, q, classId]); // eslint-disable-line
  useEffect(() => { setPicked([]); setCustom({}); setTerm(''); }, [tplId]);
  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const needsCitation = tpl?.family === 'certificate' && ['completion', 'merit', 'appreciation'].includes(tpl.kind);
  const needTerm = ['reportCard', 'transcript'].includes(tpl?.family);
  const ready = tpl && (subj === 'custom' || picked.length) && (!needsCitation || (custom.citation || '').trim()) && (!needTerm || term);
  const go = async () => {
    setBusy(true); const r = await call(() => apiClient.post('/studio/issue', { templateId: tplId, subjectIds: picked, custom, term: term || undefined, validUntil: validUntil || undefined, locale }));
    setBusy(false); if (r) { setResult(r.data); setPicked([]); onIssued?.(); }
  };
  return (
    <div className="grid gap-4">
      <Card>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Design"><select className={inputCls} value={tplId} onChange={(e) => setTplId(e.target.value)}><option value="">Choose a live template…</option>{catalog.families.map((f) => { const l = live.filter((t) => t.family === f.key); return l.length ? <optgroup key={f.key} label={f.label}>{l.map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}</optgroup> : null; })}</select></Field>
          <Field label="Language"><select className={inputCls} value={locale} onChange={(e) => setLocale(e.target.value)}><option value="en">English</option><option value="ur">اردو (Urdu)</option></select></Field>
          <Field label="Valid until (optional)"><input type="date" className={inputCls} value={validUntil} onChange={(e) => setValidUntil(e.target.value)} /></Field>
        </div>
        {tpl && fam?.singleton && <p className="mt-3 rounded-lg bg-[#f7f6f2] p-2 text-xs text-[#3b4a5c]">A person can hold one valid {fam.label.toLowerCase()} at a time. To issue a new one, replace the old one from the Issued documents list.</p>}
      </Card>
      {tpl && (
        <div className="grid gap-4 lg:grid-cols-2">
          {subj !== 'custom' && <Card className="!p-0">
            <div className="flex flex-wrap items-center gap-2 border-b border-[#e3e7e7] p-3">
              <div className="relative min-w-[160px] flex-1"><Search size={14} className="pointer-events-none absolute start-3 top-3 text-[#5b6b7b]" /><input className={`${inputCls} ps-8`} placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" /></div>
              {subj === 'student' && <select className={`${inputCls} !w-auto`} value={classId} onChange={(e) => setClassId(e.target.value)} aria-label="Class"><option value="">All classes</option>{classes.map((c) => <option key={c._id} value={c._id}>{c.standard}-{c.division}</option>)}</select>}
              <button className={btnGhost} onClick={() => setPicked(picked.length === subjects.rows.length ? [] : subjects.rows.map((r) => r.id))}>{picked.length === subjects.rows.length && picked.length ? 'Clear' : 'Select all shown'}</button>
            </div>
            <div className="max-h-[360px] overflow-y-auto">{subjects.loading ? <div className="skeleton m-3 h-24" /> : subjects.rows.length === 0 ? <p className="p-6 text-center text-sm text-[#5b6b7b]">Nobody matches. Try another search.</p> : <ul>{subjects.rows.map((s) => <li key={s.id} className="border-t border-[#e3e7e7] first:border-0"><label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-[#f7f6f2]"><input type="checkbox" checked={picked.includes(s.id)} onChange={() => toggle(s.id)} /><span className="min-w-0"><span className="block truncate text-sm">{s.label}</span><span className="block truncate text-xs text-[#5b6b7b]">{s.sub}</span></span></label></li>)}</ul>}</div>
            <div className="border-t border-[#e3e7e7] p-2 text-xs text-[#5b6b7b]">{picked.length} chosen (up to 200 at a time)</div>
          </Card>}
          <Card className={subj === 'custom' ? 'lg:col-span-2' : ''}>
            <div className="grid gap-3">
              {needTerm && <Field label="Which exam?"><select className={inputCls} value={term} onChange={(e) => setTerm(e.target.value)}><option value="">Choose…</option>{subjects.terms.map((t) => <option key={t} value={t}>{t}</option>)}</select></Field>}
              {customFields.length === 0 && !needTerm && <p className="text-sm text-[#5b6b7b]">Nothing else to fill in. Choose who it is for, then issue.</p>}
              {customFields.map(([k, f]) => <Field key={k} label={`${f.label}${k === 'citation' && needsCitation ? ' (required)' : ''}`}>{f.type === 'multiline' ? <textarea className={inputCls} rows={k === 'body' ? 6 : 2} value={custom[k] || ''} maxLength={3000} onChange={(e) => setCustom({ ...custom, [k]: e.target.value })} placeholder={f.sample || ''} /> : <input className={inputCls} value={custom[k] || ''} maxLength={200} onChange={(e) => setCustom({ ...custom, [k]: e.target.value })} placeholder={f.sample || ''} />}</Field>)}
              {tpl.family === 'letter' && <Field label="Addressed to (name kept on record)"><input className={inputCls} value={custom.holderName || ''} maxLength={100} onChange={(e) => setCustom({ ...custom, holderName: e.target.value })} /></Field>}
              <button className={`${btnPrimary} justify-self-start`} disabled={!ready || busy} onClick={go}><Check size={14} /> {busy ? 'Issuing…' : subj === 'custom' ? 'Issue document' : `Issue ${picked.length || ''} document${picked.length === 1 ? '' : 's'}`}</button>
            </div>
          </Card>
        </div>
      )}
      {!tpl && !tpls.loading && live.length === 0 && <EmptyState title="No live templates yet" text="A template goes live once it has been approved. Open Templates to review or approve one." />}
      {result && <Modal title="Documents issued" onClose={() => setResult(null)}>
        {result.issued.length > 0 && <><p className="mb-2 text-sm">{result.issued.length} issued. Find them in the Issued documents list to print or download.</p><ul className="max-h-48 overflow-y-auto text-sm">{result.issued.map((d) => <li key={d._id} className="flex justify-between border-t border-[#e3e7e7] py-1 first:border-0"><span>{d.subjectName || '—'}</span><span className="font-mono text-xs">{d.serial}</span></li>)}</ul></>}
        {result.skipped.length > 0 && <div className="mt-3 rounded-lg bg-[#fffbee] p-2 text-sm"><b>{result.skipped.length} skipped</b><ul className="ms-4 list-disc text-xs">{[...new Set(result.skipped.map((s) => s.reason))].map((r) => <li key={r}>{r}</li>)}</ul></div>}
        <div className="mt-4 flex justify-end"><button className={btnPrimary} onClick={() => setResult(null)}>Done</button></div></Modal>}
    </div>
  );
}

// ── print batch builder ──
const SMALL = new Set(['idCard', 'libraryCard', 'staffBadge', 'visitorPass']);
const SHEET0 = { page: 'A4', marginMm: 8, gapMm: 4, cutMarks: true, duplex: true };
export function BatchBuilder({ preselected = [], family: fam0, onClose, onDone, catalog }) {
  const [family, setFamily] = useState(fam0 || 'idCard'); const [name, setName] = useState(''); const [mode, setMode] = useState(SMALL.has(fam0 || 'idCard') ? 'sheet' : 'single'); const [sheet, setSheet] = useState(SHEET0); const [ids, setIds] = useState(preselected); const [busy, setBusy] = useState(false); const [q, setQ] = useState('');
  const list = useList('/studio/issuances', 'issuances', { family, status: 'Issued', q, per: 100 }, !preselected.length);
  const go = async () => { setBusy(true); const r = await call(() => apiClient.post('/studio/batches', { name, issuanceIds: ids, mode, sheet }), 'Print batch created'); setBusy(false); if (r) onDone(r.data.batch); };
  return (
    <Modal title="New print batch" onClose={onClose} wide>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Batch name"><input className={inputCls} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="e.g. Class 6 ID cards, Nov 2026" autoFocus /></Field>
        <Field label="Print as"><select className={inputCls} value={mode} onChange={(e) => setMode(e.target.value)}><option value="single">One per page</option><option value="sheet">Several to a sheet, with cut marks (small cards and badges)</option></select></Field>
        {mode === 'sheet' && <><Field label="Sheet"><select className={inputCls} value={sheet.page} onChange={(e) => setSheet({ ...sheet, page: e.target.value })}><option value="A4">A4</option><option value="A3">A3</option></select></Field>
          <div className="grid grid-cols-2 gap-2"><Field label="Margin mm"><input type="number" className={inputCls} value={sheet.marginMm} min="0" max="30" onChange={(e) => setSheet({ ...sheet, marginMm: Number(e.target.value) })} /></Field><Field label="Gap mm"><input type="number" className={inputCls} value={sheet.gapMm} min="0" max="20" onChange={(e) => setSheet({ ...sheet, gapMm: Number(e.target.value) })} /></Field></div>
          <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={sheet.cutMarks} onChange={(e) => setSheet({ ...sheet, cutMarks: e.target.checked })} /> Cut marks</label>
          <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={sheet.duplex} onChange={(e) => setSheet({ ...sheet, duplex: e.target.checked })} /> Back sides for double-sided printing</label></>}
      </div>
      {!preselected.length && <div className="mt-3 rounded-xl border border-[#e3e7e7]">
        <Bar><select className={`${inputCls} !w-auto`} value={family} onChange={(e) => { setFamily(e.target.value); setIds([]); setMode(SMALL.has(e.target.value) ? 'sheet' : 'single'); }} aria-label="Document type">{catalog.families.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}</select><input className={`${inputCls} !w-auto min-w-[160px] flex-1`} placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
          <button className={btnGhost} onClick={() => setIds(ids.length === list.rows.length ? [] : list.rows.map((r) => r._id))}>Select all shown</button></Bar>
        <div className="max-h-56 overflow-y-auto">{list.loading ? <div className="skeleton m-3 h-16" /> : list.rows.length === 0 ? <p className="p-4 text-center text-sm text-[#5b6b7b]">No valid documents of this type.</p> : list.rows.map((d) => <label key={d._id} className="flex cursor-pointer items-center gap-3 border-t border-[#e3e7e7] px-3 py-1.5 text-sm first:border-0 hover:bg-[#f7f6f2]"><input type="checkbox" checked={ids.includes(d._id)} onChange={() => setIds((x) => (x.includes(d._id) ? x.filter((y) => y !== d._id) : [...x, d._id]))} /><span className="flex-1 truncate">{d.subjectName || d.title}</span><span className="font-mono text-xs text-[#5b6b7b]">{d.serial}</span></label>)}</div>
      </div>}
      <p className="mt-2 text-xs text-[#5b6b7b]">{ids.length} document{ids.length === 1 ? '' : 's'} chosen. A batch holds documents of one paper size.</p>
      <div className="mt-3 flex justify-end gap-2"><button className={btnGhost} onClick={onClose}>Cancel</button><button className={btnPrimary} disabled={busy || !name.trim() || !ids.length} onClick={go}><Printer size={14} /> Create batch</button></div>
    </Modal>
  );
}

// ── issued documents ──
export function IssuedList({ can, catalog }) {
  const [f, setF] = useState({ family: '', status: '', q: '' }); const list = useList('/studio/issuances', 'issuances', f);
  const [ask, setAsk] = useState(null); const [detail, setDetail] = useState(null); const [chosen, setChosen] = useState([]); const [batching, setBatching] = useState(false); const pdf = usePdf(); const [busy, setBusy] = useState('');
  const refresh = () => list.reload();
  const png = async (d) => { setBusy(d._id); try { const n = await downloadPng(d._id, d.serial, 0); if (n > 1) await downloadPng(d._id, d.serial, 1); } catch (e) { toast.error('Could not make the picture.'); } setBusy(''); };
  const open = async (d) => { try { const r = await apiClient.get(`/studio/issuances/${d._id}`); setDetail(r.data); } catch (e) { toast.error(errMsg(e)); } };
  const mixed = new Set(list.rows.filter((r) => chosen.includes(r._id)).map((r) => r.family)).size > 1;
  return (
    <Card className="!p-0 overflow-hidden">
      <Bar>
        <select className={`${inputCls} !w-auto`} value={f.family} onChange={(e) => setF({ ...f, family: e.target.value })} aria-label="Document type"><option value="">All types</option>{catalog.families.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</select>
        <select className={`${inputCls} !w-auto`} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} aria-label="State"><option value="">Any state</option><option value="Issued">Valid</option><option value="Revoked">Withdrawn</option><option value="Superseded">Replaced</option></select>
        <input className={`${inputCls} !w-auto min-w-[180px] flex-1`} placeholder="Search by number or name" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} aria-label="Search" />
        {can.print && chosen.length > 0 && <button className={btnPrimary} disabled={mixed} title={mixed ? 'Choose documents of one type' : ''} onClick={() => setBatching(true)}><Printer size={14} /> Print {chosen.length}</button>}
      </Bar>
      <Body l={list} cols={7} empty="No documents have been issued yet.">
        <Tbl head={['', 'Number', 'Document', 'For', 'Issued', 'State', '']}>
          {list.rows.map((d) => (
            <Row key={d._id}>
              <Td>{can.print && d.status === 'Issued' && <input type="checkbox" aria-label={`Choose ${d.serial}`} checked={chosen.includes(d._id)} onChange={() => setChosen((c) => (c.includes(d._id) ? c.filter((x) => x !== d._id) : [...c, d._id]))} />}</Td>
              <Td><button className="font-mono text-xs text-[#2a5cac] underline" onClick={() => open(d)}>{d.serial}</button></Td>
              <Td>{d.title || d.familyLabel}<Sub>{d.familyLabel} · v{d.versionNo}</Sub></Td><Td>{d.subjectName || '—'}</Td>
              <Td>{fmtDate(d.issuedAt)}<Sub>{d.issuedByName}</Sub></Td>
              <Td><Pill value={STATE_TONE[d.status]}>{STATE_LABEL[d.status]}</Pill>{d.printCount > 0 && <Sub>Printed {d.printCount}×</Sub>}</Td>
              <Td><div className="flex flex-wrap justify-end gap-1.5">
                <button className={btnGhost} onClick={() => pdf.open(d.serial, `/studio/issuances/${d._id}/pdf`)}><FileText size={14} /> PDF</button>
                <button className={btnGhost} disabled={busy === d._id} onClick={() => png(d)} aria-label={`Download ${d.serial} as a picture`}><ImageIcon size={14} /> PNG</button>
                {can.issue && d.status === 'Issued' && <button className={btnGhost} onClick={() => setAsk({ d, kind: 'replace' })}><RotateCcw size={14} /> Replace</button>}
                {can.issue && d.status === 'Issued' && <button className={btnDanger} onClick={() => setAsk({ d, kind: 'revoke' })}><X size={14} /> Withdraw</button>}
              </div></Td>
            </Row>
          ))}
        </Tbl>
      </Body>
      {list.pagination && list.pagination.pages > 1 && <div className="flex items-center justify-between border-t border-[#e3e7e7] p-3 text-xs"><button className={btnGhost} disabled={list.pagination.page <= 1} onClick={() => list.setPage(list.pagination.page - 1)}>Previous</button><span>Page {list.pagination.page} of {list.pagination.pages}</span><button className={btnGhost} disabled={list.pagination.page >= list.pagination.pages} onClick={() => list.setPage(list.pagination.page + 1)}>Next</button></div>}
      {ask && <Reason title={ask.kind === 'revoke' ? `Withdraw ${ask.d.serial}` : `Replace ${ask.d.serial}`} label={ask.kind === 'revoke' ? 'Why is it being withdrawn? (kept on record)' : 'Why is it being replaced? (kept on record)'} cta={ask.kind === 'revoke' ? 'Withdraw' : 'Replace'} danger={ask.kind === 'revoke'} min={5} onClose={() => setAsk(null)}
        onSubmit={async (reason) => { const r = await call(() => apiClient.post(`/studio/issuances/${ask.d._id}/${ask.kind}`, { reason }), ask.kind === 'revoke' ? 'Withdrawn. The check page now says so.' : 'Replaced with a new document'); if (r) { setAsk(null); refresh(); } }} />}
      {detail && <Modal title={detail.issuance.serial} onClose={() => setDetail(null)}>
        <dl className="grid grid-cols-[110px_1fr] gap-y-1.5 text-sm"><dt className="text-[#5b6b7b]">Document</dt><dd>{detail.issuance.title || detail.issuance.familyLabel}</dd><dt className="text-[#5b6b7b]">For</dt><dd>{detail.issuance.subjectName || '—'}</dd><dt className="text-[#5b6b7b]">State</dt><dd><Pill value={STATE_TONE[detail.issuance.status]}>{STATE_LABEL[detail.issuance.status]}</Pill></dd><dt className="text-[#5b6b7b]">Issued</dt><dd>{dayTime(detail.issuance.issuedAt)} by {detail.issuance.issuedByName}</dd>
          {detail.issuance.validUntil && <><dt className="text-[#5b6b7b]">Valid until</dt><dd>{fmtDate(detail.issuance.validUntil)}</dd></>}
          {detail.issuance.revokeReason && <><dt className="text-[#5b6b7b]">Reason</dt><dd>{detail.issuance.revokeReason}</dd></>}
          <dt className="text-[#5b6b7b]">Check page</dt><dd><a className="text-[#2a5cac] underline" href={detail.verifyPath} target="_blank" rel="noreferrer">{window.location.origin}{detail.verifyPath}</a></dd>
          <dt className="text-[#5b6b7b]">Fingerprint</dt><dd className="break-all font-mono text-xs">{detail.issuance.contentHash}</dd></dl>
        {(detail.earlier?.length > 0 || detail.replacedBy) && <div className="mt-3 text-xs text-[#3b4a5c]"><b>History</b><ul className="ms-4 list-disc">{(detail.earlier || []).map((e) => <li key={e._id}>{e.serial} was replaced{e.replaceReason ? `: ${e.replaceReason}` : ''}</li>)}{detail.replacedBy && <li>Replaced by {detail.replacedBy.serial}</li>}</ul></div>}
        <div className="mt-4 flex justify-end"><button className={btnPrimary} onClick={() => setDetail(null)}>Close</button></div></Modal>}
      {batching && <BatchBuilder catalog={catalog} preselected={chosen} family={list.rows.find((r) => chosen.includes(r._id))?.family} onClose={() => setBatching(false)} onDone={() => { setBatching(false); setChosen([]); toast('Open the Print queue to start printing.'); }} />}
      {pdf.node}
    </Card>
  );
}

// ── print queue ──
const ERRS = [['paper-jam', 'Paper jam'], ['out-of-ink', 'Out of ink'], ['offline', 'Printer offline'], ['misprint', 'Misprint'], ['other', 'Something else']];
function BatchView({ id, onClose, reloadAll }) {
  const g = useGet(`/studio/batches/${id}`); const pdf = usePdf(); const [fail, setFail] = useState(null); const [err, setErr] = useState('paper-jam'); const [ask, setAsk] = useState(null);
  const b = g.data?.batch; const [local, setLocal] = useState(null); const cur = local || b;
  useEffect(() => { setLocal(null); }, [g.data]);
  const upd = async (fn, ok) => { const r = await call(fn, ok); if (r) { setLocal(r.data.batch); reloadAll(); } return r; };
  if (!cur) return <Modal title="Print batch" onClose={onClose}><div className="skeleton h-32" /></Modal>;
  const c = cur.counts; const showPdf = (scope) => pdf.open(cur.name, `/studio/batches/${id}/pdf?scope=${scope}`);
  return (
    <Modal title={cur.name} onClose={onClose} wide>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm"><Pill value={STATE_TONE[cur.status]}>{STATE_LABEL[cur.status]}</Pill><span>{c.total} documents · {c.printed} printed · {c.queued} waiting{c.failed ? ` · ${c.failed} failed` : ''}{c.cancelled ? ` · ${c.cancelled} dropped` : ''}</span><span className="text-xs text-[#5b6b7b]">{cur.mode === 'sheet' ? `${cur.sheet.page} sheets${cur.sheet.cutMarks ? ', cut marks' : ''}` : 'one per page'} · round {cur.round || 0}</span></div>
      <div className="mb-3 flex flex-wrap gap-2">
        {cur.status === 'Draft' && <button className={btnPrimary} onClick={async () => { const r = await upd(() => apiClient.post(`/studio/batches/${id}/start`), 'Printing started'); if (r) showPdf('pending'); }}><Printer size={14} /> Start printing</button>}
        {['Printing', 'NeedsAttention'].includes(cur.status) && <button className={btnGhost} onClick={() => showPdf('pending')}><FileText size={14} /> Open the print file</button>}
        {cur.status === 'Printing' && c.queued > 0 && <button className={btnPrimary} onClick={() => upd(() => apiClient.post(`/studio/batches/${id}/results`, { allOk: true }), 'All marked as printed')}><Check size={14} /> Everything printed fine</button>}
        {cur.status === 'NeedsAttention' && <button className={btnPrimary} onClick={async () => { const r = await upd(() => apiClient.post(`/studio/batches/${id}/retry`, {}), 'Failed items are queued again'); if (r) showPdf('pending'); }}><RotateCcw size={14} /> Retry the failed ones</button>}
        {cur.status === 'Draft' && <button className={btnGhost} onClick={() => showPdf('all')}>Preview</button>}
        {!['Done', 'Cancelled'].includes(cur.status) && <button className={btnDanger} onClick={() => setAsk({ kind: 'batch' })}>Cancel batch</button>}
      </div>
      <div className="max-h-[300px] overflow-y-auto rounded-xl border border-[#e3e7e7]"><Tbl head={['Number', 'For', 'State', '']}>{cur.items.map((i) => (
        <Row key={i._id}><Td><span className="font-mono text-xs">{i.serial}</span></Td><Td>{i.name}</Td><Td><Pill value={STATE_TONE[i.status]}>{STATE_LABEL[i.status]}</Pill>{i.error && <Sub>{i.errorCode ? `${ERRS.find((e) => e[0] === i.errorCode)?.[1] || i.errorCode}: ` : ''}{i.error}</Sub>}{i.attempts > 0 && <Sub>{i.attempts} failed attempt{i.attempts > 1 ? 's' : ''}</Sub>}</Td>
          <Td><div className="flex justify-end gap-1.5">
            {cur.status === 'Printing' && i.status === 'Queued' && <><button className={btnGhost} aria-label={`${i.serial} printed`} onClick={() => upd(() => apiClient.post(`/studio/batches/${id}/results`, { results: [{ itemId: i._id, ok: true }] }))}><Check size={14} /></button><button className={btnDanger} aria-label={`${i.serial} failed`} onClick={() => setFail(i)}><X size={14} /></button></>}
            {['Queued', 'Failed'].includes(i.status) && !['Done', 'Cancelled'].includes(cur.status) && <button className={btnGhost} onClick={() => setAsk({ kind: 'item', item: i })}>Drop</button>}
          </div></Td></Row>))}</Tbl></div>
      {cur.log?.length > 0 && <details className="mt-3 text-xs text-[#3b4a5c]"><summary className="cursor-pointer font-semibold">History</summary><ul className="mt-1 grid gap-0.5">{[...cur.log].reverse().map((l, k) => <li key={k}>{dayTime(l.at)} · {l.byName || ''} · {l.action}: {l.note}</li>)}</ul></details>}
      {fail && <Modal title={`${fail.serial} did not print`} onClose={() => setFail(null)}><Field label="What went wrong?"><select className={inputCls} value={err} onChange={(e) => setErr(e.target.value)}>{ERRS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></Field><div className="mt-4 flex justify-end gap-2"><button className={btnGhost} onClick={() => setFail(null)}>Cancel</button><button className={btnDanger} onClick={async () => { const r = await upd(() => apiClient.post(`/studio/batches/${id}/results`, { results: [{ itemId: fail._id, ok: false, errorCode: err }] }), 'Recorded'); if (r) setFail(null); }}>Record failure</button></div></Modal>}
      {ask && <Reason title={ask.kind === 'batch' ? 'Cancel this batch' : `Drop ${ask.item.serial}`} label="Why?" cta={ask.kind === 'batch' ? 'Cancel batch' : 'Drop it'} danger min={3} onClose={() => setAsk(null)} onSubmit={async (reason) => { const r = await upd(() => (ask.kind === 'batch' ? apiClient.post(`/studio/batches/${id}/cancel`, { reason }) : apiClient.post(`/studio/batches/${id}/items/${ask.item._id}/cancel`, { reason })), 'Done'); if (r) setAsk(null); }} />}
      {pdf.node}
    </Modal>
  );
}
export function PrintQueue({ catalog, reloadAll }) {
  const g = useGet('/studio/batches'); const [open, setOpen] = useState(null); const [building, setBuilding] = useState(false);
  return (
    <Card className="!p-0 overflow-hidden">
      <Bar><span className="text-sm font-semibold">Print batches</span><button className={`${btnPrimary} ms-auto`} onClick={() => setBuilding(true)}><Printer size={14} /> New batch</button></Bar>
      {g.loading && !g.data ? <div className="skeleton m-3 h-24" /> : g.error ? <EmptyState title={g.error} action={<button className={btnGhost} onClick={g.reload}>Try again</button>} /> : (g.data.batches.length === 0 ? <EmptyState title="Nothing queued" text="Choose issued documents and create a batch. You can also tick documents in the Issued list." /> :
        <Tbl head={['Batch', 'Type', 'State', 'Progress', 'Created', '']}>{g.data.batches.map((b) => <Row key={b._id}><Td>{b.name}</Td><Td>{catalog.families.find((f) => f.key === b.family)?.label}</Td><Td><Pill value={STATE_TONE[b.status]}>{STATE_LABEL[b.status]}</Pill></Td><Td>{b.counts.printed}/{b.counts.total}{b.counts.failed ? <Sub>{b.counts.failed} failed</Sub> : null}</Td><Td>{dayTime(b.createdAt)}<Sub>{b.createdByName}</Sub></Td><Td><button className={btnGhost} onClick={() => setOpen(b._id)}>Open</button></Td></Row>)}</Tbl>)}
      {building && <BatchBuilder catalog={catalog} onClose={() => setBuilding(false)} onDone={(b) => { setBuilding(false); g.reload(); reloadAll(); setOpen(b._id); }} />}
      {open && <BatchView id={open} reloadAll={() => { reloadAll(); g.reload(); }} onClose={() => { setOpen(null); g.reload(); }} />}
    </Card>
  );
}
