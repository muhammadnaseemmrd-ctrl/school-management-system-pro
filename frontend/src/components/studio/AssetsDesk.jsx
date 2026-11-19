import React, { useState } from 'react';
import { Check, Upload } from 'lucide-react';
import apiClient from '../../utils/apiClient';
import { Card, EmptyState, Field, Modal, Pill, btnDanger, btnGhost, btnPrimary, fmtDate, inputCls } from '../ui';
import { Row, Sub, Td, Tbl } from '../attendance/deskKit';
import { useGet, call } from '../timetable/planKit';

// Pictures used on designs. A picture must have a confirmed licence before a design that uses it can go live.
const KINDS = [['owned', 'We made it or own it'], ['licensed', 'We bought a licence'], ['cc', 'Creative Commons'], ['public-domain', 'Public domain'], ['unknown', 'I am not sure']];
const LIC = Object.fromEntries(KINDS);

function LicenseForm({ initial, file, onClose, onSave, busy }) {
  const [name, setName] = useState(initial?.name || file?.name?.replace(/\.[^.]+$/, '') || ''); const [kind, setKind] = useState(initial?.license?.kind || 'owned'); const [source, setSource] = useState(initial?.license?.source || ''); const [attribution, setAttribution] = useState(initial?.license?.attribution || ''); const [reference, setReference] = useState(initial?.license?.reference || '');
  const needSource = kind !== 'owned' && kind !== 'unknown';
  return (
    <Modal title={file ? 'Add a picture' : 'Licence details'} onClose={onClose}>
      <div className="grid gap-3">
        {file && <Field label="Name"><input className={inputCls} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} /></Field>}
        <Field label="Where does this picture come from?"><select className={inputCls} value={kind} onChange={(e) => setKind(e.target.value)}>{KINDS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></Field>
        {kind === 'unknown' && <p className="rounded-lg bg-[#fffbee] p-2 text-xs">A picture with an unknown source can be saved, but cannot be used on a live design until its licence is confirmed.</p>}
        {needSource && <Field label="Source (website or supplier)"><input className={inputCls} value={source} maxLength={200} onChange={(e) => setSource(e.target.value)} /></Field>}
        {(kind === 'cc' || kind === 'licensed') && <><Field label="Credit line, if one is required"><input className={inputCls} value={attribution} maxLength={200} onChange={(e) => setAttribution(e.target.value)} /></Field><Field label="Licence number or link (optional)"><input className={inputCls} value={reference} maxLength={200} onChange={(e) => setReference(e.target.value)} /></Field></>}
      </div>
      <div className="mt-4 flex justify-end gap-2"><button className={btnGhost} onClick={onClose}>Cancel</button><button className={btnPrimary} disabled={busy || (file && !name.trim()) || (needSource && !source.trim())} onClick={() => onSave({ name, licenseKind: kind, licenseSource: source, licenseAttribution: attribution, licenseReference: reference })}>Save</button></div>
    </Modal>
  );
}

export default function AssetsDesk() {
  const [retired, setRetired] = useState(false); const g = useGet('/studio/assets', { retired }); const [file, setFile] = useState(null); const [edit, setEdit] = useState(null); const [busy, setBusy] = useState(false);
  const act = async (fn, ok) => { setBusy(true); const r = await call(fn, ok); setBusy(false); if (r) g.reload(); return r; };
  const rows = g.data?.assets || [];
  return (
    <Card className="!p-0 overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-[#e3e7e7] p-3"><span className="text-sm font-semibold">Pictures for designs</span><label className="inline-flex items-center gap-1.5 text-xs"><input type="checkbox" checked={retired} onChange={(e) => setRetired(e.target.checked)} /> Show retired</label>
        <label className={`${btnPrimary} ms-auto cursor-pointer`}><Upload size={14} /> Add picture<input type="file" accept="image/png,image/jpeg" className="sr-only" aria-label="Add picture" onChange={(e) => { setFile(e.target.files?.[0] || null); e.target.value = ''; }} /></label></div>
      {g.loading && !g.data ? <div className="skeleton m-3 h-24" /> : g.error ? <EmptyState title={g.error} action={<button className={btnGhost} onClick={g.reload}>Try again</button>} /> : rows.length === 0 ? <EmptyState title="No pictures yet" text="Upload a logo, crest or background (PNG or JPEG, up to 2 MB) and say where it came from." /> : (
        <Tbl head={['Picture', 'Licence', 'Cleared', '']}>{rows.map((a) => (
          <Row key={a._id}><Td><div className="flex items-center gap-3"><img src={a.url} alt="" className="h-12 w-12 rounded border border-[#e3e7e7] bg-[#f7f6f2] object-contain" /><div><div>{a.name}</div><Sub>{a.origin === 'base' ? 'Aulensia original' : `Added by ${a.createdByName || ''} · ${fmtDate(a.createdAt)}`}</Sub></div></div></Td>
            <Td>{LIC[a.license?.kind] || a.license?.kind}{a.license?.source && <Sub>{a.license.source}</Sub>}{a.license?.attribution && <Sub>Credit: {a.license.attribution}</Sub>}</Td>
            <Td>{a.verified ? <Pill value="Approved">Cleared</Pill> : <Pill value="Pending">Not cleared</Pill>}{a.verifiedByName && <Sub>by {a.verifiedByName}</Sub>}</Td>
            <Td><div className="flex flex-wrap justify-end gap-1.5">{!a.retired && a.origin !== 'base' && <button className={btnGhost} onClick={() => setEdit(a)}>Licence</button>}
              {!a.retired && !a.verified && a.license?.kind !== 'unknown' && <button className={btnPrimary} disabled={busy} onClick={() => act(() => apiClient.post(`/studio/assets/${a._id}/verify`), 'Cleared for use')}><Check size={14} /> Clear for use</button>}
              {!a.retired && a.origin !== 'base' && <button className={btnDanger} disabled={busy} onClick={() => { if (window.confirm('Retire this picture? Live designs that use it will fail their checks.')) act(() => apiClient.post(`/studio/assets/${a._id}/retire`), 'Retired'); }}>Retire</button>}</div></Td></Row>))}</Tbl>)}
      {file && <LicenseForm file={file} busy={busy} onClose={() => setFile(null)} onSave={async (v) => { const fd = new FormData(); fd.append('file', file); Object.entries(v).forEach(([k, x]) => fd.append(k, x)); const r = await act(() => apiClient.post('/studio/assets', fd), 'Picture added'); if (r) setFile(null); }} />}
      {edit && <LicenseForm initial={edit} busy={busy} onClose={() => setEdit(null)} onSave={async (v) => { const r = await act(() => apiClient.put(`/studio/assets/${edit._id}/license`, v), 'Licence updated. It needs clearing again.'); if (r) setEdit(null); }} />}
    </Card>
  );
}
